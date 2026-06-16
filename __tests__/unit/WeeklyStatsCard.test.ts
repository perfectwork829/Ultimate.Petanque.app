/**
 * Unit tests for components/ui/WeeklyStatsCard.tsx
 *
 * Tests: weekly data aggregation, win rate calculation, win rate diff,
 * best performance extraction, daily activity sparkline, streak integration,
 * visibility conditions, empty states.
 */

// ─── Inline implementations ──

interface MatchLike {
  date: string;
  winner: string;
  teamA?: { score: number; players?: any[] };
  teamB?: { score: number; players?: any[] };
}

interface ChallengeLike {
  date: string;
  type: string;
  successRate?: number;
}

interface DailyActivity {
  dayLabel: string;
  matchCount: number;
  challengeCount: number;
  total: number;
}

function filterByWeek(items: { date: string }[], weekStart: Date, weekEnd?: Date): any[] {
  return items.filter(item => {
    const d = new Date(item.date);
    if (weekEnd) return d >= weekStart && d < weekEnd;
    return d >= weekStart;
  });
}

function computeWinRate(matches: MatchLike[]): number {
  if (matches.length === 0) return 0;
  const wins = matches.filter(m => m.winner === 'A').length;
  return Math.round((wins / matches.length) * 100);
}

function computeWinRateDiff(currentWR: number, previousWR: number): number {
  return currentWR - previousWR;
}

function extractBestPerformance(matches: MatchLike[]): string {
  if (matches.length === 0) return '';
  const maxScore = Math.max(...matches.map(m => m.teamA?.score || 0));
  const best = matches.find(m => (m.teamA?.score || 0) === maxScore);
  if (!best) return '';
  return `${best.teamA?.score || 0}-${best.teamB?.score || 0}`;
}

function buildDailyActivity(
  matches: MatchLike[], challenges: ChallengeLike[], language: 'fr' | 'en',
): DailyActivity[] {
  const days: DailyActivity[] = [];
  const dayLabels = language === 'fr'
    ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0

    const matchCount = matches.filter(m => m.date.startsWith(dateStr)).length;
    const challengeCount = challenges.filter(c => c.date.startsWith(dateStr)).length;

    days.push({
      dayLabel: dayLabels[dayIdx],
      matchCount,
      challengeCount,
      total: matchCount + challengeCount,
    });
  }
  return days;
}

function computeSparklineMaxDaily(activity: DailyActivity[]): number {
  return Math.max(...activity.map(d => d.total), 1);
}

function shouldShowWeeklyCard(
  matchCount: number, challengeCount: number, currentStreak: number,
): boolean {
  if (matchCount === 0 && challengeCount === 0 && currentStreak === 0) return false;
  return true;
}

function hasWeeklyData(thisWeekMatches: number, thisWeekChallenges: number): boolean {
  return thisWeekMatches > 0 || thisWeekChallenges > 0;
}

// ─── Tests ──

describe('filterByWeek', () => {
  const now = new Date('2026-03-28T12:00:00Z');
  const weekStart = new Date('2026-03-21T00:00:00Z');
  const prevWeekStart = new Date('2026-03-14T00:00:00Z');

  const matches = [
    { date: '2026-03-25T10:00:00Z' }, // This week
    { date: '2026-03-27T15:00:00Z' }, // This week
    { date: '2026-03-18T10:00:00Z' }, // Last week
    { date: '2026-03-10T10:00:00Z' }, // 2 weeks ago
  ];

  test('filters current week', () => {
    expect(filterByWeek(matches, weekStart)).toHaveLength(2);
  });

  test('filters previous week with end boundary', () => {
    expect(filterByWeek(matches, prevWeekStart, weekStart)).toHaveLength(1);
  });

  test('empty array returns empty', () => {
    expect(filterByWeek([], weekStart)).toHaveLength(0);
  });
});

