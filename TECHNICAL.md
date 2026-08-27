# Technical Documentation - The Daily Feed

This document reflects the 1.1.11 implementation as of August 28, 2026.

## System Overview

The Daily Feed is a Next.js App Router project with:

- Next.js 16.3.3 and React 19.2.8
- A client-driven UI for feed rendering and management
- Node.js 24 LTS as the supported server runtime
- Streaming feed retrieval with progressive per-feed updates
- User-timezone-aware "today" filtering on the server
- Per-feed in-memory cache (TTL-based)
- Client offline snapshot fallback in `localStorage`
- Structured logging and in-memory metrics

Feed subscriptions, including imported OPML entries, and offline snapshots
belong to the browser profile; OPML import/export runs client-side. The server
has no account or subscription database, and its feed cache and metrics are
process-local and disposable.

## Release Versioning

`package.json` is the sole release-version authority and accepts only stable
`MAJOR.MINOR.PATCH` SemVer. `pnpm version:check` validates that version and its
single expected marker in Compose, README, this document, and the deployment
guide. `pnpm version:bump <patch|minor|major>` first rejects invalid metadata or
existing drift, then increments `package.json` and synchronizes every marker.
The technical-document date is deliberately independent and is not changed by
the bump command.

Run the bump once after an eligible change set stabilizes and before the final
repository gate. CI runs `version:check` before compilation and tests, but only
enforces valid synchronized metadata; deciding whether a change is
release-worthy and which component it requires remains an agent/reviewer
judgment. Neither command grants permission to stage, commit, tag, push,
dispatch CI, or deploy.

## Runtime Architecture

### Module Seams

- Feed manager: `runFeedManagerOperation` in `lib/feed-storage.ts` owns one complete browser storage mutation. `lib/feed-manager-operations.ts` is a compatibility re-export, not a second implementation.
- Feed-set execution: `lib/feed-request.ts` owns cached and missing feed orchestration and emits `FeedProgressEvent<FeedItem>` values.
- Stream serialization: `lib/feed-response-adapter.ts` converts server `FeedItem` dates to the serialized `FeedProgressEvent<SerializedFeedItem>` wire representation.
- Stream validation: `lib/feed-stream-parser.ts` validates the untrusted JSON/NDJSON representation before it crosses into client lifecycle state.
- Client lifecycle: `lib/feed-set-lifecycle.ts` owns offline preview/fallback, progressive merging, terminal state, and persistence effects.

### Main UI Composition

- `app/page.tsx`
  - `ErrorBoundary`
  - `FeedContent`
    - `FeedManagerButton` (stateless floating trigger)
    - `FeedManagerModal` (lazy-loaded native dialog)
    - `FeedHeader`
    - progressive feed list and loading skeleton
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
  - Composes `request.signal` with one `FEED_OVERALL_TIMEOUT_MS` operation budget
  - Passes that signal through DNS validation, redirects, response streaming, retry delay, and both parse attempts
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
6. Client incrementally merges/sorts items, keeps the loading skeleton visible until the stream completes, updates feed-manager result state, and persists the snapshot
7. On request failures, client attempts same-day snapshot fallback from `localStorage` and marks that terminal state with a distinct refresh notice and aggregate retry action

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

### Service Worker Runtime Caching (Serwist)

Configured in the typed `app/sw.ts` worker through the platform policy adapter in
`lib/serwist-runtime-caching.ts`, with exactly two GET runtime routes:

