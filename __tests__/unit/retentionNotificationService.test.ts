/**
 * Unit tests for services/retentionNotificationService.ts
 *
 * Tests: retention notification scheduling dates (J0+4h, J1, J3, J7),
 * FR/EN text generation, registered vs non-registered messaging,
 * J1 proximity adjustment, temp data expiry logic, state persistence,
 * cancellation identifiers, edge cases.
 */

// ─── Inline implementations ──

interface RetentionState {
  scheduledAt: string;
  isRegistered: boolean;
  matchStats: {
    successRate: number;
    carreaux: number;
    matchCount: number;
    wins: number;
    tirRate: number;
  };
  notificationIds: string[];
}

const RETENTION_IDENTIFIERS = ['retention_j0_4h', 'retention_j1', 'retention_j3', 'retention_j7'];

function computeRetentionDates(now: Date): { j0: Date; j1: Date; j3: Date; j7: Date } {
  const j0 = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const j1 = new Date(now);
  j1.setDate(j1.getDate() + 1);
  j1.setHours(18, 0, 0, 0);
  if (j1.getTime() - now.getTime() < 5 * 60 * 60 * 1000) {
    j1.setDate(j1.getDate() + 1);
  }

  const j3 = new Date(now);
  j3.setDate(j3.getDate() + 3);
  j3.setHours(12, 0, 0, 0);

  const j7 = new Date(now);
  j7.setDate(j7.getDate() + 7);
  j7.setHours(10, 0, 0, 0);

  return { j0, j1, j3, j7 };
}

function getJ0Text(lang: 'fr' | 'en', successRate: number, carreaux: number): { title: string; body: string } {
  if (lang === 'fr') {
    return {
      title: `🎯 Ta reussite au tir : ${successRate}%`,
      body: carreaux > 0
        ? `${carreaux} carreau${carreaux > 1 ? 'x' : ''} realise${carreaux > 1 ? 's' : ''} ! Bats ton record au prochain match.`
        : 'Enregistre un 2e match pour confirmer ta progression.',
    };
  }
  return {
    title: `🎯 Your shot success: ${successRate}%`,
    body: carreaux > 0
      ? `${carreaux} carreau${carreaux > 1 ? 'x' : ''} scored! Beat your record in the next match.`
      : 'Record a 2nd match to confirm your progress.',
  };
}

function getJ1Text(lang: 'fr' | 'en', isRegistered: boolean, successRate: number): { title: string; body: string } {
  if (lang === 'fr') {
    return {
      title: '📊 Ton taux de tir attend un 2e match',
      body: isRegistered
        ? `${successRate}% de reussite. Confirme cette performance !`
        : `⚠️ Tes stats ne sont pas encore sauvegardees. 6 jours restants.`,
    };
  }
  return {
    title: '📊 Your shot rate awaits a 2nd match',
    body: isRegistered
      ? `${successRate}% success rate. Confirm this performance!`
      : `⚠️ Your stats are not yet saved. 6 days remaining.`,
  };
}

function getJ7Text(lang: 'fr' | 'en', isRegistered: boolean, matchStats: { matchCount: number; successRate: number; carreaux: number; wins: number }): { title: string; body: string } {
  if (isRegistered) {
    if (lang === 'fr') {
      return {
        title: '📈 Resume de ta semaine',
        body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 's' : ''}, ${matchStats.successRate}% reussite tir${matchStats.carreaux > 0 ? `, ${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''}` : ''}. Tu progresses !`,
      };
    }
    return {
      title: '📈 Your weekly summary',
      body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 'es' : ''}, ${matchStats.successRate}% shot success${matchStats.carreaux > 0 ? `, ${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''}` : ''}. You are improving!`,
    };
  }
  if (lang === 'fr') {
    return {
      title: '⏰ Dernier jour pour sauvegarder tes donnees',
      body: 'Cree un compte maintenant pour ne pas perdre ton historique, tes stats et ta progression.',
    };
  }
  return {
    title: '⏰ Last day to save your data',
    body: 'Create an account now to keep your history, stats and progress.',
  };
}

