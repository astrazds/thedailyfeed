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
      fragmentedResponse(
        records.map((record) => JSON.stringify(record)).join("\n"),
        "application/x-ndjson",
      ),
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
    {
      ...meta,
      type: "done",
      totalFeeds,
      completedFeeds: totalFeeds,
      totalItemCount: totalFeeds,
    },
  ];
  const seen: FeedStreamChunk[] = [];
  await consumeFeedResponse(
    fragmentedResponse(
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      "application/x-ndjson",
    ),
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
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    },
    cancel() {
      cancelled = true;
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
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
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
  assert.equal(response.body?.locked, false);
  const controller = new AbortController();
  controller.abort();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    consumeFeedResponse(
      new Response(body),
      () => assert.fail(),
      controller.signal,
    ),
    /Aborted/,
  );
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
for (const contentType of ["application/x-ndjson", "application/json"]) {
  test(`Transport accepts exactly 32 MiB of ${contentType}`, async () => {
    const data =
      contentType === "application/x-ndjson"
        ? {
            ...meta,
            type: "done",
            totalItemCount: 0,
            completedFeeds: 2,
            requestId: "café",
          }
        : { items: [{ ...item, title: "café" }], cached: false };
    const suffix = new TextEncoder().encode(JSON.stringify(data));
    const block = new Uint8Array(1024 * 1024).fill(32);
    const last = block.slice();
    last.set(suffix, last.byteLength - suffix.byteLength);
    let blocks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        blocks += 1;
        controller.enqueue(blocks === 32 ? last : block);
        if (blocks === 32) controller.close();
      },
    });
    const seen: FeedStreamChunk[] = [];
    const result = await consumeFeedResponse(
      new Response(body, { headers: { "Content-Type": contentType } }),
      (chunk) => seen.push(chunk),
      new AbortController().signal,
    );
    if (contentType === "application/x-ndjson") {
      assert.equal(result, null);
      assert.deepEqual(seen, [data]);
    } else {
      assert.deepEqual(result, data);
      assert.deepEqual(seen, []);
    }
    assert.equal(body.locked, false);
  });
  test(`Transport cancels ${contentType} above its byte budget before parsing`, async () => {
    const block = new TextEncoder().encode("é".repeat(512 * 1024));
    let blocks = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        blocks += 1;
        controller.enqueue(blocks <= 32 ? block : Uint8Array.of(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      consumeFeedResponse(
        new Response(body, { headers: { "Content-Type": contentType } }),
        () => assert.fail("Oversized unfinished records must not publish"),
        new AbortController().signal,
      ),
      /Feed response is too large/,
    );
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
    assert.ok(blocks <= 34, "Reader must stop pulling after exceeding the budget");
  });
}
test("Transport rejects malformed records and releases the cancelled reader", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"type":"unknown"}\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    consumeFeedResponse(
      new Response(body, {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
      () => assert.fail(),
      new AbortController().signal,
    ),
    /Invalid feed stream chunk/,
  );
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
