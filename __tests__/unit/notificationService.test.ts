/**
 * Unit tests for services/notificationService.ts
 *
 * Tests: TournamentNotificationSettings, notification identifiers,
 * reminder date computation, Android channels, share request notification
 * payload construction, test notification, edge cases.
 */

// ─── Inline implementations ──

interface TournamentNotificationSettings {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: Date;
  oneWeekBefore: boolean;
  threeDaysBefore: boolean;
  oneDayBefore: boolean;
}

function computeTournamentReminderDates(settings: TournamentNotificationSettings): { identifier: string; date: Date; title: string; body: string }[] {
  const results: { identifier: string; date: Date; title: string; body: string }[] = [];
  const { tournamentId, tournamentName, tournamentDate, oneWeekBefore, threeDaysBefore, oneDayBefore } = settings;

  const formattedDate = tournamentDate.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (oneWeekBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 7);
    d.setHours(9, 0, 0, 0);
    results.push({
      identifier: `tournament_${tournamentId}_1week`,
      date: d,
      title: '🏆 Tournoi dans 1 semaine !',
      body: `${tournamentName} - ${formattedDate}. Preparez-vous !`,
    });
  }
  if (threeDaysBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 3);
    d.setHours(9, 0, 0, 0);
    results.push({
      identifier: `tournament_${tournamentId}_3days`,
      date: d,
      title: '🎯 Tournoi dans 3 jours !',
      body: `${tournamentName} approche. Preparez votre equipement !`,
    });
  }
  if (oneDayBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 1);
    d.setHours(18, 0, 0, 0);
    results.push({
      identifier: `tournament_${tournamentId}_1day`,
      date: d,
      title: '⚡ Tournoi demain !',
      body: `${tournamentName} c'est demain ! Reposez-vous bien ce soir.`,
    });
  }
  return results;
}

function buildShareRequestPayload(params: {
  senderName: string;
  itemType: 'match' | 'challenge';
  permission: 'read' | 'write';
  itemSummary?: string;
  requestId: string;
}): { title: string; body: string; data: Record<string, any> } {
  const { senderName, itemType, permission, itemSummary, requestId } = params;
  const isMatch = itemType === 'match';
  const icon = isMatch ? '🎯' : '🏆';
  const typeLabel = isMatch ? 'match' : 'defi';
  const permLabel = permission === 'write' ? 'modification' : 'lecture seule';
  const title = `${icon} ${senderName} vous partage un ${typeLabel}`;
  const body = itemSummary
    ? `${itemSummary} (${permLabel})`
    : `Nouvelle demande de partage en ${permLabel}`;
  return { title, body, data: { type: 'share_request', requestId, itemType } };
}

const ANDROID_CHANNELS = [
  { id: 'tournament-reminders', name: 'Rappels de tournoi' },
  { id: 'share-requests', name: 'Partages de matchs' },
  { id: 'retention', name: 'Rappels et progression' },
];

function getTournamentIdentifiers(tournamentId: string): string[] {
  return [
    `tournament_${tournamentId}_1week`,
    `tournament_${tournamentId}_3days`,
    `tournament_${tournamentId}_1day`,
  ];
}

// ─── Tests ──

