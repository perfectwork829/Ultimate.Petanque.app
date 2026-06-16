/**
 * feedNotificationService — Local push notifications for community feed events.
 *
 * Checks for notable feed events and sends local notifications:
 *   - Club member reached a new ELO rank
 *   - Meetup created in your city
 *   - Weekly record beaten
 *   - New sponsored event in your area
 *
 * Uses AsyncStorage to track last-seen timestamps and avoid duplicate alerts.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './nativeNotifications';
import { getSupabaseClient } from '@/template';
import { getEloRank } from './eloService';

const STORAGE_KEY = '@feed_notif_last_check';
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min minimum between checks

interface FeedNotifState {
  lastCheckAt: string;
  seenEloMilestones: string[]; // elo_history IDs
  seenMeetups: string[];       // meetup IDs
  seenEvents: string[];        // event IDs
  seenRecords: string[];       // weekly snapshot IDs
}

async function loadState(): Promise<FeedNotifState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* silent */ }
  return {
    lastCheckAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago on first run
    seenEloMilestones: [],
    seenMeetups: [],
    seenEvents: [],
    seenRecords: [],
  };
}

async function saveState(state: FeedNotifState): Promise<void> {
  try {
    // Keep seen lists bounded (last 200 entries max)
    state.seenEloMilestones = state.seenEloMilestones.slice(-200);
    state.seenMeetups = state.seenMeetups.slice(-200);
    state.seenEvents = state.seenEvents.slice(-200);
    state.seenRecords = state.seenRecords.slice(-200);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* silent */ }
}

async function sendLocalNotification(title: string, body: string, data: Record<string, any> = {}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'feed_event', ...data },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && { channelId: 'share-requests' }),
      },
      trigger: null, // immediate
    });
  } catch (e) {
    console.log('[FeedNotif] Send error:', e);
  }
}

/**
 * Check for new feed-worthy events and send local notifications.
 * Called from the activity feed polling or home screen.
 *
 * @param selfPlayerId - Current user's player ID
 * @param selfClub - Current user's club name
 * @param selfCity - Current user's city
 * @param language - 'fr' | 'en'
 */
