# Deployment Guide - The Daily Feed

This guide covers deploying The Daily Feed in production using Docker with an optional Traefik reverse proxy.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Domain name with DNS configured (for production)
- pnpm (for local builds)

## Quick Start (Docker)

### 1. Build the Image

```bash
# Clone the repository
git clone <repository-url>
cd thedailyfeed

# Build the Docker image
docker build -t thedailyfeed:latest .
```

The image build runs `pnpm build`, which fails if `public/sw.js`, its referenced Workbox runtime assets, or the declared `/api/feeds` `NetworkOnly` runtime route are missing.

### 2. Run with Docker Compose

```bash
# Start the container
docker compose -f compose.yml up -d

# View logs
docker compose -f compose.yml logs -f thedailyfeed
```

### 3. Verify Deployment

```bash
# Check container status
docker ps | grep thedailyfeed

# Check health
docker inspect --format='{{.State.Health.Status}}' thedailyfeed

# Test endpoint
curl http://localhost:3000

# Metrics endpoint
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" http://localhost:3000/api/metrics
```

## Traefik Integration (Recommended)

For automatic HTTPS and easy domain management, use Traefik.

### 1. Traefik Configuration

`compose.yml` already includes labels for Traefik integration:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.dailyfeed.entrypoints=websecure"
  - "traefik.http.routers.dailyfeed.rule=Host(`${TRAEFIK_DOMAIN:-dailyfeed.example.com}`)"
  - "traefik.http.routers.dailyfeed.tls=true"
  - "traefik.http.routers.dailyfeed.tls.certresolver=${TRAEFIK_CERT_RESOLVER:-route53}"
  - "traefik.http.services.dailyfeed.loadbalancer.server.port=3000"
```

Set `TRAEFIK_DOMAIN` and `TRAEFIK_CERT_RESOLVER` per environment.

### 2. External Traefik Network

If you are using an external Traefik network, ensure the network name in `compose.yml` matches your Traefik stack network (default in this repo: `traefik_proxy`).

## Alternative Reverse Proxies

### Nginx

```nginx
server {
    listen 80;
    server_name thedailyfeed.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```caddy
thedailyfeed.example.com {
    reverse_proxy localhost:3000
}
```

## Environment Variables

Primary runtime variables used by the container:

- `NODE_ENV=production`
- `PORT=3000`
- `HOSTNAME=0.0.0.0`
- `LOG_LEVEL` (default: `info`)
- `LOG_FORMAT` (default: `json`)
- `LOG_SERVICE_NAME` (default: `thedailyfeed`)
- `LOG_REDACT_FIELDS` (default: `authorization,cookie,set-cookie,password,token`)
- `APP_VERSION` (default: `0.1.0`)
- `APP_COMMIT` (default: `unknown`)
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_WINDOW_MS`
- `FEED_TIMEOUT_MS`
- `FEED_RETRY_COUNT`
- `FEED_OVERALL_TIMEOUT_MS`
- `FEED_CACHE_TTL_MS`
- `ALLOW_PRIVATE_NETWORKS`
- `METRICS_AUTH_TOKEN` (required in production for `GET /api/metrics`)

Use `env.template` as the baseline and inject values through `compose.yml` `environment` and/or `env_file`.

## Monitoring & Maintenance

### Logs

```bash
docker compose -f compose.yml logs -f thedailyfeed
```

Server logs are structured and include:

- request correlation via `requestId`
- cache split/hit details
- progressive parse events
- per-request durations and item counts

`compose.yml` configures Docker log rotation:

- logging driver: `json-file`
- max size per file: `10m`
- max retained files: `5`

### Metrics

`GET /api/metrics` exposes an operator runtime snapshot. The app-level exposure mode is
`app-authenticated-operator`: production requests require `Authorization: Bearer <METRICS_AUTH_TOKEN>`.
When `NODE_ENV=production` and no token is configured, the endpoint returns `404`.

Responses include:

- `metricsExposure`, naming the access, cache, and Request ID policy
- `feedApi`, with aggregate feed API counters and averages
- `feedCache`, with cache size and redacted entry ages

Metrics responses use `Cache-Control: no-store` and emit `X-Request-Id` using the shared
Request ID policy. Forward `X-Request-Id` or `X-Correlation-Id` from the proxy if upstream
correlation is needed; otherwise the app generates an ID.

Example:

```bash
curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" http://localhost:3000/api/metrics
```

### Health Checks

```bash
docker inspect --format='{{.State.Health.Status}}' thedailyfeed
```

### Updates

```bash
git pull
docker compose -f compose.yml build
docker compose -f compose.yml up -d
docker image prune -f
```

## Security Considerations

- Running as non-root user (`nextjs:nodejs`)
- Security headers are split by surface in `lib/platform-policy.ts` and adapted by `next.config.ts`: common transport/MIME headers, app-shell CSP, API `no-store`, service-worker/Workbox headers, manifest headers, and static asset headers
- CSP allows remote article images for sanitized feed content rendering (`img-src ... https: http:`) and blocks rendered audio/video with `media-src 'none'`
- URL validation + SSRF protection for private/local addresses (in production unless `ALLOW_PRIVATE_NETWORKS=true`)
- In-memory rate limiting on `POST /api/feeds` and `POST /api/feeds/validate` requests
- `POST /api/feeds` responses return `Cache-Control: no-store`; the PWA runtime cache also pins `/api/feeds` to `NetworkOnly` from the declared platform policy
- `/sw.js` and Workbox scripts are served as JavaScript with `no-cache, no-store, must-revalidate`; `/manifest.webmanifest` is served as a web manifest with bounded revalidation
- HTML sanitization before rendering feed content
- `GET /api/metrics` uses the explicit `app-authenticated-operator` exposure mode:
  bearer auth in production, `Cache-Control: no-store`, and request correlation via
  `X-Request-Id`
- Consider proxy-level rate limiting for `POST /api/feeds/validate` as defense in depth

## Recommended Traefik Hardening

- Keep `/api/metrics` behind trusted networks as defense in depth, even with app bearer auth
- Add request rate limiting middleware for `/api/feeds/validate`
- Ensure direct access to the app container is blocked so forwarded client IP headers are trusted only from Traefik
- Strip inbound `X-Forwarded-For` and `X-Real-IP` at the public edge, then inject trusted values from the proxy connection before forwarding to the app
- Preserve or inject `X-Request-Id`/`X-Correlation-Id` at the proxy if upstream request correlation is required; the app will generate a Request ID when forwarded IDs are missing or too long
- Keep HTTPS redirection and TLS termination enforced at the router level

## Operational Notes

- `/api/test-feed` is a development/testing endpoint and returns `404` in production.
- Cache, rate limiter, and metrics are process-local and reset on restart.
- For horizontal scaling, move cache/rate-limit/metrics state to shared infrastructure.

---

**Last Updated**: 2026-06-01
**Docker Version**: 20.10+
**Next.js Version**: 16.2.6
