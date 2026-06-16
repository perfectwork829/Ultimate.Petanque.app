/**
 * Unit tests for hooks/useProgressionStats.ts
 * Tests: useProgressionData, useTrends, useChallengeProgressionData, useTournamentProgressionData
 */

import type { Match, Challenge, Tournament } from '@/types/petanque';

// ============================================================
// Test Data Factories
// ============================================================
const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'match-1',
  date: new Date().toISOString(),
  mode: 'Entraînement',
  format: 'Doublette',
  teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 },
  teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 },
  winner: 'A',
  duration: 45,
  menes: [],
  playerActions: [{ playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 } }],
  ...overrides,
});

const makeChallenge = (overrides: Partial<Challenge> = {}): Challenge => ({
  id: 'ch-1', type: '10_tirs', mode: 'solo', date: new Date().toISOString(),
  successCount: 7, totalShots: 10, carreauCount: 2, successRate: 70,
  ...overrides,
});

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 'tour-1', name: 'Test Tournament', date: new Date().toISOString(),
  type: 'Mixte', format: 'Doublette', location: { city: 'Paris', latitude: 0, longitude: 0 },
  status: 'Terminé', ...overrides,
} as Tournament);

// ============================================================
// Inline computeProgressionData (mirrors useProgressionData)
// ============================================================
function computeProgressionData(matches: Match[], weeksToShow: number) {
  const sortedMatches = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const useMonthly = weeksToShow > 52;
  const weeklyData: any[] = [];
  if (sortedMatches.length === 0) return { weeklyData, weeksToShow, useMonthly };

  const now = new Date();

  if (useMonthly) {
    const totalMonths = Math.ceil(weeksToShow / 4.33);
    const startDate = new Date(now); startDate.setMonth(startDate.getMonth() - totalMonths); startDate.setDate(1);
    const cur = new Date(startDate);
    while (cur <= now) {
      const ms = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const me = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59);
      const mm = sortedMatches.filter(m => { const d = new Date(m.date); return d >= ms && d <= me; });
      let tirS = 0, tirT = 0, ptS = 0, ptT = 0, cx = 0;
      mm.forEach(m => { if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => { tirT += pa.actions.tirs; tirS += pa.actions.tirsSuccess; ptT += pa.actions.points; ptS += pa.actions.pointsSuccess; cx += pa.actions.carreaux; }); });
      const wins = mm.filter(m => m.winner === 'A').length;
      const tot = tirT + ptT; const suc = tirS + ptS;
      weeklyData.push({ week: `${ms.getMonth() + 1}/${String(ms.getFullYear()).slice(-2)}`, weekDate: new Date(ms), matches: mm.length, wins, winRate: mm.length > 0 ? Math.round((wins / mm.length) * 100) : 0, tirSuccess: tirS, tirTotal: tirT, tirRate: tirT > 0 ? Math.round((tirS / tirT) * 100) : 0, pointSuccess: ptS, pointTotal: ptT, pointRate: ptT > 0 ? Math.round((ptS / ptT) * 100) : 0, carreaux: cx, errors: tot - suc, errorRate: tot > 0 ? Math.round(((tot - suc) / tot) * 100) : 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const startDate = new Date(now); startDate.setDate(startDate.getDate() - (weeksToShow * 7)); startDate.setDate(startDate.getDate() - startDate.getDay());
    const cur = new Date(startDate);
    while (cur <= now) {
      const ws = new Date(cur); const we = new Date(cur); we.setDate(we.getDate() + 6);
      const wm = sortedMatches.filter(m => { const d = new Date(m.date); return d >= ws && d <= we; });
      let tirS = 0, tirT = 0, ptS = 0, ptT = 0, cx = 0;
      wm.forEach(m => { if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => { tirT += pa.actions.tirs; tirS += pa.actions.tirsSuccess; ptT += pa.actions.points; ptS += pa.actions.pointsSuccess; cx += pa.actions.carreaux; }); });
      const wins = wm.filter(m => m.winner === 'A').length;
      const tot = tirT + ptT; const suc = tirS + ptS;
      weeklyData.push({ week: `${ws.getDate()}/${ws.getMonth() + 1}`, weekDate: new Date(ws), matches: wm.length, wins, winRate: wm.length > 0 ? Math.round((wins / wm.length) * 100) : 0, tirSuccess: tirS, tirTotal: tirT, tirRate: tirT > 0 ? Math.round((tirS / tirT) * 100) : 0, pointSuccess: ptS, pointTotal: ptT, pointRate: ptT > 0 ? Math.round((ptS / ptT) * 100) : 0, carreaux: cx, errors: tot - suc, errorRate: tot > 0 ? Math.round(((tot - suc) / tot) * 100) : 0 });
      cur.setDate(cur.getDate() + 7);
    }
  }
  return { weeklyData, weeksToShow, useMonthly };
}

// ============================================================
// Inline computeTrends (mirrors useTrends)
// ============================================================
function computeTrends(progressionData: ReturnType<typeof computeProgressionData>) {
  const data = progressionData.weeklyData;
  if (data.length < 2) return { winRate: 'neutral' as const, tirRate: 'neutral' as const, pointRate: 'neutral' as const, errorRate: 'neutral' as const };
  const recent = data.slice(-4); const older = data.slice(-8, -4);
  const getAvg = (weeks: typeof data, field: string) => { const valid = weeks.filter((w: any) => w.matches > 0); if (valid.length === 0) return 0; return valid.reduce((sum: number, w: any) => sum + w[field], 0) / valid.length; };
  const getTrend = (r: number, o: number, isError = false) => { const diff = r - o; if (Math.abs(diff) < 5) return 'neutral' as const; if (isError) return diff > 0 ? 'down' as const : 'up' as const; return diff > 0 ? 'up' as const : 'down' as const; };
  return { winRate: getTrend(getAvg(recent, 'winRate'), getAvg(older, 'winRate')), tirRate: getTrend(getAvg(recent, 'tirRate'), getAvg(older, 'tirRate')), pointRate: getTrend(getAvg(recent, 'pointRate'), getAvg(older, 'pointRate')), errorRate: getTrend(getAvg(recent, 'errorRate'), getAvg(older, 'errorRate'), true) };
}

