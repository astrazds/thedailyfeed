---
name: verify-thedailyfeed
description: Drive The Daily Feed web reader in a browser and prove a local fixture feed streams today's articles. Use when launching the reader, adding a feed, refreshing feeds, or checking an offline snapshot.
---

# Verify The Daily Feed

The Daily Feed is a self-hosted RSS reader. Drive the web reader. Next serves the Expo screen and the feed API on one origin. Subscriptions and same-day snapshots stay in this browser profile.

This skill stays in `docs/verification/verify-thedailyfeed/`. `/.cursor/` and `/.agents/` stay gitignored. Do not weaken those ignore rules to move the skill.

Run every command from the repository root. `drive.mjs` is the only way to start the browser. Playwright, run state, and new evidence stay in `.tools/`, `run/`, and `evidence/` under this directory.

Feeds come from the network. This skill serves a real RSS document over HTTP, and the reader fetches that URL the same way it fetches any other feed. The development server allows a loopback feed URL. A production process blocks loopback feeds unless `ALLOW_PRIVATE_NETWORKS=true`, so this skill starts `scripts/dev.mjs` and does not attach to a production container.

One session owns ports 3217, 8187, and 3218. Launch refuses a second session or a taken port.

## Launch

Install dependencies when `node_modules/@playwright/test` or `mobile/node_modules/expo` is missing.

```bash
pnpm install --frozen-lockfile
npm ci --prefix mobile
```

Start the fixture and the development server.

```bash
node docs/verification/verify-thedailyfeed/scripts/drive.mjs launch
```

Ready is a stdout line that starts with `ready` and includes `setup_ms`. The process prints it only after all of these are true.

- The fixture answers `GET /status` on `http://127.0.0.1:3218/`.
- A fresh browser profile at `http://127.0.0.1:3217/` shows one heading named `The Daily Feed`.
- That profile shows `No feeds yet`.

`setup_ms` is the whole launch, including the Chromium install on a cold machine and the first Expo and Next compile. `browser_ms` is only the browser check. The line also prints the app pid. A listening port without that line is not ready. The launch command exits after the line. The servers keep running.

The ready profile sets `rss-feeds` to `[]` and removes `rss-offline-feed-snapshots-v1`. A missing `rss-feeds` key loads Daring Fireball, The Verge, and WIRED.

The shell for the servers sets `RATE_LIMIT_MAX_REQUESTS=100` so a pass through the map can fetch more than the default ten feed requests per minute. `NEXT_TELEMETRY_DISABLED=1`.

## Doctor

Run this before a drive whenever the page looks wrong. It does not click, type, or reload.

```bash
node docs/verification/verify-thedailyfeed/scripts/drive.mjs doctor
```

Exit 0 prints `doctor ok` with the app pid, the fixture pid, the origin, the listener pids, and HTTP status. The check passes only when the app pid is alive, its command contains `scripts/dev.mjs` and `--port 3217`, the fixture pid is alive and its command contains `serve-fixture`, every listener on port 3217 is a descendant of the app pid, and `GET /` returns HTTP 200 with an HTML document. Anything else means do not drive.

## Drive

Read `features/README.md`, then one feature file. Run that file's command unchanged. Each `run` opens a new browser context with timezone `Australia/Sydney` and locale `en-US`. The context writes the file's starting `rss-feeds` value before the first navigation.

The driver throws when a handle matches any count other than the one the step names. Wait for that count before clicking or typing. The header gear is `connection-settings`. The empty-state button is also named Manage feeds, so the accessible name alone matches two controls. The header progress bar is the `[aria-label="Feed loading progress"]` element inside `feed-header`. The manager draws a second bar with the same name while it is open.

```bash
node docs/verification/verify-thedailyfeed/scripts/drive.mjs run add-feed
```

`pass feature=add-feed evidence=... verify_ms=...` is a pass. `verify_ms` is that command only. A thrown check is a failure. Write the failure down and leave the journey as it is.

The evening fixture holds the RSS body for 2.5 seconds. Morning returns immediately. Both items are dated now in `Australia/Sydney`, which is the browser timezone the reader uses for "today". Each feature adds its own `feature` query on the fixture URL, so one feature does not warm the server cache for the next.

## Evidence

The driver writes the directory for the feature you run. Those directories are gitignored. `docs/verification/evidence/read-edition/` is an older committed capture. This driver does not write there.

- `docs/verification/verify-thedailyfeed/evidence/add-feed`
- `docs/verification/verify-thedailyfeed/evidence/read-edition`
- `docs/verification/verify-thedailyfeed/evidence/refresh-feeds`
- `docs/verification/verify-thedailyfeed/evidence/offline-snapshot`

`stream.json` stores the sampled header, article titles, in-flight `POST /api/feeds` counts, and fixture counters. `action.txt` names the feature, the fixture URLs, and `verify_ms`. `during.png` is the page while the stream gap is on screen. `after.png` is the settled page. `storage.json` is `rss-feeds` and `rss-offline-feed-snapshots-v1` after the reader finishes. `banner.aria.txt` is the header after the articles are on screen. `failure.json` and `failure.png` appear when a run throws.

A pass has to come from the real reader fetching the fixture. Do not fulfill `/api/feeds` in the browser, and do not call an internal setter to paint articles. Writing `rss-feeds` before navigation is the saved inventory a returning reader already has. `add-feed` starts from `[]` and types both URLs into the form.

For `add-feed` and `read-edition`, the stream proof is the gap inside `stream.json`. The header text contains `1 of 2 feeds checked`, `Morning dispatch` is the only article title, `POST /api/feeds` is in flight, and the fixture reports the evening connection open. A snapshot from an earlier add can show `Morning dispatch` while the header still says `0 of 2 feeds checked`. A body that arrives in one piece shows both titles only after the evening connection closes.

## Cleanup

Stop the session this skill started. Cleanup reads `run/state.json`, sends `SIGTERM` to the recorded app and fixture process trees, and sends `SIGKILL` only to those same pids if they are still alive. It checks each root command before signalling. It deletes `docs/verification/verify-thedailyfeed/run/` and leaves the evidence directories.

```bash
node docs/verification/verify-thedailyfeed/scripts/drive.mjs cleanup
```

`cleanup ok` is followed by one `kept` line for each evidence directory.

- `docs/verification/verify-thedailyfeed/evidence/add-feed`
- `docs/verification/verify-thedailyfeed/evidence/read-edition`
- `docs/verification/verify-thedailyfeed/evidence/refresh-feeds`
- `docs/verification/verify-thedailyfeed/evidence/offline-snapshot`

Confirm the evidence directory from the drive still contains `stream.json`. Run cleanup after a failed launch too, so a broken attempt does not keep the ports.

## Helpers

`drive.mjs` is the only helper.

```bash
node docs/verification/verify-thedailyfeed/scripts/drive.mjs launch
node docs/verification/verify-thedailyfeed/scripts/drive.mjs doctor
node docs/verification/verify-thedailyfeed/scripts/drive.mjs run add-feed
node docs/verification/verify-thedailyfeed/scripts/drive.mjs run read-edition
node docs/verification/verify-thedailyfeed/scripts/drive.mjs run refresh-feeds
node docs/verification/verify-thedailyfeed/scripts/drive.mjs run offline-snapshot
node docs/verification/verify-thedailyfeed/scripts/drive.mjs cleanup
```

## Keep the map current

When the reader's controls change, run `/maintain-verification-skill` and update the feature file that drifted.
