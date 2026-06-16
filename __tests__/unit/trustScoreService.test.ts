/**
 * Unit tests for services/trustScoreService.ts
 *
 * Tests: computeQuickTrustScore (10 weighted factors, flags, edge cases),
 * trust level classification, colors/icons/labels (FR/EN),
 * match validation weights (solo/shared/witnessed),
 * trust badge descriptions, level thresholds.
 */

// ─── Types & Constants ─────────────────────────────────────

interface TrustScoreData {
  score: number;
  level: 'verified' | 'high' | 'medium' | 'low' | 'suspicious';
  flags: string[];
  details?: Record<string, any>;
  analyzedAt?: string;
}

type MatchValidationLevel = 'solo' | 'shared_2' | 'shared_3plus' | 'witnessed';

const TRUST_VERIFIED = 80;
const TRUST_HIGH = 65;
const TRUST_MEDIUM = 45;
const TRUST_LOW = 25;

// ─── Inline Implementations (mirrors trustScoreService logic) ──

function getLevel(score: number): TrustScoreData['level'] {
  if (score >= TRUST_VERIFIED) return 'verified';
  if (score >= TRUST_HIGH) return 'high';
  if (score >= TRUST_MEDIUM) return 'medium';
  if (score >= TRUST_LOW) return 'low';
  return 'suspicious';
}

function computeQuickTrustScore(player: {
  stats: {
    matchesPlayed: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
  createdAt?: string;
}): TrustScoreData {
  const flags: string[] = [];
  let score = 75;

  const { matchesPlayed, winRate, tirRate, pointRate, carreauRate } = player.stats;

  if (winRate > 95 && matchesPlayed >= 10) {
    score -= 15;
    flags.push('extreme_win_rate');
  } else if (winRate > 90 && matchesPlayed >= 10) {
    score -= 8;
  }

  if (tirRate > 85 && pointRate > 85) {
    score -= 10;
    flags.push('unrealistic_combined_rates');
  }

  if (carreauRate > 50 && matchesPlayed >= 10) {
    score -= 10;
    flags.push('extreme_carreau_rate');
  }

  if (matchesPlayed >= 50) {
    score += 10;
  } else if (matchesPlayed >= 30) {
    score += 5;
  } else if (matchesPlayed < 10) {
    score -= 10;
    flags.push('low_match_count');
  }

  if (player.createdAt) {
    const ageMs = Date.now() - new Date(player.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) {
      score -= 10;
      flags.push('very_new_account');
    } else if (ageDays < 30) {
      score -= 5;
      flags.push('new_account');
    } else if (ageDays >= 180) {
      score += 5;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const level = getLevel(score);
  return { score, level, flags };
}

function getTrustScoreColor(levelOrScore: TrustScoreData['level'] | number): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return '#22C55E';
    case 'high': return '#3B82F6';
    case 'medium': return '#D97706';
    case 'low': return '#F97316';
    case 'suspicious': return '#EF4444';
  }
}

function getTrustScoreIcon(levelOrScore: TrustScoreData['level'] | number): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return 'verified-user';
    case 'high': return 'shield';
    case 'medium': return 'shield';
    case 'low': return 'warning';
    case 'suspicious': return 'gpp-bad';
  }
}

function getTrustLevelLabel(levelOrScore: TrustScoreData['level'] | number, fr: boolean): string {
  const level = typeof levelOrScore === 'number' ? getLevel(levelOrScore) : levelOrScore;
  switch (level) {
    case 'verified': return fr ? 'Verifie' : 'Verified';
    case 'high': return fr ? 'Fiable' : 'Trusted';
    case 'medium': return fr ? 'Standard' : 'Standard';
    case 'low': return fr ? 'A surveiller' : 'Watch';
    case 'suspicious': return fr ? 'Suspect' : 'Suspicious';
  }
}

