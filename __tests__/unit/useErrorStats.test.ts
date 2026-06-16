/**
 * Unit tests for useErrorStats hook logic.
 * Tests: error rate computation, duration-based errors, format errors,
 * technique failures, consecutive errors, most common error detection.
 */

import type { Match } from '@/types/petanque';

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
  menes: [],
  playerActions: [
    {
      playerId: 'p1', playerName: 'Alice', team: 'A',
      actions: { tirs: 10, tirsSuccess: 7, points: 8, pointsSuccess: 5, carreaux: 2 },
    },
  ],
  ...overrides,
});

// ============================================================
// Inline computeErrorStats (mirrors useErrorStats hook)
// ============================================================
interface TirStatsInput {
  totalTirs: number; tirsSuccess: number; missedRate: number;
  tirCourtDroite: number; tirCourtGauche: number; tirLong: number; tirBouchon: number;
  tirAuFer: { total: number; success: number };
  tirAuPlomb: { total: number; success: number };
  tirEnRafle: { total: number; success: number };
  hasCrossResultData: boolean; totalCrossResultTracked: number;
}

interface PointStatsInput {
  totalPoints: number; pointsSuccess: number; successRate: number;
  pointRate: number; pointCrochete: number; pointSorti: number;
  pointRoule: { total: number; success: number };
  pointPlombe: { total: number; success: number };
  pointDemiPortee: { total: number; success: number };
  pointPortee: { total: number; success: number };
}

function computeErrorStats(
  filteredMatches: Match[],
  tirStats: TirStatsInput,
  pointStats: PointStatsInput,
  t: (section: string, key: string) => string,
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
  ['Tête-à-tête', 'Doublette', 'Triplette'].forEach(format => {
    const fm = filteredMatches.filter(m => m.format === format);
    let t2 = 0, ts = 0, p = 0, ps = 0;
    fm.forEach(m => {
      if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        t2 += pa.actions.tirs; ts += pa.actions.tirsSuccess;
        p += pa.actions.points; ps += pa.actions.pointsSuccess;
      });
    });
    const tot = t2 + p; const err = tot - (ts + ps);
    errorByFormat[format] = { errors: err, total: tot, rate: tot > 0 ? Math.round((err / tot) * 100) : 0 };
  });

  const trainingErrorRate = getErrorRate(filteredMatches.filter(m => m.mode === 'Entraînement'));
  const tournamentErrorRate = getErrorRate(filteredMatches.filter(m => m.mode === 'Tournoi'));

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
    errorByFormat, trainingErrorRate, tournamentErrorRate,
    maxConsecutiveErrors, totalErrorStreaks,
    tirErrorTypes, totalTirErrorTyped,
    tirErrorResults, totalTirErrorResults,
    tirErrorByTechnique, totalTirErrorByTechnique,
    pointErrorTypes, totalPointErrorTyped,
    mostCommonError, allErrors,
  };
}

// ============================================================
// Helper: make tirStats/pointStats inputs
// ============================================================
const makeTirStats = (overrides: Partial<TirStatsInput> = {}): TirStatsInput => ({
  totalTirs: 10, tirsSuccess: 7, missedRate: 30,
  tirCourtDroite: 0, tirCourtGauche: 0, tirLong: 0, tirBouchon: 0,
  tirAuFer: { total: 6, success: 4 }, tirAuPlomb: { total: 3, success: 2 }, tirEnRafle: { total: 1, success: 1 },
  hasCrossResultData: false, totalCrossResultTracked: 0,
  ...overrides,
});

const makePointStats = (overrides: Partial<PointStatsInput> = {}): PointStatsInput => ({
  totalPoints: 8, pointsSuccess: 5, successRate: 63,
  pointRate: 1, pointCrochete: 1, pointSorti: 1,
  pointRoule: { total: 4, success: 3 }, pointPlombe: { total: 2, success: 1 },
  pointDemiPortee: { total: 1, success: 1 }, pointPortee: { total: 1, success: 0 },
  ...overrides,
});

const mockT = (section: string, key: string) => `${section}.${key}`;

