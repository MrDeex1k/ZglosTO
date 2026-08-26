#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY_FILE="${ZTO_NFTABLES_POLICY_FILE:-$ROOT_DIR/deploy/compose/nftables.conf}"
ADMIN_SSH_IPV4_CIDR="${ADMIN_SSH_IPV4_CIDR:?ADMIN_SSH_IPV4_CIDR is required, for example 203.0.113.10/32}"
SSH_PORT="${SSH_PORT:-22}"
HTTPS_PORT="${HTTPS_PORT:-443}"

fail() {
  printf '[compose-firewall] ERROR: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail 'run this installer as root'
command -v nft >/dev/null 2>&1 || fail 'nftables is not installed'
[ -f "$POLICY_FILE" ] || fail "missing policy file: $POLICY_FILE"
[[ "$ADMIN_SSH_IPV4_CIDR" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/([0-9]|[12][0-9]|3[0-2])$ ]] ||
  fail 'ADMIN_SSH_IPV4_CIDR must be an IPv4 CIDR'
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'SSH_PORT must be a TCP port number'
[[ "$HTTPS_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'HTTPS_PORT must be a TCP port number'
((SSH_PORT >= 1 && SSH_PORT <= 65535)) || fail 'SSH_PORT is outside 1-65535'
((HTTPS_PORT >= 1 && HTTPS_PORT <= 65535)) || fail 'HTTPS_PORT is outside 1-65535'

if ! nft list table inet zglosto >/dev/null 2>&1; then
  nft add table inet zglosto
fi

nft --check \
  --define "admin_ssh_ipv4_cidr=$ADMIN_SSH_IPV4_CIDR" \
  --define "ssh_port=$SSH_PORT" \
  --define "https_port=$HTTPS_PORT" \
  --file "$POLICY_FILE"

nft \
  --define "admin_ssh_ipv4_cidr=$ADMIN_SSH_IPV4_CIDR" \
  --define "ssh_port=$SSH_PORT" \
  --define "https_port=$HTTPS_PORT" \
  --file "$POLICY_FILE"

printf '[compose-firewall] Applied HTTPS=%s and SSH=%s from %s\n' \
  "$HTTPS_PORT" "$SSH_PORT" "$ADMIN_SSH_IPV4_CIDR"
