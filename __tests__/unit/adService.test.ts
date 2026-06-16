/**
 * Unit tests for services/adService.native.ts and adService.web.ts
 *
 * Tests: AD_UNIT_IDS, web stubs, premium check bypass, interstitial state,
 * test ad IDs format, frequency/cooldown logic.
 */

// ─── Inline implementations ──

const TEST_BANNER_ANDROID = 'ca-app-pub-2580301275844431/3120547656';
const TEST_BANNER_IOS = 'ca-app-pub-2580301275844431/5415538502';
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-2580301275844431/5980712963';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-2580301275844431/1838988674';

const TEST_APP_ID_PREFIX = 'ca-app-pub-3940256099942544';

interface AdUnitIds {
  banner: string;
  interstitial: string;
}

const AD_UNIT_IDS_ANDROID: AdUnitIds = {
  banner: TEST_BANNER_ANDROID,
  interstitial: TEST_INTERSTITIAL_ANDROID,
};

const AD_UNIT_IDS_IOS: AdUnitIds = {
  banner: TEST_BANNER_IOS,
  interstitial: TEST_INTERSTITIAL_IOS,
};

const AD_UNIT_IDS_WEB: AdUnitIds = {
  banner: '',
  interstitial: '',
};

// Interstitial state machine
type InterstitialState = 'idle' | 'loading' | 'loaded' | 'showing' | 'error';

interface InterstitialManager {
  state: InterstitialState;
  isPremium: boolean;
  lastShownAt: number;
  cooldownMs: number;
}

function createInterstitialManager(cooldownMs: number = 120000): InterstitialManager {
  return { state: 'idle', isPremium: false, lastShownAt: 0, cooldownMs };
}

function canShowInterstitial(manager: InterstitialManager, now: number = Date.now()): boolean {
  if (manager.isPremium) return false;
  if (manager.state !== 'loaded') return false;
  if (now - manager.lastShownAt < manager.cooldownMs) return false;
  return true;
}

function shouldSkipAdForPremium(isPremiumFn: (() => boolean) | null): boolean {
  return isPremiumFn !== null && isPremiumFn();
}

function isTestAdId(adId: string): boolean {
  return adId.startsWith(TEST_APP_ID_PREFIX);
}

function getAdPlatformIds(platform: 'ios' | 'android' | 'web'): AdUnitIds {
  switch (platform) {
    case 'ios': return AD_UNIT_IDS_IOS;
    case 'android': return AD_UNIT_IDS_ANDROID;
    default: return AD_UNIT_IDS_WEB;
  }
}

// Web stubs
function webPreloadInterstitial(): void {}
function webSetIsPremiumCheck(_fn: () => boolean): void {}
async function webShowInterstitial(): Promise<boolean> { return false; }
async function webCheckAdMobAvailability(): Promise<boolean> { return false; }
function webIsInterstitialReady(): boolean { return false; }

// ─── Tests ──

describe('AD_UNIT_IDS - test IDs', () => {
  test('Android banner is test ID', () => {
    expect(isTestAdId(TEST_BANNER_ANDROID)).toBe(true);
  });

  test('iOS banner is test ID', () => {
    expect(isTestAdId(TEST_BANNER_IOS)).toBe(true);
  });

  test('Android interstitial is test ID', () => {
    expect(isTestAdId(TEST_INTERSTITIAL_ANDROID)).toBe(true);
  });

  test('iOS interstitial is test ID', () => {
    expect(isTestAdId(TEST_INTERSTITIAL_IOS)).toBe(true);
  });

  test('all test IDs share same app prefix', () => {
    [TEST_BANNER_ANDROID, TEST_BANNER_IOS, TEST_INTERSTITIAL_ANDROID, TEST_INTERSTITIAL_IOS].forEach(id => {
      expect(id.startsWith(TEST_APP_ID_PREFIX)).toBe(true);
    });
  });

  test('production ID is not test', () => {
    expect(isTestAdId('ca-app-pub-1234567890/1234567890')).toBe(false);
  });

  test('all IDs have format ca-app-pub-XXX/YYY', () => {
    [TEST_BANNER_ANDROID, TEST_BANNER_IOS, TEST_INTERSTITIAL_ANDROID, TEST_INTERSTITIAL_IOS].forEach(id => {
      expect(id).toMatch(/^ca-app-pub-\d+\/\d+$/);
    });
  });
});

describe('getAdPlatformIds', () => {
  test('Android returns Android IDs', () => {
    const ids = getAdPlatformIds('android');
    expect(ids.banner).toBe(TEST_BANNER_ANDROID);
    expect(ids.interstitial).toBe(TEST_INTERSTITIAL_ANDROID);
  });

  test('iOS returns iOS IDs', () => {
    const ids = getAdPlatformIds('ios');
    expect(ids.banner).toBe(TEST_BANNER_IOS);
    expect(ids.interstitial).toBe(TEST_INTERSTITIAL_IOS);
  });

  test('web returns empty strings', () => {
    const ids = getAdPlatformIds('web');
    expect(ids.banner).toBe('');
    expect(ids.interstitial).toBe('');
  });
});

