/**
 * Moderation Service
 *
 * Admin-only functions for managing player reports,
 * taking moderation actions, and viewing reported player details.
 */

import { getSupabaseClient } from '@/template';
import { triggerServerPush } from '@/services/pushTokenService';
import { logAdminAction } from '@/services/adminActivityLogService';

export interface PlayerReport {
  id: string;
  reporterId: string;
  reporterName?: string;
  reportedPlayerId: string;
  reportedUserId: string | null;
  reportedPlayerName?: string;
  reportedPlayerAvatar?: string;
  reportedPlayerClub?: string;
  reportedPlayerLevel?: string;
  reportedPlayerElo?: number;
  reason: string;
  details: string | null;
  status: 'pending' | 'warned' | 'suspended' | 'banned' | 'dismissed';
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportedPlayerDetail {
  playerId: string;
  userId: string | null;
  name: string;
  avatar: string | null;
  club: string | null;
  role: string;
  level: string;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  tirRate: number;
  carreauRate: number;
  trustScore: number | null;
  trustLevel: string | null;
  trustFlags: any[];
  reportCount: number;
  isPublic: boolean;
  createdAt: string;
  lastMatchDate: string | null;
}

/**
 * Fetch all player reports (admin only).
 */
export async function getPlayerReports(limit = 50): Promise<{ reports: PlayerReport[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('player_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { reports: [], error: error.message };

    const reports: PlayerReport[] = [];
    for (const row of data || []) {
      let reporterName = '';
      let reportedPlayerName = '';
      let reportedPlayerAvatar = '';
      let reportedPlayerClub = '';
      let reportedPlayerLevel = '';
      let reportedPlayerElo = 0;

      // Fetch reporter name
      try {
        const { data: rp } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', row.reporter_id)
          .single();
        if (rp?.username) reporterName = rp.username;
      } catch { /* silent */ }

      // Fetch reported player info
      try {
        const { data: pp } = await supabase
          .from('players')
          .select('name, avatar, club, level, elo_rating')
          .eq('id', row.reported_player_id)
          .single();
        if (pp) {
          reportedPlayerName = pp.name || '';
          reportedPlayerAvatar = pp.avatar || '';
          reportedPlayerClub = pp.club || '';
          reportedPlayerLevel = pp.level || '';
          reportedPlayerElo = pp.elo_rating || 0;
        }
      } catch { /* silent */ }

      reports.push({
        id: row.id,
        reporterId: row.reporter_id,
        reporterName,
        reportedPlayerId: row.reported_player_id,
        reportedUserId: row.reported_user_id,
        reportedPlayerName,
        reportedPlayerAvatar,
        reportedPlayerClub,
        reportedPlayerLevel,
        reportedPlayerElo,
        reason: row.reason,
        details: row.details,
        status: row.status || 'pending',
        adminNotes: row.admin_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    return { reports, error: null };
  } catch (e: any) {
    return { reports: [], error: e.message };
  }
}

/**
 * Update a report's status and admin notes (admin only).
 */
export async function updateReportStatus(
  reportId: string,
  status: 'warned' | 'suspended' | 'banned' | 'dismissed',
  adminNotes?: string
): Promise<{ error: string | null; pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();

    // Get report details before updating (for push notification)
    const { data: reportData } = await supabase
      .from('player_reports')
      .select('reported_player_id, reported_user_id, reason')
      .eq('id', reportId)
      .single();

    const { error } = await supabase
      .from('player_reports')
      .update({
        status,
        admin_notes: adminNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) return { error: error.message };

    // Log admin activity
    const actionTypeMap: Record<string, any> = {
      warned: 'moderation_warn',
      suspended: 'moderation_suspend',
      banned: 'moderation_ban',
      dismissed: 'moderation_dismiss',
    };
    logAdminAction({
      actionType: actionTypeMap[status] || 'moderation_dismiss',
      targetType: 'player',
      targetId: reportData?.reported_player_id || undefined,
      actionDetail: `Report ${reportId}: ${status}${adminNotes ? ' - ' + adminNotes : ''}`,
    });

    // Send push notification to the reported player (if action is not dismissed)
    let pushSent = 0;
    let pushErrors = 0;
    if (status !== 'dismissed' && reportData?.reported_user_id) {
      try {
        const result = await triggerServerPush('moderation_action', {
          targetUserId: reportData.reported_user_id,
          action: status,
          reason: reportData.reason,
        });
        pushSent = result.sent;
        pushErrors = result.errors;
      } catch { /* silent - push is best-effort */ }
    }

    return { error: null, pushSent, pushErrors };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get detailed info about a reported player including trust score.
 */
export async function getReportedPlayerDetail(playerId: string): Promise<{ player: ReportedPlayerDetail | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const { data: playerData, error: pErr } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (pErr || !playerData) return { player: null, error: pErr?.message || 'Player not found' };

    const stats = typeof playerData.stats === 'string' ? JSON.parse(playerData.stats) : (playerData.stats || {});

    // Get trust score
    let trustScore: number | null = null;
    let trustLevel: string | null = null;
    let trustFlags: any[] = [];
    try {
      const { data: sp } = await supabase
        .from('suspicious_players')
        .select('trust_score, status, flags')
        .eq('player_id', playerId)
        .single();
      if (sp) {
        trustScore = sp.trust_score;
        trustLevel = sp.status;
        trustFlags = sp.flags || [];
      }
    } catch { /* silent */ }

    // Count total reports
    let reportCount = 0;
    try {
      const { data: rc } = await supabase
        .from('player_reports')
        .select('id')
        .eq('reported_player_id', playerId);
      reportCount = rc?.length || 0;
    } catch { /* silent */ }

    return {
      player: {
        playerId: playerData.id,
        userId: playerData.user_id,
        name: playerData.name || '',
        avatar: playerData.avatar,
        club: playerData.club,
        role: playerData.role || 'Milieu',
        level: playerData.level || 'Intermédiaire',
        eloRating: playerData.elo_rating || 1000,
        matchesPlayed: stats.matchesPlayed || 0,
        wins: stats.wins || 0,
        winRate: stats.winRate || 0,
        tirRate: stats.tirRate || 0,
        carreauRate: stats.carreauRate || 0,
        trustScore,
        trustLevel,
        trustFlags,
        reportCount,
        isPublic: playerData.is_public || false,
        createdAt: playerData.created_at,
        lastMatchDate: playerData.last_match_date,
      },
      error: null,
    };
  } catch (e: any) {
    return { player: null, error: e.message };
  }
}

/**
 * Delete a report (admin only).
 */
export async function deleteReport(reportId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('player_reports')
      .delete()
      .eq('id', reportId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get report stats summary for dashboard.
 */
export async function getReportStats(): Promise<{
  total: number;
  pending: number;
  warned: number;
  suspended: number;
  banned: number;
  dismissed: number;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('player_reports')
      .select('status');

    const all = data || [];
    return {
      total: all.length,
      pending: all.filter((r: any) => r.status === 'pending').length,
      warned: all.filter((r: any) => r.status === 'warned').length,
      suspended: all.filter((r: any) => r.status === 'suspended').length,
      banned: all.filter((r: any) => r.status === 'banned').length,
      dismissed: all.filter((r: any) => r.status === 'dismissed').length,
    };
  } catch {
    return { total: 0, pending: 0, warned: 0, suspended: 0, banned: 0, dismissed: 0 };
  }
}
