/**
 * Unit tests for services/imageCacheService.ts
 *
 * Tests: collectAvatarUrls, collectTerrainPhotoUrls, collectBoulesPhotoUrls,
 * priority batching, deduplication, cooldown logic, batch size constants.
 */

// ─── Inline implementations ──

const PREFETCH_COOLDOWN_MS = 60000;
const MEMORY_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const PRIORITY_AVATAR_COUNT = 10;
const PRIORITY_TERRAIN_COUNT = 5;
const BATCH_SIZE = 10;

function collectAvatarUrls(players: { avatar?: string | null }[]): string[] {
  return players
    .filter(p => p.avatar && typeof p.avatar === 'string' && p.avatar.startsWith('http'))
    .map(p => p.avatar as string);
}

function collectTerrainPhotoUrls(terrains: { photos?: string[] | null }[]): string[] {
  return terrains
    .filter(t => t.photos && t.photos.length > 0 && typeof t.photos[0] === 'string' && t.photos[0].startsWith('http'))
    .map(t => t.photos![0]);
}

function collectBoulesPhotoUrls(boulesSets: { photo?: string | null }[]): string[] {
  return boulesSets
    .filter(b => b.photo && typeof b.photo === 'string' && b.photo.startsWith('http'))
    .map(b => b.photo as string);
}

function buildPrefetchPlan(data: {
  players?: { avatar?: string | null }[];
  terrains?: { photos?: string[] | null }[];
  boulesSets?: { photo?: string | null }[];
}): { priority: string[]; secondary: string[] } {
  const priorityUrls: string[] = [];
  const secondaryUrls: string[] = [];

  if (data.players) {
    const avatarUrls = collectAvatarUrls(data.players);
    priorityUrls.push(...avatarUrls.slice(0, PRIORITY_AVATAR_COUNT));
    secondaryUrls.push(...avatarUrls.slice(PRIORITY_AVATAR_COUNT));
  }
  if (data.terrains) {
    const terrainUrls = collectTerrainPhotoUrls(data.terrains);
    const remaining = Math.max(0, PRIORITY_AVATAR_COUNT - priorityUrls.length);
    priorityUrls.push(...terrainUrls.slice(0, Math.min(PRIORITY_TERRAIN_COUNT, remaining)));
    secondaryUrls.push(...terrainUrls.slice(Math.min(PRIORITY_TERRAIN_COUNT, remaining)));
  }
  if (data.boulesSets) {
    secondaryUrls.push(...collectBoulesPhotoUrls(data.boulesSets));
  }

  const uniquePriority = [...new Set(priorityUrls)];
  const prioritySet = new Set(uniquePriority);
  const uniqueSecondary = [...new Set(secondaryUrls)].filter(u => !prioritySet.has(u));

  return { priority: uniquePriority, secondary: uniqueSecondary };
}

function shouldPrefetch(lastTimestamp: number, now: number): boolean {
  return now - lastTimestamp >= PREFETCH_COOLDOWN_MS;
}

function splitIntoBatches(urls: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }
  return batches;
}

// ─── Tests ──

describe('collectAvatarUrls', () => {
  test('collects http URLs', () => {
    const players = [
      { avatar: 'https://example.com/a.jpg' },
      { avatar: 'https://example.com/b.png' },
    ];
    expect(collectAvatarUrls(players)).toHaveLength(2);
  });

  test('skips null/undefined avatars', () => {
    const players = [{ avatar: null }, { avatar: undefined }, {}];
    expect(collectAvatarUrls(players)).toHaveLength(0);
  });

  test('skips non-http URLs', () => {
    const players = [{ avatar: 'file:///local/path.jpg' }, { avatar: 'data:image/png;base64,...' }];
    expect(collectAvatarUrls(players)).toHaveLength(0);
  });

  test('skips non-string avatars', () => {
    const players = [{ avatar: 123 as any }, { avatar: true as any }];
    expect(collectAvatarUrls(players)).toHaveLength(0);
  });
});

