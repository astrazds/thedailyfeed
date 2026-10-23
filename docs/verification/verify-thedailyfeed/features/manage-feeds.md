# Manage feeds

Manage feeds opens the subscription list, where a reader can add, edit, enable, disable, or delete a source.

## Sub-features

- `manager-open` opens the subscription dialog from the reader.
- `manager-list` shows the saved sources inside that dialog.
- `manager-close` returns to the edition without discarding an unsent draft.

## How to get to it (user POV)

- Choose **Manage feeds**.

## Driving it with verify-thedailyfeed

Preconditions:

- The reader is healthy at `http://127.0.0.1:3217/`.
- `node docs/verification/verify-thedailyfeed/bin/verify-thedailyfeed.mjs doctor` reports `ok: true`.
- The heading `The Daily Feed` is already visible.

- **Open the manager.** Choose **Manage feeds**. There is no separate helper command yet. Click the button named `Manage feeds` and wait for the dialog. The dialog lists the current sources.
- **Proof.** Record the click and the dialog's accessible name after it opens. Closing the dialog is a separate step and is not proof that it opened.

## Gotchas

- More than one control can use the name **Manage feeds**. Choose the one that opens the dialog.
- A fresh profile may list the three default sources before they have been saved.
- Dismissing the dialog keeps an unsent draft. Do not treat a closed dialog as an empty inventory.
