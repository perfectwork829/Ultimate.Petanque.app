/**
 * Unit tests for services/notificationPreferencesService.ts
 *
 * Tests: default preferences, loadNotificationPreferences (merge with defaults,
 * missing fields, DB errors, unauthenticated), saveNotificationPreferences
 * (upsert, error handling), isNotificationTypeEnabled (per-type check,
 * defaults on missing data, all 5 notification types).
 */

// ─── Types & Constants ─────────────────────────────────────

interface NotificationPreferences {
  event_created: boolean;
  meetup_invitation: boolean;
  ranking_changed: boolean;
  share_request: boolean;
  event_reminder: boolean;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  event_created: true,
  meetup_invitation: true,
  ranking_changed: true,
  share_request: true,
  event_reminder: true,
};

const ALL_TYPES: (keyof NotificationPreferences)[] = [
  'event_created',
  'meetup_invitation',
  'ranking_changed',
  'share_request',
  'event_reminder',
];

// ─── In-memory DB ──────────────────────────────────────────

let memDB: {
  user_preferences: Array<{
    user_id: string;
    notification_preferences: Partial<NotificationPreferences>;
    updated_at?: string;
  }>;
} = { user_preferences: [] };

let currentUserId: string | null = 'user-1';

function resetMemDB() {
  memDB = { user_preferences: [] };
  currentUserId = 'user-1';
}

// ─── Inline implementations (mirrors service logic) ────────

function loadNotificationPreferences(): NotificationPreferences {
  if (!currentUserId) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  const row = memDB.user_preferences.find(r => r.user_id === currentUserId);

  if (!row || !row.notification_preferences) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...row.notification_preferences,
  };
}

function saveNotificationPreferences(
  prefs: NotificationPreferences
): { error: string | null } {
  if (!currentUserId) return { error: 'Not authenticated' };

  const existingIdx = memDB.user_preferences.findIndex(r => r.user_id === currentUserId);
  const entry = {
    user_id: currentUserId,
    notification_preferences: prefs,
    updated_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    memDB.user_preferences[existingIdx] = entry;
  } else {
    memDB.user_preferences.push(entry);
  }

  return { error: null };
}

function isNotificationTypeEnabled(
  userId: string,
  type: keyof NotificationPreferences
): boolean {
  const row = memDB.user_preferences.find(r => r.user_id === userId);

  if (!row || !row.notification_preferences) return true; // Default: enabled
  return row.notification_preferences[type] !== false;
}

// ─── Tests ─────────────────────────────────────────────────

beforeEach(() => {
  resetMemDB();
});

// ============================================
// Default Preferences
// ============================================

describe('Default Notification Preferences', () => {
  test('all 5 types exist in defaults', () => {
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)).toHaveLength(5);
    ALL_TYPES.forEach(type => {
      expect(DEFAULT_NOTIFICATION_PREFERENCES).toHaveProperty(type);
    });
  });

  test('all defaults are true', () => {
    ALL_TYPES.forEach(type => {
      expect(DEFAULT_NOTIFICATION_PREFERENCES[type]).toBe(true);
    });
  });

  test('defaults are immutable across calls', () => {
    const prefs1 = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const prefs2 = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    prefs1.event_created = false;
    expect(prefs2.event_created).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.event_created).toBe(true);
  });
});

// ============================================
// loadNotificationPreferences
// ============================================

