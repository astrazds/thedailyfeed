import { existsSync, readFileSync } from 'node:fs';
import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { buildNextHeaderRules } from './lib/platform-policy';

const metroOrigin = process.env.EXPO_DEV_ORIGIN;
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: 'standalone',
  turbopack: {},
  async headers() {
    return buildNextHeaderRules();
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'development' && metroOrigin) {
      return {
        beforeFiles: [
          { source: '/', destination: `${metroOrigin}/` },
          { source: '/assets/:path*', destination: `${metroOrigin}/assets/:path*` },
          { source: '/_expo/:path*', destination: `${metroOrigin}/_expo/:path*` },
        ],
        afterFiles: [],
        fallback: [{ source: '/:path*', destination: `${metroOrigin}/:path*` }],
      };
    }
    return [
      { source: '/', destination: '/expo/index.html' },
      { source: '/_expo/:path*', destination: '/expo/_expo/:path*' },
      { source: '/assets/:path*', destination: '/expo/assets/:path*' },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: false,
  cacheOnNavigation: false,
  additionalPrecacheEntries: existsSync('.expo-precache.json')
    ? JSON.parse(readFileSync('.expo-precache.json', 'utf8'))
    : undefined,
  exclude: [/./],
});

export default withSerwist(nextConfig);
