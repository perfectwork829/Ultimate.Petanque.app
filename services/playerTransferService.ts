/**
 * Player Transfer Service
 * 
 * Handles transferring local players (and their associated matches/challenges)
 * to registered user accounts.
 */

import { getSupabaseClient } from '@/template';

export interface PlayerTransferRequest {
  id: string;
  senderUserId: string;
  senderName?: string;
  recipientUserId: string;
  playerId: string;
  playerName: string;
  status: 'pending' | 'accepted' | 'declined';
  matchCount: number;
  challengeCount: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Count transferable items (matches + challenges) for a local player
 */
export async function countTransferableItems(playerId: string): Promise<{ matchCount: number; challengeCount: number }> {
  const supabase = getSupabaseClient();
  
  // Fetch all user's matches and filter client-side for player participation
  // (PostgREST cannot filter inside JSONB arrays with containment operators)
  const { data: matches } = await supabase
    .from('matches')
    .select('id, team_a, team_b');
  
  let matchCount = 0;
  if (matches) {
    matchCount = matches.filter((m: any) => {
      const ta = typeof m.team_a === 'string' ? JSON.parse(m.team_a) : m.team_a;
      const tb = typeof m.team_b === 'string' ? JSON.parse(m.team_b) : m.team_b;
      return (ta?.players || []).includes(playerId) || (tb?.players || []).includes(playerId);
    }).length;
  }

  // Count challenges for this player
  const { count: challengeCount } = await supabase
    .from('challenges')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId);

  return { matchCount, challengeCount: challengeCount || 0 };
}

/**
 * Search registered users by name or email for transfer target
 */
export async function searchRegisteredUsers(query: string, excludeUserId?: string): Promise<{ users: Array<{ id: string; username: string; email: string; avatar?: string }> }> {
  if (!query || query.trim().length < 2) return { users: [] };
  
  const supabase = getSupabaseClient();
  const q = query.trim().toLowerCase();
  
  let builder = supabase
    .from('user_profiles')
    .select('id, username, email, avatar')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  
  if (excludeUserId) {
    builder = builder.neq('id', excludeUserId);
  }
  
  const { data, error } = await builder;
  if (error) return { users: [] };
  
  return { users: (data || []).map((u: any) => ({ id: u.id, username: u.username || '', email: u.email || '', avatar: u.avatar })) };
}

/**
 * Send a transfer request
 */
export async function sendTransferRequest(params: {
  senderUserId: string;
  recipientUserId: string;
  playerId: string;
  playerName: string;
  matchCount: number;
  challengeCount: number;
  message?: string;
}): Promise<{ request: PlayerTransferRequest | null; error: string | null }> {
  const supabase = getSupabaseClient();
  
  // Check for existing pending request
  const { data: existing } = await supabase
    .from('player_transfer_requests')
    .select('id')
    .eq('player_id', params.playerId)
    .eq('recipient_user_id', params.recipientUserId)
    .eq('status', 'pending')
    .maybeSingle();
  
  if (existing) {
    return { request: null, error: 'already_pending' };
  }
  
  const { data, error } = await supabase
    .from('player_transfer_requests')
    .insert({
      sender_user_id: params.senderUserId,
      recipient_user_id: params.recipientUserId,
      player_id: params.playerId,
      player_name: params.playerName,
      match_count: params.matchCount,
      challenge_count: params.challengeCount,
      message: params.message || null,
    })
    .select()
    .single();
  
  if (error) return { request: null, error: error.message };
  
  return { request: mapFromDB(data), error: null };
}

/**
 * Get received transfer requests (for recipient)
 */
export async function getReceivedTransferRequests(): Promise<{ requests: PlayerTransferRequest[] }> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('player_transfer_requests')
    .select('*, sender:user_profiles!player_transfer_requests_sender_user_id_fkey(username)')
    .order('created_at', { ascending: false });
  
  if (error || !data) return { requests: [] };
  
  return {
    requests: data.map((row: any) => ({
      ...mapFromDB(row),
      senderName: row.sender?.username || '',
    })),
  };
}

/**
 * Get sent transfer requests (for sender)
 */
export async function getSentTransferRequests(): Promise<{ requests: PlayerTransferRequest[] }> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('player_transfer_requests')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error || !data) return { requests: [] };
  
  return { requests: data.map(mapFromDB) };
}

/**
 * Accept a transfer request — reassigns matches/challenges to recipient
 */
export async function acceptTransferRequest(requestId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  
  // Fetch the request
  const { data: req, error: fetchErr } = await supabase
    .from('player_transfer_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  
  if (fetchErr || !req) return { error: 'Request not found' };
  if (req.status !== 'pending') return { error: 'Request already processed' };
  
  const playerId = req.player_id;
  const recipientUserId = req.recipient_user_id;
  
  // Find recipient's own player profile
  const { data: recipientPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', recipientUserId)
    .eq('is_public', true)
    .limit(1)
    .maybeSingle();
  
  const targetPlayerId = recipientPlayer?.id;
  
  if (targetPlayerId) {
    // Reassign matches: replace playerId with targetPlayerId in team_a/team_b JSON
    const { data: matches } = await supabase
      .from('matches')
      .select('id, team_a, team_b, player_actions, participant_user_ids')
      .eq('user_id', req.sender_user_id);
    
    if (matches) {
      for (const match of matches) {
        const ta = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
        const tb = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
        let changed = false;
        
        // Replace in team_a players array
        if (ta?.players?.includes(playerId)) {
          const idx = ta.players.indexOf(playerId);
          ta.players[idx] = targetPlayerId;
          changed = true;
        }
        // Replace in team_b players array
        if (tb?.players?.includes(playerId)) {
          const idx = tb.players.indexOf(playerId);
          tb.players[idx] = targetPlayerId;
          changed = true;
        }
        
        if (changed) {
          // Also update player_actions if present
          let pa = match.player_actions;
          if (pa) {
            pa = (typeof pa === 'string' ? JSON.parse(pa) : pa).map((a: any) =>
              a.playerId === playerId ? { ...a, playerId: targetPlayerId } : a
            );
          }
          
          // Add recipient to participant_user_ids
          const pids = match.participant_user_ids || [];
          if (!pids.includes(recipientUserId)) pids.push(recipientUserId);
          
          await supabase
            .from('matches')
            .update({ team_a: ta, team_b: tb, player_actions: pa, participant_user_ids: pids })
            .eq('id', match.id);
        }
      }
    }
    
    // Reassign challenges
    await supabase
      .from('challenges')
      .update({ player_id: targetPlayerId, participant_user_ids: supabase.rpc ? undefined : [recipientUserId] })
      .eq('player_id', playerId)
      .eq('user_id', req.sender_user_id);
  }
  
  // Update request status
  const { error: updateErr } = await supabase
    .from('player_transfer_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  
  if (updateErr) return { error: updateErr.message };
  
  return { error: null };
}

/**
 * Decline a transfer request
 */
export async function declineTransferRequest(requestId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('player_transfer_requests')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  
  return { error: error?.message || null };
}

/**
 * Cancel a pending transfer request (sender only)
 */
export async function cancelTransferRequest(requestId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('player_transfer_requests')
    .delete()
    .eq('id', requestId);
  
  return { error: error?.message || null };
}

function mapFromDB(row: any): PlayerTransferRequest {
  return {
    id: row.id,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    playerId: row.player_id,
    playerName: row.player_name,
    status: row.status,
    matchCount: row.match_count || 0,
    challengeCount: row.challenge_count || 0,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
