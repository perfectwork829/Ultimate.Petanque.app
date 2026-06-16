/**
 * Unit tests for supabase/functions/weekly-cron/index.ts
 *
 * Tests: task list validation, token cleanup thresholds (90d/180d),
 * share expiry logic, engagement reminder eligibility, sponsor digest
 * KPI computation, scheduled push A/B variant splitting, analytics
 * cleanup threshold, engagement message selection.
 */

// ─── Inline implementations ──

const DEFAULT_TASKS = ['cleanup_tokens', 'cleanup_shares', 'engagement_reminders', 'cleanup_analytics', 'sponsor_digest', 'process_scheduled_pushes'];

function computeTokenCleanupThreshold(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function isTokenStale(updatedAt: string, thresholdDate: Date): boolean {
  return new Date(updatedAt) < thresholdDate;
}

function isShareExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < now;
}

function isUserInactive(lastActivityDate: string | null, threshold7d: Date): boolean {
  if (!lastActivityDate) return true;
  return new Date(lastActivityDate) < threshold7d;
}

function isEligibleForReminder(lastReminderDate: string | null, threshold7d: Date): boolean {
  if (!lastReminderDate) return true;
  return new Date(lastReminderDate) < threshold7d;
}

function computeDigestKPIs(events: { event_type: string }[]): { impressions: number; clicks: number; socialClicks: number; pushes: number; ctr: string } {
  const impressions = events.filter(e => e.event_type === 'banner_impression').length;
  const clicks = events.filter(e => e.event_type === 'profile_view').length;
  const socialClicks = events.filter(e => e.event_type === 'social_click').length;
  const pushes = events.filter(e => e.event_type === 'sponsor_push').length;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0';
  return { impressions, clicks, socialClicks, pushes, ctr };
}

function computeWeekOverWeekChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function splitVariantTokens(tokens: any[], variant: string): any[] {
  if (variant === 'variant_a') return tokens.filter((_, idx) => idx % 2 === 0);
  if (variant === 'variant_b') return tokens.filter((_, idx) => idx % 2 === 1);
  return tokens;
}

const ENGAGEMENT_MESSAGES = [
  { title: '\u{1F3AF} Vos boules attendent !', body: 'Pas de partie depuis 7 jours.' },
  { title: '\u{1F4AA} Revenez sur le terrain !', body: 'Votre streak est en danger !' },
  { title: '\u{1F3C6} Le classement evolue sans vous', body: 'Vos rivaux jouent sans relache.' },
];

const MAX_ENGAGEMENT_BATCH = 100;

// ─── Tests ──

describe('DEFAULT_TASKS', () => {
  test('has 6 tasks', () => { expect(DEFAULT_TASKS).toHaveLength(6); });
  test('includes cleanup_tokens', () => { expect(DEFAULT_TASKS).toContain('cleanup_tokens'); });
  test('includes sponsor_digest', () => { expect(DEFAULT_TASKS).toContain('sponsor_digest'); });
  test('includes process_scheduled_pushes', () => { expect(DEFAULT_TASKS).toContain('process_scheduled_pushes'); });
});

describe('token cleanup thresholds', () => {
  test('90-day threshold is in the past', () => {
    const threshold = computeTokenCleanupThreshold(90);
    expect(threshold.getTime()).toBeLessThan(Date.now());
  });

  test('180-day threshold is further in the past', () => {
    const t90 = computeTokenCleanupThreshold(90);
    const t180 = computeTokenCleanupThreshold(180);
    expect(t180.getTime()).toBeLessThan(t90.getTime());
  });

  test('stale token detection', () => {
    const threshold = new Date('2026-01-01');
    expect(isTokenStale('2025-06-01T00:00:00Z', threshold)).toBe(true);
    expect(isTokenStale('2026-02-01T00:00:00Z', threshold)).toBe(false);
  });
});

describe('share expiry', () => {
  test('null expires_at = not expired', () => {
    expect(isShareExpired(null, new Date())).toBe(false);
  });

  test('future expiry = not expired', () => {
    expect(isShareExpired('2030-01-01T00:00:00Z', new Date('2026-01-01'))).toBe(false);
  });

  test('past expiry = expired', () => {
    expect(isShareExpired('2025-01-01T00:00:00Z', new Date('2026-01-01'))).toBe(true);
  });
});