// ============================================================
// Tests
// ============================================================
describe('useErrorStats - Total Errors', () => {
  test('computes total errors from tir + point stats', () => {
    const tir = makeTirStats({ totalTirs: 20, tirsSuccess: 14 });
    const point = makePointStats({ totalPoints: 10, pointsSuccess: 7 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.totalTirErrors).toBe(6);
    expect(result.totalPointErrors).toBe(3);
    expect(result.totalErrors).toBe(9);
  });

  test('zero actions produce zero errors', () => {
    const tir = makeTirStats({ totalTirs: 0, tirsSuccess: 0, missedRate: 0 });
    const point = makePointStats({ totalPoints: 0, pointsSuccess: 0, successRate: 0 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.totalErrors).toBe(0);
    expect(result.totalTirErrors).toBe(0);
    expect(result.totalPointErrors).toBe(0);
  });

  test('tirErrorRate and pointErrorRate are derived correctly', () => {
    const tir = makeTirStats({ missedRate: 25 });
    const point = makePointStats({ successRate: 70 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.tirErrorRate).toBe(25);
    expect(result.pointErrorRate).toBe(30);
  });
});

describe('useErrorStats - Duration-Based Errors', () => {
  test('categorizes matches by duration', () => {
    const matches = [
      makeMatch({ id: 'm1', duration: 15 }),  // short (<30)
      makeMatch({ id: 'm2', duration: 25 }),  // short
      makeMatch({ id: 'm3', duration: 45 }),  // medium (30-60)
      makeMatch({ id: 'm4', duration: 90 }),  // long (>=60)
      makeMatch({ id: 'm5', duration: 120 }), // long
    ];
    const result = computeErrorStats(matches, makeTirStats(), makePointStats(), mockT);
    expect(result.shortMatchCount).toBe(2);
    expect(result.mediumMatchCount).toBe(1);
    expect(result.longMatchCount).toBe(2);
  });

  test('matches without duration are excluded from all duration categories', () => {
    const matches = [
      makeMatch({ id: 'm1', duration: undefined }),
      makeMatch({ id: 'm2', duration: 0 }),
    ];
    const result = computeErrorStats(matches, makeTirStats(), makePointStats(), mockT);
    expect(result.shortMatchCount).toBe(0);
    expect(result.mediumMatchCount).toBe(0);
    expect(result.longMatchCount).toBe(0);
  });

  test('computes error rate per duration category', () => {
    const shortMatch = makeMatch({
      id: 'short', duration: 20,
      playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 10, pointsSuccess: 9, carreaux: 0 } }],
    });
    const longMatch = makeMatch({
      id: 'long', duration: 90,
      playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 3, points: 10, pointsSuccess: 2, carreaux: 0 } }],
    });
    const result = computeErrorStats([shortMatch, longMatch], makeTirStats(), makePointStats(), mockT);
    expect(result.shortMatchErrorRate).toBe(15);  // (20-17)/20 = 15%
    expect(result.longMatchErrorRate).toBe(75);   // (20-5)/20 = 75%
  });
});

describe('useErrorStats - Format Errors', () => {
  test('computes error rate per format', () => {
    const matches = [
      makeMatch({
        id: 'm1', format: 'Doublette',
        playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 8, points: 10, pointsSuccess: 7, carreaux: 0 } }],
      }),
      makeMatch({
        id: 'm2', format: 'Tête-à-tête',
        playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 4, points: 10, pointsSuccess: 3, carreaux: 0 } }],
      }),
    ];
    const result = computeErrorStats(matches, makeTirStats(), makePointStats(), mockT);
    expect(result.errorByFormat['Doublette'].rate).toBe(25);  // (20-15)/20 = 25%
    expect(result.errorByFormat['Tête-à-tête'].rate).toBe(65); // (20-7)/20 = 65%
    expect(result.errorByFormat['Triplette'].rate).toBe(0);
  });

  test('all 3 formats are always present', () => {
    const result = computeErrorStats([], makeTirStats(), makePointStats(), mockT);
    expect(result.errorByFormat).toHaveProperty('Tête-à-tête');
    expect(result.errorByFormat).toHaveProperty('Doublette');
    expect(result.errorByFormat).toHaveProperty('Triplette');
  });
});