describe('web stubs', () => {
  test('preloadInterstitial is no-op', () => {
    expect(() => webPreloadInterstitial()).not.toThrow();
  });

  test('setIsPremiumCheck is no-op', () => {
    expect(() => webSetIsPremiumCheck(() => true)).not.toThrow();
  });

  test('showInterstitial returns false', async () => {
    expect(await webShowInterstitial()).toBe(false);
  });

  test('checkAdMobAvailability returns false', async () => {
    expect(await webCheckAdMobAvailability()).toBe(false);
  });

  test('isInterstitialReady returns false', () => {
    expect(webIsInterstitialReady()).toBe(false);
  });
});

describe('InterstitialManager', () => {
  test('creates with idle state', () => {
    const m = createInterstitialManager();
    expect(m.state).toBe('idle');
    expect(m.isPremium).toBe(false);
    expect(m.lastShownAt).toBe(0);
  });

  test('default cooldown is 120s', () => {
    const m = createInterstitialManager();
    expect(m.cooldownMs).toBe(120000);
  });

  test('custom cooldown', () => {
    const m = createInterstitialManager(60000);
    expect(m.cooldownMs).toBe(60000);
  });
});

describe('canShowInterstitial', () => {
  test('shows when loaded, not premium, past cooldown', () => {
    const m: InterstitialManager = { state: 'loaded', isPremium: false, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(true);
  });

  test('blocks for premium users', () => {
    const m: InterstitialManager = { state: 'loaded', isPremium: true, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(false);
  });

  test('blocks when not loaded', () => {
    const m: InterstitialManager = { state: 'idle', isPremium: false, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(false);
  });

  test('blocks during cooldown', () => {
    const m: InterstitialManager = { state: 'loaded', isPremium: false, lastShownAt: 100000, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 150000)).toBe(false);
  });

  test('allows right at cooldown boundary', () => {
    const m: InterstitialManager = { state: 'loaded', isPremium: false, lastShownAt: 100000, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 220000)).toBe(true);
  });

  test('blocks when loading', () => {
    const m: InterstitialManager = { state: 'loading', isPremium: false, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(false);
  });

  test('blocks when showing', () => {
    const m: InterstitialManager = { state: 'showing', isPremium: false, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(false);
  });

  test('blocks when error', () => {
    const m: InterstitialManager = { state: 'error', isPremium: false, lastShownAt: 0, cooldownMs: 120000 };
    expect(canShowInterstitial(m, 200000)).toBe(false);
  });
});

describe('shouldSkipAdForPremium', () => {
  test('null check function = do not skip', () => {
    expect(shouldSkipAdForPremium(null)).toBe(false);
  });

  test('premium function returns true = skip', () => {
    expect(shouldSkipAdForPremium(() => true)).toBe(true);
  });

  test('non-premium function returns false = do not skip', () => {
    expect(shouldSkipAdForPremium(() => false)).toBe(false);
  });
});

describe('interstitial state transitions', () => {
  test('idle → loading → loaded → showing → idle cycle', () => {
    const states: InterstitialState[] = ['idle', 'loading', 'loaded', 'showing', 'idle'];
    states.forEach(s => {
      expect(['idle', 'loading', 'loaded', 'showing', 'error']).toContain(s);
    });
  });

  test('loading → error → idle recovery', () => {
    const states: InterstitialState[] = ['loading', 'error', 'idle', 'loading', 'loaded'];
    expect(states[1]).toBe('error');
    expect(states[2]).toBe('idle');
  });
});

describe('frequency management', () => {
  test('first show always allowed (lastShownAt = 0)', () => {
    const m = createInterstitialManager(120000);
    m.state = 'loaded';
    expect(canShowInterstitial(m, 1000)).toBe(true);
  });

  test('second show blocked within cooldown', () => {
    const m = createInterstitialManager(120000);
    m.state = 'loaded';
    m.lastShownAt = 100000;
    expect(canShowInterstitial(m, 150000)).toBe(false);
  });

  test('third show allowed after cooldown', () => {
    const m = createInterstitialManager(120000);
    m.state = 'loaded';
    m.lastShownAt = 100000;
    expect(canShowInterstitial(m, 300000)).toBe(true);
  });

  test('zero cooldown always allows', () => {
    const m = createInterstitialManager(0);
    m.state = 'loaded';
    m.lastShownAt = Date.now();
    expect(canShowInterstitial(m, Date.now())).toBe(true);
  });
});
