/**
 * ELO Rating Service
 * 
 * Implements a standard ELO rating system adapted for pétanque:
 * - Initial rating: 1000
 * - Adaptive K-factor: 40 (<10 matches), 20 (10-30), 10 (30+)
 * - Match validation weight multiplier from trustScoreService
 * - ELO history tracking for progression charts
 * - Score margin bonus (13-0 has more impact than 13-12)
 * - Inactivity decay (-10/month after 30 days, floor 800)
 * - Match prediction (probability + estimated delta)
 * - Role-specific ELO (Tireur/Pointeur/Milieu)
 * - Seasonal reset (annual compression towards 1000)
 */
import { getSupabaseClient } from '@/template';
import { getMatchValidationWeight } from '@/services/trustScoreService';
import { triggerServerPush } from '@/services/pushTokenService';

// ============================================
// TYPES
// ============================================
export interface EloHistoryEntry {
  id: string;
  playerId: string;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  matchId?: string;
  opponentElo?: number;
  opponentName?: string;
  won: boolean;
  recordedAt: string;
}

export interface EloSeasonEntry {
  id: string;
  userId: string;
  playerId: string;
  seasonYear: number;
  peakElo: number;
  finalElo: number;
  finalRank: string;
  matchesPlayed: number;
  wins: number;
  eloTireur?: number;
  eloPointeur?: number;
  eloMilieu?: number;
  createdAt: string;
}

export interface MatchPrediction {
  teamAWinProbability: number;
  teamBWinProbability: number;
  estimatedDeltaIfAWins: number;
  estimatedDeltaIfBWins: number;
}

export type EloRankTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'master' | 'grand_master';

export interface EloRankInfo {
  tier: EloRankTier;
  label: { fr: string; en: string };
  color: string;
  icon: string;
  minElo: number;
}

// ============================================
// CONSTANTS
// ============================================
export const ELO_INITIAL = 1000;
export const ELO_INACTIVITY_THRESHOLD_DAYS = 30;
export const ELO_INACTIVITY_DECAY_PER_MONTH = 10;
export const ELO_INACTIVITY_FLOOR = 800;
export const ELO_SEASON_COMPRESSION = 0.75;
export const ELO_PLACEMENT_MATCHES = 10;

export const ELO_RANKS: EloRankInfo[] = [
  { tier: 'grand_master', label: { fr: 'Grand Maitre', en: 'Grand Master' }, color: '#FFD700', icon: 'auto-awesome', minElo: 2000 },
  { tier: 'master', label: { fr: 'Maitre', en: 'Master' }, color: '#9333EA', icon: 'military-tech', minElo: 1800 },
  { tier: 'diamond', label: { fr: 'Diamant', en: 'Diamond' }, color: '#06B6D4', icon: 'diamond', minElo: 1500 },
  { tier: 'gold', label: { fr: 'Or', en: 'Gold' }, color: '#F59E0B', icon: 'emoji-events', minElo: 1200 },
  { tier: 'silver', label: { fr: 'Argent', en: 'Silver' }, color: '#94A3B8', icon: 'workspace-premium', minElo: 1100 },
  { tier: 'bronze', label: { fr: 'Bronze', en: 'Bronze' }, color: '#CD7F32', icon: 'shield', minElo: 0 },
];

// ============================================
// CORE ELO CALCULATION
// ============================================

/** 
 * Get adaptive K-factor based on number of matches played.
 * Placement phase (first 10 matches): K=60 for faster calibration.
 * Post-placement: K=40 (<30 matches), K=20 (30-50), K=10 (50+).
 */
export function getKFactor(matchesPlayed: number): number {
  if (matchesPlayed < ELO_PLACEMENT_MATCHES) return 60; // Placement phase
  if (matchesPlayed < 30) return 40;
  if (matchesPlayed <= 50) return 20;
  return 10;
}

/** Check if player is still in placement phase */
export function isInPlacement(matchesPlayed: number): boolean {
  return matchesPlayed < ELO_PLACEMENT_MATCHES;
}

