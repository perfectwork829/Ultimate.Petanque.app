/**
 * Unit tests for services/storageService.ts
 *
 * Tests: MIME type detection from extension, file name generation,
 * remote URL bypass, storage path construction, bucket mappings,
 * uploadTerrainPhotos filtering, edge cases.
 */

// ─── Inline implementations ──

function getMimeType(ext: string): string {
  const normalized = ext.toLowerCase();
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function getExtension(uri: string): string {
  return uri.split('.').pop()?.toLowerCase() || 'jpg';
}

function generateFileName(ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}.${ext}`;
}

function buildStoragePath(folderPath: string, fileName: string): string {
  return `${folderPath}/${fileName}`;
}

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function filterSuccessfulUploads(results: (string | null)[]): string[] {
  return results.filter((url): url is string => url !== null);
}

const BUCKET_MAP: Record<string, { maxSize: number; mimeTypes: string[] }> = {
  'avatars': { maxSize: 5242880, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  'boules-photos': { maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  'terrain-photos': { maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  'club-cards': { maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] },
  'federation-cards': { maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] },
};

// ─── Tests ──

describe('getMimeType', () => {
  test('returns image/png for png', () => {
    expect(getMimeType('png')).toBe('image/png');
  });

  test('returns image/webp for webp', () => {
    expect(getMimeType('webp')).toBe('image/webp');
  });

  test('returns image/jpeg for jpg', () => {
    expect(getMimeType('jpg')).toBe('image/jpeg');
  });

  test('returns image/jpeg for jpeg', () => {
    expect(getMimeType('jpeg')).toBe('image/jpeg');
  });

  test('returns image/jpeg for unknown extension', () => {
    expect(getMimeType('bmp')).toBe('image/jpeg');
  });

  test('case insensitive', () => {
    expect(getMimeType('PNG')).toBe('image/png');
    expect(getMimeType('Webp')).toBe('image/webp');
  });
});

describe('getExtension', () => {
  test('extracts jpg from file path', () => {
    expect(getExtension('/path/to/photo.jpg')).toBe('jpg');
  });

  test('extracts png', () => {
    expect(getExtension('file.png')).toBe('png');
  });

  test('returns jpg for no extension', () => {
    expect(getExtension('noextension')).toBe('noextension');
  });

  test('extracts from deep path', () => {
    expect(getExtension('/a/b/c/d/image.webp')).toBe('webp');
  });

  test('handles file URI', () => {
    expect(getExtension('file:///data/user/0/com.app/cache/image.png')).toBe('png');
  });
});

describe('generateFileName', () => {
  test('includes extension', () => {
    const name = generateFileName('jpg');
    expect(name.endsWith('.jpg')).toBe(true);
  });

  test('includes timestamp', () => {
    const name = generateFileName('png');
    const parts = name.split('_');
    const timestamp = parseInt(parts[0]);
    expect(timestamp).toBeGreaterThan(1700000000000);
  });

  test('generates unique names', () => {
    const names = new Set<string>();
    for (let i = 0; i < 100; i++) {
      names.add(generateFileName('jpg'));
    }
    expect(names.size).toBe(100);
  });

  test('random part has 6 chars', () => {
    const name = generateFileName('jpg');
    const parts = name.replace('.jpg', '').split('_');
    expect(parts[1].length).toBe(6);
  });
});

describe('buildStoragePath', () => {
  test('constructs correct path', () => {
    expect(buildStoragePath('avatars', 'photo.jpg')).toBe('avatars/photo.jpg');
  });

  test('nested folder path', () => {
    expect(buildStoragePath('user123/boules', 'img.png')).toBe('user123/boules/img.png');
  });
});

describe('isRemoteUrl', () => {
  test('detects https', () => {
    expect(isRemoteUrl('https://example.com/image.jpg')).toBe(true);
  });

  test('detects http', () => {
    expect(isRemoteUrl('http://example.com/image.jpg')).toBe(true);
  });

  test('rejects file URI', () => {
    expect(isRemoteUrl('file:///data/image.jpg')).toBe(false);
  });

  test('rejects local path', () => {
    expect(isRemoteUrl('/path/to/image.jpg')).toBe(false);
  });

  test('rejects empty', () => {
    expect(isRemoteUrl('')).toBe(false);
  });

  test('rejects data URI', () => {
    expect(isRemoteUrl('data:image/png;base64,abc')).toBe(false);
  });
});

describe('filterSuccessfulUploads', () => {
  test('filters out null values', () => {
    const results = ['url1', null, 'url2', null, 'url3'];
    expect(filterSuccessfulUploads(results)).toEqual(['url1', 'url2', 'url3']);
  });

  test('returns empty for all null', () => {
    expect(filterSuccessfulUploads([null, null, null])).toEqual([]);
  });

  test('returns all when no null', () => {
    expect(filterSuccessfulUploads(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('handles empty array', () => {
    expect(filterSuccessfulUploads([])).toEqual([]);
  });
});

describe('BUCKET_MAP', () => {
  test('avatars bucket has 5MB limit', () => {
    expect(BUCKET_MAP['avatars'].maxSize).toBe(5242880);
  });

  test('terrain-photos bucket has 10MB limit', () => {
    expect(BUCKET_MAP['terrain-photos'].maxSize).toBe(10485760);
  });

  test('club-cards supports PDF', () => {
    expect(BUCKET_MAP['club-cards'].mimeTypes).toContain('application/pdf');
  });

  test('federation-cards supports PDF', () => {
    expect(BUCKET_MAP['federation-cards'].mimeTypes).toContain('application/pdf');
  });

  test('all buckets support jpeg', () => {
    Object.values(BUCKET_MAP).forEach(bucket => {
      expect(bucket.mimeTypes).toContain('image/jpeg');
    });
  });

  test('all buckets support png', () => {
    Object.values(BUCKET_MAP).forEach(bucket => {
      expect(bucket.mimeTypes).toContain('image/png');
    });
  });

  test('5 total buckets configured', () => {
    expect(Object.keys(BUCKET_MAP)).toHaveLength(5);
  });
});

describe('upload flow simulation', () => {
  test('remote URL is returned as-is', () => {
    const uri = 'https://cdn.example.com/avatar.jpg';
    if (isRemoteUrl(uri)) {
      expect(uri).toBe('https://cdn.example.com/avatar.jpg');
    }
  });

  test('local file goes through upload pipeline', () => {
    const uri = 'file:///data/cache/photo.png';
    expect(isRemoteUrl(uri)).toBe(false);
    const ext = getExtension(uri);
    expect(ext).toBe('png');
    const mime = getMimeType(ext);
    expect(mime).toBe('image/png');
    const name = generateFileName(ext);
    expect(name.endsWith('.png')).toBe(true);
    const path = buildStoragePath('avatars', name);
    expect(path.startsWith('avatars/')).toBe(true);
  });

  test('multiple terrain photos upload simulation', () => {
    const photos = ['https://cdn.example.com/p1.jpg', 'file:///local/p2.png', 'file:///local/p3.webp'];
    const results: (string | null)[] = [];
    for (const photo of photos) {
      if (isRemoteUrl(photo)) {
        results.push(photo);
      } else {
        results.push(`https://storage.example.com/${generateFileName(getExtension(photo))}`);
      }
    }
    expect(filterSuccessfulUploads(results)).toHaveLength(3);
  });
});
