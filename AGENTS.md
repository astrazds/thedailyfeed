# The Daily Feed

A self-hosted Next.js RSS reader for today's articles, using the reader's
timezone. Subscriptions and offline reading belong to the browser profile.

## Project references

Read the sections relevant to the change rather than loading every document:

- [README.md](README.md): product behavior, development setup, and public interfaces.
- [TECHNICAL.md](TECHNICAL.md): architecture, API contracts, security, and testing.
- [DEPLOYMENT.md](DEPLOYMENT.md): production topology, deployment, and recovery.

## Where changes belong

- `app/api/feeds/`: feed-set and validation routes; keep route admission shared.
- `lib/feed-request.ts`: cache/missing-feed orchestration. Fetching and parsing
  live in `lib/feed-fetcher.ts` and `lib/rss.ts`; extend that pipeline.
- `lib/feed-response-adapter.ts` and `lib/feed-stream-parser.ts`: server wire
  serialization and client validation of untrusted JSON/NDJSON.
- `lib/feed-set-lifecycle.ts`: progressive results, terminal states, and offline
  persistence. `components/use-feed-stream.ts` connects this lifecycle to React.
- `lib/feed-storage.ts`: subscriptions and complete feed-manager mutations.
  `lib/feed-manager-operations.ts` is only a compatibility re-export.
- `components/` and `app/globals.css`: reader UI and styling.
- `app/sw.ts` and `lib/serwist-runtime-caching.ts`: service-worker behavior.

## Product and safety boundaries

- Keep subscriptions and same-day offline snapshots in browser `localStorage`,
  and OPML import/export client-side. Server cache and metrics are disposable,
  process-local state. Accounts, server persistence, and synchronization require
  an explicit product scope change.
- Preserve timezone-aware "today" filtering and distinct loading, partial,
  completed, failed, and offline reader states.
- Feed URLs, DNS answers, redirects, XML, article HTML, and transport chunks are
  untrusted input. Preserve HTTP(S)-only fetching, destination and redirect
  checks, production SSRF blocking, DOMPurify sanitization, and DOM-aware
  truncation. Keep `ALLOW_PRIVATE_NETWORKS` false unless explicitly approved.
- Preserve response-size limits, bounded concurrency and retries, cancellation,
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

The toolchain contract is in [package.json](package.json): Node 24 and the pinned
pnpm release. Python 3 is also required for the independent XML tests.

- `pnpm test`: serial Node/tsx tests in `tests/`. Full API integration is opt-in
  with `RUN_INTEGRATION_TESTS=true`; it starts a local Next.js server.
- `pnpm lint` and `pnpm exec tsc --noEmit`: lint and application/test type checks.
- `pnpm build`: production webpack build plus the PWA artifact check. Keep
  webpack here because Serwist's service-worker injection depends on it.
- `pnpm test:browser`: Playwright against production output, using the isolated
  synthetic fixtures in `e2e/`. These block external requests and service workers,
  so they do not prove live feed fetching or service-worker operation.
- [scripts/verify-ci.sh](scripts/verify-ci.sh): complete gate before commit or
  deployment. It installs dependencies and Chromium, runs the checks above,
  and builds an unpublished Docker image.
- Documentation-only changes need diff review, `git diff --check`, and checks
  of referenced paths and claims; no application build or release bump.

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
