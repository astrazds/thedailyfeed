# Read the edition

Opening the reader shows today's edition header, including the frozen date and how many items are loaded.

## Sub-features

- `edition-open` shows the reader heading from the site root.
- `edition-banner` shows the retrieval date and item count in the header.
- `edition-inventory` leaves a browser inventory the reader can reload.

## How to get to it (user POV)

- Open the site root.

## Driving it with verify-thedailyfeed

Preconditions:

- The reader is healthy at `http://127.0.0.1:3217/`.
- `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs doctor` reports `ok: true`.
- The browser context has not been reused from another drive.

- **Open the reader.** Visit the site root. Run `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs drive read-edition`. The heading `The Daily Feed` is visible and the banner `feed-header` contains the date and item count.
- **Proof.** The command writes `docs/verification/evidence/read-edition/action.txt`, `banner.aria.txt`, `heading.png`, and `storage.json`. `action.txt` names `read-edition` and the entry `/`. `storage.json` is the `rss-feeds` value after the heading appears.

## Gotchas

- The first request compiles the development bundles. Wait for the heading, not a fixed sleep.
- A fresh profile has no saved inventory. The reader may show the three default sources before a later save.
- External sources can fail or return no items for today. The heading and banner are still the proof. Do not stub `/api/feeds` to force articles.
- Cleanup must not delete `docs/verification/evidence/read-edition/`.
