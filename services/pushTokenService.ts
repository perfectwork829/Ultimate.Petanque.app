/**
 * Push Token Registration Service
 *
 * Registers the device's Expo push token in the backend
 * so Edge Functions can send server-side push notifications.
 */

import { Platform } from 'react-native';
import { getSupabaseClient } from '@/template';
import * as Notifications from './nativeNotifications';

let _cachedToken: string | null = null;

/**
 * Get the Expo push token for this device.
 * Returns null on web or if permissions are denied.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (_cachedToken) return _cachedToken;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses default from app.json
    });

    _cachedToken = tokenData.data;
    return _cachedToken;
  } catch (error) {
    console.log('[pushToken] Error getting push token:', error);
    return null;
  }
}

/**
 * Register the push token in the backend database.
 * Should be called after user login / app startup.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const token = await getExpoPushToken();
    if (!token) return;

    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    const platform = Platform.OS; // 'ios' | 'android'

    // Upsert: create or update token
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userData.user.id,
          token,
          platform,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      console.log('[pushToken] Error registering token:', error.message);
    } else {
      console.log('[pushToken] Token registered successfully');
    }
  } catch (error) {
    console.log('[pushToken] Registration error:', error);
  }
}

/**
 * Deactivate the push token (on logout).
 */
export async function deactivatePushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const token = _cachedToken || await getExpoPushToken();
    if (!token) return;

    const supabase = getSupabaseClient();

    await supabase
      .from('push_tokens')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('token', token);

    _cachedToken = null;
    console.log('[pushToken] Token deactivated');
  } catch (error) {
    console.log('[pushToken] Deactivation error:', error);
  }
}

/**
 * Trigger a server-side push notification via the send-push Edge Function.
 * Fire-and-forget — errors are silently logged.
 */
export async function triggerServerPush(
  type: string,
  payload: Record<string, any>
): Promise<{ sent: number; errors: number }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { type, payload },
    });

    if (error) {
      // Try to extract details
      let errorMessage = error.message;
      try {
        if ((error as any).context?.text) {
          errorMessage = await (error as any).context.text();
        }
      } catch { /* silent */ }
      console.log('[pushToken] triggerServerPush error:', errorMessage);
      return { sent: 0, errors: 1 };
    }

    return { sent: data?.sent || 0, errors: data?.errors || 0 };
  } catch (e: any) {
    console.log('[pushToken] triggerServerPush exception:', e.message);
    return { sent: 0, errors: 1 };
  }
}
