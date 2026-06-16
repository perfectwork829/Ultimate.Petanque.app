/**
 * feedReactionService — Manages reactions (applause, fire, medal) on community feed items.
 * Stores reactions in feed_reactions table with user_id + feed_item_id + reaction_type unique constraint.
 */
import { getSupabaseClient } from '@/template';

export type ReactionType = 'applause' | 'fire' | 'medal';

export interface ReactionCounts {
  applause: number;
  fire: number;
  medal: number;
}

export interface UserReactions {
  applause: boolean;
  fire: boolean;
  medal: boolean;
}

export interface FeedItemReactions {
  counts: ReactionCounts;
  userReactions: UserReactions;
}

/**
 * Toggle a reaction on a feed item. Returns updated counts and user state.
 */
export async function toggleReaction(
  feedItemId: string,
  reactionType: ReactionType,
  userId: string
): Promise<{ success: boolean; added: boolean }> {
  const supabase = getSupabaseClient();
  try {
    // Check if reaction already exists
    const { data: existing } = await supabase
      .from('feed_reactions')
      .select('id')
      .eq('user_id', userId)
      .eq('feed_item_id', feedItemId)
      .eq('reaction_type', reactionType)
      .single();

    if (existing) {
      // Remove reaction
      await supabase
        .from('feed_reactions')
        .delete()
        .eq('id', existing.id);
      return { success: true, added: false };
    } else {
      // Add reaction
      const { error } = await supabase
        .from('feed_reactions')
        .insert({ user_id: userId, feed_item_id: feedItemId, reaction_type: reactionType });
      if (error) {
        console.log('[FeedReaction] Insert error:', error.message);
        return { success: false, added: false };
      }
      return { success: true, added: true };
    }
  } catch (e) {
    console.error('[FeedReaction] Toggle error:', e);
    return { success: false, added: false };
  }
}

/**
 * Batch-fetch reaction counts and user reactions for a list of feed item IDs.
 */
export async function fetchReactionsForItems(
  feedItemIds: string[],
  userId?: string
): Promise<Map<string, FeedItemReactions>> {
  const result = new Map<string, FeedItemReactions>();
  if (feedItemIds.length === 0) return result;

  // Initialize all items
  feedItemIds.forEach(id => {
    result.set(id, {
      counts: { applause: 0, fire: 0, medal: 0 },
      userReactions: { applause: false, fire: false, medal: false },
    });
  });

  const supabase = getSupabaseClient();
  try {
    // Fetch all reactions for these items
    const { data, error } = await supabase
      .from('feed_reactions')
      .select('feed_item_id, reaction_type, user_id')
      .in('feed_item_id', feedItemIds);

    if (error) {
      console.log('[FeedReaction] Fetch error:', error.message);
      return result;
    }

    if (data) {
      data.forEach((row: any) => {
        const item = result.get(row.feed_item_id);
        if (!item) return;
        const type = row.reaction_type as ReactionType;
        if (type in item.counts) {
          item.counts[type]++;
        }
        if (userId && row.user_id === userId) {
          if (type in item.userReactions) {
            item.userReactions[type] = true;
          }
        }
      });
    }
  } catch (e) {
    console.error('[FeedReaction] Batch fetch error:', e);
  }

  return result;
}
