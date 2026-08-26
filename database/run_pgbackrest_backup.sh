#!/usr/bin/env bash

set -Eeuo pipefail

backup_type="${1:-}"
if [ "$backup_type" != 'full' ] && [ "$backup_type" != 'diff' ]; then
    printf 'Usage: %s <full|diff>\n' "$0" >&2
    exit 64
fi

source /run/pgbackrest-runtime.env

exec pgbackrest \
    --stanza=zglosto_db \
    --pg1-port="$PGBACKREST_PG_PORT" \
    --pg1-user="$PGBACKREST_PG_USER" \
    --type="$backup_type" \
    backup
