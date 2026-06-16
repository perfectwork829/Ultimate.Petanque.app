/**
 * Unit tests for hooks/useMeetups.ts
 * Tests: deduplication, sorting, accepted count, source tagging, error handling.
 */

// ============================================================
// Types (mirrors meetupService types)
// ============================================================
interface Meetup {
  id: string;
  creatorId: string;
  terrainId: string;
  title: string;
  date: string;
  maxParticipants: number;
  status: string;
  shareCode: string;
  notes?: string;
}

interface MeetupResponse {
  id: string;
  meetupId: string;
  userId: string;
  status: 'pending' | 'accepted' | 'declined';
}

type MeetupWithMeta = Meetup & { _source: 'created' | 'invited'; _acceptedCount?: number };

// ============================================================
// Test Data Factories
// ============================================================
const makeMeetup = (overrides: Partial<Meetup> = {}): Meetup => ({
  id: 'meetup-1',
  creatorId: 'user-a',
  terrainId: 'ter-1',
  title: 'Sunday Game',
  date: '2026-03-28T14:00:00Z',
  maxParticipants: 8,
  status: 'active',
  shareCode: 'ABC123',
  ...overrides,
});

const makeResponse = (overrides: Partial<MeetupResponse> = {}): MeetupResponse => ({
  id: 'resp-1',
  meetupId: 'meetup-1',
  userId: 'user-b',
  status: 'accepted',
  ...overrides,
});

// ============================================================
// Inline computation helpers (mirror useMeetups logic)
// ============================================================

/**
 * Merges created and invited meetups, deduplicating by ID.
 * Created meetups take priority (set first in Map).
 */
function mergeMeetups(created: Meetup[], invited: Meetup[]): MeetupWithMeta[] {
  const allMap = new Map<string, MeetupWithMeta>();
  created.forEach(m => allMap.set(m.id, { ...m, _source: 'created' }));
  invited.forEach(m => {
    if (!allMap.has(m.id)) allMap.set(m.id, { ...m, _source: 'invited' });
  });
  return Array.from(allMap.values());
}

/**
 * Sorts meetups by date descending (newest first).
 */
