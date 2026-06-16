/**
 * Weekly Leaderboard Service
 *
 * Computes rankings from matches played in the current ISO week (Mon-Sun).
 * Stores weekly snapshots for historical position tracking.
 * Provides city/club sub-rankings.
 */
import { getSupabaseClient } from '@/template';
import { LeaderboardPlayer, sortLeaderboard, LeaderboardSort, LEADERBOARD_MIN_MATCHES } from './leaderboardService';
import { getMatchValidationWeight } from './trustScoreService';

// ============================================
// TYPES
// ============================================
export interface WeeklySnapshot {
  userId: string;
  weekStart: string; // ISO date (YYYY-MM-DD)
  rank: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  tirRate: number;
  carreauCount: number;
  city?: string;
  club?: string;
}

export interface WeeklyRankChange {
  currentRank: number;
  previousRank: number | null;
  direction: 'up' | 'down' | 'same' | 'new';
  diff: number;
}

export interface SubRanking {
  type: 'city' | 'club';
  name: string;
  players: Array<LeaderboardPlayer & { weeklyRank: number; rankChange: WeeklyRankChange }>;
}

// Min matches for weekly leaderboard (lower threshold since it is one week)
export const WEEKLY_MIN_MATCHES = 2;

// ============================================
// DATE HELPERS
// ============================================

/** Get Monday 00:00 of the current ISO week */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Get Monday of previous ISO week */
export function getPreviousWeekStart(): Date {
  const current = getCurrentWeekStart();
  current.setDate(current.getDate() - 7);
  return current;
}