export async function checkFeedNotifications(params: {
  userId: string;
  selfPlayerId?: string;
  selfClub?: string;
  selfCity?: string;
  language: string;
}): Promise<{ notificationsSent: number }> {
  const { userId, selfPlayerId, selfClub, selfCity, language } = params;
  const fr = language === 'fr';
  let sent = 0;

  const state = await loadState();

  // Cooldown check
  const lastCheck = new Date(state.lastCheckAt).getTime();
  if (Date.now() - lastCheck < COOLDOWN_MS) {
    return { notificationsSent: 0 };
  }

  const supabase = getSupabaseClient();
  const since = state.lastCheckAt;

  try {
    // 1. ELO Milestones — club members reaching new ranks
    if (selfClub) {
      const { data: eloData } = await supabase
        .from('elo_history')
        .select('id, player_id, elo_before, elo_after, elo_delta, recorded_at')
        .gt('recorded_at', since)
        .gt('elo_delta', 0)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (eloData?.length) {
        // Get player IDs to check club membership
        const playerIds = [...new Set(eloData.map(r => r.player_id))];
        const { data: playersData } = await supabase
          .from('players')
          .select('id, name, club, elo_rating, is_public')
          .in('id', playerIds)
          .eq('is_public', true);

        const playerMap = new Map(playersData?.map(p => [p.id, p]) || []);

        for (const row of eloData) {
          if (state.seenEloMilestones.includes(row.id)) continue;
          const player = playerMap.get(row.player_id);
          if (!player || player.id === selfPlayerId) continue;

          // Check if same club
          if (player.club !== selfClub) continue;

          const rankBefore = getEloRank(row.elo_before);
          const rankAfter = getEloRank(row.elo_after);
          if (rankBefore.name !== rankAfter.name) {
            state.seenEloMilestones.push(row.id);
            await sendLocalNotification(
              fr ? `🏆 ${player.name} monte en rang !` : `🏆 ${player.name} ranked up!`,
              fr
                ? `${player.name} de votre club a atteint le rang ${rankAfter.name} (${row.elo_after} ELO)`
                : `${player.name} from your club reached ${rankAfter.name} rank (${row.elo_after} ELO)`,
              { action: 'view_feed', playerId: row.player_id },
            );
            sent++;
            if (sent >= 3) break; // Cap notifications per check
          }
        }
      }
    }

    // 2. New meetups in your city
    if (selfCity && sent < 5) {
      const { data: meetupData } = await supabase
        .from('terrain_meetups')
        .select('id, title, date, terrain_name, created_at, terrain_id')
        .gt('created_at', since)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (meetupData?.length) {
        // Get terrain cities
        const terrainIds = [...new Set(meetupData.map(m => m.terrain_id).filter(Boolean))];
        const terrainCityMap = new Map<string, string>();
        if (terrainIds.length > 0) {
          const { data: terrainData } = await supabase
            .from('terrains')
            .select('id, city')
            .in('id', terrainIds);
          terrainData?.forEach(t => terrainCityMap.set(t.id, t.city));
        }

        for (const meetup of meetupData) {
          if (state.seenMeetups.includes(meetup.id)) continue;
          const meetupCity = terrainCityMap.get(meetup.terrain_id);
          if (!meetupCity || meetupCity.toLowerCase() !== selfCity.toLowerCase()) continue;

          state.seenMeetups.push(meetup.id);
          const meetupDate = new Date(meetup.date);
          const dateStr = meetupDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
          await sendLocalNotification(
            fr ? `📍 Nouveau meetup a ${selfCity}` : `📍 New meetup in ${selfCity}`,
            fr
              ? `"${meetup.title}" le ${dateStr}${meetup.terrain_name ? ` au ${meetup.terrain_name}` : ''}`
              : `"${meetup.title}" on ${dateStr}${meetup.terrain_name ? ` at ${meetup.terrain_name}` : ''}`,
            { action: 'view_meetup', meetupId: meetup.id },
          );
          sent++;
          if (sent >= 5) break;
        }
      }
    }

    // 3. New sponsored events
    if (sent < 5) {
      const { data: eventData } = await supabase
        .from('sponsored_events')
        .select('id, title, challenge_type, event_date, city, created_at')
        .gt('created_at', since)
        .in('status', ['upcoming', 'active'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (eventData?.length) {
        for (const event of eventData) {
          if (state.seenEvents.includes(event.id)) continue;
          state.seenEvents.push(event.id);

          const evDate = new Date(event.event_date);
          const dateStr = evDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
          const typeLabel = event.challenge_type === '10_tirs' ? '10 Tirs'
            : event.challenge_type === '10_tirs_sautee' ? (fr ? '10 Tirs sautee' : '10 Lob Shots')
            : 'Precision';

          await sendLocalNotification(
            fr ? `🎯 Nouveau defi communautaire` : `🎯 New community challenge`,
            fr
              ? `"${event.title}" (${typeLabel}) — ${dateStr}${event.city ? ` a ${event.city}` : ''}`
              : `"${event.title}" (${typeLabel}) — ${dateStr}${event.city ? ` in ${event.city}` : ''}`,
            { action: 'view_event', eventId: event.id },
          );
          sent++;
          if (sent >= 5) break;
        }
      }
    }

    // 4. Weekly record changes — you got overtaken
    if (sent < 5) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const weekStart = monday.toISOString().split('T')[0];

      const { data: mySnapshot } = await supabase
        .from('weekly_leaderboard_snapshots')
        .select('rank, elo_rating')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .single();

      if (mySnapshot && mySnapshot.rank <= 10) {
        // Check if someone new entered top ranks above us
        const { data: topSnapshots } = await supabase
          .from('weekly_leaderboard_snapshots')
          .select('id, user_id, rank, elo_rating')
          .eq('week_start', weekStart)
          .lt('rank', mySnapshot.rank)
          .order('rank', { ascending: true })
          .limit(3);

        if (topSnapshots?.length) {
          for (const snap of topSnapshots) {
            if (state.seenRecords.includes(snap.id)) continue;
            if (snap.user_id === userId) continue;
            state.seenRecords.push(snap.id);

            await sendLocalNotification(
              fr ? `📊 Classement hebdomadaire` : `📊 Weekly leaderboard`,
              fr
                ? `Vous etes maintenant #${mySnapshot.rank} cette semaine. Un joueur vous a depasse !`
                : `You are now #${mySnapshot.rank} this week. A player passed you!`,
              { action: 'view_leaderboard' },
            );
            sent++;
            break; // Only one leaderboard notification per check
          }
        }
      }
    }
  } catch (e) {
    console.log('[FeedNotif] Check error:', e);
  }

  // Update state
  state.lastCheckAt = new Date().toISOString();
  await saveState(state);

  return { notificationsSent: sent };
}
