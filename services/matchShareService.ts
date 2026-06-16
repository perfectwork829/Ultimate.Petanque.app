/**
 * Match/Challenge Share Service
 * Handles cross-player sharing: detecting linked accounts, creating share requests,
 * accepting/declining, and fetching shared items.
 */
import { getSupabaseClient } from '@/template';
import { sendShareRequestNotification } from '@/services/notificationService';
import { triggerServerPush } from '@/services/pushTokenService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateEloAfterMatch, getScoreMarginMultiplier } from '@/services/eloService';
import { getMatchValidationWeight } from '@/services/trustScoreService';
import { sendStatsSyncedNotification } from '@/services/notificationService';

const LAST_SEEN_SHARE_REQUESTS_KEY = '@lastSeenShareRequestIds';

export interface MatchShareRequest {
  id: string;
  itemType: 'match' | 'challenge';
  itemId: string;
  senderUserId: string;
  recipientUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  permission: 'read' | 'write';
  senderName?: string;
  itemSummary?: string;
  createdAt: string;
  updatedAt: string;
}

interface PlayerWithUser {
  playerId: string;
  playerName: string;
  userId: string;
  email: string;
}

// ============================================
// Auto-detect players linked to user accounts
// ============================================

/**
 * Given a list of player IDs, find which ones are linked to a user account
 * (i.e., have a matching user_id in the players table that corresponds to an actual user_profiles entry).
 */
export async function detectLinkedPlayers(
  playerIds: string[],
  excludeUserId?: string
): Promise<{ linkedPlayers: PlayerWithUser[]; error: string | null }> {
  if (!playerIds || playerIds.length === 0) return { linkedPlayers: [], error: null };

  const supabase = getSupabaseClient();
  try {
    // Fetch players that have a user_id set (meaning they are linked to a user account)
    const { data, error } = await supabase
      .from('players')
      .select('id, name, user_id, email')
      .in('id', playerIds)
      .not('user_id', 'is', null);

    if (error) return { linkedPlayers: [], error: error.message };

    const linked: PlayerWithUser[] = (data || [])
      .filter((p: any) => p.user_id && (!excludeUserId || p.user_id !== excludeUserId))
      .map((p: any) => ({
        playerId: p.id,
        playerName: p.name,
        userId: p.user_id,
        email: p.email || '',
      }));

    return { linkedPlayers: linked, error: null };
  } catch (e: any) {
    return { linkedPlayers: [], error: e.message };
  }
}

// ============================================
// Share Request CRUD
// ============================================

/**
 * Create share requests for multiple recipients at once.
 * Also updates the match/challenge participant_user_ids array.
 */
