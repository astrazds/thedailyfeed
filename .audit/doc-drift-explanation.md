# Doc drift audit — explanation / agent / ADR

**Status: ISSUES**

Slice: `VISION.md`, `AGENTS.md`, `docs/architecture-decisions.md` (including known implementation gaps).

HEAD: `e3473b92851e6c85fcd587c0e2fa08f96504019b` (release 1.2.11).
Code probes below are from the current tree at those paths; they match the 1.2.11 behaviors named in this audit.

The project's own inventory (`scripts/doc-drift-inventory.mjs`, captured in `.audit/doc-drift-baseline.json`) already flags the two 1.2.11 claim gaps in this slice: missing edition-header-freeze in `VISION.md` and `docs/architecture-decisions.md`, and missing OPML enabled/disabled in the ADR.

---

## Verified current behavior (not doc drift)

These 1.2.11 behaviors are implemented. They are listed here so the issues below are only about documentation.

1. **Open edition remains across midnight until the next retrieval; header date freezes to `editionStartedAt`.**
   `mobile/src/useReader.ts` holds `editionStartedAt`, initializes it to `new Date()`, and sets it to the retrieval start (`startedAt`) on every `refresh()`. `mobile/App.tsx` renders that value with `toLocaleDateString(..., { timeZone: config.timeZone })`. `refresh()` runs on mount, when the enabled-URL/timezone identity changes, and on explicit refresh. There is no hourly/periodic reader timer (only cache and rate-limiter cleanup intervals).

2. **OPML preserves enabled/disabled.**
   `lib/opml.ts` writes `enabled="true"|"false"` on export and reads it on import (`false` only when the attribute is exactly `"false"`; missing attribute imports as enabled). `importFeedsInto` in `lib/feed-storage.ts` stores `feed.enabled ?? true`. Covered by `tests/opml.test.mts`.

3. **Expo owns UI; Next hosts.**
   `mobile/app.config.ts` is `platforms: ["web"]`. `next.config.ts` rewrites `/` and `/_expo/*` to the Metro export. TECHNICAL.md and AGENTS.md both say Next hosts APIs and exported files, not the reader.

4. **Snapshot-fallback empty copy is try-again aligned.**
   `lib/feed-load-activity.ts` fallback detail is `Try again to check your feeds.` when `items.length === 0`. `mobile/App.tsx` renders `Unable to refresh. Try again to check your feeds.` plus a **Try again** button, and does not also show the empty-state panel (`activity.type !== "fallback"`).

5. **Product is still web-only; no accounts, sync, or native apps.**
   VISION scope, AGENTS product boundaries, ADR known gaps, `mobile/README.md#supported-platform`, and `platforms: ["web"]` all agree.

---

## Issues

### 1. VISION.md does not record the frozen header date

**Severity:** warn
**File:** `VISION.md`
**Evidence:**
Lines 11–15 say the local calendar day determines the edition, and that an open session “may retain its clearly dated edition after midnight until refresh or closure, without fetching more items for that edition.” That still matches product intent (session-scoped continuation, no midnight fetch, snapshots do not become a reopenable previous-day edition — `getUsableSnapshot` still rejects a non-today `dayKey`).

It does **not** say that the reader header date is the edition/retrieval start (`editionStartedAt`), not a live clock. Pre-1.2.11, an implementer following this paragraph could keep `new Date()` in the header while leaving articles in place — which is the regression 1.2.11 fixed. The inventory probe `edition-header-freeze` expects language matching `/editionStartedAt|header.*(edition|freeze|retrieval)|freeze[sd]?.*(header|date|day)|date.*retrieval start/i` and currently fails on this file.

**Suggested fix:** In “Today defines the reading boundary”, keep the session-continuation rule and add one sentence: the displayed edition date is the retrieval-start instant (`editionStartedAt` in `useReader` / the header in `App.tsx`) and stays that calendar day until the next retrieval. Prefer “does retain” over “may retain”. Optionally name enabled-source changes as a retrieval that starts a new edition, so this paragraph matches AGENTS.md and the ADR.

### 2. VISION.md “refresh or closure” is weaker than the implemented retrieval triggers

**Severity:** info (wording tightness; not a contradiction)
**File:** `VISION.md`
**Evidence:**
VISION: “until refresh or closure.”
AGENTS.md: “An open edition remains until the next explicit or subscription-driven retrieval.”
ADR known gaps: “Requests run on opening, enabled-source changes, and explicit refresh.”
Code: `useReader` `refresh` depends on `identity` (timezone + enabled URL set) and a mount effect, so toggling/enabling sources starts a new `editionStartedAt`.

Tab closure still drops the in-memory edition, so “closure” is not wrong. It understates subscription-driven retrieval.

**Suggested fix:** Fold into the same VISION sentence as issue 1: the open edition lasts until the next reader-initiated retrieval (open, enabled-source change, or explicit refresh) or until the session ends.

