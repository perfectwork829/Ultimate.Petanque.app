// ============================================
// Ad Service - Web stub (no-op)
// ============================================

import { Platform } from 'react-native';

export const AD_UNIT_IDS = {
  banner: '',
  interstitial: '',
} as const;

export async function initializeAds(): Promise<void> {}
export async function preloadInterstitial(): Promise<void> {}
export function setIsPremiumCheck(_fn: () => boolean) {}
export async function showInterstitial(): Promise<boolean> { return false; }
export async function checkAdMobAvailability(): Promise<boolean> { return false; }
export function isInterstitialReady(): boolean { return false; }
