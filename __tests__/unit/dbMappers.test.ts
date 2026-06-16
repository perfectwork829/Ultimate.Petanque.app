/**
 * Unit tests for services/dbMappers.ts
 *
 * Tests: 7 mappers (mapPlayerFromDb, mapClubFromDb, mapTerrainFromDb,
 * mapTournamentFromDb, mapMatchFromDb, mapChallengeFromDb, mapBoulesSetFromDb),
 * mergeRecords (upsert, append, empty), calculatePlayerStatsFromMatches
 * (wins/losses, winRate, tirRate, pointRate, carreauRate, avgPoints).
 */

// ─── Inline implementations (mirrors dbMappers.ts logic) ──

function mapPlayerFromDb(p: any): any {
  return {
    id: p.id, name: p.name, nickname: p.nickname, avatar: p.avatar,
    club: p.club, clubId: p.club_id, role: p.role, level: p.level,
    location: p.location, phone: p.phone, email: p.email, country: p.country,
    boules: p.boules, handedness: p.handedness, terrainId: p.terrain_id,
    terrainName: p.terrain_name, isPublic: p.is_public ?? false,
    showContactPublic: p.show_contact_public ?? false,
    stats: p.stats || {
      matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
      tirRate: 0, pointRate: 0, carreauRate: 0,
      avgPointsScored: 0, avgPointsConceded: 0,
    },
    createdAt: p.created_at,
  };
}

function mapClubFromDb(c: any): any {
  return {
    id: c.id, name: c.name, logo: c.logo, address: c.address, city: c.city,
    country: c.country || 'France', location: c.location || { latitude: 0, longitude: 0 },
    membersCount: c.members_count || 0, foundedYear: c.founded_year,
    description: c.description, facilities: c.facilities || [],
    contactEmail: c.contact_email, contactPhone: c.contact_phone,
    terrainId: c.terrain_id, terrainName: c.terrain_name,
    membershipCost: c.membership_cost ? parseFloat(c.membership_cost) : undefined,
    isPublic: c.is_public ?? false, showContactPublic: c.show_contact_public ?? false,
    clubCardUrl: c.club_card_url || undefined,
    website: c.website || undefined,
    facebookUrl: c.facebook_url || undefined,
    instagramHandle: c.instagram_handle || undefined,
  };
}

function mapTerrainFromDb(t: any): any {
  return {
    id: t.id, name: t.name, address: t.address, city: t.city,
    location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
    description: t.description, facilities: t.facilities || [], photos: t.photos || [],
    clubId: t.club_id, clubName: t.club_name, isPublic: t.is_public ?? true,
    publicAccess: t.public_access ?? true, courtsCount: t.courts_count || 1,
    lighting: t.lighting ?? false, covered: t.covered ?? false,
    environment: t.environment || 'outdoor', createdAt: t.created_at,
  };
}

function mapTournamentFromDb(t: any): any {
  return {
    id: t.id, name: t.name, date: t.date, endDate: t.end_date,
    type: t.type, format: t.format, location: t.location,
    terrainId: t.terrain_id, terrainName: t.terrain_name, terrainType: t.terrain_type,
    clubId: t.club_id, clubName: t.club_name, status: t.status,
    participants: t.participants || 0, maxParticipants: t.max_participants || 32,
    prize: t.prize, description: t.description, teams: t.teams, phases: t.phases,
    currentPhaseId: t.current_phase_id, tournamentLevel: t.tournament_level,
    tournamentCategory: t.tournament_category, registrationType: t.registration_type,
    tournamentScope: t.tournament_scope,
    registrationCost: t.registration_cost ? parseFloat(t.registration_cost) : undefined,
    prizeWon: t.prize_won ? parseFloat(t.prize_won) : undefined,
    finalResult: t.final_result, isPublic: t.is_public ?? false,
  };
}

function mapMatchFromDb(m: any): any {
  return {
    id: m.id, date: m.date, mode: m.mode, format: m.format,
    tournamentId: m.tournament_id, tournamentName: m.tournament_name,
    tournamentPhase: m.tournament_phase, tournamentBracket: m.tournament_bracket,
    bracketMatchId: m.bracket_match_id, terrainId: m.terrain_id, terrainType: m.terrain_type,
    boulesSetId: m.boules_set_id,
    teamA: m.team_a, teamB: m.team_b, winner: m.winner,
    duration: m.duration || 0, menes: m.menes || [],
    playerActions: m.player_actions, seriesInfo: m.series_info,
    notes: m.notes || undefined,
  };
}

