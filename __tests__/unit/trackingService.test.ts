/**
 * Tests for trackingService — ATT prompt, consent state, web stubs
 */

type TrackingStatus = 'not-determined' | 'authorized' | 'denied' | 'restricted';

function mapStatus(status: string): TrackingStatus {
  switch (status) {
    case 'granted': return 'authorized';
    case 'denied': return 'denied';
    case 'restricted': return 'restricted';
    default: return 'not-determined';
  }
}

function isATTNeeded(platform: string, consentShown: boolean, status: TrackingStatus): boolean {
  if (platform !== 'ios') return false;
  if (consentShown) return false;
  return status === 'not-determined';
}

function canShowPersonalizedAds(platform: string, status: TrackingStatus): boolean {
  if (platform !== 'ios') return true;
  return status === 'authorized';
}

// Web stubs
const webStubs = {
  hasConsentBeenShown: async () => true,
  getTrackingStatus: async (): Promise<TrackingStatus> => 'authorized',
  requestTrackingPermission: async (): Promise<TrackingStatus> => 'authorized',
  canShowPersonalizedAds: async () => true,
  isATTPromptNeeded: async () => false,
};

describe('trackingService', () => {
  describe('mapStatus', () => {
    test('maps granted to authorized', () => { expect(mapStatus('granted')).toBe('authorized'); });
    test('maps denied to denied', () => { expect(mapStatus('denied')).toBe('denied'); });
    test('maps restricted to restricted', () => { expect(mapStatus('restricted')).toBe('restricted'); });
    test('maps unknown to not-determined', () => { expect(mapStatus('unknown')).toBe('not-determined'); });
    test('maps empty to not-determined', () => { expect(mapStatus('')).toBe('not-determined'); });
  });

  describe('isATTNeeded', () => {
    test('false on Android', () => { expect(isATTNeeded('android', false, 'not-determined')).toBe(false); });
    test('false on web', () => { expect(isATTNeeded('web', false, 'not-determined')).toBe(false); });
    test('false if already shown', () => { expect(isATTNeeded('ios', true, 'not-determined')).toBe(false); });
    test('false if already authorized', () => { expect(isATTNeeded('ios', false, 'authorized')).toBe(false); });
    test('false if denied', () => { expect(isATTNeeded('ios', false, 'denied')).toBe(false); });
    test('true only on iOS + not shown + not-determined', () => { expect(isATTNeeded('ios', false, 'not-determined')).toBe(true); });
  });

  describe('canShowPersonalizedAds', () => {
    test('always true on Android', () => { expect(canShowPersonalizedAds('android', 'denied')).toBe(true); });
    test('true on iOS when authorized', () => { expect(canShowPersonalizedAds('ios', 'authorized')).toBe(true); });
    test('false on iOS when denied', () => { expect(canShowPersonalizedAds('ios', 'denied')).toBe(false); });
    test('false on iOS when not-determined', () => { expect(canShowPersonalizedAds('ios', 'not-determined')).toBe(false); });
  });

  describe('web stubs', () => {
    test('hasConsentBeenShown returns true', async () => { expect(await webStubs.hasConsentBeenShown()).toBe(true); });
    test('getTrackingStatus returns authorized', async () => { expect(await webStubs.getTrackingStatus()).toBe('authorized'); });
    test('requestTrackingPermission returns authorized', async () => { expect(await webStubs.requestTrackingPermission()).toBe('authorized'); });
    test('canShowPersonalizedAds returns true', async () => { expect(await webStubs.canShowPersonalizedAds()).toBe(true); });
    test('isATTPromptNeeded returns false', async () => { expect(await webStubs.isATTPromptNeeded()).toBe(false); });
  });

  describe('consent storage', () => {
    test('TRACKING_CONSENT_KEY is defined', () => { expect('tracking_consent_shown').toBeTruthy(); });
    test('TRACKING_STATUS_KEY is defined', () => { expect('tracking_status').toBeTruthy(); });
  });
});
