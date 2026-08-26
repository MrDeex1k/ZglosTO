#!/bin/sh
set -eu

action="${1:-}"
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
project_name="${MOBILE_DEMO_PROJECT_NAME:-zglosto-mobile-demo}"
origin="${MOBILE_DEMO_ORIGIN:-http://127.0.0.1:1235}"
env_file="${MOBILE_DEMO_ENV_FILE:-$project_dir/.env.example}"
state_dir="${MOBILE_DEMO_STATE_DIR:-$project_dir/.state/mobile-demo}"
credentials_file="$state_dir/credentials.env"
docker_context="${MOBILE_DEMO_DOCKER_CONTEXT:-}"

case "$project_name" in
  zglosto-mobile-demo*) ;;
  *)
    echo "MOBILE_DEMO_PROJECT_NAME must start with zglosto-mobile-demo." >&2
    exit 1
    ;;
esac

case "$origin" in
  http://127.0.0.1:[0-9]*|http://localhost:[0-9]*) ;;
  *)
    echo "MOBILE_DEMO_ORIGIN must be a local loopback HTTP origin." >&2
    exit 1
    ;;
esac

compose() {
  if [ -n "$docker_context" ]; then
    docker --context "$docker_context" compose \
      --project-name "$project_name" \
      --env-file "$env_file" \
      --file "$project_dir/docker-compose.yml" \
      --file "$project_dir/Mobile/docker-compose.demo.yml" \
      "$@"
  else
    docker compose \
      --project-name "$project_name" \
      --env-file "$env_file" \
      --file "$project_dir/docker-compose.yml" \
      --file "$project_dir/Mobile/docker-compose.demo.yml" \
      "$@"
  fi
}

clear_fixtures() {
  remaining=$(compose exec -T database sh -lc \
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -Atq -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    <"$script_dir/clear-phase7-demo-fixtures.sql")
  if [ "$remaining" != "0" ]; then
    echo "Demo accounts were not removed completely." >&2
    exit 1
  fi
  rm -f "$credentials_file"
}

signup() {
  name="$1"
  email="$2"
  password="$3"
  payload=$(printf '{"name":"%s","email":"%s","password":"%s"}' "$name" "$email" "$password")
  curl --fail --silent --show-error \
    --request POST \
    --header 'content-type: application/json' \
    --header 'origin: zglosto://' \
    --data "$payload" \
    "$origin/api/auth/sign-up/email" >/dev/null
}

case "$action" in
  clear)
    clear_fixtures
    echo "Synthetic Mobile demo accounts and showcase incidents removed."
    ;;
  seed)
    command -v docker >/dev/null 2>&1 || {
      echo "docker is required." >&2
      exit 1
    }
    command -v curl >/dev/null 2>&1 || {
      echo "curl is required." >&2
      exit 1
    }
    command -v openssl >/dev/null 2>&1 || {
      echo "openssl is required." >&2
      exit 1
    }
    compose ps --status running database >/dev/null
    clear_fixtures

    resident_password="Demo-$(openssl rand -hex 18)"
    service_password="Demo-$(openssl rand -hex 18)"
    admin_password="Demo-$(openssl rand -hex 18)"

    cleanup_on_error=1
    trap 'if [ "$cleanup_on_error" = "1" ]; then clear_fixtures >/dev/null 2>&1 || true; fi' EXIT HUP INT TERM

    signup 'Anna Kowalska' 'demo.resident@example.test' "$resident_password"
    signup 'Zarząd Dróg Miejskich' 'demo.service@example.test' "$service_password"
    signup 'Administrator demonstracyjny' 'demo.admin@example.test' "$admin_password"

    updated=$(compose exec -T database sh -lc \
      'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -Atq -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
      <"$script_dir/phase7-demo-fixtures.sql")
    if [ "$updated" != "3" ]; then
      echo "Expected exactly three synthetic Mobile demo accounts." >&2
      exit 1
    fi

    umask 077
    mkdir -p "$state_dir"
    {
      printf "DEMO_RESIDENT_EMAIL='%s'\n" 'demo.resident@example.test'
      printf "DEMO_RESIDENT_PASSWORD='%s'\n" "$resident_password"
      printf "DEMO_SERVICE_EMAIL='%s'\n" 'demo.service@example.test'
      printf "DEMO_SERVICE_PASSWORD='%s'\n" "$service_password"
      printf "DEMO_ADMIN_EMAIL='%s'\n" 'demo.admin@example.test'
      printf "DEMO_ADMIN_PASSWORD='%s'\n" "$admin_password"
    } >"$credentials_file"

    cleanup_on_error=0
    trap - EXIT HUP INT TERM
    echo "Synthetic Mobile demo accounts and showcase incidents created. Credentials: $credentials_file"
    ;;
  *)
    echo "Usage: $0 seed|clear" >&2
    exit 1
    ;;
esac
