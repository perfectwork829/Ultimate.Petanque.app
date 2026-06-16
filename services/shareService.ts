/**
 * Share Service
 * Manages public share links (shared_items table), share code generation/redemption,
 * auto-import of shared items, and share notifications.
 */
import { getSupabaseClient } from '@/template';

// ============================================
// Types
// ============================================

export type ShareItemType = 'player' | 'club' | 'terrain' | 'tournament' | 'match' | 'challenge';
export type SharePermission = 'read' | 'write';

export interface SharedItem {
  id: string;
  ownerId: string;
  sharedWithId?: string;
  shareCode: string;
  itemType: ShareItemType;
  itemId: string;
  permission: SharePermission;
  isPublicLink: boolean;
  expiresAt?: string;
  createdAt: string;
  associatedItems?: { type: ShareItemType; id: string }[];
}

// ============================================
// Helpers
// ============================================

function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Map a shared_items DB row to the SharedItem interface. */
function mapSharedItemRow(s: any): SharedItem {
  return {
    id: s.id,
    ownerId: s.owner_id,
    sharedWithId: s.shared_with_id,
    shareCode: s.share_code,
    itemType: s.item_type,
    itemId: s.item_id,
    permission: s.permission,
    isPublicLink: s.is_public_link,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
    associatedItems: s.associated_items,
  };
}

/** Map a share_notifications DB row to the ShareNotification interface. */
function mapNotificationRow(n: any): ShareNotification {
  return {
    id: n.id,
    ownerId: n.owner_id,
    accessorId: n.accessor_id,
    accessorName: n.accessor_name,
    accessorEmail: n.accessor_email,
    itemType: n.item_type,
    itemId: n.item_id,
    itemName: n.item_name,
    permission: n.permission,
    shareCode: n.share_code,
    isRead: n.is_read,
    createdAt: n.created_at,
  };
}

export interface AssociatedItem {
  type: ShareItemType;
  id: string;
}

// ============================================
// Share Link CRUD
// ============================================

export async function createShareLink(
  itemType: ShareItemType,
  itemId: string,
  permission: SharePermission = 'read',
  associatedItems?: AssociatedItem[],
  expiresAt?: string | null,
): Promise<{ shareCode: string; shareUrl: string; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) return { shareCode: '', shareUrl: '', error: 'Not connected' };
  if (!itemId) return { shareCode: '', shareUrl: '', error: 'Item ID is required' };

  // Retry up to 3 times in case of share_code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const shareCode = generateShareCode();
    const shareUrl = `ultimatepetanque://share/${shareCode}`;
    const insertData: any = {
      owner_id: userData.user.id,
      share_code: shareCode,
      item_type: itemType,
      item_id: itemId,
      permission,
      is_public_link: true,
    };
    // Store associated items if provided
    if (associatedItems && associatedItems.length > 0) {
      insertData.associated_items = associatedItems;
    }
    // Store expiration date if provided
    if (expiresAt) {
      insertData.expires_at = expiresAt;
    }
    const { error } = await supabase.from('shared_items').insert(insertData);
    if (!error) return { shareCode, shareUrl, error: null };
    // If it's a unique constraint violation on share_code, retry with new code
    if (error.code === '23505' && error.message?.includes('share_code')) continue;
    return { shareCode: '', shareUrl: '', error: error.message };
  }
  return { shareCode: '', shareUrl: '', error: 'Failed to generate unique share code' };
}

export interface RedeemResult {
  itemType: ShareItemType;
  itemId: string;
  permission: SharePermission;
  error: string | null;
  autoSavedItems: { type: ShareItemType; id: string; newItemId: string | null }[];
}

