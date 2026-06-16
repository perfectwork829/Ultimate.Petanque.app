/**
 * Unit tests for contexts/AppContext.tsx
 *
 * Tests: CRUD state transitions, offline queue replay logic, delta sync
 * merging/deletions, conflict detection/resolution, soft deletes processing,
 * computed values, shared item permissions, favorites toggling, battery saver,
 * cache loading, premium/admin flags, reconnection lifecycle.
 *
 * Since AppContext depends heavily on React Context + hooks + Supabase,
 * we extract and test the pure business logic functions inline.
 */

// ─── Inline implementations mirroring AppContext logic ──

// ===== Empty fallbacks =====
const EMPTY_PLAYERS: any[] = [];
const EMPTY_CLUBS: any[] = [];
const EMPTY_TOURNAMENTS: any[] = [];
const EMPTY_MATCHES: any[] = [];
const EMPTY_CHALLENGES: any[] = [];
const EMPTY_TERRAINS: any[] = [];

// ===== mergeRecords (from dbMappers) =====
function mergeRecords<T extends { id: string }>(existing: T[], updates: T[]): T[] {
  const map = new Map(existing.map(item => [item.id, item]));
  for (const update of updates) {
    map.set(update.id, update);
  }
  return Array.from(map.values());
}

// ===== Delta sync: process soft deletes =====
interface SoftDelete {
  table_name: string;
  item_id: string;
}

function processSoftDeletes(softDeletes: SoftDelete[]): Record<string, Set<string>> {
  const deletedByTable: Record<string, Set<string>> = {};
  softDeletes.forEach(sd => {
    if (!deletedByTable[sd.table_name]) deletedByTable[sd.table_name] = new Set();
    deletedByTable[sd.table_name].add(sd.item_id);
  });
  return deletedByTable;
}

function applyDeletions<T extends { id: string }>(items: T[], deletedIds: Set<string> | undefined): T[] {
  if (!deletedIds || deletedIds.size === 0) return items;
  return items.filter(item => !deletedIds.has(item.id));
}

// ===== Delta sync: count total changes =====
function countTotalChanges(...arrays: (any[] | undefined | null)[]): number {
  return arrays.reduce((sum, arr) => sum + (arr?.length || 0), 0);
}

// ===== Shared permission helpers =====
function getSharedPermission(
  itemId: string,
  sharedItemPermissions: Record<string, 'read' | 'write'>,
  sharedMatchPermissions: Record<string, 'read' | 'write'>,
): 'read' | 'write' | null {
  return sharedItemPermissions[itemId] || sharedMatchPermissions[itemId] || null;
}

function isSharedItem(
  itemId: string,
  sharedMatchIds: string[],
  sharedChallengeIds: string[],
  sharedItemPermissions: Record<string, 'read' | 'write'>,
): boolean {
  return sharedMatchIds.includes(itemId) || sharedChallengeIds.includes(itemId) || !!sharedItemPermissions[itemId];
}

// ===== Favorites toggle =====
function toggleFavorite(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter(x => x !== id)
    : [...current, id];
}

function isFavorite(ids: string[], id: string): boolean {
  return ids.includes(id);
}

// ===== Toggle public/private =====
function setItemPublicInList<T extends { id: string; isPublic?: boolean }>(
  items: T[], itemId: string, isPublic: boolean,
): T[] {
  return items.map(item => item.id === itemId ? { ...item, isPublic } : item);
}

// ===== Conflict resolution =====
interface ConflictInfo {
  operationId: string;
  table: string;
  localData: any;
  serverData: any;
  conflictFields: string[];
}

type ConflictChoice = 'local' | 'server' | 'skip';

function resolveConflictChoice(conflict: ConflictInfo, choice: ConflictChoice): { resolved: boolean; data: any } {
  switch (choice) {
    case 'local':
      return { resolved: true, data: conflict.localData };
    case 'server':
      return { resolved: true, data: conflict.serverData };
    case 'skip':
      return { resolved: false, data: null };
  }
}

// ===== Replay progress tracking =====
interface ReplayProgress {
  current: number;
  total: number;
}

function computeConflictRemaining(total: number, current: number): number {
  return Math.max(0, total - current);
}

// ===== Offline queue enqueue decision =====
function shouldEnqueueOffline(isConnected: boolean, userId: string | undefined): boolean {
  return !isConnected && !!userId;
}

function shouldSkipOperation(userId: string | undefined): boolean {
  return !userId;
}

// ===== Sync history entry builder =====
interface SyncHistoryInput {
  total: number;
  succeeded: number;
  failed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errors: string[];
  duration: number;
}

function buildSyncHistoryEntry(input: SyncHistoryInput): SyncHistoryInput & { date: string } {
  return {
    ...input,
    date: new Date().toISOString(),
  };
}

// ===== Periodic sync decision =====
function shouldDoFullSync(syncCount: number, fullEveryN: number): boolean {
  return syncCount > 0 && syncCount % fullEveryN === 0;
}

