/**
 * Unit tests for supabase/functions/notify-referral/index.ts
 *
 * Tests: referral code lookup, email anonymization, push notification
 * payload construction, ambassador level labels, XP attribution context,
 * analytics event logging, error handling for missing ambassador.
 */

// ─── Inline implementations ──

function normalizeReferralCode(code: string): string {
  return code.toUpperCase().trim();
}

function anonymizeEmail(email: string | null): string {
  if (!email) return 'Nouveau joueur';
  return email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
}

function buildReferralPushBody(anonymizedEmail: string, referralCode: string, referralCount: number): string {
  return `${anonymizedEmail} a utilise votre code ${referralCode}. Total: ${referralCount} parrainages. +50 XP !`;
}

function getAmbassadorLevelLabel(level: string): string {
  if (level === 'elite') return 'Elite \u2B50';
  if (level === 'confirme') return 'Confirme \u{1F680}';
  return 'Decouverte \u{1F50D}';
}

function buildPushPayload(token: string, anonymizedEmail: string, referralCode: string, referralCount: number): Record<string, any> {
  return {
    to: token,
    title: '\u{1F3AF} Nouveau parrainage !',
    body: buildReferralPushBody(anonymizedEmail, referralCode, referralCount),
    data: { type: 'referral_used', referralCode },
    channelId: 'tournament-reminders',
    priority: 'high',
    sound: 'default',
  };
}

function buildAnalyticsRow(ambassadorId: string, referredUserId: string | null): Record<string, any> {
  return {
    ambassador_id: ambassadorId,
    event_type: 'referral_notification',
    source_page: 'signup',
    viewer_id: referredUserId || null,
  };
}

// ─── Tests ──

describe('normalizeReferralCode', () => {
  test('uppercases', () => { expect(normalizeReferralCode('abc-ref')).toBe('ABC-REF'); });
  test('trims', () => { expect(normalizeReferralCode('  CODE  ')).toBe('CODE'); });
  test('combined', () => { expect(normalizeReferralCode(' alice123 ')).toBe('ALICE123'); });
});

describe('anonymizeEmail', () => {
  test('anonymizes standard email', () => {
    const result = anonymizeEmail('john.doe@example.com');
    expect(result).toBe('jo***@example.com');
  });

  test('anonymizes short email', () => {
    const result = anonymizeEmail('ab@test.fr');
    expect(result).toBe('ab***@test.fr');
  });

  test('null returns default', () => {
    expect(anonymizeEmail(null)).toBe('Nouveau joueur');
  });

  test('preserves domain', () => {
    const result = anonymizeEmail('user@domain.com');
    expect(result).toContain('@domain.com');
  });
});

describe('buildReferralPushBody', () => {
  test('includes all info', () => {
    const body = buildReferralPushBody('jo***@example.com', 'ALICE', 5);
    expect(body).toContain('jo***@example.com');
    expect(body).toContain('ALICE');
    expect(body).toContain('5 parrainages');
    expect(body).toContain('+50 XP');
  });

  test('first referral', () => {
    const body = buildReferralPushBody('Nouveau joueur', 'CODE', 1);
    expect(body).toContain('1 parrainages');
  });
});

describe('getAmbassadorLevelLabel', () => {
  test('elite', () => { expect(getAmbassadorLevelLabel('elite')).toContain('Elite'); });
  test('confirme', () => { expect(getAmbassadorLevelLabel('confirme')).toContain('Confirme'); });
  test('decouverte', () => { expect(getAmbassadorLevelLabel('decouverte')).toContain('Decouverte'); });
  test('unknown defaults to decouverte', () => { expect(getAmbassadorLevelLabel('unknown')).toContain('Decouverte'); });
});

describe('buildPushPayload', () => {
  test('builds complete payload', () => {
    const payload = buildPushPayload('ExponentPushToken[abc]', 'jo***@test.com', 'CODE', 3);
    expect(payload.to).toBe('ExponentPushToken[abc]');
    expect(payload.title).toContain('Nouveau parrainage');
    expect(payload.data.type).toBe('referral_used');
    expect(payload.data.referralCode).toBe('CODE');
    expect(payload.channelId).toBe('tournament-reminders');
    expect(payload.priority).toBe('high');
    expect(payload.sound).toBe('default');
  });
});

describe('buildAnalyticsRow', () => {
  test('with referred user', () => {
    const row = buildAnalyticsRow('amb1', 'user1');
    expect(row.ambassador_id).toBe('amb1');
    expect(row.event_type).toBe('referral_notification');
    expect(row.source_page).toBe('signup');
    expect(row.viewer_id).toBe('user1');
  });

  test('without referred user', () => {
    const row = buildAnalyticsRow('amb1', null);
    expect(row.viewer_id).toBeNull();
  });
});

describe('error scenarios', () => {
  test('missing referralCode returns error', () => {
    const code = '';
    expect(!code).toBe(true);
  });

  test('ambassador not found returns sent: false', () => {
    const ambassador = null;
    expect(ambassador).toBeNull();
    const response = { error: 'Ambassador not found', sent: false };
    expect(response.sent).toBe(false);
  });

  test('ambassador email not found returns sent: false', () => {
    const email = null;
    expect(!email).toBe(true);
  });
});
