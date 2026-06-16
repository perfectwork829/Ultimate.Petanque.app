/**
 * Global Ranking Service — World ELO leaderboard + League Tiers system.
 *
 * Features:
 * - Global ranking with filters by continent/country/city
 * - League tier definitions (Bronze → Grand Master)
 * - Intra-league ranking
 * - Player's global rank computation
 * - Promotion/relegation zone detection
 */
import { getSupabaseClient } from '@/template';
import { getEloRank, ELO_RANKS, ELO_INITIAL } from './eloService';
import { LEADERBOARD_MIN_MATCHES } from './leaderboardService';

// ============================================
// LEAGUE TIER DEFINITIONS
// ============================================
export interface LeagueTier {
  id: string;
  name: { fr: string; en: string };
  minElo: number;
  maxElo: number; // Infinity for top tier
  color: string;
  gradient: [string, string];
  icon: string;
  emblem: string; // emoji
}

export const LEAGUE_TIERS: LeagueTier[] = [
  { id: 'grand_master', name: { fr: 'Grand Maitre', en: 'Grand Master' }, minElo: 2000, maxElo: Infinity, color: '#FFD700', gradient: ['#FFD700', '#F59E0B'], icon: 'auto-awesome', emblem: '👑' },
  { id: 'master', name: { fr: 'Maitre', en: 'Master' }, minElo: 1800, maxElo: 1999, color: '#9333EA', gradient: ['#9333EA', '#7C3AED'], icon: 'stars', emblem: '💎' },
  { id: 'diamond', name: { fr: 'Diamant', en: 'Diamond' }, minElo: 1500, maxElo: 1799, color: '#06B6D4', gradient: ['#06B6D4', '#0891B2'], icon: 'diamond', emblem: '💠' },
  { id: 'gold', name: { fr: 'Or', en: 'Gold' }, minElo: 1200, maxElo: 1499, color: '#F59E0B', gradient: ['#F59E0B', '#D97706'], icon: 'emoji-events', emblem: '🥇' },
  { id: 'silver', name: { fr: 'Argent', en: 'Silver' }, minElo: 1100, maxElo: 1199, color: '#94A3B8', gradient: ['#94A3B8', '#64748B'], icon: 'workspace-premium', emblem: '🥈' },
  { id: 'bronze', name: { fr: 'Bronze', en: 'Bronze' }, minElo: 0, maxElo: 1099, color: '#CD7F32', gradient: ['#CD7F32', '#A0522D'], icon: 'shield', emblem: '🥉' },
];

export function getLeagueTier(elo: number): LeagueTier {
  for (const tier of LEAGUE_TIERS) {
    if (elo >= tier.minElo) return tier;
  }
  return LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
}

export function getLeagueProgress(elo: number): { tier: LeagueTier; nextTier: LeagueTier | null; progress: number; eloToNext: number } {
  const tier = getLeagueTier(elo);
  const tierIndex = LEAGUE_TIERS.indexOf(tier);
  const nextTier = tierIndex > 0 ? LEAGUE_TIERS[tierIndex - 1] : null;

  if (!nextTier) {
    return { tier, nextTier: null, progress: 100, eloToNext: 0 };
  }

  const range = nextTier.minElo - tier.minElo;
  const current = elo - tier.minElo;
  const progress = Math.min(100, Math.max(0, Math.round((current / range) * 100)));
  const eloToNext = Math.max(0, nextTier.minElo - elo);

  return { tier, nextTier, progress, eloToNext };
}

// ============================================
// RANKED PLAYER TYPE
// ============================================
export interface RankedPlayer {
  id: string;
  name: string;
  avatar?: string;
  club?: string;
  city?: string;
  country: string;
  role: string;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  globalRank: number;
  leagueTier: LeagueTier;
  isPublic: boolean;
}

