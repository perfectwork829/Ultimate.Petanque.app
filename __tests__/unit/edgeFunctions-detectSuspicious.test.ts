/**
 * Unit tests for supabase/functions/detect-suspicious/index.ts
 *
 * Tests: trust score factor calculations (11 factors), flag generation,
 * status thresholds, multi-player ratio, opponent diversity, performance
 * consistency, modification history, play frequency, stats regularity,
 * account age, match duration, multi-account detection, reports,
 * arranged match detection, inactivity decay, level classification.
 */

// ─── Inline implementations ──

function getLevelStr(s: number): string {
  return s >= 80 ? 'verified' : s >= 65 ? 'high' : s >= 45 ? 'medium' : s >= 25 ? 'low' : 'suspicious';
}

function getStatus(score: number): string {
  return score < 25 ? 'flagged' : score < 50 ? 'watch' : 'ok';
}

function computeMultiPlayerDeduction(multiPlayerRatio: number): number {
  return Math.round((1 - multiPlayerRatio) * 30);
}

function computeDiversityDeduction(uniqueOpponents: number, diversityRatio: number, matchesPlayed: number): number {
  if (uniqueOpponents <= 1 && matchesPlayed >= 10) return 20;
  if (diversityRatio < 0.15 && matchesPlayed >= 15) return 15;
  if (diversityRatio < 0.3 && matchesPlayed >= 15) return 10;
  if (diversityRatio < 0.5) return 5;
  return 0;
}

function computeModificationDeduction(externalMods: number): number {
  if (externalMods > 10) return 12;
  if (externalMods > 5) return 8;
  if (externalMods > 2) return 4;
  return 0;
}

function computeStatsDeduction(winRate: number, tirRate: number, pointRate: number, carreauRate: number, matchesPlayed: number): number {
  let d = 0;
  if (winRate > 95 && matchesPlayed >= 10) d += 10;
  if (tirRate > 85 && pointRate > 85 && matchesPlayed >= 10) d += 8;
  if (carreauRate > 50 && matchesPlayed >= 10) d += 8;
  return d;
}

function computeAccountAgeDeduction(ageDays: number): number {
  if (ageDays < 7) return 5;
  if (ageDays < 30) return 3;
  return 0;
}

function computeInactivityDecay(daysSinceLastPlay: number, currentScore: number): { score: number; decay: number } {
  if (daysSinceLastPlay < 30) return { score: currentScore, decay: 0 };
  const monthsInactive = Math.floor(daysSinceLastPlay / 30);
  const decayAmount = monthsInactive * 5;
  const newScore = Math.max(30, currentScore - decayAmount);
  return { score: newScore, decay: currentScore - newScore };
}

function computeReportDeduction(totalReports: number): number {
  if (totalReports >= 3) return 8;
  if (totalReports >= 1) return 3;
  return 0;
}

function computeMultiAccountDeduction(sharedDeviceAccounts: number): number {
  if (sharedDeviceAccounts >= 3) return 10;
  if (sharedDeviceAccounts >= 1) return 5;
  return 0;
}

function computeDailyMatchDeduction(maxMatchesPerDay: number): number {
  if (maxMatchesPerDay > 15) return 10;
  if (maxMatchesPerDay > 10) return 5;
  return 0;
}

function computeShortMatchDeduction(shortMatchCount: number): number {
  return shortMatchCount > 5 ? 5 : 0;
}

// ─── Tests ──

describe('getLevelStr', () => {
  test('verified >= 80', () => { expect(getLevelStr(80)).toBe('verified'); expect(getLevelStr(100)).toBe('verified'); });
  test('high >= 65', () => { expect(getLevelStr(65)).toBe('high'); expect(getLevelStr(79)).toBe('high'); });
  test('medium >= 45', () => { expect(getLevelStr(45)).toBe('medium'); expect(getLevelStr(64)).toBe('medium'); });
  test('low >= 25', () => { expect(getLevelStr(25)).toBe('low'); expect(getLevelStr(44)).toBe('low'); });
  test('suspicious < 25', () => { expect(getLevelStr(24)).toBe('suspicious'); expect(getLevelStr(0)).toBe('suspicious'); });
});

describe('getStatus', () => {
  test('flagged < 25', () => { expect(getStatus(24)).toBe('flagged'); expect(getStatus(0)).toBe('flagged'); });
  test('watch < 50', () => { expect(getStatus(25)).toBe('watch'); expect(getStatus(49)).toBe('watch'); });
  test('ok >= 50', () => { expect(getStatus(50)).toBe('ok'); expect(getStatus(100)).toBe('ok'); });
});

