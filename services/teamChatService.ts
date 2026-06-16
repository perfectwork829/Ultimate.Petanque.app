/**
 * Team Chat Service
 * Handles sending, fetching, and deleting messages in team chat.
 * Adapted from meetupChatService pattern.
 */
import { getSupabaseClient } from '@/template';

export interface TeamMessage {
  id: string;
  team_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  message: string;
  created_at: string;
}

export async function fetchTeamMessages(teamId: string): Promise<{ messages: TeamMessage[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('team_messages')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) return { messages: [], error: error.message };
    return { messages: data || [], error: null };
  } catch (e: any) {
    return { messages: [], error: e.message || 'Failed to fetch messages' };
  }
}

export async function sendTeamMessage(
  teamId: string,
  userId: string,
  userName: string,
  userAvatar: string | null,
  message: string
): Promise<{ message: TeamMessage | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        team_id: teamId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        message: message.trim(),
      })
      .select()
      .single();

    if (error) return { message: null, error: error.message };

    // Send push notification to other team members (fire-and-forget)
    _sendTeamChatPush(teamId, userId, userName, message.trim()).catch(() => {});

    return { message: data, error: null };
  } catch (e: any) {
    return { message: null, error: e.message || 'Failed to send message' };
  }
}

async function _sendTeamChatPush(
  teamId: string,
  senderUserId: string,
  senderName: string,
  messageText: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // Fetch team to get member IDs
    const { data: team } = await supabase
      .from('tournament_teams')
      .select('member_user_ids, tournament_id')
      .eq('id', teamId)
      .single();
    if (!team) return;
    // Get tournament name for context
    const { data: tourney } = await supabase
      .from('tournaments')
      .select('name')
      .eq('id', team.tournament_id)
      .single();
    const tournamentName = tourney?.name || '';
    // Notify all members except sender
    const recipientIds = (team.member_user_ids || []).filter((uid: string) => uid !== senderUserId);
    for (const recipientId of recipientIds) {
      await supabase.functions.invoke('send-push', {
        body: {
          type: 'team_chat_message',
          payload: {
            targetUserId: recipientId,
            senderName,
            teamId,
            tournamentName,
            messagePreview: messageText.length > 80 ? messageText.slice(0, 77) + '...' : messageText,
          },
        },
      });
    }
  } catch { /* silent */ }
}

export async function deleteTeamMessage(messageId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('team_messages')
      .delete()
      .eq('id', messageId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to delete message' };
  }
}

// ============================================
// Reactions
// ============================================

export const REACTION_TYPES = [
  { type: 'like', emoji: '\u{1F44D}' },
  { type: 'fire', emoji: '\u{1F525}' },
  { type: 'laugh', emoji: '\u{1F602}' },
] as const;

export interface TeamMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: string;
}

export async function fetchReactionsForTeam(teamId: string): Promise<Map<string, TeamMessageReaction[]>> {
  const map = new Map<string, TeamMessageReaction[]>();
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('team_message_reactions')
      .select('id, message_id, user_id, reaction_type')
      .eq('team_id', teamId);
    (data || []).forEach((r: any) => {
      const arr = map.get(r.message_id) || [];
      arr.push(r);
      map.set(r.message_id, arr);
    });
  } catch { /* silent */ }
  return map;
}

export async function toggleReaction(
  teamId: string,
  messageId: string,
  userId: string,
  reactionType: string,
): Promise<{ added: boolean; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Check if reaction already exists
    const { data: existing } = await supabase
      .from('team_message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (existing) {
      // Remove
      await supabase.from('team_message_reactions').delete().eq('id', existing.id);
      return { added: false, error: null };
    } else {
      // Add
      const { error } = await supabase.from('team_message_reactions').insert({
        team_id: teamId,
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

// ============================================
// Typing Indicator
// ============================================

export interface TypingUser {
  user_id: string;
  user_name: string;
  updated_at: string;
}

const TYPING_STALE_MS = 6000;

export async function setTypingStatus(
  teamId: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('team_chat_typing')
      .upsert(
        { team_id: teamId, user_id: userId, user_name: userName, updated_at: new Date().toISOString() },
        { onConflict: 'team_id,user_id' }
      );
  } catch { /* silent */ }
}

export async function clearTypingStatus(
  teamId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('team_chat_typing')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
  } catch { /* silent */ }
}

export async function fetchTypingUsers(
  teamId: string,
  currentUserId: string
): Promise<TypingUser[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('team_chat_typing')
      .select('user_id, user_name, updated_at')
      .eq('team_id', teamId)
      .neq('user_id', currentUserId);
    if (error || !data) return [];
    const now = Date.now();
    return data.filter(t => now - new Date(t.updated_at).getTime() < TYPING_STALE_MS);
  } catch {
    return [];
  }
}

// ============================================
// Read Receipts
// ============================================

export interface TeamReadReceipt {
  team_id: string;
  user_id: string;
  last_read_message_id: string;
  last_read_at: string;
}

export async function markTeamMessagesAsRead(
  teamId: string,
  userId: string,
  lastMessageId: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('team_chat_read_receipts')
      .upsert(
        {
          team_id: teamId,
          user_id: userId,
          last_read_message_id: lastMessageId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,user_id' }
      );
  } catch { /* silent */ }
}

export async function fetchTeamReadReceipts(
  teamId: string
): Promise<TeamReadReceipt[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('team_chat_read_receipts')
      .select('team_id, user_id, last_read_message_id, last_read_at')
      .eq('team_id', teamId);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function getTeamMessageCount(teamId: string): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('team_messages')
      .select('id')
      .eq('team_id', teamId);
    return data?.length || 0;
  } catch {
    return 0;
  }
}
