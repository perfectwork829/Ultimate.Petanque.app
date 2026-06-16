/**
 * Match CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete for matches.
 * No logic changes from original implementation.
 */
import { Match } from '@/types/petanque';
import { enqueueOperation, buildMatchDbPayload, buildUpdateDbPayload } from '@/services/offlineQueueService';
import { mapMatchFromDb } from '@/services/dbMappers';
import { snapshotRankings, detectAndNotifyRankingChanges } from '@/services/rankingChangeService';
import { updateEloAfterMatch } from '@/services/eloService';

interface MatchCrudDeps {
  supabase: any;
  userId: string | undefined;
  isConnected: boolean;
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  persistPlayerStats: (allMatches: Match[], playerIds: string[]) => Promise<void>;
}

export async function addMatchOp(
  match: Omit<Match, 'id'>,
  deps: MatchCrudDeps
): Promise<string | null> {
  const { supabase, userId, isConnected, matches, setMatches, persistPlayerStats } = deps;

  if (!userId) {
    const tempId = Date.now().toString();
    const newMatch: Match = { ...match, id: tempId };
    setMatches(prev => [newMatch, ...prev]);
    return tempId;
  }

  if (!isConnected) {
    const tempId = `temp_${Date.now()}`;
    enqueueOperation({ type: 'insert', table: 'matches', dbPayload: buildMatchDbPayload(match), tempId });
    const newMatch: Match = { ...match, id: tempId };
    setMatches(prev => [newMatch, ...prev]);
    return tempId;
  }

  // Snapshot rankings BEFORE the match is saved (fire-and-forget)
  snapshotRankings().catch(() => {});

  try {
    const { data, error } = await supabase.from('matches').insert({
      user_id: userId,
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
      boules_set_id: match.boulesSetId || null,
      team_a: match.teamA,
      team_b: match.teamB,
      winner: match.winner,
      duration: match.duration,
      menes: match.menes,
      player_actions: match.playerActions,
      series_info: match.seriesInfo,
      notes: match.notes || null,
    }).select().single();

    if (error) throw error;

    if (data) {
      const newMatch: Match = mapMatchFromDb(data);
      setMatches(prev => [newMatch, ...prev]);
      // Persist recalculated stats for all players in this match
      const updatedMatches = [newMatch, ...matches];
      const affectedPlayers = [...new Set([...newMatch.teamA.players, ...newMatch.teamB.players])];
      persistPlayerStats(updatedMatches, affectedPlayers);
      // Update ELO ratings for all players in the match (fire-and-forget)
      const participantIds: string[] = data.participant_user_ids || [];
      updateEloAfterMatch(
        data.id,
        newMatch.teamA.players,
        newMatch.teamB.players,
        newMatch.winner,
        participantIds,
        newMatch.teamA.score,
        newMatch.teamB.score,
        newMatch.playerActions
      ).catch(e => console.log('[ELO] Error:', e));
      // Detect and notify ranking changes after match save (fire-and-forget)
      setTimeout(() => detectAndNotifyRankingChanges().catch(() => {}), 2000);
      return data.id;
    }
    return null;
  } catch (error) {
    console.log('Error adding match:', error);
    const tempId = Date.now().toString();
    const newMatch: Match = { ...match, id: tempId };
    setMatches(prev => [newMatch, ...prev]);
    return tempId;
  }
}

export async function updateMatchOp(
  id: string,
  updates: Partial<Match>,
  deps: MatchCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, matches, setMatches, persistPlayerStats } = deps;
  const existingMatch = matches.find(m => m.id === id);

  // Update local state immediately
  setMatches(prev => prev.map(match =>
    match.id === id ? { ...match, ...updates } : match
  ));

  // Persist recalculated stats if score/winner/actions changed
  if (userId && existingMatch && (updates.winner !== undefined || updates.playerActions !== undefined || updates.teamA !== undefined || updates.teamB !== undefined)) {
    const updatedMatch = { ...existingMatch, ...updates } as Match;
    const updatedMatches = matches.map(m => m.id === id ? updatedMatch : m);
    const affectedPlayers = [...new Set([
      ...updatedMatch.teamA.players,
      ...updatedMatch.teamB.players,
      ...(existingMatch.teamA.players || []),
      ...(existingMatch.teamB.players || []),
    ])];
    persistPlayerStats(updatedMatches, affectedPlayers);
  }

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'update', table: 'matches', itemId: id, dbPayload: buildUpdateDbPayload('matches', updates) });
    return;
  }

  try {
    const dbUpdates: any = {};
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.mode !== undefined) dbUpdates.mode = updates.mode;
    if (updates.format !== undefined) dbUpdates.format = updates.format;
    if (updates.tournamentId !== undefined) dbUpdates.tournament_id = updates.tournamentId;
    if (updates.tournamentName !== undefined) dbUpdates.tournament_name = updates.tournamentName;
    if (updates.tournamentPhase !== undefined) dbUpdates.tournament_phase = updates.tournamentPhase;
    if (updates.tournamentBracket !== undefined) dbUpdates.tournament_bracket = updates.tournamentBracket;
    if (updates.teamA !== undefined) dbUpdates.team_a = updates.teamA;
    if (updates.teamB !== undefined) dbUpdates.team_b = updates.teamB;
    if (updates.winner !== undefined) dbUpdates.winner = updates.winner;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.menes !== undefined) dbUpdates.menes = updates.menes;
    if (updates.playerActions !== undefined) dbUpdates.player_actions = updates.playerActions;
    if (updates.terrainId !== undefined) dbUpdates.terrain_id = updates.terrainId;
    if (updates.terrainType !== undefined) dbUpdates.terrain_type = updates.terrainType;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
    dbUpdates.updated_at = new Date().toISOString();

    await supabase.from('matches').update(dbUpdates).eq('id', id);
  } catch (error) {
    console.log('Error updating match:', error);
  }
}

export async function deleteMatchOp(
  id: string,
  deps: MatchCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, matches, setMatches, persistPlayerStats } = deps;
  const matchToDelete = matches.find(m => m.id === id);
  setMatches(prev => prev.filter(match => match.id !== id));

  if (matchToDelete && userId) {
    const updatedMatches = matches.filter(m => m.id !== id);
    const affectedPlayers = [...new Set([...matchToDelete.teamA.players, ...matchToDelete.teamB.players])];
    persistPlayerStats(updatedMatches, affectedPlayers);
  }

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'delete', table: 'matches', itemId: id });
    return;
  }

  try {
    await supabase.from('matches').delete().eq('id', id);
  } catch (error) {
    console.log('Error deleting match:', error);
  }
}