describe('useErrorStats - Mode Errors (Training vs Tournament)', () => {
  test('computes training vs tournament error rates', () => {
    const trainingMatch = makeMatch({
      id: 'train', mode: 'Entraînement',
      playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 9, points: 10, pointsSuccess: 8, carreaux: 0 } }],
    });
    const tourneyMatch = makeMatch({
      id: 'tourney', mode: 'Tournoi',
      playerActions: [{ playerId: 'p1', playerName: 'A', team: 'A', actions: { tirs: 10, tirsSuccess: 4, points: 10, pointsSuccess: 3, carreaux: 0 } }],
    });
    const result = computeErrorStats([trainingMatch, tourneyMatch], makeTirStats(), makePointStats(), mockT);
    expect(result.trainingErrorRate).toBe(15);   // (20-17)/20
    expect(result.tournamentErrorRate).toBe(65);  // (20-7)/20
  });

  test('no tournament matches yields 0 tournament error rate', () => {
    const result = computeErrorStats(
      [makeMatch({ mode: 'Entraînement' })],
      makeTirStats(), makePointStats(), mockT,
    );
    expect(result.tournamentErrorRate).toBe(0);
  });
});

describe('useErrorStats - Consecutive Errors', () => {
  test('detects consecutive errors from detailedShots', () => {
    const match = makeMatch({
      playerActions: [{
        playerId: 'p1', playerName: 'A', team: 'A',
        actions: { tirs: 8, tirsSuccess: 4, points: 0, pointsSuccess: 0, carreaux: 0 },
        detailedShots: [
          { actionType: 'tir', success: true },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: true },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: true },
        ],
      } as any],
    });
    const result = computeErrorStats([match], makeTirStats(), makePointStats(), mockT);
    expect(result.maxConsecutiveErrors).toBe(4);
    expect(result.totalErrorStreaks).toBe(1); // one streak of 4 (>=3)
  });

  test('no detailedShots yields zero consecutive errors', () => {
    const result = computeErrorStats([makeMatch()], makeTirStats(), makePointStats(), mockT);
    expect(result.maxConsecutiveErrors).toBe(0);
    expect(result.totalErrorStreaks).toBe(0);
  });

  test('multiple streaks of 3+ are counted', () => {
    const match = makeMatch({
      playerActions: [{
        playerId: 'p1', playerName: 'A', team: 'A',
        actions: { tirs: 10, tirsSuccess: 4, points: 0, pointsSuccess: 0, carreaux: 0 },
        detailedShots: [
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: true },  // ends streak of 3
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: false },
          { actionType: 'tir', success: true },  // ends streak of 4
          { actionType: 'tir', success: false },
        ],
      } as any],
    });
    const result = computeErrorStats([match], makeTirStats(), makePointStats(), mockT);
    expect(result.maxConsecutiveErrors).toBe(4);
    expect(result.totalErrorStreaks).toBe(2); // two streaks (3 and 4)
  });
});

describe('useErrorStats - Tir Error Types', () => {
  test('propagates tir error result counts', () => {
    const tir = makeTirStats({
      tirCourtDroite: 5, tirCourtGauche: 3, tirLong: 2, tirBouchon: 1,
    });
    const result = computeErrorStats([], tir, makePointStats(), mockT);
    expect(result.tirErrorResults.courtDroite).toBe(5);
    expect(result.tirErrorResults.courtGauche).toBe(3);
    expect(result.tirErrorResults.long).toBe(2);
    expect(result.tirErrorResults.tirBouchon).toBe(1);
    expect(result.totalTirErrorResults).toBe(11);
  });

  test('tirErrorTyped prefers result counts over technique counts', () => {
    const tir = makeTirStats({
      tirCourtDroite: 3, tirCourtGauche: 2, tirLong: 1, tirBouchon: 0,
      tirAuFer: { total: 10, success: 5 }, tirAuPlomb: { total: 5, success: 3 }, tirEnRafle: { total: 3, success: 2 },
    });
    const result = computeErrorStats([], tir, makePointStats(), mockT);
    // totalTirErrorResults = 3+2+1+0 = 6 > 0, so uses result counts
    expect(result.totalTirErrorTyped).toBe(6);
  });

  test('tirErrorTyped falls back to technique counts when results are zero', () => {
    const tir = makeTirStats({
      tirCourtDroite: 0, tirCourtGauche: 0, tirLong: 0, tirBouchon: 0,
      tirAuFer: { total: 10, success: 7 }, tirAuPlomb: { total: 5, success: 3 }, tirEnRafle: { total: 3, success: 1 },
    });
    const result = computeErrorStats([], tir, makePointStats(), mockT);
    // totalTirErrorResults = 0, so uses technique: (10-7) + (5-3) + (3-1) = 3+2+2 = 7
    expect(result.totalTirErrorTyped).toBe(7);
    expect(result.tirErrorByTechnique.auFerRate).toBe(3);
    expect(result.tirErrorByTechnique.auPlombRate).toBe(2);
    expect(result.tirErrorByTechnique.enRafleRate).toBe(2);
  });
});

