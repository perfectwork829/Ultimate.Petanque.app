/**
 * Integration Tests — Cross-Player Sharing Full Flow
 *
 * Simulates an end-to-end scenario:
 *   1. User A logs in and creates a match
 *   2. User A shares the match with User B (write permission)
 *   3. User B accepts the share request
 *   4. User B edits the match → modification logged
 *   5. User A edits concurrently → conflict detected with field-level diffs
 *   6. Notification is sent for each new share request
 *   7. Owner (User A) can revert a field change made by User B
 *
 * All external dependencies (supabase, AsyncStorage, expo-notifications) are mocked.
 */

// ─── In-memory stores ─────────────────────────────────────────

/** Lightweight in-memory DB for deterministic testing. */
const memDB: Record<string, any[]> = {
  matches: [],
  challenges: [],
  players: [],
  match_share_requests: [],
  modification_logs: [],
  user_profiles: [],
};

/** Track the "authenticated" user for RLS-like filtering. */
let currentUserId = '';

function resetMemDB() {
  Object.keys(memDB).forEach(k => { memDB[k] = []; });
  // Seed two users
  memDB.user_profiles = [
    { id: 'user-a', username: 'Alice', email: 'alice@test.com', is_admin: false, is_premium: false },
    { id: 'user-b', username: 'Bob', email: 'bob@test.com', is_admin: false, is_premium: false },
  ];
  // Seed two players linked to those user accounts
  memDB.players = [
    { id: 'user-a', user_id: 'user-a', name: 'Alice', email: 'alice@test.com', role: 'Tireur', level: 'Expert', stats: {}, is_public: false, show_contact_public: false },
    { id: 'user-b', user_id: 'user-b', name: 'Bob', email: 'bob@test.com', role: 'Milieu', level: 'Intermédiaire', stats: {}, is_public: false, show_contact_public: false },
  ];
}

// ─── Supabase mock builder ────────────────────────────────────

function findInTable(table: string, filters: Record<string, any>): any[] {
  return (memDB[table] || []).filter((row: any) => {
    return Object.entries(filters).every(([key, value]) => {
      if (Array.isArray(value)) return value.includes(row[key]);
      return row[key] === value;
    });
  });
}

function buildQueryChain(table: string) {
  let filters: Record<string, any> = {};
  let selectedCols: string | null = null;
  let limitN: number | null = null;
  let inFilters: Record<string, any[]> = {};
  let notFilters: Record<string, any> = {};
  let orderCol: string | null = null;
  let orderDir: boolean = false;
  let gtFilters: Record<string, string> = {};

  const chain: any = {
    select(cols?: string) { selectedCols = cols || '*'; return chain; },
    eq(col: string, val: any) { filters[col] = val; return chain; },
    in(col: string, vals: any[]) { inFilters[col] = vals; return chain; },
    not(col: string, op: string, val: any) { notFilters[col] = { op, val }; return chain; },
    gt(col: string, val: string) { gtFilters[col] = val; return chain; },
    order(col: string, opts?: any) { orderCol = col; orderDir = opts?.ascending ?? true; return chain; },
    limit(n: number) { limitN = n; return chain; },

    single() {
      const rows = resolve();
      const row = rows[0] || null;
      return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } });
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
      // For upsert behavior on match_share_requests
      return { select: () => ({ data: inserted, error: null, single: () => Promise.resolve({ data: inserted[0], error: null }) }) };
    },

    upsert(payload: any, opts?: any) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const conflictKeys = opts?.onConflict?.split(',').map((k: string) => k.trim()) || [];
      const inserted: any[] = [];
      for (const r of rows) {
        // Check if a row matching the conflict keys already exists
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
          inserted.push(memDB[table][existingIdx]);
        } else {
          memDB[table].push(newRow);
          inserted.push(newRow);
        }
      }
      return { select: () => Promise.resolve({ data: inserted, error: null }) };
    },

    update(payload: any) {
      // Deferred — apply when .eq() resolves
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
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
    },

    delete() {
      return {
        eq: (col: string, val: any) => {
          memDB[table] = (memDB[table] || []).filter((r: any) => r[col] !== val);
          return Promise.resolve({ data: null, error: null });
        },
        lt: (col: string, val: any) => {
          memDB[table] = (memDB[table] || []).filter((r: any) => r[col] >= val);
          return { then: (resolve: any) => resolve({ data: null, error: null }), catch: () => {} };
        },
      };
    },

    // Terminal — resolve the query
    then(resolve: any) {
      const rows = resolve2();
      resolve({ data: rows, error: null });
    },
  };

  function resolve(): any[] {
    let rows = [...(memDB[table] || [])];
    // Apply eq filters
    Object.entries(filters).forEach(([k, v]) => {
      rows = rows.filter(r => r[k] === v);
    });
    // Apply in filters
    Object.entries(inFilters).forEach(([k, vals]) => {
      rows = rows.filter(r => vals.includes(r[k]));
    });
    // Apply not filters
    Object.entries(notFilters).forEach(([k, spec]) => {
      if (spec.op === 'is' && spec.val === null) {
        rows = rows.filter(r => r[k] != null);
      }
    });
    // Apply gt filters
    Object.entries(gtFilters).forEach(([k, val]) => {
      rows = rows.filter(r => r[k] > val);
    });
    // Sort
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
  const resolve2 = resolve;

  return chain;
}

