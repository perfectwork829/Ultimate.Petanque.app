/**
 * Club Claim Service
 * Handles claim requests for club ownership transfer and verification.
 */
import { getSupabaseClient } from '@/template';

export interface ClubClaimRequest {
  id: string;
  clubId: string;
  requesterUserId: string;
  currentOwnerId: string;
  requesterName?: string;
  requesterEmail?: string;
  message?: string;
  proofUrl?: string;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt?: string;
  createdAt: string;
}

/** Submit a claim request for a club */
export async function submitClubClaim(params: {
  clubId: string;
  currentOwnerId: string;
  requesterUserId: string;
  requesterName?: string;
  requesterEmail?: string;
  message?: string;
  proofUrl?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  // Check if there is already a pending claim
  const { data: existing } = await supabase
    .from('club_claim_requests')
    .select('id, status')
    .eq('club_id', params.clubId)
    .eq('requester_user_id', params.requesterUserId)
    .single();

  if (existing) {
    if (existing.status === 'pending') {
      return { error: 'claim_already_pending' };
    }
    if (existing.status === 'accepted') {
      return { error: 'claim_already_accepted' };
    }
    // If previously declined, allow re-submission by deleting old record
    await supabase
      .from('club_claim_requests')
      .delete()
      .eq('id', existing.id);
  }

  const { error } = await supabase.from('club_claim_requests').insert({
    club_id: params.clubId,
    requester_user_id: params.requesterUserId,
    current_owner_id: params.currentOwnerId,
    requester_name: params.requesterName || null,
    requester_email: params.requesterEmail || null,
    message: params.message || null,
    proof_url: params.proofUrl || null,
    status: 'pending',
  });

  if (error) {
    console.log('[ClubClaim] Submit error:', error);
    return { error: error.message };
  }

  // Send push notification to admins (not to current owner)
  try {
    const { data: clubData } = await supabase
      .from('clubs')
      .select('name')
      .eq('id', params.clubId)
      .single();

    // Notify all admin users
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_admin', true);

    for (const admin of (admins || [])) {
      try {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'club_claim',
            payload: {
              ownerUserId: admin.id,
              requesterName: params.requesterName || 'Un utilisateur',
              clubName: clubData?.name || 'club',
              clubId: params.clubId,
            },
          },
        });
      } catch { /* silent */ }
    }
  } catch { /* push failure non-blocking */ }

  return { error: null };
}

/** Get all claims received by the current user (as club owner) */
export async function getReceivedClaims(): Promise<{ claims: ClubClaimRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('club_claim_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { claims: [], error: error.message };
  }

  const claims: ClubClaimRequest[] = (data || []).map((r: any) => ({
    id: r.id,
    clubId: r.club_id,
    requesterUserId: r.requester_user_id,
    currentOwnerId: r.current_owner_id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    message: r.message,
    proofUrl: r.proof_url,
    status: r.status,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
  }));

  return { claims, error: null };
}

/** Get pending claims count for the current user's clubs */
export async function getPendingClaimCount(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('club_claim_requests')
    .select('id')
    .eq('status', 'pending');

  if (error) return 0;
  return (data || []).length;
}

/** Get my submitted claims */
export async function getMySubmittedClaims(): Promise<{ claims: ClubClaimRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.id) return { claims: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('club_claim_requests')
    .select('*')
    .eq('requester_user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) return { claims: [], error: error.message };

  const claims: ClubClaimRequest[] = (data || []).map((r: any) => ({
    id: r.id,
    clubId: r.club_id,
    requesterUserId: r.requester_user_id,
    currentOwnerId: r.current_owner_id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    message: r.message,
    proofUrl: r.proof_url,
    status: r.status,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
  }));

  return { claims, error: null };
}

/** Accept a claim — transfers ownership and awards badge to original creator */
export async function acceptClubClaim(claimId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  // Get claim details
  const { data: claim, error: claimError } = await supabase
    .from('club_claim_requests')
    .select('*')
    .eq('id', claimId)
    .single();

  if (claimError || !claim) {
    return { error: 'Claim not found' };
  }

  // Transfer ownership: update club user_id to requester
  const { error: transferError } = await supabase
    .from('clubs')
    .update({
      user_id: claim.requester_user_id,
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claim.club_id);

  if (transferError) {
    console.log('[ClubClaim] Transfer error:', transferError);
    return { error: transferError.message };
  }

  // Mark claim as accepted
  await supabase
    .from('club_claim_requests')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId);

  // Award "Contributor" badge to original creator
  try {
    await supabase.from('user_badges').upsert({
      user_id: claim.current_owner_id,
      badge_id: 'club_contributor',
    }, { onConflict: 'user_id,badge_id' });
  } catch (e) {
    console.log('[ClubClaim] Badge award error:', e);
  }

  // Decline any other pending claims for the same club
  await supabase
    .from('club_claim_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('club_id', claim.club_id)
    .eq('status', 'pending')
    .neq('id', claimId);

  return { error: null };
}

/** Decline a claim */
export async function declineClubClaim(claimId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('club_claim_requests')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId);

  if (error) return { error: error.message };
  return { error: null };
}

/** Check if user already has a pending claim for a club */
export async function hasExistingClaim(clubId: string, userId: string): Promise<{ hasClaim: boolean; status: string | null }> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('club_claim_requests')
    .select('status')
    .eq('club_id', clubId)
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data) return { hasClaim: true, status: data.status };
  return { hasClaim: false, status: null };
}

