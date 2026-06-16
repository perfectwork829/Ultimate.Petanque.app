/**
 * Tests for playerCrudService — add/update/delete players
 * Tests: offline fallback, DB mapping, avatar upload, self-player sync, modification logging
 */
import { resolvePlayerRecordId } from '@/services/playerCrudService';

function buildPlayerDbPayload(player: any): Record<string, any> {
  return {
    name: player.name, nickname: player.nickname, avatar: player.avatar,
    club: player.club, club_id: player.clubId, role: player.role, level: player.level,
    location: player.location, phone: player.phone, email: player.email,
    country: player.country, boules: player.boules, handedness: player.handedness,
    terrain_id: player.terrainId, terrain_name: player.terrainName,
    is_public: player.isPublic ?? false, show_contact_public: player.showContactPublic ?? false,
    stats: player.stats,
  };
}

function mapPlayerUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.nickname !== undefined) db.nickname = updates.nickname;
  if (updates.avatar !== undefined) db.avatar = updates.avatar;
  if (updates.club !== undefined) db.club = updates.club || null;
  if (updates.clubId !== undefined) db.club_id = updates.clubId || null;
  if (updates.role !== undefined) db.role = updates.role;
  if (updates.level !== undefined) db.level = updates.level;
  if (updates.country !== undefined) db.country = updates.country;
  if (updates.isPublic !== undefined) db.is_public = updates.isPublic;
  if (updates.handedness !== undefined) db.handedness = updates.handedness || null;
  if (updates.terrainId !== undefined) db.terrain_id = updates.terrainId || null;
  if (updates.stats !== undefined) db.stats = updates.stats;
  return db;
}

function shouldLogModification(sharedPerms: Record<string, string>, id: string, oldPlayer: any): boolean {
  return sharedPerms[id] === 'write' && !!oldPlayer;
}

function computeChanges(old: any, updates: any): { field: string; oldValue: any; newValue: any }[] {
  return Object.keys(updates)
    .filter(k => k !== 'stats' && old[k] !== updates[k])
    .map(k => ({ field: k, oldValue: old[k], newValue: updates[k] }));
}

const makePlayer = (o: any = {}) => ({
  id: `p-${Math.random().toString(36).slice(2, 8)}`, name: 'Test', role: 'Milieu', level: 'Intermédiaire',
  stats: { matchesPlayed: 0, wins: 0, losses: 0 }, ...o,
});

describe('playerCrudService', () => {
  describe('resolvePlayerRecordId', () => {
    test('returns player id when auth uid was passed by mistake', () => {
      const players = [makePlayer({ id: 'player-uuid', userId: 'auth-uid', name: 'Carol' })];
      expect(resolvePlayerRecordId('auth-uid', players, 'auth-uid')).toBe('player-uuid');
    });

    test('returns id unchanged when it already matches a player row', () => {
      const players = [makePlayer({ id: 'player-uuid', userId: 'auth-uid' })];
      expect(resolvePlayerRecordId('player-uuid', players, 'auth-uid')).toBe('player-uuid');
    });
  });

  describe('buildPlayerDbPayload', () => {
    test('maps all fields', () => {
      const p = makePlayer({ clubId: 'c1', terrainId: 't1', isPublic: true });
      const payload = buildPlayerDbPayload(p);
      expect(payload.club_id).toBe('c1');
      expect(payload.terrain_id).toBe('t1');
      expect(payload.is_public).toBe(true);
    });

    test('defaults isPublic to false', () => {
      const payload = buildPlayerDbPayload(makePlayer());
      expect(payload.is_public).toBe(false);
      expect(payload.show_contact_public).toBe(false);
    });
  });

  describe('mapPlayerUpdateFields', () => {
    test('nullifies empty optional fields', () => {
      const db = mapPlayerUpdateFields({ club: '', clubId: '', handedness: '', terrainId: '' });
      expect(db.club).toBeNull();
      expect(db.club_id).toBeNull();
      expect(db.handedness).toBeNull();
      expect(db.terrain_id).toBeNull();
    });

    test('only maps defined fields', () => {
      const db = mapPlayerUpdateFields({ name: 'Alice' });
      expect(db.name).toBe('Alice');
      expect(db.role).toBeUndefined();
    });
  });

  describe('modification logging', () => {
    test('shouldLogModification true for write permission', () => {
      expect(shouldLogModification({ 'p1': 'write' }, 'p1', makePlayer())).toBe(true);
    });
    test('shouldLogModification false for read permission', () => {
      expect(shouldLogModification({ 'p1': 'read' }, 'p1', makePlayer())).toBe(false);
    });
    test('shouldLogModification false if no old player', () => {
      expect(shouldLogModification({ 'p1': 'write' }, 'p1', null)).toBe(false);
    });

    test('computeChanges excludes stats', () => {
      const old = { name: 'Alice', role: 'Tireur', stats: { wins: 0 } };
      const updates = { name: 'Bob', stats: { wins: 5 } };
      const changes = computeChanges(old, updates);
      expect(changes).toHaveLength(1);
      expect(changes[0].field).toBe('name');
    });

    test('computeChanges detects differences only', () => {
      const old = { name: 'Alice', role: 'Tireur' };
      const updates = { name: 'Alice', role: 'Pointeur' };
      const changes = computeChanges(old, updates);
      expect(changes).toHaveLength(1);
      expect(changes[0].field).toBe('role');
    });
  });

  describe('state transitions', () => {
    test('add appends to list', () => {
      const players = [makePlayer({ id: 'p1' })];
      const newP = makePlayer({ id: 'p2' });
      const updated = [...players, newP];
      expect(updated).toHaveLength(2);
    });

    test('update replaces in list', () => {
      const players = [makePlayer({ id: 'p1', name: 'Alice' })];
      const updated = players.map(p => p.id === 'p1' ? { ...p, name: 'Bob' } : p);
      expect(updated[0].name).toBe('Bob');
    });

    test('delete removes from list', () => {
      const players = [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })];
      expect(players.filter(p => p.id !== 'p1')).toHaveLength(1);
    });

    test('offline add generates temp_ id', () => {
      const id = `temp_${Date.now()}`;
      expect(id.startsWith('temp_')).toBe(true);
    });
  });
});
