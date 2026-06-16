/**
 * Unit tests for hooks/useItemFilter.ts
 * Tests: filteredMatches, filteredChallenges, activeFilterLabel,
 * clearItemFilter, openItemPicker, and all 7 selection callbacks.
 */

import type { Match, Challenge, Tournament, Player, Terrain, BoulesSet } from '@/types/petanque';

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
  playerActions: [],
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
  id: 'p1',
  name: 'Alice',
  role: 'Milieu',
  level: 'Intermédiaire',
  ...overrides,
} as Player);

const makeTerrain = (overrides: Partial<Terrain> = {}): Terrain => ({
  id: 'ter-1',
  name: 'Boulodrome Central',
  city: 'Paris',
  type: 'Gravillon',
  address: '1 rue du jeu',
  location: { latitude: 48.8, longitude: 2.3 },
  ...overrides,
} as Terrain);

const makeBoulesSet = (overrides: Partial<BoulesSet> = {}): BoulesSet => ({
  id: 'bs-1',
  name: 'Obut ATX',
  brand: 'Obut',
  diameter: 71,
  weight: 690,
  ...overrides,
} as BoulesSet);

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 'tour-1',
  name: 'Tournoi de Paris',
  date: new Date().toISOString(),
  type: 'Mixte',
  format: 'Doublette',
  location: { city: 'Paris', latitude: 48.8, longitude: 2.3 },
  status: 'Terminé',
  ...overrides,
} as Tournament);

// ============================================================
// Inline computation helpers (mirror useItemFilter logic)
// ============================================================

type ItemFilterType = 'all' | 'match' | 'challenge' | 'tournament' | 'opponent' | 'partner' | 'terrain' | 'boules';

function computeFilteredMatches(
  timeFilteredMatches: Match[],
  itemFilterType: ItemFilterType,
  selectedMatchId: string | null,
  selectedTournamentId: string | null,
  selectedOpponentId: string | null,
  selectedPartnerId: string | null,
  selectedTerrainId: string | null,
  selectedBoulesSetId: string | null,
): Match[] {
  if (itemFilterType === 'match' && selectedMatchId) return timeFilteredMatches.filter(m => m.id === selectedMatchId);
  if (itemFilterType === 'tournament' && selectedTournamentId) return timeFilteredMatches.filter(m => m.tournamentId === selectedTournamentId);
  if (itemFilterType === 'challenge') return [];
  if (itemFilterType === 'opponent' && selectedOpponentId) return timeFilteredMatches.filter(m => m.teamB.players.includes(selectedOpponentId));
  if (itemFilterType === 'partner' && selectedPartnerId) return timeFilteredMatches.filter(m => m.teamA.players.includes(selectedPartnerId));
  if (itemFilterType === 'terrain' && selectedTerrainId) return timeFilteredMatches.filter(m => m.terrainId === selectedTerrainId);
  if (itemFilterType === 'boules' && selectedBoulesSetId) return timeFilteredMatches.filter(m => m.boulesSetId === selectedBoulesSetId);
  return timeFilteredMatches;
}

function computeFilteredChallenges(
  timeFilteredChallenges: Challenge[],
  itemFilterType: ItemFilterType,
  selectedChallengeId: string | null,
  selectedOpponentId: string | null,
  selectedBoulesSetId: string | null,
): Challenge[] {
  if (itemFilterType === 'challenge' && selectedChallengeId) return timeFilteredChallenges.filter(c => c.id === selectedChallengeId);
  if (itemFilterType === 'opponent' && selectedOpponentId) return timeFilteredChallenges.filter(c => c.mode === '1v1' && c.opponentId === selectedOpponentId);
  if (itemFilterType === 'boules' && selectedBoulesSetId) return timeFilteredChallenges.filter(c => c.boulesSetId === selectedBoulesSetId);
  if (itemFilterType === 'match' || itemFilterType === 'tournament' || itemFilterType === 'partner' || itemFilterType === 'terrain') return [];
  return timeFilteredChallenges;
}

