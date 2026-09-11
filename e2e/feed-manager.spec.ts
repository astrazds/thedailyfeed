import { test, expect } from './fixtures';

test('manager preserves drafts across close and returns focus after editing', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const capture = async (name: string) => {
    if (process.env.FEED_UI_CAPTURE_DIR) {
      await page.screenshot({ path: `${process.env.FEED_UI_CAPTURE_DIR}/${info.project.name}-${name}.png`, animations: 'disabled', fullPage: true });
    }
  };
  await capture('reader');
  const open = page.getByRole('button', { name: 'Manage feeds', exact: true }).last();
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await capture('manager');
  await dialog.getByText('Add feed', { exact: true }).first().click();
  await dialog.getByLabel('Feed name', { exact: true }).fill('Draft source');
  await dialog.getByLabel('Feed URL', { exact: true }).fill('https://draft.example/rss');
  await capture('add');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  await open.click();
  await expect(dialog.getByLabel('Feed name', { exact: true })).toHaveValue('Draft source');
  await dialog.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const edit = dialog.getByRole('form', { name: 'Edit Field Notes' });
  await expect(edit.getByLabel('Feed name', { exact: true })).toBeFocused();
  await edit.getByLabel('Feed name', { exact: true }).fill('Edited source');
  await expect(dialog.getByRole('button', { name: 'Add feed', exact: true })).toHaveClass(/neutral-action/);
  await expect(edit.getByRole('button', { name: 'Save changes', exact: true })).toHaveClass(/primary-action/);
  await capture('edit');
  await page.keyboard.press('Escape');
  await open.click();
  await expect(edit.getByLabel('Feed name', { exact: true })).toHaveValue('Edited source');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Feeds (3)', exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Feed name', { exact: true })).toHaveValue('Draft source');
  await expect(dialog.getByRole('button', { name: 'Add feed', exact: true })).toHaveClass(/primary-action/);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const confirmation = dialog.getByRole('group', { name: 'Confirm deletion of Field Notes' });
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await capture('delete');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true }).first()).toBeFocused();
});

test('manager validates fields and retains a pending form until validation finishes', async ({ page }) => {
  let releaseValidation: (() => void) | undefined;
  await page.route('**/api/feeds/validate', async route => {
    await new Promise<void>(resolve => { releaseValidation = resolve; });
    await route.fulfill({ json: { valid: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Add feed', { exact: true }).first().click();
  const add = dialog.locator('details').first();
  const name = add.getByLabel('Feed name', { exact: true });
  const url = add.getByLabel('Feed URL', { exact: true });
  await dialog.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.fill('Pending source');
  await url.fill('file:///private');
  await dialog.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect(url).toBeFocused();
  await expect(dialog.getByText('Enter an HTTP or HTTPS feed URL.')).toBeVisible();
  await url.fill('https://pending.example/rss');
  await expect(url).toHaveAttribute('aria-invalid', 'false');
  await dialog.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect(name).toHaveAttribute('readonly', '');
  await expect(url).toHaveValue('https://pending.example/rss');
  await expect(dialog.getByRole('button', { name: 'Add feed…', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const edit = dialog.getByRole('form', { name: 'Edit Field Notes' });
  await expect(edit.getByLabel('Feed name', { exact: true })).toBeEditable();
  await edit.getByLabel('Feed name', { exact: true }).fill('Concurrent draft');
  await expect(edit.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect.poll(() => releaseValidation !== undefined).toBe(true);
  releaseValidation?.();
  await expect(dialog.getByRole('status')).toHaveText('Feed added.');
  await expect(name).toHaveValue('');
  await expect(url).toHaveValue('');
  await expect(edit.getByLabel('Feed name', { exact: true })).toHaveValue('Concurrent draft');
  await expect(edit.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('heading', { name: 'Feeds (4)', exact: true })).toBeAttached();
});
