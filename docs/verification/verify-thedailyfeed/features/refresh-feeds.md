# Refresh feeds

Refresh feeds checks the saved sources again from the header control. The click starts a new `POST /api/feeds` after the first edition has already settled.

## Sub-features

- `refresh-settled` shows both articles and `2 items` before the click.
- `refresh-post` starts a new feed post when the header control is chosen.
- `refresh-still-there` shows the same two articles after that post finishes.

## How to get to it (user POV)

- Choose the header button `Refresh feeds` after the edition has loaded. The control's test id is `refresh`.

## Driving it with drive.mjs

Preconditions, from an empty browser profile:

- Run `node docs/verification/verify-thedailyfeed/scripts/drive.mjs launch`.
- Run `node docs/verification/verify-thedailyfeed/scripts/drive.mjs doctor` and require `doctor ok`.
- The command below writes the two fixture feeds into `rss-feeds` before navigation. The query contains `feature=refresh-feeds`. It removes `rss-offline-feed-snapshots-v1`.

- **Load the edition.** Wait until both article titles are visible, the header contains `2 items`, and no `POST /api/feeds` is in flight.
- **Refresh.** `refresh` matches one element. Choose it. A `POST /api/feeds` starts at or after the click, and the started count is higher than it was before the click.
- **Settled again.** Both titles remain, and the in-flight count returns to 0.
- **Proof.** Run `node docs/verification/verify-thedailyfeed/scripts/drive.mjs run refresh-feeds`. `evidence/refresh-feeds/stream.json` records the post count before the click and the post that started after it.

## Gotchas

- The manager also has a button named `Refresh feeds`. Keep the manager closed and use the header test id `refresh`.
- The server cache lasts one hour. This refresh often returns both feeds from that cache, so it does not repeat the 2.5 second gap. The new post is the proof. Titles that were already on screen, with no new post, are the previous edition.
- A second mount in development can add posts before the click. Compare the count with the sample taken after the edition settled.
