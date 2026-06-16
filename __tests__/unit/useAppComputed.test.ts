/**
 * Unit tests for hooks/useAppComputed.ts
 * Tests: computeUserStats, computeChallengeStats, computePlayersWithStats,
 *        computeSelfPlayer, computeClubsWithMemberCount
 */

import {
  computeUserStats,
  computeChallengeStats,
  computeSelfPlayer,
  computeClubsWithMemberCount,
} from '@/hooks/useAppComputed';
import type { Match, Challenge, Player, Club } from '@/types/petanque';

// ============================================================
// Test Data Factories
// ============================================================
const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'match-1',
  date: new Date().toISOString(),
  mode: 'Entraînement',
  format: 'Doublette',
  teamA: { players: ['user-1'], playerNames: ['Alice'], score: 13 },
  teamB: { players: ['p-2'], playerNames: ['Bob'], score: 8 },
  winner: 'A',
  duration: 45,
  menes: [],
  playerActions: [
    {
      playerId: 'user-1',
      playerName: 'Alice',
      team: 'A',
      actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 },
    },
  ],
  ...overrides,
});

const makeChallenge = (overrides: Partial<Challenge> = {}): Challenge => ({
  id: 'ch-1',
  type: '10_tirs',
  mode: 'solo',
  date: new Date().toISOString(),
  successCount: 7,
  totalShots: 10,
  carreauCount: 2,
  successRate: 70,
  ...overrides,
});

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'p-1',
  name: 'Player 1',
  role: 'Milieu',
  level: 'Intermédiaire',
  stats: {
    matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
    tirRate: 0, pointRate: 0, carreauRate: 0,
    avgPointsScored: 0, avgPointsConceded: 0,
  },
  createdAt: new Date().toISOString(),
  ...overrides,
});

const makeClub = (overrides: Partial<Club> = {}): Club => ({
  id: 'club-1',
  name: 'Club Test',
  address: '1 Rue',
  city: 'Paris',
  location: { latitude: 48.85, longitude: 2.35 },
  membersCount: 0,
  foundedYear: 2020,
  description: 'Test club',
  facilities: [],
  ...overrides,
});

// ============================================================
// computeUserStats
// ============================================================
describe('computeUserStats', () => {
  test('returns default stats for empty matches', () => {
    const result = computeUserStats([], 'user-1', 'Alice', []);
    expect(result.totalMatches).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.tirSuccessRate).toBe(0);
    expect(result.pointSuccessRate).toBe(0);
    expect(result.carreauRate).toBe(0);
    expect(result.avgMatchDuration).toBe(0);
    expect(result.tournamentsPlayed).toBe(0);
  });

  test('computes correct stats for wins and losses', () => {
    const matches = [
      makeMatch({ id: 'm1', winner: 'A', duration: 30 }),
      makeMatch({ id: 'm2', winner: 'A', duration: 40 }),
      makeMatch({ id: 'm3', winner: 'B', duration: 50 }),
    ];
    const result = computeUserStats(matches, 'user-1', 'Alice', []);
    expect(result.totalMatches).toBe(3);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBeCloseTo(66.7, 0);
    expect(result.avgMatchDuration).toBe(40);
  });

  test('aggregates tir/point/carreau stats from playerActions', () => {
    const matches = [
      makeMatch({
        playerActions: [{
          playerId: 'user-1', playerName: 'Alice', team: 'A',
          actions: { tirs: 20, tirsSuccess: 15, points: 10, pointsSuccess: 8, carreaux: 5 },
        }],
      }),
    ];
    const result = computeUserStats(matches, 'user-1', 'Alice', []);
    expect(result.tirSuccessRate).toBe(75);
    expect(result.pointSuccessRate).toBe(80);
    expect(result.carreauRate).toBeCloseTo(33.3, 0);
  });

  test('tracks tournaments played', () => {
    const matches = [
      makeMatch({ id: 'm1', mode: 'Tournoi', tournamentId: 't1' }),
      makeMatch({ id: 'm2', mode: 'Tournoi', tournamentId: 't1' }),
      makeMatch({ id: 'm3', mode: 'Tournoi', tournamentId: 't2' }),
      makeMatch({ id: 'm4', mode: 'Entraînement' }),
    ];
    const result = computeUserStats(matches, 'user-1', 'Alice', []);
    expect(result.tournamentsPlayed).toBe(2);
  });

  test('handles shared matches correctly', () => {
    const matches = [
      makeMatch({
        id: 'shared-1',
        teamA: { players: ['other-user'], playerNames: ['Other'], score: 13 },
        teamB: { players: ['user-1'], playerNames: ['Alice'], score: 8 },
        winner: 'A',
      }),
    ];
    // Shared match where user is in team B
    const result = computeUserStats(matches, 'user-1', 'Alice', ['shared-1']);
    expect(result.totalMatches).toBe(1);
    expect(result.wins).toBe(0); // User's team (B) lost
    expect(result.losses).toBe(1);
  });

  test('skips shared matches where user is not in either team', () => {
    const matches = [
      makeMatch({
        id: 'shared-2',
        teamA: { players: ['p-a'], playerNames: ['PA'], score: 13 },
        teamB: { players: ['p-b'], playerNames: ['PB'], score: 8 },
        winner: 'A',
      }),
    ];
    const result = computeUserStats(matches, 'user-1', 'Alice', ['shared-2']);
    expect(result.totalMatches).toBe(0);
  });

  test('handles undefined userId gracefully', () => {
    const result = computeUserStats([], undefined, undefined, []);
    expect(result.playerId).toBe('1');
    expect(result.playerName).toBe('Utilisateur');
  });
});

