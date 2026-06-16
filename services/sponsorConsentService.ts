/**
 * Sponsor Consent Service
 * Handles the sponsorship consent flow where item owners must accept/refuse
 * before a sponsor banner appears on their item.
 */

import { getSupabaseClient } from '@/template';

export interface SponsorConsentRequest {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  itemType: string; // 'terrain' | 'club' | 'tournament' | 'player'
  itemId: string;
  itemName: string;
  status: string; // 'approved_awaiting_consent' | 'active' | 'owner_refused'
  ownerUserId: string;
  ownerResponse: string | null;
  ownerResponseReason: string | null;
  ownerRespondedAt: string | null;
  createdAt: string;
}

/**
 * Get all pending sponsorship consent requests for the current user
 * (items they own that have been approved by admin but await their consent)
 */
export async function getPendingSponsorConsents(): Promise<{ requests: SponsorConsentRequest[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('status', 'approved_awaiting_consent')
      .order('created_at', { ascending: false });

    if (error) return { requests: [], error: error.message };

    const requests: SponsorConsentRequest[] = (data || []).map((d: any) => ({
      id: d.id,
      ambassadorId: d.ambassador_id,
      ambassadorName: d.ambassador_name || '',
      itemType: d.item_type,
      itemId: d.item_id,
      itemName: d.item_name || '',
      status: d.status,
      ownerUserId: d.owner_user_id,
      ownerResponse: d.owner_response,
      ownerResponseReason: d.owner_response_reason,
      ownerRespondedAt: d.owner_responded_at,
      createdAt: d.created_at,
    }));

    return { requests, error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Get all sponsor consent requests for the current user (all statuses)
 */
export async function getAllSponsorConsents(): Promise<{ requests: SponsorConsentRequest[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .in('status', ['approved_awaiting_consent', 'active', 'owner_refused', 'consent_expired', 'owner_removed'])
      .order('created_at', { ascending: false });

    if (error) return { requests: [], error: error.message };

    const requests: SponsorConsentRequest[] = (data || []).map((d: any) => ({
      id: d.id,
      ambassadorId: d.ambassador_id,
      ambassadorName: d.ambassador_name || '',
      itemType: d.item_type,
      itemId: d.item_id,
      itemName: d.item_name || '',
      status: d.status,
      ownerUserId: d.owner_user_id,
      ownerResponse: d.owner_response,
      ownerResponseReason: d.owner_response_reason,
      ownerRespondedAt: d.owner_responded_at,
      createdAt: d.created_at,
    }));

    return { requests, error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Accept a sponsorship proposal — sets sponsor_id on the item
 */
export async function acceptSponsorConsent(proposalId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Get proposal details
    const { data: proposal, error: fetchErr } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchErr || !proposal) return { error: fetchErr?.message || 'Proposal not found' };
    if (proposal.status !== 'approved_awaiting_consent') return { error: 'Invalid status' };

    // Set sponsor_id on the target item
    const tableName = proposal.item_type === 'terrain' ? 'terrains'
      : proposal.item_type === 'club' ? 'clubs'
      : proposal.item_type === 'player' ? 'players'
      : 'tournaments';

    const { error: linkErr } = await supabase
      .from(tableName)
      .update({ sponsor_id: proposal.ambassador_id })
      .eq('id', proposal.item_id);

    if (linkErr) return { error: linkErr.message };

    // Update proposal status
    const { error: upErr } = await supabase
      .from('sponsor_proposals')
      .update({
        status: 'active',
        owner_response: 'accepted',
        owner_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    if (upErr) return { error: upErr.message };

    // Notify partner (fire and forget)
    notifyPartnerOfConsentResponse(proposal.ambassador_id, proposal.item_name, proposal.item_type, true).catch(() => {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Refuse a sponsorship proposal
 */
export async function refuseSponsorConsent(proposalId: string, reason?: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const { data: proposal, error: fetchErr } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchErr || !proposal) return { error: fetchErr?.message || 'Proposal not found' };
    if (proposal.status !== 'approved_awaiting_consent') return { error: 'Invalid status' };

    const { error: upErr } = await supabase
      .from('sponsor_proposals')
      .update({
        status: 'owner_refused',
        owner_response: 'refused',
        owner_response_reason: reason?.trim() || null,
        owner_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    if (upErr) return { error: upErr.message };

    // Notify partner
    notifyPartnerOfConsentResponse(proposal.ambassador_id, proposal.item_name, proposal.item_type, false, reason).catch(() => {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Notify partner when item owner accepts or refuses sponsorship
 */
async function notifyPartnerOfConsentResponse(
  ambassadorId: string,
  itemName: string,
  itemType: string,
  accepted: boolean,
  reason?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Get partner user_id
    const { data: amb } = await supabase
      .from('ambassadors')
      .select('user_id, display_name')
      .eq('id', ambassadorId)
      .single();

    if (!amb) return;

    // Send push notification
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'sponsor_consent_response',
        payload: {
          targetUserId: amb.user_id,
          itemName,
          itemType,
          accepted,
          reason: reason || undefined,
        },
      },
    });

    // Track analytics
    await supabase.from('ambassador_analytics').insert({
      ambassador_id: ambassadorId,
      event_type: accepted ? 'sponsor_consent_accepted' : 'sponsor_consent_refused',
      source_page: `${itemType}|${itemName}|${reason || ''}`,
    });
  } catch { /* silent */ }
}

/**
 * Send notification to item owner when admin approves a sponsorship
 */
export async function notifyOwnerOfSponsorApproval(
  ownerUserId: string,
  ambassadorName: string,
  itemName: string,
  itemType: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'sponsor_consent_request',
        payload: {
          targetUserId: ownerUserId,
          ambassadorName,
          itemName,
          itemType,
        },
      },
    });
  } catch { /* silent */ }
}

// ============ SPONSOR REMOVAL ============

/**
 * Get all active sponsorships on items owned by the current user
 */
export async function getMyActiveSponsors(): Promise<{ items: ActiveSponsorItem[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('status', 'active')
      .order('owner_responded_at', { ascending: false });

    if (error) return { items: [], error: error.message };

    const items: ActiveSponsorItem[] = (data || []).map((d: any) => ({
      proposalId: d.id,
      ambassadorId: d.ambassador_id,
      ambassadorName: d.ambassador_name || '',
      itemType: d.item_type,
      itemId: d.item_id,
      itemName: d.item_name || '',
      activeSince: d.owner_responded_at || d.updated_at || d.created_at,
    }));

    return { items, error: null };
  } catch (e: any) {
    return { items: [], error: e.message };
  }
}

export interface ActiveSponsorItem {
  proposalId: string;
  ambassadorId: string;
  ambassadorName: string;
  itemType: string;
  itemId: string;
  itemName: string;
  activeSince: string;
}

/**
 * Remove an active sponsor from an item (owner-initiated removal)
 */
export async function removeSponsorFromItem(
  proposalId: string,
  reason?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const { data: proposal, error: fetchErr } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchErr || !proposal) return { error: fetchErr?.message || 'Proposal not found' };
    if (proposal.status !== 'active') return { error: 'Sponsorship is not active' };

    // Remove sponsor_id from the item
    const tableName = proposal.item_type === 'terrain' ? 'terrains'
      : proposal.item_type === 'club' ? 'clubs'
      : proposal.item_type === 'player' ? 'players'
      : 'tournaments';

    const { error: unlinkErr } = await supabase
      .from(tableName)
      .update({ sponsor_id: null })
      .eq('id', proposal.item_id);

    if (unlinkErr) return { error: unlinkErr.message };

    // Update proposal status to owner_removed
    const { error: upErr } = await supabase
      .from('sponsor_proposals')
      .update({
        status: 'owner_removed',
        owner_response: 'removed',
        owner_response_reason: reason?.trim() || 'Owner removed sponsorship',
        owner_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    if (upErr) return { error: upErr.message };

    // Notify partner
    notifyPartnerOfConsentResponse(
      proposal.ambassador_id,
      proposal.item_name,
      proposal.item_type,
      false,
      reason || 'Owner removed sponsorship'
    ).catch(() => {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============ 7-DAY CONSENT EXPIRY ============

const CONSENT_EXPIRY_DAYS = 7;

/**
 * Get remaining time for a consent request (7-day window from admin approval)
 */
export function getConsentRemainingTime(createdAt: string): {
  daysLeft: number;
  hoursLeft: number;
  isExpired: boolean;
  totalMs: number;
} {
  const created = new Date(createdAt).getTime();
  const expiresAt = created + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  const isExpired = remaining <= 0;
  const daysLeft = Math.max(0, Math.floor(remaining / (24 * 60 * 60 * 1000)));
  const hoursLeft = Math.max(0, Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));
  return { daysLeft, hoursLeft, isExpired, totalMs: remaining };
}

/**
 * Auto-expire pending consent requests older than 7 days
 */
export async function autoExpirePendingConsents(): Promise<{ expiredCount: number; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const cutoff = new Date(Date.now() - CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: expired, error: fetchErr } = await supabase
      .from('sponsor_proposals')
      .select('id, ambassador_id, ambassador_name, item_name, item_type')
      .eq('status', 'approved_awaiting_consent')
      .lt('updated_at', cutoff);

    if (fetchErr || !expired || expired.length === 0) return { expiredCount: 0, error: fetchErr?.message || null };

    // Batch update to expired
    const ids = expired.map((e: any) => e.id);
    const { error: upErr } = await supabase
      .from('sponsor_proposals')
      .update({
        status: 'consent_expired',
        owner_response: 'expired',
        owner_response_reason: 'Auto-expired after 7 days without response',
        owner_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (upErr) return { expiredCount: 0, error: upErr.message };

    // Notify each partner
    for (const exp of expired) {
      notifyPartnerOfConsentResponse(
        exp.ambassador_id,
        exp.item_name,
        exp.item_type,
        false,
        'Consent expired after 7 days'
      ).catch(() => {});
    }

    return { expiredCount: expired.length, error: null };
  } catch (e: any) {
    return { expiredCount: 0, error: e.message };
  }
}

// ============ CONSENT ANALYTICS ============

export interface SponsorConsentAnalytics {
  totalProposals: number;
  accepted: number;
  refused: number;
  expired: number;
  removed: number;
  pending: number;
  acceptanceRate: number; // 0-100
  avgResponseTimeHours: number;
  topRefuseReasons: { reason: string; count: number }[];
  byItemType: { type: string; total: number; accepted: number; refused: number; rate: number }[];
}

/**
 * Get consent analytics for a specific ambassador/partner
 */
export async function getSponsorConsentAnalytics(ambassadorId: string): Promise<{ analytics: SponsorConsentAnalytics; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsor_proposals')
      .select('*')
      .eq('ambassador_id', ambassadorId)
      .in('status', ['active', 'owner_refused', 'consent_expired', 'owner_removed', 'approved_awaiting_consent']);

    if (error) return { analytics: emptyAnalytics(), error: error.message };
    if (!data || data.length === 0) return { analytics: emptyAnalytics(), error: null };

    const accepted = data.filter((d: any) => d.status === 'active').length;
    const refused = data.filter((d: any) => d.status === 'owner_refused').length;
    const expired = data.filter((d: any) => d.status === 'consent_expired').length;
    const removed = data.filter((d: any) => d.status === 'owner_removed').length;
    const pending = data.filter((d: any) => d.status === 'approved_awaiting_consent').length;
    const resolved = accepted + refused + expired + removed;
    const acceptanceRate = resolved > 0 ? Math.round((accepted / resolved) * 100) : 0;

    // Average response time (only for items with owner_responded_at)
    const responded = data.filter((d: any) => d.owner_responded_at && d.updated_at);
    let avgResponseTimeHours = 0;
    if (responded.length > 0) {
      const totalMs = responded.reduce((sum: number, d: any) => {
        const created = new Date(d.updated_at).getTime();
        const respondedAt = new Date(d.owner_responded_at).getTime();
        return sum + Math.max(0, respondedAt - created);
      }, 0);
      avgResponseTimeHours = Math.round(totalMs / responded.length / (60 * 60 * 1000) * 10) / 10;
    }

    // Top refuse reasons
    const refuseReasons: Record<string, number> = {};
    data.filter((d: any) => d.owner_response_reason && (d.status === 'owner_refused' || d.status === 'owner_removed'))
      .forEach((d: any) => {
        const r = d.owner_response_reason.trim();
        if (r) refuseReasons[r] = (refuseReasons[r] || 0) + 1;
      });
    const topRefuseReasons = Object.entries(refuseReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // By item type
    const types = ['terrain', 'club', 'player', 'tournament'];
    const byItemType = types.map(type => {
      const items = data.filter((d: any) => d.item_type === type);
      const typeAccepted = items.filter((d: any) => d.status === 'active').length;
      const typeRefused = items.filter((d: any) => d.status === 'owner_refused' || d.status === 'consent_expired' || d.status === 'owner_removed').length;
      const typeTotal = items.length;
      const typeResolved = typeAccepted + typeRefused;
      return {
        type,
        total: typeTotal,
        accepted: typeAccepted,
        refused: typeRefused,
        rate: typeResolved > 0 ? Math.round((typeAccepted / typeResolved) * 100) : 0,
      };
    }).filter(t => t.total > 0);

    return {
      analytics: {
        totalProposals: data.length,
        accepted,
        refused,
        expired,
        removed,
        pending,
        acceptanceRate,
        avgResponseTimeHours,
        topRefuseReasons,
        byItemType,
      },
      error: null,
    };
  } catch (e: any) {
    return { analytics: emptyAnalytics(), error: e.message };
  }
}

function emptyAnalytics(): SponsorConsentAnalytics {
  return {
    totalProposals: 0, accepted: 0, refused: 0, expired: 0, removed: 0, pending: 0,
    acceptanceRate: 0, avgResponseTimeHours: 0, topRefuseReasons: [], byItemType: [],
  };
}
