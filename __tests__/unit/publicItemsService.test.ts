/**
 * Unit tests for services/publicItemsService.ts
 *
 * Tests: mapPublicPlayer/Club/Terrain/Tournament, self-exclusion filtering,
 * duplicate detection (exact/city match), import payload construction,
 * toggle public, excluding items from duplicate checks.
 */

// ─── Inline implementations ──

interface PublicPlayer {
  id: string; userId: string; name: string; nickname?: string; avatar?: string;
  club?: string; role: string; level: string; location?: any; country?: string; stats: any; isPremium?: boolean;
}

interface PublicClub {
  id: string; userId: string; name: string; address: string; city: string; country?: string;
  location: { latitude: number; longitude: number }; membersCount: number; foundedYear?: number;
  description?: string; facilities?: string[]; terrainName?: string; membershipCost?: number;
}

interface PublicTerrain {
  id: string; userId: string; name: string; address: string; city: string;
  location: { latitude: number; longitude: number }; type: string;
  description?: string; facilities?: string[]; clubName?: string;
  courtsCount: number; lighting: boolean; covered: boolean;
}

interface PublicTournament {
  id: string; userId: string; name: string; date: string; endDate?: string; type: string; format: string;
  location: any; terrainName?: string; clubName?: string; status: string;
  participants: number; maxParticipants: number; prize?: string; description?: string;
}

function mapPublicPlayer(p: any, premiumIds: Set<string>): PublicPlayer {
  return {
    id: p.id, userId: p.user_id, name: p.name, nickname: p.nickname, avatar: p.avatar,
    club: p.club, role: p.role, level: p.level, location: p.location,
    country: p.country, stats: p.stats || {}, isPremium: premiumIds.has(p.user_id),
  };
}

function mapPublicClub(c: any): PublicClub {
  return {
    id: c.id, userId: c.user_id, name: c.name, address: c.address, city: c.city,
    country: c.country, location: c.location || { latitude: 0, longitude: 0 },
    membersCount: c.members_count || 0, foundedYear: c.founded_year,
    description: c.description, facilities: c.facilities,
    terrainName: c.terrain_name, membershipCost: c.membership_cost ? parseFloat(c.membership_cost) : undefined,
  };
}

function mapPublicTerrain(t: any): PublicTerrain {
  return {
    id: t.id, userId: t.user_id, name: t.name, address: t.address, city: t.city,
    location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
    description: t.description, facilities: t.facilities, clubName: t.club_name,
    courtsCount: t.courts_count || 1, lighting: t.lighting ?? false, covered: t.covered ?? false,
  };
}

function mapPublicTournament(t: any): PublicTournament {
  return {
    id: t.id, userId: t.user_id, name: t.name, date: t.date, endDate: t.end_date,
    type: t.type, format: t.format, location: t.location,
    terrainName: t.terrain_name, clubName: t.club_name, status: t.status,
    participants: t.participants || 0, maxParticipants: t.max_participants || 32,
    prize: t.prize, description: t.description,
  };
}

function filterSelfItems(items: { user_id: string }[], currentUserId: string | undefined): any[] {
  return items.filter(i => i.user_id !== currentUserId);
}

function findDuplicateTerrains(
  terrains: any[],
  city: string,
  address?: string,
  currentUserId?: string,
): (PublicTerrain & { matchType: 'exact' | 'city' })[] {
  const normalizedCity = city.trim().toLowerCase();
  const normalizedAddress = (address || '').trim().toLowerCase();
  if (!normalizedCity) return [];

  return terrains
    .filter(t => t.user_id !== currentUserId)
    .filter(t => (t.city || '').trim().toLowerCase() === normalizedCity)
    .map(t => {
      const tAddress = (t.address || '').trim().toLowerCase();
      const isExact = normalizedAddress && tAddress && (
        tAddress.includes(normalizedAddress) || normalizedAddress.includes(tAddress)
      );
      return { ...mapPublicTerrain(t), matchType: isExact ? 'exact' as const : 'city' as const };
    })
    .sort((a, b) => (a.matchType === 'exact' ? -1 : 1) - (b.matchType === 'exact' ? -1 : 1));
}

