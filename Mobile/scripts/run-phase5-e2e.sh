#!/bin/sh
set -eu

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI is required. Install the version recorded in DEPENDENCIES.tsv." >&2
  exit 1
fi

if [ "${EXPO_DEV_CLIENT_URL:-}" = "" ]; then
  EXPO_DEV_CLIENT_URL='exp+zglosto://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'
fi
if [ "${MAESTRO_DEVICE:-}" = "" ]; then
  echo "MAESTRO_DEVICE must identify the approved Android emulator or iPhone simulator." >&2
  exit 1
fi
if [ "${PHASE5_SERVICE_PASSWORD:-}" = "" ]; then
  echo "PHASE5_SERVICE_PASSWORD must be provided by the local test fixture." >&2
  exit 1
fi
if [ "${PHASE5_SERVICE_EMAIL:-}" = "" ]; then
  PHASE5_SERVICE_EMAIL='phase5.svca@example.test'
fi

export EXPO_DEV_CLIENT_URL
export PHASE5_SERVICE_EMAIL
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_CLI_NO_ANALYTICS=true

flow="$(dirname "$0")/../e2e/phase5-service-ios.yaml"
case "$MAESTRO_DEVICE" in
  emulator-*)
    adb -s "$MAESTRO_DEVICE" shell pm clear pl.zglosto.app >/dev/null
    adb -s "$MAESTRO_DEVICE" shell am start -W -a android.intent.action.VIEW \
      -d "$EXPO_DEV_CLIENT_URL" pl.zglosto.app >/dev/null
    flow="$(dirname "$0")/../e2e/phase5-service-android.yaml"
    ;;
esac

exec maestro test --device "$MAESTRO_DEVICE" \
  -e "EXPO_DEV_CLIENT_URL=$EXPO_DEV_CLIENT_URL" \
  -e "PHASE5_SERVICE_EMAIL=$PHASE5_SERVICE_EMAIL" \
  -e "PHASE5_SERVICE_PASSWORD=$PHASE5_SERVICE_PASSWORD" \
  "$flow"
