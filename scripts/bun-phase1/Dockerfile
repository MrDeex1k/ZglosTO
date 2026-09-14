FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN for package in contracts i18n observability transient-store workload-auth white-label-config rate-limiting; do bun node_modules/typescript/bin/tsc -p packages/$package/tsconfig.build.json || exit 1; done
RUN for service in backend authorization llm_gateway; do bun node_modules/typescript/bin/tsc -p $service/tsconfig.build.json || exit 1; done
CMD ["bun", "scripts/bun-phase1-probe.ts"]

