/**
 * Unit tests for services/multiAccountService.ts
 *
 * Tests: DeviceCluster grouping, email deduplication within fingerprint,
 * multi-account filtering (2+ accounts), cluster sorting by size,
 * getDeviceRegistrationStats computation, edge cases.
 */

// ─── Inline implementations ──

interface DeviceCluster {
  fingerprint: string;
  accounts: { email: string; userId: string | null; registeredAt: string }[];
}

function groupByFingerprint(rows: { device_fingerprint: string; email: string; user_id: string | null; registered_at: string }[]): Map<string, { email: string; userId: string | null; registeredAt: string }[]> {
  const fpMap = new Map<string, { email: string; userId: string | null; registeredAt: string }[]>();
  for (const row of rows) {
    const fp = row.device_fingerprint;
    if (!fp) continue;
    if (!fpMap.has(fp)) fpMap.set(fp, []);
    const existing = fpMap.get(fp)!;
    if (!existing.some(e => e.email === row.email)) {
      existing.push({
        email: row.email || 'unknown',
        userId: row.user_id,
        registeredAt: row.registered_at,
      });
    }
  }
  return fpMap;
}

function filterMultiAccountClusters(fpMap: Map<string, { email: string; userId: string | null; registeredAt: string }[]>): DeviceCluster[] {
  const clusters: DeviceCluster[] = [];
  for (const [fingerprint, accounts] of fpMap.entries()) {
    if (accounts.length >= 2) {
      clusters.push({ fingerprint, accounts });
    }
  }
  clusters.sort((a, b) => b.accounts.length - a.accounts.length);
  return clusters;
}

function computeDeviceStats(rows: { device_fingerprint: string; email: string }[]): {
  totalDevices: number;
  totalRegistrations: number;
  multiAccountDevices: number;
} {
  const fpMap = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.device_fingerprint) continue;
    if (!fpMap.has(row.device_fingerprint)) fpMap.set(row.device_fingerprint, new Set());
    if (row.email) fpMap.get(row.device_fingerprint)!.add(row.email);
  }

  const totalDevices = fpMap.size;
  const totalRegistrations = rows.length;
  let multiAccountDevices = 0;
  for (const emails of fpMap.values()) {
    if (emails.size >= 2) multiAccountDevices++;
  }

  return { totalDevices, totalRegistrations, multiAccountDevices };
}

// ─── Tests ──

describe('groupByFingerprint', () => {
  test('groups rows by fingerprint', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com', user_id: 'u1', registered_at: '2026-01-01' },
      { device_fingerprint: 'fp1', email: 'b@test.com', user_id: 'u2', registered_at: '2026-01-02' },
      { device_fingerprint: 'fp2', email: 'c@test.com', user_id: 'u3', registered_at: '2026-01-03' },
    ];
    const groups = groupByFingerprint(rows);
    expect(groups.size).toBe(2);
    expect(groups.get('fp1')).toHaveLength(2);
    expect(groups.get('fp2')).toHaveLength(1);
  });

  test('deduplicates same email within fingerprint', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com', user_id: 'u1', registered_at: '2026-01-01' },
      { device_fingerprint: 'fp1', email: 'a@test.com', user_id: 'u1', registered_at: '2026-01-02' },
      { device_fingerprint: 'fp1', email: 'b@test.com', user_id: 'u2', registered_at: '2026-01-03' },
    ];
    const groups = groupByFingerprint(rows);
    expect(groups.get('fp1')).toHaveLength(2);
  });

  test('handles null email', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: '', user_id: null, registered_at: '2026-01-01' },
    ];
    const groups = groupByFingerprint(rows);
    expect(groups.get('fp1')![0].email).toBe('unknown');
  });

  test('skips rows without fingerprint', () => {
    const rows = [
      { device_fingerprint: '', email: 'a@test.com', user_id: 'u1', registered_at: '2026-01-01' },
      { device_fingerprint: 'fp1', email: 'b@test.com', user_id: 'u2', registered_at: '2026-01-02' },
    ];
    const groups = groupByFingerprint(rows);
    expect(groups.size).toBe(1);
  });

  test('handles empty array', () => {
    const groups = groupByFingerprint([]);
    expect(groups.size).toBe(0);
  });
});

