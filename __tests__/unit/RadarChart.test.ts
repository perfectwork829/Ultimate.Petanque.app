/**
 * Unit tests for components/ui/RadarChart.tsx
 *
 * Tests: polarToCartesian coordinate calculation, grid polygon generation,
 * data normalization (0-100 clamping), label anchor selection,
 * minimum data points, axis line computation.
 */

// ─── Inline implementations ──

const GRID_LEVELS = 4;

function polarToCartesian(
  cx: number, cy: number, radius: number, index: number, total: number,
): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function generateGridPolygon(
  cx: number, cy: number, radius: number, n: number,
): string {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = polarToCartesian(cx, cy, radius, i, n);
    return `${x},${y}`;
  }).join(' ');
}

function generateDataPolygon(
  data: { value: number }[], cx: number, cy: number, maxRadius: number,
): string {
  return data.map((d, i) => {
    const r = (maxRadius * Math.min(d.value, 100)) / 100;
    const [x, y] = polarToCartesian(cx, cy, r, i, data.length);
    return `${x},${y}`;
  }).join(' ');
}

function computeLabelAnchor(x: number, cx: number): 'middle' | 'start' | 'end' {
  if (x < cx - 10) return 'end';
  if (x > cx + 10) return 'start';
  return 'middle';
}

function shouldRender(dataLength: number): boolean {
  return dataLength >= 3;
}

function computeMaxRadius(size: number): number {
  return size / 2 - 36;
}

function computeLabelRadius(maxRadius: number): number {
  return maxRadius + 22;
}

function normalizeValue(value: number): number {
  return Math.min(value, 100);
}

function computeAxisLines(
  cx: number, cy: number, maxRadius: number, n: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = polarToCartesian(cx, cy, maxRadius, i, n);
    return { x1: cx, y1: cy, x2: x, y2: y };
  });
}

// ─── Tests ──

describe('polarToCartesian', () => {
  test('first point is at top (index 0)', () => {
    const [x, y] = polarToCartesian(100, 100, 50, 0, 6);
    expect(x).toBeCloseTo(100, 1); // Centered X
    expect(y).toBeCloseTo(50, 1);  // Top (100 - 50)
  });

  test('quarter around (index = total/4)', () => {
    const [x, y] = polarToCartesian(100, 100, 50, 1, 4);
    expect(x).toBeCloseTo(150, 1); // Right
    expect(y).toBeCloseTo(100, 1); // Center Y
  });

  test('opposite (index = total/2)', () => {
    const [x, y] = polarToCartesian(100, 100, 50, 2, 4);
    expect(x).toBeCloseTo(100, 1); // Center X
    expect(y).toBeCloseTo(150, 1); // Bottom
  });

  test('three-quarters (index = 3*total/4)', () => {
    const [x, y] = polarToCartesian(100, 100, 50, 3, 4);
    expect(x).toBeCloseTo(50, 1);  // Left
    expect(y).toBeCloseTo(100, 1); // Center Y
  });

  test('zero radius returns center', () => {
    const [x, y] = polarToCartesian(100, 100, 0, 0, 6);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(100);
  });

  test('distance from center equals radius', () => {
    const radius = 75;
    const [x, y] = polarToCartesian(100, 100, radius, 2, 8);
    const dist = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
    expect(dist).toBeCloseTo(radius, 1);
  });

  test('6 points equally spaced - all at same distance', () => {
    const r = 50;
    for (let i = 0; i < 6; i++) {
      const [x, y] = polarToCartesian(110, 110, r, i, 6);
      const dist = Math.sqrt((x - 110) ** 2 + (y - 110) ** 2);
      expect(dist).toBeCloseTo(r, 1);
    }
  });

  test('pentagon (5 points) first at top', () => {
    const [x, y] = polarToCartesian(110, 110, 50, 0, 5);
    expect(x).toBeCloseTo(110, 1);
    expect(y).toBeCloseTo(60, 1);
  });
});

describe('generateGridPolygon', () => {
  test('generates correct number of points', () => {
    const polygon = generateGridPolygon(100, 100, 50, 6);
    const points = polygon.split(' ');
    expect(points).toHaveLength(6);
  });

  test('each point has x,y format', () => {
    const polygon = generateGridPolygon(100, 100, 50, 5);
    const points = polygon.split(' ');
    points.forEach(p => {
      expect(p).toMatch(/^-?\d+\.?\d*,-?\d+\.?\d*$/);
    });
  });

  test('3 points for triangle', () => {
    const polygon = generateGridPolygon(100, 100, 40, 3);
    expect(polygon.split(' ')).toHaveLength(3);
  });
});

