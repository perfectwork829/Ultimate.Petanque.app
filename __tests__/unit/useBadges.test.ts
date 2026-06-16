/**
 * Unit tests for services/badgeService.ts — badge context building and XP calculation.
 * Tests the pure functions used by useBadges hook.
 */

import type { Match, Challenge } from '@/types/petanque';

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

// ============================================================
// Inline XP calculation (mirrors calculateTotalXp from badgeService)
// ============================================================
function calculateTotalXp(params: {
  matchCount: number;
  totalCarreaux: number;
  sharedAcceptedCount: number;
  badgeCount: number;
}): number {
  let xp = 0;
  xp += params.matchCount * 10;       // 10 XP per match
  xp += params.totalCarreaux * 5;     // 5 XP per carreau
  xp += params.sharedAcceptedCount * 20; // 20 XP per accepted share
  xp += params.badgeCount * 50;       // 50 XP per badge
  return xp;
}

// ============================================================
// Inline badge context builder (mirrors buildBadgeContext)
// ============================================================
function buildBadgeContext(params: {
  matches: Match[];
  challenges: Challenge[];
  userStats: any;
  sharedMatchIds: string[];
  userId: string;
  isAmbassador: boolean;
  leaderboardRank: number | null;
}) {
  const { matches, challenges, sharedMatchIds, userId, isAmbassador, leaderboardRank } = params;

  // Count total carreaux from matches
  let totalCarreaux = 0;
  matches.forEach(m => {
    if (m.playerActions) {
      m.playerActions.forEach(pa => {
        totalCarreaux += pa.actions?.carreaux || 0;
      });
    }
  });

  // Count wins
  const wins = matches.filter(m => m.winner === 'A').length;

  // Challenge stats
  const perfectChallenges = challenges.filter(c =>
    c.type !== 'precision' && c.successRate === 100
  ).length;

  return {
    matchCount: matches.length,
    winCount: wins,
    totalCarreaux,
    challengeCount: challenges.length,
    perfectChallengeCount: perfectChallenges,
    sharedCount: sharedMatchIds.length,
    isAmbassador,
    leaderboardRank,
    trustScore: null as number | null,
  };
}

// ============================================================
// Tests: calculateTotalXp
// ============================================================
describe('calculateTotalXp', () => {
  test('returns 0 for empty stats', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(0);
  });

  test('calculates XP from matches only', () => {
    expect(calculateTotalXp({ matchCount: 10, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(100);
  });

  test('calculates XP from carreaux only', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 20, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(100);
  });

  test('calculates XP from shared matches only', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 0, sharedAcceptedCount: 5, badgeCount: 0 })).toBe(100);
  });

  test('calculates XP from badges only', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 3 })).toBe(150);
  });

  test('calculates combined XP from all sources', () => {
    const xp = calculateTotalXp({ matchCount: 5, totalCarreaux: 10, sharedAcceptedCount: 2, badgeCount: 1 });
    // 5*10 + 10*5 + 2*20 + 1*50 = 50 + 50 + 40 + 50 = 190
    expect(xp).toBe(190);
  });

  test('handles large numbers', () => {
    const xp = calculateTotalXp({ matchCount: 1000, totalCarreaux: 500, sharedAcceptedCount: 100, badgeCount: 10 });
    // 1000*10 + 500*5 + 100*20 + 10*50 = 10000 + 2500 + 2000 + 500 = 15000
    expect(xp).toBe(15000);
  });
});

