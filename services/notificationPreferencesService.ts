/**
 * Notification Preferences Service
 *
 * Manages user notification preferences stored in user_preferences table.
 * Controls which types of server push notifications the user wants to receive.
 */
import { getSupabaseClient } from '@/template';

export interface NotificationPreferences {
  event_created: boolean;
  meetup_invitation: boolean;
  ranking_changed: boolean;
  share_request: boolean;
  event_reminder: boolean;
  weekly_digest: boolean;
  league_promotion: boolean;
  inactivity_warning: boolean;
  witness_request: boolean;
  badge_unlock: boolean;
  new_follower: boolean;
  club_invitation: boolean;
  club_invitation_reminder: boolean;
  terrain_proximity: boolean;
  terrain_proximity_radius: number; // meters: 1000, 3000, 5000, 10000
  terrain_activity: boolean; // Push when favorite terrains become active
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  event_created: true,
  meetup_invitation: true,
  ranking_changed: true,
  share_request: true,
  event_reminder: true,
  weekly_digest: true,
  league_promotion: true,
  inactivity_warning: true,
  witness_request: true,
  badge_unlock: true,
  new_follower: true,
  club_invitation: true,
  club_invitation_reminder: true,
  terrain_proximity: true,
  terrain_proximity_radius: 3000,
  terrain_activity: true,
};

export const PROXIMITY_RADIUS_OPTIONS = [
  { value: 1000, labelFr: '1 km', labelEn: '1 km' },
  { value: 3000, labelFr: '3 km', labelEn: '3 km' },
  { value: 5000, labelFr: '5 km', labelEn: '5 km' },
  { value: 10000, labelFr: '10 km', labelEn: '10 km' },
];

/**
 * Load notification preferences for the current user.
 */
export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

    const { data, error } = await supabase
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', userData.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.log('[notifPrefs] Load error:', error.message);
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }

    if (data?.notification_preferences) {
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...data.notification_preferences,
      };
    }

    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch (e) {
    console.log('[notifPrefs] Load exception:', e);
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

/**
 * Save notification preferences for the current user.
 */
export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userData.user.id,
          notification_preferences: prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check if a specific notification type is enabled for a given user.
 * Used by the send-push Edge Function (server-side) or client pre-check.
 */
export async function isNotificationTypeEnabled(
  userId: string,
  type: keyof NotificationPreferences
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', userId)
      .single();

    if (error || !data?.notification_preferences) return true; // Default: enabled
    return data.notification_preferences[type] !== false;
  } catch {
    return true; // Default: enabled on error
  }
}
