// ============================================
// Tracking Transparency Service - Native (iOS ATT)
// ============================================
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRACKING_CONSENT_KEY = 'tracking_consent_shown';
const TRACKING_STATUS_KEY = 'tracking_status';

export type TrackingStatus = 'not-determined' | 'authorized' | 'denied' | 'restricted';

let trackingModule: any = null;
let moduleChecked = false;

function getTrackingModule(): any {
  if (moduleChecked) return trackingModule;
  moduleChecked = true;
  try {
    // Dynamic require to prevent web bundler from resolving this module
    const modName = 'expo-tracking-transparency';
    trackingModule = require(modName);
  } catch {
    trackingModule = null;
  }
  return trackingModule;
}

/**
 * Check if the ATT pre-prompt has been shown to the user
 */
export async function hasConsentBeenShown(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(TRACKING_CONSENT_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark the pre-prompt as shown
 */
export async function markConsentShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(TRACKING_CONSENT_KEY, 'true');
  } catch {
    // Silently fail
  }
}

/**
 * Get current tracking permission status
 */
export async function getTrackingStatus(): Promise<TrackingStatus> {
  // Only iOS requires ATT
  if (Platform.OS !== 'ios') return 'authorized';

  const mod = getTrackingModule();
  if (!mod) return 'authorized';

  try {
    const { getTrackingPermissionsAsync } = mod;
    const { status } = await getTrackingPermissionsAsync();
    return mapStatus(status);
  } catch {
    return 'not-determined';
  }
}

/**
 * Request tracking permission (triggers the native iOS ATT dialog)
 */
export async function requestTrackingPermission(): Promise<TrackingStatus> {
  if (Platform.OS !== 'ios') return 'authorized';

  const mod = getTrackingModule();
  if (!mod) return 'authorized';

  try {
    const { requestTrackingPermissionsAsync } = mod;
    const { status } = await requestTrackingPermissionsAsync();
    const mapped = mapStatus(status);
    await AsyncStorage.setItem(TRACKING_STATUS_KEY, mapped);
    return mapped;
  } catch {
    return 'denied';
  }
}

/**
 * Check if personalized ads can be shown
 */
export async function canShowPersonalizedAds(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  const status = await getTrackingStatus();
  return status === 'authorized';
}

/**
 * Check if the ATT prompt is needed (iOS only, not yet determined)
 */
export async function isATTPromptNeeded(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const shown = await hasConsentBeenShown();
  if (shown) return false;
  const status = await getTrackingStatus();
  return status === 'not-determined';
}

function mapStatus(status: string): TrackingStatus {
  switch (status) {
    case 'granted': return 'authorized';
    case 'denied': return 'denied';
    case 'restricted': return 'restricted';
    default: return 'not-determined';
  }
}
