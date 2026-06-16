# Map markers — full circles on Android

## Problem

Custom map pins looked like a **quarter circle** (top-right arc only).

## Cause

On Android, `react-native-maps` draws custom marker views as a **bitmap**. With **New Architecture** (`newArchEnabled: true`), the layout size used for that bitmap can be **smaller than the real marker UI**, so the circle is clipped.

## Fix (in this repo)

1. **`patches/react-native-maps+1.20.1.patch`** — expands marker bitmap size from the child view and refreshes on layout change.
2. **`app/(tabs)/map.tsx`** — fixed 64×64 marker canvas, single circular disc per pin, badges kept inside the disc. On Android, `tracksViewChanges={false}` so marker taps and map pan/zoom work; **LIVE/habitual pulse rings use native `Circle` overlays** (`MapTerrainPulseLayer`) because Reanimated rings inside a frozen marker bitmap do not animate.
3. **Map touch pass-through** — hero header + bottom filter sheet use `pointerEvents="box-none"` so they do not block map gestures in the center of the screen.
4. **Tab freeze / dead taps (map pans, chips scroll, but Pressable/tab bar dead)** — root cause is **RN bridge saturation** from rasterizing dozens of custom marker React views, which blocks the JS thread. Native map zoom still works. Fixes:
   - **Android simple markers** — `pinColor` / `image` URI only (no custom marker children).
   - **Map layer clipped** between measured hero + bottom panel (`mapLayer` absolute band); chrome uses `elevation` + `renderToHardwareTextureAndroid`.
   - **`patches/react-native-maps+1.20.1.patch`** — `setZOrderMediaOverlay(true)` on map `SurfaceView`.
   - Markers deferred ~1.2s after `onMapReady`; max 24 visible on Android; `tracksViewChanges={false}`; pulse circles disabled on Android.
5. **`package.json`** — `postinstall`: `patch-package` (run `npm install` so the patch applies).

## Build steps

```bash
npm install
# rebuild native app (patch is in native Java)
npx expo run:android
# or release APK script
```

Expo Go may not include the native patch; use a **dev build or release APK**.
