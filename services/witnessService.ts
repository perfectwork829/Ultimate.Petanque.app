// ============================================
// Unified Witness / Attestation Service
// Supports matches AND challenges
// ============================================
import { getSupabaseClient } from '@/template';

export type WitnessItemType = 'match' | 'challenge';
export type AttestationType = 'standard' | 'opponent_confirmation' | 'confirmed' | 'disputed';
export type WitnessStatus = 'pending' | 'attested' | 'declined';

export interface WitnessAttestation {
  id: string;
  matchId: string; // legacy FK column
  itemType: WitnessItemType;
  itemId: string;
  requesterUserId: string;
  witnessUserId: string;
  witnessName?: string;
  attestationType: AttestationType;
  status: WitnessStatus;
  itemSnapshot?: Record<string, any>;
  respondedAt?: string;
  createdAt: string;
}

export interface WitnessRequestInput {
  itemType: WitnessItemType;
  itemId: string;
  witnessUserId: string;
  witnessName?: string;
  attestationType?: AttestationType;
  snapshot?: Record<string, any>;
}

// ============================================
// REQUEST WITNESS
// ============================================

/**
 * Check if a cooldown is active between requester and witness (1h between requests to same witness).
 */
export async function checkWitnessCooldown(
  requesterUserId: string,
  witnessUserId: string
): Promise<{ onCooldown: boolean; minutesRemaining: number }> {
  const supabase = getSupabaseClient();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('match_witness_requests')
      .select('created_at')
      .eq('requester_user_id', requesterUserId)
      .eq('witness_user_id', witnessUserId)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastRequestTime = new Date(data[0].created_at).getTime();
      const elapsed = Date.now() - lastRequestTime;
      const remaining = Math.ceil((60 * 60 * 1000 - elapsed) / 60000);
      return { onCooldown: true, minutesRemaining: Math.max(1, remaining) };
    }
    return { onCooldown: false, minutesRemaining: 0 };
  } catch {
    return { onCooldown: false, minutesRemaining: 0 };
  }
}

/**
 * Detect frequent witness pairs (same 2 users attesting each other too often).
 * Returns the count of mutual attestations in the last 7 days.
 */
export async function getFrequentPairCount(
  userA: string,
  userB: string
): Promise<number> {
  const supabase = getSupabaseClient();
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Count requests from A->B and B->A in the last week
    const { data: abData } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('requester_user_id', userA)
      .eq('witness_user_id', userB)
      .gte('created_at', oneWeekAgo);

    const { data: baData } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('requester_user_id', userB)
      .eq('witness_user_id', userA)
      .gte('created_at', oneWeekAgo);

    return (abData?.length || 0) + (baData?.length || 0);
  } catch {
    return 0;
  }
}

/**
 * Request a witness attestation for a match or challenge.
 * Max 2 witnesses per item. Cannot witness own item.
 * Enforces 1h cooldown per requester-witness pair and 5/week frequency cap.
 */