export async function createShareRequests(params: {
  itemType: 'match' | 'challenge';
  itemId: string;
  senderUserId: string;
  senderName: string;
  recipients: { userId: string; permission: 'read' | 'write' }[];
  itemSummary?: string;
}): Promise<{ requests: MatchShareRequest[]; error: string | null }> {
  const { itemType, itemId, senderUserId, senderName, recipients, itemSummary } = params;
  if (recipients.length === 0) return { requests: [], error: null };

  const supabase = getSupabaseClient();
  try {
    // Insert share requests
    const rows = recipients.map(r => ({
      item_type: itemType,
      item_id: itemId,
      sender_user_id: senderUserId,
      recipient_user_id: r.userId,
      permission: r.permission,
      status: 'pending',
      sender_name: senderName,
      item_summary: itemSummary || null,
    }));

    const { data, error } = await supabase
      .from('match_share_requests')
      .upsert(rows, { onConflict: 'item_type,item_id,recipient_user_id' })
      .select();

    if (error) return { requests: [], error: error.message };

    // Update participant_user_ids on the match/challenge
    const allParticipantIds = [senderUserId, ...recipients.map(r => r.userId)];
    const tableName = itemType === 'match' ? 'matches' : 'challenges';
    await supabase
      .from(tableName)
      .update({ participant_user_ids: allParticipantIds })
      .eq('id', itemId);

    const requests: MatchShareRequest[] = (data || []).map(mapRow);

    // Trigger server-side push for each recipient (fire-and-forget)
    for (const r of recipients) {
      triggerServerPush('share_request', {
        recipientUserId: r.userId,
        senderName,
        itemType,
        permission: r.permission,
        itemSummary,
      }).catch(() => {});
    }

    return { requests, error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Get share requests sent by the current user.
 */
export async function getSentShareRequests(
  status?: 'pending' | 'accepted' | 'declined'
): Promise<{ requests: MatchShareRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    let query = supabase
      .from('match_share_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // The RLS policy sender_select_share_requests handles filtering by sender_user_id
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return { requests: [], error: error.message };
    return { requests: (data || []).map(mapRow), error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Get share requests received by the current user.
 */
export async function getReceivedShareRequests(
  status?: 'pending' | 'accepted' | 'declined'
): Promise<{ requests: MatchShareRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    let query = supabase
      .from('match_share_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return { requests: [], error: error.message };

    // Filter to only received requests (RLS returns both sent and received)
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id;
    const received = (data || []).filter((r: any) => r.recipient_user_id === uid);

    return { requests: received.map(mapRow), error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Get pending share request count for the current user.
 */
export async function getPendingShareRequestCount(): Promise<number> {
  const { requests } = await getReceivedShareRequests('pending');
  return requests.length;
}

/**
 * Accept a share request.
 * When a match share is accepted, the recipient's player stats and ELO are
 * recalculated to include this match (if they were a participant).
 */
export async function acceptShareRequest(
  requestId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Fetch the request details before updating
    const { data: reqData, error: fetchErr } = await supabase
      .from('match_share_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !reqData) return { error: fetchErr?.message || 'Request not found' };

    const { error } = await supabase
      .from('match_share_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) return { error: error.message };

    // After accepting, sync stats for match shares (fire-and-forget)
    if (reqData.item_type === 'match') {
      syncStatsForAcceptedMatch(reqData.item_id, reqData.recipient_user_id).catch((e) => {
        console.log('[MatchShare] Stats sync error (non-blocking):', e);
      });
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Sync the recipient's player stats after accepting a shared match.
 * - Checks if the recipient is a participant in the match
 * - Updates their player stats (wins, losses, matchesPlayed, winRate, etc.)
 * - Recalculates ELO for the recipient based on this match
 */
async function syncStatsForAcceptedMatch(
  matchId: string,
  recipientUserId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Fetch the match data
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchErr || !match) {
    console.log('[MatchShare] Could not fetch match for stats sync:', matchErr?.message);
    return;
  }

  const teamA = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
  const teamB = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
  const teamAPlayers: string[] = teamA?.players || [];
  const teamBPlayers: string[] = teamB?.players || [];
  const winner: 'A' | 'B' = match.winner;

  // 2. Find the recipient's player record (player.id === player.user_id for real profiles)
  const { data: recipientPlayer } = await supabase
    .from('players')
    .select('id, user_id, stats, elo_rating')
    .eq('id', recipientUserId)
    .single();

  if (!recipientPlayer || recipientPlayer.user_id !== recipientUserId) {
    console.log('[MatchShare] Recipient has no real player profile, skipping sync');
    return;
  }

  // 3. Check if recipient is actually in this match
  const inTeamA = teamAPlayers.includes(recipientUserId);
  const inTeamB = teamBPlayers.includes(recipientUserId);
  if (!inTeamA && !inTeamB) {
    console.log('[MatchShare] Recipient is not a participant in this match, skipping sync');
    return;
  }

  // 4. Check if this match was already counted in recipient's stats
  // by looking for existing elo_history entry
  const { data: existingElo } = await supabase
    .from('elo_history')
    .select('id')
    .eq('player_id', recipientUserId)
    .eq('match_id', matchId)
    .limit(1);

  if (existingElo && existingElo.length > 0) {
    console.log('[MatchShare] Match already counted in recipient ELO history, skipping');
    return;
  }

  // 5. Update player stats
  const won = (inTeamA && winner === 'A') || (inTeamB && winner === 'B');
  const currentStats = recipientPlayer.stats || {
    matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
    tirRate: 0, pointRate: 0, carreauRate: 0,
    avgPointsScored: 0, avgPointsConceded: 0,
  };

  const newMatchesPlayed = (currentStats.matchesPlayed || 0) + 1;
  const newWins = (currentStats.wins || 0) + (won ? 1 : 0);
  const newLosses = (currentStats.losses || 0) + (won ? 0 : 1);
  const newWinRate = newMatchesPlayed > 0 ? Math.round((newWins / newMatchesPlayed) * 100) : 0;

  const myScore = inTeamA ? (teamA?.score || 0) : (teamB?.score || 0);
  const oppScore = inTeamA ? (teamB?.score || 0) : (teamA?.score || 0);
  const prevTotalScored = (currentStats.avgPointsScored || 0) * (currentStats.matchesPlayed || 0);
  const prevTotalConceded = (currentStats.avgPointsConceded || 0) * (currentStats.matchesPlayed || 0);
  const newAvgScored = newMatchesPlayed > 0 ? Math.round(((prevTotalScored + myScore) / newMatchesPlayed) * 10) / 10 : 0;
  const newAvgConceded = newMatchesPlayed > 0 ? Math.round(((prevTotalConceded + oppScore) / newMatchesPlayed) * 10) / 10 : 0;

  // Merge player actions if available
  let newTirRate = currentStats.tirRate || 0;
  let newPointRate = currentStats.pointRate || 0;
  let newCarreauRate = currentStats.carreauRate || 0;

  const playerActions = match.player_actions;
  if (playerActions && Array.isArray(playerActions)) {
    const myAction = playerActions.find((pa: any) => pa.playerId === recipientUserId);
    if (myAction?.actions) {
      const a = myAction.actions;
      // Weighted average with existing stats
      const prevMatches = currentStats.matchesPlayed || 0;
      if (a.tirs > 0) {
        const matchTirRate = Math.round((a.tirsSuccess / a.tirs) * 100);
        newTirRate = prevMatches > 0
          ? Math.round((newTirRate * prevMatches + matchTirRate) / newMatchesPlayed)
          : matchTirRate;
      }
      if (a.points > 0) {
        const matchPointRate = Math.round((a.pointsSuccess / a.points) * 100);
        newPointRate = prevMatches > 0
          ? Math.round((newPointRate * prevMatches + matchPointRate) / newMatchesPlayed)
          : matchPointRate;
      }
      if (a.tirs > 0 && a.carreaux > 0) {
        const matchCarreauRate = Math.round((a.carreaux / a.tirs) * 100);
        newCarreauRate = prevMatches > 0
          ? Math.round((newCarreauRate * prevMatches + matchCarreauRate) / newMatchesPlayed)
          : matchCarreauRate;
      }
    }
  }

  const updatedStats = {
    ...currentStats,
    matchesPlayed: newMatchesPlayed,
    wins: newWins,
    losses: newLosses,
    winRate: newWinRate,
    tirRate: newTirRate,
    pointRate: newPointRate,
    carreauRate: newCarreauRate,
    avgPointsScored: newAvgScored,
    avgPointsConceded: newAvgConceded,
  };

  await supabase
    .from('players')
    .update({ stats: updatedStats, last_match_date: match.date })
    .eq('id', recipientUserId);

  // 6. Update ELO via the standard service
  const participantUserIds: string[] = match.participant_user_ids || [];
  // Ensure at least 2 participants for ELO calculation
  const effectiveParticipants = participantUserIds.length >= 2
    ? participantUserIds
    : [...new Set([...teamAPlayers, ...teamBPlayers])];

  if (effectiveParticipants.length >= 2) {
    try {
      await updateEloAfterMatch(
        matchId,
        [recipientUserId], // Only update ELO for the recipient
        inTeamA ? teamBPlayers : teamAPlayers, // Opponent team
        inTeamA ? winner : (winner === 'A' ? 'B' : 'A') as 'A' | 'B', // Adjust winner perspective
        effectiveParticipants,
        teamA?.score,
        teamB?.score,
        playerActions
      );
    } catch (eloErr) {
      console.log('[MatchShare] ELO update error (non-blocking):', eloErr);
    }
  }

  // 7. Send local notification summarizing the stats sync
  try {
    const oldWinRate = currentStats.winRate || 0;
    const teamANames = (teamA?.playerNames || []).join(', ') || 'Team A';
    const teamBNames = (teamB?.playerNames || []).join(', ') || 'Team B';
    const matchSummary = `${teamANames} vs ${teamBNames} (${teamA?.score || 0}-${teamB?.score || 0})`;

    // Get ELO delta from the history we just inserted
    let eloDelta = 0;
    try {
      const { data: eloRow } = await supabase
        .from('elo_history')
        .select('elo_delta')
        .eq('player_id', recipientUserId)
        .eq('match_id', matchId)
        .limit(1)
        .single();
      if (eloRow) eloDelta = eloRow.elo_delta || 0;
    } catch { /* silent */ }

    await sendStatsSyncedNotification({
      matchSummary,
      eloDelta,
      oldWinRate,
      newWinRate,
      won,
    });
  } catch (notifErr) {
    console.log('[MatchShare] Stats sync notification error (non-blocking):', notifErr);
  }

  console.log(`[MatchShare] Stats synced for ${recipientUserId}: ${newWins}W/${newLosses}L (${newWinRate}%)`);
}

/**
 * Decline a share request.
 */
export async function declineShareRequest(
  requestId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase
      .from('match_share_requests')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Update permission on an existing share request (sender only).
 */
export async function updateSharePermission(
  requestId: string,
  permission: 'read' | 'write'
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase
      .from('match_share_requests')
      .update({ permission, updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Delete (revoke) a share request (sender only).
 * If the request was accepted and stats were synced, reverses the recipient's stats.
 */
export async function revokeShareRequest(
  requestId: string,
  options?: { undoStats?: boolean }
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Fetch request details before deleting (needed for stats undo)
    let reqData: any = null;
    if (options?.undoStats) {
      const { data } = await supabase
        .from('match_share_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      reqData = data;
    }

    const { error } = await supabase
      .from('match_share_requests')
      .delete()
      .eq('id', requestId);

    if (error) return { error: error.message };

    // Undo stats sync if requested and the share was accepted for a match
    if (options?.undoStats && reqData && reqData.status === 'accepted' && reqData.item_type === 'match') {
      undoStatsForRevokedMatch(reqData.item_id, reqData.recipient_user_id).catch((e) => {
        console.log('[MatchShare] Stats undo error (non-blocking):', e);
      });
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Revoke all share requests for a specific item (match or challenge).
 * Returns the count of revoked requests.
 */
export async function revokeAllShareRequests(
  itemType: 'match' | 'challenge',
  itemId: string,
  options?: { undoStats?: boolean }
): Promise<{ revokedCount: number; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Fetch all requests for this item first
    const { data: requests, error: fetchErr } = await supabase
      .from('match_share_requests')
      .select('id, status, recipient_user_id, item_type, item_id')
      .eq('item_type', itemType)
      .eq('item_id', itemId);

    if (fetchErr) return { revokedCount: 0, error: fetchErr.message };
    if (!requests || requests.length === 0) return { revokedCount: 0, error: null };

    // Undo stats for accepted requests if requested
    if (options?.undoStats && itemType === 'match') {
      const acceptedRequests = requests.filter(r => r.status === 'accepted');
      for (const req of acceptedRequests) {
        undoStatsForRevokedMatch(itemId, req.recipient_user_id).catch((e) => {
          console.log('[MatchShare] Bulk stats undo error (non-blocking):', e);
        });
      }
    }

    // Delete all requests
    const { error: deleteErr } = await supabase
      .from('match_share_requests')
      .delete()
      .eq('item_type', itemType)
      .eq('item_id', itemId);

    if (deleteErr) return { revokedCount: 0, error: deleteErr.message };
    return { revokedCount: requests.length, error: null };
  } catch (e: any) {
    return { revokedCount: 0, error: e.message };
  }
}

/**
 * Undo the stats sync for a revoked match share.
 * Removes the ELO history entry and recalculates the recipient's stats without this match.
 */
async function undoStatsForRevokedMatch(
  matchId: string,
  recipientUserId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Check if there is an ELO history entry for this match+player
  const { data: eloEntry } = await supabase
    .from('elo_history')
    .select('id, elo_before, elo_delta')
    .eq('player_id', recipientUserId)
    .eq('match_id', matchId)
    .limit(1)
    .single();

  if (!eloEntry) {
    console.log('[MatchShare] No ELO entry found for undo, skipping');
    return;
  }

  // 2. Revert ELO to before value
  const revertedElo = eloEntry.elo_before;
  await supabase
    .from('players')
    .update({ elo_rating: revertedElo })
    .eq('id', recipientUserId);

  // 3. Delete the ELO history entry
  await supabase
    .from('elo_history')
    .delete()
    .eq('id', eloEntry.id);

  // 4. Fetch the match to reverse stats
  const { data: match } = await supabase
    .from('matches')
    .select('team_a, team_b, winner, player_actions')
    .eq('id', matchId)
    .single();

  if (!match) return;

  const teamA = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
  const teamB = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
  const teamAPlayers: string[] = teamA?.players || [];
  const teamBPlayers: string[] = teamB?.players || [];
  const inTeamA = teamAPlayers.includes(recipientUserId);
  const inTeamB = teamBPlayers.includes(recipientUserId);

  if (!inTeamA && !inTeamB) return;

  // 5. Fetch current player stats and decrement
  const { data: player } = await supabase
    .from('players')
    .select('stats')
    .eq('id', recipientUserId)
    .single();

  if (!player) return;

  const stats = player.stats || {};
  const won = (inTeamA && match.winner === 'A') || (inTeamB && match.winner === 'B');
  const newMatchesPlayed = Math.max(0, (stats.matchesPlayed || 0) - 1);
  const newWins = Math.max(0, (stats.wins || 0) - (won ? 1 : 0));
  const newLosses = Math.max(0, (stats.losses || 0) - (won ? 0 : 1));
  const newWinRate = newMatchesPlayed > 0 ? Math.round((newWins / newMatchesPlayed) * 100) : 0;

  const updatedStats = {
    ...stats,
    matchesPlayed: newMatchesPlayed,
    wins: newWins,
    losses: newLosses,
    winRate: newWinRate,
  };

  await supabase
    .from('players')
    .update({ stats: updatedStats })
    .eq('id', recipientUserId);

  console.log(`[MatchShare] Stats undo for ${recipientUserId}: reverted ELO to ${revertedElo}, stats to ${newWins}W/${newLosses}L`);
}

// ============================================
// Fetch shared matches/challenges
// ============================================

/**
 * Get all match IDs shared with the current user (accepted only).
 */
export async function getSharedMatchIds(): Promise<{ matchIds: string[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { matchIds: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('match_share_requests')
      .select('item_id')
      .eq('item_type', 'match')
      .eq('recipient_user_id', user.id)
      .eq('status', 'accepted');

    if (error) return { matchIds: [], error: error.message };
    return { matchIds: (data || []).map((r: any) => r.item_id), error: null };
  } catch (e: any) {
    return { matchIds: [], error: e.message };
  }
}

/**
 * Get all challenge IDs shared with the current user (accepted only).
 */
export async function getSharedChallengeIds(): Promise<{ challengeIds: string[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { challengeIds: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('match_share_requests')
      .select('item_id')
      .eq('item_type', 'challenge')
      .eq('recipient_user_id', user.id)
      .eq('status', 'accepted');

    if (error) return { challengeIds: [], error: error.message };
    return { challengeIds: (data || []).map((r: any) => r.item_id), error: null };
  } catch (e: any) {
    return { challengeIds: [], error: e.message };
  }
}

/**
 * Get pending share request count that are expired (older than 7 days).
 * Auto-declines expired requests.
 */
export async function autoDeclineExpiredShareRequests(): Promise<number> {
  const supabase = getSupabaseClient();
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: expired } = await supabase
      .from('match_share_requests')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo.toISOString());

    if (!expired || expired.length === 0) return 0;

    for (const req of expired) {
      await supabase
        .from('match_share_requests')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', req.id);
    }

    console.log(`[MatchShare] Auto-declined ${expired.length} expired share request(s)`);
    return expired.length;
  } catch (e) {
    console.log('[MatchShare] Auto-decline expired error:', e);
    return 0;
  }
}

/**
 * Calculate remaining time before a share request expires (7 days from creation).
 * Returns null if already expired or not pending.
 */
export function getShareRequestRemainingTime(
  createdAt: string,
  status: string
): { daysLeft: number; hoursLeft: number; isExpired: boolean } | null {
  if (status !== 'pending') return null;
  const created = new Date(createdAt);
  const expiresAt = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return { daysLeft: 0, hoursLeft: 0, isExpired: true };
  const daysLeft = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { daysLeft, hoursLeft, isExpired: false };
}

/**
 * Get share requests for a specific item (match or challenge).
 * Returns all requests where the current user is the sender.
 */
export async function getShareRequestsForItem(
  itemType: 'match' | 'challenge',
  itemId: string
): Promise<{ requests: MatchShareRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('match_share_requests')
      .select('*')
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) return { requests: [], error: error.message };
    return { requests: (data || []).map(mapRow), error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

// ============================================
// Background polling: detect new requests & notify
// ============================================

let _pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling for new share requests and fire local push notifications.
 * Call once after login; stops automatically on cleanup.
 */
export function startShareRequestPolling(intervalMs: number = 30000): void {
  stopShareRequestPolling();
  // Initial check immediately
  _checkForNewShareRequests();
  _pollingInterval = setInterval(_checkForNewShareRequests, intervalMs);
}

export function stopShareRequestPolling(): void {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
}

async function _checkForNewShareRequests(): Promise<void> {
  try {
    const { requests } = await getReceivedShareRequests('pending');
    if (requests.length === 0) return;

    // Load previously seen request IDs
    const raw = await AsyncStorage.getItem(LAST_SEEN_SHARE_REQUESTS_KEY);
    const seenIds: Set<string> = new Set(raw ? JSON.parse(raw) : []);

    const newRequests = requests.filter(r => !seenIds.has(r.id));
    if (newRequests.length === 0) return;

    // Fire a local notification for each new request
    for (const req of newRequests) {
      await sendShareRequestNotification({
        senderName: req.senderName || 'Un joueur',
        itemType: req.itemType,
        permission: req.permission as 'read' | 'write',
        itemSummary: req.itemSummary,
        requestId: req.id,
      });
      seenIds.add(req.id);
    }

    // Persist updated seen set (keep last 200 to avoid unbounded growth)
    const trimmed = [...seenIds].slice(-200);
    await AsyncStorage.setItem(LAST_SEEN_SHARE_REQUESTS_KEY, JSON.stringify(trimmed));
    console.log(`Notified ${newRequests.length} new share request(s)`);
  } catch (e) {
    // Silent — background task
    console.log('Share request polling error:', e);
  }
}

/**
 * Mark a list of request IDs as already seen (e.g., after user views invitations page).
 */
export async function markShareRequestsSeen(ids: string[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SEEN_SHARE_REQUESTS_KEY);
    const seenIds: Set<string> = new Set(raw ? JSON.parse(raw) : []);
    ids.forEach(id => seenIds.add(id));
    const trimmed = [...seenIds].slice(-200);
    await AsyncStorage.setItem(LAST_SEEN_SHARE_REQUESTS_KEY, JSON.stringify(trimmed));
  } catch { /* silent */ }
}

// ============================================
// Helper: map DB row to MatchShareRequest
// ============================================
function mapRow(row: any): MatchShareRequest {
  return {
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    status: row.status,
    permission: row.permission,
    senderName: row.sender_name || undefined,
    itemSummary: row.item_summary || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