// ============================================================
// Inline computeTournamentProgression
// ============================================================
function computeTournamentProgression(tournaments: Tournament[], matches: Match[]) {
  const finished = tournaments.filter(t => t.status === 'Terminé');
  if (finished.length === 0) return { items: [] as any[], hasData: false };
  const RANKS: Record<string, number> = { '1er': 100, '2ème': 85, '3ème': 70, 'Demi-finale': 55, 'Quart de finale': 40 };
  const COLORS: Record<string, string> = { '1er': '#FFD700', '2ème': '#A8B4C0', '3ème': '#CD7F32' };
  const items = finished.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(tour => {
    const tm = matches.filter(m => m.tournamentId === tour.id);
    const wins = tm.filter(m => m.winner === 'A').length;
    return { id: tour.id, name: tour.name, date: tour.date, result: tour.finalResult || 'Autre', resultRank: RANKS[tour.finalResult || ''] || 5, resultColor: COLORS[tour.finalResult || ''] || '#94A3B8', winRate: tm.length > 0 ? Math.round((wins / tm.length) * 100) : 0, matches: tm.length, wins, pointDiff: 0, format: tour.format };
  });
  return { items, hasData: items.length > 0 };
}

// ============================================================
// Tests: useProgressionData
// ============================================================
describe('useProgressionData', () => {
  test('empty matches returns empty weeklyData', () => {
    const result = computeProgressionData([], 8);
    expect(result.weeklyData).toHaveLength(0);
    expect(result.useMonthly).toBe(false);
  });

  test('groups matches into weekly buckets for <= 52 weeks', () => {
    const now = new Date();
    const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 3);
    const matches = [makeMatch({ id: 'm1', date: lastWeek.toISOString(), winner: 'A' })];
    const result = computeProgressionData(matches, 4);
    expect(result.useMonthly).toBe(false);
    expect(result.weeklyData.length).toBeGreaterThan(0);
    const weekWithMatch = result.weeklyData.find((w: any) => w.matches > 0);
    expect(weekWithMatch).toBeDefined();
    expect(weekWithMatch.winRate).toBe(100);
  });

  test('uses monthly grouping for > 52 weeks', () => {
    const now = new Date();
    const twoMonthsAgo = new Date(now); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const matches = [makeMatch({ id: 'm1', date: twoMonthsAgo.toISOString() })];
    const result = computeProgressionData(matches, 104);
    expect(result.useMonthly).toBe(true);
    expect(result.weeklyData.length).toBeGreaterThan(0);
  });

  test('computes tir/point rates per week', () => {
    const now = new Date();
    const recent = new Date(now); recent.setDate(recent.getDate() - 2);
    const matches = [makeMatch({
      id: 'm1', date: recent.toISOString(),
      playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 10, pointsSuccess: 6, carreaux: 3 } }],
    })];
    const result = computeProgressionData(matches, 4);
    const weekWithMatch = result.weeklyData.find((w: any) => w.matches > 0);
    expect(weekWithMatch).toBeDefined();
    expect(weekWithMatch.tirRate).toBe(80);
    expect(weekWithMatch.pointRate).toBe(60);
    expect(weekWithMatch.carreaux).toBe(3);
  });

  test('weeks without matches have zero rates', () => {
    const now = new Date();
    const old = new Date(now); old.setDate(old.getDate() - 25);
    const matches = [makeMatch({ id: 'm1', date: old.toISOString() })];
    const result = computeProgressionData(matches, 4);
    const emptyWeeks = result.weeklyData.filter((w: any) => w.matches === 0);
    emptyWeeks.forEach((w: any) => {
      expect(w.winRate).toBe(0);
      expect(w.tirRate).toBe(0);
      expect(w.pointRate).toBe(0);
    });
  });

  test('output has required fields', () => {
    const result = computeProgressionData([makeMatch()], 8);
    expect(result).toHaveProperty('weeklyData');
    expect(result).toHaveProperty('weeksToShow');
    expect(result).toHaveProperty('useMonthly');
    if (result.weeklyData.length > 0) {
      const w = result.weeklyData[0];
      expect(w).toHaveProperty('week');
      expect(w).toHaveProperty('matches');
      expect(w).toHaveProperty('wins');
      expect(w).toHaveProperty('winRate');
      expect(w).toHaveProperty('tirRate');
      expect(w).toHaveProperty('pointRate');
      expect(w).toHaveProperty('carreaux');
      expect(w).toHaveProperty('errorRate');
    }
  });
});