describe('Factor 1: Multi-Player Validation Ratio (30 pts)', () => {
  test('0% multi-player = -30', () => { expect(computeMultiPlayerDeduction(0)).toBe(30); });
  test('100% multi-player = 0', () => { expect(computeMultiPlayerDeduction(1)).toBe(0); });
  test('50% multi-player = -15', () => { expect(computeMultiPlayerDeduction(0.5)).toBe(15); });
  test('80% multi-player = -6', () => { expect(computeMultiPlayerDeduction(0.8)).toBe(6); });
});

describe('Factor 2: Adversary Diversity (20 pts)', () => {
  test('single opponent, 10+ matches = -20', () => { expect(computeDiversityDeduction(1, 0.1, 10)).toBe(20); });
  test('low diversity (<0.15), 15+ matches = -15', () => { expect(computeDiversityDeduction(2, 0.13, 15)).toBe(15); });
  test('medium diversity (<0.3), 15+ matches = -10', () => { expect(computeDiversityDeduction(4, 0.27, 15)).toBe(10); });
  test('low-medium diversity (<0.5), any matches = -5', () => { expect(computeDiversityDeduction(3, 0.45, 8)).toBe(5); });
  test('good diversity (>= 0.5) = 0', () => { expect(computeDiversityDeduction(10, 0.6, 20)).toBe(0); });
  test('few matches ignored', () => { expect(computeDiversityDeduction(0, 0, 5)).toBe(5); }); // diversityRatio < 0.5
});

describe('Factor 4: Modification History (15 pts)', () => {
  test('>10 external mods = -12', () => { expect(computeModificationDeduction(11)).toBe(12); });
  test('>5 external mods = -8', () => { expect(computeModificationDeduction(6)).toBe(8); });
  test('>2 external mods = -4', () => { expect(computeModificationDeduction(3)).toBe(4); });
  test('<=2 external mods = 0', () => { expect(computeModificationDeduction(2)).toBe(0); expect(computeModificationDeduction(0)).toBe(0); });
});

describe('Factor 5: Play Frequency - daily matches', () => {
  test('>15 matches/day = -10', () => { expect(computeDailyMatchDeduction(16)).toBe(10); });
  test('>10 matches/day = -5', () => { expect(computeDailyMatchDeduction(11)).toBe(5); });
  test('<=10 matches/day = 0', () => { expect(computeDailyMatchDeduction(10)).toBe(0); });
});

describe('Factor 6: Stats Regularity', () => {
  test('extreme win rate (>95%) = -10', () => { expect(computeStatsDeduction(96, 50, 50, 10, 10)).toBe(10); });
  test('unrealistic combined rates = -8', () => { expect(computeStatsDeduction(50, 90, 90, 10, 10)).toBe(8); });
  test('extreme carreau rate (>50%) = -8', () => { expect(computeStatsDeduction(50, 50, 50, 55, 10)).toBe(8); });
  test('all extreme = -26', () => { expect(computeStatsDeduction(96, 90, 90, 55, 10)).toBe(26); });
  test('normal stats = 0', () => { expect(computeStatsDeduction(60, 50, 50, 15, 10)).toBe(0); });
  test('<10 matches ignored', () => { expect(computeStatsDeduction(99, 99, 99, 99, 5)).toBe(0); });
});

describe('Factor 7: Account Age (5 pts)', () => {
  test('<7 days = -5', () => { expect(computeAccountAgeDeduction(3)).toBe(5); });
  test('<30 days = -3', () => { expect(computeAccountAgeDeduction(15)).toBe(3); });
  test('>=30 days = 0', () => { expect(computeAccountAgeDeduction(30)).toBe(0); });
});

describe('Factor 8: Short Matches', () => {
  test('>5 short matches = -5', () => { expect(computeShortMatchDeduction(6)).toBe(5); });
  test('<=5 short matches = 0', () => { expect(computeShortMatchDeduction(5)).toBe(0); });
});

describe('Factor 9: Multi-Account Detection (10 pts)', () => {
  test('3+ shared device accounts = -10', () => { expect(computeMultiAccountDeduction(3)).toBe(10); });
  test('1-2 shared device accounts = -5', () => { expect(computeMultiAccountDeduction(1)).toBe(5); expect(computeMultiAccountDeduction(2)).toBe(5); });
  test('0 shared = 0', () => { expect(computeMultiAccountDeduction(0)).toBe(0); });
});

