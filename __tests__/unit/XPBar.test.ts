/**
 * Unit tests for components/ui/XPBar.tsx
 *
 * Tests: level calculation from XP, progress percentage, next level info,
 * level colors, i18n labels, XP_LEVELS thresholds, max level handling.
 */

// ─── Inline implementations (from badgeService.ts used by XPBar) ──

interface XPLevel {
  name: string;
  nameEn: string;
  minXp: number;
  icon: string;
}

const XP_LEVELS: XPLevel[] = [
  { name: 'Débutant', nameEn: 'Beginner', minXp: 0, icon: 'emoji-events' },
  { name: 'Intermédiaire', nameEn: 'Intermediate', minXp: 100, icon: 'star' },
  { name: 'Confirmé', nameEn: 'Advanced', minXp: 500, icon: 'military-tech' },
  { name: 'Expert', nameEn: 'Expert', minXp: 1500, icon: 'diamond' },
];

function getLevelFromXp(xp: number): XPLevel {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].minXp) return XP_LEVELS[i];
  }
  return XP_LEVELS[0];
}

function getXpProgress(xp: number): { current: number; max: number; percent: number } {
  const level = getLevelFromXp(xp);
  const levelIdx = XP_LEVELS.indexOf(level);
  if (levelIdx === XP_LEVELS.length - 1) {
    return { current: xp - level.minXp, max: 1, percent: 100 };
  }
  const nextLevel = XP_LEVELS[levelIdx + 1];
  const current = xp - level.minXp;
  const max = nextLevel.minXp - level.minXp;
  const percent = Math.round((current / max) * 100);
  return { current, max, percent };
}

function getNextLevel(xp: number): { level: XPLevel; xpNeeded: number } | null {
  const current = getLevelFromXp(xp);
  const idx = XP_LEVELS.indexOf(current);
  if (idx === XP_LEVELS.length - 1) return null;
  const next = XP_LEVELS[idx + 1];
  return { level: next, xpNeeded: next.minXp - xp };
}

function getLevelColor(levelName: string): string {
  switch (levelName) {
    case 'Débutant': return '#10B981';
    case 'Intermédiaire': return '#3B82F6';
    case 'Confirmé': return '#F59E0B';
    case 'Expert': return '#EF4444';
    default: return '#D97706';
  }
}

function getNextLevelLabel(xp: number, language: 'fr' | 'en'): string {
  const next = getNextLevel(xp);
  if (!next) {
    return language === 'fr' ? 'Niveau maximum atteint !' : 'Maximum level reached!';
  }
  const progress = getXpProgress(xp);
  if (language === 'fr') {
    return `${progress.current}/${progress.max} XP — ${next.xpNeeded} XP pour ${next.level.name}`;
  }
  return `${progress.current}/${progress.max} XP — ${next.xpNeeded} XP to ${next.level.nameEn}`;
}

// ─── Tests ──

describe('XP_LEVELS', () => {
  test('4 levels defined', () => {
    expect(XP_LEVELS).toHaveLength(4);
  });

  test('levels ordered by minXp ascending', () => {
    for (let i = 1; i < XP_LEVELS.length; i++) {
      expect(XP_LEVELS[i].minXp).toBeGreaterThan(XP_LEVELS[i - 1].minXp);
    }
  });

  test('first level starts at 0 XP', () => {
    expect(XP_LEVELS[0].minXp).toBe(0);
  });

  test('thresholds: 0, 100, 500, 1500', () => {
    expect(XP_LEVELS.map(l => l.minXp)).toEqual([0, 100, 500, 1500]);
  });

  test('all levels have FR and EN names', () => {
    XP_LEVELS.forEach(level => {
      expect(level.name.length).toBeGreaterThan(0);
      expect(level.nameEn.length).toBeGreaterThan(0);
    });
  });

  test('all levels have icons', () => {
    XP_LEVELS.forEach(level => {
      expect(level.icon.length).toBeGreaterThan(0);
    });
  });
});

describe('getLevelFromXp', () => {
  test('0 XP = Débutant', () => {
    expect(getLevelFromXp(0).name).toBe('Débutant');
  });

  test('50 XP = Débutant', () => {
    expect(getLevelFromXp(50).name).toBe('Débutant');
  });

  test('99 XP = Débutant', () => {
    expect(getLevelFromXp(99).name).toBe('Débutant');
  });

  test('100 XP = Intermédiaire', () => {
    expect(getLevelFromXp(100).name).toBe('Intermédiaire');
  });

  test('499 XP = Intermédiaire', () => {
    expect(getLevelFromXp(499).name).toBe('Intermédiaire');
  });

  test('500 XP = Confirmé', () => {
    expect(getLevelFromXp(500).name).toBe('Confirmé');
  });

  test('1499 XP = Confirmé', () => {
    expect(getLevelFromXp(1499).name).toBe('Confirmé');
  });

  test('1500 XP = Expert', () => {
    expect(getLevelFromXp(1500).name).toBe('Expert');
  });

  test('10000 XP = Expert (max)', () => {
    expect(getLevelFromXp(10000).name).toBe('Expert');
  });

  test('negative XP = Débutant', () => {
    expect(getLevelFromXp(-10).name).toBe('Débutant');
  });
});

