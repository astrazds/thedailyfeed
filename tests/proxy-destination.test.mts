import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { proxyDestination } from '../scripts/proxy-destination.ts';

const configuredOrigin = 'http://127.0.0.1:3000';

test('absolute-form targets forward only the path and search', () => {
  const destination = proxyDestination('http://user:pass@other-host:9999/foo%2Fbar?q=%2F#frag', configuredOrigin);

  assert.equal(destination.href, 'http://127.0.0.1:3000/foo%2Fbar?q=%2F');
  assert.equal(destination.username, '');
  assert.equal(destination.password, '');
});

test('origin-form targets stay on the configured origin', () => {
  const destination = proxyDestination('/sw.js', configuredOrigin);

  assert.equal(destination.href, 'http://127.0.0.1:3000/sw.js');
});

test('a path that starts with two slashes stays on the configured origin', async () => {
  const backend = await listen();
  try {
    const destination = proxyDestination('http://other-host//evil.example/secret?x=1', backend.origin);

    assert.equal(destination.origin, backend.origin);
    assert.equal(destination.pathname, '//evil.example/secret');
    assert.equal(destination.search, '?x=1');

    assert.equal(await requestStatus(destination), 204);
    assert.deepEqual(backend.hits, ['//evil.example/secret?x=1']);
  } finally {
    await backend.close();
  }
});

test('an absolute-form request reaches the configured server', async () => {
  const backend = await listen();
  const other = await listen();
  try {
    const destination = proxyDestination(`http://127.0.0.1:${other.port}/secret?x=1`, backend.origin);

    assert.equal(destination.origin, backend.origin);
    assert.equal(await requestStatus(destination), 204);
    assert.deepEqual(backend.hits, ['/secret?x=1']);
    assert.deepEqual(other.hits, []);
  } finally {
    await Promise.all([backend.close(), other.close()]);
  }
});

type ListeningServer = {
  origin: string;
  port: number;
  hits: string[];
  close: () => Promise<void>;
};

function listen(): Promise<ListeningServer> {
  const hits: string[] = [];
  const server = createServer((incoming: IncomingMessage, outgoing: ServerResponse) => {
    hits.push(incoming.url ?? '');
    outgoing.writeHead(204);
    outgoing.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        hits,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function requestStatus(target: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(target, { method: 'GET' }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}
