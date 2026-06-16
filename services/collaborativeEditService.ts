/**
 * Collaborative Edit Service
 * Detects conflicts when two users edit the same shared match/challenge
 * simultaneously, computes visual diffs, and supports resolution.
 */
import { getSupabaseClient } from '@/template';

// ============================================
// Types
// ============================================

export interface DiffEntry {
  field: string;
  label: string;
  localValue: string;
  serverValue: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  serverRecord?: any;
  serverUpdatedAt?: string;
}

// ============================================
// Conflict Detection
// ============================================

/**
 * Check if a record has been modified since we last loaded it.
 * Used before saving shared items to detect concurrent edits.
 */
export async function checkEditConflict(
  table: 'matches' | 'challenges',
  itemId: string,
  lastKnownUpdatedAt: string
): Promise<ConflictResult> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', itemId)
      .single();

    if (error || !data) return { hasConflict: false };

    const serverUpdatedAt = data.updated_at;
    if (!serverUpdatedAt || !lastKnownUpdatedAt) return { hasConflict: false };

    const serverTime = new Date(serverUpdatedAt).getTime();
    const localTime = new Date(lastKnownUpdatedAt).getTime();

    // Server version is newer than our loaded version — conflict
    if (serverTime > localTime) {
      return {
        hasConflict: true,
        serverRecord: data,
        serverUpdatedAt,
      };
    }

    return { hasConflict: false };
  } catch {
    return { hasConflict: false };
  }
}

/**
 * Fetch current updated_at timestamp for an item.
 */
export async function fetchUpdatedAt(
  table: 'matches' | 'challenges',
  itemId: string
): Promise<string | null> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from(table)
      .select('updated_at')
      .eq('id', itemId)
      .single();
    return data?.updated_at || null;
  } catch {
    return null;
  }
}

// ============================================
// Match Diff Computation
// ============================================

/** Format a date string for display in diff view. */
function formatDiffDate(dateStr: string, isFr: boolean): string {
  try {
    return new Date(dateStr).toLocaleString(
      isFr ? 'fr-FR' : 'en-US',
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    );
  } catch {
    return dateStr;
  }
}

/** Format menes array into a readable summary string. */
function formatMenesSummary(menes: any[]): string {
  if (!menes || menes.length === 0) return '-';
  return menes.map((m: any, i: number) => `#${i + 1}: ${m.teamAPoints || 0}-${m.teamBPoints || 0}`).join(', ');
}

/** Format player actions array into a readable summary string. */
function formatActionsSummary(actions: any[]): string {
  if (!actions || actions.length === 0) return '-';
  return actions.map((a: any) => {
    const tir = `${a.actions?.tirsSuccess || 0}/${a.actions?.tirs || 0}`;
    const pt = `${a.actions?.pointsSuccess || 0}/${a.actions?.points || 0}`;
    return `${a.playerName}: T${tir} P${pt}`;
  }).join('; ');
}

export function computeMatchDiffs(
  localUpdates: Record<string, any>,
  serverRecord: any,
  language: 'fr' | 'en'
): DiffEntry[] {
  const fr = language === 'fr';
  const diffs: DiffEntry[] = [];

  // Score
  if (localUpdates.teamA !== undefined) {
    const localScoreA = localUpdates.teamA?.score ?? 0;
    const serverScoreA = serverRecord.team_a?.score ?? 0;
    if (localScoreA !== serverScoreA) {
      diffs.push({
        field: 'teamA.score',
        label: fr ? 'Score equipe A' : 'Team A Score',
        localValue: String(localScoreA),
        serverValue: String(serverScoreA),
      });
    }
  }

  if (localUpdates.teamB !== undefined) {
    const localScoreB = localUpdates.teamB?.score ?? 0;
    const serverScoreB = serverRecord.team_b?.score ?? 0;
    if (localScoreB !== serverScoreB) {
      diffs.push({
        field: 'teamB.score',
        label: fr ? 'Score equipe B' : 'Team B Score',
        localValue: String(localScoreB),
        serverValue: String(serverScoreB),
      });
    }
  }

  // Winner
  if (localUpdates.winner !== undefined && localUpdates.winner !== serverRecord.winner) {
    diffs.push({
      field: 'winner',
      label: fr ? 'Vainqueur' : 'Winner',
      localValue: localUpdates.winner === 'A' ? (fr ? 'Equipe A' : 'Team A') : (fr ? 'Equipe B' : 'Team B'),
      serverValue: serverRecord.winner === 'A' ? (fr ? 'Equipe A' : 'Team A') : (fr ? 'Equipe B' : 'Team B'),
    });
  }

  // Format
  if (localUpdates.format !== undefined && localUpdates.format !== serverRecord.format) {
    diffs.push({
      field: 'format',
      label: 'Format',
      localValue: localUpdates.format,
      serverValue: serverRecord.format,
    });
  }

  // Duration
  if (localUpdates.duration !== undefined && localUpdates.duration !== serverRecord.duration) {
    diffs.push({
      field: 'duration',
      label: fr ? 'Duree (min)' : 'Duration (min)',
      localValue: String(localUpdates.duration),
      serverValue: String(serverRecord.duration || 0),
    });
  }

  // Date
  if (localUpdates.date !== undefined && localUpdates.date !== serverRecord.date) {
    diffs.push({
      field: 'date',
      label: 'Date',
      localValue: formatDiffDate(localUpdates.date, fr),
      serverValue: formatDiffDate(serverRecord.date, fr),
    });
  }

  // Terrain
  if (localUpdates.terrainId !== undefined && localUpdates.terrainId !== serverRecord.terrain_id) {
    diffs.push({
      field: 'terrainId',
      label: 'Terrain',
      localValue: localUpdates.terrainId || (fr ? 'Aucun' : 'None'),
      serverValue: serverRecord.terrain_id || (fr ? 'Aucun' : 'None'),
    });
  }

  // Menes
  if (localUpdates.menes !== undefined) {
    const localMenes = localUpdates.menes || [];
    const serverMenes = serverRecord.menes || [];
    if (JSON.stringify(localMenes) !== JSON.stringify(serverMenes)) {
      diffs.push({
        field: 'menes',
        label: fr ? 'Menes' : 'Ends',
        localValue: formatMenesSummary(localMenes),
        serverValue: formatMenesSummary(serverMenes),
      });
    }
  }

  // Player Actions
  if (localUpdates.playerActions !== undefined) {
    const localActions = localUpdates.playerActions || [];
    const serverActions = serverRecord.player_actions || [];
    if (JSON.stringify(localActions) !== JSON.stringify(serverActions)) {
      diffs.push({
        field: 'playerActions',
        label: fr ? 'Actions joueurs' : 'Player actions',
        localValue: formatActionsSummary(localActions),
        serverValue: formatActionsSummary(serverActions),
      });
    }
  }

  // Team composition
  if (localUpdates.teamA !== undefined) {
    const localNames = (localUpdates.teamA?.playerNames || []).join(', ');
    const serverNames = (serverRecord.team_a?.playerNames || []).join(', ');
    if (localNames !== serverNames) {
      diffs.push({
        field: 'teamA.players',
        label: fr ? 'Joueurs equipe A' : 'Team A players',
        localValue: localNames || '-',
        serverValue: serverNames || '-',
      });
    }
  }

  if (localUpdates.teamB !== undefined) {
    const localNames = (localUpdates.teamB?.playerNames || []).join(', ');
    const serverNames = (serverRecord.team_b?.playerNames || []).join(', ');
    if (localNames !== serverNames) {
      diffs.push({
        field: 'teamB.players',
        label: fr ? 'Joueurs equipe B' : 'Team B players',
        localValue: localNames || '-',
        serverValue: serverNames || '-',
      });
    }
  }

  return diffs;
}

