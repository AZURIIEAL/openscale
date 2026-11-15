#!/bin/sh
# Hashes OPENSCALE_PASSWORD for the Caddyfile's basic_auth, then starts
# Caddy. Refuses to start without a password: the gateway is what makes
# OpenScale reachable from the internet.
set -eu

if [ -z "${OPENSCALE_PASSWORD:-}" ]; then
  echo "gateway: set OPENSCALE_PASSWORD (in .env next to docker-compose.yml) before deploying" >&2
  exit 1
fi

OPENSCALE_PASSWORD_HASH=$(caddy hash-password --plaintext "$OPENSCALE_PASSWORD")
export OPENSCALE_PASSWORD_HASH
unset OPENSCALE_PASSWORD

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
