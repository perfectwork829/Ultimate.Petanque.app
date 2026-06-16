/**
 * E2E Integration Test: Data Export Flow
 *
 * Tests the complete lifecycle of data export:
 * Data selection → Column configuration → Preview → Export generation (CSV/PDF)
 *
 * Covers all 7 presets, column selection, period filtering, season filtering,
 * tournament filtering, player filtering, comparative analysis, and CSV encoding.
 */

import {
  computePeriodStats,
  generatePreview,
  matchesToCsv,
  challengesToCsv,
  statisticsToCsv,
  getColumnsForDataType,
  MATCH_COLUMNS,
  CHALLENGE_COLUMNS,
} from '@/services/exportService';
import type { Match, Challenge, Tournament } from '@/types/petanque';

// ===== Test data factories =====

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
    menes: [{ teamAPoints: 3, teamBPoints: 0 }, { teamAPoints: 0, teamBPoints: 2 }],
    playerActions: [
      { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 6, carreaux: 2 } },
      { playerId: 'p2', playerName: 'Bob', team: 'B', actions: { tirs: 8, tirsSuccess: 4, points: 10, pointsSuccess: 5, carreaux: 1 } },
    ],
    ...overrides,
  } as any;
}

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    date: '2026-03-16T14:00:00Z',
    type: '10_tirs',
    mode: 'solo',
    playerId: 'p1',
    playerName: 'Alice',
    successCount: 7,
    totalShots: 10,
    carreauCount: 2,
    successRate: 70,
    duration: 120,
    ...overrides,
  } as any;
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Championnat Local',
    date: '2026-06-01',
    type: 'Mixte',
    format: 'Doublette',
    location: { city: 'Lyon', address: '...' },
    status: 'Terminé',
    ...overrides,
  } as any;
}

// ===== Tests =====

