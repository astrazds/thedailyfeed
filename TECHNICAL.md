# Technical Documentation - The Daily Feed

This document reflects the 1.2.0 implementation as of September 11, 2026.

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
release-worthy and which component it requires remains a maintainer decision.
The version commands only validate or update local release metadata.

## Runtime Architecture

### Module ownership

- Feed manager: `runFeedManagerOperation` in `lib/feed-storage.ts` owns complete browser storage mutations and returns the saved inventory, plus a required summary for imports.
- Manager UI: `feed-manager-modal.tsx` owns dialog composition and focus. `feed-manager-form.tsx` owns drafts and validation; `use-feed-manager-actions.ts` owns asynchronous operations and messages. List and transfer components own their respective controls.
- Article types: `lib/types.ts` owns `FeedItem` and derives `SerializedFeedItem` by replacing its date with a string.
- Feed-set execution: `lib/feed-request.ts` owns cached and missing feed orchestration and emits `FeedProgressEvent<FeedItem>` values.
- Stream serialization: `lib/feed-response-adapter.ts` converts server `FeedItem` dates to the serialized `FeedProgressEvent<SerializedFeedItem>` wire representation.
- Stream validation: `lib/feed-stream-parser.ts` validates the untrusted JSON/NDJSON representation before it crosses into client lifecycle state.
- Client lifecycle: `lib/feed-set-lifecycle.ts` owns offline preview/fallback, progressive merging, terminal state, and persistence effects. `components/use-feed-stream.ts` owns network, storage, and React effects.
- Loading presentation: `lib/feed-load-activity.ts` derives shared activity and announcement copy. `components/feed-activity.tsx` renders copy and progress. Reader and manager components own recovery controls and announcement routing.

### Main UI Composition

- `app/page.tsx`
  - `ErrorBoundary`
  - `FeedContent`
    - `FeedManagerButton` (stateless floating trigger)
    - `FeedManagerModal` (lazy-loaded native dialog)
    - `FeedHeader`
    - progressive article list and initial loading skeletons
  - `OfflineIndicator`
  - `InstallPrompt`

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

## Data Flow

1. `useFeedStream` loads enabled feed config from `localStorage` (`lib/feed-storage.ts`)
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
- Only snapshots for the requested feed set, timezone, and current day are reused
- Storage is bounded to 20 snapshots, 256,000 bytes per snapshot, and 1,500,000 bytes overall
- Size limits can trim articles; quota failures can evict older snapshots
- Day expiry prevents reuse but does not immediately delete stored records

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

## Streaming Contract (`POST /api/feeds?stream=1`)

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

`FeedContent` consumes `useFeedStream` and owns the manager's open state,
current inventory, and exact opening trigger. The floating control and inline
empty-state action use the same opener. `FeedContent` restores focus there when
the native dialog closes.

`getFeedLoadActivity` in `lib/feed-load-activity.ts` derives one presentation
state from the lifecycle read model. It does not fetch or persist data.
`FeedActivity` renders copy and progress in the header and manager, excluding
`empty`. The reader uses dedicated failure and snapshot-fallback panels in
`FeedContent`; the manager uses `FeedActivity` for those states. Recovery controls
belong to `FeedContent`, `FeedHeader`, and `FeedManagerList`.

| State | Reader feedback |
| --- | --- |
| `loading` | **Loading feeds** without articles or **Refreshing feeds** with visible articles. The count includes successful, cached, failed, and timed-out results. |
| `empty` | **No feeds yet** or **No feeds enabled**, based on the saved inventory. |
| `ready` | **All feeds checked**, with today's item count. |
| `partial` | **Some feeds could not load**, with a retry action. |
| `interrupted` | **Feed loading interrupted**, with the number of unfinished sources and a retry action. |
| `fallback` | **Unable to refresh**, identifying a same-day saved snapshot and offering retry. |
| `failed` | **Unable to load feeds**, with retry when no usable fallback exists. |

