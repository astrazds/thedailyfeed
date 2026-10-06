# Run the Expo reader proof

This experimental reader uses React Native views, `@native-html/render`, and `expo/fetch`. The browser proof tests real delayed HTTP responses. It does not verify Android, iOS, Hermes, or native networking.

1. Run `npm ci` in `mobile`.
2. Run `npm run fixture` in one terminal.
3. Run `npm run web` in another terminal.
4. Open `http://localhost:8081`.

You see today's synthetic articles arrive one source at a time. Select **Continue reading** to expand an article. Select **Sources** to set the server address, feed URLs, and timezone. Select **Dark** to change the theme.

To use your server, enter its HTTPS origin and your enabled feed URLs. The server must provide `POST /api/feeds?stream=1`. For browser use, configure ingress CORS to permit the Expo web origin, POST, and the Content-Type header. The existing Next backend remains unchanged. Native devices require a reachable server address rather than localhost.

Run the repeatable checks with these commands.

```sh
npm run typecheck
npx expo install --check
npm test
npx playwright install chromium
npm run verify:web
npm run export:web
```

The browser script starts missing development servers and writes synthetic screenshots and verification results to ignored `artifacts/`. It tests progressive rendering, interrupted streams, terminal errors, JSON fallback, cancellation, same-day offline reload, stale snapshots, configured timezones, expansion, and unsafe markup. Its fixture endpoints also expose `/normal`, `/interrupted`, `/terminal`, `/json`, `/offline`, `/slow`, and `/partial` before `/api/feeds`.

The reader imports the existing pure lifecycle and parser directly. The hook owns cancellation and request generations. Only completed responses save a snapshot. Interrupted responses never save. A completed partial response saves its successful articles, matching the existing reader. Storage errors leave network reading available.

One AsyncStorage snapshot is capped at 256,000 UTF-8 bytes. Its identity includes the server address, enabled feed URLs, and timezone. The day must match today. Article markup passes through a bounded parsed tree before native rendering. Scripts, embedded media, publisher styles, event attributes, unsafe URL schemes, and private destination literals are removed. DNS-based destination checks remain a backend responsibility.

The proof omits feed management, OPML import and export, and native release configuration. It is versioned independently at 0.1.0.

## Compare reader styling

Start Expo with `npm run web`. In another terminal, run the comparison.

```sh
STYLE_TARGET_URL=http://localhost:8081 npm run verify:style
```

The comparison covers ready articles, expanded rich text, initial loading, and an empty day. Each case runs at 390 × 844 and 1280 × 900 in light and dark themes. It uses fixed UTC time and synthetic feeds. Screenshots and pixel differences go to `artifacts/style`.

The original Next reader screenshots are in `tests/style-baseline`. The manifest records their source commit and Chromium version. It also seals the fixture and comparison script. The check rejects changed baselines, changed comparison code, a different browser version, and any nonzero pixel difference. Baseline browser logs include the existing service worker registration error caused by blocking service workers. Expo captures require no uncaught errors or external requests.

This comparison covers the reader. The floating control opens the MVP connection editor. The original feed manager and native device rendering require separate proofs.
