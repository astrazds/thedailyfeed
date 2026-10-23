---
name: verify-thedailyfeed
description: Drive the The Daily Feed web reader in a browser and capture proof. Use when checking the edition, refresh, or feed manager against a locally launched instance.
---

# Verify The Daily Feed

The user-facing surface is the web reader. Next serves the Expo screen at one origin. Browser storage holds subscriptions. This copy lives in `docs/verification/verify-thedailyfeed/` because `/.cursor/` and `/.agents/` are gitignored. Do not weaken those ignore rules to move the skill.

Run every command from the repository root. The helper is `docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs`.

## Launch

Start a disposable development instance on port 3217. Metro uses port 8187. This does not reuse an existing server on port 3000.

```bash
node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs launch
```

Ready means a headless browser can see the heading `The Daily Feed` at `http://127.0.0.1:3217/`. The helper waits for that heading, then prints `ready` and the pid. The first launch compiles Expo and Next, so give it up to two minutes. A fresh browser profile has no `rss-feeds` key, so the reader shows the three default sources in memory.

Teardown is the cleanup command below. Do not start a second instance on 3217.

## Doctor

```bash
node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs doctor
```

The check is read-only. It passes only when the recorded pid is alive, its command is `scripts/dev.mjs --port 3217`, and `GET /` returns HTTP 200 with an HTML document. Exit code 1 means the instance is not worth driving.

## Drive

Use Playwright through the helper. Prefer the heading `The Daily Feed`, the banner `feed-header`, the button `Refresh feeds`, and the button `Manage feeds`. One fresh browser context per drive. Do not call test-only feed endpoints.

```bash
node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs drive read-edition
```

Recipes for the other mapped features are in `features/`. Drive only a feature whose preconditions the doctor has already satisfied.

## Evidence

Proof for the edition reader is written to `docs/verification/evidence/read-edition/`:

- `action.txt` records the open action, the URL, the banner text, and the `rss-feeds` storage value.
- `banner.aria.txt` is the banner accessibility snapshot after the heading is visible.
- `heading.png` is the page at that moment.
- `storage.json` is the subscription inventory the browser stored or left absent.

The proof must show the action and the resulting banner, not only a final screenshot. `storage.json` is the side effect. External feed sites are the production boundary. The drive does not stub them. A slow or failed source still leaves the heading and banner observable.

## Cleanup

```bash
node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs cleanup
```

Cleanup sends `SIGTERM` to the process group recorded for this launch, then deletes `/tmp/thedailyfeed-verify`. It does not delete `docs/verification/evidence/`. Never kill `node` or `next` by name.

## Helpers

`docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs` is the only helper. Invoke it as shown in Launch, Doctor, Drive, and Cleanup.
