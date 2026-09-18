#!/usr/bin/env tsx
process.env.LOG_LEVEL ??= 'error';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

const TODAY_REFERENCE = new Date('2026-09-18T12:00:00.000Z');
const TIME_ZONE = 'UTC';
const DEFAULT_SAMPLES = 7;

interface WorkloadSpec {
  name: 'tiny' | 'target' | 'fat' | 'hit';
  feedCount: number;
  itemsPerFeed: number;
  todayItemsPerFeed: number;
  htmlBytes: number;
  delayMs: number;
  cache: 'miss' | 'hit';
}

const WORKLOADS: Record<WorkloadSpec['name'], WorkloadSpec> = {
  tiny: {
    name: 'tiny',
    feedCount: 1,
    itemsPerFeed: 2,
    todayItemsPerFeed: 2,
    htmlBytes: 80,
    delayMs: 0,
    cache: 'miss',
  },
  target: {
    name: 'target',
    feedCount: 12,
    itemsPerFeed: 80,
    todayItemsPerFeed: 16,
    htmlBytes: 4500,
    delayMs: 0,
    cache: 'miss',
  },
  fat: {
    name: 'fat',
    feedCount: 4,
    itemsPerFeed: 200,
    todayItemsPerFeed: 10,
    htmlBytes: 4000,
    delayMs: 0,
    cache: 'miss',
  },
  hit: {
    name: 'hit',
    feedCount: 12,
    itemsPerFeed: 80,
    todayItemsPerFeed: 16,
    htmlBytes: 4500,
    delayMs: 0,
    cache: 'hit',
  },
};

interface Sample {
  firstFeedResultMs: number | null;
  doneMs: number;
  itemCount: number;
  cached: boolean;
  timedOutFeedCount: number;
  failedFeedCount: number;
  bytesSerialized: number;
}

interface WorkloadReport {
  name: WorkloadSpec['name'];
  samples: number;
  xmlBytesPerFeed: number;
  medianFirstFeedResultMs: number | null;
  medianDoneMs: number;
  p90DoneMs: number;
  medianBytesSerialized: number;
  medianItemCount: number;
  cached: boolean;
  runs: Sample[];
}

