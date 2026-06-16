/**
 * Admin Activity Log Service
 *
 * Logs and retrieves admin actions for audit trail.
 */

import { getSupabaseClient } from '@/template';

export interface AdminActivityLog {
  id: string;
  adminUserId: string;
  adminName: string | null;
  actionType: string;
  actionDetail: string | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export type ActionType =
  | 'moderation_warn'
  | 'moderation_suspend'
  | 'moderation_ban'
  | 'moderation_dismiss'
  | 'moderation_delete'
  | 'announcement_sent'
  | 'maintenance_enable'
  | 'maintenance_disable'
  | 'maintenance_schedule'
  | 'maintenance_cancel'
  | 'terrain_edit'
  | 'terrain_delete'
  | 'terrain_merge'
  | 'terrain_visibility'
  | 'coadmin_permission_change'
  | 'coadmin_added'
  | 'coadmin_removed'
  | 'club_verify'
  | 'club_unverify'
  | 'user_premium_enable'
  | 'user_premium_disable'
  | 'user_admin_promote'
  | 'user_admin_demote'
  | 'user_permissions_update'
  | 'club_health_alert';

const ACTION_CONFIG: Record<string, { iconFr: string; iconEn: string; color: string; icon: string }> = {
  moderation_warn: { iconFr: 'Avertissement joueur', iconEn: 'Player warning', color: '#D97706', icon: 'warning-amber' },
  moderation_suspend: { iconFr: 'Suspension joueur', iconEn: 'Player suspension', color: '#EF4444', icon: 'pause-circle' },
  moderation_ban: { iconFr: 'Bannissement joueur', iconEn: 'Player ban', color: '#991B1B', icon: 'block' },
  moderation_dismiss: { iconFr: 'Signalement classe', iconEn: 'Report dismissed', color: '#10B981', icon: 'check-circle' },
  moderation_delete: { iconFr: 'Signalement supprime', iconEn: 'Report deleted', color: '#64748B', icon: 'delete-outline' },
  announcement_sent: { iconFr: 'Annonce envoyee', iconEn: 'Announcement sent', color: '#7C3AED', icon: 'campaign' },
  maintenance_enable: { iconFr: 'Maintenance activee', iconEn: 'Maintenance enabled', color: '#D97706', icon: 'construction' },
  maintenance_disable: { iconFr: 'Maintenance desactivee', iconEn: 'Maintenance disabled', color: '#10B981', icon: 'check-circle' },
  maintenance_schedule: { iconFr: 'Maintenance planifiee', iconEn: 'Maintenance scheduled', color: '#2563EB', icon: 'schedule' },
  maintenance_cancel: { iconFr: 'Planification annulee', iconEn: 'Schedule cancelled', color: '#64748B', icon: 'cancel' },
  terrain_edit: { iconFr: 'Terrain modifie', iconEn: 'Terrain edited', color: '#10B981', icon: 'edit' },
  terrain_delete: { iconFr: 'Terrain supprime', iconEn: 'Terrain deleted', color: '#EF4444', icon: 'delete-outline' },
  terrain_merge: { iconFr: 'Terrains fusionnes', iconEn: 'Terrains merged', color: '#7C3AED', icon: 'merge-type' },
  terrain_visibility: { iconFr: 'Visibilite terrain', iconEn: 'Terrain visibility', color: '#3B82F6', icon: 'visibility' },
  coadmin_permission_change: { iconFr: 'Permission co-admin modifiee', iconEn: 'Co-admin permission changed', color: '#7C3AED', icon: 'admin-panel-settings' },
  coadmin_added: { iconFr: 'Co-admin ajoute', iconEn: 'Co-admin added', color: '#7C3AED', icon: 'person-add' },
  coadmin_removed: { iconFr: 'Co-admin retire', iconEn: 'Co-admin removed', color: '#94A3B8', icon: 'person-remove' },
  club_verify: { iconFr: 'Club verifie', iconEn: 'Club verified', color: '#2563EB', icon: 'verified' },
  club_unverify: { iconFr: 'Verification club retiree', iconEn: 'Club verification removed', color: '#94A3B8', icon: 'remove-circle' },
  user_premium_enable: { iconFr: 'Premium active', iconEn: 'Premium enabled', color: '#D4A017', icon: 'star' },
  user_premium_disable: { iconFr: 'Premium desactive', iconEn: 'Premium disabled', color: '#94A3B8', icon: 'star-outline' },
  user_admin_promote: { iconFr: 'Promu admin', iconEn: 'Promoted to admin', color: '#DC2626', icon: 'shield' },
  user_admin_demote: { iconFr: 'Admin retire', iconEn: 'Admin removed', color: '#64748B', icon: 'remove-moderator' },
  user_permissions_update: { iconFr: 'Permissions modifiees', iconEn: 'Permissions updated', color: '#7C3AED', icon: 'tune' },
  club_health_alert: { iconFr: 'Alerte sante club', iconEn: 'Club health alert', color: '#EF4444', icon: 'favorite' },
};

export { ACTION_CONFIG };

/**
 * Log an admin action.
 */
export async function logAdminAction(params: {
  actionType: ActionType;
  actionDetail?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    let adminName = '';
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', userData.user.id)
        .single();
      adminName = profile?.username || userData.user.email || '';
    } catch { /* silent */ }

    await supabase.from('admin_activity_logs').insert({
      admin_user_id: userData.user.id,
      admin_name: adminName,
      action_type: params.actionType,
      action_detail: params.actionDetail || null,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      target_name: params.targetName || null,
      metadata: params.metadata || {},
    });
  } catch (e) {
    console.log('[AdminActivityLog] Error logging action:', e);
  }
}

/**
 * Get recent admin activity logs.
 */
export async function getRecentActivityLogs(limit = 20): Promise<{ logs: AdminActivityLog[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('admin_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { logs: [], error: error.message };

    const logs: AdminActivityLog[] = (data || []).map((row: any) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name,
      actionType: row.action_type,
      actionDetail: row.action_detail,
      targetType: row.target_type,
      targetId: row.target_id,
      targetName: row.target_name,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    }));

    return { logs, error: null };
  } catch (e: any) {
    return { logs: [], error: e.message };
  }
}
