# Deployment Guide

This guide covers running The Daily Feed 1.0.6 in production with Docker, Docker Compose, and a required trusted reverse proxy such as Traefik. Direct public internet exposure of the app container is unsupported.

For application behavior and module architecture, see [`TECHNICAL.md`](TECHNICAL.md).

## Prerequisites

- Docker 20.10+
- Docker Compose 2+
- A DNS name for production HTTPS
- Node.js 24 LTS or newer and pnpm 10.33.4+, when running local checks outside Docker

## Build the Image

```bash
git clone https://repos.astrazds.net/astrazds/thedailyfeed.git
cd thedailyfeed
docker build -t thedailyfeed:latest .
```

The image builds and runs on Node.js 24 Alpine. The build runs `pnpm build`, which also verifies the PWA service worker contract, including `public/sw.js`, referenced Workbox runtime assets, and the declared `/api/feeds` `NetworkOnly` runtime route.

## Run with Compose

Create an environment file from the template when you need non-default settings:

```bash
cp env.template .env.production
```

Start the service:

```bash
./scripts/deploy-compose.sh
docker compose -f compose.yml logs -f thedailyfeed
```

`scripts/deploy-compose.sh` exports `APP_VERSION` from `package.json` and `APP_COMMIT` from the current git commit before running `docker compose up -d --build`. Override `COMPOSE_FILE`, `ENV_FILE`, `APP_VERSION`, or `APP_COMMIT` when needed.

Running the wrapper is production activation, not validation. Obtain approval
for that lifecycle change before invoking it. A routine deployment affects
only `thedailyfeed`; preserve the external `traefik_proxy` network and do not
use project-wide `down`, remove networks or volumes, prune images, or restart
the proxy.

Check container health:

```bash
docker inspect --format='{{.State.Health.Status}}' thedailyfeed
```

Compose deliberately publishes no host port, so `curl http://localhost:3000`
does not test this topology. Docker's health check probes the container-local
listener. Any route-level check through Traefik is a separate active production
probe and should be explicitly approved with its hostname, route, and
authentication effects.

To validate configuration without activating or recreating the service:

```bash
docker compose -f compose.yml config --quiet
```

This checks Compose structure and interpolation only. It does not establish
image buildability, container health, routing, or production acceptance.

## Runtime Configuration

`compose.yml` passes these variables through to the container:

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Fixed by Compose. |
| `PORT` | `3000` | Fixed by Compose and exposed to Traefik internally. |
| `HOSTNAME` | `0.0.0.0` | Fixed by Compose. |
| `TZ` | `UTC` | Container timezone. User-facing "today" still comes from browser timezone. |
| `LOG_LEVEL` | `info` | Server logger level. |
| `LOG_FORMAT` | `json` | Use JSON logs in production. |
| `LOG_SERVICE_NAME` | `thedailyfeed` | Included in structured logs. |
| `LOG_REDACT_FIELDS` | `authorization,cookie,set-cookie,password,token` | Case-insensitive fields redacted from log objects. |
| `APP_VERSION` | `1.0.6` | Build/runtime metadata in logs. |
| `APP_COMMIT` | `unknown` | Commit metadata in logs. |
| `FEED_TIMEOUT_MS` | `10000` | Per-attempt upstream budget spanning DNS, redirects, and response streaming. |
| `FEED_RETRY_COUNT` | `3` | Retry attempts for transient feed failures. |
| `FEED_OVERALL_TIMEOUT_MS` | `30000` | Aggregate per-feed and validation budget spanning redirects, retry delays, and retries. |
| `FEED_REQUEST_TIMEOUT_MS` | `30000` | Overall missing-feed work budget per request. |
| `FEED_CACHE_TTL_MS` | `3600000` | Per-feed server cache TTL. |
| `FEED_CACHE_MAX_ENTRIES` | `200` | In-memory cache entry cap. |
| `ALLOW_PRIVATE_NETWORKS` | `false` | Production SSRF escape hatch for private network feeds. |
| `METRICS_AUTH_TOKEN` | empty | Required to expose production metrics. |
| `TRAEFIK_DOMAIN` | `dailyfeed.example.com` | Traefik router hostname. |
| `TRAEFIK_CERT_RESOLVER` | `route53` | Traefik certificate resolver name. |
| `TRAEFIK_RATE_LIMIT_AVERAGE` | `60` | Traefik average request rate. |
| `TRAEFIK_RATE_LIMIT_BURST` | `120` | Traefik burst request allowance. |
| `TRAEFIK_MAX_REQUEST_BODY_BYTES` | `1048576` | Traefik maximum request body size. |