/** Format Date to YYYY-MM-DD */
export function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get Sunday 23:59 of the week starting on given Monday */
export function getWeekEnd(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

// ============================================
// FETCH WEEKLY LEADERBOARD
// ============================================

/**
 * Compute weekly leaderboard from public matches in the current week.
 * Returns players sorted by winRate with weekly stats.
 */
export async function fetchWeeklyLeaderboard(): Promise<{
  players: Array<LeaderboardPlayer & { weeklyMatches: number; weeklyWins: number; weeklyWinRate: number; rankChange: WeeklyRankChange }>;
  error: string | null;
}> {
  const supabase = getSupabaseClient();
  const weekStart = getCurrentWeekStart();
  const weekEnd = getWeekEnd(weekStart);

  try {
    // 1. Fetch all public players
    const { data: playersData, error: pErr } = await supabase
      .from('players')
      .select('id, user_id, name, nickname, avatar, club, club_id, role, level, country, location, stats, boules, terrain_name, created_at, is_public, elo_rating')
      .eq('is_public', true);

    if (pErr) return { players: [], error: pErr.message };

    // 2. Fetch matches in the current week
    // ANTI-CHEAT: Include participant_user_ids to filter real-user matches
    const { data: weekMatches, error: mErr } = await supabase
      .from('matches')
      .select('id, team_a, team_b, winner, player_actions, date, participant_user_ids')
      .gte('date', weekStart.toISOString())
      .lte('date', weekEnd.toISOString());

    if (mErr) return { players: [], error: mErr.message };

    if (!weekMatches || weekMatches.length === 0) {
      return { players: [], error: null };
    }

    // 3. Compute weekly stats per player
    // ANTI-CHEAT: Only count matches with 2+ real app users
    const playerIds = new Set((playersData || []).map((p: any) => p.id));
    const weeklyStatsMap = new Map<string, { matchesPlayed: number; wins: number; losses: number; tirSuccess: number; tirTotal: number; carreaux: number; weightedWins: number; totalWeight: number }>();

    for (const m of weekMatches) {
      // ANTI-CHEAT: Skip matches without 2+ real app users
      const participantIds: string[] = (m as any).participant_user_ids || [];
      if (participantIds.length < 2) continue;

      const matchWeight = getMatchValidationWeight(participantIds.length);
      const teamAPlayers: string[] = m.team_a?.players || [];
      const teamBPlayers: string[] = m.team_b?.players || [];
      const allMatchPlayers = [...teamAPlayers, ...teamBPlayers].filter(id => playerIds.has(id));

      for (const pid of allMatchPlayers) {
        if (!weeklyStatsMap.has(pid)) {
          weeklyStatsMap.set(pid, { matchesPlayed: 0, wins: 0, losses: 0, tirSuccess: 0, tirTotal: 0, carreaux: 0, weightedWins: 0, totalWeight: 0 });
        }
        const ws = weeklyStatsMap.get(pid)!;
        ws.matchesPlayed++;
        ws.totalWeight += matchWeight;
        const inA = teamAPlayers.includes(pid);
        if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) {
          ws.wins++;
          ws.weightedWins += matchWeight;
        } else {
          ws.losses++;
        }
        if (m.player_actions) {
          const pa = (m.player_actions as any[]).find((a: any) => a.playerId === pid);
          if (pa) {
            ws.tirTotal += pa.actions?.tirs || 0;
            ws.tirSuccess += pa.actions?.tirsSuccess || 0;
            ws.carreaux += pa.actions?.carreaux || 0;
          }
        }
      }
    }

    // 4. Filter players with minimum weekly matches
    // Also exclude locally created players (tracking cards) — only real user profiles (id === user_id)
    const qualifiedPlayerIds = [...weeklyStatsMap.entries()]
      .filter(([_, ws]) => ws.matchesPlayed >= WEEKLY_MIN_MATCHES)
      .map(([pid]) => pid);

    const qualifiedPlayersData = (playersData || []).filter((p: any) => 
      qualifiedPlayerIds.includes(p.id) && p.user_id && p.id === p.user_id
    );

    // 4b. Fetch trust scores for shadow banning
    const qualifiedIds = qualifiedPlayersData.map((p: any) => p.id);
    let trustScoreMap = new Map<string, number>();
    if (qualifiedIds.length > 0) {
      try {
        const { data: trustData } = await supabase
          .from('suspicious_players')
          .select('player_id, trust_score')
          .in('player_id', qualifiedIds);
        if (Array.isArray(trustData)) {
          for (const td of trustData) {
            trustScoreMap.set(td.player_id, td.trust_score);
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

    // SHADOW BAN: Filter out players with trust score < 25 (except self)
    const visiblePlayersData = qualifiedPlayersData.filter((p: any) => {
      const ts = trustScoreMap.get(p.id);
      // Also exclude banned players entirely (even from self view in leaderboard)
      if (ts !== undefined && ts < 25 && p.user_id !== currentUserId) {
        return false;
      }
      return true;
    });

    // 5. Build player entries (include ELO)
    const players: Array<LeaderboardPlayer & { weeklyMatches: number; weeklyWins: number; weeklyWinRate: number; rankChange: WeeklyRankChange; trustScore?: number; eloRating?: number }> = visiblePlayersData.map((p: any) => {
      const ws = weeklyStatsMap.get(p.id)!;
      // Use weighted win rate for fairer ranking
      const winRate = ws.totalWeight > 0 ? Math.round((ws.weightedWins / ws.totalWeight) * 1000) / 10 : 0;
      const tirRate = ws.tirTotal > 0 ? Math.round((ws.tirSuccess / ws.tirTotal) * 1000) / 10 : 0;

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
        terrainName: p.terrain_name || undefined,
        trustScore: trustScoreMap.get(p.id),
        stats: {
          matchesPlayed: ws.matchesPlayed,
          wins: ws.wins,
          losses: ws.losses,
          winRate,
          tirRate,
          pointRate: 0,
          carreauRate: ws.tirSuccess > 0 ? Math.round((ws.carreaux / ws.tirSuccess) * 1000) / 10 : 0,
        },
        eloRating: p.elo_rating || 1000,
        weeklyMatches: ws.matchesPlayed,
        weeklyWins: ws.wins,
        weeklyWinRate: winRate,
        rankChange: { currentRank: 0, previousRank: null, direction: 'new' as const, diff: 0 },
      };
    });

    // 6. Sort by winRate (primary), then matchesPlayed
    players.sort((a, b) => {
      if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
      return b.stats.matchesPlayed - a.stats.matchesPlayed;
    });

    // 7. Assign ranks
    players.forEach((p, i) => { p.rankChange.currentRank = i + 1; });

    // 8. Fetch previous week snapshot for rank changes
    const prevWeekStart = formatDateISO(getPreviousWeekStart());
    const { data: prevSnapshots } = await supabase
      .from('weekly_leaderboard_snapshots')
      .select('user_id, rank')
      .eq('week_start', prevWeekStart);

    const prevRankMap = new Map<string, number>();
    (prevSnapshots || []).forEach((s: any) => prevRankMap.set(s.user_id, s.rank));

    // 9. Compute rank changes
    players.forEach(p => {
      const prevRank = prevRankMap.get(p.userId);
      if (prevRank !== undefined) {
        p.rankChange.previousRank = prevRank;
        if (p.rankChange.currentRank < prevRank) {
          p.rankChange.direction = 'up';
          p.rankChange.diff = prevRank - p.rankChange.currentRank;
        } else if (p.rankChange.currentRank > prevRank) {
          p.rankChange.direction = 'down';
          p.rankChange.diff = p.rankChange.currentRank - prevRank;
        } else {
          p.rankChange.direction = 'same';
          p.rankChange.diff = 0;
        }
      } else {
        p.rankChange.direction = 'new';
        p.rankChange.diff = 0;
      }
    });

    return { players, error: null };
  } catch (e: any) {
    return { players: [], error: e.message || 'Weekly leaderboard error' };
  }
}

// ============================================
// SUB-RANKINGS (city / club)
// ============================================

export function getSubRankings(
  players: Array<LeaderboardPlayer & { rankChange?: WeeklyRankChange }>,
  type: 'city' | 'club'
): SubRanking[] {
  const groups = new Map<string, Array<LeaderboardPlayer & { weeklyRank: number; rankChange: WeeklyRankChange }>>();

  players.forEach((p, idx) => {
    const key = type === 'city' ? p.city : p.club;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      ...p,
      weeklyRank: idx + 1,
      rankChange: (p as any).rankChange || { currentRank: idx + 1, previousRank: null, direction: 'new', diff: 0 },
    });
  });

  // Sort groups by average winRate descending
  const rankings: SubRanking[] = [];
  for (const [name, groupPlayers] of groups.entries()) {
    if (groupPlayers.length < 1) continue;
    // Re-rank within group
    groupPlayers.sort((a, b) => {
      if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
      return b.stats.matchesPlayed - a.stats.matchesPlayed;
    });
    rankings.push({ type, name, players: groupPlayers });
  }

  // Sort groups by average winRate
  rankings.sort((a, b) => {
    const avgA = a.players.reduce((s, p) => s + p.stats.winRate, 0) / a.players.length;
    const avgB = b.players.reduce((s, p) => s + p.stats.winRate, 0) / b.players.length;
    return avgB - avgA;
  });

  return rankings;
}

// ============================================
// SNAPSHOT MANAGEMENT
// ============================================

/**
 * Save current week snapshot to DB (call on Monday or when user views leaderboard).
 * Only saves if snapshot for previous week does not exist yet.
 */
export async function saveWeeklySnapshot(
  players: Array<{ userId: string; rank: number; matchesPlayed: number; wins: number; winRate: number; tirRate: number; carreauCount: number; city?: string; club?: string }>
): Promise<void> {
  const supabase = getSupabaseClient();
  const prevWeek = formatDateISO(getPreviousWeekStart());

  // Check if snapshot already exists for previous week
  const { data: existing } = await supabase
    .from('weekly_leaderboard_snapshots')
    .select('id')
    .eq('week_start', prevWeek)
    .limit(1);

  if (existing && existing.length > 0) return; // Already saved

  // We save the current state as the "previous week" snapshot
  // This gets called at the start of a new week
  if (players.length === 0) return;

  const rows = players.map(p => ({
    user_id: p.userId,
    week_start: prevWeek,
    rank: p.rank,
    matches_played: p.matchesPlayed,
    wins: p.wins,
    win_rate: p.winRate,
    tir_rate: p.tirRate,
    carreau_count: p.carreauCount,
    city: p.city || null,
    club: p.club || null,
  }));

  try {
    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await supabase.from('weekly_leaderboard_snapshots').upsert(batch, { onConflict: 'user_id,week_start' });
    }
  } catch (e) {
    console.log('Error saving weekly snapshot:', e);
  }
}

