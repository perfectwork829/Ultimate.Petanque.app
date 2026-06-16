// ============================================
// Player Report Service
// ============================================
import { getSupabaseClient } from '@/template';

export interface PlayerReport {
  id: string;
  reporter_id: string;
  reported_player_id: string;
  reported_user_id?: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
  // Joined fields (admin view)
  reporter_email?: string;
  reported_player_name?: string;
}

export const REPORT_REASONS = [
  'fake_stats',
  'multiple_accounts',
  'inappropriate_content',
  'spam',
  'other',
] as const;

export type ReportReason = typeof REPORT_REASONS[number];

export async function submitReport(params: {
  reportedPlayerId: string;
  reportedUserId?: string;
  reason: string;
  details?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.from('player_reports').insert({
      reporter_id: user.id,
      reported_player_id: params.reportedPlayerId,
      reported_user_id: params.reportedUserId || null,
      reason: params.reason,
      details: params.details || null,
      status: 'pending',
    });

    if (error) {
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return { error: 'already_reported' };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Report submission failed' };
  }
}

export async function fetchMyReports(): Promise<{ reports: PlayerReport[]; error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('player_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return { reports: [], error: error.message };
    return { reports: data || [], error: null };
  } catch (e: any) {
    return { reports: [], error: e.message };
  }
}

export async function fetchAllReports(): Promise<{ reports: PlayerReport[]; error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('player_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return { reports: [], error: error.message };

    // Enrich with reporter email and player name
    const enriched: PlayerReport[] = [];
    for (const r of data || []) {
      let reporter_email: string | undefined;
      let reported_player_name: string | undefined;

      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('id', r.reporter_id)
          .single();
        reporter_email = profile?.email;
      } catch { /* silent */ }

      try {
        const { data: player } = await supabase
          .from('players')
          .select('name')
          .eq('id', r.reported_player_id)
          .single();
        reported_player_name = player?.name;
      } catch { /* silent */ }

      enriched.push({ ...r, reporter_email, reported_player_name });
    }

    return { reports: enriched, error: null };
  } catch (e: any) {
    return { reports: [], error: e.message };
  }
}

export async function updateReportStatus(
  reportId: string,
  status: PlayerReport['status'],
  adminNotes?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

    const { error } = await supabase
      .from('player_reports')
      .update(updateData)
      .eq('id', reportId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}
