#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
mobile_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
project_dir=$(CDPATH= cd -- "$mobile_dir/.." && pwd)
credentials_file="${PHASE7_CREDENTIALS_FILE:-$project_dir/.state/mobile-demo/credentials.env}"

case "${AGENT_DEVICE_PLATFORM:-}" in
  ios|android) ;;
  *) echo 'Set AGENT_DEVICE_PLATFORM to ios or android.' >&2; exit 1 ;;
esac
: "${AGENT_DEVICE_DEVICE:?Set AGENT_DEVICE_DEVICE to the intended simulator or emulator ID.}"
if [ ! -f "$credentials_file" ]; then
  echo 'Missing synthetic accounts. Run bun run mobile:demo:up first.' >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$credentials_file"
set +a
export E2E_TELEMETRY_DISABLED=1
cd "$mobile_dir"
exec bun run e2e:run --target "$AGENT_DEVICE_PLATFORM" --output ".e2e/$AGENT_DEVICE_PLATFORM" "$@"