### 3. architecture-decisions.md omits the 1.2.11 header freeze

**Severity:** warn
**File:** `docs/architecture-decisions.md`
**Evidence:**
“Client lifecycle owns progressive and offline state” correctly points `lib/feed-set-lifecycle.ts` + `mobile/src/useReader.ts`. The known-gaps paragraph (lines 148–151) says an open edition stays visible across midnight until the next retrieval. That is true for already-loaded articles.

Neither section says the header date is frozen to retrieval start. `editionStartedAt` is React state in `useReader`, **not** lifecycle state. An agent following the ADR would reasonably put a live date in `App.tsx` or add a clock to the lifecycle module. Inventory probe `edition-header-freeze` fails on this file.

**Suggested fix:** In “Client lifecycle owns progressive and offline state” (or a short follow-on sentence), state that `useReader` owns `editionStartedAt` and the reader header formats that instant in the configured timezone. Repeat the same fact in known gaps next to the midnight-visibility sentence so the gap list is not only about article retention.

### 4. architecture-decisions.md omits OPML enabled/disabled

**Severity:** warn
**File:** `docs/architecture-decisions.md`
**Evidence:**
“Forms own drafts…” says `transfer.tsx` owns browser file selection and download around `lib/opml.ts`. That ownership is still correct (`mobile/src/manager/transfer.tsx` calls `exportToOPML` / `parseOPML`).

The ADR never says export writes `enabled` or that import restores it (defaulting missing attributes to enabled). That is the 1.2.11 contract in `lib/opml.ts` and `importFeedsInto`. Inventory probe `opml-enabled` fails on this file. “Existing browser data remains canonical” mentions disabled **records** in `rss-feeds`, which is storage, not OPML transfer.

**Suggested fix:** In the transfer/`lib/opml.ts` sentence, add: export includes `enabled="true"|"false"`; import honors `enabled="false"` and treats a missing attribute as enabled; `runFeedManagerOperation` persists that flag on added rows.

### 5. AGENTS.md path map: listed paths exist; two ownership gaps

**Severity:** warn (ownership incomplete), not missing files
**File:** `AGENTS.md`
**Evidence:** Every path in “Where changes belong” exists on disk and still matches the described owner, except the two gaps below.

| AGENTS path | Present | Ownership vs code |
| --- | --- | --- |
| `app/api/feeds/` | yes (`route.ts`, `validate/route.ts`) | Shared admission via `lib/feed-api-admission.ts` — guidance is correct |
| `lib/feed-request.ts` | yes | Still cache/missing-feed orchestration (`getCachedFeedSplit`, progressive parse) |
| `lib/feed-fetcher.ts`, `lib/rss.ts` | yes | Fetch/parse pipeline |
| `lib/url-validator.ts` | yes | HTTP(S) destination policy |
| `lib/feed-content-normalization.ts` | yes | Sanitized HTML rewriting only |
| `lib/feed-response-adapter.ts`, `lib/feed-stream-parser.ts` | yes | Wire serialize / validate |
| `lib/feed-set-lifecycle.ts`, `mobile/src/useReader.ts` | yes | Lifecycle + React; see edition-clock gap |
| `lib/feed-load-activity.ts` | yes | Shared activity copy; Expo owns controls |
| `lib/feed-storage.ts`, `mobile/src/useSubscriptions.ts` | yes | `runFeedManagerOperation` is the sole mutation entry; hook wraps the web adapter |
| `lib/types.ts` | yes | Browser article types; `mobile/` imports `lib/types`, not `lib/rss` |
| `mobile/App.tsx`, `ArticleCard.tsx`, `reader-theme.ts` | yes | Reader + styling |
| `mobile/src/FeedManager.tsx`, `mobile/src/manager/` | yes | Form, Modal, FeedRow, transfer, Activity, controls |
| `mobile/src/article-content.ts` | yes | DOMPurify + fail-closed empty markup when `document` is missing |
| `scripts/build-expo-web.mjs`, `scripts/dev.mjs` | yes | Expo export / same-origin dev |
| `app/sw.ts`, `lib/serwist-runtime-caching.ts` | yes | Service worker |

**5a. `lib/opml.ts` is the enabled-attribute owner and is not on the map.**
AGENTS attributes “OPML adapters” to `mobile/src/manager/`. That is only the file-picker/download wrapper. Format, `enabled` I/O, and XML escaping live in `lib/opml.ts`.

**Suggested fix:** Add a bullet: `lib/opml.ts` owns OPML parse/export including the enabled attribute; `mobile/src/manager/transfer.tsx` owns browser file selection and download.

**5b. Fail-closed empty markup is attributed to the wrong bullet.**
AGENTS puts “The web article adapter fails closed with empty markup when the DOM is missing” under `lib/feed-content-normalization.ts`. That file rewrites sanitized HTML and has no DOM/fail-closed branch. The fail-closed adapter is `mobile/src/article-content.ts` (`typeof document === "undefined"` returns `{ full: "", preview: "", truncated: false }`).

