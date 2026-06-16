/**
 * Club Co-Management Service
 *
 * Manages co-admin relationships for clubs.
 * Allows club owners to add/remove co-admins who can edit the club.
 */

import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { logAdminAction } from '@/services/adminActivityLogService';

export type CoAdminPermission = 'read' | 'edit' | 'full';

export interface CoAdmin {
  id: string;
  username: string | null;
  email: string;
  avatar: string | null;
  permission: CoAdminPermission;
  addedAt?: string;
}

/**
 * Get club's co-admin list with profile info.
 */
export async function getClubCoAdmins(clubId: string): Promise<{ coAdmins: CoAdmin[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .select('admin_user_ids')
      .eq('id', clubId)
      .single();

    if (clubErr || !club) return { coAdmins: [], error: clubErr?.message || 'Club not found' };

    const adminIds: string[] = club.admin_user_ids || [];
    if (adminIds.length === 0) return { coAdmins: [], error: null };

    const { data: profiles, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, username, email, avatar')
      .in('id', adminIds);

    if (profileErr) return { coAdmins: [], error: profileErr.message };

    // Fetch permission levels
    const { data: clubPerms } = await supabase
      .from('clubs')
      .select('admin_permissions')
      .eq('id', clubId)
      .single();
    const permissions: Record<string, CoAdminPermission> = clubPerms?.admin_permissions || {};

    return {
      coAdmins: (profiles || []).map((p: any) => ({
        id: p.id,
        username: p.username,
        email: p.email,
        avatar: p.avatar,
        permission: (permissions[p.id] as CoAdminPermission) || 'edit',
      })),
      error: null,
    };
  } catch (e: any) {
    return { coAdmins: [], error: e.message };
  }
}

/**
 * Add a co-admin to a club by email.
 */
export async function addClubCoAdmin(clubId: string, email: string, permission: CoAdminPermission = 'edit'): Promise<{ coAdmin: CoAdmin | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Find user by email
    const { data: profile, error: findErr } = await supabase
      .from('user_profiles')
      .select('id, username, email, avatar')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (findErr || !profile) return { coAdmin: null, error: 'user_not_found' };

    // Get current club
    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .select('user_id, admin_user_ids')
      .eq('id', clubId)
      .single();

    if (clubErr || !club) return { coAdmin: null, error: clubErr?.message || 'Club not found' };

    // Check if user is already owner
    if (profile.id === club.user_id) return { coAdmin: null, error: 'is_owner' };

    // Check if already co-admin
    const currentAdmins: string[] = club.admin_user_ids || [];
    if (currentAdmins.includes(profile.id)) return { coAdmin: null, error: 'already_coadmin' };

    // Add to admin_user_ids and update permissions
    const newAdmins = [...currentAdmins, profile.id];

    // Get current permissions
    const { data: clubPermsData } = await supabase
      .from('clubs')
      .select('admin_permissions')
      .eq('id', clubId)
      .single();
    const currentPerms: Record<string, string> = clubPermsData?.admin_permissions || {};
    currentPerms[profile.id] = permission;

    const { error: updateErr } = await supabase
      .from('clubs')
      .update({ admin_user_ids: newAdmins, admin_permissions: currentPerms, updated_at: new Date().toISOString() })
      .eq('id', clubId);

    if (updateErr) return { coAdmin: null, error: updateErr.message };

    // Send push notification to the new co-admin
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: clubData } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      if (userData?.user?.id && clubData) {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'co_admin',
            payload: {
              targetUserId: profile.id,
              clubName: clubData.name,
              clubId,
              action: 'added',
              adderName: userData.user.user_metadata?.username || userData.user.email || 'Admin',
            },
          },
        });
      }
    } catch (pushErr) {
      console.log('[CoAdmin] Push notification error (non-blocking):', pushErr);
    }

    // Log activity
    try {
      const { data: clubInfo } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      logAdminAction({
        actionType: 'coadmin_added',
        targetType: 'club',
        targetId: clubId,
        targetName: clubInfo?.name || clubId,
        actionDetail: `Added ${profile.username || profile.email} as co-admin (${permission})`,
        metadata: { coAdminId: profile.id, coAdminEmail: profile.email, permission },
      });
    } catch { /* silent */ }

    return {
      coAdmin: {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        avatar: profile.avatar,
        permission,
      },
      error: null,
    };
  } catch (e: any) {
    return { coAdmin: null, error: e.message };
  }
}