// ============================================
// Challenge Diff Computation
// ============================================

export function computeChallengeDiffs(
  localUpdates: Record<string, any>,
  serverRecord: any,
  language: 'fr' | 'en'
): DiffEntry[] {
  const fr = language === 'fr';
  const diffs: DiffEntry[] = [];

  const simpleFields: { key: string; dbKey: string; label: { fr: string; en: string }; suffix?: string }[] = [
    { key: 'successCount', dbKey: 'success_count', label: { fr: 'Tirs reussis', en: 'Successful shots' } },
    { key: 'successRate', dbKey: 'success_rate', label: { fr: 'Taux (%)', en: 'Rate (%)' }, suffix: '%' },
    { key: 'carreauCount', dbKey: 'carreau_count', label: { fr: 'Carreaux', en: 'Carreaux' } },
    { key: 'totalPoints', dbKey: 'total_points', label: { fr: 'Points', en: 'Points' } },
    { key: 'duration', dbKey: 'duration', label: { fr: 'Duree (sec)', en: 'Duration (sec)' } },
    { key: 'notes', dbKey: 'notes', label: { fr: 'Notes', en: 'Notes' } },
  ];

  for (const field of simpleFields) {
    if (localUpdates[field.key] === undefined) continue;
    const localStr = String(localUpdates[field.key] ?? '-');
    const serverStr = String(serverRecord[field.dbKey] ?? '-');
    if (localStr !== serverStr) {
      diffs.push({
        field: field.key,
        label: fr ? field.label.fr : field.label.en,
        localValue: localStr + (field.suffix || ''),
        serverValue: serverStr + (field.suffix || ''),
      });
    }
  }

  // Shots
  if (localUpdates.shots !== undefined) {
    const localShots = localUpdates.shots || [];
    const serverShots = serverRecord.shots || [];
    if (JSON.stringify(localShots) !== JSON.stringify(serverShots)) {
      const localSuccess = localShots.filter((s: any) => s.success).length;
      const serverSuccess = serverShots.filter((s: any) => s.success).length;
      const localCarreaux = localShots.filter((s: any) => s.carreau).length;
      const serverCarreaux = serverShots.filter((s: any) => s.carreau).length;
      diffs.push({
        field: 'shots',
        label: fr ? 'Detail des tirs' : 'Shot details',
        localValue: `${localSuccess}/${localShots.length} (${localCarreaux} C)`,
        serverValue: `${serverSuccess}/${serverShots.length} (${serverCarreaux} C)`,
      });
    }
  }

  // Precision shots
  if (localUpdates.precisionShots !== undefined) {
    const localPS = localUpdates.precisionShots || [];
    const serverPS = serverRecord.precision_shots || [];
    if (JSON.stringify(localPS) !== JSON.stringify(serverPS)) {
      const localTotal = localPS.reduce((s: number, p: any) => s + (p.points || 0), 0);
      const serverTotal = serverPS.reduce((s: number, p: any) => s + (p.points || 0), 0);
      diffs.push({
        field: 'precisionShots',
        label: fr ? 'Tirs de precision' : 'Precision shots',
        localValue: `${localTotal} pts`,
        serverValue: `${serverTotal} pts`,
      });
    }
  }

  return diffs;
}
