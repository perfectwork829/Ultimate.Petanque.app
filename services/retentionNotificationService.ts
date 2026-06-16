/**
 * Retention Notification Service
 * 
 * Schedules local notifications at strategic intervals to maximize user retention:
 * - J0+4h: Shot success rate reminder after first match
 * - J1 (next day 6pm): Trigger second match
 * - J3 (3 days, 12pm): Social proof with leaderboard player count
 * - J7 (7 days, 10am): Weekly summary OR expiration warning for non-registered users
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './nativeNotifications';

// ============================================
// CONSTANTS
// ============================================
const STORAGE_KEY = 'retention_notifications_state';
const ONBOARDING_TEMP_KEY = 'onboarding_temp_data';
const TEMP_DATA_EXPIRY_KEY = 'temp_data_expiry';

interface RetentionState {
  scheduledAt: string;
  isRegistered: boolean;
  matchStats: {
    successRate: number;
    carreaux: number;
    matchCount: number;
    wins: number;
    tirRate: number;
  };
  notificationIds: string[];
}

interface RetentionTexts {
  fr: { title: string; body: string };
  en: { title: string; body: string };
}

// ============================================
// NOTIFICATION CHANNEL SETUP
// ============================================
async function ensureRetentionChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('retention', {
      name: 'Rappels et progression',
      description: 'Notifications de suivi de progression et rappels',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#F59E0B',
      sound: 'default',
    });
  } catch (e) {
    console.log('Error creating retention channel:', e);
  }
}

// ============================================
// SCHEDULE HELPER
// ============================================
async function scheduleLocalNotification(
  identifier: string,
  triggerDate: Date,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (triggerDate <= new Date()) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'retention', ...data },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && { channelId: 'retention' }),
      },
      trigger: {
        date: triggerDate,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
      identifier,
    });
    console.log(`[Retention] Scheduled "${identifier}" for ${triggerDate.toISOString()}`);
    return id;
  } catch (error) {
    console.log(`[Retention] Error scheduling "${identifier}":`, error);
    return null;
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Schedule all retention notifications after the first match in onboarding.
 * Call this right after the user finishes their first match (step 4 of onboarding).
 */
