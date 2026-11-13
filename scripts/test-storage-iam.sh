#!/usr/bin/env bash
# Disposable IAM integration. This script only owns project security-storage-iam.
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export IAM_PROJECT_ROOT="$ROOT_DIR"
IAM_SECRET_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/storage-iam-secrets.XXXXXX")
export IAM_SECRET_DIRECTORY
# Public synthetic fixture values only. Bind-mounted files are readable by uid10001.
chmod 0755 "$IAM_SECRET_DIRECTORY"
for role in root backend worker operations; do
  printf %s "iam-test-$role" > "$IAM_SECRET_DIRECTORY/$role-access"
  printf %s "iam-test-$role-secret-unique" > "$IAM_SECRET_DIRECTORY/$role-secret"
  chmod 0444 "$IAM_SECRET_DIRECTORY/$role-access" "$IAM_SECRET_DIRECTORY/$role-secret"
done
compose=(docker compose --project-name security-storage-iam --file "$ROOT_DIR/tests/integration/storage-iam.compose.yml")
# Refuse to reuse someone else's instance or a previous retained fixture.
if [ -n "$("${compose[@]}" ps --all --quiet)" ] || docker volume inspect security-storage-iam_data >/dev/null 2>&1; then
  printf 'security-storage-iam already exists; inspect/remove that disposable fixture explicitly first\n' >&2
  rm -rf "$IAM_SECRET_DIRECTORY"
  exit 65
fi
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null; rm -rf "$IAM_SECRET_DIRECTORY"; }
trap cleanup EXIT
"${compose[@]}" up --detach --wait --wait-timeout 120 rustfs
# First boot and rerun must both succeed without deleting/recreating bucket data.
"${compose[@]}" run --rm --no-deps provision
"${compose[@]}" run --rm --no-deps --entrypoint sh provision -ec '
  export RC_CONFIG_DIR=$(mktemp -d /tmp/iam-preserve.XXXXXX)
  rc alias set bootstrap "$S3_ENDPOINT" "$RUSTFS_ROOT_ACCESS_KEY" "$RUSTFS_ROOT_SECRET_KEY" --region "$S3_REGION" >/dev/null 2>&1
  printf "preserve-existing-data" > /tmp/sentinel
  rc object copy /tmp/sentinel "bootstrap/$S3_BUCKET/$S3_OBJECT_PREFIX/provision-sentinel" >/dev/null
'
"${compose[@]}" run --rm --no-deps provision
"${compose[@]}" run --rm --no-deps --entrypoint sh provision -ec '
  export RC_CONFIG_DIR=$(mktemp -d /tmp/iam-preserve.XXXXXX)
  rc alias set bootstrap "$S3_ENDPOINT" "$RUSTFS_ROOT_ACCESS_KEY" "$RUSTFS_ROOT_SECRET_KEY" --region "$S3_REGION" >/dev/null 2>&1
  test "$(rc object show "bootstrap/$S3_BUCKET/$S3_OBJECT_PREFIX/provision-sentinel")" = preserve-existing-data
  rc object remove "bootstrap/$S3_BUCKET/$S3_OBJECT_PREFIX/provision-sentinel" >/dev/null
  printf "PASS: repeated provisioning preserves existing objects\n"
'
export IAM_TEST_ENDPOINT="http://$("${compose[@]}" port rustfs 9000)"
bun run --cwd "$ROOT_DIR/backend" test storage/storage-iam.integration.test.ts
"${compose[@]}" run --rm --no-deps --entrypoint sh provision -ec '
  export RC_CONFIG_DIR=$(mktemp -d /tmp/iam-admin-negative.XXXXXX)
  for role in backend worker operations; do
    rc alias set workload "$S3_ENDPOINT" "iam-test-$role" "iam-test-$role-secret-unique" --region "$S3_REGION" >/dev/null 2>&1
    if rc --json admin user ls workload > /tmp/admin-result 2>&1; then
      printf "FAIL: workload accessed admin API\n" >&2; exit 1
    fi
    # Reject unrelated transport failures as proof of a permission boundary.
    grep -Eiq "AccessDenied|Access Denied|permission|forbidden|403" /tmp/admin-result
  done
  printf "PASS: all three scoped identities denied RustFS admin API\n"
'
printf 'PASS: isolated RustFS IAM, idempotent provisioning, SDK denials and archive roundtrip\n'