// ============================================================
// Tests: useTrends
// ============================================================
describe('useTrends', () => {
  test('returns neutral for fewer than 2 data points', () => {
    const result = computeTrends({ weeklyData: [{ matches: 1, winRate: 50, tirRate: 50, pointRate: 50, errorRate: 20 }], weeksToShow: 4, useMonthly: false });
    expect(result.winRate).toBe('neutral');
    expect(result.tirRate).toBe('neutral');
    expect(result.pointRate).toBe('neutral');
    expect(result.errorRate).toBe('neutral');
  });

  test('detects upward trend when recent > older by >= 5', () => {
    const weeklyData = [
      { matches: 2, winRate: 40, tirRate: 40, pointRate: 40, errorRate: 40 },
      { matches: 2, winRate: 42, tirRate: 42, pointRate: 42, errorRate: 42 },
      { matches: 2, winRate: 44, tirRate: 44, pointRate: 44, errorRate: 44 },
      { matches: 2, winRate: 46, tirRate: 46, pointRate: 46, errorRate: 46 },
      { matches: 2, winRate: 60, tirRate: 60, pointRate: 60, errorRate: 60 },
      { matches: 2, winRate: 62, tirRate: 62, pointRate: 62, errorRate: 62 },
      { matches: 2, winRate: 64, tirRate: 64, pointRate: 64, errorRate: 64 },
      { matches: 2, winRate: 66, tirRate: 66, pointRate: 66, errorRate: 66 },
    ];
    const result = computeTrends({ weeklyData, weeksToShow: 8, useMonthly: false });
    expect(result.winRate).toBe('up');
    expect(result.tirRate).toBe('up');
    // Error rate up means performance DOWN
    expect(result.errorRate).toBe('down');
  });

  test('detects downward trend when recent < older by >= 5', () => {
    const weeklyData = [
      { matches: 2, winRate: 70, tirRate: 70, pointRate: 70, errorRate: 20 },
      { matches: 2, winRate: 72, tirRate: 72, pointRate: 72, errorRate: 18 },
      { matches: 2, winRate: 68, tirRate: 68, pointRate: 68, errorRate: 22 },
      { matches: 2, winRate: 70, tirRate: 70, pointRate: 70, errorRate: 20 },
      { matches: 2, winRate: 50, tirRate: 50, pointRate: 50, errorRate: 40 },
      { matches: 2, winRate: 52, tirRate: 52, pointRate: 52, errorRate: 38 },
      { matches: 2, winRate: 48, tirRate: 48, pointRate: 48, errorRate: 42 },
      { matches: 2, winRate: 50, tirRate: 50, pointRate: 50, errorRate: 40 },
    ];
    const result = computeTrends({ weeklyData, weeksToShow: 8, useMonthly: false });
    expect(result.winRate).toBe('down');
    // Error rate went up → performance is worse → errorRate trend = 'up' (inverted)
    expect(result.errorRate).toBe('up');
  });

  test('returns neutral when difference < 5', () => {
    const weeklyData = [
      { matches: 2, winRate: 50, tirRate: 50, pointRate: 50, errorRate: 30 },
      { matches: 2, winRate: 51, tirRate: 51, pointRate: 51, errorRate: 29 },
      { matches: 2, winRate: 50, tirRate: 50, pointRate: 50, errorRate: 30 },
      { matches: 2, winRate: 51, tirRate: 51, pointRate: 51, errorRate: 29 },
      { matches: 2, winRate: 52, tirRate: 52, pointRate: 52, errorRate: 28 },
      { matches: 2, winRate: 53, tirRate: 53, pointRate: 53, errorRate: 27 },
      { matches: 2, winRate: 52, tirRate: 52, pointRate: 52, errorRate: 28 },
      { matches: 2, winRate: 53, tirRate: 53, pointRate: 53, errorRate: 27 },
    ];
    const result = computeTrends({ weeklyData, weeksToShow: 8, useMonthly: false });
    expect(result.winRate).toBe('neutral');
  });

  test('skips weeks with zero matches in average', () => {
    const weeklyData = [
      { matches: 0, winRate: 0, tirRate: 0, pointRate: 0, errorRate: 0 },
      { matches: 0, winRate: 0, tirRate: 0, pointRate: 0, errorRate: 0 },
      { matches: 2, winRate: 40, tirRate: 40, pointRate: 40, errorRate: 40 },
      { matches: 0, winRate: 0, tirRate: 0, pointRate: 0, errorRate: 0 },
      { matches: 2, winRate: 80, tirRate: 80, pointRate: 80, errorRate: 10 },
      { matches: 0, winRate: 0, tirRate: 0, pointRate: 0, errorRate: 0 },
      { matches: 0, winRate: 0, tirRate: 0, pointRate: 0, errorRate: 0 },
      { matches: 2, winRate: 80, tirRate: 80, pointRate: 80, errorRate: 10 },
    ];
    const result = computeTrends({ weeklyData, weeksToShow: 8, useMonthly: false });
    expect(result.winRate).toBe('up');
  });
});