// ============================================================
// computeChallengeStats
// ============================================================
describe('computeChallengeStats', () => {
  test('returns default stats for empty challenges', () => {
    const result = computeChallengeStats([]);
    expect(result.totalChallenges).toBe(0);
    expect(result.overallSuccessRate).toBe(0);
    expect(result.totalShots).toBe(0);
    expect(result.totalSuccess).toBe(0);
    expect(result.byType['10_tirs'].count).toBe(0);
    expect(result.byType['10_tirs_sautee'].count).toBe(0);
    expect(result.byType.precision.count).toBe(0);
  });

  test('counts challenges by type', () => {
    const challenges = [
      makeChallenge({ id: 'c1', type: '10_tirs' }),
      makeChallenge({ id: 'c2', type: '10_tirs' }),
      makeChallenge({ id: 'c3', type: '10_tirs_sautee' }),
      makeChallenge({
        id: 'c4', type: 'precision',
        totalPoints: 60, maxPoints: 100,
        precisionShots: [
          { atelier: 'boule_seule', distance: 7, points: 5, timeUsed: 10, timestamp: '' },
          { atelier: 'boule_seule', distance: 7, points: 3, timeUsed: 10, timestamp: '' },
          { atelier: 'boule_seule', distance: 7, points: 1, timeUsed: 10, timestamp: '' },
        ],
      }),
    ];
    const result = computeChallengeStats(challenges);
    expect(result.totalChallenges).toBe(4);
    expect(result.byType['10_tirs'].count).toBe(2);
    expect(result.byType['10_tirs_sautee'].count).toBe(1);
    expect(result.byType.precision.count).toBe(1);
  });

  test('computes average success rate for 10_tirs', () => {
    const challenges = [
      makeChallenge({ id: 'c1', type: '10_tirs', successRate: 80, successCount: 8, totalShots: 10 }),
      makeChallenge({ id: 'c2', type: '10_tirs', successRate: 60, successCount: 6, totalShots: 10 }),
    ];
    const result = computeChallengeStats(challenges);
    expect(result.byType['10_tirs'].avgSuccess).toBe(70); // (80+60)/2
    expect(result.byType['10_tirs'].bestScore).toBe(80);
    expect(result.totalShots).toBe(20);
    expect(result.totalSuccess).toBe(14);
    expect(result.overallSuccessRate).toBe(70);
  });

  test('computes precision stats correctly', () => {
    const challenges = [
      makeChallenge({
        id: 'c1', type: 'precision',
        totalPoints: 75, maxPoints: 100,
        precisionShots: [
          { atelier: 'boule_seule', distance: 7, points: 5, timeUsed: 10, timestamp: '' },
          { atelier: 'boule_seule', distance: 7, points: 3, timeUsed: 10, timestamp: '' },
          { atelier: 'boule_seule', distance: 7, points: 0, timeUsed: 10, timestamp: '' },
        ],
      }),
    ];
    const result = computeChallengeStats(challenges);
    expect(result.byType.precision.count).toBe(1);
    expect(result.byType.precision.avgSuccess).toBe(75);
    expect(result.byType.precision.bestScore).toBe(75);
    // Precision uses 20 shots per challenge
    expect(result.totalShots).toBe(20);
    // Success = shots with points >= 3
    expect(result.totalSuccess).toBe(2);
  });

  test('returns recent challenges sorted by date (newest first)', () => {
    const challenges = [
      makeChallenge({ id: 'old', date: '2024-01-01T00:00:00Z' }),
      makeChallenge({ id: 'new', date: '2025-06-01T00:00:00Z' }),
      makeChallenge({ id: 'mid', date: '2024-06-01T00:00:00Z' }),
    ];
    const result = computeChallengeStats(challenges);
    expect(result.recentChallenges[0].id).toBe('new');
    expect(result.recentChallenges[1].id).toBe('mid');
    expect(result.recentChallenges[2].id).toBe('old');
  });

  test('limits recentChallenges to 5', () => {
    const challenges = Array.from({ length: 10 }, (_, i) =>
      makeChallenge({ id: `c${i}`, date: new Date(2025, 0, i + 1).toISOString() }),
    );
    const result = computeChallengeStats(challenges);
    expect(result.recentChallenges).toHaveLength(5);
  });
});