- Same-origin exact-path `/api/feeds` first (`NetworkOnly`, with no cache options
  or network-timeout fallback, sourced from `lib/platform-policy.ts` and
  preserving the feed-set route's `Cache-Control: no-store` policy)
- Cross-origin requests whose browser request destination is `image`
  (`StaleWhileRevalidate`, bounded to 64 entries and one day)

The exact feed-set route is registered first, limited to same-origin GET requests,
and cannot match `/api/feeds/validate`. Serwist navigation caching is disabled;
browser-local same-day snapshots remain the only offline feed response path.
Build assets remain precached. There are no generic font, extension-based image,
JavaScript, CSS, Next image-optimizer, API, or page runtime routes.

Verification note: `pnpm build` runs production compilation, then runs
`scripts/verify-pwa-build.mts`. The contract requires a non-empty `public/sw.js`,
no stale `next-pwa` Workbox runtime asset, and an emitted runtime route that
preserves the declared feed-set `/api/feeds` `NetworkOnly` policy from
`lib/platform-policy.ts`, plus the named bounded cross-origin image cache.

PWA asset headers are explicit in `lib/platform-policy.ts` and adapted by
`next.config.ts`: `/sw.js` is served as JavaScript with `no-cache, no-store,
must-revalidate` and a worker-only CSP. That CSP keeps scripts and workers
same-origin while allowing Serwist's intercepted image fetches to connect over
HTTP(S) through `connect-src`; it does not add a redundant cross-origin worker
`img-src`. `/manifest.webmanifest` is served as a web manifest with bounded
revalidation, while `/_next/static/*` and `/_next/static/media/*` keep MIME
sniffing disabled without changing Next's immutable asset caching.

## Feed Parsing Pipeline (`lib/rss.ts`)

### Key Behavior

- Uses `rss-parser` after a bounded HTTP(S) fetch with configured headers
- Retries per feed (`FEED_RETRY_COUNT`, fallback `3`)
- Applies `FEED_TIMEOUT_MS` to each fetch attempt as a single budget spanning DNS resolution, all redirect legs, and response-body streaming
- Applies per-feed timeout (`FEED_OVERALL_TIMEOUT_MS`) via `withTimeout`, spanning retry delays and every attempt
- Applies request-wide missing-feed timeout (`FEED_REQUEST_TIMEOUT_MS`) through the request orchestration layer
- Progressive parser yields feed results as they complete
- Supports bounded concurrency (`concurrency` option, default `4`)
- Supports cancellation via `AbortSignal`

### Validation Operation Budget

`POST /api/feeds/validate` is a separate caller of `parseFeedWithRetry`. After request-body validation, the route creates its operation signal through `lib/feed-operation-budget.ts`:

- `request.signal` cancels outbound work when the inbound request is aborted
- `AbortSignal.timeout(FEED_OVERALL_TIMEOUT_MS)` limits connected callers to one aggregate validation budget
- `AbortSignal.any` gives DNS validation, redirects, response reads, retry delay, and both attempts the same cancellation source

The deadline is created once per route invocation and is never recreated at redirect or retry boundaries. Timeout and caller-abort failures retain the endpoint's existing generic `400` response so internal failure details are not exposed.

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
  - `refreshNotice` (`snapshot-fallback` only when a failed refresh uses a same-day snapshot)
  - `configuredFeedCount`
  - `enabledFeedCount`
  - `completedFeeds`
  - `totalFeeds`
  - `feedStatuses`
- Uses `AbortController` to cancel in-flight requests
- Parses NDJSON stream incrementally via `ReadableStream` + `TextDecoderStream`
- Displays the pulsing `FeedSkeleton` until initial results arrive and beneath progressively loaded items while more feeds remain pending
- Keeps per-feed lifecycle status out of the reading view while passing terminal results to the feed manager
- Keeps configured and enabled feed inventory counts across loading, completion, and failure so the reader can distinguish no configured feeds, no enabled feeds, and no items today
- Owns the manager open state, current feed inventory, and exact opening trigger; both the floating control and inline empty-state action use the same opener
- Keeps one stable polite reader status region, marks results busy during streaming, and announces progressive and terminal item counts while skeletons remain decorative
- Persists snapshots on successful completion
- Uses snapshot fallback on fetch failure when available
- Suppresses the generic cached badge for snapshot fallback, renders an explicit refresh-failure notice, and includes that notice in the stable reader announcement
- Listens for:
  - browser `storage` event
  - custom `feedsUpdated` event
- Auto-refreshes every hour

### FeedHeader (`components/feed-header.tsx`)

- Server rendering and the first client render use the deterministic `Today`
  label, so the UTC container and a browser in another timezone produce matching
  hydration markup
- A client effect replaces that label with the browser-local formatted date
  after hydration

### Feed Manager

- `FeedContent` lazy-loads `FeedManagerModal` via `next/dynamic` and passes its authoritative per-feed lifecycle statuses directly to the modal for load-result icons
- `FeedManagerButton` is a neutral, stateless trigger; `FeedContent` refreshes the current feed list from browser storage when either manager opener is used
- `FeedManagerModal` remains mounted while closed so draft add/edit fields survive reopening; Feed mutations flow back through `onFeedsChange`
- `FeedManagerModal` uses native `<dialog>.showModal()`: the platform owns Escape dismissal, focus containment, and inert background behavior; backdrop clicks dismiss, internal scrolling is contained, and `FeedContent` restores focus to the exact opener. The dialog has a definite safe-area-aware dynamic viewport block size so WebKit cannot collapse its column flex layout to the header's intrinsic height
- Add-feed and OPML controls are the manager's first sections and remain mounted behind native `<details>` disclosures; Add feed starts expanded only when no feeds are configured. The feed inventory follows those subscription workflows. Narrow layouts constrain each feed row to the dialog width, wrap otherwise unbroken names, and use the control-border token for visible card boundaries
- Add and edit are labelled native forms with required trimmed-field validation, linked inline errors, persistent form-level recovery messages, and one typed pending operation; entering edit moves focus into the form, while cancellation and successful save return focus to the feed-list heading; progress and success use one stable polite status region
- A validating add or edit form remains mounted and becomes `aria-busy`, with its fields read-only until that operation completes so a late keystroke cannot be lost
- Failed and timed-out feed rows include visible labels; one recovery banner calls the existing aggregate feed refresh, stays mounted while busy, announces progress through the stable status region, and returns focus to the feed-list heading
- Modal handles CRUD and client-side OPML import/export without a duplicate footer action or build-version label consuming mobile height
- `FeedDeleteActions` owns the row-level transition from the normal actions to an accessible Cancel/Delete confirmation group; mounting the safe Cancel action moves keyboard focus explicitly, cancellation restores the originating Delete button, confirmed deletion moves focus to the feed-list heading, and the destructive action uses light/dark theme danger tokens
- Add/edit operations call `POST /api/feeds/validate` before persisting
- `runFeedManagerOperation` in `lib/feed-storage.ts` loads once, applies and persists one mutation, derives mutation facts, and dispatches `feedsUpdated` only when the enabled feed set changes
- `lib/feed-manager-operations.ts` preserves the former import interface as a compatibility re-export

### Feed Stream Lifecycle

- `FeedProgressEvent<Item>` is the canonical progress interface for server `FeedItem` values and serialized client values; the response adapter owns Date-to-ISO serialization
- `useFeedStream` creates its initial feed-set lifecycle transition with a memoized pure initializer
- React state exposes the current read model, while refs retain transition state needed by asynchronous stream processing
- Lifecycle transitions, rather than component-local branching, own progressive results, offline fallback, completion, persistence effects, and persistent configured/enabled inventory counts

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
- Sanitized image `src` and link `href` values are resolved against the item's
  validated HTTP(S) article URL. Images retain only HTTP(S), links additionally
  allow `mailto:`, and relative URLs without a valid base plus scriptable or
  unsupported schemes fail closed.
- Images without publisher-provided alt text receive `alt=""`; provided alt text
  is preserved. Images without a valid source are removed, along with event
  handlers, inline styles, and `srcset`.
- Sanitized body links retain only `rel="nofollow"` and use normal same-tab navigation; article-title links use the same navigation behavior
- Sanitized `lang` values are canonicalized with `Intl.Locale`, `dir` is limited to `ltr`, `rtl`, or `auto`, and invalid values are discarded
- Embedded feed headings are normalized to `h3`–`h5` beneath each article title while preserving bounded source-relative depth

### Request Protection

- Production deployments must run behind Traefik or an equivalent trusted reverse proxy
- The reverse proxy owns public client IP access logs, ingress rate limits, request body limits, TLS, and ingress timeouts
- Direct public internet exposure of the Next.js app container is unsupported
- The app retains outbound feed destination validation, aggregate feed operation budgets, inbound-to-outbound cancellation, feed HTML sanitization, API `no-store` behavior, the PWA's exact-path feed-set `NetworkOnly` policy, and production metrics auth
- The unauthenticated validation route shares one cancellation signal across DNS, redirects, body streaming, retry delay, and retries; caller abort closes the active outbound request and prevents later attempts
- In non-production, the app keeps an in-process fallback feed API limiter for local abuse testing

### Headers and Policies

- Common transport and MIME-sniffing headers are declared in `lib/platform-policy.ts` and applied through `next.config.ts`
- Browser-only app shell headers, including CSP, frame, referrer, and permissions policy, are scoped to the app shell
- API routes have explicit `Cache-Control: no-store` header policy and do not inherit app-shell CSP
- CSP image policy deliberately allows sanitized Feed article images via `img-src ... https: http:`
- The separate worker CSP permits Serwist's HTTP(S) image fetches through
  `connect-src`; it keeps worker scripts same-origin and does not widen the page
  connection policy
- CSP blocks rendered Feed article audio/video with `media-src 'none'`; the sanitizer does not allow audio or video tags

## Deployment and Operations

### Containerization

- Multi-stage Docker build (`Dockerfile`)
- Multi-architecture Node.js 24.19.0 / Alpine 3.24.1 base image pinned by OCI
  index digest
- pnpm 11.24.0 pinned across repository metadata, the Docker build, and CI
- Standalone Next.js output used for runtime image
- Runs as non-root user in final image
- Compose hardens the runtime with a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, process/resource limits, graceful shutdown, and tmpfs runtime scratch/cache paths

### Dependency Toolchain Policy

- pnpm 11's default one-day package maturity check, exotic-subdependency
  blocking, and strict dependency-build behavior remain enabled.
- `pnpm-workspace.yaml` uses `allowBuilds` to allow the Serwist CLI's required
  `esbuild` binary setup while explicitly blocking `sharp` and `unrs-resolver`
  lifecycle scripts. Patched compatible transitive overrides keep full and
  production audits clear.
- Node stays on the reviewed Node 24 LTS line. `@types/node` stays on 24,
  TypeScript stays on 5.9, and ESLint stays on 9 until the corresponding Node
  26, TypeScript 7, and ESLint 10 integrations are supported by this Next.js
  toolchain.

### Compose / Traefik

- Runtime config in `compose.yml`
- `scripts/deploy-compose.sh` derives and exports `APP_VERSION` and `APP_COMMIT` before running Compose
- Forgejo workflows pin the checkout action by full SHA with credential
  persistence disabled. CI runs lint, tests, Next/PWA build, and a daemonless
  Docker image build.
- Container log rotation configured via Docker `json-file` logging driver
- Traefik labels parameterized via:
  - `TRAEFIK_DOMAIN`
  - `TRAEFIK_RATE_LIMIT_AVERAGE`
  - `TRAEFIK_RATE_LIMIT_BURST`
  - `TRAEFIK_MAX_REQUEST_BODY_BYTES`
- Reverse proxies should avoid buffering the feed stream route so `POST /api/feeds?stream=1` can deliver per-feed progress as chunks are produced
- Compose publishes no host port and joins the existing external `traefik_proxy` network; Traefik owns ingress and is not part of this application's lifecycle
- On SRV1, the `websecure` entrypoint owns TLS enablement, ACME, the unnamespaced `default` TLS profile, and the wildcard certificate; the application router does not declare a TLS section
- Offline checks do not activate production. Deployment uses `scripts/deploy-compose.sh` and affects only the `thedailyfeed` service; network, Traefik, and project-wide shutdown or pruning are separate operational boundaries

### Environment

See `env.template` for supported variables. Key groups:

- Local/development rate limiting
- Feed fetching/retry/timeout/cache TTL/cache size
- Logging (`LOG_*`) and build metadata (`APP_*`)
- SSRF private-network toggle
- Metrics bearer authentication
- Traefik deployment parameters

## Testing

### Default

```bash
pnpm test
```

Runs `.mts` test files through `tsx` and the Node test runner with serial test-file concurrency. Integration tests are skipped unless `RUN_INTEGRATION_TESTS=true`.

### Full Integration Mode

```bash
RUN_INTEGRATION_TESTS=true pnpm test
```

This mode starts a local Next.js dev server and exercises API endpoints (`/api/feeds`, `/api/feeds/validate`, stream mode, cache behavior, and rate limiting).

## Known Constraints

- Cache and metrics are in-memory and per-process
- Optimized for single-container deployments
- Feed preferences, imported OPML subscriptions, and offline snapshots are browser-local (not cross-device synced or server-backed)
- Metrics are in-memory and reset on process restart
- `/api/feeds/validate` is unauthenticated and depends on the production reverse proxy for ingress admission controls; admitted validation work is independently bounded by `FEED_OVERALL_TIMEOUT_MS` and inbound cancellation. `/api/metrics` requires bearer auth in production
- Some upstream feeds can intermittently return malformed XML; retry logic reduces impact but cannot eliminate source-side errors

## Architecture Review

The repository-wide complexity review and its verification evidence are recorded in [`docs/architecture-complexity-sweep.md`](docs/architecture-complexity-sweep.md). It also lists candidates that were deliberately deferred because their current seams earn locality or because a safe change requires stronger security or React race coverage.

## Verification Commands

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

`pnpm exec tsc --noEmit` checks both application code and `.mts` tests;
`allowImportingTsExtensions` is enabled because this project is typechecked
without emitting JavaScript. `pnpm build` performs Next.js production
typechecking and includes the PWA artifact contract; a missing or empty service
worker, a stale Workbox runtime asset, or a missing declared `/api/feeds`
`NetworkOnly` runtime route fails the build.

Next.js 16 uses Turbopack by default for `pnpm dev`. Production builds
intentionally pass `--webpack` because `@serwist/next` injects the typed service
worker through webpack.

In restricted environments, `pnpm build` may require external network access for font fetch during build-time optimization.