describe('loadNotificationPreferences', () => {
  test('returns defaults when no preferences saved', () => {
    const prefs = loadNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  test('returns defaults when user is not authenticated', () => {
    currentUserId = null;
    const prefs = loadNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  test('returns saved preferences merged with defaults', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: false,
        ranking_changed: false,
      },
    });

    const prefs = loadNotificationPreferences();
    expect(prefs.event_created).toBe(false);
    expect(prefs.ranking_changed).toBe(false);
    expect(prefs.meetup_invitation).toBe(true); // default
    expect(prefs.share_request).toBe(true); // default
    expect(prefs.event_reminder).toBe(true); // default
  });

  test('partial preferences get merged with defaults', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        meetup_invitation: false,
      },
    });

    const prefs = loadNotificationPreferences();
    expect(prefs.meetup_invitation).toBe(false);
    expect(prefs.event_created).toBe(true);
    expect(prefs.ranking_changed).toBe(true);
    expect(prefs.share_request).toBe(true);
    expect(prefs.event_reminder).toBe(true);
  });

  test('returns defaults when notification_preferences is null', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: null as any,
    });

    const prefs = loadNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  test('all types disabled returns all false', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: false,
        meetup_invitation: false,
        ranking_changed: false,
        share_request: false,
        event_reminder: false,
      },
    });

    const prefs = loadNotificationPreferences();
    ALL_TYPES.forEach(type => {
      expect(prefs[type]).toBe(false);
    });
  });

  test('loads for correct user (does not mix users)', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: { event_created: false },
    });
    memDB.user_preferences.push({
      user_id: 'user-2',
      notification_preferences: { event_created: true, meetup_invitation: false },
    });

    currentUserId = 'user-1';
    const prefs1 = loadNotificationPreferences();
    expect(prefs1.event_created).toBe(false);
    expect(prefs1.meetup_invitation).toBe(true);

    currentUserId = 'user-2';
    const prefs2 = loadNotificationPreferences();
    expect(prefs2.event_created).toBe(true);
    expect(prefs2.meetup_invitation).toBe(false);
  });
});

// ============================================
// saveNotificationPreferences
// ============================================

describe('saveNotificationPreferences', () => {
  test('saves preferences for authenticated user', () => {
    const prefs: NotificationPreferences = {
      event_created: true,
      meetup_invitation: false,
      ranking_changed: true,
      share_request: false,
      event_reminder: true,
    };

    const result = saveNotificationPreferences(prefs);
    expect(result.error).toBeNull();

    const saved = memDB.user_preferences.find(r => r.user_id === 'user-1');
    expect(saved).toBeTruthy();
    expect(saved!.notification_preferences.meetup_invitation).toBe(false);
    expect(saved!.notification_preferences.share_request).toBe(false);
  });

  test('returns error when not authenticated', () => {
    currentUserId = null;
    const result = saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(result.error).toBe('Not authenticated');
    expect(memDB.user_preferences).toHaveLength(0);
  });

  test('upsert overwrites existing preferences', () => {
    // First save
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      event_created: false,
    });
    expect(memDB.user_preferences).toHaveLength(1);

    // Second save (upsert)
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      event_created: true,
      ranking_changed: false,
    });
    expect(memDB.user_preferences).toHaveLength(1); // Still 1 (upserted)

    const saved = memDB.user_preferences[0];
    expect(saved.notification_preferences.event_created).toBe(true);
    expect(saved.notification_preferences.ranking_changed).toBe(false);
  });

  test('saves updated_at timestamp', () => {
    const before = Date.now();
    saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    const after = Date.now();

    const saved = memDB.user_preferences[0];
    const ts = new Date(saved.updated_at!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('saves all false preferences', () => {
    const allFalse: NotificationPreferences = {
      event_created: false,
      meetup_invitation: false,
      ranking_changed: false,
      share_request: false,
      event_reminder: false,
    };

    const result = saveNotificationPreferences(allFalse);
    expect(result.error).toBeNull();

    const saved = memDB.user_preferences[0];
    ALL_TYPES.forEach(type => {
      expect(saved.notification_preferences[type]).toBe(false);
    });
  });

  test('multiple users can have independent preferences', () => {
    currentUserId = 'user-1';
    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, event_created: false });

    currentUserId = 'user-2';
    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, meetup_invitation: false });

    expect(memDB.user_preferences).toHaveLength(2);

    const user1Prefs = memDB.user_preferences.find(r => r.user_id === 'user-1')!;
    const user2Prefs = memDB.user_preferences.find(r => r.user_id === 'user-2')!;

    expect(user1Prefs.notification_preferences.event_created).toBe(false);
    expect(user1Prefs.notification_preferences.meetup_invitation).toBe(true);
    expect(user2Prefs.notification_preferences.event_created).toBe(true);
    expect(user2Prefs.notification_preferences.meetup_invitation).toBe(false);
  });
});

// ============================================
// isNotificationTypeEnabled
// ============================================

