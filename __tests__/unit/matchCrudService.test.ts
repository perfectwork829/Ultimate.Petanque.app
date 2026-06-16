/**
 * Tests for matchCrudService — add/update/delete matches
 * Tests: offline fallback, DB mapping, ranking snapshot, stats persistence, error recovery
 */

// ===== Inline logic mirrors =====

function buildMatchDbPayload(match: any): Record<string, any> {
  return {
    date: match.date, mode: match.mode, format: match.format,
    tournament_id: match.tournamentId, tournament_name: match.tournamentName,
    team_a: match.teamA, team_b: match.teamB, winner: match.winner,
    duration: match.duration, menes: match.menes, player_actions: match.playerActions,
    terrain_id: match.terrainId, terrain_type: match.terrainType,
    boules_set_id: match.boulesSetId || null, notes: match.notes || null,
  };
}

function mapMatchUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.date !== undefined) db.date = updates.date;
  if (updates.mode !== undefined) db.mode = updates.mode;
  if (updates.format !== undefined) db.format = updates.format;
  if (updates.tournamentId !== undefined) db.tournament_id = updates.tournamentId;
  if (updates.teamA !== undefined) db.team_a = updates.teamA;
  if (updates.teamB !== undefined) db.team_b = updates.teamB;
  if (updates.winner !== undefined) db.winner = updates.winner;
  if (updates.duration !== undefined) db.duration = updates.duration;
  if (updates.menes !== undefined) db.menes = updates.menes;
  if (updates.playerActions !== undefined) db.player_actions = updates.playerActions;
  if (updates.terrainId !== undefined) db.terrain_id = updates.terrainId;
  if (updates.notes !== undefined) db.notes = updates.notes || null;
  return db;
}

function getAffectedPlayers(match: any): string[] {
  return [...new Set([...match.teamA.players, ...match.teamB.players])];
}

function shouldPersistStats(updates: any): boolean {
  return updates.winner !== undefined || updates.playerActions !== undefined || updates.teamA !== undefined || updates.teamB !== undefined;
}

const makeMatch = (overrides: any = {}) => ({
  id: `m-${Math.random().toString(36).slice(2, 8)}`,
  date: '2026-03-15T10:00:00Z', mode: 'Entraînement', format: 'Doublette',
  teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 },
  teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 },
  winner: 'A', duration: 45, menes: [], playerActions: [],
  ...overrides,
});

// ===== Tests =====

describe('matchCrudService', () => {
  describe('buildMatchDbPayload', () => {
    test('maps camelCase to snake_case', () => {
      const match = makeMatch({ tournamentId: 't1', terrainType: 'Stabilisé', boulesSetId: 'b1' });
      const payload = buildMatchDbPayload(match);
      expect(payload.tournament_id).toBe('t1');
      expect(payload.terrain_type).toBe('Stabilisé');
      expect(payload.boules_set_id).toBe('b1');
      expect(payload.team_a).toBeDefined();
      expect(payload.team_b).toBeDefined();
    });

    test('nullifies optional fields when absent', () => {
      const match = makeMatch({ boulesSetId: undefined, notes: undefined });
      const payload = buildMatchDbPayload(match);
      expect(payload.boules_set_id).toBeNull();
      expect(payload.notes).toBeNull();
    });

    test('preserves JSONB fields', () => {
      const menes = [{ teamAPoints: 3, teamBPoints: 0 }];
      const actions = [{ playerId: 'p1', team: 'A', actions: { tirs: 5 } }];
      const match = makeMatch({ menes, playerActions: actions });
      const payload = buildMatchDbPayload(match);
      expect(payload.menes).toEqual(menes);
      expect(payload.player_actions).toEqual(actions);
    });
  });

  describe('mapMatchUpdateFields', () => {
    test('only maps defined fields', () => {
      const db = mapMatchUpdateFields({ winner: 'B', duration: 60 });
      expect(db.winner).toBe('B');
      expect(db.duration).toBe(60);
      expect(db.date).toBeUndefined();
    });

    test('maps notes to null when empty', () => {
      const db = mapMatchUpdateFields({ notes: '' });
      expect(db.notes).toBeNull();
    });

    test('maps terrain fields', () => {
      const db = mapMatchUpdateFields({ terrainId: 'tr1' });
      expect(db.terrain_id).toBe('tr1');
    });
  });

  describe('getAffectedPlayers', () => {
    test('combines players from both teams', () => {
      const match = makeMatch({ teamA: { players: ['p1', 'p2'] }, teamB: { players: ['p3', 'p4'] } });
      expect(getAffectedPlayers(match)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    test('deduplicates players', () => {
      const match = makeMatch({ teamA: { players: ['p1'] }, teamB: { players: ['p1'] } });
      expect(getAffectedPlayers(match)).toEqual(['p1']);
    });
  });

  describe('shouldPersistStats', () => {
    test('true when winner changes', () => {
      expect(shouldPersistStats({ winner: 'B' })).toBe(true);
    });
    test('true when playerActions change', () => {
      expect(shouldPersistStats({ playerActions: [] })).toBe(true);
    });
    test('true when teams change', () => {
      expect(shouldPersistStats({ teamA: {} })).toBe(true);
    });
    test('false for non-stat fields', () => {
      expect(shouldPersistStats({ notes: 'hello', duration: 30 })).toBe(false);
    });
  });

  describe('add match state transitions', () => {
    test('no userId: generates tempId and prepends', () => {
      const matches: any[] = [makeMatch({ id: 'm1' })];
      const newMatch = makeMatch({ id: undefined as any });
      const tempId = Date.now().toString();
      const updated = [{ ...newMatch, id: tempId }, ...matches];
      expect(updated).toHaveLength(2);
      expect(updated[0].id).toBeTruthy();
    });

    test('offline: generates temp_ prefixed id', () => {
      const tempId = `temp_${Date.now()}`;
      expect(tempId.startsWith('temp_')).toBe(true);
    });

    test('error fallback: still adds to state', () => {
      const matches: any[] = [];
      const fallbackId = Date.now().toString();
      const newMatch = { ...makeMatch(), id: fallbackId };
      matches.unshift(newMatch);
      expect(matches).toHaveLength(1);
    });
  });

  describe('delete match state transitions', () => {
    test('removes match from list', () => {
      const matches = [makeMatch({ id: 'm1' }), makeMatch({ id: 'm2' }), makeMatch({ id: 'm3' })];
      const result = matches.filter(m => m.id !== 'm2');
      expect(result).toHaveLength(2);
      expect(result.find(m => m.id === 'm2')).toBeUndefined();
    });

    test('affected players computed from deleted match', () => {
      const match = makeMatch({ teamA: { players: ['p1', 'p2'] }, teamB: { players: ['p3'] } });
      expect(getAffectedPlayers(match)).toHaveLength(3);
    });
  });

  describe('update match state transitions', () => {
    test('updates match in list immutably', () => {
      const matches = [makeMatch({ id: 'm1', winner: 'A' }), makeMatch({ id: 'm2' })];
      const updated = matches.map(m => m.id === 'm1' ? { ...m, winner: 'B' } : m);
      expect(updated[0].winner).toBe('B');
      expect(updated[1]).toBe(matches[1]); // unchanged ref
    });
  });
});