/** Calculate expected score (probability of winning) */
export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/** 
 * Calculate new ELO rating after a match 
 * @param playerElo Current ELO
 * @param opponentElo Opponent ELO
 * @param won Whether the player won
 * @param matchesPlayed Number of matches played (for K-factor)
 * @param validationWeight Match validation weight (0.3-2.0)
 * @param scoreMarginMultiplier Score margin bonus (1.0-1.5)
 * @returns New ELO rating and delta
 */
export function calculateElo(
  playerElo: number,
  opponentElo: number,
  won: boolean,
  matchesPlayed: number,
  validationWeight: number = 1.0,
  scoreMarginMultiplier: number = 1.0
): { newElo: number; delta: number } {
  const K = getKFactor(matchesPlayed);
  const expected = expectedScore(playerElo, opponentElo);
  const actual = won ? 1 : 0;
  
  // Apply validation weight and score margin bonus to K-factor
  const adjustedK = K * Math.min(validationWeight, 2.0) * Math.min(scoreMarginMultiplier, 1.5);
  const delta = Math.round(adjustedK * (actual - expected));
  const newElo = Math.max(100, playerElo + delta); // Floor at 100
  
  return { newElo, delta };
}

// ============================================
// SCORE MARGIN BONUS
// ============================================

/**
 * Calculate score margin multiplier.
 * A 13-0 win has 1.5x impact, a 13-12 win has ~1.04x impact.
 * Formula: 1 + (winnerScore - loserScore) / (2 * winnerScore), capped at 1.5
 */
export function getScoreMarginMultiplier(winnerScore: number, loserScore: number): number {
  if (winnerScore <= 0) return 1.0;
  const margin = (winnerScore - loserScore) / (2 * winnerScore);
  return Math.min(1 + margin, 1.5);
}

// ============================================
// MATCH PREDICTION
// ============================================

/**
 * Predict match outcome based on team ELO averages.
 * Returns win probabilities and estimated ELO deltas.
 */
export function predictMatch(
  teamAElos: number[],
  teamBElos: number[],
  kFactor: number = 20
): MatchPrediction {
  if (teamAElos.length === 0 || teamBElos.length === 0) {
    return { teamAWinProbability: 50, teamBWinProbability: 50, estimatedDeltaIfAWins: 0, estimatedDeltaIfBWins: 0 };
  }
  const avgA = Math.round(teamAElos.reduce((a, b) => a + b, 0) / teamAElos.length);
  const avgB = Math.round(teamBElos.reduce((a, b) => a + b, 0) / teamBElos.length);
  const probA = Math.round(expectedScore(avgA, avgB) * 100);
  const probB = 100 - probA;
  const deltaIfAWins = Math.round(kFactor * (1 - expectedScore(avgA, avgB)));
  const deltaIfBWins = Math.round(kFactor * (1 - expectedScore(avgB, avgA)));
  return {
    teamAWinProbability: probA,
    teamBWinProbability: probB,
    estimatedDeltaIfAWins: deltaIfAWins,
    estimatedDeltaIfBWins: deltaIfBWins,
  };
}

// ============================================
// INACTIVITY DECAY
// ============================================

/**
 * Calculate ELO decay for inactive players.
 * -10 per month after 30 days of inactivity, floor at 800.
 * @returns decayed ELO and the decay amount (0 if not decayed)
 */
