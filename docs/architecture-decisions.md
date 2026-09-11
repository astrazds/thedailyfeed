# Architecture Decisions

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

## Forms own drafts and the modal owns dialog behavior

`components/feed-manager-modal.tsx` composes the manager and owns its native
dialog, active editor, and focus after inventory changes.
`components/feed-manager-form.tsx` owns add/edit drafts, field validation,
linked errors, and submit controls. Its add/edit mode determines the IDs,
spacing, and controls without exposing those details to callers.

`components/use-feed-manager-actions.ts` runs validation and storage operations,
publishes saved subscriptions, and owns failure and progress messages.
`feed-manager-list.tsx` owns row presentation and delete selection.
`feed-manager-transfer.tsx` owns the file input and export controls.
The existing delete-action component owns confirmation and cancellation focus.

For example, the add caller submits `{ type: 'add', ...draft }` through
`actions.save`. The form clears its draft only when that promise returns true.
The edit caller submits `{ type: 'edit', id, ...draft }` and closes the editor
after success. OPML controls pass a `File` to `actions.importFile`; the action
formats the storage summary for the stable status region.

The mounted form owns a complete `{ name, url }` draft. The modal's nullable
`Feed` selects the editor, so an edit ID cannot exist without its initial data.
Only one add, edit, or import can be pending. Row actions and refresh remain
independent, as in the existing interface. Closing the dialog does not unmount
these owners or discard their drafts.

The existing edit-completion behavior also remains. An earlier save can close
a subsequently selected editor, and an earlier edit failure can appear on that
editor. Correcting this requires correlating responses with editor sessions and
covering delayed responses in the browser. This refactor does not resolve it.

A central reducer was considered. It would require events for every field
edit, asynchronous completion, file interaction, and focus effect. Local form
ownership keeps these changes within the form and avoids an additional event
protocol. The small action coordinator retains the shared operation state.
This accepts a few focused components in exchange for shorter change paths.

Browser characterization covers draft retention, field errors, pending forms,
concurrent editing, focus, storage failure and retry, and OPML round trips.
`FEED_UI_CAPTURE_DIR` makes `e2e/feed-manager.spec.ts` capture synthetic reader
and manager states for before/after visual comparison in both viewport sizes.

## Progress events have one model and an explicit wire boundary

`lib/types.ts` owns `FeedItem`, its derived `SerializedFeedItem` representation,
and `FeedProgressEvent<Item>`. Browser code imports article types from this
shared module rather than the server RSS parser.

`lib/feed-response-adapter.ts` converts dates to ISO strings and removes
server-only outcome details. `lib/feed-stream-parser.ts` validates incoming
JSON/NDJSON before it reaches client state. Sharing TypeScript types does not
make network input trusted.

## Feed retrieval keeps safety checks in one pipeline

Fetching and parsing share destination validation, redirect checks,
cancellation, response-size limits, and timeout budgets. Feed-set orchestration
and the validation route use this pipeline so callers receive the same safety
controls. `lib/feed-operation-budget.ts` keeps one aggregate validation deadline
across attempts and retry delays.

## Client lifecycle owns progressive and offline state

`lib/feed-set-lifecycle.ts` coordinates progressive results, snapshot preview,
offline fallback, terminal state, and persistence effects. React components
consume its read model through `useFeedStream`.

Keeping these transitions together prevents separate UI branches from disagreeing
about whether results are current, incomplete, or an offline fallback.

The current hook retains an hourly refresh timer. `VISION.md` excludes periodic
refresh. Resolving that product discrepancy is separate from structural changes.

## Shared policies serve concrete consumers

Route admission, Request ID handling, metrics exposure, and cache/header policies
have multiple consumers. Their shared modules keep those consumers consistent
without putting HTTP policy into feed parsing or browser storage.
