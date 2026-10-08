# Work on the Expo web application

This package owns The Daily Feed's reader and feed manager. It uses Expo,
React Native views, `@native-html/render`, and `expo/fetch`. This is the only
frontend. It targets web browsers, including installed PWAs.

## Run the integrated application

Run these commands from the repository root.

```sh
mise install
mise run install
mise run dev
```

Open `http://localhost:3000`. The root command starts Expo Metro and Next
together. Next serves the API and proxies the development client so requests
stay on the page's origin. The standalone `npm run web` command starts Metro
only and does not provide the API.

Open **Manage feeds** to add, edit, enable, disable, or delete subscriptions.
The manager also imports and exports OPML. The browser's timezone selects
what counts as today. The reader follows the system theme. There is no
connection-address or timezone editor in the deployed application.

## Build and verify

Run focused Expo checks from the repository root.

```sh
npm run typecheck --prefix mobile
npm test --prefix mobile
mise run build
mise run browser
pnpm verify:web-runtime
```

`mise run build` exports this package, copies its output into the host's public
assets, and builds Next with the revisioned service worker. `mise run browser`
uses synthetic feeds and blocks external requests and workers. The separate
runtime check enables workers and verifies an installed-worker upgrade,
retained subscriptions, offline shell and article reload, bundled fonts, and
the absence of cached API responses. Neither check deploys the application.

`mise run verify` is the full repository gate. It also checks metadata, both
packages, and an unpublished hardened Docker image. See the root
[testing reference](../TECHNICAL.md#testing) for API integration coverage and
[contribution guide](../CONTRIBUTING.md) for synthetic screenshot capture.

## Data and platform ownership

`useSubscriptions` exposes the canonical `Feed[]` inventory and complete
subscription commands. Its web adapter reuses `lib/feed-storage.ts` and the
`rss-feeds` key. Existing IDs, dates, order, names, and disabled records survive.
A valid empty inventory remains empty. Only an absent canonical key permits
feed-only migration from the old Expo proof configuration.

`useReader` reuses the shared lifecycle and wire parser. Its hook owns request
cancellation and ignores obsolete generations. Only completed responses save
snapshots. Web snapshots use `lib/offline-feed-cache.ts` and the existing
`rss-offline-feed-snapshots-v1` key, including bounded multiple-feed-set storage.
Storage failures leave network reading available. Refresh runs on opening,
enabled-source changes, and explicit actions. There is no polling timer.

The browser article adapter sanitizes with DOMPurify, normalizes the DOM, and
passes the result through a bounded parsed tree before React Native rendering.
It fails closed without a DOM. Dialog focus, OPML file selection and download,
worker registration, installation, and connection notices have web adapters.
Each capability has one browser implementation.

## Supported platform

The application targets web only. Android and iOS builds are outside the
current product scope. Native fallback implementations and build identities
are not retained. React Native remains the UI framework.

The [web acceptance record](../docs/migrations/expo-web-acceptance.md) covers
Chromium, Firefox, and WebKit. WebKit with an iPhone-sized viewport is browser
emulation, not physical iOS Safari or a native application test.

## Compare reader styling

The sealed original-reader screenshots live in `tests/style-baseline`. They
cover ready articles, expanded rich text, initial loading, and an empty day.
Each case uses fixed UTC time, synthetic feeds, light and dark themes, and
390 × 844 and 1280 × 900 viewports.

```sh
cd mobile
FONTCONFIG_FILE="$PWD/tests/style-fontconfig.conf" \
  STYLE_TARGET_URL=http://localhost:3000 npm run verify:style
```

The comparison rejects changed baseline hashes, changed comparison code, a
different Chromium version, and any nonzero pixel difference. The fixtures
exercise feed-only migration when the canonical subscription key is absent.
The comparison covers these selected reader states. The integrated browser
suite separately covers canonical storage and manager behavior. Neither test
establishes native device rendering.

The root `pnpm verify:expo-browser` gate pins grayscale font rendering through
`tests/style-fontconfig.conf`. This matches the sealed Linux screenshots and
prevents host subpixel settings from changing the comparison. The baseline and
zero-pixel threshold remain unchanged.
