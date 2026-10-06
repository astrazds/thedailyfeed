export type StyleState = "ready-short" | "expanded-rich" | "initial-loading" | "empty-today";
export const fixedTime = "2026-09-08T12:00:00.000Z";
export const subscriptions = [
  { id: "field-notes", name: "Field Notes", url: "https://field-notes.example/rss", enabled: true, addedAt: "2026-09-08T00:00:00.000Z" },
  { id: "small-hours", name: "Small Hours", url: "https://small-hours.example/rss", enabled: true, addedAt: "2026-09-08T00:00:00.000Z" },
];
const shortItems = [
  { title: "A quieter corner of the web", source: "Field Notes", contentHtml: "<p>The best discoveries rarely arrive with a notification. A few good sources, a little curiosity, and a slower morning are often enough.</p><p>Today we visit the independent sites making room for thoughtful writing, useful ideas, and conversations that last.</p>", link: "https://articles.example/quiet", pubDate: "2026-09-08T11:00:00.000Z" },
  { title: "Making things that last", source: "Small Hours", contentHtml: "<p>A notebook filled over years. A chair repaired instead of replaced. Software that does one thing well. There is a particular satisfaction in caring for the tools we use every day.</p>", link: "https://articles.example/making", pubDate: "2026-09-08T10:00:00.000Z" },
];
const richItem = {
  ...shortItems[0],
  contentHtml: "<h3>A slower morning</h3><p>A <strong>good reading habit</strong> starts with a few thoughtful sources. Visit the <a href=\"https://articles.example/library\">independent library</a> and keep a notebook nearby.</p><blockquote><p>Make room for ideas that deserve your attention.</p></blockquote><ul><li>Read with curiosity.</li><li>Save time for reflection.</li></ul><p>Some mornings begin with the garden outside the window. Three pots, a handful of seeds, and a sunny windowsill can change how we see the rest of the day. The work is small but the attention matters. We return to the same familiar places and notice something different each time. There is always another story to discover when we slow down long enough to listen.</p><p>The quiet page at the end leaves room for tomorrow.</p>",
};
export function responseBody(state: StyleState): string {
  const items = state === "empty-today" ? [] : state === "expanded-rich" ? [richItem] : shortItems;
  const common = { requestId: "style-proof", cached: false, timeZone: "UTC", totalFeeds: subscriptions.length };
  return [
    { ...common, type: "meta", completedFeeds: 0 },
    ...subscriptions.map((feed, index) => {
      const feedItems = items.filter(item => item.source === feed.name);
      return { ...common, type: "feed_result", completedFeeds: index + 1, feedUrl: feed.url, status: "success", itemCount: feedItems.length, items: feedItems };
    }),
    { ...common, type: "done", completedFeeds: subscriptions.length, totalItemCount: items.length },
  ].map(chunk => JSON.stringify(chunk)).join("\n") + "\n";
}
export const cases = (["ready-short", "expanded-rich", "initial-loading", "empty-today"] as const).flatMap(state =>
  ([{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 900 }] as const).flatMap(viewport =>
    (["light", "dark"] as const).map(theme => ({ id: `${state}-${viewport.name}-${theme}`, state, viewport, theme })),
  ),
);
