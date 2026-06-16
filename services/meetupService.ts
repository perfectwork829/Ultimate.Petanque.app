import { getSupabaseClient } from '@/template';
import { Platform } from 'react-native';
import * as Notifications from './nativeNotifications';

export interface Meetup {
  id: string;
  creator_id: string;
  terrain_id: string;
  title: string;
  date: string;
  max_participants: number;
  status: 'active' | 'cancelled' | 'completed';
  share_code: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  terrain_name?: string;
  terrain_city?: string;
  terrain_type?: string;
  creator_name?: string;
  creator_email?: string;
  responses?: MeetupResponse[];
}

export interface MeetupResponse {
  id: string;
  meetup_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  responded_at?: string;
  created_at: string;
  // Joined data
  user_name?: string;
  user_email?: string;
}

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RDV-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new meetup
 */
export async function createMeetup(data: {
  terrainId: string;
  title: string;
  date: string;
  endTime?: string;
  maxParticipants?: number;
  notes?: string;
}): Promise<{ meetup: Meetup | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { meetup: null, error: 'Non authentifie' };

    const shareCode = generateShareCode();

    const { data: meetup, error } = await supabase
      .from('terrain_meetups')
      .insert({
        creator_id: userData.user.id,
        terrain_id: data.terrainId,
        title: data.title,
        date: data.date,
        end_time: data.endTime || null,
        max_participants: data.maxParticipants || 8,
        share_code: shareCode,
        notes: data.notes || null,
      })
      .select('*')
      .single();

    if (error) return { meetup: null, error: error.message };

    // Auto-accept for creator
    if (meetup) {
      await supabase
        .from('terrain_meetup_responses')
        .upsert({
          meetup_id: meetup.id,
          user_id: userData.user.id,
          status: 'accepted',
          responded_at: new Date().toISOString(),
        }, { onConflict: 'meetup_id,user_id' });
    }

    return { meetup, error: null };
  } catch (e: any) {
    return { meetup: null, error: e.message };
  }
}

/**
 * Get meetups created by the current user
 */
export async function getMyMeetups(): Promise<{ meetups: Meetup[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { meetups: [], error: 'Non authentifie' };

    const { data, error } = await supabase
      .from('terrain_meetups')
      .select('*')
      .eq('creator_id', userData.user.id)
      .order('date', { ascending: true });

    if (error) return { meetups: [], error: error.message };
    return { meetups: data || [], error: null };
  } catch (e: any) {
    return { meetups: [], error: e.message };
  }
}

/**
 * Get meetups for a specific terrain
 */
export async function getMeetupsForTerrain(terrainId: string): Promise<{ meetups: Meetup[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // Auto-archive past meetups (end_time passed or date + 3h if no end_time)
    await supabase
      .from('terrain_meetups')
      .update({ status: 'completed', updated_at: now })
      .eq('terrain_id', terrainId)
      .eq('status', 'active')
      .lt('end_time', now)
      .not('end_time', 'is', null);

    const { data, error } = await supabase
      .from('terrain_meetups')
      .select('*')
      .eq('terrain_id', terrainId)
      .eq('status', 'active')
      .gte('date', new Date(Date.now() - 3 * 3600000).toISOString())
      .order('date', { ascending: true });

    if (error) return { meetups: [], error: error.message };
    return { meetups: data || [], error: null };
  } catch (e: any) {
    return { meetups: [], error: e.message };
  }
}

/**
 * Get meetups the user has been invited to (responded to)
 */
export async function getInvitedMeetups(): Promise<{ meetups: Meetup[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { meetups: [], error: 'Non authentifie' };

    const { data: responses, error: respError } = await supabase
      .from('terrain_meetup_responses')
      .select('meetup_id')
      .eq('user_id', userData.user.id);

    if (respError) return { meetups: [], error: respError.message };
    if (!responses || responses.length === 0) return { meetups: [], error: null };

    const meetupIds = responses.map(r => r.meetup_id);

    const { data, error } = await supabase
      .from('terrain_meetups')
      .select('*')
      .in('id', meetupIds)
      .eq('status', 'active')
      .order('date', { ascending: true });

    if (error) return { meetups: [], error: error.message };
    return { meetups: data || [], error: null };
  } catch (e: any) {
    return { meetups: [], error: e.message };
  }
}

/**
 * Find a meetup by share code
 */
export async function findMeetupByCode(code: string): Promise<{ meetup: Meetup | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_meetups')
      .select('*')
      .eq('share_code', code.toUpperCase().trim())
      .eq('status', 'active')
      .single();

    if (error) return { meetup: null, error: 'Code introuvable' };
    return { meetup: data, error: null };
  } catch (e: any) {
    return { meetup: null, error: e.message };
  }
}

/**
 * Get responses for a meetup
 */