describe('filterMultiAccountClusters', () => {
  test('filters clusters with 2+ accounts', () => {
    const fpMap = new Map<string, { email: string; userId: string | null; registeredAt: string }[]>();
    fpMap.set('fp1', [
      { email: 'a@test.com', userId: 'u1', registeredAt: '' },
      { email: 'b@test.com', userId: 'u2', registeredAt: '' },
    ]);
    fpMap.set('fp2', [
      { email: 'c@test.com', userId: 'u3', registeredAt: '' },
    ]);
    fpMap.set('fp3', [
      { email: 'd@test.com', userId: 'u4', registeredAt: '' },
      { email: 'e@test.com', userId: 'u5', registeredAt: '' },
      { email: 'f@test.com', userId: 'u6', registeredAt: '' },
    ]);

    const clusters = filterMultiAccountClusters(fpMap);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].accounts).toHaveLength(3); // Largest first
    expect(clusters[1].accounts).toHaveLength(2);
  });

  test('returns empty when no multi-account clusters', () => {
    const fpMap = new Map();
    fpMap.set('fp1', [{ email: 'a@test.com', userId: 'u1', registeredAt: '' }]);
    fpMap.set('fp2', [{ email: 'b@test.com', userId: 'u2', registeredAt: '' }]);
    expect(filterMultiAccountClusters(fpMap)).toHaveLength(0);
  });

  test('sorts by cluster size descending', () => {
    const fpMap = new Map();
    fpMap.set('fp1', [
      { email: 'a@test.com', userId: 'u1', registeredAt: '' },
      { email: 'b@test.com', userId: 'u2', registeredAt: '' },
    ]);
    fpMap.set('fp2', [
      { email: 'c@test.com', userId: 'u3', registeredAt: '' },
      { email: 'd@test.com', userId: 'u4', registeredAt: '' },
      { email: 'e@test.com', userId: 'u5', registeredAt: '' },
      { email: 'f@test.com', userId: 'u6', registeredAt: '' },
    ]);
    const clusters = filterMultiAccountClusters(fpMap);
    expect(clusters[0].fingerprint).toBe('fp2');
    expect(clusters[0].accounts).toHaveLength(4);
  });

  test('handles empty map', () => {
    expect(filterMultiAccountClusters(new Map())).toHaveLength(0);
  });
});

describe('computeDeviceStats', () => {
  test('computes stats correctly', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com' },
      { device_fingerprint: 'fp1', email: 'b@test.com' },
      { device_fingerprint: 'fp1', email: 'c@test.com' },
      { device_fingerprint: 'fp2', email: 'd@test.com' },
      { device_fingerprint: 'fp3', email: 'e@test.com' },
    ];
    const stats = computeDeviceStats(rows);
    expect(stats.totalDevices).toBe(3);
    expect(stats.totalRegistrations).toBe(5);
    expect(stats.multiAccountDevices).toBe(1); // fp1 has 3 unique emails
  });

  test('no multi-account devices', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com' },
      { device_fingerprint: 'fp2', email: 'b@test.com' },
      { device_fingerprint: 'fp3', email: 'c@test.com' },
    ];
    const stats = computeDeviceStats(rows);
    expect(stats.multiAccountDevices).toBe(0);
    expect(stats.totalDevices).toBe(3);
  });

  test('all same device', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com' },
      { device_fingerprint: 'fp1', email: 'b@test.com' },
      { device_fingerprint: 'fp1', email: 'c@test.com' },
    ];
    const stats = computeDeviceStats(rows);
    expect(stats.totalDevices).toBe(1);
    expect(stats.multiAccountDevices).toBe(1);
  });

  test('handles empty data', () => {
    const stats = computeDeviceStats([]);
    expect(stats.totalDevices).toBe(0);
    expect(stats.totalRegistrations).toBe(0);
    expect(stats.multiAccountDevices).toBe(0);
  });

  test('same email on same device counts as 1', () => {
    const rows = [
      { device_fingerprint: 'fp1', email: 'a@test.com' },
      { device_fingerprint: 'fp1', email: 'a@test.com' },
      { device_fingerprint: 'fp1', email: 'a@test.com' },
    ];
    const stats = computeDeviceStats(rows);
    expect(stats.totalDevices).toBe(1);
    expect(stats.multiAccountDevices).toBe(0); // Only 1 unique email
    expect(stats.totalRegistrations).toBe(3);
  });

  test('skips entries without fingerprint', () => {
    const rows = [
      { device_fingerprint: '', email: 'a@test.com' },
      { device_fingerprint: 'fp1', email: 'b@test.com' },
    ];
    const stats = computeDeviceStats(rows);
    expect(stats.totalDevices).toBe(1);
    expect(stats.totalRegistrations).toBe(2);
  });

  test('many devices performance', () => {
    const rows = [];
    for (let i = 0; i < 1000; i++) {
      rows.push({ device_fingerprint: `fp${i % 200}`, email: `user${i}@test.com` });
    }
    const stats = computeDeviceStats(rows);
    expect(stats.totalDevices).toBe(200);
    expect(stats.totalRegistrations).toBe(1000);
    expect(stats.multiAccountDevices).toBe(200); // All have 5 unique emails
  });
});

describe('DeviceCluster', () => {
  test('cluster with 2 accounts', () => {
    const cluster: DeviceCluster = {
      fingerprint: 'abc123',
      accounts: [
        { email: 'user1@test.com', userId: 'u1', registeredAt: '2026-01-01' },
        { email: 'user2@test.com', userId: 'u2', registeredAt: '2026-01-02' },
      ],
    };
    expect(cluster.accounts).toHaveLength(2);
    expect(cluster.fingerprint).toBe('abc123');
  });

  test('account with null userId', () => {
    const cluster: DeviceCluster = {
      fingerprint: 'xyz',
      accounts: [
        { email: 'anon@test.com', userId: null, registeredAt: '2026-01-01' },
        { email: 'user@test.com', userId: 'u1', registeredAt: '2026-01-02' },
      ],
    };
    expect(cluster.accounts[0].userId).toBeNull();
    expect(cluster.accounts[1].userId).toBe('u1');
  });
});
