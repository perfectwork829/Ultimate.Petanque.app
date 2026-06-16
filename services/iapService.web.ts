// ============================================
// IAP Service - Web stub (IAP not available on web)
// ============================================

export function isIapAvailable(): boolean {
  return false;
}

export async function initIap(): Promise<boolean> {
  return false;
}

export async function getRemoveAdsProduct(): Promise<{ price: string; currency: string; localizedPrice: string } | null> {
  return null;
}

export async function purchaseRemoveAds(): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'IAP not available on web' };
}

export async function restorePurchases(): Promise<{ success: boolean; hasPremium: boolean; error?: string }> {
  return { success: false, hasPremium: false, error: 'IAP not available on web' };
}

export async function endIapConnection(): Promise<void> {
  // no-op
}
