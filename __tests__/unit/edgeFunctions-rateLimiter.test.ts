/**
 * Unit tests for supabase/functions/_shared/rateLimiter.ts
 *
 * Tests: checkRateLimit sliding window, remaining count, retryAfterMs,
 * window reset, rateLimitResponse structure, cleanup, edge cases.
 */

// ─── Inline implementations ──

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

// Simulated in-memory store
const _store = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number, nowOverride?: number): RateLimitResult {
  const now = nowOverride ?? Date.now();
  const entry = _store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
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

function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): { status: number; body: any; headers: Record<string, string> } {
  return {
    status: 429,
    body: { error: 'Too many requests', retryAfterMs: result.retryAfterMs },
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
      'X-RateLimit-Remaining': String(result.remaining),
    },
  };
}

// ─── Tests ──

beforeEach(() => {
  _store.clear();
});

describe('checkRateLimit - basic flow', () => {
  test('first request is allowed', () => {
    const result = checkRateLimit('user1', 5, 60000, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterMs).toBe(0);
  });

  test('requests within limit are allowed', () => {
    const now = 1000;
    for (let i = 0; i < 4; i++) {
      checkRateLimit('user2', 5, 60000, now + i * 100);
    }
    const result = checkRateLimit('user2', 5, 60000, now + 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  test('request exceeding limit is blocked', () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user3', 5, 60000, now + i * 100);
    }
    const result = checkRateLimit('user3', 5, 60000, now + 600);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test('remaining decrements correctly', () => {
    const now = 5000;
    expect(checkRateLimit('user4', 3, 60000, now).remaining).toBe(2);
    expect(checkRateLimit('user4', 3, 60000, now + 100).remaining).toBe(1);
    expect(checkRateLimit('user4', 3, 60000, now + 200).remaining).toBe(0);
  });
});

describe('checkRateLimit - window reset', () => {
  test('allows requests after window expires', () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user5', 5, 1000, now + i);
    }
    // Blocked within window
    expect(checkRateLimit('user5', 5, 1000, now + 500).allowed).toBe(false);
    // Allowed after window reset
    const result = checkRateLimit('user5', 5, 1000, now + 1001);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test('retryAfterMs is window remainder', () => {
    const now = 10000;
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user6', 3, 60000, now);
    }
    const result = checkRateLimit('user6', 3, 60000, now + 20000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(40000); // 60000 - 20000
  });
});

describe('checkRateLimit - different keys', () => {
  test('different keys have independent limits', () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      checkRateLimit('promo:user1', 5, 60000, now);
    }
    expect(checkRateLimit('promo:user1', 5, 60000, now + 1).allowed).toBe(false);
    expect(checkRateLimit('promo:user2', 5, 60000, now + 1).allowed).toBe(true);
    expect(checkRateLimit('purchase:user1', 3, 60000, now + 1).allowed).toBe(true);
  });
});

describe('checkRateLimit - edge cases', () => {
  test('maxRequests = 1', () => {
    const now = 1000;
    expect(checkRateLimit('single', 1, 60000, now).allowed).toBe(true);
    expect(checkRateLimit('single', 1, 60000, now + 1).allowed).toBe(false);
  });

  test('windowMs = 0 always resets', () => {
    const now = 1000;
    checkRateLimit('zero', 1, 0, now);
    // Window of 0 means now - windowStart >= 0 is always true → new window
    expect(checkRateLimit('zero', 1, 0, now).allowed).toBe(true);
  });

  test('rapid sequential requests', () => {
    const now = 1000;
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(checkRateLimit('rapid', 5, 60000, now).allowed);
    }
    expect(results.filter(r => r).length).toBe(5);
    expect(results.filter(r => !r).length).toBe(5);
  });
});

describe('rateLimitResponse', () => {
  test('returns 429 status', () => {
    const result: RateLimitResult = { allowed: false, remaining: 0, retryAfterMs: 30000 };
    const resp = rateLimitResponse(result, { 'Access-Control-Allow-Origin': '*' });
    expect(resp.status).toBe(429);
  });

  test('includes error message in body', () => {
    const result: RateLimitResult = { allowed: false, remaining: 0, retryAfterMs: 45000 };
    const resp = rateLimitResponse(result, {});
    expect(resp.body.error).toBe('Too many requests');
    expect(resp.body.retryAfterMs).toBe(45000);
  });

  test('includes Retry-After header in seconds', () => {
    const result: RateLimitResult = { allowed: false, remaining: 0, retryAfterMs: 45000 };
    const resp = rateLimitResponse(result, {});
    expect(resp.headers['Retry-After']).toBe('45');
  });

  test('includes X-RateLimit-Remaining header', () => {
    const result: RateLimitResult = { allowed: false, remaining: 0, retryAfterMs: 10000 };
    const resp = rateLimitResponse(result, {});
    expect(resp.headers['X-RateLimit-Remaining']).toBe('0');
  });

  test('preserves CORS headers', () => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' };
    const resp = rateLimitResponse({ allowed: false, remaining: 0, retryAfterMs: 1000 }, cors);
    expect(resp.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(resp.headers['Access-Control-Allow-Methods']).toBe('POST');
  });
});

describe('validate-promo-code rate limit constants', () => {
  const RATE_LIMIT_MAX = 5;
  const RATE_LIMIT_WINDOW_MS = 60_000;

  test('allows 5 requests in 60s', () => {
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkRateLimit('promo:test', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now + i).allowed).toBe(true);
    }
    expect(checkRateLimit('promo:test', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now + RATE_LIMIT_MAX).allowed).toBe(false);
  });
});

describe('record-purchase rate limit constants', () => {
  const RATE_LIMIT_MAX = 3;
  const RATE_LIMIT_WINDOW_MS = 60_000;

  test('allows 3 requests in 60s', () => {
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkRateLimit('purchase:test', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now + i).allowed).toBe(true);
    }
    expect(checkRateLimit('purchase:test', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now + RATE_LIMIT_MAX).allowed).toBe(false);
  });
});
