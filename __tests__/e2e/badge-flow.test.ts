/**
 * E2E Integration Test — Badge Unlock Flow
 *
 * Simulates the complete badge lifecycle:
 *   1. User plays matches → XP calculated
 *   2. Badge context built from app data
 *   3. checkAndAwardBadges evaluates conditions → awards qualifying badges
 *   4. XP synced to DB
 *   5. Level progression verified
 *   6. Duplicate badge prevention
 *   7. Trust-based badges require trust score
 *
 * All external dependencies (supabase, AsyncStorage) are mocked.
 */

// ─── In-memory DB ──────────────────────────────────────────

const memDB: Record<string, any[]> = {
  user_profiles: [],
  user_badges: [],
  players: [],
  matches: [],
  challenges: [],
  match_share_requests: [],
  suspicious_players: [],
};

let currentUserId = 'test-user';

function resetMemDB() {
  Object.keys(memDB).forEach(k => { memDB[k] = []; });
  memDB.user_profiles = [
    { id: 'test-user', username: 'TestPlayer', email: 'test@example.com', xp: 0, is_admin: false, is_premium: false },
  ];
  memDB.players = [
    { id: 'player-self', user_id: 'test-user', name: 'TestPlayer', role: 'Milieu', level: 'Intermédiaire', stats: {}, is_public: true, show_contact_public: false },
  ];
}

// ─── Supabase mock ──────────────────────────────────────────

