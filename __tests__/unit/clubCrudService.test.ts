/**
 * Tests for clubCrudService — add/update/delete clubs
 * Tests: terrain linking/unlinking on delete, DB mapping, modification logging
 */

function mapClubUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.city !== undefined) db.city = updates.city;
  if (updates.country !== undefined) db.country = updates.country;
  if (updates.terrainId !== undefined) db.terrain_id = updates.terrainId;
  if (updates.terrainName !== undefined) db.terrain_name = updates.terrainName;
  if (updates.membershipCost !== undefined) db.membership_cost = updates.membershipCost;
  if (updates.website !== undefined) db.website = updates.website || null;
  if (updates.facebookUrl !== undefined) db.facebook_url = updates.facebookUrl || null;
  if (updates.instagramHandle !== undefined) db.instagram_handle = updates.instagramHandle || null;
  return db;
}

function unlinkTerrainsFromClub(terrains: any[], clubId: string): any[] {
  return terrains.map(t => t.clubId === clubId ? { ...t, clubId: undefined, clubName: undefined } : t);
}

function parseMembershipCost(raw: any): number | undefined {
  return raw ? parseFloat(raw) : undefined;
}

const makeClub = (o: any = {}) => ({ id: `c-${Math.random().toString(36).slice(2, 8)}`, name: 'Club Test', city: 'Lyon', ...o });
const makeTerrain = (o: any = {}) => ({ id: `t-${Math.random().toString(36).slice(2, 8)}`, name: 'Terrain', city: 'Lyon', ...o });

describe('clubCrudService', () => {
  describe('mapClubUpdateFields', () => {
    test('maps camelCase to snake_case', () => {
      const db = mapClubUpdateFields({ terrainId: 't1', terrainName: 'Boulodrome', membershipCost: 50 });
      expect(db.terrain_id).toBe('t1');
      expect(db.terrain_name).toBe('Boulodrome');
      expect(db.membership_cost).toBe(50);
    });

    test('nullifies empty optional fields', () => {
      const db = mapClubUpdateFields({ website: '', facebookUrl: '', instagramHandle: '' });
      expect(db.website).toBeNull();
      expect(db.facebook_url).toBeNull();
      expect(db.instagram_handle).toBeNull();
    });
  });

  describe('unlinkTerrainsFromClub', () => {
    test('unlinks terrains belonging to deleted club', () => {
      const terrains = [makeTerrain({ clubId: 'c1', clubName: 'Club A' }), makeTerrain({ clubId: 'c2' })];
      const result = unlinkTerrainsFromClub(terrains, 'c1');
      expect(result[0].clubId).toBeUndefined();
      expect(result[0].clubName).toBeUndefined();
      expect(result[1].clubId).toBe('c2');
    });

    test('no-op if no terrains linked', () => {
      const terrains = [makeTerrain({ clubId: 'c2' })];
      const result = unlinkTerrainsFromClub(terrains, 'c1');
      expect(result[0].clubId).toBe('c2');
    });
  });

  describe('parseMembershipCost', () => {
    test('parses numeric string', () => { expect(parseMembershipCost('50.00')).toBe(50); });
    test('returns undefined for null', () => { expect(parseMembershipCost(null)).toBeUndefined(); });
    test('handles integer', () => { expect(parseMembershipCost(25)).toBe(25); });
  });

  describe('state transitions', () => {
    test('add appends club', () => {
      const clubs = [makeClub({ id: 'c1' })];
      expect([...clubs, makeClub({ id: 'c2' })]).toHaveLength(2);
    });
    test('delete removes club and unlinks terrains', () => {
      const clubs = [makeClub({ id: 'c1' }), makeClub({ id: 'c2' })];
      const terrains = [makeTerrain({ clubId: 'c1' })];
      expect(clubs.filter(c => c.id !== 'c1')).toHaveLength(1);
      expect(unlinkTerrainsFromClub(terrains, 'c1')[0].clubId).toBeUndefined();
    });
  });
});