export async function redeemShareCode(shareCode: string): Promise<RedeemResult> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { itemType: 'player', itemId: '', permission: 'read', error: 'Not connected', autoSavedItems: [] };

  const { data, error } = await supabase.from('shared_items').select('*')
    .eq('share_code', shareCode).eq('is_public_link', true).single();
  if (error || !data) return { itemType: 'player', itemId: '', permission: 'read', error: 'Invalid share code', autoSavedItems: [] };
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return { itemType: 'player', itemId: '', permission: 'read', error: 'This share link has expired', autoSavedItems: [] };

  // If owner is redeeming their own code, just return info
  if (data.owner_id === userData.user.id)
    return { itemType: data.item_type, itemId: data.item_id, permission: data.permission, error: null, autoSavedItems: [] };

  // Create share entry for the main item (always read-only)
  const { data: existing } = await supabase.from('shared_items').select('id')
    .eq('item_type', data.item_type).eq('item_id', data.item_id)
    .eq('shared_with_id', userData.user.id).maybeSingle();
  if (!existing) {
    await supabase.from('shared_items').insert({
      owner_id: data.owner_id, shared_with_id: userData.user.id, share_code: generateShareCode(),
      item_type: data.item_type, item_id: data.item_id, permission: 'read', is_public_link: false,
    });
  }

  // Process associated items
  const associatedItems: { type: ShareItemType; id: string }[] = data.associated_items || [];
  for (const assoc of associatedItems) {
    const { data: assocExisting } = await supabase.from('shared_items').select('id')
      .eq('item_type', assoc.type).eq('item_id', assoc.id)
      .eq('shared_with_id', userData.user.id).maybeSingle();
    if (!assocExisting) {
      await supabase.from('shared_items').insert({
        owner_id: data.owner_id, shared_with_id: userData.user.id, share_code: generateShareCode(),
        item_type: assoc.type, item_id: assoc.id, permission: 'read', is_public_link: false,
      });
    }
  }

  // Send notification to owner
  const { data: accessorProfile } = await supabase.from('user_profiles')
    .select('username, email').eq('id', userData.user.id).single();

  let itemName: string | null = null;
  try {
    if (data.item_type === 'player') {
      const { data: p } = await supabase.from('players').select('name').eq('id', data.item_id).single();
      itemName = p?.name || null;
    } else if (data.item_type === 'club') {
      const { data: c } = await supabase.from('clubs').select('name').eq('id', data.item_id).single();
      itemName = c?.name || null;
    } else if (data.item_type === 'terrain') {
      const { data: tr } = await supabase.from('terrains').select('name').eq('id', data.item_id).single();
      itemName = tr?.name || null;
    } else if (data.item_type === 'tournament') {
      const { data: to } = await supabase.from('tournaments').select('name').eq('id', data.item_id).single();
      itemName = to?.name || null;
    } else if (data.item_type === 'match') {
      const { data: m } = await supabase.from('matches').select('team_a, team_b, date').eq('id', data.item_id).single();
      if (m) {
        const d = new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        itemName = `${m.team_a?.playerNames?.[0] || 'A'} vs ${m.team_b?.playerNames?.[0] || 'B'} (${d})`;
      }
    } else if (data.item_type === 'challenge') {
      const { data: ch } = await supabase.from('challenges').select('type, date, player_name').eq('id', data.item_id).single();
      if (ch) {
        const d = new Date(ch.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        itemName = `${ch.type} - ${ch.player_name || ''} (${d})`;
      }
    }
  } catch { /* ignore */ }

  await supabase.from('share_notifications').insert({
    owner_id: data.owner_id, accessor_id: userData.user.id,
    accessor_name: accessorProfile?.username || userData.user.email?.split('@')[0] || 'User',
    accessor_email: accessorProfile?.email || userData.user.email,
    item_type: data.item_type, item_id: data.item_id, item_name: itemName,
    permission: 'read', share_code: shareCode, is_read: false,
  });

  // Auto-save all items to recipient's directory
  const autoSavedItems: { type: ShareItemType; id: string; newItemId: string | null }[] = [];

  // Save main item
  const mainSave = await saveSharedItemToMyAccount(data.item_type, data.item_id);
  autoSavedItems.push({ type: data.item_type, id: data.item_id, newItemId: mainSave.newItemId });

  // Save associated items
  for (const assoc of associatedItems) {
    const assocSave = await saveSharedItemToMyAccount(assoc.type, assoc.id);
    autoSavedItems.push({ type: assoc.type, id: assoc.id, newItemId: assocSave.newItemId });
  }

  return { itemType: data.item_type, itemId: data.item_id, permission: 'read', error: null, autoSavedItems };
}

