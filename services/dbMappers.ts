/**
 * DB Row Mappers
 * Pure functions that transform raw Supabase DB rows into typed domain objects.
 * Also includes shared utilities: mergeRecords, calculatePlayerStatsFromMatches.
 *
 * Extracted from contexts/AppContext.tsx — no logic changes.
 */
import {
  Player,
  Club,
  Tournament,
  Match,
  Challenge,
  Terrain,
  BoulesSet,
} from '@/types/petanque';

// ============================================
// Row → Domain mappers
// ============================================

export function mapPlayerFromDb(p: any): Player {
  return {
    id: p.id, userId: p.user_id || undefined, name: p.name, nickname: p.nickname, avatar: p.avatar,
    club: p.club, clubId: p.club_id, role: p.role, level: p.level,
    experience: p.experience || undefined,
    city: p.city || p.location?.city || undefined,
    location: p.location, phone: p.phone, email: p.email, country: p.country,
    boules: p.boules, handedness: p.handedness, terrainId: p.terrain_id,
    terrainName: p.terrain_name, isPublic: p.is_public ?? false,
    showContactPublic: p.show_contact_public ?? false,
    sponsorId: p.sponsor_id || undefined,
    eloRating: p.elo_rating || 1000,
    eloTireur: p.elo_tireur || 1000,
    eloPointeur: p.elo_pointeur || 1000,
    eloMilieu: p.elo_milieu || 1000,
    lastMatchDate: p.last_match_date || undefined,
    stats: p.stats || {
      matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
      tirRate: 0, pointRate: 0, carreauRate: 0,
      avgPointsScored: 0, avgPointsConceded: 0,
    },
    createdAt: p.created_at,
  };
}

export function mapClubFromDb(c: any): Club {
  return {
    id: c.id, userId: c.user_id || undefined, name: c.name, logo: c.logo, address: c.address, city: c.city,
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
    isVerified: c.is_verified ?? false,
    sponsorId: c.sponsor_id || undefined,
  };
}

export function mapTerrainFromDb(t: any): Terrain {
  return {
    id: t.id, userId: t.user_id || undefined, name: t.name, address: t.address, city: t.city,
    location: t.location || { latitude: 0, longitude: 0, country: 'France' }, type: t.type,
    description: t.description, facilities: t.facilities || [], photos: t.photos || [],
    clubId: t.club_id, clubName: t.club_name, isPublic: t.is_public ?? true,
    publicAccess: t.public_access ?? true, courtsCount: t.courts_count || 1,
    lighting: t.lighting ?? false, covered: t.covered ?? false, parking: t.parking ?? false, toilets: t.toilets ?? false,
    environment: t.environment || 'outdoor', createdAt: t.created_at,
    sponsorId: t.sponsor_id || undefined,
  };
}

export function mapTournamentFromDb(t: any): Tournament {
  return {
    id: t.id, userId: t.user_id || undefined, name: t.name, date: t.date, endDate: t.end_date,
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
    posterUrl: t.poster_url || undefined,
    sponsorId: t.sponsor_id || undefined,
  };
}

export function mapMatchFromDb(m: any): Match {
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

export function mapChallengeFromDb(c: any): Challenge {
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

export function mapBoulesSetFromDb(s: any): BoulesSet {
  return {
    id: s.id, name: s.name, brand: s.brand,
    diameter: s.diameter ? parseFloat(s.diameter) : undefined,
    weight: s.weight || undefined, serialNumber: s.serial_number,
    hardness: s.hardness, isPrimary: s.is_primary, notes: s.notes, photo: s.photo,
    purchasePrice: s.purchase_price ? parseFloat(s.purchase_price) : undefined,
  };
}

// ============================================
// Utilities
// ============================================

/** Merge delta records into existing array (upsert by id). */
export function mergeRecords<T extends { id: string }>(existing: T[], delta: T[]): T[] {
  if (delta.length === 0) return existing;
  const deltaMap = new Map(delta.map(item => [item.id, item]));
  const merged = existing.map(item => deltaMap.has(item.id) ? deltaMap.get(item.id)! : item);
  const existingIds = new Set(existing.map(item => item.id));
  delta.forEach(item => {
    if (!existingIds.has(item.id)) merged.push(item);
  });
  return merged;
}

/** Calculate stats for a single player from match data. */
export function calculatePlayerStatsFromMatches(allMatches: Match[], playerId: string, existingStats: any) {
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
      const pa = m.playerActions.find(a => a.playerId === playerId);
      if (pa) {
        totalTirs += pa.actions.tirs;
        totalTirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        totalPointsSuccess += pa.actions.pointsSuccess;
        totalCarreaux += pa.actions.carreaux;
      }
    }
  });

  return {
    ...existingStats,
    matchesPlayed: totalMatches,
    wins,
    losses,
    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0,
    tirRate: totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 1000) / 10 : existingStats.tirRate || 0,
    pointRate: totalPoints > 0 ? Math.round((totalPointsSuccess / totalPoints) * 1000) / 10 : existingStats.pointRate || 0,
    carreauRate: totalTirsSuccess > 0 ? Math.round((totalCarreaux / totalTirsSuccess) * 1000) / 10 : existingStats.carreauRate || 0,
    avgPointsScored: totalMatches > 0 ? Math.round((totalScoreFor / totalMatches) * 10) / 10 : 0,
    avgPointsConceded: totalMatches > 0 ? Math.round((totalScoreAgainst / totalMatches) * 10) / 10 : 0,
  };
}
