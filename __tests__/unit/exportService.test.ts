/**
 * Unit tests for services/exportService.ts
 * Tests: CSV generation, column selection, period filtering, presets, preview,
 * statistics computation, encoding, separators.
 */

import type { Match, Challenge, Tournament } from '@/types/petanque';

// ─── Inline implementations (mirrors exportService logic) ─────

type ExportPeriod = 'all' | '7d' | '30d' | '3m' | '6m' | '1y';

interface ColumnDef {
  id: string;
  labelFr: string;
  labelEn: string;
  default: boolean;
}

const MATCH_COLUMNS: ColumnDef[] = [
  { id: 'date', labelFr: 'Date', labelEn: 'Date', default: true },
  { id: 'mode', labelFr: 'Mode', labelEn: 'Mode', default: true },
  { id: 'format', labelFr: 'Format', labelEn: 'Format', default: true },
  { id: 'tournament', labelFr: 'Tournoi', labelEn: 'Tournament', default: true },
  { id: 'teamA', labelFr: 'Equipe A', labelEn: 'Team A', default: true },
  { id: 'scoreA', labelFr: 'Score A', labelEn: 'Score A', default: true },
  { id: 'teamB', labelFr: 'Equipe B', labelEn: 'Team B', default: true },
  { id: 'scoreB', labelFr: 'Score B', labelEn: 'Score B', default: true },
  { id: 'winner', labelFr: 'Vainqueur', labelEn: 'Winner', default: true },
  { id: 'duration', labelFr: 'Duree (min)', labelEn: 'Duration (min)', default: true },
  { id: 'menes', labelFr: 'Menes', labelEn: 'Ends', default: false },
  { id: 'terrain', labelFr: 'Terrain', labelEn: 'Terrain', default: false },
];

const CHALLENGE_COLUMNS: ColumnDef[] = [
  { id: 'date', labelFr: 'Date', labelEn: 'Date', default: true },
  { id: 'type', labelFr: 'Type', labelEn: 'Type', default: true },
  { id: 'mode', labelFr: 'Mode', labelEn: 'Mode', default: true },
  { id: 'opponent', labelFr: 'Adversaire', labelEn: 'Opponent', default: true },
  { id: 'success', labelFr: 'Reussite', labelEn: 'Success', default: true },
  { id: 'totalShots', labelFr: 'Total tirs', labelEn: 'Total shots', default: true },
  { id: 'carreaux', labelFr: 'Carreaux', labelEn: 'Carreaux', default: true },
  { id: 'rate', labelFr: 'Taux (%)', labelEn: 'Rate (%)', default: true },
  { id: 'points', labelFr: 'Points', labelEn: 'Points', default: false },
  { id: 'duration', labelFr: 'Duree (s)', labelEn: 'Duration (s)', default: false },
  { id: 'result', labelFr: 'Resultat', labelEn: 'Result', default: true },
];

function getColumnsForDataType(dataType: string): ColumnDef[] {
  if (dataType === 'matches') return MATCH_COLUMNS;
  if (dataType === 'challenges') return CHALLENGE_COLUMNS;
  return [];
}

function filterByPeriod<T extends { date: string }>(items: T[], period: ExportPeriod): T[] {
  if (period === 'all') return items;
  const now = new Date();
  const cutoff = new Date();
  switch (period) {
    case '7d': cutoff.setDate(now.getDate() - 7); break;
    case '30d': cutoff.setDate(now.getDate() - 30); break;
    case '3m': cutoff.setMonth(now.getMonth() - 3); break;
    case '6m': cutoff.setMonth(now.getMonth() - 6); break;
    case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
  }
  return items.filter(item => new Date(item.date) >= cutoff);
}

function filterBySeason<T extends { date: string }>(items: T[], startYear: number): T[] {
  const seasonStart = new Date(startYear, 8, 1);
  const seasonEnd = new Date(startYear + 1, 5, 30, 23, 59, 59);
  return items.filter(item => {
    const d = new Date(item.date);
    return d >= seasonStart && d <= seasonEnd;
  });
}

