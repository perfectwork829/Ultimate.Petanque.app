/**
 * Team Invitation Service
 * Handles tournament team-up invitations: invite partners for Doublette (2) or Triplette (3).
 * Once all partners accept, the team is marked as "complete" and a social feed event is generated.
 */
import { getSupabaseClient } from '@/template';

// ============================================
// Types
// ============================================

export interface TeamInvitation {
  id: string;
  tournamentId: string;
  inviterUserId: string;
  inviteeUserId: string;
  inviterName: string;
  inviteeName: string;
  tournamentName: string;
  format: string;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt: string | null;
  createdAt: string;
}

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  creatorUserId: string;
  memberUserIds: string[];
  memberNames: string[];
  format: string;
  status: 'forming' | 'complete';
  completedAt: string | null;
  createdAt: string;
}

// Format → required team size (including creator)
export function getTeamSize(format: string): number {
  const f = (format || '').trim().toLowerCase();
  if (f === 'tête-à-tête' || f === 'tete-a-tete' || f === 'singles') return 1;
  if (f === 'doublette' || f === 'doubles') return 2;
  if (f === 'triplette' || f === 'triples') return 3;
  return 2;
}

// ============================================
// Invitation CRUD
// ============================================

/**
 * Send a team-up invitation to another user for a specific tournament.
 */
export async function sendTeamInvitation(params: {
  tournamentId: string;
  inviteeUserId: string;
  inviterName: string;
  inviteeName: string;
  tournamentName: string;
  format: string;
}): Promise<{ invitation: TeamInvitation | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { invitation: null, error: 'Not authenticated' };

    // Check if invitation already exists
    const { data: existing } = await supabase
      .from('team_invitations')
      .select('id, status')
      .eq('tournament_id', params.tournamentId)
      .eq('inviter_user_id', user.id)
      .eq('invitee_user_id', params.inviteeUserId)
      .maybeSingle();

    if (existing && existing.status === 'pending') {
      return { invitation: null, error: 'Invitation already sent' };
    }

    // Check team size limit
    const teamSize = getTeamSize(params.format);
    const { data: acceptedInvites } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('tournament_id', params.tournamentId)
      .eq('inviter_user_id', user.id)
      .eq('status', 'accepted');

    if ((acceptedInvites?.length || 0) >= teamSize - 1) {
      return { invitation: null, error: 'Team is already full' };
    }

    const { data, error } = await supabase
      .from('team_invitations')
      .upsert({
        tournament_id: params.tournamentId,
        inviter_user_id: user.id,
        invitee_user_id: params.inviteeUserId,
        inviter_name: params.inviterName,
        invitee_name: params.inviteeName,
        tournament_name: params.tournamentName,
        format: params.format,
        status: 'pending',
        responded_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tournament_id,inviter_user_id,invitee_user_id' })
      .select()
      .single();

    if (error) return { invitation: null, error: error.message };

    // Send push notification to invitee
    _sendTeamInvitePush(user.id, params.inviteeUserId, params.inviterName, params.tournamentName, params.format).catch(() => {});

    return { invitation: mapInvitation(data), error: null };
  } catch (e: any) {
    return { invitation: null, error: e.message || 'Failed to send invitation' };
  }
}

/**
 * Respond to a team-up invitation (accept or decline).
 */
export async function respondToTeamInvitation(
  invitationId: string,
  response: 'accepted' | 'declined'
): Promise<{ error: string | null; teamComplete?: boolean }> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (fetchError || !invitation) return { error: 'Invitation not found' };

    const { error } = await supabase
      .from('team_invitations')
      .update({ status: response, responded_at: now, updated_at: now })
      .eq('id', invitationId);

    if (error) return { error: error.message };

    // Send push notification to inviter about the response
    _sendTeamResponsePush(
      invitation.invitee_user_id,
      invitation.inviter_user_id,
      invitation.invitee_name,
      invitation.tournament_name,
      response
    ).catch(() => {});

    // If accepted, check if team is now complete
    if (response === 'accepted') {
      const teamSize = getTeamSize(invitation.format);
      const { data: allAccepted } = await supabase
        .from('team_invitations')
        .select('invitee_user_id, invitee_name')
        .eq('tournament_id', invitation.tournament_id)
        .eq('inviter_user_id', invitation.inviter_user_id)
        .eq('status', 'accepted');

      const acceptedCount = (allAccepted?.length || 0) + 1; // +1 for creator

      if (acceptedCount >= teamSize) {
        // Team is complete! Create/update tournament_teams record
        const memberIds = [invitation.inviter_user_id, ...(allAccepted || []).map((a: any) => a.invitee_user_id)];
        const memberNames = [invitation.inviter_name, ...(allAccepted || []).map((a: any) => a.invitee_name)];

        await supabase
          .from('tournament_teams')
          .upsert({
            tournament_id: invitation.tournament_id,
            creator_user_id: invitation.inviter_user_id,
            member_user_ids: memberIds,
            member_names: memberNames,
            format: invitation.format,
            status: 'complete',
            completed_at: now,
            updated_at: now,
          }, { onConflict: 'tournament_id,creator_user_id' });

        return { error: null, teamComplete: true };
      }
    }

    return { error: null, teamComplete: false };
  } catch (e: any) {
    return { error: e.message || 'Failed to respond' };
  }
}

