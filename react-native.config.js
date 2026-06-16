/**
 * Set EXPO_PUBLIC_DISABLE_NATIVE_ADMOB=true before `gradlew assembleRelease`
 * to build an APK without the AdMob native SDK (works on AOSP emulators).
 * Do NOT use that flag for Play Store / production builds.
 */
const disableNativeAdmob =
  process.env.EXPO_PUBLIC_DISABLE_NATIVE_ADMOB === 'true';

module.exports = {
  dependencies: disableNativeAdmob
    ? {
        'react-native-google-mobile-ads': {
          platforms: { android: null, ios: null },
        },
      }
    : {},
};
