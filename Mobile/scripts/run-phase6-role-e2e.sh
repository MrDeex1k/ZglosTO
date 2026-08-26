#!/bin/sh
set -eu

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI is required. Install the version recorded in DEPENDENCIES.tsv." >&2
  exit 1
fi

if [ "${MAESTRO_DEVICE:-}" = "" ]; then
  echo "MAESTRO_DEVICE must identify the approved Android emulator or iPhone simulator." >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
role_email="phase6.role.$(date +%s).$$@example.test"
role_password="Phase6-$(openssl rand -hex 18)"
role_origin="${PHASE6_ROLE_ORIGIN:-http://127.0.0.1:1235}"
dev_client_url="${EXPO_DEV_CLIENT_URL:-exp+zglosto://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081}"
cleanup_sql="$script_dir/clear-phase6-role-fixture.sql"

case "$role_origin" in
  http://127.0.0.1:[0-9]*|http://localhost:[0-9]*) ;;
  *)
    echo "PHASE6_ROLE_ORIGIN must be a local loopback HTTP origin." >&2
    exit 1
    ;;
esac

cleanup() {
  remaining=$(docker --context orbstack compose \
    --project-name zglosto \
    --file "$project_dir/docker-compose.yml" \
    --file "$project_dir/docker-compose.redis.local.yml" \
    exec -T database sh -lc \
      'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -Atq -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v role_email="$1"' \
      sh "$role_email" <"$cleanup_sql")
  if [ "$remaining" != "0" ]; then
    echo "Disposable Phase 6 role fixture could not be removed." >&2
    return 1
  fi
}
trap cleanup EXIT HUP INT TERM

signup_payload=$(printf \
  '{"name":"Phase 6 role fixture","email":"%s","password":"%s"}' \
  "$role_email" \
  "$role_password")
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --header 'origin: zglosto://' \
  --data "$signup_payload" \
  "$role_origin/api/auth/sign-up/email" >/dev/null

export PHASE6_ALLOW_LOCAL_ROLE_FIXTURE=1
export PHASE6_ROLE_EMAIL="$role_email"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_CLI_NO_ANALYTICS=true

case "$MAESTRO_DEVICE" in
  emulator-*)
    adb -s "$MAESTRO_DEVICE" reverse tcp:8081 tcp:8081
    adb -s "$MAESTRO_DEVICE" reverse tcp:18135 tcp:18135
    ;;
esac

run_flow() {
  role="$1"
  flow="$script_dir/../e2e/phase6-$role-boundary.yaml"

  "$script_dir/manage-phase6-role-fixture.sh" "$role"
  maestro test --device "$MAESTRO_DEVICE" \
    -e "EXPO_DEV_CLIENT_URL=$dev_client_url" \
    -e "PHASE6_ROLE_EMAIL=$role_email" \
    -e "PHASE6_ROLE_PASSWORD=$role_password" \
    "$flow"
}

run_flow admin
run_flow service

echo "Phase 6.0 role boundary flows passed and the disposable account was removed."
