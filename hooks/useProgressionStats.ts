/**
 * Progression & modal-related stats hooks.
 * Extracted from app/(tabs)/stats.tsx.
 */
import { useMemo } from 'react';
import type { Match, Challenge } from '@/types/petanque';
import type { BoulesSet, Terrain, Tournament } from '@/types/petanque';

// ============================================================
// useBoulesSetStats
// ============================================================
export function useBoulesSetStats(
  filteredMatches: Match[],
  filteredChallenges: Challenge[],
  boulesSets: BoulesSet[],
) {
  return useMemo(() => {
    const bySet: Record<string, {
      name: string; brand?: string; diameter?: number; weight?: number;
      matches: number; wins: number;
      tirs: number; tirsSuccess: number; carreaux: number;
      points: number; pointsSuccess: number;
      challenges: number;
      devantBoule: number; pointQualitiesSuccess: number;
    }> = {};

    filteredMatches.forEach(match => {
      if (!match.boulesSetId) return;
      const bs = boulesSets.find(b => b.id === match.boulesSetId);
      if (!bs) return;
      if (!bySet[match.boulesSetId]) bySet[match.boulesSetId] = {
        name: bs.name, brand: bs.brand, diameter: bs.diameter, weight: bs.weight,
        matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0, challenges: 0,
        devantBoule: 0, pointQualitiesSuccess: 0,
      };
      const s = bySet[match.boulesSetId];
      s.matches++;
      if (match.winner === 'A') s.wins++;
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          s.tirs += pa.actions.tirs;
          s.tirsSuccess += pa.actions.tirsSuccess;
          s.carreaux += pa.actions.carreaux;
          s.points += pa.actions.points;
          s.pointsSuccess += pa.actions.pointsSuccess;
          if ((pa as any).detailedShots) {
            (pa as any).detailedShots.filter((shot: any) => shot.actionType === 'point' && shot.success && shot.pointQuality).forEach((shot: any) => {
              s.pointQualitiesSuccess++;
              if (shot.pointQuality === 'devant_boule') s.devantBoule++;
            });
          }
        });
      }
    });

    filteredChallenges.forEach(ch => {
      if (!ch.boulesSetId) return;
      const bs = boulesSets.find(b => b.id === ch.boulesSetId);
      if (!bs) return;
      if (!bySet[ch.boulesSetId]) bySet[ch.boulesSetId] = {
        name: bs.name, brand: bs.brand, diameter: bs.diameter, weight: bs.weight,
        matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0, challenges: 0,
        devantBoule: 0, pointQualitiesSuccess: 0,
      };
      bySet[ch.boulesSetId].challenges++;
    });

    const sets = Object.keys(bySet).sort((a, b) => (bySet[b].matches + bySet[b].challenges) - (bySet[a].matches + bySet[a].challenges));
    const totalWithBoules = sets.reduce((sum, id) => sum + bySet[id].matches, 0);
    return { bySet, sets, hasData: sets.length > 0, totalWithBoules };
  }, [filteredMatches, filteredChallenges, boulesSets]);
}

// ============================================================
// useTerrainTypeStats
// ============================================================
export function useTerrainTypeStats(
  filteredMatches: Match[],
  tournaments: Tournament[],
) {
  return useMemo(() => {
    const getTerrainType = (match: Match): string | null => {
      if ((match as any).terrainType) return (match as any).terrainType;
      if (match.tournamentId) {
        const tour = tournaments.find(t => t.id === match.tournamentId);
        if (tour?.terrainType) return tour.terrainType;
      }
      return null;
    };

    const byTerrain: Record<string, {
      matches: number; wins: number;
      tirs: number; tirsSuccess: number; carreaux: number;
      points: number; pointsSuccess: number;
    }> = {};

    filteredMatches.forEach(match => {
      const tt = getTerrainType(match);
      if (!tt) return;
      if (!byTerrain[tt]) byTerrain[tt] = { matches: 0, wins: 0, tirs: 0, tirsSuccess: 0, carreaux: 0, points: 0, pointsSuccess: 0 };
      const s = byTerrain[tt];
      s.matches++;
      if (match.winner === 'A') s.wins++;
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          s.tirs += pa.actions.tirs;
          s.tirsSuccess += pa.actions.tirsSuccess;
          s.carreaux += pa.actions.carreaux;
          s.points += pa.actions.points;
          s.pointsSuccess += pa.actions.pointsSuccess;
        });
      }
    });

    const types = Object.keys(byTerrain).sort((a, b) => byTerrain[b].matches - byTerrain[a].matches);
    const totalTerrainMatches = types.reduce((sum, t) => sum + byTerrain[t].matches, 0);
    return { byTerrain, types, hasData: types.length > 0, totalTerrainMatches };
  }, [filteredMatches, tournaments]);
}

