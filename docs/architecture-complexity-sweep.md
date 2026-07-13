# Architecture Complexity Sweep

Date: 2026-07-13

## Scope and constraints

The sweep covered all application, library, UI, script, configuration, and test files. `README.md` and `TECHNICAL.md` supplied the domain language because the repository has no `CONTEXT.md` or ADRs. Existing tests, strict TypeScript, ESLint, the production build, and the PWA build contract were treated as the behavioral gates.

The visual review was generated outside the repository at `/tmp/architecture-review-20260713-1340.html`. That HTML file is a session-local review artifact; this document is the durable repository record.

## Implemented

### Deepened Feed manager module

Feed mutation implementation, storage persistence, mutation facts, and `feedsUpdated` notification now live behind `runFeedManagerOperation` in `lib/feed-storage.ts`.

- Each operation loads storage once instead of two or three times.
- Each operation persists at most once.
- URL/name normalization, duplicate rules, import limits, changed Feed facts, and enabled Feed set notification have locality in one module.
- `lib/feed-manager-operations.ts` remains as a compatibility interface for existing imports.
- The modal uses the deep module directly.

### Canonical Feed progress event

`FeedProgressEvent<Item>` in `lib/types.ts` is now the shared interface for server-side `FeedItem` progress and client-side serialized progress.

- Server orchestration no longer repeats the meta, result, and done event fields.
- The response adapter remains the serialization seam that converts `Date` to ISO strings and removes the server-only terminal outcome.
- Runtime parsing remains at the network trust seam and preserves the existing NDJSON wire schema.

## Deferred candidates

These candidates did not meet the confidence threshold for a behavior-preserving sweep:

- Feed retrieval interface: retry, redirect, DNS validation, abort, and nested deadline behavior recently changed and is security-sensitive. Deepening it should be a separately specified change with targeted fault-injection tests.
- Feed route adapter: admission and response policy have real reuse, but consolidation risks changing cache, rate-limit, and Request ID headers. The current modules pass the deletion test.
- Client Feed set lifecycle: the seam earns locality for snapshot, progressive-result, fallback, and abort behavior. Removing transition ceremony safely needs React hook race tests beyond the current pure lifecycle suite.
- `feed-operation-budget.ts`: its small interface records the single aggregate validation deadline and is part of the recent security contract.
- `metrics-exposure-policy.ts`: the policy has two production consumers, so its seam is real rather than hypothetical.

## Verification evidence

- Tests: 104 passed, 5 integration tests skipped by their existing environment guard.
- ESLint: passed.
- TypeScript `--noEmit`: passed.
- Next.js production build with webpack: passed.
- PWA artifact verification: passed, including `/api/feeds` `NetworkOnly` policy.

No external request or response fields, storage schema, user-visible copy, routes, cache policy, security policy, or public import interface were removed.

## Current documentation map

- [`README.md`](../README.md): product overview, setup, public routes, security model, and core module map.
- [`TECHNICAL.md`](../TECHNICAL.md): detailed runtime architecture and contracts.
- [`DEPLOYMENT.md`](../DEPLOYMENT.md): production configuration, reverse proxy, operations, and update workflow.
- [`AGENTS.md`](../AGENTS.md): repository-local agent instructions and vendored Next.js documentation index; it is operational metadata rather than product documentation.