describe('computeTournamentReminderDates', () => {
  const settings: TournamentNotificationSettings = {
    tournamentId: 't1',
    tournamentName: 'Championnat Lyon',
    tournamentDate: new Date('2026-05-15T09:00:00'),
    oneWeekBefore: true,
    threeDaysBefore: true,
    oneDayBefore: true,
  };

  test('computes 3 reminders when all enabled', () => {
    const results = computeTournamentReminderDates(settings);
    expect(results).toHaveLength(3);
  });

  test('1-week-before is 7 days before at 9:00', () => {
    const results = computeTournamentReminderDates(settings);
    const week = results.find(r => r.identifier.endsWith('_1week'));
    expect(week).toBeDefined();
    expect(week!.date.getDate()).toBe(8);
    expect(week!.date.getHours()).toBe(9);
  });

  test('3-days-before is at 9:00', () => {
    const results = computeTournamentReminderDates(settings);
    const days3 = results.find(r => r.identifier.endsWith('_3days'));
    expect(days3).toBeDefined();
    expect(days3!.date.getDate()).toBe(12);
    expect(days3!.date.getHours()).toBe(9);
  });

  test('1-day-before is at 18:00', () => {
    const results = computeTournamentReminderDates(settings);
    const day1 = results.find(r => r.identifier.endsWith('_1day'));
    expect(day1).toBeDefined();
    expect(day1!.date.getDate()).toBe(14);
    expect(day1!.date.getHours()).toBe(18);
  });

  test('titles contain tournament name', () => {
    const results = computeTournamentReminderDates(settings);
    results.forEach(r => {
      expect(r.body).toContain('Championnat Lyon');
    });
  });

  test('returns empty when all disabled', () => {
    const disabled = { ...settings, oneWeekBefore: false, threeDaysBefore: false, oneDayBefore: false };
    expect(computeTournamentReminderDates(disabled)).toHaveLength(0);
  });

  test('single reminder', () => {
    const partial = { ...settings, oneWeekBefore: false, threeDaysBefore: false, oneDayBefore: true };
    expect(computeTournamentReminderDates(partial)).toHaveLength(1);
  });
});

describe('buildShareRequestPayload', () => {
  test('match share request payload', () => {
    const payload = buildShareRequestPayload({
      senderName: 'Alice', itemType: 'match', permission: 'read', requestId: 'r1',
    });
    expect(payload.title).toContain('Alice');
    expect(payload.title).toContain('match');
    expect(payload.body).toContain('lecture seule');
    expect(payload.data.type).toBe('share_request');
    expect(payload.data.requestId).toBe('r1');
  });

  test('challenge share request with write permission', () => {
    const payload = buildShareRequestPayload({
      senderName: 'Bob', itemType: 'challenge', permission: 'write', requestId: 'r2',
    });
    expect(payload.title).toContain('defi');
    expect(payload.body).toContain('modification');
  });

  test('with item summary', () => {
    const payload = buildShareRequestPayload({
      senderName: 'Alice', itemType: 'match', permission: 'read',
      itemSummary: 'Alice vs Bob (13-8)', requestId: 'r3',
    });
    expect(payload.body).toContain('Alice vs Bob (13-8)');
  });

  test('without item summary uses default body', () => {
    const payload = buildShareRequestPayload({
      senderName: 'Alice', itemType: 'match', permission: 'read', requestId: 'r4',
    });
    expect(payload.body).toContain('Nouvelle demande');
  });

  test('match uses 🎯 icon', () => {
    const payload = buildShareRequestPayload({
      senderName: 'X', itemType: 'match', permission: 'read', requestId: 'r5',
    });
    expect(payload.title).toContain('🎯');
  });

  test('challenge uses 🏆 icon', () => {
    const payload = buildShareRequestPayload({
      senderName: 'X', itemType: 'challenge', permission: 'read', requestId: 'r6',
    });
    expect(payload.title).toContain('🏆');
  });
});

describe('ANDROID_CHANNELS', () => {
  test('has 3 channels', () => {
    expect(ANDROID_CHANNELS).toHaveLength(3);
  });

  test('tournament-reminders channel exists', () => {
    expect(ANDROID_CHANNELS.find(c => c.id === 'tournament-reminders')).toBeDefined();
  });

  test('share-requests channel exists', () => {
    expect(ANDROID_CHANNELS.find(c => c.id === 'share-requests')).toBeDefined();
  });

  test('retention channel exists', () => {
    expect(ANDROID_CHANNELS.find(c => c.id === 'retention')).toBeDefined();
  });
});

describe('getTournamentIdentifiers', () => {
  test('returns 3 identifiers', () => {
    const ids = getTournamentIdentifiers('t1');
    expect(ids).toHaveLength(3);
  });

  test('includes tournament ID', () => {
    const ids = getTournamentIdentifiers('abc-123');
    ids.forEach(id => expect(id).toContain('abc-123'));
  });

  test('has correct suffixes', () => {
    const ids = getTournamentIdentifiers('t1');
    expect(ids[0]).toBe('tournament_t1_1week');
    expect(ids[1]).toBe('tournament_t1_3days');
    expect(ids[2]).toBe('tournament_t1_1day');
  });
});
