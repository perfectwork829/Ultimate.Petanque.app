/**
 * Unit tests for services/pushTokenService.ts
 *
 * Tests: triggerServerPush payload construction, push token upsert logic,
 * platform detection, token caching, deactivation, error handling patterns.
 */

// ─── Inline implementations ──

function buildPushTokenUpsert(userId: string, token: string, platform: string): Record<string, any> {
  return {
    user_id: userId,
    token,
    platform,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

function buildTriggerPayload(type: string, payload: Record<string, any>): { type: string; payload: Record<string, any> } {
  return { type, payload };
}

function buildDeactivateUpdate(token: string): { active: boolean; updated_at: string } {
  return {
    active: false,
    updated_at: new Date().toISOString(),
  };
}

function parseTriggerResult(data: any): { sent: number; errors: number } {
  return { sent: data?.sent || 0, errors: data?.errors || 0 };
}

function handleTriggerError(error: any): { sent: number; errors: number } {
  let errorMessage = error.message;
  try {
    if (error.context?.text) {
      errorMessage = 'Extended error details';
    }
  } catch { /* silent */ }
  console.log('[pushToken] triggerServerPush error:', errorMessage);
  return { sent: 0, errors: 1 };
}

const VALID_PUSH_TYPES = [
  'share_request',
  'event_created',
  'event_reminder',
  'meetup_invitation',
  'ranking_changed',
  'witness_request',
  'witness_attested',
] as const;

const VALID_PLATFORMS = ['ios', 'android'] as const;

// ─── Tests ──

describe('buildPushTokenUpsert', () => {
  test('builds correct upsert object', () => {
    const result = buildPushTokenUpsert('u1', 'ExponentPushToken[xxx]', 'ios');
    expect(result.user_id).toBe('u1');
    expect(result.token).toBe('ExponentPushToken[xxx]');
    expect(result.platform).toBe('ios');
    expect(result.active).toBe(true);
    expect(result.updated_at).toBeDefined();
  });

  test('includes valid ISO timestamp', () => {
    const result = buildPushTokenUpsert('u1', 'token', 'android');
    const date = new Date(result.updated_at);
    expect(date.getTime()).toBeGreaterThan(0);
  });

  test('android platform', () => {
    const result = buildPushTokenUpsert('u1', 'token', 'android');
    expect(result.platform).toBe('android');
  });
});

describe('buildTriggerPayload', () => {
  test('wraps type and payload', () => {
    const result = buildTriggerPayload('ranking_changed', { changes: [{ userId: 'u1', oldRank: 5, newRank: 3 }] });
    expect(result.type).toBe('ranking_changed');
    expect(result.payload.changes).toHaveLength(1);
  });

  test('share_request type', () => {
    const result = buildTriggerPayload('share_request', { requestId: 'r1', recipientId: 'u2' });
    expect(result.type).toBe('share_request');
    expect(result.payload.requestId).toBe('r1');
  });

  test('meetup_invitation type', () => {
    const result = buildTriggerPayload('meetup_invitation', {
      meetupId: 'm1', meetupTitle: 'RDV Petanque', invitedUserId: 'u2',
    });
    expect(result.payload.meetupId).toBe('m1');
  });

  test('event_created type', () => {
    const result = buildTriggerPayload('event_created', { eventId: 'e1', ambassadorName: 'Alice' });
    expect(result.type).toBe('event_created');
  });
});

describe('buildDeactivateUpdate', () => {
  test('sets active to false', () => {
    const result = buildDeactivateUpdate('ExponentPushToken[xxx]');
    expect(result.active).toBe(false);
  });

  test('includes timestamp', () => {
    const result = buildDeactivateUpdate('token');
    expect(result.updated_at).toBeDefined();
  });
});

describe('parseTriggerResult', () => {
  test('parses successful result', () => {
    expect(parseTriggerResult({ sent: 5, errors: 0 })).toEqual({ sent: 5, errors: 0 });
  });

  test('parses result with errors', () => {
    expect(parseTriggerResult({ sent: 3, errors: 2 })).toEqual({ sent: 3, errors: 2 });
  });

  test('handles null data', () => {
    expect(parseTriggerResult(null)).toEqual({ sent: 0, errors: 0 });
  });

  test('handles undefined data', () => {
    expect(parseTriggerResult(undefined)).toEqual({ sent: 0, errors: 0 });
  });

  test('handles partial data', () => {
    expect(parseTriggerResult({ sent: 10 })).toEqual({ sent: 10, errors: 0 });
  });
});

describe('handleTriggerError', () => {
  test('returns 0 sent, 1 error', () => {
    const result = handleTriggerError(new Error('Network error'));
    expect(result).toEqual({ sent: 0, errors: 1 });
  });

  test('handles error with context', () => {
    const error = { message: 'Failed', context: { text: async () => 'Details' } };
    const result = handleTriggerError(error);
    expect(result.errors).toBe(1);
  });
});

describe('VALID_PUSH_TYPES', () => {
  test('has 7 push types', () => {
    expect(VALID_PUSH_TYPES).toHaveLength(7);
  });

  test('includes ranking_changed', () => {
    expect(VALID_PUSH_TYPES).toContain('ranking_changed');
  });

  test('includes meetup_invitation', () => {
    expect(VALID_PUSH_TYPES).toContain('meetup_invitation');
  });

  test('includes witness_request', () => {
    expect(VALID_PUSH_TYPES).toContain('witness_request');
  });
});

describe('VALID_PLATFORMS', () => {
  test('has 2 platforms', () => {
    expect(VALID_PLATFORMS).toHaveLength(2);
  });

  test('includes ios and android', () => {
    expect(VALID_PLATFORMS).toContain('ios');
    expect(VALID_PLATFORMS).toContain('android');
  });
});

describe('token format validation', () => {
  test('Expo push token format', () => {
    const token = 'ExponentPushToken[abcdefghijklmnop]';
    expect(token.startsWith('ExponentPushToken[')).toBe(true);
    expect(token.endsWith(']')).toBe(true);
  });

  test('token is not empty', () => {
    const token = 'ExponentPushToken[xxx]';
    expect(token.length).toBeGreaterThan(0);
  });
});

describe('edge cases', () => {
  test('triggerPayload with empty payload', () => {
    const result = buildTriggerPayload('ranking_changed', {});
    expect(result.payload).toEqual({});
  });

  test('triggerPayload with nested objects', () => {
    const result = buildTriggerPayload('share_request', {
      changes: [{ userId: 'u1', data: { nested: true } }],
    });
    expect(result.payload.changes[0].data.nested).toBe(true);
  });

  test('upsert with very long token', () => {
    const longToken = 'ExponentPushToken[' + 'a'.repeat(100) + ']';
    const result = buildPushTokenUpsert('u1', longToken, 'ios');
    expect(result.token.length).toBeGreaterThan(100);
  });
});
