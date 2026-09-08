# Architecture Decisions

This document explains the boundaries used by the current implementation.
[TECHNICAL.md](../TECHNICAL.md) describes the API and runtime contracts.

## Feed management owns complete storage mutations

`runFeedManagerOperation` in `lib/feed-storage.ts` owns validation, browser
storage persistence, mutation results, and `feedsUpdated` notifications for
subscription changes.

- Successful mutations persist their result before reporting success.
- Manual additions check capacity before URL validation and re-read storage
  afterward so changes made during validation are included.
- URL/name normalization, duplicate rules, and import limits stay together.
- Notifications reflect changes to the enabled feed set.
- The UI maps operation results into form and dialog state.

`lib/feed-manager-operations.ts` re-exports the interface for existing callers;
it does not contain a second implementation.

## Progress events have one model and an explicit wire boundary

`FeedProgressEvent<Item>` in `lib/types.ts` describes progress for both server
`FeedItem` values and serialized client values.

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

## Shared policies serve concrete consumers

Route admission, Request ID handling, metrics exposure, and cache/header policies
have multiple consumers. Their shared modules keep those consumers consistent
without putting HTTP policy into feed parsing or browser storage.