export async function getMeetupResponses(meetupId: string): Promise<{ responses: MeetupResponse[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_meetup_responses')
      .select(`
        *,
        user_profiles:user_id (username, email)
      `)
      .eq('meetup_id', meetupId);

    if (error) return { responses: [], error: error.message };

    const mapped = (data || []).map((r: any) => ({
      ...r,
      user_name: r.user_profiles?.username || r.user_profiles?.email || 'Utilisateur',
      user_email: r.user_profiles?.email,
    }));

    return { responses: mapped, error: null };
  } catch (e: any) {
    return { responses: [], error: e.message };
  }
}

/**
 * Respond to a meetup (accept/decline)
 */
export async function respondToMeetup(meetupId: string, status: 'accepted' | 'declined'): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    const { error } = await supabase
      .from('terrain_meetup_responses')
      .upsert({
        meetup_id: meetupId,
        user_id: userData.user.id,
        status,
        responded_at: new Date().toISOString(),
      }, { onConflict: 'meetup_id,user_id' });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Cancel a meetup (creator only)
 */
export async function cancelMeetup(meetupId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('terrain_meetups')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', meetupId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Delete a meetup
 */
export async function deleteMeetup(meetupId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('terrain_meetups')
      .delete()
      .eq('id', meetupId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get user's current response status for a meetup
 */
export async function getMyResponseStatus(meetupId: string): Promise<'accepted' | 'declined' | 'pending' | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return null;

    const { data, error } = await supabase
      .from('terrain_meetup_responses')
      .select('status')
      .eq('meetup_id', meetupId)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return data.status as any;
  } catch {
    return null;
  }
}

export interface MeetupReminderSettings {
  oneDayBefore: boolean;
  threeHoursBefore: boolean;
  oneHourBefore: boolean;
}

/**
 * Schedule a local reminder notification for a meetup (legacy - single 1h reminder)
 */
export async function scheduleMeetupReminder(meetup: Meetup, terrainName: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const meetupDate = new Date(meetup.date);
    const reminderDate = new Date(meetupDate);
    reminderDate.setHours(reminderDate.getHours() - 1);

    if (reminderDate <= new Date()) return null;

    const formattedTime = meetupDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '\u{1F3AF} RDV Petanque dans 1h !',
        body: `${meetup.title} a ${terrainName} - ${formattedTime}`,
        data: { meetupId: meetup.id, type: 'meetup_reminder' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'meetup-reminders' }),
      },
      trigger: {
        date: reminderDate,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
      identifier: `meetup_${meetup.id}_reminder`,
    });

    return id;
  } catch (e) {
    console.log('Error scheduling meetup reminder:', e);
    return null;
  }
}

/**
 * Cancel meetup reminder (legacy single reminder)
 */
export async function cancelMeetupReminder(meetupId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(`meetup_${meetupId}_reminder`);
  } catch {
    // Ignore if not found
  }
}

/**
 * Schedule configurable meetup reminder notifications
 */
export async function scheduleMeetupNotifications(
  meetup: Meetup,
  terrainName: string,
  settings: MeetupReminderSettings
): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  await cancelAllMeetupReminders(meetup.id);

  const notificationIds: string[] = [];
  const now = new Date();
  const meetupDate = new Date(meetup.date);
  const formattedTime = meetupDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = meetupDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const scheduleOne = async (triggerDate: Date, title: string, body: string, identifier: string): Promise<string | null> => {
    if (triggerDate <= now) return null;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { meetupId: meetup.id, type: 'meetup_reminder' },
          sound: 'default',
          badge: 1,
          ...(Platform.OS === 'android' && { channelId: 'meetup-reminders' }),
        },
        trigger: {
          date: triggerDate,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
        },
        identifier,
      });
      return id;
    } catch (e) {
      console.log(`Error scheduling meetup notification ${identifier}:`, e);
      return null;
    }
  };

  if (settings.oneDayBefore) {
    const d = new Date(meetupDate);
    d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
    const id = await scheduleOne(d, '\u{1F3AF} RDV Petanque demain !', `${meetup.title} a ${terrainName} - ${formattedDate} a ${formattedTime}`, `meetup_${meetup.id}_1day`);
    if (id) notificationIds.push(id);
  }

  if (settings.threeHoursBefore) {
    const d = new Date(meetupDate);
    d.setHours(d.getHours() - 3);
    const id = await scheduleOne(d, '\u{1F3AF} RDV Petanque dans 3h !', `${meetup.title} a ${terrainName} - ${formattedTime}`, `meetup_${meetup.id}_3hours`);
    if (id) notificationIds.push(id);
  }

  if (settings.oneHourBefore) {
    const d = new Date(meetupDate);
    d.setHours(d.getHours() - 1);
    const id = await scheduleOne(d, '\u26A1 RDV Petanque dans 1h !', `${meetup.title} a ${terrainName} - ${formattedTime}. Preparez-vous !`, `meetup_${meetup.id}_1hour`);
    if (id) notificationIds.push(id);
  }

  return notificationIds;
}

