import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { POST as validateFeed } from '../../app/api/feeds/validate/route';

const scenario = process.argv[2];
let requestCount = 0;
let serverUrl = '';

const server = createServer((_request, response) => {
  requestCount += 1;

  if (scenario === 'redirect') {
    setTimeout(() => {
      response.writeHead(302, {
        Location: `${serverUrl}/redirect-${requestCount}`,
      });
      response.end();
    }, 20);
    return;
  }

  if (scenario === 'retry') {
    if (requestCount === 1) {
      setTimeout(() => {
        response.writeHead(500);
        response.end();
      }, 20);
    }
    return;
  }

  response.writeHead(500);
  response.end();
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as AddressInfo;
serverUrl = `http://127.0.0.1:${address.port}`;

try {
  const startedAt = Date.now();
  const response = await validateFeed(new Request('https://thedailyfeed.test/api/feeds/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': `route-budget-${scenario}`,
    },
    body: JSON.stringify({ url: `${serverUrl}/feed.xml` }),
  }));

  assert.equal(response.status, 400);
  if (scenario === 'redirect') {
    assert.ok(requestCount < 6, `expected route deadline before redirect limit, got ${requestCount}`);
  } else if (scenario === 'retry') {
    assert.equal(requestCount, 2);
    assert.ok(
      Date.now() - startedAt < 2_000,
      'expected aggregate route deadline to abort the second attempt before its 10s timeout'
    );
  } else {
    throw new Error(`Unknown scenario: ${scenario}`);
  }
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
