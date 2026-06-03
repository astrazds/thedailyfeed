import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextConfig } from 'next';

type RuntimeCachingEntry = {
  urlPattern: RegExp | string;
  handler: string;
  method?: string;
  options?: {
    cacheName?: string;
    expiration?: unknown;
    networkTimeoutSeconds?: number;
  };
};

type GenerateSWPlugin = {
  constructor: {
    name: string;
  };
  config?: {
    runtimeCaching?: RuntimeCachingEntry[];
  };
};

type WebpackConfig = {
  plugins: unknown[];
  module: {
    rules: unknown[];
  };
  output: {
    publicPath: string;
  };
  entry: () => Promise<Record<string, string[]>>;
};

type NextConfigWithWebpack = NextConfig & {
  webpack?: (config: WebpackConfig, options: WebpackOptions) => WebpackConfig;
};

type WebpackOptions = {
  dev: boolean;
  isServer: boolean;
  dir: string;
  buildId: string;
  config: {
    distDir: string;
    pageExtensions: string[];
    experimental: Record<string, unknown>;
    basePath?: string;
  };
  webpack: {
    DefinePlugin: typeof DefinePlugin;
  };
};

class DefinePlugin {
  readonly definitions: Record<string, string | undefined>;

  constructor(definitions: Record<string, string | undefined>) {
    this.definitions = definitions;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGenerateSWPlugin(plugin: unknown): plugin is GenerateSWPlugin {
  return (
    isRecord(plugin) &&
    'constructor' in plugin &&
    (plugin as GenerateSWPlugin).constructor.name === 'GenerateSW'
  );
}

function isNextConfigWithWebpack(value: unknown): value is NextConfigWithWebpack {
  return isRecord(value) && typeof value.webpack === 'function';
}

function unwrapNextConfig(value: unknown): NextConfigWithWebpack {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isNextConfigWithWebpack(current)) {
      return current;
    }

    if (isRecord(current) && 'default' in current) {
      current = current.default;
      continue;
    }

    break;
  }

  throw new TypeError('next.config must expose a webpack hook for next-pwa');
}

async function getRuntimeCachingConfig(): Promise<RuntimeCachingEntry[]> {
  const configModule: unknown = await import('../next.config');
  const webpack = unwrapNextConfig(configModule).webpack;
  assert.ok(webpack, 'next.config must expose a webpack hook for next-pwa');

  const webpackConfig = webpack(
    {
      plugins: [],
      module: {
        rules: [],
      },
      output: {
        publicPath: '/_next/',
      },
      entry: async () => ({
        'main.js': [],
      }),
    },
    {
      dev: false,
      isServer: false,
      dir: process.cwd(),
      buildId: 'route-cache-policy-test',
      config: {
        distDir: '.next',
        pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
        experimental: {},
      },
      webpack: {
        DefinePlugin,
      },
    }
  );

  const generateSW = webpackConfig.plugins.find(isGenerateSWPlugin);
  assert.ok(generateSW, 'next-pwa must configure a Workbox GenerateSW plugin');
  assert.ok(generateSW.config?.runtimeCaching, 'GenerateSW must include runtimeCaching');
  return generateSW.config.runtimeCaching;
}

function matchesFeedSetApi(entry: RuntimeCachingEntry): boolean {
  const feedSetApiUrl = 'https://thedailyfeed.test/api/feeds';

  if (entry.urlPattern instanceof RegExp) {
    return entry.urlPattern.test(feedSetApiUrl);
  }

  return entry.urlPattern === '/api/feeds' || entry.urlPattern === feedSetApiUrl;
}

test('Feed set API runtime cache policy is NetworkOnly to preserve no-store responses', async () => {
  const feedSetRuntimePolicies = (await getRuntimeCachingConfig()).filter(matchesFeedSetApi);

  assert.equal(feedSetRuntimePolicies.length, 1);
  assert.equal(feedSetRuntimePolicies[0].handler, 'NetworkOnly');
  assert.equal(feedSetRuntimePolicies[0].method, undefined);
  assert.equal(feedSetRuntimePolicies[0].options?.cacheName, undefined);
  assert.equal(feedSetRuntimePolicies[0].options?.expiration, undefined);
  assert.equal(feedSetRuntimePolicies[0].options?.networkTimeoutSeconds, undefined);
});
