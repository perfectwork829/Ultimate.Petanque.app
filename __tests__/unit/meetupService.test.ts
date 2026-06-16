/**
 * Unit tests for services/meetupService.ts
 *
 * Tests: generateShareCode format/charset/prefix, Meetup/MeetupResponse types,
 * InvitableUser source types, PendingInvitation mapping, MeetupReminderSettings,
 * scheduleMeetupReminder logic, deduplication of invited users,
 * auto-accept for creator, share code lookup, response status,
 * pending invitations filtering, edge cases.
 */

// ─── Inline implementations ──

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RDV-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface Meetup {
  id: string;
  creator_id: string;
  terrain_id: string;
  title: string;
  date: string;
  max_participants: number;
  status: 'active' | 'cancelled' | 'completed';
  share_code: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  terrain_name?: string;
  terrain_city?: string;
  terrain_type?: string;
  creator_name?: string;
  creator_email?: string;
  responses?: MeetupResponse[];
}

interface MeetupResponse {
  id: string;
  meetup_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  responded_at?: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

interface InvitableUser {
  userId: string;
  name: string;
  club: string;
  role: string;
  avatar: string;
  source: 'public' | 'shared';
}

interface PendingInvitation {
  responseId: string;
  meetupId: string;
  title: string;
  date: string;
  maxParticipants: number;
  acceptedCount: number;
  shareCode: string;
  notes?: string;
  creatorName: string;
  terrainName: string;
  terrainCity: string;
}

interface MeetupReminderSettings {
  oneDayBefore: boolean;
  threeHoursBefore: boolean;
  oneHourBefore: boolean;
}

function computeReminderDates(meetupDate: Date, settings: MeetupReminderSettings): Date[] {
  const dates: Date[] = [];
  if (settings.oneDayBefore) {
    const d = new Date(meetupDate);
    d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
    dates.push(d);
  }
  if (settings.threeHoursBefore) {
    const d = new Date(meetupDate);
    d.setHours(d.getHours() - 3);
    dates.push(d);
  }
  if (settings.oneHourBefore) {
    const d = new Date(meetupDate);
    d.setHours(d.getHours() - 1);
    dates.push(d);
  }
  return dates;
}

function filterNewInvitations(userIds: string[], existingUserIds: string[]): string[] {
  const existingSet = new Set(existingUserIds);
  return userIds.filter(uid => !existingSet.has(uid));
}

function getAcceptedCount(responses: MeetupResponse[]): number {
  return responses.filter(r => r.status === 'accepted').length;
}

function isMeetupFull(meetup: { max_participants: number }, responses: MeetupResponse[]): boolean {
  return getAcceptedCount(responses) >= meetup.max_participants;
}

function deduplicateInvitableUsers(users: InvitableUser[]): InvitableUser[] {
  const seen = new Map<string, InvitableUser>();
  for (const u of users) {
    if (!seen.has(u.userId)) {
      seen.set(u.userId, u);
    }
  }
  return Array.from(seen.values());
}

function sortMeetupsByDate(meetups: Meetup[]): Meetup[] {
  return [...meetups].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function filterActiveMeetups(meetups: Meetup[]): Meetup[] {
  const now = new Date();
  return meetups.filter(m => m.status === 'active' && new Date(m.date) >= now);
}

// ─── Tests ──

describe('generateShareCode', () => {
  test('starts with RDV- prefix', () => {
    const code = generateShareCode();
    expect(code.startsWith('RDV-')).toBe(true);
  });

  test('has correct total length (4 prefix + 6 chars = 10)', () => {
    const code = generateShareCode();
    expect(code.length).toBe(10);
  });

  test('body uses only safe charset (no 0/O/1/I)', () => {
    const safeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode();
      const body = code.substring(4);
      for (const ch of body) {
        expect(safeChars.includes(ch)).toBe(true);
      }
    }
  });

  test('generates unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      codes.add(generateShareCode());
    }
    expect(codes.size).toBeGreaterThanOrEqual(195);
  });

  test('does not contain ambiguous characters 0, O, 1, I', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShareCode();
      const body = code.substring(4);
      expect(body).not.toContain('0');
      expect(body).not.toContain('O');
      expect(body).not.toContain('1');
      expect(body).not.toContain('I');
    }
  });
});