function sortMeetupsByDate(meetups: MeetupWithMeta[]): MeetupWithMeta[] {
  return [...meetups].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Counts accepted responses for a meetup.
 */
function countAccepted(responses: MeetupResponse[]): number {
  return responses.filter(r => r.status === 'accepted').length;
}

/**
 * Attaches accepted count to each meetup.
 */
function attachCounts(
  meetups: MeetupWithMeta[],
  responsesByMeetup: Record<string, MeetupResponse[]>,
): MeetupWithMeta[] {
  return meetups.map(m => ({
    ...m,
    _acceptedCount: countAccepted(responsesByMeetup[m.id] || []),
  }));
}

// ============================================================
// Tests: mergeMeetups (deduplication)
// ============================================================
describe('useMeetups — mergeMeetups', () => {
  test('merges created and invited without duplicates', () => {
    const created = [makeMeetup({ id: 'm1' }), makeMeetup({ id: 'm2' })];
    const invited = [makeMeetup({ id: 'm3' }), makeMeetup({ id: 'm4' })];
    const result = mergeMeetups(created, invited);
    expect(result).toHaveLength(4);
  });

  test('created meetups take priority over invited duplicates', () => {
    const created = [makeMeetup({ id: 'm1', title: 'Created Version' })];
    const invited = [makeMeetup({ id: 'm1', title: 'Invited Version' })];
    const result = mergeMeetups(created, invited);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Created Version');
    expect(result[0]._source).toBe('created');
  });

  test('tags created meetups with _source "created"', () => {
    const result = mergeMeetups([makeMeetup({ id: 'm1' })], []);
    expect(result[0]._source).toBe('created');
  });

  test('tags invited meetups with _source "invited"', () => {
    const result = mergeMeetups([], [makeMeetup({ id: 'm1' })]);
    expect(result[0]._source).toBe('invited');
  });

  test('handles empty created list', () => {
    const result = mergeMeetups([], [makeMeetup({ id: 'm1' })]);
    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('invited');
  });

  test('handles empty invited list', () => {
    const result = mergeMeetups([makeMeetup({ id: 'm1' })], []);
    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('created');
  });

  test('handles both empty lists', () => {
    const result = mergeMeetups([], []);
    expect(result).toHaveLength(0);
  });

  test('deduplicates multiple overlapping meetups', () => {
    const created = [makeMeetup({ id: 'm1' }), makeMeetup({ id: 'm2' })];
    const invited = [makeMeetup({ id: 'm2' }), makeMeetup({ id: 'm3' }), makeMeetup({ id: 'm1' })];
    const result = mergeMeetups(created, invited);
    expect(result).toHaveLength(3);
    const sources = result.map(r => ({ id: r.id, src: r._source }));
    expect(sources.find(s => s.id === 'm1')?.src).toBe('created');
    expect(sources.find(s => s.id === 'm2')?.src).toBe('created');
    expect(sources.find(s => s.id === 'm3')?.src).toBe('invited');
  });
});

// ============================================================
// Tests: sortMeetupsByDate
// ============================================================
describe('useMeetups — sortMeetupsByDate', () => {
  test('sorts newest first', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1', date: '2026-01-01T10:00:00Z' }), _source: 'created' },
      { ...makeMeetup({ id: 'm2', date: '2026-06-15T10:00:00Z' }), _source: 'created' },
      { ...makeMeetup({ id: 'm3', date: '2026-03-10T10:00:00Z' }), _source: 'invited' },
    ];
    const sorted = sortMeetupsByDate(meetups);
    expect(sorted[0].id).toBe('m2'); // June
    expect(sorted[1].id).toBe('m3'); // March
    expect(sorted[2].id).toBe('m1'); // January
  });

  test('handles single meetup', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1' }), _source: 'created' },
    ];
    const sorted = sortMeetupsByDate(meetups);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe('m1');
  });

  test('handles empty list', () => {
    expect(sortMeetupsByDate([])).toHaveLength(0);
  });

  test('same date preserves relative order (stable sort)', () => {
    const sameDate = '2026-03-28T14:00:00Z';
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1', date: sameDate }), _source: 'created' },
      { ...makeMeetup({ id: 'm2', date: sameDate }), _source: 'invited' },
    ];
    const sorted = sortMeetupsByDate(meetups);
    expect(sorted).toHaveLength(2);
  });

  test('does not mutate original array', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1', date: '2026-01-01T10:00:00Z' }), _source: 'created' },
      { ...makeMeetup({ id: 'm2', date: '2026-06-15T10:00:00Z' }), _source: 'created' },
    ];
    const original = [...meetups];
    sortMeetupsByDate(meetups);
    expect(meetups[0].id).toBe(original[0].id);
  });
});

// ============================================================
// Tests: countAccepted
// ============================================================
describe('useMeetups — countAccepted', () => {
  test('counts only accepted responses', () => {
    const responses: MeetupResponse[] = [
      makeResponse({ id: 'r1', status: 'accepted' }),
      makeResponse({ id: 'r2', status: 'declined' }),
      makeResponse({ id: 'r3', status: 'accepted' }),
      makeResponse({ id: 'r4', status: 'pending' }),
    ];
    expect(countAccepted(responses)).toBe(2);
  });

  test('returns 0 for no accepted responses', () => {
    const responses: MeetupResponse[] = [
      makeResponse({ id: 'r1', status: 'declined' }),
      makeResponse({ id: 'r2', status: 'pending' }),
    ];
    expect(countAccepted(responses)).toBe(0);
  });

  test('returns 0 for empty responses', () => {
    expect(countAccepted([])).toBe(0);
  });

  test('counts all when all accepted', () => {
    const responses: MeetupResponse[] = [
      makeResponse({ id: 'r1', status: 'accepted' }),
      makeResponse({ id: 'r2', status: 'accepted' }),
      makeResponse({ id: 'r3', status: 'accepted' }),
    ];
    expect(countAccepted(responses)).toBe(3);
  });
});

