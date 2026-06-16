/**
 * useAppComputed — Extracted computed values from AppContext.
 * 
 * Contains the memoized computations for:
 * - userStats (aggregated match statistics)
 * - challengeStats (aggregated challenge statistics)
 * - selfPlayer (current user's player record with live stats)
 * - playersWithStats (all players with recalculated stats from matches)
 * - clubsWithMemberCount (clubs with dynamic member counts)
 * 
 * These are pure computation functions that take data arrays and return
 * derived state. They can be used independently of AppContext.
 */
import { useMemo } from 'react';
import { Player, Match, Challenge, Club, ChallengeType, ChallengeStats } from '@/types/petanque';
import { calculatePlayerStatsFromMatches } from '@/services/dbMappers';

export function computeUserStats(
  matches: Match[],
  userId: string | undefined,
  username: string | undefined,
  sharedMatchIds: string[],
) {
  const sharedSet = new Set(sharedMatchIds);
  let totalMatches = 0;
  let wins = 0;
  let losses = 0;
  let totalTirs = 0;
  let totalTirsSuccess = 0;
  let totalPoints = 0;
  let totalPointsSuccess = 0;
  let totalCarreaux = 0;
  let totalDuration = 0;
  const tournamentIds = new Set<string>();

  matches.forEach(m => {
    const isShared = sharedSet.has(m.id);
    const userInA = userId ? m.teamA.players.includes(userId) : false;
    const userInB = userId ? m.teamB.players.includes(userId) : false;
    if (isShared && !userInA && !userInB) return;

    totalMatches++;
    totalDuration += m.duration || 0;
    const userTeam = isShared ? (userInA ? 'A' : 'B') : 'A';
    if (m.winner === userTeam) wins++;
    else losses++;
    if (m.mode === 'Tournoi' && m.tournamentId) tournamentIds.add(m.tournamentId);

    if (m.playerActions) {
      m.playerActions.filter(pa => pa.team === userTeam).forEach(pa => {
        totalTirs += pa.actions.tirs;
        totalTirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        totalPointsSuccess += pa.actions.pointsSuccess;
        totalCarreaux += pa.actions.carreaux;
      });
    }
  });

  return {
    playerId: userId || '1',
    playerName: username || 'Utilisateur',
    totalMatches,
    wins,
    losses,
    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100 * 10) / 10 : 0,
    currentStreak: 0,
    longestStreak: 0,
    tirSuccessRate: totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 100 * 10) / 10 : 0,
    pointSuccessRate: totalPoints > 0 ? Math.round((totalPointsSuccess / totalPoints) * 100 * 10) / 10 : 0,
    carreauRate: totalTirsSuccess > 0 ? Math.round((totalCarreaux / totalTirsSuccess) * 100 * 10) / 10 : 0,
    avgMatchDuration: totalMatches > 0 ? Math.round(totalDuration / totalMatches) : 0,
    tournamentsWon: 0,
    tournamentsPlayed: tournamentIds.size,
    weeklyProgress: [] as any[],
    recentOpponents: [] as any[],
  };
}

export function computeChallengeStats(challenges: Challenge[]): ChallengeStats {
  const byType = {
    '10_tirs': { count: 0, avgSuccess: 0, bestScore: 0, totalSuccess: 0 },
    '10_tirs_sautee': { count: 0, avgSuccess: 0, bestScore: 0, totalSuccess: 0 },
    'precision': { count: 0, avgSuccess: 0, bestScore: 0, totalSuccess: 0 },
  };

  let totalShots = 0;
  let totalSuccess = 0;

  challenges.forEach(c => {
    const type = byType[c.type];
    type.count++;
    if (c.type === 'precision') {
      const score = c.totalPoints || 0;
      type.totalSuccess += score;
      type.bestScore = Math.max(type.bestScore, score);
      totalShots += 20;
      totalSuccess += (c.precisionShots?.filter(s => s.points >= 3).length || 0);
    } else {
      type.totalSuccess += (c.successRate || 0);
      type.bestScore = Math.max(type.bestScore, c.successRate || 0);
      totalShots += (c.totalShots || 0);
      totalSuccess += (c.successCount || 0);
    }
  });

  Object.keys(byType).forEach(key => {
    const t = byType[key as ChallengeType];
    t.avgSuccess = t.count > 0 ? Math.round(t.totalSuccess / t.count) : 0;
  });

  return {
    totalChallenges: challenges.length,
    byType: {
      '10_tirs': { count: byType['10_tirs'].count, avgSuccess: byType['10_tirs'].avgSuccess, bestScore: byType['10_tirs'].bestScore },
      '10_tirs_sautee': { count: byType['10_tirs_sautee'].count, avgSuccess: byType['10_tirs_sautee'].avgSuccess, bestScore: byType['10_tirs_sautee'].bestScore },
      'precision': { count: byType['precision'].count, avgSuccess: byType['precision'].avgSuccess, bestScore: byType['precision'].bestScore },
    },
    recentChallenges: [...challenges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    totalShots,
    totalSuccess,
    overallSuccessRate: totalShots > 0 ? Math.round((totalSuccess / totalShots) * 100) : 0,
  };
}

// Cache: avoids recomputing if both arrays are the exact same reference
let _pwsCache: { playersRef: Player[]; matchesRef: Match[]; result: Player[] } | null = null;

export function computePlayersWithStats(players: Player[], matches: Match[]): Player[] {
  if (matches.length === 0) return players;
  // Use reference equality to detect changes — any setPlayers/setMatches call creates a new array
  if (_pwsCache && _pwsCache.playersRef === players && _pwsCache.matchesRef === matches) {
    return _pwsCache.result;
  }
  const result = players.map(player => {
    const newStats = calculatePlayerStatsFromMatches(matches, player.id, player.stats);
    if (newStats === player.stats) return player;
    return { ...player, stats: newStats };
  });
  _pwsCache = { playersRef: players, matchesRef: matches, result };
  return result;
}

export function computeSelfPlayer(playersWithStats: Player[], userId: string | undefined): Player | null {
  if (!userId) return null;
  return (
    playersWithStats.find(p => p.id === userId)
    ?? playersWithStats.find(p => p.userId === userId)
    ?? null
  );
}

let _cwmCache: { clubsRef: Club[]; playersRef: Player[]; result: Club[] } | null = null;

export function computeClubsWithMemberCount(clubs: Club[], players: Player[]): Club[] {
  if (_cwmCache && _cwmCache.clubsRef === clubs && _cwmCache.playersRef === players) {
    return _cwmCache.result;
  }
  // Build a map to avoid O(clubs × players) filter calls
  const clubCounts = new Map<string, number>();
  players.forEach(p => {
    if (p.clubId) clubCounts.set(p.clubId, (clubCounts.get(p.clubId) || 0) + 1);
  });
  const result = clubs.map(club => {
    const memberCount = clubCounts.get(club.id) || 0;
    return { ...club, membersCount: Math.max(memberCount, club.membersCount || 0) };
  });
  _cwmCache = { clubsRef: clubs, playersRef: players, result };
  return result;
}