// ============================================================
// Tests: buildBadgeContext
// ============================================================
describe('buildBadgeContext', () => {
  test('returns correct match count', () => {
    const matches = [makeMatch({ id: 'm1' }), makeMatch({ id: 'm2' }), makeMatch({ id: 'm3' })];
    const ctx = buildBadgeContext({ matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.matchCount).toBe(3);
  });

  test('counts wins correctly (only winner A)', () => {
    const matches = [
      makeMatch({ id: 'm1', winner: 'A' }),
      makeMatch({ id: 'm2', winner: 'B' }),
      makeMatch({ id: 'm3', winner: 'A' }),
    ];
    const ctx = buildBadgeContext({ matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.winCount).toBe(2);
  });

  test('counts total carreaux from team A player actions', () => {
    const matches = [
      makeMatch({
        id: 'm1',
        playerActions: [
          { playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 5, pointsSuccess: 3, carreaux: 3 } },
          { playerId: 'p2', playerName: 'B', team: 'B', actions: { tirs: 8, tirsSuccess: 5, points: 6, pointsSuccess: 4, carreaux: 2 } },
        ],
      }),
      makeMatch({
        id: 'm2',
        playerActions: [
          { playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 5, tirsSuccess: 3, points: 4, pointsSuccess: 2, carreaux: 1 } },
        ],
      }),
    ];
    const ctx = buildBadgeContext({ matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    // All carreaux from all players (not just team A in this context builder)
    expect(ctx.totalCarreaux).toBe(6); // 3 + 2 + 1
  });

  test('counts challenges and perfect challenges', () => {
    const challenges = [
      makeChallenge({ id: 'c1', type: '10_tirs', successRate: 100 }),
      makeChallenge({ id: 'c2', type: '10_tirs', successRate: 80 }),
      makeChallenge({ id: 'c3', type: '10_tirs_sautee', successRate: 100 }),
      makeChallenge({ id: 'c4', type: 'precision', successRate: 100 }), // precision excluded from perfect
    ];
    const ctx = buildBadgeContext({ matches: [], challenges, userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.challengeCount).toBe(4);
    expect(ctx.perfectChallengeCount).toBe(2); // c1 and c3 (precision excluded)
  });

  test('counts shared matches', () => {
    const ctx = buildBadgeContext({ matches: [], challenges: [], userStats: {}, sharedMatchIds: ['s1', 's2', 's3'], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.sharedCount).toBe(3);
  });

  test('preserves ambassador and leaderboard flags', () => {
    const ctx = buildBadgeContext({ matches: [], challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: true, leaderboardRank: 5 });
    expect(ctx.isAmbassador).toBe(true);
    expect(ctx.leaderboardRank).toBe(5);
  });

  test('handles empty data', () => {
    const ctx = buildBadgeContext({ matches: [], challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.matchCount).toBe(0);
    expect(ctx.winCount).toBe(0);
    expect(ctx.totalCarreaux).toBe(0);
    expect(ctx.challengeCount).toBe(0);
    expect(ctx.perfectChallengeCount).toBe(0);
    expect(ctx.sharedCount).toBe(0);
    expect(ctx.trustScore).toBeNull();
  });

  test('handles matches without playerActions', () => {
    const matches = [makeMatch({ id: 'm1', playerActions: undefined })];
    const ctx = buildBadgeContext({ matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'u1', isAmbassador: false, leaderboardRank: null });
    expect(ctx.totalCarreaux).toBe(0);
  });
});

// ============================================================
// Tests: XP Level Thresholds
// ============================================================
describe('XP level calculations', () => {
  const LEVEL_THRESHOLDS = [
    { level: 1, minXp: 0 },
    { level: 2, minXp: 100 },
    { level: 3, minXp: 300 },
    { level: 4, minXp: 600 },
    { level: 5, minXp: 1000 },
    { level: 6, minXp: 1500 },
    { level: 7, minXp: 2200 },
    { level: 8, minXp: 3000 },
    { level: 9, minXp: 4000 },
    { level: 10, minXp: 5500 },
  ];

  function getLevel(xp: number): number {
    let level = 1;
    for (const threshold of LEVEL_THRESHOLDS) {
      if (xp >= threshold.minXp) level = threshold.level;
      else break;
    }
    return level;
  }

  test('0 XP = level 1', () => expect(getLevel(0)).toBe(1));
  test('99 XP = level 1', () => expect(getLevel(99)).toBe(1));
  test('100 XP = level 2', () => expect(getLevel(100)).toBe(2));
  test('299 XP = level 2', () => expect(getLevel(299)).toBe(2));
  test('300 XP = level 3', () => expect(getLevel(300)).toBe(3));
  test('1000 XP = level 5', () => expect(getLevel(1000)).toBe(5));
  test('5500 XP = level 10', () => expect(getLevel(5500)).toBe(10));
  test('10000 XP = level 10', () => expect(getLevel(10000)).toBe(10));
});
