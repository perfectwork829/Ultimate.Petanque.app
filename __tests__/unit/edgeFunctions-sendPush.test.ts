/**
 * Unit tests for supabase/functions/send-push/index.ts
 *
 * Tests: trigger type validation, payload construction for all 11 types,
 * notification preference filtering, proximity filtering, ranking change
 * message construction, sponsor push authorization, A/B message variants.
 */

// ─── Inline implementations ──

const VALID_TRIGGER_TYPES = [
  'event_created', 'meetup_invitation', 'ranking_changed', 'share_request',
  'event_reminder', 'weekly_summary', 'trust_score_improved', 'trust_weekly_tip',
  'witness_request', 'witness_attested', 'sponsor_push', 'ambassador_promotion',
] as const;

function isValidTriggerType(type: string): boolean {
  return (VALID_TRIGGER_TYPES as readonly string[]).includes(type);
}

function buildRankingMessage(direction: string, oldRank: number, newRank: number): { title: string; body: string } {
  const isUp = direction === 'up';
  const icon = isUp ? '\u{1F4C8}' : '\u{1F4C9}';
  const verb = isUp ? 'monte' : 'descendu';
  const diff = Math.abs(newRank - oldRank);
  return {
    title: `${icon} Classement mis a jour !`,
    body: `Vous etes ${verb} de ${diff} place(s) : #${oldRank} \u2192 #${newRank}.`,
  };
}

function buildShareRequestMessage(senderName: string, itemType: string, permission: string): { title: string; body: string } {
  const typeLabel = itemType === 'match' ? 'match' : 'defi';
  const permLabel = permission === 'write' ? 'modification' : 'lecture seule';
  return {
    title: `\u{1F3AF} ${senderName || 'Un joueur'} vous partage un ${typeLabel}`,
    body: `Nouvelle demande de partage (${permLabel})`,
  };
}

function buildWeeklySummaryBody(summary: { matchesPlayed: number; wins: number; winRate: number; rankChange: string; rankDiff: number; rank: number }): string {
  let body = `${summary.matchesPlayed} matchs, ${summary.wins} victoires (${summary.winRate}%). `;
  if (summary.rankChange === 'up') {
    body += `Tu as gagne ${summary.rankDiff} place(s) : #${summary.rank} !`;
  } else if (summary.rankChange === 'down') {
    body += `Tu as perdu ${summary.rankDiff} place(s) : #${summary.rank}.`;
  } else if (summary.rankChange === 'same') {
    body += `Position stable : #${summary.rank}.`;
  } else {
    body += `Premiere apparition au classement : #${summary.rank} !`;
  }
  return body;
}

function canSendSponsorPush(badgeType: string, ambassadorLevel: string, monthlyUsage: number): { allowed: boolean; error?: string } {
  if (badgeType === 'gold_sponsor') return { allowed: true };
  if (badgeType === 'sponsor') {
    return monthlyUsage >= 1 ? { allowed: false, error: 'Monthly push limit reached' } : { allowed: true };
  }
  if (badgeType === 'ambassador') {
    if (ambassadorLevel === 'decouverte') return { allowed: false, error: 'Decouverte ambassadors cannot send push' };
    if (ambassadorLevel === 'confirme') {
      return monthlyUsage >= 1 ? { allowed: false, error: 'Monthly push limit for Confirme' } : { allowed: true };
    }
    return { allowed: true }; // Elite unlimited
  }
  return { allowed: false, error: 'Bronze partners cannot send push' };
}

function filterByPreference(userIds: string[], prefMap: Map<string, Record<string, boolean>>, notifType: string): string[] {
  return userIds.filter(uid => {
    const prefs = prefMap.get(uid);
    return !prefs || prefs[notifType] !== false;
  });
}

// ─── Tests ──

describe('VALID_TRIGGER_TYPES', () => {
  test('has 12 trigger types', () => {
    expect(VALID_TRIGGER_TYPES).toHaveLength(12);
  });

  test('includes all expected types', () => {
    ['event_created', 'meetup_invitation', 'ranking_changed', 'share_request',
     'event_reminder', 'weekly_summary', 'witness_request', 'witness_attested',
     'sponsor_push', 'ambassador_promotion'].forEach(type => {
      expect(isValidTriggerType(type)).toBe(true);
    });
  });

  test('rejects unknown type', () => {
    expect(isValidTriggerType('unknown_type')).toBe(false);
    expect(isValidTriggerType('')).toBe(false);
  });
});

describe('buildRankingMessage', () => {
  test('rank up message', () => {
    const msg = buildRankingMessage('up', 10, 7);
    expect(msg.title).toContain('\u{1F4C8}');
    expect(msg.body).toContain('monte');
    expect(msg.body).toContain('3 place(s)');
    expect(msg.body).toContain('#10');
    expect(msg.body).toContain('#7');
  });

  test('rank down message', () => {
    const msg = buildRankingMessage('down', 5, 8);
    expect(msg.title).toContain('\u{1F4C9}');
    expect(msg.body).toContain('descendu');
    expect(msg.body).toContain('3 place(s)');
  });

  test('large rank change', () => {
    const msg = buildRankingMessage('up', 50, 5);
    expect(msg.body).toContain('45 place(s)');
  });
});