// ============================================================
// computeSelfPlayer
// ============================================================
describe('computeSelfPlayer', () => {
  const players = [
    makePlayer({ id: 'user-1', name: 'Alice' }),
    makePlayer({ id: 'user-2', name: 'Bob' }),
  ];

  test('returns player matching userId', () => {
    const result = computeSelfPlayer(players, 'user-1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Alice');
  });

  test('returns null for unknown userId', () => {
    const result = computeSelfPlayer(players, 'unknown');
    expect(result).toBeNull();
  });

  test('returns null for undefined userId', () => {
    const result = computeSelfPlayer(players, undefined);
    expect(result).toBeNull();
  });

  test('returns player linked by userId when id differs from auth user', () => {
    const linked = makePlayer({ id: 'player-uuid', userId: 'user-1', name: 'Carol' });
    const result = computeSelfPlayer([linked], 'user-1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Carol');
  });
});

// ============================================================
// computeClubsWithMemberCount
// ============================================================
describe('computeClubsWithMemberCount', () => {
  test('returns clubs with computed member count', () => {
    const clubs = [makeClub({ id: 'c1', membersCount: 0 })];
    const players = [
      makePlayer({ id: 'p1', clubId: 'c1' }),
      makePlayer({ id: 'p2', clubId: 'c1' }),
      makePlayer({ id: 'p3', clubId: 'c2' }),
    ];
    const result = computeClubsWithMemberCount(clubs, players);
    expect(result[0].membersCount).toBe(2);
  });

  test('keeps higher existing membersCount if no local players', () => {
    const clubs = [makeClub({ id: 'c1', membersCount: 50 })];
    const players = [makePlayer({ id: 'p1', clubId: 'other' })];
    const result = computeClubsWithMemberCount(clubs, players);
    expect(result[0].membersCount).toBe(50);
  });

  test('handles empty clubs', () => {
    const result = computeClubsWithMemberCount([], []);
    expect(result).toEqual([]);
  });

  test('handles empty players', () => {
    const clubs = [makeClub({ id: 'c1', membersCount: 3 })];
    const result = computeClubsWithMemberCount(clubs, []);
    expect(result[0].membersCount).toBe(3);
  });
});
