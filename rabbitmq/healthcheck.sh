#!/bin/sh

set -eu

rabbitmq-diagnostics -q ping
timeout 5 openssl s_client \
  -connect 127.0.0.1:5671 \
  -servername rabbitmq \
  -CAfile /run/secrets/service/ca.crt \
  -verify_return_error </dev/null >/dev/null 2>&1
