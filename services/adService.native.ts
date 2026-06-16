// ============================================
// Ad Service - Native implementation with Google AdMob
// ============================================
// Requires a custom dev/release build (not Expo Go).

import { AD_UNIT_IDS } from '@/constants/admob';
import { canShowPersonalizedAds } from '@/services/trackingService';
import {
  getGoogleMobileAdsModule,
  isGoogleMobileAdsAvailable,
} from '@/services/googleMobileAdsModule';
import { shouldInitializeGoogleMobileAds } from '@/utils/googleMobileAdsEligibility';
import {
  hasActiveGoldSponsorAdReplacement,
  subscribeGoldSponsorAdRefresh,
  syncGoldSponsorAdReplacement,
} from '@/services/goldSponsorAdReplacement';

export { AD_UNIT_IDS } from '@/constants/admob';

// ============================================
// SDK INITIALIZATION
// ============================================
let initPromise: Promise<void> | null = null;
let goldSponsorRefreshBound = false;

function bindGoldSponsorAdRefresh(): void {
  if (goldSponsorRefreshBound) return;
  goldSponsorRefreshBound = true;
  subscribeGoldSponsorAdRefresh(() => {
    if (hasActiveGoldSponsorAdReplacement()) {
      interstitialAd = null;
      isInterstitialLoaded = false;
      return;
    }
    preloadInterstitial().catch(() => {});
  });
}

export async function initializeAds(): Promise<void> {
  bindGoldSponsorAdRefresh();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!shouldInitializeGoogleMobileAds()) return;
    const mod = getGoogleMobileAdsModule();
    if (!mod) return;
    try {
      await mod.default().initialize();
      await syncGoldSponsorAdReplacement();
      await preloadInterstitial();
    } catch (e) {
      console.warn('[AdMob] initialize failed:', e);
      initPromise = null;
    }
  })();
  return initPromise;
}

// ============================================
// INTERSTITIAL AD MANAGER
// ============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let interstitialAd: any = null;
let isInterstitialLoaded = false;

export async function preloadInterstitial(): Promise<void> {
  try {
    if (hasActiveGoldSponsorAdReplacement()) return;

    const mod = getGoogleMobileAdsModule();
    if (!mod) return;

    const { InterstitialAd, AdEventType } = mod;
    const adUnitId = AD_UNIT_IDS.interstitial;
    if (!adUnitId) return;

    const nonPersonalized = !(await canShowPersonalizedAds());
    interstitialAd = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: nonPersonalized,
    });

    interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      isInterstitialLoaded = true;
    });

    interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      isInterstitialLoaded = false;
      preloadInterstitial();
    });

    interstitialAd.addAdEventListener(AdEventType.ERROR, () => {
      isInterstitialLoaded = false;
    });

    interstitialAd.load();
  } catch {
    // Native module not available (Expo Go, web, etc.)
  }
}

let _isPremiumFn: (() => boolean) | null = null;

export function setIsPremiumCheck(fn: () => boolean) {
  _isPremiumFn = fn;
}

export async function showInterstitial(): Promise<boolean> {
  if (_isPremiumFn?.()) return false;
  if (hasActiveGoldSponsorAdReplacement()) return false;

  if (!isInterstitialLoaded || !interstitialAd) {
    preloadInterstitial();
    return false;
  }

  try {
    await interstitialAd.show();
    return true;
  } catch {
    isInterstitialLoaded = false;
    preloadInterstitial();
    return false;
  }
}

export async function checkAdMobAvailability(): Promise<boolean> {
  return isGoogleMobileAdsAvailable();
}

export function isInterstitialReady(): boolean {
  return isInterstitialLoaded;
}