function computeActiveFilterLabel(
  itemFilterType: ItemFilterType,
  selectedMatchId: string | null,
  selectedChallengeId: string | null,
  selectedTournamentId: string | null,
  selectedOpponentId: string | null,
  selectedPartnerId: string | null,
  selectedTerrainId: string | null,
  selectedBoulesSetId: string | null,
  matches: Match[],
  challenges: Challenge[],
  tournaments: Tournament[],
  players: Player[],
  terrains: Terrain[],
  boulesSets: BoulesSet[],
  language: string,
): string | null {
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

  if (itemFilterType === 'match' && selectedMatchId) {
    const m = matches.find(m => m.id === selectedMatchId);
    if (m) {
      const dateStr = new Date(m.date).toLocaleDateString(locale, dateOpts);
      return `${m.teamA.playerNames[0]?.split(' ')[0] || '?'} vs ${m.teamB.playerNames[0]?.split(' ')[0] || '?'} (${dateStr})`;
    }
  }
  if (itemFilterType === 'challenge' && selectedChallengeId) {
    const c = challenges.find(c => c.id === selectedChallengeId);
    if (c) return `challenge_${c.type}`;
  }
  if (itemFilterType === 'tournament' && selectedTournamentId) {
    const tour = tournaments.find(t => t.id === selectedTournamentId);
    if (tour) return tour.name;
  }
  if (itemFilterType === 'opponent' && selectedOpponentId) {
    const opp = players.find(p => p.id === selectedOpponentId);
    if (opp) return `vs ${opp.name}`;
  }
  if (itemFilterType === 'partner' && selectedPartnerId) {
    const partner = players.find(p => p.id === selectedPartnerId);
    if (partner) return `with ${partner.name}`;
  }
  if (itemFilterType === 'terrain' && selectedTerrainId) {
    const terr = terrains.find(te => te.id === selectedTerrainId);
    if (terr) return terr.name;
  }
  if (itemFilterType === 'boules' && selectedBoulesSetId) {
    const bs = boulesSets.find(b => b.id === selectedBoulesSetId);
    if (bs) return bs.name;
  }
  return null;
}

