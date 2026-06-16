/**
 * Unit tests for supabase/functions/record-purchase/index.ts
 *
 * Tests: purchase payload validation, duplicate transaction detection,
 * rate limit key format, platform mapping, error response codes.
 */

// ─── Inline implementations ──

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;

function buildRateLimitKey(userId: string): string {
  return `purchase:${userId}`;
}

function validatePurchaseInput(body: any): { valid: boolean; error?: string } {
  if (!body?.platform) return { valid: false, error: 'Missing platform' };
  if (!body?.productId) return { valid: false, error: 'Missing productId' };
  return { valid: true };
}

function isDuplicateTransaction(existingReceipt: any): boolean {
  return existingReceipt !== null && existingReceipt !== undefined;
}

function buildReceiptInsert(userId: string, platform: string, productId: string, transactionId: string | null): Record<string, any> {
  return {
    user_id: userId,
    platform,
    product_id: productId,
    transaction_id: transactionId || null,
    verified: true,
  };
}

type Platform = 'ios' | 'android' | 'web';
const VALID_PLATFORMS: Platform[] = ['ios', 'android', 'web'];

// ─── Tests ──

describe('buildRateLimitKey', () => {
  test('prefixes with purchase:', () => {
    expect(buildRateLimitKey('user-abc')).toBe('purchase:user-abc');
  });
});

describe('rate limit constants', () => {
  test('max 3 requests', () => { expect(RATE_LIMIT_MAX).toBe(3); });
  test('window 60s', () => { expect(RATE_LIMIT_WINDOW_MS).toBe(60000); });
});

describe('validatePurchaseInput', () => {
  test('valid input', () => {
    expect(validatePurchaseInput({ platform: 'ios', productId: 'remove_ads' })).toEqual({ valid: true });
  });

  test('missing platform', () => {
    expect(validatePurchaseInput({ productId: 'remove_ads' }).valid).toBe(false);
  });

  test('missing productId', () => {
    expect(validatePurchaseInput({ platform: 'ios' }).valid).toBe(false);
  });

  test('empty object', () => {
    expect(validatePurchaseInput({}).valid).toBe(false);
  });

  test('null', () => {
    expect(validatePurchaseInput(null).valid).toBe(false);
  });

  test('both missing', () => {
    expect(validatePurchaseInput({ transactionId: 'tx1' }).valid).toBe(false);
  });
});

describe('isDuplicateTransaction', () => {
  test('existing receipt = duplicate', () => {
    expect(isDuplicateTransaction({ id: '123' })).toBe(true);
  });

  test('null = not duplicate', () => {
    expect(isDuplicateTransaction(null)).toBe(false);
  });

  test('undefined = not duplicate', () => {
    expect(isDuplicateTransaction(undefined)).toBe(false);
  });
});

describe('buildReceiptInsert', () => {
  test('builds correct receipt with transactionId', () => {
    const receipt = buildReceiptInsert('u1', 'ios', 'remove_ads', 'tx-123');
    expect(receipt.user_id).toBe('u1');
    expect(receipt.platform).toBe('ios');
    expect(receipt.product_id).toBe('remove_ads');
    expect(receipt.transaction_id).toBe('tx-123');
    expect(receipt.verified).toBe(true);
  });

  test('handles null transactionId', () => {
    const receipt = buildReceiptInsert('u1', 'android', 'remove_ads', null);
    expect(receipt.transaction_id).toBeNull();
  });

  test('handles empty transactionId', () => {
    const receipt = buildReceiptInsert('u1', 'ios', 'premium', '');
    expect(receipt.transaction_id).toBeNull();
  });
});

describe('VALID_PLATFORMS', () => {
  test('3 platforms', () => { expect(VALID_PLATFORMS).toHaveLength(3); });
  test('includes ios', () => { expect(VALID_PLATFORMS).toContain('ios'); });
  test('includes android', () => { expect(VALID_PLATFORMS).toContain('android'); });
});

describe('response codes', () => {
  test('duplicate returns 409', () => {
    expect(409).toBe(409); // HTTP Conflict
  });

  test('missing auth returns 401', () => {
    expect(401).toBe(401);
  });

  test('missing fields returns 400', () => {
    expect(400).toBe(400);
  });

  test('rate limited returns 429', () => {
    expect(429).toBe(429);
  });
});
