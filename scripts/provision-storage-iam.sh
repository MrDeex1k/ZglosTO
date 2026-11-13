#!/bin/sh
# Run only in the official pinned RC container. Never enable shell tracing here.
set -eu
umask 077
fail() { printf '[storage-iam] %s\n' "$*" >&2; exit 78; }
credential() {
  name=$1
  file=$(printenv "${name}_FILE" || true)
  if [ -n "$file" ]; then cat "$file"; else printenv "$name"; fi
}
root_access=$(credential RUSTFS_ROOT_ACCESS_KEY)
root_secret=$(credential RUSTFS_ROOT_SECRET_KEY)
backend_access=$(credential S3_ACCESS_KEY_ID)
backend_secret=$(credential S3_SECRET_ACCESS_KEY)
worker_access=$(credential S3_WORKER_ACCESS_KEY_ID)
worker_secret=$(credential S3_WORKER_SECRET_ACCESS_KEY)
operations_access=$(credential S3_OPERATIONS_ACCESS_KEY_ID)
operations_secret=$(credential S3_OPERATIONS_SECRET_ACCESS_KEY)
[ -n "$root_secret" ] && [ -n "$backend_secret" ] && [ -n "$worker_secret" ] && [ -n "$operations_secret" ] || fail 'Empty credential'
[ "$root_access" != "$backend_access" ] && [ "$root_access" != "$worker_access" ] && [ "$root_access" != "$operations_access" ] && [ "$backend_access" != "$worker_access" ] && [ "$backend_access" != "$operations_access" ] && [ "$worker_access" != "$operations_access" ] || fail 'Root, backend, worker and operations identities must differ'
[ "$root_secret" != "$backend_secret" ] && [ "$root_secret" != "$worker_secret" ] && [ "$root_secret" != "$operations_secret" ] || fail 'Root secret must not be reused by workloads'
[ "$backend_secret" != "$worker_secret" ] && [ "$backend_secret" != "$operations_secret" ] && [ "$worker_secret" != "$operations_secret" ] || fail 'Workload secrets must differ'
: "${S3_BUCKET:?S3_BUCKET is required}" "${S3_REGION:?S3_REGION is required}" "${S3_OBJECT_PREFIX:?A nonempty S3_OBJECT_PREFIX is required}"
case "$S3_BUCKET" in ''|*[!a-z0-9.-]*) fail 'Invalid bucket name';; esac
case "$S3_OBJECT_PREFIX" in ''|/*|*/|*..*|*[!A-Za-z0-9_./-]*) fail 'Invalid object prefix';; esac
RC_CONFIG_DIR=$(mktemp -d /tmp/storage-iam.XXXXXX)
export RC_CONFIG_DIR
trap 'rm -rf "$RC_CONFIG_DIR"' EXIT HUP INT TERM
# Keep client output private: alias/user commands may contain credential metadata.
run() { if ! rc "$@" > "$RC_CONFIG_DIR/last-command.log" 2>&1; then fail "RC operation failed: $1 $2 (no credential-bearing output emitted)"; fi; }
run alias set bootstrap "${S3_ENDPOINT:-http://rustfs:9000}" "$root_access" "$root_secret" --region "$S3_REGION"
run bucket create "bootstrap/$S3_BUCKET" --region "$S3_REGION" --ignore-existing
# Bucket-only listing permits HeadBucket/readiness. Objects remain prefix scoped.
# Separate identities allow independent revocation; current shared adapter needs
# Get/Put/Delete for replacement cleanup and operations need archive restore.
cat > "$RC_CONFIG_DIR/scoped.json" <<POLICY
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::$S3_BUCKET"]},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::$S3_BUCKET/$S3_OBJECT_PREFIX/*"]}]}
POLICY
scope=$(printf %s "$S3_BUCKET/$S3_OBJECT_PREFIX" | sha256sum | cut -c1-16)
provision() {
  role=$1 access=$2 secret=$3
  policy="zglosto-$role-$scope"
  run admin policy create bootstrap "$policy" "$RC_CONFIG_DIR/scoped.json"
  run admin user add bootstrap "$access" "$secret"
  if ! rc --json admin user info bootstrap "$access" > "$RC_CONFIG_DIR/user.json" 2> "$RC_CONFIG_DIR/last-command.log"; then
    fail 'Cannot verify provisioned user'
  fi
  # Never silently keep an old admin/group policy on a reused workload identity.
  jq -e --arg policy "$policy" '((.memberOf // []) | length == 0) and ((.policies // []) | all(. == $policy))' "$RC_CONFIG_DIR/user.json" >/dev/null || fail 'Workload identity has unrelated policies/groups; remove them explicitly before provisioning'
  run admin policy attach bootstrap "$policy" --user "$access"
}
provision backend "$backend_access" "$backend_secret"
provision worker "$worker_access" "$worker_secret"
provision operations "$operations_access" "$operations_secret"
printf '[storage-iam] Bucket and three scoped identities reconciled\n'
