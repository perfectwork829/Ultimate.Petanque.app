import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { isGoogleMobileAdsAvailable } from '@/services/googleMobileAdsModule';

/**
 * Whether JS should call MobileAds.initialize() and show banners.
 * Native AdMob may still be linked; this only gates runtime ad calls.
 */
export function shouldInitializeGoogleMobileAds(): boolean {
  if (Platform.OS === 'web') return false;
  if (!isGoogleMobileAdsAvailable()) return false;

  if (process.env.EXPO_PUBLIC_SKIP_ADMOB_ON_EMULATOR === 'true' && !Device.isDevice) {
    console.log('[AdMob] Skipping init on emulator (EXPO_PUBLIC_SKIP_ADMOB_ON_EMULATOR)');
    return false;
  }

  return true;
}
