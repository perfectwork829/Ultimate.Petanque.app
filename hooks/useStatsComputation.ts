/**
 * Shared stats computation hooks.
 * Extracts heavy useMemo calculations from stats.tsx.
 */
import { useMemo } from 'react';
import type { Match, Challenge } from '@/types/petanque';

// Re-export from the shared filtering hook for backward compatibility
export { filterByTime } from '@/hooks/useFilteredStats';
export type { TimeFilter } from '@/hooks/useFilteredStats';

export function usePerformanceStats(filteredMatches: Match[]) {
  return useMemo(() => {
    const total = filteredMatches.length;
    const trainingMatches = filteredMatches.filter(m => m.mode === 'Entraînement');
    const tournamentMatches = filteredMatches.filter(m => m.mode === 'Tournoi');
    const wins = filteredMatches.filter(m => m.winner === 'A').length;
    const losses = total - wins;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const byFormat: Record<string, { total: number; wins: number }> = {
      'Tête-à-tête': { total: 0, wins: 0 },
      'Doublette': { total: 0, wins: 0 },
      'Triplette': { total: 0, wins: 0 },
    };
    filteredMatches.forEach(m => {
      if (byFormat[m.format]) {
        byFormat[m.format].total++;
        if (m.winner === 'A') byFormat[m.format].wins++;
      }
    });

    let totalPointsFor = 0, totalPointsAgainst = 0;
    let totalMenes = 0, menesWon = 0;
    let totalMenePointsFor = 0, totalMenePointsAgainst = 0;

    filteredMatches.forEach(match => {
      totalPointsFor += match.teamA?.score || 0;
      totalPointsAgainst += match.teamB?.score || 0;
      if (match.menes && match.menes.length > 0) {
        match.menes.forEach(mene => {
          totalMenes++;
          const meneA = mene.teamAPoints || mene.scoreA || 0;
          const meneB = mene.teamBPoints || mene.scoreB || 0;
          totalMenePointsFor += meneA;
          totalMenePointsAgainst += meneB;
          if (meneA > meneB) menesWon++;
        });
      }
    });

    const avgScoreFor = total > 0 ? (totalPointsFor / total).toFixed(1) : '0';
    const avgScoreAgainst = total > 0 ? (totalPointsAgainst / total).toFixed(1) : '0';
    const pointDiff = totalPointsFor - totalPointsAgainst;
    const avgPointDiff = total > 0 ? (pointDiff / total).toFixed(1) : '0';
    const meneWinRate = totalMenes > 0 ? Math.round((menesWon / totalMenes) * 100) : 0;
    const avgMenePointsFor = totalMenes > 0 ? (totalMenePointsFor / totalMenes).toFixed(1) : '0';
    const avgMenePointsAgainst = totalMenes > 0 ? (totalMenePointsAgainst / totalMenes).toFixed(1) : '0';

    let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
    let tempWinStreak = 0, tempLossStreak = 0;
    const sortedMatches = [...filteredMatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sortedMatches.forEach((m, i) => {
      if (m.winner === 'A') {
        tempWinStreak++; tempLossStreak = 0;
        if (i === 0) currentStreak = tempWinStreak;
        maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
      } else {
        tempLossStreak++; tempWinStreak = 0;
        if (i === 0) currentStreak = -tempLossStreak;
        maxLossStreak = Math.max(maxLossStreak, tempLossStreak);
      }
    });

    const seriesMap: Record<string, { wins: number; seriesWinner?: 'A' | 'B' }> = {};
    filteredMatches.forEach(m => {
      if (m.seriesInfo?.seriesId) {
        if (!seriesMap[m.seriesInfo.seriesId]) seriesMap[m.seriesInfo.seriesId] = { wins: 0 };
        if (m.winner === 'A') seriesMap[m.seriesInfo.seriesId].wins++;
        if (m.seriesInfo.seriesComplete && m.seriesInfo.seriesWinner) {
          seriesMap[m.seriesInfo.seriesId].seriesWinner = m.seriesInfo.seriesWinner;
        }
      }
    });
    const seriesComplete = Object.values(seriesMap).filter(s => s.seriesWinner);
    const seriesWon = seriesComplete.filter(s => s.seriesWinner === 'A').length;

    const fannyWins = filteredMatches.filter(m => m.winner === 'A' && m.teamA.score === 13 && m.teamB.score === 0).length;
    const fannyLosses = filteredMatches.filter(m => m.winner === 'B' && m.teamB.score === 13 && m.teamA.score === 0).length;

    const matchesWithDuration = filteredMatches.filter(m => m.duration && m.duration > 0);
    const totalDuration = matchesWithDuration.reduce((sum, m) => sum + (m.duration || 0), 0);
    const avgDuration = matchesWithDuration.length > 0 ? Math.round(totalDuration / matchesWithDuration.length) : 0;
    const minDuration = matchesWithDuration.length > 0 ? Math.min(...matchesWithDuration.map(m => m.duration || 0)) : 0;
    const maxDuration = matchesWithDuration.length > 0 ? Math.max(...matchesWithDuration.map(m => m.duration || 0)) : 0;

    const durationByFormat: Record<string, { total: number; count: number }> = {};
    matchesWithDuration.forEach(m => {
      if (!durationByFormat[m.format]) durationByFormat[m.format] = { total: 0, count: 0 };
      durationByFormat[m.format].total += m.duration || 0;
      durationByFormat[m.format].count++;
    });

    let totalMeneDuration = 0, menesWithDuration = 0;
    filteredMatches.forEach(match => {
      if (match.menes) {
        match.menes.forEach(mene => {
          if (mene.duration && mene.duration > 0) {
            totalMeneDuration += mene.duration;
            menesWithDuration++;
          }
        });
      }
    });
    const avgMeneDuration = menesWithDuration > 0 ? Math.round(totalMeneDuration / menesWithDuration) : 0;

    return {
      total, trainingCount: trainingMatches.length, tournamentCount: tournamentMatches.length,
      wins, losses, winRate,
      trainingWinRate: trainingMatches.length > 0 ? Math.round((trainingMatches.filter(m => m.winner === 'A').length / trainingMatches.length) * 100) : 0,
      tournamentWinRate: tournamentMatches.length > 0 ? Math.round((tournamentMatches.filter(m => m.winner === 'A').length / tournamentMatches.length) * 100) : 0,
      byFormat, avgScoreFor, avgScoreAgainst, pointDiff, avgPointDiff,
      totalMenes, menesWon, meneWinRate, avgMenePointsFor, avgMenePointsAgainst,
      currentStreak, maxWinStreak, maxLossStreak,
      seriesPlayed: Object.keys(seriesMap).length, seriesWon, seriesLost: seriesComplete.length - seriesWon,
      fannyWins, fannyLosses,
      totalDuration, avgDuration, minDuration, maxDuration,
      matchesWithDuration: matchesWithDuration.length, durationByFormat, avgMeneDuration, menesWithDuration,
    };
  }, [filteredMatches]);
}

export function useTirStats(filteredMatches: Match[], filteredChallenges: Challenge[], totalMenes: number) {
  return useMemo(() => {
    let totalTirs = 0, tirsSuccess = 0, carreaux = 0;
    const shotTypeStats: Record<string, { total: number; success: number }> = {
      au_fer: { total: 0, success: 0 }, au_plomb: { total: 0, success: 0 },
      en_rafle: { total: 0, success: 0 }, court_ramasse: { total: 0, success: 0 },
      carreau: { total: 0, success: 0 },
    };
    const shotResultStats: Record<string, number> = { court_droite: 0, court_gauche: 0, long: 0, tir_bouchon: 0 };
    const shotQualityStats: Record<string, number> = { gain_point: 0, sans_effet: 0, negatif: 0, decisif: 0 };

    const crossTypeImpact: Record<string, { gain_point: number; sans_effet: number; negatif: number; decisif: number; total: number }> = {
      au_fer: { gain_point: 0, sans_effet: 0, negatif: 0, decisif: 0, total: 0 },
      au_plomb: { gain_point: 0, sans_effet: 0, negatif: 0, decisif: 0, total: 0 },
      en_rafle: { gain_point: 0, sans_effet: 0, negatif: 0, decisif: 0, total: 0 },
      court_ramasse: { gain_point: 0, sans_effet: 0, negatif: 0, decisif: 0, total: 0 },
    };

    const crossTypeResult: Record<string, { court_droite: number; court_gauche: number; long: number; tir_bouchon: number; total: number }> = {
      au_fer: { court_droite: 0, court_gauche: 0, long: 0, tir_bouchon: 0, total: 0 },
      au_plomb: { court_droite: 0, court_gauche: 0, long: 0, tir_bouchon: 0, total: 0 },
      en_rafle: { court_droite: 0, court_gauche: 0, long: 0, tir_bouchon: 0, total: 0 },
    };

    const processShot = (shot: any) => {
      if (shot.shotType && shotTypeStats[shot.shotType]) {
        shotTypeStats[shot.shotType].total++;
        if (shot.success) shotTypeStats[shot.shotType].success++;
      }
      if (shot.shotResult && shotResultStats[shot.shotResult] !== undefined) {
        shotResultStats[shot.shotResult]++;
      }
      if (!shot.shotResult && !shot.success && shot.shotType) {
        if (shotResultStats[shot.shotType] !== undefined) shotResultStats[shot.shotType]++;
      }
      if (shot.carreau) { shotTypeStats.carreau.total++; shotTypeStats.carreau.success++; }
      if (shot.shotQuality && shotQualityStats[shot.shotQuality] !== undefined) {
        shotQualityStats[shot.shotQuality]++;
        if (shot.shotType && crossTypeImpact[shot.shotType]) {
          const impactKey = shot.shotQuality as keyof typeof crossTypeImpact['au_fer'];
          if (impactKey !== 'total' && crossTypeImpact[shot.shotType][impactKey] !== undefined) {
            crossTypeImpact[shot.shotType][impactKey]++;
            crossTypeImpact[shot.shotType].total++;
          }
        }
      }
      if (!shot.success && shot.shotType && crossTypeResult[shot.shotType]) {
        const resultKey = shot.shotResult || shot.shotType;
        if (resultKey && crossTypeResult[shot.shotType][resultKey as keyof typeof crossTypeResult['au_fer']] !== undefined) {
          const rk = resultKey as 'court_droite' | 'court_gauche' | 'long' | 'tir_bouchon';
          crossTypeResult[shot.shotType][rk]++;
          crossTypeResult[shot.shotType].total++;
        }
      }
    };

    filteredMatches.forEach(match => {
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          totalTirs += pa.actions.tirs;
          tirsSuccess += pa.actions.tirsSuccess;
          carreaux += pa.actions.carreaux;
          if ((pa as any).detailedShots) {
            (pa as any).detailedShots.filter((s: any) => s.actionType === 'tir').forEach(processShot);
          }
        });
      }
    });

    let challengeTirs = 0, challengeSuccess = 0, challengeCarreaux = 0;
    filteredChallenges.forEach(c => {
      if (c.type === '10_tirs' || c.type === '10_tirs_sautee') {
        challengeTirs += c.totalShots || 0;
        challengeSuccess += c.successCount || 0;
        challengeCarreaux += c.carreauCount || 0;
      }
      if (c.detailedShots) {
        c.detailedShots.filter(s => s.actionType === 'tir').forEach(processShot);
      }
    });

    const combinedTirs = totalTirs + challengeTirs;
    const combinedSuccess = tirsSuccess + challengeSuccess;
    const combinedCarreaux = carreaux + challengeCarreaux;

    const successRate = combinedTirs > 0 ? Math.round((combinedSuccess / combinedTirs) * 100) : 0;
    const carreauRate = combinedTirs > 0 ? Math.round((combinedCarreaux / combinedTirs) * 100) : 0;
    const missedRate = combinedTirs > 0 ? Math.round(((combinedTirs - combinedSuccess) / combinedTirs) * 100) : 0;
    const tirsPerMatch = filteredMatches.length > 0 ? (totalTirs / filteredMatches.length).toFixed(1) : '0';
    const tirsPerMene = totalMenes > 0 ? (totalTirs / totalMenes).toFixed(1) : '0';
    const demiTirs = combinedSuccess - combinedCarreaux;
    const demiTirRate = combinedTirs > 0 ? Math.round((demiTirs / combinedTirs) * 100) : 0;

    const hasDetailedData = Object.values(shotTypeStats).some(s => s.total > 0) || Object.values(shotQualityStats).some(v => v > 0);
    const totalDetailedTirs = Object.values(shotTypeStats).reduce((sum, s) => sum + s.total, 0);
    const totalQualityTracked = Object.values(shotQualityStats).reduce((sum, v) => sum + v, 0);
    const hasCrossData = Object.values(crossTypeImpact).some(v => v.total > 0);
    const totalCrossTracked = Object.values(crossTypeImpact).reduce((sum, v) => sum + v.total, 0);
    const hasCrossResultData = Object.values(crossTypeResult).some(v => v.total > 0);
    const totalCrossResultTracked = Object.values(crossTypeResult).reduce((sum, v) => sum + v.total, 0);

    return {
      totalTirs: combinedTirs, tirsSuccess: combinedSuccess, carreaux: combinedCarreaux,
      successRate, carreauRate, demiTirRate, missedRate, tirsPerMatch, tirsPerMene,
      matchTirs: totalTirs, challengeTirs, hasDetailedData, totalDetailedTirs, totalQualityTracked,
      crossTypeImpact, hasCrossData, totalCrossTracked,
      crossTypeResult, hasCrossResultData, totalCrossResultTracked,
      tirGainPoint: shotQualityStats.gain_point, tirSansEffet: shotQualityStats.sans_effet,
      tirNegatif: shotQualityStats.negatif, tirsDecisifs: shotQualityStats.decisif,
      tirAuFer: shotTypeStats.au_fer, tirAuPlomb: shotTypeStats.au_plomb,
      tirEnRafle: shotTypeStats.en_rafle, tirCourtRamasse: shotTypeStats.court_ramasse,
      tirCarreau: shotTypeStats.carreau,
      tirCourtDroite: shotResultStats.court_droite,
      tirCourtGauche: shotResultStats.court_gauche,
      tirLong: shotResultStats.long,
      tirBouchon: shotResultStats.tir_bouchon,
    };
  }, [filteredMatches, filteredChallenges, totalMenes]);
}

