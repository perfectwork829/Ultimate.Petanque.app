/**
 * Admin Terrain Service
 *
 * Admin-only functions for managing all terrains:
 * view all, update, delete, and get stats.
 */

import { getSupabaseClient } from '@/template';

export interface AdminTerrain {
  id: string;
  userId: string;
  ownerName?: string;
  name: string;
  address: string;
  city: string;
  type: string;
  description: string | null;
  facilities: string[];
  courtsCount: number;
  lighting: boolean;
  covered: boolean;
  isPublic: boolean;
  publicAccess: boolean;
  environment: string;
  clubName: string | null;
  photos: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch all terrains (admin only).
 */
export async function getAllTerrains(limit = 100): Promise<{ terrains: AdminTerrain[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('terrains')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { terrains: [], error: error.message };

    // Batch fetch owner names
    const userIds = [...new Set((data || []).map((t: any) => t.user_id))];
    const ownerMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, email')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => {
        ownerMap.set(p.id, p.username || p.email || 'Unknown');
      });
    }

    const terrains: AdminTerrain[] = (data || []).map((row: any) => {
      const loc = typeof row.location === 'string' ? JSON.parse(row.location) : (row.location || {});
      return {
        id: row.id,
        userId: row.user_id,
        ownerName: ownerMap.get(row.user_id) || 'Unknown',
        name: row.name,
        address: row.address || '',
        city: row.city,
        type: row.type,
        description: row.description,
        facilities: row.facilities || [],
        courtsCount: row.courts_count || 1,
        lighting: row.lighting || false,
        covered: row.covered || false,
        isPublic: row.is_public !== false,
        publicAccess: row.public_access !== false,
        environment: row.environment || 'outdoor',
        clubName: row.club_name,
        photos: row.photos || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        location: loc,
      } as any;
    });

    return { terrains, error: null };
  } catch (e: any) {
    return { terrains: [], error: e.message };
  }
}

/**
 * Update a terrain (admin only).
 */
export async function adminUpdateTerrain(
  terrainId: string,
  updates: Partial<{
    name: string;
    city: string;
    address: string;
    type: string;
    description: string;
    is_public: boolean;
    public_access: boolean;
    lighting: boolean;
    covered: boolean;
    courts_count: number;
    environment: string;
  }>
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('terrains')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', terrainId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Delete a terrain (admin only).
 */
export async function adminDeleteTerrain(terrainId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('terrains')
      .delete()
      .eq('id', terrainId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalize a terrain name for similarity comparison.
 */
function normalizeName(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check name similarity (0-1 score).
 */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  // Character overlap
  const setA = new Set(na.split(''));
  const setB = new Set(nb.split(''));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  return intersection / Math.max(setA.size, setB.size, 1);
}

export interface DuplicateGroup {
  terrains: AdminTerrain[];
  distanceM: number;
  nameSimilarity: number;
}

/**
 * Detect potential duplicate terrains based on proximity (<200m) and name similarity (>0.6).
 */
export function detectDuplicateTerrains(terrains: AdminTerrain[], thresholdM = 200, nameThreshold = 0.6): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();

  for (let i = 0; i < terrains.length; i++) {
    if (used.has(terrains[i].id)) continue;
    const a = terrains[i];
    const locA = parseLocation(a);
    if (!locA) continue;

    const group: AdminTerrain[] = [a];
    let bestDist = Infinity;
    let bestSim = 0;

    for (let j = i + 1; j < terrains.length; j++) {
      if (used.has(terrains[j].id)) continue;
      const b = terrains[j];
      const locB = parseLocation(b);
      if (!locB) continue;

      const dist = haversineDistanceM(locA.lat, locA.lng, locB.lat, locB.lng);
      if (dist > thresholdM) continue;

      const sim = nameSimilarity(a.name, b.name);
      if (sim < nameThreshold) continue;

      group.push(b);
      used.add(b.id);
      bestDist = Math.min(bestDist, dist);
      bestSim = Math.max(bestSim, sim);
    }

    if (group.length > 1) {
      used.add(a.id);
      groups.push({ terrains: group, distanceM: Math.round(bestDist), nameSimilarity: Math.round(bestSim * 100) / 100 });
    }
  }

  return groups;
}

function parseLocation(terrain: AdminTerrain): { lat: number; lng: number } | null {
  // The terrain object has address but not direct lat/lng. We need to check raw data.
  // Since we store location as jsonb with latitude/longitude in terrains table,
  // we need to extend AdminTerrain to include these.
  const t = terrain as any;
  if (t.latitude && t.longitude) return { lat: t.latitude, lng: t.longitude };
  if (t.location?.latitude && t.location?.longitude) return { lat: t.location.latitude, lng: t.location.longitude };
  return null;
}

/**
 * Get a preview of what will be affected by merging two terrains.
 */
export async function getMergePreview(keepId: string, deleteId: string): Promise<{ preview: { matches: number; challenges: number; tournaments: number; meetups: number; clubs: number; players: number; events: number }; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const [matchesRes, challengesRes, tournamentsRes, meetupsRes, clubsRes, playersRes, eventsRes] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('challenges').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('terrain_meetups').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('clubs').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
      supabase.from('sponsored_events').select('id', { count: 'exact', head: true }).eq('terrain_id', deleteId),
    ]);
    return {
      preview: {
        matches: matchesRes.count || 0,
        challenges: challengesRes.count || 0,
        tournaments: tournamentsRes.count || 0,
        meetups: meetupsRes.count || 0,
        clubs: clubsRes.count || 0,
        players: playersRes.count || 0,
        events: eventsRes.count || 0,
      },
      error: null,
    };
  } catch (e: any) {
    return { preview: { matches: 0, challenges: 0, tournaments: 0, meetups: 0, clubs: 0, players: 0, events: 0 }, error: e.message };
  }
}

