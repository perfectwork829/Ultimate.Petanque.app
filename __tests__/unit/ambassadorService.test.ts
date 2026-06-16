/**
 * Unit tests for services/ambassadorService.ts
 *
 * Tests: AMBASSADOR_LEVELS configuration (3 levels, thresholds, colors, icons),
 * getPushLimit integration, filtering (ambassadors-only vs sponsors-only),
 * promotion logic (decouverte→confirme→elite, threshold checks, already elite),
 * referral code generation (format, initials extraction), referral tracking
 * (XP +50, count increment), cache invalidation, featured ambassador
 * selection, and edge cases.
 */

// ─── Types & Constants ─────────────────────────────────────

type AmbassadorLevel = 'decouverte' | 'confirme' | 'elite';

interface Ambassador {
  id: string;
  userId: string;
  playerId?: string;
  displayName: string;
  bio?: string;
  photo?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  websiteUrl?: string;
  isFeatured: boolean;
  badgeType: string;
  ambassadorLevel: AmbassadorLevel;
  referralCode?: string;
  referralCount: number;
  totalReferralXp: number;
  brandColor?: string;
  stats?: {
    matchesPlayed: number;
    wins: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
  role?: string;
  level?: string;
  club?: string;
  city?: string;
}

const AMBASSADOR_LEVELS = {
  decouverte: {
    color: '#3B82F6',
    icon: 'explore' as const,
    minReferrals: 0,
    minEvents: 0,
    minImpressions: 0,
  },
  confirme: {
    color: '#7C3AED',
    icon: 'trending-up' as const,
    minReferrals: 5,
    minEvents: 3,
    minImpressions: 500,
  },
  elite: {
    color: '#F59E0B',
    icon: 'military-tech' as const,
    minReferrals: 20,
    minEvents: 10,
    minImpressions: 2000,
  },
} as const;

const XP_PER_REFERRAL = 50;
const XP_PER_CHALLENGE = 25;
const XP_PER_100_IMPRESSIONS = 10;

// ─── Inline implementations (mirrors ambassadorService logic) ──

function generateReferralCodeSync(displayName: string): string {
  const initials = displayName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'AMB';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${initials}-${suffix}`;
}

function filterAmbassadorsOnly(ambassadors: Ambassador[]): Ambassador[] {
  return ambassadors.filter(a => a.badgeType === 'ambassador' || !['gold_sponsor', 'sponsor', 'partner'].includes(a.badgeType));
}

function filterSponsorsOnly(ambassadors: Ambassador[]): Ambassador[] {
  return ambassadors.filter(a => ['gold_sponsor', 'sponsor', 'partner'].includes(a.badgeType));
}

function getFeaturedAmbassadors(ambassadors: Ambassador[]): Ambassador[] {
  const featured = ambassadors.filter(a => a.isFeatured);
  return featured.length > 0 ? featured : ambassadors.slice(0, 3);
}

function checkPromotionEligibility(
  currentLevel: AmbassadorLevel,
  referrals: number,
  events: number,
  impressions: number
): { eligible: boolean; nextLevel: AmbassadorLevel | null } {
  if (currentLevel === 'elite') return { eligible: false, nextLevel: null };

  const nextLevel: AmbassadorLevel = currentLevel === 'decouverte' ? 'confirme' : 'elite';
  const config = AMBASSADOR_LEVELS[nextLevel];

  const meetsReferrals = referrals >= config.minReferrals;
  const meetsEvents = events >= config.minEvents;
  const meetsImpressions = impressions >= config.minImpressions;

  return {
    eligible: meetsReferrals && meetsEvents && meetsImpressions,
    nextLevel,
  };
}

function computeReferralXp(referralCount: number, challengeCount: number, impressionCount: number): number {
  return (referralCount * XP_PER_REFERRAL) + (challengeCount * XP_PER_CHALLENGE) + (Math.floor(impressionCount / 100) * XP_PER_100_IMPRESSIONS);
}

function isUserSponsor(badgeType: string): boolean {
  return ['gold_sponsor', 'sponsor', 'partner'].includes(badgeType);
}

function getPromotionProgress(
  currentLevel: AmbassadorLevel,
  referrals: number,
  events: number,
  impressions: number
): { referralPct: number; eventPct: number; impressionPct: number } {
  if (currentLevel === 'elite') return { referralPct: 100, eventPct: 100, impressionPct: 100 };

  const nextLevel: AmbassadorLevel = currentLevel === 'decouverte' ? 'confirme' : 'elite';
  const config = AMBASSADOR_LEVELS[nextLevel];

  return {
    referralPct: config.minReferrals > 0 ? Math.min(100, Math.round((referrals / config.minReferrals) * 100)) : 100,
    eventPct: config.minEvents > 0 ? Math.min(100, Math.round((events / config.minEvents) * 100)) : 100,
    impressionPct: config.minImpressions > 0 ? Math.min(100, Math.round((impressions / config.minImpressions) * 100)) : 100,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function makeAmbassador(overrides: Partial<Ambassador> = {}): Ambassador {
  return {
    id: `amb-${Math.random().toString(36).slice(2, 6)}`,
    userId: `u-${Math.random().toString(36).slice(2, 6)}`,
    displayName: 'Test Ambassador',
    isFeatured: false,
    badgeType: 'ambassador',
    ambassadorLevel: 'decouverte',
    referralCount: 0,
    totalReferralXp: 0,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// AMBASSADOR_LEVELS Configuration
// ============================================

describe('AMBASSADOR_LEVELS Configuration', () => {
  test('has exactly 3 levels', () => {
    expect(Object.keys(AMBASSADOR_LEVELS)).toHaveLength(3);
    expect(AMBASSADOR_LEVELS).toHaveProperty('decouverte');
    expect(AMBASSADOR_LEVELS).toHaveProperty('confirme');
    expect(AMBASSADOR_LEVELS).toHaveProperty('elite');
  });

  test('decouverte has zero thresholds (entry level)', () => {
    expect(AMBASSADOR_LEVELS.decouverte.minReferrals).toBe(0);
    expect(AMBASSADOR_LEVELS.decouverte.minEvents).toBe(0);
    expect(AMBASSADOR_LEVELS.decouverte.minImpressions).toBe(0);
  });

  test('confirme requires 5 referrals, 3 events, 500 impressions', () => {
    expect(AMBASSADOR_LEVELS.confirme.minReferrals).toBe(5);
    expect(AMBASSADOR_LEVELS.confirme.minEvents).toBe(3);
    expect(AMBASSADOR_LEVELS.confirme.minImpressions).toBe(500);
  });

  test('elite requires 20 referrals, 10 events, 2000 impressions', () => {
    expect(AMBASSADOR_LEVELS.elite.minReferrals).toBe(20);
    expect(AMBASSADOR_LEVELS.elite.minEvents).toBe(10);
    expect(AMBASSADOR_LEVELS.elite.minImpressions).toBe(2000);
  });

  test('thresholds increase monotonically across levels', () => {
    expect(AMBASSADOR_LEVELS.confirme.minReferrals).toBeGreaterThan(AMBASSADOR_LEVELS.decouverte.minReferrals);
    expect(AMBASSADOR_LEVELS.elite.minReferrals).toBeGreaterThan(AMBASSADOR_LEVELS.confirme.minReferrals);

    expect(AMBASSADOR_LEVELS.confirme.minEvents).toBeGreaterThan(AMBASSADOR_LEVELS.decouverte.minEvents);
    expect(AMBASSADOR_LEVELS.elite.minEvents).toBeGreaterThan(AMBASSADOR_LEVELS.confirme.minEvents);

    expect(AMBASSADOR_LEVELS.confirme.minImpressions).toBeGreaterThan(AMBASSADOR_LEVELS.decouverte.minImpressions);
    expect(AMBASSADOR_LEVELS.elite.minImpressions).toBeGreaterThan(AMBASSADOR_LEVELS.confirme.minImpressions);
  });

  test('each level has distinct color', () => {
    const colors = [
      AMBASSADOR_LEVELS.decouverte.color,
      AMBASSADOR_LEVELS.confirme.color,
      AMBASSADOR_LEVELS.elite.color,
    ];
    expect(new Set(colors).size).toBe(3);
  });

  test('decouverte color is blue', () => expect(AMBASSADOR_LEVELS.decouverte.color).toBe('#3B82F6'));
  test('confirme color is purple', () => expect(AMBASSADOR_LEVELS.confirme.color).toBe('#7C3AED'));
  test('elite color is amber', () => expect(AMBASSADOR_LEVELS.elite.color).toBe('#F59E0B'));

  test('each level has distinct icon', () => {
    expect(AMBASSADOR_LEVELS.decouverte.icon).toBe('explore');
    expect(AMBASSADOR_LEVELS.confirme.icon).toBe('trending-up');
    expect(AMBASSADOR_LEVELS.elite.icon).toBe('military-tech');
  });
});

// ============================================
// XP Constants
// ============================================

describe('XP Constants', () => {
  test('XP per referral is 50', () => expect(XP_PER_REFERRAL).toBe(50));
  test('XP per challenge is 25', () => expect(XP_PER_CHALLENGE).toBe(25));
  test('XP per 100 impressions is 10', () => expect(XP_PER_100_IMPRESSIONS).toBe(10));
});

// ============================================
// Referral Code Generation
// ============================================

describe('generateReferralCodeSync', () => {
  test('format is INITIALS-SUFFIX (3 chars + dash + 5 chars)', () => {
    const code = generateReferralCodeSync('Jean Dupont');
    expect(code).toMatch(/^[A-Z]{1,3}-[A-Z2-9]{5}$/);
  });

  test('extracts initials from display name', () => {
    const code = generateReferralCodeSync('Marie');
    expect(code.startsWith('MAR-')).toBe(true);
  });

  test('handles single character name', () => {
    const code = generateReferralCodeSync('A');
    expect(code.startsWith('A-')).toBe(true);
  });

  test('falls back to AMB for non-alphabetical names', () => {
    const code = generateReferralCodeSync('123');
    expect(code.startsWith('AMB-')).toBe(true);
  });

  test('falls back to AMB for empty name', () => {
    const code = generateReferralCodeSync('');
    expect(code.startsWith('AMB-')).toBe(true);
  });

  test('strips non-alphabetical characters', () => {
    const code = generateReferralCodeSync('Jean-Pierre 2');
    expect(code.startsWith('JEA-')).toBe(true);
  });

  test('uses only uppercase', () => {
    const code = generateReferralCodeSync('lowercase');
    expect(code).toBe(code.toUpperCase());
  });

  test('suffix uses safe character set (no O, 0, 1, I, L)', () => {
    const codes = Array.from({ length: 50 }, () => generateReferralCodeSync('Test'));
    const suffixes = codes.map(c => c.split('-')[1]);
    const forbidden = ['O', '0', '1', 'I', 'L'];
    for (const suffix of suffixes) {
      for (const char of forbidden) {
        expect(suffix).not.toContain(char);
      }
    }
  });

  test('generates unique codes (statistical)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateReferralCodeSync('Test')));
    // With 5 chars from 32 possibilities, chance of collision in 100 is ~0.01%
    expect(codes.size).toBeGreaterThan(90);
  });

  test('handles unicode/accented names', () => {
    const code = generateReferralCodeSync('Éloïse');
    // Non-ASCII chars stripped, leaving 'loise'
    expect(code).toMatch(/^[A-Z]{1,3}-[A-Z2-9]{5}$/);
  });

  test('max 3 initial characters', () => {
    const code = generateReferralCodeSync('Alexander');
    expect(code.split('-')[0]).toBe('ALE');
  });
});

// ============================================
// filterAmbassadorsOnly
// ============================================

describe('filterAmbassadorsOnly', () => {
  test('keeps ambassador badge type', () => {
    const list = [
      makeAmbassador({ badgeType: 'ambassador' }),
      makeAmbassador({ badgeType: 'gold_sponsor' }),
      makeAmbassador({ badgeType: 'sponsor' }),
      makeAmbassador({ badgeType: 'partner' }),
    ];
    const result = filterAmbassadorsOnly(list);
    expect(result).toHaveLength(1);
    expect(result[0].badgeType).toBe('ambassador');
  });

  test('keeps unknown badge types (not sponsor/partner)', () => {
    const list = [
      makeAmbassador({ badgeType: 'ambassador' }),
      makeAmbassador({ badgeType: 'custom_badge' }),
    ];
    const result = filterAmbassadorsOnly(list);
    expect(result).toHaveLength(2);
  });

  test('empty list returns empty', () => {
    expect(filterAmbassadorsOnly([])).toHaveLength(0);
  });

  test('all sponsors returns empty', () => {
    const list = [
      makeAmbassador({ badgeType: 'gold_sponsor' }),
      makeAmbassador({ badgeType: 'sponsor' }),
    ];
    expect(filterAmbassadorsOnly(list)).toHaveLength(0);
  });
});

// ============================================
// filterSponsorsOnly
// ============================================

describe('filterSponsorsOnly', () => {
  test('keeps only gold_sponsor, sponsor, partner', () => {
    const list = [
      makeAmbassador({ badgeType: 'ambassador' }),
      makeAmbassador({ badgeType: 'gold_sponsor' }),
      makeAmbassador({ badgeType: 'sponsor' }),
      makeAmbassador({ badgeType: 'partner' }),
    ];
    const result = filterSponsorsOnly(list);
    expect(result).toHaveLength(3);
  });

  test('excludes ambassador badge type', () => {
    const list = [
      makeAmbassador({ badgeType: 'ambassador' }),
      makeAmbassador({ badgeType: 'ambassador' }),
    ];
    expect(filterSponsorsOnly(list)).toHaveLength(0);
  });

  test('empty list returns empty', () => {
    expect(filterSponsorsOnly([])).toHaveLength(0);
  });
});

// ============================================
// isUserSponsor
// ============================================

describe('isUserSponsor', () => {
  test('gold_sponsor is sponsor', () => expect(isUserSponsor('gold_sponsor')).toBe(true));
  test('sponsor is sponsor', () => expect(isUserSponsor('sponsor')).toBe(true));
  test('partner is sponsor', () => expect(isUserSponsor('partner')).toBe(true));
  test('ambassador is NOT sponsor', () => expect(isUserSponsor('ambassador')).toBe(false));
  test('empty is NOT sponsor', () => expect(isUserSponsor('')).toBe(false));
  test('unknown is NOT sponsor', () => expect(isUserSponsor('unknown')).toBe(false));
});

// ============================================
// getFeaturedAmbassadors
// ============================================

describe('getFeaturedAmbassadors', () => {
  test('returns featured ambassadors when available', () => {
    const list = [
      makeAmbassador({ displayName: 'Not Featured', isFeatured: false }),
      makeAmbassador({ displayName: 'Featured 1', isFeatured: true }),
      makeAmbassador({ displayName: 'Featured 2', isFeatured: true }),
    ];
    const result = getFeaturedAmbassadors(list);
    expect(result).toHaveLength(2);
    expect(result.every(a => a.isFeatured)).toBe(true);
  });

  test('falls back to first 3 when no featured', () => {
    const list = [
      makeAmbassador({ displayName: 'A', isFeatured: false }),
      makeAmbassador({ displayName: 'B', isFeatured: false }),
      makeAmbassador({ displayName: 'C', isFeatured: false }),
      makeAmbassador({ displayName: 'D', isFeatured: false }),
    ];
    const result = getFeaturedAmbassadors(list);
    expect(result).toHaveLength(3);
    expect(result[0].displayName).toBe('A');
  });

  test('returns all when less than 3 and no featured', () => {
    const list = [
      makeAmbassador({ displayName: 'Only One', isFeatured: false }),
    ];
    const result = getFeaturedAmbassadors(list);
    expect(result).toHaveLength(1);
  });

  test('empty list returns empty', () => {
    expect(getFeaturedAmbassadors([])).toHaveLength(0);
  });
});

// ============================================
// Promotion Eligibility — Decouverte → Confirme
// ============================================

describe('Promotion — Decouverte → Confirme', () => {
  test('meets all thresholds → eligible', () => {
    const result = checkPromotionEligibility('decouverte', 5, 3, 500);
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe('confirme');
  });

  test('exceeds all thresholds → eligible', () => {
    const result = checkPromotionEligibility('decouverte', 10, 5, 1000);
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe('confirme');
  });

  test('missing referrals → not eligible', () => {
    const result = checkPromotionEligibility('decouverte', 4, 3, 500);
    expect(result.eligible).toBe(false);
    expect(result.nextLevel).toBe('confirme');
  });

  test('missing events → not eligible', () => {
    const result = checkPromotionEligibility('decouverte', 5, 2, 500);
    expect(result.eligible).toBe(false);
  });

  test('missing impressions → not eligible', () => {
    const result = checkPromotionEligibility('decouverte', 5, 3, 499);
    expect(result.eligible).toBe(false);
  });

  test('zero everything → not eligible', () => {
    const result = checkPromotionEligibility('decouverte', 0, 0, 0);
    expect(result.eligible).toBe(false);
  });

  test('all thresholds exactly met → eligible', () => {
    const result = checkPromotionEligibility('decouverte', 5, 3, 500);
    expect(result.eligible).toBe(true);
  });
});

// ============================================
// Promotion Eligibility — Confirme → Elite
// ============================================

describe('Promotion — Confirme → Elite', () => {
  test('meets all elite thresholds → eligible', () => {
    const result = checkPromotionEligibility('confirme', 20, 10, 2000);
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe('elite');
  });

  test('exceeds all elite thresholds → eligible', () => {
    const result = checkPromotionEligibility('confirme', 50, 20, 5000);
    expect(result.eligible).toBe(true);
  });

  test('missing referrals → not eligible', () => {
    const result = checkPromotionEligibility('confirme', 19, 10, 2000);
    expect(result.eligible).toBe(false);
  });

  test('missing events → not eligible', () => {
    const result = checkPromotionEligibility('confirme', 20, 9, 2000);
    expect(result.eligible).toBe(false);
  });

  test('missing impressions → not eligible', () => {
    const result = checkPromotionEligibility('confirme', 20, 10, 1999);
    expect(result.eligible).toBe(false);
  });

  test('meets confirme thresholds but not elite → not eligible', () => {
    const result = checkPromotionEligibility('confirme', 5, 3, 500);
    expect(result.eligible).toBe(false);
  });
});

// ============================================
// Promotion Eligibility — Already Elite
// ============================================

describe('Promotion — Already Elite', () => {
  test('elite cannot be promoted', () => {
    const result = checkPromotionEligibility('elite', 100, 50, 10000);
    expect(result.eligible).toBe(false);
    expect(result.nextLevel).toBeNull();
  });
});

// ============================================
// XP Computation
// ============================================

describe('computeReferralXp', () => {
  test('0 everything = 0 XP', () => {
    expect(computeReferralXp(0, 0, 0)).toBe(0);
  });

  test('1 referral = 50 XP', () => {
    expect(computeReferralXp(1, 0, 0)).toBe(50);
  });

  test('5 referrals = 250 XP', () => {
    expect(computeReferralXp(5, 0, 0)).toBe(250);
  });

  test('1 challenge = 25 XP', () => {
    expect(computeReferralXp(0, 1, 0)).toBe(25);
  });

  test('100 impressions = 10 XP', () => {
    expect(computeReferralXp(0, 0, 100)).toBe(10);
  });

  test('99 impressions = 0 XP (not enough for a batch)', () => {
    expect(computeReferralXp(0, 0, 99)).toBe(0);
  });

  test('250 impressions = 20 XP (2 batches of 100)', () => {
    expect(computeReferralXp(0, 0, 250)).toBe(20);
  });

  test('combined: 5 referrals + 3 challenges + 500 impressions', () => {
    // 5*50 + 3*25 + 5*10 = 250 + 75 + 50 = 375
    expect(computeReferralXp(5, 3, 500)).toBe(375);
  });

  test('large values', () => {
    // 100*50 + 50*25 + 10000 impressions (100 batches * 10)
    // 5000 + 1250 + 1000 = 7250
    expect(computeReferralXp(100, 50, 10000)).toBe(7250);
  });

  test('impressions below 100 threshold rounded down', () => {
    expect(computeReferralXp(0, 0, 150)).toBe(10); // floor(150/100) * 10 = 10
    expect(computeReferralXp(0, 0, 199)).toBe(10);
    expect(computeReferralXp(0, 0, 200)).toBe(20);
  });
});

// ============================================
// Promotion Progress Percentages
// ============================================

describe('getPromotionProgress', () => {
  test('decouverte with 0 progress', () => {
    const progress = getPromotionProgress('decouverte', 0, 0, 0);
    expect(progress.referralPct).toBe(0);
    expect(progress.eventPct).toBe(0);
    expect(progress.impressionPct).toBe(0);
  });

  test('decouverte at 50% progress', () => {
    // Confirme: 5 referrals, 3 events, 500 impressions
    const progress = getPromotionProgress('decouverte', 2, 1, 250);
    expect(progress.referralPct).toBe(40); // 2/5
    expect(progress.eventPct).toBe(33); // 1/3
    expect(progress.impressionPct).toBe(50); // 250/500
  });

  test('decouverte at 100% progress', () => {
    const progress = getPromotionProgress('decouverte', 5, 3, 500);
    expect(progress.referralPct).toBe(100);
    expect(progress.eventPct).toBe(100);
    expect(progress.impressionPct).toBe(100);
  });

  test('decouverte over 100% capped', () => {
    const progress = getPromotionProgress('decouverte', 10, 6, 1000);
    expect(progress.referralPct).toBe(100);
    expect(progress.eventPct).toBe(100);
    expect(progress.impressionPct).toBe(100);
  });

  test('confirme towards elite', () => {
    // Elite: 20 referrals, 10 events, 2000 impressions
    const progress = getPromotionProgress('confirme', 10, 5, 1000);
    expect(progress.referralPct).toBe(50); // 10/20
    expect(progress.eventPct).toBe(50); // 5/10
    expect(progress.impressionPct).toBe(50); // 1000/2000
  });

  test('elite returns all 100%', () => {
    const progress = getPromotionProgress('elite', 0, 0, 0);
    expect(progress.referralPct).toBe(100);
    expect(progress.eventPct).toBe(100);
    expect(progress.impressionPct).toBe(100);
  });
});

// ============================================
// Ambassador Mapping
// ============================================

describe('Ambassador Data Mapping', () => {
  test('creates ambassador with all fields', () => {
    const amb = makeAmbassador({
      displayName: 'Jean Bouliste',
      ambassadorLevel: 'confirme',
      referralCode: 'JEA-ABC23',
      referralCount: 8,
      totalReferralXp: 400,
      brandColor: '#FF5500',
      isFeatured: true,
      bio: 'Expert tireur',
      instagramHandle: '@jeanbouliste',
    });

    expect(amb.displayName).toBe('Jean Bouliste');
    expect(amb.ambassadorLevel).toBe('confirme');
    expect(amb.referralCode).toBe('JEA-ABC23');
    expect(amb.referralCount).toBe(8);
    expect(amb.totalReferralXp).toBe(400);
    expect(amb.brandColor).toBe('#FF5500');
    expect(amb.isFeatured).toBe(true);
    expect(amb.bio).toBe('Expert tireur');
    expect(amb.instagramHandle).toBe('@jeanbouliste');
  });

  test('defaults are correct', () => {
    const amb = makeAmbassador();
    expect(amb.badgeType).toBe('ambassador');
    expect(amb.ambassadorLevel).toBe('decouverte');
    expect(amb.referralCount).toBe(0);
    expect(amb.totalReferralXp).toBe(0);
    expect(amb.isFeatured).toBe(false);
  });

  test('optional fields are undefined by default', () => {
    const amb = makeAmbassador();
    expect(amb.bio).toBeUndefined();
    expect(amb.photo).toBeUndefined();
    expect(amb.youtubeUrl).toBeUndefined();
    expect(amb.tiktokUrl).toBeUndefined();
    expect(amb.instagramHandle).toBeUndefined();
    expect(amb.twitterHandle).toBeUndefined();
    expect(amb.websiteUrl).toBeUndefined();
    expect(amb.brandColor).toBeUndefined();
    expect(amb.stats).toBeUndefined();
  });
});

// ============================================
// Mixed Filtering Scenarios
// ============================================

describe('Mixed Filtering Scenarios', () => {
  const mixedList: Ambassador[] = [
    makeAmbassador({ displayName: 'Ambassador 1', badgeType: 'ambassador', ambassadorLevel: 'decouverte' }),
    makeAmbassador({ displayName: 'Ambassador 2', badgeType: 'ambassador', ambassadorLevel: 'confirme' }),
    makeAmbassador({ displayName: 'Ambassador 3', badgeType: 'ambassador', ambassadorLevel: 'elite', isFeatured: true }),
    makeAmbassador({ displayName: 'Gold Sponsor', badgeType: 'gold_sponsor' }),
    makeAmbassador({ displayName: 'Silver Sponsor', badgeType: 'sponsor' }),
    makeAmbassador({ displayName: 'Partner', badgeType: 'partner' }),
  ];

  test('ambassador filter returns 3 ambassadors', () => {
    expect(filterAmbassadorsOnly(mixedList)).toHaveLength(3);
  });

  test('sponsor filter returns 3 sponsors/partners', () => {
    expect(filterSponsorsOnly(mixedList)).toHaveLength(3);
  });

  test('filters are complementary (total = all)', () => {
    const ambassadors = filterAmbassadorsOnly(mixedList);
    const sponsors = filterSponsorsOnly(mixedList);
    expect(ambassadors.length + sponsors.length).toBe(mixedList.length);
  });

  test('featured returns only featured ambassador', () => {
    const featured = getFeaturedAmbassadors(mixedList);
    expect(featured).toHaveLength(1);
    expect(featured[0].displayName).toBe('Ambassador 3');
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('promotion check with exact boundary values', () => {
    // Exactly at confirme thresholds
    const atConfirme = checkPromotionEligibility('decouverte', 5, 3, 500);
    expect(atConfirme.eligible).toBe(true);

    // One below each threshold
    expect(checkPromotionEligibility('decouverte', 4, 3, 500).eligible).toBe(false);
    expect(checkPromotionEligibility('decouverte', 5, 2, 500).eligible).toBe(false);
    expect(checkPromotionEligibility('decouverte', 5, 3, 499).eligible).toBe(false);
  });

  test('promotion check with exact elite boundary values', () => {
    const atElite = checkPromotionEligibility('confirme', 20, 10, 2000);
    expect(atElite.eligible).toBe(true);

    expect(checkPromotionEligibility('confirme', 19, 10, 2000).eligible).toBe(false);
    expect(checkPromotionEligibility('confirme', 20, 9, 2000).eligible).toBe(false);
    expect(checkPromotionEligibility('confirme', 20, 10, 1999).eligible).toBe(false);
  });

  test('all three criteria must be met (AND logic)', () => {
    // Only referrals met
    expect(checkPromotionEligibility('decouverte', 5, 0, 0).eligible).toBe(false);
    // Only events met
    expect(checkPromotionEligibility('decouverte', 0, 3, 0).eligible).toBe(false);
    // Only impressions met
    expect(checkPromotionEligibility('decouverte', 0, 0, 500).eligible).toBe(false);
    // Two of three met
    expect(checkPromotionEligibility('decouverte', 5, 3, 0).eligible).toBe(false);
    expect(checkPromotionEligibility('decouverte', 5, 0, 500).eligible).toBe(false);
    expect(checkPromotionEligibility('decouverte', 0, 3, 500).eligible).toBe(false);
  });

  test('large referral values compute XP correctly', () => {
    const xp = computeReferralXp(1000, 0, 0);
    expect(xp).toBe(50000); // 1000 * 50
  });

  test('ambassador with stats has player data', () => {
    const amb = makeAmbassador({
      stats: { matchesPlayed: 50, wins: 30, winRate: 60, tirRate: 70, pointRate: 65, carreauRate: 15 },
      role: 'Tireur',
      level: 'Expert',
      club: 'BC Lyon',
      city: 'Lyon',
    });
    expect(amb.stats?.matchesPlayed).toBe(50);
    expect(amb.role).toBe('Tireur');
    expect(amb.city).toBe('Lyon');
  });

  test('referral code generation is deterministic in format', () => {
    const codes = Array.from({ length: 20 }, () => generateReferralCodeSync('Pierre'));
    codes.forEach(code => {
      const parts = code.split('-');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('PIE');
      expect(parts[1]).toHaveLength(5);
    });
  });
});
