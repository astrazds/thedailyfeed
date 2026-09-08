# Deployment

This guide covers running The Daily Feed 1.1.12 in production with source-built containers and a trusted HTTPS reverse proxy.

## Portable Compose hosting

Install Docker, Compose v2 and Buildx on a Linux host. Clone the repository,
copy `env.template` to `.env.production`, and restrict that file to mode 600.
The template contains no credentials or release overrides.

```bash
./scripts/deploy-compose.sh
```

The wrapper derives `APP_VERSION` from `package.json` and `APP_COMMIT` from Git,
then builds and starts only `thedailyfeed`. Source archives without Git report
`unknown` for the commit. Compose binds `127.0.0.1:${APP_PORT:-3000}:3000` and
creates a private project network. It has no public host port, fixed container
name, external network dependency, proxy labels, or host timezone mounts.

The image runs as `nextjs` with a read-only root filesystem, dropped
capabilities, no-new-privileges, CPU/memory/PID limits, tmpfs scratch and cache,
bounded JSON logs, and an HTTP health check. Preserve these controls.
`TZ` selects the container timezone; the browser timezone selects today's items.

Configure DNS and provision an HTTPS certificate for your hostname using your
chosen ACME client. Install [deploy/nginx.conf](deploy/nginx.conf) inside a
host-installed Nginx `http {}` context, replace the example hostname and
certificate paths, and adjust its loopback upstream if `APP_PORT` differs.
Validate with `nginx -t` before your approved reload. Certificate issuance,
renewal and proxy lifecycle belong to the host administrator.

The example redirects HTTP to HTTPS, allows TLS 1.2/1.3, limits request bodies
to 1 MiB and request rate to 1/second with a burst of 120, and uses 45-second
upstream timeouts for the default 30-second application budget. It overwrites
forwarded client headers, logs paths without query strings, disables response
buffering/cache, and hides metrics at ingress. Request buffering remains enabled
to enforce bounded incoming bodies. Nginx's response buffering controls are
documented [upstream](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).
If application budgets change, review proxy timeouts too. Restrict access to
proxy error logs, which can include request details, and configure log rotation.

## Runtime defaults

| Variable | Default | Meaning |
| --- | --- | --- |
| `APP_PORT` | `3000` | Loopback host port; container port stays 3000. |
| `APP_VERSION` | `1.1.12` | Build/runtime metadata in logs. |
| `APP_COMMIT` | `unknown` | Set by the deployment wrapper from Git. |
| `TZ` | `UTC` | Container timezone. |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `json` | Operational logging. |
| `FEED_TIMEOUT_MS` | `10000` | One attempt across DNS, redirects and streaming. |
| `FEED_RETRY_COUNT` | `3` | Bounded retries for transient feed failures. |
| `FEED_OVERALL_TIMEOUT_MS` | `30000` | One feed/validation operation, including retries. |
| `FEED_REQUEST_TIMEOUT_MS` | `30000` | Missing-feed work across a feed-set request. |
| `FEED_CACHE_TTL_MS` | `3600000` | Process-local cache TTL. |
| `FEED_CACHE_MAX_ENTRIES` | `200` | Process-local cache entry limit. |
| `ALLOW_PRIVATE_NETWORKS` | `false` | Production SSRF escape hatch; keep disabled. |
| `METRICS_AUTH_TOKEN` | unset | Production metrics return 404 unless configured. |

Do not put release overrides in a copied environment file. If metrics are
needed, create a private token separately, configure it without printing it,
and send it only in an `Authorization: Bearer` header from trusted tooling.
Never use query-string tokens. Keep the ingress restriction as defense in depth.
Local/development `RATE_LIMIT_*` settings do not replace production ingress limits.

## GitHub CI

[CI](.github/workflows/ci.yml) is the only GitHub workflow. It uses GitHub-hosted
Ubuntu runners, reviewed action commit SHAs, read-only repository permissions,
and checkout credential persistence disabled. It receives no production
credentials and never deploys. `scripts/verify-ci.sh` performs frozen installation,
version validation, lint, TypeScript, unit tests, Next/PWA build, synthetic
Chromium smoke tests, and one unpublished Docker build. No registry publishing
is configured.

## Workstation SSH deployment

Deploy from the operator's workstation through an existing SSH connection with
an independently trusted host key. Keep strict host-key checking enabled; never
use live `ssh-keyscan` as a trust source. If SSH cannot connect, stop. Changing
ports, firewalls, runners or VPNs requires separate approval.

Finish and review source changes locally, run the applicable repository gate,
and obtain action-time approval before committing or pushing. The complete
`scripts/verify-ci.sh` gate needs Node 24, pinned pnpm, dependency/browser
installation and an unpublished container build; approve those effects before
running it. Require a successful **CI** run for the exact reviewed 40-character
SHA on `main`, and verify that SHA is still GitHub's current `main` tip. A green
run for another SHA is insufficient. Keep the existing release for the deployment
mechanism retirement; application code and release metadata are unchanged.

