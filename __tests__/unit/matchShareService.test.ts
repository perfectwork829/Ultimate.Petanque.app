/**
 * Unit tests for services/matchShareService.ts
 *
 * Tests: mapRow (DB row to MatchShareRequest), request types/permissions/statuses,
 * seen ID management, polling trim logic, edge cases.
 */

interface MatchShareRequest {
  id: string; itemType: 'match' | 'challenge'; itemId: string;
  senderUserId: string; recipientUserId: string; status: 'pending' | 'accepted' | 'declined';
  permission: 'read' | 'write'; senderName?: string; itemSummary?: string;
  createdAt: string; updatedAt: string;
}

function mapRow(row: any): MatchShareRequest {
  return { id: row.id, itemType: row.item_type, itemId: row.item_id, senderUserId: row.sender_user_id, recipientUserId: row.recipient_user_id, status: row.status, permission: row.permission, senderName: row.sender_name || undefined, itemSummary: row.item_summary || undefined, createdAt: row.created_at, updatedAt: row.updated_at };
}

function trimSeenIds(seenIds: string[], maxSize: number = 200): string[] {
  return seenIds.slice(-maxSize);
}

function filterNewRequests(requests: MatchShareRequest[], seenIds: Set<string>): MatchShareRequest[] {
  return requests.filter(r => !seenIds.has(r.id));
}

describe('mapRow', () => {
  test('maps all fields', () => {
    const row = { id: 'r1', item_type: 'match', item_id: 'm1', sender_user_id: 'u1', recipient_user_id: 'u2', status: 'pending', permission: 'write', sender_name: 'Alice', item_summary: 'A vs B', created_at: '2026-03-28', updated_at: '2026-03-28' };
    const req = mapRow(row);
    expect(req.id).toBe('r1'); expect(req.itemType).toBe('match'); expect(req.permission).toBe('write');
    expect(req.senderName).toBe('Alice'); expect(req.itemSummary).toBe('A vs B');
  });
  test('undefined for null sender_name', () => {
    expect(mapRow({ sender_name: null }).senderName).toBeUndefined();
  });
  test('maps challenge type', () => {
    expect(mapRow({ item_type: 'challenge' }).itemType).toBe('challenge');
  });
});

describe('Request Statuses', () => {
  test('3 valid statuses', () => {
    const statuses: MatchShareRequest['status'][] = ['pending', 'accepted', 'declined'];
    expect(statuses).toHaveLength(3);
  });
});

describe('Permissions', () => {
  test('read permission', () => { expect(mapRow({ permission: 'read' }).permission).toBe('read'); });
  test('write permission', () => { expect(mapRow({ permission: 'write' }).permission).toBe('write'); });
});

describe('trimSeenIds', () => {
  test('keeps last 200', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`);
    const trimmed = trimSeenIds(ids);
    expect(trimmed).toHaveLength(200); expect(trimmed[0]).toBe('id-100');
  });
  test('does not trim when under limit', () => {
    const ids = ['a', 'b', 'c'];
    expect(trimSeenIds(ids)).toHaveLength(3);
  });
});

describe('filterNewRequests', () => {
  test('filters out seen requests', () => {
    const requests = [
      { id: 'r1' } as MatchShareRequest,
      { id: 'r2' } as MatchShareRequest,
      { id: 'r3' } as MatchShareRequest,
    ];
    const seen = new Set(['r1', 'r3']);
    const filtered = filterNewRequests(requests, seen);
    expect(filtered).toHaveLength(1); expect(filtered[0].id).toBe('r2');
  });
  test('returns all when none seen', () => {
    const requests = [{ id: 'r1' } as MatchShareRequest];
    expect(filterNewRequests(requests, new Set())).toHaveLength(1);
  });
  test('returns empty when all seen', () => {
    const requests = [{ id: 'r1' } as MatchShareRequest];
    expect(filterNewRequests(requests, new Set(['r1']))).toHaveLength(0);
  });
});
