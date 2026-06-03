# Technical Documentation - The Daily Feed

This document reflects the current implementation as of June 3, 2026.

## System Overview

The Daily Feed is a Next.js App Router project with:

- A client-driven UI for feed rendering and management
- Node.js 24 LTS or newer as the supported server runtime
- Streaming feed retrieval with progressive per-feed updates
- User-timezone-aware "today" filtering on the server
- Per-feed in-memory cache (TTL-based)
- Client offline snapshot fallback in `localStorage`
- Structured logging and in-memory metrics

## Runtime Architecture

### Main UI Composition

- `app/page.tsx`
  - `ErrorBoundary`
  - `FeedManagerButton` (lazy-loads modal)
  - `FeedContent`
  - `OfflineIndicator`
  - `InstallPrompt`

### API Surface

- `POST /api/feeds` (`app/api/feeds/route.ts`)
  - Accepts `{ feedUrls: string[], timeZone?: string }`
  - Validates payload/URLs
  - Applies shared route admission and Request ID derivation
  - Uses a local/development fallback rate limiter; production ingress rate limiting is proxy-owned
  - Splits requested feeds into cached/missing sets
  - Supports JSON mode and NDJSON stream mode
- `POST /api/feeds/validate` (`app/api/feeds/validate/route.ts`)
  - Validates URL format and probes/parses feed
  - Applies the same shared route admission and Request ID policy as `POST /api/feeds`
- `GET /api/metrics` (`app/api/metrics/route.ts`)
  - Exposes in-memory request/cache metrics
  - Production exposure mode is `app-authenticated-operator`
  - Requires bearer auth in production when `METRICS_AUTH_TOKEN` is configured
  - Returns `404` in production when `METRICS_AUTH_TOKEN` is missing
- `GET /api/test-feed` (`app/api/test-feed/route.ts`)
  - Integration-test helper endpoint
  - Returns `404` in production

## Data Flow

1. `FeedContent` loads enabled feed config from `localStorage` (`lib/feed-storage.ts`)
2. Client resolves browser timezone and posts `{ feedUrls, timeZone }` to `/api/feeds`
3. API derives Request ID through `lib/request-context.ts`, then applies local/development admission checks
4. API normalizes timezone and splits feed URLs into cached + missing
5. In stream mode:
   - API emits `meta`
   - Emits cached feeds immediately as `feed_result` chunks (`status: cached`)
   - Parses missing feeds progressively and emits `feed_result` chunks (`status: success|timeout|error`)
   - Emits `done`
6. Client incrementally merges/sorts items, updates status badges, and persists snapshot
7. On request failures, client attempts same-day snapshot fallback from `localStorage`

## Observability and Logging

### Logger (`lib/logger.ts`)

- Environment-aware logger with:
  - level filtering (`LOG_LEVEL`)
  - output format (`LOG_FORMAT`: `json` or `pretty`)
  - service naming (`LOG_SERVICE_NAME`)
  - redact list (`LOG_REDACT_FIELDS`)
  - build metadata (`APP_VERSION`, `APP_COMMIT`)
- Server logs emit to stdout/stderr
  - production default: JSON
  - development default: pretty text
- Child logger contexts are used for request-scoped fields
- URL values in log context have credentials, query strings, and fragments redacted
- Raw client IPs are not included in feed route logger facts by default

### API Logging (`app/api/feeds/route.ts`)

- Logs request lifecycle events:
  - request start
  - validation failures
  - local/development rate-limit rejections
  - cache split/hit
  - stream enabled/stream completion
  - request completion and failure
- `X-Request-Id` header is returned to correlate user reports with logs
- Feed, validation, and metrics adapters use the shared Request ID policy
- Production public client IP logging belongs at the reverse proxy, not in app logs

### Metrics (`lib/metrics.ts` + `/api/metrics`)

- Exposure mode: `app-authenticated-operator`
  - production access requires `Authorization: Bearer <METRICS_AUTH_TOKEN>`
  - production without `METRICS_AUTH_TOKEN` returns `404`
  - invalid or missing bearer credentials with a configured token return `401`
  - responses use `Cache-Control: no-store`
  - responses emit `X-Request-Id` using the shared Request ID policy
- Response shape is an operator snapshot:
  - `metricsExposure` describes the access, cache, and Request ID policy
  - `feedApi` contains aggregate feed API metrics
  - `feedCache` contains cache size and redacted entry stats