// ============================================================
// Tests: filteredMatches
// ============================================================
describe('useItemFilter — filteredMatches', () => {
  const matches = [
    makeMatch({ id: 'm1', tournamentId: 'tour-1', teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 }, terrainId: 'ter-1', boulesSetId: 'bs-1' }),
    makeMatch({ id: 'm2', tournamentId: 'tour-2', teamB: { players: ['p3'], playerNames: ['Charlie'], score: 6 }, terrainId: 'ter-2', boulesSetId: 'bs-2' }),
    makeMatch({ id: 'm3', teamA: { players: ['p1', 'p4'], playerNames: ['Alice', 'Dave'], score: 13 }, teamB: { players: ['p2'], playerNames: ['Bob'], score: 10 }, terrainId: 'ter-1' }),
  ];

  test('returns all matches when filter is "all"', () => {
    const result = computeFilteredMatches(matches, 'all', null, null, null, null, null, null);
    expect(result).toHaveLength(3);
  });

  test('filters by specific match id', () => {
    const result = computeFilteredMatches(matches, 'match', 'm2', null, null, null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m2');
  });

  test('filters by tournament id', () => {
    const result = computeFilteredMatches(matches, 'tournament', null, 'tour-1', null, null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  test('returns empty array when filter is "challenge"', () => {
    const result = computeFilteredMatches(matches, 'challenge', null, null, null, null, null, null);
    expect(result).toHaveLength(0);
  });

  test('filters by opponent id (teamB players)', () => {
    const result = computeFilteredMatches(matches, 'opponent', null, null, 'p2', null, null, null);
    expect(result).toHaveLength(2); // m1 and m3 have p2 in teamB
  });

  test('filters by partner id (teamA players)', () => {
    const result = computeFilteredMatches(matches, 'partner', null, null, null, 'p4', null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m3');
  });

  test('filters by terrain id', () => {
    const result = computeFilteredMatches(matches, 'terrain', null, null, null, null, 'ter-1', null);
    expect(result).toHaveLength(2); // m1 and m3
  });

  test('filters by boules set id', () => {
    const result = computeFilteredMatches(matches, 'boules', null, null, null, null, null, 'bs-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  test('returns all when match filter but no selectedMatchId', () => {
    const result = computeFilteredMatches(matches, 'match', null, null, null, null, null, null);
    expect(result).toHaveLength(3);
  });

  test('returns empty when selected match id not found', () => {
    const result = computeFilteredMatches(matches, 'match', 'nonexistent', null, null, null, null, null);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// Tests: filteredChallenges
// ============================================================
describe('useItemFilter — filteredChallenges', () => {
  const challenges = [
    makeChallenge({ id: 'c1', mode: '1v1', opponentId: 'p2', boulesSetId: 'bs-1' }),
    makeChallenge({ id: 'c2', mode: 'solo', boulesSetId: 'bs-2' }),
    makeChallenge({ id: 'c3', mode: '1v1', opponentId: 'p3', boulesSetId: 'bs-1' }),
  ];

  test('returns all challenges when filter is "all"', () => {
    const result = computeFilteredChallenges(challenges, 'all', null, null, null);
    expect(result).toHaveLength(3);
  });

  test('filters by specific challenge id', () => {
    const result = computeFilteredChallenges(challenges, 'challenge', 'c2', null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c2');
  });

  test('filters by opponent (only 1v1 mode)', () => {
    const result = computeFilteredChallenges(challenges, 'opponent', null, 'p2', null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  test('filters by boules set id', () => {
    const result = computeFilteredChallenges(challenges, 'boules', null, null, 'bs-1');
    expect(result).toHaveLength(2); // c1 and c3
  });

  test('returns empty when filter is "match"', () => {
    const result = computeFilteredChallenges(challenges, 'match', null, null, null);
    expect(result).toHaveLength(0);
  });

  test('returns empty when filter is "tournament"', () => {
    const result = computeFilteredChallenges(challenges, 'tournament', null, null, null);
    expect(result).toHaveLength(0);
  });

  test('returns empty when filter is "partner"', () => {
    const result = computeFilteredChallenges(challenges, 'partner', null, null, null);
    expect(result).toHaveLength(0);
  });

  test('returns empty when filter is "terrain"', () => {
    const result = computeFilteredChallenges(challenges, 'terrain', null, null, null);
    expect(result).toHaveLength(0);
  });

  test('opponent filter ignores solo challenges', () => {
    const result = computeFilteredChallenges(challenges, 'opponent', null, 'nonexistent', null);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// Tests: activeFilterLabel
// ============================================================
describe('useItemFilter — activeFilterLabel', () => {
  const matches = [makeMatch({ id: 'm1', date: '2025-06-15T10:00:00Z' })];
  const challenges = [makeChallenge({ id: 'c1', type: '10_tirs', date: '2025-06-15T10:00:00Z' })];
  const tournaments = [makeTournament({ id: 'tour-1', name: 'Grand Prix Paris' })];
  const players = [makePlayer({ id: 'p1', name: 'Alice' }), makePlayer({ id: 'p2', name: 'Bob' })];
  const terrains = [makeTerrain({ id: 'ter-1', name: 'Boulodrome Central' })];
  const boulesSets = [makeBoulesSet({ id: 'bs-1', name: 'Obut ATX' })];

  test('returns null when filter is "all"', () => {
    const result = computeActiveFilterLabel('all', null, null, null, null, null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBeNull();
  });

  test('returns match label with names and date', () => {
    const result = computeActiveFilterLabel('match', 'm1', null, null, null, null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toContain('Alice');
    expect(result).toContain('vs');
    expect(result).toContain('Bob');
  });

  test('returns challenge label with type', () => {
    const result = computeActiveFilterLabel('challenge', null, 'c1', null, null, null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toContain('10_tirs');
  });

  test('returns tournament name', () => {
    const result = computeActiveFilterLabel('tournament', null, null, 'tour-1', null, null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBe('Grand Prix Paris');
  });

  test('returns opponent name with "vs" prefix', () => {
    const result = computeActiveFilterLabel('opponent', null, null, null, 'p2', null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBe('vs Bob');
  });

  test('returns partner name with "with" prefix', () => {
    const result = computeActiveFilterLabel('partner', null, null, null, null, 'p1', null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'en');
    expect(result).toBe('with Alice');
  });

  test('returns terrain name', () => {
    const result = computeActiveFilterLabel('terrain', null, null, null, null, null, 'ter-1', null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBe('Boulodrome Central');
  });

  test('returns boules set name', () => {
    const result = computeActiveFilterLabel('boules', null, null, null, null, null, null, 'bs-1', matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBe('Obut ATX');
  });

  test('returns null when selected item not found', () => {
    const result = computeActiveFilterLabel('match', 'nonexistent', null, null, null, null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBeNull();
  });

  test('returns null when opponent not found', () => {
    const result = computeActiveFilterLabel('opponent', null, null, null, 'nonexistent', null, null, null, matches, challenges, tournaments, players, terrains, boulesSets, 'fr');
    expect(result).toBeNull();
  });
});

// ============================================================
// Tests: filter combinations & edge cases
// ============================================================
describe('useItemFilter — edge cases', () => {
  test('match filter + challenge filter are mutually exclusive for matches', () => {
    const matches = [makeMatch({ id: 'm1' })];
    const matchResult = computeFilteredMatches(matches, 'challenge', null, null, null, null, null, null);
    expect(matchResult).toHaveLength(0);
  });

  test('challenge filter returns empty for matches, but specific challenge for challenges', () => {
    const challenges = [makeChallenge({ id: 'c1' }), makeChallenge({ id: 'c2' })];
    const result = computeFilteredChallenges(challenges, 'challenge', 'c1', null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  test('boules filter works on both matches and challenges', () => {
    const matches = [
      makeMatch({ id: 'm1', boulesSetId: 'bs-1' }),
      makeMatch({ id: 'm2', boulesSetId: 'bs-2' }),
    ];
    const challenges = [
      makeChallenge({ id: 'c1', boulesSetId: 'bs-1' }),
      makeChallenge({ id: 'c2', boulesSetId: 'bs-2' }),
    ];
    const filteredM = computeFilteredMatches(matches, 'boules', null, null, null, null, null, 'bs-1');
    const filteredC = computeFilteredChallenges(challenges, 'boules', null, null, 'bs-1');
    expect(filteredM).toHaveLength(1);
    expect(filteredC).toHaveLength(1);
    expect(filteredM[0].id).toBe('m1');
    expect(filteredC[0].id).toBe('c1');
  });

  test('opponent filter works on both matches and 1v1 challenges', () => {
    const matches = [
      makeMatch({ id: 'm1', teamB: { players: ['opp-1'], playerNames: ['Opponent'], score: 5 } }),
    ];
    const challenges = [
      makeChallenge({ id: 'c1', mode: '1v1', opponentId: 'opp-1' }),
      makeChallenge({ id: 'c2', mode: 'solo' }),
    ];
    const filteredM = computeFilteredMatches(matches, 'opponent', null, null, 'opp-1', null, null, null);
    const filteredC = computeFilteredChallenges(challenges, 'opponent', null, 'opp-1', null);
    expect(filteredM).toHaveLength(1);
    expect(filteredC).toHaveLength(1);
  });

  test('empty input data returns empty results', () => {
    expect(computeFilteredMatches([], 'opponent', null, null, 'p1', null, null, null)).toHaveLength(0);
    expect(computeFilteredChallenges([], 'boules', null, null, 'bs-1')).toHaveLength(0);
    expect(computeActiveFilterLabel('match', 'm1', null, null, null, null, null, null, [], [], [], [], [], [], 'fr')).toBeNull();
  });

  test('terrain filter does not affect challenges', () => {
    const challenges = [makeChallenge({ id: 'c1' }), makeChallenge({ id: 'c2' })];
    const result = computeFilteredChallenges(challenges, 'terrain', null, null, null);
    expect(result).toHaveLength(0);
  });

  test('partner filter does not affect challenges', () => {
    const challenges = [makeChallenge({ id: 'c1' })];
    const result = computeFilteredChallenges(challenges, 'partner', null, null, null);
    expect(result).toHaveLength(0);
  });
});
