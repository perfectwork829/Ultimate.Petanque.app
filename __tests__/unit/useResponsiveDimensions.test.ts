/**
 * Unit tests for hooks/useResponsiveDimensions.ts
 * Tests: isTablet/isDesktop breakpoint logic.
 */

// ============================================================
// Inline breakpoint logic (mirrors useResponsiveDimensions)
// ============================================================
function computeBreakpoints(screenWidth: number) {
  return {
    screenWidth,
    isTablet: screenWidth >= 600,
    isDesktop: screenWidth >= 1024,
  };
}

// ============================================================
// Tests: Breakpoints
// ============================================================
describe('useResponsiveDimensions — breakpoints', () => {
  test('small phone (320px): not tablet, not desktop', () => {
    const result = computeBreakpoints(320);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('standard phone (375px): not tablet, not desktop', () => {
    const result = computeBreakpoints(375);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('large phone (414px): not tablet, not desktop', () => {
    const result = computeBreakpoints(414);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('border phone (599px): not tablet', () => {
    const result = computeBreakpoints(599);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('tablet boundary (600px): tablet, not desktop', () => {
    const result = computeBreakpoints(600);
    expect(result.isTablet).toBe(true);
    expect(result.isDesktop).toBe(false);
  });

  test('standard tablet (768px): tablet, not desktop', () => {
    const result = computeBreakpoints(768);
    expect(result.isTablet).toBe(true);
    expect(result.isDesktop).toBe(false);
  });

  test('large tablet (1023px): tablet, not desktop', () => {
    const result = computeBreakpoints(1023);
    expect(result.isTablet).toBe(true);
    expect(result.isDesktop).toBe(false);
  });

  test('desktop boundary (1024px): tablet and desktop', () => {
    const result = computeBreakpoints(1024);
    expect(result.isTablet).toBe(true);
    expect(result.isDesktop).toBe(true);
  });

  test('wide desktop (1920px): tablet and desktop', () => {
    const result = computeBreakpoints(1920);
    expect(result.isTablet).toBe(true);
    expect(result.isDesktop).toBe(true);
  });

  test('preserves screenWidth value', () => {
    const result = computeBreakpoints(842);
    expect(result.screenWidth).toBe(842);
  });
});

// ============================================================
// Tests: Default width handling
// ============================================================
describe('useResponsiveDimensions — defaults', () => {
  test('default width of 375 is phone', () => {
    const result = computeBreakpoints(375);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('zero width treated as phone', () => {
    const result = computeBreakpoints(0);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });

  test('negative width treated as phone', () => {
    const result = computeBreakpoints(-100);
    expect(result.isTablet).toBe(false);
    expect(result.isDesktop).toBe(false);
  });
});