Before any production action, review its exact scope and get approval. Record
privately the target host, checkout, administrator-owned Compose file, environment
file, project/container identity, prior image ID, expected runtime settings and
approved SHA. Use one operator/session at a time; prevent overlapping activation
and retired deployment jobs through the maintenance arrangement. Prepare all
commands and acceptance comparisons before stopping the application.

For routine updates, require a clean tracked/untracked checkout, expected GitHub
origin, and `main` branch. Fetch main and fast-forward only to the approved SHA;
stop on local changes, divergence, or a changed main tip. Preserve ignored files.
Use the fresh-install procedure below only when checkout replacement is approved.

Run the wrapper from the target checkout over workstation SSH. Set
`production_compose` to the existing administrator-owned absolute Compose path
outside the checkout. Use that file alone, preserving its topology; do not merge
the portable loopback Compose default into an existing proxy-managed deployment.
The production environment file must already exist with mode 600. Clear inherited
release overrides so the wrapper derives metadata from the reviewed source:

```bash
set -eu
: "${production_compose:?Set the reviewed absolute production Compose path}"
case "$production_compose" in /*) ;; *) exit 1 ;; esac
test -f "$production_compose"
test -f .env.production
test "$(stat -c %a .env.production)" = 600
unset APP_VERSION APP_COMMIT
COMPOSE_PROJECT_NAME=thedailyfeed \
COMPOSE_FILE="$production_compose" \
ENV_FILE="$PWD/.env.production" \
  ./scripts/deploy-compose.sh --wait --wait-timeout 180 thedailyfeed
```

The explicit project name is passed through Compose's environment. The wrapper
uses the checkout as the project directory, builds source and starts only the
named service with `--no-deps`. Wait options are forwarded to Compose. The wrapper
does not verify GitHub CI, preserve images, serialize operators, or compare
runtime invariants; those are operator steps in this runbook.

## Fresh-install preparation and acceptance

This procedure deliberately introduces application downtime. Browser-local
subscriptions and same-day snapshots remain in the browser; no server-side
subscription migration is needed. Do not open the reader or request external
feeds as part of acceptance.

### Prepare before the maintenance window

1. Complete local verification and approved publication, then record the exact
   successful CI run and current main SHA. Confirm the release matches this guide's
   version header and `package.json`. Do not start
   downtime with publication, verification, or installation steps unresolved.
2. With production-inspection approval, inspect the target through its own host.
   Confirm the checkout is `/home/astrazds/docker/thedailyfeed`, is a real directory
   rather than a symlink, and has no nested mounts. Confirm clean tracked state
   and account for every untracked and ignored file before deletion. The planning
   snapshot counted **60 ignored files**, including environment files and local
   tooling; recount at action time instead of treating 60 as current evidence.
   Do not print filenames that contain sensitive data or file contents.
3. Record the administrator-owned production Compose path outside the checkout
   and its protected ownership/mode. Preserve project `thedailyfeed`, the existing
   container name, sole external network `traefik_proxy`, no host ports and
   existing Traefik ingress labels/TLS ownership. Compare effective configuration
   privately; use `docker compose config --quiet` for syntax validation and a
   filtered comparison for invariants. Never print the full resolved Compose
   configuration or container environment.
4. Obtain approval for protected copies and image preservation. Create a new,
   non-symlink server-side preservation directory outside the checkout with mode
   700 and `umask 077`. Keep environment files, ignored tooling, other local files
   and private deployment logs there as individual protected files, retaining
   relative paths. Include logs under `.git`, which an ignored-file inventory
   alone will miss. Preserve all local files rather than deciding some are
   disposable. Do not create temporary archives or transfer secrets to the
   workstation. Keep the preservation directory and its parents outside the
   deletion target, inaccessible to other users.
5. Verify the copies by private source/destination inventory and byte comparisons
   (for example, silent `cmp` for regular files); compare link targets and file
   types separately without following links outside the reviewed scope. Verify
   counts, owner and permissions. Report only counts and pass/fail; never print
   secret contents or hashes. Stop for missing files, special files, unexplained
   changes or failed comparisons. Recheck immediately before deletion; if local
   files changed, repeat preservation under approval before continuing.
6. Record the running container's immutable image ID and protect it with a unique
   local tag for separately approved recovery. Verify that tag resolves to the
   same image ID. Preserve any older recovery tag/image. Keep private build and
   failure logs outside the checkout with mode 600. Confirm the approved SSH and
   GitHub clone access, Docker/Compose/Buildx availability, external Compose build
   context and `.env.production` path, sufficient disk space, and an acceptance
   deadline before downtime. Do not register credentials or pull/build images
   merely to perform this preflight.

The maintenance approval must name the reviewed SHA, preservation directory,
external Compose path, existing container name, image tag, checkout deletion and
reclone path, environment restoration, source/container build, activation and
acceptance probes. State that recovery is excluded unless separately approved.

### Execute during the approved window

1. Recheck successful CI for the approved SHA and that it remains the current
   GitHub main tip. Recheck protected copies, prior image preservation and target
   identity. Stop before deletion if any prerequisite differs.
2. Stop and remove only the recorded `thedailyfeed` container, using its verified
   container identity. Do not use project-wide `down`, remove networks or volumes,
   restart the proxy, or affect another service.