/**
 * Fetch invitations sent by the current user for a tournament.
 */
export async function getMyTeamInvitations(tournamentId: string): Promise<{ invitations: TeamInvitation[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    if (error) return { invitations: [], error: error.message };
    return { invitations: (data || []).map(mapInvitation), error: null };
  } catch (e: any) {
    return { invitations: [], error: e.message };
  }
}

/**
 * Fetch pending invitations received by the current user.
 */
export async function getPendingTeamInvitations(): Promise<{ invitations: TeamInvitation[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { invitations: [], error: null };

    const { data, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invitee_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return { invitations: [], error: error.message };
    return { invitations: (data || []).map(mapInvitation), error: null };
  } catch (e: any) {
    return { invitations: [], error: e.message };
  }
}

/**
 * Get the current user's team for a tournament (if any).
 */
export async function getMyTournamentTeam(tournamentId: string): Promise<{ team: TournamentTeam | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { team: null, error: null };

    // Check as creator
    const { data: creatorTeam } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('creator_user_id', user.id)
      .maybeSingle();

    if (creatorTeam) return { team: mapTeam(creatorTeam), error: null };

    // Check as member
    const { data: memberTeams } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('tournament_id', tournamentId)
      .contains('member_user_ids', [user.id]);

    if (memberTeams && memberTeams.length > 0) {
      return { team: mapTeam(memberTeams[0]), error: null };
    }

    return { team: null, error: null };
  } catch (e: any) {
    return { team: null, error: e.message };
  }
}

/**
 * Fetch recently completed teams for social feed.
 */
export async function getRecentlyCompletedTeams(limit: number = 10): Promise<{ teams: TournamentTeam[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('status', 'complete')
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) return { teams: [], error: error.message };
    return { teams: (data || []).map(mapTeam), error: null };
  } catch (e: any) {
    return { teams: [], error: e.message };
  }
}

/**
 * Get all teams the current user is part of (as creator or member).
 */
