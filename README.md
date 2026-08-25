# The Daily Feed

A focused RSS reader for today's articles.

Current release: `1.0.6`.

The Daily Feed is a self-hostable web app that fetches your saved RSS feeds, keeps only the items published today in your local timezone, and streams results into the page as each feed finishes. It is built for a quiet daily reading workflow: add feeds, open the app, scan what is new today, and keep working even when a previous snapshot is all that is available.

## Highlights

- Today-only feed view based on the reader's browser timezone.
- Progressive NDJSON streaming from `POST /api/feeds?stream=1`, so fast feeds render before slower ones finish.
- Pulsing feed-item placeholders remain visible while additional feeds are still loading.
- Feed management in the browser with add, edit, delete, enable/disable, and OPML import/export. Deletion uses an accessible in-row confirmation with a theme-aware destructive action instead of a native browser dialog.
- Feed load results are shown in the feed manager without adding per-feed status badges to the reading view.
- Server-side feed validation before new feeds are saved locally.
- Per-feed in-memory cache with TTL and max-entry controls.
- Browser-local offline snapshots for same-day fallback.
- Installable PWA behavior when served over HTTPS and browser installability criteria are met.
- Structured server logs, request correlation, and bearer-protected production metrics.
- Defense-in-depth around untrusted feeds: SSRF guards, URL normalization, HTML sanitization, strict response headers, and proxy-owned production ingress controls.

## Tech Stack

- Next.js 16 App Router
- React 19
- Node.js 24 LTS or newer
- TypeScript strict mode
- Tailwind CSS v4
- `rss-parser`, `date-fns`, `dompurify`
- `next-pwa`
- Docker standalone output for self-hosting

## Quick Start

Requirements:

- Node.js 24 LTS or newer
- pnpm 10.33.4 or newer

