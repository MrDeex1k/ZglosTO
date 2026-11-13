# syntax=docker/dockerfile:1.28.0

ARG NGINX_IMAGE=nginx:1.31.8-alpine3.24-slim

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS bun

FROM bun AS build

ARG WHITE_LABEL_CONFIG_FILE=config/white-label/zglosto.yaml
ARG PUBLIC_SITE_URL

ENV BUN_INSTALL_CACHE_DIR=/bun/cache
ENV WHITE_LABEL_CONFIG=/workspace/config/white-label/city.yaml

WORKDIR /workspace

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json frontend/package.json
COPY docs-site/package.json docs-site/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/white-label-config/package.json packages/white-label-config/package.json

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun install --frozen-lockfile --filter frontend-zglosto... --filter docs-site

COPY . .
COPY ${WHITE_LABEL_CONFIG_FILE} config/white-label/city.yaml

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun run --filter @zglosto/contracts --filter @zglosto/i18n --filter @zglosto/white-label-config --if-present build \
 && bun run --filter frontend-zglosto build \
 && bun run --filter docs-site build

FROM ${NGINX_IMAGE} AS production

COPY frontend/nginx-main.conf /etc/nginx/nginx.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=build /workspace/frontend/dist/client /usr/share/nginx/html
COPY --chown=nginx:nginx --from=build /workspace/docs-site/dist /usr/share/nginx/html/docs
COPY --chmod=0555 frontend/start.sh /usr/local/bin/start-frontend

USER nginx:nginx

EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health/ready"]

CMD ["/usr/local/bin/start-frontend"]