/**
 * Get last week summary for a specific user (for Monday notification).
 */
export async function getLastWeekSummary(userId: string): Promise<{
  rank: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  previousRank: number | null;
  rankChange: 'up' | 'down' | 'same' | 'new';
  rankDiff: number;
} | null> {
  const supabase = getSupabaseClient();
  const prevWeek = formatDateISO(getPreviousWeekStart());
  const twoWeeksAgo = new Date(getPreviousWeekStart());
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);
  const twoWeeksAgoStr = formatDateISO(twoWeeksAgo);

  const [lastWeekRes, prevWeekRes] = await Promise.all([
    supabase.from('weekly_leaderboard_snapshots').select('*').eq('user_id', userId).eq('week_start', prevWeek).single(),
    supabase.from('weekly_leaderboard_snapshots').select('rank').eq('user_id', userId).eq('week_start', twoWeeksAgoStr).single(),
  ]);

  if (!lastWeekRes.data) return null;

  const lw = lastWeekRes.data;
  const prevRank = prevWeekRes.data?.rank || null;
  let rankChange: 'up' | 'down' | 'same' | 'new' = 'new';
  let rankDiff = 0;

  if (prevRank !== null) {
    if (lw.rank < prevRank) { rankChange = 'up'; rankDiff = prevRank - lw.rank; }
    else if (lw.rank > prevRank) { rankChange = 'down'; rankDiff = lw.rank - prevRank; }
    else { rankChange = 'same'; rankDiff = 0; }
  }

  return {
    rank: lw.rank,
    matchesPlayed: lw.matches_played,
    wins: lw.wins,
    winRate: Number(lw.win_rate),
    previousRank: prevRank,
    rankChange,
    rankDiff,
  };
}

