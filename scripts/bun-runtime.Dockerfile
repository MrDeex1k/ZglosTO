# Verification and build toolchain use Bun without Node.
FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS bun
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
 && bun run --filter './packages/*' build
CMD ["sh", "-c", "bun scripts/bun-phase1-probe.ts && bun scripts/bun-phase1-otel-probe.ts --sigterm"]
