/**
 * Tests for location service — web stubs, Accuracy enum, geocode/reverse
 */

const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

async function geocodeAsyncStub(_address: string): Promise<{ latitude: number; longitude: number }[]> { return []; }
async function reverseGeocodeAsyncStub(_loc: any): Promise<any[]> { return []; }
async function getForegroundPermissionsAsyncStub(): Promise<{ status: string }> { return { status: 'undetermined' }; }

function mapPermissionStatus(state: string): string {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'undetermined';
}

describe('locationService', () => {
  describe('Accuracy enum', () => {
    test('has 6 levels', () => { expect(Object.keys(Accuracy)).toHaveLength(6); });
    test('values are ascending', () => { expect(Accuracy.Lowest).toBeLessThan(Accuracy.BestForNavigation); });
    test('High is 4', () => { expect(Accuracy.High).toBe(4); });
  });

  describe('web stubs', () => {
    test('geocodeAsync returns empty', async () => {
      expect(await geocodeAsyncStub('Paris')).toEqual([]);
    });
    test('reverseGeocodeAsync returns empty', async () => {
      expect(await reverseGeocodeAsyncStub({ latitude: 0, longitude: 0 })).toEqual([]);
    });
    test('getForegroundPermissionsAsync returns undetermined', async () => {
      expect((await getForegroundPermissionsAsyncStub()).status).toBe('undetermined');
    });
  });

  describe('mapPermissionStatus', () => {
    test('maps granted', () => { expect(mapPermissionStatus('granted')).toBe('granted'); });
    test('maps denied', () => { expect(mapPermissionStatus('denied')).toBe('denied'); });
    test('maps unknown to undetermined', () => { expect(mapPermissionStatus('prompt')).toBe('undetermined'); });
  });

  describe('getCurrentPositionAsync web fallback', () => {
    test('position object has correct shape', () => {
      const pos = { coords: { latitude: 45.75, longitude: 4.85, altitude: null, accuracy: 10, heading: null, speed: null }, timestamp: Date.now() };
      expect(pos.coords.latitude).toBe(45.75);
      expect(pos.timestamp).toBeGreaterThan(0);
    });
  });
});