/**
 * Remove a co-admin from a club.
 */
export async function removeClubCoAdmin(clubId: string, userId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .select('admin_user_ids')
      .eq('id', clubId)
      .single();

    if (clubErr || !club) return { error: clubErr?.message || 'Club not found' };

    const currentAdmins: string[] = club.admin_user_ids || [];
    const newAdmins = currentAdmins.filter(id => id !== userId);

    // Also remove from permissions
    const { data: clubPermsData } = await supabase
      .from('clubs')
      .select('admin_permissions')
      .eq('id', clubId)
      .single();
    const perms: Record<string, string> = clubPermsData?.admin_permissions || {};
    delete perms[userId];

    const { error: updateErr } = await supabase
      .from('clubs')
      .update({ admin_user_ids: newAdmins, admin_permissions: perms, updated_at: new Date().toISOString() })
      .eq('id', clubId);

    if (updateErr) return { error: updateErr.message };

    // Send push notification to the removed co-admin
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: clubData } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      if (userData?.user?.id && clubData) {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'co_admin',
            payload: {
              targetUserId: userId,
              clubName: clubData.name,
              clubId,
              action: 'removed',
              adderName: userData.user.user_metadata?.username || userData.user.email || 'Admin',
            },
          },
        });
      }
    } catch (pushErr) {
      console.log('[CoAdmin] Push notification error (non-blocking):', pushErr);
    }

    // Log activity
    try {
      const { data: clubInfo } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      logAdminAction({
        actionType: 'coadmin_removed',
        targetType: 'club',
        targetId: clubId,
        targetName: clubInfo?.name || clubId,
        actionDetail: `Removed co-admin ${userId}`,
        metadata: { coAdminId: userId },
      });
    } catch { /* silent */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Update a co-admin's permission level.
 */
export async function updateCoAdminPermission(clubId: string, userId: string, permission: CoAdminPermission): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: clubData } = await supabase
      .from('clubs')
      .select('admin_permissions')
      .eq('id', clubId)
      .single();

    const perms: Record<string, string> = clubData?.admin_permissions || {};
    const previousPermission = perms[userId] || 'edit';
    perms[userId] = permission;

    const { error } = await supabase
      .from('clubs')
      .update({ admin_permissions: perms, updated_at: new Date().toISOString() })
      .eq('id', clubId);

    if (error) return { error: error.message };

    // Log permission change
    try {
      const { data: clubInfo } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      const { data: userInfo } = await supabase.from('user_profiles').select('username, email').eq('id', userId).single();
      logAdminAction({
        actionType: 'coadmin_permission_change',
        targetType: 'club',
        targetId: clubId,
        targetName: clubInfo?.name || clubId,
        actionDetail: `${userInfo?.username || userInfo?.email || userId}: ${previousPermission} → ${permission}`,
        metadata: { coAdminId: userId, from: previousPermission, to: permission },
      });
    } catch { /* silent */ }

    // Send push notification about permission change
    try {
      const { data: clubInfo } = await supabase.from('clubs').select('name').eq('id', clubId).single();
      if (clubInfo) {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'co_admin',
            payload: {
              targetUserId: userId,
              clubName: clubInfo.name,
              clubId,
              action: 'permission_changed',
              newPermission: permission,
            },
          },
        });
      }
    } catch { /* silent */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get current user's permission level for a club.
 */
export async function getMyCoAdminPermission(clubId: string): Promise<CoAdminPermission | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return null;

    const { data: club } = await supabase
      .from('clubs')
      .select('admin_user_ids, admin_permissions')
      .eq('id', clubId)
      .single();

    if (!club) return null;
    const adminIds: string[] = club.admin_user_ids || [];
    if (!adminIds.includes(userData.user.id)) return null;

    const perms: Record<string, string> = club.admin_permissions || {};
    return (perms[userData.user.id] as CoAdminPermission) || 'edit';
  } catch {
    return null;
  }
}

/**
 * Check if current user is a co-admin of a club.
 */
export async function isClubCoAdmin(clubId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return false;

    const { data: club } = await supabase
      .from('clubs')
      .select('admin_user_ids')
      .eq('id', clubId)
      .single();

    if (!club) return false;
    const adminIds: string[] = club.admin_user_ids || [];
    return adminIds.includes(userData.user.id);
  } catch {
    return false;
  }
}
