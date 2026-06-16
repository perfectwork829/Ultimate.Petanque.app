// ============================================
// Trust Score Service
// Computes and fetches anti-cheat trust scores (0-100)
// ============================================
import { getSupabaseClient } from '@/template';

export interface TrustScoreData {
  score: number;
  level: 'verified' | 'high' | 'medium' | 'low' | 'suspicious';
  flags: string[];
  details?: Record<string, any>;
  analyzedAt?: string;
}

// Thresholds
const TRUST_VERIFIED = 80;
const TRUST_HIGH = 65;
const TRUST_MEDIUM = 45;
const TRUST_LOW = 25;

/**
 * Compute a quick trust score from locally available stats.
 * Used as fallback when no DB score exists.
 */
export function computeQuickTrustScore(player: {
  stats: {
    matchesPlayed: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
  createdAt?: string;
}): TrustScoreData {
  const flags: string[] = [];
  let score = 75; // Start at 75 for quick estimate (no full analysis)

  const { matchesPlayed, winRate, tirRate, pointRate, carreauRate } = player.stats;

  // Stats regularity
  if (winRate > 95 && matchesPlayed >= 10) {
    score -= 15;
    flags.push('extreme_win_rate');
  } else if (winRate > 90 && matchesPlayed >= 10) {
    score -= 8;
  }

  if (tirRate > 85 && pointRate > 85) {
    score -= 10;
    flags.push('unrealistic_combined_rates');
  }

  if (carreauRate > 50 && matchesPlayed >= 10) {
    score -= 10;
    flags.push('extreme_carreau_rate');
  }

  // Match volume bonus
  if (matchesPlayed >= 50) {
    score += 10;
  } else if (matchesPlayed >= 30) {
    score += 5;
  } else if (matchesPlayed < 10) {
    score -= 10;
    flags.push('low_match_count');
  }

  // Account age
  if (player.createdAt) {
    const ageMs = Date.now() - new Date(player.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) {
      score -= 10;
      flags.push('very_new_account');
    } else if (ageDays < 30) {
      score -= 5;
      flags.push('new_account');
    } else if (ageDays >= 180) {
      score += 5; // Longevity bonus
    }
  }

  score = Math.max(0, Math.min(100, score));

  const level: TrustScoreData['level'] = getLevel(score);

  return { score, level, flags };
}

function getLevel(score: number): TrustScoreData['level'] {
  if (score >= TRUST_VERIFIED) return 'verified';
  if (score >= TRUST_HIGH) return 'high';
  if (score >= TRUST_MEDIUM) return 'medium';
  if (score >= TRUST_LOW) return 'low';
  return 'suspicious';
}

/**
 * Get trust score color for display (accepts level string or numeric score)
 */
export function getTrustScoreColor(levelOrScore: TrustScoreData['level'] | number): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return '#22C55E';
    case 'high': return '#3B82F6';
    case 'medium': return '#D97706';
    case 'low': return '#F97316';
    case 'suspicious': return '#EF4444';
  }
}

/**
 * Get trust score icon (accepts level string or numeric score)
 */
export function getTrustScoreIcon(levelOrScore: TrustScoreData['level'] | number): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return 'verified-user';
    case 'high': return 'shield';
    case 'medium': return 'shield';
    case 'low': return 'warning';
    case 'suspicious': return 'gpp-bad';
  }
}

/**
 * Get trust level label (accepts level string or numeric score)
 */
export function getTrustLevelLabel(levelOrScore: TrustScoreData['level'] | number, fr: boolean): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return fr ? 'Verifie' : 'Verified';
    case 'high': return fr ? 'Fiable' : 'Trusted';
    case 'medium': return fr ? 'Standard' : 'Standard';
    case 'low': return fr ? 'A surveiller' : 'Watch';
    case 'suspicious': return fr ? 'Suspect' : 'Suspicious';
  }
}

/**
 * Get level from numeric score (public version)
 */
export function getLevelFromScore(score: number): TrustScoreData['level'] {
  return getLevel(score);
}

/**
 * Get trust badge description for tips
 */