function parseArgs(argv: string[]): {
  samples: number;
  workloads: WorkloadSpec['name'][];
  checkSensitivity: boolean;
} {
  let samples = DEFAULT_SAMPLES;
  let checkSensitivity = false;
  const requested: WorkloadSpec['name'][] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--samples') {
      samples = Number.parseInt(argv[i + 1] ?? '', 10);
      i += 1;
      continue;
    }
    if (arg === '--workload') {
      const name = argv[i + 1];
      if (name !== 'tiny' && name !== 'target' && name !== 'fat' && name !== 'hit') {
        throw new Error(`Unknown workload: ${name}`);
      }
      requested.push(name);
      i += 1;
      continue;
    }
    if (arg === '--check-sensitivity') {
      checkSensitivity = true;
    }
  }

  if (!Number.isFinite(samples) || samples < 1) {
    throw new Error('--samples must be a positive integer');
  }

  return {
    samples,
    workloads: requested.length > 0 ? requested : ['tiny', 'target', 'fat', 'hit'],
    checkSensitivity,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildItemHtml(htmlBytes: number, itemIndex: number): string {
  const prefix = `<p>Synthetic article ${itemIndex}.</p><p>`;
  const suffix = '</p>';
  const pad = Math.max(0, htmlBytes - prefix.length - suffix.length);
  return `${prefix}${'x'.repeat(pad)}${suffix}`;
}

function buildRss(spec: WorkloadSpec, feedIndex: number): Buffer {
  const items: string[] = [];
  for (let itemIndex = 0; itemIndex < spec.itemsPerFeed; itemIndex += 1) {
    const isToday = itemIndex < spec.todayItemsPerFeed;
    const published = new Date(TODAY_REFERENCE);
    if (isToday) {
      published.setUTCHours(8, itemIndex % 60, 0, 0);
    } else {
      published.setUTCDate(published.getUTCDate() - 2);
      published.setUTCHours(10, itemIndex % 60, 0, 0);
    }
    items.push(
      [
        '<item>',
        `<title>${escapeXml(`Feed ${feedIndex} item ${itemIndex}`)}</title>`,
        `<link>https://example.test/feed-${feedIndex}/item-${itemIndex}</link>`,
        `<guid>https://example.test/feed-${feedIndex}/item-${itemIndex}</guid>`,
        `<pubDate>${published.toUTCString()}</pubDate>`,
        `<description><![CDATA[${buildItemHtml(spec.htmlBytes, itemIndex)}]]></description>`,
        '</item>',
      ].join('')
    );
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>Synthetic Feed ${feedIndex}</title>`,
    `<link>https://example.test/feed-${feedIndex}</link>`,
    '<description>Synthetic latency fixture</description>',
    ...items,
    '</channel></rss>',
  ].join('');

  return Buffer.from(xml);
}

async function listen(bodies: Map<string, Buffer>, delayMs: number): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const body = request.url ? bodies.get(request.url) : undefined;
    const send = () => {
      if (!body) {
        response.writeHead(404);
        response.end('missing fixture');
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Content-Length': body.byteLength,
      });
      response.end(body);
    };

    if (delayMs > 0) {
      setTimeout(send, delayMs);
      return;
    }
    send();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function measureSample(
  feedUrls: string[],
  executeFeedRequestProgressively: typeof import('../lib/feed-request').executeFeedRequestProgressively,
  serializeFeedItems: typeof import('../lib/feed-stream-parser').serializeFeedItems
): Promise<Sample> {
  const started = performance.now();
  let firstFeedResultMs: number | null = null;
  let bytesSerialized = 0;
  let itemCount = 0;
  let cached = false;
  let timedOutFeedCount = 0;
  let failedFeedCount = 0;

  for await (const event of executeFeedRequestProgressively({
    requestId: 'bench-feed-latency',
    startedAt: Date.now(),
    todayReferenceDate: TODAY_REFERENCE,
    feedSet: {
      feedUrls,
      timeZone: TIME_ZONE,
      originalFeedCount: feedUrls.length,
      uniqueFeedCount: feedUrls.length,
      duplicateFeedCount: 0,
    },
  })) {
    if (event.type === 'feed_result') {
      const chunk = {
        type: event.type,
        requestId: event.requestId,
        cached: event.cached,
        timeZone: event.timeZone,
        totalFeeds: event.totalFeeds,
        completedFeeds: event.completedFeeds,
        feedUrl: event.feedUrl,
        status: event.status,
        itemCount: event.itemCount,
        items: serializeFeedItems(event.items),
      };
      bytesSerialized += Buffer.byteLength(JSON.stringify(chunk));
      if (firstFeedResultMs === null && event.items.length > 0) {
        firstFeedResultMs = performance.now() - started;
      }
      continue;
    }

    if (event.type === 'done') {
      const chunk = {
        type: event.type,
        requestId: event.requestId,
        cached: event.cached,
        timeZone: event.timeZone,
        totalFeeds: event.totalFeeds,
        completedFeeds: event.completedFeeds,
        totalItemCount: event.totalItemCount,
      };
      bytesSerialized += Buffer.byteLength(JSON.stringify(chunk));
      itemCount = event.totalItemCount;
      cached = event.cached;
      timedOutFeedCount = event.outcome.timedOutFeedCount;
      failedFeedCount = event.outcome.failedFeedCount;
    }
  }

  return {
    firstFeedResultMs,
    doneMs: performance.now() - started,
    itemCount,
    cached,
    timedOutFeedCount,
    failedFeedCount,
    bytesSerialized,
  };
}

function assertHealthy(sample: Sample, spec: WorkloadSpec): void {
  if (sample.failedFeedCount !== 0 || sample.timedOutFeedCount !== 0) {
    throw new Error(
      `${spec.name} had ${sample.failedFeedCount} failed and ${sample.timedOutFeedCount} timed-out feeds`
    );
  }
  const expectedItems = spec.feedCount * spec.todayItemsPerFeed;
  if (sample.itemCount !== expectedItems) {
    throw new Error(`${spec.name} returned ${sample.itemCount} items, expected ${expectedItems}`);
  }
  if (spec.cache === 'hit' && !sample.cached) {
    throw new Error('hit workload was not fully cached');
  }
  if (spec.cache === 'miss' && sample.cached) {
    throw new Error(`${spec.name} reported a full cache hit on a miss run`);
  }
}

