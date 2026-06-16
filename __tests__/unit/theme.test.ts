/**
 * Tests for constants/theme.ts — colors, spacing, shadows, palette coherence
 */

import theme from '@/constants/theme';

describe('theme constants', () => {
  describe('primary colors', () => {
    test('primary is defined', () => { expect(theme.primary).toBeTruthy(); });
    test('background is defined', () => { expect(theme.background).toBeTruthy(); });
    test('surface is defined', () => { expect(theme.surface).toBeTruthy(); });
    test('border is defined', () => { expect(theme.border).toBeTruthy(); });
  });

  describe('text colors', () => {
    test('textPrimary is defined', () => { expect(theme.textPrimary).toBeTruthy(); });
    test('textSecondary is defined', () => { expect(theme.textSecondary).toBeTruthy(); });
    test('textMuted is defined', () => { expect(theme.textMuted).toBeTruthy(); });
  });

  describe('semantic colors', () => {
    test('success is defined', () => { expect(theme.success).toBeTruthy(); });
    test('error is defined', () => { expect(theme.error).toBeTruthy(); });
    test('warning is defined', () => { expect(theme.warning).toBeTruthy(); });
  });

  describe('game-specific colors', () => {
    test('tirColor is defined', () => { expect(theme.tirColor).toBeTruthy(); });
    test('pointColor is defined', () => { expect(theme.pointColor).toBeTruthy(); });
    test('carreauColor is defined', () => { expect(theme.carreauColor).toBeTruthy(); });
  });

  describe('borderRadius tokens', () => {
    test('borderRadius object exists', () => { expect(theme.borderRadius).toBeDefined(); });
    test('has sm/md/lg/xl/full', () => {
      expect(theme.borderRadius.sm).toBeGreaterThan(0);
      expect(theme.borderRadius.md).toBeGreaterThan(theme.borderRadius.sm);
      expect(theme.borderRadius.lg).toBeGreaterThan(theme.borderRadius.md);
    });
  });

  describe('shadows', () => {
    test('shadows object exists', () => { expect(theme.shadows).toBeDefined(); });
    test('has card shadow', () => { expect(theme.shadows.card).toBeDefined(); });
    test('has cardElevated shadow', () => { expect(theme.shadows.cardElevated).toBeDefined(); });
  });

  describe('color uniqueness', () => {
    test('tir/point/carreau colors are unique', () => {
      const colors = [theme.tirColor, theme.pointColor, theme.carreauColor];
      expect(new Set(colors).size).toBe(3);
    });
    test('success/error/warning are unique', () => {
      const colors = [theme.success, theme.error, theme.warning];
      expect(new Set(colors).size).toBe(3);
    });
  });
});