// ============================================
// FETCH GLOBAL RANKINGS
// ============================================
export async function fetchGlobalRankings(params: {
  limit?: number;
  offset?: number;
  continent?: string;
  country?: string;
  city?: string;
  leagueTierId?: string;
}): Promise<{ players: RankedPlayer[]; total: number; error: string | null }> {
  const { limit = 50, offset = 0, continent, country, city, leagueTierId } = params;
  const supabase = getSupabaseClient();

  try {
    // Step 1: Get authenticated user IDs from user_profiles
    const { data: authUsers } = await supabase.from('user_profiles').select('id');
    const authIdSet = new Set((authUsers || []).map((u: any) => u.id));

    // Step 2: Fetch all public players (self-players only: id === user_id)
    let query = supabase
      .from('players')
      .select('id, user_id, name, avatar, club, city, country, role, elo_rating, stats, is_public')
      .eq('is_public', true)
      .order('elo_rating', { ascending: false });

    // Apply filters
    if (country) {
      query = query.eq('country', country);
    }
    if (city) {
      query = query.ilike('city', city);
    }

    // League tier filter (ELO range)
    if (leagueTierId) {
      const tier = LEAGUE_TIERS.find(t => t.id === leagueTierId);
      if (tier) {
        query = query.gte('elo_rating', tier.minElo);
        if (tier.maxElo !== Infinity) {
          query = query.lte('elo_rating', tier.maxElo);
        }
      }
    }

    const { data: rawPlayers, error } = await query;

    if (error) return { players: [], total: 0, error: error.message };

    // Step 3: Filter to only real authenticated self-players
    const realPlayers = (rawPlayers || []).filter((p: any) => p.user_id && p.id === p.user_id && authIdSet.has(p.id));

    // Step 4: Count multi-player matches per player (anti-cheat)
    const realPlayerIds = realPlayers.map((p: any) => p.id);
    const multiPlayerCountMap = new Map<string, number>();

    if (realPlayerIds.length > 0) {
      const { data: allMatches } = await supabase
        .from('matches')
        .select('team_a, team_b, participant_user_ids');

      if (allMatches) {
        for (const m of allMatches) {
          const participantIds: string[] = m.participant_user_ids || [];
          if (participantIds.length < 2) continue;
          const teamAPlayers: string[] = m.team_a?.players || [];
          const teamBPlayers: string[] = m.team_b?.players || [];
          const allMatchPlayers = [...teamAPlayers, ...teamBPlayers];
          for (const pid of allMatchPlayers) {
            if (realPlayerIds.includes(pid)) {
              multiPlayerCountMap.set(pid, (multiPlayerCountMap.get(pid) || 0) + 1);
            }
          }
        }
      }
    }

    // Step 5: Only include players meeting minimum multi-player match threshold
    const qualifiedPlayers = realPlayers.filter((p: any) => {
      const count = multiPlayerCountMap.get(p.id) || 0;
      return count >= LEADERBOARD_MIN_MATCHES;
    });

    // Step 6: Apply pagination on filtered results
    const total = qualifiedPlayers.length;
    const paginated = qualifiedPlayers.slice(offset, offset + limit);

    const players: RankedPlayer[] = paginated.map((p: any, idx: number) => {
      const stats = p.stats || {};
      const mp = stats.matchesPlayed || 0;
      const w = stats.wins || 0;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        club: p.club,
        city: p.city,
        country: p.country || 'France',
        role: p.role || 'Milieu',
        eloRating: p.elo_rating || ELO_INITIAL,
        matchesPlayed: mp,
        wins: w,
        winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
        globalRank: offset + idx + 1,
        leagueTier: getLeagueTier(p.elo_rating || ELO_INITIAL),
        isPublic: p.is_public,
      };
    });

    return { players, total, error: null };
  } catch (e: any) {
    return { players: [], total: 0, error: e.message || 'Failed to fetch rankings' };
  }
}

