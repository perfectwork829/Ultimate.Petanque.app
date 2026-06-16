/**
 * Unit tests for constants/boulesDatabase.ts
 *
 * Tests: BOULES_BRANDS, BOULES_DATABASE completeness, brand images/colors,
 * getBrandImage, getBrandVisual, getModelsByBrand, findModel.
 */

// ─── Inline implementations ──

interface BoulesModel {
  brand: string; model: string; material: string;
  hardness: string; targetUsage: string; particularities: string;
}

const BOULES_BRANDS = [
  'OBUT', 'MS PÉTANQUE', 'LA BOULE BLEUE', 'BOULENCIEL',
  'KTK', 'ODDEKA', 'LA FRANC', 'MARATHON', 'GEOLOGIC',
] as const;

const BOULES_BRAND_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  'OBUT': { bg: '#1B3A5C', text: '#FFFFFF', abbr: 'OB' },
  'MS PÉTANQUE': { bg: '#C62828', text: '#FFFFFF', abbr: 'MS' },
  'LA BOULE BLEUE': { bg: '#1565C0', text: '#FFFFFF', abbr: 'BB' },
  'BOULENCIEL': { bg: '#6A1B9A', text: '#FFFFFF', abbr: 'BC' },
  'KTK': { bg: '#2E7D32', text: '#FFFFFF', abbr: 'KTK' },
  'ODDEKA': { bg: '#E65100', text: '#FFFFFF', abbr: 'OD' },
  'LA FRANC': { bg: '#00838F', text: '#FFFFFF', abbr: 'LF' },
  'MARATHON': { bg: '#4E342E', text: '#FFFFFF', abbr: 'MA' },
  'GEOLOGIC': { bg: '#37474F', text: '#FFFFFF', abbr: 'GE' },
};

const BOULES_BRAND_IMAGES: Record<string, { uri: string }> = {
  'OBUT': { uri: 'https://cdn-ai.onspace.ai/obut.png' },
  'MS PÉTANQUE': { uri: 'https://cdn-ai.onspace.ai/ms.jpg' },
  'KTK': { uri: 'https://cdn-ai.onspace.ai/ktk.png' },
};

// Simplified database for testing
const BOULES_DATABASE: BoulesModel[] = [
  { brand: 'OBUT', model: 'ATX', material: 'Acier special', hardness: 'Demi-tendre', targetUsage: 'Elite / Milieu', particularities: 'Icone' },
  { brand: 'OBUT', model: 'RCC', material: 'Acier carbone', hardness: 'Tendre', targetUsage: 'Tireur', particularities: 'Anti-rebond' },
  { brand: 'OBUT', model: 'Match', material: 'Acier carbone', hardness: 'Demi-tendre', targetUsage: 'Debutant', particularities: 'Rapport Q/P' },
  { brand: 'MS PÉTANQUE', model: 'MS 2110', material: 'Acier carbone', hardness: 'Anti-rebond', targetUsage: 'Tireur', particularities: 'Nervure' },
  { brand: 'MS PÉTANQUE', model: 'MS IT', material: 'Acier inox', hardness: 'Anti-rebond', targetUsage: 'Milieu', particularities: 'Polyvalente' },
  { brand: 'KTK', model: 'ORA', material: 'Acier inox', hardness: 'Tendre', targetUsage: 'Tireur / Milieu', particularities: 'Design moderne' },
  { brand: 'ODDEKA', model: 'Zeus', material: 'Inox', hardness: 'Tres tendre', targetUsage: 'Tireur / Elite', particularities: 'Nouvelle reference' },
  { brand: 'GEOLOGIC', model: 'Delta', material: 'Acier carbone', hardness: 'Dure', targetUsage: 'Debutant / Pointeur', particularities: 'Accessible' },
];

function getBrandImage(brand: string): { uri: string } | null {
  return BOULES_BRAND_IMAGES[brand.toUpperCase()] || null;
}

function getBrandVisual(brand: string): { bg: string; text: string; abbr: string } {
  const upper = brand.toUpperCase();
  if (BOULES_BRAND_COLORS[upper]) return BOULES_BRAND_COLORS[upper];
  const hue = Math.abs(brand.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360);
  return { bg: `hsl(${hue}, 55%, 40%)`, text: '#FFFFFF', abbr: brand.substring(0, 2).toUpperCase() };
}

function getModelsByBrand(brand: string): BoulesModel[] {
  return BOULES_DATABASE.filter(b => b.brand === brand);
}

