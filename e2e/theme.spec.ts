import { test, expect } from './fixtures';

const themes = [
  { scheme: 'light', background: 'rgb(250, 248, 245)', chrome: '#faf8f5' },
  { scheme: 'dark', background: 'rgb(26, 24, 22)', chrome: '#1a1816' },
] as const;

for (const { scheme, background } of themes) {
  test(`the ${scheme} document paints before the app script loads`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.route('**/*.js', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#root')).toBeEmpty();
    await expect(page.locator('html')).toHaveCSS('background-color', background);
    await expect(page.locator('body')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
  });
}

test('document and browser theme follow the reader through live preference changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  for (const { scheme, background, chrome } of [themes[0], themes[1], themes[0]]) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.getByRole('main').locator('..')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveCSS('background-color', background);
    await expect(page.locator('body')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
    expect(await page.locator('meta[name="theme-color"]').evaluateAll(elements => elements
      .filter(element => window.matchMedia(element.getAttribute('media') || 'all').matches)
      .map(element => element.getAttribute('content')))).toEqual([chrome]);
  }
});

test('the install theme fallback matches the default reader background', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main').locator('..')).toHaveCSS('background-color', 'rgb(250, 248, 245)');
  const manifestPath = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await page.request.get(manifestPath!);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ background_color: '#faf8f5', theme_color: '#faf8f5' });
});
