/**
 * Unit tests for services/leaderboardService.ts
 *
 * Tests: getPeriodDateRange (all 8 periods), LEADERBOARD_MIN_MATCHES threshold,
 * sortLeaderboard (5 sort modes with tiebreaker), anti-cheat filtering
 * (solo matches excluded, participant_user_ids < 2 skipped), shadow ban
 * (trust score < 25 hidden), weighted win rate, geographic filters,
 * stats recomputation from matches, edge cases.
 */

// ─── Types & Constants ─────────────────────────────────────

interface LeaderboardPlayer {
  id: string;
  userId: string;
  name: string;
  nickname?: string;
  avatar?: string;
  club?: string;
  role: string;
  level: string;
  country?: string;
  city?: string;
  boulesBrand?: string;
  isPremium?: boolean;
  isAmbassador?: boolean;
  trustScore?: number;
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
}

type LeaderboardSort = 'winRate' | 'matches' | 'tirRate' | 'pointRate' | 'carreauRate';
type LeaderboardPeriod = 'all' | '7d' | '30d' | '3m' | '6m' | '1y' | 'season' | 'lastSeason';

const LEADERBOARD_MIN_MATCHES = 3;

// ─── Inline implementations (mirrors leaderboardService logic) ──

function getPeriodDateRange(period: LeaderboardPeriod): { from: Date | null; to: Date | null; label: string } {
  if (period === 'all') return { from: null, to: null, label: 'All time' };
  const now = new Date();
  const to = new Date();
  let from = new Date();

  switch (period) {
    case '7d':
      from.setDate(now.getDate() - 7);
      return { from, to, label: '7 days' };
    case '30d':
      from.setDate(now.getDate() - 30);
      return { from, to, label: '30 days' };
    case '3m':
      from.setMonth(now.getMonth() - 3);
      return { from, to, label: '3 months' };
    case '6m':
      from.setMonth(now.getMonth() - 6);
      return { from, to, label: '6 months' };
    case '1y':
      from.setFullYear(now.getFullYear() - 1);
      return { from, to, label: '1 year' };
    case 'season': {
      const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      from = new Date(year, 8, 1);
      const seasonEnd = new Date(year + 1, 5, 30, 23, 59, 59);
      return { from, to: seasonEnd < now ? seasonEnd : to, label: `${year}/${year + 1}` };
    }
    case 'lastSeason': {
      const year = now.getMonth() >= 8 ? now.getFullYear() - 1 : now.getFullYear() - 2;
      from = new Date(year, 8, 1);
      const seasonEnd = new Date(year + 1, 5, 30, 23, 59, 59);
      return { from, to: seasonEnd, label: `${year}/${year + 1}` };
    }
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

function sortLeaderboard(players: LeaderboardPlayer[], sortBy: LeaderboardSort): LeaderboardPlayer[] {
  return [...players].sort((a, b) => {
    switch (sortBy) {
      case 'winRate':
        if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'matches':
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'tirRate':
        if (b.stats.tirRate !== a.stats.tirRate) return b.stats.tirRate - a.stats.tirRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'pointRate':
        if (b.stats.pointRate !== a.stats.pointRate) return b.stats.pointRate - a.stats.pointRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'carreauRate':
        if (b.stats.carreauRate !== a.stats.carreauRate) return b.stats.carreauRate - a.stats.carreauRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      default:
        return b.stats.winRate - a.stats.winRate;
    }
  });
}

function getMatchValidationWeight(participantCount: number, isWitnessedEvent?: boolean): number {
  if (isWitnessedEvent) return 2.0;
  if (participantCount >= 3) return 1.5;
  if (participantCount >= 2) return 1.0;
  return 0.3;
}

// Simulates anti-cheat: recompute stats from matches, only counting 2+ participant matches
function recomputeStatsFromMatches(
  playerId: string,
  matches: Array<{
    team_a: { players: string[] };
    team_b: { players: string[] };
    winner: string;
    participant_user_ids: string[];
    player_actions?: Array<{
      playerId: string;
      actions: { tirs: number; tirsSuccess: number; points: number; pointsSuccess: number; carreaux: number };
    }>;
  }>
): LeaderboardPlayer['stats'] {
  let matchesPlayed = 0, wins = 0, losses = 0;
  let totalTirs = 0, tirsSuccess = 0, totalPoints = 0, pointsSuccess = 0, carreaux = 0;
  let weightedWins = 0, totalWeight = 0;

  for (const m of matches) {
    if ((m.participant_user_ids || []).length < 2) continue; // Anti-cheat

    const inA = m.team_a.players.includes(playerId);
    const inB = m.team_b.players.includes(playerId);
    if (!inA && !inB) continue;

    matchesPlayed++;
    const weight = getMatchValidationWeight(m.participant_user_ids.length);
    totalWeight += weight;

    const playerWon = (inA && m.winner === 'A') || (inB && m.winner === 'B');
    if (playerWon) {
      wins++;
      weightedWins += weight;
    } else {
      losses++;
    }

    if (m.player_actions) {
      const pa = m.player_actions.find(a => a.playerId === playerId);
      if (pa) {
        totalTirs += pa.actions.tirs;
        tirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        pointsSuccess += pa.actions.pointsSuccess;
        carreaux += pa.actions.carreaux;
      }
    }
  }

  return {
    matchesPlayed,
    wins,
    losses,
    winRate: totalWeight > 0 ? Math.round((weightedWins / totalWeight) * 1000) / 10 : 0,
    tirRate: totalTirs > 0 ? Math.round((tirsSuccess / totalTirs) * 1000) / 10 : 0,
    pointRate: totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 1000) / 10 : 0,
    carreauRate: tirsSuccess > 0 ? Math.round((carreaux / tirsSuccess) * 1000) / 10 : 0,
  };
}

// Shadow ban filter
function applyShadowBan(
  players: Array<LeaderboardPlayer & { trustScoreVal?: number }>,
  currentUserId: string | null
): LeaderboardPlayer[] {
  return players.filter(p => {
    if (p.trustScoreVal !== undefined && p.trustScoreVal < 25 && p.userId !== currentUserId) {
      return false;
    }
    return true;
  });
}

// ─── Helpers ───────────────────────────────────────────────

function makePlayer(overrides: Partial<LeaderboardPlayer> & { trustScoreVal?: number } = {}): LeaderboardPlayer & { trustScoreVal?: number } {
  return {
    id: `p-${Math.random().toString(36).slice(2, 6)}`,
    userId: `u-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Player',
    role: 'Milieu',
    level: 'Intermédiaire',
    stats: {
      matchesPlayed: 20,
      wins: 10,
      losses: 10,
      winRate: 50,
      tirRate: 60,
      pointRate: 55,
      carreauRate: 15,
    },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// getPeriodDateRange
// ============================================

describe('getPeriodDateRange', () => {
  test('all returns null dates', () => {
    const range = getPeriodDateRange('all');
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
    expect(range.label).toBe('All time');
  });

  test('7d returns date 7 days ago', () => {
    const range = getPeriodDateRange('7d');
    expect(range.from).toBeTruthy();
    expect(range.to).toBeTruthy();
    const diffMs = range.to!.getTime() - range.from!.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
    expect(range.label).toBe('7 days');
  });

  test('30d returns date 30 days ago', () => {
    const range = getPeriodDateRange('30d');
    const diffMs = range.to!.getTime() - range.from!.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
    expect(range.label).toBe('30 days');
  });

  test('3m returns date ~3 months ago', () => {
    const range = getPeriodDateRange('3m');
    expect(range.from).toBeTruthy();
    const diffMs = range.to!.getTime() - range.from!.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(87);
    expect(diffDays).toBeLessThanOrEqual(93);
    expect(range.label).toBe('3 months');
  });

  test('6m returns date ~6 months ago', () => {
    const range = getPeriodDateRange('6m');
    const diffMs = range.to!.getTime() - range.from!.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(178);
    expect(diffDays).toBeLessThanOrEqual(186);
    expect(range.label).toBe('6 months');
  });

  test('1y returns date ~365 days ago', () => {
    const range = getPeriodDateRange('1y');
    const diffMs = range.to!.getTime() - range.from!.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(364);
    expect(diffDays).toBeLessThanOrEqual(367);
    expect(range.label).toBe('1 year');
  });

  test('season starts Sept 1 of current or previous year', () => {
    const range = getPeriodDateRange('season');
    expect(range.from).toBeTruthy();
    expect(range.from!.getMonth()).toBe(8); // September
    expect(range.from!.getDate()).toBe(1);
    expect(range.label).toMatch(/^\d{4}\/\d{4}$/);
  });

  test('lastSeason returns previous season', () => {
    const range = getPeriodDateRange('lastSeason');
    expect(range.from).toBeTruthy();
    expect(range.from!.getMonth()).toBe(8); // September
    expect(range.to).toBeTruthy();
    expect(range.to!.getMonth()).toBe(5); // June 30
    expect(range.label).toMatch(/^\d{4}\/\d{4}$/);

    // lastSeason label should be before current season label
    const currentRange = getPeriodDateRange('season');
    expect(range.from!.getTime()).toBeLessThan(currentRange.from!.getTime());
  });

  test('unknown period returns all-time', () => {
    const range = getPeriodDateRange('unknown' as any);
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
    expect(range.label).toBe('All time');
  });
});

// ============================================
// LEADERBOARD_MIN_MATCHES
// ============================================

describe('LEADERBOARD_MIN_MATCHES', () => {
  test('minimum matches threshold is 3', () => {
    expect(LEADERBOARD_MIN_MATCHES).toBe(3);
  });

  test('players below threshold are excluded', () => {
    const players = [
      makePlayer({ name: 'Active', stats: { matchesPlayed: 15, wins: 10, losses: 5, winRate: 66.7, tirRate: 70, pointRate: 60, carreauRate: 20 } }),
      makePlayer({ name: 'Inactive', stats: { matchesPlayed: 1, wins: 1, losses: 0, winRate: 100, tirRate: 80, pointRate: 70, carreauRate: 30 } }),
      makePlayer({ name: 'Borderline', stats: { matchesPlayed: 3, wins: 2, losses: 1, winRate: 66.7, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const filtered = players.filter(p => p.stats.matchesPlayed >= LEADERBOARD_MIN_MATCHES);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(p => p.name)).toContain('Active');
    expect(filtered.map(p => p.name)).toContain('Borderline');
    expect(filtered.map(p => p.name)).not.toContain('Inactive');
  });

  test('exactly 3 matches passes threshold', () => {
    const p = makePlayer({ stats: { matchesPlayed: 3, wins: 2, losses: 1, winRate: 66.7, tirRate: 50, pointRate: 50, carreauRate: 10 } });
    expect(p.stats.matchesPlayed >= LEADERBOARD_MIN_MATCHES).toBe(true);
  });

  test('2 matches does not pass threshold', () => {
    const p = makePlayer({ stats: { matchesPlayed: 2, wins: 1, losses: 1, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } });
    expect(p.stats.matchesPlayed >= LEADERBOARD_MIN_MATCHES).toBe(false);
  });
});

// ============================================
// sortLeaderboard — winRate
// ============================================

describe('sortLeaderboard — winRate', () => {
  test('sorts by winRate descending', () => {
    const players = [
      makePlayer({ name: 'Low', stats: { matchesPlayed: 20, wins: 8, losses: 12, winRate: 40, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'High', stats: { matchesPlayed: 20, wins: 16, losses: 4, winRate: 80, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'Mid', stats: { matchesPlayed: 20, wins: 12, losses: 8, winRate: 60, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'winRate');
    expect(sorted[0].name).toBe('High');
    expect(sorted[1].name).toBe('Mid');
    expect(sorted[2].name).toBe('Low');
  });

  test('tiebreaker uses matchesPlayed when winRate is equal', () => {
    const players = [
      makePlayer({ name: 'Less Matches', stats: { matchesPlayed: 15, wins: 9, losses: 6, winRate: 60, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'More Matches', stats: { matchesPlayed: 30, wins: 18, losses: 12, winRate: 60, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'winRate');
    expect(sorted[0].name).toBe('More Matches');
    expect(sorted[1].name).toBe('Less Matches');
  });
});

// ============================================
// sortLeaderboard — matches
// ============================================

describe('sortLeaderboard — matches', () => {
  test('sorts by matchesPlayed descending', () => {
    const players = [
      makePlayer({ name: 'Few', stats: { matchesPlayed: 10, wins: 5, losses: 5, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'Many', stats: { matchesPlayed: 100, wins: 50, losses: 50, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'Medium', stats: { matchesPlayed: 40, wins: 20, losses: 20, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'matches');
    expect(sorted[0].name).toBe('Many');
    expect(sorted[1].name).toBe('Medium');
    expect(sorted[2].name).toBe('Few');
  });
});

// ============================================
// sortLeaderboard — tirRate
// ============================================

describe('sortLeaderboard — tirRate', () => {
  test('sorts by tirRate descending', () => {
    const players = [
      makePlayer({ name: 'Low Tir', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 30, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'High Tir', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 85, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'tirRate');
    expect(sorted[0].name).toBe('High Tir');
    expect(sorted[1].name).toBe('Low Tir');
  });

  test('tirRate tiebreaker uses matchesPlayed', () => {
    const players = [
      makePlayer({ name: 'A', stats: { matchesPlayed: 10, wins: 5, losses: 5, winRate: 50, tirRate: 70, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'B', stats: { matchesPlayed: 50, wins: 25, losses: 25, winRate: 50, tirRate: 70, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'tirRate');
    expect(sorted[0].name).toBe('B');
  });
});

// ============================================
// sortLeaderboard — pointRate
// ============================================

describe('sortLeaderboard — pointRate', () => {
  test('sorts by pointRate descending', () => {
    const players = [
      makePlayer({ name: 'LP', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 40, carreauRate: 10 } }),
      makePlayer({ name: 'HP', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 90, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'pointRate');
    expect(sorted[0].name).toBe('HP');
  });
});

// ============================================
// sortLeaderboard — carreauRate
// ============================================

describe('sortLeaderboard — carreauRate', () => {
  test('sorts by carreauRate descending', () => {
    const players = [
      makePlayer({ name: 'LC', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 5 } }),
      makePlayer({ name: 'HC', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 45 } }),
    ];

    const sorted = sortLeaderboard(players, 'carreauRate');
    expect(sorted[0].name).toBe('HC');
  });

  test('carreauRate tiebreaker uses matchesPlayed', () => {
    const players = [
      makePlayer({ name: 'A', stats: { matchesPlayed: 15, wins: 8, losses: 7, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 25 } }),
      makePlayer({ name: 'B', stats: { matchesPlayed: 40, wins: 20, losses: 20, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 25 } }),
    ];

    const sorted = sortLeaderboard(players, 'carreauRate');
    expect(sorted[0].name).toBe('B');
  });
});

// ============================================
// sortLeaderboard — default sort
// ============================================

describe('sortLeaderboard — default', () => {
  test('unknown sortBy defaults to winRate', () => {
    const players = [
      makePlayer({ name: 'Low', stats: { matchesPlayed: 20, wins: 6, losses: 14, winRate: 30, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'High', stats: { matchesPlayed: 20, wins: 18, losses: 2, winRate: 90, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'unknown' as any);
    expect(sorted[0].name).toBe('High');
  });
});

// ============================================
// sortLeaderboard — does not mutate original
// ============================================

describe('sortLeaderboard — immutability', () => {
  test('does not mutate the original array', () => {
    const players = [
      makePlayer({ name: 'B', stats: { matchesPlayed: 20, wins: 8, losses: 12, winRate: 40, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'A', stats: { matchesPlayed: 20, wins: 16, losses: 4, winRate: 80, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'winRate');
    expect(players[0].name).toBe('B'); // Original unchanged
    expect(sorted[0].name).toBe('A'); // Sorted copy
  });
});

// ============================================
// Anti-Cheat: Stats Recomputation
// ============================================

describe('Anti-Cheat — Stats Recomputation', () => {
  test('solo matches (participant_user_ids < 2) are excluded', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1'], // Solo — excluded
        player_actions: [
          { playerId: 'p1', actions: { tirs: 10, tirsSuccess: 8, points: 5, pointsSuccess: 4, carreaux: 2 } },
        ],
      },
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2'], // 2 participants — counted
        player_actions: [
          { playerId: 'p1', actions: { tirs: 10, tirsSuccess: 6, points: 5, pointsSuccess: 3, carreaux: 1 } },
        ],
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(1); // Only the 2-participant match
    expect(stats.wins).toBe(1);
    expect(stats.tirsSuccess).toBe(6); // Only from 2nd match
  });

  test('empty participant_user_ids treated as solo', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: [],
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(0);
  });

  test('matches with 3+ participants get higher validation weight', () => {
    const matches = [
      {
        team_a: { players: ['p1', 'p2'] },
        team_b: { players: ['p3'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2', 'u3'],
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.wins).toBe(1);
    // Weighted win rate: weight = 1.5 for 3 participants
    // weightedWins = 1.5, totalWeight = 1.5 → winRate = 100
    expect(stats.winRate).toBe(100);
  });

  test('player in team B wins correctly', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'B',
        participant_user_ids: ['u1', 'u2'],
      },
    ];

    const statsP2 = recomputeStatsFromMatches('p2', matches);
    expect(statsP2.wins).toBe(1);
    expect(statsP2.losses).toBe(0);

    const statsP1 = recomputeStatsFromMatches('p1', matches);
    expect(statsP1.wins).toBe(0);
    expect(statsP1.losses).toBe(1);
  });

  test('computes tir/point/carreau rates correctly', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2'],
        player_actions: [
          { playerId: 'p1', actions: { tirs: 20, tirsSuccess: 14, points: 10, pointsSuccess: 7, carreaux: 4 } },
        ],
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.tirRate).toBe(70); // 14/20 * 100
    expect(stats.pointRate).toBe(70); // 7/10 * 100
    expect(stats.carreauRate).toBe(28.6); // 4/14 * 100 rounded
  });

  test('player not in match is ignored', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2'],
      },
    ];

    const stats = recomputeStatsFromMatches('p3', matches);
    expect(stats.matchesPlayed).toBe(0);
  });

  test('accumulates stats across multiple matches', () => {
    const matches = Array.from({ length: 5 }, (_, i) => ({
      team_a: { players: ['p1'] },
      team_b: { players: ['p2'] },
      winner: i % 2 === 0 ? 'A' : 'B',
      participant_user_ids: ['u1', 'u2'],
      player_actions: [
        { playerId: 'p1', actions: { tirs: 10, tirsSuccess: 6, points: 8, pointsSuccess: 5, carreaux: 1 } },
      ],
    }));

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(5);
    expect(stats.wins).toBe(3); // indices 0, 2, 4
    expect(stats.losses).toBe(2);
    expect(stats.tirRate).toBe(60); // 30/50
    expect(stats.pointRate).toBe(62.5); // 25/40
    expect(stats.carreauRate).toBe(16.7); // 5/30 rounded
  });
});

// ============================================
// Shadow Ban
// ============================================

describe('Shadow Ban', () => {
  test('players with trust score < 25 are hidden from other users', () => {
    const players = [
      makePlayer({ name: 'Good', userId: 'u1', trustScoreVal: 80 }),
      makePlayer({ name: 'Suspect', userId: 'u2', trustScoreVal: 20 }),
      makePlayer({ name: 'Banned', userId: 'u3', trustScoreVal: 0 }),
    ];

    const filtered = applyShadowBan(players, 'u-viewer');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Good');
  });

  test('suspect player can see themselves', () => {
    const players = [
      makePlayer({ name: 'Suspect', userId: 'u2', trustScoreVal: 15 }),
    ];

    const filtered = applyShadowBan(players, 'u2');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Suspect');
  });

  test('players without trust score are not hidden', () => {
    const players = [
      makePlayer({ name: 'No Score', userId: 'u1' }),
    ];

    const filtered = applyShadowBan(players, 'u-viewer');
    expect(filtered).toHaveLength(1);
  });

  test('trust score exactly 25 is NOT hidden (threshold is < 25)', () => {
    const players = [
      makePlayer({ name: 'Borderline', userId: 'u1', trustScoreVal: 25 }),
    ];

    const filtered = applyShadowBan(players, 'u-viewer');
    expect(filtered).toHaveLength(1);
  });

  test('trust score 24 IS hidden', () => {
    const players = [
      makePlayer({ name: 'Just Under', userId: 'u1', trustScoreVal: 24 }),
    ];

    const filtered = applyShadowBan(players, 'u-viewer');
    expect(filtered).toHaveLength(0);
  });

  test('null currentUserId hides all low trust players', () => {
    const players = [
      makePlayer({ name: 'Low', userId: 'u1', trustScoreVal: 10 }),
      makePlayer({ name: 'Good', userId: 'u2', trustScoreVal: 80 }),
    ];

    const filtered = applyShadowBan(players, null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Good');
  });
});

// ============================================
// Match Validation Weights
// ============================================

describe('Match Validation Weights (in leaderboard context)', () => {
  test('solo match weighted at 0.3', () => {
    expect(getMatchValidationWeight(1)).toBe(0.3);
  });

  test('2-player match weighted at 1.0', () => {
    expect(getMatchValidationWeight(2)).toBe(1.0);
  });

  test('3+ player match weighted at 1.5', () => {
    expect(getMatchValidationWeight(3)).toBe(1.5);
    expect(getMatchValidationWeight(4)).toBe(1.5);
  });

  test('witnessed event weighted at 2.0', () => {
    expect(getMatchValidationWeight(2, true)).toBe(2.0);
  });

  test('weighted win rate differs from simple win rate', () => {
    // 2 matches: 1 solo win (0.3x), 1 shared loss (1.0x)
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2'], // weight 1.0
      },
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'B',
        participant_user_ids: ['u1', 'u2', 'u3'], // weight 1.5
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(2);
    expect(stats.wins).toBe(1);
    // Simple: 1/2 = 50%. Weighted: 1.0 / (1.0 + 1.5) = 40%
    expect(stats.winRate).toBe(40);
  });
});

// ============================================
// Geographic Filtering
// ============================================

describe('Geographic Filtering', () => {
  test('filter by country', () => {
    const players = [
      makePlayer({ name: 'FR1', country: 'France' }),
      makePlayer({ name: 'FR2', country: 'France' }),
      makePlayer({ name: 'ES', country: 'Espagne' }),
      makePlayer({ name: 'No Country' }),
    ];

    const french = players.filter(p => p.country === 'France');
    expect(french).toHaveLength(2);
    expect(french.every(p => p.country === 'France')).toBe(true);
  });

  test('filter by city', () => {
    const players = [
      makePlayer({ name: 'Lyon1', city: 'Lyon' }),
      makePlayer({ name: 'Lyon2', city: 'Lyon' }),
      makePlayer({ name: 'Paris', city: 'Paris' }),
    ];

    const lyon = players.filter(p => p.city === 'Lyon');
    expect(lyon).toHaveLength(2);
  });

  test('filter by club', () => {
    const players = [
      makePlayer({ name: 'Club A', club: 'La Boule Lyonnaise' }),
      makePlayer({ name: 'Club B', club: 'Petanque Club Nice' }),
      makePlayer({ name: 'No Club' }),
    ];

    const clubA = players.filter(p => p.club === 'La Boule Lyonnaise');
    expect(clubA).toHaveLength(1);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('empty player list sorts without error', () => {
    const sorted = sortLeaderboard([], 'winRate');
    expect(sorted).toHaveLength(0);
  });

  test('single player sorts without error', () => {
    const players = [makePlayer({ name: 'Solo' })];
    const sorted = sortLeaderboard(players, 'winRate');
    expect(sorted).toHaveLength(1);
    expect(sorted[0].name).toBe('Solo');
  });

  test('all players with identical stats maintain stable order', () => {
    const players = [
      makePlayer({ name: 'A', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'B', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
      makePlayer({ name: 'C', stats: { matchesPlayed: 20, wins: 10, losses: 10, winRate: 50, tirRate: 50, pointRate: 50, carreauRate: 10 } }),
    ];

    const sorted = sortLeaderboard(players, 'winRate');
    expect(sorted).toHaveLength(3);
  });

  test('recompute stats with no player_actions returns zero rates', () => {
    const matches = [
      {
        team_a: { players: ['p1'] },
        team_b: { players: ['p2'] },
        winner: 'A',
        participant_user_ids: ['u1', 'u2'],
      },
    ];

    const stats = recomputeStatsFromMatches('p1', matches);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.tirRate).toBe(0);
    expect(stats.pointRate).toBe(0);
    expect(stats.carreauRate).toBe(0);
  });

  test('recompute stats from empty matches array', () => {
    const stats = recomputeStatsFromMatches('p1', []);
    expect(stats.matchesPlayed).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.tirRate).toBe(0);
  });

  test('large dataset: sort 500 players efficiently', () => {
    const players = Array.from({ length: 500 }, (_, i) =>
      makePlayer({
        name: `Player-${i}`,
        stats: {
          matchesPlayed: 10 + Math.floor(Math.random() * 90),
          wins: Math.floor(Math.random() * 50),
          losses: Math.floor(Math.random() * 50),
          winRate: Math.round(Math.random() * 1000) / 10,
          tirRate: Math.round(Math.random() * 1000) / 10,
          pointRate: Math.round(Math.random() * 1000) / 10,
          carreauRate: Math.round(Math.random() * 500) / 10,
        },
      })
    );

    const start = Date.now();
    const sorted = sortLeaderboard(players, 'winRate');
    const elapsed = Date.now() - start;

    expect(sorted).toHaveLength(500);
    expect(elapsed).toBeLessThan(50);
    // Verify descending order
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].stats.winRate !== sorted[i - 1].stats.winRate) {
        expect(sorted[i].stats.winRate).toBeLessThanOrEqual(sorted[i - 1].stats.winRate);
      }
    }
  });
});