// ============================================================
// usePrecisionWorkshopStats
// ============================================================
export function usePrecisionWorkshopStats(filteredChallenges: Challenge[]) {
  return useMemo(() => {
    const precisionChallenges = filteredChallenges.filter(c => c.type === 'precision' && c.precisionShots && c.precisionShots.length > 0);
    if (precisionChallenges.length === 0) return null;

    const ATELIERS = ['boule_seule', 'derriere_but', 'entre_2_boules', 'sautee', 'tir_but'] as const;
    const atelierData: Record<string, {
      totalShots: number; totalPoints: number; maxSingleShot: number;
      sessions: number; bestSessionScore: number;
      sessionScores: { date: string; score: number }[];
      successCount: number; maxSessionPoints: number;
    }> = {};

    ATELIERS.forEach(a => {
      atelierData[a] = { totalShots: 0, totalPoints: 0, maxSingleShot: 0, sessions: 0, bestSessionScore: 0, sessionScores: [], successCount: 0, maxSessionPoints: 0 };
    });

    const sortedChallenges = [...precisionChallenges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedChallenges.forEach(c => {
      const sessionAtelierScores: Record<string, { score: number; shots: number }> = {};
      c.precisionShots!.forEach(ps => {
        const data = atelierData[ps.atelier];
        if (data) {
          data.totalShots++;
          data.totalPoints += ps.points;
          data.maxSingleShot = Math.max(data.maxSingleShot, ps.points);
          if (ps.points >= 3) data.successCount++;
          if (!sessionAtelierScores[ps.atelier]) sessionAtelierScores[ps.atelier] = { score: 0, shots: 0 };
          sessionAtelierScores[ps.atelier].score += ps.points;
          sessionAtelierScores[ps.atelier].shots++;
        }
      });

      Object.entries(sessionAtelierScores).forEach(([atelier, info]) => {
        if (atelierData[atelier]) {
          atelierData[atelier].sessions++;
          atelierData[atelier].sessionScores.push({ date: c.date, score: info.score });
          atelierData[atelier].bestSessionScore = Math.max(atelierData[atelier].bestSessionScore, info.score);
          atelierData[atelier].maxSessionPoints = Math.max(atelierData[atelier].maxSessionPoints, info.shots * 5);
        }
      });
    });

    const activeAteliers = ATELIERS.filter(a => atelierData[a].totalShots > 0);

    return {
      atelierData,
      totalSessions: precisionChallenges.length,
      activeAteliers,
      hasData: activeAteliers.length > 0,
    };
  }, [filteredChallenges]);
}

// ============================================================
// Progression Filter Types
// ============================================================
export type ProgressionFilter = '4weeks' | '8weeks' | '3months' | '6months' | 'year' | '2years' | '5years' | '10years' | '25years';

export const PROGRESSION_FILTER_CONFIGS: { id: ProgressionFilter; weeks: number }[] = [
  { id: '4weeks', weeks: 4 },
  { id: '8weeks', weeks: 8 },
  { id: '3months', weeks: 13 },
  { id: '6months', weeks: 26 },
  { id: 'year', weeks: 52 },
  { id: '2years', weeks: 104 },
  { id: '5years', weeks: 260 },
  { id: '10years', weeks: 520 },
  { id: '25years', weeks: 1300 },
];

// ============================================================
// useProgressionData
// ============================================================
export function useProgressionData(matches: Match[], progressionFilter: ProgressionFilter) {
  return useMemo(() => {
    const selectedFilter = PROGRESSION_FILTER_CONFIGS.find(f => f.id === progressionFilter) || PROGRESSION_FILTER_CONFIGS[1];
    const weeksToShow = selectedFilter.weeks;

    const sortedMatches = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const useMonthly = weeksToShow > 52;

    const weeklyData: {
      week: string; weekDate: Date; matches: number; wins: number; winRate: number;
      tirSuccess: number; tirTotal: number; tirRate: number;
      pointSuccess: number; pointTotal: number; pointRate: number;
      carreaux: number; errors: number; errorRate: number;
    }[] = [];

    if (sortedMatches.length === 0) return { weeklyData, weeksToShow, useMonthly };

    const now = new Date();

    if (useMonthly) {
      const totalMonths = Math.ceil(weeksToShow / 4.33);
      const startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - totalMonths);
      startDate.setDate(1);

      const currentDate = new Date(startDate);

      while (currentDate <= now) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

        const monthMatches = sortedMatches.filter(m => {
          const matchDate = new Date(m.date);
          return matchDate >= monthStart && matchDate <= monthEnd;
        });

        let tirSuccess = 0, tirTotal = 0, pointSuccess = 0, pointTotal = 0, carreaux = 0;
        monthMatches.forEach(match => {
          if (match.playerActions) {
            match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
              tirTotal += pa.actions.tirs;
              tirSuccess += pa.actions.tirsSuccess;
              pointTotal += pa.actions.points;
              pointSuccess += pa.actions.pointsSuccess;
              carreaux += pa.actions.carreaux;
            });
          }
        });

        const wins = monthMatches.filter(m => m.winner === 'A').length;
        const totalAttempts = tirTotal + pointTotal;
        const totalSuccess = tirSuccess + pointSuccess;
        const errors = totalAttempts - totalSuccess;

        const monthLabel = `${monthStart.getMonth() + 1}/${String(monthStart.getFullYear()).slice(-2)}`;

        weeklyData.push({
          week: monthLabel,
          weekDate: new Date(monthStart),
          matches: monthMatches.length,
          wins,
          winRate: monthMatches.length > 0 ? Math.round((wins / monthMatches.length) * 100) : 0,
          tirSuccess, tirTotal,
          tirRate: tirTotal > 0 ? Math.round((tirSuccess / tirTotal) * 100) : 0,
          pointSuccess, pointTotal,
          pointRate: pointTotal > 0 ? Math.round((pointSuccess / pointTotal) * 100) : 0,
          carreaux, errors,
          errorRate: totalAttempts > 0 ? Math.round((errors / totalAttempts) * 100) : 0,
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    } else {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - (weeksToShow * 7));
      startDate.setDate(startDate.getDate() - startDate.getDay());

      const currentDate = new Date(startDate);

      while (currentDate <= now) {
        const weekStart = new Date(currentDate);
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const weekMatches = sortedMatches.filter(m => {
          const matchDate = new Date(m.date);
          return matchDate >= weekStart && matchDate <= weekEnd;
        });

        let tirSuccess = 0, tirTotal = 0, pointSuccess = 0, pointTotal = 0, carreaux = 0;
        weekMatches.forEach(match => {
          if (match.playerActions) {
            match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
              tirTotal += pa.actions.tirs;
              tirSuccess += pa.actions.tirsSuccess;
              pointTotal += pa.actions.points;
              pointSuccess += pa.actions.pointsSuccess;
              carreaux += pa.actions.carreaux;
            });
          }
        });

        const wins = weekMatches.filter(m => m.winner === 'A').length;
        const totalAttempts = tirTotal + pointTotal;
        const totalSuccess = tirSuccess + pointSuccess;
        const errors = totalAttempts - totalSuccess;

        weeklyData.push({
          week: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
          weekDate: new Date(weekStart),
          matches: weekMatches.length,
          wins,
          winRate: weekMatches.length > 0 ? Math.round((wins / weekMatches.length) * 100) : 0,
          tirSuccess, tirTotal,
          tirRate: tirTotal > 0 ? Math.round((tirSuccess / tirTotal) * 100) : 0,
          pointSuccess, pointTotal,
          pointRate: pointTotal > 0 ? Math.round((pointSuccess / pointTotal) * 100) : 0,
          carreaux, errors,
          errorRate: totalAttempts > 0 ? Math.round((errors / totalAttempts) * 100) : 0,
        });

        currentDate.setDate(currentDate.getDate() + 7);
      }
    }

    return { weeklyData, weeksToShow, useMonthly };
  }, [matches, progressionFilter]);
}

