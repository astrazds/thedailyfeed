interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

export function getRemainingRequests(identifier: string, maxRequests: number = 10): number {
  const entry = rateLimitMap.get(identifier);
  if (!entry || Date.now() > entry.resetAt) {
    return maxRequests;
  }
  return Math.max(0, maxRequests - entry.count);
}

export function getRateLimitResetTime(identifier: string): number {
  const entry = rateLimitMap.get(identifier);
  return entry?.resetAt || Date.now();
}

export function clearRateLimitState(): void {
  rateLimitMap.clear();
}

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

if (typeof window === 'undefined') {
  const cleanupTimer = setInterval(cleanupExpiredEntries, 60000);
  cleanupTimer.unref?.();
}