- In-memory counters include:
  - total requests
  - cache hit rate
  - average duration / parse duration
  - total timeout/error feed counts
  - cache entry stats from `lib/feed-cache.ts`

## Caching Model

### Server Cache (`lib/feed-cache.ts`)

- Storage: in-memory `Map`
- Key: individual feed URL
- Entry fields:
  - `items`
  - `timestamp`
- Validity rule:
  - `age < FEED_CACHE_TTL_MS`
- Cleanup interval: `CACHE_CLEANUP_INTERVAL_MS`

Per-feed cache allows partial cache hits when feed sets change (add/remove feeds).

### Client Offline Snapshot Cache (`lib/offline-feed-cache.ts`)

- Storage: browser `localStorage`
- Key: sorted feed URL list + timezone
- Snapshot metadata:
  - timezone
  - dayKey
  - savedAt
  - serialized items
- Only same-day snapshots are reused

### Service Worker Runtime Caching (`next-pwa`)

Configured through the platform policy adapter in `next.config.ts` with runtime strategies, including:

- Fonts
- Images
- Static JS/CSS
- `/api/feeds` (NetworkOnly, sourced from `lib/platform-policy.ts` and preserving the Feed set route `Cache-Control: no-store` policy)

Verification note: `pnpm build` runs production compilation, then runs `scripts/verify-pwa-build.mts`. The contract requires `public/sw.js`, its referenced Workbox runtime assets, and an emitted runtime route that preserves the declared Feed set `/api/feeds` `NetworkOnly` policy from `lib/platform-policy.ts`.

PWA asset headers are explicit in `lib/platform-policy.ts` and adapted by `next.config.ts`: `/sw.js` and Workbox scripts are served as JavaScript with `no-cache, no-store, must-revalidate` and a worker-only CSP. `/manifest.webmanifest` is served as a web manifest with bounded revalidation, while `/_next/static/*` and `/_next/static/media/*` keep MIME sniffing disabled without changing Next's immutable asset caching.

## Feed Parsing Pipeline (`lib/rss.ts`)

### Key Behavior

- Uses `rss-parser` with configured timeout and headers
- Retries per feed (`FEED_RETRY_COUNT`, fallback `3`)
- Applies per-feed timeout (`FEED_OVERALL_TIMEOUT_MS`) via `withTimeout`
- Applies request-wide missing-feed timeout (`FEED_REQUEST_TIMEOUT_MS`) through the request orchestration layer
- Progressive parser yields feed results as they complete
- Supports bounded concurrency (`concurrency` option, default `4`)
- Supports cancellation via `AbortSignal`

### Output Processing

- Date parsing with `date-fns`
- Invalid-date items are skipped
- `filterTodayItems(items, timeZone)` filters using timezone day keys
- `sortByDate()` orders items newest-first

## Streaming Contract (`POST /api/feeds?stream=1`)

Response content type: `application/x-ndjson; charset=utf-8`

Chunk types:

- `meta`
  - `{ type, requestId, cached, timeZone, totalFeeds, completedFeeds }`
- `feed_result`
  - `{ type, requestId, cached, timeZone, feedUrl, status, itemCount, items, totalFeeds, completedFeeds }`
  - `status` is one of `cached`, `success`, `timeout`, `error`
- `done`
  - `{ type, requestId, cached, timeZone, totalFeeds, completedFeeds, totalItemCount }`
- `error`
  - `{ type, requestId, error }`

## Client-Side State and Events

### FeedContent (`components/feed-content.tsx`)

- State:
  - `items`
  - `loading`
  - `error`
  - `isCached`
  - `completedFeeds`
  - `totalFeeds`
  - `feedStatuses`
- Uses `AbortController` to cancel in-flight requests
- Parses NDJSON stream incrementally via `ReadableStream` + `TextDecoderStream`
- Displays per-feed loading status via `FeedFetchStatus`
- Persists snapshots on successful completion
- Uses snapshot fallback on fetch failure when available
- Listens for:
  - browser `storage` event
  - custom `feedsUpdated` event
- Auto-refreshes every hour

### Feed Manager

- `FeedManagerButton` lazy-loads `FeedManagerModal` via `next/dynamic`
- Modal handles CRUD and OPML import/export
- Add/edit operations call `POST /api/feeds/validate` before persisting
- After mutations, dispatches `feedsUpdated`

