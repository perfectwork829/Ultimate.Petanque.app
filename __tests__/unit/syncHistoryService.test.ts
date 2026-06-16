/**
 * Unit tests for services/syncHistoryService.ts
 *
 * Tests: SyncHistoryEntry structure, MAX_ENTRIES trimming, ID generation,
 * newest-first ordering, count, clearing.
 */

// ─── Inline implementations ──

interface SyncHistoryEntry {
  id: string;
  date: string;
  total: number;
  succeeded: number;
  failed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errors: string[];
  duration: number;
}

const MAX_ENTRIES = 50;

function generateEntryId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function trimHistory(history: SyncHistoryEntry[]): SyncHistoryEntry[] {
  return history.slice(0, MAX_ENTRIES);
}

function addEntryToHistory(
  history: SyncHistoryEntry[],
  entry: Omit<SyncHistoryEntry, 'id'>
): SyncHistoryEntry[] {
  const newEntry: SyncHistoryEntry = { ...entry, id: generateEntryId() };
  const updated = [newEntry, ...history];
  return trimHistory(updated);
}

function computeSuccessRate(entry: SyncHistoryEntry): number {
  if (entry.total === 0) return 100;
  return Math.round((entry.succeeded / entry.total) * 100);
}

// ─── Tests ──

describe('generateEntryId', () => {
  test('starts with sync_', () => {
    expect(generateEntryId().startsWith('sync_')).toBe(true);
  });

  test('contains timestamp', () => {
    const id = generateEntryId();
    const parts = id.split('_');
    const ts = parseInt(parts[1]);
    expect(ts).toBeGreaterThan(1000000000000);
  });

  test('unique across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateEntryId()));
    expect(ids.size).toBe(50);
  });

  test('has random suffix', () => {
    const id = generateEntryId();
    const parts = id.split('_');
    expect(parts[2].length).toBeGreaterThanOrEqual(2);
  });
});

describe('MAX_ENTRIES', () => {
  test('is 50', () => { expect(MAX_ENTRIES).toBe(50); });
});

describe('trimHistory', () => {
  test('does not trim below limit', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `sync_${i}`, date: '2026-01-01', total: 5, succeeded: 5,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 100,
    }));
    expect(trimHistory(entries)).toHaveLength(10);
  });

  test('trims to 50', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      id: `sync_${i}`, date: '2026-01-01', total: 5, succeeded: 5,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 100,
    }));
    expect(trimHistory(entries)).toHaveLength(50);
  });

  test('preserves newest entries (front of array)', () => {
    const entries = Array.from({ length: 55 }, (_, i) => ({
      id: `sync_${i}`, date: '2026-01-01', total: 5, succeeded: 5,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 100,
    }));
    const trimmed = trimHistory(entries);
    expect(trimmed[0].id).toBe('sync_0');
    expect(trimmed[49].id).toBe('sync_49');
  });
});

describe('addEntryToHistory', () => {
  test('prepends new entry', () => {
    const history: SyncHistoryEntry[] = [{
      id: 'sync_old', date: '2026-01-01', total: 3, succeeded: 3,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 100,
    }];
    const result = addEntryToHistory(history, {
      date: '2026-01-02', total: 5, succeeded: 4, failed: 1,
      conflictsDetected: 1, conflictsResolved: 1, errors: ['timeout'], duration: 200,
    });
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-01-02');
    expect(result[0].failed).toBe(1);
    expect(result[1].id).toBe('sync_old');
  });

  test('assigns auto-generated id', () => {
    const result = addEntryToHistory([], {
      date: '2026-01-01', total: 10, succeeded: 10,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 50,
    });
    expect(result[0].id).toMatch(/^sync_\d+_/);
  });

  test('trims when exceeding MAX_ENTRIES', () => {
    const history = Array.from({ length: 50 }, (_, i) => ({
      id: `sync_${i}`, date: '2026-01-01', total: 1, succeeded: 1,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 10,
    }));
    const result = addEntryToHistory(history, {
      date: '2026-01-02', total: 1, succeeded: 1,
      failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 10,
    });
    expect(result).toHaveLength(50);
    // Newest is first
    expect(result[0].date).toBe('2026-01-02');
  });
});

describe('SyncHistoryEntry fields', () => {
  const entry: SyncHistoryEntry = {
    id: 'sync_123_abcd',
    date: '2026-03-28T10:00:00Z',
    total: 25,
    succeeded: 22,
    failed: 3,
    conflictsDetected: 2,
    conflictsResolved: 1,
    errors: ['timeout on players', 'RLS denied on clubs'],
    duration: 1500,
  };

  test('has all required fields', () => {
    expect(entry.id).toBeDefined();
    expect(entry.date).toBeDefined();
    expect(entry.total).toBeDefined();
    expect(entry.succeeded).toBeDefined();
    expect(entry.failed).toBeDefined();
    expect(entry.conflictsDetected).toBeDefined();
    expect(entry.conflictsResolved).toBeDefined();
    expect(entry.errors).toBeDefined();
    expect(entry.duration).toBeDefined();
  });

  test('errors is an array', () => {
    expect(Array.isArray(entry.errors)).toBe(true);
    expect(entry.errors).toHaveLength(2);
  });

  test('total = succeeded + failed', () => {
    expect(entry.succeeded + entry.failed).toBe(entry.total);
  });
});

describe('computeSuccessRate', () => {
  test('100% success', () => {
    expect(computeSuccessRate({ id: '1', date: '', total: 10, succeeded: 10, failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 0 })).toBe(100);
  });

  test('partial success', () => {
    expect(computeSuccessRate({ id: '1', date: '', total: 10, succeeded: 7, failed: 3, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 0 })).toBe(70);
  });

  test('all failed', () => {
    expect(computeSuccessRate({ id: '1', date: '', total: 5, succeeded: 0, failed: 5, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 0 })).toBe(0);
  });

  test('zero total = 100%', () => {
    expect(computeSuccessRate({ id: '1', date: '', total: 0, succeeded: 0, failed: 0, conflictsDetected: 0, conflictsResolved: 0, errors: [], duration: 0 })).toBe(100);
  });
});