/**
 * Cancel all meetup reminders (all variants)
 */
export async function cancelAllMeetupReminders(meetupId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const identifiers = [
    `meetup_${meetupId}_reminder`,
    `meetup_${meetupId}_1day`,
    `meetup_${meetupId}_3hours`,
    `meetup_${meetupId}_1hour`,
  ];
  for (const id of identifiers) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Ignore if not found
    }
  }
}

/**
 * Invite users directly to a meetup by creating pending responses
 */
export async function inviteUsersToMeetup(
  meetupId: string,
  userIds: string[]
): Promise<{ invited: number; error: string | null }> {
  try {
    if (userIds.length === 0) return { invited: 0, error: null };

    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('terrain_meetup_responses')
      .select('user_id')
      .eq('meetup_id', meetupId)
      .in('user_id', userIds);

    const existingIds = new Set((existing || []).map((r: any) => r.user_id));
    const newUserIds = userIds.filter(uid => !existingIds.has(uid));

    if (newUserIds.length === 0) return { invited: 0, error: null };

    const rows = newUserIds.map(uid => ({
      meetup_id: meetupId,
      user_id: uid,
      status: 'pending',
    }));

    const { error } = await supabase
      .from('terrain_meetup_responses')
      .insert(rows);

    if (error) return { invited: 0, error: error.message };

    // Trigger server-side push for each invited user (fire-and-forget)
    const _pushModule = await import('./pushTokenService').catch(() => null);
    if (_pushModule) {
      const meetupData = (await supabase.from('terrain_meetups').select('title, date').eq('id', meetupId).maybeSingle()).data;
      const inviterProfile = (await supabase.from('user_profiles').select('username').eq('id', (await supabase.auth.getUser()).data?.user?.id || '').maybeSingle()).data;
      const inviterName = inviterProfile?.username || 'Un joueur';
      for (const uid of newUserIds) {
        _pushModule.triggerServerPush('meetup_invitation', {
          meetupId,
          meetupTitle: meetupData?.title || 'RDV Petanque',
          invitedUserId: uid,
          inviterName,
          meetupDate: meetupData?.date,
        }).catch(() => {});
      }
    }

    return { invited: newUserIds.length, error: null };
  } catch (e: any) {
    return { invited: 0, error: e.message };
  }
}

/**
 * Get invitable users: public players + players shared with me
 */
export async function getInvitableUsers(): Promise<{ users: InvitableUser[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { users: [], error: null };

    const myId = userData.user.id;
    const usersMap = new Map<string, InvitableUser>();

    const { data: publicPlayers } = await supabase
      .from('players')
      .select('user_id, name, club, role, avatar')
      .eq('is_public', true)
      .neq('user_id', myId);

    (publicPlayers || []).forEach((p: any) => {
      if (p.user_id && !usersMap.has(p.user_id)) {
        usersMap.set(p.user_id, {
          userId: p.user_id,
          name: p.name,
          club: p.club || '',
          role: p.role || '',
          avatar: p.avatar || '',
          source: 'public',
        });
      }
    });

    const { data: sharedItems } = await supabase
      .from('shared_items')
      .select('owner_id, item_type')
      .eq('shared_with_id', myId)
      .eq('item_type', 'player');

    if (sharedItems && sharedItems.length > 0) {
      const ownerIds = [...new Set(sharedItems.map((s: any) => s.owner_id).filter((id: string) => id !== myId && !usersMap.has(id)))];
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, email')
          .in('id', ownerIds);

        (profiles || []).forEach((p: any) => {
          if (!usersMap.has(p.id)) {
            usersMap.set(p.id, {
              userId: p.id,
              name: p.username || p.email || 'Utilisateur',
              club: '',
              role: '',
              avatar: '',
              source: 'shared',
            });
          }
        });
      }
    }

    const { data: itemsSharedWithMe } = await supabase
      .from('shared_items')
      .select('owner_id')
      .eq('shared_with_id', myId)
      .neq('item_type', 'player');

    if (itemsSharedWithMe && itemsSharedWithMe.length > 0) {
      const moreOwnerIds = [...new Set(itemsSharedWithMe.map((s: any) => s.owner_id).filter((id: string) => id !== myId && !usersMap.has(id)))];
      if (moreOwnerIds.length > 0) {
        const { data: moreProfiles } = await supabase
          .from('user_profiles')
          .select('id, username, email')
          .in('id', moreOwnerIds);

        (moreProfiles || []).forEach((p: any) => {
          if (!usersMap.has(p.id)) {
            usersMap.set(p.id, {
              userId: p.id,
              name: p.username || p.email || 'Utilisateur',
              club: '',
              role: '',
              avatar: '',
              source: 'shared',
            });
          }
        });
      }
    }

    return { users: Array.from(usersMap.values()), error: null };
  } catch (e: any) {
    return { users: [], error: e.message };
  }
}

