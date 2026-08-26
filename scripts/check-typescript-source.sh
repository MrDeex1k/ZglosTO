#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SOURCE_DIRS=(authorization backend frontend/src packages tests)

if find "${SOURCE_DIRS[@]}" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.jsx' \) \
  -not -path '*/node_modules/*' -not -path '*/dist/*' | grep -q .; then
  printf 'Source JavaScript files are not allowed:\n' >&2
  find "${SOURCE_DIRS[@]}" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.jsx' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' >&2
  exit 1
fi

if rg -n '\bany\b' "${SOURCE_DIRS[@]}" --glob '*.{ts,tsx}' \
  --glob '!**/routeTree.gen.ts'; then
  printf 'Explicit any is not allowed in first-party TypeScript.\n' >&2
  exit 1
fi

if rg -n '\bundefined\b' authorization backend packages/contracts/src tests \
  --glob '*.{ts,tsx}'; then
  printf 'Explicit undefined is not allowed in domain, service, contract or test code.\n' >&2
  exit 1
fi

node --input-type=module -e '
  import { readFile } from "node:fs/promises";

  const manifest = JSON.parse(await readFile("authorization/package.json", "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  const forbidden = ["express", "cors", "@types/express", "@types/cors"];
  const present = forbidden.filter((name) => Object.hasOwn(dependencies, name));
  if (present.length > 0) {
    console.error(`Authorization must not depend on legacy Express/CORS packages: ${present.join(", ")}`);
    process.exit(1);
  }
'

if rg -n "from ['\"](?:express|cors)['\"]|require\\(['\"](?:express|cors)['\"]\\)" authorization \
  --glob '*.{ts,tsx}' --glob '!dist/**'; then
  printf 'Authorization must use Hono middleware and must not import legacy Express/CORS.\n' >&2
  exit 1
fi

printf 'TypeScript source policy passed.\n'