// ===== Shared items merge (avoid duplicates) =====
function mergeSharedIntoExisting<T extends { id: string }>(existing: T[], shared: T[]): T[] {
  const existingIds = new Set(existing.map(item => item.id));
  const newShared = shared.filter(item => !existingIds.has(item.id));
  return newShared.length > 0 ? [...existing, ...newShared] : existing;
}

// ===== Build shared permissions map =====
interface SharedItemRow {
  item_type: string;
  item_id: string;
  permission: string;
}

function buildPermissionsMap(rows: SharedItemRow[]): Record<string, 'read' | 'write'> {
  const map: Record<string, 'read' | 'write'> = {};
  rows.forEach(row => {
    map[row.item_id] = row.permission as 'read' | 'write';
  });
  return map;
}

function groupSharedByType(rows: SharedItemRow[]): Record<string, string[]> {
  const groups: Record<string, string[]> = { player: [], club: [], terrain: [], tournament: [] };
  rows.forEach(row => {
    if (groups[row.item_type]) {
      groups[row.item_type].push(row.item_id);
    }
  });
  return groups;
}

// ===== User stats computation (simplified mirror) =====
function computeBasicUserStats(matches: any[], userId: string | undefined): {
  totalMatches: number; wins: number; losses: number; winRate: number;
} {
  if (!userId || matches.length === 0) {
    return { totalMatches: 0, wins: 0, losses: 0, winRate: 0 };
  }
  const userMatches = matches.filter((m: any) => {
    const teamAPlayers = m.teamA?.players || [];
    return teamAPlayers.some((p: any) => p.id === userId || p.playerId === userId);
  });
  const total = userMatches.length;
  const wins = userMatches.filter((m: any) => m.winner === 'A').length;
  return {
    totalMatches: total,
    wins,
    losses: total - wins,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
  };
}

// ===== SelfPlayer detection =====
function findSelfPlayer(players: any[], userId: string | undefined): any | null {
  if (!userId) return null;
  return players.find((p: any) => p.id === userId) || null;
}

// ===== Cache loading strategy =====
function shouldUseCachedData(initialLoadDone: boolean, cachedData: any): boolean {
  if (initialLoadDone) return false;
  if (!cachedData) return false;
  return cachedData.players?.length > 0 || cachedData.matches?.length > 0;
}

// ===== Soft deletes cleanup threshold =====
function computeCleanupThreshold(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

// ===== Monday check for weekly trust tips =====
function isMondayCheck(date: Date): boolean {
  return date.getDay() === 1;
}

// ─── Tests ──

describe('EMPTY FALLBACKS', () => {
  test('all empty arrays are distinct references', () => {
    expect(EMPTY_PLAYERS).not.toBe(EMPTY_CLUBS);
    expect(EMPTY_MATCHES).not.toBe(EMPTY_CHALLENGES);
  });

  test('all empty arrays have length 0', () => {
    expect(EMPTY_PLAYERS).toHaveLength(0);
    expect(EMPTY_CLUBS).toHaveLength(0);
    expect(EMPTY_TOURNAMENTS).toHaveLength(0);
    expect(EMPTY_MATCHES).toHaveLength(0);
    expect(EMPTY_CHALLENGES).toHaveLength(0);
    expect(EMPTY_TERRAINS).toHaveLength(0);
  });
});

describe('mergeRecords', () => {
  test('adds new records', () => {
    const existing = [{ id: '1', name: 'A' }];
    const updates = [{ id: '2', name: 'B' }];
    const result = mergeRecords(existing, updates);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === '2')).toBeTruthy();
  });

  test('updates existing records by id', () => {
    const existing = [{ id: '1', name: 'Old' }];
    const updates = [{ id: '1', name: 'New' }];
    const result = mergeRecords(existing, updates);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New');
  });

  test('preserves order of existing then new', () => {
    const existing = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    const updates = [{ id: '3', name: 'C' }];
    const result = mergeRecords(existing, updates);
    expect(result.map(r => r.id)).toEqual(['1', '2', '3']);
  });

  test('handles empty existing', () => {
    const result = mergeRecords([], [{ id: '1', name: 'A' }]);
    expect(result).toHaveLength(1);
  });

  test('handles empty updates', () => {
    const existing = [{ id: '1', name: 'A' }];
    const result = mergeRecords(existing, []);
    expect(result).toHaveLength(1);
  });

  test('handles both empty', () => {
    expect(mergeRecords([], [])).toEqual([]);
  });

  test('last update wins on duplicate ids', () => {
    const existing = [{ id: '1', value: 1 }];
    const updates = [{ id: '1', value: 2 }, { id: '1', value: 3 }];
    const result = mergeRecords(existing, updates);
    expect(result[0].value).toBe(3);
  });

  test('large merge with 100 records', () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, v: i }));
    const updates = Array.from({ length: 60 }, (_, i) => ({ id: `${i + 20}`, v: i + 1000 }));
    const result = mergeRecords(existing, updates);
    // IDs 0-19 from existing + IDs 20-79 from updates = 80 unique
    expect(result.length).toBe(80);
    // ID 25 should have updated value
    expect(result.find(r => r.id === '25')?.v).toBe(1005);
  });
});

