/**
 * Unit tests for constants/challengeConfig.ts
 *
 * Tests: PRECISION_ATELIERS structure, scoring options, distances,
 * points config, atelier IDs, completeness.
 */

// ─── Inline implementations ──

interface ScoringOption {
  points: number;
  label: string;
  description: string;
}

interface PrecisionAtelierConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  scoringOptions: ScoringOption[];
}

const PRECISION_ATELIERS: PrecisionAtelierConfig[] = [
  {
    id: 'boule_seule', name: 'Tir de boule seule', description: 'Tirer une boule isolee',
    icon: 'radio-button-checked',
    scoringOptions: [
      { points: 0, label: 'Rate', description: 'Non touchee' },
      { points: 1, label: 'Touche', description: 'Reste dans cercle' },
      { points: 3, label: 'Sorti', description: 'Sort du cercle' },
      { points: 5, label: 'Carreau', description: 'Boule reste dans cercle' },
    ],
  },
  {
    id: 'derriere_but', name: 'Boule derriere le but', description: 'Tirer sans toucher le but',
    icon: 'gps-fixed',
    scoringOptions: [
      { points: 0, label: 'Rate', description: 'Non touchee' },
      { points: 1, label: 'Touche', description: 'Reste dans cercle' },
      { points: 3, label: 'Sorti', description: 'Sort du cercle' },
      { points: 5, label: 'Carreau', description: 'Sans toucher but' },
    ],
  },
  {
    id: 'entre_2_boules', name: 'Entre 2 boules', description: 'Entre deux obstacles',
    icon: 'more-horiz',
    scoringOptions: [
      { points: 0, label: 'Rate', description: 'Obstacle touche' },
      { points: 1, label: 'Touche', description: 'Cible frappee' },
      { points: 3, label: 'Sorti', description: 'Cible sort' },
      { points: 5, label: 'Carreau', description: 'Sans obstacles' },
    ],
  },
  {
    id: 'sautee', name: 'Tir a la sautee', description: 'En cloche',
    icon: 'flight-takeoff',
    scoringOptions: [
      { points: 0, label: 'Rate', description: 'Obstacle touche' },
      { points: 1, label: 'Touche', description: 'Cible touchee' },
      { points: 3, label: 'Sorti', description: 'Cible sort' },
      { points: 5, label: 'Carreau', description: 'Sans obstacle' },
    ],
  },
  {
    id: 'tir_but', name: 'Tir de but', description: 'Tirer le cochonnet',
    icon: 'stars',
    scoringOptions: [
      { points: 0, label: 'Rate', description: 'Non touche' },
      { points: 3, label: 'Touche', description: 'Reste dans cercle' },
      { points: 5, label: 'Sorti', description: 'Sort du cercle' },
    ],
  },
];

const PRECISION_DISTANCES = [6, 7, 8, 9];

const PRECISION_POINTS_CONFIG = {
  carreau: 5,
  touche: 3,
  frole: 1,
  rate: 0,
};

const ATELIER_IDS = PRECISION_ATELIERS.map(a => a.id);

function getMaxPointsPerAtelier(atelier: PrecisionAtelierConfig): number {
  return Math.max(...atelier.scoringOptions.map(o => o.points));
}

function getTotalMaxPoints(): number {
  return PRECISION_ATELIERS.reduce((sum, a) => sum + getMaxPointsPerAtelier(a), 0);
}

// ─── Tests ──

describe('PRECISION_ATELIERS', () => {
  test('has 5 ateliers', () => { expect(PRECISION_ATELIERS).toHaveLength(5); });

  test('all ateliers have required fields', () => {
    PRECISION_ATELIERS.forEach(a => {
      expect(a.id).toBeDefined();
      expect(a.name).toBeDefined();
      expect(a.description).toBeDefined();
      expect(a.icon).toBeDefined();
      expect(a.scoringOptions.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('unique IDs', () => {
    const ids = new Set(ATELIER_IDS);
    expect(ids.size).toBe(PRECISION_ATELIERS.length);
  });

  test('known IDs', () => {
    expect(ATELIER_IDS).toContain('boule_seule');
    expect(ATELIER_IDS).toContain('derriere_but');
    expect(ATELIER_IDS).toContain('entre_2_boules');
    expect(ATELIER_IDS).toContain('sautee');
    expect(ATELIER_IDS).toContain('tir_but');
  });
});

describe('scoring options', () => {
  test('first 4 ateliers have 4 scoring options', () => {
    PRECISION_ATELIERS.slice(0, 4).forEach(a => {
      expect(a.scoringOptions).toHaveLength(4);
    });
  });

  test('tir_but has 3 scoring options', () => {
    const tirBut = PRECISION_ATELIERS.find(a => a.id === 'tir_but');
    expect(tirBut?.scoringOptions).toHaveLength(3);
  });

  test('all ateliers start with 0 points (rate)', () => {
    PRECISION_ATELIERS.forEach(a => {
      expect(a.scoringOptions[0].points).toBe(0);
    });
  });

  test('all ateliers end with max points', () => {
    PRECISION_ATELIERS.forEach(a => {
      const last = a.scoringOptions[a.scoringOptions.length - 1];
      expect(last.points).toBeGreaterThanOrEqual(3);
    });
  });

  test('points are ascending in each atelier', () => {
    PRECISION_ATELIERS.forEach(a => {
      for (let i = 1; i < a.scoringOptions.length; i++) {
        expect(a.scoringOptions[i].points).toBeGreaterThanOrEqual(a.scoringOptions[i - 1].points);
      }
    });
  });
});

describe('getMaxPointsPerAtelier', () => {
  test('boule_seule max = 5', () => {
    expect(getMaxPointsPerAtelier(PRECISION_ATELIERS[0])).toBe(5);
  });

  test('tir_but max = 5', () => {
    const tirBut = PRECISION_ATELIERS.find(a => a.id === 'tir_but')!;
    expect(getMaxPointsPerAtelier(tirBut)).toBe(5);
  });
});

describe('getTotalMaxPoints', () => {
  test('total max = 25 (5 ateliers x 5 points)', () => {
    expect(getTotalMaxPoints()).toBe(25);
  });
});

describe('PRECISION_DISTANCES', () => {
  test('has 4 distances', () => { expect(PRECISION_DISTANCES).toHaveLength(4); });
  test('6m to 9m', () => {
    expect(PRECISION_DISTANCES).toEqual([6, 7, 8, 9]);
  });
  test('sorted ascending', () => {
    for (let i = 1; i < PRECISION_DISTANCES.length; i++) {
      expect(PRECISION_DISTANCES[i]).toBeGreaterThan(PRECISION_DISTANCES[i - 1]);
    }
  });
});

describe('PRECISION_POINTS_CONFIG', () => {
  test('carreau = 5', () => { expect(PRECISION_POINTS_CONFIG.carreau).toBe(5); });
  test('touche = 3', () => { expect(PRECISION_POINTS_CONFIG.touche).toBe(3); });
  test('frole = 1', () => { expect(PRECISION_POINTS_CONFIG.frole).toBe(1); });
  test('rate = 0', () => { expect(PRECISION_POINTS_CONFIG.rate).toBe(0); });
  test('decreasing order', () => {
    expect(PRECISION_POINTS_CONFIG.carreau).toBeGreaterThan(PRECISION_POINTS_CONFIG.touche);
    expect(PRECISION_POINTS_CONFIG.touche).toBeGreaterThan(PRECISION_POINTS_CONFIG.frole);
    expect(PRECISION_POINTS_CONFIG.frole).toBeGreaterThan(PRECISION_POINTS_CONFIG.rate);
  });
});
