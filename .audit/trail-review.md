# Audit trail cross-model review

**Reviewer:** composer-2.5-fast (cross-family review of grok-led doc sync run)
**Reviewed:** 2026-10-14 (local re-check on branch `docs/1.2.11-claim-sync`)
**Primary artifacts:** `.audit/doc-update-suite.tsv`, `.audit/playbook.md`, `.audit/doc-drift-{explanation,product,reference}.md`
**Branch tip:** `f395faacbf9fb97ab5b4040976e6dc0d0919b8e5` — `docs(guides): sync claim-set docs with 1.2.11 behavior`
**Code baseline cited in audits:** `e3473b92851e6c85fcd587c0e2fa08f96504019b` (release 1.2.11 reader/OPML fix, parent of doc commit)

## Executive summary

The run is **substantively sound**: three slice audits correctly identified the same 1.2.11 gaps the harness baseline captured, fixes landed in one doc commit, and **independent re-runs** of `node scripts/doc-drift-inventory.mjs` and `mise run test` on the current branch both succeed (0 inventory issues, 150 pass / 5 skipped integration tests). The decision trail is **useful but uneven**: several playbook predicates were treated as satisfied without logged proof, one TSV evidence token is invalid, and the inventory harness encodes a few **calendar-coupled** and **narrow** probes that can pass while product README gaps (e.g. new-tab links outside TECHNICAL) stay untested by the gate.

---

## Trail chronology (TSV)

| Time (UTC) | Phase | Claim | Review note |
| --- | --- | --- | --- |
| 04:43:32 | start | Run begins at HEAD `e3473b9` | Final doc work is **`f395faa`**, not recorded in TSV. |
| 04:43:32 | frame | Done when claim-set matches 1.2.11 + tests pass | Matches playbook; falsifiable. |
| 04:43:32 | harness | Baseline 10 warns | Matches `.audit/doc-drift-baseline.json`. |
| 04:46:01 | explanation-slice | Applied VISION/ADR/AGENTS fixes | Evidence cites **`ee4fcd32`** — **not a git object** in this repo (see §1). Result still **`pending inventory recheck`** though later rows say verified. |
| 04:47:02 | explanation-slice | Inventory 10 → 7 | Plausible mid-run; no JSON snapshot archived for this step. |
| 04:49:34 | product-reference | Inventory 0 | Same timestamp as verify row; no separate commit SHAs logged. |
| 04:49:34 | verify | `mise run test` + inventory 0 | **Reconfirmed** by this review; no log artifact in trail. |
| 04:52:06 | pr | PR #20 opened | Result `open`; merge/CI not in trail. |

**Playbook unit 5** (“commit decision trail”) is partially met: TSV + audits ship in `f395faa`, but the TSV was not updated with the doc commit SHA or PR merge state.

---

## Playbook predicate matrix

| # | Predicate (playbook) | TSV / trail evidence | Independent check |
| --- | --- | --- | --- |
| 1 | Claim-set markdown matches 1.2.11 | Audits + edits | Spot-checks align with code; slice reports are detailed. |
| 2 | Inventory 0 (non-historical) | Row 7–8 `VERIFIED` | **Pass** (2026-10-14 review run). |
| 3 | `mise run test` | Row 8 `VERIFIED` | **Pass** (includes `documentation drift inventory reports no open issues`). |
| 4 | `git diff --check` clean on doc diff | **Not logged** | **Ambiguous fail:** `main...docs/1.2.11-claim-sync` reports **trailing whitespace** on `.audit/doc-drift-explanation.md` and `.audit/doc-drift-reference.md` only. Claim-set paths in `f395faa` pass `git diff --check` when scoped to edited guides + harness. |
| — | Arena / cross-model review | Playbook: **skipped** (“mechanical”) | This review supplies partial cross-check; original run had no second family on edits. |

---

## 1. Decisions logged with weak or absent evidence

### Invalid evidence token `ee4fcd32`