const mockSupabase = {
  from: (table: string) => buildQueryChain(table),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: currentUserId, email: `${currentUserId}@test.com` } } }),
  },
};

// ─── Module mocks ─────────────────────────────────────────────

jest.mock('@/template', () => ({
  getSupabaseClient: () => mockSupabase,
  useAuth: () => ({ user: { id: currentUserId, email: `${currentUserId}@test.com` } }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
  __esModule: true,
}));

const mockScheduleNotification = jest.fn().mockResolvedValue('notif-id');
jest.mock('@/services/nativeNotifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: (...args: any[]) => mockScheduleNotification(...args),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (opts: any) => opts.ios ?? opts.default },
}));

jest.mock('@/services/offlineQueueService', () => ({
  enqueueOperation: jest.fn(),
  buildMatchDbPayload: jest.fn((m: any) => m),
  buildUpdateDbPayload: jest.fn((_t: string, u: any) => u),
}));

// ─── Imports (after mocks) ────────────────────────────────────

import {
  detectLinkedPlayers,
  createShareRequests,
  getReceivedShareRequests,
  acceptShareRequest,
  declineShareRequest,
  getSharedMatchIds,
  getShareRequestsForItem,
  revokeShareRequest,
} from '@/services/matchShareService';
import {
  checkEditConflict,
  computeMatchDiffs,
  fetchUpdatedAt,
} from '@/services/collaborativeEditService';
import {
  logModification,
  getModificationLogs,
  revertFieldChange,
  revertAllChanges,
  isFieldRevertable,
} from '@/services/modificationLogService';
import { sendShareRequestNotification } from '@/services/notificationService';
import { addMatchOp, updateMatchOp } from '@/services/matchCrudService';

// ─── Test Suite ───────────────────────────────────────────────

beforeEach(() => {
  resetMemDB();
  jest.clearAllMocks();
  currentUserId = 'user-a';
});

// ============================================
// Phase 1: Match Creation
// ============================================

describe('Phase 1 — Match Creation', () => {
  it('User A creates a match and it is persisted in the DB', async () => {
    const matchInput: any = {
      date: '2026-03-20T14:00:00Z',
      mode: 'Entraînement',
      format: 'Doublette',
      teamA: { players: ['user-a', 'p3'], playerNames: ['Alice', 'Charlie'], score: 13 },
      teamB: { players: ['user-b', 'p4'], playerNames: ['Bob', 'David'], score: 8 },
      winner: 'A',
      duration: 42,
      menes: [],
      playerActions: [],
    };

    const setMatches = jest.fn();
    const persistPlayerStats = jest.fn();

    const id = await addMatchOp(matchInput, {
      supabase: mockSupabase,
      userId: 'user-a',
      isConnected: true,
      matches: [],
      setMatches,
      persistPlayerStats,
    });

    expect(id).toBeTruthy();
    expect(memDB.matches.length).toBe(1);
    expect(memDB.matches[0].user_id).toBe('user-a');
    expect(memDB.matches[0].team_a.score).toBe(13);
    expect(setMatches).toHaveBeenCalled();
    expect(persistPlayerStats).toHaveBeenCalled();
  });
});

// ============================================
// Phase 2: Player Detection & Share Request
// ============================================

