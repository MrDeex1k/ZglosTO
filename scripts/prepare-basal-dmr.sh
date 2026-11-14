#!/bin/sh
# Download the official, revision-pinned Basal 2.0 Mini Q5_K_M and package for DMR.
set -eu

if [ "${1:-}" = '--help' ]; then
  cat <<'HELP'
Usage: scripts/prepare-basal-dmr.sh
Downloads the official Mini Q5_K_M GGUF, verifies SHA256 and size, then packages
it locally for Docker Model Runner. No conversion or Python dependencies.
Existing output is reused only when verified; mismatches are preserved.

Optional environment variables:
  BASAL_GGUF_PATH   Cache path (default .local-models/basal-2.0-mini-Q5_K_M.gguf)
  BASAL_MODEL_REF   Local reference (default zglosto/basal-2.0-mini:q5_k_m)
Requires Docker Model Runner, curl and shasum or sha256sum. No model is pushed.
Allow about 2.4 GB for the downloaded file and its copy in the DMR store.
HELP
  exit 0
fi
[ "$#" -eq 0 ] || { printf 'Unexpected arguments; use --help.\n' >&2; exit 1; }

die() { printf '%s\n' "$*" >&2; exit 1; }
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output=${BASAL_GGUF_PATH:-"$repo_dir/.local-models/basal-2.0-mini-Q5_K_M.gguf"}
case "$output" in /*) ;; *) output="$PWD/$output" ;; esac
model_ref=${BASAL_MODEL_REF:-zglosto/basal-2.0-mini:q5_k_m}
expected=9865d535e7497f5195a17292808d50969757ab390a5e8fbda5e9c17a3361f0b5
expected_bytes=1168136320
source_url=https://huggingface.co/Remek/basal-2.0-mini-GGUF/resolve/9926cd8a62e7e65cba57aaab51d56c18b38f0a6b/basal-2.0-mini-Q5_K_M.gguf
cache_part=
cleanup() { [ -z "$cache_part" ] || rm -f -- "$cache_part"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}
verify() {
  [ "$(sha256 "$1")" = "$expected" ] &&
    [ "$(wc -c < "$1" | tr -d ' ')" = "$expected_bytes" ]
}
command -v docker >/dev/null 2>&1 || die 'Docker with Model Runner is required.'
command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 || die 'shasum or sha256sum is required.'
if [ -e "$output" ] || [ -L "$output" ]; then
  [ -f "$output" ] && verify "$output" || die "Existing artifact has unexpected SHA256 or size; preserved: $output"
  printf 'Reusing verified artifact: %s\n' "$output"
else
  command -v curl >/dev/null 2>&1 || die 'curl is required.'
  mkdir -p "$(dirname -- "$output")"
  cache_part=$(mktemp "$output.partial.XXXXXX")
  curl --fail --location --retry 3 --output "$cache_part" "$source_url"
  verify "$cache_part" || die 'Official GGUF SHA256 or size mismatch; nothing was packaged.'
  # Publish atomically without replacing a concurrently created artifact.
  ln "$cache_part" "$output" || die "Output already exists; preserved: $output"
  rm -f -- "$cache_part"
  cache_part=
fi

docker model package --gguf "$output" --context-size 4096 "$model_ref"
printf 'Prepared %s from official GGUF %s\n' "$model_ref" "$expected"
