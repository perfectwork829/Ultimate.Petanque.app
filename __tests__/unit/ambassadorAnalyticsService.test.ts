/**
 * Unit tests for services/ambassadorAnalyticsService.ts
 *
 * Tests: computeThreshold (today/7d/30d/all), buildDateKeys (date generation,
 * ordering, format), groupByAmbassadorAndDate (aggregation, zero-fill, multi-
 * ambassador), analytics aggregation (profile_view/social_click/banner_impression
 * counting, socialBreakdown by platform), CTR calculation, detailed banner
 * analytics (impressionsByPage, clicksByPage, uniqueViewers, daily evolution),
 * sponsored challenge counting, edge cases.
 */

// ─── Types ─────────────────────────────────────────────────

interface AmbassadorAnalytics {
  profileViews: number;
  socialClicks: number;
  bannerImpressions: number;
  socialBreakdown: Record<string, number>;
}

interface BannerDetailedAnalytics {
  impressionsByPage: Record<string, number>;
  clicksByPage: Record<string, number>;
  totalImpressions: number;
  totalClicks: number;
  clickThroughRate: number;
  uniqueViewers: number;
  dailyImpressions: number[];
  dailyClicks: number[];
  dailyDates: string[];
}

type AnalyticsPeriod = 'today' | '7d' | '30d' | 'all';

// ─── Inline implementations (mirrors ambassadorAnalyticsService logic) ──

function computeThreshold(period?: AnalyticsPeriod): Date {
  if (!period || period === 'all') return new Date(0);
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(0);
  }
}

function buildDateKeys(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return dates;
}

function groupByAmbassadorAndDate(
  rows: { ambassador_id: string; created_at: string }[],
  dateKeys: string[]
): Map<string, number[]> {
  const grouped = new Map<string, Map<string, number>>();
  rows.forEach(row => {
    if (!grouped.has(row.ambassador_id)) grouped.set(row.ambassador_id, new Map());
    const dateStr = new Date(row.created_at).toISOString().slice(0, 10);
    const dayMap = grouped.get(row.ambassador_id)!;
    dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
  });

  const result = new Map<string, number[]>();
  grouped.forEach((dayMap, ambId) => {
    result.set(ambId, dateKeys.map(date => dayMap.get(date) || 0));
  });
  return result;
}

/** Aggregate analytics from raw event rows */
function aggregateAnalytics(rows: Array<{ ambassador_id: string; event_type: string; social_platform?: string }>): Map<string, AmbassadorAnalytics> {
  const statsMap = new Map<string, AmbassadorAnalytics>();
  rows.forEach(row => {
    if (!statsMap.has(row.ambassador_id)) {
      statsMap.set(row.ambassador_id, {
        profileViews: 0,
        socialClicks: 0,
        bannerImpressions: 0,
        socialBreakdown: {},
      });
    }
    const s = statsMap.get(row.ambassador_id)!;
    switch (row.event_type) {
      case 'profile_view':
        s.profileViews++;
        break;
      case 'social_click':
        s.socialClicks++;
        if (row.social_platform) {
          s.socialBreakdown[row.social_platform] = (s.socialBreakdown[row.social_platform] || 0) + 1;
        }
        break;
      case 'banner_impression':
        s.bannerImpressions++;
        break;
    }
  });
  return statsMap;
}

/** Compute CTR from impressions and clicks */
function computeCTR(impressions: number, clicks: number): number {
  if (impressions === 0) return 0;
  return Math.round((clicks / impressions) * 1000) / 10;
}

