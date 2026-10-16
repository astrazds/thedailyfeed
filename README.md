<p align="center">
  <img src="public/thedailyfeed-light-192.png" width="112" height="112" alt="The Daily Feed newspaper icon">
</p>

<h1 align="center">The Daily Feed</h1>

<p align="center">Today's articles. Your sources. A quieter way to read.</p>

<p align="center">
  <a href="https://github.com/astrazds/thedailyfeed/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/astrazds/thedailyfeed/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

The Daily Feed is a self-hosted RSS reader for the articles published today.
Choose your feeds, open the page, and read a clean, chronological stream.
There are no accounts, unread counts, or subscriptions to a service.

Expo and React Native render the only frontend. Next.js serves the exported
app and its same-origin feed API. The application targets web browsers and
installed PWAs. Android and iOS builds are outside the product scope.
The [web acceptance record](docs/migrations/expo-web-acceptance.md) describes
browser coverage and the remaining physical-device checks.

<img src="docs/assets/readme/thedailyfeed-themes.png" width="419" alt="The Daily Feed, with light mode on the left and dark mode on the right">

This image combines equal halves of two captures of the same synthetic reader.
[Mobile screenshot](docs/assets/reader-narrow.png) shows the narrow layout.

Current release: `1.2.13`.

## Install and self-host

You need Git, Docker with Compose v2 and Buildx, and a host-installed reverse
proxy for public access. Containers are built from source; no registry account
or prebuilt application image is required.

```bash
git clone https://github.com/astrazds/thedailyfeed.git
cd thedailyfeed
cp env.template .env.production
chmod 600 .env.production
./scripts/deploy-compose.sh
```

Open `http://127.0.0.1:3000` on that host. Compose binds only to loopback,
uses its own network, and runs a non-root container with a read-only filesystem.
Set `APP_PORT` in `.env.production` if port 3000 is already in use.

For internet access, follow [DEPLOYMENT.md](DEPLOYMENT.md), including the
[complete Nginx HTTPS example](deploy/nginx.conf). DEPLOYMENT.md also covers a
Traefik-style label baseline. Public TLS, rate limits,
request-body limits, and unbuffered streaming belong at the reverse proxy.

## Use

- Open **Manage feeds** to add, edit, disable, or delete a source. Additions
  validate the RSS or Atom URL before saving. The inventory limit is 50 feeds,
  including disabled feeds; older oversized inventories are never trimmed.
  When `rss-feeds` is missing, unparseable, or not an array, the reader presents
  three default sources (Daring Fireball, The Verge, and WIRED). A stored empty
  inventory stays empty. An array with mixed invalid records keeps only the
  valid subset and does not restore those defaults.
- Import or export an OPML file to move subscriptions between browsers.
  Export writes each feed's enabled state as `enabled="true"` or
  `enabled="false"`. Import restores that flag and treats a missing attribute
  as enabled. Import skips duplicates and invalid URLs, and reports entries
  over the limit.
- Read today's items in your browser's timezone, newest first. The header date
  stays frozen to the retrieval start until the next open, enabled-source
  change, or explicit refresh. Articles appear progressively as each source
  finishes. Expand long excerpts or open the original. Article title and body
  links open in a new tab.
- Choose the **Refresh feeds** icon to check your sources again. A thin header
  progress line, rotating icon, pulsing placeholders, and feed count track
  loading while available articles stay readable. Open **Manage feeds** to see
  which sources are still checking or need another try. Loading animations
  respect your reduced-motion preference.
- If sources fail or remain unchecked, use **Refresh feeds** or **Try again**
  in the reader, or **Try all feeds again** in the manager. A checked source may
  have failed or timed out; **Not checked** means no result arrived for it.
- Install the app through your browser if it supports PWAs. Saved same-day
  snapshots provide fallback for the same enabled sources and timezone.
  After a failed refresh with saved items, **Unable to refresh** shows
  "Showing saved items from today." With a matching empty snapshot it shows
  "Try again to check your feeds."

See the synthetic [feed-manager progress](docs/assets/loading-manager-narrow.png)
screenshot.

## Privacy

Subscriptions and same-day offline snapshots stay in this browser's
`localStorage`. OPML processing is client-side. Feed URLs are sent to the app
server for fetching and validation; the server keeps a bounded in-memory cache.
Publisher images load directly in the browser and can reveal your IP address
to their hosts. Typography is bundled locally. There is no application analytics
or account database. Read [PRIVACY.md](PRIVACY.md) for the full data flow.

## Limitations

This is a reader for today, not an archive or a cross-device reading service.
There is no account, sync, full-text extraction service, or guaranteed offline
copy of every article or image. Clearing site data removes your subscriptions
and snapshots; export OPML before moving or resetting a browser. Feed quality,
publication dates, upstream availability, and publisher content determine what
appears. Private-network feeds are blocked in production by default.

Refresh requests can reuse the server's feed cache, which lasts one hour by
default. The reader loads on opening, when enabled sources change, and on
explicit refresh. It does not poll on a timer. An open edition stays available
until the next retrieval, and the header date stays frozen to that edition's
retrieval start.

## Development

Use [mise](https://mise.jdx.dev/) to select the Node, pnpm, and Python versions
in `mise.toml`. Python runs the independent XML tests.

```bash
mise install
mise run install
mise run dev
```

Open `http://localhost:3000`. The root development command starts Next and
Expo Metro together. Use this address so the app and API share an origin.
No backend-address editor or CORS configuration is needed.

For focused checks, use `mise run test`, `mise run lint`, or `mise run typecheck`.
The full portable gate also needs Docker/Buildx and Chromium system dependencies:

```bash
mise run verify
```

It installs locked dependencies, validates release metadata, runs lint,
TypeScript and unit tests for the server and Expo app, exports the Expo web
application, builds Next and the service worker, runs browser and offline-runtime
checks, and builds one unpublished Docker image. It never deploys.

After `mise run build` and `mise run browser-install`, run `mise run browser`.
Use `mise run integration` for the API tests that start a local server.
See [browser verification and screenshots](CONTRIBUTING.md#browser-verification-and-screenshots)
for capture commands, evidence, and coverage limits.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[TECHNICAL.md](TECHNICAL.md) for contribution guidance, private security reporting,
and the public JSON/NDJSON contracts. Self-hosting and updates are covered in
[DEPLOYMENT.md](DEPLOYMENT.md). Application code is [MIT licensed](LICENSE);
Roboto Serif retains its [SIL Open Font License](public/fonts/OFL.txt).