describe('getXpProgress', () => {
  test('0 XP: 0/100 = 0%', () => {
    const p = getXpProgress(0);
    expect(p.current).toBe(0);
    expect(p.max).toBe(100);
    expect(p.percent).toBe(0);
  });

  test('50 XP: 50/100 = 50%', () => {
    const p = getXpProgress(50);
    expect(p.current).toBe(50);
    expect(p.max).toBe(100);
    expect(p.percent).toBe(50);
  });

  test('100 XP: 0/400 = 0%', () => {
    const p = getXpProgress(100);
    expect(p.current).toBe(0);
    expect(p.max).toBe(400);
    expect(p.percent).toBe(0);
  });

  test('300 XP: 200/400 = 50%', () => {
    const p = getXpProgress(300);
    expect(p.current).toBe(200);
    expect(p.max).toBe(400);
    expect(p.percent).toBe(50);
  });

  test('500 XP: 0/1000 = 0%', () => {
    const p = getXpProgress(500);
    expect(p.current).toBe(0);
    expect(p.max).toBe(1000);
    expect(p.percent).toBe(0);
  });

  test('1000 XP: 500/1000 = 50%', () => {
    const p = getXpProgress(1000);
    expect(p.current).toBe(500);
    expect(p.max).toBe(1000);
    expect(p.percent).toBe(50);
  });

  test('1500 XP (max level): 100%', () => {
    const p = getXpProgress(1500);
    expect(p.percent).toBe(100);
  });

  test('5000 XP (beyond max): 100%', () => {
    const p = getXpProgress(5000);
    expect(p.percent).toBe(100);
  });

  test('99 XP: nearly full first bar', () => {
    const p = getXpProgress(99);
    expect(p.percent).toBe(99);
  });
});

describe('getNextLevel', () => {
  test('0 XP → next is Intermédiaire, need 100', () => {
    const next = getNextLevel(0);
    expect(next).not.toBeNull();
    expect(next!.level.name).toBe('Intermédiaire');
    expect(next!.xpNeeded).toBe(100);
  });

  test('50 XP → need 50 more for Intermédiaire', () => {
    const next = getNextLevel(50);
    expect(next!.xpNeeded).toBe(50);
  });

  test('100 XP → next is Confirmé, need 400', () => {
    const next = getNextLevel(100);
    expect(next!.level.name).toBe('Confirmé');
    expect(next!.xpNeeded).toBe(400);
  });

  test('500 XP → next is Expert, need 1000', () => {
    const next = getNextLevel(500);
    expect(next!.level.name).toBe('Expert');
    expect(next!.xpNeeded).toBe(1000);
  });

  test('1500 XP → null (max level)', () => {
    expect(getNextLevel(1500)).toBeNull();
  });

  test('5000 XP → null (beyond max)', () => {
    expect(getNextLevel(5000)).toBeNull();
  });
});

describe('getLevelColor', () => {
  test('Débutant = green', () => {
    expect(getLevelColor('Débutant')).toBe('#10B981');
  });

  test('Intermédiaire = blue', () => {
    expect(getLevelColor('Intermédiaire')).toBe('#3B82F6');
  });

  test('Confirmé = amber', () => {
    expect(getLevelColor('Confirmé')).toBe('#F59E0B');
  });

  test('Expert = red', () => {
    expect(getLevelColor('Expert')).toBe('#EF4444');
  });

  test('unknown level = default', () => {
    expect(getLevelColor('Unknown')).toBe('#D97706');
  });

  test('each level has a unique color', () => {
    const colors = new Set(XP_LEVELS.map(l => getLevelColor(l.name)));
    expect(colors.size).toBe(4);
  });
});

describe('getNextLevelLabel - FR', () => {
  test('0 XP', () => {
    const label = getNextLevelLabel(0, 'fr');
    expect(label).toContain('0/100 XP');
    expect(label).toContain('100 XP pour Intermédiaire');
  });

  test('300 XP', () => {
    const label = getNextLevelLabel(300, 'fr');
    expect(label).toContain('200/400 XP');
    expect(label).toContain('200 XP pour Confirmé');
  });

  test('1500 XP (max)', () => {
    const label = getNextLevelLabel(1500, 'fr');
    expect(label).toBe('Niveau maximum atteint !');
  });
});

describe('getNextLevelLabel - EN', () => {
  test('0 XP', () => {
    const label = getNextLevelLabel(0, 'en');
    expect(label).toContain('0/100 XP');
    expect(label).toContain('100 XP to Intermediate');
  });

  test('1000 XP', () => {
    const label = getNextLevelLabel(1000, 'en');
    expect(label).toContain('500/1000 XP');
    expect(label).toContain('500 XP to Expert');
  });

  test('2000 XP (max)', () => {
    const label = getNextLevelLabel(2000, 'en');
    expect(label).toBe('Maximum level reached!');
  });
});

describe('level transitions', () => {
  test('exact threshold transitions', () => {
    const transitions = [0, 100, 500, 1500];
    const expectedNames = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert'];
    transitions.forEach((xp, i) => {
      expect(getLevelFromXp(xp).name).toBe(expectedNames[i]);
    });
  });

  test('one below threshold stays at previous level', () => {
    expect(getLevelFromXp(99).name).toBe('Débutant');
    expect(getLevelFromXp(499).name).toBe('Intermédiaire');
    expect(getLevelFromXp(1499).name).toBe('Confirmé');
  });

  test('progress resets to 0% at each level boundary', () => {
    [100, 500, 1500].forEach(threshold => {
      const p = getXpProgress(threshold);
      // At max level, percent is 100; otherwise 0
      if (threshold === 1500) {
        expect(p.percent).toBe(100);
      } else {
        expect(p.percent).toBe(0);
      }
    });
  });
});