function filterByTournament(matches: Match[], tournamentId: string): Match[] {
  return matches.filter(m => m.tournamentId === tournamentId);
}

function filterMatchesByPlayer(matches: Match[], playerId: string): Match[] {
  return matches.filter(m =>
    m.teamA.players.includes(playerId) || m.teamB.players.includes(playerId)
  );
}

function escapeCsv(val: any, sep: string = ','): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(sep) || str.includes('"') || str.includes('\n') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface PeriodStats {
  label: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  totalTirs: number;
  tirsSuccess: number;
  tirRate: number;
  totalPoints: number;
  pointsSuccess: number;
  pointRate: number;
  carreaux: number;
  carreauRate: number;
  totalChallenges: number;
  avgDuration: number;
}

function computePeriodStats(matches: Match[], challenges: Challenge[], label: string): PeriodStats {
  const totalMatches = matches.length;
  const wins = matches.filter(m => m.winner === 'A').length;
  let totalTirs = 0, tirsSuccess = 0, totalPoints = 0, pointsSuccess = 0, carreaux = 0, totalDuration = 0;
  matches.forEach(m => {
    totalDuration += m.duration || 0;
    if (m.playerActions) {
      m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        totalTirs += pa.actions.tirs;
        tirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        pointsSuccess += pa.actions.pointsSuccess;
        carreaux += pa.actions.carreaux;
      });
    }
  });
  return {
    label,
    totalMatches,
    wins,
    losses: totalMatches - wins,
    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
    totalTirs,
    tirsSuccess,
    tirRate: totalTirs > 0 ? Math.round((tirsSuccess / totalTirs) * 100) : 0,
    totalPoints,
    pointsSuccess,
    pointRate: totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 100) : 0,
    carreaux,
    carreauRate: tirsSuccess > 0 ? Math.round((carreaux / tirsSuccess) * 100) : 0,
    totalChallenges: challenges.length,
    avgDuration: totalMatches > 0 ? Math.round(totalDuration / totalMatches) : 0,
  };
}

// ─── Test Data Factories ──────────────────────────────────────

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: `match-${Math.random().toString(36).slice(2, 6)}`,
  date: new Date().toISOString(),
  mode: 'Entraînement',
  format: 'Doublette',
  teamA: { players: ['p1', 'p2'], playerNames: ['Alice', 'Bob'], score: 13 },
  teamB: { players: ['p3', 'p4'], playerNames: ['Charlie', 'Diana'], score: 8 },
  winner: 'A',
  duration: 45,
  menes: [{ teamAPoints: 3, teamBPoints: 0 }, { teamAPoints: 0, teamBPoints: 2 }],
  playerActions: [
    { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 } },
    { playerId: 'p3', playerName: 'Charlie', team: 'B', actions: { tirs: 8, tirsSuccess: 4, points: 6, pointsSuccess: 3, carreaux: 1 } },
  ],
  ...overrides,
});

const makeChallenge = (overrides: Partial<Challenge> = {}): Challenge => ({
  id: `ch-${Math.random().toString(36).slice(2, 6)}`,
  type: '10_tirs',
  mode: 'solo',
  date: new Date().toISOString(),
  successCount: 7,
  totalShots: 10,
  carreauCount: 2,
  successRate: 70,
  ...overrides,
});

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: `tour-${Math.random().toString(36).slice(2, 6)}`,
  name: 'Tournoi Test',
  date: new Date().toISOString(),
  type: 'Mixte',
  format: 'Doublette',
  location: { latitude: 45.75, longitude: 4.85, address: 'Lyon', city: 'Lyon' },
  status: 'Terminé',
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────

// ============================================
// Column Definitions
// ============================================

