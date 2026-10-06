# Expo web migration

The web application uses the Expo Metro export and React Native components. Next remains the same-origin API and static-file host. Native device support is a later phase.

The web implementation is complete. The [release 1.2.8 acceptance record](expo-web-acceptance.md)
adds loading-motion, large-response, live HTTP, and cross-browser evidence.
Physical iPhone Safari verification remains outstanding. The [native work list](../../mobile/README.md#native-platform-work)
describes the separate device phase.

## Chosen boundaries

The existing `Feed` record remains the subscription model. It retains IDs, names, enabled state, and creation dates. `runFeedManagerOperation` remains the durable mutation owner. The web application reads the existing `rss-feeds` and `rss-offline-feed-snapshots-v1` keys directly. A valid empty inventory remains empty. A missing inventory can import subscriptions from the earlier Expo proof once. Foreign-server snapshots are not imported.

The existing feed-set lifecycle owns progressive results, completion, interruption, and snapshot effects. The Expo transport validates bounded JSON and NDJSON responses. Explicit refresh and enabled-subscription changes start requests. The old hourly timer is removed, consistent with the product vision.

The reader and manager use React Native components. Browser dialog behavior, OPML file transfer, DOMPurify preparation, and service-worker registration use web adapters. The article renderer remains native after web sanitization. There is one frontend build pipeline.

The production build exports Expo before building the existing API host. A generated asset inventory supplies the complete shell precache. The worker keeps its existing URL and scope. Feed API responses remain outside the offline cache. Subscriptions and article snapshots remain browser data.

## Alternatives

Three designs were compared before implementation. A dedicated Node server would remove Next but replace request cancellation, stream backpressure, headers, static serving, and deployment boundaries. That backend rewrite is unnecessary for this frontend phase.

Bundling React Native Web through Next would retain two frontend compiler contracts and leave production web outside Expo. The selected design instead serves the genuine Metro export. It takes the generated asset inventory from the dedicated-server design and the narrow browser adapters from the shared-entry design.

## Verification boundary

The initial migration verified the production root, existing manager operations, data continuity, streaming behavior, article safety, accessibility, reader visual baselines, actual offline reload, service-worker upgrade, development hot updates, and the hardened container. Native builds and live deployment were outside that initial verification.

The [initial decision trail](expo-web-decisions.tsv) records the choices and verification evidence from the release 1.2.7 migration.

The [initial verification record](expo-web-verification.json) preserves the release 1.2.7 gate results, frozen reader comparison, article and HTTP checks, and container runtime evidence. It is historical evidence, not a current test-count inventory. The first full browser run found disabled refresh regressions. A focused recheck passed after the fix, followed by all 74 browser cases in that gate. The independent review also found missing article list roles, which were fixed and rechecked.