export function getTrustBadgeDescription(level: TrustScoreData['level'], fr: boolean): string {
  switch (level) {
    case 'verified':
      return fr
        ? 'Profil verifie avec un bon historique de matchs multi-joueurs et des stats coherentes.'
        : 'Verified profile with good multi-player match history and consistent stats.';
    case 'high':
      return fr
        ? 'Bon niveau de confiance. Continuez a jouer avec d\'autres utilisateurs pour augmenter votre score.'
        : 'Good trust level. Keep playing with other users to increase your score.';
    case 'medium':
      return fr
        ? 'Niveau standard. Jouez plus de matchs avec d\'autres utilisateurs de l\'app pour ameliorer votre fiabilite.'
        : 'Standard level. Play more matches with other app users to improve your reliability.';
    case 'low':
      return fr
        ? 'Fiabilite faible. Augmentez vos matchs multi-joueurs et diversifiez vos adversaires.'
        : 'Low reliability. Increase multi-player matches and diversify your opponents.';
    case 'suspicious':
      return fr
        ? 'Profil signale pour des statistiques inhabituelles. Contactez-nous si vous pensez que c\'est une erreur.'
        : 'Profile flagged for unusual statistics. Contact us if you think this is an error.';
  }
}

/**
 * Fetch stored trust score from DB for a single player
 */
export async function fetchTrustScore(playerId: string): Promise<TrustScoreData | null> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('suspicious_players')
      .select('trust_score, flags, details, analyzed_at')
      .eq('player_id', playerId)
      .single();

    if (error || !data) return null;

    const score = data.trust_score;
    return {
      score,
      level: getLevel(score),
      flags: Array.isArray(data.flags) ? data.flags : [],
      details: data.details || {},
      analyzedAt: data.analyzed_at,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch stored trust scores from DB (batch)
 */
export async function fetchTrustScores(playerIds: string[]): Promise<Map<string, TrustScoreData>> {
  const result = new Map<string, TrustScoreData>();
  if (playerIds.length === 0) return result;

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('suspicious_players')
      .select('player_id, trust_score, flags, details, analyzed_at')
      .in('player_id', playerIds);

    if (!error && data) {
      for (const row of data) {
        const score = row.trust_score;
        result.set(row.player_id, {
          score,
          level: getLevel(score),
          flags: Array.isArray(row.flags) ? row.flags : [],
          details: row.details || {},
          analyzedAt: row.analyzed_at,
        });
      }
    }
  } catch { /* silent */ }

  return result;
}

/**
 * Trigger trust score computation for the current user via Edge Function.
 * Called after match/challenge saves.
 */
export async function triggerTrustScoreComputation(): Promise<void> {
  const supabase = getSupabaseClient();
  try {
    await supabase.functions.invoke('detect-suspicious', {
      body: { mode: 'self' },
    });
  } catch (e) {
    console.log('[trustScore] Trigger computation error:', e);
  }
}

/**
 * Fetch all suspicious players for admin view
 */
export async function fetchSuspiciousPlayers(): Promise<{
  players: Array<{
    id: string;
    playerId: string;
    userId: string;
    trustScore: number;
    flags: string[];
    details: any;
    status: string;
    adminNotes?: string;
    analyzedAt: string;
    playerName?: string;
    playerAvatar?: string;
  }>;
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('suspicious_players')
      .select('*')
      .order('trust_score', { ascending: true });

    if (error) return { players: [], error: error.message };

    const enriched = [];
    for (const row of data || []) {
      let playerName: string | undefined;
      let playerAvatar: string | undefined;
      try {
        const { data: p } = await supabase
          .from('players')
          .select('name, avatar')
          .eq('id', row.player_id)
          .single();
        playerName = p?.name;
        playerAvatar = p?.avatar || undefined;
      } catch { /* silent */ }

      enriched.push({
        id: row.id,
        playerId: row.player_id,
        userId: row.user_id,
        trustScore: row.trust_score,
        flags: Array.isArray(row.flags) ? row.flags : [],
        details: row.details || {},
        status: row.status,
        adminNotes: row.admin_notes || undefined,
        analyzedAt: row.analyzed_at,
        playerName,
        playerAvatar,
      });
    }

    return { players: enriched, error: null };
  } catch (e: any) {
    return { players: [], error: e.message };
  }
}

/**
 * Update suspicious player status (admin action)
 */
