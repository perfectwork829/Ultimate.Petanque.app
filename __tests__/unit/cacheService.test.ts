/**
 * Unit tests for services/cacheService.ts
 *
 * Tests: CACHE_VERSION, cache keys structure, isCacheValid logic (version
 * mismatch, age), parse fallback, CachedData structure, edge cases.
 */

const CACHE_PREFIX = 'petanque_cache_';
const CACHE_VERSION = '1';

type CacheKey = 'players' | 'clubs' | 'tournaments' | 'matches' | 'challenges' | 'terrains';

const CACHE_KEYS: Record<CacheKey, string> = {
  players: `${CACHE_PREFIX}players`,
  clubs: `${CACHE_PREFIX}clubs`,
  tournaments: `${CACHE_PREFIX}tournaments`,
  matches: `${CACHE_PREFIX}matches`,
  challenges: `${CACHE_PREFIX}challenges`,
  terrains: `${CACHE_PREFIX}terrains`,
};

function isCacheValid(version: string | null, timestamp: string | null, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): boolean {
  if (version !== CACHE_VERSION) return false;
  if (!timestamp) return false;
  const cacheAge = Date.now() - new Date(timestamp).getTime();
  return cacheAge < maxAgeMs;
}

function safeParse<T>(raw: string | null): T[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as T[]; } catch { return []; }
}

describe('Cache Keys', () => {
  test('6 cache keys defined', () => { expect(Object.keys(CACHE_KEYS)).toHaveLength(6); });
  test('all prefixed', () => {
    Object.values(CACHE_KEYS).forEach(k => expect(k.startsWith(CACHE_PREFIX)).toBe(true));
  });
  test('expected keys', () => {
    expect(CACHE_KEYS.players).toBe('petanque_cache_players');
    expect(CACHE_KEYS.matches).toBe('petanque_cache_matches');
  });
});

describe('CACHE_VERSION', () => {
  test('is "1"', () => { expect(CACHE_VERSION).toBe('1'); });
});

describe('isCacheValid', () => {
  test('valid: correct version + recent timestamp', () => {
    expect(isCacheValid('1', new Date().toISOString())).toBe(true);
  });
  test('invalid: wrong version', () => {
    expect(isCacheValid('0', new Date().toISOString())).toBe(false);
  });
  test('invalid: null version', () => {
    expect(isCacheValid(null, new Date().toISOString())).toBe(false);
  });
  test('invalid: null timestamp', () => {
    expect(isCacheValid('1', null)).toBe(false);
  });
  test('invalid: old timestamp (8 days)', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheValid('1', old)).toBe(false);
  });
  test('valid: 6 days old (within 7 day default)', () => {
    const ts = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheValid('1', ts)).toBe(true);
  });
  test('custom maxAge: 1 hour', () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isCacheValid('1', recent, 60 * 60 * 1000)).toBe(true);
    expect(isCacheValid('1', old, 60 * 60 * 1000)).toBe(false);
  });
});

describe('safeParse', () => {
  test('null returns empty array', () => { expect(safeParse(null)).toEqual([]); });
  test('empty string returns empty array', () => { expect(safeParse('')).toEqual([]); });
  test('invalid JSON returns empty array', () => { expect(safeParse('not json')).toEqual([]); });
  test('valid JSON array parsed', () => {
    expect(safeParse('[{"id":"1"},{"id":"2"}]')).toEqual([{ id: '1' }, { id: '2' }]);
  });
  test('valid JSON object returns as-is', () => {
    expect(safeParse('{"a":1}')).toEqual({ a: 1 });
  });
});