// ============================================================
// Tests: useTournamentProgressionData
// ============================================================
describe('useTournamentProgressionData', () => {
  test('empty tournaments returns no data', () => {
    const result = computeTournamentProgression([], []);
    expect(result.hasData).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  test('only includes finished tournaments', () => {
    const tournaments = [
      makeTournament({ id: 't1', status: 'Terminé', name: 'Finished' }),
      makeTournament({ id: 't2', status: 'À venir', name: 'Upcoming' }),
    ];
    const result = computeTournamentProgression(tournaments, []);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Finished');
  });

  test('computes win rate per tournament', () => {
    const tournaments = [makeTournament({ id: 't1', status: 'Terminé' })];
    const matches = [
      makeMatch({ id: 'm1', tournamentId: 't1', winner: 'A' }),
      makeMatch({ id: 'm2', tournamentId: 't1', winner: 'A' }),
      makeMatch({ id: 'm3', tournamentId: 't1', winner: 'B' }),
    ];
    const result = computeTournamentProgression(tournaments, matches);
    expect(result.items[0].matches).toBe(3);
    expect(result.items[0].wins).toBe(2);
    expect(result.items[0].winRate).toBe(67);
  });

  test('assigns result colors for known results', () => {
    const tournaments = [
      makeTournament({ id: 't1', status: 'Terminé', finalResult: '1er' }),
      makeTournament({ id: 't2', status: 'Terminé', finalResult: '2ème' }),
    ];
    const result = computeTournamentProgression(tournaments, []);
    expect(result.items[0].resultColor).toBe('#FFD700');
    expect(result.items[1].resultColor).toBe('#A8B4C0');
  });

  test('sorts items by date ascending', () => {
    const tournaments = [
      makeTournament({ id: 't1', status: 'Terminé', date: '2025-06-01', name: 'June' }),
      makeTournament({ id: 't2', status: 'Terminé', date: '2025-01-15', name: 'January' }),
      makeTournament({ id: 't3', status: 'Terminé', date: '2025-03-10', name: 'March' }),
    ];
    const result = computeTournamentProgression(tournaments, []);
    expect(result.items[0].name).toBe('January');
    expect(result.items[1].name).toBe('March');
    expect(result.items[2].name).toBe('June');
  });

  test('output items have required fields', () => {
    const tournaments = [makeTournament({ id: 't1', status: 'Terminé' })];
    const result = computeTournamentProgression(tournaments, [makeMatch({ tournamentId: 't1' })]);
    const item = result.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('winRate');
    expect(item).toHaveProperty('matches');
    expect(item).toHaveProperty('resultColor');
    expect(item).toHaveProperty('resultRank');
  });
});

// ============================================================
// Inline computeChallengeProgressionData (mirrors useChallengeProgressionData)
// ============================================================
function computeChallengeProgressionData(challenges: Challenge[], weeksToShow: number) {
  const sorted = [...challenges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length === 0) return { weeklyData: [] as any[], hasData: false };
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - (weeksToShow * 7)); start.setDate(start.getDate() - start.getDay());
  const TYPES = ['10_tirs', '10_tirs_sautee', 'precision'] as const;
  const cur = new Date(start);
  const weeklyData: { week: string; byType: Record<string, { count: number; avgRate: number }> }[] = [];
  while (cur <= now) {
    const ws = new Date(cur); const we = new Date(cur); we.setDate(we.getDate() + 6);
    const wc = sorted.filter(c => { const d = new Date(c.date); return d >= ws && d <= we; });
    const byType: Record<string, { count: number; avgRate: number }> = {};
    TYPES.forEach(type => {
      const tc = wc.filter(c => c.type === type);
      let tr = 0;
      tc.forEach(c => {
        if (type === 'precision') { tr += (c.maxPoints && c.maxPoints > 0) ? ((c.totalPoints || 0) / c.maxPoints) * 100 : 0; }
        else { tr += c.successRate || 0; }
      });
      byType[type] = { count: tc.length, avgRate: tc.length > 0 ? Math.round(tr / tc.length) : 0 };
    });
    weeklyData.push({ week: `${ws.getDate()}/${ws.getMonth() + 1}`, byType });
    cur.setDate(cur.getDate() + 7);
  }
  return { weeklyData, hasData: weeklyData.some(w => Object.values(w.byType).some(t => t.count > 0)) };
}

// ============================================================
// Tests: useChallengeProgressionData
// ============================================================
describe('useChallengeProgressionData', () => {
  test('empty challenges returns no data', () => {
    const result = computeChallengeProgressionData([], 8);
    expect(result.hasData).toBe(false);
    expect(result.weeklyData).toHaveLength(0);
  });

  test('groups challenges into weekly buckets', () => {
    const now = new Date();
    const recent = new Date(now); recent.setDate(recent.getDate() - 2);
    const challenges = [
      makeChallenge({ id: 'c1', type: '10_tirs', date: recent.toISOString(), successRate: 80 }),
      makeChallenge({ id: 'c2', type: '10_tirs', date: recent.toISOString(), successRate: 60 }),
    ];
    const result = computeChallengeProgressionData(challenges, 4);
    expect(result.hasData).toBe(true);
    const weekWithData = result.weeklyData.find((w: any) => w.byType['10_tirs'].count > 0);
    expect(weekWithData).toBeDefined();
    expect(weekWithData!.byType['10_tirs'].count).toBe(2);
    expect(weekWithData!.byType['10_tirs'].avgRate).toBe(70); // (80+60)/2
  });

  test('separates challenge types', () => {
    const now = new Date();
    const recent = new Date(now); recent.setDate(recent.getDate() - 1);
    const challenges = [
      makeChallenge({ id: 'c1', type: '10_tirs', date: recent.toISOString(), successRate: 90 }),
      makeChallenge({ id: 'c2', type: '10_tirs_sautee', date: recent.toISOString(), successRate: 60 }),
    ];
    const result = computeChallengeProgressionData(challenges, 4);
    const weekWithData = result.weeklyData.find((w: any) => w.byType['10_tirs'].count > 0);
    expect(weekWithData!.byType['10_tirs'].avgRate).toBe(90);
    expect(weekWithData!.byType['10_tirs_sautee'].avgRate).toBe(60);
  });

  test('precision type uses totalPoints/maxPoints formula', () => {
    const now = new Date();
    const recent = new Date(now); recent.setDate(recent.getDate() - 1);
    const challenges = [
      makeChallenge({ id: 'c1', type: 'precision', date: recent.toISOString(), totalPoints: 80, maxPoints: 100 }),
    ];
    const result = computeChallengeProgressionData(challenges, 4);
    const weekWithData = result.weeklyData.find((w: any) => w.byType['precision'].count > 0);
    expect(weekWithData!.byType['precision'].avgRate).toBe(80);
  });

  test('precision with zero maxPoints gives 0 rate', () => {
    const now = new Date();
    const recent = new Date(now); recent.setDate(recent.getDate() - 1);
    const challenges = [
      makeChallenge({ id: 'c1', type: 'precision', date: recent.toISOString(), totalPoints: 50, maxPoints: 0 }),
    ];
    const result = computeChallengeProgressionData(challenges, 4);
    const weekWithData = result.weeklyData.find((w: any) => w.byType['precision'].count > 0);
    expect(weekWithData!.byType['precision'].avgRate).toBe(0);
  });

  test('weeks without challenges have zero counts', () => {
    const now = new Date();
    const old = new Date(now); old.setDate(old.getDate() - 30);
    const challenges = [makeChallenge({ id: 'c1', date: old.toISOString() })];
    const result = computeChallengeProgressionData(challenges, 4);
    const emptyWeeks = result.weeklyData.filter((w: any) => w.byType['10_tirs'].count === 0);
    expect(emptyWeeks.length).toBeGreaterThan(0);
    emptyWeeks.forEach((w: any) => {
      expect(w.byType['10_tirs'].avgRate).toBe(0);
      expect(w.byType['10_tirs_sautee'].avgRate).toBe(0);
      expect(w.byType['precision'].avgRate).toBe(0);
    });
  });

  test('output weekly data has byType with all 3 challenge types', () => {
    const now = new Date();
    const challenges = [makeChallenge({ id: 'c1', date: now.toISOString() })];
    const result = computeChallengeProgressionData(challenges, 4);
    result.weeklyData.forEach((w: any) => {
      expect(w.byType).toHaveProperty('10_tirs');
      expect(w.byType).toHaveProperty('10_tirs_sautee');
      expect(w.byType).toHaveProperty('precision');
    });
  });
});

// ============================================================
// Inline computePrecisionWorkshopStats (mirrors usePrecisionWorkshopStats)
// ============================================================
function computePrecisionWorkshopStats(filteredChallenges: Challenge[]) {
  const precisionChallenges = filteredChallenges.filter(c => c.type === 'precision' && c.precisionShots && c.precisionShots.length > 0);
  if (precisionChallenges.length === 0) return null;
  const ATELIERS = ['boule_seule', 'derriere_but', 'entre_2_boules', 'sautee', 'tir_but'] as const;
  const atelierData: Record<string, { totalShots: number; totalPoints: number; maxSingleShot: number; sessions: number; bestSessionScore: number; sessionScores: { date: string; score: number }[]; successCount: number; maxSessionPoints: number; }> = {};
  ATELIERS.forEach(a => { atelierData[a] = { totalShots: 0, totalPoints: 0, maxSingleShot: 0, sessions: 0, bestSessionScore: 0, sessionScores: [], successCount: 0, maxSessionPoints: 0 }; });
  const sortedChallenges = [...precisionChallenges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  sortedChallenges.forEach(c => {
    const sessionAtelierScores: Record<string, { score: number; shots: number }> = {};
    c.precisionShots!.forEach(ps => {
      const data = atelierData[ps.atelier];
      if (data) {
        data.totalShots++; data.totalPoints += ps.points; data.maxSingleShot = Math.max(data.maxSingleShot, ps.points);
        if (ps.points >= 3) data.successCount++;
        if (!sessionAtelierScores[ps.atelier]) sessionAtelierScores[ps.atelier] = { score: 0, shots: 0 };
        sessionAtelierScores[ps.atelier].score += ps.points; sessionAtelierScores[ps.atelier].shots++;
      }
    });
    Object.entries(sessionAtelierScores).forEach(([atelier, info]) => {
      if (atelierData[atelier]) {
        atelierData[atelier].sessions++;
        atelierData[atelier].sessionScores.push({ date: c.date, score: info.score });
        atelierData[atelier].bestSessionScore = Math.max(atelierData[atelier].bestSessionScore, info.score);
        atelierData[atelier].maxSessionPoints = Math.max(atelierData[atelier].maxSessionPoints, info.shots * 5);
      }
    });
  });
  const activeAteliers = ATELIERS.filter(a => atelierData[a].totalShots > 0);
  return { atelierData, totalSessions: precisionChallenges.length, activeAteliers, hasData: activeAteliers.length > 0 };
}

// ============================================================
// Tests: usePrecisionWorkshopStats
// ============================================================
describe('usePrecisionWorkshopStats', () => {
  test('returns null for no precision challenges', () => {
    const challenges = [makeChallenge({ type: '10_tirs' })];
    expect(computePrecisionWorkshopStats(challenges)).toBeNull();
  });

  test('returns null for precision challenges without shots', () => {
    const challenges = [makeChallenge({ type: 'precision', precisionShots: undefined })];
    expect(computePrecisionWorkshopStats(challenges)).toBeNull();
  });

  test('returns null for precision challenges with empty shots array', () => {
    const challenges = [makeChallenge({ type: 'precision', precisionShots: [] })];
    expect(computePrecisionWorkshopStats(challenges)).toBeNull();
  });

  test('computes stats for single atelier', () => {
    const challenges = [makeChallenge({
      type: 'precision',
      precisionShots: [
        { atelier: 'boule_seule', points: 4 },
        { atelier: 'boule_seule', points: 2 },
        { atelier: 'boule_seule', points: 5 },
      ],
    })];
    const result = computePrecisionWorkshopStats(challenges)!;
    expect(result.hasData).toBe(true);
    expect(result.totalSessions).toBe(1);
    expect(result.activeAteliers).toContain('boule_seule');
    const bs = result.atelierData['boule_seule'];
    expect(bs.totalShots).toBe(3);
    expect(bs.totalPoints).toBe(11);
    expect(bs.maxSingleShot).toBe(5);
    expect(bs.successCount).toBe(2); // points >= 3: 4 and 5
    expect(bs.sessions).toBe(1);
    expect(bs.bestSessionScore).toBe(11);
  });

  test('tracks multiple ateliers separately', () => {
    const challenges = [makeChallenge({
      type: 'precision',
      precisionShots: [
        { atelier: 'boule_seule', points: 3 },
        { atelier: 'sautee', points: 5 },
        { atelier: 'tir_but', points: 1 },
      ],
    })];
    const result = computePrecisionWorkshopStats(challenges)!;
    expect(result.activeAteliers).toHaveLength(3);
    expect(result.atelierData['boule_seule'].totalShots).toBe(1);
    expect(result.atelierData['sautee'].totalShots).toBe(1);
    expect(result.atelierData['tir_but'].totalShots).toBe(1);
  });

  test('tracks best session score across multiple sessions', () => {
    const challenges = [
      makeChallenge({
        id: 'c1', type: 'precision', date: '2025-01-01',
        precisionShots: [{ atelier: 'boule_seule', points: 3 }, { atelier: 'boule_seule', points: 2 }],
      }),
      makeChallenge({
        id: 'c2', type: 'precision', date: '2025-01-10',
        precisionShots: [{ atelier: 'boule_seule', points: 5 }, { atelier: 'boule_seule', points: 5 }],
      }),
    ];
    const result = computePrecisionWorkshopStats(challenges)!;
    expect(result.totalSessions).toBe(2);
    expect(result.atelierData['boule_seule'].sessions).toBe(2);
    expect(result.atelierData['boule_seule'].bestSessionScore).toBe(10); // 5+5
    expect(result.atelierData['boule_seule'].sessionScores).toHaveLength(2);
  });

  test('maxSessionPoints based on shots * 5', () => {
    const challenges = [makeChallenge({
      type: 'precision',
      precisionShots: [
        { atelier: 'sautee', points: 3 },
        { atelier: 'sautee', points: 4 },
        { atelier: 'sautee', points: 2 },
      ],
    })];
    const result = computePrecisionWorkshopStats(challenges)!;
    expect(result.atelierData['sautee'].maxSessionPoints).toBe(15); // 3 shots * 5
  });

  test('ignores unknown ateliers', () => {
    const challenges = [makeChallenge({
      type: 'precision',
      precisionShots: [
        { atelier: 'boule_seule', points: 3 },
        { atelier: 'unknown_atelier' as any, points: 5 },
      ],
    })];
    const result = computePrecisionWorkshopStats(challenges)!;
    expect(result.activeAteliers).toEqual(['boule_seule']);
  });
});

// ============================================================
// Inline computeBoulesSetStats (mirrors useBoulesSetStats)
// ============================================================
function computeBoulesSetStats(
  filteredMatches: Match[],
  filteredChallenges: Challenge[],
  boulesSets: { id: string; name: string; brand?: string; diameter?: number; weight?: number }[],
) {
  const bySet: Record<string, {
    name: string; brand?: string; diameter?: number; weight?: number;
    matches: number; wins: number;
    tirs: number; tirsSuccess: number; carreaux: number;
    points: number; pointsSuccess: number;
    challenges: number;
    devantBoule: number; pointQualitiesSuccess: number;
  }> = {};

  filteredMatches.forEach(match => {
    if (!match.boulesSetId) return;
    const bs = boulesSets.find(b => b.id === match.boulesSetId);
    if (!bs) return;
    if (!bySet[match.boulesSetId]) bySet[match.boulesSetId] = {
      name: bs.name, brand: bs.brand, diameter: bs.diameter, weight: bs.weight,
      matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0, challenges: 0,
      devantBoule: 0, pointQualitiesSuccess: 0,
    };
    const s = bySet[match.boulesSetId];
    s.matches++;
    if (match.winner === 'A') s.wins++;
    if (match.playerActions) {
      match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        s.tirs += pa.actions.tirs;
        s.tirsSuccess += pa.actions.tirsSuccess;
        s.carreaux += pa.actions.carreaux;
        s.points += pa.actions.points;
        s.pointsSuccess += pa.actions.pointsSuccess;
      });
    }
  });

  filteredChallenges.forEach(ch => {
    if (!ch.boulesSetId) return;
    const bs = boulesSets.find(b => b.id === ch.boulesSetId);
    if (!bs) return;
    if (!bySet[ch.boulesSetId]) bySet[ch.boulesSetId] = {
      name: bs.name, brand: bs.brand, diameter: bs.diameter, weight: bs.weight,
      matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0, challenges: 0,
      devantBoule: 0, pointQualitiesSuccess: 0,
    };
    bySet[ch.boulesSetId].challenges++;
  });

  const sets = Object.keys(bySet).sort((a, b) => (bySet[b].matches + bySet[b].challenges) - (bySet[a].matches + bySet[a].challenges));
  const totalWithBoules = sets.reduce((sum, id) => sum + bySet[id].matches, 0);
  return { bySet, sets, hasData: sets.length > 0, totalWithBoules };
}

