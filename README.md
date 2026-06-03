# The Daily Feed

A minimalist RSS reader built with Next.js App Router.

The app fetches a user-configurable set of feeds, filters items to the user's local "today", and renders results progressively as each feed completes.

## What It Does

- Shows only items published "today" in the user's timezone
- Streams feed results progressively so items appear while loading
- Supports feed CRUD (add, edit, delete, enable/disable)
- Validates feed URLs by probing/parsing before add/edit
- Supports OPML import/export
- Caches feed results in-memory per feed URL on the server
- Persists offline snapshots in browser `localStorage` for fallback
- Truncates long article HTML safely without breaking tag structure
- Applies SSRF guards, HTML sanitization, and per-IP rate limiting on feed APIs
- Emits structured server logs with request correlation
- Exposes bearer-protected runtime metrics (`GET /api/metrics`) in production
- Supports installable PWA behavior with verified service-worker build output and offline-aware UI messaging

## Architecture Summary

- UI: `app/page.tsx` composes `FeedContent`, `FeedManagerButton`, `OfflineIndicator`, `InstallPrompt`, wrapped by `ErrorBoundary`
- Feed storage: client-side `localStorage` via `lib/feed-storage.ts`
- Main API: `POST /api/feeds` in `app/api/feeds/route.ts`
- Validation API: `POST /api/feeds/validate` in `app/api/feeds/validate/route.ts`
- Metrics API: `GET /api/metrics` in `app/api/metrics/route.ts`
- Feed pipeline: `lib/rss.ts` (parse/retry/timeout/progressive parse/filter/sort)
- Cache: `lib/feed-cache.ts` (in-memory TTL, per-feed granularity)
- Offline snapshots: `lib/offline-feed-cache.ts`
- Logging: `lib/logger.ts` (structured server logs, redaction, env-based level/format)
- PWA: `next-pwa` config in `next.config.ts` + `app/manifest.ts`

## Tech Stack

- Next.js 16.2.6 (App Router, Turbopack dev, webpack production build for `next-pwa`)
- TypeScript (strict mode)
- React 19.2.6
- Tailwind CSS v4
- `rss-parser`, `date-fns`, `dompurify`
- `next-pwa`

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- pnpm

### Local Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### Quality Checks

```bash
pnpm lint
pnpm test
pnpm build
```

`pnpm build` runs production compilation and then verifies the emitted PWA service-worker contract.

## Key Behavior

### Feed Request Flow

1. Client reads enabled feed URLs from `localStorage`
2. Client posts to `POST /api/feeds` with `{ feedUrls, timeZone }`
3. API validates, normalizes, and dedupes payload URLs, then applies per-IP rate limiting
4. API splits request into cached feeds and missing feeds (per-feed cache)
5. In stream mode, API emits NDJSON chunks for cached feeds immediately, then for fetched feeds as they complete
6. Fetched feed results are filtered to user's timezone "today", sorted newest-first, and successful feeds are cached
7. Client updates list incrementally and shows per-feed load status badges
8. Client saves successful results to offline snapshot storage

### Streaming Protocol (`POST /api/feeds?stream=1`)

`Accept: application/x-ndjson` (or `?stream=1`) enables stream mode.

Chunk types:

- `meta` (`cached` indicates whether the full request is cache-served)
- `feed_result` (`status: cached | success | timeout | error`)
- `done` (`cached` reflects full-request cache status)
- `error`

`X-Request-Id` is returned for log correlation.

### Caching

- Server cache key: individual feed URL (per-feed cache)
- Cache validity: TTL (`FEED_CACHE_TTL_MS`)
- Cache size: max entry cap (`FEED_CACHE_MAX_ENTRIES`)
- Mixed requests can return cached and freshly fetched feed data in one response
- Feed set API responses return `Cache-Control: no-store`, declared in `lib/platform-policy.ts`
- Service worker runtime cache pins `/api/feeds` to `NetworkOnly` from the same platform policy so Feed set responses are not stored by Workbox
- Header policy is split by surface in `lib/platform-policy.ts` and adapted by `next.config.ts`: app-shell CSP, API `no-store`, service-worker/Workbox script headers, manifest headers, and static asset headers