/**
 * Merge duplicate terrains: keep the most complete one, transfer references, delete the other.
 */
export async function mergeTerrains(keepId: string, deleteId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Transfer matches referencing the deleted terrain
    await supabase
      .from('matches')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer challenges referencing the deleted terrain
    await supabase
      .from('challenges')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer tournaments referencing the deleted terrain
    await supabase
      .from('tournaments')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer meetups referencing the deleted terrain
    await supabase
      .from('terrain_meetups')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer clubs that reference this terrain
    await supabase
      .from('clubs')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer players who have this as favorite terrain
    await supabase
      .from('players')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Transfer sponsored events
    await supabase
      .from('sponsored_events')
      .update({ terrain_id: keepId })
      .eq('terrain_id', deleteId);

    // Now delete the duplicate terrain
    const { error: delError } = await supabase
      .from('terrains')
      .delete()
      .eq('id', deleteId);

    if (delError) return { error: delError.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Pick the most complete terrain from a pair (more photos, description, facilities).
 */
export function pickBestTerrain(a: AdminTerrain, b: AdminTerrain): { keepId: string; deleteId: string } {
  let scoreA = 0;
  let scoreB = 0;

  if (a.description) scoreA += 2;
  if (b.description) scoreB += 2;
  scoreA += (a.photos?.length || 0) * 2;
  scoreB += (b.photos?.length || 0) * 2;
  scoreA += (a.facilities?.length || 0);
  scoreB += (b.facilities?.length || 0);
  if (a.clubName) scoreA += 1;
  if (b.clubName) scoreB += 1;
  if (a.lighting) scoreA += 1;
  if (b.lighting) scoreB += 1;
  if (a.covered) scoreA += 1;
  if (b.covered) scoreB += 1;
  if (a.courtsCount > 1) scoreA += 1;
  if (b.courtsCount > 1) scoreB += 1;

  return scoreA >= scoreB
    ? { keepId: a.id, deleteId: b.id }
    : { keepId: b.id, deleteId: a.id };
}

/**
 * Get terrain stats for admin dashboard.
 */
export async function getTerrainStats(): Promise<{
  total: number;
  public: number;
  private: number;
  withLighting: number;
  covered: number;
  byType: Record<string, number>;
  byCity: { city: string; count: number }[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('terrains').select('is_public, lighting, covered, type, city');

    const all = data || [];
    const byType: Record<string, number> = {};
    const cityMap = new Map<string, number>();

    all.forEach((t: any) => {
      const type = t.type || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
      if (t.city) cityMap.set(t.city, (cityMap.get(t.city) || 0) + 1);
    });

    const byCity = [...cityMap.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: all.length,
      public: all.filter((t: any) => t.is_public !== false).length,
      private: all.filter((t: any) => t.is_public === false).length,
      withLighting: all.filter((t: any) => t.lighting).length,
      covered: all.filter((t: any) => t.covered).length,
      byType,
      byCity,
    };
  } catch {
    return { total: 0, public: 0, private: 0, withLighting: 0, covered: 0, byType: {}, byCity: [] };
  }
}