/**
 * Schedule Monday morning snapshot + notification trigger.
 * Should be called on app open; checks if it is Monday and snapshot hasn't been saved yet.
 */
export async function checkAndTriggerWeeklyReset(): Promise<boolean> {
  const now = new Date();
  if (now.getDay() !== 1) return false; // Not Monday

  // Check if we have already processed this Monday
  const supabase = getSupabaseClient();
  const prevWeek = formatDateISO(getPreviousWeekStart());
  const { data: existing } = await supabase
    .from('weekly_leaderboard_snapshots')
    .select('id')
    .eq('week_start', prevWeek)
    .limit(1);

  return !existing || existing.length === 0; // true = needs processing
}

/**
 * Fetch weekly rank history for a player (last N weeks).
 * Returns an array of { weekStart, rank, eloRating, matchesPlayed, winRate } sorted chronologically.
 */
export async function fetchWeeklyRankHistory(
  userId: string,
  limit: number = 12
): Promise<{ history: Array<{ weekStart: string; rank: number; eloRating: number; matchesPlayed: number; winRate: number }>; error: string | null }> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('weekly_leaderboard_snapshots')
      .select('week_start, rank, matches_played, wins, win_rate, elo_rating')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(limit);

    if (error) return { history: [], error: error.message };

    const history = (data || []).reverse().map((row: any) => ({
      weekStart: row.week_start,
      rank: row.rank,
      eloRating: row.elo_rating || 1000,
      matchesPlayed: row.matches_played || 0,
      winRate: Number(row.win_rate) || 0,
    }));

    return { history, error: null };
  } catch (e: any) {
    return { history: [], error: e.message || 'Failed to fetch rank history' };
  }
}
