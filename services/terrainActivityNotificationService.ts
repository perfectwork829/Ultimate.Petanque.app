/**
 * Terrain Activity Notification Service
 *
 * Checks if any of the user's favorite terrains are currently active
 * (ongoing meetup, tournament, or recent match) and triggers a push
 * notification if the user has the preference enabled.
 *
 * Called periodically from the home screen or app foreground handler.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';

const LAST_NOTIF_KEY = '@terrain_activity_last_notified';
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours between notifications

interface ActiveTerrainInfo {
  terrainId: string;
  terrainName: string;
  reason: string; // e.g. "Meetup in progress", "Tournament in progress"
}

/**
 * Check favorite terrains for live activity and send push if found.
 * Returns the list of active terrains (for UI display).
 */
export async function checkFavoriteTerrainActivity(): Promise<{
  activeTerrains: ActiveTerrainInfo[];
  notificationSent: boolean;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { activeTerrains: [], notificationSent: false };

    const userId = userData.user.id;

    // 1. Get user's favorite terrain IDs
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('favorite_terrain_ids, notification_preferences')
      .eq('user_id', userId)
      .single();

    const favoriteIds: string[] = prefs?.favorite_terrain_ids || [];
    if (favoriteIds.length === 0) return { activeTerrains: [], notificationSent: false };

    // Check if terrain_activity notifications are enabled
    const notifPrefs = prefs?.notification_preferences || {};
    const isEnabled = notifPrefs.terrain_activity !== false; // default: enabled

    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = now.toISOString().slice(0, 10);

    // 2. Check for ongoing meetups on favorite terrains
    const weekAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: meetups } = await supabase
      .from('terrain_meetups')
      .select('terrain_id, title, date, end_time')
      .in('terrain_id', favoriteIds)
      .eq('status', 'active')
      .gte('date', weekAgo);

    // 3. Check for ongoing tournaments on favorite terrains
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('terrain_id, name, status, date')
      .in('terrain_id', favoriteIds)
      .in('status', ['En cours']);

    // 4. Check for recent matches (last 2 hours) on favorite terrains
    const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('terrain_id, date')
      .in('terrain_id', favoriteIds)
      .gte('date', twoHoursAgo)
      .lte('date', now.toISOString());

    // 5. Get terrain names
    const activeTerrainIds = new Set<string>();
    const activeTerrains: ActiveTerrainInfo[] = [];

    // Ongoing meetups
    (meetups || []).forEach((mt: any) => {
      const start = new Date(mt.date).getTime();
      const end = mt.end_time
        ? new Date(mt.end_time).getTime()
        : start + 3 * 60 * 60 * 1000;
      if (nowMs >= start && nowMs <= end && !activeTerrainIds.has(mt.terrain_id)) {
        activeTerrainIds.add(mt.terrain_id);
        activeTerrains.push({
          terrainId: mt.terrain_id,
          terrainName: mt.title || '',
          reason: 'meetup',
        });
      }
    });

    // Ongoing tournaments
    (tournaments || []).forEach((t: any) => {
      if (!activeTerrainIds.has(t.terrain_id)) {
        activeTerrainIds.add(t.terrain_id);
        activeTerrains.push({
          terrainId: t.terrain_id,
          terrainName: t.name || '',
          reason: 'tournament',
        });
      }
    });

    // Recent matches
    (recentMatches || []).forEach((m: any) => {
      if (!activeTerrainIds.has(m.terrain_id)) {
        activeTerrainIds.add(m.terrain_id);
        activeTerrains.push({
          terrainId: m.terrain_id,
          terrainName: '',
          reason: 'recent_match',
        });
      }
    });

    if (activeTerrains.length === 0) return { activeTerrains: [], notificationSent: false };

    // Resolve terrain names
    const { data: terrainNames } = await supabase
      .from('terrains')
      .select('id, name')
      .in('id', [...activeTerrainIds]);

    const nameMap = new Map<string, string>();
    (terrainNames || []).forEach((t: any) => nameMap.set(t.id, t.name));
    activeTerrains.forEach(at => {
      if (!at.terrainName || at.terrainName === '') {
        at.terrainName = nameMap.get(at.terrainId) || 'Terrain';
      }
    });

    // 6. Check cooldown before sending push
    let notificationSent = false;
    if (isEnabled) {
      const lastNotified = await AsyncStorage.getItem(LAST_NOTIF_KEY);
      const lastTime = lastNotified ? parseInt(lastNotified, 10) : 0;
      if (nowMs - lastTime > COOLDOWN_MS) {
        // Send push notification via edge function
        try {
          await supabase.functions.invoke('send-push', {
            body: {
              type: 'terrain_activity',
              payload: {
                targetUserId: userId,
                activeTerrains: activeTerrains.map(at => ({
                  terrainId: at.terrainId,
                  terrainName: at.terrainName,
                  reason: at.reason,
                })),
              },
            },
          });
          await AsyncStorage.setItem(LAST_NOTIF_KEY, String(nowMs));
          notificationSent = true;
        } catch (e) {
          console.log('[TerrainActivityNotif] Push error:', e);
        }
      }
    }

    return { activeTerrains, notificationSent };
  } catch (e) {
    console.log('[TerrainActivityNotif] Error:', e);
    return { activeTerrains: [], notificationSent: false };
  }
}
