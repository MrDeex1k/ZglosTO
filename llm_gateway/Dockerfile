# syntax=docker/dockerfile:1.12

ARG RUNTIME_IMAGE=alpine:3.24.1

FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS bun

FROM bun AS build

ENV BUN_INSTALL_CACHE_DIR=/bun/cache

WORKDIR /workspace

COPY package.json bun.lock bunfig.toml ./
COPY llm_gateway/package.json llm_gateway/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/workload-auth/package.json packages/workload-auth/package.json

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun install --frozen-lockfile --filter llm-gateway-zglosto...

COPY . .

RUN --mount=type=cache,id=zglosto-bun,target=/bun/cache \
    bun run --filter @zglosto/contracts --filter @zglosto/observability --filter @zglosto/workload-auth --if-present build \
 && bun run --filter llm-gateway-zglosto build \
 && bun scripts/stage-production.ts llm_gateway /prod/llm_gateway \
 && cd /prod/llm_gateway \
 && bun install --production --frozen-lockfile --offline --ignore-scripts --filter llm-gateway-zglosto... \
 && bun /workspace/scripts/verify-production-install.ts /prod/llm_gateway llm_gateway \
 && rm bun.lock bunfig.toml \
 && find . -type f \( -name "*.map" -o -name "*.d.ts" -o -name "*.d.ts.map" \) -delete

FROM build AS development

ENV NODE_ENV=development
WORKDIR /workspace/llm_gateway

CMD ["bun", "run", "dev"]

FROM ${RUNTIME_IMAGE} AS production

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
 && addgroup -g 1000 -S node \
 && adduser -u 1000 -S -D -H -G node node

ENV NODE_ENV=production
WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --chown=node:node --from=build /prod/llm_gateway ./
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets
RUN chmod 0555 /usr/local/bin/load-container-secrets

WORKDIR /app/llm_gateway

USER node:node

EXPOSE 8130
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "dist/src/healthcheck.js"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets"]
CMD ["bun", "--preload", "@zglosto/observability/register", "dist/src/server.js"]
