import {
  platformPolicy,
  type PlatformPolicy,
  type PwaRuntimeCachingOptions,
} from './platform-policy';

export type SerwistRuntimeMatchContext = {
  readonly request: Pick<Request, 'destination'>;
  readonly sameOrigin: boolean;
  readonly url: URL;
};

export type SerwistRuntimeCachingEntry<Handler> = {
  readonly matcher: (context: SerwistRuntimeMatchContext) => boolean;
  readonly method: 'GET';
  readonly handler: Handler;
};

export type SerwistStrategyFactory<Handler> = {
  readonly networkOnly: () => Handler;
  readonly staleWhileRevalidate: (options: PwaRuntimeCachingOptions) => Handler;
};

export function buildSerwistRuntimeCaching<Handler>(
  strategies: SerwistStrategyFactory<Handler>,
  policy: PlatformPolicy = platformPolicy
): SerwistRuntimeCachingEntry<Handler>[] {
  if (policy.feedSet.runtimeCache.handler !== 'NetworkOnly') {
    throw new TypeError('Feed set runtime cache policy must declare NetworkOnly');
  }

  const feedSetRoute: SerwistRuntimeCachingEntry<Handler> = {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === policy.feedSet.route,
    method: 'GET',
    handler: strategies.networkOnly(),
  };

  const remoteImageRoute: SerwistRuntimeCachingEntry<Handler> = {
    matcher: ({ request, sameOrigin }) => !sameOrigin && request.destination === 'image',
    method: 'GET',
    handler: strategies.staleWhileRevalidate(policy.remoteFeedImages.options),
  };

  return [feedSetRoute, remoteImageRoute];
}
