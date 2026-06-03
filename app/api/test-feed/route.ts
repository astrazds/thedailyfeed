export const dynamic = 'force-dynamic';

function createFeedXml(): string {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Daily Feed Test Source</title>
    <link>https://example.com</link>
    <description>Static feed for integration testing</description>
    <item>
      <title>Integration Test Article One</title>
      <link>https://example.com/integration-one</link>
      <pubDate>${now.toUTCString()}</pubDate>
      <description>Recent item for API integration tests.</description>
    </item>
    <item>
      <title>Integration Test Article Two</title>
      <link>https://example.com/integration-two</link>
      <pubDate>${oneHourAgo.toUTCString()}</pubDate>
      <description>Second recent item for API integration tests.</description>
    </item>
  </channel>
</rss>`;
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(createFeedXml(), {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
