/**
 * URL validation utilities to prevent SSRF and invalid URLs
 */

const NON_GLOBAL_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function parseIPv4Address(address: string): number | null {
  const parts = address.split('.');

  if (parts.length !== 4) {
    return null;
  }

  let value = 0;

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }

    const octet = Number.parseInt(part, 10);

    if (octet < 0 || octet > 255) {
      return null;
    }

    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function isIPv4InCidr(address: number, rangeBase: string, prefixLength: number): boolean {
  const base = parseIPv4Address(rangeBase);

  if (base === null) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (address & mask) === (base & mask);
}

export function isPrivateOrLocalIPv4(hostname: string): boolean {
  const address = parseIPv4Address(hostname);

  if (address === null) {
    return false;
  }

  return NON_GLOBAL_IPV4_RANGES.some(([rangeBase, prefixLength]) =>
    isIPv4InCidr(address, rangeBase, prefixLength)
  );
}

function parseHexIPv4MappedSuffix(suffix: string): string | null {
  const parts = suffix.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const [high, low] = parts.map((part) => Number.parseInt(part, 16));
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

function getIPv4MappedIPv6Address(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedPrefixes = ['::ffff:', '0:0:0:0:0:ffff:'];
  const prefix = mappedPrefixes.find((candidate) => normalized.startsWith(candidate));

  if (!prefix) {
    return null;
  }

  const suffix = normalized.slice(prefix.length);
  return suffix.includes('.') ? suffix : parseHexIPv4MappedSuffix(suffix);
}

export function isPrivateOrLocalIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (!normalized.includes(':')) {
    return false;
  }

  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  // RFC 4193 unique-local addresses fc00::/7
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // RFC 4291 link-local unicast fe80::/10
  if (/^fe[89ab]/.test(normalized)) {
    return true;
  }

  // RFC 3849 documentation addresses 2001:db8::/32
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') {
    return true;
  }

  // RFC 4291 multicast addresses ff00::/8
  if (normalized.startsWith('ff')) {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const mappedIPv4 = getIPv4MappedIPv6Address(normalized);
  if (mappedIPv4) {
    return isPrivateOrLocalIPv4(mappedIPv4);
  }

  return false;
}

export function shouldBlockPrivateNetworks(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.ALLOW_PRIVATE_NETWORKS !== 'true';
}

/**
 * Check if a URL is a valid HTTP/HTTPS feed URL
 */
export function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Prevent localhost/private IPs in production (SSRF Protection)
    // Note: If you are running in a restricted environment where the app must fetch
    // feeds from the same internal network, you can disable this check by setting
    // ALLOW_PRIVATE_NETWORKS=true in your environment variables.
    if (shouldBlockPrivateNetworks()) {
      const hostname = parsed.hostname.toLowerCase();
      
      // Block localhost
      if (hostname === 'localhost') {
        return false;
      }
      
      if (isPrivateOrLocalIPv4(hostname) || isPrivateOrLocalIPv6(hostname)) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalize a feed URL
 * Throws error if invalid
 */
export function validateAndNormalizeFeedUrl(url: string): string {
  const trimmed = url.trim();
  
  if (!trimmed) {
    throw new Error('Feed URL cannot be empty');
  }
  
  if (!isValidFeedUrl(trimmed)) {
    throw new Error('Invalid feed URL. Only HTTP and HTTPS URLs are allowed.');
  }
  
  return trimmed;
}