```bash
git clone https://repos.astrazds.net/astrazds/thedailyfeed.git
cd thedailyfeed
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Useful local checks:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

`pnpm dev` uses the default Next.js development bundler. `pnpm build` follows the production bundler path documented in [TECHNICAL.md](TECHNICAL.md), then verifies the emitted service worker contract. The standalone TypeScript check includes application code and the `.mts` test suite.

## Configuration

Copy the template when you need local overrides:

```bash
cp env.template .env.local
```

Important runtime variables:

| Variable | Purpose |
| --- | --- |
| `RATE_LIMIT_MAX_REQUESTS` | Feed API requests allowed per rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window size in milliseconds. |
| `FEED_TIMEOUT_MS` | Per-attempt upstream timeout spanning DNS, redirects, and response streaming. |
| `FEED_RETRY_COUNT` | Retry count for transient feed failures. |
| `FEED_OVERALL_TIMEOUT_MS` | Aggregate budget across all work for one feed, including validation redirects and retries. |
| `FEED_REQUEST_TIMEOUT_MS` | Overall timeout budget for missing-feed work in a single request. |
| `FEED_CACHE_TTL_MS` | Server-side feed cache TTL. |
| `FEED_CACHE_MAX_ENTRIES` | Maximum in-memory feed cache entries. |
| `LOG_LEVEL`, `LOG_FORMAT` | Server log verbosity and output format. |
| `APP_VERSION`, `APP_COMMIT` | Build metadata included in logs. |
| `ALLOW_PRIVATE_NETWORKS` | Production escape hatch for private-network feed URLs. Defaults to blocked. |
| `METRICS_AUTH_TOKEN` | Required in production to access `GET /api/metrics`. |

Numeric values are parsed with safe fallbacks in `lib/constants.ts`. `RATE_LIMIT_*` only controls the local/development fallback limiter; production ingress rate limits belong at the reverse proxy.

## How It Works

1. The client loads enabled feed configuration from `localStorage`.
2. The client sends `{ feedUrls, timeZone }` to `POST /api/feeds`.
3. The server validates, normalizes, and deduplicates the request.
4. Cached feed results are returned immediately when available.
5. Missing feeds are fetched with per-attempt, per-feed, and request-wide timeout controls.
6. Feed items are filtered to the user's timezone-aware day key and sorted newest-first.
7. Stream mode emits each feed as it completes, followed by a `done` message.
8. Successful same-day results are saved in browser storage for offline fallback.

The app intentionally keeps feed preferences and offline snapshots browser-local. There is no account system or cross-device sync layer.

### Core Modules

- Feed management and browser persistence live in `lib/feed-storage.ts`.
- Server feed-set execution lives in `lib/feed-request.ts`; response serialization and untrusted stream validation remain separate adapters.
- `FeedProgressEvent<Item>` is shared by server progress and serialized client progress events. Transport-error chunks remain a separate wire variant.
- Client progressive state and offline fallback live in `lib/feed-set-lifecycle.ts`.

See [TECHNICAL.md](TECHNICAL.md) for the authoritative module seams and runtime contracts.

## API Surface

### `POST /api/feeds`

Fetches a set of feeds.

Request body:

```json
{
  "feedUrls": ["https://example.com/feed.xml"],
  "timeZone": "Australia/Melbourne"
}
```

Default response mode is JSON. Stream mode is enabled with `?stream=1` or `Accept: application/x-ndjson`.

Stream chunks:

- `meta`
- `feed_result`
- `done`
- `error`

All responses include `X-Request-Id` for log correlation.

### `POST /api/feeds/validate`

Validates a single feed URL before saving it in the browser. The endpoint applies the same request ID, logging, and URL policy as the main feed endpoint. It is unauthenticated and therefore relies on production ingress rate limiting, but its outbound work is bounded independently: one `FEED_OVERALL_TIMEOUT_MS` budget spans DNS, redirects, response reads, the retry delay, and both validation attempts. Aborting the inbound request cancels the same operation, closes the active outbound request, and prevents another retry.

### `GET /api/metrics`

Returns an operator snapshot with feed API counters and redacted cache stats.

In production, requests require:

```text
Authorization: Bearer <METRICS_AUTH_TOKEN>
```

When production metrics auth is not configured, the endpoint returns `404`.

### `GET /api/test-feed`

Development and integration-test helper. It returns `404` in production.

## Security Model

The app treats feed URLs, upstream XML, and feed HTML as untrusted input.

- Feed URLs must be `http` or `https`.
- Production SSRF protection blocks localhost, private and special-use IPv4 ranges, local/private/special-use IPv6 ranges, and IPv4-mapped non-global addresses unless `ALLOW_PRIVATE_NETWORKS=true`.
- Production deployments must run behind Traefik or another trusted reverse proxy. The proxy owns TLS, public client IP access logs, ingress rate limits, request body limits, and edge timeouts; direct internet exposure of the app container is unsupported.
- The app does not log raw client IPs by default. Structured logs redact configured secret fields and remove credentials, query strings, and fragments from URL values.
- The app keeps controls that the proxy cannot provide: outbound feed destination validation, aggregate feed operation budgets, inbound-to-outbound cancellation, feed HTML sanitization, API `no-store` responses, the service worker's exact-path feed-set policy, and metrics authentication.
- Feed validation and parsing use one aggregate `FEED_OVERALL_TIMEOUT_MS` budget across DNS, redirects, response streaming, retry delays, and retries. Per-attempt `FEED_TIMEOUT_MS` remains a narrower socket/fetch safeguard and is not renewed by redirects.
- Feed HTML is sanitized with DOMPurify before rendering.
- Long article HTML is truncated with DOM-aware logic so tags remain balanced.
- API responses use `Cache-Control: no-store`.
- The service-worker runtime URL pattern matches only the feed-set pathname
  `/api/feeds` and uses `NetworkOnly`, with no cache options or network-timeout
  fallback. It does not match `/api/feeds/validate`; browser-local same-day
  snapshots, not a PWA response cache, provide offline fallback.
- Production metrics require bearer authentication and always use `Cache-Control: no-store`.

## Deployment

The repository includes a multi-stage `Dockerfile` and a Traefik-ready `compose.yml`. Production deployments should put the app behind Traefik or an equivalent reverse proxy.

```bash
./scripts/deploy-compose.sh
docker compose -f compose.yml logs -f thedailyfeed
```

The wrapper derives `APP_VERSION` from `package.json` and `APP_COMMIT` from the
current Git commit before running Compose, so deployed logs retain source
metadata.

For production:

- Set `TRAEFIK_DOMAIN` and `TRAEFIK_CERT_RESOLVER`.
- Set `METRICS_AUTH_TOKEN` if you want operator metrics.
- Keep direct container access blocked; the app is not intended to be exposed directly to the public internet.
- Configure proxy-owned rate limits, request body limits, TLS, and access logging at the edge.
- Preserve streaming behavior for `POST /api/feeds?stream=1`; avoid proxy buffering on the app route.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full production guide.

## Project Layout

```text
thedailyfeed/
├── app/
│   ├── api/
│   │   ├── feeds/
│   │   ├── metrics/
│   │   └── test-feed/
│   ├── layout.tsx
│   ├── manifest.ts
│   └── page.tsx
├── components/
├── lib/
├── public/
├── scripts/
├── tests/
├── docs/
│   └── architecture-complexity-sweep.md
├── compose.yml
├── Dockerfile
├── DEPLOYMENT.md
├── TECHNICAL.md
└── env.template
```

## Additional Documentation

- [TECHNICAL.md](TECHNICAL.md): architecture, runtime contracts, security notes, and known constraints.
- [DEPLOYMENT.md](DEPLOYMENT.md): Docker, Compose, Traefik, reverse proxy, and operations guidance.
- [Architecture complexity sweep](docs/architecture-complexity-sweep.md): implemented simplifications, verification evidence, and deliberately deferred candidates.