export async function scheduleRetentionNotifications(params: {
  language: 'fr' | 'en';
  isRegistered: boolean;
  matchStats: {
    successRate: number;
    carreaux: number;
    matchCount: number;
    wins: number;
    tirRate: number;
  };
}): Promise<void> {
  if (Platform.OS === 'web') return;

  const { language, isRegistered, matchStats } = params;
  const now = new Date();
  const notificationIds: string[] = [];

  await ensureRetentionChannel();

  // Cancel any previously scheduled retention notifications
  await cancelRetentionNotifications();

  // ─── J0+4h: Shot success rate reminder ───
  const j0Plus4h = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const j0Texts = language === 'fr'
    ? {
        title: `🎯 Ta reussite au tir : ${matchStats.successRate}%`,
        body: matchStats.carreaux > 0
          ? `${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''} realise${matchStats.carreaux > 1 ? 's' : ''} ! Bats ton record au prochain match.`
          : 'Enregistre un 2e match pour confirmer ta progression.',
      }
    : {
        title: `🎯 Your shot success: ${matchStats.successRate}%`,
        body: matchStats.carreaux > 0
          ? `${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''} scored! Beat your record in the next match.`
          : 'Record a 2nd match to confirm your progress.',
      };

  const id0 = await scheduleLocalNotification(
    'retention_j0_4h',
    j0Plus4h,
    j0Texts.title,
    j0Texts.body,
    { stage: 'j0', action: 'play_match' }
  );
  if (id0) notificationIds.push(id0);

  // ─── J1 (next day 6pm): Trigger second match ───
  const j1 = new Date(now);
  j1.setDate(j1.getDate() + 1);
  j1.setHours(18, 0, 0, 0);
  // If J1 is too close to now (within 5h), push to day after
  if (j1.getTime() - now.getTime() < 5 * 60 * 60 * 1000) {
    j1.setDate(j1.getDate() + 1);
  }

  const j1Texts = language === 'fr'
    ? {
        title: '📊 Ton taux de tir attend un 2e match',
        body: isRegistered
          ? `${matchStats.successRate}% de reussite. Confirme cette performance !`
          : `⚠️ Tes stats ne sont pas encore sauvegardees. 6 jours restants.`,
      }
    : {
        title: '📊 Your shot rate awaits a 2nd match',
        body: isRegistered
          ? `${matchStats.successRate}% success rate. Confirm this performance!`
          : `⚠️ Your stats are not yet saved. 6 days remaining.`,
      };

  const id1 = await scheduleLocalNotification(
    'retention_j1',
    j1,
    j1Texts.title,
    j1Texts.body,
    { stage: 'j1', action: isRegistered ? 'play_match' : 'register' }
  );
  if (id1) notificationIds.push(id1);

  // ─── J3 (3 days, 12pm): Social proof ───
  const j3 = new Date(now);
  j3.setDate(j3.getDate() + 3);
  j3.setHours(12, 0, 0, 0);

  const j3Texts = language === 'fr'
    ? {
        title: '🏅 Il te manque 4 matchs pour le classement',
        body: isRegistered
          ? '847 joueurs t\'attendent dans le classement communautaire. Joue pour monter !'
          : '👥 Invite ton partenaire de doublette — vos stats se synchroniseront automatiquement.',
      }
    : {
        title: '🏅 4 matches left to reach the leaderboard',
        body: isRegistered
          ? '847 players await you in the community leaderboard. Play to climb!'
          : '👥 Invite your doubles partner — your stats will sync automatically.',
      };

  const id3 = await scheduleLocalNotification(
    'retention_j3',
    j3,
    j3Texts.title,
    j3Texts.body,
    { stage: 'j3', action: isRegistered ? 'play_match' : 'invite_partner' }
  );
  if (id3) notificationIds.push(id3);

  // ─── J7 (7 days, 10am): Weekly summary OR expiration warning ───
  const j7 = new Date(now);
  j7.setDate(j7.getDate() + 7);
  j7.setHours(10, 0, 0, 0);

  const j7Texts = isRegistered
    ? language === 'fr'
      ? {
          title: '📈 Resume de ta semaine',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 's' : ''}, ${matchStats.successRate}% reussite tir${matchStats.carreaux > 0 ? `, ${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''}` : ''}. Tu progresses !`,
        }
      : {
          title: '📈 Your weekly summary',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 'es' : ''}, ${matchStats.successRate}% shot success${matchStats.carreaux > 0 ? `, ${matchStats.carreaux} carreau${matchStats.carreaux > 1 ? 'x' : ''}` : ''}. You are improving!`,
        }
    : language === 'fr'
      ? {
          title: '⏰ Dernier jour pour sauvegarder tes donnees',
          body: 'Cree un compte maintenant pour ne pas perdre ton historique, tes stats et ta progression.',
        }
      : {
          title: '⏰ Last day to save your data',
          body: 'Create an account now to keep your history, stats and progress.',
        };

  const id7 = await scheduleLocalNotification(
    'retention_j7',
    j7,
    j7Texts.title,
    j7Texts.body,
    { stage: 'j7', action: isRegistered ? 'view_stats' : 'register_urgent' }
  );
  if (id7) notificationIds.push(id7);

  // Save state
  const state: RetentionState = {
    scheduledAt: now.toISOString(),
    isRegistered,
    matchStats,
    notificationIds,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  // Set temporary data expiry (7 days) for non-registered users
  if (!isRegistered) {
    const expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await AsyncStorage.setItem(TEMP_DATA_EXPIRY_KEY, expiryDate.toISOString());
  }

  console.log(`[Retention] Scheduled ${notificationIds.length} retention notifications`);
}

/**
 * Update retention notifications after user registers.
 * Cancels expiration warnings and reschedules with registered-user messaging.
 */
export async function updateRetentionForRegisteredUser(params: {
  language: 'fr' | 'en';
  matchStats: {
    successRate: number;
    carreaux: number;
    matchCount: number;
    wins: number;
    tirRate: number;
  };
}): Promise<void> {
  if (Platform.OS === 'web') return;

  // Remove expiry timer
  await AsyncStorage.removeItem(TEMP_DATA_EXPIRY_KEY);

  // Reschedule with registered=true
  await scheduleRetentionNotifications({
    language: params.language,
    isRegistered: true,
    matchStats: params.matchStats,
  });
}

