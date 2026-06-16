import { getSupabaseClient } from '@/template';
import { getAmbassadorUserIds } from '@/services/ambassadorService';
import { getMatchValidationWeight } from '@/services/trustScoreService';

export interface LeaderboardPlayer {
  id: string;
  userId: string;
  name: string;
  nickname?: string;
  avatar?: string;
  club?: string;
  role: string;
  level: string;
  country?: string;
  city?: string;
  boulesBrand?: string;
  boulesModel?: string;
  terrainName?: string;
  isPremium?: boolean;
  isAmbassador?: boolean;
  trustScore?: number;
  trustLevel?: 'high' | 'medium' | 'low' | 'suspicious';
  createdAt?: string;
  eloRating?: number;
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
}

export type LeaderboardSort = 'winRate' | 'matches' | 'tirRate' | 'pointRate' | 'carreauRate' | 'elo';

export type LeaderboardPeriod = 'all' | '7d' | '30d' | '3m' | '6m' | '1y' | 'season' | 'lastSeason';

export const LEADERBOARD_MIN_MATCHES = 3;

/**
 * Fetch the count of multi-player matches (participant_user_ids >= 2) for a user.
 * Used for qualification progress display.
 */
export async function fetchMultiPlayerMatchCount(userId: string): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('matches')
      .select('id, participant_user_ids')
      .eq('user_id', userId);
    if (error || !data) return 0;
    return data.filter((m: any) => (m.participant_user_ids || []).length >= 2).length;
  } catch { return 0; }
}

