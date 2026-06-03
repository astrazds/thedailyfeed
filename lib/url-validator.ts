/**
 * URL validation utilities to prevent SSRF and invalid URLs
 */

export function isPrivateOrLocalIPv4(hostname: string): boolean {
  return (
    hostname === '0.0.0.0' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('172.17.') ||
    hostname.startsWith('172.18.') ||
    hostname.startsWith('172.19.') ||
    hostname.startsWith('172.20.') ||
    hostname.startsWith('172.21.') ||
    hostname.startsWith('172.22.') ||
    hostname.startsWith('172.23.') ||
    hostname.startsWith('172.24.') ||
    hostname.startsWith('172.25.') ||
    hostname.startsWith('172.26.') ||
    hostname.startsWith('172.27.') ||
    hostname.startsWith('172.28.') ||
    hostname.startsWith('172.29.') ||
    hostname.startsWith('172.30.') ||
    hostname.startsWith('172.31.') ||
    hostname.startsWith('169.254.')
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
