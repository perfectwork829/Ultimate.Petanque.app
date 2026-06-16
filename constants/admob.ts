import { Platform } from 'react-native';

/** Ultimate Petanque AdMob publisher (production ad units). */
const PUBLISHER = '2580301275844431';

const PRODUCTION_UNITS = {
  banner: Platform.select({
    android: `ca-app-pub-${PUBLISHER}/3120547656`,
    ios: `ca-app-pub-${PUBLISHER}/5415538502`,
    default: '',
  })!,
  interstitial: Platform.select({
    android: `ca-app-pub-${PUBLISHER}/5980712963`,
    ios: `ca-app-pub-${PUBLISHER}/1838988674`,
    default: '',
  })!,
};

/** Google sample ad units — safe for local dev / Expo Go–style builds. */
const GOOGLE_TEST_PUBLISHER = '3940256099942544';
const TEST_UNITS = {
  banner: Platform.select({
    android: `ca-app-pub-${GOOGLE_TEST_PUBLISHER}/6300978111`,
    ios: `ca-app-pub-${GOOGLE_TEST_PUBLISHER}/2934735716`,
    default: '',
  })!,
  interstitial: Platform.select({
    android: `ca-app-pub-${GOOGLE_TEST_PUBLISHER}/1033173712`,
    ios: `ca-app-pub-${GOOGLE_TEST_PUBLISHER}/4411468910`,
    default: '',
  })!,
};

/**
 * Production units in release builds; Google test units in __DEV__ unless
 * EXPO_PUBLIC_ADMOB_PRODUCTION_ADS=true (e.g. testing real fill in dev client).
 */
const useProductionAdUnits =
  !__DEV__ || process.env.EXPO_PUBLIC_ADMOB_PRODUCTION_ADS === 'true';

export const AD_UNIT_IDS = {
  banner: useProductionAdUnits ? PRODUCTION_UNITS.banner : TEST_UNITS.banner,
  interstitial: useProductionAdUnits ? PRODUCTION_UNITS.interstitial : TEST_UNITS.interstitial,
} as const;

/** AdMob App IDs (manifest) — set in .env; not the same as ad unit IDs. */
export const ADMOB_APP_IDS = {
  android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? '',
  ios: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ?? '',
} as const;

export function isGoogleTestAdUnitId(adUnitId: string): boolean {
  return adUnitId.startsWith(`ca-app-pub-${GOOGLE_TEST_PUBLISHER}/`);
}
