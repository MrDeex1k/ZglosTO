# syntax=docker/dockerfile:1.12

ARG NODE_IMAGE=node:26.8.1-alpine3.24
ARG NGINX_IMAGE=nginx:1.31.4-alpine3.24-slim

FROM ${NODE_IMAGE} AS build

ARG WHITE_LABEL_CONFIG_FILE=config/white-label/zglosto.yaml

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV WHITE_LABEL_CONFIG=/workspace/config/white-label/city.yaml

WORKDIR /workspace

RUN npm install --global pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/white-label-config/package.json packages/white-label-config/package.json

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm fetch --filter frontend-zglosto...
RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter frontend-zglosto...

COPY . .
COPY ${WHITE_LABEL_CONFIG_FILE} config/white-label/city.yaml

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm --filter frontend-zglosto^... --if-present build \
 && pnpm install --offline --frozen-lockfile --force --config.optimistic-repeat-install=false --filter frontend-zglosto... \
 && pnpm --filter frontend-zglosto build

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
