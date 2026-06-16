/**
 * E2E Integration Test — Meetup Full Flow
 *
 * Simulates the complete meetup lifecycle:
 *   1. User A creates a meetup on a terrain
 *   2. Auto-accept response for creator
 *   3. User B joins via share code
 *   4. User C is invited directly
 *   5. User C accepts, User D declines
 *   6. Participant count is correct
 *   7. Creator cancels the meetup
 *   8. Invitation listing and filtering
 *
 * All external dependencies (supabase, notifications, push) are mocked.
 */

// ─── In-memory DB ──────────────────────────────────────────

const memDB: Record<string, any[]> = {
  terrain_meetups: [],
  terrain_meetup_responses: [],
  user_profiles: [],
  players: [],
  terrains: [],
  shared_items: [],
  push_tokens: [],
};

let currentUserId = 'user-a';

function resetMemDB() {
  Object.keys(memDB).forEach(k => { memDB[k] = []; });
  memDB.user_profiles = [
    { id: 'user-a', username: 'Alice', email: 'alice@test.com', is_admin: false },
    { id: 'user-b', username: 'Bob', email: 'bob@test.com', is_admin: false },
    { id: 'user-c', username: 'Charlie', email: 'charlie@test.com', is_admin: false },
    { id: 'user-d', username: 'Diana', email: 'diana@test.com', is_admin: false },
  ];
  memDB.terrains = [
    { id: 'ter-1', user_id: 'user-a', name: 'Boulodrome Central', city: 'Lyon', type: 'Sable', is_public: true, public_access: true },
  ];
  memDB.players = [
    { id: 'player-b', user_id: 'user-b', name: 'Bob', is_public: true, role: 'Milieu', club: '', avatar: '' },
    { id: 'player-c', user_id: 'user-c', name: 'Charlie', is_public: true, role: 'Tireur', club: '', avatar: '' },
    { id: 'player-d', user_id: 'user-d', name: 'Diana', is_public: false, role: 'Pointeur', club: '', avatar: '' },
  ];
}

// ─── Supabase mock ──────────────────────────────────────────