export async function getMyTeams(): Promise<{ teams: TournamentTeam[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { teams: [], error: null };

    // Fetch as creator
    const { data: creatorTeams } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('creator_user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch as member
    const { data: memberTeams } = await supabase
      .from('tournament_teams')
      .select('*')
      .contains('member_user_ids', [user.id])
      .order('created_at', { ascending: false });

    // Merge and deduplicate
    const map = new Map<string, any>();
    (creatorTeams || []).forEach((t: any) => map.set(t.id, t));
    (memberTeams || []).forEach((t: any) => { if (!map.has(t.id)) map.set(t.id, t); });

    const teams = Array.from(map.values()).map(mapTeam);
    teams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { teams, error: null };
  } catch (e: any) {
    return { teams: [], error: e.message };
  }
}

/**
 * Dissolve a team (captain only). Removes the team record and notifies members.
 */
export async function dissolveTeam(teamId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Fetch the team
    const { data: team, error: fetchErr } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (fetchErr || !team) return { error: 'Team not found' };
    if (team.creator_user_id !== user.id) return { error: 'Only the captain can dissolve the team' };

    // Delete team
    const { error: delErr } = await supabase
      .from('tournament_teams')
      .delete()
      .eq('id', teamId);
    if (delErr) return { error: delErr.message };

    // Delete associated pending invitations
    await supabase
      .from('team_invitations')
      .delete()
      .eq('tournament_id', team.tournament_id)
      .eq('inviter_user_id', user.id)
      .eq('status', 'pending');

    // Resolve tournament name for push
    let tournamentName = '';
    try {
      const { data: tData } = await supabase.from('tournaments').select('name').eq('id', team.tournament_id).single();
      tournamentName = tData?.name || '';
    } catch { /* silent */ }

    // Get captain name
    let captainName = '';
    try {
      const { data: pData } = await supabase.from('user_profiles').select('username').eq('id', user.id).single();
      captainName = pData?.username || '';
    } catch { /* silent */ }

    // Notify all members (except captain)
    const memberIds = (team.member_user_ids || []).filter((uid: string) => uid !== user.id);
    for (const memberId of memberIds) {
      _sendTeamDissolutionPush(memberId, captainName, tournamentName, team.format).catch(() => {});
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to dissolve team' };
  }
}

/**
 * Remove a specific member from a team (captain only). Reverts team to 'forming' status.
 */
export async function removeMemberFromTeam(teamId: string, memberUserId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: team, error: fetchErr } = await supabase
      .from('tournament_teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (fetchErr || !team) return { error: 'Team not found' };
    if (team.creator_user_id !== user.id) return { error: 'Only the captain can remove members' };

    const currentIds: string[] = team.member_user_ids || [];
    const currentNames: string[] = team.member_names || [];
    const memberIndex = currentIds.indexOf(memberUserId);
    if (memberIndex === -1) return { error: 'Member not found in team' };

    const removedName = currentNames[memberIndex] || '';
    const updatedIds = currentIds.filter(uid => uid !== memberUserId);
    const updatedNames = currentNames.filter((_, i) => i !== memberIndex);

    const { error: updateErr } = await supabase
      .from('tournament_teams')
      .update({
        member_user_ids: updatedIds,
        member_names: updatedNames,
        status: 'forming',
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId);

    if (updateErr) return { error: updateErr.message };

    // Also decline any accepted invitation for this member
    await supabase
      .from('team_invitations')
      .update({ status: 'declined', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('tournament_id', team.tournament_id)
      .eq('inviter_user_id', user.id)
      .eq('invitee_user_id', memberUserId)
      .eq('status', 'accepted');

    // Resolve tournament name
    let tournamentName = '';
    try {
      const { data: tData } = await supabase.from('tournaments').select('name').eq('id', team.tournament_id).single();
      tournamentName = tData?.name || '';
    } catch { /* silent */ }

    let captainName = '';
    try {
      const { data: pData } = await supabase.from('user_profiles').select('username').eq('id', user.id).single();
      captainName = pData?.username || '';
    } catch { /* silent */ }

    // Notify removed member
    _sendTeamRemovalPush(memberUserId, captainName, tournamentName, removedName).catch(() => {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to remove member' };
  }
}

async function _sendTeamDissolutionPush(
  targetUserId: string,
  captainName: string,
  tournamentName: string,
  format: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'team_dissolved',
        payload: { targetUserId, captainName, tournamentName, format },
      },
    });
  } catch { /* silent */ }
}

async function _sendTeamRemovalPush(
  targetUserId: string,
  captainName: string,
  tournamentName: string,
  removedName: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'team_member_removed',
        payload: { targetUserId, captainName, tournamentName, removedName },
      },
    });
  } catch { /* silent */ }
}

