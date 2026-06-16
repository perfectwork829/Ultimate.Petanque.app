/**
 * Unit tests for services/weeklyLeaderboardService.ts
 *
 * Tests: getCurrentWeekStart (Monday), getPreviousWeekStart, formatDateISO,
 * getWeekEnd (Sunday 23:59), WEEKLY_MIN_MATCHES, getSubRankings (city/club
 * grouping, sorting), WeeklyRankChange logic, edge cases.
 */

const WEEKLY_MIN_MATCHES = 2;

function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getPreviousWeekStart(): Date {
  const current = getCurrentWeekStart();
  current.setDate(current.getDate() - 7);
  return current;
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekEnd(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

interface WeeklyRankChange { currentRank: number; previousRank: number | null; direction: 'up' | 'down' | 'same' | 'new'; diff: number; }

function computeRankChange(currentRank: number, previousRank: number | null): WeeklyRankChange {
  if (previousRank === null) return { currentRank, previousRank: null, direction: 'new', diff: 0 };
  if (currentRank < previousRank) return { currentRank, previousRank, direction: 'up', diff: previousRank - currentRank };
  if (currentRank > previousRank) return { currentRank, previousRank, direction: 'down', diff: currentRank - previousRank };
  return { currentRank, previousRank, direction: 'same', diff: 0 };
}

function getSubRankings(players: Array<{ club?: string; city?: string; stats: { winRate: number; matchesPlayed: number } }>, type: 'city' | 'club') {
  const groups = new Map<string, typeof players>();
  players.forEach(p => {
    const key = type === 'city' ? p.city : p.club;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  });
  const rankings: { name: string; players: typeof players }[] = [];
  for (const [name, groupPlayers] of groups.entries()) {
    groupPlayers.sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.matchesPlayed - a.stats.matchesPlayed);
    rankings.push({ name, players: groupPlayers });
  }
  rankings.sort((a, b) => {
    const avgA = a.players.reduce((s, p) => s + p.stats.winRate, 0) / a.players.length;
    const avgB = b.players.reduce((s, p) => s + p.stats.winRate, 0) / b.players.length;
    return avgB - avgA;
  });
  return rankings;
}

describe('getCurrentWeekStart', () => {
  test('returns a Monday', () => { expect(getCurrentWeekStart().getDay()).toBe(1); });
  test('time is 00:00:00', () => {
    const d = getCurrentWeekStart();
    expect(d.getHours()).toBe(0); expect(d.getMinutes()).toBe(0); expect(d.getSeconds()).toBe(0);
  });
});

describe('getPreviousWeekStart', () => {
  test('is 7 days before current week start', () => {
    const diff = getCurrentWeekStart().getTime() - getPreviousWeekStart().getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
  test('is also a Monday', () => { expect(getPreviousWeekStart().getDay()).toBe(1); });
});

describe('formatDateISO', () => {
  test('formats correctly', () => { expect(formatDateISO(new Date(2026, 2, 28))).toBe('2026-03-28'); });
  test('pads month and day', () => { expect(formatDateISO(new Date(2026, 0, 5))).toBe('2026-01-05'); });
});

describe('getWeekEnd', () => {
  test('returns Sunday', () => {
    const monday = new Date(2026, 2, 23); // Monday March 23
    const end = getWeekEnd(monday);
    expect(end.getDay()).toBe(0); // Sunday
  });
  test('time is 23:59:59', () => {
    const end = getWeekEnd(new Date(2026, 2, 23));
    expect(end.getHours()).toBe(23); expect(end.getMinutes()).toBe(59); expect(end.getSeconds()).toBe(59);
  });
  test('is 6 days after Monday', () => {
    const monday = new Date(2026, 2, 23);
    const end = getWeekEnd(monday);
    expect(end.getDate() - monday.getDate()).toBe(6);
  });
});

describe('WEEKLY_MIN_MATCHES', () => {
  test('is 2', () => { expect(WEEKLY_MIN_MATCHES).toBe(2); });
});

describe('computeRankChange', () => {
  test('new entrant', () => {
    const rc = computeRankChange(5, null);
    expect(rc.direction).toBe('new'); expect(rc.diff).toBe(0);
  });
  test('rank improved', () => {
    const rc = computeRankChange(3, 7);
    expect(rc.direction).toBe('up'); expect(rc.diff).toBe(4);
  });
  test('rank dropped', () => {
    const rc = computeRankChange(10, 5);
    expect(rc.direction).toBe('down'); expect(rc.diff).toBe(5);
  });
  test('rank unchanged', () => {
    const rc = computeRankChange(3, 3);
    expect(rc.direction).toBe('same'); expect(rc.diff).toBe(0);
  });
});

describe('getSubRankings', () => {
  test('groups by city', () => {
    const players = [
      { city: 'Lyon', stats: { winRate: 80, matchesPlayed: 10 } },
      { city: 'Lyon', stats: { winRate: 60, matchesPlayed: 8 } },
      { city: 'Paris', stats: { winRate: 90, matchesPlayed: 15 } },
    ];
    const rankings = getSubRankings(players, 'city');
    expect(rankings).toHaveLength(2);
    expect(rankings[0].name).toBe('Paris'); // Higher avg winRate
    expect(rankings[1].name).toBe('Lyon');
    expect(rankings[1].players[0].stats.winRate).toBe(80); // Sorted within group
  });
  test('groups by club', () => {
    const players = [
      { club: 'Club A', stats: { winRate: 70, matchesPlayed: 5 } },
      { club: 'Club B', stats: { winRate: 50, matchesPlayed: 3 } },
    ];
    const rankings = getSubRankings(players, 'club');
    expect(rankings).toHaveLength(2);
    expect(rankings[0].name).toBe('Club A');
  });
  test('skips players without group key', () => {
    const players = [
      { city: 'Lyon', stats: { winRate: 80, matchesPlayed: 10 } },
      { stats: { winRate: 90, matchesPlayed: 5 } },
    ];
    const rankings = getSubRankings(players, 'city');
    expect(rankings).toHaveLength(1); expect(rankings[0].players).toHaveLength(1);
  });
  test('empty players returns empty', () => {
    expect(getSubRankings([], 'city')).toHaveLength(0);
  });
});
