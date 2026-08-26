#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_BOUNDARY_DIR:-$ROOT_DIR/frontend}"
SOURCE_DIR="${FRONTEND_BOUNDARY_SOURCE_DIR:-$FRONTEND_DIR/src}"
MANIFEST="${FRONTEND_BOUNDARY_MANIFEST:-$FRONTEND_DIR/package.json}"
BFF_DIR="$SOURCE_DIR/server/bff"

if [[ ! -d "$SOURCE_DIR" || ! -f "$MANIFEST" ]]; then
  printf 'Frontend boundary input is incomplete: source=%s manifest=%s\n' \
    "$SOURCE_DIR" "$MANIFEST" >&2
  exit 1
fi

node --input-type=module - "$MANIFEST" <<'NODE'
import { readFile } from 'node:fs/promises';

const manifestPath = process.argv[2];
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const dependencies = {
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.optionalDependencies,
};
const forbidden = [
  '@aws-sdk/client-s3',
  '@azure/storage-blob',
  '@cloudamqp/amqp-client',
  '@google-cloud/storage',
  '@prisma/client',
  'amqplib',
  'better-sqlite3',
  'drizzle-orm',
  'kafkajs',
  'knex',
  'kysely',
  'minio',
  'mongodb',
  'mysql2',
  'pg',
  'postgres',
  'prisma',
  'rabbitmq-client',
  'sequelize',
  'typeorm',
];
const forbiddenWorkspaces = [
  'authorization-zglosto',
  'backend-zglosto',
  'llm-gateway-zglosto',
];
const present = [...forbidden, ...forbiddenWorkspaces].filter((name) =>
  Object.hasOwn(dependencies, name),
);

if (present.length > 0) {
  console.error(
    `Frontend must use the NestJS/Authorization HTTP contracts, not infrastructure packages: ${present.join(', ')}`,
  );
  process.exit(1);
}
NODE

FORBIDDEN_PACKAGE_PATTERN='['"'"'"](@aws-sdk/client-s3|@azure/storage-blob|@cloudamqp/amqp-client|@google-cloud/storage|@prisma/client|amqplib|authorization-zglosto|backend-zglosto|better-sqlite3|drizzle-orm|kafkajs|knex|kysely|llm-gateway-zglosto|minio|mongodb|mysql2|pg|postgres|prisma|rabbitmq-client|sequelize|typeorm)(/[^'"'"'"]*)?['"'"'"]'
if rg -n "$FORBIDDEN_PACKAGE_PATTERN" "$SOURCE_DIR" --glob '*.{ts,tsx}'; then
  printf 'Frontend source must not import database, Object Storage or broker clients.\n' >&2
  exit 1
fi

if rg -n \
  "['\"](?:\\.\\./)+(?:authorization|backend|database|llm_gateway|pgbouncer|rabbitmq|rustfs)(?:/|['\"])" \
  "$SOURCE_DIR" --glob '*.{ts,tsx}'; then
  printf 'Frontend source must not import another service implementation directly.\n' >&2
  exit 1
fi

if rg -n \
  '\b(DATABASE_URL|DATABASE_DIRECT_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|POSTGRES_[A-Z0-9_]+|S3_[A-Z0-9_]+|RUSTFS_[A-Z0-9_]+|AMQP_URL|AMQPS_URL|RABBITMQ_[A-Z0-9_]+|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\b' \
  "$SOURCE_DIR" --glob '*.{ts,tsx}'; then
  printf 'Frontend source must not read database, storage or broker credentials.\n' >&2
  exit 1
fi

if rg -n \
  "['\"](?:postgres(?:ql)?|amqps?|s3)://|['\"](?:database|pgbouncer|rabbitmq|rustfs):[0-9]" \
  "$SOURCE_DIR" --glob '*.{ts,tsx}'; then
  printf 'Frontend source must use same-origin HTTP contracts, not infrastructure endpoints.\n' >&2
  exit 1
fi

while IFS= read -r server_file; do
  if [[ "$server_file" != "$BFF_DIR/"* ]]; then
    printf 'TanStack Start server-only code is allowed only in frontend/src/server/bff: %s\n' \
      "$server_file" >&2
    exit 1
  fi
done < <(
  {
    find "$SOURCE_DIR" -type f \( -name '*.server.ts' -o -name '*.server.tsx' \)
    rg -l \
      "createServerFn|@tanstack/react-start/server-only" \
      "$SOURCE_DIR" --glob '*.{ts,tsx}' || true
  } | sort -u
)

printf 'Frontend domain boundary policy passed.\n'
