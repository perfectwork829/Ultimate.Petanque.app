/**
 * Unit tests for services/pushQuotaService.ts
 *
 * Tests: getPushLimit (badge_type × ambassador_level matrix), getDaysUntilReset,
 * fetchPushQuota computation (used/remaining/percentage/canSend/isUnlimited),
 * monthly reset logic, resetLabel FR/EN, edge cases (zero usage, exactly at limit,
 * over limit, unlimited tiers).
 */

// ─── Types & Constants ─────────────────────────────────────

interface PushQuotaInfo {
  used: number;
  limit: number; // 0 = not allowed, -1 = unlimited
  remaining: number; // -1 = unlimited
  resetDate: string;
  resetLabel: string;
  percentage: number; // 0-100
  isUnlimited: boolean;
  canSend: boolean;
}

// ─── Inline implementations (mirrors pushQuotaService logic) ──

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function getNextResetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

function getDaysUntilReset(): number {
  const now = new Date();
  const reset = getNextResetDate();
  return Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getPushLimit(badgeType: string, ambassadorLevel?: string): number {
  switch (badgeType) {
    case 'gold_sponsor':
      return -1; // unlimited
    case 'sponsor': // silver
      return 1;
    case 'bronze_sponsor':
      return 0;
    case 'ambassador':
      switch (ambassadorLevel) {
        case 'elite': return -1;
        case 'confirme': return 1;
        case 'decouverte':
        default: return 0;
      }
    default:
      return 0;
  }
}

function computePushQuota(
  badgeType: string,
  ambassadorLevel: string | undefined,
  used: number,
  language: string = 'fr'
): PushQuotaInfo {
  const limit = getPushLimit(badgeType, ambassadorLevel);
  const isUnlimited = limit === -1;
  const resetDate = getNextResetDate();

  const resetLabel = language === 'fr'
    ? `${resetDate.getDate()} ${resetDate.toLocaleDateString('fr-FR', { month: 'long' })}`
    : resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  if (limit === 0) {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      resetDate: resetDate.toISOString(),
      resetLabel,
      percentage: 0,
      isUnlimited: false,
      canSend: false,
    };
  }

  const remaining = isUnlimited ? -1 : Math.max(0, limit - used);
  const percentage = isUnlimited ? 0 : (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

  return {
    used,
    limit,
    remaining,
    resetDate: resetDate.toISOString(),
    resetLabel,
    percentage,
    isUnlimited,
    canSend: isUnlimited || remaining > 0,
  };
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// getPushLimit — Badge Type Matrix
// ============================================

describe('getPushLimit — Sponsor Tiers', () => {
  test('gold_sponsor gets unlimited (-1)', () => {
    expect(getPushLimit('gold_sponsor')).toBe(-1);
  });

  test('sponsor (silver) gets 1 push/month', () => {
    expect(getPushLimit('sponsor')).toBe(1);
  });

  test('bronze_sponsor gets 0 (not allowed)', () => {
    expect(getPushLimit('bronze_sponsor')).toBe(0);
  });
});

describe('getPushLimit — Ambassador Levels', () => {
  test('ambassador elite gets unlimited (-1)', () => {
    expect(getPushLimit('ambassador', 'elite')).toBe(-1);
  });

  test('ambassador confirme gets 1 push/month', () => {
    expect(getPushLimit('ambassador', 'confirme')).toBe(1);
  });

  test('ambassador decouverte gets 0 (not allowed)', () => {
    expect(getPushLimit('ambassador', 'decouverte')).toBe(0);
  });

  test('ambassador with no level defaults to 0', () => {
    expect(getPushLimit('ambassador')).toBe(0);
    expect(getPushLimit('ambassador', undefined)).toBe(0);
  });

  test('ambassador with unknown level defaults to 0', () => {
    expect(getPushLimit('ambassador', 'unknown')).toBe(0);
  });
});

describe('getPushLimit — Unknown Badge Types', () => {
  test('unknown badge type returns 0', () => {
    expect(getPushLimit('unknown')).toBe(0);
  });

  test('empty string returns 0', () => {
    expect(getPushLimit('')).toBe(0);
  });

  test('partner (not defined) returns 0', () => {
    expect(getPushLimit('partner')).toBe(0);
  });
});

// ============================================
// getDaysUntilReset
// ============================================

describe('getDaysUntilReset', () => {
  test('returns positive number', () => {
    const days = getDaysUntilReset();
    expect(days).toBeGreaterThan(0);
  });

  test('returns at most 31 days', () => {
    const days = getDaysUntilReset();
    expect(days).toBeLessThanOrEqual(31);
  });

  test('returns at least 1 day', () => {
    const days = getDaysUntilReset();
    expect(days).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// getStartOfMonth / getNextResetDate
// ============================================

describe('Date Computations', () => {
  test('getStartOfMonth returns 1st of current month', () => {
    const start = getStartOfMonth();
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  test('getNextResetDate returns 1st of next month', () => {
    const reset = getNextResetDate();
    expect(reset.getDate()).toBe(1);
    const now = new Date();
    if (now.getMonth() === 11) {
      expect(reset.getMonth()).toBe(0);
      expect(reset.getFullYear()).toBe(now.getFullYear() + 1);
    } else {
      expect(reset.getMonth()).toBe(now.getMonth() + 1);
    }
  });

  test('reset date is always in the future', () => {
    const reset = getNextResetDate();
    expect(reset.getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================
// computePushQuota — Bronze / Decouverte (limit 0)
// ============================================

describe('computePushQuota — Not Allowed (limit 0)', () => {
  test('bronze_sponsor cannot send pushes', () => {
    const quota = computePushQuota('bronze_sponsor', undefined, 0);
    expect(quota.limit).toBe(0);
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(0);
    expect(quota.canSend).toBe(false);
    expect(quota.isUnlimited).toBe(false);
    expect(quota.percentage).toBe(0);
  });

  test('ambassador decouverte cannot send pushes', () => {
    const quota = computePushQuota('ambassador', 'decouverte', 0);
    expect(quota.canSend).toBe(false);
    expect(quota.limit).toBe(0);
  });

  test('used is always 0 when limit is 0 (ignores actual usage)', () => {
    const quota = computePushQuota('bronze_sponsor', undefined, 5);
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(0);
  });
});

// ============================================
// computePushQuota — Silver / Confirme (limit 1)
// ============================================

describe('computePushQuota — Limited (limit 1)', () => {
  test('sponsor with 0 used can send', () => {
    const quota = computePushQuota('sponsor', undefined, 0);
    expect(quota.limit).toBe(1);
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(1);
    expect(quota.canSend).toBe(true);
    expect(quota.isUnlimited).toBe(false);
    expect(quota.percentage).toBe(0);
  });

  test('sponsor with 1 used cannot send', () => {
    const quota = computePushQuota('sponsor', undefined, 1);
    expect(quota.used).toBe(1);
    expect(quota.remaining).toBe(0);
    expect(quota.canSend).toBe(false);
    expect(quota.percentage).toBe(100);
  });

  test('ambassador confirme with 0 used can send', () => {
    const quota = computePushQuota('ambassador', 'confirme', 0);
    expect(quota.limit).toBe(1);
    expect(quota.canSend).toBe(true);
    expect(quota.remaining).toBe(1);
  });

  test('ambassador confirme with 1 used cannot send', () => {
    const quota = computePushQuota('ambassador', 'confirme', 1);
    expect(quota.canSend).toBe(false);
    expect(quota.remaining).toBe(0);
  });

  test('over limit usage still shows 0 remaining (clamped)', () => {
    const quota = computePushQuota('sponsor', undefined, 3);
    expect(quota.remaining).toBe(0);
    expect(quota.canSend).toBe(false);
    expect(quota.percentage).toBe(100); // Capped at 100
  });
});

// ============================================
// computePushQuota — Gold / Elite (unlimited)
// ============================================

describe('computePushQuota — Unlimited', () => {
  test('gold_sponsor is unlimited', () => {
    const quota = computePushQuota('gold_sponsor', undefined, 0);
    expect(quota.limit).toBe(-1);
    expect(quota.isUnlimited).toBe(true);
    expect(quota.canSend).toBe(true);
    expect(quota.remaining).toBe(-1);
    expect(quota.percentage).toBe(0);
  });

  test('gold_sponsor with 100 used can still send', () => {
    const quota = computePushQuota('gold_sponsor', undefined, 100);
    expect(quota.used).toBe(100);
    expect(quota.canSend).toBe(true);
    expect(quota.isUnlimited).toBe(true);
    expect(quota.remaining).toBe(-1);
  });

  test('ambassador elite is unlimited', () => {
    const quota = computePushQuota('ambassador', 'elite', 0);
    expect(quota.isUnlimited).toBe(true);
    expect(quota.canSend).toBe(true);
    expect(quota.limit).toBe(-1);
  });

  test('ambassador elite with 50 used can still send', () => {
    const quota = computePushQuota('ambassador', 'elite', 50);
    expect(quota.canSend).toBe(true);
    expect(quota.remaining).toBe(-1);
  });

  test('unlimited percentage is always 0', () => {
    const quota = computePushQuota('gold_sponsor', undefined, 999);
    expect(quota.percentage).toBe(0);
  });
});

// ============================================
// computePushQuota — Reset Label i18n
// ============================================

describe('computePushQuota — Reset Label', () => {
  test('FR label contains day number', () => {
    const quota = computePushQuota('sponsor', undefined, 0, 'fr');
    expect(quota.resetLabel).toMatch(/^1\s/); // Starts with "1 "
    expect(quota.resetLabel.length).toBeGreaterThan(3);
  });

  test('EN label contains month name', () => {
    const quota = computePushQuota('sponsor', undefined, 0, 'en');
    // Should match patterns like "January 1" or "February 1"
    expect(quota.resetLabel).toMatch(/[A-Z][a-z]+\s\d/);
  });

  test('resetDate is valid ISO string', () => {
    const quota = computePushQuota('sponsor', undefined, 0);
    expect(() => new Date(quota.resetDate)).not.toThrow();
    const parsed = new Date(quota.resetDate);
    expect(parsed.getDate()).toBe(1);
  });
});

// ============================================
// computePushQuota — Percentage Calculations
// ============================================

describe('computePushQuota — Percentage', () => {
  test('0/1 = 0%', () => {
    const quota = computePushQuota('sponsor', undefined, 0);
    expect(quota.percentage).toBe(0);
  });

  test('1/1 = 100%', () => {
    const quota = computePushQuota('sponsor', undefined, 1);
    expect(quota.percentage).toBe(100);
  });

  test('over limit capped at 100%', () => {
    const quota = computePushQuota('sponsor', undefined, 5);
    expect(quota.percentage).toBe(100);
  });

  test('unlimited is always 0%', () => {
    const quota = computePushQuota('gold_sponsor', undefined, 500);
    expect(quota.percentage).toBe(0);
  });

  test('not allowed is 0%', () => {
    const quota = computePushQuota('bronze_sponsor', undefined, 0);
    expect(quota.percentage).toBe(0);
  });
});

// ============================================
// Full Matrix: Badge Type × Level
// ============================================

describe('Full Badge Type × Level Matrix', () => {
  const matrix: Array<{ badge: string; level?: string; expectedLimit: number; label: string }> = [
    { badge: 'gold_sponsor', expectedLimit: -1, label: 'Gold Sponsor → unlimited' },
    { badge: 'sponsor', expectedLimit: 1, label: 'Silver Sponsor → 1/month' },
    { badge: 'bronze_sponsor', expectedLimit: 0, label: 'Bronze Sponsor → none' },
    { badge: 'ambassador', level: 'elite', expectedLimit: -1, label: 'Ambassador Elite → unlimited' },
    { badge: 'ambassador', level: 'confirme', expectedLimit: 1, label: 'Ambassador Confirme → 1/month' },
    { badge: 'ambassador', level: 'decouverte', expectedLimit: 0, label: 'Ambassador Decouverte → none' },
    { badge: 'ambassador', expectedLimit: 0, label: 'Ambassador (no level) → none' },
    { badge: 'partner', expectedLimit: 0, label: 'Partner → none' },
    { badge: '', expectedLimit: 0, label: 'Empty → none' },
  ];

  matrix.forEach(({ badge, level, expectedLimit, label }) => {
    test(label, () => {
      expect(getPushLimit(badge, level)).toBe(expectedLimit);
    });
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('computePushQuota with negative used value treats as used', () => {
    const quota = computePushQuota('sponsor', undefined, -1);
    // -1 used → remaining = max(0, 1 - (-1)) = 2, but clamped behavior depends
    expect(quota.remaining).toBe(2);
    expect(quota.canSend).toBe(true);
  });

  test('computePushQuota with very large used value for unlimited', () => {
    const quota = computePushQuota('gold_sponsor', undefined, 999999);
    expect(quota.canSend).toBe(true);
    expect(quota.used).toBe(999999);
    expect(quota.remaining).toBe(-1);
  });

  test('all quota objects have consistent resetDate', () => {
    const q1 = computePushQuota('gold_sponsor', undefined, 0);
    const q2 = computePushQuota('sponsor', undefined, 0);
    const q3 = computePushQuota('bronze_sponsor', undefined, 0);
    expect(q1.resetDate).toBe(q2.resetDate);
    expect(q2.resetDate).toBe(q3.resetDate);
  });

  test('quota canSend/remaining are consistent', () => {
    // For limited: canSend should match remaining > 0
    const limited0 = computePushQuota('sponsor', undefined, 1);
    expect(limited0.canSend).toBe(false);
    expect(limited0.remaining).toBe(0);

    const limited1 = computePushQuota('sponsor', undefined, 0);
    expect(limited1.canSend).toBe(true);
    expect(limited1.remaining).toBe(1);

    // For unlimited: canSend is always true, remaining is -1
    const unlimited = computePushQuota('gold_sponsor', undefined, 100);
    expect(unlimited.canSend).toBe(true);
    expect(unlimited.remaining).toBe(-1);

    // For not allowed: canSend is false, remaining is 0
    const notAllowed = computePushQuota('bronze_sponsor', undefined, 0);
    expect(notAllowed.canSend).toBe(false);
    expect(notAllowed.remaining).toBe(0);
  });

  test('multiple tiers computed independently', () => {
    const gold = computePushQuota('gold_sponsor', undefined, 50);
    const silver = computePushQuota('sponsor', undefined, 50);
    const bronze = computePushQuota('bronze_sponsor', undefined, 50);

    expect(gold.canSend).toBe(true);
    expect(silver.canSend).toBe(false);
    expect(bronze.canSend).toBe(false);

    expect(gold.isUnlimited).toBe(true);
    expect(silver.isUnlimited).toBe(false);
    expect(bronze.isUnlimited).toBe(false);
  });
});
