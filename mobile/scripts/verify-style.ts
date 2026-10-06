import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import type { Browser } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { cases, fixedTime, responseBody, subscriptions } from "./style-fixture";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselineDir = resolve(process.env.STYLE_BASELINE_DIR ?? `${mobileRoot}/tests/style-baseline`);
const artifactDir = resolve(process.env.STYLE_ARTIFACT_DIR ?? `${mobileRoot}/artifacts/style`);
const sourceUrl = process.env.STYLE_SOURCE_URL ?? "http://127.0.0.1:3110";
const targetUrl = process.env.STYLE_TARGET_URL ?? "http://localhost:8083";
const mode = process.argv[2];
assert.ok(mode === "baseline" || mode === "compare", "Usage: tsx scripts/verify-style.ts baseline|compare");
const files = ["scripts/verify-style.ts", "scripts/style-fixture.ts"];
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
type Manifest = { sourceCommit: string; chromiumVersion: string; fixedTime: string; files: Record<string, string>; screenshots: Record<string, string> };

async function capture(browser: Browser, app: "source" | "target", entry: typeof cases[number], destination: string) {
  const url = app === "source" ? sourceUrl : targetUrl;
  const context = await browser.newContext({ viewport: entry.viewport, colorScheme: entry.theme, deviceScaleFactor: 1, timezoneId: "UTC", locale: "en-US", reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors: string[] = [];
  const blocked: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(fixedTime));
  await context.addInitScript(({ app, feeds, origin }) => {
    localStorage.clear();
    if (app === "source") localStorage.setItem("rss-feeds", JSON.stringify(feeds));
    else localStorage.setItem("daily-feed-expo.config.v1", JSON.stringify({ apiOrigin: origin, feeds: feeds.map(({ name, url }) => ({ name, url })), timeZone: "UTC" }));
  }, { app, feeds: subscriptions, origin: new URL(url).origin });
  let requested!: () => void;
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  let release!: () => void;
  const heldResponse = new Promise<void>(resolve => { release = resolve; });
  await context.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(url).origin) {
      blocked.push(requestUrl.href);
      return route.abort();
    }
    if (requestUrl.pathname === "/api/feeds" && route.request().method() === "POST") {
      requested();
      if (entry.state === "initial-loading") await heldResponse;
      return route.fulfill({ contentType: "application/x-ndjson", headers: { "Cache-Control": "no-store" }, body: responseBody(entry.state) });
    }
    if (requestUrl.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await Promise.race([requestStarted, new Promise((_, reject) => setTimeout(() => reject(new Error(`No fixture request for ${entry.id} ${app}`)), 20000))]);
    if (entry.state === "initial-loading") {
      await expect(page.getByText("Loading feeds", { exact: true })).toBeVisible();
    } else if (entry.state === "empty-today") {
      await expect(page.getByText(/No new items today|A quiet day so far\./, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("A quieter corner of the web", { exact: true }).first()).toBeVisible();
      if (entry.state === "expanded-rich") {
        await page.getByRole("button", { name: /Continue reading/ }).first().click();
        await expect(page.getByText("The quiet page at the end leaves room for tomorrow.", { exact: true })).toBeVisible();
      } else await expect(page.getByText("Making things that last", { exact: true }).first()).toBeVisible();
    }
    if (app === "source") await expect(page.locator(".feed-header-date")).toContainText("Tuesday, September 8, 2026");
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const element of document.querySelectorAll("*")) element.scrollTop = 0;
      window.scrollTo(0, 0);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    await page.mouse.move(entry.viewport.width - 1, entry.viewport.height - 1);
    await page.screenshot({ path: destination, fullPage: false });
    const metrics = await page.evaluate(() => Array.from(document.querySelectorAll("h1,h2,h3,p,article,header,button,[data-testid],blockquote,ul,li,a")).map(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, id: element.getAttribute("data-testid"), text: element.textContent?.slice(0, 120), x: rect.x, y: rect.y, width: rect.width, height: rect.height, color: style.color, background: style.backgroundColor, font: style.font, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, margin: style.margin, padding: style.padding, border: style.border, display: style.display };
    }));
    await writeFile(destination.replace(/\.png$/, ".json"), JSON.stringify({ app, case: entry, errors, blocked, metrics }, null, 2));
    if (app === "target") assert.deepEqual(errors, [], `${entry.id} has no uncaught browser errors`);
    assert.deepEqual(blocked, [], `${entry.id} only requests local assets and synthetic APIs`);
  } finally {
    release();
    await context.close();
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    let manifest: Manifest;
    if (mode === "baseline") {
      const exists = await access(`${baselineDir}/manifest.json`).then(() => true, () => false);
      assert.equal(exists, false, "Baseline is sealed. Use compare without recapturing or changing it.");
      await mkdir(baselineDir, { recursive: true });
      manifest = { sourceCommit: "4933b580c3d2d9c589826f9061d251efd74627a2", chromiumVersion: browser.version(), fixedTime, files: {}, screenshots: {} };
      for (const file of files) manifest.files[file] = hash(await readFile(resolve(mobileRoot, file)));
      for (const entry of cases) {
        const path = `${baselineDir}/${entry.id}.png`;
        await capture(browser, "source", entry, path);
        manifest.screenshots[entry.id] = hash(await readFile(path));
      }
      await writeFile(`${baselineDir}/manifest.json`, JSON.stringify(manifest, null, 2));
    } else {
      manifest = JSON.parse(await readFile(`${baselineDir}/manifest.json`, "utf8"));
      assert.equal(manifest.chromiumVersion, browser.version(), "Use the baseline Chromium version");
      for (const file of files) assert.equal(hash(await readFile(resolve(mobileRoot, file))), manifest.files[file], `Sealed harness file ${file} is unchanged`);
    }
    const results = [];
    for (const entry of cases) {
      const originalBuffer = await readFile(`${baselineDir}/${entry.id}.png`);
      assert.equal(hash(originalBuffer), manifest.screenshots[entry.id], `Baseline ${entry.id} is unchanged`);
      const targetPath = `${artifactDir}/${entry.id}.png`;
      await capture(browser, "target", entry, targetPath);
      const original = PNG.sync.read(originalBuffer);
      const target = PNG.sync.read(await readFile(targetPath));
      assert.equal(target.width, original.width);
      assert.equal(target.height, original.height);
      const diff = new PNG({ width: target.width, height: target.height });
      const changedPixels = pixelmatch(original.data, target.data, diff.data, target.width, target.height, { threshold: 0, includeAA: true });
      await writeFile(`${artifactDir}/${entry.id}-diff.png`, PNG.sync.write(diff));
      results.push({ id: entry.id, changedPixels, totalPixels: target.width * target.height, changedPercent: 100 * changedPixels / (target.width * target.height), pass: changedPixels === 0 });
      console.log(`${entry.id}: ${changedPixels} different pixels`);
    }
    await writeFile(`${artifactDir}/comparison.json`, JSON.stringify({ baseline: baselineDir, chromiumVersion: browser.version(), threshold: 0, includeAA: true, pass: results.every(result => result.pass), results }, null, 2));
    process.exitCode = results.every(result => result.pass) ? 0 : 1;
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
