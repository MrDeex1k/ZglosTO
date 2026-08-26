#!/usr/bin/env bash

set -Eeuo pipefail

if [ "${1:-}" != 'postgres' ]; then
    exec /usr/local/bin/docker-entrypoint.sh "$@"
fi

install -d -o postgres -g postgres -m 0700 /run/postgresql/tls
postgres_tls_cert_path="${POSTGRES_TLS_CERT_PATH:-/run/secrets/database/postgres-server.crt}"
postgres_tls_key_path="${POSTGRES_TLS_KEY_PATH:-/run/secrets/database/postgres-server.key}"
install -o postgres -g postgres -m 0644 "$postgres_tls_cert_path" /run/postgresql/tls/server.crt
install -o postgres -g postgres -m 0600 "$postgres_tls_key_path" /run/postgresql/tls/server.key

mkdir -p /var/lib/pgbackrest
chown postgres:postgres /var/lib/pgbackrest
install -o postgres -g postgres -m 0600 /dev/null /run/pgbackrest-runtime.env
printf 'PGBACKREST_PG_PORT=%q\nPGBACKREST_PG_USER=%q\n' "$POSTGRES_PORT" "$POSTGRES_USER" \
    > /run/pgbackrest-runtime.env

/usr/local/bin/docker-entrypoint.sh "$@" &
postgres_pid=$!

forward_signal() {
    kill -TERM "$postgres_pid" 2>/dev/null || true
}

trap forward_signal INT TERM

until pg_isready -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    if ! kill -0 "$postgres_pid" 2>/dev/null; then
        wait "$postgres_pid"
        exit $?
    fi
    sleep 1
done

pgbackrest_command=(
    gosu postgres pgbackrest
    --stanza=zglosto_db
    --pg1-port="$POSTGRES_PORT"
    --pg1-user="$POSTGRES_USER"
)

if ! "${pgbackrest_command[@]}" info >/dev/null 2>&1; then
    echo 'Creating pgBackRest stanza...'
    "${pgbackrest_command[@]}" stanza-create
fi

"${pgbackrest_command[@]}" check
if ! "${pgbackrest_command[@]}" info | grep -q 'full backup:'; then
    echo 'Creating initial pgBackRest full backup...'
    "${pgbackrest_command[@]}" --type=full backup
fi

wait "$postgres_pid"