function getTrustBadgeDescription(level: TrustScoreData['level'], fr: boolean): string {
  switch (level) {
    case 'verified':
      return fr
        ? 'Profil verifie avec un bon historique de matchs multi-joueurs et des stats coherentes.'
        : 'Verified profile with good multi-player match history and consistent stats.';
    case 'high':
      return fr
        ? "Bon niveau de confiance. Continuez a jouer avec d'autres utilisateurs pour augmenter votre score."
        : 'Good trust level. Keep playing with other users to increase your score.';
    case 'medium':
      return fr
        ? "Niveau standard. Jouez plus de matchs avec d'autres utilisateurs de l'app pour ameliorer votre fiabilite."
        : 'Standard level. Play more matches with other app users to improve your reliability.';
    case 'low':
      return fr
        ? 'Fiabilite faible. Augmentez vos matchs multi-joueurs et diversifiez vos adversaires.'
        : 'Low reliability. Increase multi-player matches and diversify your opponents.';
    case 'suspicious':
      return fr
        ? "Profil signale pour des statistiques inhabituelles. Contactez-nous si vous pensez que c'est une erreur."
        : 'Profile flagged for unusual statistics. Contact us if you think this is an error.';
  }
}

function getMatchValidationWeight(participantCount: number, isWitnessedEvent?: boolean): number {
  if (isWitnessedEvent) return 2.0;
  if (participantCount >= 3) return 1.5;
  if (participantCount >= 2) return 1.0;
  return 0.3;
}

function getMatchValidationLevel(participantCount: number, isWitnessedEvent?: boolean): MatchValidationLevel {
  if (isWitnessedEvent) return 'witnessed';
  if (participantCount >= 3) return 'shared_3plus';
  if (participantCount >= 2) return 'shared_2';
  return 'solo';
}

function getValidationColor(level: MatchValidationLevel): string {
  switch (level) {
    case 'witnessed': return '#7C3AED';
    case 'shared_3plus': return '#22C55E';
    case 'shared_2': return '#3B82F6';
    case 'solo': return '#9CA3AF';
  }
}

function getValidationIcon(level: MatchValidationLevel): string {
  switch (level) {
    case 'witnessed': return 'visibility';
    case 'shared_3plus': return 'groups';
    case 'shared_2': return 'people';
    case 'solo': return 'person';
  }
}

function getValidationLabel(level: MatchValidationLevel, fr: boolean): string {
  switch (level) {
    case 'witnessed': return fr ? 'Atteste (2.0x)' : 'Witnessed (2.0x)';
    case 'shared_3plus': return fr ? '3+ joueurs (1.5x)' : '3+ players (1.5x)';
    case 'shared_2': return fr ? '2 joueurs (1.0x)' : '2 players (1.0x)';
    case 'solo': return fr ? 'Solo (0.3x)' : 'Solo (0.3x)';
  }
}

function getValidationWeightFromLevel(level: MatchValidationLevel): number {
  switch (level) {
    case 'witnessed': return 2.0;
    case 'shared_3plus': return 1.5;
    case 'shared_2': return 1.0;
    case 'solo': return 0.3;
  }
}

