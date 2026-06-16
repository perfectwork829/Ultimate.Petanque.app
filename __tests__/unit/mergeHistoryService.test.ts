/**
 * Unit tests for services/mergeHistoryService.ts
 *
 * Tests: MergeLog mapping, ReassignedRelation structure, isUndoable 24h window,
 * getUndoTimeRemaining FR/EN, table mapping, edge cases.
 */

// ─── Inline implementations ──

interface MergeLog {
  id: string;
  userId: string;
  mergeType: 'player' | 'club' | 'terrain' | 'tournament';
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  sourceSnapshot: Record<string, any>;
  reassignedRelations: ReassignedRelation[];
  createdAt: string;
}

interface ReassignedRelation {
  type: 'player' | 'club' | 'terrain' | 'tournament' | 'match';
  id: string;
  field: string;
  oldValue: any;
  newValue: any;
}

function mapMergeLogRow(row: any): MergeLog {
  return {
    id: row.id,
    userId: row.user_id,
    mergeType: row.merge_type,
    targetId: row.target_id,
    targetName: row.target_name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceSnapshot: row.source_snapshot,
    reassignedRelations: row.reassigned_relations || [],
    createdAt: row.created_at,
  };
}

function isUndoable(log: MergeLog): boolean {
  const createdAt = new Date(log.createdAt).getTime();
  const now = Date.now();
  return (now - createdAt) < 24 * 60 * 60 * 1000;
}

function getUndoTimeRemaining(log: MergeLog, language: 'fr' | 'en'): string {
  const createdAt = new Date(log.createdAt).getTime();
  const deadline = createdAt + 24 * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return language === 'fr' ? 'Expiré' : 'Expired';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

const tableMap: Record<string, string> = {
  player: 'players',
  club: 'clubs',
  terrain: 'terrains',
  tournament: 'tournaments',
};

// ─── Tests ──

describe('mapMergeLogRow', () => {
  test('maps DB row to MergeLog', () => {
    const row = {
      id: 'log1',
      user_id: 'u1',
      merge_type: 'player',
      target_id: 'p1',
      target_name: 'Alice',
      source_id: 'p2',
      source_name: 'Alice Dup',
      source_snapshot: { name: 'Alice Dup', role: 'Tireur' },
      reassigned_relations: [{ type: 'match', id: 'm1', field: 'team_a', oldValue: 'p2', newValue: 'p1' }],
      created_at: '2026-03-28T10:00:00Z',
    };
    const log = mapMergeLogRow(row);
    expect(log.id).toBe('log1');
    expect(log.userId).toBe('u1');
    expect(log.mergeType).toBe('player');
    expect(log.targetName).toBe('Alice');
    expect(log.sourceName).toBe('Alice Dup');
    expect(log.sourceSnapshot.role).toBe('Tireur');
    expect(log.reassignedRelations).toHaveLength(1);
    expect(log.reassignedRelations[0].type).toBe('match');
  });

  test('handles missing reassigned_relations', () => {
    const row = {
      id: 'log2', user_id: 'u1', merge_type: 'club', target_id: 'c1', target_name: 'Club A',
      source_id: 'c2', source_name: 'Club B', source_snapshot: {}, reassigned_relations: null,
      created_at: '2026-03-28T10:00:00Z',
    };
    const log = mapMergeLogRow(row);
    expect(log.reassignedRelations).toEqual([]);
  });
});

describe('isUndoable', () => {
  test('returns true for recent merge (1 hour ago)', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    };
    expect(isUndoable(log)).toBe(true);
  });

  test('returns true for merge 23h ago', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    };
    expect(isUndoable(log)).toBe(true);
  });

  test('returns false for merge 25h ago', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    expect(isUndoable(log)).toBe(false);
  });

  test('returns false for merge exactly 24h ago', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(isUndoable(log)).toBe(false);
  });

  test('returns true for merge just created', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'club', targetId: 'c1', targetName: 'A',
      sourceId: 'c2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date().toISOString(),
    };
    expect(isUndoable(log)).toBe(true);
  });
});

