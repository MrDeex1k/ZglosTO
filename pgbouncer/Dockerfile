# syntax=docker/dockerfile:1.28.0

ARG PGBOUNCER_IMAGE=edoburu/pgbouncer:v1.26.1-p0

FROM ${PGBOUNCER_IMAGE} AS patched

USER root

# The upstream tag can lag Alpine security fixes (libpq, musl and zlib).
RUN apk upgrade --no-cache

# Copy the patched filesystem into one layer; replaced upstream libraries must
# not remain as duplicate bytes in the production artifact. Keep the APK database
# and OS metadata for vulnerability scanners and the original entrypoint behavior.
FROM scratch
COPY --from=patched / /
WORKDIR /etc/pgbouncer

COPY --chown=postgres:postgres --chmod=0555 pgbouncer/start-pgbouncer.sh /usr/local/bin/start-pgbouncer
COPY --chmod=0555 scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets

USER postgres:postgres

STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["pg_isready", "-h", "127.0.0.1", "-p", "6432"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets", "/usr/local/bin/start-pgbouncer"]
CMD ["/usr/bin/pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