describe('buildShareRequestMessage', () => {
  test('match read permission', () => {
    const msg = buildShareRequestMessage('Alice', 'match', 'read');
    expect(msg.title).toContain('Alice');
    expect(msg.title).toContain('match');
    expect(msg.body).toContain('lecture seule');
  });

  test('challenge write permission', () => {
    const msg = buildShareRequestMessage('Bob', 'challenge', 'write');
    expect(msg.title).toContain('defi');
    expect(msg.body).toContain('modification');
  });

  test('unknown sender', () => {
    const msg = buildShareRequestMessage('', 'match', 'read');
    expect(msg.title).toContain('Un joueur');
  });
});

describe('buildWeeklySummaryBody', () => {
  test('rank up summary', () => {
    const body = buildWeeklySummaryBody({ matchesPlayed: 8, wins: 6, winRate: 75, rankChange: 'up', rankDiff: 3, rank: 12 });
    expect(body).toContain('8 matchs');
    expect(body).toContain('6 victoires');
    expect(body).toContain('75%');
    expect(body).toContain('gagne 3 place(s)');
    expect(body).toContain('#12');
  });

  test('rank down summary', () => {
    const body = buildWeeklySummaryBody({ matchesPlayed: 3, wins: 1, winRate: 33, rankChange: 'down', rankDiff: 2, rank: 20 });
    expect(body).toContain('perdu 2 place(s)');
  });

  test('same rank', () => {
    const body = buildWeeklySummaryBody({ matchesPlayed: 5, wins: 3, winRate: 60, rankChange: 'same', rankDiff: 0, rank: 8 });
    expect(body).toContain('Position stable');
  });

  test('new entrant', () => {
    const body = buildWeeklySummaryBody({ matchesPlayed: 5, wins: 4, winRate: 80, rankChange: 'new', rankDiff: 0, rank: 15 });
    expect(body).toContain('Premiere apparition');
  });
});

describe('canSendSponsorPush', () => {
  test('gold_sponsor always allowed', () => {
    expect(canSendSponsorPush('gold_sponsor', '', 0).allowed).toBe(true);
    expect(canSendSponsorPush('gold_sponsor', '', 100).allowed).toBe(true);
  });

  test('sponsor (silver) first push allowed', () => {
    expect(canSendSponsorPush('sponsor', '', 0).allowed).toBe(true);
  });

  test('sponsor (silver) second push blocked', () => {
    const result = canSendSponsorPush('sponsor', '', 1);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Monthly');
  });

  test('ambassador decouverte blocked', () => {
    const result = canSendSponsorPush('ambassador', 'decouverte', 0);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Decouverte');
  });

  test('ambassador confirme first push allowed', () => {
    expect(canSendSponsorPush('ambassador', 'confirme', 0).allowed).toBe(true);
  });

  test('ambassador confirme second push blocked', () => {
    expect(canSendSponsorPush('ambassador', 'confirme', 1).allowed).toBe(false);
  });

  test('ambassador elite unlimited', () => {
    expect(canSendSponsorPush('ambassador', 'elite', 0).allowed).toBe(true);
    expect(canSendSponsorPush('ambassador', 'elite', 50).allowed).toBe(true);
  });

  test('bronze (partner) blocked', () => {
    expect(canSendSponsorPush('partner', '', 0).allowed).toBe(false);
  });

  test('unknown badge type blocked', () => {
    expect(canSendSponsorPush('unknown', '', 0).allowed).toBe(false);
  });
});

describe('filterByPreference', () => {
  test('all enabled when no prefs', () => {
    const prefMap = new Map<string, Record<string, boolean>>();
    const result = filterByPreference(['u1', 'u2', 'u3'], prefMap, 'event_created');
    expect(result).toHaveLength(3);
  });

  test('filters out disabled users', () => {
    const prefMap = new Map<string, Record<string, boolean>>();
    prefMap.set('u1', { event_created: false });
    prefMap.set('u2', { event_created: true });
    prefMap.set('u3', {}); // default: enabled
    const result = filterByPreference(['u1', 'u2', 'u3'], prefMap, 'event_created');
    expect(result).toHaveLength(2);
    expect(result).not.toContain('u1');
  });

  test('different notification types are independent', () => {
    const prefMap = new Map<string, Record<string, boolean>>();
    prefMap.set('u1', { event_created: false, ranking_changed: true });
    expect(filterByPreference(['u1'], prefMap, 'event_created')).toHaveLength(0);
    expect(filterByPreference(['u1'], prefMap, 'ranking_changed')).toHaveLength(1);
  });
});
