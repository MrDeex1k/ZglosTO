#!/bin/sh

set -eu

readiness_file='/usr/share/nginx/html/health/ready.json'

if [ ! -s "$readiness_file" ]; then
  printf 'Frontend startup failed: validated White-Label readiness artifact is missing.\n' >&2
  exit 1
fi

if ! grep -q '"status":"ok"' "$readiness_file" || \
  ! grep -q '"status":"valid"' "$readiness_file"; then
  printf 'Frontend startup failed: White-Label readiness artifact is invalid.\n' >&2
  exit 1
fi

exec nginx -g 'daemon off;'
