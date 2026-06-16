import { Platform } from 'react-native';
import * as Notifications from './nativeNotifications';
import { getSupabaseClient } from '@/template';

// ============================================
// TYPES
// ============================================

export interface EventNotification {
  id: string;
  eventId: string;
  recipientUserId: string;
  senderUserId?: string;
  type: 'witness_needed' | 'result_submitted' | 'attestation_received' | 'event_reminder' | 'participant_registered' | 'result_submitted_to_creator' | 'all_witnesses_attested';
  participantId?: string;
  title: string;
  message?: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
  // Joined
  eventTitle?: string;
  senderName?: string;
}

export interface EventReminderSettings {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  oneDayBefore: boolean;
  threeHoursBefore: boolean;
  oneHourBefore: boolean;
}

// ============================================
// LOCAL NOTIFICATION SCHEDULING (Reminders)
// ============================================

const scheduledEventReminders: Map<string, string[]> = new Map();

/** Schedule local event reminders */
export async function scheduleEventReminders(settings: EventReminderSettings): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const { eventId, eventTitle, startTime, oneDayBefore, threeHoursBefore, oneHourBefore } = settings;

  await cancelEventReminders(eventId);

  const notificationIds: string[] = [];
  const now = new Date();

  const schedule = async (triggerDate: Date, title: string, body: string, identifier: string): Promise<string | null> => {
    if (triggerDate <= now) return null;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { eventId, type: 'event_reminder' },
          sound: 'default',
          badge: 1,
          ...(Platform.OS === 'android' && { channelId: 'tournament-reminders' }),
        },
        trigger: {
          date: triggerDate,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
        },
        identifier,
      });
      return id;
    } catch {
      return null;
    }
  };

  if (oneDayBefore) {
    const d = new Date(startTime);
    d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
    const id = await schedule(d, '\u{1F3AF} Evenement demain !', `${eventTitle} commence demain. Preparez-vous !`, `event_${eventId}_1day`);
    if (id) notificationIds.push(id);
  }

  if (threeHoursBefore) {
    const d = new Date(startTime.getTime() - 3 * 60 * 60 * 1000);
    const id = await schedule(d, '\u26A1 Evenement dans 3h !', `${eventTitle} commence dans 3 heures.`, `event_${eventId}_3h`);
    if (id) notificationIds.push(id);
  }

  if (oneHourBefore) {
    const d = new Date(startTime.getTime() - 60 * 60 * 1000);
    const id = await schedule(d, '\u{1F525} Evenement dans 1h !', `${eventTitle} commence dans 1 heure !`, `event_${eventId}_1h`);
    if (id) notificationIds.push(id);
  }

  if (notificationIds.length > 0) {
    scheduledEventReminders.set(eventId, notificationIds);
  }

  return notificationIds;
}

/** Cancel all local reminders for an event */
export async function cancelEventReminders(eventId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const storedIds = scheduledEventReminders.get(eventId);
    if (storedIds) {
      for (const id of storedIds) {
        try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* */ }
      }
      scheduledEventReminders.delete(eventId);
    }
    const identifiers = [`event_${eventId}_1day`, `event_${eventId}_3h`, `event_${eventId}_1h`];
    for (const identifier of identifiers) {
      try { await Notifications.cancelScheduledNotificationAsync(identifier); } catch { /* */ }
    }
  } catch { /* */ }
}

/** Check which reminders are currently scheduled for an event */
export async function getScheduledEventReminders(eventId: string): Promise<{ oneDayBefore: boolean; threeHoursBefore: boolean; oneHourBefore: boolean }> {
  if (Platform.OS === 'web') return { oneDayBefore: false, threeHoursBefore: false, oneHourBefore: false };
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const eventIds = new Set(all.map((n: any) => n.identifier));
    return {
      oneDayBefore: eventIds.has(`event_${eventId}_1day`),
      threeHoursBefore: eventIds.has(`event_${eventId}_3h`),
      oneHourBefore: eventIds.has(`event_${eventId}_1h`),
    };
  } catch {
    return { oneDayBefore: false, threeHoursBefore: false, oneHourBefore: false };
  }
}

// ============================================
// DATABASE NOTIFICATIONS (Cross-user)
// ============================================

/** Send witness-needed notifications to all event participants (except the one who completed) */
export async function notifyWitnessesForResult(
  eventId: string,
  participantId: string,
  participantName: string,
  eventTitle: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    // Get all other accepted/completed participants who can be witnesses
    const { data: participants } = await supabase
      .from('sponsored_event_participants')
      .select('user_id')
      .eq('event_id', eventId)
      .in('status', ['accepted', 'completed'])
      .neq('user_id', userData.user.id);

    if (!participants || participants.length === 0) return;

    const notifications = participants.map((p: any) => ({
      event_id: eventId,
      recipient_user_id: p.user_id,
      sender_user_id: userData.user.id,
      type: 'witness_needed',
      participant_id: participantId,
      title: `\u{1F441} Attestation requise`,
      message: `${participantName} a termine son defi pour "${eventTitle}". Votre attestation est necessaire.`,
      action_url: `/sponsored-event/${eventId}`,
    }));

    await supabase.from('event_notifications').insert(notifications);
  } catch { /* fire and forget */ }
}