// ============================================
// Shared Items Queries
// ============================================

export async function getMySharedItems(): Promise<{ items: SharedItem[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { items: [], error: 'Not connected' };
  const { data, error } = await supabase.from('shared_items').select('*')
    .eq('owner_id', userData.user.id).eq('is_public_link', true).order('created_at', { ascending: false });
  if (error) return { items: [], error: error.message };
  return { items: (data || []).map(mapSharedItemRow), error: null };
}

export async function getSharedWithMe(): Promise<{ items: SharedItem[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { items: [], error: 'Not connected' };
  const { data, error } = await supabase.from('shared_items').select('*')
    .eq('shared_with_id', userData.user.id).order('created_at', { ascending: false });
  if (error) return { items: [], error: error.message };
  return { items: (data || []).map(mapSharedItemRow), error: null };
}

// ============================================
// Share Notifications
// ============================================

export interface ShareNotification {
  id: string;
  ownerId: string;
  accessorId: string;
  accessorName: string | null;
  accessorEmail: string | null;
  itemType: ShareItemType;
  itemId: string;
  itemName: string | null;
  permission: SharePermission;
  shareCode: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getShareNotifications(): Promise<{ notifications: ShareNotification[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { notifications: [], error: 'Not connected' };
  const { data, error } = await supabase.from('share_notifications').select('*')
    .eq('owner_id', userData.user.id).order('created_at', { ascending: false });
  if (error) return { notifications: [], error: error.message };
  return { notifications: (data || []).map(mapNotificationRow), error: null };
}

export async function getUnreadShareNotificationCount(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return 0;
  const { count, error } = await supabase.from('share_notifications')
    .select('*', { count: 'exact', head: true }).eq('owner_id', userData.user.id).eq('is_read', false);
  if (error) return 0;
  return count || 0;
}

export async function markShareNotificationsRead(ids?: string[]): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { error: 'Not connected' };
  let query = supabase.from('share_notifications').update({ is_read: true }).eq('owner_id', userData.user.id);
  if (ids && ids.length > 0) { query = query.in('id', ids); } else { query = query.eq('is_read', false); }
  const { error } = await query;
  return { error: error?.message || null };
}

export async function deleteShareNotification(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('share_notifications').delete().eq('id', id);
  return { error: error?.message || null };
}

export async function revokeShare(shareId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('shared_items').delete().eq('id', shareId);
  return { error: error?.message || null };
}

export async function updateSharePermission(shareId: string, permission: SharePermission): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('shared_items')
    .update({ permission, updated_at: new Date().toISOString() }).eq('id', shareId);
  return { error: error?.message || null };
}

// ============================================
// Item Name Resolution
// ============================================

export async function fetchItemName(itemType: ShareItemType, itemId: string): Promise<string> {
  const supabase = getSupabaseClient();
  try {
    if (itemType === 'player') { const { data } = await supabase.from('players').select('name').eq('id', itemId).single(); return data?.name || 'Unknown player'; }
    if (itemType === 'club') { const { data } = await supabase.from('clubs').select('name').eq('id', itemId).single(); return data?.name || 'Unknown club'; }
    if (itemType === 'terrain') { const { data } = await supabase.from('terrains').select('name').eq('id', itemId).single(); return data?.name || 'Unknown terrain'; }
    if (itemType === 'tournament') { const { data } = await supabase.from('tournaments').select('name').eq('id', itemId).single(); return data?.name || 'Unknown tournament'; }
    if (itemType === 'match') {
      const { data } = await supabase.from('matches').select('team_a, team_b').eq('id', itemId).single();
      if (data) return `${data.team_a?.playerNames?.[0] || '?'} vs ${data.team_b?.playerNames?.[0] || '?'}`;
    }
    if (itemType === 'challenge') {
      const { data } = await supabase.from('challenges').select('type, player_name').eq('id', itemId).single();
      if (data) return `${data.type} - ${data.player_name || '?'}`;
    }
  } catch { /* ignore */ }
  return 'Unknown';
}

// ============================================
// Share Access Tracking
// ============================================

export interface ShareAccessLog {
  id: string;
  sharedItemId: string;
  ownerId: string;
  viewerId: string;
  viewerName?: string;
  viewerEmail?: string;
  itemType: ShareItemType;
  itemId: string;
  sourcePage?: string;
  viewedAt: string;
}

/**
 * Record a view on a shared item. Increments view_count and updates last_viewed_at.
 * Also sends a notification to the owner on first view by this viewer.
 */
export async function recordShareView(
  itemType: ShareItemType,
  itemId: string,
  sourcePage?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { error: null }; // silent fail for anonymous

  try {
    // Find shared_items entries where this user is the recipient
    const { data: sharedEntries } = await supabase.from('shared_items').select('id, owner_id')
      .eq('item_type', itemType).eq('item_id', itemId)
      .eq('shared_with_id', userData.user.id);

    if (!sharedEntries || sharedEntries.length === 0) return { error: null };

    for (const entry of sharedEntries) {
      // Check if this is the first view by this viewer for this shared item
      const { data: existingView } = await supabase.from('share_access_logs').select('id')
        .eq('shared_item_id', entry.id).eq('viewer_id', userData.user.id).limit(1).maybeSingle();

      const isFirstView = !existingView;

      // Insert access log
      await supabase.from('share_access_logs').insert({
        shared_item_id: entry.id,
        owner_id: entry.owner_id,
        viewer_id: userData.user.id,
        item_type: itemType,
        item_id: itemId,
        source_page: sourcePage || null,
      });

      // Update shared_items counters
      const updateData: any = {
        view_count: (await supabase.from('share_access_logs').select('id', { count: 'exact', head: true }).eq('shared_item_id', entry.id)).count || 0,
        last_viewed_at: new Date().toISOString(),
      };
      if (isFirstView) {
        // Set first_viewed_at only if not already set
        const { data: current } = await supabase.from('shared_items').select('first_viewed_at').eq('id', entry.id).single();
        if (!current?.first_viewed_at) {
          updateData.first_viewed_at = new Date().toISOString();
        }
      }
      await supabase.from('shared_items').update(updateData).eq('id', entry.id);

      // Send notification to owner on first view by this viewer
      if (isFirstView && entry.owner_id !== userData.user.id) {
        const { data: viewerProfile } = await supabase.from('user_profiles')
          .select('username, email').eq('id', userData.user.id).single();

        let itemName: string | null = null;
        try { itemName = await fetchItemName(itemType, itemId); } catch { /* ignore */ }

        await supabase.from('share_notifications').insert({
          owner_id: entry.owner_id,
          accessor_id: userData.user.id,
          accessor_name: viewerProfile?.username || userData.user.email?.split('@')[0] || 'User',
          accessor_email: viewerProfile?.email || userData.user.email,
          item_type: itemType,
          item_id: itemId,
          item_name: itemName,
          permission: 'read',
          share_code: null,
          is_read: false,
        });
      }
    }
    return { error: null };
  } catch (e: any) {
    console.log('Error recording share view:', e);
    return { error: e.message || 'Error recording view' };
  }
}

/**
 * Get access logs for a specific shared item (owner only).
 */
export async function getShareAccessLogs(sharedItemId: string): Promise<{ logs: ShareAccessLog[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('share_access_logs').select('*')
    .eq('shared_item_id', sharedItemId).order('viewed_at', { ascending: false }).limit(50);
  if (error) return { logs: [], error: error.message };

  // Enrich with viewer names
  const viewerIds = [...new Set((data || []).map((d: any) => d.viewer_id))];
  const viewerMap: Record<string, { name: string; email: string }> = {};
  if (viewerIds.length > 0) {
    const { data: profiles } = await supabase.from('user_profiles').select('id, username, email').in('id', viewerIds);
    (profiles || []).forEach((p: any) => { viewerMap[p.id] = { name: p.username || p.email?.split('@')[0] || 'User', email: p.email }; });
  }

  const logs: ShareAccessLog[] = (data || []).map((d: any) => ({
    id: d.id,
    sharedItemId: d.shared_item_id,
    ownerId: d.owner_id,
    viewerId: d.viewer_id,
    viewerName: viewerMap[d.viewer_id]?.name,
    viewerEmail: viewerMap[d.viewer_id]?.email,
    itemType: d.item_type,
    itemId: d.item_id,
    sourcePage: d.source_page,
    viewedAt: d.viewed_at,
  }));
  return { logs, error: null };
}

/**
 * Get view stats for all of the current user's shared items.
 * Returns a map of sharedItemId -> { viewCount, lastViewedAt, firstViewedAt, uniqueViewers }.
 */
export interface ShareViewStats {
  viewCount: number;
  lastViewedAt: string | null;
  firstViewedAt: string | null;
  uniqueViewers: number;
}

export async function getMyShareViewStats(): Promise<{ stats: Record<string, ShareViewStats>; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { stats: {}, error: 'Not connected' };

  const { data, error } = await supabase.from('shared_items').select('id, view_count, last_viewed_at, first_viewed_at')
    .eq('owner_id', userData.user.id).eq('is_public_link', true).gt('view_count', 0);

  if (error) return { stats: {}, error: error.message };

  // Get unique viewer counts from access logs
  const stats: Record<string, ShareViewStats> = {};
  for (const item of (data || [])) {
    const { count } = await supabase.from('share_access_logs').select('viewer_id', { count: 'exact', head: true })
      .eq('shared_item_id', item.id);
    // Get distinct viewers
    const { data: viewers } = await supabase.from('share_access_logs').select('viewer_id')
      .eq('shared_item_id', item.id);
    const uniqueSet = new Set((viewers || []).map((v: any) => v.viewer_id));

    stats[item.id] = {
      viewCount: item.view_count || 0,
      lastViewedAt: item.last_viewed_at,
      firstViewedAt: item.first_viewed_at,
      uniqueViewers: uniqueSet.size,
    };
  }
  return { stats, error: null };
}

/**
 * Extend or remove expiration on an existing share.
 */
export async function extendShareExpiration(shareId: string, newExpiresAt: string | null): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('shared_items')
    .update({ expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('id', shareId);
  return { error: error?.message || null };
}

/**
 * Regenerate a share code (old code stops working). Optionally set new expiration.
 */
export async function regenerateShareCode(shareId: string, expiresAt?: string | null): Promise<{ newShareCode: string; error: string | null }> {
  const supabase = getSupabaseClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const newCode = generateShareCode();
    const updateData: any = { share_code: newCode, updated_at: new Date().toISOString() };
    if (expiresAt !== undefined) updateData.expires_at = expiresAt;
    const { error } = await supabase.from('shared_items').update(updateData).eq('id', shareId);
    if (!error) return { newShareCode: newCode, error: null };
    if (error.code === '23505' && error.message?.includes('share_code')) continue;
    return { newShareCode: '', error: error.message };
  }
  return { newShareCode: '', error: 'Failed to generate unique share code' };
}

// ============================================
// Share Analytics
// ============================================

export interface ShareAnalyticsData {
  viewsByDay: { date: string; label: string; count: number }[];
  topItems: { itemName: string; itemType: ShareItemType; viewCount: number }[];
  peakHours: { hour: number; count: number }[];
  totalViews: number;
  totalUniqueViewers: number;
}

export async function getShareAnalyticsData(language: string = 'fr'): Promise<{ data: ShareAnalyticsData | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { data: null, error: 'Not connected' };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: logs, error } = await supabase.from('share_access_logs')
    .select('*')
    .eq('owner_id', userData.user.id)
    .gte('viewed_at', thirtyDaysAgo.toISOString())
    .order('viewed_at', { ascending: false })
    .limit(500);

  if (error) return { data: null, error: error.message };
  if (!logs || logs.length === 0) {
    return { data: { viewsByDay: [], topItems: [], peakHours: [], totalViews: 0, totalUniqueViewers: 0 }, error: null };
  }

  // Views by day (last 7 days)
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const viewsByDay: { date: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = logs.filter((l: any) => l.viewed_at.startsWith(dateStr)).length;
    const label = d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
    viewsByDay.push({ date: dateStr, label: label.charAt(0).toUpperCase() + label.slice(1), count });
  }

  // Top items by view count
  const itemCounts: Record<string, { type: string; id: string; count: number }> = {};
  logs.forEach((l: any) => {
    const key = `${l.item_type}_${l.item_id}`;
    if (!itemCounts[key]) itemCounts[key] = { type: l.item_type, id: l.item_id, count: 0 };
    itemCounts[key].count++;
  });
  const sortedItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 5);
  const topItems: { itemName: string; itemType: ShareItemType; viewCount: number }[] = [];
  for (const item of sortedItems) {
    const name = await fetchItemName(item.type as ShareItemType, item.id);
    topItems.push({ itemName: name, itemType: item.type as ShareItemType, viewCount: item.count });
  }

  // Peak hours (grouped into 3-hour blocks)
  const hourRaw: number[] = new Array(24).fill(0);
  logs.forEach((l: any) => { hourRaw[new Date(l.viewed_at).getHours()]++; });
  const peakHours = hourRaw.map((count, hour) => ({ hour, count }));

  const uniqueViewers = new Set(logs.map((l: any) => l.viewer_id));

  return {
    data: {
      viewsByDay,
      topItems,
      peakHours,
      totalViews: logs.length,
      totalUniqueViewers: uniqueViewers.size,
    },
    error: null,
  };
}

export async function isSharedWithMe(itemType: ShareItemType, itemId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return false;
  const { data } = await supabase.from('shared_items').select('id')
    .eq('item_type', itemType).eq('item_id', itemId).eq('shared_with_id', userData.user.id).maybeSingle();
  return !!data;
}

// ============================================
// Shared Item Import (auto-save to recipient)
// ============================================

/** Import a shared match with team perspective swapped for the recipient. */
async function importSharedMatch(userId: string, matchId: string): Promise<{ newItemId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data: source, error: fetchErr } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (fetchErr || !source) return { newItemId: null, error: 'Match not found' };

    const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', userId).single();
    const recipientName = (profile?.username || '').toLowerCase();

    const isInTeamB = source.team_b?.players?.includes(userId) ||
      (recipientName && source.team_b?.playerNames?.some((n: string) => n.toLowerCase().includes(recipientName)));
    const isInTeamA = source.team_a?.players?.includes(userId) ||
      (recipientName && source.team_a?.playerNames?.some((n: string) => n.toLowerCase().includes(recipientName)));
    const shouldSwap = isInTeamB || (!isInTeamA && !isInTeamB);

    const teamA = shouldSwap ? source.team_b : source.team_a;
    const teamB = shouldSwap ? source.team_a : source.team_b;
    const winner = shouldSwap ? (source.winner === 'A' ? 'B' : 'A') : source.winner;

    let playerActions = source.player_actions;
    if (playerActions && shouldSwap) {
      playerActions = playerActions.map((pa: any) => ({ ...pa, team: pa.team === 'A' ? 'B' : 'A' }));
    }
    let menes = source.menes;
    if (menes && shouldSwap) {
      menes = menes.map((m: any) => ({ ...m, teamAPoints: m.teamBPoints || 0, teamBPoints: m.teamAPoints || 0 }));
    }
    let seriesInfo = source.series_info;
    if (seriesInfo && shouldSwap) {
      seriesInfo = { ...seriesInfo,
        winsBeforeThisMatch: { teamA: seriesInfo.winsBeforeThisMatch?.teamB || 0, teamB: seriesInfo.winsBeforeThisMatch?.teamA || 0 },
        seriesWinner: seriesInfo.seriesWinner === 'A' ? 'B' : seriesInfo.seriesWinner === 'B' ? 'A' : seriesInfo.seriesWinner,
      };
    }

    const { data: newItem, error: insertErr } = await supabase.from('matches').insert({
      user_id: userId, date: source.date, mode: source.mode, format: source.format,
      tournament_name: source.tournament_name, tournament_phase: source.tournament_phase,
      tournament_bracket: source.tournament_bracket, terrain_type: source.terrain_type,
      team_a: teamA, team_b: teamB, winner, duration: source.duration,
      menes, player_actions: playerActions, series_info: seriesInfo,
    }).select('id').single();
    if (insertErr) return { newItemId: null, error: insertErr.message };
    return { newItemId: newItem?.id || null, error: null };
  } catch (e: any) { return { newItemId: null, error: e.message || 'Error importing match' }; }
}