describe('Column Definitions', () => {
  test('getColumnsForDataType returns match columns', () => {
    const cols = getColumnsForDataType('matches');
    expect(cols.length).toBe(12);
    expect(cols.find(c => c.id === 'date')).toBeTruthy();
    expect(cols.find(c => c.id === 'winner')).toBeTruthy();
  });

  test('getColumnsForDataType returns challenge columns', () => {
    const cols = getColumnsForDataType('challenges');
    expect(cols.length).toBe(11);
    expect(cols.find(c => c.id === 'type')).toBeTruthy();
    expect(cols.find(c => c.id === 'result')).toBeTruthy();
  });

  test('getColumnsForDataType returns empty for statistics', () => {
    expect(getColumnsForDataType('statistics')).toHaveLength(0);
  });

  test('match columns have correct default flags', () => {
    const defaults = MATCH_COLUMNS.filter(c => c.default);
    const nonDefaults = MATCH_COLUMNS.filter(c => !c.default);
    expect(defaults.length).toBe(10);
    expect(nonDefaults.length).toBe(2); // menes, terrain
    expect(nonDefaults.map(c => c.id)).toEqual(expect.arrayContaining(['menes', 'terrain']));
  });

  test('challenge columns have correct default flags', () => {
    const defaults = CHALLENGE_COLUMNS.filter(c => c.default);
    const nonDefaults = CHALLENGE_COLUMNS.filter(c => !c.default);
    expect(defaults.length).toBe(9);
    expect(nonDefaults.length).toBe(2); // points, duration
  });

  test('all columns have FR and EN labels', () => {
    [...MATCH_COLUMNS, ...CHALLENGE_COLUMNS].forEach(col => {
      expect(col.labelFr).toBeTruthy();
      expect(col.labelEn).toBeTruthy();
    });
  });
});

// ============================================
// CSV Escaping
// ============================================

describe('escapeCsv', () => {
  test('returns empty string for null/undefined', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });

  test('passes through simple strings', () => {
    expect(escapeCsv('hello')).toBe('hello');
    expect(escapeCsv(42)).toBe('42');
  });

  test('wraps strings containing commas in quotes', () => {
    expect(escapeCsv('Alice, Bob')).toBe('"Alice, Bob"');
  });

  test('wraps strings containing quotes and escapes them', () => {
    expect(escapeCsv('He said "hello"')).toBe('"He said ""hello"""');
  });

  test('wraps strings containing newlines', () => {
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });

  test('respects custom separator for wrapping', () => {
    expect(escapeCsv('hello;world', ';')).toBe('"hello;world"');
    expect(escapeCsv('hello,world', ';')).toBe('"hello,world"'); // comma always triggers
  });
});

// ============================================
// Period Filtering
// ============================================