async function runWorkload(
  spec: WorkloadSpec,
  samples: number,
  executeFeedRequestProgressively: typeof import('../lib/feed-request').executeFeedRequestProgressively,
  serializeFeedItems: typeof import('../lib/feed-stream-parser').serializeFeedItems,
  clearFeedCache: typeof import('../lib/feed-cache').clearFeedCache
): Promise<WorkloadReport> {
  const bodies = new Map<string, Buffer>();
  for (let feedIndex = 0; feedIndex < spec.feedCount; feedIndex += 1) {
    bodies.set(`/feed/${feedIndex}.xml`, buildRss(spec, feedIndex));
  }
  const xmlBytesPerFeed = bodies.get('/feed/0.xml')?.byteLength ?? 0;
  const server = await listen(bodies, spec.delayMs);
  const feedUrls = Array.from({ length: spec.feedCount }, (_, feedIndex) => `${server.url}/feed/${feedIndex}.xml`);

  try {
    if (spec.cache === 'hit') {
      clearFeedCache();
      const warmup = await measureSample(feedUrls, executeFeedRequestProgressively, serializeFeedItems);
      assertHealthy(warmup, { ...spec, cache: 'miss' });
    }

    const runs: Sample[] = [];
    for (let i = 0; i < samples; i += 1) {
      if (spec.cache === 'miss') {
        clearFeedCache();
      }
      const sample = await measureSample(feedUrls, executeFeedRequestProgressively, serializeFeedItems);
      assertHealthy(sample, spec);
      runs.push(sample);
    }

    const doneValues = runs.map((run) => run.doneMs);
    const firstValues = runs
      .map((run) => run.firstFeedResultMs)
      .filter((value): value is number => value !== null);

    return {
      name: spec.name,
      samples,
      xmlBytesPerFeed,
      medianFirstFeedResultMs: firstValues.length > 0 ? median(firstValues) : null,
      medianDoneMs: median(doneValues),
      p90DoneMs: percentile(doneValues, 90),
      medianBytesSerialized: median(runs.map((run) => run.bytesSerialized)),
      medianItemCount: median(runs.map((run) => run.itemCount)),
      cached: spec.cache === 'hit',
      runs,
    };
  } finally {
    await server.close();
    clearFeedCache();
  }
}

function checkSensitivity(reports: WorkloadReport[]): void {
  const tiny = reports.find((report) => report.name === 'tiny');
  const target = reports.find((report) => report.name === 'target');
  const hit = reports.find((report) => report.name === 'hit');
  const fat = reports.find((report) => report.name === 'fat');

  if (!tiny || !target || !hit || !fat) {
    throw new Error('sensitivity check needs tiny, target, fat, and hit');
  }

  if (target.medianDoneMs < tiny.medianDoneMs * 10) {
    throw new Error(
      `target median done ${target.medianDoneMs.toFixed(1)}ms is not at least 10x tiny ${tiny.medianDoneMs.toFixed(1)}ms`
    );
  }
  if (hit.medianDoneMs >= target.medianDoneMs) {
    throw new Error(
      `hit median done ${hit.medianDoneMs.toFixed(1)}ms did not beat target ${target.medianDoneMs.toFixed(1)}ms`
    );
  }
  if ((fat.medianFirstFeedResultMs ?? 0) < (tiny.medianFirstFeedResultMs ?? 0) * 2) {
    throw new Error(
      `fat first result ${fat.medianFirstFeedResultMs?.toFixed(1)}ms is not at least 2x tiny ${tiny.medianFirstFeedResultMs?.toFixed(1)}ms`
    );
  }
}

function printReport(reports: WorkloadReport[]): void {
  const lines = [
    'workload\tfeeds\txmlBytes\titems\tcached\tmedianFirstMs\tmedianDoneMs\tp90DoneMs\tmedianBytes',
  ];
  for (const report of reports) {
    lines.push(
      [
        report.name,
        WORKLOADS[report.name].feedCount,
        report.xmlBytesPerFeed,
        report.medianItemCount,
        report.cached ? 'hit' : 'miss',
        report.medianFirstFeedResultMs === null ? 'n/a' : report.medianFirstFeedResultMs.toFixed(1),
        report.medianDoneMs.toFixed(1),
        report.p90DoneMs.toFixed(1),
        Math.round(report.medianBytesSerialized),
      ].join('\t')
    );
  }

  const target = reports.find((report) => report.name === 'target');
  if (target) {
    lines.push(
      `primary_metric\tcold_cache_stream_time_to_done_ms\t${target.medianDoneMs.toFixed(1)}\tmedian_of_${target.samples}`
    );
  }
  console.error(lines.join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [
    { executeFeedRequestProgressively },
    { serializeFeedItems },
    { clearFeedCache },
  ] = await Promise.all([
    import('../lib/feed-request'),
    import('../lib/feed-stream-parser'),
    import('../lib/feed-cache'),
  ]);

  const reports: WorkloadReport[] = [];
  await runWorkload(
    WORKLOADS.tiny,
    1,
    executeFeedRequestProgressively,
    serializeFeedItems,
    clearFeedCache
  );
  for (const name of args.workloads) {
    reports.push(
      await runWorkload(
        WORKLOADS[name],
        args.samples,
        executeFeedRequestProgressively,
        serializeFeedItems,
        clearFeedCache
      )
    );
  }

  printReport(reports);
  console.log(JSON.stringify({
    metric: 'cold_cache_stream_time_to_done_ms',
    direction: 'lower',
    todayReference: TODAY_REFERENCE.toISOString(),
    timeZone: TIME_ZONE,
    samples: args.samples,
    reports,
  }));

  if (args.checkSensitivity) {
    checkSensitivity(reports);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