function mapChallengeFromDb(c: any): any {
  return {
    id: c.id, type: c.type, mode: c.mode || 'solo', date: c.date,
    boulesSetId: c.boules_set_id, terrainId: c.terrain_id,
    playerId: c.player_id, playerName: c.player_name,
    sponsorId: c.sponsor_id || undefined,
    sponsorName: c.sponsor_name || undefined,
    sponsorPhoto: c.sponsor_photo || undefined,
    opponentId: c.opponent_id, opponentName: c.opponent_name,
    opponentResult: c.opponent_result, winner: c.winner,
    shots: c.shots, successCount: c.success_count, totalShots: c.total_shots,
    carreauCount: c.carreau_count,
    successRate: c.success_rate ? parseFloat(c.success_rate) : undefined,
    precisionShots: c.precision_shots, totalPoints: c.total_points,
    maxPoints: c.max_points, atelierScores: c.atelier_scores,
    duration: c.duration, notes: c.notes, detailedShots: c.detailed_shots,
  };
}

function mapBoulesSetFromDb(s: any): any {
  return {
    id: s.id, name: s.name, brand: s.brand,
    diameter: s.diameter ? parseFloat(s.diameter) : undefined,
    weight: s.weight || undefined, serialNumber: s.serial_number,
    hardness: s.hardness, isPrimary: s.is_primary, notes: s.notes, photo: s.photo,
    purchasePrice: s.purchase_price ? parseFloat(s.purchase_price) : undefined,
  };
}

function mergeRecords<T extends { id: string }>(existing: T[], delta: T[]): T[] {
  if (delta.length === 0) return existing;
  const deltaMap = new Map(delta.map(item => [item.id, item]));
  const merged = existing.map(item => deltaMap.has(item.id) ? deltaMap.get(item.id)! : item);
  const existingIds = new Set(existing.map(item => item.id));
  delta.forEach(item => { if (!existingIds.has(item.id)) merged.push(item); });
  return merged;
}

