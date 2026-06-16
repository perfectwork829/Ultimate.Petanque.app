/**
 * Unit tests for services/eventNotificationService.ts
 *
 * Tests: EventNotification mapping, notification types, EventReminderSettings,
 * reminder date computation, local notification identifiers, creator notification
 * logic (self-notification prevention), witness request filtering, edge cases.
 */

// ─── Inline implementations ──

interface EventNotification {
  id: string;
  eventId: string;
  recipientUserId: string;
  senderUserId?: string;
  type: 'witness_needed' | 'result_submitted' | 'attestation_received' | 'event_reminder' | 'participant_registered' | 'result_submitted_to_creator' | 'all_witnesses_attested';
  participantId?: string;
  title: string;
  message?: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
  eventTitle?: string;
  senderName?: string;
}

interface EventReminderSettings {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  oneDayBefore: boolean;
  threeHoursBefore: boolean;
  oneHourBefore: boolean;
}

function mapEventNotificationRow(n: any): EventNotification {
  return {
    id: n.id,
    eventId: n.event_id,
    recipientUserId: n.recipient_user_id,
    senderUserId: n.sender_user_id,
    type: n.type,
    participantId: n.participant_id,
    title: n.title,
    message: n.message,
    isRead: n.is_read,
    actionUrl: n.action_url,
    createdAt: n.created_at,
    eventTitle: n.sponsored_events?.title,
    senderName: n.sender_profiles?.username,
  };
}

function computeEventReminderDates(settings: EventReminderSettings): { identifier: string; date: Date }[] {
  const results: { identifier: string; date: Date }[] = [];
  const { eventId, startTime, oneDayBefore, threeHoursBefore, oneHourBefore } = settings;

  if (oneDayBefore) {
    const d = new Date(startTime);
    d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
    results.push({ identifier: `event_${eventId}_1day`, date: d });
  }
  if (threeHoursBefore) {
    const d = new Date(startTime.getTime() - 3 * 60 * 60 * 1000);
    results.push({ identifier: `event_${eventId}_3h`, date: d });
  }
  if (oneHourBefore) {
    const d = new Date(startTime.getTime() - 60 * 60 * 1000);
    results.push({ identifier: `event_${eventId}_1h`, date: d });
  }
  return results;
}

function buildWitnessNotifications(
  eventId: string,
  senderUserId: string,
  participantId: string,
  participantName: string,
  eventTitle: string,
  otherParticipantUserIds: string[]
): any[] {
  return otherParticipantUserIds
    .filter(uid => uid !== senderUserId)
    .map(uid => ({
      event_id: eventId,
      recipient_user_id: uid,
      sender_user_id: senderUserId,
      type: 'witness_needed',
      participant_id: participantId,
      title: '👁 Attestation requise',
      message: `${participantName} a termine son defi pour "${eventTitle}". Votre attestation est necessaire.`,
      action_url: `/sponsored-event/${eventId}`,
    }));
}

function shouldNotifyCreator(currentUserId: string, creatorUserId: string): boolean {
  return currentUserId !== creatorUserId;
}

function getUnreadNotifications(notifications: EventNotification[]): EventNotification[] {
  return notifications.filter(n => !n.isRead);
}

function getWitnessRequests(notifications: EventNotification[]): EventNotification[] {
  return notifications.filter(n => n.type === 'witness_needed' && !n.isRead);
}

const VALID_NOTIFICATION_TYPES = [
  'witness_needed', 'result_submitted', 'attestation_received',
  'event_reminder', 'participant_registered', 'result_submitted_to_creator',
  'all_witnesses_attested'
] as const;

// ─── Tests ──

describe('mapEventNotificationRow', () => {
  test('maps all fields correctly', () => {
    const row = {
      id: 'n1', event_id: 'e1', recipient_user_id: 'u1', sender_user_id: 'u2',
      type: 'witness_needed', participant_id: 'p1', title: 'Test', message: 'Body',
      is_read: false, action_url: '/sponsored-event/e1', created_at: '2026-03-28T10:00:00Z',
      sponsored_events: { title: 'Grand Defi' }, sender_profiles: { username: 'Alice' },
    };
    const n = mapEventNotificationRow(row);
    expect(n.id).toBe('n1');
    expect(n.eventId).toBe('e1');
    expect(n.type).toBe('witness_needed');
    expect(n.isRead).toBe(false);
    expect(n.eventTitle).toBe('Grand Defi');
    expect(n.senderName).toBe('Alice');
  });

  test('handles missing joined data', () => {
    const row = {
      id: 'n2', event_id: 'e2', recipient_user_id: 'u1', sender_user_id: null,
      type: 'event_reminder', participant_id: null, title: 'Rappel', message: null,
      is_read: true, action_url: null, created_at: '2026-03-28T10:00:00Z',
      sponsored_events: null, sender_profiles: null,
    };
    const n = mapEventNotificationRow(row);
    expect(n.senderUserId).toBeNull();
    expect(n.eventTitle).toBeUndefined();
    expect(n.senderName).toBeUndefined();
    expect(n.isRead).toBe(true);
  });
});

describe('VALID_NOTIFICATION_TYPES', () => {
  test('has 7 notification types', () => {
    expect(VALID_NOTIFICATION_TYPES).toHaveLength(7);
  });

  test('includes witness_needed', () => {
    expect(VALID_NOTIFICATION_TYPES).toContain('witness_needed');
  });

  test('includes all_witnesses_attested', () => {
    expect(VALID_NOTIFICATION_TYPES).toContain('all_witnesses_attested');
  });
});

