#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS_DIR="${DEV_CERTS_DIR:-$ROOT_DIR/.certs}"
SERVICE_DIR="$CERTS_DIR/service"
DATABASE_DIR="$CERTS_DIR/database"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zglosto-certificates.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_DIR"
}

trap cleanup EXIT
umask 077

command -v openssl >/dev/null 2>&1 || {
  printf 'ERROR: OpenSSL is required to generate development certificates.\n' >&2
  exit 1
}

rm -rf "$SERVICE_DIR" "$DATABASE_DIR"
mkdir -p "$SERVICE_DIR" "$DATABASE_DIR"

create_ca() {
  local output_dir="$1"
  local common_name="$2"

  openssl genpkey \
    -algorithm EC \
    -pkeyopt ec_paramgen_curve:P-256 \
    -out "$output_dir/ca.key"
  openssl req \
    -new \
    -x509 \
    -sha256 \
    -days 30 \
    -key "$output_dir/ca.key" \
    -out "$output_dir/ca.crt" \
    -subj "/CN=$common_name" \
    -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
    -addext 'keyUsage=critical,keyCertSign,cRLSign' \
    -addext 'subjectKeyIdentifier=hash'
}

issue_certificate() {
  local ca_dir="$1"
  local name="$2"
  local common_name="$3"
  local extended_key_usage="$4"
  local subject_alternative_name="$5"
  local not_before="${6:-}"
  local not_after="${7:-}"
  local extension_file="$TEMP_DIR/$name.ext"
  local validity_arguments=(-days 7)

  if [ -n "$not_before" ] || [ -n "$not_after" ]; then
    [ -n "$not_before" ] && [ -n "$not_after" ] || {
      printf 'ERROR: Both notBefore and notAfter are required for explicit validity.\n' >&2
      exit 1
    }
    validity_arguments=(-not_before "$not_before" -not_after "$not_after")
  fi

  openssl genpkey \
    -algorithm EC \
    -pkeyopt ec_paramgen_curve:P-256 \
    -out "$ca_dir/$name.key"
  openssl req \
    -new \
    -sha256 \
    -key "$ca_dir/$name.key" \
    -out "$TEMP_DIR/$name.csr" \
    -subj "/CN=$common_name"

  printf '%s\n' \
    'basicConstraints=critical,CA:FALSE' \
    'keyUsage=critical,digitalSignature' \
    "extendedKeyUsage=$extended_key_usage" \
    "subjectAltName=$subject_alternative_name" \
    'subjectKeyIdentifier=hash' \
    'authorityKeyIdentifier=keyid,issuer' > "$extension_file"

  openssl x509 \
    -req \
    -sha256 \
    "${validity_arguments[@]}" \
    -in "$TEMP_DIR/$name.csr" \
    -CA "$ca_dir/ca.crt" \
    -CAkey "$ca_dir/ca.key" \
    -CAcreateserial \
    -out "$ca_dir/$name.crt" \
    -extfile "$extension_file"
}

create_ca "$SERVICE_DIR" 'ZglosTO Development Service CA'
issue_certificate \
  "$SERVICE_DIR" \
  'authorization-server' \
  'authorization-server' \
  'serverAuth' \
  'DNS:authorization,DNS:localhost,IP:127.0.0.1'
issue_certificate \
  "$SERVICE_DIR" \
  'llm-gateway-server' \
  'llm-gateway-server' \
  'serverAuth' \
  'DNS:llm_gateway,DNS:llm-gateway,DNS:llm-gateway.zglosto.svc,DNS:llm-gateway.zglosto.svc.cluster.local,DNS:localhost,IP:127.0.0.1'
issue_certificate \
  "$SERVICE_DIR" \
  'rabbitmq-server' \
  'rabbitmq-server' \
  'serverAuth' \
  'DNS:rabbitmq,DNS:localhost,IP:127.0.0.1'
issue_certificate \
  "$SERVICE_DIR" \
  'backend-client' \
  'backend-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/backend'
issue_certificate \
  "$SERVICE_DIR" \
  'nginx-client' \
  'nginx-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/nginx'
