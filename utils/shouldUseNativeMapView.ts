import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Google Maps MapView (SurfaceView + Play Services) blocks the RN bridge on Android
 * emulators (Nox, AVD x86). Use list mode there; real phones get the interactive map.
 *
 * Set EXPO_PUBLIC_FORCE_MAP_ON_EMULATOR=true to test MapView on an emulator anyway.
 */
export function shouldUseNativeMapView(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && !Device.isDevice) {
    return process.env.EXPO_PUBLIC_FORCE_MAP_ON_EMULATOR === 'true';
  }
  return true;
}
