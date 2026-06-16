/**
 * Community-wide totals for Creator Note, Roadmap, etc.
 * RPC get_community_stats returns keys: players, matches, terrains, tournaments, clubs, challenges.
 * Legacy RPC payloads used total_* keys — normalized here for older deployments.
 */
import { getSupabaseClient } from '@/template';

export interface CommunityStats {
  players: number;
  matches: number;
  terrains: number;
  tournaments: number;
  clubs: number;
  challenges: number;
}

const EMPTY: CommunityStats = {
  players: 0,
  matches: 0,
  terrains: 0,
  tournaments: 0,
  clubs: 0,
  challenges: 0,
};

export function normalizeCommunityStats(data: unknown): CommunityStats {
  if (!data || typeof data !== 'object') return { ...EMPTY };
  const row = data as Record<string, unknown>;
  return {
    players: Number(row.players ?? row.total_users) || 0,
    matches: Number(row.matches ?? row.total_matches) || 0,
    terrains: Number(row.terrains ?? row.total_terrains) || 0,
    tournaments: Number(row.tournaments ?? row.total_tournaments) || 0,
    clubs: Number(row.clubs ?? row.total_clubs) || 0,
    challenges: Number(row.challenges ?? row.total_challenges) || 0,
  };
}

export async function fetchCommunityStats(): Promise<CommunityStats> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_community_stats');
  if (error) {
    console.log('[communityStats] RPC error:', error.message);
    return { ...EMPTY };
  }
  return normalizeCommunityStats(data);
}
