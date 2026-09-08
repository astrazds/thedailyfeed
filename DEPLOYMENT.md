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

## Optional GitHub deployment

Self-hosting does not require Actions or a deployment key. The included personal
deployment workflow is restricted to `astrazds/thedailyfeed`; forks must review
and adapt that restriction for their own owner and hosting target.

Both workflows use GitHub-hosted Ubuntu runners and reviewed action commit SHAs
with checkout credential persistence disabled. PR jobs have read-only repository
permissions and no production secrets. `scripts/verify-ci.sh` performs frozen
installation, version validation, lint, TypeScript, unit tests, Next/PWA build,
Chromium smoke tests, and one unpublished Docker build through Docker Buildx.
No registry publishing is configured.

Before the first dispatch, an administrator must create the `production`
environment with these settings. Workflows cannot create its protection rules:

- Selected deployment branches: branch `main` only, with no tag rule.
- Required reviewer: repository owner `astrazds`.
- Prevent self-review: off, for the single-maintainer approval flow.
- Allow administrators to bypass protection rules: off.

GitHub makes environment secrets available only after its protection rules pass;
see [environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
Store these values as **environment secrets**, never repository-level secrets:
`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`,
`DEPLOY_KNOWN_HOSTS`, and `DEPLOY_HOMEPAGE_URL`.
The homepage URL must be HTTPS with path `/`, no credentials, query, or fragment.
Obtain the SSH host key over an independently trusted channel; do not trust a
runner-time `ssh-keyscan`. The known-host entry must match the host and port.

Install `scripts/thedailyfeed-ci-deploy` outside the checkout, root-owned and
not writable by the deploy user. Install an administrator-owned
`/etc/thedailyfeed/deploy.json` and production Compose file outside the checkout.
Adapt [deploy/deploy.example.json](deploy/deploy.example.json) to the target.
The script requires Python 3, Git and Docker Compose. Every parent of the
configuration and Compose file must be root-owned and not group/world writable.
Give the deployment user read access to these files and its existing mode-600
environment file; preserve that file. The deployment user needs Docker access,
so its restricted key is still a powerful production credential.

Register a dedicated public key with an authorized_keys restriction such as:

```text
restrict,command="/usr/local/libexec/thedailyfeed-ci-deploy" ssh-ed25519 <public-key>
```

The installed command accepts only `deploy <40-character lowercase SHA>`, locks
against overlapping deployments, requires a clean `main` checkout and expected
origin, fetches only main, and requires the target to equal its fetched tip.
It updates by fast-forward only, checks configured current runtime invariants,
preserves the current image under the configured rollback tag, and builds and
recreates only the application. Acceptance checks health, exact source metadata,
network, ports, runtime user, filesystem, capabilities, privileges, limits,
scratch mounts, logs, labels and SSRF policy against administrator configuration.
If metrics are enabled, set `metrics_required` to true.

Command output is kept in mode-600 `.git/thedailyfeed-deploy-*.log` files on the
server. Successful runs remove their logs; failures preserve them for private
inspection. Logs can contain sensitive data: do not paste them into CI or issues.
The server does not automatically roll back a failed build or activation.

Dispatch **Deploy production** on `main`, select `main`, and type
`deploy-production`. Both the initiating and rerunning actors must be the owner.
A credential-free job verifies the dispatch SHA before the production job waits
for environment approval. Deployments are serialized and never canceled by a
new dispatch. After server success, the workflow makes exactly one HTTPS
`GET /`, requires 200, discards the body, and neither follows redirects nor retries.
It makes no feed, metrics, or browser requests. If SSH cannot connect, stop;
opening ports, changing firewalls, installing runners or VPNs needs separate review.

## Operations and recovery

Keep the deployment checkout clean. Store host-specific Compose configuration
outside it and set an explicit project name to preserve existing service identity
and topology during migration. An existing proxy-managed deployment can retain
its network and omit host ports; do not layer the portable loopback configuration
onto it accidentally. TLS ownership stays with that deployment's proxy.

Inspect health and metadata through the target host before reporting production
state. Offline builds do not establish production acceptance. Each commit, push,
credential registration, deployment, homepage probe or recovery requires the
operator's explicit approval; this runbook and scripts do not grant it.

On failure, preserve the previous image, logs, browser data and investigation
state. Review an exact component-specific recovery before using the rollback tag.
Do not run project-wide down, remove volumes/networks, prune images, restart the
proxy, weaken SSRF or metrics controls, or perform an automatic rollback.
