import { haversineDistanceKm } from '@/services/terrainProximityService';
import { ensureMapCoordinates, isValidMapCoord } from '@/utils/mapPlayerLocation';
import type { Terrain, Tournament } from '@/types/petanque';

export type DistanceFilter = 'all' | '5' | '10' | '25' | '50' | '100';

export const HOME_DISTANCE_OPTIONS: DistanceFilter[] = ['all', '5', '10', '25', '50', '100'];

export function getTournamentCoordsSync(t: Tournament, terrains: Terrain[]): { lat: number; lng: number } | null {
  if (isValidMapCoord(t.location?.latitude, t.location?.longitude)) {
    return { lat: t.location!.latitude!, lng: t.location!.longitude! };
  }
  if (t.terrainId) {
    const tr = terrains.find(terrain => terrain.id === t.terrainId);
    if (tr && isValidMapCoord(tr.location?.latitude, tr.location?.longitude)) {
      return { lat: tr.location!.latitude!, lng: tr.location!.longitude! };
    }
  }
  return null;
}

export async function resolveTournamentCoords(
  t: Tournament,
  terrains: Terrain[],
): Promise<{ lat: number; lng: number } | null> {
  const sync = getTournamentCoordsSync(t, terrains);
  if (sync) return sync;
  const loc = t.location as { city?: string; country?: string } | undefined;
  const city = loc?.city?.trim();
  if (!city) return null;
  const resolved = await ensureMapCoordinates(loc, city);
  if (!resolved) return null;
  return { lat: resolved.latitude, lng: resolved.longitude };
}

export type UpcomingItemLike = {
  id: string;
  type: 'tournament' | 'meetup' | 'challenge';
  data: any;
};

export function getUpcomingItemCoordsSync(item: UpcomingItemLike, terrains: Terrain[]): { lat: number; lng: number } | null {
  if (item.type === 'tournament') {
    return getTournamentCoordsSync(item.data as Tournament, terrains);
  }
  if (item.type === 'meetup') {
    const tr = terrains.find(t => t.id === item.data.terrain_id);
    if (tr && isValidMapCoord(tr.location?.latitude, tr.location?.longitude)) {
      return { lat: tr.location!.latitude!, lng: tr.location!.longitude! };
    }
  }
  if (item.type === 'challenge' && item.data.terrainId) {
    const tr = terrains.find(t => t.id === item.data.terrainId);
    if (tr && isValidMapCoord(tr.location?.latitude, tr.location?.longitude)) {
      return { lat: tr.location!.latitude!, lng: tr.location!.longitude! };
    }
  }
  return null;
}

export async function resolveUpcomingItemCoords(
  item: UpcomingItemLike,
  terrains: Terrain[],
): Promise<{ lat: number; lng: number } | null> {
  const sync = getUpcomingItemCoordsSync(item, terrains);
  if (sync) return sync;

  if (item.type === 'tournament') {
    return resolveTournamentCoords(item.data as Tournament, terrains);
  }
  if (item.type === 'challenge') {
    const city = item.data.city?.trim();
    if (!city) return null;
    const resolved = await ensureMapCoordinates({ city, country: item.data.country }, city);
    if (!resolved) return null;
    return { lat: resolved.latitude, lng: resolved.longitude };
  }
  return null;
}

export async function buildCoordsMap<T extends { id: string }>(
  items: T[],
  resolveCoords: (item: T) => Promise<{ lat: number; lng: number } | null>,
): Promise<Map<string, { lat: number; lng: number }>> {
  const entries = await Promise.all(
    items.map(async item => {
      const coords = await resolveCoords(item);
      return coords ? ([item.id, coords] as const) : null;
    }),
  );
  return new Map(entries.filter((e): e is [string, { lat: number; lng: number }] => e !== null));
}

export function filterItemsByDistance<T extends { id: string }>(
  items: T[],
  coordsMap: Map<string, { lat: number; lng: number }>,
  userLocation: { lat: number; lng: number },
  maxKm: number,
): Array<T & { distanceKm: number }> {
  return items
    .map(item => {
      const coords = coordsMap.get(item.id);
      if (!coords) return null;
      const distanceKm = haversineDistanceKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng);
      if (distanceKm > maxKm) return null;
      return { ...item, distanceKm };
    })
    .filter((item): item is T & { distanceKm: number } => item !== null);
}