/**
 * Check incomplete teams approaching deadline and send push reminders to captain.
 * Called on app mount with a delay. Uses AsyncStorage to avoid re-sending.
 */
export async function checkTeamDeadlineReminders(): Promise<void> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get teams where current user is captain and status is 'forming'
    const { data: teams } = await supabase
      .from('tournament_teams')
      .select('id, tournament_id, member_user_ids, format, status')
      .eq('creator_user_id', user.id)
      .eq('status', 'forming');

    if (!teams || teams.length === 0) return;

    const tournamentIds = teams.map(t => t.tournament_id);
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name, date')
      .in('id', tournamentIds);

    if (!tournaments || tournaments.length === 0) return;

    const tournamentMap = new Map<string, { name: string; date: string }>();
    tournaments.forEach((t: any) => tournamentMap.set(t.id, { name: t.name, date: t.date }));

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    for (const team of teams) {
      const tInfo = tournamentMap.get(team.tournament_id);
      if (!tInfo) continue;

      const tournamentDate = new Date(tInfo.date);
      const daysUntilTournament = Math.ceil((tournamentDate.getTime() - now.getTime()) / 86400000);

      // Notify if tournament is within 3 days and team is incomplete
      if (daysUntilTournament <= 0 || daysUntilTournament > 3) continue;

      // Check if already sent today for this team
      const storageKey = `team_deadline_${team.id}_${today}`;
      const alreadySent = await AsyncStorage.getItem(storageKey);
      if (alreadySent) continue;

      // Send push notification to self
      const teamSize = getTeamSize(team.format);
      const currentMembers = (team.member_user_ids || []).length;
      const slotsLeft = teamSize - currentMembers;

      await supabase.functions.invoke('send-push', {
        body: {
          type: 'team_deadline_reminder',
          payload: {
            targetUserId: user.id,
            tournamentName: tInfo.name,
            teamId: team.id,
            daysLeft: daysUntilTournament,
            slotsLeft,
            format: team.format,
          },
        },
      });

      await AsyncStorage.setItem(storageKey, '1');
    }
  } catch (e) {
    console.log('[TeamDeadline] Error checking deadline reminders:', e);
  }
}

/**
 * Get count of pending team invitations for the current user.
 */
export async function getPendingTeamInvitationCount(): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('invitee_user_id', user.id)
      .eq('status', 'pending');
    return data?.length || 0;
  } catch { return 0; }
}

// ============================================
// Push Notifications
// ============================================

async function _sendTeamInvitePush(
  inviterUserId: string,
  inviteeUserId: string,
  inviterName: string,
  tournamentName: string,
  format: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'team_invitation',
        payload: {
          targetUserId: inviteeUserId,
          inviterName,
          tournamentName,
          format,
        },
      },
    });
  } catch { /* silent */ }
}

async function _sendTeamResponsePush(
  responderUserId: string,
  inviterUserId: string,
  responderName: string,
  tournamentName: string,
  response: 'accepted' | 'declined'
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'team_invitation_response',
        payload: {
          targetUserId: inviterUserId,
          responderName,
          tournamentName,
          accepted: response === 'accepted',
        },
      },
    });
  } catch { /* silent */ }
}

// ============================================
// Mappers
// ============================================

function mapInvitation(row: any): TeamInvitation {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    inviterUserId: row.inviter_user_id,
    inviteeUserId: row.invitee_user_id,
    inviterName: row.inviter_name,
    inviteeName: row.invitee_name,
    tournamentName: row.tournament_name,
    format: row.format,
    status: row.status,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}

function mapTeam(row: any): TournamentTeam {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    creatorUserId: row.creator_user_id,
    memberUserIds: row.member_user_ids || [],
    memberNames: row.member_names || [],
    format: row.format,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