TSV row 5 lists `.audit/doc-drift-explanation.md ee4fcd32` as evidence for the explanation slice. `git cat-file -t ee4fcd32` fails — it is not a commit, blob, or tag in this repository. Treat as **corrupted or placeholder evidence**; the explanation markdown itself is the real record.

### HEAD / commit pinning

- Inventory JSON only emits `headHint: "run with git rev-parse HEAD alongside this script"` — **no `head` field** in baseline or current output. Reproducibility relies on external git state.
- Audits pin **`e3473b9`** (pre-doc commit). Correct for “code at audit time,” but the trail never logs **`f395faa`** as the commit that closed the predicate.
- Product slice notes **`git rev-parse was unavailable`** in the auditor environment; HEAD was inferred from `.audit/doc-drift-head.txt` and hint `e3473b9`. Weaker than explanation/reference slices.

### Mid-run inventory “10 → 7”

Row 6 claims inventory dropped to 7 after the explanation slice. **No checked-in JSON** captures that intermediate state (only baseline @ 10 and post-fix @ 0). The number is plausible but **not auditable post hoc**.

### Stale TSV row state

Row 5 `result` remains **`pending inventory recheck`** while rows 7–8 mark **`VERIFIED`**. Internal inconsistency — a casual reader may think the explanation slice was never rechecked.

### Harness change: `mobile/README.md` 1.2.10

Baseline flagged **`stale-version`** for `mobile/README.md` mentioning 1.2.10. The shipped harness limits **`enforceRelease`** to `README.md`, `TECHNICAL.md`, and `DEPLOYMENT.md` only. That **silently retires** the baseline warn without a TSV decision row explaining “intentional historical 1.2.10 device note.” Product audit argues correctly for keeping 1.2.10; the **policy change belongs in the trail**.

---

## 2. Verification skipped or claimed without proof

| Gap | Detail |
| --- | --- |
| **`git diff --check`** | Playbook predicate #4; never appended to TSV. Full-branch check fails on audit markdown trailing spaces; scoped claim-set diff is clean. |
| **Test output artifact** | `VERIFIED` cites commands, not exit codes, log paths, or CI run IDs. This review re-ran tests successfully; the original proof is **trust-on-write**. |
| **PR / CI** | PR #20 `open` only — no record of GitHub Actions, review, or merge. |
| **Arena skipped** | Playbook “medium-high” rigor but explicit skip of multi-model review on **applied** edits (audits only). |
| **Reference slice “PASS” on DEPLOYMENT/SECURITY/PRIVACY** | Based on spot-checks in the audit prose, not inventory probes (reasonable, but not re-encoded in harness). |

---

## 3. Risky choices in hindsight

### Calendar-coupled TECHNICAL date probe

`doc-drift-inventory.mjs` requires `as of October 14, 2026` in `TECHNICAL.md`. That matches today’s 1.2.11 landing but will **fail on the next release** unless someone bumps the date and probe together. TECHNICAL.md itself says the date is independent of `version:bump` — the probe ** contradicts** that policy and encodes a one-day snapshot.

### Regex doc probes vs. real contracts

- **`edition-header-freeze`** and **`opml-enabled`** use broad regexes. They catch the main 1.2.11 regressions but can be satisfied by thin wording without full behavioral contract (product audits asked for richer README/mobile copy).
- **`new-tab-links`** probe applies only to **`TECHNICAL.md`**, not README/mobile — README was updated per product audit, but **inventory would not warn** if README regressed.

### Code probes are shallow

`codeProbes` use substring checks (e.g. `enabled` in `lib/opml.ts`, `try again` in activity copy). They guard against gross revert, not semantic drift. Acceptable for a first lever; risky if mistaken for full behavioral parity.

### Inventory script always exits 0

Comment in script: “Exit 0 always.” CI enforcement depends entirely on **`tests/docs-claims.test.mts`** parsing stdout. Direct script invocation without the test could **miss** drift (operator footgun).

### Bundling audit artifacts in the PR

`.audit/doc-drift-*.md` files contain many trailing-space lines (markdown line-break style). They fail **`git diff --check`** on the full PR diff and may annoy hooks/editors. Low product risk, **process hygiene** risk.

