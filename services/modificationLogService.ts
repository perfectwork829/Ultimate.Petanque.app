/**
 * Modification Log Service
 * Records and manages field-level change history for shared items.
 * Supports per-field and bulk revert operations.
 */
import { getSupabaseClient } from '@/template';

export type ModLogItemType = 'player' | 'club' | 'terrain' | 'tournament' | 'match' | 'challenge';

// ============================================
// Constants
// ============================================

const TABLE_MAP: Record<ModLogItemType, string> = {
  player: 'players',
  club: 'clubs',
  terrain: 'terrains',
  tournament: 'tournaments',
  match: 'matches',
  challenge: 'challenges',
};

/** Fields that can be directly reverted (field → DB column). */
const REVERTABLE: Record<ModLogItemType, Record<string, { col: string; kind: 'direct' | 'jsonb_team_a_score' | 'jsonb_team_b_score' }>> = {
  challenge: {
    successCount: { col: 'success_count', kind: 'direct' },
    carreauCount: { col: 'carreau_count', kind: 'direct' },
    totalPoints: { col: 'total_points', kind: 'direct' },
    duration: { col: 'duration', kind: 'direct' },
    notes: { col: 'notes', kind: 'direct' },
  },
  match: {
    winner: { col: 'winner', kind: 'direct' },
    format: { col: 'format', kind: 'direct' },
    duration: { col: 'duration', kind: 'direct' },
    teamAScore: { col: 'team_a', kind: 'jsonb_team_a_score' },
    teamBScore: { col: 'team_b', kind: 'jsonb_team_b_score' },
  },
  player: {
    name: { col: 'name', kind: 'direct' },
    role: { col: 'role', kind: 'direct' },
    level: { col: 'level', kind: 'direct' },
    club: { col: 'club', kind: 'direct' },
    nickname: { col: 'nickname', kind: 'direct' },
  },
  club: {
    name: { col: 'name', kind: 'direct' },
    city: { col: 'city', kind: 'direct' },
  },
  terrain: {
    name: { col: 'name', kind: 'direct' },
    city: { col: 'city', kind: 'direct' },
  },
  tournament: {
    name: { col: 'name', kind: 'direct' },
  },
};

// ============================================
// Types
// ============================================

/** Check if a field is revertable for a given item type. */
export function isFieldRevertable(itemType: ModLogItemType, fieldName: string): boolean {
  return !!(REVERTABLE[itemType]?.[fieldName]);
}

export interface ModificationLog {
  id: string;
  itemType: ModLogItemType;
  itemId: string;
  ownerId: string;
  modifierId: string;
  modifierName: string | null;
  modifierEmail: string | null;
  changes: { field: string; oldValue?: any; newValue?: any }[];
  createdAt: string;
}

// ============================================
// Log Operations
// ============================================

/**
 * Log a modification made by a shared user on an item.
 * Only logs when the modifier is NOT the owner.
 */
export async function logModification(params: {
  itemType: ModLogItemType;
  itemId: string;
  ownerId: string;
  changes: { field: string; oldValue?: any; newValue?: any }[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return;

  // Don't log if modifier is the owner
  if (userData.user.id === params.ownerId) return;
  // Don't log empty changes
  if (params.changes.length === 0) return;

  // Get modifier profile info
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('username, email')
    .eq('id', userData.user.id)
    .single();

  await supabase.from('modification_logs').insert({
    item_type: params.itemType,
    item_id: params.itemId,
    owner_id: params.ownerId,
    modifier_id: userData.user.id,
    modifier_name: profile?.username || userData.user.email?.split('@')[0] || 'User',
    modifier_email: profile?.email || userData.user.email,
    changes: params.changes,
  });
}

// ============================================
// Revert Operations
// ============================================

/** Update the success_rate column after reverting success_count on a challenge. */
async function recalculateSuccessRate(
  table: string,
  itemId: string,
  successCount: number,
  now: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: row } = await supabase.from(table).select('total_shots').eq('id', itemId).single();
  const totalShots = row?.total_shots || 10;
  const newRate = Math.round((successCount / totalShots) * 1000) / 10;
  await supabase.from(table).update({ success_rate: newRate, updated_at: now }).eq('id', itemId);
}

/** Revert a JSONB team score (team_a or team_b) to a previous value. */
async function revertTeamScore(
  table: string,
  itemId: string,
  col: 'team_a' | 'team_b',
  oldValue: any,
  now: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: row, error: fetchErr } = await supabase.from(table).select(col).eq('id', itemId).single();
  if (fetchErr || !row) return { error: fetchErr?.message || 'Record not found' };
  const teamData = { ...(row as any)[col], score: oldValue };
  const { error } = await supabase.from(table).update({ [col]: teamData, updated_at: now }).eq('id', itemId);
  return { error: error?.message || null };
}

/** Remove a reverted field from a log entry, or delete the log if no changes remain. */
async function cleanupLogAfterRevert(
  logId: string,
  removedField: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: log } = await supabase
    .from('modification_logs')
    .select('changes')
    .eq('id', logId)
    .single();

  if (!log) return;

  const remaining = (log.changes as any[]).filter((c: any) => c.field !== removedField);
  if (remaining.length === 0) {
    await supabase.from('modification_logs').delete().eq('id', logId);
  } else {
    await supabase.from('modification_logs').update({ changes: remaining }).eq('id', logId);
  }
}