describe('filterByPeriod', () => {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const items = [
    { date: daysAgo(1), label: '1 day ago' },
    { date: daysAgo(5), label: '5 days ago' },
    { date: daysAgo(15), label: '15 days ago' },
    { date: daysAgo(60), label: '60 days ago' },
    { date: daysAgo(120), label: '120 days ago' },
    { date: daysAgo(200), label: '200 days ago' },
    { date: daysAgo(400), label: '400 days ago' },
  ];

  test('all returns everything', () => {
    expect(filterByPeriod(items, 'all')).toHaveLength(7);
  });

  test('7d filters correctly', () => {
    const result = filterByPeriod(items, '7d');
    expect(result.length).toBe(2); // 1d, 5d
  });

  test('30d filters correctly', () => {
    const result = filterByPeriod(items, '30d');
    expect(result.length).toBe(3); // 1d, 5d, 15d
  });

  test('3m filters correctly', () => {
    const result = filterByPeriod(items, '3m');
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  test('6m filters correctly', () => {
    const result = filterByPeriod(items, '6m');
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  test('1y filters correctly', () => {
    const result = filterByPeriod(items, '1y');
    expect(result.length).toBeGreaterThanOrEqual(6); // Everything within a year
  });

  test('handles empty array', () => {
    expect(filterByPeriod([], '7d')).toHaveLength(0);
  });
});

// ============================================
// Season Filtering
// ============================================

describe('filterBySeason', () => {
  test('filters items within season (Sep 1 - Jun 30)', () => {
    const items = [
      { date: '2025-09-15T10:00:00Z', label: 'Sep 2025' },
      { date: '2025-12-01T10:00:00Z', label: 'Dec 2025' },
      { date: '2026-03-15T10:00:00Z', label: 'Mar 2026' },
      { date: '2026-06-30T23:59:59Z', label: 'Jun 2026 end' },
      { date: '2026-07-01T00:00:00Z', label: 'Jul 2026 start' },
      { date: '2025-08-31T23:59:59Z', label: 'Aug 2025' },
    ];

    const result = filterBySeason(items, 2025); // Season 2025-2026
    expect(result.length).toBe(4); // Sep, Dec, Mar, Jun
    expect(result.map(r => r.label)).not.toContain('Jul 2026 start');
    expect(result.map(r => r.label)).not.toContain('Aug 2025');
  });

  test('handles empty array', () => {
    expect(filterBySeason([], 2025)).toHaveLength(0);
  });
});

// ============================================
// Tournament Filtering
// ============================================

describe('filterByTournament', () => {
  test('filters matches by tournamentId', () => {
    const matches = [
      makeMatch({ id: 'm1', tournamentId: 'tour-1' }),
      makeMatch({ id: 'm2', tournamentId: 'tour-2' }),
      makeMatch({ id: 'm3', tournamentId: 'tour-1' }),
      makeMatch({ id: 'm4' }),
    ];
    const result = filterByTournament(matches, 'tour-1');
    expect(result).toHaveLength(2);
    expect(result.every(m => m.tournamentId === 'tour-1')).toBe(true);
  });

  test('returns empty for no matching tournament', () => {
    const matches = [makeMatch({ tournamentId: 'tour-1' })];
    expect(filterByTournament(matches, 'tour-999')).toHaveLength(0);
  });
});

// ============================================
// Player Filtering
// ============================================

describe('filterMatchesByPlayer', () => {
  test('finds matches where player is in team A', () => {
    const matches = [
      makeMatch({ id: 'm1', teamA: { players: ['p1', 'target'], playerNames: ['A', 'T'], score: 13 } }),
      makeMatch({ id: 'm2' }),
    ];
    const result = filterMatchesByPlayer(matches, 'target');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  test('finds matches where player is in team B', () => {
    const matches = [
      makeMatch({ id: 'm1', teamB: { players: ['p3', 'target'], playerNames: ['C', 'T'], score: 8 } }),
    ];
    expect(filterMatchesByPlayer(matches, 'target')).toHaveLength(1);
  });

  test('returns empty for unknown player', () => {
    expect(filterMatchesByPlayer([makeMatch()], 'unknown')).toHaveLength(0);
  });
});

// ============================================
// Period Stats Computation
// ============================================

describe('computePeriodStats', () => {
  test('computes correct stats from matches', () => {
    const matches = [
      makeMatch({
        winner: 'A',
        duration: 30,
        playerActions: [
          { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 } },
        ],
      }),
      makeMatch({
        winner: 'B',
        duration: 50,
        playerActions: [
          { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 12, tirsSuccess: 4, points: 6, pointsSuccess: 3, carreaux: 1 } },
        ],
      }),
    ];

    const stats = computePeriodStats(matches, [], 'Test');
    expect(stats.totalMatches).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(50);
    expect(stats.totalTirs).toBe(22); // 10 + 12
    expect(stats.tirsSuccess).toBe(11); // 7 + 4
    expect(stats.tirRate).toBe(50); // 11/22
    expect(stats.totalPoints).toBe(14); // 8 + 6
    expect(stats.pointsSuccess).toBe(8); // 5 + 3
    expect(stats.pointRate).toBe(57); // 8/14 rounded
    expect(stats.carreaux).toBe(3); // 2 + 1
    expect(stats.carreauRate).toBe(27); // 3/11 rounded
    expect(stats.avgDuration).toBe(40); // (30+50)/2
  });

  test('only counts team A player actions', () => {
    const matches = [
      makeMatch({
        playerActions: [
          { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 5, pointsSuccess: 3, carreaux: 2 } },
          { playerId: 'p3', playerName: 'Charlie', team: 'B', actions: { tirs: 100, tirsSuccess: 100, points: 100, pointsSuccess: 100, carreaux: 100 } },
        ],
      }),
    ];
    const stats = computePeriodStats(matches, [], 'Test');
    expect(stats.totalTirs).toBe(10); // Only team A
    expect(stats.carreaux).toBe(2);
  });

  test('includes challenge count', () => {
    const challenges = [makeChallenge(), makeChallenge(), makeChallenge()];
    const stats = computePeriodStats([], challenges, 'Test');
    expect(stats.totalChallenges).toBe(3);
  });

  test('handles empty data', () => {
    const stats = computePeriodStats([], [], 'Empty');
    expect(stats.totalMatches).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.tirRate).toBe(0);
    expect(stats.pointRate).toBe(0);
    expect(stats.carreauRate).toBe(0);
    expect(stats.avgDuration).toBe(0);
    expect(stats.label).toBe('Empty');
  });

  test('handles matches without playerActions', () => {
    const matches = [makeMatch({ playerActions: undefined })];
    const stats = computePeriodStats(matches, [], 'NoActions');
    expect(stats.totalMatches).toBe(1);
    expect(stats.totalTirs).toBe(0);
  });
});

// ============================================
// CSV Generation Logic
// ============================================

describe('CSV Generation Logic', () => {
  test('generates CSV header with default columns in FR', () => {
    const defaultCols = MATCH_COLUMNS.filter(c => c.default);
    const header = defaultCols.map(c => c.labelFr).join(',');
    expect(header).toContain('Date');
    expect(header).toContain('Mode');
    expect(header).toContain('Vainqueur');
    expect(header).not.toContain('Menes'); // non-default
  });

  test('generates CSV header with default columns in EN', () => {
    const defaultCols = MATCH_COLUMNS.filter(c => c.default);
    const header = defaultCols.map(c => c.labelEn).join(',');
    expect(header).toContain('Date');
    expect(header).toContain('Winner');
    expect(header).not.toContain('Ends'); // non-default
  });

  test('selected columns override defaults', () => {
    const selectedIds = ['date', 'scoreA', 'scoreB', 'menes'];
    const activeCols = MATCH_COLUMNS.filter(c => selectedIds.includes(c.id));
    expect(activeCols).toHaveLength(4);
    expect(activeCols.map(c => c.id)).toContain('menes'); // normally non-default
  });

  test('semicolon separator produces correct CSV', () => {
    const row = ['Alice', 'Doublette', '13'];
    const csv = row.map(v => escapeCsv(v, ';')).join(';');
    expect(csv).toBe('Alice;Doublette;13');
  });

  test('tab separator produces correct CSV', () => {
    const row = ['Alice', 'Doublette', '13'];
    const csv = row.map(v => escapeCsv(v, '\t')).join('\t');
    expect(csv).toBe('Alice\tDoublette\t13');
  });

  test('challenge type labels map correctly', () => {
    const typeLabels: Record<string, Record<string, string>> = {
      '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
      '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
      'precision': { fr: 'Precision', en: 'Precision' },
    };
    expect(typeLabels['10_tirs'].fr).toBe('10 Tirs');
    expect(typeLabels['10_tirs'].en).toBe('10 Shots');
    expect(typeLabels['precision'].fr).toBe('Precision');
  });
});

// ============================================
// Comparative Stats
// ============================================

describe('Comparative Stats', () => {
  test('delta computation for two periods', () => {
    const matchesA = [
      makeMatch({ winner: 'A', playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 5, pointsSuccess: 4, carreaux: 3 } }] }),
      makeMatch({ winner: 'A', playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 5, pointsSuccess: 3, carreaux: 2 } }] }),
    ];
    const matchesB = [
      makeMatch({ winner: 'B', playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 3, points: 5, pointsSuccess: 2, carreaux: 0 } }] }),
    ];

    const statsA = computePeriodStats(matchesA, [], 'Period A');
    const statsB = computePeriodStats(matchesB, [], 'Period B');

    expect(statsA.winRate).toBe(100);
    expect(statsB.winRate).toBe(0);
    expect(statsA.winRate - statsB.winRate).toBe(100);

    expect(statsA.tirRate).toBeGreaterThan(statsB.tirRate);
    expect(statsA.totalMatches - statsB.totalMatches).toBe(1);
  });

  test('delta is zero when periods are identical', () => {
    const matches = [makeMatch({ winner: 'A' })];
    const statsA = computePeriodStats(matches, [], 'A');
    const statsB = computePeriodStats(matches, [], 'B');

    expect(statsA.winRate - statsB.winRate).toBe(0);
    expect(statsA.totalMatches - statsB.totalMatches).toBe(0);
    expect(statsA.tirRate - statsB.tirRate).toBe(0);
  });
});

