# Deployment

This guide covers running The Daily Feed 1.2.1 in production with source-built containers and a trusted HTTPS reverse proxy.

## Portable Compose hosting

Install Docker, Compose v2 and Buildx on a Linux host. Clone the repository,
copy `env.template` to `.env.production`, and restrict that file to mode 600.
The template contains no credentials or release overrides.

```bash
./scripts/deploy-compose.sh
```

By default, the wrapper derives `APP_VERSION` from `package.json` and `APP_COMMIT`
from Git, then builds and starts `thedailyfeed`. Explicit environment values
override that metadata. Source archives without Git report
`unknown` for the commit. Compose binds `127.0.0.1:${APP_PORT:-3000}:3000` and
creates a private project network. The default configuration is independent of
any hosting provider or proxy network.

The image runs as `nextjs` with a read-only root filesystem, dropped
capabilities, no-new-privileges, CPU/memory/PID limits, tmpfs scratch and cache,
bounded JSON logs, and an HTTP health check. Preserve these controls.
`TZ` selects the container timezone; the browser timezone selects today's items.

Configure DNS and provision an HTTPS certificate for your hostname using your
chosen ACME client. Install [deploy/nginx.conf](deploy/nginx.conf) inside a
host-installed Nginx `http {}` context, replace the example hostname and
certificate paths, and adjust its loopback upstream if `APP_PORT` differs.
Validate with `nginx -t` before reloading Nginx. Certificate issuance,
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
| `APP_VERSION` | `1.2.1` | Build/runtime metadata in logs. |
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

## Updating an installation

Choose a release or commit that has passed the repository's
[CI checks](.github/workflows/ci.yml). Keep a record of the currently deployed
commit and image so you can return to that version if an update fails. Preserve
local environment files and any custom proxy or Compose configuration.

Update the source checkout to the chosen revision, review changes to
`env.template` and `compose.yml`, then run from the checkout:

```bash
./scripts/deploy-compose.sh --wait --wait-timeout 180 thedailyfeed
```

The wrapper builds the application and updates only its service, using
`--no-deps`. It derives release metadata and invokes Compose; it does not select
a release, check CI, back up configuration, or implement rollback. A container
replacement can briefly interrupt active requests. The process-local cache and
metrics reset on restart. Browser subscriptions and snapshots stay available
when the browser profile and site origin remain the same. Changing scheme,
hostname, or port selects a different browser storage origin; export OPML before
moving readers to a new origin.

### Custom Compose configuration

The supplied `compose.yml` supports a reverse proxy on the same host through a
loopback port. Other topologies can use a separate Compose file. Preserve the
runtime hardening, restrict application access to the trusted proxy, and retain
your installation's project name and network configuration during updates.

The wrapper accepts a single Compose file through `COMPOSE_FILE` and an
environment file through `ENV_FILE`. For example, with paths chosen for your
installation:

```bash
COMPOSE_PROJECT_NAME=thedailyfeed \
COMPOSE_FILE=/etc/thedailyfeed/compose.yml \
ENV_FILE=/etc/thedailyfeed/environment \
  ./scripts/deploy-compose.sh --wait --wait-timeout 180 thedailyfeed
```

Run this from the source checkout. The wrapper sets that directory as Compose's
project directory. Ensure the custom configuration uses the intended build
context and environment variables. Keep credentials and host-specific files
out of version control.

## Checking an installation

After an install or update:

- Confirm the container becomes healthy and serves the homepage through your
  HTTPS reverse proxy.
- Verify that `APP_VERSION` and `APP_COMMIT` identify the intended source.
- Confirm the application remains non-root, with a read-only filesystem,
  dropped capabilities, resource limits, tmpfs scratch space, and bounded logs.
- Check that only the intended proxy can reach the application and that request
  limits and unbuffered streaming remain configured.
- In a disposable browser profile, load synthetic sources through the proxy and
  use **Refresh feeds**. Confirm progress remains visible until completion and
  **Manage feeds** shows source outcomes. A healthy homepage alone does not
  establish feed retrieval or unbuffered delivery. Refresh may reuse the server
  cache; it does not force every publisher to be fetched again.
- Keep `ALLOW_PRIVATE_NETWORKS=false`. Metrics should remain unavailable unless
  you deliberately configure bearer authentication and restrict access.

Use the same Compose file, environment file, and project name for inspection
that you used for deployment. Avoid sharing resolved environments, credentials,
raw logs, or private feed content when reporting a problem.

## Recovery and data

Before updating, retain the previous source revision and image along with a
protected copy of local configuration. If an update fails, inspect the container
health and relevant logs, then restore the previous application version using
your deployment tooling. Check health and proxy access again after recovery.
Do not weaken feed URL validation, metrics authentication, or container controls
to make a failing version start.

Keep recovery scoped to this application. Removing shared networks, volumes,
or proxy services can disrupt other applications on the same host.

The server has no subscription database to migrate or back up. Readers can
export OPML to preserve their subscriptions. Clearing browser site data removes
subscriptions, snapshots, and PWA caches; replacing the server does not transfer
that browser data to another device. See [PRIVACY.md](PRIVACY.md).

## Build verification

[scripts/verify-ci.sh](scripts/verify-ci.sh) is the portable verification entry
point used by [GitHub Actions](.github/workflows/ci.yml). It requires Node 24,
the pinned pnpm release, Python 3, Docker/Compose/Buildx, and Chromium system
dependencies. It installs dependencies and Chromium, validates release metadata,
runs lint, type checks and tests, builds Next/PWA output, runs synthetic browser
checks, and builds a local Docker image.

The supplied CI workflow uses read-only repository permissions and performs
verification only. Deployment and registry publishing are not configured by the
repository.
