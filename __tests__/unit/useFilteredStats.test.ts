/**
 * Unit tests for hooks/useFilteredStats.ts
 * Tests: filterByPeriod, filterByTime, getDateKey, PERIOD_DAYS
 */

import {
  filterByPeriod,
  filterByTime,
  getDateKey,
  PERIOD_DAYS,
  PERIOD_KEYS,
  PERIOD_IDS,
  TimeFilter,
  PeriodOption,
} from '@/hooks/useFilteredStats';

// Helpers
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const monthsAgo = (n: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};

const items = [
  { id: '1', date: daysAgo(0) },   // today
  { id: '2', date: daysAgo(3) },   // 3 days ago
  { id: '3', date: daysAgo(10) },  // 10 days ago
  { id: '4', date: daysAgo(45) },  // 45 days ago
  { id: '5', date: daysAgo(100) }, // 100 days ago
  { id: '6', date: daysAgo(200) }, // 200 days ago
  { id: '7', date: daysAgo(400) }, // 400 days ago (> 1 year)
];

// ============================================================
// filterByPeriod
// ============================================================
describe('filterByPeriod', () => {
  test('days=0 returns all items (no filtering)', () => {
    const result = filterByPeriod(items, 0);
    expect(result).toHaveLength(items.length);
    expect(result).toEqual(items);
  });

  test('days=7 filters to last 7 days', () => {
    const result = filterByPeriod(items, 7);
    expect(result.map(i => i.id)).toEqual(['1', '2']);
  });

  test('days=14 filters to last 14 days', () => {
    const result = filterByPeriod(items, 14);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  test('days=30 filters to last 30 days', () => {
    const result = filterByPeriod(items, 30);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  test('days=90 filters to last 90 days', () => {
    const result = filterByPeriod(items, 90);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3', '4']);
  });

  test('days=180 filters to last 180 days', () => {
    const result = filterByPeriod(items, 180);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  test('days=365 filters to last 365 days', () => {
    const result = filterByPeriod(items, 365);
    expect(result.map(i => i.id)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  test('empty array returns empty', () => {
    expect(filterByPeriod([], 30)).toEqual([]);
  });

  test('preserves original array reference on days=0', () => {
    const result = filterByPeriod(items, 0);
    expect(result).toBe(items);
  });
});

// ============================================================
// filterByTime
// ============================================================
describe('filterByTime', () => {
  test('"all" returns all items', () => {
    const result = filterByTime(items, 'all');
    expect(result).toHaveLength(items.length);
    expect(result).toBe(items); // reference equality
  });

  test('"today" returns only today items', () => {
    const result = filterByTime(items, 'today');
    expect(result.map(i => i.id)).toEqual(['1']);
  });

  test('"week" returns items from last 7 days', () => {
    const result = filterByTime(items, 'week');
    expect(result.map(i => i.id)).toEqual(['1', '2']);
  });

  test('"month" returns items from last 30 days', () => {
    const result = filterByTime(items, 'month');
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  test('"3months" returns items from last 3 months', () => {
    const result = filterByTime(items, '3months');
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  test('"6months" returns items from last 6 months', () => {
    const result = filterByTime(items, '6months');
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  test('"year" returns items from last year', () => {
    const result = filterByTime(items, 'year');
    expect(result.length).toBeGreaterThanOrEqual(5);
    expect(result.length).toBeLessThanOrEqual(7);
  });

  test('empty array returns empty', () => {
    const result = filterByTime([], 'week');
    expect(result).toEqual([]);
  });

  test('unknown filter returns all items', () => {
    const result = filterByTime(items, 'unknown_filter' as TimeFilter);
    expect(result).toEqual(items);
  });
});

// ============================================================
// getDateKey
// ============================================================
describe('getDateKey', () => {
  test('returns "Aujourd\'hui" for today (fr)', () => {
    const result = getDateKey(new Date(), 'fr');
    expect(result).toBe("Aujourd'hui");
  });

  test('returns "Today" for today (en)', () => {
    const result = getDateKey(new Date(), 'en');
    expect(result).toBe('Today');
  });

  test('returns "Hier" for yesterday (fr)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = getDateKey(yesterday, 'fr');
    expect(result).toBe('Hier');
  });

  test('returns "Yesterday" for yesterday (en)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = getDateKey(yesterday, 'en');
    expect(result).toBe('Yesterday');
  });

  test('returns formatted date for same-year past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const result = getDateKey(past, 'en');
    // Should include day and month but not year (same year)
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });

  test('returns formatted date with year for different year', () => {
    const past = new Date('2020-06-15');
    const result = getDateKey(past, 'en');
    expect(result).toContain('2020');
  });
});

// ============================================================
// Constants
// ============================================================
describe('Constants', () => {
  test('PERIOD_DAYS has correct values', () => {
    expect(PERIOD_DAYS.all).toBe(0);
    expect(PERIOD_DAYS.week).toBe(7);
    expect(PERIOD_DAYS['2weeks']).toBe(14);
    expect(PERIOD_DAYS.month).toBe(30);
    expect(PERIOD_DAYS['3months']).toBe(90);
    expect(PERIOD_DAYS['6months']).toBe(180);
    expect(PERIOD_DAYS.year).toBe(365);
  });

  test('PERIOD_IDS contains all period options', () => {
    expect(PERIOD_IDS).toEqual(['all', 'week', '2weeks', 'month', '3months', '6months', 'year']);
  });

  test('PERIOD_KEYS has string labels for all periods', () => {
    PERIOD_IDS.forEach(id => {
      expect(typeof PERIOD_KEYS[id]).toBe('string');
      expect(PERIOD_KEYS[id].length).toBeGreaterThan(0);
    });
  });
});
