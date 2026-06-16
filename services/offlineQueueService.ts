import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'petanque_offline_queue';
const FAILED_OPS_KEY = 'petanque_failed_operations';

export type OperationType = 'insert' | 'update' | 'delete';

export interface QueuedOperation {
  id: string;
  timestamp: string;
  type: OperationType;
  table: string;
  /** DB-ready payload for insert/update (snake_case keys) */
  dbPayload?: Record<string, any>;
  /** Item ID for update/delete */
  itemId?: string;
  /** Temporary local ID assigned to inserts (to map later) */
  tempId?: string;
}

export interface ConflictInfo {
  table: string;
  itemId: string;
  operationType: 'update' | 'insert';
  localFields: Record<string, any>;
  serverFields: Record<string, any>;
  itemName?: string;
}

export interface FailedOperation extends QueuedOperation {
  error: string;
  failedAt: string;
  retryCount: number;
}

export interface ReplayResult {
  total: number;
  succeeded: number;
  failed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  /** Map of tempId -> realId for successfully inserted items */
  idMap: Record<string, string>;
  errors: string[];
}

// ============================================
// QUEUE MANAGEMENT
// ============================================

/**
 * Add an operation to the offline queue.
 */
export async function enqueueOperation(op: Omit<QueuedOperation, 'id' | 'timestamp'>): Promise<void> {
  try {
    const queue = await getQueue();
    const entry: QueuedOperation = {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    queue.push(entry);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineQueue] Enqueued ${op.type} on ${op.table} (queue size: ${queue.length})`);
  } catch (error) {
    console.log('[OfflineQueue] Error enqueueing:', error);
  }
}

/**
 * Get all queued operations (FIFO order).
 */
export async function getQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedOperation[];
  } catch {
    return [];
  }
}

/**
 * Get the number of pending operations.
 */
export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/**
 * Clear the entire offline queue.
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.log('[OfflineQueue] Error clearing:', error);
  }
}

// ============================================
// FAILED OPERATIONS MANAGEMENT
// ============================================

/**
 * Save a failed operation for manual retry later.
 */
export async function saveFailedOperation(op: QueuedOperation, error: string): Promise<void> {
  try {
    const failed = await getFailedOperations();
    const existingIdx = failed.findIndex(f => f.id === op.id);
    const entry: FailedOperation = {
      ...op,
      error,
      failedAt: new Date().toISOString(),
      retryCount: existingIdx >= 0 ? failed[existingIdx].retryCount + 1 : 0,
    };
    if (existingIdx >= 0) {
      failed[existingIdx] = entry;
    } else {
      failed.push(entry);
    }
    await AsyncStorage.setItem(FAILED_OPS_KEY, JSON.stringify(failed));
  } catch (e) {
    console.log('[OfflineQueue] Error saving failed op:', e);
  }
}

/**
 * Get all stored failed operations.
 */
export async function getFailedOperations(): Promise<FailedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILED_OPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FailedOperation[];
  } catch {
    return [];
  }
}

/**
 * Clear all stored failed operations.
 */
export async function clearFailedOperations(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FAILED_OPS_KEY);
  } catch (e) {
    console.log('[OfflineQueue] Error clearing failed ops:', e);
  }
}

/**
 * Remove a single failed operation by its id.
 */
export async function removeFailedOperation(opId: string): Promise<void> {
  try {
    const failed = await getFailedOperations();
    const filtered = failed.filter(op => op.id !== opId);
    await AsyncStorage.setItem(FAILED_OPS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.log('[OfflineQueue] Error removing failed op:', e);
  }
}

/**
 * Retry specific (or all) failed operations against Supabase.
 * @param opIds If provided, only retry these operation IDs; otherwise retry all.
 */
export async function retryFailedOperations(
  supabase: any,
  userId: string,
  opIds?: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<ReplayResult> {
  const allFailed = await getFailedOperations();
  const toRetry = opIds
    ? allFailed.filter(op => opIds.includes(op.id))
    : [...allFailed];

  if (toRetry.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, conflictsDetected: 0, conflictsResolved: 0, idMap: {}, errors: [] };
  }

  console.log(`[OfflineQueue] Retrying ${toRetry.length} failed operations...`);

  const result: ReplayResult = {
    total: toRetry.length,
    succeeded: 0,
    failed: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    idMap: {},
    errors: [],
  };

  for (const op of toRetry) {
    try {
      const resolvedItemId = op.itemId && result.idMap[op.itemId]
        ? result.idMap[op.itemId]
        : op.itemId;

      switch (op.type) {
        case 'insert': {
          if (!op.dbPayload) break;
          const payload = { ...op.dbPayload, user_id: userId };
          const { data, error } = await supabase
            .from(op.table)
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          if (op.tempId && data?.id) {
            result.idMap[op.tempId] = data.id;
          }
          break;
        }
        case 'update': {
          if (!resolvedItemId || !op.dbPayload) break;
          const { error } = await supabase
            .from(op.table)
            .update(op.dbPayload)
            .eq('id', resolvedItemId);
          if (error) throw error;
          break;
        }
        case 'delete': {
          if (!resolvedItemId) break;
          const { error } = await supabase
            .from(op.table)
            .delete()
            .eq('id', resolvedItemId);
          if (error) throw error;
          break;
        }
      }

      result.succeeded++;
      await removeFailedOperation(op.id);
    } catch (error: any) {
      result.failed++;
      const errMsg = error?.message || 'Unknown error';
      result.errors.push(`${op.type} ${op.table}: ${errMsg}`);
      // Update the failed op with latest error and incremented retry count
      await saveFailedOperation(op, errMsg);
    }
    const processed = result.succeeded + result.failed;
    onProgress?.(processed, result.total);
  }

  console.log(`[OfflineQueue] Retry complete: ${result.succeeded}/${result.total} succeeded`);
  return result;
}

/**
 * Remove a single operation from the queue by its id.
 */
async function removeOperation(opId: string): Promise<void> {
  try {
    const queue = await getQueue();
    const filtered = queue.filter(op => op.id !== opId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.log('[OfflineQueue] Error removing op:', error);
  }
}

// ============================================
// REPLAY LOGIC
// ============================================

/** Callback type for conflict resolution: returns user choice */
export type ConflictResolver = (conflict: ConflictInfo) => Promise<'local' | 'server' | 'skip'>;

/** Name field extractor for readable conflict items */
function extractItemName(table: string, fields: Record<string, any>): string | undefined {
  return fields.name || fields.player_name || fields.tournament_name || undefined;
}

/**
 * Replay all queued operations against Supabase, in order.
 * Handles temp ID mapping: if an insert created a tempId,
 * subsequent update/delete operations referencing that tempId
 * will use the real ID returned by the server.
 *
 * For update operations, checks if the server record was modified
 * after the operation was queued (conflict detection).
 *
 * @returns ReplayResult with stats and ID mapping
 */
export async function replayOfflineQueue(
  supabase: any,
  userId: string,
  onProgress?: (current: number, total: number) => void,
  onConflict?: ConflictResolver
): Promise<ReplayResult> {
  const queue = await getQueue();
  if (queue.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, conflictsDetected: 0, conflictsResolved: 0, idMap: {}, errors: [] };
  }

  console.log(`[OfflineQueue] Replaying ${queue.length} operations...`);

  const result: ReplayResult = {
    total: queue.length,
    succeeded: 0,
    failed: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    idMap: {},
    errors: [],
  };

  for (const op of queue) {
    try {
      // Resolve real ID if this operation references a temp ID
      const resolvedItemId = op.itemId && result.idMap[op.itemId]
        ? result.idMap[op.itemId]
        : op.itemId;

      switch (op.type) {
        case 'insert': {
          if (!op.dbPayload) break;
          const payload = { ...op.dbPayload, user_id: userId };
          const { data, error } = await supabase
            .from(op.table)
            .insert(payload)
            .select('id')
            .single();

          if (error) throw error;

          // Map tempId to real server ID
          if (op.tempId && data?.id) {
            result.idMap[op.tempId] = data.id;
          }
          break;
        }

        case 'update': {
          if (!resolvedItemId || !op.dbPayload) break;
          // Skip updates on temp IDs that failed to insert
          if (op.itemId?.startsWith('temp_') && !result.idMap[op.itemId]) {
            console.log(`[OfflineQueue] Skipping update for unresolved temp ID: ${op.itemId}`);
            break;
          }

          // Conflict detection: fetch current server record
          let hasConflict = false;
          let serverRecord: Record<string, any> | null = null;
          try {
            const { data: currentData } = await supabase
              .from(op.table)
              .select('*')
              .eq('id', resolvedItemId)
              .single();

            if (currentData) {
              serverRecord = currentData;
              // Check if server updated_at > operation timestamp
              const serverUpdatedAt = currentData.updated_at ? new Date(currentData.updated_at).getTime() : 0;
              const opTimestamp = new Date(op.timestamp).getTime();
              if (serverUpdatedAt > opTimestamp) {
                hasConflict = true;
              }
            }
          } catch {
            // If fetch fails, proceed without conflict check
          }

          if (hasConflict && onConflict && serverRecord) {
            result.conflictsDetected++;
            const remainingOps = queue.length - (result.succeeded + result.failed + 1);
            const conflictInfo: ConflictInfo = {
              table: op.table,
              itemId: resolvedItemId,
              operationType: 'update',
              localFields: op.dbPayload,
              serverFields: serverRecord,
              itemName: extractItemName(op.table, serverRecord),
            };

            const choice = await onConflict(conflictInfo);

            if (choice === 'server') {
              // Keep server version - skip this update
              result.conflictsResolved++;
              console.log(`[OfflineQueue] Conflict resolved: keeping server version for ${op.table}/${resolvedItemId}`);
              await removeOperation(op.id);
              result.succeeded++;
              const processed = result.succeeded + result.failed;
              onProgress?.(processed, result.total);
              continue;
            } else if (choice === 'skip') {
              // Skip entirely
              console.log(`[OfflineQueue] Conflict skipped for ${op.table}/${resolvedItemId}`);
              await removeOperation(op.id);
              result.succeeded++;
              const processed = result.succeeded + result.failed;
              onProgress?.(processed, result.total);
              continue;
            }
            // choice === 'local': proceed with local update
            result.conflictsResolved++;
          }

          const { error } = await supabase
            .from(op.table)
            .update(op.dbPayload)
            .eq('id', resolvedItemId);

          if (error) throw error;
          break;
        }

        case 'delete': {
          if (!resolvedItemId) break;
          // Skip deletes on temp IDs that failed to insert
          if (op.itemId?.startsWith('temp_') && !result.idMap[op.itemId]) {
            console.log(`[OfflineQueue] Skipping delete for unresolved temp ID: ${op.itemId}`);
            break;
          }
          const { error } = await supabase
            .from(op.table)
            .delete()
            .eq('id', resolvedItemId);

          if (error) throw error;
          break;
        }
      }

      result.succeeded++;
      await removeOperation(op.id);
    } catch (error: any) {
      result.failed++;
      const errMsg = error?.message || 'Unknown error';
      result.errors.push(`${op.type} ${op.table}: ${errMsg}`);
      console.log(`[OfflineQueue] Failed to replay ${op.type} on ${op.table}:`, error);
      // Save to failed operations store for manual retry
      await saveFailedOperation(op, errMsg);
      // Remove from main queue
      await removeOperation(op.id);
    }
    // Report progress
    const processed = result.succeeded + result.failed;
    onProgress?.(processed, result.total);
  }

  console.log(`[OfflineQueue] Replay complete: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed, ${result.conflictsDetected} conflicts`);
  return result;
}

// ============================================
// DB PAYLOAD BUILDERS (for queueing from AppContext)
// ============================================

export function buildMatchDbPayload(match: Record<string, any>): Record<string, any> {
  return {
    date: match.date,
    mode: match.mode,
    format: match.format,
    tournament_id: match.tournamentId,
    tournament_name: match.tournamentName,
    tournament_phase: match.tournamentPhase,
    tournament_bracket: match.tournamentBracket,
    bracket_match_id: match.bracketMatchId,
    terrain_id: match.terrainId,
    terrain_type: match.terrainType,
    team_a: match.teamA,
    team_b: match.teamB,
    winner: match.winner,
    duration: match.duration,
    menes: match.menes,
    player_actions: match.playerActions,
    series_info: match.seriesInfo,
  };
}

export function buildPlayerDbPayload(player: Record<string, any>): Record<string, any> {
  return {
    name: player.name,
    nickname: player.nickname,
    avatar: player.avatar,
    club: player.club,
    club_id: player.clubId,
    role: player.role,
    level: player.level,
    experience: player.experience,
    location: player.location,
    phone: player.phone,
    email: player.email,
    country: player.country,
    boules: player.boules,
    handedness: player.handedness,
    terrain_id: player.terrainId,
    terrain_name: player.terrainName,
    is_public: player.isPublic ?? false,
    show_contact_public: player.showContactPublic ?? false,
    stats: player.stats,
  };
}

export function buildClubDbPayload(club: Record<string, any>): Record<string, any> {
  return {
    name: club.name,
    logo: club.logo,
    address: club.address,
    city: club.city,
    country: club.country || 'France',
    location: club.location,
    members_count: club.membersCount,
    founded_year: club.foundedYear,
    description: club.description,
    facilities: club.facilities,
    contact_email: club.contactEmail,
    contact_phone: club.contactPhone,
    terrain_id: club.terrainId,
    terrain_name: club.terrainName,
    membership_cost: club.membershipCost,
    club_card_url: club.clubCardUrl || null,
  };
}

export function buildTournamentDbPayload(tournament: Record<string, any>): Record<string, any> {
  return {
    name: tournament.name,
    date: tournament.date,
    end_date: tournament.endDate,
    type: tournament.type,
    format: tournament.format,
    location: tournament.location,
    terrain_id: tournament.terrainId,
    terrain_name: tournament.terrainName,
    terrain_type: tournament.terrainType,
    club_id: tournament.clubId,
    club_name: tournament.clubName,
    status: tournament.status,
    participants: tournament.participants,
    max_participants: tournament.maxParticipants,
    prize: tournament.prize,
    description: tournament.description,
    teams: tournament.teams,
    phases: tournament.phases,
    current_phase_id: tournament.currentPhaseId,
    tournament_level: tournament.tournamentLevel,
    tournament_category: tournament.tournamentCategory,
    registration_type: tournament.registrationType,
    tournament_scope: tournament.tournamentScope,
    registration_cost: tournament.registrationCost,
    prize_won: tournament.prizeWon,
  };
}

export function buildTerrainDbPayload(terrain: Record<string, any>): Record<string, any> {
  return {
    name: terrain.name,
    address: terrain.address,
    city: terrain.city,
    location: terrain.location,
    type: terrain.type,
    description: terrain.description,
    facilities: terrain.facilities,
    photos: terrain.photos,
    club_id: terrain.clubId,
    club_name: terrain.clubName,
    is_public: terrain.isPublic,
    public_access: terrain.publicAccess ?? true,
    courts_count: terrain.courtsCount,
    lighting: terrain.lighting,
    covered: terrain.covered,
    environment: terrain.environment || 'outdoor',
    parking: terrain.parking ?? false,
    toilets: terrain.toilets ?? false,
  };
}

export function buildChallengeDbPayload(challenge: Record<string, any>): Record<string, any> {
  return {
    type: challenge.type,
    mode: challenge.mode,
    date: challenge.date,
    player_id: challenge.playerId,
    player_name: challenge.playerName,
    sponsor_id: challenge.sponsorId || null,
    sponsor_name: challenge.sponsorName || null,
    sponsor_photo: challenge.sponsorPhoto || null,
    opponent_id: challenge.opponentId,
    opponent_name: challenge.opponentName,
    opponent_result: challenge.opponentResult,
    winner: challenge.winner,
    shots: challenge.shots,
    success_count: challenge.successCount,
    total_shots: challenge.totalShots,
    carreau_count: challenge.carreauCount,
    success_rate: challenge.successRate,
    precision_shots: challenge.precisionShots,
    total_points: challenge.totalPoints,
    max_points: challenge.maxPoints,
    atelier_scores: challenge.atelierScores,
    duration: challenge.duration,
    notes: challenge.notes,
    detailed_shots: challenge.detailedShots,
    boules_set_id: challenge.boulesSetId || null,
    terrain_id: challenge.terrainId || null,
  };
}

/**
 * Build a DB-ready update payload from camelCase updates.
 * Used to queue update operations with the correct snake_case keys.
 */
export function buildUpdateDbPayload(table: string, updates: Record<string, any>): Record<string, any> {
  const FIELD_MAP: Record<string, Record<string, string>> = {
    matches: {
      date: 'date', mode: 'mode', format: 'format',
      tournamentId: 'tournament_id', tournamentName: 'tournament_name',
      tournamentPhase: 'tournament_phase', tournamentBracket: 'tournament_bracket',
      teamA: 'team_a', teamB: 'team_b', winner: 'winner',
      duration: 'duration', menes: 'menes', playerActions: 'player_actions',
      terrainId: 'terrain_id', terrainType: 'terrain_type',
    },
    players: {
      name: 'name', nickname: 'nickname', avatar: 'avatar',
      club: 'club', clubId: 'club_id', role: 'role', level: 'level',
      experience: 'experience', location: 'location', country: 'country', boules: 'boules',
      handedness: 'handedness', terrainId: 'terrain_id', terrainName: 'terrain_name',
      phone: 'phone', email: 'email', isPublic: 'is_public',
      showContactPublic: 'show_contact_public', stats: 'stats',
    },
    clubs: {
      name: 'name', logo: 'logo', address: 'address', city: 'city',
      country: 'country', location: 'location', membersCount: 'members_count',
      foundedYear: 'founded_year', description: 'description',
      facilities: 'facilities', contactEmail: 'contact_email',
      contactPhone: 'contact_phone', terrainId: 'terrain_id',
      terrainName: 'terrain_name', membershipCost: 'membership_cost',
      showContactPublic: 'show_contact_public',
      clubCardUrl: 'club_card_url',
    },
    tournaments: {
      name: 'name', date: 'date', endDate: 'end_date', type: 'type',
      format: 'format', location: 'location', terrainId: 'terrain_id',
      terrainName: 'terrain_name', terrainType: 'terrain_type',
      clubId: 'club_id', clubName: 'club_name', status: 'status',
      participants: 'participants', maxParticipants: 'max_participants',
      prize: 'prize', description: 'description', teams: 'teams',
      phases: 'phases', currentPhaseId: 'current_phase_id',
      tournamentLevel: 'tournament_level', tournamentCategory: 'tournament_category',
      registrationType: 'registration_type', tournamentScope: 'tournament_scope',
      registrationCost: 'registration_cost', prizeWon: 'prize_won',
      finalResult: 'final_result',
    },
    terrains: {
      name: 'name', address: 'address', city: 'city', location: 'location',
      type: 'type', description: 'description', facilities: 'facilities',
      photos: 'photos', clubId: 'club_id', clubName: 'club_name',
      isPublic: 'is_public', publicAccess: 'public_access',
      courtsCount: 'courts_count', lighting: 'lighting',
      covered: 'covered', environment: 'environment',
      parking: 'parking', toilets: 'toilets',
    },
    challenges: {
      type: 'type', mode: 'mode', date: 'date',
      playerId: 'player_id', playerName: 'player_name',
      opponentId: 'opponent_id', opponentName: 'opponent_name',
      opponentResult: 'opponent_result', winner: 'winner',
      shots: 'shots', successCount: 'success_count',
      totalShots: 'total_shots', carreauCount: 'carreau_count',
      successRate: 'success_rate', precisionShots: 'precision_shots',
      totalPoints: 'total_points', maxPoints: 'max_points',
      atelierScores: 'atelier_scores', duration: 'duration',
      notes: 'notes', detailedShots: 'detailed_shots',
      boulesSetId: 'boules_set_id', terrainId: 'terrain_id',
      sponsorId: 'sponsor_id', sponsorName: 'sponsor_name', sponsorPhoto: 'sponsor_photo',
    },
  };

  const map = FIELD_MAP[table] || {};
  const dbUpdates: Record<string, any> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const dbKey = map[key] || key;
    dbUpdates[dbKey] = value;
  }

  dbUpdates.updated_at = new Date().toISOString();
  return dbUpdates;
}