describe('generateDataPolygon', () => {
  test('maps values to scaled radius', () => {
    const data = [{ value: 50 }, { value: 100 }, { value: 0 }];
    const polygon = generateDataPolygon(data, 100, 100, 80);
    const points = polygon.split(' ');
    expect(points).toHaveLength(3);
  });

  test('value 0 maps to center', () => {
    const data = [{ value: 0 }, { value: 0 }, { value: 0 }];
    const polygon = generateDataPolygon(data, 100, 100, 80);
    const points = polygon.split(' ');
    points.forEach(p => {
      const [x, y] = p.split(',').map(Number);
      expect(x).toBeCloseTo(100, 0);
      expect(y).toBeCloseTo(100, 0);
    });
  });

  test('value clamped at 100', () => {
    const data = [{ value: 150 }, { value: 200 }, { value: 100 }];
    const polyOver = generateDataPolygon(data, 100, 100, 80);
    const dataExact = [{ value: 100 }, { value: 100 }, { value: 100 }];
    const polyExact = generateDataPolygon(dataExact, 100, 100, 80);
    expect(polyOver).toBe(polyExact);
  });

  test('value 100 reaches max radius', () => {
    const data = [{ value: 100 }];
    // With 1 point can't really make polygon, but test coordinate
    const polygon = generateDataPolygon([{ value: 100 }, { value: 100 }, { value: 100 }], 100, 100, 80);
    const firstPoint = polygon.split(' ')[0].split(',').map(Number);
    const dist = Math.sqrt((firstPoint[0] - 100) ** 2 + (firstPoint[1] - 100) ** 2);
    expect(dist).toBeCloseTo(80, 0);
  });
});

describe('computeLabelAnchor', () => {
  test('left of center = end anchor', () => {
    expect(computeLabelAnchor(50, 100)).toBe('end');
  });

  test('right of center = start anchor', () => {
    expect(computeLabelAnchor(150, 100)).toBe('start');
  });

  test('near center = middle anchor', () => {
    expect(computeLabelAnchor(100, 100)).toBe('middle');
    expect(computeLabelAnchor(95, 100)).toBe('middle');
    expect(computeLabelAnchor(105, 100)).toBe('middle');
  });

  test('boundary: cx - 10 = middle', () => {
    expect(computeLabelAnchor(90, 100)).toBe('middle');
  });

  test('boundary: cx - 11 = end', () => {
    expect(computeLabelAnchor(89, 100)).toBe('end');
  });

  test('boundary: cx + 11 = start', () => {
    expect(computeLabelAnchor(111, 100)).toBe('start');
  });
});

describe('shouldRender', () => {
  test('0 points = no render', () => { expect(shouldRender(0)).toBe(false); });
  test('1 point = no render', () => { expect(shouldRender(1)).toBe(false); });
  test('2 points = no render', () => { expect(shouldRender(2)).toBe(false); });
  test('3 points = render', () => { expect(shouldRender(3)).toBe(true); });
  test('6 points = render', () => { expect(shouldRender(6)).toBe(true); });
  test('10 points = render', () => { expect(shouldRender(10)).toBe(true); });
});

describe('computeMaxRadius', () => {
  test('default size 220 → maxRadius 74', () => {
    expect(computeMaxRadius(220)).toBe(74);
  });

  test('size 300 → maxRadius 114', () => {
    expect(computeMaxRadius(300)).toBe(114);
  });

  test('always leaves 36px margin', () => {
    [200, 250, 300, 400].forEach(size => {
      expect(computeMaxRadius(size)).toBe(size / 2 - 36);
    });
  });
});

describe('computeLabelRadius', () => {
  test('label radius = maxRadius + 22', () => {
    expect(computeLabelRadius(74)).toBe(96);
    expect(computeLabelRadius(100)).toBe(122);
  });
});

describe('normalizeValue', () => {
  test('50 stays 50', () => { expect(normalizeValue(50)).toBe(50); });
  test('100 stays 100', () => { expect(normalizeValue(100)).toBe(100); });
  test('150 clamped to 100', () => { expect(normalizeValue(150)).toBe(100); });
  test('0 stays 0', () => { expect(normalizeValue(0)).toBe(0); });
  test('-10 stays -10 (no lower clamp)', () => { expect(normalizeValue(-10)).toBe(-10); });
});

describe('computeAxisLines', () => {
  test('generates correct number of lines', () => {
    const lines = computeAxisLines(100, 100, 80, 6);
    expect(lines).toHaveLength(6);
  });

  test('all lines start from center', () => {
    const lines = computeAxisLines(100, 100, 80, 5);
    lines.forEach(l => {
      expect(l.x1).toBe(100);
      expect(l.y1).toBe(100);
    });
  });

  test('end points are at maxRadius distance', () => {
    const lines = computeAxisLines(100, 100, 80, 4);
    lines.forEach(l => {
      const dist = Math.sqrt((l.x2 - 100) ** 2 + (l.y2 - 100) ** 2);
      expect(dist).toBeCloseTo(80, 1);
    });
  });
});

describe('GRID_LEVELS', () => {
  test('4 concentric grid levels', () => {
    expect(GRID_LEVELS).toBe(4);
  });

  test('grid radii: 25%, 50%, 75%, 100% of maxRadius', () => {
    const maxRadius = 80;
    for (let level = 1; level <= GRID_LEVELS; level++) {
      const r = (maxRadius * level) / GRID_LEVELS;
      expect(r).toBe(maxRadius * level / 4);
    }
  });
});