// ============================================================
// useTrends
// ============================================================
export function useTrends(progressionData: ReturnType<typeof useProgressionData>) {
  return useMemo(() => {
    const data = progressionData.weeklyData;
    if (data.length < 2) return { winRate: 'neutral' as const, tirRate: 'neutral' as const, pointRate: 'neutral' as const, errorRate: 'neutral' as const };

    const recentWeeks = data.slice(-4);
    const olderWeeks = data.slice(-8, -4);

    const getAvg = (weeks: typeof data, field: 'winRate' | 'tirRate' | 'pointRate' | 'errorRate') => {
      const validWeeks = weeks.filter(w => w.matches > 0);
      if (validWeeks.length === 0) return 0;
      return validWeeks.reduce((sum, w) => sum + w[field], 0) / validWeeks.length;
    };

    const getTrend = (recent: number, older: number, isError = false) => {
      const diff = recent - older;
      if (Math.abs(diff) < 5) return 'neutral' as const;
      if (isError) return diff > 0 ? 'down' as const : 'up' as const;
      return diff > 0 ? 'up' as const : 'down' as const;
    };

    return {
      winRate: getTrend(getAvg(recentWeeks, 'winRate'), getAvg(olderWeeks, 'winRate')),
      tirRate: getTrend(getAvg(recentWeeks, 'tirRate'), getAvg(olderWeeks, 'tirRate')),
      pointRate: getTrend(getAvg(recentWeeks, 'pointRate'), getAvg(olderWeeks, 'pointRate')),
      errorRate: getTrend(getAvg(recentWeeks, 'errorRate'), getAvg(olderWeeks, 'errorRate'), true),
    };
  }, [progressionData]);
}

