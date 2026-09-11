# Vision

This document states the product's intended boundaries. The
[architecture decisions](docs/architecture-decisions.md#known-implementation-gaps)
record known differences in the current implementation.

The Daily Feed exists so that people can read today's articles from sources they choose in a quiet, self-hosted reader.
It serves the individual reader, turning browser-selected RSS and Atom feeds into a chronological page of today's items.
It owns exactly one thing: the daily reading surface between a person's chosen feeds and the publishers' originals.

## Today defines the reading boundary

The reader's local calendar day determines the edition, with no configurable day boundary or section for articles whose publication date is unknown.
An open session may retain its clearly dated edition after midnight until refresh or closure, without fetching more items for that edition.
Any snapshot retained for that continuation expires with the session and does not become a previous-day edition that can be reopened.
Items appear newest first, with their source and a path to the original, and entries from different sources remain distinct even when they link to the same article.
The page has no unread debt to clear, no read-state dismissal controls, and no archive to maintain.
A source with nothing new today is a valid outcome, distinct from a source that failed to load.
Outside an already-open session crossing midnight, offline reading reuses only same-day snapshots and makes a failed refresh visible.
Saved content is a convenience for today's reading, not a promise to preserve articles or images.

## The reader owns the sources

The reader chooses, names, enables, and removes feeds without an account; content selection stops at choosing sources rather than keyword exclusion rules.
Subscriptions and offline snapshots stay in the browser profile, and OPML transfer happens there without a separate application backup format.
The server fetches requested feeds and keeps only disposable, bounded caches rather than a subscription database.
A failed subscription write preserves the prior state and never reports a successful change.
Import limits reject excess additions without silently trimming an existing collection.
The application has no advertising SDK or reader analytics, and its privacy description names the requests visible to operators and publishers.

## Reading stays primary

Typography, article layout, and ordinary links make feed content readable on desktop and narrow screens.
Feed management remains usable with a keyboard and within the mobile viewport.
Loading, empty, failed, and saved-content states communicate what happened and the relevant next action.
Detailed source status belongs in feed management, leaving the article stream focused on reading.
Feed-provided content is sanitized and normalized for safe display, with long excerpts expandable in place.
The publisher's original remains the destination when the feed does not supply enough content.
Article images load from publisher hosts rather than through an application image proxy.

## An unreliable source has bounded effects

Useful articles appear as sources finish, without waiting for the slowest source to complete.
Opening the reader and explicit reader actions initiate retrieval; keeping a tab open does not schedule periodic refreshes.
Network requests, retries, redirects, concurrency, and caches have explicit bounds, including the whole operation's deadline.
Readers do not tune per-source time budgets or trade one source's retrieval allowance against another's.
Cancellation stops work that the requesting reader no longer needs.
Feed URLs, DNS answers, redirects, XML, article HTML, and streamed responses cross explicit validation boundaries.
Production rejects non-global network destinations by default, and private-feed exceptions require an explicit review of the expanded access.
Compatibility fixes preserve sanitization, safe destinations, and bounded retrieval instead of adding an unchecked fallback path.
API responses remain uncached by the browser and service worker; offline snapshots have a separate, explicit lifecycle.

## Self-hosting stays small and deliberate

A single application container and a trusted reverse proxy provide the supported hosting shape without a persistent application database.
The application owns safe feed processing and authenticated operational metrics; the proxy owns public TLS and ingress limits.
The runtime uses least privilege, and host-specific topology stays outside the source checkout.
Repository automation verifies changes, while production activation and recovery remain explicit operator decisions.
Modules earn their boundaries by owning real behavior or trust decisions, not by anticipating a general platform.
Recurring defects receive focused regression coverage, and broader gates protect the built reader without growing a second product of testing machinery.

## Scope

The Daily Feed is not an archive, an unread-work tracker, an account service, a cross-device synchronization service, or a full-text extraction service.
Private subscriptions, exported OPML, saved articles, and operational credentials do not become repository content or public diagnostics.
The project does not promise complete publisher content, anonymous third-party requests, or guaranteed offline availability.

A change aligns when it improves reading or managing the chosen daily edition while preserving browser ownership, source entries, reader-initiated retrieval, honest state, and a small self-hosted runtime.
A change should be resisted when it adds article filtering or completion management, expands the daily edition beyond its stated session boundary, moves personal reading state into a server service, or weakens bounded retrieval and trust boundaries.