/** Compute date range for a given period */
export function getPeriodDateRange(period: LeaderboardPeriod): { from: Date | null; to: Date | null; label: string } {
  if (period === 'all') return { from: null, to: null, label: 'All time' };
  const now = new Date();
  const to = new Date();
  let from = new Date();

  switch (period) {
    case '7d':
      from.setDate(now.getDate() - 7);
      return { from, to, label: '7 days' };
    case '30d':
      from.setDate(now.getDate() - 30);
      return { from, to, label: '30 days' };
    case '3m':
      from.setMonth(now.getMonth() - 3);
      return { from, to, label: '3 months' };
    case '6m':
      from.setMonth(now.getMonth() - 6);
      return { from, to, label: '6 months' };
    case '1y':
      from.setFullYear(now.getFullYear() - 1);
      return { from, to, label: '1 year' };
    case 'season': {
      // Season = September 1 to June 30
      const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      from = new Date(year, 8, 1); // Sept 1
      const seasonEnd = new Date(year + 1, 5, 30, 23, 59, 59); // June 30
      return { from, to: seasonEnd < now ? seasonEnd : to, label: `${year}/${year + 1}` };
    }
    case 'lastSeason': {
      const year = now.getMonth() >= 8 ? now.getFullYear() - 1 : now.getFullYear() - 2;
      from = new Date(year, 8, 1);
      const seasonEnd = new Date(year + 1, 5, 30, 23, 59, 59);
      return { from, to: seasonEnd, label: `${year}/${year + 1}` };
    }
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

export async function fetchLeaderboard(period?: LeaderboardPeriod): Promise<{ players: LeaderboardPlayer[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const usePeriod = period && period !== 'all';

  try {
    // Fetch only real user profiles — INNER JOIN ensures player.id exists in user_profiles
    // This prevents ANY locally created player (opponent cards) from appearing,
    // even if they somehow have is_public=true or matching user_id.
    const { data: authUserIds, error: authError } = await supabase
      .from('user_profiles')
      .select('id');

    if (authError) return { players: [], error: authError.message };

    const authIdSet = new Set((authUserIds || []).map((u: any) => u.id));

    // Fetch public players
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('id, user_id, name, nickname, avatar, club, role, level, country, location, stats, boules, terrain_name, created_at, elo_rating')
      .eq('is_public', true);

    if (playersError) return { players: [], error: playersError.message };

    let playerStatsMap: Map<string, { matchesPlayed: number; wins: number; losses: number; winRate: number; tirRate: number; pointRate: number; carreauRate: number }> | null = null;

    // ANTI-CHEAT: For leaderboard, only count matches played with other real app users.
    // A match counts only if participant_user_ids has 2+ distinct user IDs.
    // This prevents inflating stats by playing against directory-only players.

    // If period filter, fetch matches within the date range and recompute stats
    if (usePeriod) {
      const range = getPeriodDateRange(period);
      if (range.from) {
        let matchQuery = supabase
          .from('matches')
          .select('id, team_a, team_b, winner, player_actions, participant_user_ids')
          .gte('date', range.from.toISOString());
        if (range.to) {
          matchQuery = matchQuery.lte('date', range.to.toISOString());
        }
        const { data: matchesData } = await matchQuery;

        if (matchesData && matchesData.length > 0) {
          playerStatsMap = new Map();
          const playerIds = new Set((playersData || []).map((p: any) => p.id));

          for (const m of matchesData) {
            // ANTI-CHEAT: Skip matches without 2+ real app users
            const participantIds: string[] = m.participant_user_ids || [];
            if (participantIds.length < 2) continue;

            const teamAPlayers: string[] = m.team_a?.players || [];
            const teamBPlayers: string[] = m.team_b?.players || [];
            const allMatchPlayers = [...teamAPlayers, ...teamBPlayers].filter(id => playerIds.has(id));

            // Weighted match validation
            const matchWeight = getMatchValidationWeight(participantIds.length);

            for (const pid of allMatchPlayers) {
              if (!playerStatsMap.has(pid)) {
                playerStatsMap.set(pid, { matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0 });
              }
              const ps = playerStatsMap.get(pid)!;
              ps.matchesPlayed++;
              const inA = teamAPlayers.includes(pid);
              if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
                ps.wins++;
              } else {
                ps.losses++;
              }
              const rawKey = '_raw_' + pid;
              const prev = (playerStatsMap as any)[rawKey] || { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0, weightedWins: 0, totalWeight: 0 };
              prev.totalWeight += matchWeight;
              if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
                prev.weightedWins += matchWeight;
              }
              if (m.player_actions) {
                const pa = (m.player_actions as any[]).find((a: any) => a.playerId === pid);
                if (pa) {
                  prev.tirs += pa.actions?.tirs || 0;
                  prev.tirsSuccess += pa.actions?.tirsSuccess || 0;
                  prev.points += pa.actions?.points || 0;
                  prev.pointsSuccess += pa.actions?.pointsSuccess || 0;
                  prev.carreaux += pa.actions?.carreaux || 0;
                }
              }
              (playerStatsMap as any)[rawKey] = prev;
            }
          }

          // Compute rates (weighted win rate)
          for (const [pid, ps] of playerStatsMap.entries()) {
            if (pid.startsWith('_raw_')) continue;
            const raw = (playerStatsMap as any)['_raw_' + pid];
            ps.winRate = (raw && raw.totalWeight > 0) ? Math.round((raw.weightedWins / raw.totalWeight) * 1000) / 10 : (ps.matchesPlayed > 0 ? Math.round((ps.wins / ps.matchesPlayed) * 1000) / 10 : 0);
            if (raw) {
              ps.tirRate = raw.tirs > 0 ? Math.round((raw.tirsSuccess / raw.tirs) * 1000) / 10 : 0;
              ps.pointRate = raw.points > 0 ? Math.round((raw.pointsSuccess / raw.points) * 1000) / 10 : 0;
              ps.carreauRate = raw.tirsSuccess > 0 ? Math.round((raw.carreaux / raw.tirsSuccess) * 1000) / 10 : 0;
            }
          }
        }
      }
    }

    // When no period filter is used, we need to recompute stats from scratch
    // using only matches with 2+ real app users (anti-cheat)
    if (!playerStatsMap) {
      // Fetch ALL matches with participant_user_ids to recompute clean stats
      const { data: allMatchesData } = await supabase
        .from('matches')
        .select('id, team_a, team_b, winner, player_actions, participant_user_ids');

      if (allMatchesData && allMatchesData.length > 0) {
        playerStatsMap = new Map();
        const playerIdsSet = new Set((playersData || []).map((p: any) => p.id));

        for (const m of allMatchesData) {
          // ANTI-CHEAT: Skip matches without 2+ real app users
          const participantIds: string[] = m.participant_user_ids || [];
          if (participantIds.length < 2) continue;

          const teamAPlayers: string[] = m.team_a?.players || [];
          const teamBPlayers: string[] = m.team_b?.players || [];
          const allMatchPlayers = [...teamAPlayers, ...teamBPlayers].filter(id => playerIdsSet.has(id));

          const matchWeight2 = getMatchValidationWeight(participantIds.length);

          for (const pid of allMatchPlayers) {
            if (!playerStatsMap.has(pid)) {
              playerStatsMap.set(pid, { matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0 });
            }
            const ps = playerStatsMap.get(pid)!;
            ps.matchesPlayed++;
            const inA = teamAPlayers.includes(pid);
            if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
              ps.wins++;
            } else {
              ps.losses++;
            }
            const rawKey2 = '_raw_' + pid;
            const prev2 = (playerStatsMap as any)[rawKey2] || { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0, weightedWins: 0, totalWeight: 0 };
            prev2.totalWeight += matchWeight2;
            if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
              prev2.weightedWins += matchWeight2;
            }
            if (m.player_actions) {
              const pa = (m.player_actions as any[]).find((a: any) => a.playerId === pid);
              if (pa) {
                prev2.tirs += pa.actions?.tirs || 0;
                prev2.tirsSuccess += pa.actions?.tirsSuccess || 0;
                prev2.points += pa.actions?.points || 0;
                prev2.pointsSuccess += pa.actions?.pointsSuccess || 0;
                prev2.carreaux += pa.actions?.carreaux || 0;
              }
            }
            (playerStatsMap as any)[rawKey2] = prev2;
          }
        }

        // Compute rates (weighted)
        for (const [pid, ps] of playerStatsMap.entries()) {
          if (pid.startsWith('_raw_')) continue;
          const raw2 = (playerStatsMap as any)['_raw_' + pid];
          ps.winRate = (raw2 && raw2.totalWeight > 0) ? Math.round((raw2.weightedWins / raw2.totalWeight) * 1000) / 10 : (ps.matchesPlayed > 0 ? Math.round((ps.wins / ps.matchesPlayed) * 1000) / 10 : 0);
          if (raw2) {
            ps.tirRate = raw2.tirs > 0 ? Math.round((raw2.tirsSuccess / raw2.tirs) * 1000) / 10 : 0;
            ps.pointRate = raw2.points > 0 ? Math.round((raw2.pointsSuccess / raw2.points) * 1000) / 10 : 0;
            ps.carreauRate = raw2.tirsSuccess > 0 ? Math.round((raw2.carreaux / raw2.tirsSuccess) * 1000) / 10 : 0;
          }
        }
      }
    }

    // Filter: only include REAL authenticated users
    // A player qualifies ONLY if:
    // 1. player.id === player.user_id (self-player, not a tracking card)
    // 2. player.id exists in user_profiles table (confirmed auth account)
    // 3. Meets minimum match threshold with anti-cheat validated matches
    const filteredData = (playersData || []).filter((p: any) => {
      // Exclude locally created players (tracking cards) from leaderboard
      if (!p.user_id || p.id !== p.user_id) return false;
      // CRITICAL: Verify player.id is an actual authenticated user
      if (!authIdSet.has(p.id)) return false;
      if (playerStatsMap) {
        const ps = playerStatsMap.get(p.id);
        return ps && ps.matchesPlayed >= LEADERBOARD_MIN_MATCHES;
      }
      // Fallback: use stored stats (shouldn't reach here with anti-cheat)
      const stats = p.stats || {};
      return (stats.matchesPlayed || 0) >= LEADERBOARD_MIN_MATCHES;
    });

    // Fetch premium status for all player user_ids
    const userIds = filteredData.map((p: any) => p.user_id).filter(Boolean);
    let premiumIds: Set<string> = new Set();
    if (userIds.length > 0) {
      try {
        const { data: premiumData } = await supabase.rpc('get_premium_user_ids', { user_ids: userIds });
        if (Array.isArray(premiumData)) {
          premiumIds = new Set(premiumData);
        }
      } catch { /* silent - premium badges just won't show */ }
    }

    // Fetch ambassador user IDs
    let ambassadorIds: Set<string> = new Set();
    try {
      ambassadorIds = await getAmbassadorUserIds();
    } catch { /* silent */ }

    // Fetch trust scores from suspicious_players table
    const playerIds = filteredData.map((p: any) => p.id);
    let trustScoreMap = new Map<string, { score: number; flags: string[] }>();
    if (playerIds.length > 0) {
      try {
        const { data: trustData } = await supabase
          .from('suspicious_players')
          .select('player_id, trust_score, flags')
          .in('player_id', playerIds);
        if (Array.isArray(trustData)) {
          for (const td of trustData) {
            trustScoreMap.set(td.player_id, { score: td.trust_score, flags: td.flags || [] });
          }
        }
      } catch { /* silent */ }
    }

    // Get current user ID for shadow ban exemption
    let currentUserId: string | null = null;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      currentUserId = authUser?.id || null;
    } catch { /* silent */ }

    const players: LeaderboardPlayer[] = filteredData
      .filter((p: any) => {
        // SHADOW BAN: Hide players with trust score < 25 from other users
        // Also exclude banned players (score 0) from everyone
        const tsData = trustScoreMap.get(p.id);
        const ts = tsData?.score;
        if (ts !== undefined && ts < 25 && p.user_id !== currentUserId) {
          return false; // Hidden from others
        }
        return true;
      })
      .map((p: any) => {
        const periodStats = playerStatsMap?.get(p.id);
        const stats = periodStats || p.stats || {};
        return {
          id: p.id,
          userId: p.user_id,
          name: p.name,
          nickname: p.nickname || undefined,
          avatar: p.avatar || undefined,
          club: p.club || undefined,
          role: p.role || 'Milieu',
          level: p.level || 'Intermédiaire',
          country: p.country || undefined,
          city: p.location?.city || undefined,
          boulesBrand: p.boules?.brand || undefined,
          boulesModel: p.boules?.model || undefined,
          terrainName: p.terrain_name || undefined,
          isPremium: premiumIds.has(p.user_id),
          isAmbassador: ambassadorIds.has(p.user_id),
          trustScore: trustScoreMap.get(p.id)?.score,
          trustLevel: (() => {
            const ts = trustScoreMap.get(p.id)?.score;
            if (ts === undefined) return undefined;
            if (ts >= 80) return 'verified' as const;
            if (ts >= 65) return 'high' as const;
            if (ts >= 45) return 'medium' as const;
            if (ts >= 25) return 'low' as const;
            return 'suspicious' as const;
          })(),
          eloRating: p.elo_rating || 1000,
          createdAt: p.created_at || undefined,
          stats: {
            matchesPlayed: stats.matchesPlayed || 0,
            wins: stats.wins || 0,
            losses: stats.losses || 0,
            winRate: stats.winRate || 0,
            tirRate: stats.tirRate || 0,
            pointRate: stats.pointRate || 0,
            carreauRate: stats.carreauRate || 0,
          },
        };
      });

    return { players, error: null };
  } catch (e: any) {
    return { players: [], error: e.message || 'Leaderboard error' };
  }
}

export function sortLeaderboard(players: LeaderboardPlayer[], sortBy: LeaderboardSort): LeaderboardPlayer[] {
  return [...players].sort((a, b) => {
    switch (sortBy) {
      case 'winRate':
        if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'matches':
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'tirRate':
        if (b.stats.tirRate !== a.stats.tirRate) return b.stats.tirRate - a.stats.tirRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'pointRate':
        if (b.stats.pointRate !== a.stats.pointRate) return b.stats.pointRate - a.stats.pointRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'carreauRate':
        if (b.stats.carreauRate !== a.stats.carreauRate) return b.stats.carreauRate - a.stats.carreauRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      case 'elo':
        if ((b.eloRating || 1000) !== (a.eloRating || 1000)) return (b.eloRating || 1000) - (a.eloRating || 1000);
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      default:
        return b.stats.winRate - a.stats.winRate;
    }
  });
}
