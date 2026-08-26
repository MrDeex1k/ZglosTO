#!/bin/sh
set -eu

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI is required. Install the version recorded in DEPENDENCIES.tsv." >&2
  exit 1
fi

if [ "${MAESTRO_RUN_ID:-}" = "" ]; then
  MAESTRO_RUN_ID=$(date +%s)
fi
if [ "${EXPO_DEV_CLIENT_URL:-}" = "" ]; then
  EXPO_DEV_CLIENT_URL='exp+zglosto://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
fi

export MAESTRO_RUN_ID
export EXPO_DEV_CLIENT_URL
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_CLI_NO_ANALYTICS=true
if [ "${MAESTRO_DEVICE:-}" != "" ]; then
  flow="$(dirname "$0")/../e2e/phase4-resident.yaml"
  case "$MAESTRO_DEVICE" in
    emulator-*)
      adb -s "$MAESTRO_DEVICE" shell pm clear pl.zglosto.app >/dev/null
      adb -s "$MAESTRO_DEVICE" shell am start -W -a android.intent.action.VIEW \
        -d "$EXPO_DEV_CLIENT_URL" pl.zglosto.app >/dev/null
      flow="$(dirname "$0")/../e2e/phase4-resident-android.yaml"
      ;;
  esac
  exec maestro test --device "$MAESTRO_DEVICE" \
    -e "EXPO_DEV_CLIENT_URL=$EXPO_DEV_CLIENT_URL" \
    -e "MAESTRO_RUN_ID=$MAESTRO_RUN_ID" \
    "$flow"
fi
exec maestro test \
  -e "EXPO_DEV_CLIENT_URL=$EXPO_DEV_CLIENT_URL" \
  -e "MAESTRO_RUN_ID=$MAESTRO_RUN_ID" \
  "$(dirname "$0")/../e2e/phase4-resident.yaml"