export function calculateInactivityDecay(
  currentElo: number,
  lastMatchDate: string | null | undefined
): { decayedElo: number; decayAmount: number } {
  if (!lastMatchDate) return { decayedElo: currentElo, decayAmount: 0 };
  const lastMatch = new Date(lastMatchDate);
  const now = new Date();
  const daysSinceLastMatch = Math.floor((now.getTime() - lastMatch.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastMatch < ELO_INACTIVITY_THRESHOLD_DAYS) {
    return { decayedElo: currentElo, decayAmount: 0 };
  }
  
  const monthsInactive = Math.floor((daysSinceLastMatch - ELO_INACTIVITY_THRESHOLD_DAYS) / 30) + 1;
  const totalDecay = monthsInactive * ELO_INACTIVITY_DECAY_PER_MONTH;
  const decayedElo = Math.max(ELO_INACTIVITY_FLOOR, currentElo - totalDecay);
  const actualDecay = currentElo - decayedElo;
  
  return { decayedElo, decayAmount: actualDecay };
}

// ============================================
// SEASONAL RESET
// ============================================

/**
 * Apply seasonal ELO compression towards 1000.
 * Formula: newElo = 1000 + (currentElo - 1000) * 0.75
 */
export function applySeasonalCompression(currentElo: number): number {
  return Math.round(ELO_INITIAL + (currentElo - ELO_INITIAL) * ELO_SEASON_COMPRESSION);
}

/** Get rank tier from ELO rating */
export function getEloRank(elo: number): EloRankInfo {
  for (const rank of ELO_RANKS) {
    if (elo >= rank.minElo) return rank;
  }
  return ELO_RANKS[ELO_RANKS.length - 1];
}

/** Get rank color for a given ELO */
export function getEloColor(elo: number): string {
  return getEloRank(elo).color;
}

/** Get ELO delta display text with sign */
export function formatEloDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Recalculate ELO for all players from match history.
 * Replays all matches chronologically and updates player elo_rating.
 */
export async function recalculateAllElo(): Promise<{ success: boolean; error: string | null; playersUpdated: number }> {
  const supabase = getSupabaseClient();

  try {
    // 1. Fetch all matches ordered by date
    const { data: matchesData, error: matchErr } = await supabase
      .from('matches')
      .select('id, team_a, team_b, winner, participant_user_ids, date')
      .order('date', { ascending: true });

    if (matchErr) return { success: false, error: matchErr.message, playersUpdated: 0 };

    // 2. Fetch all players
    const { data: playersData, error: playerErr } = await supabase
      .from('players')
      .select('id, user_id, name, stats');

    if (playerErr) return { success: false, error: playerErr.message, playersUpdated: 0 };

    // 3. Initialize ELO map
    const eloMap = new Map<string, number>();
    const matchCountMap = new Map<string, number>();
    const playerNameMap = new Map<string, string>();
    
    for (const p of (playersData || [])) {
      eloMap.set(p.id, ELO_INITIAL);
      matchCountMap.set(p.id, 0);
      playerNameMap.set(p.id, p.name);
    }

    // 4. Replay all matches chronologically
    for (const match of (matchesData || [])) {
      const participantIds: string[] = match.participant_user_ids || [];
      // Only count real multi-user matches for ELO
      if (participantIds.length < 2) continue;
      
      const validationWeight = getMatchValidationWeight(participantIds.length);
      const teamAPlayers: string[] = match.team_a?.players || [];
      const teamBPlayers: string[] = match.team_b?.players || [];

      // Calculate average ELO for each team
      const teamAElos = teamAPlayers.filter(id => eloMap.has(id)).map(id => eloMap.get(id)!);
      const teamBElos = teamBPlayers.filter(id => eloMap.has(id)).map(id => eloMap.get(id)!);

      if (teamAElos.length === 0 || teamBElos.length === 0) continue;

      const avgEloA = Math.round(teamAElos.reduce((a, b) => a + b, 0) / teamAElos.length);
      const avgEloB = Math.round(teamBElos.reduce((a, b) => a + b, 0) / teamBElos.length);

      // Update ELO for team A players
      for (const pid of teamAPlayers) {
        if (!eloMap.has(pid)) continue;
        const currentElo = eloMap.get(pid)!;
        const mc = matchCountMap.get(pid) || 0;
        const won = match.winner === 'A';
        const { newElo } = calculateElo(currentElo, avgEloB, won, mc, validationWeight);
        eloMap.set(pid, newElo);
        matchCountMap.set(pid, mc + 1);
      }

      // Update ELO for team B players
      for (const pid of teamBPlayers) {
        if (!eloMap.has(pid)) continue;
        const currentElo = eloMap.get(pid)!;
        const mc = matchCountMap.get(pid) || 0;
        const won = match.winner === 'B';
        const { newElo } = calculateElo(currentElo, avgEloA, won, mc, validationWeight);
        eloMap.set(pid, newElo);
        matchCountMap.set(pid, mc + 1);
      }
    }

    // 5. Batch update all players with new ELO
    let updatedCount = 0;
    const entries = [...eloMap.entries()];
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50);
      for (const [playerId, elo] of batch) {
        const { error: updateErr } = await supabase
          .from('players')
          .update({ elo_rating: elo })
          .eq('id', playerId);
        if (!updateErr) updatedCount++;
      }
    }

    return { success: true, error: null, playersUpdated: updatedCount };
  } catch (e: any) {
    return { success: false, error: e.message || 'ELO recalculation error', playersUpdated: 0 };
  }
}

