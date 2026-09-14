# syntax=docker/dockerfile:1.12

ARG RUNTIME_IMAGE=alpine:3.24.1

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS bun

FROM bun AS build

ARG WHITE_LABEL_CONFIG_FILE=config/white-label/zglosto.yaml

ENV BUN_INSTALL_CACHE_DIR=/bun/cache

WORKDIR /workspace

COPY package.json bun.lock bunfig.toml ./
COPY backend/package.json backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/rate-limiting/package.json packages/rate-limiting/package.json
COPY packages/transient-store/package.json packages/transient-store/package.json
COPY packages/workload-auth/package.json packages/workload-auth/package.json
COPY packages/white-label-config/package.json packages/white-label-config/package.json

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun install --frozen-lockfile --filter backend-zglosto...

COPY . .
COPY ${WHITE_LABEL_CONFIG_FILE} config/white-label/city.yaml

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun run --filter @zglosto/contracts --filter @zglosto/observability --filter @zglosto/rate-limiting --filter @zglosto/transient-store --filter @zglosto/workload-auth --filter @zglosto/white-label-config --if-present build \
 && bun run --filter backend-zglosto build \
 && bun scripts/stage-production.ts backend /prod/backend \
 && cd /prod/backend \
 && bun install --production --frozen-lockfile --offline --ignore-scripts --filter backend-zglosto... \
 && bun /workspace/scripts/verify-production-install.ts /prod/backend backend \
 && rm bun.lock bunfig.toml \
 && find . -type f \( -name "*.map" -o -name "*.d.ts" -o -name "*.d.ts.map" \) -delete

FROM build AS development

ENV NODE_ENV=development
WORKDIR /workspace/backend

CMD ["bun", "run", "dev"]

FROM ${RUNTIME_IMAGE} AS production

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
 && addgroup -g 1000 -S node \
 && adduser -u 1000 -S -D -H -G node node

ENV NODE_ENV=production
WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --chown=node:node --from=build /prod/backend ./
COPY --chown=node:node --from=build /workspace/config/white-label/city.yaml /app/config/city.yaml
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets
RUN chmod 0555 /usr/local/bin/load-container-secrets

WORKDIR /app/backend

USER node:node

EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets"]
CMD ["bun", "--preload", "@zglosto/observability/register", "dist/nest/main.js"]
