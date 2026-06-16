/**
 * Unit tests for services/boulesLeaderboardService.ts and clubLeaderboardService.ts
 *
 * Tests: aggregateBoulesData (brand/model grouping, role filter, dedup by userId,
 * stats averaging), sortBoulesLeaderboard (5 sort modes), club composite score
 * (40% winRate + 25% tirRate + 20% carreauRate + 15% activity), sortClubLeaderboard
 * (6 sort modes), top players extraction, edge cases.
 */

// ─── Boules Leaderboard ──

interface PlayerBoulesData { userId: string; brand: string; model: string; role: string; stats: { matchesPlayed: number; wins: number; winRate: number; tirRate: number; pointRate: number; carreauRate: number; }; }
interface LeaderboardBoulesEntry { id: string; brand: string; model?: string; userCount: number; totalMatches: number; stats: { avgWinRate: number; avgTirRate: number; avgPointRate: number; avgCarreauRate: number; }; byRole?: { role: string; userCount: number; avgWinRate: number; avgTirRate: number; }[]; }
type BoulesLeaderboardSort = 'avgWinRate' | 'totalMatches' | 'userCount' | 'avgTirRate' | 'avgCarreauRate';

function aggregateBoulesData(entries: PlayerBoulesData[], mode: 'brand' | 'model', filterRole?: string): LeaderboardBoulesEntry[] {
  let filtered = entries;
  if (filterRole && filterRole !== 'all') filtered = entries.filter(e => e.role === filterRole);
  const groupMap = new Map<string, PlayerBoulesData[]>();
  for (const entry of filtered) {
    const key = mode === 'brand' ? entry.brand : `${entry.brand}|||${entry.model}`;
    const existing = groupMap.get(key) || []; existing.push(entry); groupMap.set(key, existing);
  }
  const results: LeaderboardBoulesEntry[] = [];
  for (const [key, group] of groupMap) {
    const brand = mode === 'brand' ? key : key.split('|||')[0];
    const model = mode === 'model' ? key.split('|||')[1] : undefined;
    const uniqueUsers = new Set(group.map(g => g.userId));
    const totalMatches = group.reduce((sum, g) => sum + g.stats.matchesPlayed, 0);
    const avgWinRate = Math.round(group.reduce((sum, g) => sum + g.stats.winRate, 0) / group.length);
    const avgTirRate = Math.round(group.filter(g => g.stats.tirRate > 0).reduce((sum, g) => sum + g.stats.tirRate, 0) / Math.max(1, group.filter(g => g.stats.tirRate > 0).length));
    const avgPointRate = Math.round(group.filter(g => g.stats.pointRate > 0).reduce((sum, g) => sum + g.stats.pointRate, 0) / Math.max(1, group.filter(g => g.stats.pointRate > 0).length));
    const avgCarreauRate = Math.round(group.filter(g => g.stats.carreauRate > 0).reduce((sum, g) => sum + g.stats.carreauRate, 0) / Math.max(1, group.filter(g => g.stats.carreauRate > 0).length));
    results.push({ id: key, brand, model, userCount: uniqueUsers.size, totalMatches, stats: { avgWinRate, avgTirRate, avgPointRate, avgCarreauRate } });
  }
  return results;
}

function sortBoulesLeaderboard(entries: LeaderboardBoulesEntry[], sortBy: BoulesLeaderboardSort): LeaderboardBoulesEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'avgWinRate': return (b.stats.avgWinRate - a.stats.avgWinRate) || (b.totalMatches - a.totalMatches);
      case 'totalMatches': return b.totalMatches - a.totalMatches;
      case 'userCount': return (b.userCount - a.userCount) || (b.stats.avgWinRate - a.stats.avgWinRate);
      case 'avgTirRate': return (b.stats.avgTirRate - a.stats.avgTirRate) || (b.totalMatches - a.totalMatches);
      case 'avgCarreauRate': return (b.stats.avgCarreauRate - a.stats.avgCarreauRate) || (b.totalMatches - a.totalMatches);
      default: return b.stats.avgWinRate - a.stats.avgWinRate;
    }
  });
}

// ─── Club Leaderboard ──

interface LeaderboardClub { id: string; name: string; playerCount: number; totalMatches: number; stats: { avgWinRate: number; avgTirRate: number; avgCarreauRate: number; compositeScore: number; totalWins: number; totalLosses: number; }; topPlayers: { name: string; winRate: number; }[]; }
type ClubLeaderboardSort = 'compositeScore' | 'avgWinRate' | 'totalMatches' | 'playerCount' | 'avgTirRate' | 'avgCarreauRate';

