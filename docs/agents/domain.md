# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

Use DejaVu KB `markus-andrejs` as the source of truth for domain docs:

- `projects/thedailyfeed/CONTEXT.md`
- Relevant ADRs under `projects/thedailyfeed/docs/adr/`

This is a single-context repo: one project context plus one ADR directory.

If a domain doc is missing, proceed silently. Do not suggest creating it upfront. Producer skills such as `grill-with-docs` create or update these docs when terms or decisions are resolved.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `projects/thedailyfeed/CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary yet, either reconsider whether the project really uses that language or note the gap for `grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