issue_certificate \
  "$SERVICE_DIR" \
  'authorization-healthcheck-client' \
  'authorization-healthcheck-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/authorization-healthcheck'
issue_certificate \
  "$SERVICE_DIR" \
  'llm-gateway-healthcheck-client' \
  'llm-gateway-healthcheck-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/llm-gateway-healthcheck'
issue_certificate \
  "$SERVICE_DIR" \
  'keda-http-interceptor' \
  'keda-http-interceptor' \
  'serverAuth,clientAuth' \
  'DNS:llm-gateway-proxy,DNS:llm-gateway-proxy.zglosto,DNS:llm-gateway-proxy.zglosto.svc,DNS:llm-gateway-proxy.zglosto.svc.cluster.local,DNS:keda-add-ons-http-interceptor-proxy,DNS:keda-add-ons-http-interceptor-proxy.keda.svc,DNS:keda-add-ons-http-interceptor-proxy.keda.svc.cluster.local,URI:spiffe://zglosto.local/workload/keda-http-interceptor'
issue_certificate \
  "$SERVICE_DIR" \
  'unauthorized-client' \
  'unauthorized-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/unauthorized'
issue_certificate \
  "$SERVICE_DIR" \
  'expired-backend-client' \
  'expired-backend-client' \
  'clientAuth' \
  'URI:spiffe://zglosto.local/workload/backend' \
  '20200101000000Z' \
  '20200102000000Z'

create_ca "$DATABASE_DIR" 'ZglosTO Development Database CA'
issue_certificate \
  "$DATABASE_DIR" \
  'postgres-server' \
  'postgres-server' \
  'serverAuth' \
  'DNS:database,DNS:localhost,IP:127.0.0.1'
issue_certificate \
  "$DATABASE_DIR" \
  'pgbouncer-server' \
  'pgbouncer-server' \
  'serverAuth' \
  'DNS:pgbouncer,DNS:localhost,IP:127.0.0.1'

find "$CERTS_DIR" -type d -exec chmod 700 {} +
find "$CERTS_DIR" -type f -name '*.key' -exec chmod 600 {} +
find "$CERTS_DIR" -type f -name '*.crt' -exec chmod 644 {} +
find "$CERTS_DIR" -type f -name '*.srl' -delete
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' > "$SERVICE_DIR/llm-hmac-key"
chmod 600 "$SERVICE_DIR/llm-hmac-key"

openssl verify \
  -purpose sslserver \
  -CAfile "$SERVICE_DIR/ca.crt" \
  "$SERVICE_DIR/authorization-server.crt" \
  "$SERVICE_DIR/llm-gateway-server.crt" \
  "$SERVICE_DIR/rabbitmq-server.crt" >/dev/null
openssl verify \
  -purpose sslclient \
  -CAfile "$SERVICE_DIR/ca.crt" \
  "$SERVICE_DIR/backend-client.crt" \
  "$SERVICE_DIR/nginx-client.crt" \
  "$SERVICE_DIR/authorization-healthcheck-client.crt" \
  "$SERVICE_DIR/llm-gateway-healthcheck-client.crt" \
  "$SERVICE_DIR/keda-http-interceptor.crt" >/dev/null
if openssl verify \
  -purpose sslclient \
  -CAfile "$SERVICE_DIR/ca.crt" \
  "$SERVICE_DIR/expired-backend-client.crt" >/dev/null 2>&1; then
  printf 'ERROR: Expired client certificate unexpectedly validates at the current time.\n' >&2
  exit 1
fi
openssl verify \
  -purpose sslserver \
  -CAfile "$DATABASE_DIR/ca.crt" \
  "$DATABASE_DIR/postgres-server.crt" \
  "$DATABASE_DIR/pgbouncer-server.crt" >/dev/null

if openssl verify \
  -CAfile "$DATABASE_DIR/ca.crt" \
  "$SERVICE_DIR/authorization-server.crt" >/dev/null 2>&1; then
  printf 'ERROR: Service certificate unexpectedly validates against Database CA.\n' >&2
  exit 1
fi

printf 'Development certificates generated in %s\n' "$CERTS_DIR"
printf 'Service and Database CAs are separate and valid for local development only.\n'
