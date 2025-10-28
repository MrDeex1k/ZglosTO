# PostgreSQL 18 Dockerfile
FROM postgres:18

# Set environment labels
LABEL maintainer="ZglosTO"
LABEL description="PostgreSQL 18 database for ZglosTO application"

# Copy initialization scripts if needed
# COPY ./init-scripts/ /docker-entrypoint-initdb.d/

# Expose PostgreSQL port (container is configured to listen on 54325)
EXPOSE 54325
