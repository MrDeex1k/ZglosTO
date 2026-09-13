# syntax=docker/dockerfile:1.12

ARG NGINX_IMAGE=nginx:1.31.4-alpine3.24-slim

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS bun

FROM bun AS build

ARG WHITE_LABEL_CONFIG_FILE=config/white-label/zglosto.yaml

ENV BUN_INSTALL_CACHE_DIR=/bun/cache
ENV WHITE_LABEL_CONFIG=/workspace/config/white-label/city.yaml

WORKDIR /workspace

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/white-label-config/package.json packages/white-label-config/package.json

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun install --frozen-lockfile --filter frontend-zglosto...

COPY . .
COPY ${WHITE_LABEL_CONFIG_FILE} config/white-label/city.yaml

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun run --filter @zglosto/contracts --filter @zglosto/i18n --filter @zglosto/white-label-config --if-present build \
 && bun run --filter frontend-zglosto build

FROM ${NGINX_IMAGE} AS production

COPY frontend/nginx-main.conf /etc/nginx/nginx.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=build /workspace/frontend/dist/client /usr/share/nginx/html
COPY --chmod=0555 frontend/start.sh /usr/local/bin/start-frontend

USER nginx:nginx

EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health/ready"]

CMD ["/usr/local/bin/start-frontend"]
