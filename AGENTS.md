# The Daily Feed

A self-hosted Expo and React Native RSS reader for the web. Articles use the
reader's timezone. Subscriptions and offline reading belong to the browser profile.

## Project references

Read the sections relevant to the change rather than loading every document:

- [README.md](README.md): product behavior, development setup, and public interfaces.
- [TECHNICAL.md](TECHNICAL.md): architecture, API contracts, security, and testing.
- [DEPLOYMENT.md](DEPLOYMENT.md): production topology, deployment, and recovery.
- [VISION.md](VISION.md): intended product boundaries. Known implementation
  gaps are recorded in [architecture decisions](docs/architecture-decisions.md#known-implementation-gaps).
- [CONTRIBUTING.md](CONTRIBUTING.md): verification scope and synthetic screenshot capture.

## Where changes belong

- `app/api/feeds/`: feed-set and validation routes; keep route admission shared.
- `lib/feed-request.ts`: cache/missing-feed orchestration. Fetching and parsing
  live in `lib/feed-fetcher.ts` and `lib/rss.ts`; extend that pipeline.
- `lib/url-validator.ts`: HTTP(S) destination policy for feeds and article media.
- `lib/feed-content-normalization.ts`: sanitized HTML rewriting. The web article
  adapter fails closed with empty markup when the DOM is missing.
- `lib/feed-response-adapter.ts` and `lib/feed-stream-parser.ts`: server wire
  serialization and client validation of untrusted JSON/NDJSON.
- `lib/feed-set-lifecycle.ts`: progressive results, terminal states, and offline
  persistence. `mobile/src/useReader.ts` connects the lifecycle to React.
- `lib/feed-load-activity.ts`: shared activity and announcement copy. The Expo
  reader and manager own their controls and active-context announcements.
- `lib/feed-storage.ts`: canonical subscriptions and complete manager mutations.
  `mobile/src/useSubscriptions.ts` connects its web adapter to React.
- `lib/types.ts`: shared article and wire types. Browser imports must not point
  at the server RSS parser for article types.
- `mobile/App.tsx`, `mobile/src/ArticleCard.tsx`, and `mobile/src/reader-theme.ts`:
  the React Native reader and styling.
- `mobile/src/FeedManager.tsx` and `mobile/src/manager/`: native manager controls,
  persistent drafts, editor sessions, and narrow web dialog and OPML adapters.
- `mobile/src/article-content.web.ts`: DOMPurify and DOM normalization before
  bounded native article rendering.
- `scripts/build-expo-web.mjs` and `scripts/dev.mjs`: Expo export assembly and
  same-origin development. Next hosts APIs and exported files, not the reader.
- `app/sw.ts` and `lib/serwist-runtime-caching.ts`: service-worker behavior.

## Product and safety boundaries

- Keep subscriptions and same-day offline snapshots in browser `localStorage`,
  and OPML import/export client-side. Server cache and metrics are disposable,
  process-local state. Accounts, server persistence, and synchronization require
  an explicit product scope change.
- Preserve timezone-aware "today" filtering and distinct loading, empty, ready,
  partial, interrupted, failed, and snapshot-fallback reader states. Do not add
  periodic retrieval. An open edition remains until the next explicit or
  subscription-driven retrieval.
- Feed URLs, DNS answers, redirects, XML, article HTML, and transport chunks are
  untrusted input. Preserve HTTP(S)-only fetching, destination and redirect
  checks, and production SSRF blocking. Preserve DOMPurify sanitization,
  fail-closed empty markup when the DOM is missing, removal of localhost and
  private IP literals from article images and links, and DOM-aware truncation.
  Keep `ALLOW_PRIVATE_NETWORKS` false unless explicitly approved.
- Preserve outbound response-size limits, the inbound 1 MiB feed JSON
  `Content-Length` cap, bounded concurrency and retries, cancellation,
  and nested timeout budgets across DNS, redirects, streaming, and retry delays.
- Preserve both `POST /api/feeds` JSON and progressive NDJSON contracts (`meta`,
  `feed_result`, `done`, terminal `error`). Keep API responses `no-store`.
  The service-worker feed route must match only `/api/feeds` and remain
  `NetworkOnly`, without a timeout fallback or offline API response cache.
- Real feed URLs, OPML, browser subscriptions, snapshots, captured content, and
  logs can reveal reading habits or credentials. Use synthetic fixtures for
  tests and screenshots; keep private material out of outputs and artifacts.
- Production metrics require bearer authentication and stay disabled without
  `METRICS_AUTH_TOKEN`. Trusted ingress owns TLS and admission controls;
  preserve streaming and the hardened container defaults.

## Validation

Use the versions and tasks in [mise.toml](mise.toml), consistent with the Node
and pnpm contract in [package.json](package.json). Python runs the independent
XML tests. Run `mise run install` after installing the toolchain.

- `mise run test`: serial Node/tsx tests in `tests/`. `mise run integration`
  enables the full API integration tests and starts a local Next.js server.
- `mise run lint` and `mise run typecheck`: lint and application/test type checks.
- `mise run build`: Metro web export, Next production webpack build, and the PWA
  artifact check. Keep webpack for Serwist service-worker injection.
- `mise run browser`: Playwright against production output, using the isolated
  synthetic fixtures in `e2e/`. These block external requests and service workers,
  so they do not prove live feed fetching or service-worker operation.
- `pnpm verify:web-runtime`: production worker upgrade, retained subscriptions,
  actual offline reload, bundled fonts, and API cache exclusion. This uses a
  synthetic previous worker unless `RUNTIME_PREVIOUS_URL` names a prior build.
- `npm test --prefix mobile`: Expo transport, article, and profile tests.
- `mise run verify` runs [scripts/verify-ci.sh](scripts/verify-ci.sh), the complete gate before commit or
  deployment. It installs dependencies and Chromium, runs default tests and
  browser and worker runtime checks, and builds an unpublished Docker image. Run `mise run integration`
  separately for opt-in API coverage.
- Documentation-only changes need `mise run test` for the documentation claim
  checks, `git diff --check`, and diff review of referenced paths. They do not
  need an application build or a release bump.

## Releases and operations

- `package.json` owns the release version. After deployable changes stabilize,
  run `pnpm version:bump <patch|minor|major>` before the final gate; this updates
  the synchronized markers. Use patch for fixes and compatible dependency or
  operational changes, minor for features, and major for approved breaking
  changes. Documentation, tests, CI, agent guidance, and non-behavioral refactors
  do not require a bump. `pnpm version:check` detects drift; do not repair it by
  guessing. See [release versioning](TECHNICAL.md#release-versioning).
- GitHub Actions verifies the source and has no production access. Deployment
  uses `scripts/deploy-compose.sh`; [DEPLOYMENT.md](DEPLOYMENT.md) documents the
  portable setup and custom Compose options. Preserve the installation's service
  identity and unrelated services, networks, and volumes during updates.
- Keep personal development procedures, hostnames, server paths, deployment
  history, and credentials out of public documentation. Use example domains and
  portable instructions; document application contracts and requirements.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