export function usePointStats(filteredMatches: Match[], totalMenes: number) {
  return useMemo(() => {
    let totalPoints = 0, pointsSuccess = 0;
    const pointTypeStats: Record<string, { total: number; success: number }> = {
      roule: { total: 0, success: 0 }, plombe: { total: 0, success: 0 },
      demi_portee: { total: 0, success: 0 }, portee: { total: 0, success: 0 },
    };
    const pointQualityStats: Record<string, number> = {
      excellent: 0, bon: 0, moyen: 0, au_bouchon: 0, devant_boule: 0, rate: 0, crochete: 0, sorti: 0,
    };

    const crossTypeQuality: Record<string, { excellent: number; bon: number; moyen: number; au_bouchon: number; devant_boule: number; rate: number; crochete: number; sorti: number; total: number; successTotal: number; failTotal: number }> = {
      roule: { excellent: 0, bon: 0, moyen: 0, au_bouchon: 0, devant_boule: 0, rate: 0, crochete: 0, sorti: 0, total: 0, successTotal: 0, failTotal: 0 },
      plombe: { excellent: 0, bon: 0, moyen: 0, au_bouchon: 0, devant_boule: 0, rate: 0, crochete: 0, sorti: 0, total: 0, successTotal: 0, failTotal: 0 },
      demi_portee: { excellent: 0, bon: 0, moyen: 0, au_bouchon: 0, devant_boule: 0, rate: 0, crochete: 0, sorti: 0, total: 0, successTotal: 0, failTotal: 0 },
      portee: { excellent: 0, bon: 0, moyen: 0, au_bouchon: 0, devant_boule: 0, rate: 0, crochete: 0, sorti: 0, total: 0, successTotal: 0, failTotal: 0 },
    };

    filteredMatches.forEach(match => {
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          totalPoints += pa.actions.points;
          pointsSuccess += pa.actions.pointsSuccess;
          if ((pa as any).detailedShots) {
            (pa as any).detailedShots.filter((s: any) => s.actionType === 'point').forEach((shot: any) => {
              if (shot.pointType && pointTypeStats[shot.pointType]) {
                pointTypeStats[shot.pointType].total++;
                if (shot.success) pointTypeStats[shot.pointType].success++;
              }
              if (shot.pointQuality && pointQualityStats[shot.pointQuality] !== undefined) {
                pointQualityStats[shot.pointQuality]++;
              }
              if (shot.pointType && crossTypeQuality[shot.pointType] && shot.pointQuality) {
                const entry = crossTypeQuality[shot.pointType];
                const qKey = shot.pointQuality as keyof typeof entry;
                if (qKey !== 'total' && qKey !== 'successTotal' && qKey !== 'failTotal' && entry[qKey] !== undefined) {
                  (entry as any)[qKey]++;
                  entry.total++;
                  if (shot.success) entry.successTotal++;
                  else entry.failTotal++;
                }
              }
            });
          }
        });
      }
    });

    const successRate = totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 100) : 0;
    const pointsPerMene = totalMenes > 0 ? (totalPoints / totalMenes).toFixed(1) : '0';
    const hasDetailedData = Object.values(pointTypeStats).some(s => s.total > 0) || Object.values(pointQualityStats).some(v => v > 0);
    const totalDetailedPoints = Object.values(pointTypeStats).reduce((sum, s) => sum + s.total, 0);
    const totalQualityTracked = Object.values(pointQualityStats).reduce((sum, v) => sum + v, 0);
    const successQualitiesTotal = pointQualityStats.excellent + pointQualityStats.bon + pointQualityStats.moyen + pointQualityStats.au_bouchon + pointQualityStats.devant_boule;
    const failureQualitiesTotal = pointQualityStats.rate + pointQualityStats.crochete + pointQualityStats.sorti;
    const hasCrossData = Object.values(crossTypeQuality).some(v => v.total > 0);
    const totalCrossTracked = Object.values(crossTypeQuality).reduce((sum, v) => sum + v.total, 0);

    return {
      totalPoints, pointsSuccess, successRate, pointsPerMene,
      hasDetailedData, totalDetailedPoints, totalQualityTracked,
      crossTypeQuality, hasCrossData, totalCrossTracked,
      pointRoule: pointTypeStats.roule, pointPlombe: pointTypeStats.plombe,
      pointDemiPortee: pointTypeStats.demi_portee, pointPortee: pointTypeStats.portee,
      pointExcellent: pointQualityStats.excellent, pointBon: pointQualityStats.bon,
      pointMoyen: pointQualityStats.moyen, pointAuBouchon: pointQualityStats.au_bouchon,
      pointDevantBoule: pointQualityStats.devant_boule, successQualitiesTotal, pointRate: pointQualityStats.rate,
      pointCrochete: pointQualityStats.crochete, pointSorti: pointQualityStats.sorti,
      failureQualitiesTotal,
    };
  }, [filteredMatches, totalMenes]);
}

