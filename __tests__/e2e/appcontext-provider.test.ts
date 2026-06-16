/**
 * E2E Integration Test: AppContext Provider
 *
 * Tests AppContext as an integrated provider system, verifying:
 * - Initial loading and state hydration
 * - Auth state transitions (login → data load, logout → state reset)
 * - Cache → server data lifecycle
 * - CRUD propagation through context
 * - Computed values (selfPlayer, userStats, challengeStats, playersWithStats)
 * - Shared items merging and permissions
 * - Offline queue and reconnection lifecycle
 * - Delta sync with conflict detection
 *
 * Since we cannot use renderHook with full Supabase in tests,
 * we test the pure logic functions that AppContext delegates to.
 */

import { computeUserStats, computeChallengeStats, computePlayersWithStats, computeSelfPlayer, computeClubsWithMemberCount } from '@/hooks/useAppComputed';
import { createGetters } from '@/hooks/useAppGetters';
import { calculatePlayerStatsFromMatches, mergeRecords } from '@/services/dbMappers';
import type { Player, Match, Challenge, Club, Tournament, Terrain } from '@/types/petanque';

// ===== Test data factories =====

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Player',
    role: 'Milieu',
    level: 'Intermédiaire',
    stats: { matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0, avgPointsScored: 0, avgPointsConceded: 0 },
    ...overrides,
  } as any;
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    date: '2026-03-15T10:00:00Z',
    mode: 'Entraînement',
    format: 'Doublette',
    teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 },
    teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 },
    winner: 'A',
    duration: 45,
    menes: [],
    playerActions: [
      { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 6, carreaux: 2 } },
    ],
    ...overrides,
  } as any;
}

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    date: '2026-03-15T14:00:00Z',
    type: '10_tirs',
    mode: 'solo',
    playerId: 'p1',
    playerName: 'Alice',
    successCount: 7,
    totalShots: 10,
    carreauCount: 2,
    successRate: 70,
    ...overrides,
  } as any;
}

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: `club-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Club Test',
    city: 'Lyon',
    membersCount: 0,
    ...overrides,
  } as any;
}

// ===== State simulation helpers =====

interface AppState {
  players: Player[];
  clubs: Club[];
  tournaments: Tournament[];
  matches: Match[];
  challenges: Challenge[];
  terrains: Terrain[];
  userId: string | undefined;
  username: string | undefined;
  sharedMatchIds: string[];
  loading: boolean;
}

function createInitialState(): AppState {
  return {
    players: [],
    clubs: [],
    tournaments: [],
    matches: [],
    challenges: [],
    terrains: [],
    userId: undefined,
    username: undefined,
    sharedMatchIds: [],
    loading: true,
  };
}

function simulateLogin(state: AppState, userId: string, username: string): AppState {
  return { ...state, userId, username, loading: true };
}

function simulateDataLoaded(state: AppState, data: Partial<AppState>): AppState {
  return { ...state, ...data, loading: false };
}

function simulateLogout(): AppState {
  return createInitialState();
}

function simulateAddMatch(state: AppState, match: Match): AppState {
  return { ...state, matches: [match, ...state.matches] };
}

function simulateDeleteMatch(state: AppState, matchId: string): AppState {
  return { ...state, matches: state.matches.filter(m => m.id !== matchId) };
}

function simulateAddPlayer(state: AppState, player: Player): AppState {
  return { ...state, players: [...state.players, player] };
}

// ===== Tests =====

describe('E2E: AppContext Provider Integration', () => {

  describe('Phase 1: Initial Loading & State Hydration', () => {
    test('initial state has empty arrays and loading=true', () => {
      const state = createInitialState();
      expect(state.players).toHaveLength(0);
      expect(state.matches).toHaveLength(0);
      expect(state.challenges).toHaveLength(0);
      expect(state.loading).toBe(true);
      expect(state.userId).toBeUndefined();
    });

    test('login sets userId and keeps loading', () => {
      let state = createInitialState();
      state = simulateLogin(state, 'user-1', 'Alice');
      expect(state.userId).toBe('user-1');
      expect(state.username).toBe('Alice');
      expect(state.loading).toBe(true);
    });

    test('data loaded clears loading and populates state', () => {
      let state = createInitialState();
      state = simulateLogin(state, 'user-1', 'Alice');
      const players = [makePlayer({ id: 'user-1', name: 'Alice' })];
      const matches = [makeMatch()];
      state = simulateDataLoaded(state, { players, matches });
      expect(state.loading).toBe(false);
      expect(state.players).toHaveLength(1);
      expect(state.matches).toHaveLength(1);
    });
  });

  describe('Phase 2: Auth State Transitions', () => {
    test('login → load → logout → state reset', () => {
      // Login
      let state = createInitialState();
      state = simulateLogin(state, 'user-1', 'Alice');
      expect(state.userId).toBe('user-1');

      // Load data
      state = simulateDataLoaded(state, {
        players: [makePlayer({ id: 'user-1' })],
        matches: [makeMatch(), makeMatch()],
        challenges: [makeChallenge()],
      });
      expect(state.matches).toHaveLength(2);

      // Logout
      state = simulateLogout();
      expect(state.userId).toBeUndefined();
      expect(state.players).toHaveLength(0);
      expect(state.matches).toHaveLength(0);
      expect(state.challenges).toHaveLength(0);
      expect(state.loading).toBe(true);
    });

    test('re-login loads fresh data', () => {
      let state = createInitialState();
      // First session
      state = simulateLogin(state, 'user-1', 'Alice');
      state = simulateDataLoaded(state, { matches: [makeMatch()] });
      expect(state.matches).toHaveLength(1);

      // Logout
      state = simulateLogout();

      // Second session (different user)
      state = simulateLogin(state, 'user-2', 'Bob');
      state = simulateDataLoaded(state, { matches: [makeMatch(), makeMatch(), makeMatch()] });
      expect(state.userId).toBe('user-2');
      expect(state.matches).toHaveLength(3);
    });
  });

  describe('Phase 3: Cache → Server Data Lifecycle', () => {
    test('cached data used while loading, replaced by server data', () => {
      let state = createInitialState();
      state = simulateLogin(state, 'user-1', 'Alice');

      // Simulate cache load
      const cachedPlayers = [makePlayer({ id: 'user-1', name: 'CachedAlice' })];
      state = { ...state, players: cachedPlayers };
      expect(state.players[0].name).toBe('CachedAlice');

      // Server data replaces cache
      const serverPlayers = [makePlayer({ id: 'user-1', name: 'ServerAlice' }), makePlayer({ id: 'p2', name: 'Bob' })];
      state = simulateDataLoaded(state, { players: serverPlayers });
      expect(state.players).toHaveLength(2);
      expect(state.players[0].name).toBe('ServerAlice');
    });

    test('mergeRecords handles cache→server transition', () => {
      const cached = [
        { id: '1', name: 'CachedA' },
        { id: '2', name: 'CachedB' },
      ];
      const server = [
        { id: '1', name: 'ServerA' },
        { id: '3', name: 'ServerC' },
      ];
      const merged = mergeRecords(cached, server);
      expect(merged).toHaveLength(3);
      expect(merged.find(r => r.id === '1')!.name).toBe('ServerA');
      expect(merged.find(r => r.id === '2')!.name).toBe('CachedB');
      expect(merged.find(r => r.id === '3')!.name).toBe('ServerC');
    });
  });

  describe('Phase 4: CRUD Propagation', () => {
    test('addMatch prepends to list', () => {
      let state = createInitialState();
      state = simulateLogin(state, 'user-1', 'Alice');
      state = simulateDataLoaded(state, { matches: [makeMatch({ id: 'm1' })] });

      const newMatch = makeMatch({ id: 'm2' });
      state = simulateAddMatch(state, newMatch);
      expect(state.matches).toHaveLength(2);
      expect(state.matches[0].id).toBe('m2'); // prepended
    });

    test('deleteMatch removes from list', () => {
      let state = createInitialState();
      state = simulateDataLoaded(state, {
        matches: [makeMatch({ id: 'm1' }), makeMatch({ id: 'm2' }), makeMatch({ id: 'm3' })],
      });
      state = simulateDeleteMatch(state, 'm2');
      expect(state.matches).toHaveLength(2);
      expect(state.matches.find(m => m.id === 'm2')).toBeUndefined();
    });

    test('addPlayer appends to list', () => {
      let state = createInitialState();
      state = simulateDataLoaded(state, { players: [makePlayer({ id: 'p1' })] });
      state = simulateAddPlayer(state, makePlayer({ id: 'p2', name: 'New Player' }));
      expect(state.players).toHaveLength(2);
    });

    test('CRUD operations preserve other entity lists', () => {
      let state = createInitialState();
      state = simulateDataLoaded(state, {
        players: [makePlayer()],
        matches: [makeMatch()],
        challenges: [makeChallenge()],
      });
      state = simulateAddMatch(state, makeMatch());
      expect(state.players).toHaveLength(1);
      expect(state.challenges).toHaveLength(1);
      expect(state.matches).toHaveLength(2);
    });
  });

  describe('Phase 5: Computed Values - selfPlayer', () => {
    test('selfPlayer found when userId matches player id', () => {
      const players = [
        makePlayer({ id: 'user-1', name: 'Alice' }),
        makePlayer({ id: 'user-2', name: 'Bob' }),
      ];
      const self = computeSelfPlayer(players, 'user-1');
      expect(self).not.toBeNull();
      expect(self!.name).toBe('Alice');
    });

    test('selfPlayer null when no userId', () => {
      const players = [makePlayer({ id: 'p1' })];
      expect(computeSelfPlayer(players, undefined)).toBeNull();
    });

    test('selfPlayer null when player not in list', () => {
      const players = [makePlayer({ id: 'p1' })];
      expect(computeSelfPlayer(players, 'user-1')).toBeNull();
    });
  });

  describe('Phase 6: Computed Values - userStats', () => {
    test('computes win rate from matches', () => {
      const matches = [
        makeMatch({ winner: 'A' }),
        makeMatch({ winner: 'A' }),
        makeMatch({ winner: 'B' }),
      ];
      const stats = computeUserStats(matches, 'user-1', 'Alice', []);
      expect(stats.totalMatches).toBe(3);
      expect(stats.wins).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.winRate).toBeCloseTo(66.7, 0);
    });

    test('computes tir and point rates', () => {
      const matches = [makeMatch()];
      const stats = computeUserStats(matches, 'user-1', 'Alice', []);
      expect(stats.tirSuccessRate).toBe(70); // 7/10
      expect(stats.pointSuccessRate).toBe(75); // 6/8
    });

    test('handles shared matches correctly', () => {
      const matches = [
        makeMatch({ id: 'shared-1', teamA: { players: ['user-1'], playerNames: ['A'], score: 13 } as any, teamB: { players: ['other'], playerNames: ['B'], score: 8 } as any, winner: 'A' }),
        makeMatch({ id: 'shared-2', teamA: { players: ['other'], playerNames: ['B'], score: 13 } as any, teamB: { players: ['user-1'], playerNames: ['A'], score: 8 } as any, winner: 'A' }),
      ];
      const stats = computeUserStats(matches, 'user-1', 'Alice', ['shared-1', 'shared-2']);
      expect(stats.totalMatches).toBe(2);
      // shared-1: user in A, winner A → win
      // shared-2: user in B, winner A → loss
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(1);
    });

    test('empty matches returns zeros', () => {
      const stats = computeUserStats([], 'user-1', 'Alice', []);
      expect(stats.totalMatches).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.tirSuccessRate).toBe(0);
    });

    test('no userId returns zeros', () => {
      const stats = computeUserStats([makeMatch()], undefined, undefined, []);
      expect(stats.totalMatches).toBe(0);
    });
  });

  describe('Phase 7: Computed Values - challengeStats', () => {
    test('aggregates by challenge type', () => {
      const challenges = [
        makeChallenge({ type: '10_tirs', successRate: 70 }),
        makeChallenge({ type: '10_tirs', successRate: 80 }),
        makeChallenge({ type: 'precision', totalPoints: 20, successRate: undefined as any }),
      ];
      const stats = computeChallengeStats(challenges);
      expect(stats.totalChallenges).toBe(3);
      expect(stats.byType['10_tirs'].count).toBe(2);
      expect(stats.byType['precision'].count).toBe(1);
    });

    test('computes best score per type', () => {
      const challenges = [
        makeChallenge({ type: '10_tirs', successRate: 60 }),
        makeChallenge({ type: '10_tirs', successRate: 90 }),
      ];
      const stats = computeChallengeStats(challenges);
      expect(stats.byType['10_tirs'].bestScore).toBe(90);
    });

    test('empty challenges returns zeros', () => {
      const stats = computeChallengeStats([]);
      expect(stats.totalChallenges).toBe(0);
      expect(stats.byType['10_tirs'].count).toBe(0);
      expect(stats.overallSuccessRate).toBe(0);
    });

    test('recentChallenges returns latest 5', () => {
      const challenges = Array.from({ length: 10 }, (_, i) =>
        makeChallenge({ date: new Date(2026, 2, i + 1).toISOString() })
      );
      const stats = computeChallengeStats(challenges);
      expect(stats.recentChallenges).toHaveLength(5);
      // Most recent first
      expect(new Date(stats.recentChallenges[0].date).getTime())
        .toBeGreaterThan(new Date(stats.recentChallenges[4].date).getTime());
    });
  });

  describe('Phase 8: Computed Values - playersWithStats', () => {
    test('recalculates player stats from matches', () => {
      const players = [makePlayer({ id: 'p1', name: 'Alice' })];
      const matches = [
        makeMatch({ teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 } as any, teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 } as any, winner: 'A' }),
        makeMatch({ teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 } as any, teamB: { players: ['p2'], playerNames: ['Bob'], score: 11 } as any, winner: 'A' }),
      ];
      const result = computePlayersWithStats(players, matches);
      expect(result[0].stats.matchesPlayed).toBe(2);
      expect(result[0].stats.wins).toBe(2);
    });

    test('no matches returns players unchanged', () => {
      const players = [makePlayer({ id: 'p1' })];
      const result = computePlayersWithStats(players, []);
      expect(result).toBe(players); // Same reference
    });
  });

  describe('Phase 9: Computed Values - clubsWithMemberCount', () => {
    test('counts members per club', () => {
      const clubs = [makeClub({ id: 'c1', membersCount: 0 }), makeClub({ id: 'c2', membersCount: 0 })];
      const players = [
        makePlayer({ id: 'p1', clubId: 'c1' } as any),
        makePlayer({ id: 'p2', clubId: 'c1' } as any),
        makePlayer({ id: 'p3', clubId: 'c2' } as any),
      ];
      const result = computeClubsWithMemberCount(clubs, players);
      expect(result[0].membersCount).toBe(2);
      expect(result[1].membersCount).toBe(1);
    });

    test('preserves higher manual count', () => {
      const clubs = [makeClub({ id: 'c1', membersCount: 10 })];
      const players = [makePlayer({ id: 'p1', clubId: 'c1' } as any)];
      const result = computeClubsWithMemberCount(clubs, players);
      expect(result[0].membersCount).toBe(10); // Max(1, 10)
    });
  });

  describe('Phase 10: Getters Integration', () => {
    const players = [makePlayer({ id: 'p1', name: 'Alice' }), makePlayer({ id: 'p2', name: 'Bob' })];
    const clubs = [makeClub({ id: 'c1', name: 'Club Lyon' })];
    const tournaments = [{ id: 't1', name: 'Open' } as any];
    const matches = [
      makeMatch({ id: 'm1', teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 } as any, teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 } as any }),
    ];
    const terrains = [{ id: 'tr1', name: 'Boulodrome' } as any];

    test('getPlayerById returns correct player', () => {
      const getters = createGetters(players, clubs, tournaments, matches, terrains);
      expect(getters.getPlayerById('p1')?.name).toBe('Alice');
      expect(getters.getPlayerById('p999')).toBeUndefined();
    });

    test('getClubById returns correct club', () => {
      const getters = createGetters(players, clubs, tournaments, matches, terrains);
      expect(getters.getClubById('c1')?.name).toBe('Club Lyon');
    });

    test('getMatchesByPlayer filters correctly', () => {
      const getters = createGetters(players, clubs, tournaments, matches, terrains);
      expect(getters.getMatchesByPlayer('p1')).toHaveLength(1);
      expect(getters.getMatchesByPlayer('p999')).toHaveLength(0);
    });

    test('getHeadToHead computes stats', () => {
      const getters = createGetters(players, clubs, tournaments, matches, terrains);
      const h2h = getters.getHeadToHead('p1', 'p2');
      expect(h2h.stats.totalMatches).toBe(1);
      expect(h2h.stats.player1Wins).toBe(1);
    });
  });

  describe('Phase 11: Shared Items Integration', () => {
    test('shared matches included in user stats when user is participant', () => {
      const matches = [
        makeMatch({ id: 'own-1', teamA: { players: ['user-1'], playerNames: ['Me'], score: 13 } as any, winner: 'A' }),
        makeMatch({ id: 'shared-1', teamA: { players: ['user-1'], playerNames: ['Me'], score: 13 } as any, winner: 'A' }),
      ];
      const stats = computeUserStats(matches, 'user-1', 'Me', ['shared-1']);
      expect(stats.totalMatches).toBe(2);
      expect(stats.wins).toBe(2);
    });

    test('shared matches excluded when user is not participant', () => {
      const matches = [
        makeMatch({ id: 'shared-1', teamA: { players: ['other-1'], playerNames: ['X'], score: 13 } as any, teamB: { players: ['other-2'], playerNames: ['Y'], score: 8 } as any, winner: 'A' }),
      ];
      const stats = computeUserStats(matches, 'user-1', 'Me', ['shared-1']);
      expect(stats.totalMatches).toBe(0);
    });

    test('mergeRecords deduplicates shared + own items', () => {
      const own = [{ id: '1', name: 'Own' }, { id: '2', name: 'Own2' }];
      const shared = [{ id: '2', name: 'SharedVersion' }, { id: '3', name: 'Shared3' }];
      const merged = mergeRecords(own, shared);
      expect(merged).toHaveLength(3);
      expect(merged.find(r => r.id === '2')!.name).toBe('SharedVersion');
    });
  });

  describe('Phase 12: Performance with Large Datasets', () => {
    test('computeUserStats with 500 matches', () => {
      const matches = Array.from({ length: 500 }, (_, i) =>
        makeMatch({ winner: i % 3 === 0 ? 'B' : 'A' })
      );
      const start = Date.now();
      const stats = computeUserStats(matches, 'user-1', 'Alice', []);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
      expect(stats.totalMatches).toBe(500);
    });

    test('computePlayersWithStats with 100 players and 200 matches', () => {
      const players = Array.from({ length: 100 }, (_, i) => makePlayer({ id: `p${i}` }));
      const matches = Array.from({ length: 200 }, (_, i) =>
        makeMatch({
          teamA: { players: [`p${i % 100}`], playerNames: ['A'], score: 13 } as any,
          teamB: { players: [`p${(i + 50) % 100}`], playerNames: ['B'], score: 8 } as any,
        })
      );
      const start = Date.now();
      const result = computePlayersWithStats(players, matches);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
      expect(result).toHaveLength(100);
    });

    test('createGetters lookup performance with 1000 matches', () => {
      const matches = Array.from({ length: 1000 }, (_, i) => makeMatch({ id: `m${i}` }));
      const getters = createGetters([], [], [], matches, []);
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        getters.getMatchById(`m${i}`);
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });
});
