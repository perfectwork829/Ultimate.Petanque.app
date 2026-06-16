// ============================================
// Club Leaderboard Service
// Aggregates public player stats by club
// ============================================
import { getSupabaseClient } from '@/template';
import { fetchLeaderboard, LeaderboardPlayer, LeaderboardPeriod } from './leaderboardService';

export interface LeaderboardClub {
  id: string; // club name as ID (no club table join needed for public)
  name: string;
  city?: string;
  country?: string;
  logo?: string;
  playerCount: number;
  totalMatches: number;
  hasQualifiedPlayers: boolean;
  stats: {
    avgWinRate: number;
    avgTirRate: number;
    avgPointRate: number;
    avgCarreauRate: number;
    totalWins: number;
    totalLosses: number;
    compositeScore: number; // weighted: 40% winRate + 25% tirRate + 20% carreauRate + 15% activity
  };
  topPlayers: { name: string; avatar?: string; winRate: number }[];
}

export type ClubLeaderboardSort = 'compositeScore' | 'avgWinRate' | 'totalMatches' | 'playerCount' | 'avgTirRate' | 'avgCarreauRate';

export async function fetchClubLeaderboard(period?: LeaderboardPeriod): Promise<{ clubs: LeaderboardClub[]; error: string | null }> {
  try {
    const { players, error } = await fetchLeaderboard(period);
    if (error) return { clubs: [], error };

    // Group players by club
    const clubMap = new Map<string, LeaderboardPlayer[]>();
    for (const p of players) {
      if (!p.club) continue;
      const existing = clubMap.get(p.club) || [];
      existing.push(p);
      clubMap.set(p.club, existing);
    }

    // Try to fetch club details (logo, city) for matched clubs AND public clubs without leaderboard players
    const supabase = getSupabaseClient();
    let clubDetails = new Map<string, { logo?: string; city?: string; country?: string; id?: string; membersCount?: number }>();

    try {
      const { data: clubsData } = await supabase
        .from('clubs')
        .select('id, name, logo, city, country, members_count')
        .eq('is_public', true);

      if (clubsData) {
        for (const c of clubsData) {
          clubDetails.set(c.name, {
            id: c.id,
            logo: c.logo || undefined,
            city: c.city || undefined,
            country: c.country || undefined,
            membersCount: c.members_count || 0,
          });
          // Add public clubs that have no leaderboard players to the map
          if (!clubMap.has(c.name)) {
            clubMap.set(c.name, []);
          }
        }
      }
    } catch { /* silent */ }

    const clubs: LeaderboardClub[] = [];

    for (const [clubName, clubPlayers] of clubMap) {

      const detail = clubDetails.get(clubName);

      // For clubs with no leaderboard players, show basic info from clubs table
      const totalMatches = clubPlayers.length > 0 ? clubPlayers.reduce((sum, p) => sum + p.stats.matchesPlayed, 0) : 0;
      const totalWins = clubPlayers.length > 0 ? clubPlayers.reduce((sum, p) => sum + p.stats.wins, 0) : 0;
      const totalLosses = clubPlayers.length > 0 ? clubPlayers.reduce((sum, p) => sum + p.stats.losses, 0) : 0;

      const avgWinRate = clubPlayers.length > 0 ? Math.round(clubPlayers.reduce((sum, p) => sum + p.stats.winRate, 0) / clubPlayers.length) : 0;
      const avgTirRate = clubPlayers.length > 0 ? Math.round(
        clubPlayers.filter(p => p.stats.tirRate > 0).reduce((sum, p) => sum + p.stats.tirRate, 0) /
        Math.max(1, clubPlayers.filter(p => p.stats.tirRate > 0).length)
      ) : 0;
      const avgPointRate = clubPlayers.length > 0 ? Math.round(
        clubPlayers.filter(p => p.stats.pointRate > 0).reduce((sum, p) => sum + p.stats.pointRate, 0) /
        Math.max(1, clubPlayers.filter(p => p.stats.pointRate > 0).length)
      ) : 0;
      const avgCarreauRate = clubPlayers.length > 0 ? Math.round(
        clubPlayers.filter(p => p.stats.carreauRate > 0).reduce((sum, p) => sum + p.stats.carreauRate, 0) /
        Math.max(1, clubPlayers.filter(p => p.stats.carreauRate > 0).length)
      ) : 0;

      // Activity score: normalize based on matches per player (max 50 matches/player → 100)
      const effectivePlayerCount = Math.max(clubPlayers.length, 1);
      const activityScore = Math.min(100, Math.round((totalMatches / effectivePlayerCount / 50) * 100));

      // Composite score: weighted combination
      const compositeScore = Math.round(
        avgWinRate * 0.40 +
        avgTirRate * 0.25 +
        avgCarreauRate * 0.20 +
        activityScore * 0.15
      );

      // Top 3 players by win rate
      const topPlayers = [...clubPlayers]
        .sort((a, b) => b.stats.winRate - a.stats.winRate)
        .slice(0, 3)
        .map(p => ({ name: p.name, avatar: p.avatar, winRate: p.stats.winRate }));

      clubs.push({
        id: detail?.id || clubName,
        name: clubName,
        city: detail?.city || clubPlayers[0]?.city,
        country: detail?.country || clubPlayers[0]?.country,
        logo: detail?.logo,
        playerCount: clubPlayers.length > 0 ? clubPlayers.length : (detail?.membersCount || 0),
        totalMatches,
        hasQualifiedPlayers: clubPlayers.length > 0,
        stats: {
          avgWinRate,
          avgTirRate,
          avgPointRate,
          avgCarreauRate,
          totalWins,
          totalLosses,
          compositeScore,
        },
        topPlayers,
      });
    }

    return { clubs, error: null };
  } catch (e: any) {
    return { clubs: [], error: e.message || 'Club leaderboard error' };
  }
}

export function sortClubLeaderboard(clubs: LeaderboardClub[], sortBy: ClubLeaderboardSort): LeaderboardClub[] {
  return [...clubs].sort((a, b) => {
    switch (sortBy) {
      case 'compositeScore':
        if (b.stats.compositeScore !== a.stats.compositeScore) return b.stats.compositeScore - a.stats.compositeScore;
        if (b.stats.avgWinRate !== a.stats.avgWinRate) return b.stats.avgWinRate - a.stats.avgWinRate;
        if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
        return a.name.localeCompare(b.name);
      case 'avgWinRate':
        if (b.stats.avgWinRate !== a.stats.avgWinRate) return b.stats.avgWinRate - a.stats.avgWinRate;
        return b.totalMatches - a.totalMatches;
      case 'totalMatches':
        return b.totalMatches - a.totalMatches;
      case 'playerCount':
        if (b.playerCount !== a.playerCount) return b.playerCount - a.playerCount;
        return b.stats.compositeScore - a.stats.compositeScore;
      case 'avgTirRate':
        if (b.stats.avgTirRate !== a.stats.avgTirRate) return b.stats.avgTirRate - a.stats.avgTirRate;
        return b.totalMatches - a.totalMatches;
      case 'avgCarreauRate':
        if (b.stats.avgCarreauRate !== a.stats.avgCarreauRate) return b.stats.avgCarreauRate - a.stats.avgCarreauRate;
        return b.totalMatches - a.totalMatches;
      default:
        return b.stats.compositeScore - a.stats.compositeScore;
    }
  });
}
