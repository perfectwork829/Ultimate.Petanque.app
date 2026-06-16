/**
 * Background Proximity Service
 *
 * Uses expo-task-manager + expo-background-fetch to check for nearby active
 * terrains every ~15 minutes in the background and send a local push notification.
 *
 * NOTE: These native modules are NOT available in Expo Go or builds without
 * the native modules linked. This service is a complete no-op when unavailable.
 * The foreground polling in the home page handles proximity checks instead.
 */

/**
 * Register the background proximity check task.
 * Currently disabled — native modules (expo-task-manager, expo-background-fetch)
 * are not available in this build. Proximity checks are handled via foreground
 * polling on the home screen (every 5 minutes).
 */
export async function registerBackgroundProximityTask(): Promise<boolean> {
  // No-op: native background fetch modules not available in this build
  return false;
}

/**
 * Unregister the background proximity task.
 */
export async function unregisterBackgroundProximityTask(): Promise<void> {
  // No-op
}

/**
 * Check if the background proximity task is registered.
 */
export async function isBackgroundProximityTaskRegistered(): Promise<boolean> {
  return false;
}
