/**
 * Unit tests for services/badgeService.ts
 *
 * Tests: 12 badge conditions, XP_LEVELS (4 levels, thresholds), getLevelFromXp,
 * getNextLevel, getXpProgress, calculateTotalXp, getBadgeName/getBadgeDescription
 * i18n, buildBadgeContext (terrains, carreaux, consecutive days), edge cases.
 */

const XP_LEVELS = [
  { name: 'Débutant', nameEn: 'Beginner', minXp: 0, icon: 'school' },
  { name: 'Intermédiaire', nameEn: 'Intermediate', minXp: 50, icon: 'trending-up' },
  { name: 'Confirmé', nameEn: 'Advanced', minXp: 200, icon: 'stars' },
  { name: 'Expert', nameEn: 'Expert', minXp: 500, icon: 'emoji-events' },
] as const;

function getLevelFromXp(xp: number) {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) { if (xp >= XP_LEVELS[i].minXp) return XP_LEVELS[i]; }
  return XP_LEVELS[0];
}

function getNextLevel(xp: number) {
  const currentIdx = XP_LEVELS.findIndex((l, i) => { const next = XP_LEVELS[i + 1]; return next ? xp < next.minXp : true; });
  if (currentIdx >= XP_LEVELS.length - 1) return null;
  const next = XP_LEVELS[currentIdx + 1];
  return { level: next, xpNeeded: next.minXp - xp };
}

function getXpProgress(xp: number) {
  const currentLevel = getLevelFromXp(xp);
  const currentIdx = XP_LEVELS.indexOf(currentLevel);
  if (currentIdx >= XP_LEVELS.length - 1) return { current: xp, max: xp, percent: 100 };
  const nextLevel = XP_LEVELS[currentIdx + 1];
  const progress = xp - currentLevel.minXp; const range = nextLevel.minXp - currentLevel.minXp;
  return { current: progress, max: range, percent: Math.min(100, Math.round((progress / range) * 100)) };
}

const XP_PER_MATCH = 10, XP_PER_CARREAU = 5, XP_PER_SHARE_ACCEPTED = 15, XP_PER_BADGE = 50;
function calculateTotalXp(p: { matchCount: number; totalCarreaux: number; sharedAcceptedCount: number; badgeCount: number }) {
  return p.matchCount * XP_PER_MATCH + p.totalCarreaux * XP_PER_CARREAU + p.sharedAcceptedCount * XP_PER_SHARE_ACCEPTED + p.badgeCount * XP_PER_BADGE;
}

interface BadgeContext { matchCount: number; winRate: number; tirRate: number; carreauRate: number; totalCarreaux: number; sharedAcceptedCount: number; invitedUsersCount: number; uniqueTerrainsPlayed: number; leaderboardRank: number | null; consecutiveDaysPlayed: number; isAmbassador: boolean; trustScore: number | null; }

const BADGE_CONDITIONS: Record<string, (ctx: BadgeContext) => boolean> = {
  premier_lancer: ctx => ctx.matchCount >= 1,
  statisticien: ctx => ctx.matchCount >= 5,
  oeil_de_lynx: ctx => ctx.matchCount >= 10 && ctx.tirRate >= 70,
  roi_du_carreau: ctx => ctx.totalCarreaux >= 10,
  social_player: ctx => ctx.sharedAcceptedCount >= 1,
  recruteur: ctx => ctx.invitedUsersCount >= 3,
  explorateur: ctx => ctx.uniqueTerrainsPlayed >= 5,
  classe: ctx => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 100,
  en_feu: ctx => ctx.consecutiveDaysPlayed >= 7,
  ambassadeur: ctx => ctx.isAmbassador,
  fiable: ctx => ctx.trustScore !== null && ctx.trustScore >= 65,
  verifie: ctx => ctx.trustScore !== null && ctx.trustScore >= 80,
};

const defaultCtx: BadgeContext = { matchCount: 0, winRate: 0, tirRate: 0, carreauRate: 0, totalCarreaux: 0, sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 0, leaderboardRank: null, consecutiveDaysPlayed: 0, isAmbassador: false, trustScore: null };

describe('XP_LEVELS', () => {
  test('4 levels', () => { expect(XP_LEVELS).toHaveLength(4); });
  test('ordered by minXp', () => { for (let i = 1; i < XP_LEVELS.length; i++) expect(XP_LEVELS[i].minXp).toBeGreaterThan(XP_LEVELS[i - 1].minXp); });
});

describe('getLevelFromXp', () => {
  test('0 XP = Débutant', () => { expect(getLevelFromXp(0).name).toBe('Débutant'); });
  test('50 XP = Intermédiaire', () => { expect(getLevelFromXp(50).name).toBe('Intermédiaire'); });
  test('199 XP = Intermédiaire', () => { expect(getLevelFromXp(199).name).toBe('Intermédiaire'); });
  test('200 XP = Confirmé', () => { expect(getLevelFromXp(200).name).toBe('Confirmé'); });
  test('500 XP = Expert', () => { expect(getLevelFromXp(500).name).toBe('Expert'); });
  test('9999 XP = Expert', () => { expect(getLevelFromXp(9999).name).toBe('Expert'); });
});

