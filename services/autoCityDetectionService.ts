/**
 * Auto-City Detection Service
 *
 * Detects when a user's GPS location has moved significantly from their
 * stored player city (>50km), and prompts them to update their city
 * so the geographic leaderboard reflects their current location.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LAST_CHECK_KEY = '@auto_city_last_check';
const LAST_PROMPT_KEY = '@auto_city_last_prompt';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 check per day
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // Don't re-prompt for 7 days
const DISTANCE_THRESHOLD_KM = 50; // Trigger at 50km distance

export interface CityChangeDetection {
  detected: boolean;
  newCity: string;
  newCountry: string;
  oldCity: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
}

/**
 * Haversine distance between two GPS coordinates (km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if the user has moved significantly from their stored city.
 * Returns detection result if city change is detected, or null if no check needed.
 */
export async function checkCityChange(params: {
  playerCity: string | null | undefined;
  playerCountry: string | null | undefined;
  playerLocationLat: number | null | undefined;
  playerLocationLng: number | null | undefined;
}): Promise<CityChangeDetection | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { playerCity, playerCountry, playerLocationLat, playerLocationLng } = params;

    // Need a stored city to compare against
    if (!playerCity) return null;

    // Check cooldowns
    const now = Date.now();
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (lastCheck && now - parseInt(lastCheck, 10) < CHECK_INTERVAL_MS) return null;

    const lastPrompt = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    if (lastPrompt && now - parseInt(lastPrompt, 10) < PROMPT_COOLDOWN_MS) return null;

    // Mark check time
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(now));

    // Get current GPS position
    const Location = require('./location');
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;

    // Compare with stored player location
    if (playerLocationLat && playerLocationLng) {
      const distance = haversineDistance(currentLat, currentLng, playerLocationLat, playerLocationLng);
      if (distance < DISTANCE_THRESHOLD_KM) return null; // Still close enough
    }

    // Reverse geocode current position to get city
    const [result] = await Location.reverseGeocodeAsync({
      latitude: currentLat,
      longitude: currentLng,
    });

    if (!result) return null;

    const newCity = result.city || result.subregion || result.region || '';
    const newCountry = result.country || playerCountry || 'France';

    // No city detected or same city
    if (!newCity) return null;
    if (newCity.toLowerCase() === (playerCity || '').toLowerCase()) return null;

    // Calculate distance from stored location
    let distanceKm = 0;
    if (playerLocationLat && playerLocationLng) {
      distanceKm = Math.round(haversineDistance(currentLat, currentLng, playerLocationLat, playerLocationLng));
    } else {
      distanceKm = DISTANCE_THRESHOLD_KM + 1; // Force prompt if no stored location
    }

    if (distanceKm < DISTANCE_THRESHOLD_KM) return null;

    return {
      detected: true,
      newCity,
      newCountry,
      oldCity: playerCity,
      distanceKm,
      latitude: currentLat,
      longitude: currentLng,
    };
  } catch (e) {
    console.log('[AutoCityDetection] Error:', e);
    return null;
  }
}

/**
 * Mark that the prompt was shown (to avoid re-prompting for 7 days)
 */
export async function markCityPromptShown(): Promise<void> {
  await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
}

/**
 * Reset cooldowns (e.g., after user manually updates city)
 */
export async function resetCityDetectionCooldowns(): Promise<void> {
  await AsyncStorage.multiRemove([LAST_CHECK_KEY, LAST_PROMPT_KEY]);
}
