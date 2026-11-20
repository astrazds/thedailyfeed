# Offline snapshot

A failed refresh keeps today's saved articles on screen and says the reader is showing saved items.

## Sub-features

- `snapshot-save` writes `rss-offline-feed-snapshots-v1` after a successful load.
- `snapshot-offline` shows the saved articles after the browser is offline and refresh fails.
- `snapshot-quiet` leaves the fixture counts unchanged, so the articles did not come from a new download.

## How to get to it (user POV)

- Load today's edition.
- Go offline, then choose the header button `Refresh feeds`.

## Driving it with drive.mjs

Preconditions, from an empty browser profile:

- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs launch`.
- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs doctor` and require `doctor ok`.
- The command below writes the two fixture feeds into `rss-feeds` with `feature=offline-snapshot`, loads them, and waits until the snapshot contains `Morning dispatch`.

- **Load online.** Both article titles are visible and the snapshot key is present.
- **Refresh offline.** Turn the browser context offline, then choose `refresh`. One visible text node reads `Unable to refresh. Showing saved items from today.` Both article titles remain.
- **Fixture stays put.** `morningDone` and `eveningDone` on `GET /status` are unchanged, and `eveningOpen` is 0.
- **Proof.** Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs run offline-snapshot`. `evidence/offline-snapshot/stream.json` records the notice count and the fixture counters before and after the click.

## Gotchas

- The same sentence also sits in the status whose test id is `status`. Count the visible node outside that status. The pass needs exactly one.
- This development server does not register a service worker. Reloading the document while offline cannot load the page. The check refreshes the reader that is already open.
- A refresh that reaches the fixture again is a live fetch. The saved-items sentence without a new fixture download is the snapshot.
