# Android 16 KB page size

## What you saw

The **“Android App Compatibility — This app isn't 16 KB compatible”** dialog is from **Android 15+** (including current Google Play emulators). It is **not an AdMob bug**.

Your emulator uses **16 KB memory pages**. Many native libraries in the APK (`.so` files) were built with the old **4 KB ELF alignment**. Android lists them under `lib/x86_64/` because the emulator is **x86_64**.

The dialog says the app will run in **“page size compatible mode”** — you can tap **OK** and continue testing, but Google Play will require proper 16 KB support for updates targeting API 35+.

### Libraries commonly flagged

| Library | Source |
|---------|--------|
| `libreactnative.so`, `libhermes*.so` | React Native |
| `libexpo-av.so`, `libexpo-gl.so` | Expo modules |
| `libsentry.so` | `@sentry/react-native` |
| `libbarhopper_v3.so` | ML Kit (e.g. barcode / camera) |
| Fresco / image libs | React Native image pipeline |

## Root cause

1. **Target SDK 35** (Android 15) — required for Play Store.
2. **NDK / prebuilt natives** compiled with **4 KB** segment alignment instead of **16 KB**.
3. **Prebuilt `.so` inside npm AARs** (Sentry, ML Kit, etc.) stay unaligned until those packages are updated and you **clean-rebuild**.

Expo SDK 53.0.14+ ships 16 KB–aligned Expo/RN binaries when you rebuild with a current toolchain.

## Fix — rebuild the APK

### 1. Install NDK 28 (Android Studio)

**SDK Manager → SDK Tools → NDK (Side by side)** → install **28.2.x** (or 28.0+).

This project sets `ndkVersion=28.2.13676358` in `android/gradle.properties`.

### 2. Update Expo / native deps

```powershell
cd D:\Ultimate.Petanque.app
npx expo install --fix
npm install
```

### 3. Clean release build

```powershell
cd android
.\gradlew.bat clean assembleRelease --no-daemon --max-workers=1
```

Or use the helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1
```

### 4. Reinstall on emulator

```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r android\app\build\outputs\apk\release\app-release.apk
```

### 5. Verify (optional)

Android Studio → **Build → Analyze APK** → open `app-release.apk` → check **Alignment** for 16 KB.

## If the warning persists

Some third-party SDKs still ship 4 KB `.so` files. Update them to their latest versions, or temporarily test on an **arm64-v8a Google Play** emulator (often fewer x86_64-only prebuilts).

Known packages to keep updated:

- `expo`, `expo-av`, `expo-gl`, `expo-camera`
- `@sentry/react-native`
- `@shopify/react-native-skia` (if used)

## Not a crash

This dialog is a **compatibility warning**. It is separate from the earlier **“keeps stopping”** crash (AdMob / Play Services). After tapping **OK**, the app should still launch.
