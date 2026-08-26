# syntax=docker/dockerfile:1.12

ARG PGBOUNCER_IMAGE=edoburu/pgbouncer:v1.25.2-p0

FROM ${PGBOUNCER_IMAGE}

USER root

COPY --chown=postgres:postgres --chmod=0555 pgbouncer/start-pgbouncer.sh /usr/local/bin/start-pgbouncer
COPY --chmod=0555 scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets

USER postgres:postgres

STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["pg_isready", "-h", "127.0.0.1", "-p", "6432"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets", "/usr/local/bin/start-pgbouncer"]
CMD ["/usr/bin/pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
