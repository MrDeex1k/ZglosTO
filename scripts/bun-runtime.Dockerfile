# Verification and build toolchain use Bun without Node.
FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS bun
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
 && bun run --filter './packages/*' build
CMD ["sh", "-c", "bun scripts/bun-phase1-probe.ts && bun scripts/bun-phase1-otel-probe.ts --sigterm"]
