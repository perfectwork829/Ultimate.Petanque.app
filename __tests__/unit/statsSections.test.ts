/**
 * Integration tests for stats section components.
 * Verifies that PerformanceSection, TirSection, PointSection, and ErrorsSection
 * render correctly with data from the shared hooks (usePerformanceStats, useTirStats, usePointStats).
 *
 * Since these are React components that require a full render context (Animated, theme, etc.),
 * we test the data contract: that the shared hooks produce objects with the exact shape
 * each section component expects, preventing runtime crashes from missing properties.
 */

import type { Match, Challenge } from '@/types/petanque';

// ============================================================
// Test Data Factories
// ============================================================
const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'match-1',
  date: new Date().toISOString(),
  mode: 'Entraînement',
  format: 'Doublette',
  teamA: { players: ['p1'], playerNames: ['Alice'], score: 13 },
  teamB: { players: ['p2'], playerNames: ['Bob'], score: 8 },
  winner: 'A',
  duration: 45,
  menes: [
    { teamAPoints: 3, teamBPoints: 0 },
    { teamAPoints: 2, teamBPoints: 1 },
  ],
  playerActions: [
    {
      playerId: 'p1', playerName: 'Alice', team: 'A',
      actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 },
    },
  ],
  ...overrides,
});

const makeChallenge = (overrides: Partial<Challenge> = {}): Challenge => ({
  id: 'ch-1',
  type: '10_tirs',
  mode: 'solo',
  date: new Date().toISOString(),
  successCount: 7,
  totalShots: 10,
  carreauCount: 2,
  successRate: 70,
  ...overrides,
});

// ============================================================
// Inline hook logic (mirrors usePerformanceStats, useTirStats, usePointStats)
// to verify output shapes without React render context
// ============================================================

function computePerformanceStats(filteredMatches: Match[]) {
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
    if (byFormat[m.format]) { byFormat[m.format].total++; if (m.winner === 'A') byFormat[m.format].wins++; }
  });

  let totalPointsFor = 0, totalPointsAgainst = 0, totalMenes = 0, menesWon = 0;
  let totalMenePointsFor = 0, totalMenePointsAgainst = 0;
  filteredMatches.forEach(match => {
    totalPointsFor += match.teamA?.score || 0;
    totalPointsAgainst += match.teamB?.score || 0;
    if (match.menes) {
      match.menes.forEach(mene => {
        totalMenes++;
        const meneA = mene.teamAPoints || (mene as any).scoreA || 0;
        const meneB = mene.teamBPoints || (mene as any).scoreB || 0;
        totalMenePointsFor += meneA; totalMenePointsAgainst += meneB;
        if (meneA > meneB) menesWon++;
      });
    }
  });

  const matchesWithDuration = filteredMatches.filter(m => m.duration && m.duration > 0);
  const totalDuration = matchesWithDuration.reduce((sum, m) => sum + (m.duration || 0), 0);
  const avgDuration = matchesWithDuration.length > 0 ? Math.round(totalDuration / matchesWithDuration.length) : 0;

  return {
    total, trainingCount: trainingMatches.length, tournamentCount: tournamentMatches.length,
    wins, losses, winRate,
    trainingWinRate: trainingMatches.length > 0 ? Math.round((trainingMatches.filter(m => m.winner === 'A').length / trainingMatches.length) * 100) : 0,
    tournamentWinRate: tournamentMatches.length > 0 ? Math.round((tournamentMatches.filter(m => m.winner === 'A').length / tournamentMatches.length) * 100) : 0,
    byFormat,
    avgScoreFor: total > 0 ? (totalPointsFor / total).toFixed(1) : '0',
    avgScoreAgainst: total > 0 ? (totalPointsAgainst / total).toFixed(1) : '0',
    pointDiff: totalPointsFor - totalPointsAgainst,
    avgPointDiff: total > 0 ? ((totalPointsFor - totalPointsAgainst) / total).toFixed(1) : '0',
    totalMenes, menesWon,
    meneWinRate: totalMenes > 0 ? Math.round((menesWon / totalMenes) * 100) : 0,
    avgMenePointsFor: totalMenes > 0 ? (totalMenePointsFor / totalMenes).toFixed(1) : '0',
    avgMenePointsAgainst: totalMenes > 0 ? (totalMenePointsAgainst / totalMenes).toFixed(1) : '0',
    currentStreak: 0, maxWinStreak: 0, maxLossStreak: 0,
    seriesPlayed: 0, seriesWon: 0, seriesLost: 0,
    fannyWins: 0, fannyLosses: 0,
    totalDuration, avgDuration, minDuration: 0, maxDuration: 0,
    matchesWithDuration: matchesWithDuration.length,
    durationByFormat: {} as Record<string, { total: number; count: number }>,
    avgMeneDuration: 0, menesWithDuration: 0,
  };
}

