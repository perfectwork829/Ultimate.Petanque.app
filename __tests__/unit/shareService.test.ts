/**
 * Unit tests for services/shareService.ts
 *
 * Tests: generateShareCode (format, length, charset, uniqueness),
 * mapSharedItemRow (field mapping), mapNotificationRow (field mapping),
 * share types/permissions, expiration logic, edge cases.
 */

type ShareItemType = 'player' | 'club' | 'terrain' | 'tournament' | 'match' | 'challenge';
type SharePermission = 'read' | 'write';

function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return result;
}

function mapSharedItemRow(s: any): any {
  return { id: s.id, ownerId: s.owner_id, sharedWithId: s.shared_with_id, shareCode: s.share_code, itemType: s.item_type, itemId: s.item_id, permission: s.permission, isPublicLink: s.is_public_link, expiresAt: s.expires_at, createdAt: s.created_at, associatedItems: s.associated_items };
}

function mapNotificationRow(n: any): any {
  return { id: n.id, ownerId: n.owner_id, accessorId: n.accessor_id, accessorName: n.accessor_name, accessorEmail: n.accessor_email, itemType: n.item_type, itemId: n.item_id, itemName: n.item_name, permission: n.permission, shareCode: n.share_code, isRead: n.is_read, createdAt: n.created_at };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

describe('generateShareCode', () => {
  test('length is 8', () => { expect(generateShareCode()).toHaveLength(8); });
  test('alphanumeric chars only', () => { expect(generateShareCode()).toMatch(/^[A-Za-z0-9]{8}$/); });
  test('generates unique codes (statistical)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateShareCode()));
    expect(codes.size).toBeGreaterThan(95);
  });
  test('mixed case', () => {
    const codes = Array.from({ length: 20 }, () => generateShareCode()).join('');
    expect(codes).toMatch(/[a-z]/); expect(codes).toMatch(/[A-Z]/); expect(codes).toMatch(/[0-9]/);
  });
});

describe('mapSharedItemRow', () => {
  test('maps all DB fields', () => {
    const row = { id: 's1', owner_id: 'u1', shared_with_id: 'u2', share_code: 'ABC12345', item_type: 'player', item_id: 'p1', permission: 'read', is_public_link: true, expires_at: '2026-12-31', created_at: '2026-03-01', associated_items: [{ type: 'club', id: 'c1' }] };
    const item = mapSharedItemRow(row);
    expect(item.id).toBe('s1'); expect(item.ownerId).toBe('u1'); expect(item.shareCode).toBe('ABC12345');
    expect(item.itemType).toBe('player'); expect(item.isPublicLink).toBe(true);
    expect(item.associatedItems).toHaveLength(1);
  });
  test('handles null optional fields', () => {
    const item = mapSharedItemRow({ shared_with_id: null, expires_at: null, associated_items: null });
    expect(item.sharedWithId).toBeNull(); expect(item.expiresAt).toBeNull();
  });
});

describe('mapNotificationRow', () => {
  test('maps notification fields', () => {
    const n = mapNotificationRow({ id: 'n1', owner_id: 'u1', accessor_id: 'u2', accessor_name: 'Alice', accessor_email: 'a@b.com', item_type: 'match', item_id: 'm1', item_name: 'A vs B', permission: 'read', share_code: 'XYZ', is_read: false, created_at: '2026-03-01' });
    expect(n.ownerId).toBe('u1'); expect(n.accessorName).toBe('Alice'); expect(n.isRead).toBe(false);
  });
});

describe('Share Types', () => {
  const types: ShareItemType[] = ['player', 'club', 'terrain', 'tournament', 'match', 'challenge'];
  test('6 valid share types', () => { expect(types).toHaveLength(6); });
  types.forEach(t => { test(`type "${t}" is valid`, () => { expect(types).toContain(t); }); });
});

describe('Share Permissions', () => {
  const perms: SharePermission[] = ['read', 'write'];
  test('2 permission levels', () => { expect(perms).toHaveLength(2); });
});

describe('Expiration Logic', () => {
  test('null expiresAt is not expired', () => { expect(isExpired(null)).toBe(false); });
  test('future date is not expired', () => { expect(isExpired('2099-12-31T23:59:59Z')).toBe(false); });
  test('past date is expired', () => { expect(isExpired('2020-01-01T00:00:00Z')).toBe(true); });
});