/**
 * Revert a single field change from a modification log.
 * Updates the DB record with the old value, then cleans up the log entry.
 */
export async function revertFieldChange(params: {
  logId: string;
  itemType: ModLogItemType;
  itemId: string;
  fieldName: string;
  oldValue: any;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const mapping = REVERTABLE[params.itemType]?.[params.fieldName];
  if (!mapping) return { error: 'Field not revertable' };

  const table = TABLE_MAP[params.itemType];
  const now = new Date().toISOString();

  try {
    if (mapping.kind === 'direct') {
      const { error } = await supabase
        .from(table)
        .update({ [mapping.col]: params.oldValue, updated_at: now })
        .eq('id', params.itemId);
      if (error) return { error: error.message };

      // Recalculate successRate if successCount was reverted on a challenge
      if (params.itemType === 'challenge' && params.fieldName === 'successCount') {
        await recalculateSuccessRate(table, params.itemId, params.oldValue as number, now);
      }
    } else if (mapping.kind === 'jsonb_team_a_score' || mapping.kind === 'jsonb_team_b_score') {
      const col = mapping.kind === 'jsonb_team_a_score' ? 'team_a' : 'team_b';
      const result = await revertTeamScore(table, params.itemId, col, params.oldValue, now);
      if (result.error) return result;
    }

    await cleanupLogAfterRevert(params.logId, params.fieldName);
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Unknown error' };
  }
}

/**
 * Revert ALL revertable field changes from a modification log entry.
 * Updates the DB record with old values for each revertable field, then deletes the log.
 */
export async function revertAllChanges(params: {
  logId: string;
  itemType: ModLogItemType;
  itemId: string;
  changes: { field: string; oldValue?: any; newValue?: any }[];
}): Promise<{ error: string | null; revertedCount: number }> {
  const supabase = getSupabaseClient();
  const table = TABLE_MAP[params.itemType];
  const now = new Date().toISOString();
  let revertedCount = 0;
  const nonRevertableFields: string[] = [];

  try {
    // Collect all direct updates into a single object
    const directUpdates: Record<string, any> = { updated_at: now };
    const jsonbUpdates: { kind: string; col: string; value: any }[] = [];

    for (const change of params.changes) {
      if (change.oldValue === undefined) continue;
      const mapping = REVERTABLE[params.itemType]?.[change.field];
      if (!mapping) {
        nonRevertableFields.push(change.field);
        continue;
      }

      if (mapping.kind === 'direct') {
        directUpdates[mapping.col] = change.oldValue;
        revertedCount++;
      } else if (mapping.kind === 'jsonb_team_a_score' || mapping.kind === 'jsonb_team_b_score') {
        jsonbUpdates.push({ kind: mapping.kind, col: mapping.kind === 'jsonb_team_a_score' ? 'team_a' : 'team_b', value: change.oldValue });
        revertedCount++;
      }
    }

    // Apply direct updates in one call
    if (Object.keys(directUpdates).length > 1) {
      const { error } = await supabase.from(table).update(directUpdates).eq('id', params.itemId);
      if (error) return { error: error.message, revertedCount: 0 };
    }

    // Recalculate successRate if successCount was reverted on a challenge
    if (params.itemType === 'challenge' && directUpdates['success_count'] !== undefined) {
      await recalculateSuccessRate(table, params.itemId, directUpdates['success_count'] as number, now);
    }

    // Apply JSONB score updates one by one
    for (const ju of jsonbUpdates) {
      const col = ju.kind === 'jsonb_team_a_score' ? 'team_a' : 'team_b';
      await revertTeamScore(table, params.itemId, col as 'team_a' | 'team_b', ju.value, now);
    }

    // Clean up log: delete if fully reverted, otherwise keep non-revertable fields
    if (nonRevertableFields.length === 0) {
      await supabase.from('modification_logs').delete().eq('id', params.logId);
    } else {
      const { data: log } = await supabase.from('modification_logs').select('changes').eq('id', params.logId).single();
      if (log) {
        const remaining = (log.changes as any[]).filter((c: any) => nonRevertableFields.includes(c.field));
        if (remaining.length === 0) {
          await supabase.from('modification_logs').delete().eq('id', params.logId);
        } else {
          await supabase.from('modification_logs').update({ changes: remaining }).eq('id', params.logId);
        }
      }
    }

    return { error: null, revertedCount };
  } catch (e: any) {
    return { error: e.message || 'Unknown error', revertedCount: 0 };
  }
}

// ============================================
// Fetch Operations
// ============================================

/**
 * Fetch modification logs for a specific item.
 * Only the owner can see logs (enforced by RLS).
 */
export async function getModificationLogs(
  itemType: ModLogItemType,
  itemId: string,
  limit: number = 10,
): Promise<{ logs: ModificationLog[]; error: string | null }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('modification_logs')
    .select('*')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { logs: [], error: error.message };

  const logs: ModificationLog[] = (data || []).map((row: any) => ({
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    ownerId: row.owner_id,
    modifierId: row.modifier_id,
    modifierName: row.modifier_name,
    modifierEmail: row.modifier_email,
    changes: row.changes || [],
    createdAt: row.created_at,
  }));

  return { logs, error: null };
}