// ============================================
// FETCH GLOBAL RANKINGS PREVIEW (no match threshold)
// ============================================
export async function fetchGlobalRankingsPreview(params: {
  limit?: number;
  offset?: number;
}): Promise<{ players: RankedPlayer[]; total: number; error: string | null }> {
  const { limit = 3, offset = 0 } = params;
  const supabase = getSupabaseClient();

  try {
    const { data: authUsers } = await supabase.from('user_profiles').select('id');
    const authIdSet = new Set((authUsers || []).map((u: any) => u.id));

    const { data: rawPlayers, error } = await supabase
      .from('players')
      .select('id, user_id, name, avatar, club, city, country, role, elo_rating, stats, is_public')
      .eq('is_public', true)
      .order('elo_rating', { ascending: false });

    if (error) return { players: [], total: 0, error: error.message };

    // Only real authenticated self-players (no match threshold)
    const realPlayers = (rawPlayers || []).filter((p: any) => p.user_id && p.id === p.user_id && authIdSet.has(p.id));

    const total = realPlayers.length;
    const paginated = realPlayers.slice(offset, offset + limit);

    const players: RankedPlayer[] = paginated.map((p: any, idx: number) => {
      const stats = p.stats || {};
      const mp = stats.matchesPlayed || 0;
      const w = stats.wins || 0;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        club: p.club,
        city: p.city,
        country: p.country || 'France',
        role: p.role || 'Milieu',
        eloRating: p.elo_rating || ELO_INITIAL,
        matchesPlayed: mp,
        wins: w,
        winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
        globalRank: offset + idx + 1,
        leagueTier: getLeagueTier(p.elo_rating || ELO_INITIAL),
        isPublic: p.is_public,
      };
    });

    return { players, total, error: null };
  } catch (e: any) {
    return { players: [], total: 0, error: e.message || 'Failed to fetch preview rankings' };
  }
}

// ============================================
// FETCH PLAYER GLOBAL RANK
// ============================================
export async function fetchPlayerGlobalRank(playerId: string): Promise<{ rank: number | null; total: number; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    // Get the player's ELO
    const { data: player } = await supabase
      .from('players')
      .select('elo_rating, is_public, user_id')
      .eq('id', playerId)
      .single();

    if (!player || !player.is_public) return { rank: null, total: 0, error: null };

    // Fetch all qualified players to compute rank accurately
    const { players: allQualified } = await fetchGlobalRankings({ limit: 10000, offset: 0 });

    const rank = allQualified.findIndex(p => p.id === playerId) + 1;
    const total = allQualified.length;

    return { rank: rank > 0 ? rank : null, total, error: null };
  } catch (e: any) {
    return { rank: null, total: 0, error: e.message };
  }
}

// ============================================
// FETCH LEAGUE TIER STATS
// ============================================
export interface LeagueTierStats {
  tier: LeagueTier;
  playerCount: number;
}

export async function fetchLeagueTierStats(): Promise<{ stats: LeagueTierStats[]; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const result: LeagueTierStats[] = [];

    for (const tier of LEAGUE_TIERS) {
      let query = supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('is_public', true)
        .gte('elo_rating', tier.minElo);

      if (tier.maxElo !== Infinity) {
        query = query.lte('elo_rating', tier.maxElo);
      }

      const { count } = await query;
      result.push({ tier, playerCount: count || 0 });
    }

    return { stats: result, error: null };
  } catch (e: any) {
    return { stats: [], error: e.message };
  }
}

// ============================================
// AVAILABLE COUNTRIES
// ============================================
export async function fetchAvailableCountries(): Promise<string[]> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('players')
      .select('country')
      .eq('is_public', true)
      .not('country', 'is', null);

    if (!data) return [];
    const countries = [...new Set(data.map((d: any) => d.country).filter(Boolean))].sort();
    return countries;
  } catch {
    return [];
  }
}

export async function fetchAvailableCities(country?: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  try {
    let query = supabase
      .from('players')
      .select('city')
      .eq('is_public', true)
      .not('city', 'is', null);

    if (country) query = query.eq('country', country);

    const { data } = await query;
    if (!data) return [];
    const cities = [...new Set(data.map((d: any) => d.city).filter(Boolean))].sort();
    return cities;
  } catch {
    return [];
  }
}
