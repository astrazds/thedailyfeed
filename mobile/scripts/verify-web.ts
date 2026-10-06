import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";

const appUrl = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8787";
const snapshotKey = "rss-offline-feed-snapshots-v1";
const feeds = [
  { id: "slow-journal", name: "The Slow Journal", url: "https://slow-journal.example/rss" },
  { id: "field-notes", name: "Field Notes", url: "https://field-notes.example/rss" },
].map(feed => ({ ...feed, enabled: true, addedAt: "2026-09-08T00:00:00.000Z" }));
const checks: string[] = [];
const first = "A quieter way to read the world";
const second = "Notes from the edges of the city";
let fixture: ReturnType<typeof spawn> | undefined;

async function healthy() {
  try { return (await fetch(`${appUrl}/health`)).ok; } catch { return false; }
}
async function startFixture() {
  if (await healthy()) return;
  fixture = spawn("npm", ["run", "fixture"], {
    cwd: process.cwd(), stdio: "inherit", detached: true,
    env: { ...process.env, FIXTURE_PORT: new URL(appUrl).port || "8787" },
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await healthy()) return;
    if (fixture.exitCode !== null) throw new Error(`Fixture exited with ${fixture.exitCode}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Fixture unavailable at ${appUrl}`);
}
async function selectScenario(page: Page, name: string) {
  const result = await page.request.post(`${appUrl}/__fixture/scenario`, {
    data: { name, articleDate: "2026-09-08T03:34:00.000Z" },
  });
  assert.equal(result.status(), 200);
}
async function scenario(page: Page, name: string, clear = true) {
  await selectScenario(page, name);
  await page.evaluate(({ feeds, snapshotKey, clear }) => {
    localStorage.setItem("rss-feeds", JSON.stringify(feeds));
    if (clear) localStorage.removeItem(snapshotKey);
  }, { feeds, snapshotKey, clear });
  await page.reload();
}
async function snapshots(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]") as { items: unknown[] }[], snapshotKey);
}
async function waitSnapshot(page: Page, count = 2) {
  await expect.poll(async () => (await snapshots(page))[0]?.items.length).toBe(count);
}

async function main() {
  await startFixture();
  await mkdir("artifacts", { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Australia/Sydney", locale: "en-US", serviceWorkers: "block" });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-09-08T12:00:00Z"));
    const pageErrors: string[] = [];
    const privateRequests: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("request", request => {
      if (request.url().includes(":9/private.png") || request.url() === "https://example.com/") privateRequests.push(request.url());
    });
    await page.route("https://images.example.com/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#dce3cf"/></svg>' }));
    await page.goto(appUrl);
    await scenario(page, "normal");
    await expect(page.getByRole("heading", { name: first, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: second, exact: true })).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
    checks.push("First article rendered over real HTTP while the delayed second source was still loading.");
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    await waitSnapshot(page);
    await expect(page.getByText(/café opens its doors/)).toBeVisible();
    checks.push("Split NDJSON and split UTF-8 bytes decoded without losing café.");
    await page.getByRole("button", { name: /^Continue reading / }).first().click();
    await expect(page.getByText(/the quiet page at the end/)).toBeVisible();
    assert.equal(await page.evaluate(() => "__feedInjected" in window), false);
    assert.deepEqual(privateRequests, []);
    await expect(page.locator('a[href^="javascript:"], iframe, img[src*="127.0.0.1:9"]')).toHaveCount(0);
    checks.push("Expansion retained rich text and rejected executable markup and the private image.");
    await page.getByRole("button", { name: /^Show less / }).first().click();
    await page.screenshot({ path: "artifacts/reader-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "artifacts/reader-desktop.png", fullPage: true });
    await expect(page.getByTestId("article-card").first()).toContainText("The Slow Journal · 1:34 PM");
    checks.push("Article time used the browser's Australia/Sydney timezone.");
    for (const name of ["interrupted", "terminal"]) {
      await scenario(page, name);
      await expect(page.getByRole("heading", { name: first, exact: true })).toBeVisible();
      await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
      await expect(page.getByRole("status", { name: "Feed activity", exact: true })).toContainText(/interrupt|incomplete|error|failed|unable/i);
      assert.deepEqual(await snapshots(page), []);
      checks.push(`${name === "interrupted" ? "Interrupted EOF" : "Terminal stream error"} retained progressive content without persisting an incomplete result.`);
    }
    await scenario(page, "json");
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    await waitSnapshot(page);
    checks.push("JSON fallback rendered and persisted the complete response.");
    await scenario(page, "offline", false);
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Unable to refresh. Showing saved items from today.");
    checks.push("Reload during network failure restored the matching legacy-format completed snapshot.");
    await page.evaluate(key => {
      const records = JSON.parse(localStorage.getItem(key)!);
      records[0].dayKey = "2000-01-01";
      localStorage.setItem(key, JSON.stringify(records));
    }, snapshotKey);
    await page.reload();
    await expect(page.getByRole("main")).toContainText(/failed|unable/i);
    await expect(page.getByRole("heading", { name: first, exact: true })).toHaveCount(0);
    checks.push("A stale-day snapshot was rejected during network failure.");
    await scenario(page, "partial");
    await expect(page.getByRole("heading", { name: first, exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Feed activity", exact: true })).toContainText(/could not|unavailable|failed/i);
    await waitSnapshot(page, 1);
    checks.push("Done after a failed source persisted the successful article.");
    const slowRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/feeds");
    await scenario(page, "slow");
    await slowRequest;
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
    const cancelled: string[] = [];
    page.on("requestfailed", request => { if (new URL(request.url()).pathname === "/api/feeds") cancelled.push(request.url()); });
    await selectScenario(page, "normal");
    await page.evaluate(feeds => {
      localStorage.setItem("rss-feeds", JSON.stringify(feeds.map((feed, index) => index === 0 ? { ...feed, url: "https://replacement.example/rss" } : feed)));
      window.dispatchEvent(new Event("feedsUpdated"));
    }, feeds);
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    await waitSnapshot(page);
    assert.ok(cancelled.length >= 1, "A changed feed set cancels its in-flight request.");
    await expect(page.getByRole("heading", { name: first, exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: second, exact: true })).toHaveCount(1);
    checks.push("A subscription change cancelled the prior real HTTP request and produced one copy of each article.");
    await page.getByRole("button", { name: "Manage feeds", exact: true }).last().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Feeds (2)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close feed manager" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("rss-feeds")!)[0].url), "https://replacement.example/rss");
    checks.push("The full manager used canonical subscriptions, and the changed feed set survived reload.");
    await scenario(page, "done-open");
    await waitSnapshot(page);
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
    checks.push("A done record completed the request without waiting for the HTTP connection to close.");
    await page.addInitScript(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) throw new DOMException("Fixture quota failure", "QuotaExceededError");
        original.call(this, name, value);
      };
    }, snapshotKey);
    await scenario(page, "normal");
    await expect(page.getByRole("heading", { name: second, exact: true })).toBeVisible();
    await expect(page.getByText("Reading is available. Saving for offline use is unavailable.", { exact: true })).toBeVisible();
    checks.push("Snapshot storage failure left reading available and displayed its persistence warning.");
    assert.deepEqual(pageErrors, [], "No uncaught browser errors.");
    await writeFile("artifacts/web-verification.json", JSON.stringify({ checks, pageErrors, privateRequests, screenshots: ["reader-mobile.png", "reader-desktop.png"] }, null, 2));
    console.log(checks.join("\n"));
    await context.close();
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (fixture?.pid) { try { process.kill(-fixture.pid, "SIGTERM"); } catch {} }
});