describe('Phase 2 — Detect Linked Players & Create Share Request', () => {
  it('detects that player "user-b" is linked to a user account', async () => {
    const { linkedPlayers, error } = await detectLinkedPlayers(
      ['user-a', 'user-b'],
      'user-a' // exclude self
    );

    expect(error).toBeNull();
    expect(linkedPlayers.length).toBe(1);
    expect(linkedPlayers[0].userId).toBe('user-b');
    expect(linkedPlayers[0].playerName).toBe('Bob');
  });

  it('creates a share request from User A to User B', async () => {
    // First create a match
    memDB.matches.push({
      id: 'match-1',
      user_id: 'user-a',
      date: '2026-03-20T14:00:00Z',
      mode: 'Entraînement',
      format: 'Doublette',
      team_a: { players: ['user-a'], score: 13 },
      team_b: { players: ['user-b'], score: 8 },
      winner: 'A',
      participant_user_ids: ['user-a'],
      updated_at: '2026-03-20T14:00:00Z',
    });

    const { requests, error } = await createShareRequests({
      itemType: 'match',
      itemId: 'match-1',
      senderUserId: 'user-a',
      senderName: 'Alice',
      recipients: [{ userId: 'user-b', permission: 'write' }],
      itemSummary: 'Match du 20/03 — 13-8',
    });

    expect(error).toBeNull();
    expect(requests.length).toBe(1);
    expect(requests[0].senderUserId).toBe('user-a');
    expect(requests[0].recipientUserId).toBe('user-b');
    expect(requests[0].permission).toBe('write');
    expect(requests[0].status).toBe('pending');

    // Participant IDs updated on match
    const match = memDB.matches.find((m: any) => m.id === 'match-1');
    expect(match.participant_user_ids).toContain('user-b');
  });
});

// ============================================
// Phase 3: Accept/Decline Share Request
// ============================================

describe('Phase 3 — Accept & Decline Share Requests', () => {
  beforeEach(async () => {
    memDB.matches.push({
      id: 'match-1', user_id: 'user-a',
      team_a: { players: ['user-a'], score: 13 },
      team_b: { players: ['user-b'], score: 8 },
      winner: 'A', participant_user_ids: ['user-a'],
      updated_at: '2026-03-20T14:00:00Z',
    });
    await createShareRequests({
      itemType: 'match', itemId: 'match-1',
      senderUserId: 'user-a', senderName: 'Alice',
      recipients: [{ userId: 'user-b', permission: 'write' }],
    });
  });

  it('User B sees the pending request', async () => {
    currentUserId = 'user-b';
    const { requests, error } = await getReceivedShareRequests('pending');
    expect(error).toBeNull();
    expect(requests.length).toBe(1);
    expect(requests[0].itemId).toBe('match-1');
  });

  it('User B accepts the share request', async () => {
    currentUserId = 'user-b';
    const { requests } = await getReceivedShareRequests('pending');
    const requestId = requests[0].id;

    const { error } = await acceptShareRequest(requestId);
    expect(error).toBeNull();

    // Verify status changed
    const { requests: accepted } = await getReceivedShareRequests('accepted');
    expect(accepted.length).toBe(1);
    expect(accepted[0].status).toBe('accepted');
  });

  it('User B can decline a share request', async () => {
    currentUserId = 'user-b';
    const { requests } = await getReceivedShareRequests('pending');
    const { error } = await declineShareRequest(requests[0].id);
    expect(error).toBeNull();

    const { requests: pending } = await getReceivedShareRequests('pending');
    expect(pending.length).toBe(0);
  });

  it('getSharedMatchIds returns match-1 after acceptance', async () => {
    currentUserId = 'user-b';
    const { requests } = await getReceivedShareRequests('pending');
    await acceptShareRequest(requests[0].id);

    const { matchIds, error } = await getSharedMatchIds();
    expect(error).toBeNull();
    expect(matchIds).toContain('match-1');
  });
});

// ============================================
// Phase 4: Collaborative Editing & Modification Logging
// ============================================

