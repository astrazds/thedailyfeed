import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  applySubscription,
  readSubscriptions,
  subscribeToSubscriptions,
} from "../src/subscriptions.web";
import { loadSnapshot, saveSnapshot } from "../src/snapshots.web";
import { beginFeedSetLifecycle } from "../../lib/feed-set-lifecycle";
import { OFFLINE_FEED_SNAPSHOT_STORAGE_KEY } from "../../lib/offline-feed-cache";
import type { ReaderConfig } from "../src/contracts";

const canonicalKey = "rss-feeds";
const mvpKey = "daily-feed-expo.config.v1";
const feed = {
  id: "stable",
  name: "Saved name",
  url: "https://news.example/feed",
  enabled: false,
  addedAt: "2026-01-02T03:04:05.000Z",
};
const config: ReaderConfig = {
  feeds: [{ name: "News", url: feed.url }],
  configuredFeedCount: 1,
  timeZone: "UTC",
};
const originalFetch = globalThis.fetch;
let storage: Map<string, string>;
let failWrite: boolean;
let events: EventTarget;

beforeEach(() => {
  storage = new Map();
  failWrite = false;
  events = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: events,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrite)
          throw new DOMException("Storage full", "QuotaExceededError");
        storage.set(key, value);
      },
    },
  });
  globalThis.fetch = async () => new Response("{}", { status: 200 });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

function seedMvp() {
  storage.set(
    mvpKey,
    JSON.stringify({
      apiOrigin: "https://foreign.example",
      feeds: [{ name: "MVP", url: "https://mvp.example/feed" }],
      timeZone: "UTC",
    }),
  );
}

test("canonical records and intentional empty inventory win over MVP settings", () => {
  seedMvp();
  storage.set(canonicalKey, JSON.stringify([feed]));
  assert.deepEqual(readSubscriptions(), [
    { ...feed, addedAt: new Date(feed.addedAt) },
  ]);
  assert.equal(storage.get(canonicalKey), JSON.stringify([feed]));
  storage.set(canonicalKey, "[]");
  assert.deepEqual(readSubscriptions(), []);
  assert.equal(storage.get(canonicalKey), "[]");
});

test("MVP imports subscriptions once without promoting a foreign article snapshot", async () => {
  seedMvp();
  storage.set(
    "daily-feed-expo.snapshot.v1",
    JSON.stringify({ items: [{ title: "Foreign article" }] }),
  );
  const imported = readSubscriptions();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, "MVP");
  assert.equal(imported[0].enabled, true);
  assert.ok(imported[0].id);
  assert.ok(!Number.isNaN(imported[0].addedAt.getTime()));
  storage.set(mvpKey, JSON.stringify({ feeds: [] }));
  assert.deepEqual(readSubscriptions(), imported);
  assert.equal(await loadSnapshot(config), null);
});

test("corrupt canonical arrays preserve valid records without importing MVP", () => {
  seedMvp();
  storage.set(
    canonicalKey,
    JSON.stringify([feed, { ...feed, id: "duplicate" }, { url: "bad" }]),
  );
  assert.deepEqual(readSubscriptions(), [
    { ...feed, addedAt: new Date(feed.addedAt) },
  ]);
  assert.deepEqual(JSON.parse(storage.get(canonicalKey)!), [feed]);
});

test("an add rereads inventory after validation without discarding a concurrent edit", async () => {
  storage.set(canonicalKey, JSON.stringify([feed]));
  let resolveValidation!: (response: Response) => void;
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, "/api/feeds/validate");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(init?.body as string), {
      url: "https://new.example/rss",
    });
    return new Promise<Response>((resolve) => {
      resolveValidation = resolve;
    });
  }) as typeof fetch;
  const pending = applySubscription({
    type: "add",
    name: "New",
    url: "https://new.example/rss",
  });
  await applySubscription({ type: "toggle", id: feed.id });
  resolveValidation(new Response("{}"));
  const result = await pending;
  assert.deepEqual(
    result.feeds.map(({ name, enabled }) => ({ name, enabled })),
    [
      { name: "Saved name", enabled: true },
      { name: "New", enabled: true },
    ],
  );
  assert.deepEqual(readSubscriptions(), result.feeds);
});

test("failed writes and rejected validation leave durable subscriptions unchanged", async () => {
  storage.set(canonicalKey, JSON.stringify([feed]));
  failWrite = true;
  await assert.rejects(
    applySubscription({ type: "toggle", id: feed.id }),
    /Unable to save feeds/,
  );
  assert.deepEqual(readSubscriptions(), [
    { ...feed, addedAt: new Date(feed.addedAt) },
  ]);
  failWrite = false;
  globalThis.fetch = async () => new Response("{}", { status: 400 });
  await assert.rejects(
    applySubscription({
      type: "add",
      name: "New",
      url: "https://new.example/rss",
    }),
    /validation failed/,
  );
  assert.deepEqual(JSON.parse(storage.get(canonicalKey)!), [feed]);
});

test("cross-tab listeners ignore snapshot and install writes and detach on cleanup", () => {
  let calls = 0;
  const stop = subscribeToSubscriptions(() => {
    calls += 1;
  });
  const emit = (key: string | null) => {
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: key });
    events.dispatchEvent(event);
  };
  emit(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY);
  emit("pwa-install-dismissed");
  assert.equal(calls, 0);
  emit(canonicalKey);
  emit(null);
  events.dispatchEvent(new Event("feedsUpdated"));
  assert.equal(calls, 3);
  stop();
  emit(canonicalKey);
  events.dispatchEvent(new Event("feedsUpdated"));
  assert.equal(calls, 3);
});

test("canonical snapshots preserve multiple feed sets and enforce same-day timezone fallback", async () => {
  const item = {
    title: "Today",
    source: "News",
    link: "https://news.example/story",
    pubDate: new Date().toISOString(),
  };
  assert.equal(await saveSnapshot(config, [item]), true);
  const other = {
    ...config,
    feeds: [{ name: "Other", url: "https://other.example/feed" }],
  };
  assert.equal(await saveSnapshot(other, []), true);
  const snapshot = await loadSnapshot(config);
  assert.deepEqual(snapshot?.items, [item]);
  assert.deepEqual((await loadSnapshot(other))?.items, []);
  assert.equal(
    await loadSnapshot({ ...config, timeZone: "Pacific/Auckland" }),
    null,
  );
  assert.equal(
    beginFeedSetLifecycle({
      ...config,
      snapshot,
      now: new Date(Date.now() + 86_400_000),
    }).readModel.items.length,
    0,
  );
  assert.equal(
    JSON.parse(storage.get(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY)!).length,
    2,
  );
  failWrite = true;
  assert.equal(await saveSnapshot(config, [item]), false);
  assert.deepEqual((await loadSnapshot(config))?.items, [item]);
});

test("snapshot byte limits trim articles while retaining usable saved reading", async () => {
  const item = {
    title: "Today",
    source: "News",
    link: "https://news.example/story",
    pubDate: new Date().toISOString(),
    contentHtml: "x".repeat(130_000),
  };
  assert.equal(
    await saveSnapshot(config, [
      item,
      { ...item, link: "https://news.example/second" },
    ]),
    true,
  );
  assert.deepEqual((await loadSnapshot(config))?.items, [item]);
});
