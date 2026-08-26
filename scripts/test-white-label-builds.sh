#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm --silent --filter @zglosto/contracts build >/dev/null
pnpm --silent --filter @zglosto/white-label-config build >/dev/null
node scripts/check-mobile-client-configs.mjs

CONFIG_PATHS=("$ROOT_DIR"/config/white-label/test-*.yaml)
if [ "${#CONFIG_PATHS[@]}" -lt 2 ]; then
    echo "White-Label build test requires at least two test city configs." >&2
    exit 1
fi

for config_path in "${CONFIG_PATHS[@]}"; do
    metadata=$(pnpm --silent --filter @zglosto/white-label-config metadata "$config_path" fields)
    IFS=$'\t' read -r city_key config_version checksum validated_path <<< "$metadata"

    echo "[white-label] Building frontend for $city_key ($config_version) from $validated_path"
    WHITE_LABEL_CONFIG="$config_path" pnpm --silent --filter frontend-zglosto build >/dev/null

    readiness_file="$ROOT_DIR/frontend/dist/client/health/ready.json"
    if [ ! -s "$readiness_file" ]; then
        echo "Frontend readiness artifact is missing for $city_key." >&2
        exit 1
    fi
    if ! grep -Fq "\"configVersion\":\"$config_version\"" "$readiness_file"; then
        echo "Frontend readiness contains a wrong config version for $city_key." >&2
        exit 1
    fi
    if ! grep -Fq "\"checksum\":\"$checksum\"" "$readiness_file"; then
        echo "Frontend readiness contains a wrong checksum for $city_key." >&2
        exit 1
    fi
done

echo "[white-label] PASS: every test city builds the same frontend contract"