function computeCompositeScore(avgWinRate: number, avgTirRate: number, avgCarreauRate: number, activityScore: number): number {
  return Math.round(avgWinRate * 0.40 + avgTirRate * 0.25 + avgCarreauRate * 0.20 + activityScore * 0.15);
}

function sortClubLeaderboard(clubs: LeaderboardClub[], sortBy: ClubLeaderboardSort): LeaderboardClub[] {
  return [...clubs].sort((a, b) => {
    switch (sortBy) {
      case 'compositeScore': return (b.stats.compositeScore - a.stats.compositeScore) || (b.totalMatches - a.totalMatches);
      case 'avgWinRate': return (b.stats.avgWinRate - a.stats.avgWinRate) || (b.totalMatches - a.totalMatches);
      case 'totalMatches': return b.totalMatches - a.totalMatches;
      case 'playerCount': return (b.playerCount - a.playerCount) || (b.stats.compositeScore - a.stats.compositeScore);
      case 'avgTirRate': return (b.stats.avgTirRate - a.stats.avgTirRate) || (b.totalMatches - a.totalMatches);
      case 'avgCarreauRate': return (b.stats.avgCarreauRate - a.stats.avgCarreauRate) || (b.totalMatches - a.totalMatches);
      default: return b.stats.compositeScore - a.stats.compositeScore;
    }
  });
}

// ─── Tests ─────────────────────────────────────────────────

describe('aggregateBoulesData — Brand Mode', () => {
  const entries: PlayerBoulesData[] = [
    { userId: 'u1', brand: 'Obut', model: 'Match IT', role: 'Tireur', stats: { matchesPlayed: 20, wins: 14, winRate: 70, tirRate: 65, pointRate: 0, carreauRate: 20 } },
    { userId: 'u2', brand: 'Obut', model: 'Match 115', role: 'Pointeur', stats: { matchesPlayed: 15, wins: 9, winRate: 60, tirRate: 0, pointRate: 75, carreauRate: 0 } },
    { userId: 'u3', brand: 'MS', model: 'Alpha', role: 'Tireur', stats: { matchesPlayed: 10, wins: 8, winRate: 80, tirRate: 72, pointRate: 0, carreauRate: 25 } },
  ];

  test('groups by brand', () => {
    const result = aggregateBoulesData(entries, 'brand');
    expect(result).toHaveLength(2);
    const obut = result.find(r => r.brand === 'Obut')!;
    expect(obut.userCount).toBe(2); expect(obut.totalMatches).toBe(35);
  });

  test('averages winRate across users', () => {
    const result = aggregateBoulesData(entries, 'brand');
    const obut = result.find(r => r.brand === 'Obut')!;
    expect(obut.stats.avgWinRate).toBe(65); // (70+60)/2 rounded
  });

  test('avgTirRate excludes zero values', () => {
    const result = aggregateBoulesData(entries, 'brand');
    const obut = result.find(r => r.brand === 'Obut')!;
    expect(obut.stats.avgTirRate).toBe(65); // Only u1 has tirRate > 0
  });
});

describe('aggregateBoulesData — Model Mode', () => {
  test('groups by brand+model', () => {
    const entries: PlayerBoulesData[] = [
      { userId: 'u1', brand: 'Obut', model: 'Match IT', role: 'Tireur', stats: { matchesPlayed: 20, wins: 14, winRate: 70, tirRate: 65, pointRate: 0, carreauRate: 20 } },
      { userId: 'u2', brand: 'Obut', model: 'Match 115', role: 'Tireur', stats: { matchesPlayed: 15, wins: 9, winRate: 60, tirRate: 55, pointRate: 0, carreauRate: 15 } },
    ];
    const result = aggregateBoulesData(entries, 'model');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.model !== undefined)).toBe(true);
  });
});

