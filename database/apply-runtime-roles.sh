#!/usr/bin/env bash
set -Eeuo pipefail
if [ "${1:-}" != '--apply-runtime-role-separation' ]; then
  echo 'Stop all writers, back up DB and configure new secret files; then pass --apply-runtime-role-separation [docker compose options]' >&2
  exit 64
fi
shift
# Leave writers stopped until their replacement containers use the new role URLs.
docker compose "$@" stop --timeout 120 nginx authorization backend media_worker pgbouncer
docker compose "$@" exec -T database sh /docker-entrypoint-initdb.d/apply-runtime-roles.txt --apply-runtime-role-separation
