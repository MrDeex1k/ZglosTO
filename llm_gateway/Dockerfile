# syntax=docker/dockerfile:1.12

ARG NODE_IMAGE=node:26.8.1-alpine3.24
ARG RUNTIME_IMAGE=alpine:3.24.1

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN npm install --global pnpm@11.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY llm_gateway/package.json llm_gateway/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/workload-auth/package.json packages/workload-auth/package.json

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm fetch --filter llm-gateway-zglosto...
RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter llm-gateway-zglosto...

COPY . .

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm --filter llm-gateway-zglosto^... --if-present build \
 && pnpm install --offline --frozen-lockfile --force --config.optimistic-repeat-install=false --filter llm-gateway-zglosto... \
 && pnpm --filter llm-gateway-zglosto build \
 && pnpm --filter llm-gateway-zglosto deploy --prod /prod/llm_gateway \
 && rm -f /prod/llm_gateway/pnpm-lock.yaml \
 && find /prod/llm_gateway/node_modules -type f \
      \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.ts.map' \) -delete

FROM build AS development

ENV NODE_ENV=development
WORKDIR /workspace/llm_gateway

CMD ["pnpm", "dev"]

FROM ${RUNTIME_IMAGE} AS production

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
 && addgroup -g 1000 -S node \
 && adduser -u 1000 -S -D -H -G node node

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --chown=node:node --from=build /prod/llm_gateway ./
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets
RUN chmod 0555 /usr/local/bin/load-container-secrets

USER node:node

EXPOSE 8130
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "dist/src/healthcheck.js"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets"]
CMD ["node", "--import", "@zglosto/observability/register", "dist/src/server.js"]
