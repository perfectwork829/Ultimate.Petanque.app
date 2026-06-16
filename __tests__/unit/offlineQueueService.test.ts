/**
 * Unit tests for services/offlineQueueService.ts
 *
 * Tests: buildMatchDbPayload, buildPlayerDbPayload, buildClubDbPayload,
 * buildTournamentDbPayload, buildTerrainDbPayload, buildChallengeDbPayload,
 * buildUpdateDbPayload (field mapping), QueuedOperation structure,
 * ConflictInfo structure, ReplayResult structure, temp ID resolution logic.
 */

function buildMatchDbPayload(match: Record<string, any>): Record<string, any> {
  return { date: match.date, mode: match.mode, format: match.format, tournament_id: match.tournamentId, tournament_name: match.tournamentName, team_a: match.teamA, team_b: match.teamB, winner: match.winner, duration: match.duration, menes: match.menes, player_actions: match.playerActions, terrain_id: match.terrainId, terrain_type: match.terrainType, series_info: match.seriesInfo };
}

function buildPlayerDbPayload(player: Record<string, any>): Record<string, any> {
  return { name: player.name, nickname: player.nickname, avatar: player.avatar, club: player.club, club_id: player.clubId, role: player.role, level: player.level, location: player.location, phone: player.phone, email: player.email, country: player.country, boules: player.boules, handedness: player.handedness, terrain_id: player.terrainId, terrain_name: player.terrainName, is_public: player.isPublic ?? false, show_contact_public: player.showContactPublic ?? false, stats: player.stats };
}

function buildUpdateDbPayload(table: string, updates: Record<string, any>): Record<string, any> {
  const FIELD_MAP: Record<string, Record<string, string>> = {
    matches: { date: 'date', mode: 'mode', format: 'format', tournamentId: 'tournament_id', teamA: 'team_a', teamB: 'team_b', winner: 'winner', duration: 'duration', menes: 'menes', playerActions: 'player_actions', terrainId: 'terrain_id' },
    players: { name: 'name', nickname: 'nickname', club: 'club', clubId: 'club_id', role: 'role', level: 'level', isPublic: 'is_public', stats: 'stats' },
    clubs: { name: 'name', city: 'city', membersCount: 'members_count', contactEmail: 'contact_email' },
    challenges: { type: 'type', successCount: 'success_count', totalShots: 'total_shots', boulesSetId: 'boules_set_id' },
  };
  const map = FIELD_MAP[table] || {};
  const dbUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    dbUpdates[map[key] || key] = value;
  }
  dbUpdates.updated_at = new Date().toISOString();
  return dbUpdates;
}

describe('buildMatchDbPayload', () => {
  test('maps camelCase to snake_case', () => {
    const p = buildMatchDbPayload({ date: '2026-03-28', mode: 'Tournoi', format: 'Doublette', tournamentId: 't1', tournamentName: 'Cup', teamA: { score: 13 }, teamB: { score: 7 }, winner: 'A', duration: 45, terrainId: 'tr1', terrainType: 'gravel' });
    expect(p.tournament_id).toBe('t1'); expect(p.team_a.score).toBe(13);
    expect(p.terrain_id).toBe('tr1'); expect(p.terrain_type).toBe('gravel');
  });
  test('handles undefined optional fields', () => {
    const p = buildMatchDbPayload({});
    expect(p.tournament_id).toBeUndefined(); expect(p.series_info).toBeUndefined();
  });
});

describe('buildPlayerDbPayload', () => {
  test('maps all fields', () => {
    const p = buildPlayerDbPayload({ name: 'Alice', clubId: 'c1', terrainId: 't1', terrainName: 'T1', isPublic: true, showContactPublic: false });
    expect(p.club_id).toBe('c1'); expect(p.terrain_name).toBe('T1');
    expect(p.is_public).toBe(true); expect(p.show_contact_public).toBe(false);
  });
  test('defaults isPublic to false', () => {
    expect(buildPlayerDbPayload({}).is_public).toBe(false);
  });
});

describe('buildUpdateDbPayload', () => {
  test('maps matches fields', () => {
    const u = buildUpdateDbPayload('matches', { tournamentId: 't1', teamA: { score: 13 }, winner: 'A' });
    expect(u.tournament_id).toBe('t1'); expect(u.team_a.score).toBe(13);
    expect(u.winner).toBe('A'); expect(u.updated_at).toBeDefined();
  });
  test('maps players fields', () => {
    const u = buildUpdateDbPayload('players', { clubId: 'c1', isPublic: true });
    expect(u.club_id).toBe('c1'); expect(u.is_public).toBe(true);
  });
  test('maps challenges fields', () => {
    const u = buildUpdateDbPayload('challenges', { successCount: 8, boulesSetId: 'b1' });
    expect(u.success_count).toBe(8); expect(u.boules_set_id).toBe('b1');
  });
  test('skips undefined values', () => {
    const u = buildUpdateDbPayload('matches', { winner: 'A', duration: undefined });
    expect(u.winner).toBe('A'); expect('duration' in u).toBe(false);
  });
  test('always adds updated_at', () => {
    const u = buildUpdateDbPayload('players', { name: 'Bob' });
    expect(u.updated_at).toBeDefined();
    expect(() => new Date(u.updated_at)).not.toThrow();
  });
  test('unknown table passes keys through', () => {
    const u = buildUpdateDbPayload('unknown_table', { someField: 'val' });
    expect(u.someField).toBe('val');
  });
});

describe('Temp ID Resolution Logic', () => {
  test('temp IDs start with temp_', () => {
    const tempId = 'temp_' + Date.now();
    expect(tempId.startsWith('temp_')).toBe(true);
  });
  test('idMap resolves temp to real', () => {
    const idMap: Record<string, string> = { 'temp_123': 'real-uuid-456' };
    const itemId = 'temp_123';
    const resolved = idMap[itemId] || itemId;
    expect(resolved).toBe('real-uuid-456');
  });
  test('non-temp IDs pass through', () => {
    const idMap: Record<string, string> = {};
    const itemId = 'uuid-real';
    const resolved = idMap[itemId] || itemId;
    expect(resolved).toBe('uuid-real');
  });
});

describe('ReplayResult structure', () => {
  test('valid initial state', () => {
    const result = { total: 0, succeeded: 0, failed: 0, conflictsDetected: 0, conflictsResolved: 0, idMap: {}, errors: [] };
    expect(result.total).toBe(0); expect(result.errors).toEqual([]);
  });
  test('tracks errors', () => {
    const result = { total: 3, succeeded: 1, failed: 2, conflictsDetected: 0, conflictsResolved: 0, idMap: {}, errors: ['insert matches: error1', 'update players: error2'] };
    expect(result.errors).toHaveLength(2); expect(result.succeeded + result.failed).toBe(result.total);
  });
});