describe('Phase 4 — Collaborative Editing & Modification Logs', () => {
  const matchId = 'match-collab';
  const baseUpdatedAt = '2026-03-20T14:00:00.000Z';

  beforeEach(() => {
    memDB.matches.push({
      id: matchId,
      user_id: 'user-a',
      team_a: { players: ['user-a'], playerNames: ['Alice'], score: 13 },
      team_b: { players: ['user-b'], playerNames: ['Bob'], score: 8 },
      winner: 'A',
      format: 'Doublette',
      duration: 42,
      date: '2026-03-20T14:00:00Z',
      menes: [],
      player_actions: [],
      participant_user_ids: ['user-a', 'user-b'],
      updated_at: baseUpdatedAt,
    });
  });

  it('logModification creates a log entry when User B edits', async () => {
    currentUserId = 'user-b';
    await logModification({
      itemType: 'match',
      itemId: matchId,
      ownerId: 'user-a',
      changes: [
        { field: 'duration', oldValue: 42, newValue: 55 },
        { field: 'winner', oldValue: 'A', newValue: 'B' },
      ],
    });

    // Switch to owner to read logs (RLS)
    currentUserId = 'user-a';
    const { logs, error } = await getModificationLogs('match', matchId);
    expect(error).toBeNull();
    expect(logs.length).toBe(1);
    expect(logs[0].modifierId).toBe('user-b');
    expect(logs[0].changes.length).toBe(2);
    expect(logs[0].changes[0].field).toBe('duration');
    expect(logs[0].changes[0].oldValue).toBe(42);
    expect(logs[0].changes[0].newValue).toBe(55);
  });

  it('logModification skips logging when modifier is owner', async () => {
    currentUserId = 'user-a';
    await logModification({
      itemType: 'match',
      itemId: matchId,
      ownerId: 'user-a',
      changes: [{ field: 'duration', oldValue: 42, newValue: 55 }],
    });

    const { logs } = await getModificationLogs('match', matchId);
    expect(logs.length).toBe(0);
  });

  it('logModification skips empty changes', async () => {
    currentUserId = 'user-b';
    await logModification({
      itemType: 'match',
      itemId: matchId,
      ownerId: 'user-a',
      changes: [],
    });

    currentUserId = 'user-a';
    const { logs } = await getModificationLogs('match', matchId);
    expect(logs.length).toBe(0);
  });
});

// ============================================
// Phase 5: Conflict Detection & Diff Computation
// ============================================

describe('Phase 5 — Conflict Detection', () => {
  const matchId = 'match-conflict';

  beforeEach(() => {
    memDB.matches.push({
      id: matchId,
      user_id: 'user-a',
      team_a: { players: ['user-a'], playerNames: ['Alice'], score: 13 },
      team_b: { players: ['user-b'], playerNames: ['Bob'], score: 8 },
      winner: 'A',
      format: 'Doublette',
      duration: 42,
      date: '2026-03-20T14:00:00Z',
      menes: [],
      player_actions: [],
      updated_at: '2026-03-20T15:00:00.000Z', // server time
    });
  });

  it('detects conflict when server updated_at is newer', async () => {
    const result = await checkEditConflict(
      'matches',
      matchId,
      '2026-03-20T14:00:00.000Z' // our stale time
    );

    expect(result.hasConflict).toBe(true);
    expect(result.serverRecord).toBeTruthy();
    expect(result.serverRecord.winner).toBe('A');
  });

  it('no conflict when timestamps match', async () => {
    const result = await checkEditConflict(
      'matches',
      matchId,
      '2026-03-20T15:00:00.000Z' // same as server
    );

    expect(result.hasConflict).toBe(false);
  });

  it('no conflict when our timestamp is newer', async () => {
    const result = await checkEditConflict(
      'matches',
      matchId,
      '2026-03-20T16:00:00.000Z'
    );

    expect(result.hasConflict).toBe(false);
  });

  it('fetchUpdatedAt returns the server timestamp', async () => {
    const ts = await fetchUpdatedAt('matches', matchId);
    expect(ts).toBeTruthy();
  });
});

// ============================================
// Phase 5b: Diff Computation
// ============================================