function buildQueryChain(table: string) {
  let filters: Record<string, any> = {};
  let limitN: number | null = null;

  const chain: any = {
    select(cols?: string) { return chain; },
    eq(col: string, val: any) { filters[col] = val; return chain; },
    in(col: string, vals: any[]) { filters[`_in_${col}`] = vals; return chain; },
    limit(n: number) { limitN = n; return chain; },
    order(col: string, opts?: any) { return chain; },
    single() {
      const rows = resolve();
      const row = rows[0] || null;
      return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } });
    },
    insert(payload: any) {
      const rows = Array.isArray(payload) ? payload : [payload];
      const inserted = rows.map((r: any) => ({
        ...r,
        id: r.id || `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
      }));
      memDB[table] = [...(memDB[table] || []), ...inserted];
      return Promise.resolve({ data: inserted, error: null });
    },
    update(payload: any) {
      return {
        eq: (col: string, val: any) => {
          const tbl = memDB[table] || [];
          for (let i = 0; i < tbl.length; i++) {
            if (tbl[i][col] === val) {
              tbl[i] = { ...tbl[i], ...payload };
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    then(resolve: any) {
      resolve({ data: doResolve(), error: null });
    },
  };

  function doResolve(): any[] {
    let rows = [...(memDB[table] || [])];
    Object.entries(filters).forEach(([k, v]) => {
      if (k.startsWith('_in_')) {
        const col = k.slice(4);
        rows = rows.filter(r => (v as any[]).includes(r[col]));
      } else {
        rows = rows.filter(r => r[k] === v);
      }
    });
    if (limitN) rows = rows.slice(0, limitN);
    return rows;
  }

  const resolve = doResolve;
  return chain;
}

const mockSupabase = {
  from: (table: string) => buildQueryChain(table),
  rpc: () => Promise.resolve({ data: null, error: null }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: currentUserId, email: 'test@example.com' } } }),
  },
};

// ─── Module mocks ──────────────────────────────────────────

jest.mock('@/template', () => ({
  getSupabaseClient: () => mockSupabase,
  useAuth: () => ({ user: { id: currentUserId, email: 'test@example.com' } }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
  __esModule: true,
}));

// ─── Imports (after mocks) ─────────────────────────────────

import {
  BADGES,
  XP_LEVELS,
  XP_PER_MATCH,
  XP_PER_CARREAU,
  XP_PER_SHARE_ACCEPTED,
  XP_PER_BADGE,
  buildBadgeContext,
  checkAndAwardBadges,
  calculateTotalXp,
  loadUserBadges,
  syncXpToDb,
  getLevelFromXp,
  getNextLevel,
  getXpProgress,
  getBadgeName,
  getBadgeDescription,
  type BadgeContext,
  type UserBadge,
} from '@/services/badgeService';

// ─── Test Helpers ──────────────────────────────────────────

function makeMatch(overrides: any = {}): any {
  return {
    id: `match-${Date.now()}-${Math.random()}`,
    date: new Date().toISOString(),
    mode: 'Entraînement',
    format: 'Doublette',
    teamA: { players: ['test-user'], playerNames: ['TestPlayer'], score: 13 },
    teamB: { players: ['opp-1'], playerNames: ['Opponent'], score: 8 },
    winner: 'A',
    duration: 45,
    menes: [],
    playerActions: [
      { playerId: 'test-user', playerName: 'TestPlayer', team: 'A', actions: { tirs: 10, tirsSuccess: 7, points: 5, pointsSuccess: 3, carreaux: 2 } },
    ],
    terrainId: undefined,
    ...overrides,
  };
}

function makeMatches(count: number, extra: any = {}): any[] {
  return Array.from({ length: count }, (_, i) => makeMatch({ id: `match-${i}`, ...extra }));
}

// ─── Tests ─────────────────────────────────────────────────

beforeEach(() => {
  resetMemDB();
  currentUserId = 'test-user';
});

// ============================================
// Phase 1: Badge Context Construction
// ============================================

describe('Phase 1 — Badge Context Construction', () => {
  it('builds context with correct match count and win rate', () => {
    const matches = [
      makeMatch({ winner: 'A' }),
      makeMatch({ winner: 'A' }),
      makeMatch({ winner: 'B' }),
    ];
    const ctx = buildBadgeContext({
      matches,
      challenges: [],
      userStats: { winRate: 67, tirSuccessRate: 70, carreauRate: 20 },
      sharedMatchIds: [],
      userId: 'test-user',
      isAmbassador: false,
      leaderboardRank: null,
    });

    expect(ctx.matchCount).toBe(3);
    expect(ctx.winRate).toBe(67);
    expect(ctx.tirRate).toBe(70);
  });

  it('counts total carreaux from all player actions', () => {
    const matches = [
      makeMatch({ playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 5, tirsSuccess: 3, points: 3, pointsSuccess: 2, carreaux: 4 } }] }),
      makeMatch({ playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 8, tirsSuccess: 6, points: 4, pointsSuccess: 3, carreaux: 7 } }] }),
    ];
    const ctx = buildBadgeContext({
      matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'test-user', isAmbassador: false, leaderboardRank: null,
    });

    expect(ctx.totalCarreaux).toBe(11); // 4 + 7
  });

  it('counts unique terrains played', () => {
    const matches = [
      makeMatch({ terrainId: 'ter-1' }),
      makeMatch({ terrainId: 'ter-2' }),
      makeMatch({ terrainId: 'ter-1' }),
      makeMatch({ terrainId: 'ter-3' }),
      makeMatch({ terrainId: undefined }),
    ];
    const ctx = buildBadgeContext({
      matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'test-user', isAmbassador: false, leaderboardRank: null,
    });

    expect(ctx.uniqueTerrainsPlayed).toBe(3);
  });

  it('counts consecutive days played', () => {
    const today = new Date();
    const dates = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return d.toISOString();
    });
    const matches = dates.map((date, i) => makeMatch({ id: `m-${i}`, date }));
    const ctx = buildBadgeContext({
      matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'test-user', isAmbassador: false, leaderboardRank: null,
    });

    expect(ctx.consecutiveDaysPlayed).toBe(5);
  });

  it('consecutive days resets on gap', () => {
    const today = new Date();
    const d1 = new Date(today); d1.setDate(d1.getDate() - 0);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 1);
    // Gap at day 2
    const d3 = new Date(today); d3.setDate(d3.getDate() - 4);
    const matches = [
      makeMatch({ id: 'm1', date: d1.toISOString() }),
      makeMatch({ id: 'm2', date: d2.toISOString() }),
      makeMatch({ id: 'm3', date: d3.toISOString() }),
    ];
    const ctx = buildBadgeContext({
      matches, challenges: [], userStats: {}, sharedMatchIds: [], userId: 'test-user', isAmbassador: false, leaderboardRank: null,
    });

    expect(ctx.consecutiveDaysPlayed).toBe(2); // today + yesterday
  });

  it('sets sharedAcceptedCount from sharedMatchIds', () => {
    const ctx = buildBadgeContext({
      matches: [], challenges: [], userStats: {}, sharedMatchIds: ['m1', 'm2', 'm3'], userId: 'test-user', isAmbassador: false, leaderboardRank: null,
    });
    expect(ctx.sharedAcceptedCount).toBe(3);
  });

  it('sets ambassador flag correctly', () => {
    const ctx = buildBadgeContext({
      matches: [], challenges: [], userStats: {}, sharedMatchIds: [], userId: 'test-user', isAmbassador: true, leaderboardRank: null,
    });
    expect(ctx.isAmbassador).toBe(true);
  });
});

// ============================================
// Phase 2: Badge Condition Evaluation
// ============================================

describe('Phase 2 — Badge Condition Evaluation', () => {
  it('premier_lancer unlocks with 1+ match', () => {
    const badge = BADGES.find(b => b.id === 'premier_lancer')!;
    expect(badge.condition({ matchCount: 1 } as BadgeContext)).toBe(true);
    expect(badge.condition({ matchCount: 0 } as BadgeContext)).toBe(false);
  });

  it('statisticien unlocks with 5+ matches', () => {
    const badge = BADGES.find(b => b.id === 'statisticien')!;
    expect(badge.condition({ matchCount: 5 } as BadgeContext)).toBe(true);
    expect(badge.condition({ matchCount: 4 } as BadgeContext)).toBe(false);
  });

  it('oeil_de_lynx requires 10+ matches AND 70%+ tir rate', () => {
    const badge = BADGES.find(b => b.id === 'oeil_de_lynx')!;
    expect(badge.condition({ matchCount: 10, tirRate: 70 } as BadgeContext)).toBe(true);
    expect(badge.condition({ matchCount: 10, tirRate: 69 } as BadgeContext)).toBe(false);
    expect(badge.condition({ matchCount: 9, tirRate: 80 } as BadgeContext)).toBe(false);
  });

  it('roi_du_carreau requires 10+ total carreaux', () => {
    const badge = BADGES.find(b => b.id === 'roi_du_carreau')!;
    expect(badge.condition({ totalCarreaux: 10 } as BadgeContext)).toBe(true);
    expect(badge.condition({ totalCarreaux: 9 } as BadgeContext)).toBe(false);
  });

  it('social_player requires 1+ shared accepted', () => {
    const badge = BADGES.find(b => b.id === 'social_player')!;
    expect(badge.condition({ sharedAcceptedCount: 1 } as BadgeContext)).toBe(true);
    expect(badge.condition({ sharedAcceptedCount: 0 } as BadgeContext)).toBe(false);
  });

  it('explorateur requires 5+ unique terrains', () => {
    const badge = BADGES.find(b => b.id === 'explorateur')!;
    expect(badge.condition({ uniqueTerrainsPlayed: 5 } as BadgeContext)).toBe(true);
    expect(badge.condition({ uniqueTerrainsPlayed: 4 } as BadgeContext)).toBe(false);
  });

  it('classe requires leaderboard rank <= 100', () => {
    const badge = BADGES.find(b => b.id === 'classe')!;
    expect(badge.condition({ leaderboardRank: 100 } as BadgeContext)).toBe(true);
    expect(badge.condition({ leaderboardRank: 1 } as BadgeContext)).toBe(true);
    expect(badge.condition({ leaderboardRank: 101 } as BadgeContext)).toBe(false);
    expect(badge.condition({ leaderboardRank: null } as BadgeContext)).toBe(false);
  });

  it('en_feu requires 7+ consecutive days', () => {
    const badge = BADGES.find(b => b.id === 'en_feu')!;
    expect(badge.condition({ consecutiveDaysPlayed: 7 } as BadgeContext)).toBe(true);
    expect(badge.condition({ consecutiveDaysPlayed: 6 } as BadgeContext)).toBe(false);
  });

  it('ambassadeur requires ambassador status', () => {
    const badge = BADGES.find(b => b.id === 'ambassadeur')!;
    expect(badge.condition({ isAmbassador: true } as BadgeContext)).toBe(true);
    expect(badge.condition({ isAmbassador: false } as BadgeContext)).toBe(false);
  });

  it('fiable requires trust score >= 65', () => {
    const badge = BADGES.find(b => b.id === 'fiable')!;
    expect(badge.condition({ trustScore: 65 } as BadgeContext)).toBe(true);
    expect(badge.condition({ trustScore: 64 } as BadgeContext)).toBe(false);
    expect(badge.condition({ trustScore: null } as BadgeContext)).toBe(false);
  });

  it('verifie requires trust score >= 80', () => {
    const badge = BADGES.find(b => b.id === 'verifie')!;
    expect(badge.condition({ trustScore: 80 } as BadgeContext)).toBe(true);
    expect(badge.condition({ trustScore: 79 } as BadgeContext)).toBe(false);
    expect(badge.condition({ trustScore: null } as BadgeContext)).toBe(false);
  });
});

// ============================================
// Phase 3: XP Calculation
// ============================================

describe('Phase 3 — XP Calculation', () => {
  it('calculates XP from matches, carreaux, shares, and badges', () => {
    const xp = calculateTotalXp({
      matchCount: 10,
      totalCarreaux: 5,
      sharedAcceptedCount: 2,
      badgeCount: 3,
    });
    // 10*10 + 5*5 + 2*15 + 3*50 = 100 + 25 + 30 + 150 = 305
    expect(xp).toBe(305);
  });

  it('returns 0 for no activity', () => {
    expect(calculateTotalXp({ matchCount: 0, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(0);
  });

  it('matches-only XP', () => {
    expect(calculateTotalXp({ matchCount: 5, totalCarreaux: 0, sharedAcceptedCount: 0, badgeCount: 0 })).toBe(50);
  });

  it('XP constants are correct', () => {
    expect(XP_PER_MATCH).toBe(10);
    expect(XP_PER_CARREAU).toBe(5);
    expect(XP_PER_SHARE_ACCEPTED).toBe(15);
    expect(XP_PER_BADGE).toBe(50);
  });
});

// ============================================
// Phase 4: Level Progression
// ============================================

describe('Phase 4 — Level Progression', () => {
  it('XP 0 = Beginner', () => {
    const level = getLevelFromXp(0);
    expect(level.name).toBe('Débutant');
    expect(level.nameEn).toBe('Beginner');
  });

  it('XP 50 = Intermediate', () => {
    expect(getLevelFromXp(50).nameEn).toBe('Intermediate');
  });

  it('XP 200 = Advanced', () => {
    expect(getLevelFromXp(200).nameEn).toBe('Advanced');
  });

  it('XP 500 = Expert', () => {
    expect(getLevelFromXp(500).nameEn).toBe('Expert');
  });

  it('XP 999 still = Expert (max level)', () => {
    expect(getLevelFromXp(999).nameEn).toBe('Expert');
  });

  it('getNextLevel returns next level info', () => {
    const next = getNextLevel(30);
    expect(next).not.toBeNull();
    expect(next!.level.nameEn).toBe('Intermediate');
    expect(next!.xpNeeded).toBe(20); // 50 - 30
  });

  it('getNextLevel returns null at max level', () => {
    expect(getNextLevel(500)).toBeNull();
    expect(getNextLevel(999)).toBeNull();
  });

  it('getXpProgress calculates correctly', () => {
    const progress = getXpProgress(100);
    // Level: Intermediate (50), next: Advanced (200)
    // current = 100 - 50 = 50, max = 200 - 50 = 150
    expect(progress.current).toBe(50);
    expect(progress.max).toBe(150);
    expect(progress.percent).toBe(33); // round(50/150*100)
  });

  it('getXpProgress at max level returns 100%', () => {
    const progress = getXpProgress(600);
    expect(progress.percent).toBe(100);
  });

  it('XP levels are ordered ascending', () => {
    for (let i = 0; i < XP_LEVELS.length - 1; i++) {
      expect(XP_LEVELS[i].minXp).toBeLessThan(XP_LEVELS[i + 1].minXp);
    }
  });
});

// ============================================
// Phase 5: Badge Award Flow (DB Integration)
// ============================================

describe('Phase 5 — Badge Award Flow', () => {
  it('awards premier_lancer badge for 1 match', async () => {
    const context: BadgeContext = {
      matchCount: 1, winRate: 100, tirRate: 70, carreauRate: 20, totalCarreaux: 2,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 1,
      leaderboardRank: null, consecutiveDaysPlayed: 1, isAmbassador: false, trustScore: null,
    };
    const newBadges = await checkAndAwardBadges('test-user', context, []);
    expect(newBadges).toContain('premier_lancer');
    // Verify persisted in DB
    expect(memDB.user_badges.some((b: any) => b.badge_id === 'premier_lancer' && b.user_id === 'test-user')).toBe(true);
  });

  it('awards multiple badges at once', async () => {
    const context: BadgeContext = {
      matchCount: 5, winRate: 80, tirRate: 75, carreauRate: 25, totalCarreaux: 3,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 2,
      leaderboardRank: null, consecutiveDaysPlayed: 2, isAmbassador: false, trustScore: null,
    };
    const newBadges = await checkAndAwardBadges('test-user', context, []);
    expect(newBadges).toContain('premier_lancer');
    expect(newBadges).toContain('statisticien');
    expect(newBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('does not re-award existing badges', async () => {
    const existing: UserBadge[] = [{ badgeId: 'premier_lancer', unlockedAt: new Date().toISOString() }];
    const context: BadgeContext = {
      matchCount: 5, winRate: 80, tirRate: 75, carreauRate: 25, totalCarreaux: 3,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 2,
      leaderboardRank: null, consecutiveDaysPlayed: 2, isAmbassador: false, trustScore: null,
    };
    const newBadges = await checkAndAwardBadges('test-user', context, existing);
    expect(newBadges).not.toContain('premier_lancer');
    expect(newBadges).toContain('statisticien');
  });

  it('awards no badges when conditions not met', async () => {
    const context: BadgeContext = {
      matchCount: 0, winRate: 0, tirRate: 0, carreauRate: 0, totalCarreaux: 0,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 0,
      leaderboardRank: null, consecutiveDaysPlayed: 0, isAmbassador: false, trustScore: null,
    };
    const newBadges = await checkAndAwardBadges('test-user', context, []);
    expect(newBadges).toHaveLength(0);
  });

  it('updates XP in user_profiles when badge awarded', async () => {
    const context: BadgeContext = {
      matchCount: 1, winRate: 100, tirRate: 0, carreauRate: 0, totalCarreaux: 0,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 0,
      leaderboardRank: null, consecutiveDaysPlayed: 0, isAmbassador: false, trustScore: null,
    };
    await checkAndAwardBadges('test-user', context, []);

    const profile = memDB.user_profiles.find((p: any) => p.id === 'test-user');
    expect(profile.xp).toBe(50); // premier_lancer xpReward = 50
  });
});

// ============================================
// Phase 6: XP Sync & Load
// ============================================

describe('Phase 6 — XP Sync & Load', () => {
  it('syncXpToDb updates the profile XP', async () => {
    await syncXpToDb('test-user', 250);
    const profile = memDB.user_profiles.find((p: any) => p.id === 'test-user');
    expect(profile.xp).toBe(250);
  });

  it('loadUserBadges returns badges and XP', async () => {
    memDB.user_badges.push(
      { user_id: 'test-user', badge_id: 'premier_lancer', unlocked_at: new Date().toISOString() },
      { user_id: 'test-user', badge_id: 'statisticien', unlocked_at: new Date().toISOString() },
    );
    memDB.user_profiles[0].xp = 150;

    const { badges, xp } = await loadUserBadges('test-user');
    expect(badges).toHaveLength(2);
    expect(badges.map(b => b.badgeId)).toContain('premier_lancer');
    expect(badges.map(b => b.badgeId)).toContain('statisticien');
    expect(xp).toBe(150);
  });

  it('loadUserBadges returns empty for unknown user', async () => {
    const { badges, xp } = await loadUserBadges('nonexistent');
    expect(badges).toHaveLength(0);
    expect(xp).toBe(0);
  });
});

// ============================================
// Phase 7: Badge Metadata
// ============================================

describe('Phase 7 — Badge Metadata', () => {
  it('all badges have FR and EN names', () => {
    BADGES.forEach(badge => {
      const fr = getBadgeName(badge.id, 'fr');
      const en = getBadgeName(badge.id, 'en');
      expect(fr).toBeTruthy();
      expect(en).toBeTruthy();
      expect(fr).not.toBe(badge.id);
      expect(en).not.toBe(badge.id);
    });
  });

  it('all badges have FR and EN descriptions', () => {
    BADGES.forEach(badge => {
      const fr = getBadgeDescription(badge.id, 'fr');
      const en = getBadgeDescription(badge.id, 'en');
      expect(fr).toBeTruthy();
      expect(en).toBeTruthy();
    });
  });

  it('unknown badge returns badge id as name', () => {
    expect(getBadgeName('unknown_badge', 'fr')).toBe('unknown_badge');
  });

  it('all badges have valid color hex', () => {
    BADGES.forEach(badge => {
      expect(badge.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('all badges have positive xpReward', () => {
    BADGES.forEach(badge => {
      expect(badge.xpReward).toBeGreaterThan(0);
    });
  });

  it('BADGES has 12 definitions', () => {
    expect(BADGES).toHaveLength(12);
  });
});

// ============================================
// Phase 8: Complete E2E Badge Unlock Lifecycle
// ============================================

describe('Phase 8 — Full E2E Lifecycle', () => {
  it('play 10 matches with high tir rate → unlock 3 badges → correct XP and level', async () => {
    // Step 1: Simulate 10 matches with 75% tir rate
    const matches = makeMatches(10, {
      winner: 'A',
      playerActions: [
        { playerId: 'test-user', playerName: 'TestPlayer', team: 'A', actions: { tirs: 8, tirsSuccess: 6, points: 4, pointsSuccess: 3, carreaux: 1 } },
      ],
    });

    // Step 2: Build context
    const context = buildBadgeContext({
      matches,
      challenges: [],
      userStats: { winRate: 100, tirSuccessRate: 75, carreauRate: 12.5 },
      sharedMatchIds: [],
      userId: 'test-user',
      isAmbassador: false,
      leaderboardRank: null,
    });

    expect(context.matchCount).toBe(10);
    expect(context.totalCarreaux).toBe(10); // 10 matches * 1 carreau each
    expect(context.tirRate).toBe(75);

    // Step 3: Check and award badges
    const newBadges = await checkAndAwardBadges('test-user', context, []);

    // Should unlock: premier_lancer (1+), statisticien (5+), oeil_de_lynx (10+ & 70%+), roi_du_carreau (10 carreaux)
    expect(newBadges).toContain('premier_lancer');
    expect(newBadges).toContain('statisticien');
    expect(newBadges).toContain('oeil_de_lynx');
    expect(newBadges).toContain('roi_du_carreau');

    // Step 4: Calculate and sync XP
    const totalXp = calculateTotalXp({
      matchCount: 10,
      totalCarreaux: 10,
      sharedAcceptedCount: 0,
      badgeCount: newBadges.length,
    });
    // 10*10 + 10*5 + 0 + 4*50 = 100 + 50 + 200 = 350
    expect(totalXp).toBe(350);

    await syncXpToDb('test-user', totalXp);

    // Step 5: Verify level
    const level = getLevelFromXp(totalXp);
    expect(level.nameEn).toBe('Advanced'); // 200-499 range

    // Step 6: Verify DB state
    const { badges, xp } = await loadUserBadges('test-user');
    expect(badges.length).toBeGreaterThanOrEqual(4);
    expect(xp).toBe(350);

    // Step 7: Second check should not re-award
    const secondCheck = await checkAndAwardBadges('test-user', context, badges);
    expect(secondCheck).toHaveLength(0);
  });

  it('trust badges unlock when trust score is set', async () => {
    const context: BadgeContext = {
      matchCount: 5, winRate: 60, tirRate: 50, carreauRate: 10, totalCarreaux: 3,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 2,
      leaderboardRank: null, consecutiveDaysPlayed: 1, isAmbassador: false, trustScore: 85,
    };

    const newBadges = await checkAndAwardBadges('test-user', context, []);
    expect(newBadges).toContain('fiable');    // trust >= 65
    expect(newBadges).toContain('verifie');   // trust >= 80
  });

  it('ambassador badge unlocks for ambassadors', async () => {
    const context: BadgeContext = {
      matchCount: 1, winRate: 100, tirRate: 0, carreauRate: 0, totalCarreaux: 0,
      sharedAcceptedCount: 0, invitedUsersCount: 0, uniqueTerrainsPlayed: 0,
      leaderboardRank: null, consecutiveDaysPlayed: 0, isAmbassador: true, trustScore: null,
    };

    const newBadges = await checkAndAwardBadges('test-user', context, []);
    expect(newBadges).toContain('ambassadeur');
    // Ambassador badge gives 100 XP (not 50)
    const ambassadorBadge = BADGES.find(b => b.id === 'ambassadeur')!;
    expect(ambassadorBadge.xpReward).toBe(100);
  });
});