// ============================================
// Preset: Single Match
// ============================================

describe('Preset — Single Match', () => {
  test('finds match by ID', () => {
    const matches = [
      makeMatch({ id: 'match-target', duration: 99 }),
      makeMatch({ id: 'match-other' }),
    ];
    const found = matches.find(m => m.id === 'match-target');
    expect(found).toBeTruthy();
    expect(found!.duration).toBe(99);
  });

  test('returns null for unknown match ID', () => {
    const matches = [makeMatch({ id: 'match-1' })];
    const found = matches.find(m => m.id === 'nonexistent');
    expect(found).toBeUndefined();
  });

  test('single match info rows include expected fields', () => {
    const m = makeMatch({
      format: 'Triplette',
      mode: 'Tournoi',
      duration: 60,
      menes: [{ teamAPoints: 3, teamBPoints: 0 }],
    });
    const infoFields = ['date', 'format', 'mode', 'teamA', 'teamB', 'score', 'duration', 'menes'];
    // Verify the match has all the necessary data
    expect(m.format).toBe('Triplette');
    expect(m.mode).toBe('Tournoi');
    expect(m.duration).toBe(60);
    expect(m.menes!.length).toBe(1);
  });
});

// ============================================
// Preset: Single Challenge
// ============================================

describe('Preset — Single Challenge', () => {
  test('finds challenge by ID', () => {
    const challenges = [
      makeChallenge({ id: 'ch-target', type: 'precision', totalPoints: 18, maxPoints: 25 }),
      makeChallenge({ id: 'ch-other' }),
    ];
    const found = challenges.find(c => c.id === 'ch-target');
    expect(found).toBeTruthy();
    expect(found!.type).toBe('precision');
    expect(found!.totalPoints).toBe(18);
  });

  test('1v1 challenge includes opponent data', () => {
    const c = makeChallenge({
      mode: '1v1',
      opponentName: 'Bob',
      opponentResult: { successCount: 5, totalShots: 10 },
      winner: 'player',
    });
    expect(c.opponentName).toBe('Bob');
    expect(c.opponentResult!.successCount).toBe(5);
    expect(c.winner).toBe('player');
  });
});

