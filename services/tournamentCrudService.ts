/**
 * Tournament CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete for tournaments.
 * No logic changes from original implementation.
 */
import { Tournament, Match, BracketMatch } from '@/types/petanque';
import { logModification } from '@/services/modificationLogService';
import { enqueueOperation, buildTournamentDbPayload, buildUpdateDbPayload } from '@/services/offlineQueueService';

interface TournamentCrudDeps {
  supabase: any;
  userId: string | undefined;
  isConnected: boolean;
  tournaments: Tournament[];
  setTournaments: React.Dispatch<React.SetStateAction<Tournament[]>>;
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  sharedItemPermissions: Record<string, 'read' | 'write'>;
}

function tournamentInsertErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return String(err ?? 'Unknown error');
}


function cleanTournamentDbValue(value: any): any {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) {
    return value.map(cleanTournamentDbValue).filter(v => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      const cleaned = cleanTournamentDbValue(val);
      if (cleaned !== undefined) out[key] = cleaned;
    });
    return out;
  }
  return value;
}

function cleanTournamentDbRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleaned = cleanTournamentDbValue(value);
    if (cleaned !== undefined) out[key] = cleaned;
  });
  return out;
}

export async function addTournamentOp(
  tournament: Omit<Tournament, 'id'>,
  deps: TournamentCrudDeps
): Promise<{ error: string | null }> {
  const { supabase, userId, isConnected, setTournaments } = deps;

  if (!userId) {
    const newTournament: Tournament = { ...tournament, id: Date.now().toString() };
    setTournaments(prev => [...prev, newTournament]);
    return { error: null };
  }

  if (!isConnected) {
    const tempId = `temp_${Date.now()}`;
    enqueueOperation({ type: 'insert', table: 'tournaments', dbPayload: buildTournamentDbPayload(tournament), tempId });
    setTournaments(prev => [...prev, { ...tournament, id: tempId }]);
    return { error: null };
  }

  try {
    const row: Record<string, unknown> = {
      user_id: userId,
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
    if (tournament.posterUrl != null && tournament.posterUrl !== '') {
      row.poster_url = tournament.posterUrl;
    }

    const { data, error } = await supabase.from('tournaments').insert(cleanTournamentDbRow(row)).select().single();

    if (error) throw error;

    if (data) {
      const newTournament: Tournament = {
        id: data.id,
        name: data.name,
        date: data.date,
        endDate: data.end_date,
        type: data.type,
        format: data.format,
        location: data.location,
        terrainId: data.terrain_id,
        terrainName: data.terrain_name,
        terrainType: data.terrain_type,
        clubId: data.club_id,
        clubName: data.club_name,
        status: data.status,
        participants: data.participants,
        maxParticipants: data.max_participants,
        prize: data.prize,
        description: data.description,
        teams: data.teams,
        phases: data.phases,
        currentPhaseId: data.current_phase_id,
        tournamentLevel: data.tournament_level,
        tournamentCategory: data.tournament_category,
        registrationType: data.registration_type,
        tournamentScope: data.tournament_scope,
        registrationCost: data.registration_cost ? parseFloat(data.registration_cost) : tournament.registrationCost,
        prizeWon: data.prize_won ? parseFloat(data.prize_won) : tournament.prizeWon,
        posterUrl: data.poster_url || tournament.posterUrl,
      };
      setTournaments(prev => [...prev, newTournament]);
    }
    return { error: null };
  } catch (error) {
    console.log('Error adding tournament:', error);
    return { error: tournamentInsertErrorMessage(error) };
  }
}

export async function updateTournamentOp(
  id: string,
  updates: Partial<Tournament>,
  deps: TournamentCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, tournaments, setTournaments, sharedItemPermissions } = deps;
  const oldTournament = tournaments.find(t => t.id === id);

  setTournaments(prev => prev.map(tournament =>
    tournament.id === id ? { ...tournament, ...updates } : tournament
  ));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'update', table: 'tournaments', itemId: id, dbPayload: buildUpdateDbPayload('tournaments', updates) });
    return;
  }

  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.format !== undefined) dbUpdates.format = updates.format;
    if (updates.location !== undefined) dbUpdates.location = updates.location;
    if (updates.terrainId !== undefined) dbUpdates.terrain_id = updates.terrainId;
    if (updates.terrainName !== undefined) dbUpdates.terrain_name = updates.terrainName;
    if (updates.terrainType !== undefined) dbUpdates.terrain_type = updates.terrainType;
    if (updates.clubId !== undefined) dbUpdates.club_id = updates.clubId;
    if (updates.clubName !== undefined) dbUpdates.club_name = updates.clubName;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.participants !== undefined) dbUpdates.participants = updates.participants;
    if (updates.maxParticipants !== undefined) dbUpdates.max_participants = updates.maxParticipants;
    if (updates.prize !== undefined) dbUpdates.prize = updates.prize;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.teams !== undefined) dbUpdates.teams = updates.teams;
    if (updates.phases !== undefined) dbUpdates.phases = updates.phases;
    if (updates.currentPhaseId !== undefined) dbUpdates.current_phase_id = updates.currentPhaseId;
    if (updates.tournamentLevel !== undefined) dbUpdates.tournament_level = updates.tournamentLevel;
    if (updates.tournamentCategory !== undefined) dbUpdates.tournament_category = updates.tournamentCategory;
    if (updates.registrationType !== undefined) dbUpdates.registration_type = updates.registrationType;
    if (updates.tournamentScope !== undefined) dbUpdates.tournament_scope = updates.tournamentScope;
    if (updates.registrationCost !== undefined) dbUpdates.registration_cost = updates.registrationCost;
    if (updates.prizeWon !== undefined) dbUpdates.prize_won = updates.prizeWon;
    if (updates.finalResult !== undefined) dbUpdates.final_result = updates.finalResult;
    
// ✅ Only include poster_url when it was explicitly passed, and map undefined → null
  if ('posterUrl' in updates) dbUpdates.poster_url = updates.posterUrl ?? null;

    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('tournaments').update(dbUpdates).eq('id', id);
    if (error) throw error;

    // Log modification for shared items
    if (sharedItemPermissions[id] === 'write' && oldTournament) {
      const { data: row } = await supabase.from('tournaments').select('user_id').eq('id', id).single();
      if (row?.user_id) {
        const ignoreFields = ['teams', 'phases', 'currentPhaseId'];
        const changes = Object.keys(updates).filter(k => !ignoreFields.includes(k) && (oldTournament as any)[k] !== (updates as any)[k]).map(k => ({ field: k, oldValue: (oldTournament as any)[k], newValue: (updates as any)[k] }));
        logModification({ itemType: 'tournament', itemId: id, ownerId: row.user_id, changes }).catch(() => {});
      }
    }
  } catch (error) {
    console.log('Error updating tournament:', error);
    if (oldTournament) {
      setTournaments(prev => prev.map(tournament =>
        tournament.id === id ? oldTournament : tournament
      ));
    }
    throw error;
  }
}

export function updateBracketMatchOp(
  tournamentId: string,
  bracketMatchId: string,
  updates: Partial<BracketMatch>,
  setTournaments: React.Dispatch<React.SetStateAction<Tournament[]>>
): void {
  setTournaments(prev => prev.map(tournament => {
    if (tournament.id !== tournamentId || !tournament.phases) return tournament;

    const updatedPhases = tournament.phases.map(phase => ({
      ...phase,
      matches: phase.matches.map(match =>
        match.id === bracketMatchId ? { ...match, ...updates } : match
      ),
    }));

    return { ...tournament, phases: updatedPhases };
  }));
}

/**
 * Auto-update tournament statuses based on dates:
 * - "À venir" → "En cours" when tournament date ≤ today
 * - "En cours" → "Terminé" when end_date < today (or date + 1 day if no end_date)
 * Returns the list of updated tournament IDs.
 */
export async function autoUpdateTournamentStatuses(
 tournaments: Tournament[],
 setTournaments: React.Dispatch<React.SetStateAction<Tournament[]>>,
 supabase: any,
 userId: string | undefined,
): Promise<string[]> {
  console.log("-------update auto tournaments--------")
 if (!userId) return [];
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
 const updatedIds: string[] = [];

 for (const t of tournaments) {
 const tournamentDate = new Date(t.date);
 const tournamentDay = new Date(tournamentDate.getFullYear(), tournamentDate.getMonth(), tournamentDate.getDate());

 // Determine end day: use endDate if available, otherwise same as date
 const endDate = t.endDate ? new Date(t.endDate) : tournamentDate;
 const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

 let newStatus: string | null = null;

 if (t.status === 'À venir') {
 // Tournament has started (date <= today)
 if (tournamentDay <= today) {
 // If it's a single-day tournament and today is past the tournament day, mark as Terminé
 if (endDay < today) {
 newStatus = 'Terminé';
 } else {
 newStatus = 'En cours';
 }
 }
 } else if (t.status === 'En cours') {
 // Tournament ended (end day < today)
 if (endDay < today) {
 newStatus = 'Terminé';
 }
 }

 if (newStatus && newStatus !== t.status) {
 updatedIds.push(t.id);
 // Update in DB
 try {
 await supabase.from('tournaments').update({
 status: newStatus,
 updated_at: new Date().toISOString(),
 }).eq('id', t.id);
 } catch (e) {
 console.log('[AutoStatus] Error updating tournament', t.id, e);
 }
 }
 }

 if (updatedIds.length > 0) {
 // Batch update local state
 setTournaments(prev => prev.map(t => {
 if (!updatedIds.includes(t.id)) return t;
 const tournamentDate = new Date(t.date);
 const tournamentDay = new Date(tournamentDate.getFullYear(), tournamentDate.getMonth(), tournamentDate.getDate());
 const endDate = t.endDate ? new Date(t.endDate) : tournamentDate;
 const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
 if (t.status === 'À venir' && tournamentDay <= today) {
 return { ...t, status: endDay < today ? 'Terminé' : 'En cours' };
 }
 if (t.status === 'En cours' && endDay < today) {
 return { ...t, status: 'Terminé' };
 }
 return t;
 }));
 console.log(`[AutoStatus] Updated ${updatedIds.length} tournament(s)`);
 }

 return updatedIds;
}

export async function deleteTournamentOp(
  id: string,
  deps: Pick<TournamentCrudDeps, 'supabase' | 'userId' | 'isConnected' | 'setTournaments' | 'setMatches' | 'tournaments' | 'matches'>
): Promise<{ error: string | null }> {
  const { supabase, userId, isConnected, setTournaments, setMatches, tournaments, matches } = deps;
  const removedTournament = tournaments.find(t => t.id === id);
  const matchSnapshots = matches
    .filter(m => m.tournamentId === id)
    .map(m => ({ id: m.id, tournamentId: m.tournamentId, tournamentName: m.tournamentName }));

  setTournaments(prev => prev.filter(tournament => tournament.id !== id));
  setMatches(prev => prev.map(m =>
    m.tournamentId === id ? { ...m, tournamentId: undefined, tournamentName: undefined } : m
  ));

  if (!userId) return { error: null };

  if (!isConnected) {
    enqueueOperation({ type: 'delete', table: 'tournaments', itemId: id });
    return { error: null };
  }

  try {
    const { error: unlinkError } = await supabase.from('matches').update({
      tournament_id: null,
      tournament_name: null,
      updated_at: new Date().toISOString(),
    }).eq('tournament_id', id);
    if (unlinkError) throw unlinkError;

    const { error: deleteError } = await supabase.from('tournaments').delete().eq('id', id);
    if (deleteError) throw deleteError;
    return { error: null };
  } catch (error) {
    console.log('Error deleting tournament:', error);
    const msg = tournamentInsertErrorMessage(error);
    if (removedTournament) {
      setTournaments(prev => (prev.some(t => t.id === removedTournament.id) ? prev : [...prev, removedTournament]));
    }
    if (matchSnapshots.length > 0) {
      setMatches(prev => prev.map(m => {
        const snap = matchSnapshots.find(s => s.id === m.id);
        return snap ? { ...m, tournamentId: snap.tournamentId, tournamentName: snap.tournamentName } : m;
      }));
    }
    return { error: msg };
  }
}
