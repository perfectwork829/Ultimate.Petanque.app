import { getSupabaseClient } from '@/template';

export interface MergeLog {
  id: string;
  userId: string;
  mergeType: 'player' | 'club' | 'terrain' | 'tournament';
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  sourceSnapshot: Record<string, any>;
  reassignedRelations: ReassignedRelation[];
  createdAt: string;
}

export interface ReassignedRelation {
  type: 'player' | 'club' | 'terrain' | 'tournament' | 'match';
  id: string;
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Save a merge log before deleting the source item.
 */
export async function saveMergeLog(params: {
  mergeType: string;
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  sourceSnapshot: Record<string, any>;
  reassignedRelations: ReassignedRelation[];
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, error: 'Not authenticated' };

  const { data, error } = await supabase.from('merge_logs').insert({
    user_id: user.id,
    merge_type: params.mergeType,
    target_id: params.targetId,
    target_name: params.targetName,
    source_id: params.sourceId,
    source_name: params.sourceName,
    source_snapshot: params.sourceSnapshot,
    reassigned_relations: params.reassignedRelations,
  }).select('id').single();

  if (error) return { id: null, error: error.message };
  return { id: data?.id || null, error: null };
}

/**
 * Fetch recent merge logs (last 30 days).
 */
export async function getMergeLogs(): Promise<{ logs: MergeLog[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('merge_logs')
    .select('*')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { logs: [], error: error.message };

  const logs: MergeLog[] = (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    mergeType: row.merge_type,
    targetId: row.target_id,
    targetName: row.target_name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceSnapshot: row.source_snapshot,
    reassignedRelations: row.reassigned_relations || [],
    createdAt: row.created_at,
  }));

  return { logs, error: null };
}

/**
 * Check if a merge log is within the 24h undo window.
 */
export function isUndoable(log: MergeLog): boolean {
  const createdAt = new Date(log.createdAt).getTime();
  const now = Date.now();
  return (now - createdAt) < 24 * 60 * 60 * 1000;
}

/**
 * Get remaining time in a human-readable format.
 */
export function getUndoTimeRemaining(log: MergeLog, language: 'fr' | 'en'): string {
  const createdAt = new Date(log.createdAt).getTime();
  const deadline = createdAt + 24 * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return language === 'fr' ? 'Expiré' : 'Expired';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/**
 * Undo a merge: re-create the source item from snapshot, reverse relation reassignments, delete the log.
 */
export async function undoMerge(log: MergeLog): Promise<{ error: string | null }> {
  if (!isUndoable(log)) {
    return { error: 'Undo window expired (24h)' };
  }

  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    // 1. Re-create the source item from snapshot
    const tableMap: Record<string, string> = {
      player: 'players',
      club: 'clubs',
      terrain: 'terrains',
      tournament: 'tournaments',
    };
    const table = tableMap[log.mergeType];
    if (!table) return { error: 'Unknown merge type' };

    // Build insert payload from snapshot (remove client-side fields)
    const snapshot = { ...log.sourceSnapshot };
    // The snapshot is the raw DB row, so we can insert it directly
    // But we need to make sure user_id is set
    snapshot.user_id = user.id;

    const { error: insertError } = await supabase.from(table).insert(snapshot);
    if (insertError) {
      // If the item already exists (maybe wasn't actually deleted), that's ok
      if (!insertError.message.includes('duplicate')) {
        return { error: `Re-create failed: ${insertError.message}` };
      }
    }

    // 2. Reverse relation reassignments
    for (const rel of log.reassignedRelations) {
      const relTable = tableMap[rel.type] || (rel.type === 'match' ? 'matches' : null);
      if (!relTable) continue;

      const revert: Record<string, any> = { [rel.field]: rel.oldValue };
      // For name fields, also revert the name
      const nameFieldMap: Record<string, string> = {
        club_id: 'club',
        terrain_id: 'terrain_name',
        club_name: 'club_name',
      };
      // We stored all the info we need in the relation log

      await supabase.from(relTable).update(revert).eq('id', rel.id);
    }

    // 3. Delete the merge log
    await supabase.from('merge_logs').delete().eq('id', log.id);

    return { error: null };
  } catch (e: any) {
    return { error: e?.message || 'Unknown error' };
  }
}

/**
 * Delete a merge log (dismiss from history).
 */
export async function deleteMergeLog(logId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('merge_logs').delete().eq('id', logId);
  return { error: error?.message || null };
}

/**
 * Get all merge logs for admin (any user, no time limit).
 * Groups by user for admin review.
 */
export async function getAllMergeLogsAdmin(limit = 100): Promise<{ logs: MergeLog[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('merge_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { logs: [], error: error.message };

  const logs: MergeLog[] = (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    mergeType: row.merge_type,
    targetId: row.target_id,
    targetName: row.target_name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceSnapshot: row.source_snapshot,
    reassignedRelations: row.reassigned_relations || [],
    createdAt: row.created_at,
  }));

  return { logs, error: null };
}

/**
 * Admin undo merge: bypasses 24h window. Re-creates source from snapshot.
 */
export async function adminUndoMerge(log: MergeLog): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();

  try {
    const tableMap: Record<string, string> = {
      player: 'players',
      club: 'clubs',
      terrain: 'terrains',
      tournament: 'tournaments',
    };
    const table = tableMap[log.mergeType];
    if (!table) return { error: 'Unknown merge type' };

    // Re-create the source item from snapshot
    const snapshot = { ...log.sourceSnapshot };
    // Ensure user_id is from original owner
    if (!snapshot.user_id) snapshot.user_id = log.userId;

    const { error: insertError } = await supabase.from(table).insert(snapshot);
    if (insertError) {
      if (!insertError.message.includes('duplicate')) {
        return { error: `Re-create failed: ${insertError.message}` };
      }
    }

    // Reverse relation reassignments
    for (const rel of log.reassignedRelations) {
      const relTable = tableMap[rel.type] || (rel.type === 'match' ? 'matches' : null);
      if (!relTable) continue;
      const revert: Record<string, any> = { [rel.field]: rel.oldValue };
      await supabase.from(relTable).update(revert).eq('id', rel.id);
    }

    // Delete the merge log
    await supabase.from('merge_logs').delete().eq('id', log.id);

    // Send push notification to the original owner about the undo
    try {
      const ownerUserId = snapshot.user_id || log.userId;
      await supabase.functions.invoke('send-push', {
        body: {
          type: 'merge_undo',
          payload: {
            targetUserId: ownerUserId,
            itemName: log.sourceName,
            itemType: log.mergeType,
            targetName: log.targetName,
          },
        },
      });
    } catch { /* non-blocking */ }

    return { error: null };
  } catch (e: any) {
    return { error: e?.message || 'Unknown error' };
  }
}