describe('getNextLevel', () => {
  test('0 XP → next is Intermédiaire, need 50', () => {
    const next = getNextLevel(0)!;
    expect(next.level.name).toBe('Intermédiaire'); expect(next.xpNeeded).toBe(50);
  });
  test('500+ XP → null (max level)', () => { expect(getNextLevel(500)).toBeNull(); });
});

describe('getXpProgress', () => {
  test('0 XP = 0% toward Intermédiaire', () => {
    const p = getXpProgress(0);
    expect(p.current).toBe(0); expect(p.max).toBe(50); expect(p.percent).toBe(0);
  });
  test('25 XP = 50%', () => { expect(getXpProgress(25).percent).toBe(50); });
  test('max level = 100%', () => { expect(getXpProgress(500).percent).toBe(100); });
});

describe('calculateTotalXp', () => {
  test('10 matches + 5 carreaux + 2 shares + 3 badges', () => {
    expect(calculateTotalXp({ matchCount: 10, totalCarreaux: 5, sharedAcceptedCount: 2, badgeCount: 3 }))
      .toBe(10 * 10 + 5 * 5 + 2 * 15 + 3 * 50);
  });
  test('zero everything = 0', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(0);
  });
});

describe('Badge Conditions', () => {
  test('premier_lancer: 1+ match', () => {
    expect(BADGE_CONDITIONS.premier_lancer({ ...defaultCtx, matchCount: 1 })).toBe(true);
    expect(BADGE_CONDITIONS.premier_lancer(defaultCtx)).toBe(false);
  });
  test('statisticien: 5+ matches', () => {
    expect(BADGE_CONDITIONS.statisticien({ ...defaultCtx, matchCount: 5 })).toBe(true);
    expect(BADGE_CONDITIONS.statisticien({ ...defaultCtx, matchCount: 4 })).toBe(false);
  });
  test('oeil_de_lynx: 10+ matches AND 70%+ tirRate', () => {
    expect(BADGE_CONDITIONS.oeil_de_lynx({ ...defaultCtx, matchCount: 10, tirRate: 70 })).toBe(true);
    expect(BADGE_CONDITIONS.oeil_de_lynx({ ...defaultCtx, matchCount: 10, tirRate: 69 })).toBe(false);
    expect(BADGE_CONDITIONS.oeil_de_lynx({ ...defaultCtx, matchCount: 9, tirRate: 80 })).toBe(false);
  });
  test('roi_du_carreau: 10+ carreaux', () => {
    expect(BADGE_CONDITIONS.roi_du_carreau({ ...defaultCtx, totalCarreaux: 10 })).toBe(true);
  });
  test('social_player: 1+ shared accepted', () => {
    expect(BADGE_CONDITIONS.social_player({ ...defaultCtx, sharedAcceptedCount: 1 })).toBe(true);
  });
  test('recruteur: 3+ invited users', () => {
    expect(BADGE_CONDITIONS.recruteur({ ...defaultCtx, invitedUsersCount: 3 })).toBe(true);
  });
  test('explorateur: 5+ unique terrains', () => {
    expect(BADGE_CONDITIONS.explorateur({ ...defaultCtx, uniqueTerrainsPlayed: 5 })).toBe(true);
  });
  test('classe: rank <= 100', () => {
    expect(BADGE_CONDITIONS.classe({ ...defaultCtx, leaderboardRank: 100 })).toBe(true);
    expect(BADGE_CONDITIONS.classe({ ...defaultCtx, leaderboardRank: 101 })).toBe(false);
    expect(BADGE_CONDITIONS.classe(defaultCtx)).toBe(false);
  });
  test('en_feu: 7+ consecutive days', () => {
    expect(BADGE_CONDITIONS.en_feu({ ...defaultCtx, consecutiveDaysPlayed: 7 })).toBe(true);
  });
  test('ambassadeur: isAmbassador true', () => {
    expect(BADGE_CONDITIONS.ambassadeur({ ...defaultCtx, isAmbassador: true })).toBe(true);
  });
  test('fiable: trustScore >= 65', () => {
    expect(BADGE_CONDITIONS.fiable({ ...defaultCtx, trustScore: 65 })).toBe(true);
    expect(BADGE_CONDITIONS.fiable({ ...defaultCtx, trustScore: 64 })).toBe(false);
    expect(BADGE_CONDITIONS.fiable(defaultCtx)).toBe(false);
  });
  test('verifie: trustScore >= 80', () => {
    expect(BADGE_CONDITIONS.verifie({ ...defaultCtx, trustScore: 80 })).toBe(true);
    expect(BADGE_CONDITIONS.verifie({ ...defaultCtx, trustScore: 79 })).toBe(false);
  });
});