describe('useErrorStats - Point Error Types', () => {
  test('propagates point error type counts', () => {
    const point = makePointStats({
      pointRate: 4, pointCrochete: 3, pointSorti: 2,
      pointRoule: { total: 10, success: 7 },   // 3 errors
      pointPlombe: { total: 5, success: 4 },    // 1 error
      pointDemiPortee: { total: 3, success: 2 }, // 1 error
      pointPortee: { total: 2, success: 1 },     // 1 error
    });
    const result = computeErrorStats([], makeTirStats(), point, mockT);
    expect(result.pointErrorTypes.rate).toBe(4);
    expect(result.pointErrorTypes.crochete).toBe(3);
    expect(result.pointErrorTypes.sorti).toBe(2);
    expect(result.pointErrorTypes.rouleRate).toBe(3);
    expect(result.pointErrorTypes.plombeRate).toBe(1);
    expect(result.pointErrorTypes.demiPorteeRate).toBe(1);
    expect(result.pointErrorTypes.porteeRate).toBe(1);
    expect(result.totalPointErrorTyped).toBe(15); // 4+3+2+3+1+1+1
  });
});

describe('useErrorStats - Most Common Error', () => {
  test('identifies most common error from combined tir+point errors', () => {
    const tir = makeTirStats({ tirCourtDroite: 8, tirCourtGauche: 2, tirLong: 1, tirBouchon: 0 });
    const point = makePointStats({ pointRate: 5, pointCrochete: 3, pointSorti: 0 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.mostCommonError).not.toBeNull();
    expect(result.mostCommonError!.count).toBe(8);
    expect(result.mostCommonError!.type).toBe('stats.errorCourtDroite');
    expect(result.mostCommonError!.category).toBe('tir');
  });

  test('returns null when no typed errors exist', () => {
    const tir = makeTirStats({ tirCourtDroite: 0, tirCourtGauche: 0, tirLong: 0, tirBouchon: 0 });
    const point = makePointStats({ pointRate: 0, pointCrochete: 0, pointSorti: 0 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.mostCommonError).toBeNull();
    expect(result.allErrors).toHaveLength(0);
  });

  test('allErrors are sorted by count descending', () => {
    const tir = makeTirStats({ tirCourtDroite: 3, tirCourtGauche: 7, tirLong: 1, tirBouchon: 5 });
    const point = makePointStats({ pointRate: 4, pointCrochete: 2, pointSorti: 6 });
    const result = computeErrorStats([], tir, point, mockT);
    for (let i = 1; i < result.allErrors.length; i++) {
      expect(result.allErrors[i - 1].count).toBeGreaterThanOrEqual(result.allErrors[i].count);
    }
    expect(result.allErrors[0].count).toBe(7); // courtGauche
  });

  test('point errors with highest count become mostCommonError', () => {
    const tir = makeTirStats({ tirCourtDroite: 2, tirCourtGauche: 1, tirLong: 0, tirBouchon: 0 });
    const point = makePointStats({ pointRate: 0, pointCrochete: 10, pointSorti: 0 });
    const result = computeErrorStats([], tir, point, mockT);
    expect(result.mostCommonError!.count).toBe(10);
    expect(result.mostCommonError!.category).toBe('point');
  });
});

describe('useErrorStats - Output Shape', () => {
  test('output has all required keys', () => {
    const result = computeErrorStats([], makeTirStats(), makePointStats(), mockT);
    const REQUIRED = [
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
    REQUIRED.forEach(key => {
      expect(result).toHaveProperty(key);
    });
  });

  test('matches with no playerActions do not crash', () => {
    const matches = [makeMatch({ playerActions: undefined })];
    expect(() => {
      computeErrorStats(matches, makeTirStats(), makePointStats(), mockT);
    }).not.toThrow();
  });
});
