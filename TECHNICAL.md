# Technical documentation for The Daily Feed

This document reflects the 1.2.8 implementation as of October 6, 2026.

## System overview

The Daily Feed uses Expo and React Native for its web application. Expo Metro
exports the client bundle. Next.js serves that export at `/` alongside the
existing App Router API routes. There is one reader implementation.

The supported server runtime is Node.js 24. The Expo package has its own locked
React and React Native dependencies in `mobile/package.json`. The root package
owns the server dependencies and release version.

The client uses progressive feed retrieval, timezone-aware today filtering,
and browser-local subscription and snapshot storage. The server keeps a bounded
per-feed memory cache, structured logs, and process-local metrics. There is no
account or subscription database. OPML import and export run in the browser.

This phase targets web only. Native builds, device networking, native storage,
and native accessibility need separate implementation and verification.

## Release versioning

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
release-worthy and which component it requires remains a maintainer decision.
The version commands only validate or update local release metadata.

## Runtime architecture

### Module ownership

- `mobile/App.tsx` composes the React Native reader, manager, recovery controls, and browser status.
- `mobile/src/FeedManager.tsx` owns manager operations and editor sessions. `mobile/src/manager/Form.tsx` owns drafts and validation messages.
- `mobile/src/manager/Modal.web.tsx` uses the browser dialog for focus containment and dismissal. `mobile/src/manager/transfer.web.tsx` owns OPML file selection and download.
- `mobile/src/useSubscriptions.ts` publishes the canonical `Feed[]` inventory. Its web adapter calls `runFeedManagerOperation` in `lib/feed-storage.ts` for complete storage mutations.
- `mobile/src/useReader.ts` owns cancellation, transport, and snapshot effects. `lib/feed-set-lifecycle.ts` owns progressive results, terminal state, and offline fallback.
- `lib/feed-load-activity.ts` derives shared activity and announcement copy for the reader and manager.
- `mobile/src/ArticleCard.tsx` renders article content with `@native-html/render`. `article-content.web.ts` runs DOMPurify and DOM normalization before the bounded parsed-tree renderer.
- `lib/types.ts` owns article and progress-event types. `lib/feed-response-adapter.ts` serializes server dates, and `lib/feed-stream-parser.ts` validates untrusted wire data.
- `lib/feed-request.ts` owns cached and missing feed orchestration. The backend retrieval and safety pipeline remains shared by feed loading and validation.

### Main UI composition

`mobile/App.tsx` mounts a React Native safe-area provider, bundled fonts, and an
error boundary. The reader contains the header, progress, article cards, empty
and recovery states, and the floating manager trigger. The manager stays
mounted when dismissed so drafts survive reopening. `BrowserStatus.web.tsx`
owns browser install and connection notices. `register-worker.web.ts` registers
`/sw.js` in production.

### Build and hosting

`scripts/build-expo-web.mjs` exports Metro output into `public/expo`, adds document
metadata and manifest links, and records revisioned shell assets in
`.expo-precache.json`. The root build then compiles Next and injects those assets
into the Serwist worker. `next.config.ts` rewrites `/`, `/_expo/*`, and `/assets/*`
to the exported files. Next does not render the reader.

`scripts/dev.mjs` starts Metro and Next together. Next proxies the Expo document
and development assets while serving `/api/*` locally. Open the Next origin,
`http://localhost:3000` by default. The reader always uses same-origin API URLs.
Development does not register the production worker.

### API endpoints

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

## Data flow

1. `useSubscriptions` reads the canonical `rss-feeds` inventory. `useReader` receives enabled feeds and the full configured count.
2. Client resolves browser timezone and posts `{ feedUrls, timeZone }` to `/api/feeds`
3. API derives Request ID through `lib/request-context.ts`, then applies local/development admission checks
4. API normalizes timezone and splits feed URLs into cached + missing
5. In stream mode:
   - API emits `meta`
   - Emits cached feeds immediately as `feed_result` chunks (`status: cached`)
   - Parses missing feeds progressively and emits `feed_result` chunks (`status: success|timeout|error`)
   - Emits `done`
6. Client replaces any snapshot preview with the first network result, then merges and sorts later results. Progress remains visible while loading. A `done` event saves the resulting snapshot, including partial or empty results. Bare stream closure ends loading without saving and leaves unfinished sources **Not checked**
7. On request failures, client attempts same-day snapshot fallback from `localStorage` and marks that terminal state with a distinct refresh notice and aggregate retry action

## Observability and logging

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

### API logging (`app/api/feeds/route.ts`)

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

