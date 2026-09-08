#!/usr/bin/env sh
set -eu

EXPECTED_NODE_MAJOR=24
EXPECTED_PNPM_VERSION=11.24.0

fail() {
  printf 'verification failed: %s\n' "$1" >&2
  exit 1
}

node_version="$(node --version)"
case "$node_version" in
  v${EXPECTED_NODE_MAJOR}.*) ;;
  *) fail "Node ${EXPECTED_NODE_MAJOR} is required" ;;
esac

pnpm_version="$(pnpm --version)"
[ "$pnpm_version" = "$EXPECTED_PNPM_VERSION" ] || fail "pnpm ${EXPECTED_PNPM_VERSION} is required"

APP_VERSION="$(node -p "require('./package.json').version")"
APP_COMMIT="$(git rev-parse --verify 'HEAD^{commit}')"
case "$APP_COMMIT" in
  ''|*[!0-9a-f]*) fail "the current commit is not a full 40-character SHA" ;;
esac
[ "${#APP_COMMIT}" -eq 40 ] || fail "the current commit is not a full 40-character SHA"

if [ -n "${GITHUB_SHA:-}" ]; then
  [ "$APP_COMMIT" = "$GITHUB_SHA" ] || fail "the checked-out commit does not match GITHUB_SHA"
fi

export APP_VERSION APP_COMMIT
printf 'metadata version=%s commit=%s\n' "$APP_VERSION" "$APP_COMMIT"

docker compose --env-file /dev/null -f compose.yml config --quiet

pnpm install --frozen-lockfile
pnpm version:check
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build

if [ "${GITHUB_ACTIONS:-false}" = true ]; then
  pnpm exec playwright install --with-deps chromium
else
  pnpm exec playwright install chromium
fi
pnpm test:browser

# The default Docker driver builds into its local image store without a registry push.
image_ref="thedailyfeed-ci:$APP_COMMIT"
docker build --tag "$image_ref" .
docker image inspect "$image_ref" >/dev/null
printf 'verification status=success\n'
