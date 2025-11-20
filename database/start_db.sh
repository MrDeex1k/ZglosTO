#!/bin/bash
set -e

/usr/local/bin/docker-entrypoint.sh "$@"

if [ "$1" = 'postgres' ]; then
    echo "Waiting for database to be ready..."
    until pg_isready -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d ${POSTGRES_DB}; do
        sleep 2
    done

    echo "Database is ready. Setting up pgBackRest..."

    if ! pgbackrest --stanza=zglosto_db info >/dev/null 2>&1; then
        echo "Creating pgBackRest stanza..."
        pgbackrest --stanza=zglosto_db stanza-create
        echo "Stanza created successfully."
    else
        echo "Stanza already exists."
    fi

    echo "Performing initial full backup..."
    pgbackrest --stanza=zglosto_db --type=full backup
    echo "Initial backup completed."
fi