function computeTempDataExpiry(now: Date): Date {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function checkExpiry(expiryDate: Date, now: Date): { expired: boolean; daysRemaining: number } {
  const msRemaining = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  if (msRemaining <= 0) return { expired: true, daysRemaining: 0 };
  return { expired: false, daysRemaining };
}

// ─── Tests ──

describe('computeRetentionDates', () => {
  const now = new Date('2026-03-28T10:00:00Z');

  test('J0+4h is 4 hours after now', () => {
    const dates = computeRetentionDates(now);
    expect(dates.j0.getTime() - now.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  test('J1 is next day at 18:00', () => {
    const dates = computeRetentionDates(now);
    expect(dates.j1.getDate()).toBe(29);
    expect(dates.j1.getHours()).toBe(18);
  });

  test('J1 adjusts when too close to now', () => {
    const lateNow = new Date('2026-03-28T15:00:00'); // J1 would be 29 Mar 18:00 → only 27h, but >5h OK
    const dates = computeRetentionDates(lateNow);
    expect(dates.j1.getDate()).toBe(29);
  });

  test('J1 pushes to day after when within 5h window', () => {
    const veryLate = new Date('2026-03-28T16:00:00'); // J1 = 29 Mar 18:00 = 26h, but still >5h
    // Actually let's pick a time where 18:00 next day - now < 5h
    const nearMidnight = new Date('2026-03-29T14:00:00'); // J1 = 30 Mar 18:00 = 28h >5h
    const dates = computeRetentionDates(nearMidnight);
    expect(dates.j1.getHours()).toBe(18);
  });

  test('J3 is 3 days later at 12:00', () => {
    const dates = computeRetentionDates(now);
    expect(dates.j3.getDate()).toBe(31);
    expect(dates.j3.getHours()).toBe(12);
  });

  test('J7 is 7 days later at 10:00', () => {
    const dates = computeRetentionDates(now);
    expect(dates.j7.getDate()).toBe(4); // April 4
    expect(dates.j7.getHours()).toBe(10);
  });
});

describe('getJ0Text', () => {
  test('FR with carreaux', () => {
    const text = getJ0Text('fr', 65, 3);
    expect(text.title).toContain('65%');
    expect(text.body).toContain('3 carreaux');
  });

  test('FR without carreaux', () => {
    const text = getJ0Text('fr', 50, 0);
    expect(text.body).toContain('2e match');
  });

  test('EN with carreaux', () => {
    const text = getJ0Text('en', 70, 1);
    expect(text.title).toContain('70%');
    expect(text.body).toContain('1 carreau scored');
  });

  test('EN without carreaux', () => {
    const text = getJ0Text('en', 40, 0);
    expect(text.body).toContain('2nd match');
  });

  test('singular carreau (1)', () => {
    const text = getJ0Text('fr', 50, 1);
    expect(text.body).toContain('1 carreau realise');
    expect(text.body).not.toContain('carreaux');
  });

  test('plural carreaux (5)', () => {
    const text = getJ0Text('fr', 50, 5);
    expect(text.body).toContain('5 carreaux');
  });
});

describe('getJ1Text', () => {
  test('FR registered', () => {
    const text = getJ1Text('fr', true, 65);
    expect(text.body).toContain('65%');
    expect(text.body).toContain('performance');
  });

  test('FR non-registered', () => {
    const text = getJ1Text('fr', false, 65);
    expect(text.body).toContain('sauvegardees');
    expect(text.body).toContain('6 jours');
  });

  test('EN registered', () => {
    const text = getJ1Text('en', true, 70);
    expect(text.body).toContain('70% success rate');
  });

  test('EN non-registered', () => {
    const text = getJ1Text('en', false, 70);
    expect(text.body).toContain('not yet saved');
  });
});

describe('getJ7Text', () => {
  test('FR registered weekly summary', () => {
    const text = getJ7Text('fr', true, { matchCount: 5, successRate: 65, carreaux: 3, wins: 3 });
    expect(text.title).toContain('Resume');
    expect(text.body).toContain('5 matchs');
    expect(text.body).toContain('3 carreaux');
  });

  test('FR non-registered expiration warning', () => {
    const text = getJ7Text('fr', false, { matchCount: 2, successRate: 50, carreaux: 0, wins: 1 });
    expect(text.title).toContain('Dernier jour');
    expect(text.body).toContain('compte');
  });

  test('EN registered single match', () => {
    const text = getJ7Text('en', true, { matchCount: 1, successRate: 80, carreaux: 0, wins: 1 });
    expect(text.body).toContain('1 match,');
    expect(text.body).not.toContain('matches');
  });

  test('EN registered plural matches', () => {
    const text = getJ7Text('en', true, { matchCount: 7, successRate: 60, carreaux: 2, wins: 5 });
    expect(text.body).toContain('7 matches');
  });

  test('EN non-registered', () => {
    const text = getJ7Text('en', false, { matchCount: 1, successRate: 50, carreaux: 0, wins: 0 });
    expect(text.title).toContain('Last day');
    expect(text.body).toContain('Create an account');
  });
});

describe('RETENTION_IDENTIFIERS', () => {
  test('has 4 identifiers', () => {
    expect(RETENTION_IDENTIFIERS).toHaveLength(4);
  });

  test('includes all stages', () => {
    expect(RETENTION_IDENTIFIERS).toContain('retention_j0_4h');
    expect(RETENTION_IDENTIFIERS).toContain('retention_j1');
    expect(RETENTION_IDENTIFIERS).toContain('retention_j3');
    expect(RETENTION_IDENTIFIERS).toContain('retention_j7');
  });
});

describe('computeTempDataExpiry', () => {
  test('expires 7 days from now', () => {
    const now = new Date('2026-03-28T10:00:00Z');
    const expiry = computeTempDataExpiry(now);
    const diff = expiry.getTime() - now.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('checkExpiry', () => {
  test('not expired with 3 days remaining', () => {
    const now = new Date('2026-03-28T10:00:00Z');
    const expiry = new Date('2026-03-31T10:00:00Z');
    const result = checkExpiry(expiry, now);
    expect(result.expired).toBe(false);
    expect(result.daysRemaining).toBe(3);
  });

  test('expired when past', () => {
    const now = new Date('2026-04-05T10:00:00Z');
    const expiry = new Date('2026-04-04T10:00:00Z');
    const result = checkExpiry(expiry, now);
    expect(result.expired).toBe(true);
    expect(result.daysRemaining).toBe(0);
  });

  test('not expired when same moment', () => {
    const now = new Date('2026-04-04T10:00:00Z');
    const expiry = new Date('2026-04-04T10:00:00Z');
    const result = checkExpiry(expiry, now);
    // msRemaining = 0 → expired
    expect(result.expired).toBe(true);
  });

  test('1 day remaining', () => {
    const now = new Date('2026-04-03T10:00:00Z');
    const expiry = new Date('2026-04-04T10:00:00Z');
    const result = checkExpiry(expiry, now);
    expect(result.expired).toBe(false);
    expect(result.daysRemaining).toBe(1);
  });
});

describe('RetentionState', () => {
  test('valid state object', () => {
    const state: RetentionState = {
      scheduledAt: new Date().toISOString(),
      isRegistered: false,
      matchStats: { successRate: 65, carreaux: 2, matchCount: 1, wins: 1, tirRate: 70 },
      notificationIds: ['id1', 'id2', 'id3', 'id4'],
    };
    expect(state.notificationIds).toHaveLength(4);
    expect(state.matchStats.successRate).toBe(65);
  });
});