/**
 * Update ELO ratings after a single match.
 * Called after match creation/save.
 * Includes score margin bonus and role-specific ELO.
 */
export async function updateEloAfterMatch(
  matchId: string,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
  winner: 'A' | 'B',
  participantUserIds: string[],
  scoreA?: number,
  scoreB?: number,
  playerActions?: any[]
): Promise<void> {
  if (participantUserIds.length < 2) return; // Skip solo matches

  const supabase = getSupabaseClient();
  const validationWeight = getMatchValidationWeight(participantUserIds.length);

  // Calculate score margin multiplier
  const winnerScore = winner === 'A' ? (scoreA || 13) : (scoreB || 13);
  const loserScore = winner === 'A' ? (scoreB || 0) : (scoreA || 0);
  const marginMultiplier = getScoreMarginMultiplier(winnerScore, loserScore);

  try {
    // Fetch current ELO and stats for all players in the match
    const allPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds];
    const { data: playersData } = await supabase
      .from('players')
      .select('id, user_id, name, elo_rating, elo_tireur, elo_pointeur, elo_milieu, stats')
      .in('id', allPlayerIds);

    if (!playersData || playersData.length === 0) return;

    // Filter: only update ELO for real user profiles (player.id === player.user_id)
    // Locally created players (tracking cards) have different UUIDs and should not accumulate ELO
    const isRealUserProfile = (p: any): boolean => !!(p.user_id && p.id === p.user_id);

    const playerMap = new Map(playersData.map(p => [p.id, p]));

    // Calculate team average ELOs
    const teamAElos = teamAPlayerIds.filter(id => playerMap.has(id)).map(id => playerMap.get(id)!.elo_rating || ELO_INITIAL);
    const teamBElos = teamBPlayerIds.filter(id => playerMap.has(id)).map(id => playerMap.get(id)!.elo_rating || ELO_INITIAL);

    if (teamAElos.length === 0 || teamBElos.length === 0) return;

    const avgEloA = Math.round(teamAElos.reduce((a, b) => a + b, 0) / teamAElos.length);
    const avgEloB = Math.round(teamBElos.reduce((a, b) => a + b, 0) / teamBElos.length);

    // Build player role map from match team roles first, then fallback to action distribution
    const playerRoleMap = new Map<string, string>();
    // Check playerActions for team role data (passed from match save)
    if (playerActions) {
      for (const pa of playerActions) {
        if (!pa.playerId) continue;
        // Check if role segments exist (player had explicit role assignments)
        if (pa.roleSegments && pa.roleSegments.length > 0) {
          // Use the role with most actions
          const bestSeg = pa.roleSegments.reduce((best: any, seg: any) => {
            const total = (seg.actions?.tirs || 0) + (seg.actions?.points || 0);
            const bestTotal = (best.actions?.tirs || 0) + (best.actions?.points || 0);
            return total > bestTotal ? seg : best;
          }, pa.roleSegments[0]);
          if (bestSeg?.role) {
            const r = bestSeg.role.toLowerCase();
            playerRoleMap.set(pa.playerId, r === 'tireur' ? 'tireur' : r === 'pointeur' ? 'pointeur' : 'milieu');
            continue;
          }
        }
        // Fallback: detect role from action distribution
        const tirs = pa.actions?.tirs || 0;
        const points = pa.actions?.points || 0;
        if (tirs > points * 2) playerRoleMap.set(pa.playerId, 'tireur');
        else if (points > tirs * 2) playerRoleMap.set(pa.playerId, 'pointeur');
        else playerRoleMap.set(pa.playerId, 'milieu');
      }
    }

    // Get opponent team names for history
    const teamANames = teamAPlayerIds.map(id => playerMap.get(id)?.name || '').filter(Boolean).join(', ');
    const teamBNames = teamBPlayerIds.map(id => playerMap.get(id)?.name || '').filter(Boolean).join(', ');

    const historyRows: any[] = [];
    const now = new Date().toISOString();

    // Update team A players
    for (const pid of teamAPlayerIds) {
      const p = playerMap.get(pid);
      if (!p) continue;

      // Skip ELO updates for locally created players (not real user profiles)
      if (!isRealUserProfile(p)) {
        // Still update last_match_date for tracking purposes
        await supabase.from('players').update({ last_match_date: now }).eq('id', pid);
        continue;
      }

      const currentElo = p.elo_rating || ELO_INITIAL;
      const mc = p.stats?.matchesPlayed || 0;
      const won = winner === 'A';
      const { newElo, delta } = calculateElo(currentElo, avgEloB, won, mc, validationWeight, marginMultiplier);
      
      // Role-specific ELO update
      const roleKey = playerRoleMap.get(pid);
      const roleUpdates: any = { elo_rating: newElo, last_match_date: now };
      if (roleKey === 'tireur') {
        const roleElo = p.elo_tireur || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloB, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_tireur = newRoleElo;
      } else if (roleKey === 'pointeur') {
        const roleElo = p.elo_pointeur || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloB, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_pointeur = newRoleElo;
      } else if (roleKey === 'milieu') {
        const roleElo = p.elo_milieu || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloB, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_milieu = newRoleElo;
      }

      await supabase.from('players').update(roleUpdates).eq('id', pid);

      historyRows.push({
        user_id: p.user_id,
        player_id: pid,
        elo_before: currentElo,
        elo_after: newElo,
        elo_delta: delta,
        match_id: matchId,
        opponent_elo: avgEloB,
        opponent_name: teamBNames,
        won,
      });
    }

    // Update team B players
    for (const pid of teamBPlayerIds) {
      const p = playerMap.get(pid);
      if (!p) continue;

      // Skip ELO updates for locally created players (not real user profiles)
      if (!isRealUserProfile(p)) {
        await supabase.from('players').update({ last_match_date: now }).eq('id', pid);
        continue;
      }

      const currentElo = p.elo_rating || ELO_INITIAL;
      const mc = p.stats?.matchesPlayed || 0;
      const won = winner === 'B';
      const { newElo, delta } = calculateElo(currentElo, avgEloA, won, mc, validationWeight, marginMultiplier);
      
      // Role-specific ELO update
      const roleKey = playerRoleMap.get(pid);
      const roleUpdates: any = { elo_rating: newElo, last_match_date: now };
      if (roleKey === 'tireur') {
        const roleElo = p.elo_tireur || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloA, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_tireur = newRoleElo;
      } else if (roleKey === 'pointeur') {
        const roleElo = p.elo_pointeur || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloA, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_pointeur = newRoleElo;
      } else if (roleKey === 'milieu') {
        const roleElo = p.elo_milieu || ELO_INITIAL;
        const { newElo: newRoleElo } = calculateElo(roleElo, avgEloA, won, mc, validationWeight, marginMultiplier);
        roleUpdates.elo_milieu = newRoleElo;
      }

      await supabase.from('players').update(roleUpdates).eq('id', pid);

      historyRows.push({
        user_id: p.user_id,
        player_id: pid,
        elo_before: currentElo,
        elo_after: newElo,
        elo_delta: delta,
        match_id: matchId,
        opponent_elo: avgEloA,
        opponent_name: teamANames,
        won,
      });
    }

    // Insert history records
    if (historyRows.length > 0) {
      await supabase.from('elo_history').insert(historyRows);
    }

    // Check for rank tier changes and send notifications
    for (const row of historyRows) {
      const oldRank = getEloRank(row.elo_before);
      const newRank = getEloRank(row.elo_after);
      if (oldRank.tier !== newRank.tier) {
        const p = [...playerMap.values()].find(pl => pl.user_id === row.user_id);
        const direction = row.elo_after > row.elo_before ? 'up' : 'down';
        triggerServerPush('elo_rank_changed', {
          targetUserId: row.user_id,
          playerName: p?.name || '',
          oldRank: oldRank.tier,
          newRank: newRank.tier,
          oldElo: row.elo_before,
          newElo: row.elo_after,
          direction,
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.log('[ELO] Error updating after match:', e);
  }
}

/**
 * Fetch ELO history for a player (last N entries)
 */
export async function fetchEloHistory(
  playerId: string,
  limit: number = 30
): Promise<{ history: EloHistoryEntry[]; error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('elo_history')
      .select('*')
      .eq('player_id', playerId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) return { history: [], error: error.message };

    const history: EloHistoryEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      playerId: row.player_id,
      eloBefore: row.elo_before,
      eloAfter: row.elo_after,
      eloDelta: row.elo_delta,
      matchId: row.match_id,
      opponentElo: row.opponent_elo,
      opponentName: row.opponent_name,
      won: row.won,
      recordedAt: row.recorded_at,
    }));

    return { history, error: null };
  } catch (e: any) {
    return { history: [], error: e.message || 'Failed to fetch ELO history' };
  }
}