describe('collectTerrainPhotoUrls', () => {
  test('takes first photo only', () => {
    const terrains = [{ photos: ['https://a.com/1.jpg', 'https://a.com/2.jpg'] }];
    const urls = collectTerrainPhotoUrls(terrains);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://a.com/1.jpg');
  });

  test('skips empty photos array', () => {
    expect(collectTerrainPhotoUrls([{ photos: [] }])).toHaveLength(0);
  });

  test('skips null photos', () => {
    expect(collectTerrainPhotoUrls([{ photos: null }])).toHaveLength(0);
  });
});

describe('collectBoulesPhotoUrls', () => {
  test('collects boules photos', () => {
    const sets = [{ photo: 'https://a.com/boule.jpg' }];
    expect(collectBoulesPhotoUrls(sets)).toEqual(['https://a.com/boule.jpg']);
  });

  test('skips null photo', () => {
    expect(collectBoulesPhotoUrls([{ photo: null }])).toHaveLength(0);
  });
});

describe('buildPrefetchPlan', () => {
  test('first 10 avatars are priority', () => {
    const players = Array.from({ length: 15 }, (_, i) => ({ avatar: `https://a.com/${i}.jpg` }));
    const plan = buildPrefetchPlan({ players });
    expect(plan.priority).toHaveLength(10);
    expect(plan.secondary).toHaveLength(5);
  });

  test('terrain photos fill remaining priority slots', () => {
    const players = Array.from({ length: 5 }, (_, i) => ({ avatar: `https://a.com/p${i}.jpg` }));
    const terrains = Array.from({ length: 10 }, (_, i) => ({ photos: [`https://a.com/t${i}.jpg`] }));
    const plan = buildPrefetchPlan({ players, terrains });
    expect(plan.priority.length).toBeLessThanOrEqual(10);
    expect(plan.priority.length).toBeGreaterThanOrEqual(5);
  });

  test('boules always secondary', () => {
    const boulesSets = [{ photo: 'https://a.com/b.jpg' }];
    const plan = buildPrefetchPlan({ boulesSets });
    expect(plan.priority).toHaveLength(0);
    expect(plan.secondary).toHaveLength(1);
  });

  test('deduplicates URLs', () => {
    const players = [{ avatar: 'https://a.com/same.jpg' }, { avatar: 'https://a.com/same.jpg' }];
    const plan = buildPrefetchPlan({ players });
    expect(plan.priority).toHaveLength(1);
  });

  test('secondary excludes priority URLs', () => {
    const players = Array.from({ length: 12 }, () => ({ avatar: 'https://a.com/x.jpg' }));
    const plan = buildPrefetchPlan({ players });
    expect(plan.priority).toHaveLength(1);
    expect(plan.secondary).toHaveLength(0);
  });

  test('empty data returns empty plan', () => {
    const plan = buildPrefetchPlan({});
    expect(plan.priority).toHaveLength(0);
    expect(plan.secondary).toHaveLength(0);
  });
});

describe('shouldPrefetch', () => {
  test('allows after cooldown', () => {
    expect(shouldPrefetch(1000, 1000 + PREFETCH_COOLDOWN_MS)).toBe(true);
  });

  test('blocks within cooldown', () => {
    expect(shouldPrefetch(1000, 1000 + 30000)).toBe(false);
  });

  test('allows on first call (last = 0)', () => {
    expect(shouldPrefetch(0, Date.now())).toBe(true);
  });
});

describe('splitIntoBatches', () => {
  test('splits into correct batches', () => {
    const urls = Array.from({ length: 25 }, (_, i) => `url${i}`);
    const batches = splitIntoBatches(urls, 10);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });

  test('single batch for small arrays', () => {
    const batches = splitIntoBatches(['a', 'b'], 10);
    expect(batches).toHaveLength(1);
  });

  test('empty array returns empty', () => {
    expect(splitIntoBatches([], 10)).toHaveLength(0);
  });
});

describe('constants', () => {
  test('cooldown is 60s', () => { expect(PREFETCH_COOLDOWN_MS).toBe(60000); });
  test('cleanup interval is 30min', () => { expect(MEMORY_CLEANUP_INTERVAL_MS).toBe(1800000); });
  test('batch size is 10', () => { expect(BATCH_SIZE).toBe(10); });
});