## Caching model

### Server cache (`lib/feed-cache.ts`)

- Storage: in-memory `Map`
- Key: individual feed URL
- Entry fields:
  - `items`
  - `timestamp`
- Validity rule:
  - `age < FEED_CACHE_TTL_MS`
- Cleanup interval: `CACHE_CLEANUP_INTERVAL_MS`

Per-feed cache allows partial cache hits when feed sets change (add/remove feeds).

### Client offline snapshot cache (`lib/offline-feed-cache.ts`)

- Storage: browser `localStorage` under `rss-offline-feed-snapshots-v1`
- Key: sorted feed URL list + timezone
- Snapshot metadata:
  - timezone
  - dayKey
  - savedAt
  - serialized items
- Only snapshots for the requested feed set, timezone, and current day are reused
- Storage is bounded to 20 snapshots, 256,000 bytes per snapshot, and 1,500,000 bytes overall
- Size limits can trim articles; quota failures can evict older snapshots
- Day expiry prevents reuse but does not immediately delete stored records

### Service worker runtime caching (Serwist)

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
The Expo root document, JavaScript, bundled fonts, icons, and manifest are
revisioned precache entries. There are no generic font, extension-based image,
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
revalidation, while exported Metro assets and Next static assets keep MIME sniffing disabled.
Hashed Metro JavaScript uses immutable caching.

## Feed parsing pipeline (`lib/rss.ts`)

### Key behavior

- Uses `rss-parser` after a bounded HTTP(S) fetch with configured headers
- Retries per feed (`FEED_RETRY_COUNT`, fallback `3`)
- Applies `FEED_TIMEOUT_MS` to each fetch attempt as a single budget spanning DNS resolution, all redirect legs, and response-body streaming
- Applies per-feed timeout (`FEED_OVERALL_TIMEOUT_MS`) via `withTimeout`, spanning retry delays and every attempt
- Applies request-wide missing-feed timeout (`FEED_REQUEST_TIMEOUT_MS`) through the request orchestration layer
- Progressive parser yields feed results as they complete
- Supports bounded concurrency (`concurrency` option, default `4`)
- Supports cancellation via `AbortSignal`

### Validation operation budget

`POST /api/feeds/validate` is a separate caller of `parseFeedWithRetry`. After request-body validation, the route creates its operation signal through `lib/feed-operation-budget.ts`:

- `request.signal` cancels outbound work when the inbound request is aborted
- `AbortSignal.timeout(FEED_OVERALL_TIMEOUT_MS)` limits connected callers to one aggregate validation budget
- `AbortSignal.any` gives DNS validation, redirects, response reads, retry delay, and both attempts the same cancellation source

The deadline is created once per route invocation and is never recreated at redirect or retry boundaries. Timeout and caller-abort failures retain the endpoint's existing generic `400` response so internal failure details are not exposed.

### Output processing

- Date parsing with `date-fns`
- Invalid-date items are skipped
- `filterTodayItems(items, timeZone)` filters using timezone day keys
- `sortByDate()` orders items newest-first

## JSON response contract

`POST /api/feeds` accepts `{ feedUrls: string[], timeZone?: string }` and returns
`{ items, cached, timeZone }`. Each item has `title`, `link`, an ISO-string
`pubDate`, and `source`, with optional `description` and `contentHtml`.
`cached` means the entire requested set came from the server cache.

The route accepts 1-50 input entries before normalizing and deduplicating HTTP(S)
URLs. An empty array returns HTTP 400 without consulting the cache. Missing or
invalid timezone values become `UTC`.

JSON responses contain no per-feed outcomes. The client's JSON fallback assigns
an aggregate success or cached status to each requested source, so row statuses
cannot establish individual source success in this mode. NDJSON carries that
detail. Both modes return `X-Request-Id` and use `Cache-Control: no-store`.
Errors before streaming starts, including invalid JSON, rejected input, and
local rate limits, return ordinary non-2xx JSON responses.

## Streaming contract (`POST /api/feeds?stream=1`)

The `stream=1` query or an `Accept` header containing `application/x-ndjson`
selects streaming. Each newline-delimited JSON object uses the following contract.
The response content type is `application/x-ndjson; charset=utf-8`.

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

A `feed_result` completes one source, including an error or timeout. `done`
means feed-set processing ended, not that every source succeeded. A terminal
`error` can arrive after HTTP 200 because response headers are already sent.
Clients must handle it and unexpected stream closure separately from `done`.
`cached` has the same whole-request meaning in every chunk. Individual cache
hits use `feed_result.status: cached`. `totalFeeds` counts unique normalized
URLs; `completedFeeds` counts emitted results, including failures and timeouts.

