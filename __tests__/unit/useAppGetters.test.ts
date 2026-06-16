/**
 * Unit tests for hooks/useAppGetters.ts
 * Tests: createGetters (9 getter functions)
 */

import { createGetters } from '@/hooks/useAppGetters';
import type { Match, Player, Club, Tournament, Terrain } from '@/types/petanque';

// ============================================================
// Test Data
// ============================================================
const players: Player[] = [
  { id: 'p1', name: 'Alice', role: 'Tireur', level: 'Confirmé', stats: { matchesPlayed: 10, wins: 7, losses: 3, winRate: 70, tirRate: 65, pointRate: 60, carreauRate: 15, avgPointsScored: 11, avgPointsConceded: 8 }, createdAt: '2024-01-01' },
  { id: 'p2', name: 'Bob', role: 'Pointeur', level: 'Intermédiaire', stats: { matchesPlayed: 5, wins: 2, losses: 3, winRate: 40, tirRate: 45, pointRate: 55, carreauRate: 10, avgPointsScored: 9, avgPointsConceded: 10 }, createdAt: '2024-01-01' },
  { id: 'p3', name: 'Charlie', role: 'Milieu', level: 'Expert', stats: { matchesPlayed: 15, wins: 10, losses: 5, winRate: 67, tirRate: 70, pointRate: 65, carreauRate: 20, avgPointsScored: 12, avgPointsConceded: 7 }, createdAt: '2024-01-01' },
];

const clubs: Club[] = [
  { id: 'c1', name: 'Club A', address: '1 Rue', city: 'Paris', location: { latitude: 48.85, longitude: 2.35 }, membersCount: 30, foundedYear: 2018, description: 'Club A', facilities: [] },
];

const tournaments: Tournament[] = [
  { id: 't1', name: 'Tournoi A', date: '2025-03-01', type: 'Mixte', format: 'Doublette', location: { name: 'Parc', city: 'Lyon', latitude: 45.76, longitude: 4.83 }, status: 'Terminé', participants: 16, maxParticipants: 32 },
];

const matches: Match[] = [
  { id: 'm1', date: '2025-01-15', mode: 'Entraînement', format: 'Doublette', teamA: { players: ['p1', 'p3'], playerNames: ['Alice', 'Charlie'], score: 13 }, teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 }, winner: 'A', duration: 40, menes: [] },
  { id: 'm2', date: '2025-02-20', mode: 'Tournoi', format: 'Doublette', tournamentId: 't1', teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 }, teamB: { players: ['p3'], playerNames: ['Charlie'], score: 11 }, winner: 'A', duration: 55, menes: [] },
  { id: 'm3', date: '2025-03-10', mode: 'Entraînement', format: 'Tête-à-tête', teamA: { players: ['p2'], playerNames: ['Bob'], score: 13 }, teamB: { players: ['p1'], playerNames: ['Alice'], score: 7 }, winner: 'A', duration: 35, menes: [] },
];

const terrains: Terrain[] = [
  { id: 'ter1', name: 'Terrain A', address: '1 Allée', city: 'Paris', location: { latitude: 48.85, longitude: 2.35 }, type: 'Sable', isPublic: true, publicAccess: true, courtsCount: 4, lighting: true, covered: false },
];

