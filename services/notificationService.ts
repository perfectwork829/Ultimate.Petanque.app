import { Platform } from 'react-native';
import * as Notifications from './nativeNotifications';

export interface TournamentNotificationSettings {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: Date;
  oneWeekBefore: boolean;
  threeDaysBefore: boolean;
  oneDayBefore: boolean;
}

export interface ScheduledNotification {
  tournamentId: string;
  notificationIds: string[];
}

// Configure notification behavior (no-op on web via stub)
// Wrap in try/catch to prevent module-level crash on web
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  // Silent on web
}

// Storage for scheduled notification IDs
const scheduledNotifications: Map<string, string[]> = new Map();

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('tournament-reminders', {
        name: 'Rappels de tournoi',
        description: 'Notifications de rappel pour les tournois à venir',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('share-requests', {
        name: 'Partages de matchs',
        description: 'Notifications de demandes de partage de matchs et defis',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#3B82F6',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('retention', {
        name: 'Rappels et progression',
        description: 'Notifications de suivi de progression et rappels',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#F59E0B',
        sound: 'default',
      });
    }

    return true;
  } catch (error) {
    console.log('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Check if notifications are enabled
 */
export async function areNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.log('Error checking notification status:', error);
    return false;
  }
}

/**
 * Schedule tournament reminder notifications
 */
export async function scheduleTournamentNotifications(
  settings: TournamentNotificationSettings
): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const { tournamentId, tournamentName, tournamentDate, oneWeekBefore, threeDaysBefore, oneDayBefore } = settings;

  await cancelTournamentNotifications(tournamentId);

  const notificationIds: string[] = [];
  const now = new Date();

  const scheduleNotification = async (
    triggerDate: Date,
    title: string,
    body: string,
    identifier: string
  ): Promise<string | null> => {
    if (triggerDate <= now) return null;

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { tournamentId, type: 'tournament_reminder' },
          sound: 'default',
          badge: 1,
          ...(Platform.OS === 'android' && { channelId: 'tournament-reminders' }),
        },
        trigger: {
          date: triggerDate,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
        },
        identifier,
      });

      console.log(`Scheduled notification ${identifier} for ${triggerDate.toISOString()}`);
      return id;
    } catch (error) {
      console.log(`Error scheduling notification ${identifier}:`, error);
      return null;
    }
  };

  const formattedDate = tournamentDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (oneWeekBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 7);
    d.setHours(9, 0, 0, 0);
    const id = await scheduleNotification(d, '\u{1F3C6} Tournoi dans 1 semaine !', `${tournamentName} - ${formattedDate}. Preparez-vous !`, `tournament_${tournamentId}_1week`);
    if (id) notificationIds.push(id);
  }

  if (threeDaysBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 3);
    d.setHours(9, 0, 0, 0);
    const id = await scheduleNotification(d, '\u{1F3AF} Tournoi dans 3 jours !', `${tournamentName} approche. Preparez votre equipement !`, `tournament_${tournamentId}_3days`);
    if (id) notificationIds.push(id);
  }

  if (oneDayBefore) {
    const d = new Date(tournamentDate);
    d.setDate(d.getDate() - 1);
    d.setHours(18, 0, 0, 0);
    const id = await scheduleNotification(d, '\u26A1 Tournoi demain !', `${tournamentName} c'est demain ! Reposez-vous bien ce soir.`, `tournament_${tournamentId}_1day`);
    if (id) notificationIds.push(id);
  }

  if (notificationIds.length > 0) {
    scheduledNotifications.set(tournamentId, notificationIds);
  }

  return notificationIds;
}

/**
 * Cancel all notifications for a tournament
 */
export async function cancelTournamentNotifications(tournamentId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const storedIds = scheduledNotifications.get(tournamentId);
    if (storedIds) {
      for (const id of storedIds) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
      scheduledNotifications.delete(tournamentId);
    }

    const identifiers = [
      `tournament_${tournamentId}_1week`,
      `tournament_${tournamentId}_3days`,
      `tournament_${tournamentId}_1day`,
    ];

    for (const identifier of identifiers) {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch {
        // Ignore if not found
      }
    }

    console.log(`Cancelled notifications for tournament ${tournamentId}`);
  } catch (error) {
    console.log('Error cancelling notifications:', error);
  }
}

/**
 * Get all scheduled notifications
 */
export async function getAllScheduledNotifications(): Promise<any[]> {
  if (Platform.OS === 'web') return [];
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.log('Error getting scheduled notifications:', error);
    return [];
  }
}

/**
 * Cancel all notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    scheduledNotifications.clear();
    console.log('All notifications cancelled');
  } catch (error) {
    console.log('Error cancelling all notifications:', error);
  }
}

/**
 * Send immediate test notification
 */