/** Import a shared challenge with perspective adapted for the recipient. */
async function importSharedChallenge(userId: string, challengeId: string): Promise<{ newItemId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data: source, error: fetchErr } = await supabase.from('challenges').select('*').eq('id', challengeId).single();
    if (fetchErr || !source) return { newItemId: null, error: 'Challenge not found' };

    const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', userId).single();
    const recipientName = (profile?.username || '').toLowerCase();
    const isOpponent = source.opponent_id === userId ||
      (recipientName && source.opponent_name?.toLowerCase().includes(recipientName));

    if (isOpponent && source.mode === '1v1') {
      const swappedWinner = source.winner === 'player' ? 'opponent' : source.winner === 'opponent' ? 'player' : source.winner;
      const opponentResult = {
        playerId: source.player_id, playerName: source.player_name, shots: source.shots,
        precisionShots: source.precision_shots, successCount: source.success_count,
        totalShots: source.total_shots, carreauCount: source.carreau_count,
        successRate: source.success_rate, totalPoints: source.total_points, atelierScores: source.atelier_scores,
      };
      const { data: newItem, error: insertErr } = await supabase.from('challenges').insert({
        user_id: userId, type: source.type, mode: source.mode, date: source.date,
        player_id: source.opponent_id || userId, player_name: source.opponent_name || profile?.username || '',
        opponent_id: source.player_id, opponent_name: source.player_name, opponent_result: opponentResult,
        winner: swappedWinner, shots: source.opponent_result?.shots || null,
        success_count: source.opponent_result?.successCount || 0,
        total_shots: source.opponent_result?.totalShots || source.total_shots,
        carreau_count: source.opponent_result?.carreauCount || 0,
        success_rate: source.opponent_result?.successRate || 0,
        precision_shots: source.opponent_result?.precisionShots || null,
        total_points: source.opponent_result?.totalPoints || null,
        max_points: source.max_points, atelier_scores: source.opponent_result?.atelierScores || null,
        duration: source.duration, detailed_shots: source.detailed_shots,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    } else {
      const { data: newItem, error: insertErr } = await supabase.from('challenges').insert({
        user_id: userId, type: source.type, mode: source.mode, date: source.date,
        player_id: source.player_id, player_name: source.player_name,
        opponent_id: source.opponent_id, opponent_name: source.opponent_name,
        opponent_result: source.opponent_result, winner: source.winner, shots: source.shots,
        success_count: source.success_count, total_shots: source.total_shots,
        carreau_count: source.carreau_count, success_rate: source.success_rate,
        precision_shots: source.precision_shots, total_points: source.total_points,
        max_points: source.max_points, atelier_scores: source.atelier_scores,
        duration: source.duration, detailed_shots: source.detailed_shots,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    }
  } catch (e: any) { return { newItemId: null, error: e.message || 'Error importing challenge' }; }
}

export async function saveSharedItemToMyAccount(itemType: ShareItemType, itemId: string): Promise<{ newItemId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { newItemId: null, error: 'Not connected' };

  if (itemType === 'match') return importSharedMatch(userData.user.id, itemId);
  if (itemType === 'challenge') return importSharedChallenge(userData.user.id, itemId);

  try {
    if (itemType === 'player') {
      const { data: source, error: fetchErr } = await supabase.from('players').select('*').eq('id', itemId).single();
      if (fetchErr || !source) return { newItemId: null, error: 'Player not found' };
      // Check if already exists (by name) to avoid duplicates
      const { data: existing } = await supabase.from('players').select('id').eq('user_id', userData.user.id).eq('name', source.name).maybeSingle();
      if (existing) return { newItemId: existing.id, error: null }; // Already saved
      const { data: newItem, error: insertErr } = await supabase.from('players').insert({
        user_id: userData.user.id, name: source.name, nickname: source.nickname, avatar: source.avatar,
        club: source.club, club_id: null, role: source.role, level: source.level, location: source.location,
        phone: null, email: null, country: source.country, boules: source.boules,
        handedness: source.handedness, terrain_id: null, terrain_name: source.terrain_name,
        is_public: false, stats: source.stats,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    } else if (itemType === 'club') {
      const { data: source, error: fetchErr } = await supabase.from('clubs').select('*').eq('id', itemId).single();
      if (fetchErr || !source) return { newItemId: null, error: 'Club not found' };
      const { data: existing } = await supabase.from('clubs').select('id').eq('user_id', userData.user.id).eq('name', source.name).maybeSingle();
      if (existing) return { newItemId: existing.id, error: null };
      const { data: newItem, error: insertErr } = await supabase.from('clubs').insert({
        user_id: userData.user.id, name: source.name, logo: source.logo, address: source.address,
        city: source.city, country: source.country, location: source.location, members_count: source.members_count,
        founded_year: source.founded_year, description: source.description, facilities: source.facilities,
        contact_email: null, contact_phone: null, terrain_id: null,
        terrain_name: source.terrain_name, membership_cost: source.membership_cost,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    } else if (itemType === 'terrain') {
      const { data: source, error: fetchErr } = await supabase.from('terrains').select('*').eq('id', itemId).single();
      if (fetchErr || !source) return { newItemId: null, error: 'Terrain not found' };
      const { data: existing } = await supabase.from('terrains').select('id').eq('user_id', userData.user.id).eq('name', source.name).maybeSingle();
      if (existing) return { newItemId: existing.id, error: null };
      const { data: newItem, error: insertErr } = await supabase.from('terrains').insert({
        user_id: userData.user.id, name: source.name, address: source.address, city: source.city,
        location: source.location, type: source.type, description: source.description, facilities: source.facilities,
        photos: source.photos, club_id: null, club_name: source.club_name, is_public: false,
        courts_count: source.courts_count, lighting: source.lighting, covered: source.covered,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    } else if (itemType === 'tournament') {
      const { data: source, error: fetchErr } = await supabase.from('tournaments').select('*').eq('id', itemId).single();
      if (fetchErr || !source) return { newItemId: null, error: 'Tournament not found' };
      const { data: existing } = await supabase.from('tournaments').select('id').eq('user_id', userData.user.id).eq('name', source.name).maybeSingle();
      if (existing) return { newItemId: existing.id, error: null };
      const { data: newItem, error: insertErr } = await supabase.from('tournaments').insert({
        user_id: userData.user.id, name: source.name, date: source.date, end_date: source.end_date,
        type: source.type, format: source.format, location: source.location, terrain_id: null,
        terrain_name: source.terrain_name, terrain_type: source.terrain_type, club_id: null,
        club_name: source.club_name, status: source.status, participants: source.participants,
        max_participants: source.max_participants, prize: source.prize, description: source.description,
        tournament_level: source.tournament_level, tournament_category: source.tournament_category,
        registration_type: source.registration_type, tournament_scope: source.tournament_scope,
        registration_cost: source.registration_cost,
      }).select('id').single();
      if (insertErr) return { newItemId: null, error: insertErr.message };
      return { newItemId: newItem?.id || null, error: null };
    }
    return { newItemId: null, error: 'Unsupported type' };
  } catch (e: any) { return { newItemId: null, error: e.message || 'Error during copy' }; }
}
