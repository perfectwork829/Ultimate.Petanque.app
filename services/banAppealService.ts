/**
 * Ban Appeal Service
 *
 * Allows banned users to submit appeals and admins to review them.
 */

import { getSupabaseClient } from '@/template';

export interface BanAppeal {
  id: string;
  userId: string;
  reportId: string | null;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit a ban appeal.
 */
export async function submitBanAppeal(message: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Not authenticated' };

    // Check if user already has a pending appeal
    const { data: existing } = await supabase
      .from('ban_appeals')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('status', 'pending')
      .limit(1);

    if (existing && existing.length > 0) {
      return { error: 'appeal_already_pending' };
    }

    // Find the ban report
    const { data: banReport } = await supabase
      .from('player_reports')
      .select('id')
      .eq('reported_user_id', userData.user.id)
      .eq('status', 'banned')
      .order('updated_at', { ascending: false })
      .limit(1);

    const { error } = await supabase
      .from('ban_appeals')
      .insert({
        user_id: userData.user.id,
        report_id: banReport?.[0]?.id || null,
        message: message.trim(),
        status: 'pending',
      });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get user's own appeals.
 */
export async function getMyAppeals(): Promise<{ appeals: BanAppeal[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ban_appeals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return { appeals: [], error: error.message };

    return {
      appeals: (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        reportId: row.report_id,
        message: row.message,
        status: row.status,
        adminResponse: row.admin_response,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      error: null,
    };
  } catch (e: any) {
    return { appeals: [], error: e.message };
  }
}

/**
 * Get all appeals (admin only).
 */
export async function getAllAppeals(limit = 50): Promise<{ appeals: (BanAppeal & { userName?: string; userEmail?: string })[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ban_appeals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { appeals: [], error: error.message };

    // Fetch user names
    const userIds = [...new Set((data || []).map((r: any) => r.user_id))];
    const nameMap = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, email')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => {
        nameMap.set(p.id, { name: p.username || 'Unknown', email: p.email || '' });
      });
    }

    return {
      appeals: (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        reportId: row.report_id,
        message: row.message,
        status: row.status,
        adminResponse: row.admin_response,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userName: nameMap.get(row.user_id)?.name,
        userEmail: nameMap.get(row.user_id)?.email,
      })),
      error: null,
    };
  } catch (e: any) {
    return { appeals: [], error: e.message };
  }
}

/**
 * Respond to an appeal (admin only).
 */
export async function respondToAppeal(
  appealId: string,
  status: 'accepted' | 'rejected',
  adminResponse?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('ban_appeals')
      .update({
        status,
        admin_response: adminResponse || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appealId);

    if (error) return { error: error.message };

    // If accepted, also update the player_report to 'dismissed' to unban
    if (status === 'accepted') {
      const { data: appeal } = await supabase
        .from('ban_appeals')
        .select('user_id, report_id')
        .eq('id', appealId)
        .single();

      if (appeal?.report_id) {
        await supabase
          .from('player_reports')
          .update({ status: 'dismissed', admin_notes: `Ban appeal accepted: ${adminResponse || 'No comment'}`, updated_at: new Date().toISOString() })
          .eq('id', appeal.report_id);
      } else if (appeal?.user_id) {
        // Update all banned reports for this user
        await supabase
          .from('player_reports')
          .update({ status: 'dismissed', admin_notes: `Ban appeal accepted: ${adminResponse || 'No comment'}`, updated_at: new Date().toISOString() })
          .eq('reported_user_id', appeal.user_id)
          .eq('status', 'banned');
      }
    }

    // Send push notification to the user about the appeal response
    try {
      const { data: appeal } = await supabase
        .from('ban_appeals')
        .select('user_id')
        .eq('id', appealId)
        .single();

      if (appeal?.user_id) {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'ban_appeal_response',
            payload: {
              targetUserId: appeal.user_id,
              appealStatus: status,
              adminResponse: adminResponse || null,
            },
          },
        });
      }
    } catch (pushErr) {
      console.log('[BanAppeal] Push notification error (non-blocking):', pushErr);
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}