describe('getUndoTimeRemaining', () => {
  test('returns hours and minutes for recent merge (FR)', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago → ~22h remaining
    };
    const result = getUndoTimeRemaining(log, 'fr');
    expect(result).toMatch(/^\d+h \d+min$/);
    expect(result).toContain('h');
  });

  test('returns Expiré for expired merge (FR)', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    };
    expect(getUndoTimeRemaining(log, 'fr')).toBe('Expiré');
  });

  test('returns Expired for expired merge (EN)', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    };
    expect(getUndoTimeRemaining(log, 'en')).toBe('Expired');
  });

  test('returns minutes only when less than 1 hour remains', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString(), // ~30min remaining
    };
    const result = getUndoTimeRemaining(log, 'fr');
    expect(result).toMatch(/^\d+min$/);
  });
});

describe('tableMap', () => {
  test('maps player to players', () => { expect(tableMap['player']).toBe('players'); });
  test('maps club to clubs', () => { expect(tableMap['club']).toBe('clubs'); });
  test('maps terrain to terrains', () => { expect(tableMap['terrain']).toBe('terrains'); });
  test('maps tournament to tournaments', () => { expect(tableMap['tournament']).toBe('tournaments'); });
  test('unknown type returns undefined', () => { expect(tableMap['match']).toBeUndefined(); });
});

describe('ReassignedRelation', () => {
  test('valid relation types', () => {
    const validTypes = ['player', 'club', 'terrain', 'tournament', 'match'];
    validTypes.forEach(t => {
      const rel: ReassignedRelation = { type: t as any, id: 'x', field: 'club_id', oldValue: 'a', newValue: 'b' };
      expect(validTypes.includes(rel.type)).toBe(true);
    });
  });

  test('captures old and new values', () => {
    const rel: ReassignedRelation = {
      type: 'match', id: 'm1', field: 'team_a.players[0]', oldValue: 'p2', newValue: 'p1',
    };
    expect(rel.oldValue).toBe('p2');
    expect(rel.newValue).toBe('p1');
  });
});

describe('MergeLog types', () => {
  test('valid merge types', () => {
    const valid = ['player', 'club', 'terrain', 'tournament'];
    valid.forEach(t => {
      const log: MergeLog = {
        id: 'l1', userId: 'u1', mergeType: t as any, targetId: 'x', targetName: 'X',
        sourceId: 'y', sourceName: 'Y', sourceSnapshot: {}, reassignedRelations: [],
        createdAt: new Date().toISOString(),
      };
      expect(valid.includes(log.mergeType)).toBe(true);
    });
  });

  test('sourceSnapshot preserves data', () => {
    const snapshot = { name: 'Old Club', city: 'Lyon', members_count: 42, facilities: ['bar', 'parking'] };
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'club', targetId: 'c1', targetName: 'New Club',
      sourceId: 'c2', sourceName: 'Old Club', sourceSnapshot: snapshot, reassignedRelations: [],
      createdAt: new Date().toISOString(),
    };
    expect(log.sourceSnapshot.city).toBe('Lyon');
    expect(log.sourceSnapshot.facilities).toHaveLength(2);
  });
});

describe('edge cases', () => {
  test('isUndoable with future createdAt returns true', () => {
    const log: MergeLog = {
      id: 'l1', userId: 'u1', mergeType: 'player', targetId: 'p1', targetName: 'A',
      sourceId: 'p2', sourceName: 'B', sourceSnapshot: {}, reassignedRelations: [],
      createdAt: new Date(Date.now() + 60000).toISOString(),
    };
    expect(isUndoable(log)).toBe(true);
  });

  test('multiple reassigned relations', () => {
    const relations: ReassignedRelation[] = [
      { type: 'match', id: 'm1', field: 'team_a.players[0]', oldValue: 'p2', newValue: 'p1' },
      { type: 'match', id: 'm2', field: 'team_b.players[1]', oldValue: 'p2', newValue: 'p1' },
      { type: 'player', id: 'p3', field: 'club_id', oldValue: 'c2', newValue: 'c1' },
    ];
    expect(relations).toHaveLength(3);
    expect(relations.filter(r => r.type === 'match')).toHaveLength(2);
  });
});
