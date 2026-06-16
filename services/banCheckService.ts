/**
 * Ban Check Service
 *
 * Checks if the current user has been banned via player_reports.
 * Used to block app access for banned users.
 */

import { getSupabaseClient } from '@/template';

export interface BanInfo {
  isBanned: boolean;
  reason: string | null;
  adminNotes: string | null;
  bannedAt: string | null;
}

/**
 * Check if the current user is banned.
 * Queries player_reports for status='banned' where reported_user_id matches.
 */
export async function checkUserBanStatus(): Promise<BanInfo> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { isBanned: false, reason: null, adminNotes: null, bannedAt: null };

    const { data, error } = await supabase
      .from('player_reports')
      .select('reason, admin_notes, updated_at')
      .eq('reported_user_id', userData.user.id)
      .eq('status', 'banned')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return { isBanned: false, reason: null, adminNotes: null, bannedAt: null };
    }

    return {
      isBanned: true,
      reason: data[0].reason || null,
      adminNotes: data[0].admin_notes || null,
      bannedAt: data[0].updated_at || null,
    };
  } catch (e) {
    console.log('[banCheck] Error checking ban status:', e);
    return { isBanned: false, reason: null, adminNotes: null, bannedAt: null };
  }
}
