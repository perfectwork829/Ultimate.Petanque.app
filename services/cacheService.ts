import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player, Club, Tournament, Match, Challenge, Terrain } from '@/types/petanque';

const CACHE_PREFIX = 'petanque_cache_';
const CACHE_VERSION_KEY = `${CACHE_PREFIX}version`;
const CACHE_VERSION = '1';
const CACHE_TIMESTAMP_KEY = `${CACHE_PREFIX}timestamp`;
const LAST_SYNC_KEY = `${CACHE_PREFIX}last_sync`;

type CacheKey = 'players' | 'clubs' | 'tournaments' | 'matches' | 'challenges' | 'terrains';

const CACHE_KEYS: Record<CacheKey, string> = {
  players: `${CACHE_PREFIX}players`,
  clubs: `${CACHE_PREFIX}clubs`,
  tournaments: `${CACHE_PREFIX}tournaments`,
  matches: `${CACHE_PREFIX}matches`,
  challenges: `${CACHE_PREFIX}challenges`,
  terrains: `${CACHE_PREFIX}terrains`,
};

export interface CachedData {
  players: Player[];
  clubs: Club[];
  tournaments: Tournament[];
  matches: Match[];
  challenges: Challenge[];
  terrains: Terrain[];
}

/**
 * Save all critical data to local cache
 */
export async function saveToCache(data: Partial<CachedData>): Promise<void> {
  try {
    const entries: [string, string][] = [];

    if (data.players) entries.push([CACHE_KEYS.players, JSON.stringify(data.players)]);
    if (data.clubs) entries.push([CACHE_KEYS.clubs, JSON.stringify(data.clubs)]);
    if (data.tournaments) entries.push([CACHE_KEYS.tournaments, JSON.stringify(data.tournaments)]);
    if (data.matches) entries.push([CACHE_KEYS.matches, JSON.stringify(data.matches)]);
    if (data.challenges) entries.push([CACHE_KEYS.challenges, JSON.stringify(data.challenges)]);
    if (data.terrains) entries.push([CACHE_KEYS.terrains, JSON.stringify(data.terrains)]);

    entries.push([CACHE_TIMESTAMP_KEY, new Date().toISOString()]);
    entries.push([CACHE_VERSION_KEY, CACHE_VERSION]);

    await AsyncStorage.multiSet(entries);
  } catch (error) {
    console.log('Error saving to cache:', error);
  }
}

/**
 * Save a single data type to cache
 */
export async function saveSingleToCache<K extends CacheKey>(
  key: K,
  data: CachedData[K]
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [CACHE_KEYS[key], JSON.stringify(data)],
      [CACHE_TIMESTAMP_KEY, new Date().toISOString()],
    ]);
  } catch (error) {
    console.log(`Error saving ${key} to cache:`, error);
  }
}

/**
 * Load all cached data
 */
export async function loadFromCache(): Promise<CachedData | null> {
  try {
    // Check cache version first
    const version = await AsyncStorage.getItem(CACHE_VERSION_KEY);
    if (version !== CACHE_VERSION) {
      // Cache version mismatch, clear and return null
      await clearCache();
      return null;
    }

    const keys = Object.values(CACHE_KEYS);
    const results = await AsyncStorage.multiGet(keys);

    const dataMap: Record<string, string | null> = {};
    results.forEach(([key, value]) => {
      dataMap[key] = value;
    });

    // Check if we have any cached data
    const hasData = Object.values(dataMap).some(v => v !== null);
    if (!hasData) return null;

    const parse = <T>(key: string): T[] => {
      const raw = dataMap[key];
      if (!raw) return [];
      try {
        return JSON.parse(raw) as T[];
      } catch {
        return [];
      }
    };

    return {
      players: parse<Player>(CACHE_KEYS.players),
      clubs: parse<Club>(CACHE_KEYS.clubs),
      tournaments: parse<Tournament>(CACHE_KEYS.tournaments),
      matches: parse<Match>(CACHE_KEYS.matches),
      challenges: parse<Challenge>(CACHE_KEYS.challenges),
      terrains: parse<Terrain>(CACHE_KEYS.terrains),
    };
  } catch (error) {
    console.log('Error loading from cache:', error);
    return null;
  }
}

/**
 * Get cache timestamp
 */
export async function getCacheTimestamp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<void> {
  try {
    const allKeys = [...Object.values(CACHE_KEYS), CACHE_TIMESTAMP_KEY, CACHE_VERSION_KEY, LAST_SYNC_KEY];
    await AsyncStorage.multiRemove(allKeys);
  } catch (error) {
    console.log('Error clearing cache:', error);
  }
}

/**
 * Get the last successful sync timestamp (for delta sync)
 */
export async function getLastSyncTimestamp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

/**
 * Save the last successful sync timestamp
 */
export async function setLastSyncTimestamp(timestamp: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp);
  } catch (error) {
    console.log('Error saving sync timestamp:', error);
  }
}

/**
 * Check if cache exists and is not too old (default: 7 days)
 */
export async function isCacheValid(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<boolean> {
  try {
    const version = await AsyncStorage.getItem(CACHE_VERSION_KEY);
    if (version !== CACHE_VERSION) return false;

    const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;

    const cacheAge = Date.now() - new Date(timestamp).getTime();
    return cacheAge < maxAgeMs;
  } catch {
    return false;
  }
}
