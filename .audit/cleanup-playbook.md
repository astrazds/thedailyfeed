# Code cleanup sweep (broader path)

## Predicate

1. In-scope inventory items applied or declined with a trail row.
2. No SSRF, feed wire, SW, sanitizer policy, or subscription-mutation behavior change.
3. `mise run lint`, `mise run typecheck`, and `mise run test` green after the last unit. Proof logged under `.audit/cleanup-gates.log`.
4. Dependency alignment: root `dompurify` aligned; full `mise run verify` when Docker is available. On hosts without Docker, prove `pnpm build`, `pnpm test:browser`, and `pnpm verify:web-runtime` instead, and mark compose/image/style steps INCONCLUSIVE if they fail on an unmodified baseline.
5. Product LOC down or flat aside from dep lockfile churn.

## In scope

Dead statement, dead exports, shared article byte limit, shared RN-web lineHeight cast, narrating comment trim in `lib/`, root/mobile `dompurify` and `react`/`react-dom` alignment.

## Out of scope (declined)

URL-policy merge, MVP config key removal, `.audit/` commit/delete, `feed-operation-budget` inline, rate-limit layer merge, `droppedTags` sanitizer merge, fixture unification, `@types/node` skew.

## Units

0. Branch, baseline gates, decision trail start.
1. Dead `snapshots.ts` line.
2. Un-export dead symbols.
3. Shared article HTML byte limit.
4. Shared lineHeight cast helper.
5. Comment trim in `lib/`.
6. Dependency alignment + install.
7. Full verify gate.
8. Trail audit, cross-model review, PR.