export async function requestWitness(input: WitnessRequestInput): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (input.witnessUserId === user.id) {
    return { error: 'Cannot witness your own item' };
  }

  try {
    // Anti-abuse: 1h cooldown between requests to same witness
    const { onCooldown, minutesRemaining } = await checkWitnessCooldown(user.id, input.witnessUserId);
    if (onCooldown) {
      return { error: `Cooldown active. Wait ${minutesRemaining} min before requesting this witness again.` };
    }

    // Anti-abuse: max 5 attestations/week between same pair
    const pairCount = await getFrequentPairCount(user.id, input.witnessUserId);
    if (pairCount >= 5) {
      return { error: 'Maximum 5 attestations per week between the same pair of players.' };
    }

    // Check existing witness count
    const { data: existing } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('item_type', input.itemType)
      .eq('item_id', input.itemId)
      .neq('status', 'declined');

    if (existing && existing.length >= 2) {
      return { error: 'Maximum 2 witnesses per item' };
    }

    // Check duplicate
    const { data: dup } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('item_type', input.itemType)
      .eq('item_id', input.itemId)
      .eq('witness_user_id', input.witnessUserId)
      .limit(1);

    if (dup && dup.length > 0) {
      return { error: 'Already requested this witness' };
    }

    // For match items, use match_id FK; for challenges use a dummy match_id workaround
    // match_id is required by FK, so for challenges we set item_id and item_type
    const matchIdValue = input.itemType === 'match' ? input.itemId : null;

    const insertData: any = {
      requester_user_id: user.id,
      witness_user_id: input.witnessUserId,
      witness_name: input.witnessName || '',
      status: 'pending',
      attestation_type: input.attestationType || 'standard',
      item_type: input.itemType,
      item_id: input.itemId,
      item_snapshot: input.snapshot || null,
    };

    // Only set match_id for match items (FK constraint)
    if (matchIdValue) {
      insertData.match_id = matchIdValue;
    }

    const { error } = await supabase
      .from('match_witness_requests')
      .insert(insertData);

    if (error) return { error: error.message };

    // Send push notification
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
            witnessUserId: input.witnessUserId,
            requesterName: profile?.username || 'Un joueur',
            matchId: input.itemId,
            itemType: input.itemType,
          },
        },
      });
    } catch { /* push failure non-blocking */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============================================
// RESPOND TO ATTESTATION
// ============================================

/**
 * Respond to a witness attestation request (attest or decline).
 * Updates the item's witness_count and is_attested when attested.
 */
export async function respondToAttestation(
  requestId: string,
  response: 'attested' | 'declined'
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Fetch request details
    const { data: reqData, error: fetchErr } = await supabase
      .from('match_witness_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !reqData) return { error: 'Request not found' };

    // Update status
    const { error } = await supabase
      .from('match_witness_requests')
      .update({
        status: response,
        attestation_type: response === 'attested' ? 'confirmed' : 'disputed',
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) return { error: error.message };

    // If attested, update item's witness_count and is_attested
    if (response === 'attested') {
      const itemType = reqData.item_type || 'match';
      const itemId = reqData.item_id || reqData.match_id;
      const tableName = itemType === 'challenge' ? 'challenges' : 'matches';

      // Count attested witnesses for this item
      const { data: attestedList } = await supabase
        .from('match_witness_requests')
        .select('id')
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .eq('status', 'attested');

      const witnessCount = attestedList?.length || 1;

      await supabase
        .from(tableName)
        .update({
          witness_count: witnessCount,
          is_attested: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      // Notify requester
      try {
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
              matchId: itemId,
              itemType,
            },
          },
        });
      } catch { /* push failure non-blocking */ }
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============================================
// FETCH ATTESTATIONS
// ============================================

/**
 * Fetch all attestation requests for a specific item.
 */
export async function fetchAttestationsForItem(
  itemType: WitnessItemType,
  itemId: string
): Promise<WitnessAttestation[]> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('match_witness_requests')
      .select('*')
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map(mapRowToAttestation);
  } catch {
    return [];
  }
}

/**
 * Fetch pending attestation requests where user is the witness.
 */
export async function fetchMyPendingAttestations(): Promise<WitnessAttestation[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('match_witness_requests')
      .select('*')
      .eq('witness_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapRowToAttestation);
  } catch {
    return [];
  }
}

/**
 * Fetch all attestation requests (pending and history) for the current user as witness.
 */
export async function fetchAllMyAttestations(): Promise<WitnessAttestation[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('match_witness_requests')
      .select('*')
      .eq('witness_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapRowToAttestation);
  } catch {
    return [];
  }
}

/**
 * Check if an item has been attested.
 */
export async function isItemAttested(itemType: WitnessItemType, itemId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .eq('status', 'attested')
      .limit(1);

    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

/**
 * Build a snapshot of match or challenge data for attestation.
 */
export function buildMatchSnapshot(match: {
  teamA: { playerNames: string[]; score: number };
  teamB: { playerNames: string[]; score: number };
  winner: string;
  format: string;
  date: string;
  duration?: number;
}): Record<string, any> {
  return {
    teamA: { playerNames: match.teamA.playerNames, score: match.teamA.score },
    teamB: { playerNames: match.teamB.playerNames, score: match.teamB.score },
    winner: match.winner,
    format: match.format,
    date: match.date,
    duration: match.duration || 0,
    snapshotAt: new Date().toISOString(),
  };
}

export function buildChallengeSnapshot(challenge: {
  type: string;
  mode: string;
  playerName?: string;
  opponentName?: string;
  successCount?: number;
  totalShots?: number;
  successRate?: number;
  totalPoints?: number;
  winner?: string;
  date: string;
}): Record<string, any> {
  return {
    type: challenge.type,
    mode: challenge.mode,
    playerName: challenge.playerName,
    opponentName: challenge.opponentName,
    successCount: challenge.successCount,
    totalShots: challenge.totalShots,
    successRate: challenge.successRate,
    totalPoints: challenge.totalPoints,
    winner: challenge.winner,
    date: challenge.date,
    snapshotAt: new Date().toISOString(),
  };
}

// ============================================
// HELPERS
// ============================================

// ============================================
// OPPONENT AUTO-CONFIRMATION
// ============================================

/**
 * Send automatic opponent confirmation request when a match/challenge is shared.
 * Called when match_share_requests status changes to 'accepted'.
 * The opponent gets an attestation request with type 'opponent_confirmation'.
 */
export async function sendOpponentConfirmation(input: {
  itemType: WitnessItemType;
  itemId: string;
  opponentUserId: string;
  opponentName?: string;
  snapshot?: Record<string, any>;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (input.opponentUserId === user.id) {
    return { error: 'Cannot send confirmation to yourself' };
  }

  try {
    // Check if already requested
    const { data: dup } = await supabase
      .from('match_witness_requests')
      .select('id')
      .eq('item_type', input.itemType)
      .eq('item_id', input.itemId)
      .eq('witness_user_id', input.opponentUserId)
      .limit(1);

    if (dup && dup.length > 0) {
      return { error: null }; // Already requested, silently skip
    }

    const matchIdValue = input.itemType === 'match' ? input.itemId : null;

    const insertData: any = {
      requester_user_id: user.id,
      witness_user_id: input.opponentUserId,
      witness_name: input.opponentName || '',
      status: 'pending',
      attestation_type: 'opponent_confirmation',
      item_type: input.itemType,
      item_id: input.itemId,
      item_snapshot: input.snapshot || null,
    };

    if (matchIdValue) {
      insertData.match_id = matchIdValue;
    }

    const { error } = await supabase
      .from('match_witness_requests')
      .insert(insertData);

    if (error) return { error: error.message };

    // Send push notification
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
            witnessUserId: input.opponentUserId,
            requesterName: profile?.username || 'Un joueur',
            matchId: input.itemId,
            itemType: input.itemType,
            isOpponentConfirmation: true,
          },
        },
      });
    } catch { /* push failure non-blocking */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check for accepted match share requests and auto-send opponent confirmations.
 * Called after refreshing data or accepting a share request.
 */
export async function checkAndSendOpponentConfirmations(
  itemType: WitnessItemType,
  itemId: string,
  snapshotData?: Record<string, any>
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // Find accepted share requests for this item where recipient has a user account
    const { data: shares } = await supabase
      .from('match_share_requests')
      .select('recipient_user_id, sender_name')
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .eq('status', 'accepted');

    if (!shares || shares.length === 0) return;

    for (const share of shares) {
      const opponentId = share.recipient_user_id;
      if (opponentId === user.id) continue; // Skip self

      // Check if attestation already exists
      const { data: existing } = await supabase
        .from('match_witness_requests')
        .select('id')
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .eq('witness_user_id', opponentId)
        .limit(1);

      if (existing && existing.length > 0) continue; // Already has attestation request

      // Fetch opponent name
      const { data: opProfile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', opponentId)
        .single();

      await sendOpponentConfirmation({
        itemType,
        itemId,
        opponentUserId: opponentId,
        opponentName: opProfile?.username || share.sender_name || '',
        snapshot: snapshotData,
      });
    }
  } catch (e) {
    console.log('[witnessService] Auto-confirmation check error:', e);
  }
}

// ============================================
// HELPERS
// ============================================

function mapRowToAttestation(row: any): WitnessAttestation {
  return {
    id: row.id,
    matchId: row.match_id,
    itemType: row.item_type || 'match',
    itemId: row.item_id || row.match_id,
    requesterUserId: row.requester_user_id,
    witnessUserId: row.witness_user_id,
    witnessName: row.witness_name,
    attestationType: row.attestation_type || 'standard',
    status: row.status,
    itemSnapshot: row.item_snapshot,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}
