import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFeedResponse } from "../src/transport";
import { encodeSnapshot, decodeSnapshot } from "../src/snapshot";
import { DEFAULT_CONFIG } from "../src/contracts";
const item = {
  title: "Today",
  source: "Demo",
  link: "https://news.example/a",
  pubDate: "2026-10-06T08:00:00.000Z",
};
const now = new Date("2026-10-06T09:00:00Z");
test("Snapshot binds day, timezone, feeds and API origin", () => {
  const snapshot = encodeSnapshot(DEFAULT_CONFIG, [item], now);
  assert.deepEqual(decodeSnapshot(snapshot, DEFAULT_CONFIG, now)?.items, [
    item,
  ]);
  assert.equal(
    decodeSnapshot(snapshot, DEFAULT_CONFIG, new Date("2026-10-07")),
    null,
  );
  assert.equal(
    decodeSnapshot(
      snapshot,
      { ...DEFAULT_CONFIG, apiOrigin: "https://different.example" },
      now,
    ),
    null,
  );
  assert.equal(
    decodeSnapshot(
      snapshot,
      { ...DEFAULT_CONFIG, timeZone: "Australia/Sydney" },
      now,
    ),
    null,
  );
  assert.equal(
    decodeSnapshot(snapshot, { ...DEFAULT_CONFIG, feeds: [] }, now),
    null,
  );
  assert.equal(
    encodeSnapshot(
      DEFAULT_CONFIG,
      [{ ...item, contentHtml: "x".repeat(256_000) }],
      now,
    ),
    null,
  );
  assert.equal(decodeSnapshot("{bad", DEFAULT_CONFIG, now), null);
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
