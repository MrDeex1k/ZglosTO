# Verification and build toolchain use Bun without Node.
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS bun
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
 && bun run --filter './packages/*' build
CMD ["sh", "-c", "bun scripts/bun-phase1-probe.ts && bun scripts/bun-phase1-otel-probe.ts --sigterm"]
