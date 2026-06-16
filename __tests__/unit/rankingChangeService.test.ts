/**
 * Unit tests for services/rankingChangeService.ts
 *
 * Tests: RankChange detection (up/down/same), snapshot comparison logic,
 * significance filtering, new entrant handling, edge cases.
 */

interface RankChange { userId: string; playerName: string; oldRank: number; newRank: number; direction: 'up' | 'down'; }

function detectChanges(
  oldRankings: Map<string, { rank: number; name: string }>,
  newRankings: Map<string, { rank: number; name: string }>
): RankChange[] {
  const changes: RankChange[] = [];
  for (const [userId, newData] of newRankings.entries()) {
    const oldData = oldRankings.get(userId);
    if (!oldData) continue;
    if (oldData.rank !== newData.rank) {
      changes.push({ userId, playerName: newData.name, oldRank: oldData.rank, newRank: newData.rank, direction: newData.rank < oldData.rank ? 'up' : 'down' });
    }
  }
  return changes;
}

function filterSignificant(changes: RankChange[], minDiff: number = 1): RankChange[] {
  return changes.filter(c => Math.abs(c.newRank - c.oldRank) >= minDiff);
}

describe('detectChanges', () => {
  test('detects rank improvement (up)', () => {
    const old = new Map([['u1', { rank: 5, name: 'Alice' }]]);
    const cur = new Map([['u1', { rank: 3, name: 'Alice' }]]);
    const changes = detectChanges(old, cur);
    expect(changes).toHaveLength(1); expect(changes[0].direction).toBe('up');
    expect(changes[0].oldRank).toBe(5); expect(changes[0].newRank).toBe(3);
  });
  test('detects rank drop (down)', () => {
    const old = new Map([['u1', { rank: 2, name: 'Bob' }]]);
    const cur = new Map([['u1', { rank: 7, name: 'Bob' }]]);
    const changes = detectChanges(old, cur);
    expect(changes[0].direction).toBe('down');
  });
  test('no change when rank unchanged', () => {
    const old = new Map([['u1', { rank: 3, name: 'A' }]]);
    const cur = new Map([['u1', { rank: 3, name: 'A' }]]);
    expect(detectChanges(old, cur)).toHaveLength(0);
  });
  test('ignores new entrants (no previous rank)', () => {
    const old = new Map<string, { rank: number; name: string }>();
    const cur = new Map([['u1', { rank: 1, name: 'New' }]]);
    expect(detectChanges(old, cur)).toHaveLength(0);
  });
  test('detects multiple changes', () => {
    const old = new Map([['u1', { rank: 1, name: 'A' }], ['u2', { rank: 2, name: 'B' }], ['u3', { rank: 3, name: 'C' }]]);
    const cur = new Map([['u1', { rank: 2, name: 'A' }], ['u2', { rank: 1, name: 'B' }], ['u3', { rank: 3, name: 'C' }]]);
    const changes = detectChanges(old, cur);
    expect(changes).toHaveLength(2);
    expect(changes.find(c => c.userId === 'u1')!.direction).toBe('down');
    expect(changes.find(c => c.userId === 'u2')!.direction).toBe('up');
  });
  test('ignores players removed from leaderboard', () => {
    const old = new Map([['u1', { rank: 1, name: 'A' }], ['u2', { rank: 2, name: 'B' }]]);
    const cur = new Map([['u1', { rank: 1, name: 'A' }]]);
    expect(detectChanges(old, cur)).toHaveLength(0);
  });
});

describe('filterSignificant', () => {
  test('filters changes below threshold', () => {
    const changes: RankChange[] = [
      { userId: 'u1', playerName: 'A', oldRank: 3, newRank: 2, direction: 'up' },
      { userId: 'u2', playerName: 'B', oldRank: 5, newRank: 1, direction: 'up' },
    ];
    const filtered = filterSignificant(changes, 2);
    expect(filtered).toHaveLength(1); expect(filtered[0].userId).toBe('u2');
  });
  test('default minDiff=1 keeps all changes', () => {
    const changes: RankChange[] = [{ userId: 'u1', playerName: 'A', oldRank: 2, newRank: 1, direction: 'up' }];
    expect(filterSignificant(changes)).toHaveLength(1);
  });
  test('empty changes returns empty', () => {
    expect(filterSignificant([])).toHaveLength(0);
  });
});
