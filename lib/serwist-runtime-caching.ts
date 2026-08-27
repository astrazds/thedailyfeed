import {
  buildPwaRuntimeCaching,
  platformPolicy,
  type PlatformPolicy,
  type PwaRuntimeCachingOptions,
} from './platform-policy';

export type SerwistRuntimeMatchContext = {
  readonly sameOrigin: boolean;
  readonly url: URL;
};

export type SerwistRuntimeCachingEntry<Handler> = {
  readonly matcher: (context: SerwistRuntimeMatchContext) => boolean;
  readonly method: 'GET';
  readonly handler: Handler;
};

export type SerwistStrategyFactory<Handler> = {
  readonly cacheFirst: (options: PwaRuntimeCachingOptions) => Handler;
  readonly networkOnly: () => Handler;
  readonly staleWhileRevalidate: (options: PwaRuntimeCachingOptions) => Handler;
};

function matches(pattern: RegExp, url: URL): boolean {
  pattern.lastIndex = 0;
  return pattern.test(url.href);
}

export function buildSerwistRuntimeCaching<Handler>(
  strategies: SerwistStrategyFactory<Handler>,
  policy: PlatformPolicy = platformPolicy
): SerwistRuntimeCachingEntry<Handler>[] {
  const declarations = buildPwaRuntimeCaching(policy);
  const feedSetDeclaration = declarations.find((entry) => entry.handler === 'NetworkOnly');

  if (!feedSetDeclaration) {
    throw new TypeError('Feed set runtime cache policy must declare NetworkOnly');
  }

  const feedSetRoute: SerwistRuntimeCachingEntry<Handler> = {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === policy.feedSet.route,
    method: 'GET',
    handler: strategies.networkOnly(),
  };

  const assetRoutes = declarations
    .filter((entry) => entry !== feedSetDeclaration)
    .map<SerwistRuntimeCachingEntry<Handler>>((entry) => {
      if (!entry.options) {
        throw new TypeError(`${entry.handler} asset policy must declare bounded cache options`);
      }

      return {
        matcher: ({ url }) => matches(entry.urlPattern, url),
        method: 'GET',
        handler:
          entry.handler === 'CacheFirst'
            ? strategies.cacheFirst(entry.options)
            : strategies.staleWhileRevalidate(entry.options),
      };
    });

  return [feedSetRoute, ...assetRoutes];
}
