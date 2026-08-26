#!/bin/sh

set -eu

load_secret() {
  variable_name=$1
  file_variable_name="${variable_name}_FILE"
  file_path=$(printenv "$file_variable_name" || true)

  if [ -z "$file_path" ]; then
    return
  fi
  if [ ! -r "$file_path" ]; then
    printf 'Secret file for %s is not readable: %s\n' "$variable_name" "$file_path" >&2
    exit 78
  fi

  secret_value=$(cat "$file_path")
  if [ -z "$secret_value" ]; then
    printf 'Secret file for %s is empty: %s\n' "$variable_name" "$file_path" >&2
    exit 78
  fi

  export "$variable_name=$secret_value"
  unset "$file_variable_name"
}

for secret_name in \
  BETTER_AUTH_SECRET \
  DATABASE_DIRECT_URL \
  DATABASE_URL \
  PGBOUNCER_CLIENT_URL \
  POSTGRES_PASSWORD \
  RABBITMQ_DEFAULT_PASS \
  RABBITMQ_DEFAULT_USER \
  RABBITMQ_PASSWORD \
  RABBITMQ_URL \
  RABBITMQ_USER \
  S3_ACCESS_KEY_ID \
  S3_SECRET_ACCESS_KEY
do
  load_secret "$secret_name"
done

exec "$@"