/**
 * Get current ELO rating for a player from DB
 */
export async function fetchPlayerElo(playerId: string): Promise<number> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('players')
      .select('elo_rating')
      .eq('id', playerId)
      .single();
    return data?.elo_rating || ELO_INITIAL;
  } catch {
    return ELO_INITIAL;
  }
}

/**
 * Fetch role-specific ELO for a player
 */
export async function fetchPlayerRoleElos(playerId: string): Promise<{ tireur: number; pointeur: number; milieu: number }> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('players')
      .select('elo_tireur, elo_pointeur, elo_milieu')
      .eq('id', playerId)
      .single();
    return {
      tireur: data?.elo_tireur || ELO_INITIAL,
      pointeur: data?.elo_pointeur || ELO_INITIAL,
      milieu: data?.elo_milieu || ELO_INITIAL,
    };
  } catch {
    return { tireur: ELO_INITIAL, pointeur: ELO_INITIAL, milieu: ELO_INITIAL };
  }
}

// ============================================
// SEASONAL OPERATIONS
// ============================================

/**
 * Check if seasonal reset is needed and apply it.
 * Runs on Jan 1: archives previous season, compresses ELO.
 */
export async function checkAndApplySeasonalReset(): Promise<{ applied: boolean; playersReset: number; season: number }> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;
  const supabase = getSupabaseClient();

  try {
    // Check if we already archived the previous season
    const { data: existing } = await supabase
      .from('elo_seasons')
      .select('id')
      .eq('season_year', previousYear)
      .limit(1);

    if (existing && existing.length > 0) {
      return { applied: false, playersReset: 0, season: previousYear };
    }

    // Only apply in January (grace period)
    if (now.getMonth() > 0) {
      return { applied: false, playersReset: 0, season: previousYear };
    }

    // Fetch all players with ELO data
    const { data: playersData } = await supabase
      .from('players')
      .select('id, user_id, elo_rating, elo_tireur, elo_pointeur, elo_milieu, stats');

    if (!playersData || playersData.length === 0) {
      return { applied: false, playersReset: 0, season: previousYear };
    }

    // Find peak ELO for each player from elo_history for the previous year
    const yearStart = `${previousYear}-01-01T00:00:00Z`;
    const yearEnd = `${previousYear}-12-31T23:59:59Z`;
    const { data: historyData } = await supabase
      .from('elo_history')
      .select('player_id, elo_after')
      .gte('recorded_at', yearStart)
      .lte('recorded_at', yearEnd);

    const peakEloMap = new Map<string, number>();
    if (historyData) {
      for (const h of historyData) {
        const current = peakEloMap.get(h.player_id) || ELO_INITIAL;
        if (h.elo_after > current) peakEloMap.set(h.player_id, h.elo_after);
      }
    }

    // Archive and compress
    const seasonRows: any[] = [];
    let resetCount = 0;

    for (const p of playersData) {
      const finalElo = p.elo_rating || ELO_INITIAL;
      const peakElo = Math.max(peakEloMap.get(p.id) || finalElo, finalElo);
      const rank = getEloRank(finalElo);

      // Archive season
      if (p.user_id) {
        seasonRows.push({
          user_id: p.user_id,
          player_id: p.id,
          season_year: previousYear,
          peak_elo: peakElo,
          final_elo: finalElo,
          final_rank: rank.tier,
          matches_played: p.stats?.matchesPlayed || 0,
          wins: p.stats?.wins || 0,
          elo_tireur: p.elo_tireur || ELO_INITIAL,
          elo_pointeur: p.elo_pointeur || ELO_INITIAL,
          elo_milieu: p.elo_milieu || ELO_INITIAL,
        });
      }

      // Apply compression
      const newElo = applySeasonalCompression(finalElo);
      const newTireur = applySeasonalCompression(p.elo_tireur || ELO_INITIAL);
      const newPointeur = applySeasonalCompression(p.elo_pointeur || ELO_INITIAL);
      const newMilieu = applySeasonalCompression(p.elo_milieu || ELO_INITIAL);

      await supabase.from('players').update({
        elo_rating: newElo,
        elo_tireur: newTireur,
        elo_pointeur: newPointeur,
        elo_milieu: newMilieu,
      }).eq('id', p.id);
      resetCount++;
    }

    // Insert season archives in batches
    for (let i = 0; i < seasonRows.length; i += 50) {
      const batch = seasonRows.slice(i, i + 50);
      await supabase.from('elo_seasons').upsert(batch, { onConflict: 'player_id,season_year' });
    }

    return { applied: true, playersReset: resetCount, season: previousYear };
  } catch (e: any) {
    console.log('[ELO] Seasonal reset error:', e);
    return { applied: false, playersReset: 0, season: previousYear };
  }
}