### Timezone-Aware "Today"

- Client sends browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
- API normalizes timezone and filters items by that day key
- This avoids server-timezone drift when users are in different locales

### Offline Expectations

- The app is installable when browser criteria are met; `pnpm build` verifies `public/sw.js`, referenced Workbox runtime assets, and the declared Feed set `/api/feeds` `NetworkOnly` runtime route
- Feed article images remain an explicit app-shell CSP allowance (`img-src ... https: http:`); audio/video embeds are blocked by `media-src 'none'`
- Client stores same-day snapshots per feed-set+timezone key in `localStorage`
- On request failure, latest valid snapshot is used as fallback when available
- New feed updates are not available while fully offline

## Configuration

Copy `env.template` to `.env.local` for local development and adjust as needed.

Important variables:

- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_WINDOW_MS`
- `FEED_TIMEOUT_MS`
- `FEED_RETRY_COUNT` (default fallback: `3`)
- `FEED_OVERALL_TIMEOUT_MS`
- `FEED_CACHE_TTL_MS`
- `FEED_CACHE_MAX_ENTRIES`
- `LOG_LEVEL`
- `LOG_FORMAT`
- `LOG_SERVICE_NAME`
- `LOG_REDACT_FIELDS`
- `APP_VERSION`
- `APP_COMMIT`
- `ALLOW_PRIVATE_NETWORKS`
- `TRAEFIK_DOMAIN`
- `TRAEFIK_CERT_RESOLVER`

All numeric env values are parsed with safe fallbacks in `lib/constants.ts`.

## API Endpoints

- `POST /api/feeds`
  - Body: `{ feedUrls: string[], timeZone?: string }`
  - JSON response: `{ items, cached, timeZone }`
  - Stream response (NDJSON) when `Accept: application/x-ndjson` or `?stream=1`
- `POST /api/feeds/validate`
  - Body: `{ url: string }`
  - Validates URL shape and attempts to parse feed
  - Applies the same per-IP rate limiting headers as `POST /api/feeds`
- `GET /api/metrics`
  - Returns in-memory counters for feed API and cache stats with feed URLs redacted
  - Requires `Authorization: Bearer <METRICS_AUTH_TOKEN>` in production
- `GET /api/test-feed`
  - Development-only feed source used by integration tests (`404` in production)

## Testing

`pnpm test` runs the Node test suite. Full API integration tests are gated behind `RUN_INTEGRATION_TESTS=true`.

To run real API integration tests that start a local dev server:

```bash
RUN_INTEGRATION_TESTS=true pnpm test
```

## Deployment

For Docker + Traefik deployment, use `compose.yml`:

```bash
docker compose -f compose.yml up -d
docker compose -f compose.yml logs -f thedailyfeed
```

Compose includes log rotation via Docker's `json-file` driver (`max-size=10m`, `max-file=5`).

See `DEPLOYMENT.md` for full deployment details.

## Project Structure

```text
thedailyfeed/
├── app/
│   ├── api/
│   │   ├── feeds/route.ts
│   │   ├── feeds/validate/route.ts
│   │   ├── metrics/route.ts
│   │   └── test-feed/route.ts
│   ├── layout.tsx
│   ├── manifest.ts
│   └── page.tsx
├── components/
├── lib/
├── tests/
├── compose.yml
├── DEPLOYMENT.md
├── Dockerfile
├── env.template
├── next.config.ts
└── TECHNICAL.md
```

## Security

- XSS mitigation via content sanitization
- SSRF guardrails for private/local addresses (IPv4 + IPv6)
- In-memory per-IP rate limiting with response headers on `POST /api/feeds`
- Security headers configured in `next.config.ts`
- CSP allows remote article images over `http/https` for feed content rendering

For a point-in-time security assessment, see `security_best_practices_report.md`.