export async function updateSuspiciousStatus(
  id: string,
  status: string,
  adminNotes?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

    const { error } = await supabase
      .from('suspicious_players')
      .update(updateData)
      .eq('id', id);

    return { error: error?.message || null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Update trust score directly (admin action)
 */
export async function updateTrustScore(
  id: string,
  trustScore: number
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase
      .from('suspicious_players')
      .update({ trust_score: trustScore, updated_at: new Date().toISOString() })
      .eq('id', id);
    return { error: error?.message || null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============================================
// MATCH VALIDATION WEIGHT
// ============================================

export type MatchValidationLevel = 'solo' | 'shared_2' | 'shared_3plus' | 'witnessed';

/**
 * Get the validation weight multiplier for a match based on participant count.
 * - solo (0-1 participant_user_ids): 0.3x
 * - shared_2 (2 participants): 1.0x
 * - shared_3plus (3-4 participants): 1.5x
 * - witnessed (sponsored event with witnesses): 2.0x
 */
export function getMatchValidationWeight(participantCount: number, isWitnessedEvent?: boolean): number {
  if (isWitnessedEvent) return 2.0;
  if (participantCount >= 3) return 1.5;
  if (participantCount >= 2) return 1.0;
  return 0.3;
}

/**
 * Get the validation level label and color for display
 */
export function getMatchValidationLevel(participantCount: number, isWitnessedEvent?: boolean): MatchValidationLevel {
  if (isWitnessedEvent) return 'witnessed';
  if (participantCount >= 3) return 'shared_3plus';
  if (participantCount >= 2) return 'shared_2';
  return 'solo';
}

export function getValidationColor(level: MatchValidationLevel): string {
  switch (level) {
    case 'witnessed': return '#7C3AED';
    case 'shared_3plus': return '#22C55E';
    case 'shared_2': return '#3B82F6';
    case 'solo': return '#9CA3AF';
  }
}

export function getValidationIcon(level: MatchValidationLevel): string {
  switch (level) {
    case 'witnessed': return 'visibility';
    case 'shared_3plus': return 'groups';
    case 'shared_2': return 'people';
    case 'solo': return 'person';
  }
}

export function getValidationLabel(level: MatchValidationLevel, fr: boolean): string {
  switch (level) {
    case 'witnessed': return fr ? 'Atteste (2.0x)' : 'Witnessed (2.0x)';
    case 'shared_3plus': return fr ? '3+ joueurs (1.5x)' : '3+ players (1.5x)';
    case 'shared_2': return fr ? '2 joueurs (1.0x)' : '2 players (1.0x)';
    case 'solo': return fr ? 'Solo (0.3x)' : 'Solo (0.3x)';
  }
}

export function getValidationWeightFromLevel(level: MatchValidationLevel): number {
  switch (level) {
    case 'witnessed': return 2.0;
    case 'shared_3plus': return 1.5;
    case 'shared_2': return 1.0;
    case 'solo': return 0.3;
  }
}

// ============================================
// DELETION ALERTS (Admin)
// ============================================

export interface DeletionAlert {
  userId: string;
  playerId: string;
  playerName?: string;
  playerAvatar?: string;
  totalDeletedMatches: number;
  deletedLostMatches: number;
  avoidedEloLoss: number;
  recentDeletedLost7d: number;
  trustScore: number;
  flags: string[];
  analyzedAt: string;
}

/**
 * Fetch players with suspicious match deletion patterns for admin dashboard.
 * Returns players who deleted 3+ lost matches in last 7 days, or 5+ total.
 */
export async function fetchDeletionAlerts(): Promise<{
  alerts: DeletionAlert[];
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('suspicious_players')
      .select('*')
      .order('trust_score', { ascending: true });

    if (error) return { alerts: [], error: error.message };

    const alerts: DeletionAlert[] = [];
    for (const row of data || []) {
      const details = row.details || {};
      const delAnalysis = details.deletionAnalysis;
      if (!delAnalysis) continue;

      const { totalDeletedMatches, deletedLostMatches, avoidedEloLoss, recentDeletedLost7d } = delAnalysis;
      // Alert threshold: 3+ recent deletions of lost matches OR 5+ total
      if (recentDeletedLost7d >= 3 || deletedLostMatches >= 5) {
        let playerName: string | undefined;
        let playerAvatar: string | undefined;
        try {
          const { data: p } = await supabase
            .from('players')
            .select('name, avatar')
            .eq('id', row.player_id)
            .single();
          playerName = p?.name;
          playerAvatar = p?.avatar || undefined;
        } catch { /* silent */ }

        alerts.push({
          userId: row.user_id,
          playerId: row.player_id,
          playerName,
          playerAvatar,
          totalDeletedMatches,
          deletedLostMatches,
          avoidedEloLoss,
          recentDeletedLost7d,
          trustScore: row.trust_score,
          flags: Array.isArray(row.flags) ? row.flags : [],
          analyzedAt: row.analyzed_at,
        });
      }
    }

    // Sort by recentDeletedLost7d desc, then by avoidedEloLoss desc
    alerts.sort((a, b) => {
      if (b.recentDeletedLost7d !== a.recentDeletedLost7d) return b.recentDeletedLost7d - a.recentDeletedLost7d;
      return b.avoidedEloLoss - a.avoidedEloLoss;
    });

    return { alerts, error: null };
  } catch (e: any) {
    return { alerts: [], error: e.message };
  }
}

// ============================================
// BAN ENFORCEMENT
// ============================================

/**
 * Ban a player: set trust score to 0, status to 'banned'.
 * Called from admin-anticheat when banning.
 */
export async function banPlayer(
  suspiciousId: string,
  playerId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase
      .from('suspicious_players')
      .update({
        trust_score: 0,
        status: 'banned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', suspiciousId);
    return { error: error?.message || null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check if a player is banned (trust_score === 0 and status === 'banned')
 */
export async function isPlayerBanned(playerId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('suspicious_players')
      .select('trust_score, status')
      .eq('player_id', playerId)
      .single();
    return data?.status === 'banned';
  } catch {
    return false;
  }
}

// ============================================
// TRUST SCORE HISTORY
// ============================================

export interface TrustScoreHistoryPoint {
  weekStart: string;
  score: number;
  level: string;
  recordedAt: string;
}

/**
 * Save current trust score as a weekly snapshot for history tracking.
 * Uses upsert to avoid duplicates per player per week.
 */
export async function saveTrustScoreSnapshot(
  userId: string,
  playerId: string,
  score: number,
  level: string,
  flags: string[]
): Promise<void> {
  const supabase = getSupabaseClient();
  // Compute current week start (Monday)
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  try {
    await supabase
      .from('trust_score_history')
      .upsert({
        user_id: userId,
        player_id: playerId,
        trust_score: score,
        level,
        flags,
        week_start: weekStart,
        recorded_at: new Date().toISOString(),
      }, { onConflict: 'player_id,week_start' });
  } catch (e) {
    console.log('[trustScore] Error saving history snapshot:', e);
  }
}

/**
 * Fetch trust score history for a player (up to 52 weeks / 1 year)
 */
export async function fetchTrustScoreHistory(playerId: string): Promise<TrustScoreHistoryPoint[]> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('trust_score_history')
      .select('week_start, trust_score, level, recorded_at')
      .eq('player_id', playerId)
      .order('week_start', { ascending: true })
      .limit(52);

    if (error || !data) return [];
    return data.map((d: any) => ({
      weekStart: d.week_start,
      score: d.trust_score,
      level: d.level,
      recordedAt: d.recorded_at,
    }));
  } catch {
    return [];
  }
}

// ============================================
// WEEKLY TRUST TIP CHECK
// ============================================

/**
 * Check if weekly trust tip was already sent this week.
 * Uses last_trust_tip_sent in user_preferences.
 */
export async function shouldSendWeeklyTrustTip(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    const { data } = await supabase
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .single();

    const prefs = data?.notification_preferences || {};
    const lastSent = prefs.last_trust_tip_sent;
    if (!lastSent) return true;

    // Check if last sent was this week
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    return new Date(lastSent) < monday;
  } catch {
    return true;
  }
}

/**
 * Mark weekly trust tip as sent for this week.
 */
export async function markWeeklyTrustTipSent(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // Fetch current prefs
    const { data } = await supabase
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .single();

    const prefs = data?.notification_preferences || {};
    prefs.last_trust_tip_sent = new Date().toISOString();

    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        notification_preferences: prefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  } catch (e) {
    console.log('[trustScore] Error marking tip sent:', e);
  }
}

/**
 * Fetch all users with trust score below threshold for weekly tip push.
 * Admin/service use only.
 */
export async function fetchLowTrustUsers(threshold: number = 50): Promise<Array<{ userId: string; score: number }>> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('suspicious_players')
      .select('user_id, trust_score')
      .lt('trust_score', threshold)
      .neq('status', 'banned');

    return (data || []).map((d: any) => ({ userId: d.user_id, score: d.trust_score }));
  } catch {
    return [];
  }
}