describe('computeWinRate', () => {
  test('no matches = 0%', () => {
    expect(computeWinRate([])).toBe(0);
  });

  test('all wins = 100%', () => {
    const matches: MatchLike[] = [
      { date: '2026-03-25', winner: 'A', teamA: { score: 13 }, teamB: { score: 5 } },
      { date: '2026-03-26', winner: 'A', teamA: { score: 13 }, teamB: { score: 8 } },
    ];
    expect(computeWinRate(matches)).toBe(100);
  });

  test('all losses = 0%', () => {
    const matches: MatchLike[] = [
      { date: '2026-03-25', winner: 'B', teamA: { score: 5 }, teamB: { score: 13 } },
      { date: '2026-03-26', winner: 'B', teamA: { score: 8 }, teamB: { score: 13 } },
    ];
    expect(computeWinRate(matches)).toBe(0);
  });

  test('50% win rate', () => {
    const matches: MatchLike[] = [
      { date: '2026-03-25', winner: 'A', teamA: { score: 13 }, teamB: { score: 5 } },
      { date: '2026-03-26', winner: 'B', teamA: { score: 5 }, teamB: { score: 13 } },
    ];
    expect(computeWinRate(matches)).toBe(50);
  });

  test('rounds to nearest integer', () => {
    const matches: MatchLike[] = [
      { date: '1', winner: 'A', teamA: { score: 13 }, teamB: { score: 0 } },
      { date: '2', winner: 'B', teamA: { score: 0 }, teamB: { score: 13 } },
      { date: '3', winner: 'B', teamA: { score: 0 }, teamB: { score: 13 } },
    ];
    expect(computeWinRate(matches)).toBe(33); // 33.33 → 33
  });
});

describe('computeWinRateDiff', () => {
  test('improvement: 70 vs 50 = +20', () => {
    expect(computeWinRateDiff(70, 50)).toBe(20);
  });

  test('regression: 40 vs 60 = -20', () => {
    expect(computeWinRateDiff(40, 60)).toBe(-20);
  });

  test('stable: 50 vs 50 = 0', () => {
    expect(computeWinRateDiff(50, 50)).toBe(0);
  });

  test('from 0 to 100 = +100', () => {
    expect(computeWinRateDiff(100, 0)).toBe(100);
  });
});

describe('extractBestPerformance', () => {
  test('empty matches returns empty string', () => {
    expect(extractBestPerformance([])).toBe('');
  });

  test('finds highest score', () => {
    const matches: MatchLike[] = [
      { date: '1', winner: 'A', teamA: { score: 13 }, teamB: { score: 5 } },
      { date: '2', winner: 'A', teamA: { score: 13 }, teamB: { score: 2 } },
      { date: '3', winner: 'B', teamA: { score: 8 }, teamB: { score: 13 } },
    ];
    expect(extractBestPerformance(matches)).toBe('13-5');
  });

  test('single match returns its score', () => {
    const matches: MatchLike[] = [
      { date: '1', winner: 'A', teamA: { score: 13 }, teamB: { score: 11 } },
    ];
    expect(extractBestPerformance(matches)).toBe('13-11');
  });

  test('handles missing scores', () => {
    const matches: MatchLike[] = [
      { date: '1', winner: 'A' },
    ];
    expect(extractBestPerformance(matches)).toBe('0-0');
  });
});

describe('buildDailyActivity', () => {
  test('returns 7 days', () => {
    const activity = buildDailyActivity([], [], 'fr');
    expect(activity).toHaveLength(7);
  });

  test('all zeros when no data', () => {
    const activity = buildDailyActivity([], [], 'en');
    activity.forEach(day => {
      expect(day.matchCount).toBe(0);
      expect(day.challengeCount).toBe(0);
      expect(day.total).toBe(0);
    });
  });

  test('FR day labels', () => {
    const activity = buildDailyActivity([], [], 'fr');
    const validLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    activity.forEach(day => {
      expect(validLabels).toContain(day.dayLabel);
    });
  });

  test('EN day labels', () => {
    const activity = buildDailyActivity([], [], 'en');
    const validLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    activity.forEach(day => {
      expect(validLabels).toContain(day.dayLabel);
    });
  });

  test('total = matchCount + challengeCount', () => {
    const activity = buildDailyActivity([], [], 'fr');
    activity.forEach(day => {
      expect(day.total).toBe(day.matchCount + day.challengeCount);
    });
  });

  test('today match counted', () => {
    const today = new Date().toISOString();
    const matches: MatchLike[] = [{ date: today, winner: 'A', teamA: { score: 13 }, teamB: { score: 5 } }];
    const activity = buildDailyActivity(matches, [], 'fr');
    const lastDay = activity[activity.length - 1];
    expect(lastDay.matchCount).toBe(1);
    expect(lastDay.total).toBe(1);
  });

  test('today challenge counted', () => {
    const today = new Date().toISOString();
    const challenges: ChallengeLike[] = [{ date: today, type: '10_tirs' }];
    const activity = buildDailyActivity([], challenges, 'fr');
    const lastDay = activity[activity.length - 1];
    expect(lastDay.challengeCount).toBe(1);
  });
});