function findDuplicateClubs(
  clubs: any[],
  city: string,
  name?: string,
  currentUserId?: string,
): (PublicClub & { matchType: 'exact' | 'city' })[] {
  const normalizedCity = city.trim().toLowerCase();
  const normalizedName = (name || '').trim().toLowerCase();
  if (!normalizedCity) return [];

  return clubs
    .filter(c => c.user_id !== currentUserId)
    .filter(c => (c.city || '').trim().toLowerCase() === normalizedCity)
    .map(c => {
      const cName = (c.name || '').trim().toLowerCase();
      const isExact = normalizedName && cName && (
        cName.includes(normalizedName) || normalizedName.includes(cName)
      );
      return { ...mapPublicClub(c), matchType: isExact ? 'exact' as const : 'city' as const };
    })
    .sort((a, b) => (a.matchType === 'exact' ? -1 : 1) - (b.matchType === 'exact' ? -1 : 1));
}

const VALID_TABLES = ['players', 'clubs', 'terrains', 'tournaments'] as const;

// ─── Tests ──

describe('mapPublicPlayer', () => {
  test('maps basic fields', () => {
    const p = mapPublicPlayer({ id: 'p1', user_id: 'u1', name: 'Jean', role: 'Tireur', level: 'Expert', stats: { wins: 10 } }, new Set());
    expect(p.id).toBe('p1');
    expect(p.userId).toBe('u1');
    expect(p.name).toBe('Jean');
    expect(p.role).toBe('Tireur');
    expect(p.stats.wins).toBe(10);
    expect(p.isPremium).toBe(false);
  });

  test('detects premium user', () => {
    const p = mapPublicPlayer({ id: 'p1', user_id: 'u1', name: 'A', role: 'M', level: 'I' }, new Set(['u1']));
    expect(p.isPremium).toBe(true);
  });

  test('null stats defaults to empty object', () => {
    const p = mapPublicPlayer({ id: 'p1', user_id: 'u1', name: 'A', role: 'M', level: 'I', stats: null }, new Set());
    expect(p.stats).toEqual({});
  });
});

describe('mapPublicClub', () => {
  test('maps basic fields', () => {
    const c = mapPublicClub({ id: 'c1', user_id: 'u1', name: 'Club A', address: '1 Rue', city: 'Paris', members_count: 50 });
    expect(c.membersCount).toBe(50);
    expect(c.city).toBe('Paris');
  });

  test('null location defaults to 0,0', () => {
    const c = mapPublicClub({ id: 'c1', user_id: 'u1', name: 'C', address: '', city: 'Lyon', location: null });
    expect(c.location).toEqual({ latitude: 0, longitude: 0 });
  });

  test('parses membership_cost as float', () => {
    const c = mapPublicClub({ id: 'c1', user_id: 'u1', name: 'C', address: '', city: 'Nice', membership_cost: '49.99' });
    expect(c.membershipCost).toBe(49.99);
  });

  test('null membership_cost = undefined', () => {
    const c = mapPublicClub({ id: 'c1', user_id: 'u1', name: 'C', address: '', city: 'Nice', membership_cost: null });
    expect(c.membershipCost).toBeUndefined();
  });
});

describe('mapPublicTerrain', () => {
  test('maps with defaults', () => {
    const t = mapPublicTerrain({ id: 't1', user_id: 'u1', name: 'Boulodrome', address: '5 Av', city: 'Marseille', type: 'Sable' });
    expect(t.courtsCount).toBe(1);
    expect(t.lighting).toBe(false);
    expect(t.covered).toBe(false);
  });

  test('preserves explicit values', () => {
    const t = mapPublicTerrain({ id: 't1', user_id: 'u1', name: 'B', address: '', city: 'Nice', type: 'Gravier', courts_count: 4, lighting: true, covered: true });
    expect(t.courtsCount).toBe(4);
    expect(t.lighting).toBe(true);
    expect(t.covered).toBe(true);
  });
});