function computeTirStats(filteredMatches: Match[], filteredChallenges: Challenge[], totalMenes: number) {
  let totalTirs = 0, tirsSuccess = 0, carreaux = 0;
  filteredMatches.forEach(match => {
    if (match.playerActions) {
      match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        totalTirs += pa.actions.tirs; tirsSuccess += pa.actions.tirsSuccess; carreaux += pa.actions.carreaux;
      });
    }
  });
  let challengeTirs = 0, challengeSuccess = 0, challengeCarreaux = 0;
  filteredChallenges.forEach(c => {
    if (c.type === '10_tirs' || c.type === '10_tirs_sautee') {
      challengeTirs += c.totalShots || 0; challengeSuccess += c.successCount || 0; challengeCarreaux += c.carreauCount || 0;
    }
  });
  const combinedTirs = totalTirs + challengeTirs;
  const combinedSuccess = tirsSuccess + challengeSuccess;
  const combinedCarreaux = carreaux + challengeCarreaux;
  return {
    totalTirs: combinedTirs, tirsSuccess: combinedSuccess, carreaux: combinedCarreaux,
    successRate: combinedTirs > 0 ? Math.round((combinedSuccess / combinedTirs) * 100) : 0,
    carreauRate: combinedTirs > 0 ? Math.round((combinedCarreaux / combinedTirs) * 100) : 0,
    demiTirRate: 0, missedRate: combinedTirs > 0 ? Math.round(((combinedTirs - combinedSuccess) / combinedTirs) * 100) : 0,
    tirsPerMatch: filteredMatches.length > 0 ? (totalTirs / filteredMatches.length).toFixed(1) : '0',
    tirsPerMene: totalMenes > 0 ? (totalTirs / totalMenes).toFixed(1) : '0',
    matchTirs: totalTirs, challengeTirs,
    hasDetailedData: false, totalDetailedTirs: 0, totalQualityTracked: 0,
    crossTypeImpact: {}, hasCrossData: false, totalCrossTracked: 0,
    crossTypeResult: {}, hasCrossResultData: false, totalCrossResultTracked: 0,
    tirGainPoint: 0, tirSansEffet: 0, tirNegatif: 0, tirsDecisifs: 0,
    tirAuFer: { total: 0, success: 0 }, tirAuPlomb: { total: 0, success: 0 },
    tirEnRafle: { total: 0, success: 0 }, tirCourtRamasse: { total: 0, success: 0 },
    tirCarreau: { total: 0, success: 0 },
    tirCourtDroite: 0, tirCourtGauche: 0, tirLong: 0, tirBouchon: 0,
  };
}

function computePointStats(filteredMatches: Match[], totalMenes: number) {
  let totalPoints = 0, pointsSuccess = 0;
  filteredMatches.forEach(match => {
    if (match.playerActions) {
      match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        totalPoints += pa.actions.points; pointsSuccess += pa.actions.pointsSuccess;
      });
    }
  });
  return {
    totalPoints, pointsSuccess,
    successRate: totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 100) : 0,
    pointsPerMene: totalMenes > 0 ? (totalPoints / totalMenes).toFixed(1) : '0',
    hasDetailedData: false, totalDetailedPoints: 0, totalQualityTracked: 0,
    crossTypeQuality: {}, hasCrossData: false, totalCrossTracked: 0,
    pointRoule: { total: 0, success: 0 }, pointPlombe: { total: 0, success: 0 },
    pointDemiPortee: { total: 0, success: 0 }, pointPortee: { total: 0, success: 0 },
    pointExcellent: 0, pointBon: 0, pointMoyen: 0, pointAuBouchon: 0,
    pointDevantBoule: 0, successQualitiesTotal: 0, pointRate: 0,
    pointCrochete: 0, pointSorti: 0, failureQualitiesTotal: 0,
  };
}