/** Notify participant that a witness has attested their result */
export async function notifyAttestationReceived(
  eventId: string,
  participantUserId: string,
  participantId: string,
  witnessName: string,
  eventTitle: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    await supabase.from('event_notifications').insert({
      event_id: eventId,
      recipient_user_id: participantUserId,
      sender_user_id: userData.user.id,
      type: 'attestation_received',
      participant_id: participantId,
      title: '\u2705 Attestation recue',
      message: `${witnessName} a atteste votre resultat pour "${eventTitle}".`,
      action_url: `/sponsored-event/${eventId}`,
    });
  } catch { /* fire and forget */ }
}

/** Get unread event notifications for current user */
export async function getMyEventNotifications(): Promise<{ notifications: EventNotification[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { notifications: [], error: null };

    const { data, error } = await supabase
      .from('event_notifications')
      .select('*, sponsored_events:event_id(title), sender_profiles:sender_user_id(username)')
      .eq('recipient_user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return { notifications: [], error: error.message };

    const notifications: EventNotification[] = (data || []).map((n: any) => ({
      id: n.id,
      eventId: n.event_id,
      recipientUserId: n.recipient_user_id,
      senderUserId: n.sender_user_id,
      type: n.type,
      participantId: n.participant_id,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      actionUrl: n.action_url,
      createdAt: n.created_at,
      eventTitle: n.sponsored_events?.title,
      senderName: n.sender_profiles?.username,
    }));

    return { notifications, error: null };
  } catch (e: any) {
    return { notifications: [], error: e.message };
  }
}

/** Get unread count */
export async function getUnreadEventNotificationCount(): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return 0;

    const { count, error } = await supabase
      .from('event_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userData.user.id)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/** Get pending witness attestation requests for the current user */
export async function getPendingWitnessRequests(): Promise<{ requests: EventNotification[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { requests: [], error: null };

    const { data, error } = await supabase
      .from('event_notifications')
      .select('*, sponsored_events:event_id(title)')
      .eq('recipient_user_id', userData.user.id)
      .eq('type', 'witness_needed')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return { requests: [], error: error.message };

    const requests: EventNotification[] = (data || []).map((n: any) => ({
      id: n.id,
      eventId: n.event_id,
      recipientUserId: n.recipient_user_id,
      senderUserId: n.sender_user_id,
      type: n.type,
      participantId: n.participant_id,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      actionUrl: n.action_url,
      createdAt: n.created_at,
      eventTitle: n.sponsored_events?.title,
    }));

    return { requests, error: null };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

// ============================================
// CREATOR NOTIFICATIONS
// ============================================

/** Notify event creator that a participant has registered */
export async function notifyCreatorParticipantRegistered(
  eventId: string,
  creatorUserId: string,
  participantName: string,
  eventTitle: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;
    // Don't notify the creator if they registered for their own event
    if (userData.user.id === creatorUserId) return;

    await supabase.from('event_notifications').insert({
      event_id: eventId,
      recipient_user_id: creatorUserId,
      sender_user_id: userData.user.id,
      type: 'participant_registered',
      title: '\u{1F3AF} Nouveau participant',
      message: `${participantName} s'est inscrit a votre evenement "${eventTitle}".`,
      action_url: `/sponsored-event/${eventId}`,
    });
  } catch { /* fire and forget */ }
}

/** Notify event creator that a participant has submitted their result */
export async function notifyCreatorResultSubmitted(
  eventId: string,
  creatorUserId: string,
  participantName: string,
  scoreValue: number,
  eventTitle: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;
    if (userData.user.id === creatorUserId) return;

    await supabase.from('event_notifications').insert({
      event_id: eventId,
      recipient_user_id: creatorUserId,
      sender_user_id: userData.user.id,
      type: 'result_submitted_to_creator',
      title: '\u{1F4CA} Resultat soumis',
      message: `${participantName} a termine son defi (score: ${scoreValue}%) pour "${eventTitle}".`,
      action_url: `/sponsored-event/${eventId}`,
    });
  } catch { /* fire and forget */ }
}

/** Notify event creator that all witnesses have attested a participant's result */
export async function notifyCreatorAllWitnessesAttested(
  eventId: string,
  creatorUserId: string,
  participantName: string,
  witnessCount: number,
  eventTitle: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    await supabase.from('event_notifications').insert({
      event_id: eventId,
      recipient_user_id: creatorUserId,
      sender_user_id: userData.user.id,
      type: 'all_witnesses_attested',
      title: '\u2705 Resultat valide',
      message: `Le resultat de ${participantName} a ete atteste par ${witnessCount} temoin(s) pour "${eventTitle}". Resultat pret a publier.`,
      action_url: `/sponsored-event/${eventId}`,
    });
  } catch { /* fire and forget */ }
}

/** Mark notification as read */
export async function markEventNotificationRead(notificationId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('event_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  } catch { /* silent */ }
}

/** Mark all notifications as read for an event */
export async function markAllEventNotificationsRead(eventId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;
    await supabase
      .from('event_notifications')
      .update({ is_read: true })
      .eq('event_id', eventId)
      .eq('recipient_user_id', userData.user.id);
  } catch { /* silent */ }
}

/** Delete all read notifications for current user */
export async function clearReadEventNotifications(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;
    await supabase
      .from('event_notifications')
      .delete()
      .eq('recipient_user_id', userData.user.id)
      .eq('is_read', true);
  } catch { /* silent */ }
}