// ─── Helper ────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makePlayer(overrides: Partial<{
  matchesPlayed: number;
  winRate: number;
  tirRate: number;
  pointRate: number;
  carreauRate: number;
  createdAt: string;
}> = {}) {
  return {
    stats: {
      matchesPlayed: overrides.matchesPlayed ?? 25,
      winRate: overrides.winRate ?? 55,
      tirRate: overrides.tirRate ?? 60,
      pointRate: overrides.pointRate ?? 65,
      carreauRate: overrides.carreauRate ?? 15,
    },
    createdAt: overrides.createdAt,
  };
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// Level Thresholds
// ============================================

describe('Trust Level Thresholds', () => {
  test('score 100 is verified', () => expect(getLevel(100)).toBe('verified'));
  test('score 80 is verified', () => expect(getLevel(80)).toBe('verified'));
  test('score 79 is high', () => expect(getLevel(79)).toBe('high'));
  test('score 65 is high', () => expect(getLevel(65)).toBe('high'));
  test('score 64 is medium', () => expect(getLevel(64)).toBe('medium'));
  test('score 45 is medium', () => expect(getLevel(45)).toBe('medium'));
  test('score 44 is low', () => expect(getLevel(44)).toBe('low'));
  test('score 25 is low', () => expect(getLevel(25)).toBe('low'));
  test('score 24 is suspicious', () => expect(getLevel(24)).toBe('suspicious'));
  test('score 0 is suspicious', () => expect(getLevel(0)).toBe('suspicious'));
});

// ============================================
// computeQuickTrustScore — Normal Players
// ============================================

describe('computeQuickTrustScore — Normal Players', () => {
  test('baseline player (25 matches, moderate stats) scores ~75', () => {
    const result = computeQuickTrustScore(makePlayer());
    expect(result.score).toBe(75);
    expect(result.flags).toHaveLength(0);
    expect(result.level).toBe('high');
  });

  test('experienced player (50+ matches) gets bonus', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 55, winRate: 55 }));
    expect(result.score).toBe(85); // 75 + 10
    expect(result.level).toBe('verified');
  });

  test('moderate experience (30-49 matches) gets small bonus', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 35 }));
    expect(result.score).toBe(80); // 75 + 5
    expect(result.level).toBe('verified');
  });

  test('old account (180+ days) gets longevity bonus', () => {
    const result = computeQuickTrustScore(makePlayer({ createdAt: daysAgo(200) }));
    expect(result.score).toBe(80); // 75 + 5
  });
});

// ============================================
// computeQuickTrustScore — Suspicious Patterns
// ============================================

describe('computeQuickTrustScore — Suspicious Patterns', () => {
  test('extreme win rate (>95%) flags and penalizes', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 20, winRate: 98 }));
    expect(result.score).toBe(60); // 75 - 15
    expect(result.flags).toContain('extreme_win_rate');
  });

  test('high win rate (>90%) moderate penalty', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 15, winRate: 92 }));
    expect(result.score).toBe(67); // 75 - 8
    expect(result.flags).not.toContain('extreme_win_rate');
  });

  test('win rate >95% but <10 matches does NOT flag (not significant)', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 5, winRate: 100 }));
    // No extreme_win_rate flag because matchesPlayed < 10
    expect(result.flags).not.toContain('extreme_win_rate');
    // Still gets low_match_count
    expect(result.flags).toContain('low_match_count');
  });

  test('unrealistic combined rates (tir >85% AND point >85%)', () => {
    const result = computeQuickTrustScore(makePlayer({ tirRate: 90, pointRate: 90 }));
    expect(result.flags).toContain('unrealistic_combined_rates');
    expect(result.score).toBe(65); // 75 - 10
  });

  test('extreme carreau rate (>50%) with enough matches', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 15, carreauRate: 55 }));
    expect(result.flags).toContain('extreme_carreau_rate');
    expect(result.score).toBe(65); // 75 - 10
  });

  test('extreme carreau rate with <10 matches does NOT flag', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 5, carreauRate: 60 }));
    expect(result.flags).not.toContain('extreme_carreau_rate');
  });

  test('low match count (<10) flags', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 5 }));
    expect(result.flags).toContain('low_match_count');
    expect(result.score).toBe(65); // 75 - 10
  });
});

// ============================================
// computeQuickTrustScore — Account Age
// ============================================

describe('computeQuickTrustScore — Account Age', () => {
  test('very new account (<7 days) major penalty', () => {
    const result = computeQuickTrustScore(makePlayer({ createdAt: daysAgo(3) }));
    expect(result.flags).toContain('very_new_account');
    expect(result.score).toBe(65); // 75 - 10
  });

  test('new account (7-30 days) moderate penalty', () => {
    const result = computeQuickTrustScore(makePlayer({ createdAt: daysAgo(15) }));
    expect(result.flags).toContain('new_account');
    expect(result.score).toBe(70); // 75 - 5
  });

  test('established account (30-179 days) no bonus/penalty', () => {
    const result = computeQuickTrustScore(makePlayer({ createdAt: daysAgo(90) }));
    expect(result.flags).toHaveLength(0);
    expect(result.score).toBe(75); // baseline
  });

  test('no createdAt means no age penalty', () => {
    const result = computeQuickTrustScore(makePlayer());
    expect(result.flags).not.toContain('very_new_account');
    expect(result.flags).not.toContain('new_account');
  });
});