## Security

### Input and URL Validation

- API validates request shape and URL array
- Maximum feeds per request enforced
- URL validator allows only `http/https`
- Production SSRF guard blocks:
  - localhost
  - private, local, carrier-grade NAT, documentation, benchmarking, multicast, reserved, and other special-use IPv4 ranges
  - local, private, documentation, and multicast IPv6 ranges
  - IPv4-mapped non-global IPv6

### Content Safety

- Feed HTML is sanitized before rendering (`DOMPurify`)
- Long feed HTML is truncated with DOM-aware logic to preserve valid markup

### Request Protection

- Production deployments must run behind Traefik or an equivalent trusted reverse proxy
- The reverse proxy owns public client IP access logs, ingress rate limits, request body limits, TLS, and ingress timeouts
- Direct public internet exposure of the Next.js app container is unsupported
- The app retains outbound feed destination validation, feed fetch/parser timeout controls, feed HTML sanitization, API `no-store` behavior, PWA feed API `NetworkOnly` behavior, and production metrics auth
- In non-production, the app keeps an in-process fallback feed API limiter for local abuse testing

### Headers and Policies

- Common transport and MIME-sniffing headers are declared in `lib/platform-policy.ts` and applied through `next.config.ts`
- Browser-only app shell headers, including CSP, frame, referrer, and permissions policy, are scoped to the app shell
- API routes have explicit `Cache-Control: no-store` header policy and do not inherit app-shell CSP
- CSP image policy deliberately allows sanitized Feed article images via `img-src ... https: http:`
- CSP blocks rendered Feed article audio/video with `media-src 'none'`; the sanitizer does not allow audio or video tags

## Deployment and Operations

### Containerization

- Multi-stage Docker build (`Dockerfile`)
- Node.js 24 Alpine base image
- Standalone Next.js output used for runtime image
- Runs as non-root user in final image
- Compose hardens the runtime with a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, process/resource limits, graceful shutdown, and tmpfs runtime scratch/cache paths

### Compose / Traefik

- Runtime config in `compose.yml`
- `scripts/deploy-compose.sh` derives and exports `APP_VERSION` and `APP_COMMIT` before running Compose
- Forgejo CI runs lint, tests, Next/PWA build, and a daemonless Docker image build
- Container log rotation configured via Docker `json-file` logging driver
- Traefik labels parameterized via:
  - `TRAEFIK_DOMAIN`
  - `TRAEFIK_CERT_RESOLVER`
  - `TRAEFIK_RATE_LIMIT_AVERAGE`
  - `TRAEFIK_RATE_LIMIT_BURST`
  - `TRAEFIK_MAX_REQUEST_BODY_BYTES`
- Reverse proxies should avoid buffering the feed stream route so `POST /api/feeds?stream=1` can deliver per-feed progress as chunks are produced

### Environment

See `env.template` for supported variables. Key groups:

- Local/development rate limiting
- Feed fetching/retry/timeout/cache TTL/cache size
- Logging (`LOG_*`) and build metadata (`APP_*`)
- SSRF private-network toggle
- Traefik deployment parameters

## Testing

### Default

```bash
pnpm test
```

Runs test files with Node test runner and TS strip-types mode. Integration tests are skipped unless `RUN_INTEGRATION_TESTS=true`.

### Full Integration Mode

```bash
RUN_INTEGRATION_TESTS=true pnpm test
```

This mode starts a local Next.js dev server and exercises API endpoints (`/api/feeds`, `/api/feeds/validate`, stream mode, cache behavior, and rate limiting).

## Known Constraints

- Cache and metrics are in-memory and per-process
- Optimized for single-container deployments
- Feed preferences and offline snapshots are browser-local (not cross-device synced)
- Metrics are in-memory and reset on process restart
- `/api/feeds/validate` is unauthenticated and depends on the production reverse proxy for ingress controls; `/api/metrics` requires bearer auth in production
- Some upstream feeds can intermittently return malformed XML; retry logic reduces impact but cannot eliminate source-side errors

## Verification Commands

```bash
pnpm lint
pnpm test
pnpm build
```

`pnpm build` includes the PWA artifact contract; a missing service worker, missing referenced Workbox runtime asset, or missing declared `/api/feeds` `NetworkOnly` runtime route fails the build.

In restricted environments, `pnpm build` may require external network access for font fetch during build-time optimization.