/**
 * Get count of pending meetup invitations for current user
 */
export async function getPendingInvitationsCount(): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return 0;

    const { count, error } = await supabase
      .from('terrain_meetup_responses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userData.user.id)
      .eq('status', 'pending');

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Get all pending invitations for the current user with full meetup details
 */
export async function getPendingInvitations(): Promise<{ invitations: PendingInvitation[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { invitations: [], error: null };

    const { data: responses, error: respError } = await supabase
      .from('terrain_meetup_responses')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('status', 'pending');

    if (respError) return { invitations: [], error: respError.message };
    if (!responses || responses.length === 0) return { invitations: [], error: null };

    const meetupIds = responses.map(r => r.meetup_id);

    const { data: meetups, error: meetupError } = await supabase
      .from('terrain_meetups')
      .select('*')
      .in('id', meetupIds)
      .eq('status', 'active')
      .order('date', { ascending: true });

    if (meetupError) return { invitations: [], error: meetupError.message };

    const creatorIds = [...new Set((meetups || []).map((m: any) => m.creator_id))];
    let creatorsMap: Record<string, { username: string; email: string }> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, email')
        .in('id', creatorIds);
      (profiles || []).forEach((p: any) => {
        creatorsMap[p.id] = { username: p.username || '', email: p.email || '' };
      });
    }

    const terrainIds = [...new Set((meetups || []).map((m: any) => m.terrain_id))];
    let terrainsMap: Record<string, { name: string; city: string }> = {};
    if (terrainIds.length > 0) {
      const { data: terrains } = await supabase
        .from('terrains')
        .select('id, name, city')
        .in('id', terrainIds);
      (terrains || []).forEach((t: any) => {
        terrainsMap[t.id] = { name: t.name, city: t.city };
      });
    }

    const invitations: PendingInvitation[] = [];
    for (const m of (meetups || [])) {
      const resp = responses.find(r => r.meetup_id === m.id);
      if (!resp) continue;
      const { count } = await supabase
        .from('terrain_meetup_responses')
        .select('id', { count: 'exact', head: true })
        .eq('meetup_id', m.id)
        .eq('status', 'accepted');

      const creator = creatorsMap[m.creator_id];
      const terrain = terrainsMap[m.terrain_id];

      invitations.push({
        responseId: resp.id,
        meetupId: m.id,
        title: m.title,
        date: m.date,
        maxParticipants: m.max_participants,
        acceptedCount: count || 0,
        shareCode: m.share_code,
        notes: m.notes,
        creatorName: creator?.username || creator?.email || '',
        terrainName: terrain?.name || '',
        terrainCity: terrain?.city || '',
      });
    }

    return { invitations, error: null };
  } catch (e: any) {
    return { invitations: [], error: e.message };
  }
}

export interface PendingInvitation {
  responseId: string;
  meetupId: string;
  title: string;
  date: string;
  maxParticipants: number;
  acceptedCount: number;
  shareCode: string;
  notes?: string;
  creatorName: string;
  terrainName: string;
  terrainCity: string;
}

export interface InvitableUser {
  userId: string;
  name: string;
  club: string;
  role: string;
  avatar: string;
  source: 'public' | 'shared';
}

/**
 * Get active meetups created by the current user (for invitation picker)
 */
export async function getMyActiveMeetups(): Promise<{ meetups: Meetup[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { meetups: [], error: null };

    const now = new Date().toISOString();

    // Auto-archive past meetups owned by current user
    await supabase
      .from('terrain_meetups')
      .update({ status: 'completed', updated_at: now })
      .eq('creator_id', userData.user.id)
      .eq('status', 'active')
      .lt('end_time', now)
      .not('end_time', 'is', null);

    const { data, error } = await supabase
      .from('terrain_meetups')
      .select('*')
      .eq('creator_id', userData.user.id)
      .eq('status', 'active')
      .gte('date', new Date(Date.now() - 3 * 3600000).toISOString())
      .order('date', { ascending: true });

    if (error) return { meetups: [], error: error.message };
    return { meetups: data || [], error: null };
  } catch (e: any) {
    return { meetups: [], error: e.message };
  }
}

/**
 * Invite a single user to a meetup (convenience wrapper)
 */
export async function inviteSingleUserToMeetup(
  meetupId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { invited, error } = await inviteUsersToMeetup(meetupId, [userId]);
  if (error) return { error };
  if (invited === 0) return { error: 'already_participant' };
  return { error: null };
}
