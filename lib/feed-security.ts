import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  isPrivateOrLocalIPv4,
  isPrivateOrLocalIPv6,
  isValidFeedUrl,
  shouldBlockPrivateNetworks,
} from './url-validator';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>;

export interface FeedSecurityOptions {
  allowPrivateNetworks?: boolean;
  resolveHostname?: ResolveHostname;
}

export class FeedSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedSecurityError';
  }
}

function stripIPv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

function privateNetworksAllowed(options: FeedSecurityOptions = {}): boolean {
  if (typeof options.allowPrivateNetworks === 'boolean') {
    return options.allowPrivateNetworks;
  }

  return !shouldBlockPrivateNetworks();
}

function assertAddressAllowed(address: string, options: FeedSecurityOptions = {}): void {
  if (privateNetworksAllowed(options)) {
    return;
  }

  if (isPrivateOrLocalIPv4(address) || isPrivateOrLocalIPv6(address)) {
    throw new FeedSecurityError('Feed URL resolves to a private, link-local, or local address.');
  }
}

export async function defaultResolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const normalizedHostname = stripIPv6Brackets(hostname);
  const literalFamily = isIP(normalizedHostname);

  if (literalFamily === 4 || literalFamily === 6) {
    return [{ address: normalizedHostname, family: literalFamily }];
  }

  const addresses = await dnsLookup(normalizedHostname, {
    all: true,
    verbatim: false,
  });

  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));
}

export async function resolveAndValidateHostname(
  hostname: string,
  options: FeedSecurityOptions = {}
): Promise<ResolvedAddress[]> {
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;
  const addresses = await resolveHostname(hostname);

  if (addresses.length === 0) {
    throw new FeedSecurityError('Feed URL hostname did not resolve.');
  }

  for (const { address } of addresses) {
    assertAddressAllowed(address, options);
  }

  return addresses;
}

export function validateFeedUrlShape(feedUrl: string): URL {
  const trimmed = feedUrl.trim();

  if (!isValidFeedUrl(trimmed)) {
    throw new FeedSecurityError('Invalid feed URL. Only HTTP and HTTPS URLs are allowed.');
  }

  return new URL(trimmed);
}

export async function validateFeedUrlForFetch(
  feedUrl: string | URL,
  options: FeedSecurityOptions = {}
): Promise<URL> {
  const url = typeof feedUrl === 'string' ? validateFeedUrlShape(feedUrl) : validateFeedUrlShape(feedUrl.href);
  await resolveAndValidateHostname(url.hostname, options);

  return url;
}

export async function validateFeedRedirectUrl(
  currentUrl: URL,
  location: string,
  options: FeedSecurityOptions = {}
): Promise<URL> {
  let redirectUrl: URL;

  try {
    redirectUrl = new URL(location, currentUrl);
  } catch {
    throw new FeedSecurityError('Feed redirect target is not a valid URL.');
  }

  return validateFeedUrlForFetch(redirectUrl, options);
}
