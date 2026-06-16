/**
 * Simple in-memory rate limiter for Edge Functions.
 *
 * Uses a sliding window counter per key (typically userId or IP).
 * Since Edge Functions are stateless, this protects against burst abuse
 * within a single function invocation lifecycle.
 *
 * For persistent rate limiting across invocations, a database-backed
 * approach with a rate_limits table would be needed.
 */

// In-memory store: key → { count, windowStart }
const _store = new Map<string, { count: number; windowStart: number }>();

// Auto-cleanup old entries every 60 seconds
const CLEANUP_INTERVAL = 60_000;
let _lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - _lastCleanup < CLEANUP_INTERVAL) return;
  _lastCleanup = now;
  for (const [key, entry] of _store.entries()) {
    if (now - entry.windowStart > windowMs * 2) {
      _store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check if a request is within rate limits.
 *
 * @param key       Unique identifier (e.g., userId, IP)
 * @param maxRequests Maximum requests allowed in the window
 * @param windowMs    Window duration in milliseconds
 * @returns RateLimitResult
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup(windowMs);

  const now = Date.now();
  const entry = _store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    _store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Build a 429 response for rate-limited requests.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfterMs: result.retryAfterMs,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