describe('E2E: Data Export Flow', () => {

  describe('Phase 1: Column Configuration', () => {
    test('match columns include all 12 fields', () => {
      expect(MATCH_COLUMNS).toHaveLength(12);
      expect(MATCH_COLUMNS.map(c => c.id)).toContain('date');
      expect(MATCH_COLUMNS.map(c => c.id)).toContain('menes');
      expect(MATCH_COLUMNS.map(c => c.id)).toContain('terrain');
    });

    test('challenge columns include all 11 fields', () => {
      expect(CHALLENGE_COLUMNS).toHaveLength(11);
      expect(CHALLENGE_COLUMNS.map(c => c.id)).toContain('type');
      expect(CHALLENGE_COLUMNS.map(c => c.id)).toContain('result');
    });

    test('getColumnsForDataType returns correct columns', () => {
      expect(getColumnsForDataType('matches')).toBe(MATCH_COLUMNS);
      expect(getColumnsForDataType('challenges')).toBe(CHALLENGE_COLUMNS);
      expect(getColumnsForDataType('statistics')).toEqual([]);
    });

    test('default columns are a subset of all columns', () => {
      const defaultMatch = MATCH_COLUMNS.filter(c => c.default);
      expect(defaultMatch.length).toBeGreaterThan(0);
      expect(defaultMatch.length).toBeLessThan(MATCH_COLUMNS.length);
      // menes and terrain are not default
      expect(defaultMatch.find(c => c.id === 'menes')).toBeUndefined();
    });

    test('all columns have FR and EN labels', () => {
      MATCH_COLUMNS.forEach(col => {
        expect(col.labelFr).toBeTruthy();
        expect(col.labelEn).toBeTruthy();
      });
      CHALLENGE_COLUMNS.forEach(col => {
        expect(col.labelFr).toBeTruthy();
        expect(col.labelEn).toBeTruthy();
      });
    });
  });

  describe('Phase 2: Period Stats Computation', () => {
    test('computes stats from matches', () => {
      const matches = [
        makeMatch({ winner: 'A' }),
        makeMatch({ winner: 'B' }),
        makeMatch({ winner: 'A' }),
      ];
      const stats = computePeriodStats(matches, [], 'Test');
      expect(stats.totalMatches).toBe(3);
      expect(stats.wins).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.winRate).toBe(67);
      expect(stats.label).toBe('Test');
    });

    test('computes tir/point/carreau rates', () => {
      const matches = [makeMatch()];
      const stats = computePeriodStats(matches, [], '');
      expect(stats.totalTirs).toBe(10); // only team A counted
      expect(stats.tirsSuccess).toBe(7);
      expect(stats.tirRate).toBe(70);
      expect(stats.totalPoints).toBe(8);
      expect(stats.pointsSuccess).toBe(6);
      expect(stats.pointRate).toBe(75);
      expect(stats.carreaux).toBe(2);
    });

    test('empty input returns zeros', () => {
      const stats = computePeriodStats([], [], 'Empty');
      expect(stats.totalMatches).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.tirRate).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });

    test('includes challenge count', () => {
      const challenges = [makeChallenge(), makeChallenge()];
      const stats = computePeriodStats([], challenges, '');
      expect(stats.totalChallenges).toBe(2);
    });

    test('computes average duration', () => {
      const matches = [
        makeMatch({ duration: 30 }),
        makeMatch({ duration: 60 }),
      ];
      const stats = computePeriodStats(matches, [], '');
      expect(stats.avgDuration).toBe(45);
    });
  });

  describe('Phase 3: Preview Generation', () => {
    const matches = [makeMatch(), makeMatch({ winner: 'B' })];
    const challenges = [makeChallenge()];
    const tournaments = [makeTournament()];

    test('preview for matches shows correct headers (FR)', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test' },
        matches, challenges, tournaments, {},
      );
      expect(preview.headers.length).toBeGreaterThan(0);
      expect(preview.totalRows).toBe(2);
      expect(preview.rows.length).toBeLessThanOrEqual(5);
    });

    test('preview for challenges shows correct headers (EN)', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'challenges', period: 'all', language: 'en', username: 'Test' },
        matches, challenges, tournaments, {},
      );
      expect(preview.headers.length).toBeGreaterThan(0);
      expect(preview.totalRows).toBe(1);
    });

    test('preview for statistics shows stat rows', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'statistics', period: 'all', language: 'fr', username: 'Test' },
        matches, challenges, tournaments, {},
      );
      expect(preview.headers).toEqual(['Stat', 'Valeur']);
      expect(preview.rows.length).toBeGreaterThan(0);
    });

    test('comparative preset shows period comparison', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'statistics', period: '30d', language: 'fr', username: 'Test', preset: 'comparative', comparePeriod: '7d' },
        matches, challenges, tournaments, {},
      );
      expect(preview.headers).toContain('Delta');
      expect(preview.title).toBe('Comparatif');
    });

    test('match preset shows single match detail', () => {
      const matchId = matches[0].id;
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test', preset: 'match', matchId },
        matches, challenges, tournaments, {},
      );
      expect(preview.headers).toEqual(['Info', 'Valeur']);
      expect(preview.totalRows).toBeGreaterThan(0);
    });

    test('tournament preset filters by tournament', () => {
      const tournamentMatches = [makeMatch({ tournamentId: 't1' }), makeMatch({ tournamentId: 't1' })];
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test', preset: 'tournament', tournamentId: 't1', tournamentName: 'Champ' },
        [...matches, ...tournamentMatches], challenges, tournaments, {},
      );
      expect(preview.totalRows).toBe(2);
      expect(preview.title).toBe('Champ');
    });

    test('challenge preset shows single challenge detail', () => {
      const challengeId = challenges[0].id;
      const preview = generatePreview(
        { format: 'csv', dataType: 'challenges', period: 'all', language: 'fr', username: 'Test', preset: 'challenge', challengeId },
        matches, challenges, tournaments, {},
      );
      expect(preview.totalRows).toBeGreaterThan(0);
    });

    test('player preset filters matches by player', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test', preset: 'player', playerId: 'p1', playerName: 'Alice' },
        matches, challenges, tournaments, {},
      );
      expect(preview.totalRows).toBe(2); // p1 is in all matches
      expect(preview.title).toBe('Alice');
    });

    test('empty matches returns zero rows', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test' },
        [], [], [], {},
      );
      expect(preview.totalRows).toBe(0);
      expect(preview.rows).toHaveLength(0);
    });
  });

  describe('Phase 4: CSV Generation', () => {
    const matches = [makeMatch(), makeMatch({ winner: 'B' })];
    const challenges = [makeChallenge(), makeChallenge({ type: 'precision', totalPoints: 18, maxPoints: 25 })];

    test('matchesToCsv produces valid CSV with headers', () => {
      const csv = matchesToCsv(matches, 'fr');
      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // header + 2 rows
      expect(lines[0]).toContain('Date');
      expect(lines[0]).toContain('Mode');
    });

    test('matchesToCsv with selected columns', () => {
      const csv = matchesToCsv(matches, 'en', ['date', 'winner']);
      const lines = csv.split('\n');
      const headers = lines[0].split(',');
      expect(headers).toHaveLength(2);
      expect(headers[0]).toBe('Date');
      expect(headers[1]).toBe('Winner');
    });

    test('matchesToCsv with semicolon separator', () => {
      const csv = matchesToCsv(matches, 'fr', undefined, ';');
      const lines = csv.split('\n');
      expect(lines[0]).toContain(';');
      expect(lines[0]).not.toContain(',');
    });

    test('challengesToCsv produces valid CSV', () => {
      const csv = challengesToCsv(challenges, 'fr');
      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // header + 2 rows
      expect(lines[0]).toContain('Type');
    });

    test('challengesToCsv with selected columns', () => {
      const csv = challengesToCsv(challenges, 'en', ['date', 'type', 'rate']);
      const lines = csv.split('\n');
      const headers = lines[0].split(',');
      expect(headers).toHaveLength(3);
    });

    test('statisticsToCsv produces complete stats', () => {
      const csv = statisticsToCsv(matches, challenges, [makeTournament()], {}, 'fr');
      expect(csv).toContain('Matchs joues');
      expect(csv).toContain('Taux de tir');
      expect(csv).toContain('Carreaux');
    });

    test('statisticsToCsv EN labels', () => {
      const csv = statisticsToCsv(matches, challenges, [], {}, 'en');
      expect(csv).toContain('Matches played');
      expect(csv).toContain('Shot rate');
    });

    test('CSV escapes commas in values', () => {
      const matchWithComma = makeMatch({
        teamA: { players: ['p1', 'p3'], playerNames: ['Alice, Jr.', 'Charlie'], score: 13 } as any,
      });
      const csv = matchesToCsv([matchWithComma], 'en');
      // Escaped value should be quoted
      expect(csv).toContain('"Alice, Jr. + Charlie"');
    });
  });

  describe('Phase 5: Season & Tournament Filtering', () => {
    test('season preset filters September to June', () => {
      const seasonMatches = [
        makeMatch({ date: '2025-09-15T10:00:00Z' }), // in season 2025
        makeMatch({ date: '2026-03-15T10:00:00Z' }), // in season 2025
        makeMatch({ date: '2025-08-15T10:00:00Z' }), // before season 2025
        makeMatch({ date: '2026-07-15T10:00:00Z' }), // after season 2025
      ];
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Test', preset: 'season', seasonYear: 2025 },
        seasonMatches, [], [], {},
      );
      expect(preview.totalRows).toBe(2);
      expect(preview.title).toBe('Saison 2025-2026');
    });

    test('tournament preset only includes tournament matches', () => {
      const allMatches = [
        makeMatch({ tournamentId: 't1' }),
        makeMatch({ tournamentId: 't1' }),
        makeMatch({ tournamentId: undefined }),
        makeMatch({ tournamentId: 't2' }),
      ];
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'en', username: 'Test', preset: 'tournament', tournamentId: 't1', tournamentName: 'Summer Cup' },
        allMatches, [], [], {},
      );
      expect(preview.totalRows).toBe(2);
      expect(preview.title).toBe('Summer Cup');
    });
  });

  describe('Phase 6: Comparative Analysis', () => {
    test('comparative shows delta between periods', () => {
      const recentMatches = [
        makeMatch({ date: new Date().toISOString(), winner: 'A' }),
        makeMatch({ date: new Date().toISOString(), winner: 'A' }),
      ];
      const olderDate = new Date();
      olderDate.setDate(olderDate.getDate() - 20);
      const olderMatches = [
        makeMatch({ date: olderDate.toISOString(), winner: 'B' }),
        makeMatch({ date: olderDate.toISOString(), winner: 'A' }),
      ];

      const preview = generatePreview(
        { format: 'csv', dataType: 'statistics', period: '7d', language: 'fr', username: 'Test', preset: 'comparative', comparePeriod: '30d' },
        [...recentMatches, ...olderMatches], [], [], {},
      );
      expect(preview.headers).toContain('Delta');
      expect(preview.rows.length).toBeGreaterThan(0);
      // Each row should have 4 columns: Stat, period1, period2, delta
      preview.rows.forEach(row => {
        expect(row).toHaveLength(4);
      });
    });

    test('comparative EN uses English labels', () => {
      const preview = generatePreview(
        { format: 'csv', dataType: 'statistics', period: '7d', language: 'en', username: 'Test', preset: 'comparative', comparePeriod: '30d' },
        [makeMatch()], [], [], {},
      );
      expect(preview.title).toBe('Comparative');
    });
  });

  describe('Phase 7: Full Export Pipeline Simulation', () => {
    test('complete match export flow: select → configure → preview → generate', () => {
      const matches = Array.from({ length: 20 }, (_, i) =>
        makeMatch({
          date: new Date(2026, 2, i + 1).toISOString(),
          winner: i % 3 === 0 ? 'B' : 'A',
        })
      );

      // Step 1: Select data type
      const columns = getColumnsForDataType('matches');
      expect(columns.length).toBe(12);

      // Step 2: Configure columns
      const selectedColumns = ['date', 'format', 'scoreA', 'scoreB', 'winner'];

      // Step 3: Preview
      const preview = generatePreview(
        { format: 'csv', dataType: 'matches', period: 'all', language: 'fr', username: 'Joueur' },
        matches, [], [], {},
      );
      expect(preview.totalRows).toBe(20);
      expect(preview.rows.length).toBeLessThanOrEqual(5);

      // Step 4: Generate CSV
      const csv = matchesToCsv(matches, 'fr', selectedColumns);
      const lines = csv.split('\n');
      expect(lines.length).toBe(21); // header + 20 rows
      const headerCols = lines[0].split(',');
      expect(headerCols).toHaveLength(5);
    });

    test('complete challenge export with precision type', () => {
      const challenges = [
        makeChallenge({ type: 'precision', totalPoints: 20, maxPoints: 25, successRate: undefined as any }),
        makeChallenge({ type: '10_tirs', successCount: 8, totalShots: 10 }),
      ];

      const preview = generatePreview(
        { format: 'csv', dataType: 'challenges', period: 'all', language: 'en', username: 'Player' },
        [], challenges, [], {},
      );
      expect(preview.totalRows).toBe(2);

      const csv = challengesToCsv(challenges, 'en');
      const lines = csv.split('\n');
      expect(lines.length).toBe(3);
    });

    test('statistics export includes all categories', () => {
      const matches = [makeMatch(), makeMatch({ winner: 'B' })];
      const challenges = [makeChallenge()];
      const tournaments = [makeTournament()];

      const csv = statisticsToCsv(matches, challenges, tournaments, {}, 'fr');
      expect(csv).toContain('Matchs joues');
      expect(csv).toContain('Victoires');
      expect(csv).toContain('Taux de tir');
      expect(csv).toContain('Taux de pointage');
      expect(csv).toContain('Carreaux');
      expect(csv).toContain('Defis completes');
      expect(csv).toContain('Tournois termines');
    });
  });

  describe('Phase 8: Edge Cases & Large Datasets', () => {
    test('100 matches export performance', () => {
      const matches = Array.from({ length: 100 }, (_, i) => makeMatch({ date: new Date(2026, 0, i + 1).toISOString() }));
      const start = Date.now();
      const csv = matchesToCsv(matches, 'fr');
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
      expect(csv.split('\n').length).toBe(101);
    });

    test('empty data produces header-only CSV', () => {
      const csv = matchesToCsv([], 'fr');
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // header only
    });

    test('match with missing optional fields', () => {
      const match = makeMatch({ duration: undefined, menes: undefined, playerActions: undefined, tournamentId: undefined } as any);
      const csv = matchesToCsv([match], 'fr');
      const lines = csv.split('\n');
      expect(lines.length).toBe(2);
    });

    test('challenge with missing scores', () => {
      const challenge = makeChallenge({ successCount: undefined, carreauCount: undefined, successRate: undefined } as any);
      const csv = challengesToCsv([challenge], 'en');
      expect(csv.split('\n').length).toBe(2);
    });
  });
});
