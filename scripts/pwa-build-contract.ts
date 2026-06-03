import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { platformPolicy, type PlatformPolicy } from '../lib/platform-policy';

export type PwaBuildContractResult = {
  readonly serviceWorkerPath: string;
  readonly workboxAssets: readonly string[];
  readonly feedSetRuntimeCache: {
    readonly route: string;
    readonly handler: string;
    readonly method: string;
  };
};

type PwaBuildContractOptions = {
  readonly publicDir?: string;
  readonly policy?: PlatformPolicy;
};

type RuntimeRoute = {
  readonly capture: unknown;
  readonly method: string;
  readonly strategyName: string;
};

type WorkboxStrategy = {
  readonly strategyName: string;
  readonly options?: unknown;
};

type RegisterRoute = (capture: unknown, strategy: unknown, method?: string) => void;

type WorkboxModule = {
  readonly CacheFirst: new (options?: unknown) => WorkboxStrategy;
  readonly NetworkFirst: new (options?: unknown) => WorkboxStrategy;
  readonly NetworkOnly: new (options?: unknown) => WorkboxStrategy;
  readonly StaleWhileRevalidate: new (options?: unknown) => WorkboxStrategy;
  readonly ExpirationPlugin: typeof ExpirationPlugin;
  readonly cleanupOutdatedCaches: () => void;
  readonly clientsClaim: () => void;
  readonly precacheAndRoute: () => void;
  readonly registerRoute: RegisterRoute;
};

type ServiceWorkerModuleFactory = (workbox: WorkboxModule) => void;

function assertNonEmptyFile(path: string): void {
  assert.ok(existsSync(path), `${path} must exist`);
  assert.ok(statSync(path).size > 0, `${path} must not be empty`);
}

function workboxAssetNamesFrom(serviceWorker: string): string[] {
  const assetNames = new Set<string>();

  for (const match of serviceWorker.matchAll(/["']\.\/(workbox-[\w-]+)(?:\.js)?["']/g)) {
    assetNames.add(`${match[1]}.js`);
  }

  return [...assetNames];
}

function assertWorkboxAssets(publicDir: string, serviceWorker: string): string[] {
  const assetNames = workboxAssetNamesFrom(serviceWorker);

  assert.ok(assetNames.length > 0, 'PWA build must emit a service worker that references a Workbox runtime asset');

  const assetPaths = assetNames.map((assetName) => resolve(publicDir, assetName));

  for (const assetPath of assetPaths) {
    assertNonEmptyFile(assetPath);
  }

  return assetPaths;
}

function strategyNameFor(strategy: unknown): string {
  if (isRecord(strategy) && typeof strategy.strategyName === 'string') {
    return strategy.strategyName;
  }

  throw new TypeError('Service worker runtime route must use a Workbox strategy instance');
}

function createStrategy(strategyName: string): new (options?: unknown) => WorkboxStrategy {
  return class RecordedStrategy implements WorkboxStrategy {
    readonly strategyName = strategyName;
    readonly options: unknown;

    constructor(options?: unknown) {
      this.options = options;
    }
  };
}

class ExpirationPlugin {
  readonly options: unknown;

  constructor(options?: unknown) {
    this.options = options;
  }
}

function collectRuntimeRoutes(serviceWorker: string): RuntimeRoute[] {
  const routes: RuntimeRoute[] = [];

  const registerRoute: RegisterRoute = (capture, strategy, method = 'GET') => {
    routes.push({
      capture,
      method,
      strategyName: strategyNameFor(strategy),
    });
  };

  const define = (_dependencies: unknown, factory: unknown): void => {
    if (typeof factory !== 'function') {
      throw new TypeError('Service worker module must define a factory');
    }

    const workbox: WorkboxModule = {
      CacheFirst: createStrategy('CacheFirst'),
      NetworkFirst: createStrategy('NetworkFirst'),
      NetworkOnly: createStrategy('NetworkOnly'),
      StaleWhileRevalidate: createStrategy('StaleWhileRevalidate'),
      ExpirationPlugin,
      cleanupOutdatedCaches() {},
      clientsClaim() {},
      precacheAndRoute() {},
      registerRoute,
    };

    const serviceWorkerFactory = factory as ServiceWorkerModuleFactory;
    serviceWorkerFactory(workbox);
  };

  const self = {
    define,
    skipWaiting() {},
  };

  const context = createContext({
    Request,
    Response,
    URL,
    console,
    define,
    importScripts() {},
    self,
  });

  new Script(serviceWorker, { filename: 'public/sw.js' }).runInContext(context, {
    timeout: 1000,
  });

  return routes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRegExpLike(value: unknown): value is RegExp {
  return isRecord(value) && typeof value.test === 'function';
}

function routeMatchesUrl(capture: unknown, url: URL): boolean {
  if (isRegExpLike(capture)) {
    capture.lastIndex = 0;
    return capture.test(url.href);
  }

  if (typeof capture === 'string') {
    return capture === url.href || capture === url.pathname;
  }

  if (typeof capture === 'function') {
    const request = new Request(url);
    return Boolean(capture({ event: undefined, request, sameOrigin: true, url }));
  }

  return false;
}

function assertFeedSetRuntimeCache(
  routes: readonly RuntimeRoute[],
  policy: PlatformPolicy
): PwaBuildContractResult['feedSetRuntimeCache'] {
  assert.equal(policy.feedSet.cacheControl, 'no-store', 'Feed set route must declare no-store cache-control');

  const feedSetUrl = new URL(policy.feedSet.route, 'https://thedailyfeed.test');
  const validateUrl = new URL(`${policy.feedSet.route}/validate`, 'https://thedailyfeed.test');

  assert.equal(
    policy.feedSet.runtimeCache.urlPattern.test(feedSetUrl.href),
    true,
    'Feed set runtime cache policy must match the Feed set route'
  );
  assert.equal(
    policy.feedSet.runtimeCache.urlPattern.test(validateUrl.href),
    false,
    'Feed set runtime cache policy must not match validation routes'
  );

  const matchingRoutes = routes.filter((route) => routeMatchesUrl(route.capture, feedSetUrl));

  assert.equal(matchingRoutes.length, 1, 'Service worker must register exactly one runtime route for the Feed set API');

  const [feedSetRoute] = matchingRoutes;

  assert.equal(feedSetRoute.method, 'GET', 'Feed set runtime cache route must be limited to GET requests');
  assert.equal(
    feedSetRoute.strategyName,
    policy.feedSet.runtimeCache.handler,
    `Feed set runtime cache route must use ${policy.feedSet.runtimeCache.handler}`
  );
  assert.equal(
    routeMatchesUrl(feedSetRoute.capture, validateUrl),
    false,
    'Feed set runtime cache route must not match validation routes'
  );

  return {
    route: policy.feedSet.route,
    handler: feedSetRoute.strategyName,
    method: feedSetRoute.method,
  };
}

export function verifyPwaBuildContract(options: PwaBuildContractOptions = {}): PwaBuildContractResult {
  const publicDir = resolve(options.publicDir ?? 'public');
  const policy = options.policy ?? platformPolicy;
  const serviceWorkerPath = resolve(publicDir, 'sw.js');

  assertNonEmptyFile(serviceWorkerPath);

  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  const workboxAssets = assertWorkboxAssets(publicDir, serviceWorker);
  const runtimeRoutes = collectRuntimeRoutes(serviceWorker);
  const feedSetRuntimeCache = assertFeedSetRuntimeCache(runtimeRoutes, policy);

  return {
    serviceWorkerPath,
    workboxAssets,
    feedSetRuntimeCache,
  };
}
