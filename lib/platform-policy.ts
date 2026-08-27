export type PlatformHeader = {
  readonly key: string;
  readonly value: string;
};

export type PlatformHeaderSurfaceName =
  | 'baseline'
  | 'app-shell'
  | 'api'
  | 'service-worker'
  | 'manifest'
  | 'next-static'
  | 'next-static-media';

export type PlatformHeaderSurfacePolicy = {
  readonly name: PlatformHeaderSurfaceName;
  readonly source: string;
  readonly headers: readonly PlatformHeader[];
};

export type FeedSetRuntimeCachePolicy = {
  readonly urlPattern: RegExp;
  readonly handler: 'NetworkOnly';
};

export type FeedSetPlatformPolicy = {
  readonly route: '/api/feeds';
  readonly cacheControl: 'no-store';
  readonly runtimeCache: FeedSetRuntimeCachePolicy;
};

export type RemoteFeedImageRuntimeCachePolicy = {
  readonly handler: 'StaleWhileRevalidate';
  readonly options: PwaRuntimeCachingOptions;
};

export type PlatformPolicy = {
  readonly feedSet: FeedSetPlatformPolicy;
  readonly remoteFeedImages: RemoteFeedImageRuntimeCachePolicy;
  readonly headerSurfaces: readonly PlatformHeaderSurfacePolicy[];
};

export type NextHeaderRule = {
  source: string;
  headers: PlatformHeader[];
};

export type PwaRuntimeCachingOptions = {
  readonly cacheName: string;
  readonly expiration: {
    readonly maxEntries: number;
    readonly maxAgeSeconds: number;
  };
};

const isDev = process.env.NODE_ENV === 'development';

const feedSetCacheControl = 'no-store';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'none'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const serviceWorkerContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const commonSecurityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
] as const satisfies readonly PlatformHeader[];

const appShellHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
] as const satisfies readonly PlatformHeader[];

const apiHeaders = [
  {
    key: 'Cache-Control',
    value: feedSetCacheControl,
  },
] as const satisfies readonly PlatformHeader[];

const serviceWorkerAssetHeaders = [
  {
    key: 'Content-Type',
    value: 'application/javascript; charset=utf-8',
  },
  {
    key: 'Cache-Control',
    value: 'no-cache, no-store, must-revalidate',
  },
  {
    key: 'Content-Security-Policy',
    value: serviceWorkerContentSecurityPolicy,
  },
] as const satisfies readonly PlatformHeader[];

const manifestHeaders = [
  {
    key: 'Content-Type',
    value: 'application/manifest+json; charset=utf-8',
  },
  {
    key: 'Cache-Control',
    value: 'public, max-age=3600, must-revalidate',
  },
] as const satisfies readonly PlatformHeader[];

const staticAssetHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
] as const satisfies readonly PlatformHeader[];

export const platformPolicy = {
  feedSet: {
    route: '/api/feeds',
    cacheControl: feedSetCacheControl,
    runtimeCache: {
      urlPattern: /\/api\/feeds$/i,
      handler: 'NetworkOnly',
    },
  },
  remoteFeedImages: {
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'cross-origin-feed-images',
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 24 * 60 * 60,
      },
    },
  },
  headerSurfaces: [
    {
      name: 'baseline',
      source: '/:path*',
      headers: commonSecurityHeaders,
    },
    {
      name: 'app-shell',
      source: '/',
      headers: appShellHeaders,
    },
    {
      name: 'api',
      source: '/api/:path*',
      headers: apiHeaders,
    },
    {
      name: 'service-worker',
      source: '/sw.js',
      headers: serviceWorkerAssetHeaders,
    },
    {
      name: 'manifest',
      source: '/manifest.webmanifest',
      headers: manifestHeaders,
    },
    {
      name: 'next-static',
      source: '/_next/static/:path*',
      headers: staticAssetHeaders,
    },
    {
      name: 'next-static-media',
      source: '/_next/static/media/:path*',
      headers: staticAssetHeaders,
    },
  ],
} as const satisfies PlatformPolicy;

export function buildNextHeaderRules(policy: PlatformPolicy = platformPolicy): NextHeaderRule[] {
  return policy.headerSurfaces.map((surface) => ({
    source: surface.source,
    headers: surface.headers.map((header) => ({
      key: header.key,
      value: header.value,
    })),
  }));
}
