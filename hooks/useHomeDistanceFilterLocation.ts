import { useState, useCallback, useRef } from 'react';
import {
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  Accuracy,
} from '@/services/location';

export type HomeUserLocation = { lat: number; lng: number };

/**
 * Requests foreground GPS for home distance filters.
 * On web, still attempts getCurrentPosition when permission is undetermined so the browser can prompt.
 */
export function useHomeDistanceFilterLocation() {
  const [location, setLocation] = useState<HomeUserLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const inFlightRef = useRef<Promise<HomeUserLocation | null> | null>(null);

  const requestLocation = useCallback(async (): Promise<HomeUserLocation | null> => {
    if (location) return location;
    if (inFlightRef.current) return inFlightRef.current;

    const task = (async () => {
      setLoading(true);
      setDenied(false);
      try {
        let { status } = await getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const requested = await requestForegroundPermissionsAsync();
          status = requested.status;
        }
        if (status === 'denied') {
          setDenied(true);
          return null;
        }
        const pos = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        return loc;
      } catch {
        setDenied(true);
        return null;
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, [location]);

  return { location, loading, denied, requestLocation };
}
