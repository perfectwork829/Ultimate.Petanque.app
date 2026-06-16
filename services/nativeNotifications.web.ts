// Platform: web — no-op stubs for expo-notifications
// This file prevents the web bundler from ever seeing expo-notifications

export const SchedulableTriggerInputTypes = { DATE: 'date' as const };
export const AndroidImportance = { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, MAX: 5, NONE: 0, UNSPECIFIED: -1 };

export async function scheduleNotificationAsync(_opts: any): Promise<string> { return ''; }
export async function cancelScheduledNotificationAsync(_id: string): Promise<void> {}
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {}
export async function getPermissionsAsync(): Promise<{ status: string }> { return { status: 'undetermined' }; }
export async function requestPermissionsAsync(): Promise<{ status: string }> { return { status: 'undetermined' }; }
export async function setNotificationChannelAsync(_id: string, _config: any): Promise<void> {}
export function setNotificationHandler(_handler: any): void {}
export function addNotificationResponseReceivedListener(_cb: any): { remove: () => void } { return { remove: () => {} }; }
export function addNotificationReceivedListener(_cb: any): { remove: () => void } { return { remove: () => {} }; }
export async function getAllScheduledNotificationsAsync(): Promise<any[]> { return []; }
export async function getExpoPushTokenAsync(_opts?: any): Promise<{ data: string }> { return { data: '' }; }
export async function getBadgeCountAsync(): Promise<number> { return 0; }
export async function setBadgeCountAsync(_count: number): Promise<void> {}

export default {};
