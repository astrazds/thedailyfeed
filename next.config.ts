import type { NextConfig } from "next";
import withSerwistInit from '@serwist/next';

import { buildNextHeaderRules } from './lib/platform-policy';

const nextConfig: NextConfig = {
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  
  // Docker optimization (standalone output)
  output: 'standalone',
  
  // Turbopack config (required for Next.js 16)
  turbopack: {},
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Security headers
  async headers() {
    return buildNextHeaderRules();
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  cacheOnNavigation: false,
});

export default withSerwist(nextConfig);