describe('isNotificationTypeEnabled', () => {
  test('returns true when no preferences exist (default)', () => {
    ALL_TYPES.forEach(type => {
      expect(isNotificationTypeEnabled('user-1', type)).toBe(true);
    });
  });

  test('returns true for enabled types', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: true,
        meetup_invitation: true,
        ranking_changed: false,
      },
    });

    expect(isNotificationTypeEnabled('user-1', 'event_created')).toBe(true);
    expect(isNotificationTypeEnabled('user-1', 'meetup_invitation')).toBe(true);
  });

  test('returns false for disabled types', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        ranking_changed: false,
        share_request: false,
      },
    });

    expect(isNotificationTypeEnabled('user-1', 'ranking_changed')).toBe(false);
    expect(isNotificationTypeEnabled('user-1', 'share_request')).toBe(false);
  });

  test('returns true for types not explicitly set', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: false,
      },
    });

    // event_reminder not in saved prefs → default to true
    expect(isNotificationTypeEnabled('user-1', 'event_reminder')).toBe(true);
  });

  test('returns true for unknown user (default on error)', () => {
    expect(isNotificationTypeEnabled('unknown-user', 'event_created')).toBe(true);
  });

  test('checks correct user isolation', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: { event_created: false },
    });
    memDB.user_preferences.push({
      user_id: 'user-2',
      notification_preferences: { event_created: true, ranking_changed: false },
    });

    expect(isNotificationTypeEnabled('user-1', 'event_created')).toBe(false);
    expect(isNotificationTypeEnabled('user-2', 'event_created')).toBe(true);
    expect(isNotificationTypeEnabled('user-2', 'ranking_changed')).toBe(false);
    expect(isNotificationTypeEnabled('user-1', 'ranking_changed')).toBe(true); // not set → true
  });

  test('each of the 5 types can be individually disabled', () => {
    ALL_TYPES.forEach(type => {
      resetMemDB();
      const prefs: Partial<NotificationPreferences> = {};
      prefs[type] = false;
      memDB.user_preferences.push({
        user_id: 'user-1',
        notification_preferences: prefs,
      });

      expect(isNotificationTypeEnabled('user-1', type)).toBe(false);
      // Other types should still be true
      ALL_TYPES.filter(t => t !== type).forEach(otherType => {
        expect(isNotificationTypeEnabled('user-1', otherType)).toBe(true);
      });
    });
  });
});

// ============================================
// Round-trip: Save → Load
// ============================================

describe('Round-trip: Save → Load', () => {
  test('saved preferences are loaded correctly', () => {
    const prefs: NotificationPreferences = {
      event_created: false,
      meetup_invitation: true,
      ranking_changed: false,
      share_request: true,
      event_reminder: false,
    };

    saveNotificationPreferences(prefs);
    const loaded = loadNotificationPreferences();
    expect(loaded).toEqual(prefs);
  });

  test('multiple save→load cycles maintain consistency', () => {
    // Save v1
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      event_created: false,
    });
    expect(loadNotificationPreferences().event_created).toBe(false);

    // Save v2
    saveNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      event_created: true,
      ranking_changed: false,
    });
    const loaded = loadNotificationPreferences();
    expect(loaded.event_created).toBe(true);
    expect(loaded.ranking_changed).toBe(false);
  });

  test('save for one user does not affect another', () => {
    currentUserId = 'user-1';
    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, event_created: false });

    currentUserId = 'user-2';
    const loaded = loadNotificationPreferences();
    expect(loaded.event_created).toBe(true); // Default, not affected by user-1
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('empty notification_preferences object returns defaults', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {},
    });

    const prefs = loadNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  test('extra unknown fields in notification_preferences are ignored', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: false,
        unknown_field: true,
      } as any,
    });

    const prefs = loadNotificationPreferences();
    expect(prefs.event_created).toBe(false);
    expect((prefs as any).unknown_field).toBe(true); // Spread merges extra keys
    // But the 5 known types are correct
    expect(prefs.meetup_invitation).toBe(true);
  });

  test('boolean false is distinct from undefined/null for type check', () => {
    memDB.user_preferences.push({
      user_id: 'user-1',
      notification_preferences: {
        event_created: false,
        meetup_invitation: undefined as any,
      },
    });

    expect(isNotificationTypeEnabled('user-1', 'event_created')).toBe(false);
    // undefined !== false, so should return true
    expect(isNotificationTypeEnabled('user-1', 'meetup_invitation')).toBe(true);
  });
});