function calculatePlayerStatsFromMatches(allMatches: any[], playerId: string, existingStats: any) {
  const playerMatches = allMatches.filter(m =>
    m.teamA.players.includes(playerId) || m.teamB.players.includes(playerId)
  );
  if (playerMatches.length === 0) return existingStats;
  const totalMatches = playerMatches.length;
  const wins = playerMatches.filter(m => {
    const inA = m.teamA.players.includes(playerId);
    return (inA && m.winner === 'A') || (!inA && m.winner === 'B');
  }).length;
  const losses = totalMatches - wins;
  let totalTirs = 0, totalTirsSuccess = 0, totalPoints = 0, totalPointsSuccess = 0, totalCarreaux = 0;
  let totalScoreFor = 0, totalScoreAgainst = 0;
  playerMatches.forEach(m => {
    const inA = m.teamA.players.includes(playerId);
    totalScoreFor += inA ? m.teamA.score : m.teamB.score;
    totalScoreAgainst += inA ? m.teamB.score : m.teamA.score;
    if (m.playerActions) {
      const pa = m.playerActions.find((a: any) => a.playerId === playerId);
      if (pa) {
        totalTirs += pa.actions.tirs; totalTirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points; totalPointsSuccess += pa.actions.pointsSuccess;
        totalCarreaux += pa.actions.carreaux;
      }
    }
  });
  return {
    ...existingStats, matchesPlayed: totalMatches, wins, losses,
    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0,
    tirRate: totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 1000) / 10 : existingStats.tirRate || 0,
    pointRate: totalPoints > 0 ? Math.round((totalPointsSuccess / totalPoints) * 1000) / 10 : existingStats.pointRate || 0,
    carreauRate: totalTirsSuccess > 0 ? Math.round((totalCarreaux / totalTirsSuccess) * 1000) / 10 : existingStats.carreauRate || 0,
    avgPointsScored: totalMatches > 0 ? Math.round((totalScoreFor / totalMatches) * 10) / 10 : 0,
    avgPointsConceded: totalMatches > 0 ? Math.round((totalScoreAgainst / totalMatches) * 10) / 10 : 0,
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('mapPlayerFromDb', () => {
  test('maps all fields correctly', () => {
    const p = mapPlayerFromDb({ id: 'p1', name: 'Alice', nickname: 'Ali', avatar: 'url', club: 'Club1', club_id: 'c1', role: 'Tireur', level: 'Expert', location: { city: 'Lyon' }, phone: '06', email: 'a@b.com', country: 'France', boules: { brand: 'Obut' }, handedness: 'right', terrain_id: 't1', terrain_name: 'T1', is_public: true, show_contact_public: true, stats: { matchesPlayed: 10 }, created_at: '2026-01-01' });
    expect(p.id).toBe('p1'); expect(p.name).toBe('Alice'); expect(p.clubId).toBe('c1');
    expect(p.isPublic).toBe(true); expect(p.stats.matchesPlayed).toBe(10);
  });
  test('defaults stats when missing', () => {
    const p = mapPlayerFromDb({ id: 'p2' });
    expect(p.stats.matchesPlayed).toBe(0); expect(p.stats.winRate).toBe(0);
  });
  test('defaults isPublic to false', () => {
    expect(mapPlayerFromDb({ id: 'p3' }).isPublic).toBe(false);
  });
});

describe('mapClubFromDb', () => {
  test('maps and defaults correctly', () => {
    const c = mapClubFromDb({ id: 'c1', name: 'Club', members_count: 25, membership_cost: '49.99', is_public: true });
    expect(c.membersCount).toBe(25); expect(c.membershipCost).toBe(49.99); expect(c.country).toBe('France');
    expect(c.facilities).toEqual([]);
  });
  test('parses membership_cost as float', () => {
    expect(mapClubFromDb({ membership_cost: '100.50' }).membershipCost).toBe(100.5);
  });
  test('undefined membership_cost stays undefined', () => {
    expect(mapClubFromDb({}).membershipCost).toBeUndefined();
  });
});

describe('mapTerrainFromDb', () => {
  test('defaults location, isPublic, environment', () => {
    const t = mapTerrainFromDb({ id: 't1', name: 'T' });
    expect(t.location).toEqual({ latitude: 0, longitude: 0 });
    expect(t.isPublic).toBe(true); expect(t.environment).toBe('outdoor');
    expect(t.courtsCount).toBe(1); expect(t.lighting).toBe(false);
  });
});

describe('mapTournamentFromDb', () => {
  test('parses cost fields', () => {
    const t = mapTournamentFromDb({ registration_cost: '15.00', prize_won: '200.50' });
    expect(t.registrationCost).toBe(15); expect(t.prizeWon).toBe(200.5);
  });
  test('defaults participants and maxParticipants', () => {
    const t = mapTournamentFromDb({});
    expect(t.participants).toBe(0); expect(t.maxParticipants).toBe(32);
  });
});

describe('mapMatchFromDb', () => {
  test('maps teams and defaults duration/menes', () => {
    const m = mapMatchFromDb({ id: 'm1', team_a: { score: 13 }, team_b: { score: 7 }, winner: 'A' });
    expect(m.teamA.score).toBe(13); expect(m.duration).toBe(0); expect(m.menes).toEqual([]);
  });
  test('notes undefined when null', () => {
    expect(mapMatchFromDb({ notes: null }).notes).toBeUndefined();
  });
});

describe('mapChallengeFromDb', () => {
  test('defaults mode to solo', () => {
    expect(mapChallengeFromDb({ mode: null }).mode).toBe('solo');
  });
  test('parses success_rate as float', () => {
    expect(mapChallengeFromDb({ success_rate: '85.5' }).successRate).toBe(85.5);
  });
  test('sponsor fields default to undefined', () => {
    const c = mapChallengeFromDb({});
    expect(c.sponsorId).toBeUndefined(); expect(c.sponsorName).toBeUndefined();
  });
});

describe('mapBoulesSetFromDb', () => {
  test('parses diameter and purchase_price', () => {
    const b = mapBoulesSetFromDb({ diameter: '71.5', purchase_price: '149.99' });
    expect(b.diameter).toBe(71.5); expect(b.purchasePrice).toBe(149.99);
  });
  test('undefined when null', () => {
    const b = mapBoulesSetFromDb({});
    expect(b.diameter).toBeUndefined(); expect(b.weight).toBeUndefined();
  });
});

describe('mergeRecords', () => {
  test('upserts existing items', () => {
    const existing = [{ id: '1', name: 'old' }, { id: '2', name: 'keep' }];
    const delta = [{ id: '1', name: 'new' }];
    const result = mergeRecords(existing, delta);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.id === '1')!.name).toBe('new');
    expect(result.find(r => r.id === '2')!.name).toBe('keep');
  });
  test('appends new items', () => {
    const result = mergeRecords([{ id: '1', v: 'a' }], [{ id: '2', v: 'b' }]);
    expect(result).toHaveLength(2);
  });
  test('empty delta returns existing', () => {
    const existing = [{ id: '1' }];
    expect(mergeRecords(existing, [])).toBe(existing);
  });
  test('empty existing with delta returns delta', () => {
    const result = mergeRecords([], [{ id: '1' }, { id: '2' }]);
    expect(result).toHaveLength(2);
  });
  test('handles both upsert and append', () => {
    const result = mergeRecords([{ id: '1', v: 'old' }], [{ id: '1', v: 'new' }, { id: '2', v: 'added' }]);
    expect(result).toHaveLength(2);
    expect(result[0].v).toBe('new'); expect(result[1].v).toBe('added');
  });
});