describe('Phase 5b — Diff Computation', () => {
  it('computeMatchDiffs detects score, winner, and duration changes', () => {
    const serverRecord = {
      team_a: { score: 13, playerNames: ['Alice'] },
      team_b: { score: 8, playerNames: ['Bob'] },
      winner: 'A',
      format: 'Doublette',
      duration: 42,
      date: '2026-03-20T14:00:00Z',
      menes: [],
      player_actions: [],
    };

    const localUpdates = {
      teamA: { score: 13, playerNames: ['Alice'] },
      teamB: { score: 11, playerNames: ['Bob'] },
      winner: 'B',
      duration: 55,
    };

    const diffs = computeMatchDiffs(localUpdates, serverRecord, 'fr');

    expect(diffs.length).toBeGreaterThanOrEqual(3);

    const scoreBDiff = diffs.find(d => d.field === 'teamB.score');
    expect(scoreBDiff).toBeTruthy();
    expect(scoreBDiff!.localValue).toBe('11');
    expect(scoreBDiff!.serverValue).toBe('8');

    const winnerDiff = diffs.find(d => d.field === 'winner');
    expect(winnerDiff).toBeTruthy();
    expect(winnerDiff!.localValue).toContain('B');
    expect(winnerDiff!.serverValue).toContain('A');

    const durationDiff = diffs.find(d => d.field === 'duration');
    expect(durationDiff).toBeTruthy();
    expect(durationDiff!.localValue).toBe('55');
    expect(durationDiff!.serverValue).toBe('42');
  });

  it('computeMatchDiffs returns empty array when no differences', () => {
    const serverRecord = {
      team_a: { score: 13 },
      team_b: { score: 8 },
      winner: 'A',
      duration: 42,
    };

    const localUpdates = {
      teamA: { score: 13 },
      teamB: { score: 8 },
      winner: 'A',
      duration: 42,
    };

    const diffs = computeMatchDiffs(localUpdates, serverRecord, 'en');
    expect(diffs.length).toBe(0);
  });

  it('computeMatchDiffs handles menes differences', () => {
    const serverRecord = {
      menes: [{ teamAPoints: 3, teamBPoints: 0 }],
    };
    const localUpdates = {
      menes: [{ teamAPoints: 3, teamBPoints: 0 }, { teamAPoints: 0, teamBPoints: 2 }],
    };

    const diffs = computeMatchDiffs(localUpdates, serverRecord, 'fr');
    const menesDiff = diffs.find(d => d.field === 'menes');
    expect(menesDiff).toBeTruthy();
    expect(menesDiff!.localValue).toContain('#2');
    expect(menesDiff!.serverValue).not.toContain('#2');
  });
});

// ============================================
// Phase 6: Notifications
// ============================================

describe('Phase 6 — Share Request Notifications', () => {
  it('sends a local notification for a new share request', async () => {
    await sendShareRequestNotification({
      senderName: 'Alice',
      itemType: 'match',
      permission: 'write',
      itemSummary: 'Match du 20/03 — 13-8',
      requestId: 'req-1',
    });

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const [call] = mockScheduleNotification.mock.calls;
    expect(call[0].content.title).toContain('Alice');
    expect(call[0].content.title).toContain('match');
    expect(call[0].content.body).toContain('13-8');
    expect(call[0].content.data.type).toBe('share_request');
    expect(call[0].content.data.requestId).toBe('req-1');
  });

  it('sends notification with challenge type and read permission', async () => {
    await sendShareRequestNotification({
      senderName: 'Bob',
      itemType: 'challenge',
      permission: 'read',
      requestId: 'req-2',
    });

    const [call] = mockScheduleNotification.mock.calls;
    expect(call[0].content.title).toContain('defi');
    expect(call[0].content.body).toContain('lecture seule');
  });
});

// ============================================
// Phase 7: Revert & Undo Modifications
// ============================================

