/**
 * Terrain Review Service
 * Handles CRUD for terrain reviews (5-star ratings + comments + photos).
 */
import { getSupabaseClient } from '@/template';

export interface TerrainReview {
  id: string;
  terrainId: string;
  userId: string;
  playerId?: string;
  playerName?: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TerrainRatingStats {
  avg: number;
  count: number;
  distribution: number[]; // [1-star, 2-star, 3-star, 4-star, 5-star]
}

/**
 * Fetch all reviews for a terrain.
 */
export async function fetchTerrainReviews(terrainId: string): Promise<{ reviews: TerrainReview[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_reviews')
      .select('*')
      .eq('terrain_id', terrainId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const reviews: TerrainReview[] = (data || []).map((r: any) => ({
      id: r.id,
      terrainId: r.terrain_id,
      userId: r.user_id,
      playerId: r.player_id,
      playerName: r.player_name,
      rating: r.rating,
      comment: r.comment,
      photoUrl: r.photo_url || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { reviews, error: null };
  } catch (e: any) {
    return { reviews: [], error: e.message || 'Failed to fetch reviews' };
  }
}

/**
 * Compute rating stats from reviews.
 */
export function computeRatingStats(reviews: TerrainReview[]): TerrainRatingStats {
  if (reviews.length === 0) return { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  const dist = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of reviews) {
    const idx = Math.max(0, Math.min(4, r.rating - 1));
    dist[idx]++;
    total += r.rating;
  }
  return {
    avg: Math.round((total / reviews.length) * 10) / 10,
    count: reviews.length,
    distribution: dist,
  };
}

/**
 * Submit or update a review for a terrain.
 */
export async function submitTerrainReview(params: {
  terrainId: string;
  userId: string;
  playerId?: string;
  playerName?: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
}): Promise<{ review: TerrainReview | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_reviews')
      .upsert({
        terrain_id: params.terrainId,
        user_id: params.userId,
        player_id: params.playerId || null,
        player_name: params.playerName || null,
        rating: params.rating,
        comment: params.comment || null,
        photo_url: params.photoUrl || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'terrain_id,user_id' })
      .select()
      .single();

    if (error) throw error;

    const review: TerrainReview = {
      id: data.id,
      terrainId: data.terrain_id,
      userId: data.user_id,
      playerId: data.player_id,
      playerName: data.player_name,
      rating: data.rating,
      comment: data.comment,
      photoUrl: data.photo_url || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return { review, error: null };
  } catch (e: any) {
    return { review: null, error: e.message || 'Failed to submit review' };
  }
}

/**
 * Delete a review.
 */
export async function deleteTerrainReview(reviewId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('terrain_reviews')
      .delete()
      .eq('id', reviewId);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to delete review' };
  }
}

// ============================================
// REVIEW VOTES (Helpful / Not Helpful)
// ============================================

export interface ReviewVote {
  reviewId: string;
  userId: string;
  voteType: 'helpful' | 'not_helpful';
}

export interface ReviewVoteCounts {
  helpful: number;
  notHelpful: number;
  userVote: 'helpful' | 'not_helpful' | null;
}

/**
 * Fetch vote counts for all reviews of a terrain, plus the current user's vote.
 */
export async function fetchReviewVotes(terrainId: string, currentUserId?: string): Promise<Map<string, ReviewVoteCounts>> {
  const result = new Map<string, ReviewVoteCounts>();
  try {
    const supabase = getSupabaseClient();
    // Get all reviews for this terrain to know their IDs
    const { data: reviews } = await supabase
      .from('terrain_reviews')
      .select('id')
      .eq('terrain_id', terrainId);
    if (!reviews || reviews.length === 0) return result;
    const reviewIds = reviews.map((r: any) => r.id);
    // Fetch all votes for these reviews
    const { data: votes } = await supabase
      .from('review_votes')
      .select('review_id, user_id, vote_type')
      .in('review_id', reviewIds);
    // Initialize counts
    for (const rid of reviewIds) {
      result.set(rid, { helpful: 0, notHelpful: 0, userVote: null });
    }
    if (votes) {
      for (const v of votes) {
        const counts = result.get(v.review_id);
        if (!counts) continue;
        if (v.vote_type === 'helpful') counts.helpful++;
        else counts.notHelpful++;
        if (currentUserId && v.user_id === currentUserId) {
          counts.userVote = v.vote_type;
        }
      }
    }
  } catch { /* silent */ }
  return result;
}

/**
 * Submit or toggle a vote on a review.
 */
export async function voteOnReview(reviewId: string, userId: string, voteType: 'helpful' | 'not_helpful'): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Check if user already voted
    const { data: existing } = await supabase
      .from('review_votes')
      .select('id, vote_type')
      .eq('review_id', reviewId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      if (existing.vote_type === voteType) {
        // Remove vote (toggle off)
        await supabase.from('review_votes').delete().eq('id', existing.id);
      } else {
        // Change vote
        await supabase.from('review_votes').delete().eq('id', existing.id);
        await supabase.from('review_votes').insert({ review_id: reviewId, user_id: userId, vote_type: voteType });
      }
    } else {
      await supabase.from('review_votes').insert({ review_id: reviewId, user_id: userId, vote_type: voteType });
    }
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to vote' };
  }
}

/**
 * Flag a review for moderation.
 */
export async function flagReview(reviewId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Increment flag count and set flagged status
    const { data: current } = await supabase.from('terrain_reviews').select('flag_count').eq('id', reviewId).single();
    const newCount = ((current as any)?.flag_count || 0) + 1;
    const { error } = await supabase.from('terrain_reviews').update({
      flagged: true,
      flag_count: newCount,
      moderation_status: newCount >= 2 ? 'flagged' : 'active',
    }).eq('id', reviewId);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to flag review' };
  }
}

/**
 * Fetch all flagged/pending reviews for admin moderation.
 */
export async function fetchFlaggedReviews(): Promise<{ reviews: (TerrainReview & { flagCount: number; moderationStatus: string; terrainName?: string })[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_reviews')
      .select('*, terrains!terrain_reviews_terrain_id_fkey(name)')
      .or('flagged.eq.true,moderation_status.eq.flagged')
      .order('flag_count', { ascending: false });
    if (error) throw error;
    const reviews = (data || []).map((r: any) => ({
      id: r.id,
      terrainId: r.terrain_id,
      userId: r.user_id,
      playerId: r.player_id,
      playerName: r.player_name,
      rating: r.rating,
      comment: r.comment,
      photoUrl: r.photo_url || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      flagCount: r.flag_count || 0,
      moderationStatus: r.moderation_status || 'active',
      terrainName: r.terrains?.name || undefined,
    }));
    return { reviews, error: null };
  } catch (e: any) {
    return { reviews: [], error: e.message || 'Failed to fetch flagged reviews' };
  }
}

/**
 * Admin: update moderation status of a review.
 */
export async function moderateReview(reviewId: string, action: 'approved' | 'hidden'): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const updates: any = { moderation_status: action };
    if (action === 'approved') updates.flagged = false;
    const { error } = await supabase.from('terrain_reviews').update(updates).eq('id', reviewId);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to moderate review' };
  }
}

/**
 * Get current user's review for a terrain.
 */
export async function getMyReview(terrainId: string, userId: string): Promise<TerrainReview | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrain_reviews')
      .select('*')
      .eq('terrain_id', terrainId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      terrainId: data.terrain_id,
      userId: data.user_id,
      playerId: data.player_id,
      playerName: data.player_name,
      rating: data.rating,
      comment: data.comment,
      photoUrl: data.photo_url || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}