export function useErrorStats(
  filteredMatches: Match[],
  tirStats: { totalTirs: number; tirsSuccess: number; missedRate: number; tirCourtDroite: number; tirCourtGauche: number; tirLong: number; tirBouchon: number; tirAuFer: { total: number; success: number }; tirAuPlomb: { total: number; success: number }; tirEnRafle: { total: number; success: number }; hasCrossResultData: boolean; totalCrossResultTracked: number },
  pointStats: { totalPoints: number; pointsSuccess: number; successRate: number; pointRate: number; pointCrochete: number; pointSorti: number; pointRoule: { total: number; success: number }; pointPlombe: { total: number; success: number }; pointDemiPortee: { total: number; success: number }; pointPortee: { total: number; success: number } },
  t: (section: string, key: string) => string,
) {
  return useMemo(() => {
    const totalTirErrors = tirStats.totalTirs - tirStats.tirsSuccess;
    const totalPointErrors = pointStats.totalPoints - pointStats.pointsSuccess;
    const totalErrors = totalTirErrors + totalPointErrors;

    // Error rate by match duration
    const shortMatches = filteredMatches.filter(m => m.duration && m.duration < 30);
    const mediumMatches = filteredMatches.filter(m => m.duration && m.duration >= 30 && m.duration < 60);
    const longMatches = filteredMatches.filter(m => m.duration && m.duration >= 60);

    const getErrorRate = (matchList: Match[]) => {
      let tirs = 0, tirsSuccess = 0, points = 0, pointsSuccess = 0;
      matchList.forEach(m => {
        if (m.playerActions) {
          m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
            tirs += pa.actions.tirs;
            tirsSuccess += pa.actions.tirsSuccess;
            points += pa.actions.points;
            pointsSuccess += pa.actions.pointsSuccess;
          });
        }
      });
      const totalAttempts = tirs + points;
      const totalSuccess = tirsSuccess + pointsSuccess;
      return totalAttempts > 0 ? Math.round(((totalAttempts - totalSuccess) / totalAttempts) * 100) : 0;
    };

    const shortMatchErrorRate = getErrorRate(shortMatches);
    const mediumMatchErrorRate = getErrorRate(mediumMatches);
    const longMatchErrorRate = getErrorRate(longMatches);

    // Error by format
    const errorByFormat: Record<string, { errors: number; total: number; rate: number }> = {};
    ['Tête-à-tête', 'Doublette', 'Triplette'].forEach(format => {
      const formatMatches = filteredMatches.filter(m => m.format === format);
      let tirs = 0, tirsSuccess = 0, points = 0, pointsSuccess = 0;
      formatMatches.forEach(m => {
        if (m.playerActions) {
          m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
            tirs += pa.actions.tirs;
            tirsSuccess += pa.actions.tirsSuccess;
            points += pa.actions.points;
            pointsSuccess += pa.actions.pointsSuccess;
          });
        }
      });
      const total = tirs + points;
      const errors = total - (tirsSuccess + pointsSuccess);
      errorByFormat[format] = {
        errors, total, rate: total > 0 ? Math.round((errors / total) * 100) : 0,
      };
    });

    // Error by mode
    const trainingMatches = filteredMatches.filter(m => m.mode === 'Entraînement');
    const tournamentMatches = filteredMatches.filter(m => m.mode === 'Tournoi');
    const trainingErrorRate = getErrorRate(trainingMatches);
    const tournamentErrorRate = getErrorRate(tournamentMatches);

    // Consecutive errors analysis
    let maxConsecutiveErrors = 0;
    let currentConsecutiveErrors = 0;
    let totalErrorStreaks = 0;

    filteredMatches.forEach(match => {
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          if ((pa as any).detailedShots) {
            (pa as any).detailedShots.forEach((shot: any) => {
              if (!shot.success) {
                currentConsecutiveErrors++;
                maxConsecutiveErrors = Math.max(maxConsecutiveErrors, currentConsecutiveErrors);
              } else {
                if (currentConsecutiveErrors >= 3) totalErrorStreaks++;
                currentConsecutiveErrors = 0;
              }
            });
          }
        });
      }
    });

    // Detailed tir error types - shot result
    const tirErrorResults = {
      courtDroite: tirStats.tirCourtDroite,
      courtGauche: tirStats.tirCourtGauche,
      long: tirStats.tirLong,
      tirBouchon: tirStats.tirBouchon,
    };
    const totalTirErrorResults = Object.values(tirErrorResults).reduce((a, b) => a + b, 0);

    // Technique failure rates
    const tirErrorByTechnique = {
      auFerRate: tirStats.tirAuFer.total - tirStats.tirAuFer.success,
      auPlombRate: tirStats.tirAuPlomb.total - tirStats.tirAuPlomb.success,
      enRafleRate: tirStats.tirEnRafle.total - tirStats.tirEnRafle.success,
    };
    const totalTirErrorByTechnique = Object.values(tirErrorByTechnique).reduce((a, b) => a + b, 0);

    const tirErrorTypes = { ...tirErrorResults };
    const totalTirErrorTyped = totalTirErrorResults > 0 ? totalTirErrorResults : totalTirErrorByTechnique;

    // Detailed point error types
    const pointErrorTypes = {
      rate: pointStats.pointRate,
      crochete: pointStats.pointCrochete,
      sorti: pointStats.pointSorti,
      rouleRate: pointStats.pointRoule.total - pointStats.pointRoule.success,
      plombeRate: pointStats.pointPlombe.total - pointStats.pointPlombe.success,
      demiPorteeRate: pointStats.pointDemiPortee.total - pointStats.pointDemiPortee.success,
      porteeRate: pointStats.pointPortee.total - pointStats.pointPortee.success,
    };
    const totalPointErrorTyped = Object.values(pointErrorTypes).reduce((a, b) => a + b, 0);

    // Most common error
    const allErrors = [
      { type: t('stats', 'errorCourtDroite'), count: tirErrorResults.courtDroite, category: 'tir' },
      { type: t('stats', 'errorCourtGauche'), count: tirErrorResults.courtGauche, category: 'tir' },
      { type: t('stats', 'errorLong'), count: tirErrorResults.long, category: 'tir' },
      { type: t('stats', 'errorTirBouchon'), count: tirErrorResults.tirBouchon, category: 'tir' },
      { type: t('stats', 'errorPointRate'), count: pointErrorTypes.rate, category: 'point' },
      { type: t('stats', 'errorPointCrochete'), count: pointErrorTypes.crochete, category: 'point' },
      { type: t('stats', 'errorPointSorti'), count: pointErrorTypes.sorti, category: 'point' },
    ].filter(e => e.count > 0).sort((a, b) => b.count - a.count);

    const mostCommonError = allErrors.length > 0 ? allErrors[0] : null;

    return {
      totalErrors, totalTirErrors, totalPointErrors,
      tirErrorRate: tirStats.missedRate, pointErrorRate: 100 - pointStats.successRate,
      shortMatchErrorRate, mediumMatchErrorRate, longMatchErrorRate,
      shortMatchCount: shortMatches.length, mediumMatchCount: mediumMatches.length, longMatchCount: longMatches.length,
      errorByFormat, trainingErrorRate, tournamentErrorRate,
      maxConsecutiveErrors, totalErrorStreaks,
      tirErrorTypes, totalTirErrorTyped,
      tirErrorResults, totalTirErrorResults,
      tirErrorByTechnique, totalTirErrorByTechnique,
      pointErrorTypes, totalPointErrorTyped,
      mostCommonError, allErrors,
    };
  }, [filteredMatches, tirStats, pointStats, t]);
}