/** Submit verification request (owner sends proof to admin) */
export async function submitVerificationRequest(params: {
  clubId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  roleInClub: string;
  proofUrl?: string;
  message?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  // Use club_claim_requests table with a special marker
  const { data: existing } = await supabase
    .from('club_claim_requests')
    .select('id, status')
    .eq('club_id', params.clubId)
    .eq('requester_user_id', params.userId)
    .single();

  if (existing && existing.status === 'pending') {
    return { error: 'verification_already_pending' };
  }
  if (existing && existing.status === 'accepted') {
    return { error: 'verification_already_accepted' };
  }
  if (existing) {
    await supabase.from('club_claim_requests').delete().eq('id', existing.id);
  }

  // Owner verifying their own club: current_owner_id = user_id
  const { error } = await supabase.from('club_claim_requests').insert({
    club_id: params.clubId,
    requester_user_id: params.userId,
    current_owner_id: params.userId,
    requester_name: params.userName || null,
    requester_email: params.userEmail || null,
    message: params.message || `Role: ${params.roleInClub}`,
    proof_url: params.proofUrl || null,
    status: 'pending',
  });

  if (error) return { error: error.message };

  // Notify admins
  try {
    const { data: clubData } = await supabase.from('clubs').select('name').eq('id', params.clubId).single();
    const { data: admins } = await supabase.from('user_profiles').select('id').eq('is_admin', true);
    for (const admin of (admins || [])) {
      try {
        await supabase.functions.invoke('send-push', {
          body: { type: 'club_claim', payload: { ownerUserId: admin.id, requesterName: params.userName || 'Un utilisateur', clubName: clubData?.name || 'club', clubId: params.clubId } },
        });
      } catch { /* silent */ }
    }
  } catch { /* silent */ }

  return { error: null };
}

/** Get all pending claims/verification requests (admin use) */
export async function getAllPendingClaims(): Promise<{ claims: ClubClaimRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('club_claim_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return { claims: [], error: error.message };

  const claims: ClubClaimRequest[] = (data || []).map((r: any) => ({
    id: r.id,
    clubId: r.club_id,
    requesterUserId: r.requester_user_id,
    currentOwnerId: r.current_owner_id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    message: r.message,
    proofUrl: r.proof_url,
    status: r.status,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
  }));

  return { claims, error: null };
}

/** Get claim processing stats for admin dashboard */
export async function getClaimProcessingStats(): Promise<{
  processedThisMonth: number;
  acceptedThisMonth: number;
  declinedThisMonth: number;
  avgResponseTimeHours: number;
  pendingCount: number;
  oldestPendingDays: number;
}> {
  const supabase = getSupabaseClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Get processed claims this month
  const { data: processed } = await supabase
    .from('club_claim_requests')
    .select('status, created_at, responded_at')
    .in('status', ['accepted', 'declined'])
    .gte('responded_at', startOfMonth.toISOString());

  const processedList = processed || [];
  const acceptedThisMonth = processedList.filter(r => r.status === 'accepted').length;
  const declinedThisMonth = processedList.filter(r => r.status === 'declined').length;

  // Calculate average response time
  let totalHours = 0;
  let countWithTime = 0;
  processedList.forEach(r => {
    if (r.created_at && r.responded_at) {
      const diff = new Date(r.responded_at).getTime() - new Date(r.created_at).getTime();
      totalHours += diff / (1000 * 60 * 60);
      countWithTime++;
    }
  });
  const avgResponseTimeHours = countWithTime > 0 ? Math.round((totalHours / countWithTime) * 10) / 10 : 0;

  // Get pending count and oldest
  const { data: pending } = await supabase
    .from('club_claim_requests')
    .select('created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  const pendingCount = await supabase
    .from('club_claim_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  let oldestPendingDays = 0;
  if (pending && pending.length > 0) {
    oldestPendingDays = Math.round((Date.now() - new Date(pending[0].created_at).getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    processedThisMonth: processedList.length,
    acceptedThisMonth,
    declinedThisMonth,
    avgResponseTimeHours,
    pendingCount: pendingCount.count || 0,
    oldestPendingDays,
  };
}

/** Get processed claim history (admin use) */
export async function getClaimHistory(limit = 50): Promise<{ claims: ClubClaimRequest[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('club_claim_requests')
    .select('*')
    .in('status', ['accepted', 'declined'])
    .order('responded_at', { ascending: false })
    .limit(limit);

  if (error) return { claims: [], error: error.message };

  const claims: ClubClaimRequest[] = (data || []).map((r: any) => ({
    id: r.id,
    clubId: r.club_id,
    requesterUserId: r.requester_user_id,
    currentOwnerId: r.current_owner_id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    message: r.message,
    proofUrl: r.proof_url,
    status: r.status,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
  }));

  return { claims, error: null };
}

/** Send detailed verification decision notification to club owner */
export async function sendVerificationDecisionNotification(params: {
  targetUserId: string;
  clubName: string;
  clubId: string;
  decision: 'accepted' | 'declined';
  requestType: 'verification' | 'claim';
  adminMessage?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'club_verification_decision',
        payload: {
          targetUserId: params.targetUserId,
          clubName: params.clubName,
          clubId: params.clubId,
          decision: params.decision,
          requestType: params.requestType,
          adminMessage: params.adminMessage,
        },
      },
    });
  } catch (e) {
    console.log('[ClubClaim] Decision notification error:', e);
  }
}
