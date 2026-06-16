// Expo config: merges app.json and wires AdMob native plugin (requires dev/release build, not Expo Go).
const appJson = require('./app.json');

const GOOGLE_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

const androidAppId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || GOOGLE_TEST_ANDROID_APP_ID;
const iosAppId =
  process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || GOOGLE_TEST_IOS_APP_ID;

if (
  !process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ||
  !process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID
) {
  console.warn(
    '[AdMob] Set EXPO_PUBLIC_ADMOB_ANDROID_APP_ID and EXPO_PUBLIC_ADMOB_IOS_APP_ID in .env ' +
      '(AdMob → Apps → App settings) before production release builds. ' +
      'Using Google test app IDs in the native manifest until then.',
  );
}

const disableNativeAdmob =
  process.env.EXPO_PUBLIC_DISABLE_NATIVE_ADMOB === 'true';

if (disableNativeAdmob) {
  console.warn(
    '[AdMob] EXPO_PUBLIC_DISABLE_NATIVE_ADMOB=true — native AdMob SDK omitted from this build (emulator-only).',
  );
}

const plugins = [
  ...(appJson.expo.plugins || []),
  [
    'expo-build-properties',
    {
      ios: { useFrameworks: 'static' },
      android: {
        kotlinVersion: '2.2.0',
        compileSdkVersion: 35,
        targetSdkVersion: 35,
        buildToolsVersion: '35.0.0',
        // Required for Google Play 16 KB page size (Android 15+). See docs/android-16kb-page-size.md
        useLegacyPackaging: false,
      },
    },
  ],
];

if (!disableNativeAdmob) {
  plugins.push([
    'react-native-google-mobile-ads',
    {
      androidAppId,
      iosAppId,
      delayAppMeasurementInit: true,
      userTrackingUsageDescription:
        appJson.expo.ios?.infoPlist?.NSUserTrackingUsageDescription,
    },
  ]);
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins,
  },
};