3. From the checkout's parent directory, delete only the verified real directory
   `/home/astrazds/docker/thedailyfeed`, after the final copy comparison. Clone
   `https://github.com/astrazds/thedailyfeed.git` afresh into that exact path with
   branch `main`. Require the cloned HEAD, fetched origin/main and current remote
   main tip to equal the approved SHA, and recheck successful CI for that SHA.
   Stop if main advanced; do not substitute a different release or reset to an
   arbitrary commit. Keep clone output in the protected log.
4. Restore only `.env.production` from its verified protected copy with mode 600
   and the intended deployment-user ownership; verify bytes silently. Keep all
   preserved local tooling and historical private logs outside the fresh checkout.
   Require clean tracked/untracked Git state and the reviewed release version.
5. Revalidate the external Compose configuration and reviewed invariants privately.
   Confirm main has not moved, then run the wrapper command above with explicit
   project `thedailyfeed`, the external production Compose file, and the restored
   environment file. Build from the fresh source and retain its private log.
   Require the bounded health wait to succeed.
6. Compare the new container against the recorded acceptance criteria below.
   Report only bounded metadata and pass/fail. Stop if any check fails.
7. Make exactly one approved HTTPS `GET /`, require status 200, discard the body,
   and use no redirects or retries. Set `homepage_url` privately to the existing
   HTTPS origin with path `/` and no credentials, query or fragment. Disable curl
   config files so local defaults cannot add retries, redirects or extra requests:

   ```bash
   homepage_status="$(curl --disable --silent --output /dev/null \
     --request GET --max-time 30 --connect-timeout 10 \
     --proto '=https' --tlsv1.2 --write-out '%{http_code}' "$homepage_url")"
   homepage_result=$?
   [ "$homepage_result" -eq 0 ] && [ "$homepage_status" = 200 ] || exit 1
   printf 'homepage_status=%s\n' "$homepage_status"
   ```

### Container acceptance criteria

Compare values privately on the target host; do not emit raw `docker inspect`,
resolved Compose output, labels, environments or logs. Only the release version,
commit, bounded container/image identifiers, health and check results are needed.

- Health is `healthy` within the approved deadline; runtime `APP_VERSION` matches
  `package.json` and this guide's header, and `APP_COMMIT` is the exact approved
  SHA. The source checkout still
  matches that SHA, and the active image is the image built from this checkout.
- Container name and Compose project/service identity match the recorded target.
  The sole network is `traefik_proxy`; no host ports are published. Ingress labels
  match the preserved administrator-owned configuration, including TLS ownership.
- Runtime user remains non-root (`nextjs`); the root filesystem is read-only,
  privileged mode is off, all capabilities are dropped with none added, and
  no-new-privileges is enabled.
- CPU, memory and PID limits, restart policy, health-check settings, tmpfs scratch
  mounts and bounded log settings match the reviewed production configuration.
  No writable non-tmpfs mounts have appeared.
- `ALLOW_PRIVATE_NETWORKS` remains `false`. Check metrics-token presence privately
  if production metrics are configured; never print it or make a metrics request.
  Existing ingress restrictions and request/streaming controls remain intact.

On any failure, retain the prior image, protected files, new checkout/container
and private logs as they stand and stop. Do not retry the homepage check, roll
back, reclone again, weaken controls or remove investigation evidence without
fresh approval for the exact recovery effects.

### Retire unused deployment access after acceptance

Only after every acceptance check succeeds, prepare the exact cleanup set and
obtain action-time approval. Verify resource identities by names/fingerprints
without displaying credential material:

- Remove the unused GitHub `production` environment and its six environment
  secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`,
  `DEPLOY_KNOWN_HOSTS`, and `DEPLOY_HOMEPAGE_URL`.
- Identify and revoke both retired deployment keys at their authorization points,
  verifying they are dedicated to the removed mechanism. Preserve current
  workstation SSH and clone access. Do not infer key identities from filenames.
- Remove only their dedicated installed server commands and unused deployment
  JSON configuration, after confirming no remaining consumer. Preserve the
  administrator-owned production Compose file and its directory.

Verify removal by presence/count/status without printing secrets. Confirm CI
remains the only GitHub workflow at the accepted SHA. Preserve the prior image,
protected local files and logs, historical Forgejo repository, shared runners and
unrelated services. Repository file removal alone does not revoke installed keys
or remove an existing GitHub environment.

## Operations and recovery

Keep the deployment checkout clean. Store host-specific Compose configuration
outside it and set an explicit project name to preserve existing service identity
and topology. An existing proxy-managed deployment retains its network and omits
host ports; TLS ownership stays with its proxy.

Inspect health and metadata through the target host before reporting production
state. Offline builds do not establish production acceptance. Each commit, push,
credential action, production probe, deployment, cleanup or recovery requires
operator approval; this runbook and scripts do not grant it.

On failure, preserve the previous image, logs, browser data and investigation
state. Review an exact component-specific recovery before using the preserved
image. Do not run project-wide down, remove volumes/networks, prune images,
restart the proxy, weaken SSRF or metrics controls, or automatically roll back.