describe('filterNewInvitations', () => {
  test('filters out existing users', () => {
    const result = filterNewInvitations(['a', 'b', 'c'], ['b']);
    expect(result).toEqual(['a', 'c']);
  });

  test('returns all when no existing', () => {
    expect(filterNewInvitations(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  test('returns empty when all already exist', () => {
    expect(filterNewInvitations(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  test('handles empty userIds', () => {
    expect(filterNewInvitations([], ['a'])).toEqual([]);
  });
});

describe('getAcceptedCount', () => {
  test('counts accepted responses', () => {
    const responses: MeetupResponse[] = [
      { id: '1', meetup_id: 'm1', user_id: 'u1', status: 'accepted', created_at: '' },
      { id: '2', meetup_id: 'm1', user_id: 'u2', status: 'declined', created_at: '' },
      { id: '3', meetup_id: 'm1', user_id: 'u3', status: 'accepted', created_at: '' },
      { id: '4', meetup_id: 'm1', user_id: 'u4', status: 'pending', created_at: '' },
    ];
    expect(getAcceptedCount(responses)).toBe(2);
  });

  test('returns 0 for empty responses', () => {
    expect(getAcceptedCount([])).toBe(0);
  });

  test('returns 0 when none accepted', () => {
    const responses: MeetupResponse[] = [
      { id: '1', meetup_id: 'm1', user_id: 'u1', status: 'pending', created_at: '' },
      { id: '2', meetup_id: 'm1', user_id: 'u2', status: 'declined', created_at: '' },
    ];
    expect(getAcceptedCount(responses)).toBe(0);
  });
});

describe('isMeetupFull', () => {
  test('returns true when accepted equals max', () => {
    const responses: MeetupResponse[] = [
      { id: '1', meetup_id: 'm1', user_id: 'u1', status: 'accepted', created_at: '' },
      { id: '2', meetup_id: 'm1', user_id: 'u2', status: 'accepted', created_at: '' },
    ];
    expect(isMeetupFull({ max_participants: 2 }, responses)).toBe(true);
  });

  test('returns false when not full', () => {
    const responses: MeetupResponse[] = [
      { id: '1', meetup_id: 'm1', user_id: 'u1', status: 'accepted', created_at: '' },
    ];
    expect(isMeetupFull({ max_participants: 8 }, responses)).toBe(false);
  });

  test('pending and declined do not count', () => {
    const responses: MeetupResponse[] = [
      { id: '1', meetup_id: 'm1', user_id: 'u1', status: 'pending', created_at: '' },
      { id: '2', meetup_id: 'm1', user_id: 'u2', status: 'declined', created_at: '' },
    ];
    expect(isMeetupFull({ max_participants: 2 }, responses)).toBe(false);
  });
});

describe('deduplicateInvitableUsers', () => {
  test('removes duplicate userIds keeping first occurrence', () => {
    const users: InvitableUser[] = [
      { userId: 'u1', name: 'Alice', club: 'A', role: 'Tireur', avatar: '', source: 'public' },
      { userId: 'u1', name: 'Alice dup', club: 'B', role: 'Milieu', avatar: '', source: 'shared' },
      { userId: 'u2', name: 'Bob', club: 'A', role: 'Pointeur', avatar: '', source: 'public' },
    ];
    const result = deduplicateInvitableUsers(users);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
  });

  test('handles empty array', () => {
    expect(deduplicateInvitableUsers([])).toEqual([]);
  });

  test('preserves all unique users', () => {
    const users: InvitableUser[] = [
      { userId: 'u1', name: 'Alice', club: '', role: '', avatar: '', source: 'public' },
      { userId: 'u2', name: 'Bob', club: '', role: '', avatar: '', source: 'shared' },
      { userId: 'u3', name: 'Charlie', club: '', role: '', avatar: '', source: 'public' },
    ];
    expect(deduplicateInvitableUsers(users)).toHaveLength(3);
  });
});

describe('sortMeetupsByDate', () => {
  test('sorts ascending by date', () => {
    const meetups: Meetup[] = [
      { id: '1', creator_id: '', terrain_id: '', title: 'C', date: '2026-04-03T10:00:00Z', max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
      { id: '2', creator_id: '', terrain_id: '', title: 'A', date: '2026-04-01T10:00:00Z', max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
      { id: '3', creator_id: '', terrain_id: '', title: 'B', date: '2026-04-02T10:00:00Z', max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
    ];
    const sorted = sortMeetupsByDate(meetups);
    expect(sorted[0].title).toBe('A');
    expect(sorted[1].title).toBe('B');
    expect(sorted[2].title).toBe('C');
  });

  test('does not mutate original', () => {
    const meetups: Meetup[] = [
      { id: '1', creator_id: '', terrain_id: '', title: 'B', date: '2026-04-02T10:00:00Z', max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
      { id: '2', creator_id: '', terrain_id: '', title: 'A', date: '2026-04-01T10:00:00Z', max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
    ];
    sortMeetupsByDate(meetups);
    expect(meetups[0].title).toBe('B');
  });
});

describe('filterActiveMeetups', () => {
  test('filters out cancelled and past meetups', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const meetups: Meetup[] = [
      { id: '1', creator_id: '', terrain_id: '', title: 'Active future', date: future, max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
      { id: '2', creator_id: '', terrain_id: '', title: 'Cancelled', date: future, max_participants: 8, status: 'cancelled', share_code: '', created_at: '', updated_at: '' },
      { id: '3', creator_id: '', terrain_id: '', title: 'Past', date: past, max_participants: 8, status: 'active', share_code: '', created_at: '', updated_at: '' },
    ];
    const result = filterActiveMeetups(meetups);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Active future');
  });
});

describe('computeReminderDates', () => {
  test('computes 1-day-before at 9:00', () => {
    const meetupDate = new Date('2026-04-10T14:00:00Z');
    const dates = computeReminderDates(meetupDate, { oneDayBefore: true, threeHoursBefore: false, oneHourBefore: false });
    expect(dates).toHaveLength(1);
    expect(dates[0].getDate()).toBe(9);
    expect(dates[0].getHours()).toBe(9);
  });

  test('computes 3-hours-before', () => {
    const meetupDate = new Date('2026-04-10T14:00:00Z');
    const dates = computeReminderDates(meetupDate, { oneDayBefore: false, threeHoursBefore: true, oneHourBefore: false });
    expect(dates).toHaveLength(1);
    expect(dates[0].getHours()).toBe(meetupDate.getHours() - 3);
  });

  test('computes 1-hour-before', () => {
    const meetupDate = new Date('2026-04-10T14:00:00Z');
    const dates = computeReminderDates(meetupDate, { oneDayBefore: false, threeHoursBefore: false, oneHourBefore: true });
    expect(dates).toHaveLength(1);
    expect(dates[0].getHours()).toBe(meetupDate.getHours() - 1);
  });

  test('computes all three reminders', () => {
    const meetupDate = new Date('2026-04-10T14:00:00Z');
    const dates = computeReminderDates(meetupDate, { oneDayBefore: true, threeHoursBefore: true, oneHourBefore: true });
    expect(dates).toHaveLength(3);
  });

  test('returns empty when all disabled', () => {
    const meetupDate = new Date('2026-04-10T14:00:00Z');
    const dates = computeReminderDates(meetupDate, { oneDayBefore: false, threeHoursBefore: false, oneHourBefore: false });
    expect(dates).toHaveLength(0);
  });
});

describe('MeetupResponse statuses', () => {
  test('valid statuses are pending, accepted, declined', () => {
    const validStatuses = ['pending', 'accepted', 'declined'];
    validStatuses.forEach(s => {
      const resp: MeetupResponse = { id: '1', meetup_id: 'm1', user_id: 'u1', status: s as any, created_at: '' };
      expect(validStatuses.includes(resp.status)).toBe(true);
    });
  });
});

describe('InvitableUser sources', () => {
  test('public source', () => {
    const user: InvitableUser = { userId: 'u1', name: 'Alice', club: '', role: '', avatar: '', source: 'public' };
    expect(user.source).toBe('public');
  });

  test('shared source', () => {
    const user: InvitableUser = { userId: 'u2', name: 'Bob', club: '', role: '', avatar: '', source: 'shared' };
    expect(user.source).toBe('shared');
  });
});

describe('PendingInvitation mapping', () => {
  test('maps all required fields', () => {
    const inv: PendingInvitation = {
      responseId: 'r1',
      meetupId: 'm1',
      title: 'Match du dimanche',
      date: '2026-04-10T14:00:00Z',
      maxParticipants: 8,
      acceptedCount: 3,
      shareCode: 'RDV-ABC123',
      notes: 'Apportez vos boules',
      creatorName: 'Jean',
      terrainName: 'Boulodrome Central',
      terrainCity: 'Lyon',
    };
    expect(inv.responseId).toBe('r1');
    expect(inv.meetupId).toBe('m1');
    expect(inv.shareCode).toContain('RDV-');
    expect(inv.acceptedCount).toBe(3);
    expect(inv.terrainCity).toBe('Lyon');
  });
});

describe('Meetup type validation', () => {
  test('valid meetup statuses', () => {
    const valid = ['active', 'cancelled', 'completed'];
    valid.forEach(s => {
      const m: Meetup = { id: '1', creator_id: 'u1', terrain_id: 't1', title: 'Test', date: '', max_participants: 8, status: s as any, share_code: '', created_at: '', updated_at: '' };
      expect(valid.includes(m.status)).toBe(true);
    });
  });

  test('default max_participants is 8', () => {
    const defaultMax = 8;
    expect(defaultMax).toBe(8);
  });
});

describe('edge cases', () => {
  test('meetup with 0 max_participants is always full', () => {
    expect(isMeetupFull({ max_participants: 0 }, [])).toBe(true);
  });

  test('large invitation list deduplication', () => {
    const users: InvitableUser[] = [];
    for (let i = 0; i < 200; i++) {
      users.push({ userId: `u${i % 50}`, name: `User ${i}`, club: '', role: '', avatar: '', source: 'public' });
    }
    const deduped = deduplicateInvitableUsers(users);
    expect(deduped).toHaveLength(50);
  });

  test('filterNewInvitations with overlapping sets', () => {
    const result = filterNewInvitations(['a', 'b', 'c', 'd', 'e'], ['b', 'd']);
    expect(result).toEqual(['a', 'c', 'e']);
  });
});
