/**
 * Terrain Proximity Service
 *
 * Detects nearby active terrains based on user location, match history, 
 * scheduled meetups, and ongoing tournaments.
 */
import { getSupabaseClient } from '@/template';
import { getCurrentPositionAsync, requestForegroundPermissionsAsync, Accuracy } from '@/services/location';

export interface NearbyActiveTerrain {
  id: string;
  name: string;
  city: string;
  type: string;
  distance: number; // meters
  activityScore: number;
  activityLabel: string;
  latitude: number;
  longitude: number;
  hasMeetupToday: boolean;
  hasTournamentToday: boolean;
  matchCountAtSlot: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in meters.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Haversine distance in kilometers. */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineDistance(lat1, lon1, lat2, lon2) / 1000;
}

/**
 * Get user's current location with permission check.
 */
async function getUserLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Fetch all terrains with valid locations from Supabase (own + public).
 */
async function fetchTerrainsWithLocations(): Promise<
  { id: string; name: string; city: string; type: string; latitude: number; longitude: number; userId: string }[]
> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const results: { id: string; name: string; city: string; type: string; latitude: number; longitude: number; userId: string }[] = [];
  const seen = new Set<string>();

  // Own terrains
  if (userId) {
    const { data: own } = await supabase
      .from('terrains')
      .select('id, name, city, type, location, user_id')
      .eq('user_id', userId);
    (own || []).forEach((t: any) => {
      if (t.location?.latitude && t.location?.longitude && !seen.has(t.id)) {
        seen.add(t.id);
        results.push({ id: t.id, name: t.name, city: t.city, type: t.type, latitude: t.location.latitude, longitude: t.location.longitude, userId: t.user_id });
      }
    });
  }

  // Public terrains
  const { data: pub } = await supabase
    .from('terrains')
    .select('id, name, city, type, location, user_id')
    .eq('is_public', true);
  (pub || []).forEach((t: any) => {
    if (t.location?.latitude && t.location?.longitude && !seen.has(t.id)) {
      seen.add(t.id);
      results.push({ id: t.id, name: t.name, city: t.city, type: t.type, latitude: t.location.latitude, longitude: t.location.longitude, userId: t.user_id });
    }
  });

  return results;
}

/**
 * Compute activity score for a terrain at the current time.
 * Factors: match history (same weekday + hour), meetups today, tournaments today.
 */
async function computeTerrainActivityScore(
  terrainId: string,
  now: Date,
  language: string
): Promise<{ score: number; label: string; hasMeetupToday: boolean; hasTournamentToday: boolean; matchCountAtSlot: number }> {
  const supabase = getSupabaseClient();
  const currentDow = now.getDay();
  const currentHour = now.getHours();
  const todayStr = now.toISOString().slice(0, 10);

  let score = 0;
  let matchCountAtSlot = 0;
  let sameDayCount = 0;

  // Fetch matches at this terrain
  const { data: matches } = await supabase
    .from('matches')
    .select('date')
    .eq('terrain_id', terrainId)
    .limit(200);

  (matches || []).forEach((m: any) => {
    const d = new Date(m.date);
    if (d.getDay() === currentDow) {
      sameDayCount++;
      score += 3;
      if (Math.abs(d.getHours() - currentHour) <= 2) {
        matchCountAtSlot++;
        score += 10;
      }
    }
  });

  // Fetch meetups today at this terrain
  const { data: meetups } = await supabase
    .from('terrain_meetups')
    .select('id, date, status')
    .eq('terrain_id', terrainId)
    .eq('status', 'active');

  let hasMeetupToday = false;
  (meetups || []).forEach((mt: any) => {
    const mtDate = new Date(mt.date);
    if (mtDate.toISOString().slice(0, 10) === todayStr) {
      hasMeetupToday = true;
      score += 30; // Meetup today = very high signal
    }
  });

  // Fetch tournaments today at this terrain
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date, status')
    .eq('terrain_id', terrainId)
    .in('status', ['En cours', 'À venir']);

  let hasTournamentToday = false;
  (tournaments || []).forEach((t: any) => {
    if (t.date && t.date.slice(0, 10) === todayStr) {
      hasTournamentToday = true;
      score += 25;
    }
    if (t.status === 'En cours') {
      score += 15;
    }
  });

  // Build label
  const dayNames = language === 'fr' ? ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let label = '';
  if (hasMeetupToday) {
    label = language === 'fr' ? 'RDV prevu aujourd\'hui' : 'Meetup scheduled today';
  } else if (hasTournamentToday) {
    label = language === 'fr' ? 'Tournoi aujourd\'hui' : 'Tournament today';
  } else if (matchCountAtSlot > 0) {
    label = `${matchCountAtSlot} ${language === 'fr' ? 'partie(s)' : 'game(s)'} ${dayNames[currentDow]} ~${currentHour}h`;
  } else if (sameDayCount > 0) {
    label = `${sameDayCount} ${language === 'fr' ? 'partie(s) le' : 'game(s) on'} ${dayNames[currentDow]}`;
  }

  return { score, label, hasMeetupToday, hasTournamentToday, matchCountAtSlot };
}

/**
 * Main function: Find nearby active terrains.
 * 
 * @param radiusMeters - Search radius in meters (default 3000m = 3km)
 * @param language - 'fr' or 'en'
 * @returns Array of nearby active terrains sorted by proximity
 */
export async function findNearbyActiveTerrains(
  radiusMeters: number = 3000,
  language: string = 'fr'
): Promise<{ terrains: NearbyActiveTerrain[]; userLocation: { latitude: number; longitude: number } | null; error: string | null }> {
  try {
    // 1. Get user location
    const userLoc = await getUserLocation();
    if (!userLoc) {
      return { terrains: [], userLocation: null, error: 'location_unavailable' };
    }

    // 2. Fetch all geolocated terrains
    const allTerrains = await fetchTerrainsWithLocations();
    if (allTerrains.length === 0) {
      return { terrains: [], userLocation: userLoc, error: null };
    }

    // 3. Filter by proximity
    const now = new Date();
    const nearbyTerrains = allTerrains
      .map(t => ({
        ...t,
        distance: haversineDistance(userLoc.latitude, userLoc.longitude, t.latitude, t.longitude),
      }))
      .filter(t => t.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance);

    if (nearbyTerrains.length === 0) {
      return { terrains: [], userLocation: userLoc, error: null };
    }

    // 4. Compute activity scores (limit to top 10 closest to avoid too many queries)
    const candidates = nearbyTerrains.slice(0, 10);
    const results: NearbyActiveTerrain[] = [];

    for (const t of candidates) {
      const activity = await computeTerrainActivityScore(t.id, now, language);
      if (activity.score > 0) {
        results.push({
          id: t.id,
          name: t.name,
          city: t.city,
          type: t.type,
          distance: Math.round(t.distance),
          activityScore: activity.score,
          activityLabel: activity.label,
          latitude: t.latitude,
          longitude: t.longitude,
          hasMeetupToday: activity.hasMeetupToday,
          hasTournamentToday: activity.hasTournamentToday,
          matchCountAtSlot: activity.matchCountAtSlot,
        });
      }
    }

    // Sort by activity score descending
    results.sort((a, b) => b.activityScore - a.activityScore);

    return { terrains: results, userLocation: userLoc, error: null };
  } catch (e: any) {
    console.log('[ProximityService] Error:', e.message);
    return { terrains: [], userLocation: null, error: e.message };
  }
}

/**
 * Format distance for display.
 */
export function formatDistance(meters: number, language: string): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km}km`;
}