## Client state and events

### Reader composition and activity

`mobile/App.tsx` consumes `useSubscriptions` and `useReader`. The same manager
opens from the floating control or the empty-state action. The web dialog
restores focus to its opening control after dismissal.

`getFeedLoadActivity` derives presentation from lifecycle state without fetching
or persisting data. Reader and manager controls use the same outcomes.

| State | Reader feedback |
| --- | --- |
| `loading` | Loading or refreshing feeds, with progress and retained articles. |
| `empty` | No subscriptions or all subscriptions disabled. |
| `ready` | Today's article count and a completion announcement. |
| `partial` | Some feeds could not load, with retry. |
| `interrupted` | The stream ended with unchecked sources, with retry. |
| `fallback` | Refresh failed and a matching same-day snapshot is available. |
| `failed` | The request failed without a usable snapshot, with retry. |

Three decorative article placeholders appear during loading. The header keeps
a compact progress line. Only the active reader or manager announces feed
activity. Subscription operation messages use a separate status region.

### Feed manager

The manager uses React Native controls for add, edit, enable, disable, delete,
validation, progress, and retry. Browser adapters provide the native dialog and
OPML file controls. Drafts survive dismissal and validation errors. Add and edit
validate against `/api/feeds/validate`, including name-only edits.

`runFeedManagerOperation` checks the 50-feed capacity limit and rereads storage
after asynchronous validation. Disabled feeds count toward capacity. Existing
oversized inventories are preserved. Writes complete before success is reported.
Storage failure retains the previous inventory and leaves the draft available
for retry. Edit responses carry a session identity so an old response cannot
close a newer editor.

Import skips duplicate and invalid URLs and reports entries over the limit.
Export includes the saved inventory. Both use `lib/opml.ts` in the browser.
Delete requires confirmation. The modal owns Escape dismissal, background
inertness, and focus containment through `<dialog>.showModal()`.

### Feed stream lifecycle

`useReader` starts after subscription loading, when the enabled URL set changes,
and on explicit refresh. It aborts superseded requests and ignores obsolete
results. Subscription names and disabled-only inventory changes do not trigger
a feed request. Cross-tab storage notifications are scoped to subscriptions.
There is no hourly refresh timer. An open edition remains visible across midnight
until a later retrieval applies the current date.

The transport accepts up to 32 MiB of response bytes, decodes split UTF-8, and
supports validated JSON fallback. This client resource limit also bounds an
unfinished stream record. It is not a guarantee that every possible server
response fits: serialization can repeat metadata and expand escaped content.
A stream `done` or validated JSON response produces a
snapshot persistence effect, including partial or empty results. Bare stream
closure ends loading without saving. Unfinished sources appear as **Not checked**.
Storage errors leave network results readable.

Web subscriptions retain `rss-feeds`, including IDs, names, dates, order, and
disabled records. Web snapshots retain `rss-offline-feed-snapshots-v1` and its
multiple-feed-set retention policy. An existing empty subscription array stays
empty. When the canonical key is absent, a valid old Expo proof configuration
can seed feed records. Its backend address and snapshot are not imported.

## Security

### Input and URL validation

- API validates request shape and URL array
- Maximum feeds per request enforced
- URL validator allows only `http/https`
- Production SSRF guard blocks:
  - localhost
  - private, local, carrier-grade NAT, documentation, benchmarking, multicast, reserved, and other special-use IPv4 ranges
  - local, private, documentation, multicast, and deprecated site-local IPv6 ranges
  - IPv4-mapped, IPv4-compatible, NAT64, 6to4, and SIIT embeddings of non-global IPv4

### Content safety

- Feed HTML is sanitized before rendering (`DOMPurify`)
- If `window` is missing, rendering returns empty markup instead of unsanitized HTML
- Long feed HTML is truncated with DOM-aware logic to preserve valid markup
- Sanitized image `src` and link `href` values are resolved against the item's
  validated HTTP(S) article URL. Images retain only HTTP(S), links additionally
  allow `mailto:`, and relative URLs without a valid base plus scriptable or
  unsupported schemes fail closed.
- HTTP(S) image and link destinations whose host is localhost or a loopback,
  link-local, or private IP literal are dropped. IPv6 embeddings of non-global
  IPv4 use the same special-use table as feed fetching.
- Images without publisher-provided alt text receive `alt=""`; provided alt text
  is preserved. Images without a valid source are removed, along with event
  handlers, inline styles, and `srcset`.