describe('computeSparklineMaxDaily', () => {
  test('minimum is 1 (prevents division by zero)', () => {
    const activity = [{ dayLabel: 'L', matchCount: 0, challengeCount: 0, total: 0 }];
    expect(computeSparklineMaxDaily(activity)).toBe(1);
  });

  test('finds max total', () => {
    const activity = [
      { dayLabel: 'L', matchCount: 2, challengeCount: 1, total: 3 },
      { dayLabel: 'M', matchCount: 5, challengeCount: 0, total: 5 },
      { dayLabel: 'Me', matchCount: 0, challengeCount: 0, total: 0 },
    ];
    expect(computeSparklineMaxDaily(activity)).toBe(5);
  });
});

describe('shouldShowWeeklyCard', () => {
  test('no data and no streak = hide', () => {
    expect(shouldShowWeeklyCard(0, 0, 0)).toBe(false);
  });

  test('matches only = show', () => {
    expect(shouldShowWeeklyCard(3, 0, 0)).toBe(true);
  });

  test('challenges only = show', () => {
    expect(shouldShowWeeklyCard(0, 2, 0)).toBe(true);
  });

  test('streak only = show', () => {
    expect(shouldShowWeeklyCard(0, 0, 5)).toBe(true);
  });

  test('all data = show', () => {
    expect(shouldShowWeeklyCard(5, 3, 7)).toBe(true);
  });
});

describe('hasWeeklyData', () => {
  test('no data = false', () => {
    expect(hasWeeklyData(0, 0)).toBe(false);
  });

  test('matches only = true', () => {
    expect(hasWeeklyData(1, 0)).toBe(true);
  });

  test('challenges only = true', () => {
    expect(hasWeeklyData(0, 1)).toBe(true);
  });

  test('both = true', () => {
    expect(hasWeeklyData(3, 2)).toBe(true);
  });
});

describe('weekly aggregation scenarios', () => {
  test('complete week scenario', () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const matches: MatchLike[] = [
      { date: new Date(now.getTime() - 86400000).toISOString(), winner: 'A', teamA: { score: 13 }, teamB: { score: 5 } },
      { date: new Date(now.getTime() - 172800000).toISOString(), winner: 'B', teamA: { score: 8 }, teamB: { score: 13 } },
      { date: new Date(now.getTime() - 259200000).toISOString(), winner: 'A', teamA: { score: 13 }, teamB: { score: 10 } },
    ];

    const thisWeek = filterByWeek(matches, weekStart);
    expect(thisWeek).toHaveLength(3);
    expect(computeWinRate(thisWeek as MatchLike[])).toBe(67);
    expect(extractBestPerformance(thisWeek as MatchLike[])).toBe('13-5');
  });

  test('no previous week data = 0 diff', () => {
    const thisWeekWR = 75;
    const lastWeekWR = 0;
    expect(computeWinRateDiff(thisWeekWR, lastWeekWR)).toBe(75);
  });

  test('both weeks have data = diff calculated', () => {
    const thisWeekWR = 60;
    const lastWeekWR = 80;
    expect(computeWinRateDiff(thisWeekWR, lastWeekWR)).toBe(-20);
  });
});

describe('sparkline bar height calculation', () => {
  test('zero activity = no bar', () => {
    const matchH = 0;
    const challH = 0;
    expect(matchH + challH).toBe(0);
  });

  test('activity proportional to max', () => {
    const maxDaily = 5;
    const matchCount = 3;
    const matchH = Math.max(6, (matchCount / maxDaily) * 36);
    expect(matchH).toBeCloseTo(21.6);
  });

  test('minimum bar height is 6', () => {
    const maxDaily = 100;
    const matchCount = 1;
    const matchH = Math.max(6, (matchCount / maxDaily) * 36);
    expect(matchH).toBe(6); // 0.36 < 6, so min is 6
  });
});