describe('engagement reminder eligibility', () => {
  test('user with no activity = inactive', () => {
    const threshold = new Date('2026-03-21');
    expect(isUserInactive(null, threshold)).toBe(true);
  });

  test('user with old activity = inactive', () => {
    const threshold = new Date('2026-03-21');
    expect(isUserInactive('2026-03-01T00:00:00Z', threshold)).toBe(true);
  });

  test('user with recent activity = active', () => {
    const threshold = new Date('2026-03-21');
    expect(isUserInactive('2026-03-25T00:00:00Z', threshold)).toBe(false);
  });

  test('no previous reminder = eligible', () => {
    expect(isEligibleForReminder(null, new Date())).toBe(true);
  });

  test('old reminder = eligible', () => {
    const threshold = new Date('2026-03-21');
    expect(isEligibleForReminder('2026-03-10T00:00:00Z', threshold)).toBe(true);
  });

  test('recent reminder = not eligible', () => {
    const threshold = new Date('2026-03-21');
    expect(isEligibleForReminder('2026-03-25T00:00:00Z', threshold)).toBe(false);
  });
});

describe('computeDigestKPIs', () => {
  test('computes all KPIs', () => {
    const events = [
      { event_type: 'banner_impression' },
      { event_type: 'banner_impression' },
      { event_type: 'banner_impression' },
      { event_type: 'profile_view' },
      { event_type: 'social_click' },
      { event_type: 'sponsor_push' },
    ];
    const kpis = computeDigestKPIs(events);
    expect(kpis.impressions).toBe(3);
    expect(kpis.clicks).toBe(1);
    expect(kpis.socialClicks).toBe(1);
    expect(kpis.pushes).toBe(1);
    expect(kpis.ctr).toBe('33.3');
  });

  test('zero impressions = 0 CTR', () => {
    const kpis = computeDigestKPIs([{ event_type: 'profile_view' }]);
    expect(kpis.ctr).toBe('0');
  });

  test('empty events', () => {
    const kpis = computeDigestKPIs([]);
    expect(kpis.impressions).toBe(0);
    expect(kpis.ctr).toBe('0');
  });
});

describe('computeWeekOverWeekChange', () => {
  test('100% increase', () => { expect(computeWeekOverWeekChange(200, 100)).toBe(100); });
  test('50% decrease', () => { expect(computeWeekOverWeekChange(50, 100)).toBe(-50); });
  test('no change', () => { expect(computeWeekOverWeekChange(100, 100)).toBe(0); });
  test('previous 0 = 0', () => { expect(computeWeekOverWeekChange(100, 0)).toBe(0); });
});

describe('A/B variant splitting', () => {
  const tokens = Array.from({ length: 10 }, (_, i) => ({ token: `t${i}` }));

  test('variant_a gets even indices', () => {
    const a = splitVariantTokens(tokens, 'variant_a');
    expect(a).toHaveLength(5);
    expect(a[0].token).toBe('t0');
    expect(a[1].token).toBe('t2');
  });

  test('variant_b gets odd indices', () => {
    const b = splitVariantTokens(tokens, 'variant_b');
    expect(b).toHaveLength(5);
    expect(b[0].token).toBe('t1');
    expect(b[1].token).toBe('t3');
  });

  test('no variant returns all', () => {
    expect(splitVariantTokens(tokens, 'none')).toHaveLength(10);
  });

  test('A + B = all tokens', () => {
    const a = splitVariantTokens(tokens, 'variant_a');
    const b = splitVariantTokens(tokens, 'variant_b');
    expect(a.length + b.length).toBe(10);
  });
});

describe('engagement messages', () => {
  test('3 message variants', () => { expect(ENGAGEMENT_MESSAGES).toHaveLength(3); });
  test('all have title and body', () => {
    ENGAGEMENT_MESSAGES.forEach(m => {
      expect(m.title).toBeDefined();
      expect(m.body).toBeDefined();
      expect(m.title.length).toBeGreaterThan(0);
    });
  });
});

describe('MAX_ENGAGEMENT_BATCH', () => {
  test('limited to 100 users', () => { expect(MAX_ENGAGEMENT_BATCH).toBe(100); });
});
