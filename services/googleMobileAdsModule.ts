import { NativeModules } from 'react-native';

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let cachedModule: GoogleMobileAdsModule | null | undefined;

/** Lazy-load react-native-google-mobile-ads when the native module is linked. */
export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (!NativeModules.RNGoogleMobileAdsModule) {
    cachedModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function isGoogleMobileAdsAvailable(): boolean {
  return getGoogleMobileAdsModule() !== null;
}