// ============================================
// WITNESS ATTESTATION
// ============================================

/**
 * Request witness attestation for a match.
 * Sends push notification to the witness user.
 */
export async function requestWitnessAttestation(
  matchId: string,
  witnessUserId: string,
  matchSummary?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  try {
    const { error } = await supabase
      .from('match_witness_requests')
      .insert({
        match_id: matchId,
        requester_user_id: user.id,
        witness_user_id: witnessUserId,
        status: 'pending',
      });
    if (error) return { error: error.message };

    // Send push notification to the witness
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      await supabase.functions.invoke('send-push', {
        body: {
          type: 'witness_request',
          payload: {
            witnessUserId,
            requesterName: profile?.username || user.email?.split('@')[0] || 'Un joueur',
            matchId,
            matchSummary,
          },
        },
      });
    } catch { /* push failure is non-blocking */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Respond to a witness attestation request.
 * When attested, sends push to requester.
 */
export async function respondToWitnessRequest(
  requestId: string,
  responseStatus: 'attested' | 'declined'
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Fetch the request details first
    const { data: reqData } = await supabase
      .from('match_witness_requests')
      .select('match_id, requester_user_id, witness_user_id')
      .eq('id', requestId)
      .single();

    const updateData: any = { status: responseStatus, responded_at: new Date().toISOString() };
    const { error } = await supabase
      .from('match_witness_requests')
      .update(updateData)
      .eq('id', requestId);
    if (error) return { error: error.message };

    // If attested, notify the requester
    if (responseStatus === 'attested' && reqData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: witnessProfile } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', reqData.witness_user_id)
          .single();
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'witness_attested',
            payload: {
              requesterUserId: reqData.requester_user_id,
              witnessName: witnessProfile?.username || 'Un temoin',
              matchId: reqData.match_id,
            },
          },
        });
      } catch { /* push failure is non-blocking */ }
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Fetch witness requests for a match.
 */
