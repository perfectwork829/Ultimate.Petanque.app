/**
 * Club Member Invitation Service (DB-synced)
 *
 * Manages club membership invitations via Supabase database.
 * Supports: invitation message from club, decline reason from player,
 * push notifications, and real-time status sync across devices.
 */
import { getSupabaseClient } from '@/template';

export interface ClubInvitation {
  id: string;
  clubId: string;
  clubName: string;
  clubLogo?: string;
  invitedPlayerId: string;
  invitedPlayerName: string;
  invitedUserId?: string;
  inviterUserId: string;
  inviterName: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  declineReason?: string;
  createdAt: string;
  updatedAt?: string;
}

function mapRow(row: any): ClubInvitation {
  return {
    id: row.id,
    clubId: row.club_id,
    clubName: row.club_name,
    clubLogo: row.club_logo || undefined,
    invitedPlayerId: row.invited_player_id,
    invitedPlayerName: row.invited_player_name,
    invitedUserId: row.invited_user_id || undefined,
    inviterUserId: row.inviter_user_id,
    inviterName: row.inviter_name,
    message: row.message || undefined,
    status: row.status || 'pending',
    declineReason: row.decline_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Send an invitation to a player to join a club.
 * Saves to DB and sends push notification if player has userId.
 */
export async function sendClubInvitation(params: {
  clubId: string;
  clubName: string;
  clubLogo?: string;
  playerId: string;
  playerName: string;
  playerUserId?: string;
  inviterUserId: string;
  inviterName: string;
  message?: string;
}): Promise<{ invitation: ClubInvitation | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('club_invitations')
      .insert({
        club_id: params.clubId,
        club_name: params.clubName,
        club_logo: params.clubLogo || null,
        invited_player_id: params.playerId,
        invited_player_name: params.playerName,
        invited_user_id: params.playerUserId || null,
        inviter_user_id: params.inviterUserId,
        inviter_name: params.inviterName,
        message: params.message || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint (already has pending invitation)
      if (error.code === '23505') {
        return { invitation: null, error: 'Ce joueur a deja une invitation en attente pour ce club.' };
      }
      throw error;
    }

    const invitation = mapRow(data);

    // Send push notification if player has a user account
    if (params.playerUserId) {
      try {
        const msgPreview = params.message ? ` — "${params.message.substring(0, 60)}"` : '';
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'club_invitation',
            payload: {
              targetUserId: params.playerUserId,
              title: `Invitation: ${params.clubName}`,
              body: `${params.inviterName} vous invite a rejoindre le club ${params.clubName}${msgPreview}`,
              data: {
                type: 'club_invitation',
                clubId: params.clubId,
                invitationId: invitation.id,
              },
            },
          },
        });
      } catch (pushError) {
        console.log('[ClubInvitation] Push notification failed:', pushError);
      }
    }

    return { invitation, error: null };
  } catch (e: any) {
    return { invitation: null, error: e.message || 'Failed to send invitation' };
  }
}

/**
 * Get all invitations visible to the current user (sent + received).
 */
export async function getStoredInvitations(): Promise<ClubInvitation[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('club_invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRow);
  } catch (e) {
    console.log('[ClubInvitation] Error loading invitations:', e);
    return [];
  }
}

/**
 * Get invitations for a specific club.
 */
export async function getClubInvitations(clubId: string): Promise<ClubInvitation[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRow);
  } catch (e) {
    console.log('[ClubInvitation] Error loading club invitations:', e);
    return [];
  }
}

/**
 * Accept an invitation. Updates status in DB.
 */
export async function updateInvitationStatus(
  invitationId: string,
  status: 'accepted' | 'declined',
  declineReason?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'declined' && declineReason) {
      updates.decline_reason = declineReason;
    }

    const { error } = await supabase
      .from('club_invitations')
      .update(updates)
      .eq('id', invitationId);

    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Remove/cancel an invitation (by inviter).
 */
export async function removeInvitation(invitationId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('club_invitations')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check if a player has already been invited to a club (pending).
 */
export async function hasBeenInvited(clubId: string, playerId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('club_invitations')
      .select('id')
      .eq('club_id', clubId)
      .eq('invited_player_id', playerId)
      .eq('status', 'pending')
      .limit(1);

    if (error) return false;
    return (data || []).length > 0;
  } catch {
    return false;
  }
}