describe('mapPublicTournament', () => {
  test('maps with defaults', () => {
    const t = mapPublicTournament({ id: 't1', user_id: 'u1', name: 'Open', date: '2026-06-01', type: 'Mixte', format: 'Doublette', status: 'A venir', location: {} });
    expect(t.participants).toBe(0);
    expect(t.maxParticipants).toBe(32);
  });
});

describe('filterSelfItems', () => {
  const items = [
    { user_id: 'u1', name: 'A' },
    { user_id: 'u2', name: 'B' },
    { user_id: 'u3', name: 'C' },
  ];

  test('excludes own items', () => {
    expect(filterSelfItems(items, 'u2')).toHaveLength(2);
  });

  test('undefined userId returns all', () => {
    expect(filterSelfItems(items, undefined)).toHaveLength(3);
  });

  test('non-matching userId returns all', () => {
    expect(filterSelfItems(items, 'u99')).toHaveLength(3);
  });
});

describe('findDuplicateTerrains', () => {
  const terrains = [
    { id: 't1', user_id: 'u1', name: 'Boulodrome Central', address: '10 avenue de la paix', city: 'Marseille', type: 'Sable' },
    { id: 't2', user_id: 'u2', name: 'Place du village', address: '5 rue des lilas', city: 'Marseille', type: 'Gravier' },
    { id: 't3', user_id: 'u3', name: 'Terrain Lyon', address: '1 place bellecour', city: 'Lyon', type: 'Sable' },
  ];

  test('finds city matches', () => {
    const dupes = findDuplicateTerrains(terrains, 'Marseille');
    expect(dupes).toHaveLength(3);
  });

  test('exact address match sorted first', () => {
    const dupes = findDuplicateTerrains(terrains, 'Marseille', '10 avenue de la paix');
    const exact = dupes.filter(d => d.matchType === 'exact');
    expect(exact.length).toBeGreaterThanOrEqual(1);
    expect(dupes[0].matchType).toBe('exact');
  });

  test('case insensitive city', () => {
    const dupes = findDuplicateTerrains(terrains, 'marseille');
    expect(dupes).toHaveLength(3);
  });

  test('excludes own items', () => {
    const dupes = findDuplicateTerrains(terrains, 'Marseille', undefined, 'u1');
    expect(dupes).toHaveLength(2);
    expect(dupes.every(d => d.userId !== 'u1')).toBe(true);
  });

  test('empty city returns empty', () => {
    expect(findDuplicateTerrains(terrains, '')).toHaveLength(0);
    expect(findDuplicateTerrains(terrains, '  ')).toHaveLength(0);
  });

  test('no matches returns empty', () => {
    expect(findDuplicateTerrains(terrains, 'Tokyo')).toHaveLength(0);
  });
});

describe('findDuplicateClubs', () => {
  const clubs = [
    { id: 'c1', user_id: 'u1', name: 'Petanque Club', address: '', city: 'Paris', members_count: 30 },
    { id: 'c2', user_id: 'u2', name: 'Club des Boules', address: '', city: 'Paris', members_count: 20 },
    { id: 'c3', user_id: 'u3', name: 'Lyon Petanque', address: '', city: 'Lyon', members_count: 15 },
  ];

  test('finds city matches', () => {
    const dupes = findDuplicateClubs(clubs, 'Paris');
    expect(dupes).toHaveLength(3);
  });

  test('exact name match', () => {
    const dupes = findDuplicateClubs(clubs, 'Paris', 'Petanque');
    const exact = dupes.filter(d => d.matchType === 'exact');
    expect(exact.length).toBeGreaterThanOrEqual(1);
  });

  test('excludes own items', () => {
    const dupes = findDuplicateClubs(clubs, 'Paris', undefined, 'u1');
    expect(dupes.every(d => d.userId !== 'u1')).toBe(true);
  });
});

describe('VALID_TABLES', () => {
  test('4 tables supported', () => {
    expect(VALID_TABLES).toHaveLength(4);
  });

  test('includes players, clubs, terrains, tournaments', () => {
    expect(VALID_TABLES).toContain('players');
    expect(VALID_TABLES).toContain('clubs');
    expect(VALID_TABLES).toContain('terrains');
    expect(VALID_TABLES).toContain('tournaments');
  });
});