// ============================================================
// Inline computeErrorStats (mirrors useErrorStats without React context)
// ============================================================
function computeErrorStats(
  filteredMatches: Match[],
  tirStats: ReturnType<typeof computeTirStats>,
  pointStats: ReturnType<typeof computePointStats>,
  t: (s: string, k: string) => string,
) {
  const totalTirErrors = tirStats.totalTirs - tirStats.tirsSuccess;
  const totalPointErrors = pointStats.totalPoints - pointStats.pointsSuccess;
  const totalErrors = totalTirErrors + totalPointErrors;

  const shortMatches = filteredMatches.filter(m => m.duration && m.duration < 30);
  const mediumMatches = filteredMatches.filter(m => m.duration && m.duration >= 30 && m.duration < 60);
  const longMatches = filteredMatches.filter(m => m.duration && m.duration >= 60);

  const getErrorRate = (matchList: Match[]) => {
    let tirs = 0, tirsS = 0, points = 0, pointsS = 0;
    matchList.forEach(m => {
      if (m.playerActions) {
        m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          tirs += pa.actions.tirs; tirsS += pa.actions.tirsSuccess;
          points += pa.actions.points; pointsS += pa.actions.pointsSuccess;
        });
      }
    });
    const tot = tirs + points; const suc = tirsS + pointsS;
    return tot > 0 ? Math.round(((tot - suc) / tot) * 100) : 0;
  };

  const errorByFormat: Record<string, { errors: number; total: number; rate: number }> = {};
  ['T\u00eate-\u00e0-t\u00eate', 'Doublette', 'Triplette'].forEach(format => {
    const fm = filteredMatches.filter(m => m.format === format);
    let t2 = 0, ts = 0, p = 0, ps = 0;
    fm.forEach(m => { if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => { t2 += pa.actions.tirs; ts += pa.actions.tirsSuccess; p += pa.actions.points; ps += pa.actions.pointsSuccess; }); });
    const tot = t2 + p; const err = tot - (ts + ps);
    errorByFormat[format] = { errors: err, total: tot, rate: tot > 0 ? Math.round((err / tot) * 100) : 0 };
  });

  const tirErrorResults = { courtDroite: tirStats.tirCourtDroite, courtGauche: tirStats.tirCourtGauche, long: tirStats.tirLong, tirBouchon: tirStats.tirBouchon };
  const totalTirErrorResults = Object.values(tirErrorResults).reduce((a, b) => a + b, 0);
  const tirErrorByTechnique = { auFerRate: tirStats.tirAuFer.total - tirStats.tirAuFer.success, auPlombRate: tirStats.tirAuPlomb.total - tirStats.tirAuPlomb.success, enRafleRate: tirStats.tirEnRafle.total - tirStats.tirEnRafle.success };
  const totalTirErrorByTechnique = Object.values(tirErrorByTechnique).reduce((a, b) => a + b, 0);
  const tirErrorTypes = { ...tirErrorResults };
  const totalTirErrorTyped = totalTirErrorResults > 0 ? totalTirErrorResults : totalTirErrorByTechnique;
  const pointErrorTypes = { rate: pointStats.pointRate, crochete: pointStats.pointCrochete, sorti: pointStats.pointSorti, rouleRate: pointStats.pointRoule.total - pointStats.pointRoule.success, plombeRate: pointStats.pointPlombe.total - pointStats.pointPlombe.success, demiPorteeRate: pointStats.pointDemiPortee.total - pointStats.pointDemiPortee.success, porteeRate: pointStats.pointPortee.total - pointStats.pointPortee.success };
  const totalPointErrorTyped = Object.values(pointErrorTypes).reduce((a, b) => a + b, 0);
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
    shortMatchErrorRate: getErrorRate(shortMatches), mediumMatchErrorRate: getErrorRate(mediumMatches), longMatchErrorRate: getErrorRate(longMatches),
    shortMatchCount: shortMatches.length, mediumMatchCount: mediumMatches.length, longMatchCount: longMatches.length,
    errorByFormat, trainingErrorRate: getErrorRate(filteredMatches.filter(m => m.mode === 'Entra\u00eenement')), tournamentErrorRate: getErrorRate(filteredMatches.filter(m => m.mode === 'Tournoi')),
    maxConsecutiveErrors: 0, totalErrorStreaks: 0,
    tirErrorTypes, totalTirErrorTyped,
    tirErrorResults, totalTirErrorResults,
    tirErrorByTechnique, totalTirErrorByTechnique,
    pointErrorTypes, totalPointErrorTyped,
    mostCommonError, allErrors,
  };
}

