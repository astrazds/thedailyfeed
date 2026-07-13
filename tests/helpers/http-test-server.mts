import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  close: () => Promise<void>;
  url: string;
}

export async function createTestServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<TestServer> {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!condition() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(condition(), true);
}