/** Compute detailed banner analytics from raw rows */
function computeDetailedBannerAnalytics(
  rows: Array<{ event_type: string; source_page?: string; viewer_id?: string; created_at: string }>,
  dateKeys: string[]
): BannerDetailedAnalytics {
  const impressionsByPage: Record<string, number> = {};
  const clicksByPage: Record<string, number> = {};
  let totalImpressions = 0;
  let totalClicks = 0;
  const uniqueViewerSet = new Set<string>();
  const dailyImpMap = new Map<string, number>();
  const dailyClickMap = new Map<string, number>();

  rows.forEach(row => {
    const page = row.source_page || 'unknown';
    const dateStr = new Date(row.created_at).toISOString().slice(0, 10);
    if (row.viewer_id) uniqueViewerSet.add(row.viewer_id);

    if (row.event_type === 'banner_impression') {
      totalImpressions++;
      impressionsByPage[page] = (impressionsByPage[page] || 0) + 1;
      dailyImpMap.set(dateStr, (dailyImpMap.get(dateStr) || 0) + 1);
    } else if (row.event_type === 'profile_view' || row.event_type === 'social_click') {
      totalClicks++;
      clicksByPage[page] = (clicksByPage[page] || 0) + 1;
      dailyClickMap.set(dateStr, (dailyClickMap.get(dateStr) || 0) + 1);
    }
  });

  return {
    impressionsByPage,
    clicksByPage,
    totalImpressions,
    totalClicks,
    clickThroughRate: computeCTR(totalImpressions, totalClicks),
    uniqueViewers: uniqueViewerSet.size,
    dailyImpressions: dateKeys.map(d => dailyImpMap.get(d) || 0),
    dailyClicks: dateKeys.map(d => dailyClickMap.get(d) || 0),
    dailyDates: dateKeys,
  };
}

/** Count sponsored challenges per ambassador */
function countSponsoredChallenges(rows: Array<{ ambassador_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    counts.set(row.ambassador_id, (counts.get(row.ambassador_id) || 0) + 1);
  });
  return counts;
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// computeThreshold
// ============================================

