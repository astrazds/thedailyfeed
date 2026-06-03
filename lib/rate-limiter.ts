/**
 * Simple in-memory rate limiter
 * Prevents API abuse by limiting requests per IP
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Check if request is within rate limit
 * @param identifier - Usually IP address
 * @param maxRequests - Maximum requests allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  // No entry or expired - allow and create new entry
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  // Check if limit exceeded
  if (entry.count >= maxRequests) {
    return false;
  }

  // Increment count and allow
  entry.count++;
  return true;
}

/**
 * Get remaining requests for identifier
 */
export function getRemainingRequests(identifier: string, maxRequests: number = 10): number {
  const entry = rateLimitMap.get(identifier);
  if (!entry || Date.now() > entry.resetAt) {
    return maxRequests;
  }
  return Math.max(0, maxRequests - entry.count);
}

/**
 * Get reset time for rate limit
 */
export function getRateLimitResetTime(identifier: string): number {
  const entry = rateLimitMap.get(identifier);
  return entry?.resetAt || Date.now();
}

export function clearRateLimitState(): void {
  rateLimitMap.clear();
}

/**
 * Cleanup expired entries periodically
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

// Cleanup every minute
if (typeof window === 'undefined') {
  const cleanupTimer = setInterval(cleanupExpiredEntries, 60000);
  cleanupTimer.unref?.();
}