/**
 * Update retention notifications with fresh stats (e.g. after more matches played).
 * Reschedules J7 summary with updated data.
 */
export async function updateRetentionStats(params: {
  language: 'fr' | 'en';
  isRegistered: boolean;
  matchStats: {
    successRate: number;
    carreaux: number;
    matchCount: number;
    wins: number;
    tirRate: number;
  };
}): Promise<void> {
  if (Platform.OS === 'web') return;

  const { language, isRegistered, matchStats } = params;

  // Only update J7 — the earlier ones have likely already fired
  try {
    await Notifications.cancelScheduledNotificationAsync('retention_j7');
  } catch { /* may not exist */ }

  const stateStr = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stateStr) return;

  const state: RetentionState = JSON.parse(stateStr);
  const scheduledDate = new Date(state.scheduledAt);
  const j7 = new Date(scheduledDate);
  j7.setDate(j7.getDate() + 7);
  j7.setHours(10, 0, 0, 0);

  if (j7 <= new Date()) return; // Already past

  const j7Texts = isRegistered
    ? language === 'fr'
      ? {
          title: '📈 Resume de ta semaine',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 's' : ''}, ${matchStats.successRate}% reussite tir, ${matchStats.wins} victoire${matchStats.wins > 1 ? 's' : ''}. Continue comme ca !`,
        }
      : {
          title: '📈 Your weekly summary',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 'es' : ''}, ${matchStats.successRate}% shot success, ${matchStats.wins} win${matchStats.wins > 1 ? 's' : ''}. Keep it up!`,
        }
    : language === 'fr'
      ? {
          title: '⏰ Dernier jour pour sauvegarder tes donnees',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 's' : ''} et ${matchStats.successRate}% de reussite vont etre perdus. Cree un compte maintenant !`,
        }
      : {
          title: '⏰ Last day to save your data',
          body: `${matchStats.matchCount} match${matchStats.matchCount > 1 ? 'es' : ''} and ${matchStats.successRate}% success rate will be lost. Create an account now!`,
        };

  await scheduleLocalNotification(
    'retention_j7',
    j7,
    j7Texts.title,
    j7Texts.body,
    { stage: 'j7', action: isRegistered ? 'view_stats' : 'register_urgent' }
  );

  // Update stored state
  state.matchStats = matchStats;
  state.isRegistered = isRegistered;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Cancel all retention notifications.
 */
export async function cancelRetentionNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  const identifiers = [
    'retention_j0_4h',
    'retention_j1',
    'retention_j3',
    'retention_j7',
  ];

  for (const id of identifiers) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch { /* ignore if not found */ }
  }

  await AsyncStorage.removeItem(STORAGE_KEY);
  console.log('[Retention] All retention notifications cancelled');
}

/**
 * Check if temporary onboarding data has expired (7-day limit for non-registered users).
 * Returns true if data should be cleaned up.
 */
export async function checkTempDataExpiry(): Promise<{ expired: boolean; daysRemaining: number }> {
  try {
    const expiryStr = await AsyncStorage.getItem(TEMP_DATA_EXPIRY_KEY);
    if (!expiryStr) return { expired: false, daysRemaining: -1 }; // No expiry set (registered user)

    const expiryDate = new Date(expiryStr);
    const now = new Date();
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

    if (msRemaining <= 0) {
      // Clean up expired data
      await AsyncStorage.removeItem(ONBOARDING_TEMP_KEY);
      await AsyncStorage.removeItem(TEMP_DATA_EXPIRY_KEY);
      await cancelRetentionNotifications();
      return { expired: true, daysRemaining: 0 };
    }

    return { expired: false, daysRemaining };
  } catch (e) {
    console.log('[Retention] Error checking temp data expiry:', e);
    return { expired: false, daysRemaining: -1 };
  }
}

/**
 * Clear the expiry timer (called when user successfully registers).
 */
export async function clearTempDataExpiry(): Promise<void> {
  await AsyncStorage.removeItem(TEMP_DATA_EXPIRY_KEY);
}

/**
 * Get the current retention state (for debugging/display).
 */
export async function getRetentionState(): Promise<RetentionState | null> {
  try {
    const str = await AsyncStorage.getItem(STORAGE_KEY);
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}
