import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

async function main() {
  const origin = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:3100";
  const artifacts = process.env.ARTICLE_ARTIFACTS ?? "artifacts/articles";
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const checks: string[] = [];
  const errors: string[] = [];
  const forbiddenRequests: string[] = [];
  const source = {
    id: "article-fixtures",
    name: "Article fixtures",
    url: "https://feeds.example/rss",
    enabled: true,
    addedAt: "2026-09-08T00:00:00.000Z",
  };
  const article = (
    title: string,
    contentHtml?: string,
    description?: string,
  ) => ({
    title,
    contentHtml,
    description,
    source: source.name,
    link: "https://articles.example/stories/today",
    pubDate: "2026-09-08T11:00:00.000Z",
  });
  const longDescription = "A description stays complete. ".repeat(35);
  const longToken = "longword".repeat(60);
  const items = [
    article(
      "Semantic article",
      '<h1>First heading</h1><h6>Nested heading</h6><h1>Another heading</h1><p lang="ar" dir="rtl">مرحبا بالعالم</p><p>A <strong>bold <a href="../library">nested library</a></strong> &amp; a <a href="mailto:editor@example.com">letter</a>.</p><ol><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol><blockquote><p>Quote one</p><p>Quote two</p></blockquote><pre><code>  first\n    second &lt;third&gt;</code></pre>',
    ),
    article(
      "Line breaks",
      "<p>one<br>two<br>three<br>four</p><p>before<br>&nbsp;<br>after</p><p>Spacer start" +
        "<br> \n\t".repeat(40) +
        "Spacer end</p>",
    ),
    article("Long description", undefined, longDescription),
    article("Long token", `<p>${longToken}</p>`),
    article(
      "Expandable article",
      `<p><strong>${"A quiet garden holds a new story. ".repeat(30)}</strong></p><p>Last publisher paragraph.</p>`,
    ),
    article(
      "Untrusted article",
      '<p>Safe text</p><table><tr><td>Retained table text</td></tr></table><script>window.articlePwned=true</script><svg onload="window.articlePwned=true"><text>bad svg</text></svg><a href="javascript:alert(1)">unsafe protocol</a><a href="http://127.0.0.1/x">private link</a><img src="http://10.0.0.1/pixel" onerror="window.articlePwned=true"><iframe src="https://evil.example"></iframe><p><b>Malformed <i>nest</p>tail',
    ),
    article(
      "Image article",
      '<img src="https://images.example/large.png" alt="A synthetic garden">',
    ),
    article("Bounded article", `<p>${"x".repeat(128 * 1024)}</p>`),
    {
      ...article(
        "Private title",
        "<p>Readable text without a private destination.</p>",
      ),
      link: "http://192.168.1.2/story",
    },
  ];
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        serviceWorkers: "block",
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-09-08T12:00:00.000Z"));
      await context.addInitScript(
        (feed) => localStorage.setItem("rss-feeds", JSON.stringify([feed])),
        source,
      );
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.href === "https://images.example/large.png") {
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="#8a9b80"/></svg>',
          });
        }
        if (
          route.request().isNavigationRequest() &&
          url.href === "https://articles.example/library"
        ) {
          return route.fulfill({
            contentType: "text/html",
            body: "<title>Synthetic destination</title>Opened library",
          });
        }
        if (url.origin !== new URL(origin).origin) {
          forbiddenRequests.push(url.href);
          return route.abort();
        }
        if (url.pathname === "/api/feeds")
          return route.fulfill({ json: { cached: false, items } });
        return route.continue();
      });
      await page.goto(origin);
      const semantic = page
        .getByRole("article")
        .filter({ hasText: "Semantic article" });
      await expect(
        semantic.getByRole("heading", {
          level: 2,
          name: "Semantic article",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        semantic.getByRole("heading", {
          level: 3,
          name: "First heading",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        semantic.getByRole("heading", {
          level: 4,
          name: "Nested heading",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        semantic.getByRole("heading", {
          level: 3,
          name: "Another heading",
          exact: true,
        }),
      ).toBeVisible();
      await expect(semantic.locator('[lang="ar"][dir="rtl"]')).toContainText(
        "مرحبا بالعالم",
      );
      const title = semantic.getByRole("link", {
        name: "Semantic article",
        exact: true,
      });
      const bodyLink = semantic.getByRole("link", {
        name: "nested library",
        exact: true,
      });
      await expect(title).toHaveAttribute(
        "href",
        "https://articles.example/stories/today",
      );
      await expect(bodyLink).toHaveAttribute(
        "href",
        "https://articles.example/library",
      );
      for (const link of [title, bodyLink]) {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
        await link.focus();
        await expect(link).toBeFocused();
      }
      const popupPromise = page.waitForEvent("popup");
      await bodyLink.press("Enter");
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      assert.equal(popup.url(), "https://articles.example/library");
      assert.equal(await popup.evaluate(() => window.opener), null);
      await popup.close();
      await expect(semantic.getByRole("list")).toHaveCount(2);
      await expect(semantic.getByRole("listitem")).toHaveCount(3);
      const outerList = semantic.getByRole("list").first();
      await expect(outerList.getByRole("listitem").first()).toContainText(
        "First",
      );
      await expect(
        outerList.getByRole("list").getByRole("listitem"),
      ).toHaveText("Nested");
      await expect(outerList.getByRole("listitem").last()).toHaveText("Second");
      await expect(
        semantic.getByRole("link", { name: "letter", exact: true }),
      ).toHaveAttribute("href", "mailto:editor@example.com");
      await expect(
        semantic.getByText("  first\n    second <third>", { exact: true }),
      ).toBeVisible();
      checks.push(
        `${width}: headings, language, direction, native anchors, nested formatting and preformatted text`,
      );

      const breaks = page
        .getByRole("article")
        .filter({ hasText: "Line breaks" });
      const firstParagraph = breaks.getByTestId("p").nth(0);
      const nbspParagraph = breaks.getByTestId("p").nth(1);
      assert.equal(await firstParagraph.innerText(), "one\ntwo\nthree\nfour");
      assert.equal(await nbspParagraph.innerText(), "before\n\u00a0\nafter");
      assert.equal(await breaks.getByTestId("br").count(), 7);
      assert.ok((await breaks.boundingBox())!.height < 800);
      const description = page
        .getByRole("article")
        .filter({ hasText: "Long description" });
      await expect(description).toContainText(longDescription.trim());
      await expect(description.getByTestId("article-toggle")).toHaveCount(0);
      checks.push(
        `${width}: line breaks, bounded spacing and full plain descriptions`,
      );

      const expanded = page
        .getByRole("article")
        .filter({ hasText: "Expandable article" });
      const toggle = expanded.getByTestId("article-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const controlledId = await toggle.getAttribute("aria-controls");
      assert.ok(controlledId);
      assert.ok(
        await page.evaluate(
          (id) => document.getElementById(id) !== null,
          controlledId,
        ),
      );
      const collapsed = await expanded.innerText();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(expanded).toContainText("Last publisher paragraph.");
      await toggle.click();
      assert.equal(await expanded.innerText(), collapsed);
      checks.push(`${width}: disclosure relationships and content restoration`);

      const untrusted = page
        .getByRole("article")
        .filter({ hasText: "Untrusted article" });
      await expect(untrusted).toContainText("Retained table text");
      await expect(untrusted).toContainText("Safe text");
      await expect(
        untrusted.locator(
          "script,iframe,svg,[onerror],a[href^='javascript:'],a[href*='127.0.0.1']",
        ),
      ).toHaveCount(0);
      await expect(untrusted.getByRole("link")).toHaveCount(1);
      assert.equal(await page.evaluate(() => "articlePwned" in window), false);
      const bounded = page
        .getByRole("article")
        .filter({ hasText: "Bounded article" });
      await expect(
        bounded.getByRole("link", { name: "Bounded article", exact: true }),
      ).toBeVisible();
      await expect(bounded.getByTestId("p")).toHaveCount(0);
      await expect(
        page
          .getByRole("article")
          .filter({ hasText: "Private title" })
          .getByRole("link"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("img", { name: "A synthetic garden", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const token = page.getByRole("article").filter({ hasText: "Long token" });
      assert.ok(
        await token.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      );
      checks.push(
        `${width}: hostile HTML, malformed markup, size limits, large images and long-token layout`,
      );
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({
        path: `${artifacts}/articles-${width}.png`,
        fullPage: true,
      });
      await context.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(forbiddenRequests, []);
    await writeFile(
      `${artifacts}/verification.json`,
      JSON.stringify({ checks, errors, forbiddenRequests }, null, 2),
    );
    console.log(`${checks.length} article browser checks passed`);
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