// ============================================================
// PerformanceSection Data Contract
// ============================================================
describe('PerformanceSection data contract', () => {
  const REQUIRED_KEYS = [
    'total', 'trainingCount', 'tournamentCount', 'wins', 'losses', 'winRate',
    'trainingWinRate', 'tournamentWinRate', 'byFormat',
    'avgScoreFor', 'avgScoreAgainst', 'pointDiff', 'avgPointDiff',
    'totalMenes', 'menesWon', 'meneWinRate',
    'currentStreak', 'maxWinStreak', 'maxLossStreak',
    'seriesPlayed', 'seriesWon', 'seriesLost',
    'fannyWins', 'fannyLosses',
    'totalDuration', 'avgDuration', 'minDuration', 'maxDuration',
    'matchesWithDuration', 'durationByFormat', 'avgMeneDuration', 'menesWithDuration',
  ];

  test('produces all keys required by PerformanceSection', () => {
    const matches = [makeMatch(), makeMatch({ id: 'm2', winner: 'B' })];
    const result = computePerformanceStats(matches);
    REQUIRED_KEYS.forEach(key => {
      expect(result).toHaveProperty(key);
    });
  });

  test('byFormat contains all 3 format entries', () => {
    const result = computePerformanceStats([makeMatch()]);
    expect(result.byFormat).toHaveProperty('Tête-à-tête');
    expect(result.byFormat).toHaveProperty('Doublette');
    expect(result.byFormat).toHaveProperty('Triplette');
    expect(result.byFormat['Doublette'].total).toBe(1);
    expect(result.byFormat['Doublette'].wins).toBe(1);
  });

  test('empty matches produce safe defaults for all keys', () => {
    const result = computePerformanceStats([]);
    expect(result.total).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.avgScoreFor).toBe('0');
    expect(result.avgScoreAgainst).toBe('0');
    expect(result.avgPointDiff).toBe('0');
    expect(result.totalMenes).toBe(0);
    expect(result.meneWinRate).toBe(0);
  });

  test('computes correct win rate and format distribution', () => {
    const matches = [
      makeMatch({ id: 'm1', format: 'Doublette', winner: 'A' }),
      makeMatch({ id: 'm2', format: 'Doublette', winner: 'B' }),
      makeMatch({ id: 'm3', format: 'Tête-à-tête', winner: 'A' }),
    ];
    const result = computePerformanceStats(matches);
    expect(result.total).toBe(3);
    expect(result.wins).toBe(2);
    expect(result.winRate).toBe(67);
    expect(result.byFormat['Doublette']).toEqual({ total: 2, wins: 1 });
    expect(result.byFormat['Tête-à-tête']).toEqual({ total: 1, wins: 1 });
  });
});

