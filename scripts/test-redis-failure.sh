#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

INTEGRATION_PROJECT_NAME="${INTEGRATION_PROJECT_NAME:-zglosto-phase10-redis-failure}" \
INTEGRATION_REDIS_MODE=local \
INTEGRATION_REDIS_FAILURE_ONLY=1 \
  "$ROOT_DIR/scripts/test-phase0-integration.sh"
