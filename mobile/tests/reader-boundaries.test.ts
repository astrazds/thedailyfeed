import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFeedResponse } from "../src/transport";
const item = {
  title: "Today",
  source: "Demo",
  link: "https://news.example/a",
  pubDate: "2026-10-06T08:00:00.000Z",
};
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
