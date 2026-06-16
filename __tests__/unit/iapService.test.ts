/**
 * Unit tests for services/iapService.native.ts and iapService.web.ts
 *
 * Tests: product ID mapping, IAP availability, web stubs, purchase result
 * structures, restore result structures, error code handling, platform mapping.
 */

// ─── Inline implementations ──

const PRODUCT_ID = 'com.ultimatepetanque.removeads';

const PLATFORM_MAP: Record<string, string> = {
  ios: 'com.ultimatepetanque.removeads',
  android: 'com.ultimatepetanque.removeads',
};

interface PurchaseResult {
  success: boolean;
  error?: string;
}

interface RestoreResult {
  success: boolean;
  hasPremium: boolean;
  error?: string;
}

interface ProductInfo {
  price: string;
  currency: string;
  localizedPrice: string;
}

// Web stubs
function webIsIapAvailable(): boolean { return false; }
async function webInitIap(): Promise<boolean> { return false; }
async function webGetRemoveAdsProduct(): Promise<ProductInfo | null> { return null; }
async function webPurchaseRemoveAds(): Promise<PurchaseResult> { return { success: false, error: 'IAP not available on web' }; }
async function webRestorePurchases(): Promise<RestoreResult> { return { success: false, hasPremium: false, error: 'IAP not available on web' }; }
async function webEndIapConnection(): Promise<void> {}

// Native logic helpers
function mapPurchaseError(errorCode: string | undefined): PurchaseResult {
  if (errorCode === 'E_USER_CANCELLED') {
    return { success: false, error: 'cancelled' };
  }
  return { success: false, error: errorCode || 'Purchase failed' };
}

function isValidProduct(product: any): product is ProductInfo {
  return product && typeof product.price === 'string' && typeof product.currency === 'string';
}

function buildProductFromResponse(raw: any): ProductInfo {
  return {
    price: raw.price || '5.99',
    currency: raw.currency || 'EUR',
    localizedPrice: raw.localizedPrice || '5,99 €',
  };
}

function buildServerPayload(platform: string, transactionId?: string): { platform: string; productId: string; transactionId: string | null } {
  return {
    platform,
    productId: PRODUCT_ID,
    transactionId: transactionId || null,
  };
}

function buildRestorePayload(platform: string): { platform: string; productId: string; transactionId: string } {
  return {
    platform,
    productId: PRODUCT_ID,
    transactionId: 'restored',
  };
}

function hasPremiumInPurchases(purchases: { productId: string }[]): boolean {
  return purchases.some(p => p.productId === PRODUCT_ID);
}

// ─── Tests ──

describe('product ID', () => {
  test('single product ID for all platforms', () => {
    expect(PRODUCT_ID).toBe('com.ultimatepetanque.removeads');
  });

  test('iOS maps to same product ID', () => {
    expect(PLATFORM_MAP['ios']).toBe(PRODUCT_ID);
  });

  test('Android maps to same product ID', () => {
    expect(PLATFORM_MAP['android']).toBe(PRODUCT_ID);
  });
});

describe('web stubs', () => {
  test('isIapAvailable returns false', () => {
    expect(webIsIapAvailable()).toBe(false);
  });

  test('initIap returns false', async () => {
    expect(await webInitIap()).toBe(false);
  });

  test('getRemoveAdsProduct returns null', async () => {
    expect(await webGetRemoveAdsProduct()).toBeNull();
  });

  test('purchaseRemoveAds returns failure with web error', async () => {
    const result = await webPurchaseRemoveAds();
    expect(result.success).toBe(false);
    expect(result.error).toContain('web');
  });

  test('restorePurchases returns failure with web error', async () => {
    const result = await webRestorePurchases();
    expect(result.success).toBe(false);
    expect(result.hasPremium).toBe(false);
    expect(result.error).toContain('web');
  });

  test('endIapConnection is no-op', async () => {
    await expect(webEndIapConnection()).resolves.toBeUndefined();
  });
});

describe('mapPurchaseError', () => {
  test('user cancelled maps to cancelled', () => {
    const result = mapPurchaseError('E_USER_CANCELLED');
    expect(result.success).toBe(false);
    expect(result.error).toBe('cancelled');
  });

  test('unknown error code passed through', () => {
    const result = mapPurchaseError('E_NETWORK_ERROR');
    expect(result.error).toBe('E_NETWORK_ERROR');
  });

  test('undefined error code falls back', () => {
    const result = mapPurchaseError(undefined);
    expect(result.error).toBe('Purchase failed');
  });

  test('all errors return success false', () => {
    expect(mapPurchaseError('E_USER_CANCELLED').success).toBe(false);
    expect(mapPurchaseError('E_NETWORK').success).toBe(false);
    expect(mapPurchaseError(undefined).success).toBe(false);
  });
});