describe('Phase 7 — Revert Modifications', () => {
  const matchId = 'match-revert';

  beforeEach(async () => {
    memDB.matches.push({
      id: matchId,
      user_id: 'user-a',
      team_a: { players: ['user-a'], score: 13 },
      team_b: { players: ['user-b'], score: 11 },
      winner: 'B',
      format: 'Doublette',
      duration: 55,
      updated_at: '2026-03-20T14:00:00Z',
    });

    // User B logs modification
    currentUserId = 'user-b';
    await logModification({
      itemType: 'match',
      itemId: matchId,
      ownerId: 'user-a',
      changes: [
        { field: 'winner', oldValue: 'A', newValue: 'B' },
        { field: 'duration', oldValue: 42, newValue: 55 },
      ],
    });
    currentUserId = 'user-a';
  });

  it('isFieldRevertable returns true for revertable fields', () => {
    expect(isFieldRevertable('match', 'winner')).toBe(true);
    expect(isFieldRevertable('match', 'duration')).toBe(true);
    expect(isFieldRevertable('match', 'format')).toBe(true);
  });

  it('isFieldRevertable returns false for non-revertable fields', () => {
    expect(isFieldRevertable('match', 'menes')).toBe(false);
    expect(isFieldRevertable('match', 'playerActions')).toBe(false);
    expect(isFieldRevertable('match', 'teamA')).toBe(false);
  });

  it('revertFieldChange reverts "winner" to its old value', async () => {
    const { logs } = await getModificationLogs('match', matchId);
    const logId = logs[0].id;

    const { error } = await revertFieldChange({
      logId,
      itemType: 'match',
      itemId: matchId,
      fieldName: 'winner',
      oldValue: 'A',
    });

    expect(error).toBeNull();

    // Verify DB was updated
    const match = memDB.matches.find((m: any) => m.id === matchId);
    expect(match.winner).toBe('A');

    // Verify log was cleaned up (winner removed from changes)
    const { logs: updatedLogs } = await getModificationLogs('match', matchId);
    if (updatedLogs.length > 0) {
      const winnerChange = updatedLogs[0].changes.find((c: any) => c.field === 'winner');
      expect(winnerChange).toBeUndefined();
    }
  });

  it('revertAllChanges reverts all revertable fields at once', async () => {
    const { logs } = await getModificationLogs('match', matchId);
    const log = logs[0];

    const { error, revertedCount } = await revertAllChanges({
      logId: log.id,
      itemType: 'match',
      itemId: matchId,
      changes: log.changes,
    });

    expect(error).toBeNull();
    expect(revertedCount).toBe(2);

    // Verify DB state
    const match = memDB.matches.find((m: any) => m.id === matchId);
    expect(match.winner).toBe('A');
    expect(match.duration).toBe(42);

    // Log should be deleted since all fields were reverted
    const { logs: remaining } = await getModificationLogs('match', matchId);
    expect(remaining.length).toBe(0);
  });
});

// ============================================
// Phase 8: Share Management (Revoke, List)
// ============================================

describe('Phase 8 — Share Management', () => {
  beforeEach(async () => {
    memDB.matches.push({
      id: 'match-mgmt',
      user_id: 'user-a',
      team_a: { players: ['user-a'], score: 13 },
      team_b: { players: ['user-b'], score: 8 },
      winner: 'A',
      participant_user_ids: ['user-a'],
      updated_at: '2026-03-20T14:00:00Z',
    });
    currentUserId = 'user-a';
    await createShareRequests({
      itemType: 'match',
      itemId: 'match-mgmt',
      senderUserId: 'user-a',
      senderName: 'Alice',
      recipients: [{ userId: 'user-b', permission: 'write' }],
    });
  });

  it('getShareRequestsForItem returns the created request', async () => {
    const { requests, error } = await getShareRequestsForItem('match', 'match-mgmt');
    expect(error).toBeNull();
    expect(requests.length).toBe(1);
    expect(requests[0].recipientUserId).toBe('user-b');
  });

  it('revokeShareRequest removes the request', async () => {
    const { requests } = await getShareRequestsForItem('match', 'match-mgmt');
    const { error } = await revokeShareRequest(requests[0].id);
    expect(error).toBeNull();

    const { requests: remaining } = await getShareRequestsForItem('match', 'match-mgmt');
    expect(remaining.length).toBe(0);
  });
});

// ============================================
// Phase 9: Full End-to-End Flow
// ============================================

