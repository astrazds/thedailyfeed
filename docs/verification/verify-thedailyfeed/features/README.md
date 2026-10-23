# The Daily Feed verification map

This directory is the maintained source for verifying the user-facing web reader. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs launch`.
- The reader is usable at `http://127.0.0.1:3217/` when the heading `The Daily Feed` is visible.
- Run `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs doctor` and require `ok: true`.
- Each drive uses a fresh browser context. Do not drive a server this run did not start.
- Do not share port 3217 with another verification run.

## Driving conventions

- Start every recipe from the launched instance unless its preconditions say otherwise.
- Prefer the accessible name `The Daily Feed`, `Refresh feeds`, and `Manage feeds`, and the banner test id `feed-header`.
- Run the mapped drive command exactly as written.
- Leave `docs/verification/evidence/` in place during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Edition proof includes the banner snapshot, the screenshot, and the `rss-feeds` value.
- Record the feature id and the entry point in `action.txt`.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-thedailyfeed` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Read the edition](./read-edition.md) covers opening the reader and seeing the edition header.
- [Refresh feeds](./refresh-feeds.md) covers checking sources again from the header control.
- [Manage feeds](./manage-feeds.md) covers opening the subscription manager.
