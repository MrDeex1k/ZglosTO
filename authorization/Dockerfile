# syntax=docker/dockerfile:1.12

ARG NODE_IMAGE=node:26.7.0-alpine3.24
ARG RUNTIME_IMAGE=alpine:3.24.1

FROM ${NODE_IMAGE} AS build

ARG WHITE_LABEL_CONFIG_FILE=config/white-label/zglosto.yaml

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN npm install --global pnpm@11.22.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY authorization/package.json authorization/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/rate-limiting/package.json packages/rate-limiting/package.json
COPY packages/transient-store/package.json packages/transient-store/package.json
COPY packages/white-label-config/package.json packages/white-label-config/package.json

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm fetch --filter authorization-zglosto...
RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter authorization-zglosto...

COPY . .
COPY ${WHITE_LABEL_CONFIG_FILE} config/white-label/city.yaml

RUN --mount=type=cache,id=zglosto-pnpm,target=/pnpm/store \
    pnpm --filter authorization-zglosto^... --if-present build \
 && pnpm install --offline --frozen-lockfile --force --config.optimistic-repeat-install=false --filter authorization-zglosto... \
 && pnpm --filter authorization-zglosto build \
 && pnpm --filter authorization-zglosto deploy --prod --no-optional /prod/authorization \
 && rm -f /prod/authorization/pnpm-lock.yaml \
 && find /prod/authorization/node_modules -type f \
      \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.ts.map' \) -delete

FROM build AS development

ENV NODE_ENV=development
WORKDIR /workspace/authorization

CMD ["pnpm", "dev"]

FROM ${RUNTIME_IMAGE} AS production

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
 && addgroup -g 1000 -S node \
 && adduser -u 1000 -S -D -H -G node node

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --chown=node:node --from=build /prod/authorization ./
COPY --chown=node:node --from=build /workspace/config/white-label/city.yaml /app/config/city.yaml
COPY scripts/container-load-secrets.sh /usr/local/bin/load-container-secrets
RUN chmod 0555 /usr/local/bin/load-container-secrets

USER node:node

EXPOSE 9956
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "dist/src/healthcheck.js"]

ENTRYPOINT ["/usr/local/bin/load-container-secrets"]
CMD ["node", "--import", "@zglosto/observability/register", "dist/server.js"]
