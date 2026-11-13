#!/bin/sh

set -eu

install -d -m 0700 /var/run/pgbouncer/tls
database_tls_ca_path="${DATABASE_TLS_CA_SOURCE_PATH:-/run/secrets/database/ca.crt}"
pgbouncer_tls_cert_path="${PGBOUNCER_TLS_CERT_PATH:-/run/secrets/database/pgbouncer-server.crt}"
pgbouncer_tls_key_path="${PGBOUNCER_TLS_KEY_PATH:-/run/secrets/database/pgbouncer-server.key}"
install -m 0644 "$database_tls_ca_path" /var/run/pgbouncer/tls/ca.crt
install -m 0644 "$pgbouncer_tls_cert_path" /var/run/pgbouncer/tls/server.crt
install -m 0600 "$pgbouncer_tls_key_path" /var/run/pgbouncer/tls/server.key

# Generate a multi-user config. No upstream user/password override is permitted.
# Each connection reaches PostgreSQL as the authenticated runtime identity.
umask 077
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_PORT:?POSTGRES_PORT is required}"
case "$POSTGRES_DB" in *[!a-zA-Z0-9_]*) echo 'Invalid database name' >&2; exit 78;; esac
for name in POSTGRES_PORT LISTEN_PORT MAX_CLIENT_CONN DEFAULT_POOL_SIZE RESERVE_POOL_SIZE MAX_PREPARED_STATEMENTS; do
  value=$(printenv "$name")
  case "$value" in ''|*[!0-9]*) echo "Invalid numeric setting: $name" >&2; exit 78;; esac
done
: > /etc/pgbouncer/userlist.txt
for role in auth backend media_worker; do
  case "$role" in
    auth) password=$DATABASE_AUTH_PASSWORD;;
    backend) password=$DATABASE_BACKEND_PASSWORD;;
    media_worker) password=$DATABASE_MEDIA_WORKER_PASSWORD;;
  esac
  [ "${#password}" -ge 24 ] && [ "$password" = "$(printf '%s' "$password" | tr -d '\r\n')" ] || {
    echo 'Missing, short or multiline runtime password' >&2; exit 78;
  }
  escaped=$(printf '%s' "$password" | sed 's/"/""/g')
  printf '"zglosto_%s" "%s"\n' "$role" "$escaped" >> /etc/pgbouncer/userlist.txt
done
cat > /etc/pgbouncer/pgbouncer.ini <<EOFCONFIG
[databases]
${POSTGRES_DB} = host=database port=${POSTGRES_PORT} dbname=${POSTGRES_DB}
[pgbouncer]
listen_addr = 0.0.0.0
listen_port = ${LISTEN_PORT}
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = ${MAX_CLIENT_CONN}
default_pool_size = ${DEFAULT_POOL_SIZE}
reserve_pool_size = ${RESERVE_POOL_SIZE}
max_prepared_statements = ${MAX_PREPARED_STATEMENTS}
ignore_startup_parameters = extra_float_digits
client_tls_sslmode = require
client_tls_cert_file = /var/run/pgbouncer/tls/server.crt
client_tls_key_file = /var/run/pgbouncer/tls/server.key
client_tls_protocols = tlsv1.3
server_tls_sslmode = verify-full
server_tls_ca_file = /var/run/pgbouncer/tls/ca.crt
server_tls_protocols = tlsv1.3
EOFCONFIG
exec /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini
