/**
 * Memoized selectors — granular hooks that return a single item from context.
 *
 * These hooks use useRef-based shallow comparison so consumers only re-render
 * when the specific item they subscribed to actually changes, NOT when other
 * items in the same list change.
 *
 * Usage:
 *   const player = usePlayer(id);        // re-renders only when THIS player changes
 *   const match = useMatch(id);          // re-renders only when THIS match changes
 *   const tournament = useTournament(id); // same pattern
 *   const club = useClub(id);
 *   const terrain = useTerrain(id);
 */
import { useRef, useMemo } from 'react';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import type { Player, Match, Tournament, Club, Terrain, BoulesSet } from '@/types/petanque';

// ============================================
// Shallow equality check for plain objects
// ============================================
function shallowEqual<T extends Record<string, any>>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// ============================================
// Stable reference hook
// ============================================
function useStableRef<T extends Record<string, any>>(value: T | undefined): T | undefined {
  const ref = useRef(value);
  if (!shallowEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

// ============================================
// usePlayer — returns a single player by ID
// ============================================
export function usePlayer(id: string | undefined): Player | undefined {
  const { players } = useAppData();
  const player = useMemo(() => {
    if (!id) return undefined;
    return players.find(p => p.id === id);
  }, [players, id]);
  return useStableRef(player as any) as Player | undefined;
}

// ============================================
// useMatch — returns a single match by ID
// ============================================
export function useMatch(id: string | undefined): Match | undefined {
  const { getMatchById } = useAppActions();
  const { matches } = useAppData();
  const match = useMemo(() => {
    if (!id) return undefined;
    return getMatchById(id);
  }, [matches, id, getMatchById]);
  return useStableRef(match as any) as Match | undefined;
}

// ============================================
// useTournament — returns a single tournament by ID
// ============================================
export function useTournament(id: string | undefined): Tournament | undefined {
  const { getTournamentById } = useAppActions();
  const { tournaments } = useAppData();
  const tournament = useMemo(() => {
    if (!id) return undefined;
    return getTournamentById(id);
  }, [tournaments, id, getTournamentById]);
  return useStableRef(tournament as any) as Tournament | undefined;
}

// ============================================
// useClub — returns a single club by ID
// ============================================
export function useClub(id: string | undefined): Club | undefined {
  const { getClubById } = useAppActions();
  const { clubs } = useAppData();
  const club = useMemo(() => {
    if (!id) return undefined;
    return getClubById(id);
  }, [clubs, id, getClubById]);
  return useStableRef(club as any) as Club | undefined;
}

// ============================================
// useTerrain — returns a single terrain by ID
// ============================================
export function useTerrain(id: string | undefined): Terrain | undefined {
  const { getTerrainById } = useAppActions();
  const { terrains } = useAppData();
  const terrain = useMemo(() => {
    if (!id) return undefined;
    return getTerrainById(id);
  }, [terrains, id, getTerrainById]);
  return useStableRef(terrain as any) as Terrain | undefined;
}

// ============================================
// useSelfPlayer — returns the current user's player
// ============================================
export function useSelfPlayer(): Player | null {
  const { selfPlayer } = useAppData();
  const ref = useRef(selfPlayer);
  if (!shallowEqual(ref.current as any, selfPlayer as any)) {
    ref.current = selfPlayer;
  }
  return ref.current;
}

// ============================================
// useBoulesSet — returns a single boules set by ID
// ============================================
export function useBoulesSet(id: string | undefined): BoulesSet | undefined {
  const { boulesSets } = useAppData();
  const set = useMemo(() => {
    if (!id) return undefined;
    return boulesSets.find(b => b.id === id);
  }, [boulesSets, id]);
  return useStableRef(set as any) as BoulesSet | undefined;
}

// ============================================
// usePlayerMatches — returns matches for a specific player
// ============================================
export function usePlayerMatches(playerId: string | undefined): Match[] {
  const { getMatchesByPlayer } = useAppActions();
  const { matches } = useAppData();
  return useMemo(() => {
    if (!playerId) return [];
    return getMatchesByPlayer(playerId);
  }, [matches, playerId, getMatchesByPlayer]);
}

// ============================================
// useTournamentMatches — returns matches for a specific tournament
// ============================================
export function useTournamentMatches(tournamentId: string | undefined): Match[] {
  const { getMatchesByTournament } = useAppActions();
  const { matches } = useAppData();
  return useMemo(() => {
    if (!tournamentId) return [];
    return getMatchesByTournament(tournamentId);
  }, [matches, tournamentId, getMatchesByTournament]);
}
