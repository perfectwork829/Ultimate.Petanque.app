// ============================================
// Boules Brand/Model Leaderboard Service
// Aggregates match stats by boules brand & model
// ============================================
import { getSupabaseClient } from '@/template';
import { LeaderboardPeriod, getPeriodDateRange, LEADERBOARD_MIN_MATCHES } from './leaderboardService';

export interface LeaderboardBoulesEntry {
  id: string;
  brand: string;
  model?: string;
  userCount: number;
  totalMatches: number;
  stats: {
    avgWinRate: number;
    avgTirRate: number;
    avgPointRate: number;
    avgCarreauRate: number;
  };
  // Breakdown by role
  byRole?: {
    role: string;
    userCount: number;
    avgWinRate: number;
    avgTirRate: number;
  }[];
}

export type BoulesLeaderboardSort = 'avgWinRate' | 'totalMatches' | 'userCount' | 'avgTirRate' | 'avgCarreauRate';

export type BoulesLeaderboardMode = 'brand' | 'model';

interface PlayerBoulesData {
  userId: string;
  brand: string;
  model: string;
  role: string;
  stats: {
    matchesPlayed: number;
    wins: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
}

export async function fetchBoulesLeaderboard(period?: LeaderboardPeriod): Promise<{ entries: PlayerBoulesData[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const usePeriod = period && period !== 'all';

  try {
    // Step 1: Get authenticated user IDs from user_profiles
    const { data: authUsers } = await supabase.from('user_profiles').select('id');
    const authIdSet = new Set((authUsers || []).map((u: any) => u.id));

    // Fetch public players with boules info
    const { data, error } = await supabase
      .from('players')
      .select('id, user_id, name, role, stats, boules')
      .eq('is_public', true);

    if (error) return { entries: [], error: error.message };

    // Step 2: Filter to only real authenticated self-players
    const realPlayers = (data || []).filter((p: any) => p.user_id && p.id === p.user_id && authIdSet.has(p.id));

    // Step 3: Count multi-player matches per player (anti-cheat)
    const realPlayerIds = realPlayers.map((p: any) => p.id);
    const multiPlayerCountMap = new Map<string, number>();
    if (realPlayerIds.length > 0) {
      const { data: allMatchesData } = await supabase
        .from('matches')
        .select('team_a, team_b, participant_user_ids');
      if (allMatchesData) {
        for (const m of allMatchesData) {
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

    // Step 4: Only keep players with minimum multi-player matches
    const qualifiedPlayers = realPlayers.filter((p: any) => {
      const count = multiPlayerCountMap.get(p.id) || 0;
      return count >= LEADERBOARD_MIN_MATCHES;
    });

    // If period filter, fetch matches within range and recompute per-player stats
    let periodStatsMap: Map<string, { matchesPlayed: number; wins: number; winRate: number; tirRate: number; pointRate: number; carreauRate: number }> | null = null;

    if (usePeriod) {
      const range = getPeriodDateRange(period);
      if (range.from) {
        let matchQuery = supabase
          .from('matches')
          .select('id, team_a, team_b, winner, player_actions')
          .gte('date', range.from.toISOString());
        if (range.to) {
          matchQuery = matchQuery.lte('date', range.to.toISOString());
        }
        const { data: matchesData } = await matchQuery;

        if (matchesData && matchesData.length > 0) {
          periodStatsMap = new Map();
          const playerIds = new Set(qualifiedPlayers.map((p: any) => p.id));

          for (const m of matchesData) {
            const teamAPlayers: string[] = m.team_a?.players || [];
            const teamBPlayers: string[] = m.team_b?.players || [];
            const allMatchPlayers = [...teamAPlayers, ...teamBPlayers].filter(id => playerIds.has(id));

            for (const pid of allMatchPlayers) {
              if (!periodStatsMap.has(pid)) {
                periodStatsMap.set(pid, { matchesPlayed: 0, wins: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0 });
              }
              const ps = periodStatsMap.get(pid)!;
              ps.matchesPlayed++;
              const inA = teamAPlayers.includes(pid);
              if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
                ps.wins++;
              }
              if (m.player_actions) {
                const pa = (m.player_actions as any[]).find((a: any) => a.playerId === pid);
                if (pa) {
                  const prev = (periodStatsMap as any)['_raw_' + pid] || { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 };
                  prev.tirs += pa.actions?.tirs || 0;
                  prev.tirsSuccess += pa.actions?.tirsSuccess || 0;
                  prev.points += pa.actions?.points || 0;
                  prev.pointsSuccess += pa.actions?.pointsSuccess || 0;
                  prev.carreaux += pa.actions?.carreaux || 0;
                  (periodStatsMap as any)['_raw_' + pid] = prev;
                }
              }
            }
          }

          for (const [pid, ps] of periodStatsMap.entries()) {
            if (pid.startsWith('_raw_')) continue;
            ps.winRate = ps.matchesPlayed > 0 ? Math.round((ps.wins / ps.matchesPlayed) * 1000) / 10 : 0;
            const raw = (periodStatsMap as any)['_raw_' + pid];
            if (raw) {
              ps.tirRate = raw.tirs > 0 ? Math.round((raw.tirsSuccess / raw.tirs) * 1000) / 10 : 0;
              ps.pointRate = raw.points > 0 ? Math.round((raw.pointsSuccess / raw.points) * 1000) / 10 : 0;
              ps.carreauRate = raw.tirsSuccess > 0 ? Math.round((raw.carreaux / raw.tirsSuccess) * 1000) / 10 : 0;
            }
          }
        }
      }
    }

    const entries: PlayerBoulesData[] = [];

    for (const p of qualifiedPlayers) {
      const boules = p.boules || {};
      const brand = boules.brand;
      if (!brand) continue;

      if (periodStatsMap) {
        const ps = periodStatsMap.get(p.id);
        if (!ps || ps.matchesPlayed < LEADERBOARD_MIN_MATCHES) continue;
        entries.push({
          userId: p.user_id,
          brand: brand,
          model: boules.model || boules.name || '',
          role: p.role || 'Milieu',
          stats: {
            matchesPlayed: ps.matchesPlayed,
            wins: ps.wins,
            winRate: ps.winRate,
            tirRate: ps.tirRate,
            pointRate: ps.pointRate,
            carreauRate: ps.carreauRate,
          },
        });
      } else {
        const stats = p.stats || {};
        entries.push({
          userId: p.user_id,
          brand: brand,
          model: boules.model || boules.name || '',
          role: p.role || 'Milieu',
          stats: {
            matchesPlayed: stats.matchesPlayed || 0,
            wins: stats.wins || 0,
            winRate: stats.winRate || 0,
            tirRate: stats.tirRate || 0,
            pointRate: stats.pointRate || 0,
            carreauRate: stats.carreauRate || 0,
          },
        });
      }
    }

    return { entries, error: null };
  } catch (e: any) {
    return { entries: [], error: e.message || 'Boules leaderboard error' };
  }
}

export function aggregateBoulesData(
  entries: PlayerBoulesData[],
  mode: BoulesLeaderboardMode,
  filterRole?: string
): LeaderboardBoulesEntry[] {
  // Apply role filter if set
  let filtered = entries;
  if (filterRole && filterRole !== 'all') {
    filtered = entries.filter(e => e.role === filterRole);
  }

  // Group by brand or brand+model
  const groupMap = new Map<string, PlayerBoulesData[]>();
  for (const entry of filtered) {
    const key = mode === 'brand' ? entry.brand : `${entry.brand}|||${entry.model}`;
    const existing = groupMap.get(key) || [];
    existing.push(entry);
    groupMap.set(key, existing);
  }

  const results: LeaderboardBoulesEntry[] = [];

  for (const [key, group] of groupMap) {
    const brand = mode === 'brand' ? key : key.split('|||')[0];
    const model = mode === 'model' ? key.split('|||')[1] : undefined;

    // Deduplicate by userId (a user might appear once per brand)
    const uniqueUsers = new Set(group.map(g => g.userId));
    const userCount = uniqueUsers.size;
    const totalMatches = group.reduce((sum, g) => sum + g.stats.matchesPlayed, 0);

    const avgWinRate = Math.round(group.reduce((sum, g) => sum + g.stats.winRate, 0) / group.length);
    const avgTirRate = Math.round(
      group.filter(g => g.stats.tirRate > 0).reduce((sum, g) => sum + g.stats.tirRate, 0) /
      Math.max(1, group.filter(g => g.stats.tirRate > 0).length)
    );
    const avgPointRate = Math.round(
      group.filter(g => g.stats.pointRate > 0).reduce((sum, g) => sum + g.stats.pointRate, 0) /
      Math.max(1, group.filter(g => g.stats.pointRate > 0).length)
    );
    const avgCarreauRate = Math.round(
      group.filter(g => g.stats.carreauRate > 0).reduce((sum, g) => sum + g.stats.carreauRate, 0) /
      Math.max(1, group.filter(g => g.stats.carreauRate > 0).length)
    );

    // Breakdown by role (only for brand mode to keep it readable)
    const byRole: LeaderboardBoulesEntry['byRole'] = [];
    if (mode === 'brand') {
      const roleMap = new Map<string, PlayerBoulesData[]>();
      for (const g of group) {
        const roleGroup = roleMap.get(g.role) || [];
        roleGroup.push(g);
        roleMap.set(g.role, roleGroup);
      }
      for (const [role, roleEntries] of roleMap) {
        byRole.push({
          role,
          userCount: new Set(roleEntries.map(r => r.userId)).size,
          avgWinRate: Math.round(roleEntries.reduce((s, r) => s + r.stats.winRate, 0) / roleEntries.length),
          avgTirRate: Math.round(
            roleEntries.filter(r => r.stats.tirRate > 0).reduce((s, r) => s + r.stats.tirRate, 0) /
            Math.max(1, roleEntries.filter(r => r.stats.tirRate > 0).length)
          ),
        });
      }
    }

    results.push({
      id: key,
      brand,
      model: model || undefined,
      userCount,
      totalMatches,
      stats: { avgWinRate, avgTirRate, avgPointRate, avgCarreauRate },
      byRole: byRole.length > 0 ? byRole : undefined,
    });
  }

  return results;
}

export function sortBoulesLeaderboard(entries: LeaderboardBoulesEntry[], sortBy: BoulesLeaderboardSort): LeaderboardBoulesEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'avgWinRate':
        if (b.stats.avgWinRate !== a.stats.avgWinRate) return b.stats.avgWinRate - a.stats.avgWinRate;
        return b.totalMatches - a.totalMatches;
      case 'totalMatches':
        return b.totalMatches - a.totalMatches;
      case 'userCount':
        if (b.userCount !== a.userCount) return b.userCount - a.userCount;
        return b.stats.avgWinRate - a.stats.avgWinRate;
      case 'avgTirRate':
        if (b.stats.avgTirRate !== a.stats.avgTirRate) return b.stats.avgTirRate - a.stats.avgTirRate;
        return b.totalMatches - a.totalMatches;
      case 'avgCarreauRate':
        if (b.stats.avgCarreauRate !== a.stats.avgCarreauRate) return b.stats.avgCarreauRate - a.stats.avgCarreauRate;
        return b.totalMatches - a.totalMatches;
      default:
        return b.stats.avgWinRate - a.stats.avgWinRate;
    }
  });
}
