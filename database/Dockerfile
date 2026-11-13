# syntax=docker/dockerfile:1.28.0

ARG POSTGRES_IMAGE=postgres:18.7-alpine3.24

FROM golang:1.27.3-alpine3.24@sha256:fa3d596898d9f126af7c01d14ee7597bab3f39cccf392ef36b69fe77cd681f18 AS privilege-dropper
# Keep the upstream gosu behavior, rebuilding its embedded standard library.
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/tianon/gosu@1.19

FROM ${POSTGRES_IMAGE} AS extensions

RUN apk add --no-cache pgbackrest postgresql-pg_cron

FROM ${POSTGRES_IMAGE}

COPY --from=privilege-dropper /out/gosu /usr/local/bin/gosu

RUN apk add --no-cache libbz2 libssh2 \
 && echo "shared_preload_libraries = 'pg_cron'" >> /usr/local/share/postgresql/postgresql.conf.sample \
 && echo "cron.database_name = 'zglosto_db'" >> /usr/local/share/postgresql/postgresql.conf.sample \
 && echo "archive_mode = 'on'" >> /usr/local/share/postgresql/postgresql.conf.sample \
 && echo "archive_command = 'pgbackrest --stanza=zglosto_db archive-push %p'" >> /usr/local/share/postgresql/postgresql.conf.sample \
 && echo "restore_command = 'pgbackrest --stanza=zglosto_db archive-get %f %p'" >> /usr/local/share/postgresql/postgresql.conf.sample

COPY --from=extensions /usr/bin/pgbackrest /usr/local/bin/pgbackrest
COPY --from=extensions /usr/lib/postgresql18/pg_cron.so /usr/local/lib/postgresql/pg_cron.so
COPY --from=extensions /usr/share/postgresql18/extension/pg_cron* /usr/local/share/postgresql/extension/

COPY database/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
COPY database/pg_hba.conf /etc/postgresql/pg_hba.conf
COPY database/init-scripts /docker-entrypoint-initdb.d
COPY database/migrations /opt/zglosto/migrations

COPY database/start_db.sh /usr/local/bin/start_db.sh
COPY database/run_pgbackrest_backup.sh /usr/local/bin/run_pgbackrest_backup.sh
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets
RUN chmod 0644 /etc/postgresql/pg_hba.conf \
 && chmod +x /usr/local/bin/start_db.sh /usr/local/bin/run_pgbackrest_backup.sh \
 && chmod 0555 /usr/local/bin/load-container-secrets
ENTRYPOINT ["/usr/local/bin/load-container-secrets", "/usr/local/bin/start_db.sh"]

EXPOSE 54325
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD pg_isready -h 127.0.0.1 -p "${POSTGRES_PORT:-54325}" -U "${POSTGRES_USER:-postgres}" || exit 1
