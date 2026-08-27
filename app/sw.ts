import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig, Strategy } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

import {
  buildSerwistRuntimeCaching,
  type SerwistStrategyFactory,
} from '../lib/serwist-runtime-caching';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const strategies: SerwistStrategyFactory<Strategy> = {
  cacheFirst: ({ cacheName, expiration }) =>
    new CacheFirst({
      cacheName,
      plugins: [new ExpirationPlugin(expiration)],
    }),
  networkOnly: () => new NetworkOnly(),
  staleWhileRevalidate: ({ cacheName, expiration }) =>
    new StaleWhileRevalidate({
      cacheName,
      plugins: [new ExpirationPlugin(expiration)],
    }),
};

const runtimeCaching: RuntimeCaching[] = buildSerwistRuntimeCaching(strategies);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching,
});

serwist.addEventListeners();
