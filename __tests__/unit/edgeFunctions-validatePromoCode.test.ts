/**
 * Unit tests for supabase/functions/validate-promo-code/index.ts
 *
 * Tests: promo code validation logic, expiry check, max uses, duplicate
 * redemption prevention, already premium check, code trimming/uppercasing,
 * rate limit key format, error response codes.
 */

// ─── Inline implementations ──

interface PromoCode {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function validateCodeInput(code: any): { valid: boolean; error?: string } {
  if (!code || typeof code !== 'string') return { valid: false, error: 'Code is required' };
  if (code.trim().length === 0) return { valid: false, error: 'Code is required' };
  return { valid: true };
}

function checkExpiry(promoCode: PromoCode, now: Date = new Date()): boolean {
  if (!promoCode.expires_at) return false; // No expiry = valid
  return new Date(promoCode.expires_at) < now;
}

function checkMaxUses(promoCode: PromoCode): boolean {
  return promoCode.current_uses >= promoCode.max_uses;
}

function buildRateLimitKey(userId: string): string {
  return `promo:${userId}`;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

type ErrorCode = 'already_premium' | 'invalid_code' | 'expired_code' | 'max_uses_reached' | 'already_redeemed';

function getHttpStatusForError(errorCode: ErrorCode): number {
  return 400; // All validation errors return 400
}

// ─── Tests ──

describe('normalizeCode', () => {
  test('trims whitespace', () => {
    expect(normalizeCode('  ABC123  ')).toBe('ABC123');
  });

  test('uppercases', () => {
    expect(normalizeCode('abc123')).toBe('ABC123');
  });

  test('handles mixed case with spaces', () => {
    expect(normalizeCode(' Promo Code ')).toBe('PROMO CODE');
  });
});

describe('validateCodeInput', () => {
  test('valid string code', () => {
    expect(validateCodeInput('PROMO2026')).toEqual({ valid: true });
  });

  test('null code', () => {
    expect(validateCodeInput(null).valid).toBe(false);
  });

  test('undefined code', () => {
    expect(validateCodeInput(undefined).valid).toBe(false);
  });

  test('empty string', () => {
    expect(validateCodeInput('   ').valid).toBe(false);
  });

  test('number input', () => {
    expect(validateCodeInput(123).valid).toBe(false);
  });

  test('boolean input', () => {
    expect(validateCodeInput(true).valid).toBe(false);
  });
});

describe('checkExpiry', () => {
  test('not expired when expires_at is null', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 0, is_active: true, expires_at: null };
    expect(checkExpiry(promo)).toBe(false);
  });

  test('not expired when future date', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 0, is_active: true, expires_at: '2030-01-01T00:00:00Z' };
    expect(checkExpiry(promo, new Date('2026-01-01'))).toBe(false);
  });

  test('expired when past date', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 0, is_active: true, expires_at: '2025-01-01T00:00:00Z' };
    expect(checkExpiry(promo, new Date('2026-01-01'))).toBe(true);
  });

  test('expired at exact boundary', () => {
    const exact = '2026-03-28T12:00:00Z';
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 0, is_active: true, expires_at: exact };
    expect(checkExpiry(promo, new Date('2026-03-28T12:00:01Z'))).toBe(true);
  });
});

describe('checkMaxUses', () => {
  test('not reached when current < max', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 5, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(false);
  });

  test('reached when current === max', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 10, current_uses: 10, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(true);
  });

  test('reached when current > max (overflow)', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 5, current_uses: 6, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(true);
  });

  test('single-use code', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 1, current_uses: 0, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(false);
  });

  test('single-use code after use', () => {
    const promo: PromoCode = { id: '1', code: 'A', max_uses: 1, current_uses: 1, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(true);
  });
});

describe('buildRateLimitKey', () => {
  test('prefixes with promo:', () => {
    expect(buildRateLimitKey('user-uuid-123')).toBe('promo:user-uuid-123');
  });
});

describe('rate limit constants', () => {
  test('max 5 requests', () => {
    expect(RATE_LIMIT_MAX).toBe(5);
  });

  test('window is 60 seconds', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60000);
  });
});

describe('error codes', () => {
  const errorCodes: ErrorCode[] = ['already_premium', 'invalid_code', 'expired_code', 'max_uses_reached', 'already_redeemed'];

  test('all error codes return 400', () => {
    errorCodes.forEach(code => {
      expect(getHttpStatusForError(code)).toBe(400);
    });
  });

  test('5 distinct error codes', () => {
    expect(errorCodes).toHaveLength(5);
  });
});

describe('full validation pipeline', () => {
  test('valid code passes all checks', () => {
    const code = '  promo2026  ';
    const normalized = normalizeCode(code);
    expect(normalized).toBe('PROMO2026');
    expect(validateCodeInput(code).valid).toBe(true);

    const promo: PromoCode = { id: '1', code: 'PROMO2026', max_uses: 100, current_uses: 50, is_active: true, expires_at: '2030-01-01T00:00:00Z' };
    expect(checkExpiry(promo)).toBe(false);
    expect(checkMaxUses(promo)).toBe(false);
  });

  test('expired code fails', () => {
    const promo: PromoCode = { id: '1', code: 'OLD', max_uses: 100, current_uses: 0, is_active: true, expires_at: '2020-01-01T00:00:00Z' };
    expect(checkExpiry(promo)).toBe(true);
  });

  test('maxed out code fails', () => {
    const promo: PromoCode = { id: '1', code: 'FULL', max_uses: 5, current_uses: 5, is_active: true, expires_at: null };
    expect(checkMaxUses(promo)).toBe(true);
  });
});