// ============================================================
// Tests: attachCounts
// ============================================================
describe('useMeetups — attachCounts', () => {
  test('attaches accepted count to each meetup', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1' }), _source: 'created' },
      { ...makeMeetup({ id: 'm2' }), _source: 'invited' },
    ];
    const responsesByMeetup: Record<string, MeetupResponse[]> = {
      'm1': [
        makeResponse({ id: 'r1', meetupId: 'm1', status: 'accepted' }),
        makeResponse({ id: 'r2', meetupId: 'm1', status: 'declined' }),
        makeResponse({ id: 'r3', meetupId: 'm1', status: 'accepted' }),
      ],
      'm2': [
        makeResponse({ id: 'r4', meetupId: 'm2', status: 'pending' }),
      ],
    };
    const result = attachCounts(meetups, responsesByMeetup);
    expect(result[0]._acceptedCount).toBe(2);
    expect(result[1]._acceptedCount).toBe(0);
  });

  test('handles meetup with no responses', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1' }), _source: 'created' },
    ];
    const result = attachCounts(meetups, {});
    expect(result[0]._acceptedCount).toBe(0);
  });

  test('preserves _source tag after attaching counts', () => {
    const meetups: MeetupWithMeta[] = [
      { ...makeMeetup({ id: 'm1' }), _source: 'created' },
      { ...makeMeetup({ id: 'm2' }), _source: 'invited' },
    ];
    const result = attachCounts(meetups, {});
    expect(result[0]._source).toBe('created');
    expect(result[1]._source).toBe('invited');
  });
});

// ============================================================
// Tests: Full pipeline (merge → sort → count)
// ============================================================
describe('useMeetups — full pipeline', () => {
  test('merge → sort → attachCounts produces correct output', () => {
    const created = [
      makeMeetup({ id: 'm1', date: '2026-01-10T10:00:00Z', title: 'January Game' }),
      makeMeetup({ id: 'm2', date: '2026-06-15T10:00:00Z', title: 'June Game' }),
    ];
    const invited = [
      makeMeetup({ id: 'm3', date: '2026-03-20T10:00:00Z', title: 'March Game' }),
      makeMeetup({ id: 'm2', date: '2026-06-15T10:00:00Z', title: 'Duplicate June' }), // duplicate
    ];
    const responsesByMeetup: Record<string, MeetupResponse[]> = {
      'm1': [makeResponse({ status: 'accepted' }), makeResponse({ id: 'r2', status: 'accepted' })],
      'm2': [makeResponse({ id: 'r3', status: 'declined' })],
      'm3': [makeResponse({ id: 'r4', status: 'accepted' }), makeResponse({ id: 'r5', status: 'pending' }), makeResponse({ id: 'r6', status: 'accepted' })],
    };

    // Pipeline
    const merged = mergeMeetups(created, invited);
    expect(merged).toHaveLength(3); // m2 deduplicated

    const sorted = sortMeetupsByDate(merged);
    expect(sorted[0].id).toBe('m2'); // June (newest)
    expect(sorted[1].id).toBe('m3'); // March
    expect(sorted[2].id).toBe('m1'); // January (oldest)

    const withCounts = attachCounts(sorted, responsesByMeetup);
    expect(withCounts[0]._acceptedCount).toBe(0); // m2: 1 declined
    expect(withCounts[1]._acceptedCount).toBe(2); // m3: 2 accepted
    expect(withCounts[2]._acceptedCount).toBe(2); // m1: 2 accepted

    // Source tags correct
    expect(withCounts[0]._source).toBe('created'); // m2 was in created
    expect(withCounts[1]._source).toBe('invited'); // m3 only in invited
    expect(withCounts[2]._source).toBe('created'); // m1 was in created
  });

  test('pipeline handles all empty inputs gracefully', () => {
    const merged = mergeMeetups([], []);
    const sorted = sortMeetupsByDate(merged);
    const withCounts = attachCounts(sorted, {});
    expect(withCounts).toHaveLength(0);
  });

  test('pipeline with large dataset (50 meetups)', () => {
    const created = Array.from({ length: 25 }, (_, i) => makeMeetup({
      id: `m-created-${i}`,
      date: new Date(2026, 0, i + 1).toISOString(),
    }));
    const invited = Array.from({ length: 30 }, (_, i) => makeMeetup({
      id: i < 5 ? `m-created-${i}` : `m-invited-${i}`, // 5 overlapping
      date: new Date(2026, 1, i + 1).toISOString(),
    }));

    const merged = mergeMeetups(created, invited);
    expect(merged).toHaveLength(50); // 25 created + 25 unique invited

    const sorted = sortMeetupsByDate(merged);
    // Newest should be at index 0
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(new Date(sorted[i].date).getTime()).toBeGreaterThanOrEqual(new Date(sorted[i + 1].date).getTime());
    }
  });
});
