# Doc drift audit — reference (TECHNICAL / DEPLOYMENT / SECURITY / PRIVACY)

**Status: ISSUES**

Slice: `TECHNICAL.md`, `DEPLOYMENT.md`, `SECURITY.md`, `PRIVACY.md`.

HEAD: `e3473b92851e6c85fcd587c0e2fa08f96504019b` (release 1.2.11).
`package.json` version is `1.2.11`. Compose fallback is `APP_VERSION=${APP_VERSION:-1.2.11}`.

The inventory harness (`scripts/doc-drift-inventory.mjs`, captured in `.audit/doc-drift-baseline.json`) already flags three TECHNICAL.md gaps: stale as-of date, missing OPML `enabled`, and missing edition-header freeze. This audit confirms those against code and adds one incomplete activity-copy claim. DEPLOYMENT.md, SECURITY.md, and PRIVACY.md did not add material falsehoods.

---

## Verified current behavior (not doc drift)

These 1.2.11 behaviors are implemented. Issues below are documentation gaps or stale wording, not code defects.

1. **Expo/RN is the only frontend; Next hosts the export and APIs.**
   `mobile/app.config.ts:6` is `platforms: ["web"]`. `next.config.ts:28-31` rewrites `/`, `/_expo/*`, and `/assets/*` to the Metro export. `app/layout.tsx:1-3` is an empty HTML shell. There is no `pages/` router and no App Router reader page. TECHNICAL.md:7-9 and :69 already state this correctly.

2. **Reader header date freezes at retrieval start via `editionStartedAt`.**
   `mobile/src/useReader.ts:34` initializes the clock; `:41` captures `startedAt`; `:73` calls `setEditionStartedAt(startedAt)` after the request generation is still current. `mobile/App.tsx:156-162` formats that instant with `toLocaleDateString` in `config.timeZone`. TECHNICAL.md:352-353 states midnight article retention but not the frozen header clock.

3. **OPML export/import preserves `enabled`.**
   `lib/opml.ts:28-29` writes `enabled="true"|"false"`. `:13-14` and `:70` treat only the literal attribute `false` as disabled (missing attribute imports as enabled). `lib/feed-storage.ts:329` persists `feed.enabled ?? true`. Covered by `tests/opml.test.mts:67-90`. TECHNICAL.md:341-342 describes import/export without naming `enabled`.

4. **Article links open in a new tab.**
   `mobile/src/ArticleCard.tsx:58-59` (body) and `:359` (title) set `target: "_blank"` with the documented `rel` values. TECHNICAL.md:398-400 already states this correctly.

5. **Empty snapshot-fallback activity copy aligns with the panel (try again).**
   `lib/feed-load-activity.ts:31-36` — empty fallback detail is `Try again to check your feeds.`
   `mobile/App.tsx:281-284` — same sentence plus a **Try again** button.
   TECHNICAL.md:316 describes fallback only as “a matching same-day snapshot is available.”

6. **TECHNICAL.md as-of date is October 6, 2026.**
   TECHNICAL.md:3. Release 1.2.11 landed 14 October 2026 (today; inventory why-text and acceptance notes on that calendar day). Version-policy.md deliberately does not bump this date (`TECHNICAL.md:30-31`; `scripts/version-policy.mjs:27` keeps the date suffix). The date was not updated when 1.2.11 landed.

7. **Nginx burst/body limits match `deploy/nginx.conf` and `tests/docs-claims.test.mts`.**
   `deploy/nginx.conf:24` `client_max_body_size 1m`; `:28` `burst=10`; `:4` `rate=1r/s`; `:44-45` 45s proxy send/read timeouts.
   DEPLOYMENT.md:38-40 states 1 MiB, 1/second, burst of 10, 45-second upstream timeouts.
   `tests/docs-claims.test.mts:66-78` asserts those two numbers match.

8. **Compose / APP_VERSION markers are 1.2.11.**
   `compose.yml:26` `APP_VERSION=${APP_VERSION:-1.2.11}`.
   DEPLOYMENT.md:3 (guide header) and :53 (defaults table).
   `scripts/version-policy.mjs:15-37` treats those as the required markers.

---

## Issues

### 1. TECHNICAL.md as-of date is stale for 1.2.11

**Severity:** warn
**Kind:** stale
**Doc:** `TECHNICAL.md:3`
**Code / evidence:** Release is 1.2.11 (`package.json:3`). The header still says “as of October 6, 2026”. 1.2.11 landed 14 October 2026. `scripts/doc-drift-inventory.mjs:104-108` treats `/as of October 6, 2026/` as an unexpected claim. TECHNICAL.md:30-31 says the date is independent of `version:bump`, so leaving October 6 after a same-day 1.2.11 landing is an authoring miss, not a marker-sync bug.

**Suggested fix:** Change the header date to October 14, 2026 (keep version 1.2.11).

