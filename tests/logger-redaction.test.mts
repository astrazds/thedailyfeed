import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../lib/logger';

async function captureWarn(run: () => void | Promise<void>): Promise<string[]> {
  const originalWarn = console.warn;
  const lines: string[] = [];

  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };

  try {
    await run();
  } finally {
    console.warn = originalWarn;
  }

  return lines;
}

test('logger redacts private URL credentials, query strings, and fragments from log context', async () => {
  const lines = await captureWarn(() => {
    logger.warn('Feed URL redaction test', {
      event: 'logger_url_redaction_test',
      feedUrl: 'https://user:pass@feeds.example.com/private.xml?token=secret-token&api_key=secret-key#secret-fragment',
      nested: {
        callbackUrl: 'https://callbacks.example.com/hook?signature=secret-signature',
      },
    });
  });

  const serialized = lines.join('\n');

  assert.equal(serialized.includes('secret-token'), false);
  assert.equal(serialized.includes('secret-key'), false);
  assert.equal(serialized.includes('secret-fragment'), false);
  assert.equal(serialized.includes('secret-signature'), false);
  assert.equal(serialized.includes('user:pass'), false);
  assert.equal(serialized.includes('https://feeds.example.com/private.xml?[REDACTED]#[REDACTED]'), true);
  assert.equal(serialized.includes('https://callbacks.example.com/hook?[REDACTED]'), true);
});
