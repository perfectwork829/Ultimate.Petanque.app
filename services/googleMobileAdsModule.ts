type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let cachedModule: GoogleMobileAdsModule | null | undefined;

/** Lazy-load react-native-google-mobile-ads.
 * Do not depend on a NativeModules key here because the key name can differ
 * between versions/builds. Requiring the package is the reliable check.
 */
export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  if (cachedModule !== undefined) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;

    if (!mod?.BannerAd || !mod?.BannerAdSize) {
      cachedModule = null;
      return null;
    }

    cachedModule = mod;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

export function isGoogleMobileAdsAvailable(): boolean {
  return getGoogleMobileAdsModule() !== null;
}