### 2. TECHNICAL.md never says the header date freezes at retrieval start

**Severity:** warn
**Kind:** missing
**Doc:** `TECHNICAL.md:352-353` (closest existing sentence); activity table `TECHNICAL.md:319-320`
**Code:** `mobile/src/useReader.ts:34,41,73` and `mobile/App.tsx:156-162`
**Evidence:** The lifecycle paragraph correctly says there is no hourly timer and that an open edition stays visible across midnight until a later retrieval. It does not say the displayed header date is `editionStartedAt` captured at retrieval start. Inventory probe `edition-header-freeze` fails on this file. An implementer following only this paragraph could keep a live `new Date()` in the header — the regression 1.2.11 fixed.

**Suggested fix:** After the midnight-retention sentence, add that `useReader` freezes the header date to `editionStartedAt` (retrieval start) and `App.tsx` formats that instant in the reader timezone until the next retrieval.

### 3. TECHNICAL.md never says OPML preserves enabled/disabled

**Severity:** warn
**Kind:** missing
**Doc:** `TECHNICAL.md:341-342`
**Code:** `lib/opml.ts:13-14,28-29,70` and `lib/feed-storage.ts:329`
**Evidence:** The manager paragraph says import skips duplicate/invalid/over-limit URLs and “Export includes the saved inventory.” Inventory includes `enabled`, but the 1.2.11 contract is the OPML `enabled` attribute. Inventory probe `opml-enabled` fails on this file. `tests/opml.test.mts:67-90` is the behavioral pin.

**Suggested fix:** In that OPML sentence, state that export writes `enabled="true"|"false"`, import honors `enabled="false"`, and a missing attribute imports as enabled.

### 4. TECHNICAL.md fallback row omits empty-snapshot “try again” copy

**Severity:** info
**Kind:** missing / incomplete
**Doc:** `TECHNICAL.md:316`
**Code:** `lib/feed-load-activity.ts:31-36` and `mobile/App.tsx:278-284`
**Evidence:** The activity table describes `fallback` only as “Refresh failed and a matching same-day snapshot is available.” That is true for a non-empty snapshot (`Showing saved items from today.`). An empty same-day snapshot is still fallback (not `failed`); activity and panel both say “Try again to check your feeds.” The table does not distinguish that case, so a reader can confuse empty fallback with `failed`.

**Suggested fix:** Extend the `fallback` row: non-empty snapshots keep saved items; an empty matching snapshot uses the same “try again” copy as the panel.

### 5. TECHNICAL.md fail-closed gate says `window`; the adapter checks `document`

**Severity:** info
**Kind:** stale wording
**Doc:** `TECHNICAL.md:385-386`
**Code:** `mobile/src/article-content.ts:9-14`
**Evidence:** TECHNICAL.md says “If `window` is missing, rendering returns empty markup.” The Expo adapter returns empty markup when `document` is undefined or `DOMPurify.sanitize` is missing. SECURITY.md:19-20 already says “A missing DOM returns empty markup,” which matches the code. Not a sanitizer bypass — the check is the DOM, not `window`.

**Suggested fix:** Replace “If `window` is missing” with “If the DOM (`document`) is missing.”

---

## Files with no material drift in this slice

### DEPLOYMENT.md — PASS

Spot-checked against `compose.yml`, `deploy/nginx.conf`, `env.template`, `lib/constants.ts`, `scripts/deploy-compose.sh`, and `.github/workflows/ci.yml`.

| Claim | Doc | Code |
| --- | --- | --- |
| Release 1.2.11 | `:3` | `package.json:3` |
| APP_VERSION default 1.2.11 | `:53` | `compose.yml:26` |
| Wrapper derives version/commit | `:19-21` | `scripts/deploy-compose.sh:16-24` |
| Loopback `127.0.0.1:${APP_PORT:-3000}:3000` | `:22` | `compose.yml:17` |
| 1 MiB body, 1 r/s, burst 10, 45s upstream | `:38-40` | `deploy/nginx.conf:24,28,44-45` |
| Feed timeout/retry/cache defaults | `:57-62` | `lib/constants.ts:27-36`, `compose.yml:28-33` |
| `ALLOW_PRIVATE_NETWORKS` default false | `:63` | `compose.yml:36`, `lib/url-validator.ts:239-240` |
| Metrics 404 until token | `:64` | `lib/metrics-access.ts:41-42` |
| `--no-deps` service-only update | `:86-87` | `scripts/deploy-compose.sh:27-29` |
| CI read-only, no deploy | `:180-182` | `.github/workflows/ci.yml:6-8,31` |
| No CORS / no separate Expo service | `:6-7` | same-origin `useReader.ts:101` POST `/api/feeds` |

Nginx burst/body are also locked by `tests/docs-claims.test.mts:66-78`.

