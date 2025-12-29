FROM postgres:18.1

LABEL maintainer="ZglosTO"
LABEL description="PostgreSQL 18 database for ZglosTO application"

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-cron pgbackrest \
 && rm -rf /var/lib/apt/lists/* \
 && echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample \
 && echo "cron.database_name = 'zglosto_db'" >> /usr/share/postgresql/postgresql.conf.sample

COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf

COPY start_db.sh /usr/local/bin/start_db.sh
RUN chmod +x /usr/local/bin/start_db.sh
ENTRYPOINT ["/usr/local/bin/start_db.sh"]

EXPOSE 54325