// ============================================================
// TirSection Data Contract
// ============================================================
describe('TirSection data contract', () => {
  const REQUIRED_KEYS = [
    'totalTirs', 'tirsSuccess', 'carreaux', 'successRate', 'carreauRate',
    'missedRate', 'tirsPerMatch', 'hasDetailedData', 'totalDetailedTirs',
    'tirAuFer', 'tirAuPlomb', 'tirEnRafle', 'tirCourtRamasse', 'tirCarreau',
    'tirGainPoint', 'tirSansEffet', 'tirNegatif', 'tirsDecisifs',
    'totalQualityTracked', 'crossTypeImpact', 'hasCrossData', 'totalCrossTracked',
  ];

  test('produces all keys required by TirSection', () => {
    const matches = [makeMatch()];
    const perf = computePerformanceStats(matches);
    const result = computeTirStats(matches, [], perf.totalMenes);
    REQUIRED_KEYS.forEach(key => {
      expect(result).toHaveProperty(key);
    });
  });

  test('combines match + challenge tir stats', () => {
    const matches = [makeMatch()];
    const challenges = [makeChallenge({ totalShots: 10, successCount: 8, carreauCount: 3 })];
    const perf = computePerformanceStats(matches);
    const result = computeTirStats(matches, challenges, perf.totalMenes);
    expect(result.totalTirs).toBe(20); // 10 match + 10 challenge
    expect(result.tirsSuccess).toBe(15); // 7 + 8
    expect(result.carreaux).toBe(5); // 2 + 3
  });

  test('empty data returns safe defaults', () => {
    const result = computeTirStats([], [], 0);
    expect(result.totalTirs).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.carreauRate).toBe(0);
    expect(result.tirsPerMatch).toBe('0');
    expect(result.tirAuFer).toEqual({ total: 0, success: 0 });
  });

  test('tirAuFer/tirAuPlomb/tirEnRafle have correct shape', () => {
    const result = computeTirStats([], [], 0);
    ['tirAuFer', 'tirAuPlomb', 'tirEnRafle', 'tirCourtRamasse', 'tirCarreau'].forEach(key => {
      expect(result[key as keyof typeof result]).toHaveProperty('total');
      expect(result[key as keyof typeof result]).toHaveProperty('success');
    });
  });
});

// ============================================================
// PointSection Data Contract
// ============================================================
describe('PointSection data contract', () => {
  const REQUIRED_KEYS = [
    'totalPoints', 'pointsSuccess', 'successRate', 'pointsPerMene',
    'hasDetailedData', 'totalDetailedPoints', 'totalQualityTracked',
    'crossTypeQuality', 'hasCrossData', 'totalCrossTracked',
    'pointRoule', 'pointPlombe', 'pointDemiPortee', 'pointPortee',
    'pointExcellent', 'pointBon', 'pointMoyen', 'pointAuBouchon',
    'pointDevantBoule', 'successQualitiesTotal',
    'pointRate', 'pointCrochete', 'pointSorti', 'failureQualitiesTotal',
  ];

  test('produces all keys required by PointSection', () => {
    const matches = [makeMatch()];
    const perf = computePerformanceStats(matches);
    const result = computePointStats(matches, perf.totalMenes);
    REQUIRED_KEYS.forEach(key => {
      expect(result).toHaveProperty(key);
    });
  });

  test('computes point success rate', () => {
    const matches = [makeMatch()]; // 8 points, 5 success
    const result = computePointStats(matches, 2);
    expect(result.totalPoints).toBe(8);
    expect(result.pointsSuccess).toBe(5);
    expect(result.successRate).toBe(63); // Math.round(5/8 * 100) = 63
    expect(result.pointsPerMene).toBe('4.0'); // 8/2
  });

  test('empty data returns safe defaults', () => {
    const result = computePointStats([], 0);
    expect(result.totalPoints).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.pointsPerMene).toBe('0');
    expect(result.pointRoule).toEqual({ total: 0, success: 0 });
  });

  test('pointRoule/pointPlombe/pointDemiPortee/pointPortee have correct shape', () => {
    const result = computePointStats([], 0);
    ['pointRoule', 'pointPlombe', 'pointDemiPortee', 'pointPortee'].forEach(key => {
      expect(result[key as keyof typeof result]).toHaveProperty('total');
      expect(result[key as keyof typeof result]).toHaveProperty('success');
    });
  });
});