export async function sendTestNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '\u{1F3AF} Test Ultimate Petanque',
        body: 'Les notifications fonctionnent correctement !',
        data: { type: 'test' },
        sound: 'default',
      },
      trigger: null,
    });
  } catch (error) {
    console.log('Error sending test notification:', error);
  }
}

/**
 * Send immediate notification for a new match/challenge share request.
 */
export async function sendShareRequestNotification(params: {
  senderName: string;
  itemType: 'match' | 'challenge';
  permission: 'read' | 'write';
  itemSummary?: string;
  requestId: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { senderName, itemType, permission, itemSummary, requestId } = params;
    const isMatch = itemType === 'match';
    const icon = isMatch ? '\u{1F3AF}' : '\u{1F3C6}';
    const typeLabel = isMatch ? 'match' : 'defi';
    const permLabel = permission === 'write' ? 'modification' : 'lecture seule';
    const title = `${icon} ${senderName} vous partage un ${typeLabel}`;
    const body = itemSummary
      ? `${itemSummary} (${permLabel})`
      : `Nouvelle demande de partage en ${permLabel}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'share_request', requestId, itemType },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && { channelId: 'share-requests' }),
      },
      trigger: null, // immediate
    });
  } catch (error) {
    console.log('Error sending share request notification:', error);
  }
}

/**
 * Send immediate notification when shared match stats have been synced.
 */
export async function sendStatsSyncedNotification(params: {
 matchSummary: string;
 eloDelta: number;
 oldWinRate: number;
 newWinRate: number;
 won: boolean;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { matchSummary, eloDelta, oldWinRate, newWinRate, won } = params;
    const eloStr = eloDelta >= 0 ? `+${eloDelta}` : `${eloDelta}`;
    const icon = won ? '\u{2705}' : '\u{274C}';
    const winRateStr = oldWinRate !== newWinRate
      ? `${oldWinRate}% \u{2192} ${newWinRate}%`
      : `${newWinRate}%`;
    const title = `${icon} Stats mises a jour`;
    const body = `${matchSummary}\nELO ${eloStr} | Win rate ${winRateStr}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'stats_synced' },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && { channelId: 'share-requests' }),
      },
      trigger: null,
    });
  } catch (error) {
    console.log('Error sending stats synced notification:', error);
  }
}

/**
 * Send immediate local notification when nearby active terrains are detected.
 * Includes deduplication: only sends once per 4 hours.
 */
export async function sendProximityTerrainNotification(params: {
  terrains: { id: string; name: string; distance: number; activityLabel: string }[];
  language?: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { terrains, language = 'fr' } = params;
    if (terrains.length === 0) return false;

    // Deduplication: check last sent time
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const PROXIMITY_NOTIF_KEY = '@proximity_push_last_sent';
    const COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
    const lastSent = await AsyncStorage.getItem(PROXIMITY_NOTIF_KEY);
    if (lastSent && Date.now() - parseInt(lastSent, 10) < COOLDOWN) return false;

    const fr = language === 'fr';
    const first = terrains[0];
    const distStr = first.distance < 1000 ? `${first.distance}m` : `${(first.distance / 1000).toFixed(1)}km`;
    const title = fr
      ? `\u{1F4CD} Terrain actif a ${distStr}`
      : `\u{1F4CD} Active court ${distStr} away`;
    const body = terrains.length === 1
      ? `${first.name} — ${first.activityLabel}`
      : fr
        ? `${first.name} et ${terrains.length - 1} autre(s) terrain(s) avec activite`
        : `${first.name} and ${terrains.length - 1} other court(s) with activity`;

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('proximity-alerts', {
          name: fr ? 'Alertes de proximite' : 'Proximity alerts',
          description: fr ? 'Terrains actifs pres de vous' : 'Active courts near you',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 200, 100, 200],
          lightColor: '#22C55E',
          sound: 'default',
        });
      } catch { /* silent */ }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'terrain_activity',
          terrainId: first.id,
          lat: String(first.distance), // used for navigation
        },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && { channelId: 'proximity-alerts' }),
      },
      trigger: null, // immediate
    });

    await AsyncStorage.setItem(PROXIMITY_NOTIF_KEY, String(Date.now()));
    return true;
  } catch (error) {
    console.log('Error sending proximity notification:', error);
    return false;
  }
}

/**
 * Add notification response listener
 */
export function addNotificationResponseListener(
  callback: (response: any) => void
): { remove: () => void } {
  if (Platform.OS === 'web') return { remove: () => {} };
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add notification received listener (foreground)
 */
export function addNotificationReceivedListener(
  callback: (notification: any) => void
): { remove: () => void } {
  if (Platform.OS === 'web') return { remove: () => {} };
  return Notifications.addNotificationReceivedListener(callback);
}
