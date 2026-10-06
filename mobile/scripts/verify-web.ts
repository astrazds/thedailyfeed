import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { CONFIG_KEY, SNAPSHOT_KEY } from "../src/snapshot";
import { DEFAULT_CONFIG } from "../src/contracts";

const appUrl = process.env.EXPO_WEB_URL ?? "http://localhost:8081";
const fixtureOrigin = process.env.FIXTURE_ORIGIN ?? "http://localhost:8787";
const processes: ReturnType<typeof spawn>[] = [];
const checks: string[] = [];
const first = "A quieter way to read the world";
const second = "Notes from the edges of the city";
async function healthy(url: string) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
async function ensureServer(url: string, command: string[]) {
  if (await healthy(url)) return;
  const child = spawn("npm", command, {
    cwd: process.cwd(),
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
    detached: true,
  });
  processes.push(child);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await healthy(url)) return;
    if (child.exitCode !== null)
      throw new Error(`Server exited with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server unavailable at ${url}`);
}
async function scenario(page: Page, name: string, clearSnapshot = true) {
  await page.evaluate(
    ({ key, snapshotKey, config, clear }) => {
      localStorage.setItem(key, JSON.stringify(config));
      if (clear) localStorage.removeItem(snapshotKey);
    },
    {
      key: CONFIG_KEY,
      snapshotKey: SNAPSHOT_KEY,
      config: { ...DEFAULT_CONFIG, apiOrigin: `${fixtureOrigin}/${name}` },
      clear: clearSnapshot,
    },
  );
  await page.reload();
}
async function waitSnapshot(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY))
    .not.toBeNull();
}
async function main() {
  try {
    await ensureServer(`${fixtureOrigin}/health`, ["run", "fixture"]);
    await ensureServer(appUrl, ["run", "web"]);
    await mkdir("artifacts", { recursive: true });
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        timezoneId: "Australia/Sydney",
        locale: "en-US",
      });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const privateRequests: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        if (
          request.url().includes(":9/private.png") ||
          request.url() === "https://example.com/"
        )
          privateRequests.push(request.url());
      });
      await page.route("https://images.example.com/**", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#dce3cf"/><circle cx="320" cy="150" r="65" fill="#8ca17a"/></svg>',
        }),
      );
      await page.goto(appUrl);
      await scenario(page, "normal");
      await expect(page.getByText(first, { exact: true })).toBeVisible();
      await expect(page.getByText(second, { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("status")).toContainText(
        /loading|refreshing/i,
      );
      checks.push(
        "First article rendered while the delayed second source was still loading.",
      );
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      await waitSnapshot(page);
      const completedSnapshot = await page.evaluate(
        (key) => localStorage.getItem(key),
        SNAPSHOT_KEY,
      );
      assert.equal(JSON.parse(completedSnapshot!).items.length, 2);
      await expect(page.getByText(/café opens its doors/)).toBeVisible();
      checks.push(
        "Split NDJSON and split UTF-8 bytes decoded without losing café.",
      );
      const expand = page
        .getByRole("button", { name: /continue reading|read more/i })
        .first();
      await expand.click();
      await expect(page.getByText(/the quiet page at the end/)).toBeVisible();
      assert.equal(
        await page.evaluate(() =>
          "__feedInjected" in window ? window.__feedInjected : undefined,
        ),
        undefined,
      );
      assert.deepEqual(privateRequests, []);
      assert.equal(
        await page
          .locator('a[href^="javascript:"], iframe, img[src*="127.0.0.1:9"]')
          .count(),
        0,
      );
      checks.push(
        "Article expansion retained rich text and rejected executable markup and the private image.",
      );
      await page.getByTestId("article-toggle").first().click();
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("*"))
          element.scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: "artifacts/reader-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({
        path: "artifacts/reader-desktop.png",
        fullPage: true,
      });
      const timezoneArticleDate = new Date();
      timezoneArticleDate.setUTCHours(23, 30, 0, 0);
      await page.route("**/json/api/feeds?stream=1", async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        payload.items[0].pubDate = timezoneArticleDate.toISOString();
        await route.fulfill({ response, json: payload });
      });
      await scenario(page, "json");
      await expect(page.getByTestId("article-card").first()).toContainText(
        "The Slow Journal · 11:30 PM",
      );
      await page.unroute("**/json/api/feeds?stream=1");
      checks.push(
        "Article time used configured UTC instead of the device's Australia/Sydney timezone.",
      );
      await scenario(page, "interrupted");
      await expect(page.getByText(first, { exact: true })).toBeVisible();
      await expect(page.getByTestId("status")).toContainText(
        /interrupt|incomplete/i,
      );
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY),
        null,
      );
      checks.push(
        "Interrupted EOF retained the first article without persisting an incomplete result.",
      );
      await scenario(page, "terminal");
      await expect(page.getByText(first, { exact: true })).toBeVisible();
      await expect(page.getByTestId("status")).toContainText(
        /interrupt|error|failed|unable|terminal/i,
      );
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY),
        null,
      );
      checks.push(
        "Terminal stream error retained progressive content without marking it complete.",
      );
      await scenario(page, "json");
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      await waitSnapshot(page);
      checks.push(
        "JSON fallback rendered and persisted the complete response.",
      );
      await page.route("**/api/feeds?stream=1", (route) =>
        route.abort("failed"),
      );
      await page.reload();
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      await expect(
        page
          .getByText("Unable to refresh. Showing saved items from today.", {
            exact: true,
          })
          .and(page.locator(':not([role="status"])')),
      ).toBeVisible();
      checks.push(
        "Reload during network failure restored the matching completed snapshot.",
      );
      await page.evaluate((key) => {
        const snapshot = JSON.parse(localStorage.getItem(key)!);
        snapshot.dayKey = "2000-01-01";
        localStorage.setItem(key, JSON.stringify(snapshot));
      }, SNAPSHOT_KEY);
      await page.reload();
      await expect(page.getByTestId("status")).toContainText(
        /error|failed|unable/i,
      );
      await expect(page.getByText(first, { exact: true })).toHaveCount(0);
      checks.push("A stale-day snapshot was rejected during network failure.");
      await page.unroute("**/api/feeds?stream=1");
      await scenario(page, "partial");
      await expect(page.getByText(first, { exact: true })).toBeVisible();
      await expect(page.getByTestId("status")).toContainText(
        "Some feeds could not load",
      );
      await waitSnapshot(page);
      assert.equal(
        JSON.parse(
          (await page.evaluate(
            (key) => localStorage.getItem(key),
            SNAPSHOT_KEY,
          ))!,
        ).items.length,
        1,
      );
      checks.push(
        "Done after a failed source persisted the successful article under existing lifecycle semantics.",
      );
      await scenario(page, "slow");
      await expect(page.getByTestId("status")).toContainText(
        /loading|refreshing/i,
      );
      const cancelled: string[] = [];
      page.on("requestfailed", (request) => {
        if (request.url().includes("/slow/api/feeds"))
          cancelled.push(request.url());
      });
      await page.getByTestId("refresh").click();
      await page.getByTestId("refresh").click();
      await expect(page.getByText(second, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await waitSnapshot(page);
      assert.ok(cancelled.length >= 1, "Refresh cancels an in-flight request.");
      assert.equal(await page.getByText(first, { exact: true }).count(), 1);
      assert.equal(await page.getByText(second, { exact: true }).count(), 1);
      checks.push(
        "Repeated refresh cancelled prior requests and produced one copy of each article.",
      );
      await page.getByTestId("connection-settings").click();
      await page.getByTestId("api-origin").fill(`${fixtureOrigin}/json`);
      await page
        .getByTestId("feed-urls")
        .fill(DEFAULT_CONFIG.feeds.map((feed) => feed.url).join("\n"));
      await page.getByTestId("save-settings").click();
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      assert.equal(
        JSON.parse(
          (await page.evaluate(
            (key) => localStorage.getItem(key),
            CONFIG_KEY,
          ))!,
        ).apiOrigin,
        `${fixtureOrigin}/json`,
      );
      await page.reload();
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      checks.push(
        "Source settings accepted a server path and survived reload.",
      );
      await page.addInitScript(
        ({ key }) => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name: string, value: string) {
            if (name === key)
              throw new DOMException(
                "Fixture quota failure",
                "QuotaExceededError",
              );
            original.call(this, name, value);
          };
        },
        { key: SNAPSHOT_KEY },
      );
      await scenario(page, "normal");
      await expect(page.getByText(second, { exact: true })).toBeVisible();
      await expect(
        page.getByText(
          "Reading is available. Saving for offline use is unavailable.",
          { exact: true },
        ),
      ).toBeVisible();
      checks.push(
        "Snapshot storage failure left reading available and displayed its persistence warning.",
      );
      assert.deepEqual(pageErrors, [], "No uncaught browser errors.");
      await writeFile(
        "artifacts/web-verification.json",
        JSON.stringify(
          {
            checks,
            pageErrors,
            privateRequests,
            screenshots: ["reader-mobile.png", "reader-desktop.png"],
          },
          null,
          2,
        ),
      );
      console.log(checks.join("\n"));
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    for (const child of processes) {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
