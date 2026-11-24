#!/usr/bin/env bash

# The active integration model stub uses shared replay protection.
export REDIS_ACL_FILE="$ROOT_DIR/tests/fixtures/redis/users.acl"
export REDIS_URL_SECRET_FILE="$ROOT_DIR/tests/fixtures/redis/url"
export RATE_LIMIT_HMAC_KEY_SECRET_FILE="$ROOT_DIR/tests/fixtures/redis/rate-limit-hmac"
