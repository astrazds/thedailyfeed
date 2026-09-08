import { test as base, expect } from '@playwright/test';
import { STORAGE_KEY_FEEDS } from '../lib/constants';

export const subscriptions = [
  { id: 'field-notes', name: 'Field Notes', url: 'https://field-notes.example/rss' },
  { id: 'small-hours', name: 'Small Hours', url: 'https://small-hours.example/rss' },
  { id: 'open-workshop', name: 'Open Workshop', url: 'https://open-workshop.example/rss' },
].map(feed => ({ ...feed, enabled: true, addedAt: '2026-09-08T00:00:00.000Z' }));

const stories = [
  ['A quieter corner of the web', 'Field Notes', '<p>The best discoveries rarely arrive with a notification. A few good sources, a little curiosity, and a slower morning are often enough.</p><p>Today we visit the independent sites making room for thoughtful writing, useful ideas, and conversations that last.</p>'],
  ['Making things that last', 'Small Hours', '<p>A notebook filled over years. A chair repaired instead of replaced. Software that does one thing well. There is a particular satisfaction in caring for the tools we use every day.</p>'],
  ['The small garden outside the window', 'Open Workshop', '<p>Three pots, a handful of seeds, and a sunny windowsill: an experiment in paying closer attention to the everyday.</p>'],
  ['An afternoon at the print workshop', 'Field Notes', '<p>Ink, paper, and the rhythm of a hand-operated press. We spend an afternoon learning why making something slowly can change the way we see it.</p>'],
  ['Notes on walking without a destination', 'Small Hours', '<p>Leave the headphones at home. Take the unfamiliar turn. A short walk can be a useful way to find a new perspective.</p>'],
  ['Building a useful little tool', 'Open Workshop', '<p>Start with a real need, remove the unnecessary parts, and leave room for the people who will use it.</p>'],
];

export const test = base.extend<{ synthetic: void }>({
  synthetic: [async ({ context, page }, use) => {
    await page.clock.setFixedTime(new Date('2026-09-08T12:00:00Z'));
    await context.addInitScript(({ key, feeds }) => {
      localStorage.setItem(key, JSON.stringify(feeds));
    }, { key: STORAGE_KEY_FEEDS, feeds: subscriptions });
    // All browser API traffic is intercepted; external traffic is blocked.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:3100') return route.abort();
      if (url.pathname === '/api/feeds/validate') return route.fulfill({ json: { valid: true } });
      if (url.pathname === '/api/feeds') {
        const { feedUrls } = route.request().postDataJSON() as { feedUrls: string[] };
        const common = { requestId: 'synthetic', cached: false, timeZone: 'UTC', totalFeeds: feedUrls.length };
        const results = feedUrls.map((feedUrl, index) => {
          const source = subscriptions.find(feed => feed.url === feedUrl)?.name;
          const items = stories.filter(story => story[1] === source).map(([title, source, contentHtml], i) => ({
            title, source, contentHtml, link: `https://articles.example/${index}/${i}`,
            pubDate: `2026-09-08T${String(11 - i * 3 - index).padStart(2, '0')}:00:00Z`,
          }));
          return { ...common, type: 'feed_result', completedFeeds: index + 1, feedUrl, status: 'success', itemCount: items.length, items };
        });
        return route.fulfill({ contentType: 'application/x-ndjson', headers: { 'Cache-Control': 'no-store' }, body: [
          { ...common, type: 'meta', completedFeeds: 0 }, ...results,
          { ...common, type: 'done', completedFeeds: feedUrls.length, totalItemCount: results.reduce((sum, result) => sum + result.items.length, 0) },
        ].map(chunk => JSON.stringify(chunk)).join('\n') + '\n' });
      }
      if (url.pathname.startsWith('/api/')) return route.abort();
      return route.continue();
    });
    await use();
  }, { auto: true }],
});
export { expect };