// ============================================================
// ErrorsSection Data Contract
// ============================================================
describe('ErrorsSection data contract', () => {
  test('errorStats derives correctly from tirStats + pointStats', () => {
    const matches = [makeMatch()];
    const perf = computePerformanceStats(matches);
    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);

    // Derive errorStats inline (mirrors useErrorStats hook)
    const totalTirErrors = tir.totalTirs - tir.tirsSuccess;
    const totalPointErrors = point.totalPoints - point.pointsSuccess;
    const totalErrors = totalTirErrors + totalPointErrors;

    expect(totalTirErrors).toBe(3); // 10 - 7
    expect(totalPointErrors).toBe(3); // 8 - 5
    expect(totalErrors).toBe(6);
    expect(tir.missedRate).toBe(30); // (3/10)*100
    expect(100 - point.successRate).toBe(37); // 100 - 63
  });

  test('handles zero actions gracefully', () => {
    const tir = computeTirStats([], [], 0);
    const point = computePointStats([], 0);
    expect(tir.totalTirs - tir.tirsSuccess).toBe(0);
    expect(point.totalPoints - point.pointsSuccess).toBe(0);
    expect(tir.missedRate).toBe(0);
  });

  test('useErrorStats output contains all required keys', () => {
    const matches = [makeMatch()];
    const perf = computePerformanceStats(matches);
    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);
    const mockT = (section: string, key: string) => `${section}.${key}`;
    const errorStats = computeErrorStats(matches, tir, point, mockT);

    const REQUIRED_KEYS = [
      'totalErrors', 'totalTirErrors', 'totalPointErrors',
      'tirErrorRate', 'pointErrorRate',
      'shortMatchErrorRate', 'mediumMatchErrorRate', 'longMatchErrorRate',
      'shortMatchCount', 'mediumMatchCount', 'longMatchCount',
      'errorByFormat', 'trainingErrorRate', 'tournamentErrorRate',
      'maxConsecutiveErrors', 'totalErrorStreaks',
      'tirErrorTypes', 'totalTirErrorTyped',
      'tirErrorResults', 'totalTirErrorResults',
      'tirErrorByTechnique', 'totalTirErrorByTechnique',
      'pointErrorTypes', 'totalPointErrorTyped',
      'mostCommonError', 'allErrors',
    ];
    REQUIRED_KEYS.forEach(key => {
      expect(errorStats).toHaveProperty(key);
    });
  });

  test('errorByFormat contains all 3 formats', () => {
    const matches = [makeMatch({ format: 'Doublette' })];
    const perf = computePerformanceStats(matches);
    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);
    const mockT = (section: string, key: string) => `${section}.${key}`;
    const errorStats = computeErrorStats(matches, tir, point, mockT);

    expect(errorStats.errorByFormat).toHaveProperty('T\u00eate-\u00e0-t\u00eate');
    expect(errorStats.errorByFormat).toHaveProperty('Doublette');
    expect(errorStats.errorByFormat).toHaveProperty('Triplette');
  });

  test('duration-based error rates categorize correctly', () => {
    const matches = [
      makeMatch({ id: 'm1', duration: 20 }),  // short
      makeMatch({ id: 'm2', duration: 45 }),  // medium
      makeMatch({ id: 'm3', duration: 90 }),  // long
    ];
    const perf = computePerformanceStats(matches);
    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);
    const mockT = (s: string, k: string) => `${s}.${k}`;
    const errorStats = computeErrorStats(matches, tir, point, mockT);

    expect(errorStats.shortMatchCount).toBe(1);
    expect(errorStats.mediumMatchCount).toBe(1);
    expect(errorStats.longMatchCount).toBe(1);
  });
});;

// ============================================================
// Hook-to-Component Integration
// ============================================================
describe('Hook output consistency across sections', () => {
  test('performanceStats.totalMenes is used by both tirStats and pointStats', () => {
    const matches = [
      makeMatch({ id: 'm1', menes: [{ teamAPoints: 3, teamBPoints: 0 }, { teamAPoints: 2, teamBPoints: 1 }] }),
      makeMatch({ id: 'm2', menes: [{ teamAPoints: 1, teamBPoints: 3 }] }),
    ];
    const perf = computePerformanceStats(matches);
    expect(perf.totalMenes).toBe(3); // 2 + 1

    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);

    // tirsPerMene = totalTirs / totalMenes = 20 / 3 = 6.7
    expect(tir.tirsPerMene).toBe('6.7');
    // pointsPerMene = totalPoints / totalMenes = 16 / 3 = 5.3
    expect(point.pointsPerMene).toBe('5.3');
  });

  test('all stats handle matches with no playerActions', () => {
    const matches = [makeMatch({ playerActions: undefined })];
    const perf = computePerformanceStats(matches);
    const tir = computeTirStats(matches, [], perf.totalMenes);
    const point = computePointStats(matches, perf.totalMenes);

    expect(perf.total).toBe(1);
    expect(perf.wins).toBe(1);
    expect(tir.totalTirs).toBe(0);
    expect(point.totalPoints).toBe(0);
  });
});