The hook's initial `booting` flag shows loading before browser subscriptions are
read. Two decorative skeletons appear only while loading without articles.
The main region has `aria-busy` during loading. Native progress stays visible
when reduced motion is enabled. Available snapshot articles can appear during
refresh; the first network result replaces that preview even if it is empty.

Both reader and manager have a status region named **Feed activity**. Only the
active context receives feed announcements. The manager's **Subscription
updates** region reports form operations separately.

`FeedHeader` first renders the deterministic **Today** label to avoid a server
and browser timezone hydration mismatch. After hydration, an effect formats the
browser-local date. The **Refresh feeds** button remains mounted and uses
`aria-disabled` plus a click guard during loading or when no feeds are enabled,
so keyboard focus survives refresh.

### Feed Manager

- `FeedContent` lazy-loads `FeedManagerModal` via `next/dynamic` and passes its authoritative per-feed lifecycle statuses directly to the modal for load-result icons
- `FeedManagerButton` is a neutral, stateless trigger; `FeedContent` refreshes the current feed list from browser storage when either manager opener is used
- `FeedManagerModal` remains mounted while closed so draft add/edit fields survive reopening; Feed mutations flow back through `onFeedsChange`
- `FeedManagerModal` uses native `<dialog>.showModal()`: the platform owns Escape dismissal, focus containment, and inert background behavior; backdrop clicks dismiss, internal scrolling is contained, and `FeedContent` restores focus to the exact opener. The dialog has a definite safe-area-aware dynamic viewport block size so WebKit cannot collapse its column flex layout to the header's intrinsic height
- Add-feed and OPML controls are the manager's first sections and remain mounted behind native `<details>` disclosures; Add feed starts expanded only when no feeds are configured. The feed inventory follows those subscription workflows. Narrow layouts constrain each feed row to the dialog width, wrap otherwise unbroken names, and use the control-border token for visible card boundaries
- Add and edit are labelled native forms with required trimmed-field validation, linked inline errors, persistent form-level recovery messages, and one typed pending operation; entering edit moves focus into the form, while cancellation and successful save return focus to the feed-list heading; progress and success use one stable polite status region
- A validating add or edit form remains mounted and becomes `aria-busy`, with its fields read-only until that operation completes so a late keystroke cannot be lost
- Feed rows show Checking while pending, Not checked when a request ends unfinished, and distinct success, failure, and timeout results. Shared activity reports loading and terminal outcomes inside the modal; aggregate retry returns focus to the feed-list heading
- Modal handles CRUD and client-side OPML import/export without a duplicate footer action or build-version label consuming mobile height
- `FeedDeleteActions` owns the row-level transition from the normal actions to an accessible Cancel/Delete confirmation group; mounting the safe Cancel action moves keyboard focus explicitly, cancellation restores the originating Delete button, confirmed deletion moves focus to the feed-list heading, and the destructive action uses light/dark theme danger tokens
- Add and edit operations call `POST /api/feeds/validate` before persisting, including name-only edits
- `runFeedManagerOperation` in `lib/feed-storage.ts` applies mutations to current storage after URL validation, persists the result, and dispatches `feedsUpdated` only when the enabled feed set changes. Manual additions also check capacity before validation
- `FeedManagerForm` owns its draft and field errors. Successful persistence resets the submitted form; failures retain the draft. Add/edit modes share field markup and validation
- `useFeedManagerActions` owns the pending add/edit/import union and form-operation messages. Refresh outcome copy comes from lifecycle state rather than Promise resolution. Toggle, delete, and beginning an edit remain available while a form is validating

### Feed Stream Lifecycle

