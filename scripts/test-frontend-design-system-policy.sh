#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="$ROOT_DIR/scripts/check-frontend-design-system.sh"
FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zglosto-frontend-design-system.XXXXXX")"
FRONTEND_DIR="$FIXTURE_DIR/frontend"

cleanup() {
  rm -rf "$FIXTURE_DIR"
}
trap cleanup EXIT

mkdir -p "$FRONTEND_DIR/src/components/ui" "$FRONTEND_DIR/src/components"

write_valid_manifest() {
  printf '%s\n' \
    '{"name":"fixture","private":true,"dependencies":{"@base-ui/react":"1.6.0","react":"19.2.7"}}' \
    >"$FRONTEND_DIR/package.json"
}

write_valid_components() {
  printf '%s\n' \
    '{"style":"base-nova","rsc":false,"tsx":true,"tailwind":{"css":"src/App.css","cssVariables":true}}' \
    >"$FRONTEND_DIR/components.json"
}

write_valid_css() {
  printf '%s\n' \
    ':root {' \
    '  --brand-primary: #0057b8;' \
    '  --brand-secondary: #ffffff;' \
    '  --brand-accent: #f5a623;' \
    '  --destructive: #d4183d;' \
    '  --success: green;' \
    '  --success-foreground: white;' \
    '  --warning: orange;' \
    '  --warning-foreground: black;' \
    '}' \
    '@theme inline {' \
    '  --color-brand-primary: var(--brand-primary);' \
    '  --color-brand-secondary: var(--brand-secondary);' \
    '  --color-brand-accent: var(--brand-accent);' \
    '  --color-destructive: var(--destructive);' \
    '  --color-success: var(--success);' \
    '  --color-success-foreground: var(--success-foreground);' \
    '  --color-warning: var(--warning);' \
    '  --color-warning-foreground: var(--warning-foreground);' \
    '}' \
    >"$FRONTEND_DIR/src/App.css"
}

write_valid_source() {
  printf '%s\n' \
    "export { Button } from '@base-ui/react/button';" \
    >"$FRONTEND_DIR/src/components/ui/button.tsx"
  printf '%s\n' \
    "import { Button } from './ui/button';" \
    "export const SaveButton = () => <Button className=\"bg-success\">Save</Button>;" \
    >"$FRONTEND_DIR/src/components/save-button.tsx"
}

reset_fixture() {
  write_valid_manifest
  write_valid_components
  write_valid_css
  write_valid_source
}

run_policy() {
  FRONTEND_DESIGN_DIR="$FRONTEND_DIR" "$POLICY"
}

expect_rejection() {
  local label="$1"
  if run_policy >/dev/null 2>&1; then
    printf 'Frontend design system policy accepted forbidden fixture: %s\n' "$label" >&2
    exit 1
  fi
}

reset_fixture
run_policy >/dev/null

printf '%s\n' \
  '{"name":"fixture","private":true,"dependencies":{"@radix-ui/react-dialog":"1.0.0"}}' \
  >"$FRONTEND_DIR/package.json"
expect_rejection 'Radix dependency'

reset_fixture
printf '%s\n' \
  "import { Dialog } from '@base-ui/react/dialog';" \
  "export const Feature = () => <Dialog.Root />;" \
  >"$FRONTEND_DIR/src/components/feature.tsx"
expect_rejection 'direct Base UI import outside wrappers'

reset_fixture
printf '%s\n' '.legacy { width: var(--radix-popover-trigger-width); }' \
  >>"$FRONTEND_DIR/src/App.css"
expect_rejection 'Radix CSS variable'

reset_fixture
printf '%s\n' \
  "export const ErrorMessage = () => <p className=\"text-red-600\">Error</p>;" \
  >"$FRONTEND_DIR/src/components/error-message.tsx"
expect_rejection 'raw status color'

reset_fixture
printf '%s\n' \
  '{"style":"new-york","rsc":false,"tsx":true,"tailwind":{"css":"src/App.css","cssVariables":true}}' \
  >"$FRONTEND_DIR/components.json"
expect_rejection 'non-Base shadcn configuration'

printf 'Frontend design system policy fixtures passed.\n'