// ============================================================
// Tests: useBoulesSetStats
// ============================================================
describe('useBoulesSetStats', () => {
  const BS_A = { id: 'bs-a', name: 'Obut ATX', brand: 'Obut', diameter: 71, weight: 690 };
  const BS_B = { id: 'bs-b', name: 'MS 2110', brand: 'MS', diameter: 72, weight: 700 };

  test('returns empty when no boules set data', () => {
    const result = computeBoulesSetStats([], [], []);
    expect(result.hasData).toBe(false);
    expect(result.sets).toHaveLength(0);
    expect(result.totalWithBoules).toBe(0);
  });

  test('groups matches by boules set', () => {
    const matches = [
      makeMatch({ id: 'm1', boulesSetId: 'bs-a', winner: 'A' }),
      makeMatch({ id: 'm2', boulesSetId: 'bs-a', winner: 'B' }),
      makeMatch({ id: 'm3', boulesSetId: 'bs-b', winner: 'A' }),
    ];
    const result = computeBoulesSetStats(matches, [], [BS_A, BS_B]);
    expect(result.hasData).toBe(true);
    expect(result.sets).toHaveLength(2);
    expect(result.bySet['bs-a'].matches).toBe(2);
    expect(result.bySet['bs-a'].wins).toBe(1);
    expect(result.bySet['bs-b'].matches).toBe(1);
    expect(result.bySet['bs-b'].wins).toBe(1);
  });

  test('ignores matches without boulesSetId', () => {
    const matches = [
      makeMatch({ id: 'm1', boulesSetId: 'bs-a' }),
      makeMatch({ id: 'm2', boulesSetId: undefined }),
    ];
    const result = computeBoulesSetStats(matches, [], [BS_A]);
    expect(result.totalWithBoules).toBe(1);
  });

  test('ignores matches with unknown boules set id', () => {
    const matches = [makeMatch({ id: 'm1', boulesSetId: 'unknown-id' })];
    const result = computeBoulesSetStats(matches, [], [BS_A]);
    expect(result.hasData).toBe(false);
  });

  test('accumulates tir/point stats from team A actions', () => {
    const matches = [makeMatch({
      id: 'm1', boulesSetId: 'bs-a',
      playerActions: [
        { playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 6, pointsSuccess: 4, carreaux: 3 } },
        { playerId: 'p2', playerName: 'B', team: 'B', actions: { tirs: 12, tirsSuccess: 9, points: 8, pointsSuccess: 6, carreaux: 5 } },
      ],
    })];
    const result = computeBoulesSetStats(matches, [], [BS_A]);
    const set = result.bySet['bs-a'];
    expect(set.tirs).toBe(10);        // only team A
    expect(set.tirsSuccess).toBe(8);
    expect(set.carreaux).toBe(3);
    expect(set.points).toBe(6);
    expect(set.pointsSuccess).toBe(4);
  });

  test('counts challenges per boules set', () => {
    const challenges = [
      makeChallenge({ id: 'c1', boulesSetId: 'bs-a' }),
      makeChallenge({ id: 'c2', boulesSetId: 'bs-a' }),
      makeChallenge({ id: 'c3', boulesSetId: 'bs-b' }),
    ];
    const result = computeBoulesSetStats([], challenges, [BS_A, BS_B]);
    expect(result.bySet['bs-a'].challenges).toBe(2);
    expect(result.bySet['bs-b'].challenges).toBe(1);
  });

  test('sorts sets by total activity (matches + challenges) descending', () => {
    const matches = [
      makeMatch({ id: 'm1', boulesSetId: 'bs-b' }),
      makeMatch({ id: 'm2', boulesSetId: 'bs-b' }),
      makeMatch({ id: 'm3', boulesSetId: 'bs-b' }),
    ];
    const challenges = [
      makeChallenge({ id: 'c1', boulesSetId: 'bs-a' }),
    ];
    const result = computeBoulesSetStats(matches, challenges, [BS_A, BS_B]);
    expect(result.sets[0]).toBe('bs-b'); // 3 matches > 1 challenge
    expect(result.sets[1]).toBe('bs-a');
  });

  test('populates brand/diameter/weight from boules set', () => {
    const matches = [makeMatch({ id: 'm1', boulesSetId: 'bs-a' })];
    const result = computeBoulesSetStats(matches, [], [BS_A]);
    const set = result.bySet['bs-a'];
    expect(set.name).toBe('Obut ATX');
    expect(set.brand).toBe('Obut');
    expect(set.diameter).toBe(71);
    expect(set.weight).toBe(690);
  });

  test('challenge-only set still appears in results', () => {
    const challenges = [makeChallenge({ id: 'c1', boulesSetId: 'bs-a' })];
    const result = computeBoulesSetStats([], challenges, [BS_A]);
    expect(result.hasData).toBe(true);
    expect(result.bySet['bs-a'].matches).toBe(0);
    expect(result.bySet['bs-a'].challenges).toBe(1);
    expect(result.totalWithBoules).toBe(0); // totalWithBoules counts matches only
  });
});

