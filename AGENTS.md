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
- `lib/types.ts`: shared article and wire types; browser imports must not point
  at the server RSS parser for article types.
- `components/feed-manager-modal.tsx`: native dialog and focus ownership.
  `feed-manager-form.tsx` owns drafts and validation, `use-feed-manager-actions.ts`
  owns async operation state, and list/transfer components own their controls.
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

Use the versions and tasks in [mise.toml](mise.toml), consistent with the Node
and pnpm contract in [package.json](package.json). Python runs the independent
XML tests. Run `mise run install` after installing the toolchain.

- `mise run test`: serial Node/tsx tests in `tests/`. `mise run integration`
  enables the full API integration tests and starts a local Next.js server.
- `mise run lint` and `mise run typecheck`: lint and application/test type checks.
- `mise run build`: production webpack build plus the PWA artifact check. Keep
  webpack here because Serwist's service-worker injection depends on it.
- `mise run browser`: Playwright against production output, using the isolated
  synthetic fixtures in `e2e/`. These block external requests and service workers,
  so they do not prove live feed fetching or service-worker operation.
- `mise run verify` runs [scripts/verify-ci.sh](scripts/verify-ci.sh), the complete gate before commit or
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
