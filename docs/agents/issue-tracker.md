# Issue Tracker: DejaVu

Issues and PRDs for this repo live in DejaVu.

## Location

- Knowledge base: `markus-andrejs`
- Project root: `projects/thedailyfeed/`
- PRDs: `projects/thedailyfeed/prds/`
- Issues: `projects/thedailyfeed/issues/`

## Conventions

- One PRD per file under `projects/thedailyfeed/prds/<feature-slug>.md`.
- Implementation issues live under `projects/thedailyfeed/issues/<NN>-<slug>.md`, numbered from `01` when they come from the same PRD or plan.
- Triage state is recorded as a `Status:` line near the top of each issue file. Use the strings in `triage-labels.md`.
- Comments and conversation history append to the bottom of the issue file under a `## Comments` heading.
- Link related PRDs and issues using their DejaVu paths.

## When a skill says "publish to the issue tracker"

Create or update a DejaVu file in KB `markus-andrejs` under the paths above.

## When a skill says "fetch the relevant ticket"

Read the DejaVu file at the referenced path. If the user gives only an issue title or number, search KB `markus-andrejs` under `projects/thedailyfeed/issues/`.
