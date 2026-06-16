# Android emulator + AdMob

## Why the app crashed after AdMob

`react-native-google-mobile-ads` adds **Google Mobile Ads**, which depends on **Google Play services** on the device/emulator.

- **AOSP / “Google APIs” emulators without the Play Store** often crash at launch (`MobileAdsInitProvider`) or when ads initialize.
- **Before AdMob**, the app had no Play-services dependency at startup, so those emulators were fine.

Your release manifest already includes a valid test App ID and `DELAY_APP_MEASUREMENT_INIT`. That is correct for production-style builds.

## Fix 1 — Use a Google Play emulator (recommended)

Use this to test **with ads** on the emulator.

1. Android Studio → **Device Manager** → **Create Device**.
2. Pick a phone (e.g. Pixel 6).
3. On **System Image**, choose a release whose name includes **Google Play** (not only “Google APIs” and not “AOSP”).
4. Finish, start the emulator, open the **Play Store** once (confirms Play services).
5. Install your APK:

```powershell
taskkill /F /IM adb.exe
D:\Android\Sdk\platform-tools\adb.exe install -r android\app\build\outputs\apk\release\app-release.apk
```

6. Or test on a **physical Android phone** (always has Play services).

## Fix 2 — Emulator build without AdMob (no ads in that APK)

Use when you only need UI/testing on a **non-Play** emulator.

```powershell
cd D:\Ultimate.Petanque.app
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release-no-ads.ps1
```

That sets `EXPO_PUBLIC_DISABLE_NATIVE_ADMOB=true`, unlinks the native AdMob SDK, and produces an APK that should start on any emulator. **Do not ship that APK to users.**

For Play Store builds, run a normal release build **without** that flag.

## Fix 3 — Skip JS ad init on emulator only (optional)

In `.env` (dev only):

```env
EXPO_PUBLIC_SKIP_ADMOB_ON_EMULATOR=true
```

This skips `MobileAds.initialize()` on emulators but **does not remove** the native SDK. If the emulator still crashes at launch, use Fix 1 or Fix 2.

## Production checklist

- Set `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` / `EXPO_PUBLIC_ADMOB_IOS_APP_ID` in `.env` before release.
- Build **without** `EXPO_PUBLIC_DISABLE_NATIVE_ADMOB`.
- Test the release APK on a Play emulator or a real device.

## “Keeps stopping” on x86_64 emulator

If logcat shows `libexpo-modules-core.so` not found and `Cannot read property 'NativeModule' of undefined`:

**Cause:** APK built for **arm64 only** while the emulator is **x86_64**.

**Fix:** Include `x86_64` in `reactNativeArchitectures` in `android/gradle.properties`, then `.\gradlew.bat clean assembleRelease`.
