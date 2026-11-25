# Verification and build toolchain use Bun without Node.
FROM oven/bun:1.4.5-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b AS bun
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
 && bun run --filter './packages/*' build
CMD ["sh", "-c", "bun scripts/bun-phase1-probe.ts && bun scripts/bun-phase1-otel-probe.ts --sigterm"]