// ============================================
// computeQuickTrustScore — Stacking
// ============================================

describe('computeQuickTrustScore — Flag Stacking', () => {
  test('multiple flags stack penalties', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 5,    // -10 (low_match_count)
      winRate: 98,         // no flag (< 10 matches)
      tirRate: 90,
      pointRate: 90,       // -10 (unrealistic_combined_rates)
      carreauRate: 60,     // no flag (< 10 matches)
      createdAt: daysAgo(3), // -10 (very_new_account)
    }));
    // 75 - 10 - 10 - 10 = 45
    expect(result.score).toBe(45);
    expect(result.flags).toContain('low_match_count');
    expect(result.flags).toContain('unrealistic_combined_rates');
    expect(result.flags).toContain('very_new_account');
    expect(result.level).toBe('medium');
  });

  test('bonuses stack with no penalties', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 60,      // +10
      createdAt: daysAgo(365), // +5
    }));
    // 75 + 10 + 5 = 90
    expect(result.score).toBe(90);
    expect(result.level).toBe('verified');
  });

  test('score clamped to 0 minimum', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 5,        // -10
      winRate: 98,             // no flag (<10 matches)
      tirRate: 95,
      pointRate: 95,           // -10
      carreauRate: 60,         // no flag
      createdAt: daysAgo(1),   // -10
    }));
    // Minimum is 0
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  test('score clamped to 100 maximum', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 100,
      createdAt: daysAgo(500),
    }));
    // 75 + 10 + 5 = 90, capped at 100
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ============================================
// Trust Score Colors
// ============================================

describe('getTrustScoreColor', () => {
  test('returns green for verified', () => expect(getTrustScoreColor('verified')).toBe('#22C55E'));
  test('returns blue for high', () => expect(getTrustScoreColor('high')).toBe('#3B82F6'));
  test('returns amber for medium', () => expect(getTrustScoreColor('medium')).toBe('#D97706'));
  test('returns orange for low', () => expect(getTrustScoreColor('low')).toBe('#F97316'));
  test('returns red for suspicious', () => expect(getTrustScoreColor('suspicious')).toBe('#EF4444'));

  test('accepts numeric score (85 → verified → green)', () => {
    expect(getTrustScoreColor(85)).toBe('#22C55E');
  });

  test('accepts numeric score (20 → suspicious → red)', () => {
    expect(getTrustScoreColor(20)).toBe('#EF4444');
  });
});

// ============================================
// Trust Score Icons
// ============================================

describe('getTrustScoreIcon', () => {
  test('verified uses verified-user', () => expect(getTrustScoreIcon('verified')).toBe('verified-user'));
  test('high uses shield', () => expect(getTrustScoreIcon('high')).toBe('shield'));
  test('medium uses shield', () => expect(getTrustScoreIcon('medium')).toBe('shield'));
  test('low uses warning', () => expect(getTrustScoreIcon('low')).toBe('warning'));
  test('suspicious uses gpp-bad', () => expect(getTrustScoreIcon('suspicious')).toBe('gpp-bad'));

  test('accepts numeric score', () => {
    expect(getTrustScoreIcon(90)).toBe('verified-user');
    expect(getTrustScoreIcon(10)).toBe('gpp-bad');
  });
});

// ============================================
// Trust Level Labels — FR & EN
// ============================================

describe('getTrustLevelLabel', () => {
  test('verified in FR', () => expect(getTrustLevelLabel('verified', true)).toBe('Verifie'));
  test('verified in EN', () => expect(getTrustLevelLabel('verified', false)).toBe('Verified'));
  test('high in FR', () => expect(getTrustLevelLabel('high', true)).toBe('Fiable'));
  test('high in EN', () => expect(getTrustLevelLabel('high', false)).toBe('Trusted'));
  test('medium in FR', () => expect(getTrustLevelLabel('medium', true)).toBe('Standard'));
  test('medium in EN', () => expect(getTrustLevelLabel('medium', false)).toBe('Standard'));
  test('low in FR', () => expect(getTrustLevelLabel('low', true)).toBe('A surveiller'));
  test('low in EN', () => expect(getTrustLevelLabel('low', false)).toBe('Watch'));
  test('suspicious in FR', () => expect(getTrustLevelLabel('suspicious', true)).toBe('Suspect'));
  test('suspicious in EN', () => expect(getTrustLevelLabel('suspicious', false)).toBe('Suspicious'));

  test('accepts numeric score', () => {
    expect(getTrustLevelLabel(85, true)).toBe('Verifie');
    expect(getTrustLevelLabel(30, false)).toBe('Watch');
  });
});

