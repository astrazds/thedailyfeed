import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage, RequestOptions } from 'node:http';
import type { LookupFunction } from 'node:net';
import {
  type FeedSecurityOptions,
  type ResolvedAddress,
  resolveAndValidateHostname,
  validateFeedRedirectUrl,
  validateFeedUrlForFetch,
} from './feed-security';
import {
  ACCEPT_HEADER,
  FEED_TIMEOUT_MS,
  USER_AGENT,
} from './constants';

export const MAX_FEED_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_FEED_REDIRECTS = 5;

interface FetchFeedXmlOptions extends FeedSecurityOptions {
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class FeedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedFetchError';
  }
}

export class FeedResponseTooLargeError extends FeedFetchError {
  constructor(maxBytes: number) {
    super(`Feed response exceeded ${maxBytes} bytes.`);
    this.name = 'FeedResponseTooLargeError';
  }
}

export class FeedTimeoutError extends FeedFetchError {
  constructor(timeoutMs: number) {
    super(`Feed fetching timeout after ${timeoutMs}ms.`);
    this.name = 'FeedTimeoutError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function createAbortError(): Error {
  const error = new Error('Feed fetch aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  const reason = signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }

  throw createAbortError();
}

function createSecureLookup(
  options: FetchFeedXmlOptions
): LookupFunction {
  return (hostname, lookupOptions, callback) => {
    const family = lookupOptions.family === 4 || lookupOptions.family === 6 ? lookupOptions.family : undefined;
    const wantsAll = Boolean((lookupOptions as { all?: boolean }).all);

    resolveAndValidateHostname(hostname, options)
      .then((addresses) => {
        const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses;
        const selected = candidates[0];

        if (!selected) {
          throw new FeedFetchError('Feed URL hostname did not resolve to a supported address family.');
        }

        if (wantsAll) {
          (callback as unknown as (error: NodeJS.ErrnoException | null, addresses: ResolvedAddress[]) => void)(
            null,
            candidates
          );
          return;
        }

        callback(null, selected.address, selected.family);
      })
      .catch((error: unknown) => {
        callback(error as NodeJS.ErrnoException, '', 0);
      });
  };
}

async function getValidatedAddresses(url: URL, options: FetchFeedXmlOptions): Promise<ResolvedAddress[]> {
  return resolveAndValidateHostname(url.hostname, options);
}

function responseBodyToString(
  response: IncomingMessage,
  maxBytes: number,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;

    response.on('data', (chunk: Buffer) => {
      byteLength += chunk.byteLength;

      if (byteLength > maxBytes) {
        reject(new FeedResponseTooLargeError(maxBytes));
        response.destroy();
        return;
      }

      chunks.push(chunk);
    });

    response.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    response.on('error', reject);

    signal?.addEventListener('abort', () => reject(signal.reason ?? createAbortError()), {
      once: true,
    });
  });
}

async function requestFeedUrl(
  url: URL,
  redirectCount: number,
  options: FetchFeedXmlOptions
): Promise<string> {
  throwIfAborted(options.signal);

  const maxRedirects = options.maxRedirects ?? MAX_FEED_REDIRECTS;
  const maxBytes = options.maxBytes ?? MAX_FEED_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  await getValidatedAddresses(url, options);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Accept: ACCEPT_HEADER,
        'User-Agent': USER_AGENT,
      },
      lookup: createSecureLookup(options),
      signal: options.signal,
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      callback();
    };

    const req = request(requestOptions, async (response) => {
      try {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();

          if (redirectCount >= maxRedirects) {
            throw new FeedFetchError('Feed redirect limit exceeded.');
          }

          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }

          const redirectUrl = await validateFeedRedirectUrl(url, location, options);
          const body = await requestFeedUrl(redirectUrl, redirectCount + 1, options);
          finish(() => resolve(body));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          throw new FeedFetchError(`Feed request failed with HTTP ${statusCode}.`);
        }

        const contentLength = response.headers['content-length'];
        if (typeof contentLength === 'string' && Number.parseInt(contentLength, 10) > maxBytes) {
          response.resume();
          throw new FeedResponseTooLargeError(maxBytes);
        }

        const body = await responseBodyToString(response, maxBytes, options.signal);
        finish(() => resolve(body));
      } catch (error) {
        finish(() => reject(error));
      }
    });

    timeout = setTimeout(() => {
      req.destroy(new FeedTimeoutError(timeoutMs));
    }, timeoutMs);

    req.on('error', (error) => {
      finish(() => reject(error));
    });

    options.signal?.addEventListener('abort', () => {
      req.destroy(options.signal?.reason instanceof Error ? options.signal.reason : createAbortError());
    }, {
      once: true,
    });

    req.end();
  });
}

export async function fetchFeedXml(feedUrl: string, options: FetchFeedXmlOptions = {}): Promise<string> {
  throwIfAborted(options.signal);

  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  const timeout = setTimeout(() => {
    timeoutController.abort(new FeedTimeoutError(timeoutMs));
  }, timeoutMs);
  let rejectOnAbort: ((reason: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(signal.reason ?? createAbortError());
    signal.addEventListener('abort', rejectOnAbort, { once: true });
  });

  try {
    const fetchPromise = (async () => {
      const fetchOptions = { ...options, signal };
      const url = await validateFeedUrlForFetch(feedUrl, fetchOptions);
      return requestFeedUrl(url, 0, fetchOptions);
    })();

    return await Promise.race([fetchPromise, abortPromise]);
  } finally {
    clearTimeout(timeout);
    if (rejectOnAbort) {
      signal.removeEventListener('abort', rejectOnAbort);
    }
  }
}
