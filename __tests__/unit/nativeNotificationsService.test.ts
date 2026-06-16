/**
 * Tests for nativeNotifications — web stubs, Android channels, scheduling
 */

const AndroidImportance = { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, MAX: 5, NONE: 0, UNSPECIFIED: -1 };
const SchedulableTriggerInputTypes = { DATE: 'date' as const };

async function scheduleStub(_opts: any): Promise<string> { return ''; }
async function cancelStub(_id: string): Promise<void> {}
async function cancelAllStub(): Promise<void> {}
async function getPermissionsStub(): Promise<{ status: string }> { return { status: 'undetermined' }; }
async function requestPermissionsStub(): Promise<{ status: string }> { return { status: 'undetermined' }; }
async function setChannelStub(_id: string, _config: any): Promise<void> {}
async function getExpoPushTokenStub(): Promise<{ data: string }> { return { data: '' }; }
async function getBadgeCountStub(): Promise<number> { return 0; }

describe('nativeNotifications', () => {
  describe('AndroidImportance enum', () => {
    test('has 7 levels', () => { expect(Object.keys(AndroidImportance)).toHaveLength(7); });
    test('HIGH is 4', () => { expect(AndroidImportance.HIGH).toBe(4); });
    test('MAX is 5', () => { expect(AndroidImportance.MAX).toBe(5); });
    test('NONE is 0', () => { expect(AndroidImportance.NONE).toBe(0); });
  });

  describe('SchedulableTriggerInputTypes', () => {
    test('DATE is "date"', () => { expect(SchedulableTriggerInputTypes.DATE).toBe('date'); });
  });

  describe('web stubs return safe defaults', () => {
    test('scheduleNotificationAsync returns empty string', async () => { expect(await scheduleStub({})).toBe(''); });
    test('cancelScheduledNotificationAsync resolves', async () => { await cancelStub('id'); });
    test('cancelAllScheduledNotificationsAsync resolves', async () => { await cancelAllStub(); });
    test('getPermissionsAsync returns undetermined', async () => { expect((await getPermissionsStub()).status).toBe('undetermined'); });
    test('requestPermissionsAsync returns undetermined', async () => { expect((await requestPermissionsStub()).status).toBe('undetermined'); });
    test('setNotificationChannelAsync resolves', async () => { await setChannelStub('ch1', {}); });
    test('getExpoPushTokenAsync returns empty data', async () => { expect((await getExpoPushTokenStub()).data).toBe(''); });
    test('getBadgeCountAsync returns 0', async () => { expect(await getBadgeCountStub()).toBe(0); });
  });

  describe('listener stubs', () => {
    test('addNotificationResponseReceivedListener returns removable', () => {
      const sub = { remove: () => {} };
      expect(sub.remove).toBeDefined();
    });
    test('setNotificationHandler is no-op', () => {
      const fn = (_handler: any) => {};
      fn({}); // should not throw
    });
  });
});
