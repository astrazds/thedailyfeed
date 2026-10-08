# Architecture decisions

This document explains the boundaries used by the current implementation.
[TECHNICAL.md](../TECHNICAL.md) describes the API and runtime contracts.

## Feed management owns complete storage mutations

`runFeedManagerOperation` in `lib/feed-storage.ts` owns validation, browser
storage persistence, operation results, and `feedsUpdated` notifications for
subscription changes.

- Successful mutations persist their result before reporting success.
- Manual additions check capacity before URL validation and re-read storage
  afterward so changes made during validation are included.
- URL/name normalization, duplicate rules, and import limits stay together.
- Notifications reflect changes to the enabled feed set.
- Results contain the saved inventory. Import results also contain a required
  summary. Change detection stays private to storage.

There is one mutation entry point. Separate CRUD exports would let callers
bypass validation or notification policy.

## Expo owns the application and Next owns hosting

The web application uses the React Native screen tree in `mobile/`. Metro
exports its document and assets. Next serves that export at `/` and retains the
existing feed and metrics APIs. This preserves same-origin storage, streaming,
and deployment without maintaining a second reader.

Browser behavior stays at explicit platform boundaries. The manager's web
adapter uses `<dialog>` for focus containment and Escape dismissal. OPML file
selection and download use browser APIs. Article preparation uses DOMPurify and
DOM normalization before the bounded native HTML renderer. React Native controls
own the reader and manager layout.

The production build precaches the Expo document, JavaScript, fonts, icons, and
manifest through the existing `/sw.js` URL. Development starts Metro and Next
together and does not register a production worker. API responses remain
`no-store` and do not become an offline worker response cache.

## Forms own drafts and the modal owns dialog behavior

`mobile/src/FeedManager.tsx` owns selected editors, pending operations, and
operation messages. `mobile/src/manager/Form.tsx` owns `{ name, url }` drafts,
field errors, and submit controls. Dismissing the dialog does not unmount those
owners. A failed save retains the draft.

`mobile/src/manager/Modal.tsx` owns the browser dialog and returns focus to
its opener. `FeedRow.tsx` owns row controls and delete confirmation.
`transfer.tsx` owns browser file selection and download around `lib/opml.ts`.
An edit response carries a session identity so it cannot close a newer editor.

The UI submits typed commands through `useSubscriptions`. The web adapter calls
`runFeedManagerOperation`, which validates and rereads current storage before
saving. Successful operations publish the saved inventory. Failed persistence
does not announce success or replace the visible inventory.

## Existing browser data remains canonical

Web subscriptions keep `rss-feeds`. Web snapshots keep
`rss-offline-feed-snapshots-v1` and its retention, quota, timezone, and same-day
rules. Existing IDs, names, dates, disabled records, and inventory order survive.
An empty saved inventory stays empty.

The old Expo proof used a different configuration key. When the canonical key
is absent, valid feed records can seed it once. The proof's server address and
snapshot do not become production state. The deployed reader always uses its
own origin. Moving an installation to a new origin still requires user-managed
subscription transfer.

## Progress events have one model and an explicit wire boundary

`lib/types.ts` owns `FeedItem`, its derived `SerializedFeedItem` representation,
and `FeedProgressEvent<Item>`. Browser code imports article types from this
shared module rather than the server RSS parser.

`lib/feed-response-adapter.ts` converts dates to ISO strings and removes
server-only outcome details. `lib/feed-stream-parser.ts` validates incoming
JSON/NDJSON before it reaches client state. Sharing TypeScript types does not
make network input trusted.

The Expo transport applies one 32 MiB response-byte budget before decoding.
A source result contains complete articles and can exceed a small per-line
allowance. The response budget also bounds unfinished records and JSON fallback.
It is a client resource policy, not a guarantee that every server result fits.

## Feed retrieval keeps safety checks in one pipeline

Fetching and parsing share destination validation, redirect checks,
cancellation, response-size limits, and timeout budgets. Feed-set orchestration
and the validation route use this pipeline so callers receive the same safety
controls. `lib/feed-operation-budget.ts` keeps one aggregate validation deadline
across attempts and retry delays.

## Client lifecycle owns progressive and offline state

`lib/feed-set-lifecycle.ts` coordinates progressive results, snapshot preview,
offline fallback, terminal state, and persistence effects. React components
consume its read model through `mobile/src/useReader.ts`.

Keeping these transitions together prevents separate UI branches from disagreeing
about whether results are current, incomplete, or an offline fallback.

## Reader and manager share activity presentation

`lib/feed-load-activity.ts` derives a `FeedLoadActivity` union from lifecycle
state. Only the `loading` variant carries progress counts. Terminal variants
distinguish empty, ready, partial, interrupted, fallback, and failed outcomes.
`mobile/App.tsx` and `mobile/src/FeedManager.tsx` render that shared copy.
The reader places compact progress on the header border. The manager keeps
a detailed activity panel. The reader uses
dedicated failure and snapshot-fallback panels, while the manager uses
the same derived activity for those states. Surrounding components own recovery controls
and announcement routing. Opening the dialog does not start a separate request.

The lifecycle remains the authority for outcomes. Resolving a refresh Promise
does not establish that every feed loaded. Counts include failed and timed-out
sources, and an early stream close leaves unfinished rows marked **Not checked**.
Snapshot persistence requires `done` or a validated JSON response. It is separate
from whether every source succeeded.

Only the active reader or manager context announces feed activity. Form messages
use a separate status region. The refresh control stays mounted while disabled
so completing a request preserves keyboard focus. Three decorative article-shaped
placeholders remain above available articles throughout loading and refresh.
The placeholders disappear when loading ends, while retained articles stay mounted.
The web motion adapter consumes the same loading state. Media queries stop
rotation and placeholder pulses when reduced motion is enabled, without a
separate loading lifecycle or another feed request.

The non-stream JSON compatibility path has no individual feed outcomes. It
assigns the same aggregate status and item count to every enabled source. The
manager displays only each row's status, so it never presents that aggregate
count as a source-specific value.

## Shared policies serve concrete consumers

Route admission, Request ID handling, metrics exposure, and cache/header policies
have multiple consumers. Their shared modules keep those consumers consistent
without putting HTTP policy into feed parsing or browser storage.

## Known implementation gaps

The Expo web frontend is the only application. Android and iOS builds are
outside the [supported platform](../mobile/README.md#supported-platform).
Native fallback implementations and build identities have been removed.

The old hourly retrieval timer is removed to follow [VISION.md](../VISION.md).
Requests run on opening, enabled-source changes, and explicit refresh. An open
edition stays visible across midnight until the next retrieval. A server cache
hit may still reuse feed data until its TTL expires.

The repository's Chromium UI suite uses synthetic publisher content. Worker upgrade and actual
offline reload have a separate production runtime check. Neither check proves
an installation's HTTPS proxy, live publisher availability, or every browser's
PWA installation flow. See [testing scope](../TECHNICAL.md#testing).
The separate [web acceptance record](migrations/expo-web-acceptance.md) includes
live HTTP and additional browser-engine checks with their limits.
