/**
 * Challenge CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete for challenges.
 * No logic changes from original implementation.
 */
import { Challenge } from '@/types/petanque';
import { enqueueOperation, buildChallengeDbPayload, buildUpdateDbPayload } from '@/services/offlineQueueService';

interface ChallengeCrudDeps {
  supabase: any;
  userId: string | undefined;
  isConnected: boolean;
  setChallenges: React.Dispatch<React.SetStateAction<Challenge[]>>;
}

export async function addChallengeOp(
  challenge: Omit<Challenge, 'id'>,
  deps: ChallengeCrudDeps
): Promise<string | null> {
  const { supabase, userId, isConnected, setChallenges } = deps;

  if (!userId) {
    const tempId = Date.now().toString();
    const newChallenge: Challenge = { ...challenge, id: tempId };
    setChallenges(prev => [newChallenge, ...prev]);
    return tempId;
  }

  if (!isConnected) {
    const tempId = `temp_${Date.now()}`;
    enqueueOperation({ type: 'insert', table: 'challenges', dbPayload: buildChallengeDbPayload(challenge), tempId });
    setChallenges(prev => [{ ...challenge, id: tempId }, ...prev]);
    return tempId;
  }

  try {
    const { data, error } = await supabase.from('challenges').insert({
      user_id: userId,
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
    }).select().single();

    if (error) throw error;

    if (data) {
      const newChallenge: Challenge = {
        id: data.id,
        type: data.type,
        mode: data.mode || challenge.mode,
        date: data.date,
        playerId: data.player_id,
        playerName: data.player_name,
        sponsorId: data.sponsor_id || challenge.sponsorId,
        sponsorName: data.sponsor_name || challenge.sponsorName,
        sponsorPhoto: data.sponsor_photo || challenge.sponsorPhoto,
        opponentId: data.opponent_id || challenge.opponentId,
        opponentName: data.opponent_name || challenge.opponentName,
        opponentResult: data.opponent_result || challenge.opponentResult,
        winner: data.winner || challenge.winner,
        shots: data.shots,
        successCount: data.success_count,
        totalShots: data.total_shots,
        carreauCount: data.carreau_count,
        successRate: data.success_rate ? parseFloat(data.success_rate) : undefined,
        precisionShots: data.precision_shots,
        totalPoints: data.total_points,
        maxPoints: data.max_points,
        atelierScores: data.atelier_scores,
        duration: data.duration,
        notes: data.notes,
        detailedShots: data.detailed_shots,
        boulesSetId: data.boules_set_id,
        terrainId: data.terrain_id,
      };
      setChallenges(prev => [newChallenge, ...prev]);
      return data.id;
    }
    return null;
  } catch (error) {
    console.log('Error adding challenge:', error);
    const tempId = Date.now().toString();
    const newChallenge: Challenge = { ...challenge, id: tempId };
    setChallenges(prev => [newChallenge, ...prev]);
    return tempId;
  }
}

export async function updateChallengeOp(
  id: string,
  updates: Partial<Challenge>,
  deps: ChallengeCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, setChallenges } = deps;

  setChallenges(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'update', table: 'challenges', itemId: id, dbPayload: buildUpdateDbPayload('challenges', updates) });
    return;
  }

  try {
    const dbUpdates: any = {};
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.mode !== undefined) dbUpdates.mode = updates.mode;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.playerId !== undefined) dbUpdates.player_id = updates.playerId;
    if (updates.playerName !== undefined) dbUpdates.player_name = updates.playerName;
    if (updates.opponentId !== undefined) dbUpdates.opponent_id = updates.opponentId;
    if (updates.opponentName !== undefined) dbUpdates.opponent_name = updates.opponentName;
    if (updates.opponentResult !== undefined) dbUpdates.opponent_result = updates.opponentResult;
    if (updates.winner !== undefined) dbUpdates.winner = updates.winner;
    if (updates.shots !== undefined) dbUpdates.shots = updates.shots;
    if (updates.successCount !== undefined) dbUpdates.success_count = updates.successCount;
    if (updates.totalShots !== undefined) dbUpdates.total_shots = updates.totalShots;
    if (updates.carreauCount !== undefined) dbUpdates.carreau_count = updates.carreauCount;
    if (updates.successRate !== undefined) dbUpdates.success_rate = updates.successRate;
    if (updates.precisionShots !== undefined) dbUpdates.precision_shots = updates.precisionShots;
    if (updates.totalPoints !== undefined) dbUpdates.total_points = updates.totalPoints;
    if (updates.maxPoints !== undefined) dbUpdates.max_points = updates.maxPoints;
    if (updates.atelierScores !== undefined) dbUpdates.atelier_scores = updates.atelierScores;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.detailedShots !== undefined) dbUpdates.detailed_shots = updates.detailedShots;
    if (updates.terrainId !== undefined) dbUpdates.terrain_id = updates.terrainId || null;
    if (updates.sponsorId !== undefined) dbUpdates.sponsor_id = updates.sponsorId || null;
    if (updates.sponsorName !== undefined) dbUpdates.sponsor_name = updates.sponsorName || null;
    if (updates.sponsorPhoto !== undefined) dbUpdates.sponsor_photo = updates.sponsorPhoto || null;
    dbUpdates.updated_at = new Date().toISOString();

    await supabase.from('challenges').update(dbUpdates).eq('id', id);
  } catch (error) {
    console.log('Error updating challenge:', error);
  }
}

export async function deleteChallengeOp(
  id: string,
  deps: Pick<ChallengeCrudDeps, 'supabase' | 'userId' | 'isConnected' | 'setChallenges'>
): Promise<void> {
  const { supabase, userId, isConnected, setChallenges } = deps;
  setChallenges(prev => prev.filter(challenge => challenge.id !== id));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'delete', table: 'challenges', itemId: id });
    return;
  }

  try {
    await supabase.from('challenges').delete().eq('id', id);
  } catch (error) {
    console.log('Error deleting challenge:', error);
  }
}
