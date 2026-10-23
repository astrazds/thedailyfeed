# Refresh feeds

Refresh checks the enabled sources again and starts a new edition header for that retrieval.

## Sub-features

- `refresh-start` starts a new check from the header control.
- `refresh-progress` shows loading progress while sources are still arriving.
- `refresh-stop` leaves the header date on that retrieval after the check ends.

## How to get to it (user POV)

- Choose **Refresh feeds** in the edition header.

## Driving it with verify-thedailyfeed

Preconditions:

- The reader is healthy at `http://127.0.0.1:3217/`.
- `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs doctor` reports `ok: true`.
- The heading `The Daily Feed` is already visible.

- **Refresh.** Choose **Refresh feeds**. There is no separate helper command yet. Use the same Playwright browser as the edition drive, click the button named `Refresh feeds`, and wait until `aria-busy` on `main` returns to `false` or the button is enabled again. The banner date stays the retrieval start for that check.
- **Proof.** Record the click and the banner text after the button is enabled. Do not treat a screenshot taken only before the click as proof.

## Gotchas

- The control is disabled while a check is already running and when no feed is enabled.
- Reduced motion keeps the icon still. The button name `Refresh feeds` is still the handle.
- A failed source can show **Try again** instead of new articles. That is a completed check, not a skipped one.