// ============================================================
// Tests
// ============================================================
describe('createGetters', () => {
  const getters = createGetters(players, clubs, tournaments, matches, terrains);

  // --- Entity Lookups ---
  describe('getPlayerById', () => {
    test('finds existing player', () => {
      const p = getters.getPlayerById('p1');
      expect(p).toBeDefined();
      expect(p!.name).toBe('Alice');
    });

    test('returns undefined for unknown id', () => {
      expect(getters.getPlayerById('unknown')).toBeUndefined();
    });
  });

  describe('getClubById', () => {
    test('finds existing club', () => {
      expect(getters.getClubById('c1')!.name).toBe('Club A');
    });
    test('returns undefined for unknown id', () => {
      expect(getters.getClubById('nope')).toBeUndefined();
    });
  });

  describe('getTournamentById', () => {
    test('finds existing tournament', () => {
      expect(getters.getTournamentById('t1')!.name).toBe('Tournoi A');
    });
    test('returns undefined for unknown id', () => {
      expect(getters.getTournamentById('nope')).toBeUndefined();
    });
  });

  describe('getMatchById', () => {
    test('finds existing match', () => {
      expect(getters.getMatchById('m1')!.format).toBe('Doublette');
    });
    test('returns undefined for unknown id', () => {
      expect(getters.getMatchById('nope')).toBeUndefined();
    });
  });

  describe('getTerrainById', () => {
    test('finds existing terrain', () => {
      expect(getters.getTerrainById('ter1')!.city).toBe('Paris');
    });
    test('returns undefined for unknown id', () => {
      expect(getters.getTerrainById('nope')).toBeUndefined();
    });
  });

  // --- Relational Queries ---
  describe('getMatchesByPlayer', () => {
    test('returns all matches containing player in either team', () => {
      const aliceMatches = getters.getMatchesByPlayer('p1');
      expect(aliceMatches).toHaveLength(3); // m1 (teamA), m2 (teamA), m3 (teamB)
    });

    test('returns matches for player in team B', () => {
      const bobMatches = getters.getMatchesByPlayer('p2');
      expect(bobMatches).toHaveLength(2); // m1 (teamB), m3 (teamA)
    });

    test('returns empty for unknown player', () => {
      expect(getters.getMatchesByPlayer('unknown')).toHaveLength(0);
    });
  });

  describe('getMatchesByTournament', () => {
    test('returns matches for tournament', () => {
      const tourMatches = getters.getMatchesByTournament('t1');
      expect(tourMatches).toHaveLength(1);
      expect(tourMatches[0].id).toBe('m2');
    });

    test('returns empty for unknown tournament', () => {
      expect(getters.getMatchesByTournament('unknown')).toHaveLength(0);
    });
  });

  // --- Head to Head ---
  describe('getHeadToHead', () => {
    test('computes head-to-head between Alice (p1) and Bob (p2)', () => {
      const h2h = getters.getHeadToHead('p1', 'p2');
      // m1: Alice(A) vs Bob(B) → Alice wins
      // m3: Bob(A) vs Alice(B) → Bob wins
      expect(h2h.stats.totalMatches).toBe(2);
      expect(h2h.stats.player1Wins).toBe(1); // Alice wins m1
      expect(h2h.stats.player2Wins).toBe(1); // Bob wins m3
      expect(h2h.stats.player1WinRate).toBe(50);
    });

    test('computes head-to-head between Alice (p1) and Charlie (p3)', () => {
      const h2h = getters.getHeadToHead('p1', 'p3');
      // m2: Alice(A) vs Charlie(B) → Alice wins
      // m1: Alice+Charlie same team → NOT head-to-head
      expect(h2h.stats.totalMatches).toBe(1);
      expect(h2h.stats.player1Wins).toBe(1);
      expect(h2h.stats.player2Wins).toBe(0);
    });

    test('returns zero stats for players who never faced each other', () => {
      const h2h = getters.getHeadToHead('p2', 'p3');
      // m1: p3 in A, p2 in B → they faced each other
      expect(h2h.stats.totalMatches).toBe(1);
    });

    test('returns last match date', () => {
      const h2h = getters.getHeadToHead('p1', 'p2');
      expect(h2h.stats.lastMatch).toBe('2025-03-10');
    });

    test('computes average scores', () => {
      const h2h = getters.getHeadToHead('p1', 'p2');
      // m1: Alice 13 - Bob 8, m3: Alice(B) 7 - Bob(A) 13
      // p1 scores: 13 + 7 = 20, avg = 10
      // p2 scores: 8 + 13 = 21, avg = 10.5
      expect(h2h.stats.player1AvgScore).toBe(10);
      expect(h2h.stats.player2AvgScore).toBe(10.5);
    });
  });

  // --- Common Opponents ---
  describe('getCommonOpponents', () => {
    test('finds common opponents between Alice and Charlie', () => {
      // Alice played against: Bob (m1 B, m3 B), Charlie (m2 B)
      // Charlie played against: Bob (m1 same team A, not opponent!), Alice (m2 A)
      // Charlie was on team A in m1 with Alice, so Bob(B) is opponent for Charlie too
      const common = getters.getCommonOpponents('p1', 'p3');
      expect(common).toContain('p2'); // Bob faced both
    });

    test('returns empty for players with no common opponents', () => {
      // In this dataset, all players have some overlap
      // But testing with non-existent player
      const common = getters.getCommonOpponents('p1', 'unknown');
      expect(common).toEqual([]);
    });

    test('does not include either player in the result', () => {
      const common = getters.getCommonOpponents('p1', 'p2');
      expect(common).not.toContain('p1');
      expect(common).not.toContain('p2');
    });
  });
});

// ============================================================
// Edge Cases
// ============================================================
describe('createGetters edge cases', () => {
  test('handles empty data arrays', () => {
    const getters = createGetters([], [], [], [], []);
    expect(getters.getPlayerById('p1')).toBeUndefined();
    expect(getters.getMatchesByPlayer('p1')).toEqual([]);
    expect(getters.getMatchesByTournament('t1')).toEqual([]);
    expect(getters.getHeadToHead('p1', 'p2').stats.totalMatches).toBe(0);
    expect(getters.getCommonOpponents('p1', 'p2')).toEqual([]);
  });
});
