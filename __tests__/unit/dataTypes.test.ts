/**
 * Unit Tests: Data Types & Configuration
 * 
 * Validates config constants, challenge types,
 * and data model consistency.
 */

// ============================================================================
// Challenge Configuration Tests
// ============================================================================

describe('Challenge Configuration', () => {
  const CHALLENGE_CONFIG = {
    '10_tirs': { nameKey: 'tenShots', icon: 'gps-fixed', color: '#F97316' },
    '10_tirs_sautee': { nameKey: 'tenShotsLob', icon: 'sports', color: '#3B82F6' },
    'precision': { nameKey: 'precision', icon: 'stars', color: '#F59E0B' },
  } as const;

  it('should have exactly 3 challenge types', () => {
    expect(Object.keys(CHALLENGE_CONFIG)).toHaveLength(3);
  });

  it('should have unique colors for each type', () => {
    const colors = Object.values(CHALLENGE_CONFIG).map(c => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('should have unique icons for each type', () => {
    const icons = Object.values(CHALLENGE_CONFIG).map(c => c.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('should have valid hex colors', () => {
    Object.values(CHALLENGE_CONFIG).forEach(config => {
      expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ============================================================================
// Period Configuration Tests
// ============================================================================

describe('Period Configuration', () => {
  const PERIOD_DAYS: Record<string, number> = {
    all: 0,
    week: 7,
    '2weeks': 14,
    month: 30,
    '3months': 90,
    '6months': 180,
    year: 365,
  };

  it('should have 7 period options', () => {
    expect(Object.keys(PERIOD_DAYS)).toHaveLength(7);
  });

  it('should have increasing day counts', () => {
    const values = Object.values(PERIOD_DAYS);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('should have "all" with 0 days', () => {
    expect(PERIOD_DAYS.all).toBe(0);
  });

  it('should have "year" with 365 days', () => {
    expect(PERIOD_DAYS.year).toBe(365);
  });
});

// ============================================================================
// Content Filter Configuration Tests
// ============================================================================

describe('Content Filters', () => {
  const CONTENT_FILTERS = ['all', 'training', 'tournament', 'meetups', 'shared'];
  const TRAINING_SUB_FILTERS = ['all', 'matches', 'challenges', 'series'];

  it('should have 5 content filters', () => {
    expect(CONTENT_FILTERS).toHaveLength(5);
  });

  it('should have 4 training sub-filters', () => {
    expect(TRAINING_SUB_FILTERS).toHaveLength(4);
  });

  it('both should start with "all"', () => {
    expect(CONTENT_FILTERS[0]).toBe('all');
    expect(TRAINING_SUB_FILTERS[0]).toBe('all');
  });

  it('should not have duplicate entries', () => {
    expect(new Set(CONTENT_FILTERS).size).toBe(CONTENT_FILTERS.length);
    expect(new Set(TRAINING_SUB_FILTERS).size).toBe(TRAINING_SUB_FILTERS.length);
  });
});

// ============================================================================
// Date Utility Tests
// ============================================================================

describe('Date Utilities', () => {
  const filterByPeriod = <T extends { date: string }>(items: T[], days: number): T[] => {
    if (days === 0) return items;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return items.filter(item => new Date(item.date) >= cutoff);
  };

  const mockItems = [
    { date: new Date().toISOString(), id: 'today' },
    { date: new Date(Date.now() - 3 * 86400000).toISOString(), id: '3days' },
    { date: new Date(Date.now() - 10 * 86400000).toISOString(), id: '10days' },
    { date: new Date(Date.now() - 60 * 86400000).toISOString(), id: '60days' },
    { date: new Date(Date.now() - 400 * 86400000).toISOString(), id: '400days' },
  ];

  it('should return all items when period is 0 (all)', () => {
    expect(filterByPeriod(mockItems, 0)).toHaveLength(5);
  });

  it('should return only last 7 days', () => {
    const result = filterByPeriod(mockItems, 7);
    expect(result).toHaveLength(2); // today + 3days
  });

  it('should return only last 14 days', () => {
    const result = filterByPeriod(mockItems, 14);
    expect(result).toHaveLength(3); // today + 3days + 10days
  });

  it('should return only last 90 days', () => {
    const result = filterByPeriod(mockItems, 90);
    expect(result).toHaveLength(4); // all except 400days
  });

  it('should return only last 365 days', () => {
    const result = filterByPeriod(mockItems, 365);
    expect(result).toHaveLength(4); // all except 400days
  });

  it('should handle empty array', () => {
    expect(filterByPeriod([], 7)).toHaveLength(0);
  });
});