---

## 4. Gaps a casual skim would miss

1. **Product audit format** — `doc-drift-product.md` is a compact ISSUES list without PASS sections for CONTRIBUTING/fonts/migration history; easy to assume “only README/mobile changed” and skip the “Not issues” block (which correctly preserves **1.2.10 iPhone** wording).

2. **Explanation audit info-severity items** — Issue 2 (VISION “refresh or closure” vs subscription-driven retrieval) was folded into fixes; info items are easy to ignore but affect agent-facing consistency.

3. **Reference audit info items** — Empty fallback row in TECHNICAL activity table and `window` vs `document` wording: **document fix landed** in TECHNICAL.md; fallback table split may still be incomplete vs product audit ask — inventory does not probe activity-table completeness.

4. **Default feeds vs `[]`** — Product audit documented subtle `getFeeds()` / MVP import behavior; worth reading even when inventory is 0 — **not all of that nuance is probe-gated**.

5. **Integration tests skipped** — `mise run test` skips 5 live-server API tests by default; trail “green” is **not** `mise run integration`.

6. **Baseline JSON schema drift** — Baseline uses `allowHistorical`; current script output uses `enforceRelease`. Comparing old baseline files to new output without reading the script invites false conclusions.

---

## Slice report quality (substance)

| Report | Strengths | Weaknesses |
| --- | --- | --- |
| **explanation** | Strong code citations; separates drift vs verified behavior; AGENTS path table | Trailing whitespace; long — easy to skim only “Issues” count |
| **product** | Correctly flags README/mobile gaps; explicit “do not rewrite 1.2.10 iPhone” | Thin structure; environment caveat on `git rev-parse`; no severity labels |
| **reference** | TECHNICAL/DEPLOYMENT depth; DEPLOYMENT/SECURITY/PRIVACY PASS with tables | Alpine digest “not re-resolved” noted once — honest limit |

Cross-slice consistency: all three align on **edition header freeze**, **OPML enabled**, and **Expo/Next split** — matches harness baseline IDs.

---

## Independent re-verification (this review)

Commands on `docs/1.2.11-claim-sync` @ workspace state during review:

- `node scripts/doc-drift-inventory.mjs` → `issueCount: 0`
- `mise run test` → 150 pass, 0 fail, 5 skipped (integration)
- `git diff --check` on claim-set files in `e3473b9..f395faa` → clean
- `git diff --check main...docs/1.2.11-claim-sync` → **fails** on `.audit/doc-drift-explanation.md` and `.audit/doc-drift-reference.md` (trailing whitespace)

---

## Recommendations

1. **Repair TSV:** Fix row 5 evidence (drop or replace `ee4fcd32`), set row 5 `result` to verified or superseded, add row for commit `f395faa` and optional CI run id.
2. **Log predicate #4 explicitly:** Either run `git diff --check` on claim-set paths only and record it, or extend playbook to exclude `.audit/` from whitespace gate.
3. **Trail harness policy:** Add a TSV row for `releaseMarkerFiles` narrowing (1.2.10 in mobile README) so baseline issue #1’s disappearance is intentional, not silent.
4. **Soften or generalize `technical-as-of-date` probe** before the next release (e.g. match release month/year from `package.json` or drop in favor of version marker tests).
5. **Extend `new-tab-links` doc probe** to README + mobile README if those files are part of the public contract.
6. **Optional:** Emit `git rev-parse HEAD` into inventory JSON on each run for reproducible artifacts.

---

## Conclusion

The doc sync run **achieved its stated goal**; audits were materially accurate and the automated gate now encodes much of the 1.2.11 claim set. The **audit trail overclaims verification completeness** in a few places (invalid hash, missing `git diff --check` log, stale row status, unlogged harness policy change), and the inventory script introduces **forward-looking maintenance traps** (October 14 date lock, narrow probes). None of these undermine the current branch’s correctness; they matter for **trust in the trail** and for **the next release cycle**.