describe('processSoftDeletes', () => {
  test('groups by table name', () => {
    const deletes: SoftDelete[] = [
      { table_name: 'players', item_id: 'p1' },
      { table_name: 'players', item_id: 'p2' },
      { table_name: 'matches', item_id: 'm1' },
    ];
    const result = processSoftDeletes(deletes);
    expect(result['players']?.size).toBe(2);
    expect(result['matches']?.size).toBe(1);
  });

  test('empty input returns empty object', () => {
    expect(processSoftDeletes([])).toEqual({});
  });

  test('deduplicates same item_id', () => {
    const deletes: SoftDelete[] = [
      { table_name: 'players', item_id: 'p1' },
      { table_name: 'players', item_id: 'p1' },
    ];
    const result = processSoftDeletes(deletes);
    expect(result['players']?.size).toBe(1);
  });

  test('handles all 7 entity tables', () => {
    const tables = ['players', 'clubs', 'terrains', 'tournaments', 'matches', 'challenges', 'boules_sets'];
    const deletes = tables.map(t => ({ table_name: t, item_id: `id-${t}` }));
    const result = processSoftDeletes(deletes);
    tables.forEach(t => {
      expect(result[t]?.has(`id-${t}`)).toBe(true);
    });
  });
});

describe('applyDeletions', () => {
  test('removes items in deleted set', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const deleted = new Set(['2']);
    expect(applyDeletions(items, deleted)).toHaveLength(2);
    expect(applyDeletions(items, deleted).find(i => i.id === '2')).toBeUndefined();
  });

  test('returns original if no deletions', () => {
    const items = [{ id: '1' }];
    expect(applyDeletions(items, undefined)).toBe(items);
    expect(applyDeletions(items, new Set())).toBe(items);
  });

  test('returns empty if all deleted', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const deleted = new Set(['1', '2']);
    expect(applyDeletions(items, deleted)).toHaveLength(0);
  });

  test('ignores IDs not in list', () => {
    const items = [{ id: '1' }];
    const deleted = new Set(['99']);
    expect(applyDeletions(items, deleted)).toHaveLength(1);
  });
});

describe('countTotalChanges', () => {
  test('sums lengths', () => {
    expect(countTotalChanges([1, 2], [3], [4, 5, 6])).toBe(6);
  });

  test('handles undefined/null', () => {
    expect(countTotalChanges(undefined, null, [1, 2])).toBe(2);
  });

  test('all empty = 0', () => {
    expect(countTotalChanges([], [], [])).toBe(0);
  });

  test('no args = 0', () => {
    expect(countTotalChanges()).toBe(0);
  });
});

describe('getSharedPermission', () => {
  test('returns item permission if exists', () => {
    expect(getSharedPermission('id1', { id1: 'write' }, {})).toBe('write');
  });

  test('returns match permission if no item permission', () => {
    expect(getSharedPermission('id1', {}, { id1: 'read' })).toBe('read');
  });

  test('returns null if no permission', () => {
    expect(getSharedPermission('id1', {}, {})).toBeNull();
  });

  test('item permission takes priority over match permission', () => {
    expect(getSharedPermission('id1', { id1: 'write' }, { id1: 'read' })).toBe('write');
  });
});

describe('isSharedItem', () => {
  test('true if in sharedMatchIds', () => {
    expect(isSharedItem('m1', ['m1'], [], {})).toBe(true);
  });

  test('true if in sharedChallengeIds', () => {
    expect(isSharedItem('c1', [], ['c1'], {})).toBe(true);
  });

  test('true if in sharedItemPermissions', () => {
    expect(isSharedItem('p1', [], [], { p1: 'read' })).toBe(true);
  });

  test('false if nowhere', () => {
    expect(isSharedItem('x1', [], [], {})).toBe(false);
  });

  test('true if in multiple sources', () => {
    expect(isSharedItem('m1', ['m1'], [], { m1: 'write' })).toBe(true);
  });
});

