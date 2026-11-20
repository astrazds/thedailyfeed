# The Daily Feed verification map

This directory is the maintained source for verifying the web reader. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- From the repository root, run `node docs/verification/verify-thedailyfeed/scripts/drive.mjs launch`.
- Ready is the `ready` line with `setup_ms`. The heading `The Daily Feed` is visible at `http://127.0.0.1:3217/` and the page says `No feeds yet`.
- Run `node docs/verification/verify-thedailyfeed/scripts/drive.mjs doctor` and require `doctor ok`.
- The fixture at `http://127.0.0.1:3218/` serves `morning.xml` and `evening.xml`. The reader fetches those documents. Nothing stubs `/api/feeds`.
- Each `run` uses a new browser context. Do not drive a server this run did not start.
- Launch refuses a second session on ports 3217, 8187, and 3218.

## Driving conventions

- Start every recipe from the commands in that feature file.
- `add-feed` types the fixture URLs into the manager. The other recipes write the same two feeds into `rss-feeds` before the first navigation and remove `rss-offline-feed-snapshots-v1`.
- A missing `rss-feeds` key is the three public defaults. The empty inventory is `[]`.
- Handles that match any count other than the one named in the recipe fail the run.
- The browser timezone is `Australia/Sydney`. Fixture items use that zone's current time as `pubDate`.
- Leave every `evidence/<feature>` directory in place during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- `stream.json` is the action sample. `after.png` and `banner.aria.txt` are the settled reader. `storage.json` is the side effect.
- Record the feature id in `action.txt`.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Add a feed](./add-feed.md) covers typing two fixture URLs and seeing the first article while the second feed is still open.
- [Read the edition](./read-edition.md) covers opening a saved inventory and reading today's two articles.
- [Refresh feeds](./refresh-feeds.md) covers the header refresh control issuing a new feed request.
- [Offline snapshot](./offline-snapshot.md) covers a failed refresh that still shows today's saved articles.