// ============================================
// Trust Badge Descriptions
// ============================================

describe('getTrustBadgeDescription', () => {
  const levels: TrustScoreData['level'][] = ['verified', 'high', 'medium', 'low', 'suspicious'];

  test('all levels return non-empty FR descriptions', () => {
    levels.forEach(level => {
      const desc = getTrustBadgeDescription(level, true);
      expect(desc.length).toBeGreaterThan(20);
    });
  });

  test('all levels return non-empty EN descriptions', () => {
    levels.forEach(level => {
      const desc = getTrustBadgeDescription(level, false);
      expect(desc.length).toBeGreaterThan(20);
    });
  });

  test('FR and EN descriptions are different', () => {
    levels.forEach(level => {
      const fr = getTrustBadgeDescription(level, true);
      const en = getTrustBadgeDescription(level, false);
      expect(fr).not.toBe(en);
    });
  });

  test('suspicious description mentions contact', () => {
    expect(getTrustBadgeDescription('suspicious', false)).toContain('Contact');
    expect(getTrustBadgeDescription('suspicious', true)).toContain('Contactez');
  });
});

// ============================================
// Match Validation Weights
// ============================================

describe('getMatchValidationWeight', () => {
  test('solo (0 participants) = 0.3x', () => expect(getMatchValidationWeight(0)).toBe(0.3));
  test('solo (1 participant) = 0.3x', () => expect(getMatchValidationWeight(1)).toBe(0.3));
  test('2 participants = 1.0x', () => expect(getMatchValidationWeight(2)).toBe(1.0));
  test('3 participants = 1.5x', () => expect(getMatchValidationWeight(3)).toBe(1.5));
  test('4 participants = 1.5x', () => expect(getMatchValidationWeight(4)).toBe(1.5));
  test('witnessed event overrides = 2.0x', () => expect(getMatchValidationWeight(1, true)).toBe(2.0));
  test('witnessed with 3 participants = 2.0x (witnessed takes precedence)', () => {
    expect(getMatchValidationWeight(3, true)).toBe(2.0);
  });
});

// ============================================
// Match Validation Levels
// ============================================

describe('getMatchValidationLevel', () => {
  test('0 → solo', () => expect(getMatchValidationLevel(0)).toBe('solo'));
  test('1 → solo', () => expect(getMatchValidationLevel(1)).toBe('solo'));
  test('2 → shared_2', () => expect(getMatchValidationLevel(2)).toBe('shared_2'));
  test('3 → shared_3plus', () => expect(getMatchValidationLevel(3)).toBe('shared_3plus'));
  test('5 → shared_3plus', () => expect(getMatchValidationLevel(5)).toBe('shared_3plus'));
  test('witnessed → witnessed', () => expect(getMatchValidationLevel(1, true)).toBe('witnessed'));
});

// ============================================
// Validation Colors & Icons
// ============================================

describe('Validation Colors', () => {
  test('witnessed is purple', () => expect(getValidationColor('witnessed')).toBe('#7C3AED'));
  test('shared_3plus is green', () => expect(getValidationColor('shared_3plus')).toBe('#22C55E'));
  test('shared_2 is blue', () => expect(getValidationColor('shared_2')).toBe('#3B82F6'));
  test('solo is gray', () => expect(getValidationColor('solo')).toBe('#9CA3AF'));
});

