#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DESIGN_DIR:-$ROOT_DIR/frontend}"
SOURCE_DIR="${FRONTEND_DESIGN_SOURCE_DIR:-$FRONTEND_DIR/src}"
MANIFEST="${FRONTEND_DESIGN_MANIFEST:-$FRONTEND_DIR/package.json}"
COMPONENTS_CONFIG="${FRONTEND_DESIGN_COMPONENTS:-$FRONTEND_DIR/components.json}"
CSS_FILE="${FRONTEND_DESIGN_CSS:-$SOURCE_DIR/App.css}"
UI_DIR="$SOURCE_DIR/components/ui"

if [[ ! -d "$SOURCE_DIR" || ! -f "$MANIFEST" || ! -f "$COMPONENTS_CONFIG" || ! -f "$CSS_FILE" ]]; then
  printf 'Frontend design system input is incomplete.\n' >&2
  exit 1
fi

node --input-type=module - "$MANIFEST" "$COMPONENTS_CONFIG" "$CSS_FILE" <<'NODE'
import { readFile } from 'node:fs/promises';

const [manifestPath, componentsPath, cssPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const components = JSON.parse(await readFile(componentsPath, 'utf8'));
const css = await readFile(cssPath, 'utf8');
const dependencies = {
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.optionalDependencies,
};
const radixDependencies = Object.keys(dependencies).filter(
  (name) => name === 'radix-ui' || name.startsWith('@radix-ui/'),
);

if (radixDependencies.length > 0) {
  console.error(`Radix UI dependencies are forbidden: ${radixDependencies.join(', ')}`);
  process.exit(1);
}

if (
  components.style !== 'base-nova' ||
  components.tsx !== true ||
  components.tailwind?.cssVariables !== true ||
  components.tailwind?.css !== 'src/App.css'
) {
  console.error(
    'components.json must use shadcn base-nova, TypeScript, CSS variables and src/App.css.',
  );
  process.exit(1);
}

const requiredTokens = [
  'brand-primary',
  'brand-secondary',
  'brand-accent',
  'destructive',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
];
const missingTokens = requiredTokens.filter(
  (token) =>
    !css.includes(`--${token}:`) || !css.includes(`--color-${token}: var(--${token})`),
);

if (missingTokens.length > 0) {
  console.error(`Missing semantic CSS tokens or Tailwind mappings: ${missingTokens.join(', ')}`);
  process.exit(1);
}
NODE

if rg -n \
  "['\"](?:@radix-ui/|radix-ui(?:/|['\"]))|--radix-" \
  "$SOURCE_DIR" --glob '*.{ts,tsx,css}'; then
  printf 'Radix UI imports and CSS variables are forbidden in the frontend.\n' >&2
  exit 1
fi

while IFS= read -r base_ui_file; do
  if [[ "$base_ui_file" != "$UI_DIR/"* ]]; then
    printf 'Base UI may be imported only by local wrappers in frontend/src/components/ui: %s\n' \
      "$base_ui_file" >&2
    exit 1
  fi
done < <(rg -l "['\"]@base-ui/react(?:/[^'\"]*)?['\"]" "$SOURCE_DIR" --glob '*.{ts,tsx}' || true)

if rg -n \
  '(?:text|bg|border|ring)-(?:red|green|amber)-[0-9]{2,3}' \
  "$SOURCE_DIR" --glob '*.{ts,tsx}'; then
  printf 'Use semantic destructive, success or warning utilities for status colors.\n' >&2
  exit 1
fi

printf 'Frontend design system policy passed.\n'
