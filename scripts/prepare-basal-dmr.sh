#!/bin/sh
# Rebuild the benchmarked Basal 2.0 4.5B Q4_K_M, then package it locally for DMR.
# Requires curl, tar, Python with torch/transformers/numpy/safetensors/sentencepiece,
# and Docker Model Runner. Tested Python packages: torch 2.12, transformers 5.10.1.
# Allow about 30 GB of temporary disk space. No dependencies are installed here.
set -eu

if [ "${1:-}" = '--help' ]; then
  cat <<'HELP'
Usage: scripts/prepare-basal-dmr.sh
Downloads pinned BF16 weights and tools, converts F16 -> Q4_K_M, repairs the
tokenizer, verifies the exact benchmarked SHA256, and packages the model locally.
Existing output is reused only when its SHA256 matches; mismatches are preserved.

Optional environment variables:
  BASAL_GGUF_PATH   Output/cache path (default .local-models/basal-2.0-4.5B-Q4_K_M.gguf)
  BASAL_MODEL_REF   Local DMR reference (default zglosto/basal-2.0-4.5b:q4_k_m)
  LLAMA_QUANTIZE   Path to llama-quantize built from llama.cpp b11312
  LLAMA_CPP_DIR    Complete llama.cpp b11312 source tree (otherwise downloaded)
  PYTHON           Python executable (default python3; existing dependencies required)

On macOS arm64 the verified b11312 binary archive is downloaded automatically
unless LLAMA_QUANTIZE is supplied. Other platforms require LLAMA_QUANTIZE.
The final SHA256 is enforced on every platform. This script does not push models.
HELP
  exit 0
fi
[ "$#" -eq 0 ] || { printf 'Unexpected arguments; use --help.\n' >&2; exit 1; }

