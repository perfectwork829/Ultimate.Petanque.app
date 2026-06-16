// ============================================
// Location Service - Web stub (no-op)
// expo-location is not fully available on web
// ============================================

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export async function geocodeAsync(_address: string): Promise<Array<{ latitude: number; longitude: number }>> {
  return [];
}

export async function reverseGeocodeAsync(_location: { latitude: number; longitude: number }): Promise<Array<{
  city?: string | null;
  country?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  name?: string | null;
  region?: string | null;
  subregion?: string | null;
}>> {
  return [];
}

export async function getCurrentPositionAsync(_options?: any): Promise<{
  coords: { latitude: number; longitude: number; altitude: number | null; accuracy: number | null; heading: number | null; speed: number | null };
  timestamp: number;
}> {
  // Try browser Geolocation API as fallback
  return new Promise((resolve, reject) => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
            },
            timestamp: position.timestamp,
          });
        },
        (error) => reject(new Error(error.message)),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      reject(new Error('Geolocation not available on this platform'));
    }
  });
}

export async function getForegroundPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'undetermined' };
}

export async function requestForegroundPermissionsAsync(): Promise<{ status: string }> {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return { status: result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'undetermined' };
    } catch {
      return { status: 'undetermined' };
    }
  }
  return { status: 'undetermined' };
}
