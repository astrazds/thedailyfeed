# Doc update suite playbook (designed)

## Predicate (done)

1. Every file in `tests/docs-claims.test.mts` `markdownFiles` describes HEAD `1.2.11` behavior without stale product claims.
2. `node scripts/doc-drift-inventory.mjs` reports zero warnings for non-historical probes (or documents intentional historical exceptions).
3. `mise run test` passes (includes documentation claim checks).
4. `git diff --check` is clean on the doc diff.

## Scope

Claim-set docs only (about 13 markdown files). Behavioral sync for Expo-sole frontend (#14–#18) and 1.2.11 reader/OPML/acceptance (#19). No product code changes unless a doc claim forces a one-line marker fix.

## Rigor

Medium-high. Docs are the operator and agent contract. Reversible edits. Arena skipped (mechanical claim sync; laziness protocol).

## Units

1. Harness baseline (`scripts/doc-drift-inventory.mjs`) — done.
2. Parallel drift audit (product / reference / explanation slices).
3. Apply fixes by Diátaxis surface.
4. Encode durable checks in the inventory script and, where structural, `docs-claims.test.mts`.
5. Verify predicate; open PR; commit decision trail.

## Fan-out

Three local explore auditors, each writing `.audit/doc-drift-*.md`. No shared file writes.
