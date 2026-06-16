/**
 * Meetup Chat Service
 * Handles sending, fetching, and deleting messages in meetup chat.
 */
import { getSupabaseClient } from '@/template';

export interface MeetupMessage {
  id: string;
  meetup_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  message: string;
  created_at: string;
}

export async function fetchMeetupMessages(meetupId: string): Promise<{ messages: MeetupMessage[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('meetup_messages')
      .select('*')
      .eq('meetup_id', meetupId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) return { messages: [], error: error.message };
    return { messages: data || [], error: null };
  } catch (e: any) {
    return { messages: [], error: e.message || 'Failed to fetch messages' };
  }
}

export async function sendMeetupMessage(
  meetupId: string,
  userId: string,
  userName: string,
  userAvatar: string | null,
  message: string
): Promise<{ message: MeetupMessage | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('meetup_messages')
      .insert({
        meetup_id: meetupId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        message: message.trim(),
      })
      .select()
      .single();

    if (error) return { message: null, error: error.message };
    return { message: data, error: null };
  } catch (e: any) {
    return { message: null, error: e.message || 'Failed to send message' };
  }
}

// ============================================
// TYPING INDICATOR
// ============================================
export interface TypingUser {
  user_id: string;
  user_name: string;
  updated_at: string;
}

const TYPING_STALE_MS = 6000; // Consider stale after 6 seconds

export async function setTypingStatus(
  meetupId: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('meetup_typing')
      .upsert(
        { meetup_id: meetupId, user_id: userId, user_name: userName, updated_at: new Date().toISOString() },
        { onConflict: 'meetup_id,user_id' }
      );
  } catch { /* silent */ }
}

export async function clearTypingStatus(
  meetupId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('meetup_typing')
      .delete()
      .eq('meetup_id', meetupId)
      .eq('user_id', userId);
  } catch { /* silent */ }
}

export async function fetchTypingUsers(
  meetupId: string,
  currentUserId: string
): Promise<TypingUser[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('meetup_typing')
      .select('user_id, user_name, updated_at')
      .eq('meetup_id', meetupId)
      .neq('user_id', currentUserId);

    if (error || !data) return [];
    // Filter out stale entries (older than TYPING_STALE_MS)
    const now = Date.now();
    return data.filter(t => now - new Date(t.updated_at).getTime() < TYPING_STALE_MS);
  } catch {
    return [];
  }
}

// ============================================
// READ RECEIPTS
// ============================================
export interface ReadReceipt {
  meetup_id: string;
  user_id: string;
  last_read_message_id: string;
  last_read_at: string;
}

export async function markMessagesAsRead(
  meetupId: string,
  userId: string,
  lastMessageId: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('meetup_read_receipts')
      .upsert(
        {
          meetup_id: meetupId,
          user_id: userId,
          last_read_message_id: lastMessageId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'meetup_id,user_id' }
      );
  } catch { /* silent */ }
}

export async function fetchReadReceipts(
  meetupId: string
): Promise<ReadReceipt[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('meetup_read_receipts')
      .select('meetup_id, user_id, last_read_message_id, last_read_at')
      .eq('meetup_id', meetupId);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ============================================
// MESSAGE REACTIONS
// ============================================
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
}

export interface ReactionGroup {
  type: string;
  count: number;
  userIds: string[];
}

export async function fetchMessageReactions(
  meetupId: string
): Promise<Map<string, ReactionGroup[]>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('meetup_message_reactions')
      .select('id, message_id, user_id, reaction_type')
      .eq('meetup_id', meetupId);

    if (error || !data) return new Map();

    const map = new Map<string, ReactionGroup[]>();
    data.forEach((r: any) => {
      if (!map.has(r.message_id)) map.set(r.message_id, []);
      const reactions = map.get(r.message_id)!;
      const existing = reactions.find(rx => rx.type === r.reaction_type);
      if (existing) {
        existing.count++;
        existing.userIds.push(r.user_id);
      } else {
        reactions.push({ type: r.reaction_type, count: 1, userIds: [r.user_id] });
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

export async function toggleReaction(
  meetupId: string,
  messageId: string,
  userId: string,
  reactionType: string
): Promise<{ added: boolean; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('meetup_message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (existing) {
      await supabase.from('meetup_message_reactions').delete().eq('id', existing.id);
      return { added: false, error: null };
    } else {
      const { error } = await supabase.from('meetup_message_reactions').insert({
        meetup_id: meetupId,
        message_id: messageId,
        user_id: userId,
        reaction_type: reactionType,
      });
      if (error) return { added: false, error: error.message };
      return { added: true, error: null };
    }
  } catch (e: any) {
    return { added: false, error: e.message || 'Failed to toggle reaction' };
  }
}

export async function deleteMeetupMessage(messageId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('meetup_messages')
      .delete()
      .eq('id', messageId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to delete message' };
  }
}