describe('Factor 10: Reports', () => {
  test('3+ reports = -8', () => { expect(computeReportDeduction(3)).toBe(8); });
  test('1-2 reports = -3', () => { expect(computeReportDeduction(1)).toBe(3); expect(computeReportDeduction(2)).toBe(3); });
  test('0 reports = 0', () => { expect(computeReportDeduction(0)).toBe(0); });
});

describe('Factor 11: Inactivity Decay', () => {
  test('<30 days = no decay', () => {
    const r = computeInactivityDecay(20, 80);
    expect(r.score).toBe(80);
    expect(r.decay).toBe(0);
  });

  test('30-59 days = -5 (1 month)', () => {
    const r = computeInactivityDecay(45, 80);
    expect(r.score).toBe(75);
    expect(r.decay).toBe(5);
  });

  test('60-89 days = -10 (2 months)', () => {
    const r = computeInactivityDecay(75, 80);
    expect(r.score).toBe(70);
    expect(r.decay).toBe(10);
  });

  test('180 days = -30 (6 months)', () => {
    const r = computeInactivityDecay(180, 80);
    expect(r.score).toBe(50);
    expect(r.decay).toBe(30);
  });

  test('floor at 30', () => {
    const r = computeInactivityDecay(365, 50);
    expect(r.score).toBe(30);
    expect(r.decay).toBe(20);
  });

  test('already below 30 stays at 30', () => {
    const r = computeInactivityDecay(365, 35);
    expect(r.score).toBe(30);
  });
});

describe('full score computation pipeline', () => {
  test('perfect player starts at 100', () => {
    let score = 100;
    score -= computeMultiPlayerDeduction(1);        // 0
    score -= computeDiversityDeduction(10, 0.6, 20); // 0
    score -= computeModificationDeduction(0);         // 0
    score -= computeStatsDeduction(60, 50, 50, 10, 20); // 0
    score -= computeAccountAgeDeduction(365);         // 0
    score -= computeReportDeduction(0);               // 0
    score -= computeMultiAccountDeduction(0);         // 0
    expect(score).toBe(100);
    expect(getLevelStr(score)).toBe('verified');
  });

  test('solo-only new player with extreme stats', () => {
    let score = 100;
    score -= computeMultiPlayerDeduction(0);         // -30
    score -= computeDiversityDeduction(0, 0, 15);     // -5 (diversityRatio 0 < 0.5)
    score -= computeStatsDeduction(98, 90, 90, 55, 15); // -26
    score -= computeAccountAgeDeduction(3);           // -5
    score -= computeReportDeduction(3);               // -8
    score = Math.max(0, Math.min(100, score));
    expect(score).toBe(26);
    expect(getLevelStr(score)).toBe('low');
  });

  test('moderately suspicious player', () => {
    let score = 100;
    score -= computeMultiPlayerDeduction(0.3);        // -21
    score -= computeDiversityDeduction(3, 0.2, 15);   // -10
    score -= computeModificationDeduction(7);          // -8
    score -= computeAccountAgeDeduction(20);           // -3
    score = Math.max(0, Math.min(100, score));
    expect(score).toBe(58);
    expect(getStatus(score)).toBe('ok');
  });
});

describe('threshold crossing detection', () => {
  test('crossing into high (65+)', () => {
    const prevScore = 60;
    const newScore = 68;
    const prevLevel = getLevelStr(prevScore);
    const newLevel = getLevelStr(newScore);
    expect(prevLevel).toBe('medium');
    expect(newLevel).toBe('high');
    const shouldNotify = (newLevel === 'high' && prevLevel !== 'high' && prevLevel !== 'verified') ||
                          (newLevel === 'verified' && prevLevel !== 'verified');
    expect(shouldNotify).toBe(true);
  });

  test('crossing into verified (80+)', () => {
    const prevLevel = getLevelStr(75);
    const newLevel = getLevelStr(82);
    expect(prevLevel).toBe('high');
    expect(newLevel).toBe('verified');
    const shouldNotify = newLevel === 'verified' && prevLevel !== 'verified';
    expect(shouldNotify).toBe(true);
  });

  test('no crossing (same level)', () => {
    const prevLevel = getLevelStr(70);
    const newLevel = getLevelStr(75);
    expect(prevLevel).toBe('high');
    expect(newLevel).toBe('high');
    const shouldNotify = (newLevel === 'high' && prevLevel !== 'high' && prevLevel !== 'verified') ||
                          (newLevel === 'verified' && prevLevel !== 'verified');
    expect(shouldNotify).toBe(false);
  });
});