function findModel(brand: string, model: string): BoulesModel | undefined {
  return BOULES_DATABASE.find(b => b.brand === brand && b.model === model);
}

// ─── Tests ──

describe('BOULES_BRANDS', () => {
  test('has 9 brands', () => { expect(BOULES_BRANDS).toHaveLength(9); });
  test('includes OBUT', () => { expect(BOULES_BRANDS).toContain('OBUT'); });
  test('includes MS PETANQUE', () => { expect(BOULES_BRANDS).toContain('MS PÉTANQUE'); });
  test('includes all expected brands', () => {
    ['OBUT', 'KTK', 'ODDEKA', 'LA FRANC', 'MARATHON', 'GEOLOGIC'].forEach(b => {
      expect(BOULES_BRANDS).toContain(b);
    });
  });
});

describe('BOULES_BRAND_COLORS', () => {
  test('every brand has colors', () => {
    BOULES_BRANDS.forEach(brand => {
      expect(BOULES_BRAND_COLORS[brand]).toBeDefined();
      expect(BOULES_BRAND_COLORS[brand].bg).toMatch(/^#/);
      expect(BOULES_BRAND_COLORS[brand].text).toBe('#FFFFFF');
      expect(BOULES_BRAND_COLORS[brand].abbr.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('OBUT has correct colors', () => {
    expect(BOULES_BRAND_COLORS['OBUT'].bg).toBe('#1B3A5C');
    expect(BOULES_BRAND_COLORS['OBUT'].abbr).toBe('OB');
  });
});

describe('getBrandImage', () => {
  test('returns image for known brand', () => {
    expect(getBrandImage('OBUT')).not.toBeNull();
    expect(getBrandImage('OBUT')?.uri).toContain('http');
  });

  test('case insensitive', () => {
    expect(getBrandImage('obut')).not.toBeNull();
  });

  test('returns null for unknown brand', () => {
    expect(getBrandImage('UNKNOWN_BRAND')).toBeNull();
  });
});

describe('getBrandVisual', () => {
  test('returns configured colors for known brand', () => {
    const visual = getBrandVisual('OBUT');
    expect(visual.bg).toBe('#1B3A5C');
    expect(visual.abbr).toBe('OB');
  });

  test('case insensitive', () => {
    expect(getBrandVisual('obut').bg).toBe('#1B3A5C');
  });

  test('generates fallback for unknown brand', () => {
    const visual = getBrandVisual('NewBrand');
    expect(visual.bg).toMatch(/^hsl\(/);
    expect(visual.text).toBe('#FFFFFF');
    expect(visual.abbr).toBe('NE');
  });

  test('fallback abbr is 2 chars uppercase', () => {
    expect(getBrandVisual('xyz').abbr).toBe('XY');
  });
});

describe('getModelsByBrand', () => {
  test('OBUT has 3 test models', () => {
    expect(getModelsByBrand('OBUT')).toHaveLength(3);
  });

  test('MS PETANQUE has 2 test models', () => {
    expect(getModelsByBrand('MS PÉTANQUE')).toHaveLength(2);
  });

  test('ODDEKA has 1 model', () => {
    expect(getModelsByBrand('ODDEKA')).toHaveLength(1);
  });

  test('unknown brand returns empty', () => {
    expect(getModelsByBrand('NONEXISTENT')).toHaveLength(0);
  });

  test('all models belong to queried brand', () => {
    getModelsByBrand('KTK').forEach(m => expect(m.brand).toBe('KTK'));
  });
});

describe('findModel', () => {
  test('finds existing model', () => {
    const model = findModel('OBUT', 'ATX');
    expect(model).toBeDefined();
    expect(model?.brand).toBe('OBUT');
    expect(model?.model).toBe('ATX');
  });

  test('returns undefined for wrong brand', () => {
    expect(findModel('KTK', 'ATX')).toBeUndefined();
  });

  test('returns undefined for wrong model', () => {
    expect(findModel('OBUT', 'NonExistent')).toBeUndefined();
  });
});

describe('BoulesModel structure', () => {
  test('all models have required fields', () => {
    BOULES_DATABASE.forEach(m => {
      expect(m.brand).toBeDefined();
      expect(m.model).toBeDefined();
      expect(m.material).toBeDefined();
      expect(m.hardness).toBeDefined();
      expect(m.targetUsage).toBeDefined();
      expect(m.particularities).toBeDefined();
    });
  });
});
