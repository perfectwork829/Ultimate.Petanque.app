// ============================================
// Tracking Transparency Service - Web stub (no-op)
// ============================================

export type TrackingStatus = 'not-determined' | 'authorized' | 'denied' | 'restricted';

export async function hasConsentBeenShown(): Promise<boolean> { return true; }
export async function markConsentShown(): Promise<void> {}
export async function getTrackingStatus(): Promise<TrackingStatus> { return 'authorized'; }
export async function requestTrackingPermission(): Promise<TrackingStatus> { return 'authorized'; }
export async function canShowPersonalizedAds(): Promise<boolean> { return true; }
export async function isATTPromptNeeded(): Promise<boolean> { return false; }