Keep real secrets out of the repository. `.env*` files are ignored by git and by the Docker build context; `env.template` remains intentionally tracked.

Feed timeouts are nested safeguards. `FEED_TIMEOUT_MS` bounds one upstream attempt and is not restarted for each redirect. `FEED_OVERALL_TIMEOUT_MS` bounds the complete logical feed operation, including retries; `POST /api/feeds/validate` also combines that deadline with the inbound request signal so disconnected callers do not leave outbound work running. `FEED_REQUEST_TIMEOUT_MS` is the outer budget for all missing-feed work in the main feed-set endpoint.

## Traefik

`compose.yml` includes Traefik labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.dailyfeed.entrypoints=websecure"
  - "traefik.http.routers.dailyfeed.rule=Host(`${TRAEFIK_DOMAIN:-dailyfeed.example.com}`)"
  - "traefik.http.routers.dailyfeed.tls=true"
  - "traefik.http.routers.dailyfeed.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-route53}"
  - "traefik.http.routers.dailyfeed.middlewares=dailyfeed-ratelimit,dailyfeed-request-limit"
  - "traefik.http.middlewares.dailyfeed-ratelimit.ratelimit.average=${TRAEFIK_RATE_LIMIT_AVERAGE:-60}"
  - "traefik.http.middlewares.dailyfeed-ratelimit.ratelimit.burst=${TRAEFIK_RATE_LIMIT_BURST:-120}"
  - "traefik.http.middlewares.dailyfeed-request-limit.buffering.maxRequestBodyBytes=${TRAEFIK_MAX_REQUEST_BODY_BYTES:-1048576}"
  - "traefik.http.services.dailyfeed.loadbalancer.server.port=3000"