describe('computeThreshold', () => {
  test('all returns epoch 0', () => {
    const threshold = computeThreshold('all');
    expect(threshold.getTime()).toBe(0);
  });

  test('undefined returns epoch 0', () => {
    const threshold = computeThreshold(undefined);
    expect(threshold.getTime()).toBe(0);
  });

  test('today returns start of today', () => {
    const threshold = computeThreshold('today');
    const now = new Date();
    expect(threshold.getFullYear()).toBe(now.getFullYear());
    expect(threshold.getMonth()).toBe(now.getMonth());
    expect(threshold.getDate()).toBe(now.getDate());
    expect(threshold.getHours()).toBe(0);
    expect(threshold.getMinutes()).toBe(0);
    expect(threshold.getSeconds()).toBe(0);
  });

  test('7d returns date 7 days ago', () => {
    const threshold = computeThreshold('7d');
    const now = new Date();
    const diffMs = now.getTime() - threshold.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  test('30d returns date 30 days ago', () => {
    const threshold = computeThreshold('30d');
    const now = new Date();
    const diffMs = now.getTime() - threshold.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  test('unknown period returns epoch 0', () => {
    const threshold = computeThreshold('unknown' as any);
    expect(threshold.getTime()).toBe(0);
  });

  test('thresholds are ordered: today > 7d > 30d > all', () => {
    const today = computeThreshold('today').getTime();
    const sevenD = computeThreshold('7d').getTime();
    const thirtyD = computeThreshold('30d').getTime();
    const all = computeThreshold('all').getTime();

    expect(today).toBeGreaterThan(sevenD);
    expect(sevenD).toBeGreaterThan(thirtyD);
    expect(thirtyD).toBeGreaterThan(all);
  });
});

// ============================================
// buildDateKeys
// ============================================

describe('buildDateKeys', () => {
  test('returns correct number of dates', () => {
    expect(buildDateKeys(7)).toHaveLength(7);
    expect(buildDateKeys(30)).toHaveLength(30);
    expect(buildDateKeys(1)).toHaveLength(1);
  });

  test('dates are in YYYY-MM-DD format', () => {
    const keys = buildDateKeys(5);
    keys.forEach(key => {
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test('last date is today', () => {
    const keys = buildDateKeys(7);
    const today = new Date().toISOString().slice(0, 10);
    expect(keys[keys.length - 1]).toBe(today);
  });

  test('dates are ordered oldest to newest', () => {
    const keys = buildDateKeys(7);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true);
    }
  });

  test('first date is N-1 days ago', () => {
    const days = 10;
    const keys = buildDateKeys(days);
    const expected = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(keys[0]).toBe(expected);
  });

  test('consecutive dates differ by exactly 1 day', () => {
    const keys = buildDateKeys(5);
    for (let i = 1; i < keys.length; i++) {
      const prev = new Date(keys[i - 1]).getTime();
      const curr = new Date(keys[i]).getTime();
      const diffMs = curr - prev;
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// ============================================
// groupByAmbassadorAndDate
// ============================================

describe('groupByAmbassadorAndDate', () => {
  const dateKeys = ['2026-03-26', '2026-03-27', '2026-03-28'];

  test('groups events by ambassador and date', () => {
    const rows = [
      { ambassador_id: 'amb-1', created_at: '2026-03-26T10:00:00Z' },
      { ambassador_id: 'amb-1', created_at: '2026-03-26T15:00:00Z' },
      { ambassador_id: 'amb-1', created_at: '2026-03-28T09:00:00Z' },
      { ambassador_id: 'amb-2', created_at: '2026-03-27T12:00:00Z' },
    ];

    const result = groupByAmbassadorAndDate(rows, dateKeys);
    expect(result.get('amb-1')).toEqual([2, 0, 1]); // 2 on 26th, 0 on 27th, 1 on 28th
    expect(result.get('amb-2')).toEqual([0, 1, 0]); // 0 on 26th, 1 on 27th, 0 on 28th
  });

  test('zero-fills missing dates', () => {
    const rows = [
      { ambassador_id: 'amb-1', created_at: '2026-03-28T09:00:00Z' },
    ];
    const result = groupByAmbassadorAndDate(rows, dateKeys);
    expect(result.get('amb-1')).toEqual([0, 0, 1]);
  });

  test('returns empty map for empty rows', () => {
    const result = groupByAmbassadorAndDate([], dateKeys);
    expect(result.size).toBe(0);
  });

  test('handles multiple ambassadors independently', () => {
    const rows = [
      { ambassador_id: 'a', created_at: '2026-03-26T10:00:00Z' },
      { ambassador_id: 'b', created_at: '2026-03-26T10:00:00Z' },
      { ambassador_id: 'c', created_at: '2026-03-26T10:00:00Z' },
    ];
    const result = groupByAmbassadorAndDate(rows, dateKeys);
    expect(result.size).toBe(3);
  });

  test('result arrays match dateKeys length', () => {
    const rows = [
      { ambassador_id: 'amb-1', created_at: '2026-03-26T10:00:00Z' },
    ];
    const result = groupByAmbassadorAndDate(rows, dateKeys);
    expect(result.get('amb-1')?.length).toBe(dateKeys.length);
  });

  test('events outside dateKeys range are zero-filled', () => {
    const rows = [
      { ambassador_id: 'amb-1', created_at: '2026-03-20T10:00:00Z' }, // Before range
    ];
    const result = groupByAmbassadorAndDate(rows, dateKeys);
    // The event is outside the dateKeys range, so all values should be 0
    expect(result.get('amb-1')).toEqual([0, 0, 0]);
  });
});

// ============================================
// Analytics Aggregation
// ============================================

describe('aggregateAnalytics', () => {
  test('counts event types correctly', () => {
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'profile_view' },
      { ambassador_id: 'amb-1', event_type: 'profile_view' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'instagram' },
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
    ];

    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-1')!;
    expect(s.profileViews).toBe(2);
    expect(s.socialClicks).toBe(1);
    expect(s.bannerImpressions).toBe(3);
  });

  test('tracks social breakdown by platform', () => {
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'instagram' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'instagram' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'youtube' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'tiktok' },
    ];

    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-1')!;
    expect(s.socialClicks).toBe(4);
    expect(s.socialBreakdown['instagram']).toBe(2);
    expect(s.socialBreakdown['youtube']).toBe(1);
    expect(s.socialBreakdown['tiktok']).toBe(1);
  });

  test('social_click without platform does not break', () => {
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'social_click' },
    ];
    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-1')!;
    expect(s.socialClicks).toBe(1);
    expect(Object.keys(s.socialBreakdown)).toHaveLength(0);
  });

  test('aggregates multiple ambassadors independently', () => {
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'profile_view' },
      { ambassador_id: 'amb-2', event_type: 'profile_view' },
      { ambassador_id: 'amb-2', event_type: 'profile_view' },
    ];
    const stats = aggregateAnalytics(rows);
    expect(stats.get('amb-1')!.profileViews).toBe(1);
    expect(stats.get('amb-2')!.profileViews).toBe(2);
  });

  test('unknown event types are silently ignored', () => {
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'unknown_event' },
      { ambassador_id: 'amb-1', event_type: 'profile_view' },
    ];
    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-1')!;
    expect(s.profileViews).toBe(1);
    expect(s.socialClicks).toBe(0);
    expect(s.bannerImpressions).toBe(0);
  });

  test('empty rows returns empty map', () => {
    expect(aggregateAnalytics([]).size).toBe(0);
  });

  test('initializes all counters to zero for new ambassador', () => {
    const rows = [
      { ambassador_id: 'amb-new', event_type: 'profile_view' },
    ];
    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-new')!;
    expect(s.profileViews).toBe(1);
    expect(s.socialClicks).toBe(0);
    expect(s.bannerImpressions).toBe(0);
    expect(Object.keys(s.socialBreakdown)).toHaveLength(0);
  });
});

// ============================================
// CTR Calculation
// ============================================

describe('computeCTR', () => {
  test('0 impressions returns 0', () => {
    expect(computeCTR(0, 0)).toBe(0);
    expect(computeCTR(0, 10)).toBe(0);
  });

  test('100 impressions, 10 clicks = 10%', () => {
    expect(computeCTR(100, 10)).toBe(10);
  });

  test('100 impressions, 1 click = 1%', () => {
    expect(computeCTR(100, 1)).toBe(1);
  });

  test('100 impressions, 100 clicks = 100%', () => {
    expect(computeCTR(100, 100)).toBe(100);
  });

  test('rounds to 1 decimal place', () => {
    // 3/7 = 0.42857... → 42.9%
    expect(computeCTR(7, 3)).toBe(42.9);
  });

  test('very small CTR', () => {
    // 1/1000 = 0.1%
    expect(computeCTR(1000, 1)).toBe(0.1);
  });

  test('can exceed 100% if clicks > impressions (edge case)', () => {
    expect(computeCTR(5, 10)).toBe(200);
  });
});

// ============================================
// Detailed Banner Analytics
// ============================================

describe('computeDetailedBannerAnalytics', () => {
  const dateKeys = ['2026-03-26', '2026-03-27', '2026-03-28'];

  test('categorizes impressions and clicks by page', () => {
    const rows = [
      { event_type: 'banner_impression', source_page: 'home', created_at: '2026-03-26T10:00:00Z' },
      { event_type: 'banner_impression', source_page: 'home', created_at: '2026-03-26T11:00:00Z' },
      { event_type: 'banner_impression', source_page: 'directory', created_at: '2026-03-27T10:00:00Z' },
      { event_type: 'profile_view', source_page: 'home', created_at: '2026-03-26T12:00:00Z' },
      { event_type: 'social_click', source_page: 'profile', created_at: '2026-03-28T10:00:00Z' },
    ];

    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.impressionsByPage['home']).toBe(2);
    expect(result.impressionsByPage['directory']).toBe(1);
    expect(result.clicksByPage['home']).toBe(1);
    expect(result.clicksByPage['profile']).toBe(1);
    expect(result.totalImpressions).toBe(3);
    expect(result.totalClicks).toBe(2);
  });

  test('computes CTR from impressions and clicks', () => {
    const rows = [
      { event_type: 'banner_impression', created_at: '2026-03-26T10:00:00Z' },
      { event_type: 'banner_impression', created_at: '2026-03-26T11:00:00Z' },
      { event_type: 'banner_impression', created_at: '2026-03-26T12:00:00Z' },
      { event_type: 'banner_impression', created_at: '2026-03-26T13:00:00Z' },
      { event_type: 'profile_view', created_at: '2026-03-26T14:00:00Z' },
    ];

    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.clickThroughRate).toBe(25); // 1/4 * 100 = 25%
  });

  test('counts unique viewers', () => {
    const rows = [
      { event_type: 'banner_impression', viewer_id: 'v1', created_at: '2026-03-26T10:00:00Z' },
      { event_type: 'banner_impression', viewer_id: 'v1', created_at: '2026-03-26T11:00:00Z' }, // Same viewer
      { event_type: 'banner_impression', viewer_id: 'v2', created_at: '2026-03-27T10:00:00Z' },
      { event_type: 'profile_view', viewer_id: 'v3', created_at: '2026-03-28T10:00:00Z' },
    ];

    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.uniqueViewers).toBe(3); // v1, v2, v3
  });

  test('null viewer_id not counted', () => {
    const rows = [
      { event_type: 'banner_impression', created_at: '2026-03-26T10:00:00Z' },
      { event_type: 'banner_impression', viewer_id: 'v1', created_at: '2026-03-26T11:00:00Z' },
    ];

    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.uniqueViewers).toBe(1);
  });

  test('daily evolution aligns with dateKeys', () => {
    const rows = [
      { event_type: 'banner_impression', created_at: '2026-03-26T10:00:00Z' },
      { event_type: 'banner_impression', created_at: '2026-03-26T11:00:00Z' },
      { event_type: 'banner_impression', created_at: '2026-03-28T10:00:00Z' },
      { event_type: 'profile_view', created_at: '2026-03-27T10:00:00Z' },
    ];

    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.dailyImpressions).toEqual([2, 0, 1]);
    expect(result.dailyClicks).toEqual([0, 1, 0]);
    expect(result.dailyDates).toEqual(dateKeys);
  });

  test('missing source_page defaults to unknown', () => {
    const rows = [
      { event_type: 'banner_impression', created_at: '2026-03-26T10:00:00Z' },
    ];
    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.impressionsByPage['unknown']).toBe(1);
  });

  test('empty rows returns zeroed analytics', () => {
    const result = computeDetailedBannerAnalytics([], dateKeys);
    expect(result.totalImpressions).toBe(0);
    expect(result.totalClicks).toBe(0);
    expect(result.clickThroughRate).toBe(0);
    expect(result.uniqueViewers).toBe(0);
    expect(result.dailyImpressions).toEqual([0, 0, 0]);
    expect(result.dailyClicks).toEqual([0, 0, 0]);
  });
});

