import test from "node:test";
import assert from "node:assert/strict";
import { prepareArticle } from "../src/article-content";
const base = "https://journal.example/stories/today";

test("retains safe native markup and normalizes headings, URLs and languages", () => {
  const result = prepareArticle(
    '<section><h1 style="color:red">A &amp; B</h1><h4>Details</h4><p lang="en-us" dir="RTL" onclick="bad()">A <strong>good</strong> day <a href="../about" target="_blank">About</a></p><img src="/photo.png" alt="a &quot;view&quot;" width="999"></section>',
    base,
  );
  assert.deepEqual(result, {
    full: '<h3>A &amp; B</h3><h4>Details</h4><p lang="en-US" dir="rtl">A <strong>good</strong> day <a href="https://journal.example/about" rel="nofollow">About</a></p><img alt="a &quot;view&quot;" src="https://journal.example/photo.png">',
    preview:
      '<h3>A &amp; B</h3><h4>Details</h4><p lang="en-US" dir="rtl">A <strong>good</strong> day <a href="https://journal.example/about" rel="nofollow">About</a></p><img alt="a &quot;view&quot;" src="https://journal.example/photo.png">',
    truncated: false,
  });
});

test("drops active subtrees and publisher attributes while escaping decoded text", () => {
  const result = prepareArticle(
    '<script>alert(1)</script><style>body{}</style><svg><text>hidden</text></svg><iframe>hidden</iframe><table><tr><td>hidden</td></tr></table><p class="story" data-secret="yes" style="color:red" lang="!" dir="sideways">&lt;script&gt; &amp; safe</p>',
    base,
  );
  assert.equal(result.full, '<p class="story">&lt;script&gt; &amp; safe</p>');
});

test("removes unsafe images and neutralizes unsafe links", () => {
  const result = prepareArticle(
    '<img src="data:image/png,abc"><img src="http://127.0.0.1/x"><img src="http://192.168.0.1/x"><img src="https://localhost/x"><a href="javascript:alert(1)" rel="opener">unsafe</a><a href="http://10.0.0.1/x">private</a><a href="mailto:editor@example.com">mail</a><img src="https://public.example/photo">',
    base,
  );
  assert.equal(
    result.full,
    '<a>unsafe</a><a>private</a><a href="mailto:editor@example.com" rel="nofollow">mail</a><img src="https://public.example/photo" alt="">',
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
  assert.deepEqual(prepareArticle("<br>".repeat(4001), base), empty);
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
    "<p><strong>One &lt;img src=x onerror=alert(1)&gt;<p>Two</p></strong></p>",
  );
});
