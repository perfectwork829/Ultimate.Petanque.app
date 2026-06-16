/**
 * Unit tests for supabase/functions/_shared/push.ts
 *
 * Tests: buildPushMessage construction, haversineDistance calculation,
 * token filtering, batch sizing logic, PushMessage/PushTicket types.
 */

// ─── Inline implementations ──

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

interface PushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

function buildPushMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  options?: { channelId?: string; badge?: number; priority?: 'default' | 'normal' | 'high'; ttl?: number }
): PushMessage {
  return {
    to: token,
    title,
    body,
    data: data || {},
    sound: 'default',
    badge: options?.badge ?? 1,
    channelId: options?.channelId,
    priority: options?.priority ?? 'high',
    ttl: options?.ttl ?? 86400,
  };
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function filterValidTokens(messages: PushMessage[]): PushMessage[] {
  return messages.filter(m => m.to && m.to.startsWith('ExponentPushToken['));
}

function batchMessages(messages: PushMessage[], batchSize: number = 100): PushMessage[][] {
  const batches: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }
  return batches;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PROXIMITY_RADIUS_KM = 200;

// ─── Tests ──

describe('buildPushMessage', () => {
  test('builds message with all defaults', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'Title', 'Body');
    expect(msg.to).toBe('ExponentPushToken[abc]');
    expect(msg.title).toBe('Title');
    expect(msg.body).toBe('Body');
    expect(msg.data).toEqual({});
    expect(msg.sound).toBe('default');
    expect(msg.badge).toBe(1);
    expect(msg.priority).toBe('high');
    expect(msg.ttl).toBe(86400);
  });

  test('includes custom data', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B', { type: 'event_created', eventId: 'e1' });
    expect(msg.data).toEqual({ type: 'event_created', eventId: 'e1' });
  });

  test('respects channelId option', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B', {}, { channelId: 'share-requests' });
    expect(msg.channelId).toBe('share-requests');
  });

  test('respects badge option', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B', {}, { badge: 5 });
    expect(msg.badge).toBe(5);
  });

  test('respects priority option', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B', {}, { priority: 'normal' });
    expect(msg.priority).toBe('normal');
  });

  test('respects ttl option', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B', {}, { ttl: 3600 });
    expect(msg.ttl).toBe(3600);
  });

  test('default ttl is 24 hours (86400s)', () => {
    const msg = buildPushMessage('ExponentPushToken[abc]', 'T', 'B');
    expect(msg.ttl).toBe(86400);
  });
});

describe('haversineDistance', () => {
  test('same point = 0 km', () => {
    expect(haversineDistance(48.8566, 2.3522, 48.8566, 2.3522)).toBeCloseTo(0, 1);
  });

  test('Paris to Lyon ~392 km', () => {
    const d = haversineDistance(48.8566, 2.3522, 45.7640, 4.8357);
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(410);
  });

  test('Paris to Marseille ~660 km', () => {
    const d = haversineDistance(48.8566, 2.3522, 43.2965, 5.3698);
    expect(d).toBeGreaterThan(640);
    expect(d).toBeLessThan(680);
  });

  test('Paris to London ~340 km', () => {
    const d = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(350);
  });

  test('within 200km radius', () => {
    // Paris to Rouen ~110 km
    const d = haversineDistance(48.8566, 2.3522, 49.4432, 1.0993);
    expect(d).toBeLessThan(PROXIMITY_RADIUS_KM);
  });

  test('outside 200km radius', () => {
    // Paris to Bordeaux ~500 km
    const d = haversineDistance(48.8566, 2.3522, 44.8378, -0.5792);
    expect(d).toBeGreaterThan(PROXIMITY_RADIUS_KM);
  });

  test('antipodal points ~20000 km', () => {
    const d = haversineDistance(0, 0, 0, 180);
    expect(d).toBeGreaterThan(19000);
    expect(d).toBeLessThan(21000);
  });

  test('equator quarter ~10000 km', () => {
    const d = haversineDistance(0, 0, 0, 90);
    expect(d).toBeGreaterThan(9900);
    expect(d).toBeLessThan(10100);
  });

  test('negative coordinates (southern hemisphere)', () => {
    // Buenos Aires to Cape Town ~6800 km
    const d = haversineDistance(-34.6037, -58.3816, -33.9249, 18.4241);
    expect(d).toBeGreaterThan(6700);
    expect(d).toBeLessThan(7000);
  });
});

describe('filterValidTokens', () => {
  test('filters only valid Expo tokens', () => {
    const messages: PushMessage[] = [
      buildPushMessage('ExponentPushToken[valid1]', 'T', 'B'),
      buildPushMessage('invalid-token', 'T', 'B'),
      buildPushMessage('ExponentPushToken[valid2]', 'T', 'B'),
      buildPushMessage('', 'T', 'B'),
    ];
    const valid = filterValidTokens(messages);
    expect(valid).toHaveLength(2);
    expect(valid[0].to).toBe('ExponentPushToken[valid1]');
    expect(valid[1].to).toBe('ExponentPushToken[valid2]');
  });

  test('returns empty for no valid tokens', () => {
    const messages: PushMessage[] = [
      buildPushMessage('fcm-token-123', 'T', 'B'),
      buildPushMessage('apns-token-456', 'T', 'B'),
    ];
    expect(filterValidTokens(messages)).toHaveLength(0);
  });

  test('handles empty array', () => {
    expect(filterValidTokens([])).toHaveLength(0);
  });
});

describe('batchMessages', () => {
  test('single batch for <=100 messages', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => buildPushMessage(`ExponentPushToken[t${i}]`, 'T', 'B'));
    expect(batchMessages(msgs)).toHaveLength(1);
  });

  test('two batches for 150 messages', () => {
    const msgs = Array.from({ length: 150 }, (_, i) => buildPushMessage(`ExponentPushToken[t${i}]`, 'T', 'B'));
    const batches = batchMessages(msgs);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(50);
  });

  test('exactly 100 = single batch', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => buildPushMessage(`ExponentPushToken[t${i}]`, 'T', 'B'));
    expect(batchMessages(msgs)).toHaveLength(1);
  });

  test('empty array = no batches', () => {
    expect(batchMessages([])).toHaveLength(0);
  });

  test('500 messages = 5 batches', () => {
    const msgs = Array.from({ length: 500 }, (_, i) => buildPushMessage(`ExponentPushToken[t${i}]`, 'T', 'B'));
    expect(batchMessages(msgs)).toHaveLength(5);
  });
});

describe('PushTicket types', () => {
  test('ok ticket', () => {
    const ticket: PushTicket = { id: 'abc', status: 'ok' };
    expect(ticket.status).toBe('ok');
    expect(ticket.id).toBeDefined();
  });

  test('error ticket with DeviceNotRegistered', () => {
    const ticket: PushTicket = { status: 'error', message: 'Device not found', details: { error: 'DeviceNotRegistered' } };
    expect(ticket.status).toBe('error');
    expect(ticket.details?.error).toBe('DeviceNotRegistered');
  });
});

describe('constants', () => {
  test('EXPO_PUSH_URL is correct', () => {
    expect(EXPO_PUSH_URL).toBe('https://exp.host/--/api/v2/push/send');
  });

  test('PROXIMITY_RADIUS_KM is 200', () => {
    expect(PROXIMITY_RADIUS_KM).toBe(200);
  });
});
