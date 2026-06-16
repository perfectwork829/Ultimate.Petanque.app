import { geocodeAsync } from '@/services/location.native';

const cityGeocodeCache = new Map<string, { lat: number; lng: number }>();

/** Coerce DB / form values to a finite map latitude or longitude (default 0). */
export function toMapCoord(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isValidMapCoord(lat: unknown, lng: unknown): boolean {
  const la = toMapCoord(lat);
  const ln = toMapCoord(lng);
  if (la === 0 && ln === 0) return false;
  return Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

export function isMapPartnerBadge(badgeType?: string | null): boolean {
  return badgeType === 'gold_sponsor' || badgeType === 'sponsor' || badgeType === 'partner';
}

/**
 * Resolve coordinates for map pins. City-only profiles are geocoded once and cached in memory.
 */
export async function ensureMapCoordinates(
  location: { city?: string; country?: string; latitude?: number; longitude?: number; address?: string } | null | undefined,
  cityField?: string | null
): Promise<{ city?: string; country?: string; latitude: number; longitude: number; address?: string } | null> {
  const city = (location?.city || cityField || '').trim();
  if (isValidMapCoord(location?.latitude, location?.longitude)) {
    return {
      city: city || location?.city,
      country: location?.country,
      address: location?.address,
      latitude: location!.latitude!,
      longitude: location!.longitude!,
    };
  }
  if (!city) return null;

  const country = location?.country || 'France';
  const cacheKey = `${city}|${country}`;
  const cached = cityGeocodeCache.get(cacheKey);
  if (cached) {
    return { city, country, address: city, latitude: cached.lat, longitude: cached.lng };
  }

  try {
    const results = await geocodeAsync(`${city}, ${country}`);
    const hit = results?.[0];
    if (hit && isValidMapCoord(hit.latitude, hit.longitude)) {
      cityGeocodeCache.set(cacheKey, { lat: hit.latitude, lng: hit.longitude });
      return { city, country, address: city, latitude: hit.latitude, longitude: hit.longitude };
    }
  } catch {
    /* geocoder unavailable */
  }
  return null;
}