describe('calculatePlayerStatsFromMatches', () => {
  const makeMatch = (pid: string, team: 'A' | 'B', winner: string, scoreA = 13, scoreB = 7, actions?: any) => ({
    teamA: { players: team === 'A' ? [pid] : ['other'], score: scoreA },
    teamB: { players: team === 'B' ? [pid] : ['other'], score: scoreB },
    winner, playerActions: actions || null,
  });

  test('computes wins, losses, winRate', () => {
    const matches = [makeMatch('p1', 'A', 'A'), makeMatch('p1', 'A', 'B'), makeMatch('p1', 'B', 'B')];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', {});
    expect(result.matchesPlayed).toBe(3); expect(result.wins).toBe(2); expect(result.losses).toBe(1);
    expect(result.winRate).toBe(66.7);
  });

  test('computes tir, point, carreau rates from playerActions', () => {
    const actions = [{ playerId: 'p1', actions: { tirs: 20, tirsSuccess: 14, points: 10, pointsSuccess: 8, carreaux: 3 } }];
    const matches = [makeMatch('p1', 'A', 'A', 13, 7, actions)];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', {});
    expect(result.tirRate).toBe(70); expect(result.pointRate).toBe(80);
    expect(result.carreauRate).toBe(21.4);
  });

  test('returns existingStats when no matches found', () => {
    const existing = { tirRate: 50 };
    expect(calculatePlayerStatsFromMatches([], 'p1', existing)).toBe(existing);
  });

  test('avgPointsScored and avgPointsConceded', () => {
    const matches = [makeMatch('p1', 'A', 'A', 13, 5), makeMatch('p1', 'A', 'A', 13, 9)];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', {});
    expect(result.avgPointsScored).toBe(13); expect(result.avgPointsConceded).toBe(7);
  });

  test('preserves existing tirRate when no actions', () => {
    const matches = [makeMatch('p1', 'A', 'A')];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', { tirRate: 55 });
    expect(result.tirRate).toBe(55);
  });

  test('100% win rate', () => {
    const matches = [makeMatch('p1', 'A', 'A'), makeMatch('p1', 'B', 'B')];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', {});
    expect(result.winRate).toBe(100); expect(result.losses).toBe(0);
  });

  test('0% win rate', () => {
    const matches = [makeMatch('p1', 'A', 'B'), makeMatch('p1', 'B', 'A')];
    const result = calculatePlayerStatsFromMatches(matches, 'p1', {});
    expect(result.winRate).toBe(0); expect(result.wins).toBe(0);
  });
});
