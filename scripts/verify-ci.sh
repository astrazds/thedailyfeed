#!/usr/bin/env sh
set -eu

EXPECTED_NODE_MAJOR=24
EXPECTED_PNPM_VERSION=10.33.4
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

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

pnpm version:check

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

compose_config() {
  if [ -f "$ENV_FILE" ]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config "$@"
  else
    docker compose -f "$COMPOSE_FILE" config "$@"
  fi
}

compose_config --quiet
compose_config --format json | node -e '
  const fs = require("node:fs");
  const compose = JSON.parse(fs.readFileSync(0, "utf8"));
  const environment = compose.services?.thedailyfeed?.environment;
  if (!environment || environment.APP_VERSION !== process.env.APP_VERSION) {
    throw new Error("Compose APP_VERSION metadata mismatch");
  }
  if (environment.APP_COMMIT !== process.env.APP_COMMIT) {
    throw new Error("Compose APP_COMMIT metadata mismatch");
  }
'

pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build

: "${BUILDKIT_HOST:?BUILDKIT_HOST is required}"
buildctl --addr "$BUILDKIT_HOST" debug workers >/dev/null

artifact_dir="${CI_ARTIFACT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
mkdir -p "$artifact_dir"
artifact="$(mktemp "$artifact_dir/thedailyfeed-${APP_COMMIT}.oci.XXXXXX")"
cleanup() {
  rm -f "$artifact"
}
trap cleanup EXIT HUP INT TERM

buildctl --addr "$BUILDKIT_HOST" build \
  --frontend dockerfile.v0 \
  --local context=. \
  --local dockerfile=. \
  --opt filename=Dockerfile \
  --output "type=oci,dest=$artifact,name=thedailyfeed:$APP_COMMIT"

[ -s "$artifact" ] || fail "BuildKit did not produce an OCI artifact"
rm -f "$artifact"
trap - EXIT HUP INT TERM
printf 'verification status=success\n'