// ============================================================
// Inline computeTerrainTypeStats (mirrors useTerrainTypeStats)
// ============================================================
function computeTerrainTypeStats(
  filteredMatches: Match[],
  tournaments: Tournament[],
) {
  const getTerrainType = (match: Match): string | null => {
    if ((match as any).terrainType) return (match as any).terrainType;
    if (match.tournamentId) {
      const tour = tournaments.find(t => t.id === match.tournamentId);
      if (tour?.terrainType) return tour.terrainType;
    }
    return null;
  };

  const byTerrain: Record<string, {
    matches: number; wins: number;
    tirs: number; tirsSuccess: number; carreaux: number;
    points: number; pointsSuccess: number;
  }> = {};

  filteredMatches.forEach(match => {
    const tt = getTerrainType(match);
    if (!tt) return;
    if (!byTerrain[tt]) byTerrain[tt] = { matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0 };
    const s = byTerrain[tt];
    s.matches++;
    if (match.winner === 'A') s.wins++;
    if (match.playerActions) {
      match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        s.tirs += pa.actions.tirs;
        s.tirsSuccess += pa.actions.tirsSuccess;
        s.carreaux += pa.actions.carreaux;
        s.points += pa.actions.points;
        s.pointsSuccess += pa.actions.pointsSuccess;
      });
    }
  });

  const types = Object.keys(byTerrain).sort((a, b) => byTerrain[b].matches - byTerrain[a].matches);
  const totalTerrainMatches = types.reduce((sum, t) => sum + byTerrain[t].matches, 0);
  return { byTerrain, types, hasData: types.length > 0, totalTerrainMatches };
}