/**
 * Fetch ELO season history for a player.
 */
export async function fetchEloSeasons(playerId: string): Promise<{ seasons: EloSeasonEntry[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('elo_seasons')
      .select('*')
      .eq('player_id', playerId)
      .order('season_year', { ascending: false });

    if (error) return { seasons: [], error: error.message };

    const seasons: EloSeasonEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      playerId: row.player_id,
      seasonYear: row.season_year,
      peakElo: row.peak_elo,
      finalElo: row.final_elo,
      finalRank: row.final_rank,
      matchesPlayed: row.matches_played,
      wins: row.wins,
      eloTireur: row.elo_tireur,
      eloPointeur: row.elo_pointeur,
      eloMilieu: row.elo_milieu,
      createdAt: row.created_at,
    }));

    return { seasons, error: null };
  } catch (e: any) {
    return { seasons: [], error: e.message || 'Failed to fetch ELO seasons' };
  }
}

/**
 * Apply inactivity decay to all players who haven't played in 30+ days.
 * Should be called periodically (e.g., weekly cron or on leaderboard load).
 */
export async function applyInactivityDecay(): Promise<{ playersDecayed: number }> {
  const supabase = getSupabaseClient();
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ELO_INACTIVITY_THRESHOLD_DAYS);

    const { data: inactivePlayers } = await supabase
      .from('players')
      .select('id, elo_rating, last_match_date')
      .lt('last_match_date', cutoff.toISOString())
      .gt('elo_rating', ELO_INACTIVITY_FLOOR);

    if (!inactivePlayers || inactivePlayers.length === 0) return { playersDecayed: 0 };

    let decayed = 0;
    for (const p of inactivePlayers) {
      const { decayedElo, decayAmount } = calculateInactivityDecay(p.elo_rating, p.last_match_date);
      if (decayAmount > 0) {
        await supabase.from('players').update({ elo_rating: decayedElo }).eq('id', p.id);
        decayed++;
      }
    }

    return { playersDecayed: decayed };
  } catch (e) {
    console.log('[ELO] Inactivity decay error:', e);
    return { playersDecayed: 0 };
  }
}
