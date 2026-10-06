import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type {
  FeedApiResponse,
  FeedStreamChunk,
  SerializedFeedItem,
} from "../../lib/types";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const staticRoot = resolve(process.env.FIXTURE_STATIC_DIR ?? "dist");
const feedUrls = ["https://slow-journal.example/rss", "https://field-notes.example/rss"];
let activeScenario = "normal";
let articleDate: string | undefined;

const scenarios = new Set<string>([
  "normal",
  "interrupted",
  "terminal",
  "json",
  "offline",
  "slow",
  "partial",
  "done-open",
]);
const articles: SerializedFeedItem[] = [
  {
    title: "A quieter way to read the world",
    link: "https://slow-journal.example/a-quieter-way",
    pubDate: new Date().toISOString(),
    source: "The Slow Journal",
    description: "A little space for the stories that matter.",
    contentHtml: `<p>The morning arrives gently. A café opens its doors, a bicycle passes the window, and somewhere a newspaper lands on a doorstep.</p><p>There is a different way to follow the world. We can leave room for curiosity, for the small details, and for a story to finish before another begins.</p><h2>Make room for a slower morning</h2><p>A good reading habit starts with choosing what deserves your attention. A few trusted voices can be enough.</p><ul><li>Read something that surprises you.</li><li>Save a little time for a longer story.</li><li>Let an interesting question stay with you.</li></ul><blockquote>Attention is a form of care. Spend it where it makes a difference.</blockquote><p>This reader keeps the texture of the original article, including <strong>emphasis</strong>, <em>italics</em>, and <a href="https://example.com/reading">useful links</a>.</p><h3>A small experiment</h3><pre><code>const morning = ['coffee', 'one good story'];\nread(morning);</code></pre><p>Expansion reveals this closing paragraph and its distinctive phrase, <strong>the quiet page at the end</strong>. Nothing needs to compete with the words.</p><script>window.__feedInjected = true</script><iframe src="https://example.com"></iframe><p><a href="javascript:window.__feedInjected=true">A note worth keeping</a></p><img src="http://127.0.0.1:9/private.png" onerror="window.__feedInjected=true" /><img src="https://images.example.com/reading.png" alt="A reading room" />`,
  },
  {
    title: "Notes from the edges of the city",
    link: "https://field-notes.example/city-edges",
    pubDate: new Date(Date.now() - 60_000).toISOString(),
    source: "Field Notes",
    description: "An afternoon walk, and the details we usually miss.",
    contentHtml:
      "<p>At the edge of the city, the streets give way to gardens. Someone has planted rosemary beside a bus stop. Someone else has painted a bench the colour of the sea.</p><p>These small acts tell a story about a place and the people who care for it.</p><h2>Three things to notice</h2><ol><li>The names on old shopfronts.</li><li>The trees that shade the pavement.</li><li>The routes people choose when they have time.</li></ol><blockquote>A city is also a collection of invitations to pause.</blockquote><p>Walk a different route home. You might find something worth keeping.</p>",
  },
];
let sequence = 0;
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function writeSplit(
  response: ServerResponse,
  event: FeedStreamChunk,
  unicode = false,
) {
  const bytes = Buffer.from(`${JSON.stringify(event)}\n`);
  const unicodeOffset = bytes.indexOf(Buffer.from("é"));
  const offset =
    unicode && unicodeOffset >= 0
      ? unicodeOffset + 1
      : Math.floor(bytes.length / 2);
  response.write(bytes.subarray(0, offset));
  await delay(25);
  if (!response.destroyed) response.write(bytes.subarray(offset));
}

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/health") {
    response.end("ok");
    return;
  }
  if (pathname === "/__fixture/scenario" && request.method === "POST") {
    let input = "";
    for await (const chunk of request) input += chunk;
    const parsed = JSON.parse(input) as { name: string; articleDate?: string };
    if (!scenarios.has(parsed.name)) return void response.writeHead(400).end("Unknown scenario");
    activeScenario = parsed.name;
    articleDate = parsed.articleDate;
    response.end("ok");
    return;
  }
  if (pathname === "/api/feeds/validate") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ valid: true }));
    return;
  }
  const prefix = pathname.split("/").filter(Boolean)[0];
  const scenario = scenarios.has(prefix) ? prefix : activeScenario;
  if (!pathname.endsWith("/api/feeds")) {
    const file = resolve(staticRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(staticRoot + sep)) return void response.writeHead(403).end();
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
    try {
      response.setHeader("Content-Type", mime[extname(file)] ?? "application/octet-stream");
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end("Not found");
    }
    return;
  }
  const body: Buffer[] = [];
  let bodyBytes = 0;
  for await (const chunk of request) {
    bodyBytes += chunk.length;
    if (bodyBytes > 1_048_576) {
      response.writeHead(413).end("Request too large");
      return;
    }
    body.push(Buffer.from(chunk));
  }
  let timeZone = "UTC";
  let requestedUrls = feedUrls;
  const currentArticles = articles.map((article, index) => ({ ...article, pubDate: articleDate ?? new Date(Date.now() - index * 60000).toISOString() }));
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(body).toString());
    if (typeof parsed === "object" && parsed !== null && "feedUrls" in parsed && Array.isArray(parsed.feedUrls)) requestedUrls = parsed.feedUrls;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "timeZone" in parsed &&
      typeof parsed.timeZone === "string"
    ) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: parsed.timeZone });
        timeZone = parsed.timeZone;
      } catch {}
    }
  } catch {}
  if (scenario === "offline") {
    response
      .writeHead(503, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: "Fixture is offline" }));
    return;
  }
  if (scenario === "json") {
    const payload: FeedApiResponse = {
      cached: false,
      timeZone,
      items: currentArticles,
    };
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(payload));
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  const requestId = `fixture-${++sequence}`;
  const base = { requestId, cached: false, timeZone, totalFeeds: 2 };
  await writeSplit(response, { ...base, type: "meta", completedFeeds: 0 });
  await delay(scenario === "slow" ? 3000 : 100);
  if (response.destroyed) return;
  await writeSplit(
    response,
    {
      ...base,
      type: "feed_result",
      completedFeeds: 1,
      feedUrl: requestedUrls[0],
      status: "success",
      itemCount: 1,
      items: [currentArticles[0]],
    },
    true,
  );
  await delay(scenario === "slow" ? 3000 : 1200);
  if (response.destroyed) return;
  if (scenario === "interrupted") {
    response.end();
    return;
  }
  if (scenario === "terminal") {
    await writeSplit(response, {
      type: "error",
      requestId,
      error: "Fixture terminal error",
    });
    response.end();
    return;
  }
  await writeSplit(response, {
    ...base,
    type: "feed_result",
    completedFeeds: 2,
    feedUrl: requestedUrls[1],
    status: scenario === "partial" ? "error" : "success",
    itemCount: scenario === "partial" ? 0 : 1,
    items: scenario === "partial" ? [] : [currentArticles[1]],
  });
  await writeSplit(response, {
    ...base,
    type: "done",
    completedFeeds: 2,
    totalItemCount: scenario === "partial" ? 1 : 2,
  });
  if (scenario === "done-open") await delay(15000);
  response.end();
});
server.listen(Number(process.env.FIXTURE_PORT ?? 8787), "0.0.0.0", () =>
  console.log(`Feed fixture listening on http://localhost:${process.env.FIXTURE_PORT ?? 8787}`),
);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