### SECURITY.md — PASS (no material falsehoods)

Private reporting, `ALLOW_PRIVATE_NETWORKS=false` as an SSRF hatch (`lib/url-validator.ts:239-240`), localhost/private image and link dropping (`lib/url-validator.ts:229-236` via `lib/feed-content-normalization.ts:43-47`), DOMPurify-then-normalize fail-closed (`mobile/src/article-content.ts:7-32`), production metrics gated until a bearer token (`lib/metrics-access.ts:33-42`), and verification-scope limits all match code. No pages-router or Next-renders-the-reader claim.

### PRIVACY.md — PASS (no material falsehoods)

No accounts/sync/analytics; `rss-feeds` holds names, URLs, and enabled; OPML is browser-side; enabled URLs and timezone go to the server; name-only edits still POST `/api/feeds/validate` (`mobile/src/subscriptions.ts:63-68`, `lib/feed-storage.ts:378-379`); snapshots are same-day, keyed by enabled URLs + timezone (`lib/offline-feed-cache.ts:6-21`); images are browser-fetched with a 64-entry SW cache (`lib/platform-policy.ts:170-177`); fonts are bundled (`mobile/src/reader-theme.ts:10-15`); API `no-store` and no periodic poll (`useReader.ts` refresh on mount / identity / explicit refresh only). External links opening publisher sites matches `ArticleCard` `target: "_blank"`. OPML now also writes `enabled` into the exported file; the existing “treat OPML as sensitive” sentence still covers that — not a falsehood.

---

## TECHNICAL.md claims that still match code

Not an exhaustive contract recitation. These were spot-checked so the issues above are not “the doc is generally wrong.”

- One Expo reader; Next serves export + App Router APIs (`TECHNICAL.md:7-9,69` / `next.config.ts:28-31`).
- Module owners named in `:41-52` exist at those paths.
- `POST /api/feeds` JSON + NDJSON (`stream=1` or `Accept: application/x-ndjson`) (`lib/feed-response-adapter.ts:71-73`).
- Validate route one `FEED_OVERALL_TIMEOUT_MS` signal; timeout/abort stay generic 400 (`TECHNICAL.md:239-245` / `app/api/feeds/validate/route.ts:83-117`).
- Metrics `404` without token, `401` with bad bearer, `no-store`, `X-Request-Id` (`lib/metrics-access.ts`, `app/api/metrics/route.ts`).
- `/api/test-feed` 404 in production (`app/api/test-feed/route.ts:30-31`).
- Cache key = feed URL; TTL `FEED_CACHE_TTL_MS`; fields `items` + `timestamp` (`lib/feed-cache.ts:15-25`).
- Offline snapshots: key `rss-offline-feed-snapshots-v1`, 20 / 256_000 / 1_500_000 (`lib/offline-feed-cache.ts:6-9`).
- SW: GET `/api/feeds` `NetworkOnly` first, then cross-origin images SWR 64/1 day (`lib/serwist-runtime-caching.ts:32-44`, `lib/platform-policy.ts:162-177`).
- Empty `feedUrls` → 400; invalid timezone → UTC; max 50 (`lib/feed-request-validation.ts:82-103,144`).
- JSON fallback assigns aggregate `cached` or `success` (`lib/feed-set-lifecycle.ts:291`).
- Client 32 MiB transport cap (`mobile/src/transport.ts:6`).
- Production in-process rate limiter disabled (`lib/api-rate-limit.ts:26-35`).
- Inbound JSON `Content-Length` > 1 MiB → 413 (`lib/constants.ts:38`, `lib/feed-api-admission.ts:71-77`).
- Concurrency default 4; retries default 3 (`lib/rss.ts:180`, `lib/constants.ts:33`).
- New-tab title/body `rel` values (`TECHNICAL.md:398-400` / `ArticleCard.tsx:58-59,359`).
- Expo TS `~6.0.3` and `@types/node` `^22.0.0` (`mobile/package.json:31,38`).
- pnpm 11.24.0; `allowBuilds` esbuild/sharp/unrs-resolver (`pnpm-workspace.yaml:1-4`, `Dockerfile:4`).
- Node 24 / mise `24.19.0` (`mise.toml:2`). Dockerfile digest `node:24-alpine@sha256:d32cdf61…` is pinned; Alpine 3.24.1 was not re-resolved from the digest in this audit.
- `mise run` task names in the testing table exist in `mise.toml`.
- Old Expo proof key `daily-feed-expo.config.v1` can seed `rss-feeds` (`mobile/src/subscriptions.ts:10-48`).

---

## Out of scope for this slice

`README.md`, `VISION.md`, `AGENTS.md`, `docs/architecture-decisions.md`, and `mobile/README.md` are covered by the product and explanation audits. Several of the same 1.2.11 gaps appear there (inventory baseline). This file does not re-litigate them.
