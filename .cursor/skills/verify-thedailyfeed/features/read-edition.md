# Read the edition

Opening the reader with two saved feeds shows today's date, both articles, and an item count of 2. The first article appears while the slower feed is still open.

## Sub-features

- `edition-open` shows the reader heading from the site root.
- `edition-stream` shows `Morning dispatch` while the evening fixture is still open.
- `edition-banner` shows the retrieval date and `2 items`.
- `edition-snapshot` writes the offline snapshot for those two URLs.

## How to get to it (user POV)

- Open the site root after the feeds are already saved in this browser.

## Driving it with drive.mjs

Preconditions, from an empty browser profile:

- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs launch`.
- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs doctor` and require `doctor ok`.
- The command below writes two enabled feeds into `rss-feeds` before the first navigation and removes `rss-offline-feed-snapshots-v1`. The URLs are `http://127.0.0.1:3218/morning.xml?run=<id>&feature=read-edition` and the matching `evening.xml` URL. `<id>` is `runId` in `.cursor/skills/verify-thedailyfeed/run/state.json`. Each feed has `id`, `name`, `url`, `enabled: true`, and an ISO `addedAt`.

- **Open the reader.** Visit the site root. One heading reads `The Daily Feed`.
- **Stream gap.** `feed-header` contains `1 of 2 feeds checked`, `Morning dispatch` is the only article title, `POST /api/feeds` is in flight, and the evening fixture connection is open.
- **Settled edition.** The header contains today's `Australia/Sydney` date and `2 items`. Both article titles are on the page.
- **Proof.** Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs run read-edition`. `evidence/read-edition/stream.json` has `gap.ok` true. `storage.json` keeps both URLs and the snapshot titles.

## Gotchas

- This command is a cold fetch because the URL query contains `feature=read-edition`. Reusing the `add-feed` URLs can hit the one-hour server cache and collapse the gap.
- The gap is the same shape as add-feed. A finished evening connection plus both titles does not prove the stream.
- The header date is the retrieval start in the browser timezone, not a live clock.
