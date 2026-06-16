import { Image } from 'expo-image';

/**
 * Image Cache Service
 * Handles prefetching of frequently used images and periodic cache cleanup.
 * Uses match-frequency-based prioritization for player avatars.
 */

// Track prefetch state to avoid duplicate calls
let lastPrefetchTimestamp = 0;
const PREFETCH_COOLDOWN_MS = 60000; // 1 minute between prefetch batches

// Track cleanup intervals
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
const MEMORY_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Collect avatar URLs from players, sorted by match frequency (most-played first).
 * Players who appear in more matches get their avatars prefetched first.
 */
function collectAvatarUrlsByFrequency(
  players: { id?: string; avatar?: string | null }[],
  matches?: { teamA?: { players?: string[] }; teamB?: { players?: string[] } }[]
): string[] {
  if (!players.length) return [];

  // Build frequency map: playerId → match count
  const freqMap = new Map<string, number>();
  if (matches && matches.length > 0) {
    for (const m of matches) {
      const allIds = [...(m.teamA?.players || []), ...(m.teamB?.players || [])];
      for (const pid of allIds) {
        freqMap.set(pid, (freqMap.get(pid) || 0) + 1);
      }
    }
  }

  // Sort players by match frequency (descending), then collect avatar URLs
  const sorted = [...players]
    .filter(p => p.avatar && typeof p.avatar === 'string' && p.avatar.startsWith('http'))
    .sort((a, b) => {
      const fa = freqMap.get(a.id || '') || 0;
      const fb = freqMap.get(b.id || '') || 0;
      return fb - fa;
    });

  return sorted.map(p => p.avatar as string);
}

/**
 * Collect terrain photo URLs (first photo of each terrain)
 */
function collectTerrainPhotoUrls(terrains: { photos?: string[] | null }[]): string[] {
  return terrains
    .filter(t => t.photos && t.photos.length > 0 && typeof t.photos[0] === 'string' && t.photos[0].startsWith('http'))
    .map(t => t.photos![0]);
}

/**
 * Collect boules set photo URLs
 */
function collectBoulesPhotoUrls(boulesSets: { photo?: string | null }[]): string[] {
  return boulesSets
    .filter(b => b.photo && typeof b.photo === 'string' && b.photo.startsWith('http'))
    .map(b => b.photo as string);
}

/**
 * Prefetch critical images (avatars, terrain thumbnails, boules photos).
 * Uses priority-based prefetching: first 10 visible items load immediately,
 * remaining items load in the background after a short delay.
 * Respects cooldown to prevent redundant calls.
 */
export async function prefetchImages(data: {
  players?: { id?: string; avatar?: string | null }[];
  terrains?: { photos?: string[] | null }[];
  boulesSets?: { photo?: string | null }[];
  matches?: { teamA?: { players?: string[] }; teamB?: { players?: string[] } }[];
}): Promise<void> {
  const now = Date.now();
  if (now - lastPrefetchTimestamp < PREFETCH_COOLDOWN_MS) return;
  lastPrefetchTimestamp = now;

  // Priority: collect first 10 player avatars (visible on home/directory)
  const priorityUrls: string[] = [];
  const secondaryUrls: string[] = [];

  if (data.players) {
    const avatarUrls = collectAvatarUrlsByFrequency(data.players, data.matches);
    priorityUrls.push(...avatarUrls.slice(0, 10));
    secondaryUrls.push(...avatarUrls.slice(10));
  }
  if (data.terrains) {
    const terrainUrls = collectTerrainPhotoUrls(data.terrains);
    // First 5 terrain photos are priority (visible on map/directory)
    const remaining = Math.max(0, 10 - priorityUrls.length);
    priorityUrls.push(...terrainUrls.slice(0, Math.min(5, remaining)));
    secondaryUrls.push(...terrainUrls.slice(Math.min(5, remaining)));
  }
  if (data.boulesSets) {
    secondaryUrls.push(...collectBoulesPhotoUrls(data.boulesSets));
  }

  // Deduplicate
  const uniquePriority = [...new Set(priorityUrls)];
  const prioritySet = new Set(uniquePriority);
  const uniqueSecondary = [...new Set(secondaryUrls)].filter(u => !prioritySet.has(u));

  // Phase 1: Prefetch priority images immediately (first visible items)
  if (uniquePriority.length > 0) {
    try {
      await Image.prefetch(uniquePriority);
      console.log(`Priority prefetched ${uniquePriority.length} images`);
    } catch {
      // Silent
    }
  }

  // Phase 2: Background prefetch remaining images after 2s delay
  if (uniqueSecondary.length > 0) {
    setTimeout(async () => {
      const BATCH_SIZE = 10;
      for (let i = 0; i < uniqueSecondary.length; i += BATCH_SIZE) {
        const batch = uniqueSecondary.slice(i, i + BATCH_SIZE);
        try {
          await Image.prefetch(batch);
        } catch {
          // Silent
        }
      }
      console.log(`Background prefetched ${uniqueSecondary.length} images`);
    }, 2000);
  }
}

/**
 * Start periodic memory cache cleanup.
 * Clears memory cache every 30 minutes to prevent OOM while keeping disk cache intact.
 */
export function startPeriodicCacheCleanup(): void {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(async () => {
    try {
      await Image.clearMemoryCache();
      console.log('Periodic memory cache cleanup completed');
    } catch {
      // Silent
    }
  }, MEMORY_CLEANUP_INTERVAL_MS);
}

/**
 * Stop periodic cache cleanup (on unmount/logout).
 */
export function stopPeriodicCacheCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * Manually clear all image caches (memory + disk).
 * Use sparingly - only for logout or explicit user action.
 */
export async function clearAllImageCache(): Promise<void> {
  try {
    await Promise.all([
      Image.clearMemoryCache(),
      Image.clearDiskCache(),
    ]);
    console.log('All image caches cleared');
  } catch {
    // Silent
  }
}