```

The service joins an existing external network named `traefik_proxy`. Compose
does not create or own that network. Changing its name or lifecycle is an
adjacent infrastructure change, not a routine application deployment.

Traefik owns production ingress controls:

- Keep direct access to the app container blocked.
- Keep public client IP access logs at Traefik. The app does not log raw client IPs by default.
- Strip inbound `X-Forwarded-For` and `X-Real-IP` at the public edge, then inject trusted values from Traefik if downstream tooling needs them.
- Preserve or inject `X-Request-Id` or `X-Correlation-Id` when upstream request correlation is needed.
- Keep `/api/metrics` behind trusted networks as defense in depth, even though production metrics require bearer auth.
- Configure proxy-level request rate limits, request body limits, TLS, and ingress timeouts.
- Avoid response buffering on the app route so `POST /api/feeds?stream=1` can deliver NDJSON chunks progressively.

## Other Reverse Proxies

### Nginx

```nginx
server {
    listen 80;
    server_name dailyfeed.example.com;

    location / {
        proxy_pass http://thedailyfeed:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }
}
```

### Caddy

```caddy
dailyfeed.example.com {
    reverse_proxy thedailyfeed:3000
}
```

These examples assume the proxy shares a private Docker network with the
application and can resolve the `thedailyfeed` service. The supplied Compose
file has no host binding for a host-installed proxy.

## Metrics

`GET /api/metrics` exposes an operator snapshot with in-memory feed API counters and redacted feed cache stats.

Production behavior:

- `METRICS_AUTH_TOKEN` unset: returns `404`.
- `METRICS_AUTH_TOKEN` set and bearer missing/invalid: returns `401`.
- `METRICS_AUTH_TOKEN` set and bearer valid: returns metrics with `Cache-Control: no-store`.

Example:

```bash
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" "https://${TRAEFIK_DOMAIN}/api/metrics"
```

This is an authenticated production probe and requires separate action-time
approval. The response includes `X-Request-Id`.

## Logs

Compose configures Docker `json-file` log rotation:

- `max-size=10m`
- `max-file=5`

View logs:

```bash
docker compose -f compose.yml logs -f thedailyfeed
```

Server logs include request IDs, feed/cache lifecycle events, validation failures, request durations, and build metadata. Logs do not include raw client IPs by default, and URL values have credentials, query strings, and fragments redacted.

## Updates

Prepare and review the exact source update before activation. If local
dependency checks are needed from a CIFS checkout, run them in a fresh `/tmp`
copy rather than installing into the mounted tree. On the native SRV1 checkout,
the optional pre-deployment verification sequence is:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

After the source revision and deployment are separately approved, activate
only the application service with:

```bash
./scripts/deploy-compose.sh
```

The local verification sequence is optional when the deployment host only builds through Docker, because the image build runs the production Next/PWA build again. Running it before deployment provides earlier feedback for lint, application and test type errors, unit tests, and generated PWA artifacts.

## Forgejo CI

Pushes to `main`, pull requests, and manual non-production runs share the
user-scoped `srv1-ci` pool. Two persistent runners provide one job each. The
runner processes are confined to separate read-only containers with dedicated
writable state, and each runner reaches only its own rootless BuildKit v0.25.1
sidecar. Neither runner has the host Docker socket, a production filesystem
mount, privileged mode, or a production credential.

All workflows use one tracked gate:

```bash
./scripts/verify-ci.sh
```

The gate requires Node 24 and pnpm 10.33.4, derives `APP_VERSION` and the full
40-character checked-out commit, validates Compose interpolation, runs frozen
installation, lint, `tsc --noEmit`, tests, and the Next/PWA build, then uses
rootless BuildKit to create one local OCI archive. The archive is deleted after
the build and is never published.

`pull_request` is intentionally retained. Approved PR jobs execute arbitrary
PR code using the host executor inside a runner container. That code can read
the persistent runner token and could impersonate the runner. The accepted
scope is the `astrazds/*` user runner pool; deployment secrets are not made
available to the PR workflow.

## Manual production workflow

`.forgejo/workflows/deploy-production.yml` has only a `workflow_dispatch`
trigger. The operator must dispatch the `main` ref, select `main`, and enter
the exact confirmation `deploy-production`. The workflow checks out the event's
`${{ github.sha }}` and reruns `scripts/verify-ci.sh`; there is no arbitrary SHA
input and verification must succeed before deployment.

The deployment step uses repository secret `SRV1_DEPLOY_KEY` with the host key
tracked in `.forgejo/srv1_known_hosts`. The matching public key is restricted
in the SRV1 `astrazds` account to the root-owned forced command
`/usr/local/sbin/thedailyfeed-ci-deploy`. The key cannot open a shell, forward
ports or agents, allocate a TTY, or invoke another service.

The forced command accepts only `deploy <40-hex-sha>`. It serializes deployment
with `flock`, requires the authoritative checkout to be clean, on `main`, and
using the expected origin, then freshly fetches `origin/main`. The requested
commit must equal that fetched tip and be a fast-forward from the current
checkout. Before activation it validates Compose, verifies `.env.production`
mode `0600` without reading values, and tags the current healthy image as
`thedailyfeed:rollback`. It invokes:

```bash
./scripts/deploy-compose.sh --wait --wait-timeout 180 thedailyfeed
```

After activation, the forced command requires exact commit/version metadata,
healthy state, no host port bindings, only the `traefik_proxy` network, and the
fixed router rule ``Host(`dailyfeed.astrazds.net`)``. The workflow then performs
one TLS-validated `GET /` and requires final HTTP `200`; it does not call feed,
validation, metrics, or browser routes.

A build failure leaves the running container untouched. Activation, health,
or route failure stops without automatic rollback. Using the preserved
rollback image is a separate recovery action requiring fresh approval. The
workflow must not be dispatched as part of CI or runner setup.

After updating, compare `env.template` and the runtime configuration table above for newly introduced variables before recreating the container. Browser feed preferences remain client-local, so this release requires no server-side data migration.

## Security Notes

- The final Docker image runs as a non-root user.
- Compose runs the container with a read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, process and resource limits, and tmpfs mounts only for runtime scratch/cache paths.
- Security headers are declared in `lib/platform-policy.ts` and adapted by `next.config.ts`.
- API routes use `Cache-Control: no-store`.
- The service-worker runtime URL pattern matches only `/api/feeds` and uses
  `NetworkOnly`, with no cache options or network-timeout fallback.
- Feed URL validation blocks non-HTTP(S) URLs.
- Production SSRF protection blocks private, local, and special-use IP ranges unless `ALLOW_PRIVATE_NETWORKS=true`.
- Each feed validation request has one `FEED_OVERALL_TIMEOUT_MS` budget across DNS, redirects, response streaming, retry delay, and retries.
- Aborting an inbound validation request cancels its active outbound request and prevents subsequent retries.
- Feed HTML is sanitized before rendering.
- Rendered feed media is blocked by CSP; remote article images are allowed for feed content.
- Production feed ingress rate limiting, public IP access logs, request body limits, edge TLS, and ingress timeouts are proxy-owned.
- Cache and metrics state are process-local and reset on restart.

For horizontal scaling, move cache and metrics state to shared infrastructure.
