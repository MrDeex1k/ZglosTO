#!/bin/sh
set -eu

if ! command -v agent-device >/dev/null 2>&1; then
  echo "agent-device CLI is required." >&2
  exit 1
fi

if [ "${AGENT_DEVICE_PLATFORM:-}" = "" ] || [ "${AGENT_DEVICE_DEVICE:-}" = "" ]; then
  echo "AGENT_DEVICE_PLATFORM and AGENT_DEVICE_DEVICE must select an approved emulator." >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
mobile_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
project_dir=$(CDPATH= cd -- "$mobile_dir/.." && pwd)
credentials_file="${PHASE7_CREDENTIALS_FILE:-$project_dir/.state/mobile-demo/credentials.env}"
artifacts_dir="${PHASE7_ARTIFACTS_DIR:-$project_dir/output/agent-device/phase7}"
dev_client_url="${EXPO_DEV_CLIENT_URL:-exp+zglosto://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081}"

if [ ! -f "$credentials_file" ]; then
  echo "Missing ignored demo credentials. Run pnpm mobile:demo:up first." >&2
  exit 1
fi

# Generated locally by manage-phase7-demo-fixtures.sh; values are never committed.
# shellcheck disable=SC1090
. "$credentials_file"

mkdir -p "$artifacts_dir"

exec agent-device test \
  --maestro \
  --platform "$AGENT_DEVICE_PLATFORM" \
  --device "$AGENT_DEVICE_DEVICE" \
  --timeout 300000 \
  --retries 1 \
  --fail-fast \
  --artifacts-dir "$artifacts_dir" \
  -e "EXPO_DEV_CLIENT_URL=$dev_client_url" \
  -e "PHASE7_RESIDENT_EMAIL=$DEMO_RESIDENT_EMAIL" \
  -e "PHASE7_RESIDENT_PASSWORD=$DEMO_RESIDENT_PASSWORD" \
  -e "PHASE7_SERVICE_EMAIL=$DEMO_SERVICE_EMAIL" \
  -e "PHASE7_SERVICE_PASSWORD=$DEMO_SERVICE_PASSWORD" \
  -e "PHASE7_ADMIN_EMAIL=$DEMO_ADMIN_EMAIL" \
  -e "PHASE7_ADMIN_PASSWORD=$DEMO_ADMIN_PASSWORD" \
  "$mobile_dir/e2e/phase7-resident-regression.yaml" \
  "$mobile_dir/e2e/phase7-service-regression.yaml" \
  "$mobile_dir/e2e/phase7-admin-regression.yaml"