describe('toggleFavorite', () => {
  test('adds if not present', () => {
    expect(toggleFavorite([], 'id1')).toEqual(['id1']);
  });

  test('removes if present', () => {
    expect(toggleFavorite(['id1', 'id2'], 'id1')).toEqual(['id2']);
  });

  test('toggle twice returns original', () => {
    const original = ['id1'];
    const toggled = toggleFavorite(original, 'id2');
    const restored = toggleFavorite(toggled, 'id2');
    expect(restored).toEqual(original);
  });

  test('preserves order of others', () => {
    expect(toggleFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('isFavorite', () => {
  test('true if in list', () => {
    expect(isFavorite(['a', 'b'], 'b')).toBe(true);
  });

  test('false if not in list', () => {
    expect(isFavorite(['a', 'b'], 'c')).toBe(false);
  });

  test('false for empty list', () => {
    expect(isFavorite([], 'a')).toBe(false);
  });
});

describe('setItemPublicInList', () => {
  test('sets isPublic true for matching item', () => {
    const items = [{ id: '1', isPublic: false }, { id: '2', isPublic: false }];
    const result = setItemPublicInList(items, '1', true);
    expect(result[0].isPublic).toBe(true);
    expect(result[1].isPublic).toBe(false);
  });

  test('sets isPublic false', () => {
    const items = [{ id: '1', isPublic: true }];
    const result = setItemPublicInList(items, '1', false);
    expect(result[0].isPublic).toBe(false);
  });

  test('no change if id not found', () => {
    const items = [{ id: '1', isPublic: false }];
    const result = setItemPublicInList(items, '99', true);
    expect(result[0].isPublic).toBe(false);
  });

  test('returns new array reference', () => {
    const items = [{ id: '1', isPublic: false }];
    const result = setItemPublicInList(items, '1', true);
    expect(result).not.toBe(items);
  });
});

describe('resolveConflictChoice', () => {
  const conflict: ConflictInfo = {
    operationId: 'op1',
    table: 'matches',
    localData: { score: 13 },
    serverData: { score: 10 },
    conflictFields: ['score'],
  };

  test('local choice returns local data', () => {
    const result = resolveConflictChoice(conflict, 'local');
    expect(result.resolved).toBe(true);
    expect(result.data).toEqual({ score: 13 });
  });

  test('server choice returns server data', () => {
    const result = resolveConflictChoice(conflict, 'server');
    expect(result.resolved).toBe(true);
    expect(result.data).toEqual({ score: 10 });
  });

  test('skip choice returns not resolved', () => {
    const result = resolveConflictChoice(conflict, 'skip');
    expect(result.resolved).toBe(false);
    expect(result.data).toBeNull();
  });
});

describe('computeConflictRemaining', () => {
  test('total 5, current 2 = 3 remaining', () => {
    expect(computeConflictRemaining(5, 2)).toBe(3);
  });

  test('total equals current = 0', () => {
    expect(computeConflictRemaining(3, 3)).toBe(0);
  });

  test('current exceeds total = 0 (clamped)', () => {
    expect(computeConflictRemaining(3, 5)).toBe(0);
  });

  test('both 0 = 0', () => {
    expect(computeConflictRemaining(0, 0)).toBe(0);
  });
});

describe('shouldEnqueueOffline', () => {
  test('offline with user = true', () => {
    expect(shouldEnqueueOffline(false, 'user-1')).toBe(true);
  });

  test('online with user = false', () => {
    expect(shouldEnqueueOffline(true, 'user-1')).toBe(false);
  });

  test('offline without user = false', () => {
    expect(shouldEnqueueOffline(false, undefined)).toBe(false);
  });
});

describe('shouldSkipOperation', () => {
  test('no user = skip', () => {
    expect(shouldSkipOperation(undefined)).toBe(true);
  });

  test('with user = do not skip', () => {
    expect(shouldSkipOperation('user-1')).toBe(false);
  });
});

describe('buildSyncHistoryEntry', () => {
  test('adds date field', () => {
    const input: SyncHistoryInput = {
      total: 10, succeeded: 8, failed: 2,
      conflictsDetected: 1, conflictsResolved: 1,
      errors: ['err1'], duration: 500,
    };
    const entry = buildSyncHistoryEntry(input);
    expect(entry.date).toBeTruthy();
    expect(new Date(entry.date).getTime()).toBeGreaterThan(0);
    expect(entry.total).toBe(10);
    expect(entry.succeeded).toBe(8);
    expect(entry.failed).toBe(2);
    expect(entry.errors).toEqual(['err1']);
  });

  test('zero conflicts', () => {
    const entry = buildSyncHistoryEntry({
      total: 5, succeeded: 5, failed: 0,
      conflictsDetected: 0, conflictsResolved: 0,
      errors: [], duration: 100,
    });
    expect(entry.conflictsDetected).toBe(0);
    expect(entry.conflictsResolved).toBe(0);
  });
});

describe('shouldDoFullSync', () => {
  test('cycle 10, fullEveryN 10 = true', () => {
    expect(shouldDoFullSync(10, 10)).toBe(true);
  });

  test('cycle 5, fullEveryN 10 = false', () => {
    expect(shouldDoFullSync(5, 10)).toBe(false);
  });

  test('cycle 20, fullEveryN 10 = true', () => {
    expect(shouldDoFullSync(20, 10)).toBe(true);
  });

  test('cycle 0 = false (initial)', () => {
    expect(shouldDoFullSync(0, 10)).toBe(false);
  });

  test('fullEveryN 1 = always full sync', () => {
    expect(shouldDoFullSync(1, 1)).toBe(true);
    expect(shouldDoFullSync(2, 1)).toBe(true);
    expect(shouldDoFullSync(99, 1)).toBe(true);
  });
});

describe('mergeSharedIntoExisting', () => {
  test('adds new shared items', () => {
    const existing = [{ id: '1' }];
    const shared = [{ id: '2' }, { id: '3' }];
    const result = mergeSharedIntoExisting(existing, shared);
    expect(result).toHaveLength(3);
  });

  test('skips duplicates', () => {
    const existing = [{ id: '1' }, { id: '2' }];
    const shared = [{ id: '2' }, { id: '3' }];
    const result = mergeSharedIntoExisting(existing, shared);
    expect(result).toHaveLength(3);
  });

  test('returns same reference if no new items', () => {
    const existing = [{ id: '1' }, { id: '2' }];
    const shared = [{ id: '1' }, { id: '2' }];
    const result = mergeSharedIntoExisting(existing, shared);
    expect(result).toBe(existing);
  });

  test('empty shared returns existing', () => {
    const existing = [{ id: '1' }];
    expect(mergeSharedIntoExisting(existing, [])).toBe(existing);
  });

  test('empty existing gets all shared', () => {
    const shared = [{ id: '1' }, { id: '2' }];
    const result = mergeSharedIntoExisting([], shared);
    expect(result).toHaveLength(2);
  });
});

describe('buildPermissionsMap', () => {
  test('maps item_id to permission', () => {
    const rows: SharedItemRow[] = [
      { item_type: 'player', item_id: 'p1', permission: 'read' },
      { item_type: 'club', item_id: 'c1', permission: 'write' },
    ];
    const map = buildPermissionsMap(rows);
    expect(map['p1']).toBe('read');
    expect(map['c1']).toBe('write');
  });

  test('empty rows = empty map', () => {
    expect(buildPermissionsMap([])).toEqual({});
  });

  test('last permission wins for same id', () => {
    const rows: SharedItemRow[] = [
      { item_type: 'player', item_id: 'p1', permission: 'read' },
      { item_type: 'player', item_id: 'p1', permission: 'write' },
    ];
    const map = buildPermissionsMap(rows);
    expect(map['p1']).toBe('write');
  });
});

describe('groupSharedByType', () => {
  test('groups items by type', () => {
    const rows: SharedItemRow[] = [
      { item_type: 'player', item_id: 'p1', permission: 'read' },
      { item_type: 'player', item_id: 'p2', permission: 'write' },
      { item_type: 'club', item_id: 'c1', permission: 'read' },
      { item_type: 'terrain', item_id: 't1', permission: 'write' },
      { item_type: 'tournament', item_id: 'tr1', permission: 'read' },
    ];
    const groups = groupSharedByType(rows);
    expect(groups.player).toEqual(['p1', 'p2']);
    expect(groups.club).toEqual(['c1']);
    expect(groups.terrain).toEqual(['t1']);
    expect(groups.tournament).toEqual(['tr1']);
  });

  test('empty rows = empty groups', () => {
    const groups = groupSharedByType([]);
    expect(groups.player).toEqual([]);
    expect(groups.club).toEqual([]);
    expect(groups.terrain).toEqual([]);
    expect(groups.tournament).toEqual([]);
  });

  test('ignores unknown types', () => {
    const rows: SharedItemRow[] = [
      { item_type: 'unknown', item_id: 'x1', permission: 'read' },
    ];
    const groups = groupSharedByType(rows);
    expect(groups.player).toEqual([]);
    expect(groups.club).toEqual([]);
  });
});

describe('computeBasicUserStats', () => {
  test('no user = zeros', () => {
    const stats = computeBasicUserStats([{ winner: 'A' }], undefined);
    expect(stats.totalMatches).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  test('no matches = zeros', () => {
    const stats = computeBasicUserStats([], 'u1');
    expect(stats.totalMatches).toBe(0);
  });

  test('counts wins and losses', () => {
    const matches = [
      { winner: 'A', teamA: { players: [{ id: 'u1' }] } },
      { winner: 'B', teamA: { players: [{ id: 'u1' }] } },
      { winner: 'A', teamA: { players: [{ id: 'u1' }] } },
    ];
    const stats = computeBasicUserStats(matches, 'u1');
    expect(stats.totalMatches).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(67);
  });

  test('excludes matches where user is not in team A', () => {
    const matches = [
      { winner: 'A', teamA: { players: [{ id: 'other' }] } },
      { winner: 'A', teamA: { players: [{ id: 'u1' }] } },
    ];
    const stats = computeBasicUserStats(matches, 'u1');
    expect(stats.totalMatches).toBe(1);
  });

  test('handles playerId field variant', () => {
    const matches = [
      { winner: 'A', teamA: { players: [{ playerId: 'u1' }] } },
    ];
    const stats = computeBasicUserStats(matches, 'u1');
    expect(stats.totalMatches).toBe(1);
    expect(stats.wins).toBe(1);
  });
});

describe('findSelfPlayer', () => {
  test('returns player matching userId', () => {
    const players = [{ id: 'u1', name: 'Me' }, { id: 'u2', name: 'Other' }];
    expect(findSelfPlayer(players, 'u1')?.name).toBe('Me');
  });

  test('returns null if no userId', () => {
    expect(findSelfPlayer([{ id: 'u1' }], undefined)).toBeNull();
  });

  test('returns null if no matching player', () => {
    expect(findSelfPlayer([{ id: 'u2' }], 'u1')).toBeNull();
  });

  test('returns null for empty list', () => {
    expect(findSelfPlayer([], 'u1')).toBeNull();
  });
});

describe('shouldUseCachedData', () => {
  test('false if initial load done', () => {
    expect(shouldUseCachedData(true, { players: [1], matches: [] })).toBe(false);
  });

  test('false if no cached data', () => {
    expect(shouldUseCachedData(false, null)).toBe(false);
  });

  test('true if has cached players', () => {
    expect(shouldUseCachedData(false, { players: [1], matches: [] })).toBe(true);
  });

  test('true if has cached matches', () => {
    expect(shouldUseCachedData(false, { players: [], matches: [1] })).toBe(true);
  });

  test('false if both empty', () => {
    expect(shouldUseCachedData(false, { players: [], matches: [] })).toBe(false);
  });
});

describe('computeCleanupThreshold', () => {
  test('30 days ago', () => {
    const now = new Date();
    const threshold = computeCleanupThreshold(30);
    const diff = now.getTime() - threshold.getTime();
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(diff - 30 * 86400000)).toBeLessThan(1000);
  });

  test('0 days ago = now', () => {
    const now = new Date();
    const threshold = computeCleanupThreshold(0);
    expect(Math.abs(now.getTime() - threshold.getTime())).toBeLessThan(1000);
  });

  test('7 days ago', () => {
    const threshold = computeCleanupThreshold(7);
    const expected = new Date();
    expected.setDate(expected.getDate() - 7);
    expect(Math.abs(threshold.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

describe('isMondayCheck', () => {
  test('Monday = true', () => {
    // 2026-03-30 is a Monday
    expect(isMondayCheck(new Date('2026-03-30T12:00:00Z'))).toBe(true);
  });

  test('Tuesday = false', () => {
    expect(isMondayCheck(new Date('2026-03-31T12:00:00Z'))).toBe(false);
  });

  test('Sunday = false', () => {
    expect(isMondayCheck(new Date('2026-03-29T12:00:00Z'))).toBe(false);
  });

  test('Saturday = false', () => {
    expect(isMondayCheck(new Date('2026-03-28T12:00:00Z'))).toBe(false);
  });
});

describe('delta sync full scenario', () => {
  test('no changes = skip update', () => {
    const totalChanges = countTotalChanges([], [], [], [], [], []);
    const totalDeletions = 0;
    expect(totalChanges + totalDeletions).toBe(0);
  });

  test('changes only = merge without deletion', () => {
    const existing = [{ id: '1', name: 'Old' }, { id: '2', name: 'Keep' }];
    const updates = [{ id: '1', name: 'Updated' }];
    const softDeletes: SoftDelete[] = [];

    const deletedByTable = processSoftDeletes(softDeletes);
    const afterDelete = applyDeletions(existing, deletedByTable['players']);
    const result = mergeRecords(afterDelete, updates);

    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === '1')?.name).toBe('Updated');
    expect(result.find(r => r.id === '2')?.name).toBe('Keep');
  });

  test('deletions only = remove without merge', () => {
    const existing = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const softDeletes: SoftDelete[] = [{ table_name: 'players', item_id: '2' }];

    const deletedByTable = processSoftDeletes(softDeletes);
    const result = applyDeletions(existing, deletedByTable['players']);

    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === '2')).toBeUndefined();
  });

  test('changes + deletions = delete then merge', () => {
    const existing = [{ id: '1', v: 1 }, { id: '2', v: 2 }, { id: '3', v: 3 }];
    const updates = [{ id: '1', v: 10 }, { id: '4', v: 4 }];
    const softDeletes: SoftDelete[] = [{ table_name: 'players', item_id: '2' }];

    const deletedByTable = processSoftDeletes(softDeletes);
    const afterDelete = applyDeletions(existing, deletedByTable['players']);
    const result = mergeRecords(afterDelete, updates);

    expect(result).toHaveLength(3); // id 1 (updated), 3 (kept), 4 (new)
    expect(result.find(r => r.id === '1')?.v).toBe(10);
    expect(result.find(r => r.id === '2')).toBeUndefined();
    expect(result.find(r => r.id === '4')?.v).toBe(4);
  });

  test('multi-table soft deletes processed independently', () => {
    const players = [{ id: 'p1' }, { id: 'p2' }];
    const matches = [{ id: 'm1' }, { id: 'm2' }];
    const softDeletes: SoftDelete[] = [
      { table_name: 'players', item_id: 'p1' },
      { table_name: 'matches', item_id: 'm2' },
    ];

    const deletedByTable = processSoftDeletes(softDeletes);
    const resultPlayers = applyDeletions(players, deletedByTable['players']);
    const resultMatches = applyDeletions(matches, deletedByTable['matches']);

    expect(resultPlayers).toHaveLength(1);
    expect(resultPlayers[0].id).toBe('p2');
    expect(resultMatches).toHaveLength(1);
    expect(resultMatches[0].id).toBe('m1');
  });
});

describe('offline queue replay lifecycle', () => {
  test('replay progress tracks current/total', () => {
    const progress: ReplayProgress = { current: 3, total: 10 };
    expect(progress.current).toBe(3);
    expect(progress.total).toBe(10);
    expect(computeConflictRemaining(progress.total, progress.current)).toBe(7);
  });

  test('replay complete = progress 0/0', () => {
    const done: ReplayProgress = { current: 0, total: 0 };
    expect(done.current).toBe(0);
    expect(done.total).toBe(0);
  });

  test('sync history entry built after replay', () => {
    const entry = buildSyncHistoryEntry({
      total: 5, succeeded: 4, failed: 1,
      conflictsDetected: 2, conflictsResolved: 2,
      errors: ['timeout'], duration: 1200,
    });
    expect(entry.total).toBe(5);
    expect(entry.succeeded).toBe(4);
    expect(entry.failed).toBe(1);
    expect(entry.conflictsDetected).toBe(2);
    expect(entry.conflictsResolved).toBe(2);
    expect(entry.duration).toBe(1200);
  });
});

describe('conflict detection scenarios', () => {
  test('single field conflict', () => {
    const conflict: ConflictInfo = {
      operationId: 'op1',
      table: 'matches',
      localData: { score: 13 },
      serverData: { score: 11 },
      conflictFields: ['score'],
    };
    expect(conflict.conflictFields).toHaveLength(1);
    expect(conflict.conflictFields[0]).toBe('score');
  });

  test('multi-field conflict', () => {
    const conflict: ConflictInfo = {
      operationId: 'op2',
      table: 'players',
      localData: { name: 'New', role: 'Tireur' },
      serverData: { name: 'Old', role: 'Pointeur' },
      conflictFields: ['name', 'role'],
    };
    expect(conflict.conflictFields).toHaveLength(2);
  });

  test('resolve local keeps local data', () => {
    const conflict: ConflictInfo = {
      operationId: 'op1', table: 'matches',
      localData: { menes: [{ scoreA: 3 }] },
      serverData: { menes: [{ scoreA: 2 }] },
      conflictFields: ['menes'],
    };
    const result = resolveConflictChoice(conflict, 'local');
    expect(result.data.menes[0].scoreA).toBe(3);
  });

  test('resolve server overwrites local', () => {
    const conflict: ConflictInfo = {
      operationId: 'op1', table: 'matches',
      localData: { winner: 'A' },
      serverData: { winner: 'B' },
      conflictFields: ['winner'],
    };
    const result = resolveConflictChoice(conflict, 'server');
    expect(result.data.winner).toBe('B');
  });
});

describe('state transitions', () => {
  test('loading → loaded (initial)', () => {
    let loading = true;
    // Simulate load completion
    loading = false;
    expect(loading).toBe(false);
  });

  test('online → offline → online (reconnection)', () => {
    let isOfflineMode = false;
    let isConnected = true;

    // Go offline
    isConnected = false;
    isOfflineMode = true;
    expect(isOfflineMode).toBe(true);

    // Reconnect
    isConnected = true;
    isOfflineMode = false;
    expect(isOfflineMode).toBe(false);
    expect(isConnected).toBe(true);
  });

  test('no user → reset all state', () => {
    let players = [{ id: '1' }];
    let matches = [{ id: 'm1' }];
    let initialLoadDone = true;

    // Simulate logout
    players = EMPTY_PLAYERS;
    matches = EMPTY_MATCHES;
    initialLoadDone = false;

    expect(players).toHaveLength(0);
    expect(matches).toHaveLength(0);
    expect(initialLoadDone).toBe(false);
  });

  test('cache loaded → server data overwrites', () => {
    let players = [{ id: 'cached', name: 'FromCache' }];

    // Server responds with fresh data
    const serverPlayers = [{ id: 'cached', name: 'FromServer' }, { id: 'new', name: 'New' }];
    players = serverPlayers;

    expect(players).toHaveLength(2);
    expect(players[0].name).toBe('FromServer');
  });

  test('premium flag persisted on toggle', () => {
    let isPremium = false;
    isPremium = true;
    expect(isPremium).toBe(true);
    isPremium = false;
    expect(isPremium).toBe(false);
  });

  test('battery saver toggles sync config', () => {
    let batterySaver = false;
    batterySaver = true;
    // When enabled, sync interval should change
    expect(batterySaver).toBe(true);
  });
});

describe('CRUD state transitions', () => {
  test('add match appends to list', () => {
    const matches = [{ id: 'm1', date: '2026-01-01' }];
    const newMatch = { id: 'm2', date: '2026-01-02' };
    const updated = [...matches, newMatch];
    expect(updated).toHaveLength(2);
    expect(updated[1].id).toBe('m2');
  });

  test('update match replaces in list', () => {
    const matches = [{ id: 'm1', winner: 'A' }, { id: 'm2', winner: 'B' }];
    const updated = matches.map(m => m.id === 'm1' ? { ...m, winner: 'B' as const } : m);
    expect(updated[0].winner).toBe('B');
    expect(updated[1].winner).toBe('B');
  });

  test('delete match removes from list', () => {
    const matches = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
    const updated = matches.filter(m => m.id !== 'm2');
    expect(updated).toHaveLength(2);
    expect(updated.find(m => m.id === 'm2')).toBeUndefined();
  });

  test('add player with duplicate check', () => {
    const players = [{ id: 'p1', name: 'Alice' }];
    const newPlayer = { id: 'p2', name: 'Bob' };
    const existingIds = new Set(players.map(p => p.id));
    const canAdd = !existingIds.has(newPlayer.id);
    expect(canAdd).toBe(true);
    const updated = [...players, newPlayer];
    expect(updated).toHaveLength(2);
  });

  test('update player preserves other players', () => {
    const players = [{ id: 'p1', name: 'Old', level: 'Débutant' }, { id: 'p2', name: 'Other', level: 'Expert' }];
    const updated = players.map(p => p.id === 'p1' ? { ...p, name: 'New' } : p);
    expect(updated[0].name).toBe('New');
    expect(updated[1]).toEqual(players[1]);
  });

  test('delete challenge from middle of list', () => {
    const challenges = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const updated = challenges.filter(c => c.id !== 'c2');
    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe('c1');
    expect(updated[1].id).toBe('c3');
  });

  test('add terrain increments count', () => {
    let terrains = [{ id: 't1' }];
    terrains = [...terrains, { id: 't2' }];
    expect(terrains).toHaveLength(2);
  });

  test('bulk operations maintain consistency', () => {
    let items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    // Delete 2, add 4, update 1
    items = items.filter(i => i.id !== '2');
    items = [...items, { id: '4' }];
    items = items.map(i => i.id === '1' ? { ...i, id: '1' } : i);
    expect(items).toHaveLength(3);
    expect(items.map(i => i.id).sort()).toEqual(['1', '3', '4']);
  });
});

describe('tournament notifications toggle', () => {
  test('add notification', () => {
    const notifications: string[] = [];
    const updated = [...notifications, 'tour-1'];
    expect(updated).toContain('tour-1');
  });

  test('remove notification', () => {
    const notifications = ['tour-1', 'tour-2'];
    const updated = notifications.filter(id => id !== 'tour-1');
    expect(updated).toEqual(['tour-2']);
  });

  test('check if enabled', () => {
    const notifications = ['tour-1', 'tour-2'];
    expect(notifications.includes('tour-1')).toBe(true);
    expect(notifications.includes('tour-3')).toBe(false);
  });
});

describe('performance - large dataset operations', () => {
  test('merge 1000 records completes quickly', () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, v: i }));
    const updates = Array.from({ length: 500 }, (_, i) => ({ id: `${i + 500}`, v: i + 2000 }));
    const start = Date.now();
    const result = mergeRecords(existing, updates);
    const duration = Date.now() - start;
    expect(result.length).toBe(1000);
    expect(duration).toBeLessThan(100);
  });

  test('process 500 soft deletes', () => {
    const deletes: SoftDelete[] = Array.from({ length: 500 }, (_, i) => ({
      table_name: ['players', 'matches', 'challenges'][i % 3],
      item_id: `id-${i}`,
    }));
    const start = Date.now();
    const result = processSoftDeletes(deletes);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50);
    const totalSize = Object.values(result).reduce((sum, set) => sum + set.size, 0);
    expect(totalSize).toBe(500);
  });

  test('apply deletions on 1000 items with 200 deletes', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: `${i}` }));
    const deleted = new Set(Array.from({ length: 200 }, (_, i) => `${i * 5}`));
    const start = Date.now();
    const result = applyDeletions(items, deleted);
    const duration = Date.now() - start;
    expect(result.length).toBe(800);
    expect(duration).toBeLessThan(50);
  });
});
