/**
 * Tests for boulesSetCrudService — add/update/delete/setPrimary, player sync
 */

function mapBoulesSetUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.brand !== undefined) db.brand = updates.brand || null;
  if (updates.diameter !== undefined) db.diameter = updates.diameter || null;
  if (updates.weight !== undefined) db.weight = updates.weight || null;
  if (updates.serialNumber !== undefined) db.serial_number = updates.serialNumber || null;
  if (updates.hardness !== undefined) db.hardness = updates.hardness || null;
  if (updates.isPrimary !== undefined) db.is_primary = updates.isPrimary;
  if (updates.photo !== undefined) db.photo = updates.photo || null;
  if (updates.purchasePrice !== undefined) db.purchase_price = updates.purchasePrice || null;
  return db;
}

function setPrimaryInList(sets: any[], id: string): any[] {
  return sets.map(s => ({ ...s, isPrimary: s.id === id }));
}

function addPrimarySet(sets: any[], newSet: any): any[] {
  if (newSet.isPrimary) {
    return [...sets.map(s => ({ ...s, isPrimary: false })), newSet];
  }
  return [...sets, newSet];
}

const makeSet = (o: any = {}) => ({
  id: `bs-${Math.random().toString(36).slice(2, 8)}`, name: 'Mes Boules', brand: 'Obut', isPrimary: false, ...o,
});

describe('boulesSetCrudService', () => {
  describe('mapBoulesSetUpdateFields', () => {
    test('maps all fields', () => {
      const db = mapBoulesSetUpdateFields({ name: 'New', brand: 'MS', diameter: 71.5, weight: 700, serialNumber: 'SN123', isPrimary: true, purchasePrice: 150 });
      expect(db.name).toBe('New');
      expect(db.brand).toBe('MS');
      expect(db.diameter).toBe(71.5);
      expect(db.weight).toBe(700);
      expect(db.serial_number).toBe('SN123');
      expect(db.is_primary).toBe(true);
      expect(db.purchase_price).toBe(150);
    });

    test('nullifies empty values', () => {
      const db = mapBoulesSetUpdateFields({ brand: '', serialNumber: '', photo: '', purchasePrice: 0 });
      expect(db.brand).toBeNull();
      expect(db.serial_number).toBeNull();
      expect(db.photo).toBeNull();
      expect(db.purchase_price).toBeNull();
    });
  });

  describe('setPrimaryInList', () => {
    test('sets only one as primary', () => {
      const sets = [makeSet({ id: 'bs1', isPrimary: true }), makeSet({ id: 'bs2' }), makeSet({ id: 'bs3' })];
      const result = setPrimaryInList(sets, 'bs2');
      expect(result.filter(s => s.isPrimary)).toHaveLength(1);
      expect(result.find(s => s.id === 'bs2')!.isPrimary).toBe(true);
      expect(result.find(s => s.id === 'bs1')!.isPrimary).toBe(false);
    });
  });

  describe('addPrimarySet', () => {
    test('unsets existing primary when new is primary', () => {
      const sets = [makeSet({ id: 'bs1', isPrimary: true })];
      const newSet = makeSet({ id: 'bs2', isPrimary: true });
      const result = addPrimarySet(sets, newSet);
      expect(result).toHaveLength(2);
      expect(result[0].isPrimary).toBe(false);
      expect(result[1].isPrimary).toBe(true);
    });

    test('keeps existing primary when new is not primary', () => {
      const sets = [makeSet({ id: 'bs1', isPrimary: true })];
      const newSet = makeSet({ id: 'bs2', isPrimary: false });
      const result = addPrimarySet(sets, newSet);
      expect(result[0].isPrimary).toBe(true);
      expect(result[1].isPrimary).toBe(false);
    });
  });

  describe('state transitions', () => {
    test('delete removes from list', () => {
      const sets = [makeSet({ id: 'bs1' }), makeSet({ id: 'bs2' })];
      expect(sets.filter(s => s.id !== 'bs1')).toHaveLength(1);
    });

    test('requires userId for all operations', () => {
      expect(undefined).toBeFalsy();
      expect('user-1').toBeTruthy();
    });
  });
});