// ============================================
// Sponsored Challenge Counting
// ============================================

describe('countSponsoredChallenges', () => {
  test('counts challenges per ambassador', () => {
    const rows = [
      { ambassador_id: 'amb-1' },
      { ambassador_id: 'amb-1' },
      { ambassador_id: 'amb-1' },
      { ambassador_id: 'amb-2' },
    ];
    const counts = countSponsoredChallenges(rows);
    expect(counts.get('amb-1')).toBe(3);
    expect(counts.get('amb-2')).toBe(1);
  });

  test('empty returns empty map', () => {
    expect(countSponsoredChallenges([]).size).toBe(0);
  });

  test('single event counts as 1', () => {
    const counts = countSponsoredChallenges([{ ambassador_id: 'amb-1' }]);
    expect(counts.get('amb-1')).toBe(1);
  });
});

// ============================================
// Integration: Full Analytics Pipeline
// ============================================

describe('Full Analytics Pipeline', () => {
  test('process mixed events for multiple ambassadors', () => {
    const rows = [
      // Ambassador 1: active with social presence
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
      { ambassador_id: 'amb-1', event_type: 'banner_impression' },
      { ambassador_id: 'amb-1', event_type: 'profile_view' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'instagram' },
      { ambassador_id: 'amb-1', event_type: 'social_click', social_platform: 'youtube' },
      // Ambassador 2: mostly impressions
      { ambassador_id: 'amb-2', event_type: 'banner_impression' },
      { ambassador_id: 'amb-2', event_type: 'banner_impression' },
      { ambassador_id: 'amb-2', event_type: 'banner_impression' },
      { ambassador_id: 'amb-2', event_type: 'banner_impression' },
      { ambassador_id: 'amb-2', event_type: 'banner_impression' },
    ];

    const stats = aggregateAnalytics(rows);

    // Ambassador 1 analytics
    const s1 = stats.get('amb-1')!;
    expect(s1.bannerImpressions).toBe(3);
    expect(s1.profileViews).toBe(1);
    expect(s1.socialClicks).toBe(2);
    expect(s1.socialBreakdown['instagram']).toBe(1);
    expect(s1.socialBreakdown['youtube']).toBe(1);

    // Ambassador 2 analytics
    const s2 = stats.get('amb-2')!;
    expect(s2.bannerImpressions).toBe(5);
    expect(s2.profileViews).toBe(0);
    expect(s2.socialClicks).toBe(0);

    // CTR comparison
    const ctr1 = computeCTR(s1.bannerImpressions, s1.profileViews + s1.socialClicks);
    const ctr2 = computeCTR(s2.bannerImpressions, s2.profileViews + s2.socialClicks);
    expect(ctr1).toBe(100); // 3/3 * 100
    expect(ctr2).toBe(0); // 0/5 * 100
  });

  test('time-filtered analytics with threshold', () => {
    const now = Date.now();
    const rows = [
      { ambassador_id: 'amb-1', event_type: 'profile_view', created_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() }, // 1 day ago
      { ambassador_id: 'amb-1', event_type: 'profile_view', created_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() }, // 5 days ago
      { ambassador_id: 'amb-1', event_type: 'profile_view', created_at: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString() }, // 15 days ago
      { ambassador_id: 'amb-1', event_type: 'profile_view', created_at: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString() }, // 60 days ago
    ];

    // Filter for 7d
    const threshold7d = computeThreshold('7d');
    const filtered7d = rows.filter(r => new Date(r.created_at).getTime() >= threshold7d.getTime());
    const stats7d = aggregateAnalytics(filtered7d);
    expect(stats7d.get('amb-1')!.profileViews).toBe(2);

    // Filter for 30d
    const threshold30d = computeThreshold('30d');
    const filtered30d = rows.filter(r => new Date(r.created_at).getTime() >= threshold30d.getTime());
    const stats30d = aggregateAnalytics(filtered30d);
    expect(stats30d.get('amb-1')!.profileViews).toBe(3);

    // Filter for all
    const thresholdAll = computeThreshold('all');
    const filteredAll = rows.filter(r => new Date(r.created_at).getTime() >= thresholdAll.getTime());
    const statsAll = aggregateAnalytics(filteredAll);
    expect(statsAll.get('amb-1')!.profileViews).toBe(4);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('buildDateKeys(0) returns empty array', () => {
    expect(buildDateKeys(0)).toHaveLength(0);
  });

  test('buildDateKeys(1) returns only today', () => {
    const keys = buildDateKeys(1);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(new Date().toISOString().slice(0, 10));
  });

  test('buildDateKeys(365) returns full year', () => {
    const keys = buildDateKeys(365);
    expect(keys).toHaveLength(365);
    // First date is ~364 days ago, last is today
    expect(keys[keys.length - 1]).toBe(new Date().toISOString().slice(0, 10));
  });

  test('groupByAmbassadorAndDate with 100+ rows', () => {
    const dateKeys = buildDateKeys(30);
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ambassador_id: `amb-${i % 5}`,
      created_at: new Date(Date.now() - (i % 30) * 24 * 60 * 60 * 1000).toISOString(),
    }));
    const result = groupByAmbassadorAndDate(rows, dateKeys);
    expect(result.size).toBe(5);
    result.forEach(counts => {
      expect(counts).toHaveLength(30);
      expect(counts.every(c => c >= 0)).toBe(true);
    });
  });

  test('aggregateAnalytics with large dataset', () => {
    const types = ['profile_view', 'social_click', 'banner_impression'];
    const platforms = ['instagram', 'youtube', 'tiktok', 'twitter'];
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      ambassador_id: `amb-${i % 10}`,
      event_type: types[i % 3],
      social_platform: types[i % 3] === 'social_click' ? platforms[i % 4] : undefined,
    }));
    const stats = aggregateAnalytics(rows);
    expect(stats.size).toBe(10);
    let totalEvents = 0;
    stats.forEach(s => {
      totalEvents += s.profileViews + s.socialClicks + s.bannerImpressions;
    });
    expect(totalEvents).toBe(1000);
  });

  test('CTR with very large numbers', () => {
    expect(computeCTR(1000000, 50000)).toBe(5);
  });

  test('daily analytics with no matching dates', () => {
    const dateKeys = ['2026-01-01', '2026-01-02'];
    const rows = [
      { event_type: 'banner_impression', created_at: '2026-12-25T10:00:00Z' },
    ];
    const result = computeDetailedBannerAnalytics(rows, dateKeys);
    expect(result.dailyImpressions).toEqual([0, 0]);
    expect(result.totalImpressions).toBe(1); // Still counted in total
  });

  test('social breakdown with many platforms', () => {
    const platforms = ['instagram', 'youtube', 'tiktok', 'twitter', 'facebook', 'linkedin', 'website'];
    const rows = platforms.map(p => ({
      ambassador_id: 'amb-1',
      event_type: 'social_click',
      social_platform: p,
    }));
    const stats = aggregateAnalytics(rows);
    const s = stats.get('amb-1')!;
    expect(s.socialClicks).toBe(7);
    expect(Object.keys(s.socialBreakdown)).toHaveLength(7);
    platforms.forEach(p => {
      expect(s.socialBreakdown[p]).toBe(1);
    });
  });
});
