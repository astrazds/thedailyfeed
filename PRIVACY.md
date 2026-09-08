# Privacy and data flow

The Daily Feed has no account database, cross-device sync, advertising SDK, or
application analytics. Each self-hosted instance is operated independently.
This describes the source application, not the policies of an instance's host
or the publishers you read.

| Data | Where it goes and how long it stays |
| --- | --- |
| Feed names, URLs, enabled status | Browser localStorage until edited, deleted, or site data is cleared. |
| OPML imports and exports | Parsed or generated in the browser. Exported files remain wherever you save them. Imported URLs are sent to the server when enabled feeds load. |
| Enabled feed URLs and browser timezone | Sent to the application server to fetch today's items. Manual additions/URL edits send the URL for validation. |
| Feed responses | Fetched by the server from publishers; a bounded, process-local memory cache expires entries or loses them on restart. There is no server-side subscription store. |
| Same-day article snapshots | Browser localStorage for offline fallback. Snapshots can include article HTML and identifying links. |
| Publisher images | Requested directly by the browser; hosts can see your IP address and request metadata. A bounded service-worker image cache may keep copies locally. |
| Operational logs and metrics | The server logs redacted operational events and keeps process-local metrics. Operators control log retention; the reverse proxy may retain client IPs. |

External article links open publisher sites under their policies. Feed URLs can
contain access tokens: treat private subscriptions and OPML exports as sensitive.
Do not assume URL redaction makes third-party feeds anonymous. DNS and feed
publishers see requests from the server; image hosts see requests from browsers.

Fonts are shipped with the application, so reading and building do not require
Google Fonts requests. API responses use `no-store` and are not cached by the
service worker. Offline article snapshots are a separate browser-local feature.

Export OPML before clearing site data if you want to retain subscriptions.
Clearing browser site storage also removes snapshots and PWA caches; exported
files and server/proxy logs require separate deletion by their owners. Inspect
your browser's site-data controls and your instance operator's retention policy.