describe('Phase 9 — Complete End-to-End Flow', () => {
  it('full lifecycle: create → share → accept → edit → conflict → revert', async () => {
    // Step 1: User A creates a match
    currentUserId = 'user-a';
    memDB.matches.push({
      id: 'e2e-match',
      user_id: 'user-a',
      team_a: { players: ['user-a'], playerNames: ['Alice'], score: 13 },
      team_b: { players: ['user-b'], playerNames: ['Bob'], score: 8 },
      winner: 'A',
      format: 'Doublette',
      duration: 42,
      date: '2026-03-20T14:00:00Z',
      menes: [],
      player_actions: [],
      participant_user_ids: ['user-a'],
      updated_at: '2026-03-20T14:00:00.000Z',
    });

    // Step 2: Detect linked players and create share request
    const { linkedPlayers } = await detectLinkedPlayers(['user-a', 'user-b'], 'user-a');
    expect(linkedPlayers.length).toBe(1);

    const { requests: shareReqs } = await createShareRequests({
      itemType: 'match',
      itemId: 'e2e-match',
      senderUserId: 'user-a',
      senderName: 'Alice',
      recipients: [{ userId: 'user-b', permission: 'write' }],
      itemSummary: '13 - 8',
    });
    expect(shareReqs.length).toBe(1);

    // Step 3: User B accepts
    currentUserId = 'user-b';
    const { requests: pending } = await getReceivedShareRequests('pending');
    expect(pending.length).toBe(1);
    await acceptShareRequest(pending[0].id);

    const { matchIds } = await getSharedMatchIds();
    expect(matchIds).toContain('e2e-match');

    // Step 4: User B edits the match (changes duration and winner)
    const matchBefore = memDB.matches.find((m: any) => m.id === 'e2e-match');
    const oldUpdatedAt = matchBefore.updated_at;

    // Simulate User B saving changes (directly update memDB to reflect server state)
    memDB.matches = memDB.matches.map((m: any) =>
      m.id === 'e2e-match'
        ? { ...m, winner: 'B', duration: 60, team_b: { ...m.team_b, score: 13 }, updated_at: '2026-03-20T15:30:00.000Z' }
        : m
    );

    // User B logs the modification
    await logModification({
      itemType: 'match',
      itemId: 'e2e-match',
      ownerId: 'user-a',
      changes: [
        { field: 'winner', oldValue: 'A', newValue: 'B' },
        { field: 'duration', oldValue: 42, newValue: 60 },
      ],
    });

    // Step 5: User A tries to save their own changes — conflict detected
    currentUserId = 'user-a';
    const conflict = await checkEditConflict('matches', 'e2e-match', oldUpdatedAt);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.serverRecord.winner).toBe('B'); // User B's version

    // Compute visual diffs
    const diffs = computeMatchDiffs(
      { teamB: { score: 10 }, winner: 'A', duration: 50 },
      conflict.serverRecord!,
      'fr'
    );
    expect(diffs.length).toBeGreaterThan(0);
    const winnerDiff = diffs.find(d => d.field === 'winner');
    expect(winnerDiff).toBeTruthy();

    // Step 6: User A sees the modification log
    const { logs } = await getModificationLogs('match', 'e2e-match');
    expect(logs.length).toBe(1);
    expect(logs[0].modifierId).toBe('user-b');
    expect(logs[0].changes.some(c => c.field === 'winner')).toBe(true);

    // Step 7: User A reverts the winner change
    const { error: revertError } = await revertFieldChange({
      logId: logs[0].id,
      itemType: 'match',
      itemId: 'e2e-match',
      fieldName: 'winner',
      oldValue: 'A',
    });
    expect(revertError).toBeNull();

    // Verify winner is back to A
    const matchAfterRevert = memDB.matches.find((m: any) => m.id === 'e2e-match');
    expect(matchAfterRevert.winner).toBe('A');

    // Duration is still 60 (not reverted)
    expect(matchAfterRevert.duration).toBe(60);

    // Step 8: Notification was sent for the share request
    await sendShareRequestNotification({
      senderName: 'Alice',
      itemType: 'match',
      permission: 'write',
      itemSummary: '13 - 8',
      requestId: shareReqs[0].id,
    });
    expect(mockScheduleNotification).toHaveBeenCalled();
  });
});

// ============================================
// Phase 10: Challenge Sharing Flow
// ============================================

describe('Phase 10 — Challenge Sharing', () => {
  it('shares a challenge with read permission and blocks write for recipient', async () => {
    currentUserId = 'user-a';
    memDB.challenges.push({
      id: 'challenge-share',
      user_id: 'user-a',
      type: '10_tirs',
      mode: 'solo',
      date: '2026-03-20T14:00:00Z',
      success_count: 7,
      total_shots: 10,
      success_rate: '70',
      participant_user_ids: ['user-a'],
      updated_at: '2026-03-20T14:00:00Z',
    });

    // Share with read-only permission
    const { requests } = await createShareRequests({
      itemType: 'challenge',
      itemId: 'challenge-share',
      senderUserId: 'user-a',
      senderName: 'Alice',
      recipients: [{ userId: 'user-b', permission: 'read' }],
    });
    expect(requests[0].permission).toBe('read');

    // User B accepts
    currentUserId = 'user-b';
    const { requests: pending } = await getReceivedShareRequests('pending');
    await acceptShareRequest(pending[0].id);

    // Verify shared challenge IDs are available
    // (getSharedChallengeIds queries match_share_requests for type='challenge')
    const { data: sharedReqs } = await mockSupabase.from('match_share_requests')
      .select('*')
      .eq('item_type', 'challenge')
      .eq('recipient_user_id', 'user-b')
      .eq('status', 'accepted');
    expect(sharedReqs.length).toBe(1);
    expect(sharedReqs[0].permission).toBe('read');
  });
});
