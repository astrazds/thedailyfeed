import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextConfig } from 'next';

type Header = {
  key: string;
  value: string;
};

type HeaderRule = {
  source: string;
  headers: Header[];
};

type NextConfigWithHeaders = NextConfig & {
  headers?: () => Promise<HeaderRule[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNextConfigWithHeaders(value: unknown): value is NextConfigWithHeaders {
  return isRecord(value) && typeof value.headers === 'function';
}

function unwrapNextConfig(value: unknown): NextConfigWithHeaders {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isNextConfigWithHeaders(current)) {
      return current;
    }

    if (isRecord(current) && 'default' in current) {
      current = current.default;
      continue;
    }

    break;
  }

  throw new TypeError('next.config must expose a headers hook');
}

async function getHeaderRules(): Promise<HeaderRule[]> {
  const configModule: unknown = await import('../next.config');
  const headers = unwrapNextConfig(configModule).headers;
  assert.ok(headers, 'next.config must expose a headers hook');
  return headers();
}

function headersFor(rule: HeaderRule): Map<string, string> {
  return new Map(rule.headers.map((header) => [header.key, header.value]));
}

function requireSource(rules: HeaderRule[], source: string): Map<string, string> {
  const rule = rules.find((candidate) => candidate.source === source);
  assert.ok(rule, `Expected a header policy for ${source}`);
  return headersFor(rule);
}

test('header policy is explicit by app, API, PWA, manifest, and static media surface', async () => {
  const rules = await getHeaderRules();

  const baselineHeaders = requireSource(rules, '/:path*');
  assert.equal(
    baselineHeaders.has('Content-Security-Policy'),
    false,
    'catch-all baseline must not hide app-shell CSP assumptions'
  );

  const appShellHeaders = requireSource(rules, '/');
  assert.match(appShellHeaders.get('Content-Security-Policy') ?? '', /img-src 'self' data: blob: https: http:/);
  assert.match(appShellHeaders.get('Content-Security-Policy') ?? '', /media-src 'none'/);
  assert.equal(appShellHeaders.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');

  const apiHeaders = requireSource(rules, '/api/:path*');
  assert.equal(apiHeaders.get('Cache-Control'), 'no-store');
  assert.equal(apiHeaders.has('Content-Security-Policy'), false);

  const serviceWorkerHeaders = requireSource(rules, '/sw.js');
  assert.equal(serviceWorkerHeaders.get('Content-Type'), 'application/javascript; charset=utf-8');
  assert.equal(serviceWorkerHeaders.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
  assert.match(serviceWorkerHeaders.get('Content-Security-Policy') ?? '', /script-src 'self'/);

  const workboxHeaders = requireSource(rules, '/workbox-:hash.js');
  assert.equal(workboxHeaders.get('Content-Type'), 'application/javascript; charset=utf-8');
  assert.equal(workboxHeaders.get('Cache-Control'), 'no-cache, no-store, must-revalidate');

  const manifestHeaders = requireSource(rules, '/manifest.webmanifest');
  assert.equal(manifestHeaders.get('Content-Type'), 'application/manifest+json; charset=utf-8');

  const staticHeaders = requireSource(rules, '/_next/static/:path*');
  assert.equal(staticHeaders.get('X-Content-Type-Options'), 'nosniff');

  const staticMediaHeaders = requireSource(rules, '/_next/static/media/:path*');
  assert.equal(staticMediaHeaders.get('X-Content-Type-Options'), 'nosniff');
});
