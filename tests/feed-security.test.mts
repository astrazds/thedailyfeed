import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FeedSecurityError,
  validateFeedRedirectUrl,
  validateFeedUrlForFetch,
  type ResolveHostname,
} from '../lib/feed-security';
import { POST as validateFeed } from '../app/api/feeds/validate/route';
import { clearRateLimitState } from '../lib/rate-limiter';

function setProcessEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  Reflect.set(process.env, name, value);
}

async function withEnv<T>(
  env: { NODE_ENV?: string; ALLOW_PRIVATE_NETWORKS?: string },
  callback: () => Promise<T>
): Promise<T> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowPrivateNetworks = process.env.ALLOW_PRIVATE_NETWORKS;

  setProcessEnv('NODE_ENV', env.NODE_ENV);
  setProcessEnv('ALLOW_PRIVATE_NETWORKS', env.ALLOW_PRIVATE_NETWORKS);

  try {
    return await callback();
  } finally {
    setProcessEnv('NODE_ENV', originalNodeEnv);
    setProcessEnv('ALLOW_PRIVATE_NETWORKS', originalAllowPrivateNetworks);
  }
}

test('rejects feed hostnames that resolve to private addresses in production', async () => {
  const resolveHostname: ResolveHostname = async () => [{ address: '127.0.0.1', family: 4 }];

  await withEnv({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => validateFeedUrlForFetch('https://feeds.example.com/rss.xml', { resolveHostname }),
      FeedSecurityError
    );
  });
});

test('rejects hexadecimal IPv4-mapped IPv6 localhost literals in production', async () => {
  await withEnv({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => validateFeedUrlForFetch('http://[::ffff:7f00:1]/rss.xml'),
      FeedSecurityError
    );
  });
});

test('rejects resolved hexadecimal IPv4-mapped IPv6 private addresses in production', async () => {
  const resolveHostname: ResolveHostname = async () => [{ address: '::ffff:0a00:5', family: 6 }];

  await withEnv({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => validateFeedUrlForFetch('https://feeds.example.com/rss.xml', { resolveHostname }),
      FeedSecurityError
    );
  });
});

test('feed validation route rejects hexadecimal IPv4-mapped IPv6 localhost literals in production', async () => {
  clearRateLimitState();

  await withEnv({ NODE_ENV: 'production' }, async () => {
    const response = await validateFeed(
      new Request('https://thedailyfeed.test/api/feeds/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': 'mapped-ipv6-route-request-1',
        },
        body: JSON.stringify({
          url: 'http://[::ffff:7f00:1]/rss.xml',
        }),
      })
    );

    assert.equal(response.status, 400);
  });
});

test('preserves ALLOW_PRIVATE_NETWORKS override for private resolved addresses', async () => {
  const resolveHostname: ResolveHostname = async () => [{ address: '10.0.0.5', family: 4 }];

  await withEnv({ NODE_ENV: 'production', ALLOW_PRIVATE_NETWORKS: 'true' }, async () => {
    const url = await validateFeedUrlForFetch('https://feeds.example.com/rss.xml', {
      resolveHostname,
    });

    assert.equal(url.href, 'https://feeds.example.com/rss.xml');
  });
});

test('preserves local and test private network behavior', async () => {
  const resolveHostname: ResolveHostname = async () => [{ address: '192.168.1.20', family: 4 }];

  await withEnv({ NODE_ENV: 'development' }, async () => {
    const url = await validateFeedUrlForFetch('http://local-feed.example/rss.xml', {
      resolveHostname,
    });

    assert.equal(url.hostname, 'local-feed.example');
  });
});

test('revalidates redirect targets after DNS resolution', async () => {
  const resolveHostname: ResolveHostname = async (hostname) => {
    if (hostname === 'metadata.example') {
      return [{ address: '169.254.169.254', family: 4 }];
    }

    return [{ address: '93.184.216.34', family: 4 }];
  };

  await withEnv({ NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => validateFeedRedirectUrl(new URL('https://feeds.example.com/rss.xml'), 'http://metadata.example/latest', {
        resolveHostname,
      }),
      FeedSecurityError
    );
  });
});
