// ============================================
// MULTI-ACCOUNT DETECTION SERVICE
// Queries device_registrations to find accounts
// sharing the same device fingerprint
// ============================================

import { getSupabaseClient } from '@/template';

export interface DeviceCluster {
  fingerprint: string;
  accounts: { email: string; userId: string | null; registeredAt: string }[];
}

/**
 * Fetch all device clusters (fingerprints with 2+ accounts)
 * Returns grouped accounts sorted by cluster size descending
 */
export async function fetchDeviceClusters(): Promise<{ clusters: DeviceCluster[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .select('device_fingerprint, email, user_id, registered_at')
      .order('registered_at', { ascending: false });

    if (error) return { clusters: [], error: error.message };

    // Group by fingerprint
    const fpMap = new Map<string, { email: string; userId: string | null; registeredAt: string }[]>();
    for (const row of data || []) {
      const fp = row.device_fingerprint;
      if (!fp) continue;
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      // Avoid duplicate emails in same fingerprint
      const existing = fpMap.get(fp)!;
      if (!existing.some(e => e.email === row.email)) {
        existing.push({
          email: row.email || 'unknown',
          userId: row.user_id,
          registeredAt: row.registered_at,
        });
      }
    }

    // Filter to clusters with 2+ accounts
    const clusters: DeviceCluster[] = [];
    for (const [fingerprint, accounts] of fpMap.entries()) {
      if (accounts.length >= 2) {
        clusters.push({ fingerprint, accounts });
      }
    }

    // Sort by cluster size descending
    clusters.sort((a, b) => b.accounts.length - a.accounts.length);

    return { clusters, error: null };
  } catch (e: any) {
    return { clusters: [], error: e.message || 'Unknown error' };
  }
}

/**
 * Get total number of device registrations
 */
export async function getDeviceRegistrationStats(): Promise<{
  totalDevices: number;
  totalRegistrations: number;
  multiAccountDevices: number;
  error: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .select('device_fingerprint, email');

    if (error) return { totalDevices: 0, totalRegistrations: 0, multiAccountDevices: 0, error: error.message };

    const fpMap = new Map<string, Set<string>>();
    for (const row of data || []) {
      if (!row.device_fingerprint) continue;
      if (!fpMap.has(row.device_fingerprint)) fpMap.set(row.device_fingerprint, new Set());
      if (row.email) fpMap.get(row.device_fingerprint)!.add(row.email);
    }

    const totalDevices = fpMap.size;
    const totalRegistrations = (data || []).length;
    let multiAccountDevices = 0;
    for (const emails of fpMap.values()) {
      if (emails.size >= 2) multiAccountDevices++;
    }

    return { totalDevices, totalRegistrations, multiAccountDevices, error: null };
  } catch (e: any) {
    return { totalDevices: 0, totalRegistrations: 0, multiAccountDevices: 0, error: e.message };
  }
}
