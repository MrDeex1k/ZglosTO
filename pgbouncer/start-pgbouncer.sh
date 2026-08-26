#!/bin/sh

set -eu

install -d -m 0700 /var/run/pgbouncer/tls
database_tls_ca_path="${DATABASE_TLS_CA_SOURCE_PATH:-/run/secrets/database/ca.crt}"
pgbouncer_tls_cert_path="${PGBOUNCER_TLS_CERT_PATH:-/run/secrets/database/pgbouncer-server.crt}"
pgbouncer_tls_key_path="${PGBOUNCER_TLS_KEY_PATH:-/run/secrets/database/pgbouncer-server.key}"
install -m 0644 "$database_tls_ca_path" /var/run/pgbouncer/tls/ca.crt
install -m 0644 "$pgbouncer_tls_cert_path" /var/run/pgbouncer/tls/server.crt
install -m 0600 "$pgbouncer_tls_key_path" /var/run/pgbouncer/tls/server.key

exec /entrypoint.sh "$@"
