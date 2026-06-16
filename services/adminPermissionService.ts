/**
 * Admin Permission Service
 *
 * Granular role-based permissions for admin users.
 * Permissions: moderation, clubs, terrains, users, announcements, sponsors, maintenance, reports, full_access
 */

import { getSupabaseClient } from '@/template';

export const ADMIN_PERMISSIONS = {
  full_access: { labelFr: 'Acces complet', labelEn: 'Full Access', icon: 'admin-panel-settings', color: '#DC2626', description_fr: 'Toutes les permissions admin', description_en: 'All admin permissions' },
  moderation: { labelFr: 'Moderation', labelEn: 'Moderation', icon: 'gavel', color: '#EF4444', description_fr: 'Signalements, bans, appels', description_en: 'Reports, bans, appeals' },
  clubs: { labelFr: 'Clubs', labelEn: 'Clubs', icon: 'home', color: '#7C3AED', description_fr: 'Verification, fusion, gestion clubs', description_en: 'Verification, merge, club management' },
  terrains: { labelFr: 'Terrains', labelEn: 'Terrains', icon: 'sports-soccer', color: '#10B981', description_fr: 'Edition, fusion, doublons terrains', description_en: 'Edit, merge, terrain duplicates' },
  users: { labelFr: 'Utilisateurs', labelEn: 'Users', icon: 'people', color: '#3B82F6', description_fr: 'Premium, admin, profils', description_en: 'Premium, admin, profiles' },
  announcements: { labelFr: 'Annonces', labelEn: 'Announcements', icon: 'campaign', color: '#7C3AED', description_fr: 'Push notifications ciblees', description_en: 'Targeted push notifications' },
  sponsors: { labelFr: 'Sponsors', labelEn: 'Sponsors', icon: 'handshake', color: '#D97706', description_fr: 'Ambassadeurs et partenaires', description_en: 'Ambassadors and partners' },
  maintenance: { labelFr: 'Maintenance', labelEn: 'Maintenance', icon: 'construction', color: '#D97706', description_fr: 'Mode maintenance et systeme', description_en: 'Maintenance mode and system' },
  reports: { labelFr: 'Rapports', labelEn: 'Reports', icon: 'assessment', color: '#0EA5E9', description_fr: 'Statistiques et exports', description_en: 'Statistics and exports' },
  read_only: { labelFr: 'Lecture seule', labelEn: 'Read Only', icon: 'visibility', color: '#94A3B8', description_fr: 'Consultation sans modification', description_en: 'View without editing' },
} as const;

export type PermissionKey = keyof typeof ADMIN_PERMISSIONS;

export interface UserPermission {
  id: string;
  userId: string;
  permission: PermissionKey;
  grantedBy: string | null;
  createdAt: string;
}

/**
 * Get all permissions for a specific user.
 */
export async function getUserPermissions(userId: string): Promise<{ permissions: PermissionKey[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('admin_permissions')
      .select('permission')
      .eq('user_id', userId);
    if (error) return { permissions: [], error: error.message };
    return { permissions: (data || []).map((r: any) => r.permission as PermissionKey), error: null };
  } catch (e: any) {
    return { permissions: [], error: e.message };
  }
}

/**
 * Get permissions for multiple users at once.
 */
export async function getBulkUserPermissions(userIds: string[]): Promise<{ permissionsMap: Map<string, PermissionKey[]>; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('admin_permissions')
      .select('user_id, permission')
      .in('user_id', userIds);
    if (error) return { permissionsMap: new Map(), error: error.message };
    const map = new Map<string, PermissionKey[]>();
    (data || []).forEach((r: any) => {
      if (!map.has(r.user_id)) map.set(r.user_id, []);
      map.get(r.user_id)!.push(r.permission as PermissionKey);
    });
    return { permissionsMap: map, error: null };
  } catch (e: any) {
    return { permissionsMap: new Map(), error: e.message };
  }
}

/**
 * Grant a permission to a user.
 */
export async function grantPermission(userId: string, permission: PermissionKey): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('admin_permissions').upsert({
      user_id: userId,
      permission,
      granted_by: user?.id || null,
    }, { onConflict: 'user_id,permission' });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Revoke a permission from a user.
 */
export async function revokePermission(userId: string, permission: PermissionKey): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('admin_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission', permission);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Set all permissions for a user (replace existing).
 */
export async function setUserPermissions(userId: string, permissions: PermissionKey[]): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    // Delete all existing permissions
    await supabase.from('admin_permissions').delete().eq('user_id', userId);
    // Insert new permissions
    if (permissions.length > 0) {
      const rows = permissions.map(p => ({
        user_id: userId,
        permission: p,
        granted_by: user?.id || null,
      }));
      const { error } = await supabase.from('admin_permissions').insert(rows);
      if (error) return { error: error.message };
    }
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check if a user has a specific permission (or full_access).
 */
export async function hasPermission(userId: string, permission: PermissionKey): Promise<boolean> {
  const { permissions } = await getUserPermissions(userId);
  if (permissions.includes('full_access')) return true;
  return permissions.includes(permission);
}
