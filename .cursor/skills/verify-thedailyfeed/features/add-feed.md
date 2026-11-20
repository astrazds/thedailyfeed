# Add a feed

Add a feed lets a person save an RSS URL and read today's articles from it. The first article shows up while a slower second feed is still downloading.

## Sub-features

- `add-open` opens the manager and the add form.
- `add-morning` saves the fast fixture and shows `Morning dispatch`.
- `add-stream` shows that article while `Evening dispatch` is still absent and the evening download is open.
- `add-settled` shows both articles, stores both URLs, and writes the offline snapshot.

## How to get to it (user POV)

- Choose the gear button `Manage feeds` at the top right of the reader.
- With no saved feeds, the add form is already open. Choose `Add feed options` only when that button is collapsed.
- Enter the name and URL, then choose `Add feed`.

## Driving it with drive.mjs

Preconditions, from an empty browser profile:

- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs launch`.
- Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs doctor` and require `doctor ok`.
- The command below sets `rss-feeds` to `[]` and removes `rss-offline-feed-snapshots-v1` before the first navigation.

- **Open the empty reader.** The page shows one heading `The Daily Feed` and the text `No feeds yet`. The gear `connection-settings` matches one element.
- **Add Morning.** The add form is visible. Fill `Feed name` with `Morning` and `Feed URL` with `http://127.0.0.1:3218/morning.xml?run=<id>&feature=add-feed`, and choose `Add feed`. `<id>` is `runId` in `.cursor/skills/verify-thedailyfeed/run/state.json`. One article title reads `Morning dispatch`.
- **Add Evening.** Fill `Feed name` with `Evening` and `Feed URL` with the matching `evening.xml` URL, then choose `Add feed` again. The evening document waits 2.5 seconds before the body.
- **Stream gap.** While that wait is in progress, `feed-header` contains `1 of 2 feeds checked`, its progress bar matches one element, `Morning dispatch` is the only article title, one `POST /api/feeds` is in flight, and `GET /status` reports `eveningOpen` of at least 1.
- **Settled reader.** Both titles are visible, the header contains today's date in `Australia/Sydney` and `2 items`, and the dialog is closed.
- **Proof.** Run `node .cursor/skills/verify-thedailyfeed/scripts/drive.mjs run add-feed`. The pass line includes `verify_ms`. `evidence/add-feed/stream.json` has `gap.ok` true. `storage.json` contains both fixture URLs and both article titles in the snapshot.

## Gotchas

- The empty-state button is also named `Manage feeds`. Use `connection-settings`, which matches one element.
- `Add feed options` toggles. An empty inventory leaves it expanded. Choosing it then hides the form.
- The manager draws a second `Feed loading progress` bar. Read the bar inside `feed-header`.
- `Morning dispatch` alone can be the snapshot from the first add. The gap requires `1 of 2 feeds checked` and an open evening connection. `0 of 2 feeds checked` means the second fetch has started and no feed result has arrived.
- Both titles appearing only after `eveningOpen` returns to 0 means the reader waited for the whole body. That is not this stream.
- A missing `rss-feeds` key fetches the three public defaults. The empty inventory is `[]`.
- Development runs the reader effect twice, so the post count can be higher than one user action. The gap watches an in-flight post, not a total of one.
- The reader cancels the response body after the `done` line. Playwright then reports that post as failed. The article titles and the snapshot are the result that counts.
