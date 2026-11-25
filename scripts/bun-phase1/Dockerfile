FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN for package in contracts i18n observability transient-store workload-auth white-label-config rate-limiting; do bun node_modules/typescript/bin/tsc -p packages/$package/tsconfig.build.json || exit 1; done
RUN for service in backend authorization llm_gateway; do bun node_modules/typescript/bin/tsc -p $service/tsconfig.build.json || exit 1; done
CMD ["bun", "scripts/bun-phase1-probe.ts"]

