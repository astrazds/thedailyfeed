# Deployment Guide

This guide covers running The Daily Feed in production with Docker, Docker Compose, and an optional Traefik reverse proxy.

## Prerequisites

- Docker 20.10+
- Docker Compose 2+
- A DNS name for production HTTPS
- pnpm, when running local checks outside Docker

## Build the Image

```bash
git clone https://repos.astrazds.net/astrazds/thedailyfeed.git
cd thedailyfeed
docker build -t thedailyfeed:latest .
```

The image build runs `pnpm build`. That production build also verifies the PWA service worker contract, including `public/sw.js`, referenced Workbox runtime assets, and the declared `/api/feeds` `NetworkOnly` runtime route.

## Run with Compose

Create an environment file from the template when you need non-default settings:

```bash
cp env.template .env.production
```

Start the service:

```bash
docker compose -f compose.yml --env-file .env.production up -d
docker compose -f compose.yml logs -f thedailyfeed
```

Check container health:

```bash
docker inspect --format='{{.State.Health.Status}}' thedailyfeed
curl http://localhost:3000
```

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
| `APP_VERSION` | `0.1.0` | Build/runtime metadata in logs. |
| `APP_COMMIT` | `unknown` | Commit metadata in logs. |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Feed API requests per identity per window. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window. |
| `FEED_TIMEOUT_MS` | `10000` | Upstream feed fetch timeout. |
| `FEED_RETRY_COUNT` | `3` | Retry attempts for transient feed failures. |
| `FEED_OVERALL_TIMEOUT_MS` | `30000` | Overall per-feed timeout budget. |
| `FEED_CACHE_TTL_MS` | `3600000` | Per-feed server cache TTL. |
| `FEED_CACHE_MAX_ENTRIES` | `200` | In-memory cache entry cap. |
| `ALLOW_PRIVATE_NETWORKS` | `false` | Production SSRF escape hatch for private network feeds. |
| `METRICS_AUTH_TOKEN` | empty | Required to expose production metrics. |
| `TRAEFIK_DOMAIN` | `dailyfeed.example.com` | Traefik router hostname. |
| `TRAEFIK_CERT_RESOLVER` | `route53` | Traefik certificate resolver name. |

Keep real secrets out of the repository. `.env*` files are ignored by git.

## Traefik

`compose.yml` includes Traefik labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.dailyfeed.entrypoints=websecure"
  - "traefik.http.routers.dailyfeed.rule=Host(`${TRAEFIK_DOMAIN:-dailyfeed.example.com}`)"
  - "traefik.http.routers.dailyfeed.tls=true"
  - "traefik.http.routers.dailyfeed.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-route53}"
  - "traefik.http.services.dailyfeed.loadbalancer.server.port=3000"
```

The service joins an external network named `traefik_proxy`. Change the network name in `compose.yml` if your Traefik stack uses a different network.

Recommended Traefik hardening:

- Keep direct access to the app container blocked.
- Strip inbound `X-Forwarded-For` and `X-Real-IP` at the public edge, then inject trusted values from Traefik if the app is configured to trust proxy identity headers.
- Preserve or inject `X-Request-Id` or `X-Correlation-Id` when upstream request correlation is needed.
- Keep `/api/metrics` behind trusted networks as defense in depth, even though production metrics require bearer auth.
- Add proxy-level request limits for feed endpoints as defense in depth.
- Avoid response buffering on the app route so `POST /api/feeds?stream=1` can deliver NDJSON chunks progressively.

## Other Reverse Proxies

### Nginx

```nginx
server {
    listen 80;
    server_name dailyfeed.example.com;

    location / {
        proxy_pass http://localhost:3000;
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
    reverse_proxy localhost:3000
}
```

## Metrics

`GET /api/metrics` exposes an operator snapshot with in-memory feed API counters and redacted feed cache stats.

Production behavior:

- `METRICS_AUTH_TOKEN` unset: returns `404`.
- `METRICS_AUTH_TOKEN` set and bearer missing/invalid: returns `401`.
- `METRICS_AUTH_TOKEN` set and bearer valid: returns metrics with `Cache-Control: no-store`.

Example:

```bash
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" http://localhost:3000/api/metrics
```

The response includes `X-Request-Id`.

## Logs

Compose configures Docker `json-file` log rotation:

- `max-size=10m`
- `max-file=5`

View logs:

```bash
docker compose -f compose.yml logs -f thedailyfeed
```

Server logs include request IDs, feed/cache lifecycle events, validation failures, rate-limit rejections, request durations, and build metadata.

## Updates

```bash
git pull
docker compose -f compose.yml --env-file .env.production build
docker compose -f compose.yml --env-file .env.production up -d
docker image prune -f
```

## Security Notes

- The final Docker image runs as a non-root user.
- Security headers are declared in `lib/platform-policy.ts` and adapted by `next.config.ts`.
- API routes use `Cache-Control: no-store`.
- `/api/feeds` is pinned to the service worker `NetworkOnly` runtime policy.
- Feed URL validation blocks non-HTTP(S) URLs.
- Production SSRF protection blocks private/local IP ranges unless `ALLOW_PRIVATE_NETWORKS=true`.
- Feed HTML is sanitized before rendering.
- Rendered feed media is blocked by CSP; remote article images are allowed for feed content.
- Feed endpoints are rate-limited in-process by derived client identity.
- Cache, rate limiter, and metrics state are process-local and reset on restart.

For horizontal scaling, move cache, rate-limit, and metrics state to shared infrastructure.