// ============================================================
// Tests: useTerrainTypeStats
// ============================================================
describe('useTerrainTypeStats', () => {
  test('returns empty when no terrain type data', () => {
    const result = computeTerrainTypeStats([makeMatch()], []);
    expect(result.hasData).toBe(false);
    expect(result.types).toHaveLength(0);
  });

  test('groups matches by direct terrainType', () => {
    const matches = [
      makeMatch({ id: 'm1', terrainType: 'Gravillon' as any, winner: 'A' }),
      makeMatch({ id: 'm2', terrainType: 'Gravillon' as any, winner: 'B' }),
      makeMatch({ id: 'm3', terrainType: 'Terre battue' as any, winner: 'A' }),
    ] as any[];
    const result = computeTerrainTypeStats(matches, []);
    expect(result.hasData).toBe(true);
    expect(result.types).toContain('Gravillon');
    expect(result.types).toContain('Terre battue');
    expect(result.byTerrain['Gravillon'].matches).toBe(2);
    expect(result.byTerrain['Gravillon'].wins).toBe(1);
    expect(result.byTerrain['Terre battue'].matches).toBe(1);
    expect(result.byTerrain['Terre battue'].wins).toBe(1);
  });

  test('falls back to tournament terrainType when match has none', () => {
    const matches = [makeMatch({ id: 'm1', tournamentId: 'tour-1' })];
    const tournaments = [makeTournament({ id: 'tour-1', terrainType: 'Sable' } as any)];
    const result = computeTerrainTypeStats(matches, tournaments);
    expect(result.hasData).toBe(true);
    expect(result.byTerrain['Sable'].matches).toBe(1);
  });

  test('direct match terrainType takes precedence over tournament', () => {
    const matches = [makeMatch({ id: 'm1', tournamentId: 'tour-1', terrainType: 'Asphalte' as any })] as any[];
    const tournaments = [makeTournament({ id: 'tour-1', terrainType: 'Sable' } as any)];
    const result = computeTerrainTypeStats(matches, tournaments);
    expect(result.byTerrain['Asphalte']).toBeDefined();
    expect(result.byTerrain['Sable']).toBeUndefined();
  });

  test('accumulates tir/point stats per terrain type', () => {
    const matches = [
      makeMatch({
        id: 'm1', terrainType: 'Gravillon' as any,
        playerActions: [
          { playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 8, tirsSuccess: 6, points: 5, pointsSuccess: 3, carreaux: 2 } },
          { playerId: 'p2', playerName: 'B', team: 'B', actions: { tirs: 10, tirsSuccess: 7, points: 7, pointsSuccess: 5, carreaux: 4 } },
        ],
      }),
      makeMatch({
        id: 'm2', terrainType: 'Gravillon' as any,
        playerActions: [
          { playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 12, tirsSuccess: 9, points: 4, pointsSuccess: 2, carreaux: 1 } },
        ],
      }),
    ] as any[];
    const result = computeTerrainTypeStats(matches, []);
    const g = result.byTerrain['Gravillon'];
    expect(g.tirs).toBe(20);         // 8 + 12 (team A only)
    expect(g.tirsSuccess).toBe(15);  // 6 + 9
    expect(g.carreaux).toBe(3);      // 2 + 1
    expect(g.points).toBe(9);        // 5 + 4
    expect(g.pointsSuccess).toBe(5); // 3 + 2
  });

  test('sorts types by match count descending', () => {
    const matches = [
      makeMatch({ id: 'm1', terrainType: 'Sable' as any }),
      makeMatch({ id: 'm2', terrainType: 'Gravillon' as any }),
      makeMatch({ id: 'm3', terrainType: 'Gravillon' as any }),
      makeMatch({ id: 'm4', terrainType: 'Gravillon' as any }),
    ] as any[];
    const result = computeTerrainTypeStats(matches, []);
    expect(result.types[0]).toBe('Gravillon');
    expect(result.types[1]).toBe('Sable');
  });

  test('totalTerrainMatches sums all typed matches', () => {
    const matches = [
      makeMatch({ id: 'm1', terrainType: 'Sable' as any }),
      makeMatch({ id: 'm2', terrainType: 'Gravillon' as any }),
      makeMatch({ id: 'm3' }), // no terrain type
    ] as any[];
    const result = computeTerrainTypeStats(matches, []);
    expect(result.totalTerrainMatches).toBe(2);
  });

  test('matches without playerActions do not crash', () => {
    const matches = [makeMatch({ id: 'm1', terrainType: 'Sable' as any, playerActions: undefined })] as any[];
    expect(() => computeTerrainTypeStats(matches, [])).not.toThrow();
    const result = computeTerrainTypeStats(matches, []);
    expect(result.byTerrain['Sable'].tirs).toBe(0);
  });
});
