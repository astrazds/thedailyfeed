ISSUES

HEAD: `e3473b92851e6c85fcd587c0e2fa08f96504019b` (from `.git/refs/heads/main` and `.audit/doc-drift-head.txt`; `git rev-parse` was unavailable in this environment). Matches hinted `e3473b9`. `package.json` version is `1.2.11`.

Slice: `README.md`, `CONTRIBUTING.md`, `mobile/README.md`, `docs/migrations/expo-web.md`, `docs/migrations/expo-web-acceptance.md`, `public/fonts/README.md`.

## Issues

- **README.md:60-61** / **lib/opml.ts:28-29,70** and **lib/feed-storage.ts:329** — OPML how-to lists duplicate/invalid/over-limit handling but never says export/import keep each feed's enabled state. Add that export writes `enabled="true"|"false"` and import restores it (a missing attribute imports as enabled).

- **README.md:62-63,99-100** / **mobile/src/useReader.ts:41,73** and **mobile/App.tsx:156-161** — The Use/Limitations sections say today's timezone and that an open edition stays until the next retrieval, but they never say the header date is frozen to retrieval start (`editionStartedAt`). Say the displayed date is captured when retrieval starts and does not advance until the next explicit or subscription-driven retrieval.

- **README.md:63** / **mobile/src/ArticleCard.tsx:54-60,356-360** — "Open the original" does not say title and body links open in a new tab. Say the article title and sanitized body links use `target="_blank"` (title `rel="noopener noreferrer"`, body also `nofollow`).

- **README.md:73-74** / **lib/feed-load-activity.ts:31-36** and **mobile/App.tsx:278-281** — "**Unable to refresh** identifies saved content after a request failure" is overstated. With saved items the copy is "Showing saved items from today."; with an empty snapshot-fallback it is "Try again to check your feeds." Split those two fallback sentences.

- **README.md:57-59** / **lib/feed-storage.ts:69-91,183-204** — First-open inventory behavior is missing. A missing, invalid-JSON, or non-array `rss-feeds` value presents the three defaults (Daring Fireball, The Verge, WIRED); a stored `[]` stays empty. Say that in Use (and that an array of mixed/invalid records is pruned to the valid subset, not replaced by defaults).

- **mobile/README.md:23** / **lib/opml.ts:28-29,70** and **lib/feed-storage.ts:329** — Manager OPML sentence does not mention enabled preservation. Add the same enabled round-trip claim as README.

- **mobile/README.md:56-57** / **lib/feed-storage.ts:183-204** and **mobile/src/subscriptions.ts:14-55** — "A valid empty inventory remains empty. Only an absent canonical key permits feed-only migration…" is true for MVP import and `[]`, but it never says a missing or unparseable `rss-feeds` key with no successful MVP import presents `DEFAULT_FEEDS`. Add that third path so first-open defaults are not implied to be empty.

- **mobile/README.md:59-64** / **mobile/src/useReader.ts:41,73** and **mobile/App.tsx:156-161** — Reader lifecycle notes refresh triggers and no polling, but omit the header date freeze. Mention `editionStartedAt` / retrieval-start dating of the header.

- **mobile/README.md:66-68** / **mobile/src/ArticleCard.tsx:54-60,356-360** — Article-adapter paragraph covers sanitization and fail-closed markup, not new-tab links. Say title and body links open in a new tab.

- **docs/migrations/expo-web.md:14** / **lib/feed-storage.ts:183-204** and **mobile/src/subscriptions.ts:14-55** — Data-continuity paragraph says a valid empty inventory stays empty and a missing inventory may import the Expo proof once, but omits default-feed presentation when the canonical key is missing or unparseable and MVP import does not run. Add that path so "missing inventory" is not read as empty-or-MVP-only.

## Not issues (checked, left unflagged)

- **Physical iPhone Safari 1.2.10 (14 Oct 2026)** in `mobile/README.md:79-83`, `docs/migrations/expo-web.md:7-9`, and `docs/migrations/expo-web-acceptance.md:66-70,74-76` is an operator check for **1.2.10**, not a claim that 1.2.11 is the current confirmed device build. That matches the known confirmation. Do not rewrite it to 1.2.11.

- **Expo/RN is the only frontend; Next hosts export + APIs** — `README.md:18-20`, `CONTRIBUTING.md:11-13`, `mobile/README.md:3-5,17-20`, `docs/migrations/expo-web.md:3`. Matches `next.config.ts:16-32` (dev Metro proxy / prod `/expo/index.html` rewrite), `scripts/build-expo-web.mjs`, and `app/` (API, SW, layout, manifest only; no Next reader page).

- **CONTRIBUTING.md** — Browser port `127.0.0.1:3100` and `reuseExistingServer: false` match `playwright.config.ts:9,20-23`. Screenshot grep `reader renders` matches `e2e/reader.spec.ts:9`. Loading capture `narrow-manager-pending.png` matches `e2e/loading.spec.ts:180`. Docs-only checks match `tests/docs-claims.test.mts`. `mise run` tasks exist in `mise.toml`. Python 3 is required for `tests/opml.test.mts`. Version bump command exists on `package.json:23`.

- **docs/migrations/expo-web-acceptance.md** — Framed as the 1.2.8 record plus a later 1.2.10 iPhone addendum. Historical counts and engine table are not current-gate targets. No contradictory 1.2.11 product claim.

- **public/fonts/README.md** — Weights 400/500/600/700 match `mobile/src/reader-theme.ts:10-14`. `public/fonts/` holds `OFL.txt` and this README only. Source fonts exist at `mobile/assets/fonts/roboto-serif-*.ttf`.

## Code spot-checks for the seven known behaviors

1. **Expo/RN-only frontend** — confirmed (`next.config.ts` rewrites; `app/` has no reader UI).
2. **Header date freeze** — `useReader` captures `startedAt` at refresh start and `setEditionStartedAt(startedAt)` after snapshot load; `App.tsx` renders `editionStartedAt.toLocaleDateString(...)`. Not documented in this slice's product how-to.
3. **OPML preserves enabled** — export writes `enabled="${true|false}"`; parse uses `isEnabledUnlessExplicitlyFalse`; import `createFeed(..., feed.enabled ?? true)`. Covered by `tests/opml.test.mts`. Missing from product how-to.
4. **New-tab links** — title `hrefAttrs.target: "_blank"`; body `<a>` models set `target: "_blank"`. Missing from product how-to.
5. **Empty snapshot-fallback copy** — `getFeedLoadActivity` detail is `'Try again to check your feeds.'` when `items.length === 0`; `App.tsx` shows the same sentence. README's "identifies saved content" claim is wrong for this path.
6. **Physical iPhone 1.2.10 on 14 Oct 2026** — recorded correctly in the three files above.
7. **Default feeds vs `[]`** — `getFeeds()` returns `DEFAULT_FEEDS` when the key is missing, JSON throws, or the value is not an array; `[]` parses as a valid empty inventory. `readSubscriptions()` may MVP-import only when the canonical key is `null`. Not documented in README; understated in `mobile/README.md` and `expo-web.md`.