// ============================================================
// useChallengeProgressionData
// ============================================================
export function useChallengeProgressionData(
  challenges: Challenge[],
  progressionFilter: ProgressionFilter,
) {
  return useMemo(() => {
    const sel = PROGRESSION_FILTER_CONFIGS.find(f => f.id === progressionFilter) || PROGRESSION_FILTER_CONFIGS[1];
    const weeksToShow = sel.weeks;
    const sorted = [...challenges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sorted.length === 0) return { weeklyData: [] as any[], hasData: false };
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (weeksToShow * 7));
    start.setDate(start.getDate() - start.getDay());
    const TYPES = ['10_tirs', '10_tirs_sautee', 'precision'] as const;
    const cur = new Date(start);
    const weeklyData: { week: string; byType: Record<string, { count: number; avgRate: number }> }[] = [];
    while (cur <= now) {
      const ws = new Date(cur);
      const we = new Date(cur);
      we.setDate(we.getDate() + 6);
      const wc = sorted.filter(c => { const d = new Date(c.date); return d >= ws && d <= we; });
      const byType: Record<string, { count: number; avgRate: number }> = {};
      TYPES.forEach(type => {
        const tc = wc.filter(c => c.type === type);
        let tr = 0;
        tc.forEach(c => {
          if (type === 'precision') {
            tr += (c.maxPoints && c.maxPoints > 0) ? ((c.totalPoints || 0) / c.maxPoints) * 100 : 0;
          } else {
            tr += c.successRate || 0;
          }
        });
        byType[type] = { count: tc.length, avgRate: tc.length > 0 ? Math.round(tr / tc.length) : 0 };
      });
      weeklyData.push({ week: `${ws.getDate()}/${ws.getMonth() + 1}`, byType });
      cur.setDate(cur.getDate() + 7);
    }
    return { weeklyData, hasData: weeklyData.some(w => Object.values(w.byType).some(t => t.count > 0)) };
  }, [challenges, progressionFilter]);
}

// ============================================================
// useTournamentProgressionData
// ============================================================
export function useTournamentProgressionData(
  tournaments: Tournament[],
  matches: Match[],
) {
  return useMemo(() => {
    const finishedTournaments = tournaments.filter(t => t.status === 'Terminé');
    if (finishedTournaments.length === 0) return { items: [] as any[], hasData: false };
    const RESULT_RANKS: Record<string, number> = { '1er': 100, '2ème': 85, '3ème': 70, 'Demi-finale': 55, 'Quart de finale': 40, '1/8 finale': 25, 'Poules': 10, 'Autre': 5 };
    const RESULT_COLORS: Record<string, string> = { '1er': '#FFD700', '2ème': '#A8B4C0', '3ème': '#CD7F32', 'Demi-finale': '#4A90D9', 'Quart de finale': '#F5A623', '1/8 finale': '#7B8794', 'Poules': '#7B8794', 'Autre': '#94A3B8' };
    const items = finishedTournaments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(tour => {
      const tourMatches = matches.filter(m => m.tournamentId === tour.id);
      const wins = tourMatches.filter(m => m.winner === 'A').length;
      const totalM = tourMatches.length;
      const ptsFor = tourMatches.reduce((s, m) => s + (m.teamA?.score || 0), 0);
      const ptsAgainst = tourMatches.reduce((s, m) => s + (m.teamB?.score || 0), 0);
      return {
        id: tour.id, name: tour.name, date: tour.date,
        result: tour.finalResult || 'Autre',
        resultRank: RESULT_RANKS[tour.finalResult || ''] || 5,
        resultColor: RESULT_COLORS[tour.finalResult || ''] || '#94A3B8',
        winRate: totalM > 0 ? Math.round((wins / totalM) * 100) : 0,
        matches: totalM, wins, pointDiff: ptsFor - ptsAgainst, format: tour.format,
      };
    });
    return { items, hasData: items.length > 0 };
  }, [tournaments, matches]);
}