- Sanitized body links retain only `rel="nofollow"` and use normal same-tab navigation; article-title links use the same navigation behavior
- Sanitized `lang` values are canonicalized with `Intl.Locale`, `dir` is limited to `ltr`, `rtl`, or `auto`, and invalid values are discarded
- Embedded feed headings are normalized to `h3`–`h5` beneath each article title while preserving bounded source-relative depth

### Request protection

- Production deployments must run behind a trusted reverse proxy
- The reverse proxy owns public client IP access logs, ingress rate limits, request body limits, TLS, and ingress timeouts
- Direct public internet exposure of the Next.js app container is unsupported
- The app retains outbound feed destination validation, aggregate feed operation budgets, inbound-to-outbound cancellation, feed HTML sanitization, API `no-store` behavior, the PWA's exact-path feed-set `NetworkOnly` policy, and production metrics auth
- Feed JSON routes reject a `Content-Length` larger than 1 MiB with status `413` and `Cache-Control: no-store`
- The unauthenticated validation route shares one cancellation signal across DNS, redirects, body streaming, retry delay, and retries; caller abort closes the active outbound request and prevents later attempts
- In non-production, the app keeps an in-process fallback feed API limiter for local abuse testing

### Headers and policies

- Common transport and MIME-sniffing headers are declared in `lib/platform-policy.ts` and applied through `next.config.ts`
- Browser-only app shell headers, including CSP, frame, referrer, and permissions policy, are scoped to the app shell
- API routes have explicit `Cache-Control: no-store` header policy and do not inherit app-shell CSP
- CSP image policy deliberately allows sanitized Feed article images via `img-src ... https: http:`
- The separate worker CSP permits Serwist's HTTP(S) image fetches through
  `connect-src`; it keeps worker scripts same-origin and does not widen the page
  connection policy
- CSP blocks rendered Feed article audio/video with `media-src 'none'`; the sanitizer does not allow audio or video tags

## Deployment and operations

### Containerization

- Multi-stage Docker build (`Dockerfile`)
- Multi-architecture Node.js 24.19.0 / Alpine 3.24.1 base image pinned by OCI
  index digest
- pnpm 11.24.0 pinned across repository metadata, the Docker build, and CI
- Standalone Next.js output used for runtime image
- Runs as non-root user in final image
- Compose hardens the runtime with a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, process/resource limits, graceful shutdown, and tmpfs runtime scratch/cache paths

### Dependency toolchain policy

- pnpm 11's default one-day package maturity check, exotic-subdependency
  blocking, and strict dependency-build behavior remain enabled.
- `pnpm-workspace.yaml` uses `allowBuilds` to allow the Serwist CLI's required
  `esbuild` binary setup while explicitly blocking `sharp` and `unrs-resolver`
  lifecycle scripts. Transitive overrides pin compatible fixes for selected
  dependencies.
- Node stays on the reviewed Node 24 LTS line. `@types/node` stays on 24,
  TypeScript stays on 5.9, and ESLint stays on 9 until the corresponding Node
  26, TypeScript 7, and ESLint 10 integrations are supported by this Next.js
  toolchain.

### Containers and GitHub Actions

- `compose.yml` is a portable, hardened source-build default with loopback-only
  port publication and a normal Compose-managed network.
- `scripts/deploy-compose.sh` derives source metadata and starts only the app.
- GitHub-hosted CI is the sole Actions workflow and runs
  `scripts/verify-ci.sh`: frozen install, version check, lint, TypeScript, unit
  tests for both packages, Expo export, Next/PWA build, synthetic browser checks,
  production offline-runtime checks, and an unpublished Docker build.
- Actions are pinned by commit SHA with credential persistence disabled.
  CI has no production credentials and does not deploy.
- Deployments use the Compose wrapper with the selected source revision and
  installation configuration. The wrapper derives metadata and invokes Compose;
  release selection, backups, health checks, and recovery are separate deployment
  tasks. See [DEPLOYMENT.md](DEPLOYMENT.md).
- Reverse proxies own TLS and ingress limits and must disable response buffering
  for progressive NDJSON. The portable host-installed Nginx example hides metrics
  at ingress while the application retains bearer authentication.
- Custom Compose configuration can adapt the network and proxy topology while
  preserving runtime hardening. Keep host-specific configuration out of version
  control.

### Environment

See `env.template` for supported variables. Key groups:

