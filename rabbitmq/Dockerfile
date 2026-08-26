# syntax=docker/dockerfile:1.12

ARG RABBITMQ_IMAGE=rabbitmq:4.3.5-alpine

FROM ${RABBITMQ_IMAGE}

COPY rabbitmq/rabbitmq.conf /etc/rabbitmq/rabbitmq.conf
COPY rabbitmq/healthcheck.sh /usr/local/bin/rabbitmq-tls-healthcheck
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets

RUN rabbitmq-plugins enable --offline rabbitmq_prometheus \
 && chmod 0444 /etc/rabbitmq/rabbitmq.conf \
 && chmod 0755 /usr/local/bin/rabbitmq-tls-healthcheck \
 && chmod 0555 /usr/local/bin/load-container-secrets

ENTRYPOINT ["/usr/local/bin/load-container-secrets", "docker-entrypoint.sh"]
CMD ["rabbitmq-server"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=8s --start-period=15s --retries=3 \
  CMD ["/usr/local/bin/rabbitmq-tls-healthcheck"]