function buildQueryChain(table: string) {
  let filters: Record<string, any> = {};
  let inFilters: Record<string, any[]> = {};
  let neqFilters: Record<string, any> = {};
  let gteFilters: Record<string, string> = {};
  let limitN: number | null = null;
  let orderCol: string | null = null;
  let orderDir: boolean = true;
  let countMode = false;
  let headMode = false;
  let isMaybeSingle = false;

  const chain: any = {
    select(cols?: string, opts?: any) {
      if (opts?.count === 'exact') countMode = true;
      if (opts?.head) headMode = true;
      return chain;
    },
    eq(col: string, val: any) { filters[col] = val; return chain; },
    neq(col: string, val: any) { neqFilters[col] = val; return chain; },
    in(col: string, vals: any[]) { inFilters[col] = vals; return chain; },
    gte(col: string, val: string) { gteFilters[col] = val; return chain; },
    order(col: string, opts?: any) { orderCol = col; orderDir = opts?.ascending ?? true; return chain; },
    limit(n: number) { limitN = n; return chain; },

    single() {
      const rows = resolve();
      const row = rows[0] || null;
      return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } });
    },

    maybeSingle() {
      isMaybeSingle = true;
      const rows = resolve();
      return Promise.resolve({ data: rows[0] || null, error: null });
    },

    insert(payload: any) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const inserted = rows.map((r: any) => ({
        ...r,
        id: r.id || `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      memDB[table] = [...(memDB[table] || []), ...inserted];
      return {
        select: (cols?: string) => ({
          single: () => Promise.resolve({ data: inserted[0], error: null }),
          then: (res: any) => res({ data: inserted, error: null }),
        }),
        then: (res: any) => res({ data: inserted, error: null }),
      };
    },

    upsert(payload: any, opts?: any) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const conflictKeys = opts?.onConflict?.split(',').map((k: string) => k.trim()) || [];
      for (const r of rows) {
        const existingIdx = (memDB[table] || []).findIndex((existing: any) =>
          conflictKeys.length > 0 && conflictKeys.every((k: string) => existing[k] === r[k])
        );
        const newRow = {
          ...r,
          id: r.id || `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          memDB[table][existingIdx] = { ...memDB[table][existingIdx], ...newRow };
        } else {
          memDB[table].push(newRow);
        }
      }
      return Promise.resolve({ data: null, error: null });
    },

    update(payload: any) {
      return {
        eq: (col: string, val: any) => {
          const tbl = memDB[table] || [];
          for (let i = 0; i < tbl.length; i++) {
            if (tbl[i][col] === val) {
              tbl[i] = { ...tbl[i], ...payload, updated_at: new Date().toISOString() };
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },

    delete() {
      return {
        eq: (col: string, val: any) => {
          memDB[table] = (memDB[table] || []).filter((r: any) => r[col] !== val);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },

    then(res: any) {
      if (countMode && headMode) {
        const rows = resolve();
        return res({ count: rows.length, error: null });
      }
      const rows = resolve();
      res({ data: rows, error: null });
    },
  };

  function resolve(): any[] {
    let rows = [...(memDB[table] || [])];
    Object.entries(filters).forEach(([k, v]) => {
      rows = rows.filter(r => r[k] === v);
    });
    Object.entries(inFilters).forEach(([k, vals]) => {
      rows = rows.filter(r => vals.includes(r[k]));
    });
    Object.entries(neqFilters).forEach(([k, v]) => {
      rows = rows.filter(r => r[k] !== v);
    });
    Object.entries(gteFilters).forEach(([k, val]) => {
      rows = rows.filter(r => r[k] >= val);
    });
    if (orderCol) {
      rows.sort((a: any, b: any) => {
        const va = a[orderCol!] ?? '';
        const vb = b[orderCol!] ?? '';
        return orderDir ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
    }
    if (limitN) rows = rows.slice(0, limitN);
    return rows;
  }

  return chain;
}

const mockSupabase = {
  from: (table: string) => buildQueryChain(table),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: currentUserId, email: `${currentUserId}@test.com` } } }),
  },
};

// ─── Module mocks ──────────────────────────────────────────

jest.mock('@/template', () => ({
  getSupabaseClient: () => mockSupabase,
  useAuth: () => ({ user: { id: currentUserId, email: `${currentUserId}@test.com` } }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (opts: any) => opts.web ?? opts.default },
}));

jest.mock('@/services/nativeNotifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('@/services/pushTokenService', () => ({
  triggerServerPush: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ─────────────────────────────────

import {
  createMeetup,
  getMyMeetups,
  getInvitedMeetups,
  findMeetupByCode,
  respondToMeetup,
  getMeetupResponses,
  cancelMeetup,
  deleteMeetup,
  inviteUsersToMeetup,
  getInvitableUsers,
  getMyActiveMeetups,
  getPendingInvitationsCount,
} from '@/services/meetupService';

// ─── Tests ─────────────────────────────────────────────────

beforeEach(() => {
  resetMemDB();
  currentUserId = 'user-a';
  jest.clearAllMocks();
});

// ============================================
// Phase 1: Meetup Creation
// ============================================

describe('Phase 1 — Meetup Creation', () => {
  it('creator creates a meetup and it is persisted', async () => {
    const { meetup, error } = await createMeetup({
      terrainId: 'ter-1',
      title: 'Sunday Game',
      date: '2026-04-05T14:00:00Z',
      maxParticipants: 6,
      notes: 'Bring your boules!',
    });

    expect(error).toBeNull();
    expect(meetup).toBeTruthy();
    expect(meetup!.title).toBe('Sunday Game');
    expect(meetup!.terrain_id).toBe('ter-1');
    expect(meetup!.max_participants).toBe(6);
    expect(meetup!.share_code).toMatch(/^RDV-[A-Z0-9]{6}$/);
    expect(meetup!.status).toBe('active');

    // Verify in DB
    expect(memDB.terrain_meetups).toHaveLength(1);
  });

  it('auto-accepts creator as participant', async () => {
    const { meetup } = await createMeetup({
      terrainId: 'ter-1',
      title: 'Test',
      date: '2026-04-05T14:00:00Z',
    });

    // Creator should have an accepted response
    const creatorResponse = memDB.terrain_meetup_responses.find(
      (r: any) => r.meetup_id === meetup!.id && r.user_id === 'user-a'
    );
    expect(creatorResponse).toBeTruthy();
    expect(creatorResponse.status).toBe('accepted');
  });

  it('uses default maxParticipants of 8 when not specified', async () => {
    const { meetup } = await createMeetup({
      terrainId: 'ter-1',
      title: 'Default Max',
      date: '2026-04-05T14:00:00Z',
    });
    expect(meetup!.max_participants).toBe(8);
  });

  it('generates unique share codes for different meetups', async () => {
    const { meetup: m1 } = await createMeetup({ terrainId: 'ter-1', title: 'M1', date: '2026-04-05T14:00:00Z' });
    const { meetup: m2 } = await createMeetup({ terrainId: 'ter-1', title: 'M2', date: '2026-04-06T14:00:00Z' });
    expect(m1!.share_code).not.toBe(m2!.share_code);
  });
});

// ============================================
// Phase 2: Find by Share Code
// ============================================

describe('Phase 2 — Find by Share Code', () => {
  let shareCode: string;

  beforeEach(async () => {
    const { meetup } = await createMeetup({ terrainId: 'ter-1', title: 'Coded Game', date: '2026-04-05T14:00:00Z' });
    shareCode = meetup!.share_code;
  });

  it('finds meetup by exact share code', async () => {
    const { meetup, error } = await findMeetupByCode(shareCode);
    expect(error).toBeNull();
    expect(meetup).toBeTruthy();
    expect(meetup!.title).toBe('Coded Game');
  });

  it('share code lookup is case-insensitive', async () => {
    const { meetup } = await findMeetupByCode(shareCode.toLowerCase());
    expect(meetup).toBeTruthy();
  });

  it('returns error for invalid code', async () => {
    const { meetup, error } = await findMeetupByCode('INVALID-CODE');
    expect(meetup).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ============================================
// Phase 3: Join & Respond
// ============================================

describe('Phase 3 — Respond to Meetup', () => {
  let meetupId: string;

  beforeEach(async () => {
    const { meetup } = await createMeetup({ terrainId: 'ter-1', title: 'Join Test', date: '2026-04-05T14:00:00Z' });
    meetupId = meetup!.id;
  });

  it('User B accepts a meetup', async () => {
    currentUserId = 'user-b';
    const { error } = await respondToMeetup(meetupId, 'accepted');
    expect(error).toBeNull();

    const response = memDB.terrain_meetup_responses.find(
      (r: any) => r.meetup_id === meetupId && r.user_id === 'user-b'
    );
    expect(response).toBeTruthy();
    expect(response.status).toBe('accepted');
  });

  it('User C declines a meetup', async () => {
    currentUserId = 'user-c';
    const { error } = await respondToMeetup(meetupId, 'declined');
    expect(error).toBeNull();

    const response = memDB.terrain_meetup_responses.find(
      (r: any) => r.meetup_id === meetupId && r.user_id === 'user-c'
    );
    expect(response.status).toBe('declined');
  });

  it('response can be changed from declined to accepted', async () => {
    currentUserId = 'user-b';
    await respondToMeetup(meetupId, 'declined');
    await respondToMeetup(meetupId, 'accepted');

    const responses = memDB.terrain_meetup_responses.filter(
      (r: any) => r.meetup_id === meetupId && r.user_id === 'user-b'
    );
    // Upsert should result in one record
    expect(responses.length).toBe(1);
    expect(responses[0].status).toBe('accepted');
  });
});

// ============================================
// Phase 4: Participant Counting
// ============================================

describe('Phase 4 — Participant Counting', () => {
  let meetupId: string;

  beforeEach(async () => {
    const { meetup } = await createMeetup({ terrainId: 'ter-1', title: 'Count Test', date: '2026-04-05T14:00:00Z' });
    meetupId = meetup!.id;
    // User B accepts
    currentUserId = 'user-b';
    await respondToMeetup(meetupId, 'accepted');
    // User C accepts
    currentUserId = 'user-c';
    await respondToMeetup(meetupId, 'accepted');
    // User D declines
    currentUserId = 'user-d';
    await respondToMeetup(meetupId, 'declined');
    currentUserId = 'user-a';
  });

  it('getMeetupResponses returns all responses', async () => {
    const { responses, error } = await getMeetupResponses(meetupId);
    expect(error).toBeNull();
    // creator (auto-accepted) + B (accepted) + C (accepted) + D (declined) = 4
    expect(responses.length).toBe(4);
  });

  it('accepted count is correct', async () => {
    const { responses } = await getMeetupResponses(meetupId);
    const acceptedCount = responses.filter((r: any) => r.status === 'accepted').length;
    expect(acceptedCount).toBe(3); // A + B + C
  });

  it('declined count is correct', async () => {
    const { responses } = await getMeetupResponses(meetupId);
    const declinedCount = responses.filter((r: any) => r.status === 'declined').length;
    expect(declinedCount).toBe(1); // D only
  });
});

// ============================================
// Phase 5: Direct Invitation
// ============================================

describe('Phase 5 — Direct Invitation', () => {
  let meetupId: string;

  beforeEach(async () => {
    const { meetup } = await createMeetup({ terrainId: 'ter-1', title: 'Invite Test', date: '2026-04-05T14:00:00Z' });
    meetupId = meetup!.id;
  });

  it('invites multiple users at once', async () => {
    const { invited, error } = await inviteUsersToMeetup(meetupId, ['user-b', 'user-c']);
    expect(error).toBeNull();
    expect(invited).toBe(2);

    const pendingResponses = memDB.terrain_meetup_responses.filter(
      (r: any) => r.meetup_id === meetupId && r.status === 'pending'
    );
    expect(pendingResponses.length).toBe(2);
  });

  it('does not re-invite existing participants', async () => {
    // First invite
    await inviteUsersToMeetup(meetupId, ['user-b']);
    // Try to invite again
    const { invited } = await inviteUsersToMeetup(meetupId, ['user-b']);
    expect(invited).toBe(0);
  });

  it('handles empty user list gracefully', async () => {
    const { invited, error } = await inviteUsersToMeetup(meetupId, []);
    expect(error).toBeNull();
    expect(invited).toBe(0);
  });

  it('pending invitations count reflects new invitations', async () => {
    await inviteUsersToMeetup(meetupId, ['user-c', 'user-d']);
    currentUserId = 'user-c';
    const count = await getPendingInvitationsCount();
    expect(count).toBe(1);
  });
});

// ============================================
// Phase 6: Meetup Cancellation
// ============================================

describe('Phase 6 — Cancellation & Deletion', () => {
  let meetupId: string;

  beforeEach(async () => {
    const { meetup } = await createMeetup({ terrainId: 'ter-1', title: 'Cancel Test', date: '2026-04-05T14:00:00Z' });
    meetupId = meetup!.id;
  });

  it('cancelMeetup changes status to cancelled', async () => {
    const { error } = await cancelMeetup(meetupId);
    expect(error).toBeNull();

    const meetup = memDB.terrain_meetups.find((m: any) => m.id === meetupId);
    expect(meetup.status).toBe('cancelled');
  });

  it('cancelled meetup no longer found by share code', async () => {
    const meetup = memDB.terrain_meetups.find((m: any) => m.id === meetupId);
    const code = meetup.share_code;
    await cancelMeetup(meetupId);

    const { meetup: found } = await findMeetupByCode(code);
    expect(found).toBeNull();
  });

  it('deleteMeetup removes from DB entirely', async () => {
    await deleteMeetup(meetupId);
    expect(memDB.terrain_meetups.find((m: any) => m.id === meetupId)).toBeUndefined();
  });
});

// ============================================
// Phase 7: My Meetups & Invited Meetups
// ============================================

describe('Phase 7 — Listing Meetups', () => {
  beforeEach(async () => {
    await createMeetup({ terrainId: 'ter-1', title: 'My Game 1', date: '2026-04-05T14:00:00Z' });
    await createMeetup({ terrainId: 'ter-1', title: 'My Game 2', date: '2026-04-06T14:00:00Z' });
  });

  it('getMyMeetups returns meetups created by current user', async () => {
    const { meetups, error } = await getMyMeetups();
    expect(error).toBeNull();
    expect(meetups.length).toBe(2);
    expect(meetups.every((m: any) => m.creator_id === 'user-a')).toBe(true);
  });

  it('getMyMeetups returns empty for user with no meetups', async () => {
    currentUserId = 'user-d';
    const { meetups } = await getMyMeetups();
    expect(meetups.length).toBe(0);
  });

  it('getInvitedMeetups returns meetups user has responded to', async () => {
    const meetup = memDB.terrain_meetups[0];
    currentUserId = 'user-b';
    await respondToMeetup(meetup.id, 'accepted');

    const { meetups } = await getInvitedMeetups();
    expect(meetups.length).toBe(1);
    expect(meetups[0].title).toBe('My Game 1');
  });

  it('getMyActiveMeetups filters only active future meetups', async () => {
    // Add a past meetup
    memDB.terrain_meetups.push({
      id: 'past-meetup',
      creator_id: 'user-a',
      terrain_id: 'ter-1',
      title: 'Past Game',
      date: '2020-01-01T14:00:00Z',
      max_participants: 8,
      status: 'active',
      share_code: 'RDV-PAST01',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { meetups } = await getMyActiveMeetups();
    // Should only include future meetups
    expect(meetups.every((m: any) => new Date(m.date) >= new Date())).toBe(true);
  });
});

// ============================================
// Phase 8: Invitable Users
// ============================================

describe('Phase 8 — Invitable Users', () => {
  it('returns public players excluding self', async () => {
    const { users, error } = await getInvitableUsers();
    expect(error).toBeNull();
    // user-b (public) and user-c (public) should be returned, not user-d (not public) or user-a (self)
    expect(users.some((u: any) => u.userId === 'user-b')).toBe(true);
    expect(users.some((u: any) => u.userId === 'user-c')).toBe(true);
    expect(users.some((u: any) => u.userId === 'user-a')).toBe(false);
  });

  it('includes users from shared items', async () => {
    // Add a shared item from user-d to user-a
    memDB.shared_items.push({
      id: 'si-1',
      owner_id: 'user-d',
      shared_with_id: 'user-a',
      item_type: 'player',
      item_id: 'player-d',
      share_code: 'SHARE1',
      permission: 'read',
      is_public_link: false,
    });

    const { users } = await getInvitableUsers();
    expect(users.some((u: any) => u.userId === 'user-d')).toBe(true);
  });
});

// ============================================
// Phase 9: Complete E2E Flow
// ============================================

describe('Phase 9 — Full E2E Lifecycle', () => {
  it('create → invite → accept → count → cancel', async () => {
    // Step 1: User A creates meetup
    currentUserId = 'user-a';
    const { meetup } = await createMeetup({
      terrainId: 'ter-1',
      title: 'Weekend Petanque',
      date: '2026-04-10T15:00:00Z',
      maxParticipants: 8,
      notes: 'Terrain 3, near the fountain',
    });
    expect(meetup).toBeTruthy();
    const meetupId = meetup!.id;
    const shareCode = meetup!.share_code;

    // Step 2: User B finds via share code and accepts
    currentUserId = 'user-b';
    const { meetup: found } = await findMeetupByCode(shareCode);
    expect(found!.title).toBe('Weekend Petanque');
    await respondToMeetup(meetupId, 'accepted');

    // Step 3: User A invites User C and User D
    currentUserId = 'user-a';
    const { invited } = await inviteUsersToMeetup(meetupId, ['user-c', 'user-d']);
    expect(invited).toBe(2);

    // Step 4: User C accepts, User D declines
    currentUserId = 'user-c';
    await respondToMeetup(meetupId, 'accepted');
    currentUserId = 'user-d';
    await respondToMeetup(meetupId, 'declined');

    // Step 5: Verify participant counts
    currentUserId = 'user-a';
    const { responses } = await getMeetupResponses(meetupId);
    const accepted = responses.filter((r: any) => r.status === 'accepted').length;
    const declined = responses.filter((r: any) => r.status === 'declined').length;
    expect(accepted).toBe(3); // A (auto) + B + C
    expect(declined).toBe(1); // D

    // Step 6: User A cancels
    const { error: cancelError } = await cancelMeetup(meetupId);
    expect(cancelError).toBeNull();

    const updatedMeetup = memDB.terrain_meetups.find((m: any) => m.id === meetupId);
    expect(updatedMeetup.status).toBe('cancelled');

    // Step 7: Share code no longer works
    const { meetup: afterCancel } = await findMeetupByCode(shareCode);
    expect(afterCancel).toBeNull();
  });
});
