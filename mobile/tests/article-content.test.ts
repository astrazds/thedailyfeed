import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { prepareArticle } from "../src/article-content";
import { beginFeedSetLifecycle } from "../../lib/feed-set-lifecycle";
import { editionInstant, readerFrame } from "../src/reader-frame";

const base = "https://journal.example/stories/today";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  DocumentFragment: dom.window.DocumentFragment,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
});

describe("article preparation", { concurrency: 1 }, () => {
test("loading frame carries the three placeholder slots", () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: "https://example.com/feed.xml", name: "Example" }],
    timeZone: "UTC",
    snapshot: {
      timeZone: "UTC",
      dayKey: "2026-06-02",
      items: [],
    },
    now: new Date("2026-06-02T12:00:00.000Z"),
  });
  const frame = readerFrame({
    phase: started.phase,
    editionStartedAt: editionInstant(new Date("2026-06-02T12:00:00.000Z")),
    configuredFeedCount: 1,
    timeZone: "UTC",
  });
  assert.equal(frame.kind, "loading");
  if (frame.kind !== "loading") return;
  assert.deepEqual(
    frame.placeholders.map((placeholder) => placeholder.slot),
    [0, 1, 2],
  );
  assert.equal(started.phase.kind, "loading");
  if (started.phase.kind === "loading") assert.equal(started.phase.preview, "snapshot");
});

test("retains safe native markup and normalizes headings, URLs and languages", () => {
  const result = prepareArticle(
    '<section><h1 style="color:red">A &amp; B</h1><h4>Details</h4><p lang="en-us" dir="RTL" onclick="bad()">A <strong>good</strong> day <a href="../about" target="_blank">About</a></p><img src="/photo.png" alt="a &quot;view&quot;" width="999"></section>',
    base,
  );
  assert.deepEqual(result, {
    full: '<h3>A &amp; B</h3><h4>Details</h4><p lang="en-US" dir="rtl">A <strong>good</strong> day <a rel="nofollow" href="https://journal.example/about">About</a></p><img alt="a &quot;view&quot;" src="https://journal.example/photo.png">',
    preview:
      '<h3>A &amp; B</h3><h4>Details</h4><p lang="en-US" dir="rtl">A <strong>good</strong> day <a rel="nofollow" href="https://journal.example/about">About</a></p><img alt="a &quot;view&quot;" src="https://journal.example/photo.png">',
    truncated: false,
  });
});

test("drops active subtrees and publisher attributes while escaping decoded text", () => {
  const result = prepareArticle(
    '<script>alert(1)</script><style>body{}</style><svg><text>hidden</text></svg><iframe>hidden</iframe><table><tr><td>hidden</td></tr></table><p class="story" data-secret="yes" style="color:red" lang="!" dir="sideways">&lt;script&gt; &amp; safe</p>',
    base,
  );
  assert.equal(result.full, 'hidden<p class="story">&lt;script&gt; &amp; safe</p>');
});

test("removes unsafe images and neutralizes unsafe links", () => {
  const result = prepareArticle(
    '<img src="data:image/png,abc"><img src="http://127.0.0.1/x"><img src="http://192.168.0.1/x"><img src="https://localhost/x"><a href="javascript:alert(1)" rel="opener">unsafe</a><a href="http://10.0.0.1/x">private</a><a href="mailto:editor@example.com">mail</a><img src="https://public.example/photo">',
    base,
  );
  assert.equal(
    result.full,
    '<a>unsafe</a><a>private</a><a rel="nofollow" href="mailto:editor@example.com">mail</a><img alt="" src="https://public.example/photo">',
  );
});

test("truncates decoded Unicode text while preserving element boundaries", () => {
  const result = prepareArticle(
    `<p><strong>${"🌿".repeat(599)}&amp;</strong><em>tail</em></p>`,
    base,
  );
  assert.equal(
    result.full,
    `<p><strong>${"🌿".repeat(599)}&amp;</strong><em>tail</em></p>`,
  );
  assert.equal(
    result.preview,
    `<p><strong>${"🌿".repeat(599)}&amp;…</strong></p>`,
  );
  assert.equal(result.truncated, true);
  assert.equal(result.preview.includes("\uFFFD"), false);
});

test("exactly 600 decoded characters stays untruncated", () => {
  const result = prepareArticle(`<p>${"x".repeat(600)}</p>`, base);
  assert.equal(result.preview, result.full);
  assert.equal(result.truncated, false);
});

test("fails closed for byte, node and depth limits", () => {
  const empty = { full: "", preview: "", truncated: false };
  assert.deepEqual(prepareArticle("x".repeat(128 * 1024 + 1), base), empty);
  assert.deepEqual(prepareArticle("🌿".repeat(33 * 1024), base), empty);
  assert.deepEqual(prepareArticle("<span></span>".repeat(4001), base), empty);
  assert.deepEqual(
    prepareArticle("<div>".repeat(41) + "deep" + "</div>".repeat(41), base),
    empty,
  );
});

test("malformed input remains balanced and cannot introduce attributes or active HTML", () => {
  const result = prepareArticle(
    "<p><strong>One &lt;img src=x onerror=alert(1)&gt;<p>Two",
    base,
  );
  assert.equal(
    result.full,
    "<p><strong>One &lt;img src=x onerror=alert(1)&gt;</strong></p><p><strong>Two</strong></p>",
  );
});

test("clips a prose preview at a word boundary without cutting inline markup", () => {
  const prose = "Readable words ".repeat(50);
  const result = prepareArticle(
    `<p><em>${prose}</em><strong>tail</strong></p>`,
    base,
  );
  assert.equal(
    result.preview,
    `<p><em>${prose.slice(0, 599).trimEnd()}…</em></p>`,
  );
  assert.equal(result.truncated, true);
});

test("retains nested lists, quote paragraphs, code whitespace and image-only articles", () => {
  const rich =
    "<ol><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol><blockquote><p>One</p><p>Two</p></blockquote><pre><code>  first\n    second &lt;third&gt;</code></pre>";
  assert.deepEqual(prepareArticle(rich, base), {
    full: rich,
    preview: rich,
    truncated: false,
  });
  const image = '<img src="https://journal.example/photo.png" alt="A garden">';
  assert.deepEqual(prepareArticle(image, base), {
    full: '<img alt="A garden" src="https://journal.example/photo.png">',
    preview: '<img alt="A garden" src="https://journal.example/photo.png">',
    truncated: false,
  });
});

test("web article preparation fails closed when the browser DOM is absent", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "window");
  try {
    assert.deepEqual(prepareArticle("<p>Untrusted</p>", base), {
      full: "",
      preview: "",
      truncated: false,
    });
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
});