- Local/development rate limiting
- Feed fetching/retry/timeout/cache TTL/cache size
- Logging (`LOG_*`) and build metadata (`APP_*`)
- SSRF private-network toggle
- Metrics bearer authentication
- Loopback host port (`APP_PORT`) and container timezone (`TZ`)

### Browser subscriptions and typography

Manual additions check the 50-feed inventory limit before validation and again
against current storage after validation. Disabled feeds count toward the limit;
existing oversized inventories are retained. OPML attributes escape XML quotes,
ampersands and angle brackets. Subscription writes throw `FeedStorageError` so
all manager mutations retain their previous state on failure and emit no success
or `feedsUpdated` event. Cleanup writes during reading are best effort: valid
records already parsed are still returned. Browser storage formats are unchanged.

Roboto Serif weights 400 through 700 load through `expo-font` from bundled
licensed assets. Builds and reading do not request Google Fonts. React Native
styles use the original reader palette and typography.

## Testing

`mise.toml` owns tool versions and common tasks. Run commands from the repository
root. [CONTRIBUTING.md](CONTRIBUTING.md#browser-verification-and-screenshots)
describes browser setup and synthetic screenshot updates.

| Command | What it verifies |
| --- | --- |
| `mise run test` | Serial Node/tsx tests in `tests/`; API integration cases are skipped by default. |
| `mise run integration` | The same tests with `RUN_INTEGRATION_TESTS=true`, including API requests against a local Next.js dev server. |
| `mise run lint` | ESLint checks. |
| `mise run typecheck` | Root and Expo application types without JavaScript emission. |
| `mise run version-check` | Stable release version and synchronized markers. |
| `mise run bench-feed-latency` | Local synthetic RSS. Cold-cache time to the stream `done` event. Not part of `mise run verify`. |
| `mise run build` | Expo web export, Next production webpack compilation, and emitted PWA artifact contracts. |
| `mise run browser` | Playwright against production output in desktop and narrow viewports. |
| `npm test --prefix mobile` | Expo transport, article, and browser-profile unit tests. |
| `STYLE_TARGET_URL=http://localhost:3000 npm run verify:style --prefix mobile` | Sealed original-reader pixel comparison for selected states, viewports, and themes. Requires a running production server. |
| `pnpm verify:web-runtime` | Installed-worker upgrade, retained subscriptions, actual offline reload, bundled fonts, snapshot rejection, and empty API caches. |
| `mise run verify` | Locked installs, Compose validation, metadata, lint, types, both unit suites, build, browser checks, offline runtime, and an unpublished Docker image. It does not enable API integration mode. |

The browser suite uses fresh storage, intercepted synthetic feed responses,
blocked external requests, and blocked service workers. It covers reader layout,
hostile HTML, progressive loading, refresh failures, saved fallback, interrupted
streams, manager forms and focus, subscription failures and retry, and OPML
round trips. Loading cases also cover dark appearance and reduced motion.
Python 3 independently parses exported OPML in the Node tests.

`pnpm verify:web-runtime` exercises the emitted worker in a browser with service
workers enabled. It upgrades a synthetic installed predecessor by default.
`RUNTIME_PREVIOUS_URL` selects a running previous production build for a real
worker upgrade. The check retains canonical subscriptions and snapshots, reloads
the app with the browser offline, checks bundled fonts, rejects stale and
unrelated snapshots, and confirms that API responses are absent from caches.

The isolated UI suite and runtime check do not prove live publisher behavior,
production proxy configuration, native devices, or every browser's install UI.
See the migration evidence for the checks run against a particular revision.

Production builds use webpack for Serwist injection after the Metro export.
Development uses Metro for the client and Next's development server for APIs.
Bundled fonts eliminate font-provider network access during the build.

## Known constraints

- Cache and metrics are in-memory and per-process
- Optimized for single-container deployments
- Feed preferences, imported OPML subscriptions, and offline snapshots are browser-local (not cross-device synced or server-backed)
- Metrics are in-memory and reset on process restart
- `/api/feeds/validate` is unauthenticated and depends on the production reverse proxy for ingress admission controls; admitted validation work is independently bounded by `FEED_OVERALL_TIMEOUT_MS` and inbound cancellation. `/api/metrics` requires bearer auth in production
- Some upstream feeds return malformed XML; retries cannot eliminate source-side errors
- Refresh requests can reuse the server cache and do not force a publisher fetch
- Known product and UI discrepancies are recorded in [architecture decisions](docs/architecture-decisions.md#known-implementation-gaps)

## Architecture decisions

[Architecture decisions](docs/architecture-decisions.md) explains the module
boundaries for feed management, progress events, network validation, and client
lifecycle state.