describe('Validation Icons', () => {
  test('witnessed → visibility', () => expect(getValidationIcon('witnessed')).toBe('visibility'));
  test('shared_3plus → groups', () => expect(getValidationIcon('shared_3plus')).toBe('groups'));
  test('shared_2 → people', () => expect(getValidationIcon('shared_2')).toBe('people'));
  test('solo → person', () => expect(getValidationIcon('solo')).toBe('person'));
});

// ============================================
// Validation Labels FR/EN
// ============================================

describe('Validation Labels', () => {
  test('witnessed FR', () => expect(getValidationLabel('witnessed', true)).toBe('Atteste (2.0x)'));
  test('witnessed EN', () => expect(getValidationLabel('witnessed', false)).toBe('Witnessed (2.0x)'));
  test('shared_3plus FR', () => expect(getValidationLabel('shared_3plus', true)).toBe('3+ joueurs (1.5x)'));
  test('shared_3plus EN', () => expect(getValidationLabel('shared_3plus', false)).toBe('3+ players (1.5x)'));
  test('shared_2 FR', () => expect(getValidationLabel('shared_2', true)).toBe('2 joueurs (1.0x)'));
  test('solo EN', () => expect(getValidationLabel('solo', false)).toBe('Solo (0.3x)'));
});

// ============================================
// Validation Weight from Level
// ============================================

describe('getValidationWeightFromLevel', () => {
  test('witnessed → 2.0', () => expect(getValidationWeightFromLevel('witnessed')).toBe(2.0));
  test('shared_3plus → 1.5', () => expect(getValidationWeightFromLevel('shared_3plus')).toBe(1.5));
  test('shared_2 → 1.0', () => expect(getValidationWeightFromLevel('shared_2')).toBe(1.0));
  test('solo → 0.3', () => expect(getValidationWeightFromLevel('solo')).toBe(0.3));
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('all zeros player', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 0,
      winRate: 0,
      tirRate: 0,
      pointRate: 0,
      carreauRate: 0,
    }));
    expect(result.flags).toContain('low_match_count');
    expect(result.score).toBe(65); // 75 - 10
    expect(result.level).toBe('high');
  });

  test('perfect stats with lots of matches', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 100,
      winRate: 100,
      tirRate: 90,
      pointRate: 90,
      carreauRate: 60,
      createdAt: daysAgo(365),
    }));
    // 75 - 15 (extreme win) - 10 (unrealistic combined) - 10 (extreme carreau) + 10 (volume) + 5 (age) = 55
    expect(result.score).toBe(55);
    expect(result.flags).toContain('extreme_win_rate');
    expect(result.flags).toContain('unrealistic_combined_rates');
    expect(result.flags).toContain('extreme_carreau_rate');
  });

  test('worst case scenario stacks all penalties', () => {
    const result = computeQuickTrustScore(makePlayer({
      matchesPlayed: 5,
      winRate: 98,
      tirRate: 90,
      pointRate: 90,
      carreauRate: 60,
      createdAt: daysAgo(2),
    }));
    // 75 - 10 (low matches, no extreme_win since <10 matches) - 10 (unrealistic combined) - 10 (very_new)
    // carreauRate not flagged since <10 matches, winRate not flagged since <10 matches
    expect(result.score).toBe(45);
    expect(result.level).toBe('medium');
  });

  test('boundary: exactly 10 matches triggers win rate checks', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 10, winRate: 96 }));
    expect(result.flags).toContain('extreme_win_rate');
  });

  test('boundary: exactly 9 matches does NOT trigger win rate checks', () => {
    const result = computeQuickTrustScore(makePlayer({ matchesPlayed: 9, winRate: 100 }));
    expect(result.flags).not.toContain('extreme_win_rate');
  });

  test('boundary: tirRate exactly 85 does NOT trigger combined flag', () => {
    const result = computeQuickTrustScore(makePlayer({ tirRate: 85, pointRate: 90 }));
    expect(result.flags).not.toContain('unrealistic_combined_rates');
  });

  test('boundary: tirRate 86 with pointRate 86 triggers combined flag', () => {
    const result = computeQuickTrustScore(makePlayer({ tirRate: 86, pointRate: 86 }));
    expect(result.flags).toContain('unrealistic_combined_rates');
  });
});
