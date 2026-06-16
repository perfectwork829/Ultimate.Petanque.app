/**
 * Player CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete for players.
 * No logic changes from original implementation.
 */
import { Player } from '@/types/petanque';
import { logModification } from '@/services/modificationLogService';
import { enqueueOperation, buildPlayerDbPayload, buildUpdateDbPayload } from '@/services/offlineQueueService';
import { mapPlayerFromDb } from '@/services/dbMappers';

interface PlayerCrudDeps {
  supabase: any;
  userId: string | undefined;
  isConnected: boolean;
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  sharedItemPermissions: Record<string, 'read' | 'write'>;
  players: Player[];
}

/** Map auth uid or stale id to the actual players.id row when they differ. */
export function resolvePlayerRecordId(id: string, players: Player[], userId?: string): string {
  if (players.some(p => p.id === id)) return id;
  if (userId) {
    const linked = players.find(p => p.userId === userId);
    if (linked) return linked.id;
  }
  return id;
}

async function fetchPrimaryPlayerId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function addPlayerOp(
  player: Omit<Player, 'id'>,
  deps: PlayerCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, setPlayers } = deps;

  if (!userId) {
    const newPlayer: Player = { ...player, id: Date.now().toString() };
    setPlayers(prev => [...prev, newPlayer]);
    return;
  }

  if (!isConnected) {
    const tempId = `temp_${Date.now()}`;
    enqueueOperation({ type: 'insert', table: 'players', dbPayload: buildPlayerDbPayload(player), tempId });
    setPlayers(prev => [...prev, { ...player, id: tempId } as Player]);
    return;
  }

  try {
    const { data, error } = await supabase.from('players').insert({
      user_id: userId,
      name: player.name,
      nickname: player.nickname,
      avatar: player.avatar,
      club: player.club,
      club_id: player.clubId,
      role: player.role,
      level: player.level || 'Intermédiaire',
      experience: player.experience || null,
      location: player.location,
      phone: player.phone,
      email: player.email,
      country: player.country,
      city: player.city || (player.location as any)?.city || null,
      boules: player.boules,
      handedness: player.handedness,
      terrain_id: player.terrainId,
      terrain_name: player.terrainName,
      is_public: player.isPublic ?? false,
      show_contact_public: player.showContactPublic ?? false,
      stats: player.stats,
    }).select().single();

    if (error) throw error;

    if (data) {
      const newPlayer: Player = mapPlayerFromDb(data);
      setPlayers(prev => [...prev, newPlayer]);
    }
  } catch (error) {
    console.log('Error adding player:', error);
    const newPlayer: Player = { ...player, id: Date.now().toString() };
    setPlayers(prev => [...prev, newPlayer]);
  }
}

export async function updatePlayerOp(
  id: string,
  updates: Partial<Player>,
  deps: PlayerCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, setPlayers, sharedItemPermissions, players } = deps;
  const playerId = resolvePlayerRecordId(id, players, userId);
  const oldPlayer = players.find(p => p.id === playerId);

  setPlayers(prev => prev.map(player =>
    player.id === playerId ? { ...player, ...updates } : player
  ));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'update', table: 'players', itemId: playerId, dbPayload: buildUpdateDbPayload('players', updates) });
    return;
  }

  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.nickname !== undefined) dbUpdates.nickname = updates.nickname;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
    if (updates.club !== undefined) dbUpdates.club = updates.club || null;
    if (updates.clubId !== undefined) dbUpdates.club_id = updates.clubId || null;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.level !== undefined) dbUpdates.level = updates.level;
    if (updates.location !== undefined) dbUpdates.location = updates.location;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if ((updates as any).city !== undefined) dbUpdates.city = (updates as any).city;
    if (updates.boules !== undefined) dbUpdates.boules = updates.boules;
    if (updates.handedness !== undefined) dbUpdates.handedness = updates.handedness || null;
    if (updates.experience !== undefined) dbUpdates.experience = updates.experience || null;
    if (updates.terrainId !== undefined) dbUpdates.terrain_id = updates.terrainId || null;
    if (updates.terrainName !== undefined) dbUpdates.terrain_name = updates.terrainName || null;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
    if (updates.email !== undefined) dbUpdates.email = updates.email || null;
    if (updates.isPublic !== undefined) dbUpdates.is_public = updates.isPublic;
    if (updates.showContactPublic !== undefined) dbUpdates.show_contact_public = updates.showContactPublic;
    if (updates.stats !== undefined) dbUpdates.stats = updates.stats;
    if (updates.eloRating !== undefined) dbUpdates.elo_rating = updates.eloRating;
    if ((updates as any).eloTireur !== undefined) dbUpdates.elo_tireur = (updates as any).eloTireur;
    if ((updates as any).eloPointeur !== undefined) dbUpdates.elo_pointeur = (updates as any).eloPointeur;
    if ((updates as any).eloMilieu !== undefined) dbUpdates.elo_milieu = (updates as any).eloMilieu;
    if ((updates as any).lastMatchDate !== undefined) dbUpdates.last_match_date = (updates as any).lastMatchDate;
    dbUpdates.updated_at = new Date().toISOString();

    let targetId = playerId;
    let { data, error } = await supabase
      .from('players')
      .update(dbUpdates)
      .eq('id', targetId)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data && userId) {
      const resolvedId = await fetchPrimaryPlayerId(supabase, userId);
      if (!resolvedId) throw new Error('Player record not found');
      targetId = resolvedId;
      const retry = await supabase
        .from('players')
        .update(dbUpdates)
        .eq('id', targetId)
        .select('id')
        .maybeSingle();
      if (retry.error) throw retry.error;
      if (!retry.data) throw new Error('Player record not found');
      setPlayers(prev => prev.map(player =>
        player.id === targetId ? { ...player, ...updates } : player
      ));
    }

    // Log modification for shared items
    if (sharedItemPermissions[targetId] === 'write' && oldPlayer) {
      const { data: row } = await supabase.from('players').select('user_id').eq('id', targetId).single();
      if (row?.user_id) {
        const changes = Object.keys(updates).filter(k => k !== 'stats' && (oldPlayer as any)[k] !== (updates as any)[k]).map(k => ({ field: k, oldValue: (oldPlayer as any)[k], newValue: (updates as any)[k] }));
        logModification({ itemType: 'player', itemId: targetId, ownerId: row.user_id, changes }).catch(() => {});
      }
    }
  } catch (error) {
    console.log('Error updating player:', error);
    throw error;
  }
}

export async function deletePlayerOp(
  id: string,
  deps: Pick<PlayerCrudDeps, 'supabase' | 'userId' | 'isConnected' | 'setPlayers'>
): Promise<void> {
  const { supabase, userId, isConnected, setPlayers } = deps;
  setPlayers(prev => prev.filter(player => player.id !== id));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'delete', table: 'players', itemId: id });
    return;
  }

  try {
    await supabase.from('players').delete().eq('id', id);
  } catch (error) {
    console.log('Error deleting player:', error);
  }
}