export async function fetchMatchWitnessRequests(matchId: string): Promise<Array<{
  id: string;
  matchId: string;
  requesterUserId: string;
  witnessUserId: string;
  status: string;
  respondedAt?: string;
}>> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('match_witness_requests')
      .select('*')
      .eq('match_id', matchId);
    if (error || !data) return [];
    return data.map((d: any) => ({
      id: d.id,
      matchId: d.match_id,
      requesterUserId: d.requester_user_id,
      witnessUserId: d.witness_user_id,
      status: d.status,
      respondedAt: d.responded_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a match has been witnessed (attested).
 */
export async function isMatchWitnessed(matchId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('match_id', matchId)
      .eq('status', 'attested')
      .limit(1);
    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

// ============================================
// ELO REVERSAL (Admin action)
// ============================================

export interface DeletionTimelinePoint {
  weekStart: string;
  deletedLostCount: number;
  avoidedEloLoss: number;
  totalDeleted: number;
}

/**
 * Reverse ELO loss avoided by deleting lost matches.
 * Re-applies the avoided losses to the player's current ELO.
 */
export async function reverseDeletedEloLoss(
  userId: string,
  playerId: string
): Promise<{ error: string | null; eloBefore: number; eloAfter: number; matchesReversed: number }> {
  const supabase = getSupabaseClient();
  try {
    // 1. Get soft-deleted match IDs
    const { data: softDeletes } = await supabase
      .from('soft_deletes')
      .select('item_id')
      .eq('user_id', userId)
      .eq('table_name', 'matches');

    const deletedMatchIds = (softDeletes || []).map((sd: any) => sd.item_id);
    if (deletedMatchIds.length === 0) {
      return { error: null, eloBefore: 0, eloAfter: 0, matchesReversed: 0 };
    }

    // 2. Get ELO history entries for deleted lost matches
    const { data: eloEntries } = await supabase
      .from('elo_history')
      .select('id, match_id, elo_delta, won')
      .eq('user_id', userId)
      .eq('won', false)
      .in('match_id', deletedMatchIds);

    if (!eloEntries || eloEntries.length === 0) {
      return { error: null, eloBefore: 0, eloAfter: 0, matchesReversed: 0 };
    }

    // 3. Get current player ELO
    const { data: player } = await supabase
      .from('players')
      .select('elo_rating')
      .eq('id', playerId)
      .single();

    const currentElo = player?.elo_rating || 1000;

    // 4. Calculate total avoided loss
    const totalAvoidedLoss = eloEntries.reduce((sum: number, e: any) => sum + Math.abs(e.elo_delta || 0), 0);

    // 5. Apply penalty: subtract avoided loss from current ELO
    const newElo = Math.max(0, currentElo - totalAvoidedLoss);

    // 6. Update player ELO
    const { error: updateError } = await supabase
      .from('players')
      .update({ elo_rating: newElo, updated_at: new Date().toISOString() })
      .eq('id', playerId);

    if (updateError) return { error: updateError.message, eloBefore: currentElo, eloAfter: currentElo, matchesReversed: 0 };

    // 7. Log the reversal in elo_history
    await supabase
      .from('elo_history')
      .insert({
        user_id: userId,
        player_id: playerId,
        elo_before: currentElo,
        elo_after: newElo,
        elo_delta: -(totalAvoidedLoss),
        won: false,
        opponent_name: 'ADMIN_ELO_REVERSAL',
        recorded_at: new Date().toISOString(),
      });

    return { error: null, eloBefore: currentElo, eloAfter: newElo, matchesReversed: eloEntries.length };
  } catch (e: any) {
    return { error: e.message, eloBefore: 0, eloAfter: 0, matchesReversed: 0 };
  }
}

/**
 * Fetch deletion timeline for a player (weekly aggregation of deleted lost matches).
 */
export async function fetchDeletionTimeline(userId: string): Promise<{
  timeline: DeletionTimelinePoint[];
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  try {
    // 1. Fetch all soft-deleted matches
    const { data: softDeletes } = await supabase
      .from('soft_deletes')
      .select('item_id, deleted_at')
      .eq('user_id', userId)
      .eq('table_name', 'matches')
      .order('deleted_at', { ascending: true });

    if (!softDeletes || softDeletes.length === 0) {
      return { timeline: [], error: null };
    }

    const deletedMatchIds = softDeletes.map((sd: any) => sd.item_id);

    // 2. Fetch ELO history for these deleted matches
    const { data: eloEntries } = await supabase
      .from('elo_history')
      .select('match_id, elo_delta, won')
      .eq('user_id', userId)
      .in('match_id', deletedMatchIds);

    const eloMap = new Map<string, { delta: number; won: boolean }>();
    for (const e of eloEntries || []) {
      if (e.match_id) eloMap.set(e.match_id, { delta: e.elo_delta || 0, won: e.won });
    }

    // 3. Group by week
    const weekMap = new Map<string, { deletedLostCount: number; avoidedEloLoss: number; totalDeleted: number }>();

    for (const sd of softDeletes) {
      const deletedDate = new Date(sd.deleted_at);
      const day = deletedDate.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(deletedDate.getFullYear(), deletedDate.getMonth(), deletedDate.getDate() + diff);
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

      if (!weekMap.has(weekKey)) weekMap.set(weekKey, { deletedLostCount: 0, avoidedEloLoss: 0, totalDeleted: 0 });
      const week = weekMap.get(weekKey)!;
      week.totalDeleted++;

      const eloEntry = eloMap.get(sd.item_id);
      if (eloEntry && !eloEntry.won) {
        week.deletedLostCount++;
        week.avoidedEloLoss += Math.abs(eloEntry.delta);
      }
    }

    const timeline: DeletionTimelinePoint[] = Array.from(weekMap.entries())
      .map(([weekStart, data]) => ({ weekStart, ...data }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    return { timeline, error: null };
  } catch (e: any) {
    return { timeline: [], error: e.message };
  }
}
