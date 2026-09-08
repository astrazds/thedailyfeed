#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

read_package_version() {
  if command -v node >/dev/null 2>&1; then
    node -p "require('./package.json').version"
    return
  fi

  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1
}

APP_VERSION="${APP_VERSION:-$(read_package_version)}"
APP_COMMIT="${APP_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"

export APP_VERSION
export APP_COMMIT

[ "$#" -gt 0 ] || set -- thedailyfeed

echo "Deploying The Daily Feed version ${APP_VERSION} (${APP_COMMIT})"

if [ -f "$ENV_FILE" ]; then
  docker compose --project-directory "$PWD" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build --no-deps "$@"
else
  docker compose --project-directory "$PWD" -f "$COMPOSE_FILE" up -d --build --no-deps "$@"
fi
