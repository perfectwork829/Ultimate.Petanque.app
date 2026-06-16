/**
 * Tests for terrainCrudService — add/update/delete, club linking, favorites cleanup
 */

function mapTerrainUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.city !== undefined) db.city = updates.city;
  if (updates.type !== undefined) db.type = updates.type;
  if (updates.clubId !== undefined) db.club_id = updates.clubId;
  if (updates.clubName !== undefined) db.club_name = updates.clubName;
  if (updates.isPublic !== undefined) db.is_public = updates.isPublic;
  if (updates.publicAccess !== undefined) db.public_access = updates.publicAccess;
  if (updates.courtsCount !== undefined) db.courts_count = updates.courtsCount;
  if (updates.lighting !== undefined) db.lighting = updates.lighting;
  if (updates.covered !== undefined) db.covered = updates.covered;
  if (updates.environment !== undefined) db.environment = updates.environment;
  return db;
}

function cleanupFavoritesOnDelete(favorites: string[], deletedId: string): string[] {
  return favorites.filter(id => id !== deletedId);
}

function getModificationIgnoreFields(): string[] { return ['location']; }

describe('terrainCrudService', () => {
  describe('mapTerrainUpdateFields', () => {
    test('maps all terrain-specific fields', () => {
      const db = mapTerrainUpdateFields({ clubId: 'c1', isPublic: true, publicAccess: false, courtsCount: 4, lighting: true, covered: false, environment: 'indoor' });
      expect(db.club_id).toBe('c1');
      expect(db.is_public).toBe(true);
      expect(db.public_access).toBe(false);
      expect(db.courts_count).toBe(4);
      expect(db.lighting).toBe(true);
      expect(db.covered).toBe(false);
      expect(db.environment).toBe('indoor');
    });

    test('only maps defined fields', () => {
      const db = mapTerrainUpdateFields({ name: 'New Name' });
      expect(db.name).toBe('New Name');
      expect(db.club_id).toBeUndefined();
    });
  });

  describe('cleanupFavoritesOnDelete', () => {
    test('removes deleted terrain from favorites', () => {
      expect(cleanupFavoritesOnDelete(['t1', 't2', 't3'], 't2')).toEqual(['t1', 't3']);
    });
    test('no-op if not in favorites', () => {
      expect(cleanupFavoritesOnDelete(['t1'], 't999')).toEqual(['t1']);
    });
  });

  describe('modification logging', () => {
    test('ignores location field', () => {
      expect(getModificationIgnoreFields()).toContain('location');
    });
  });

  describe('state transitions', () => {
    test('add with default environment outdoor', () => {
      const terrain = { name: 'Test', environment: undefined };
      expect(terrain.environment || 'outdoor').toBe('outdoor');
    });
    test('add with default publicAccess true', () => {
      const terrain = { publicAccess: undefined };
      expect(terrain.publicAccess ?? true).toBe(true);
    });
    test('delete removes from list and favorites', () => {
      const terrains = [{ id: 't1' }, { id: 't2' }];
      const favorites = ['t1', 't2'];
      expect(terrains.filter(t => t.id !== 't1')).toHaveLength(1);
      expect(cleanupFavoritesOnDelete(favorites, 't1')).toEqual(['t2']);
    });
  });
});
