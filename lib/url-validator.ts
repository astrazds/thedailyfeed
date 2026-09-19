/**
 * URL validation utilities to prevent SSRF and invalid URLs
 */

import { isIP } from 'node:net';

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

function ipv4FromGroups(high: number, low: number): string {
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

function canonicalizeIPv6(hostname: string): string | null {
  const stripped = hostname.replace(/^\[|\]$/g, '');
  if (isIP(stripped) !== 6) {
    return null;
  }

  try {
    return new URL(`http://[${stripped}]`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return stripped.toLowerCase();
  }
}

function parseIPv6Groups(address: string): number[] | null {
  const stripped = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (!stripped.includes(':')) {
    return null;
  }

  let head = stripped;
  let ipv4Tail: number | null = null;
  const lastColon = stripped.lastIndexOf(':');
  const afterColon = stripped.slice(lastColon + 1);
  if (afterColon.includes('.')) {
    ipv4Tail = parseIPv4Address(afterColon);
    if (ipv4Tail === null) {
      return null;
    }
    head = stripped.slice(0, lastColon);
  }

  const doubleColonCount = head.split('::').length - 1;
  if (doubleColonCount > 1) {
    return null;
  }

  const [left = '', right = ''] = head.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const ipv4Groups = ipv4Tail === null ? 0 : 2;
  const present = leftParts.length + rightParts.length + ipv4Groups;

  if (doubleColonCount === 0 && present !== 8) {
    return null;
  }

  const missing = 8 - present;
  if (doubleColonCount === 1 && missing < 1) {
    return null;
  }

  const zeroFill = doubleColonCount === 1 ? Array(missing).fill('0') : [];
  const parts = [...leftParts, ...zeroFill, ...rightParts];
  if (ipv4Tail !== null) {
    parts.push(((ipv4Tail >>> 16) & 0xffff).toString(16), (ipv4Tail & 0xffff).toString(16));
  }

  if (parts.length !== 8) {
    return null;
  }

  const groups = parts.map((part) => Number.parseInt(part, 16));
  if (groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }

  return groups;
}

function embeddedIPv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return ipv4FromGroups(g6, g7);
  }

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return ipv4FromGroups(g6, g7);
  }

  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return ipv4FromGroups(g6, g7);
  }

  if (g0 === 0x2002) {
    return ipv4FromGroups(g1, g2);
  }

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return ipv4FromGroups(g6, g7);
  }

  return null;
}

function isNativeSpecialUseIPv6(groups: number[]): boolean {
  const [g0, g1] = groups;

  if (groups.every((group) => group === 0)) {
    return true;
  }

  if (g0 === 0 && g1 === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
    return true;
  }

  if ((g0 & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((g0 & 0xffc0) === 0xfe80) {
    return true;
  }

  if (g0 === 0x2001 && g1 === 0xdb8) {
    return true;
  }

  if ((g0 & 0xff00) === 0xff00) {
    return true;
  }

  if ((g0 & 0xffc0) === 0xfec0) {
    return true;
  }

  return false;
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

export function isPrivateOrLocalIPv6(hostname: string): boolean {
  const canonical = canonicalizeIPv6(hostname);
  if (!canonical) {
    return false;
  }

  const groups = parseIPv6Groups(canonical);
  if (!groups) {
    return false;
  }

  if (isNativeSpecialUseIPv6(groups)) {
    return true;
  }

  const mapped = embeddedIPv4(groups);
  return mapped !== null && isPrivateOrLocalIPv4(mapped);
}

export function isDisallowedContentDestination(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  return isPrivateOrLocalIPv4(normalized) || isPrivateOrLocalIPv6(normalized);
}

export function shouldBlockPrivateNetworks(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.ALLOW_PRIVATE_NETWORKS !== 'true';
}

export function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    if (shouldBlockPrivateNetworks()) {
      const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
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