- `FeedProgressEvent<Item>` is the canonical progress interface for server `FeedItem` values and serialized client values; the response adapter owns Date-to-ISO serialization
- `useFeedStream` creates its initial feed-set lifecycle transition with a memoized pure initializer. It starts requests on mount, manual refresh, browser `storage` events, custom `feedsUpdated` events, and the current hourly timer. A new request aborts its predecessor; unmount aborts active work
- React state exposes the current read model, while refs retain transition state needed by asynchronous stream processing
- Lifecycle transitions own progressive results, offline fallback, completion, persistence effects, and configured/enabled inventory counts
- A validated JSON response or stream `done` produces a snapshot persistence effect, including partial or empty results. The hook executes it. Storage failure does not undo displayed network results
- A bare stream close ends loading without persistence. Pending sources remain pending internally and appear as **Not checked** in the manager
- Request failure replaces partial network results with a matching same-day snapshot when available. Without one, the lifecycle retains partial items in state, but the reader shows the failure panel instead of the article list
- The activity title **All feeds checked** describes source statuses, not proof that a terminal `done` was received or a snapshot was saved

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

- Production deployments must run behind a trusted reverse proxy
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
  tests, Next/PWA build, synthetic browser smoke tests, and an unpublished Docker build.
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

Roboto Serif normal weights 400–700 are loaded with `next/font/local` from bundled
licensed assets. Builds and reading do not request Google Fonts. The existing
CSS font variable and visual design are preserved.

## Testing

`mise.toml` owns tool versions and common tasks. Run commands from the repository
root. [CONTRIBUTING.md](CONTRIBUTING.md#browser-verification-and-screenshots)
describes browser setup and synthetic screenshot updates.

| Command | What it verifies |
| --- | --- |
| `mise run test` | Serial Node/tsx tests in `tests/`; API integration cases are skipped by default. |
| `mise run integration` | The same tests with `RUN_INTEGRATION_TESTS=true`, including API requests against a local Next.js dev server. |
| `mise run lint` | ESLint checks. |
| `mise run typecheck` | Application and `.mts` test types without JavaScript emission. |
| `mise run version-check` | Stable release version and synchronized markers. |
| `mise run build` | Production webpack compilation and emitted PWA artifact contracts. |
| `mise run browser` | Playwright against production output in desktop and narrow viewports. |
| `mise run verify` | Locked install, Compose validation, metadata, lint, types, default tests, build, browser checks, and an unpublished Docker image. It does not enable API integration mode. |

The browser suite uses fresh storage, intercepted synthetic feed responses,
blocked external requests, and blocked service workers. It covers reader layout,
hostile HTML, progressive loading, refresh failures, saved fallback, interrupted
streams, manager forms and focus, subscription failures and retry, and OPML
round trips. Loading cases also cover dark appearance and reduced motion.
Python 3 independently parses exported OPML in the Node tests.

Current browser coverage excludes article expansion, the inline empty-state
manager opener, service-worker offline behavior, online/offline notices, app
installation, dark appearance outside loading, and timezone rollover. Synthetic
browser passes do not prove live publisher fetching or production proxy behavior.

`mise run build` checks the actual emitted service worker, including the exact
feed-set `NetworkOnly` route and bounded cross-origin image cache. It does not
exercise the worker in a browser. Next.js development uses Turbopack; production
builds use webpack because Serwist's worker injection depends on it. Bundled
fonts eliminate font-provider network access during the build.

## Known Constraints

- Cache and metrics are in-memory and per-process
- Optimized for single-container deployments
- Feed preferences, imported OPML subscriptions, and offline snapshots are browser-local (not cross-device synced or server-backed)
- Metrics are in-memory and reset on process restart
- `/api/feeds/validate` is unauthenticated and depends on the production reverse proxy for ingress admission controls; admitted validation work is independently bounded by `FEED_OVERALL_TIMEOUT_MS` and inbound cancellation. `/api/metrics` requires bearer auth in production
- Some upstream feeds return malformed XML; retries cannot eliminate source-side errors
- Refresh requests can reuse the server cache and do not force a publisher fetch
- Known product and UI discrepancies are recorded in [architecture decisions](docs/architecture-decisions.md#known-implementation-gaps)

## Architecture Decisions

[Architecture decisions](docs/architecture-decisions.md) explains the module
boundaries for feed management, progress events, network validation, and client
lifecycle state.