die() { printf '%s\n' "$*" >&2; exit 1; }
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output=${BASAL_GGUF_PATH:-"$repo_dir/.local-models/basal-2.0-4.5B-Q4_K_M.gguf"}
case "$output" in /*) ;; *) output="$PWD/$output" ;; esac
model_ref=${BASAL_MODEL_REF:-zglosto/basal-2.0-4.5b:q4_k_m}
python=${PYTHON:-python3}
expected=b271979c29c71527f357b800fa82ec2e317ae8617f334fb4b96c86a03269465d
expected_bytes=2878886368
work_dir=
cache_part=
cleanup() {
  [ -z "$cache_part" ] || rm -f -- "$cache_part"
  [ -z "$work_dir" ] || rm -rf -- "$work_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}
verify() { [ "$(sha256 "$1")" = "$2" ]; }
download() { curl --fail --location --retry 3 --output "$2" "$1"; }

command -v docker >/dev/null 2>&1 || die 'Docker with Model Runner is required.'
command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 || die 'shasum or sha256sum is required.'

if [ -e "$output" ] || [ -L "$output" ]; then
  [ -f "$output" ] && verify "$output" "$expected" || die "Existing artifact has an unexpected SHA256; preserved: $output"
  printf 'Reusing verified artifact: %s\n' "$output"
else
  for tool in curl tar "$python"; do command -v "$tool" >/dev/null 2>&1 || die "Required tool is missing: $tool"; done
  "$python" -c 'import torch, transformers, numpy, safetensors, sentencepiece' || die 'Python conversion dependencies are missing; use an existing prepared Python environment.'
  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/zglosto-basal.XXXXXX")
  model_dir="$work_dir/basal-2.0-4.5B"
  mkdir -p "$model_dir" "$work_dir/basal"
  llama_source=${LLAMA_CPP_DIR:-}
  if [ -z "$llama_source" ]; then
    download 'https://github.com/ggml-org/llama.cpp/archive/refs/tags/b11312.tar.gz' "$work_dir/llama-source.tar.gz"
    verify "$work_dir/llama-source.tar.gz" cb7f04a72351fc7ee3b929a5c7a86daf2ff94411177d622b5833b493c2636a00 || die 'llama.cpp source archive SHA256 mismatch.'
    tar -xzf "$work_dir/llama-source.tar.gz" -C "$work_dir"
    llama_source="$work_dir/llama.cpp-b11312"
  fi
  [ -f "$llama_source/convert_hf_to_gguf.py" ] && [ -d "$llama_source/conversion" ] && [ -d "$llama_source/gguf-py" ] || die 'LLAMA_CPP_DIR must contain the complete b11312 source tree.'
  verify "$llama_source/convert_hf_to_gguf.py" e9a1da876330bbce9687541ab31736542a01b4ac43c6686126514a50f122fb7f || die 'The llama.cpp converter does not match b11312.'

  quantizer=${LLAMA_QUANTIZE:-}
  if [ -z "$quantizer" ]; then
    [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die 'Set LLAMA_QUANTIZE to a llama.cpp b11312 executable on this platform.'
    download 'https://github.com/ggml-org/llama.cpp/releases/download/b11312/llama-b11312-bin-macos-arm64.tar.gz' "$work_dir/llama.tar.gz"
    verify "$work_dir/llama.tar.gz" 3ceea603e48367ab694822f7304e6880817337f942f9672321411932c76c46f2 || die 'llama.cpp binary archive SHA256 mismatch.'
    tar -xzf "$work_dir/llama.tar.gz" -C "$work_dir"
    quantizer="$work_dir/llama-b11312/llama-quantize"
  fi
  [ -x "$quantizer" ] || die 'LLAMA_QUANTIZE must point to an executable built from b11312.'
  # llama-quantize has no version option. Check its sibling CLI when available;
  # the final artifact digest also rejects a different build's quantization.
  version_cli="$(dirname -- "$quantizer")/llama-cli"
  if [ -x "$version_cli" ]; then
    case "$("$version_cli" --version 2>&1)" in
      *'build 11312,'*) ;;
      *) die 'The supplied llama.cpp binaries do not report build 11312.' ;;
    esac
  fi

  source_url=https://huggingface.co/Remek/basal-2.0-4.5B/resolve/a21eae2ebf988274f2e6326925525012c3bd36d8
  for file in config.json tokenizer.json tokenizer_config.json generation_config.json chat_template.jinja basal.json model.safetensors; do
    download "$source_url/$file" "$model_dir/$file"
  done
  verify "$model_dir/model.safetensors" 481d8ea4972379a611f46784196e407bee239a37c3981c6e29ff1aaaeb0f19c2 || die 'BF16 source weights SHA256 mismatch.'
  while read -r checksum file; do
    verify "$model_dir/$file" "$checksum" || die "Source metadata SHA256 mismatch: $file"
  done <<'METADATA'
2ac96f2e6b9731382bee55320062498d06272542b7fd2faa4bef04065ba1e2c3 config.json
20f059c5ba108cc6e4d59df55be30e73c30b86ff7aab314362bfa4eff1e21657 tokenizer.json
b90dd402080d2558a60b82033d71e3c1ef750e0811709ae166c0f7d3fa0693cd tokenizer_config.json
76594a7e29cc06ab1f219d175a8ee72e6a470053040a5156fb22226c1c6cfe9c generation_config.json
a805e50fed68938a076b07e2e602639611b50b1ced0e50f11eb92f1ba25be4dc chat_template.jinja
7604559595d509bf29defa40e8394a0b611d05ce3cd0fca0938a3ee6627a1493 basal.json
METADATA
  for file in gguf_export.py textio.py; do
    download "https://raw.githubusercontent.com/rkinas/basal/v2.8.0/basal/$file" "$work_dir/basal/$file"
  done
  verify "$work_dir/basal/gguf_export.py" c14f233ef28d200544ef7a17a61432cc1741bc8b79d4b9b2d70f9cb503781d1a || die 'Basal exporter SHA256 mismatch.'
  verify "$work_dir/basal/textio.py" 262920aa80fa3bf943cfc5563decadd64bd672e598276d4825beadb523632a36 || die 'Basal textio SHA256 mismatch.'
  : > "$work_dir/basal/__init__.py"

  # Keep this exact source directory basename: it becomes GGUF model metadata.
  "$python" "$llama_source/convert_hf_to_gguf.py" "$model_dir" --outtype f16 --outfile "$work_dir/basal-2.0-4.5B-F16.gguf"
  "$quantizer" "$work_dir/basal-2.0-4.5B-F16.gguf" "$work_dir/basal-2.0-4.5B-Q4_K_M-stock.gguf" Q4_K_M
  PYTHONPATH="$work_dir:$llama_source/gguf-py" "$python" - "$work_dir" <<'PYTHON'
from pathlib import Path
import sys
from basal.gguf_export import fix_gguf
p = Path(sys.argv[1])
print('Tokenizer fix:', fix_gguf(
    p / 'basal-2.0-4.5B-Q4_K_M-stock.gguf',
    p / 'basal-2.0-4.5B-Q4_K_M.gguf',
    p / 'basal-2.0-4.5B'))
PYTHON
  artifact="$work_dir/basal-2.0-4.5B-Q4_K_M.gguf"
  verify "$artifact" "$expected" || die 'Converted GGUF SHA256 differs from the benchmarked artifact; nothing was packaged.'
  [ "$(wc -c < "$artifact" | tr -d ' ')" = "$expected_bytes" ] || die 'Converted GGUF size mismatch.'
  mkdir -p "$(dirname -- "$output")"
  cache_part=$(mktemp "$output.partial.XXXXXX")
  cp "$artifact" "$cache_part"
  verify "$cache_part" "$expected" || die 'Cached copy SHA256 mismatch.'
  # Create without replacing a file another process may have created meanwhile.
  ln "$cache_part" "$output" || die "Output already exists; preserved: $output"
  rm -f -- "$cache_part"
  cache_part=
fi

# Docker Model Runner stores this locally; no --push and no credentials are used.
docker model package --gguf "$output" --context-size 4096 "$model_ref"
printf 'Prepared %s from verified GGUF %s\n' "$model_ref" "$expected"