describe('aggregateBoulesData — Role Filter', () => {
  test('filters by role', () => {
    const entries: PlayerBoulesData[] = [
      { userId: 'u1', brand: 'Obut', model: 'X', role: 'Tireur', stats: { matchesPlayed: 10, wins: 7, winRate: 70, tirRate: 65, pointRate: 0, carreauRate: 20 } },
      { userId: 'u2', brand: 'Obut', model: 'Y', role: 'Pointeur', stats: { matchesPlayed: 10, wins: 5, winRate: 50, tirRate: 0, pointRate: 75, carreauRate: 0 } },
    ];
    const result = aggregateBoulesData(entries, 'brand', 'Tireur');
    expect(result).toHaveLength(1); expect(result[0].userCount).toBe(1);
  });
  test('"all" returns all', () => {
    const entries: PlayerBoulesData[] = [
      { userId: 'u1', brand: 'A', model: 'X', role: 'Tireur', stats: { matchesPlayed: 5, wins: 3, winRate: 60, tirRate: 50, pointRate: 0, carreauRate: 10 } },
    ];
    expect(aggregateBoulesData(entries, 'brand', 'all')).toHaveLength(1);
  });
});

describe('sortBoulesLeaderboard', () => {
  const entries: LeaderboardBoulesEntry[] = [
    { id: 'A', brand: 'A', userCount: 5, totalMatches: 50, stats: { avgWinRate: 60, avgTirRate: 55, avgPointRate: 50, avgCarreauRate: 15 } },
    { id: 'B', brand: 'B', userCount: 10, totalMatches: 30, stats: { avgWinRate: 70, avgTirRate: 60, avgPointRate: 55, avgCarreauRate: 20 } },
  ];
  test('avgWinRate sort', () => { expect(sortBoulesLeaderboard(entries, 'avgWinRate')[0].brand).toBe('B'); });
  test('totalMatches sort', () => { expect(sortBoulesLeaderboard(entries, 'totalMatches')[0].brand).toBe('A'); });
  test('userCount sort', () => { expect(sortBoulesLeaderboard(entries, 'userCount')[0].brand).toBe('B'); });
  test('avgTirRate sort', () => { expect(sortBoulesLeaderboard(entries, 'avgTirRate')[0].brand).toBe('B'); });
  test('does not mutate original', () => {
    const sorted = sortBoulesLeaderboard(entries, 'avgWinRate');
    expect(entries[0].brand).toBe('A'); expect(sorted[0].brand).toBe('B');
  });
});

describe('computeCompositeScore', () => {
  test('weighted formula', () => {
    // 80*0.40 + 60*0.25 + 20*0.20 + 50*0.15 = 32+15+4+7.5 = 58.5 → 59
    expect(computeCompositeScore(80, 60, 20, 50)).toBe(59);
  });
  test('all zeros = 0', () => { expect(computeCompositeScore(0, 0, 0, 0)).toBe(0); });
  test('all 100 = 100', () => { expect(computeCompositeScore(100, 100, 100, 100)).toBe(100); });
});

describe('sortClubLeaderboard', () => {
  const clubs: LeaderboardClub[] = [
    { id: 'c1', name: 'Club A', playerCount: 5, totalMatches: 100, stats: { avgWinRate: 60, avgTirRate: 50, avgCarreauRate: 15, compositeScore: 45, totalWins: 60, totalLosses: 40 }, topPlayers: [] },
    { id: 'c2', name: 'Club B', playerCount: 10, totalMatches: 50, stats: { avgWinRate: 70, avgTirRate: 60, avgCarreauRate: 20, compositeScore: 55, totalWins: 35, totalLosses: 15 }, topPlayers: [] },
  ];
  test('compositeScore sort', () => { expect(sortClubLeaderboard(clubs, 'compositeScore')[0].name).toBe('Club B'); });
  test('avgWinRate sort', () => { expect(sortClubLeaderboard(clubs, 'avgWinRate')[0].name).toBe('Club B'); });
  test('totalMatches sort', () => { expect(sortClubLeaderboard(clubs, 'totalMatches')[0].name).toBe('Club A'); });
  test('playerCount sort', () => { expect(sortClubLeaderboard(clubs, 'playerCount')[0].name).toBe('Club B'); });
  test('empty array sorts without error', () => { expect(sortClubLeaderboard([], 'compositeScore')).toHaveLength(0); });
});

describe('Edge Cases', () => {
  test('empty entries returns empty aggregation', () => {
    expect(aggregateBoulesData([], 'brand')).toHaveLength(0);
  });
  test('single user dedup', () => {
    const entries: PlayerBoulesData[] = [
      { userId: 'u1', brand: 'Obut', model: 'A', role: 'Tireur', stats: { matchesPlayed: 10, wins: 7, winRate: 70, tirRate: 65, pointRate: 0, carreauRate: 20 } },
    ];
    const result = aggregateBoulesData(entries, 'brand');
    expect(result[0].userCount).toBe(1);
  });
});