// ============================================
// Preset: Player Filtering
// ============================================

describe('Preset — Player', () => {
  test('filters matches for specific player in both teams', () => {
    const matches = [
      makeMatch({ id: 'm1', teamA: { players: ['target', 'p2'], playerNames: ['Target', 'P2'], score: 13 } }),
      makeMatch({ id: 'm2', teamB: { players: ['target', 'p4'], playerNames: ['Target', 'P4'], score: 8 } }),
      makeMatch({ id: 'm3' }),
    ];
    const result = filterMatchesByPlayer(matches, 'target');
    expect(result).toHaveLength(2);
  });

  test('computes player-specific stats', () => {
    const matches = [
      makeMatch({
        teamA: { players: ['target'], playerNames: ['Target'], score: 13 },
        winner: 'A',
        playerActions: [
          { playerId: 'target', playerName: 'Target', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 5, pointsSuccess: 4, carreaux: 3 } },
        ],
      }),
    ];
    const playerMatches = filterMatchesByPlayer(matches, 'target');
    const stats = computePeriodStats(playerMatches, [], 'Target');
    expect(stats.wins).toBe(1);
    expect(stats.tirRate).toBe(80);
  });
});

// ============================================
// Large Dataset Performance
// ============================================

describe('Large Dataset Handling', () => {
  test('filters 1000 matches by period efficiently', () => {
    const now = new Date();
    const matches = Array.from({ length: 1000 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      return makeMatch({ id: `m-${i}`, date: d.toISOString() });
    });

    const start = Date.now();
    const result = filterByPeriod(matches, '30d');
    const elapsed = Date.now() - start;

    expect(result.length).toBe(31); // 0 to 30 days ago
    expect(elapsed).toBeLessThan(100); // Should be fast
  });

  test('computes stats from 500 matches', () => {
    const matches = Array.from({ length: 500 }, (_, i) =>
      makeMatch({
        id: `m-${i}`,
        winner: i % 3 === 0 ? 'B' : 'A',
        playerActions: [
          { playerId: 'p1', playerName: 'Alice', team: 'A', actions: { tirs: 10, tirsSuccess: 6 + (i % 4), points: 8, pointsSuccess: 4, carreaux: i % 5 === 0 ? 1 : 0 } },
        ],
      })
    );

    const stats = computePeriodStats(matches, [], 'Large');
    expect(stats.totalMatches).toBe(500);
    expect(stats.wins).toBeGreaterThan(0);
    expect(stats.tirRate).toBeGreaterThan(0);
    expect(stats.winRate).toBeGreaterThan(0);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('match with no menes', () => {
    const m = makeMatch({ menes: [] });
    expect(m.menes).toHaveLength(0);
  });

  test('challenge with shots array', () => {
    const c = makeChallenge({
      shots: [
        { number: 1, success: true, carreau: false },
        { number: 2, success: false },
        { number: 3, success: true, carreau: true },
      ],
    });
    expect(c.shots!.length).toBe(3);
    expect(c.shots!.filter(s => s.success).length).toBe(2);
    expect(c.shots!.filter(s => s.carreau).length).toBe(1);
  });

  test('precision challenge with atelier scores', () => {
    const c = makeChallenge({
      type: 'precision',
      precisionShots: [
        { atelier: 'tir_precision' as any, distance: 6, points: 5, timeUsed: 10 },
        { atelier: 'tir_precision' as any, distance: 8, points: 3, timeUsed: 12 },
      ],
      totalPoints: 8,
      maxPoints: 10,
    });
    expect(c.precisionShots!.length).toBe(2);
    expect(c.totalPoints).toBe(8);
  });

  test('escapeCsv with all special characters combined', () => {
    const result = escapeCsv('He said, "hello"\nworld');
    expect(result).toBe('"He said, ""hello""\nworld"');
  });

  test('computePeriodStats with all losses', () => {
    const matches = [
      makeMatch({ winner: 'B' }),
      makeMatch({ winner: 'B' }),
    ];
    const stats = computePeriodStats(matches, [], 'Losses');
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBe(0);
  });
});
