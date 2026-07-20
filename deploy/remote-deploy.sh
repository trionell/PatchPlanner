#!/usr/bin/env bash
# Deploys a newly-built PatchPlanner binary already staged on this VPS.
# Invoked over SSH by .github/workflows/deploy.yml — see
# specs/019-cicd-vps-deploy/contracts/remote-deploy-script.md for the full
# contract (invocation, behavior, exit codes, privilege scope).
#
# Usage: remote-deploy.sh <staging-dir>
set -euo pipefail

STAGING_DIR="${1:-}"
if [ -z "$STAGING_DIR" ] || [ ! -d "$STAGING_DIR" ]; then
  echo "usage: remote-deploy.sh <staging-dir>" >&2
  echo "error: staging directory '$STAGING_DIR' does not exist" >&2
  exit 1
fi

APP_DIR="/opt/patchplanner"
BINARY="$APP_DIR/patchplanner"
PREV_BINARY="$APP_DIR/patchplanner.prev"
MIGRATIONS_DIR="$APP_DIR/migrations"
ENV_FILE="$APP_DIR/patchplanner.env"
SERVICE="patchplanner"
HEALTH_RETRIES=10
HEALTH_DELAY_SECONDS=1

STAGED_BINARY="$STAGING_DIR/patchplanner"
STAGED_MIGRATIONS="$STAGING_DIR/migrations"

if [ ! -f "$STAGED_BINARY" ]; then
  echo "error: '$STAGED_BINARY' does not exist" >&2
  exit 1
fi
if [ ! -d "$STAGED_MIGRATIONS" ]; then
  echo "error: '$STAGED_MIGRATIONS' does not exist" >&2
  exit 1
fi
chmod +x "$STAGED_BINARY"

# The service's own env file is the source of truth for which port to
# health-check — falls back to this project's documented default port if
# the file or the variable is missing.
port=7331
if [ -f "$ENV_FILE" ]; then
  addr=$(grep -E '^PATCHPLANNER_ADDR=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)
  if [ -n "$addr" ]; then
    port="${addr##*:}"
  fi
fi

health_check() {
  curl -sf -o /dev/null "http://127.0.0.1:${port}/health"
}

restart_and_wait_healthy() {
  sudo -n systemctl restart "$SERVICE"
  local attempt=1
  while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
    if health_check; then
      return 0
    fi
    sleep "$HEALTH_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done
  return 1
}

echo "backing up current binary to $PREV_BINARY"
if [ -f "$BINARY" ]; then
  cp "$BINARY" "$PREV_BINARY"
fi

echo "swapping in new binary (atomic move within $APP_DIR)"
mv "$STAGED_BINARY" "$BINARY"
rm -rf "$MIGRATIONS_DIR"
mv "$STAGED_MIGRATIONS" "$MIGRATIONS_DIR"

echo "restarting $SERVICE and waiting for a healthy response on port $port"
if restart_and_wait_healthy; then
  echo "deploy succeeded"
  rm -rf "$STAGING_DIR"
  exit 0
fi

echo "new version never became healthy — restoring previous binary" >&2
if [ -f "$PREV_BINARY" ]; then
  mv "$PREV_BINARY" "$BINARY"
  sudo -n systemctl restart "$SERVICE"
fi
exit 1
