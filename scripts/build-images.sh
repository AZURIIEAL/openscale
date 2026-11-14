#!/usr/bin/env bash
# Builds OpenScale's own images using the host's network instead of
# Docker's build network, tagged with the names docker compose expects --
# then `docker compose up -d` (without --build) picks them up.
#
# Only needed when `docker compose up --build` fails to reach the internet
# during a build (pip/npm/go timeouts, DNS errors) -- typically an MTU or
# IPv6 mismatch between Docker's bridge network and the host's uplink.
# Compose can't do this itself: it builds through Buildx Bake, which
# refuses `network: host` without an --allow flag compose has no way to pass.
#
# Usage: scripts/build-images.sh [service...]   (default: all but gateway,
#        which only deployments use -- build it with `gateway`)
set -euo pipefail

cd "$(dirname "$0")/.."

# worker and query-engine build from the repo root (-f <Dockerfile>) so the
# shared libs/openscale package is inside their build context.
declare -A CONTEXT=(
  [control-plane]=./control-plane
  [frontend]=./frontend
  [worker]=.
  [query-engine]=.
  [jupyter]=./jupyter
  [gateway]=./frontend
)
declare -A DOCKERFILE=(
  [worker]=worker/Dockerfile
  [query-engine]=query-engine/Dockerfile
  [gateway]=gateway/Dockerfile
)
# The gateway (docker-compose.deploy.yml) builds the frontend as its context
# and pulls its Caddy config from a second, named context.
declare -A EXTRA=(
  [gateway]="--build-context gateway=./gateway"
)

services=("$@")
if [ ${#services[@]} -eq 0 ]; then
  services=(control-plane frontend worker query-engine jupyter)
fi

for svc in "${services[@]}"; do
  if [ "$svc" = mlflow ]; then svc=worker; fi
  ctx=${CONTEXT[$svc]:-}
  if [ -z "$ctx" ]; then
    echo "unknown service: $svc (expected: ${!CONTEXT[*]} mlflow)" >&2
    exit 1
  fi
  df=${DOCKERFILE[$svc]:-}
  echo "==> building openscale-$svc from $ctx${df:+ ($df)}"
  # shellcheck disable=SC2086 # EXTRA holds whole flags
  docker build --network host -t "openscale-$svc" ${df:+-f "$df"} ${EXTRA[$svc]:-} "$ctx"
  # mlflow runs the worker image with a different entrypoint.
  if [ "$svc" = worker ]; then
    docker tag openscale-worker openscale-mlflow
  fi
done

echo "Done. Start or refresh the stack with: docker compose up -d"