**Suggested fix:** Move the fail-closed sentence onto the `article-content.ts` bullet.

**5c. `useReader` now owns the edition clock; the map does not say so.**
The lifecycle bullet says `useReader` “connects the lifecycle to React.” Product boundaries say an open edition remains until the next retrieval, but not that the header date must stay `editionStartedAt`. Agents can preserve lifecycle states and still regress the header to a live date.

**Suggested fix:** In the `useReader` bullet and/or product boundaries, require the header date to stay the retrieval-start instant until the next explicit or subscription-driven retrieval.

---

## Checks that passed (no fix)

### VISION.md product boundaries after 1.2.11

Still aligned, aside from issues 1–2:

- Today / timezone edition; no unknown-date section; newest first; no unread debt or archive.
- Browser-owned subscriptions and snapshots; client-side OPML; no account; disposable server cache.
- Reader-initiated retrieval only; no periodic refresh; bounded fetch and sanitization.
- Scope: not an archive, unread tracker, account service, sync service, or full-text extraction service.
- Web-only is implied by “browser profile” / “self-hosted reader” and is explicit in the ADR and `mobile/README.md`. No need to add native-app language to VISION.

VISION does not need to name the OPML `enabled` attribute. “The reader chooses, names, enables, and removes feeds” plus client-side OPML transfer still covers the product boundary; the attribute is an ADR/`lib/opml.ts` contract.

### AGENTS.md product / safety / Expo–Next boundaries

- Subscriptions and same-day snapshots in `localStorage`; OPML client-side; no accounts/sync without a scope change.
- Distinct loading, empty, ready, partial, interrupted, failed, and snapshot-fallback states — matches `FeedLoadActivity`.
- Next hosts APIs and exported files, not the reader — matches `next.config.ts` and the build scripts.
- Validation and release guidance are out of this behavior slice; not re-audited here.

### architecture-decisions.md claims that are still accurate

- `runFeedManagerOperation` is the only mutation export; notifications fire only when the enabled URL set changes; import results include a required summary.
- Expo owns the application; Next owns hosting; manager web adapter uses `<dialog>`; article prep uses DOMPurify; production precache via `/sw.js`; API `no-store`.
- Form owns `{ name, url }` drafts; Modal owns the browser dialog; FeedRow owns row/delete; edit sessions are numbered so a stale response cannot close a newer editor.
- Canonical keys `rss-feeds` and `rss-offline-feed-snapshots-v1`; Expo proof seed from `daily-feed-expo.config.v1` only when the canonical key is absent (`mobile/src/subscriptions.ts`); proof snapshot/server address are not imported.
- Shared types in `lib/types.ts`; 32 MiB client response budget in `mobile/src/transport.ts`.
- Lifecycle owns progressive/offline transitions; activity copy is shared; reader header progress + three placeholders; refresh control stays mounted while disabled; JSON fallback assigns the same aggregate status to every enabled source (`applyFeedSetApiResponse`).
- Snapshot persistence on `done` or validated JSON; bare close does not persist.

### Known implementation gaps — accuracy

| Claim | Verdict |
| --- | --- |
| Expo web is the only application; Android/iOS outside supported platform | Accurate (`mobile/app.config.ts` `platforms: ["web"]`; `mobile/README.md#supported-platform`) |
| Native fallbacks and build identities removed | Accurate |
| Hourly retrieval timer removed; requests on open, enabled-source change, explicit refresh | Accurate |
| Open edition visible across midnight until next retrieval | Accurate for **articles**; incomplete for **header date** (issue 3) |
| Server cache hit may reuse data until TTL | Accurate (README: one-hour cache) |
| Chromium UI suite is synthetic; worker/offline reload is a separate production check; neither proves proxy/live publishers/every PWA flow | Accurate vs AGENTS validation notes and `TECHNICAL.md#testing` |
| `docs/migrations/expo-web-acceptance.md` link | Resolves (`migrations/expo-web-acceptance.md` from `docs/`) |

No stale “pages router / Next renders the reader / hourly timer / native app” claims in this slice.

---

## Suggested edit order

1. `VISION.md` — frozen header date + tighter retrieval language (issues 1–2).
2. `docs/architecture-decisions.md` — `editionStartedAt` ownership + OPML `enabled` (issues 3–4); one sentence in known gaps so midnight visibility and header freeze stay together.
3. `AGENTS.md` — add `lib/opml.ts`, move fail-closed onto `article-content.ts`, mention the `useReader` edition clock (issue 5).

No code changes are required for this slice. Snapshot-fallback try-again copy, Expo/Next hosting, web-only scope, and the AGENTS path existence check are already consistent with 1.2.11.
