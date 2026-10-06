import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFeedResponse } from "../src/transport";
import type { FeedStreamChunk } from "../../lib/types";
const item = {
  title: "Today",
  source: "Demo",
  link: "https://news.example/a",
  pubDate: "2026-10-06T08:00:00.000Z",
};
const meta = {
  type: "meta" as const,
  requestId: "synthetic-large-feed",
  cached: false,
  timeZone: "UTC",
  totalFeeds: 2,
  completedFeeds: 0,
};
function feedResult(index: number, contentHtml: string): FeedStreamChunk {
  return {
    ...meta,
    type: "feed_result",
    feedUrl: `https://feeds.example/${index}.xml`,
    completedFeeds: index + 1,
    status: "success",
    itemCount: 1,
    items: [{ ...item, link: `https://news.example/${index}`, contentHtml }],
  };
}
function fragmentedResponse(text: string, contentType: string): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 16_383, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    }),
    { headers: { "Content-Type": contentType } },
  );
}
test("Transport publishes a large valid feed record, later feeds, and completion", async () => {
  const records: FeedStreamChunk[] = [
    meta,
    feedResult(0, "<p>" + "éx".repeat(370_000) + "</p>"),
    feedResult(1, "<p>Later source</p>"),
    { ...meta, type: "done", completedFeeds: 2, totalItemCount: 2 },
  ];
  const seen: FeedStreamChunk[] = [];
  assert.equal(
    await consumeFeedResponse(
      fragmentedResponse(records.map((record) => JSON.stringify(record)).join("\n"), "application/x-ndjson"),
      (chunk) => seen.push(chunk),
      new AbortController().signal,
    ),
    null,
  );
  assert.deepEqual(seen, records);
});
test("Transport completes multiple valid records exceeding two megabytes together", async () => {
  const totalFeeds = 12;
  const records: FeedStreamChunk[] = [
    { ...meta, totalFeeds },
    ...Array.from({ length: totalFeeds }, (_, index) => ({
      ...feedResult(index, "x".repeat(180_000)),
      totalFeeds,
    })),
    { ...meta, type: "done", totalFeeds, completedFeeds: totalFeeds, totalItemCount: totalFeeds },
  ];
  const seen: FeedStreamChunk[] = [];
  await consumeFeedResponse(
    fragmentedResponse(records.map((record) => JSON.stringify(record)).join("\n") + "\n", "application/x-ndjson"),
    (chunk) => seen.push(chunk),
    new AbortController().signal,
  );
  assert.deepEqual(seen, records);
});
test("Transport JSON fallback accepts a valid response exceeding two megabytes", async () => {
  const data = {
    items: Array.from({ length: 12 }, (_, index) => ({
      ...item,
      link: `https://news.example/${index}`,
      contentHtml: "x".repeat(180_000),
    })),
    cached: false,
    timeZone: "UTC",
  };
  assert.deepEqual(
    await consumeFeedResponse(
      fragmentedResponse(JSON.stringify(data), "application/json"),
      () => assert.fail("JSON fallback must not publish stream records"),
      new AbortController().signal,
    ),
    data,
  );
});
test("Transport stops at done and decodes split UTF-8 lines", async () => {
  const meta = {
    type: "meta",
    requestId: "café",
    cached: false,
    timeZone: "UTC",
    totalFeeds: 2,
    completedFeeds: 0,
  };
  const done = { ...meta, type: "done", completedFeeds: 2, totalItemCount: 0 };
  const bytes = new TextEncoder().encode(
    JSON.stringify(meta) + "\n" + JSON.stringify(done) + "\nnot valid",
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const seen: string[] = [];
  const response = new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
  await consumeFeedResponse(
    response,
    (chunk) => {
      seen.push(chunk.requestId);
    },
    new AbortController().signal,
  );
  assert.deepEqual(seen, ["café", "café"]);
});
test("Transport JSON fallback and cancellation remain distinct", async () => {
  const response = new Response(
    JSON.stringify({ items: [item], cached: false }),
    { headers: { "Content-Type": "application/json" } },
  );
  assert.deepEqual(
    await consumeFeedResponse(
      response,
      () => assert.fail(),
      new AbortController().signal,
    ),
    { items: [item], cached: false },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    consumeFeedResponse(
      new Response("{}"),
      () => assert.fail(),
      controller.signal,
    ),
    /Aborted/,
  );
  await assert.rejects(
    consumeFeedResponse(
      new Response("x".repeat(256_001), {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
      () => assert.fail(),
      new AbortController().signal,
    ),
    /too large/,
  );
});