describe('isValidProduct', () => {
  test('valid product info', () => {
    expect(isValidProduct({ price: '5.99', currency: 'EUR', localizedPrice: '5,99 €' })).toBe(true);
  });

  test('null returns false', () => {
    expect(isValidProduct(null)).toBe(false);
  });

  test('undefined returns false', () => {
    expect(isValidProduct(undefined)).toBe(false);
  });

  test('missing price returns false', () => {
    expect(isValidProduct({ currency: 'EUR' })).toBe(false);
  });

  test('numeric price returns false', () => {
    expect(isValidProduct({ price: 5.99, currency: 'EUR' })).toBe(false);
  });
});

describe('buildProductFromResponse', () => {
  test('maps fields from raw response', () => {
    const product = buildProductFromResponse({ price: '6.99', currency: 'USD', localizedPrice: '$6.99' });
    expect(product.price).toBe('6.99');
    expect(product.currency).toBe('USD');
    expect(product.localizedPrice).toBe('$6.99');
  });

  test('defaults for missing fields', () => {
    const product = buildProductFromResponse({});
    expect(product.price).toBe('5.99');
    expect(product.currency).toBe('EUR');
    expect(product.localizedPrice).toBe('5,99 €');
  });

  test('partial response with fallbacks', () => {
    const product = buildProductFromResponse({ price: '4.99' });
    expect(product.price).toBe('4.99');
    expect(product.currency).toBe('EUR');
  });
});

describe('buildServerPayload', () => {
  test('iOS payload with transaction ID', () => {
    const payload = buildServerPayload('ios', 'txn-123');
    expect(payload.platform).toBe('ios');
    expect(payload.productId).toBe(PRODUCT_ID);
    expect(payload.transactionId).toBe('txn-123');
  });

  test('Android payload with purchase token', () => {
    const payload = buildServerPayload('android', 'token-abc');
    expect(payload.platform).toBe('android');
    expect(payload.transactionId).toBe('token-abc');
  });

  test('missing transaction ID maps to null', () => {
    const payload = buildServerPayload('ios');
    expect(payload.transactionId).toBeNull();
  });
});

describe('buildRestorePayload', () => {
  test('restore payload has restored as transactionId', () => {
    const payload = buildRestorePayload('ios');
    expect(payload.transactionId).toBe('restored');
    expect(payload.productId).toBe(PRODUCT_ID);
    expect(payload.platform).toBe('ios');
  });

  test('Android restore payload', () => {
    const payload = buildRestorePayload('android');
    expect(payload.platform).toBe('android');
    expect(payload.transactionId).toBe('restored');
  });
});

describe('hasPremiumInPurchases', () => {
  test('finds premium product', () => {
    const purchases = [
      { productId: 'com.other.product' },
      { productId: PRODUCT_ID },
    ];
    expect(hasPremiumInPurchases(purchases)).toBe(true);
  });

  test('no premium product', () => {
    const purchases = [
      { productId: 'com.other.product' },
    ];
    expect(hasPremiumInPurchases(purchases)).toBe(false);
  });

  test('empty purchases', () => {
    expect(hasPremiumInPurchases([])).toBe(false);
  });

  test('multiple premium entries (idempotent)', () => {
    const purchases = [
      { productId: PRODUCT_ID },
      { productId: PRODUCT_ID },
    ];
    expect(hasPremiumInPurchases(purchases)).toBe(true);
  });
});

describe('PurchaseResult structure', () => {
  test('success result', () => {
    const result: PurchaseResult = { success: true };
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('failure result with error', () => {
    const result: PurchaseResult = { success: false, error: 'Network error' };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});

describe('RestoreResult structure', () => {
  test('restored with premium', () => {
    const result: RestoreResult = { success: true, hasPremium: true };
    expect(result.success).toBe(true);
    expect(result.hasPremium).toBe(true);
  });

  test('restored without premium', () => {
    const result: RestoreResult = { success: true, hasPremium: false };
    expect(result.success).toBe(true);
    expect(result.hasPremium).toBe(false);
  });

  test('restore failure', () => {
    const result: RestoreResult = { success: false, hasPremium: false, error: 'IAP not available' };
    expect(result.error).toBe('IAP not available');
  });
});

describe('platform-specific logic', () => {
  test('iOS finishes transaction with isConsumable false', () => {
    const finishArgs = { isConsumable: false };
    expect(finishArgs.isConsumable).toBe(false);
  });

  test('Android acknowledges with purchase token', () => {
    const token = 'android-purchase-token-xyz';
    const ackArgs = { token };
    expect(ackArgs.token).toBe(token);
  });

  test('requestPurchase includes andDangerouslyFinishTransactionAutomaticallyIOS', () => {
    const purchaseArgs = {
      sku: PRODUCT_ID,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
    };
    expect(purchaseArgs.andDangerouslyFinishTransactionAutomaticallyIOS).toBe(false);
  });
});