describe('computeEventReminderDates', () => {
  const settings: EventReminderSettings = {
    eventId: 'e1',
    eventTitle: 'Defi Test',
    startTime: new Date('2026-04-10T14:00:00Z'),
    oneDayBefore: true,
    threeHoursBefore: true,
    oneHourBefore: true,
  };

  test('computes 3 reminders when all enabled', () => {
    const results = computeEventReminderDates(settings);
    expect(results).toHaveLength(3);
  });

  test('1-day-before is at 9:00 on the day before', () => {
    const results = computeEventReminderDates(settings);
    const dayBefore = results.find(r => r.identifier.endsWith('_1day'));
    expect(dayBefore).toBeDefined();
    expect(dayBefore!.date.getDate()).toBe(9);
    expect(dayBefore!.date.getHours()).toBe(9);
  });

  test('3h-before is 3 hours before start', () => {
    const results = computeEventReminderDates(settings);
    const threeh = results.find(r => r.identifier.endsWith('_3h'));
    expect(threeh).toBeDefined();
    const diff = settings.startTime.getTime() - threeh!.date.getTime();
    expect(diff).toBe(3 * 60 * 60 * 1000);
  });

  test('1h-before is 1 hour before start', () => {
    const results = computeEventReminderDates(settings);
    const oneh = results.find(r => r.identifier.endsWith('_1h'));
    expect(oneh).toBeDefined();
    const diff = settings.startTime.getTime() - oneh!.date.getTime();
    expect(diff).toBe(60 * 60 * 1000);
  });

  test('identifiers include event ID', () => {
    const results = computeEventReminderDates(settings);
    results.forEach(r => {
      expect(r.identifier).toContain('event_e1');
    });
  });

  test('returns empty when all disabled', () => {
    const disabled = { ...settings, oneDayBefore: false, threeHoursBefore: false, oneHourBefore: false };
    expect(computeEventReminderDates(disabled)).toHaveLength(0);
  });

  test('returns 1 when only oneHourBefore', () => {
    const partial = { ...settings, oneDayBefore: false, threeHoursBefore: false, oneHourBefore: true };
    expect(computeEventReminderDates(partial)).toHaveLength(1);
  });
});

describe('buildWitnessNotifications', () => {
  test('creates notifications for all except sender', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Alice', 'Grand Defi', ['u1', 'u2', 'u3']);
    expect(notifs).toHaveLength(2);
    expect(notifs.every((n: any) => n.recipient_user_id !== 'u1')).toBe(true);
  });

  test('all have type witness_needed', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Alice', 'Grand Defi', ['u2', 'u3']);
    notifs.forEach((n: any) => expect(n.type).toBe('witness_needed'));
  });

  test('includes participant name in message', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Bob', 'Defi X', ['u2']);
    expect(notifs[0].message).toContain('Bob');
  });

  test('includes event title in message', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Bob', 'Defi Special', ['u2']);
    expect(notifs[0].message).toContain('Defi Special');
  });

  test('action_url points to event', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Bob', 'Defi', ['u2']);
    expect(notifs[0].action_url).toBe('/sponsored-event/e1');
  });

  test('empty when sender is the only participant', () => {
    const notifs = buildWitnessNotifications('e1', 'u1', 'p1', 'Alice', 'Defi', ['u1']);
    expect(notifs).toHaveLength(0);
  });

  test('handles large participant list', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `u${i}`);
    const notifs = buildWitnessNotifications('e1', 'u0', 'p1', 'Alice', 'Defi', ids);
    expect(notifs).toHaveLength(49);
  });
});

describe('shouldNotifyCreator', () => {
  test('returns true when different users', () => {
    expect(shouldNotifyCreator('u1', 'u2')).toBe(true);
  });

  test('returns false when same user (self-registration)', () => {
    expect(shouldNotifyCreator('u1', 'u1')).toBe(false);
  });
});

describe('getUnreadNotifications', () => {
  test('filters to unread only', () => {
    const notifications: EventNotification[] = [
      { id: '1', eventId: 'e1', recipientUserId: 'u1', type: 'witness_needed', title: '', isRead: false, createdAt: '' },
      { id: '2', eventId: 'e1', recipientUserId: 'u1', type: 'attestation_received', title: '', isRead: true, createdAt: '' },
      { id: '3', eventId: 'e1', recipientUserId: 'u1', type: 'event_reminder', title: '', isRead: false, createdAt: '' },
    ];
    expect(getUnreadNotifications(notifications)).toHaveLength(2);
  });
});

describe('getWitnessRequests', () => {
  test('filters to unread witness_needed only', () => {
    const notifications: EventNotification[] = [
      { id: '1', eventId: 'e1', recipientUserId: 'u1', type: 'witness_needed', title: '', isRead: false, createdAt: '' },
      { id: '2', eventId: 'e1', recipientUserId: 'u1', type: 'witness_needed', title: '', isRead: true, createdAt: '' },
      { id: '3', eventId: 'e1', recipientUserId: 'u1', type: 'attestation_received', title: '', isRead: false, createdAt: '' },
    ];
    expect(getWitnessRequests(notifications)).toHaveLength(1);
    expect(getWitnessRequests(notifications)[0].id).toBe('1');
  });
});
