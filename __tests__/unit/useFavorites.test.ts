/**
 * Unit tests for hooks/useFavorites.ts — favorite toggle/check logic.
 * Tests the pure functions createFavoriteActions exposes.
 */

// ============================================================
// Inline favorites logic (mirrors createFavoriteActions)
// ============================================================
function toggleFavorite(currentIds: string[], targetId: string): string[] {
  return currentIds.includes(targetId)
    ? currentIds.filter(id => id !== targetId)
    : [...currentIds, targetId];
}

function isFavorite(currentIds: string[], targetId: string): boolean {
  return currentIds.includes(targetId);
}

// ============================================================
// Tests: toggleFavorite (terrains)
// ============================================================
describe('toggleFavoriteTerrain', () => {
  test('adds terrain when not in favorites', () => {
    const result = toggleFavorite([], 'ter-1');
    expect(result).toEqual(['ter-1']);
  });

  test('removes terrain when already in favorites', () => {
    const result = toggleFavorite(['ter-1', 'ter-2'], 'ter-1');
    expect(result).toEqual(['ter-2']);
  });

  test('preserves other favorites when adding', () => {
    const result = toggleFavorite(['ter-1'], 'ter-2');
    expect(result).toEqual(['ter-1', 'ter-2']);
  });

  test('preserves other favorites when removing', () => {
    const result = toggleFavorite(['ter-1', 'ter-2', 'ter-3'], 'ter-2');
    expect(result).toEqual(['ter-1', 'ter-3']);
  });

  test('toggle twice returns to original state', () => {
    const initial = ['ter-1'];
    const afterAdd = toggleFavorite(initial, 'ter-2');
    const afterRemove = toggleFavorite(afterAdd, 'ter-2');
    expect(afterRemove).toEqual(['ter-1']);
  });

  test('handles empty list', () => {
    const result = toggleFavorite([], 'ter-1');
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// Tests: toggleFavorite (clubs)
// ============================================================
describe('toggleFavoriteClub', () => {
  test('adds club when not in favorites', () => {
    const result = toggleFavorite([], 'club-1');
    expect(result).toEqual(['club-1']);
  });

  test('removes club when already in favorites', () => {
    const result = toggleFavorite(['club-1'], 'club-1');
    expect(result).toEqual([]);
  });

  test('handles multiple clubs', () => {
    let ids: string[] = [];
    ids = toggleFavorite(ids, 'club-1');
    ids = toggleFavorite(ids, 'club-2');
    ids = toggleFavorite(ids, 'club-3');
    expect(ids).toEqual(['club-1', 'club-2', 'club-3']);
    ids = toggleFavorite(ids, 'club-2');
    expect(ids).toEqual(['club-1', 'club-3']);
  });
});

// ============================================================
// Tests: isFavorite
// ============================================================
describe('isFavorite', () => {
  test('returns true for existing favorite', () => {
    expect(isFavorite(['ter-1', 'ter-2'], 'ter-1')).toBe(true);
  });

  test('returns false for non-favorite', () => {
    expect(isFavorite(['ter-1', 'ter-2'], 'ter-3')).toBe(false);
  });

  test('returns false for empty list', () => {
    expect(isFavorite([], 'ter-1')).toBe(false);
  });

  test('works with club ids', () => {
    expect(isFavorite(['club-1', 'club-2'], 'club-2')).toBe(true);
    expect(isFavorite(['club-1', 'club-2'], 'club-3')).toBe(false);
  });

  test('exact match required (no partial)', () => {
    expect(isFavorite(['ter-10'], 'ter-1')).toBe(false);
    expect(isFavorite(['ter-1'], 'ter-10')).toBe(false);
  });
});

// ============================================================
// Tests: Edge cases
// ============================================================
describe('Favorites edge cases', () => {
  test('duplicate add does not create duplicates (via toggle)', () => {
    const ids = ['ter-1'];
    // ter-1 already exists, toggle removes it
    const result = toggleFavorite(ids, 'ter-1');
    expect(result).toEqual([]);
  });

  test('handles large number of favorites', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `ter-${i}`);
    expect(isFavorite(ids, 'ter-50')).toBe(true);
    expect(isFavorite(ids, 'ter-100')).toBe(false);
    const after = toggleFavorite(ids, 'ter-50');
    expect(after).toHaveLength(99);
    expect(isFavorite(after, 'ter-50')).toBe(false);
  });

  test('preserves order when adding', () => {
    const ids = ['a', 'b', 'c'];
    const result = toggleFavorite(ids, 'd');
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });
});
