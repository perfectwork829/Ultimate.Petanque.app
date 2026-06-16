/**
 * Edge Function: send-push
 *
 * Server-side push notification dispatcher.
 * Receives a notification trigger type + context data,
 * determines recipients, and sends via Expo Push API.
 * Respects user notification preferences stored in user_preferences.notification_preferences.
 *
 * Trigger types:
 * - event_created       : Ambassador created a sponsored event → notify nearby users
 * - meetup_invitation    : User invited to a meetup → notify that user
 * - ranking_changed      : Leaderboard ranking changed → notify affected users
 * - share_request        : Match/challenge share request → notify recipient
 * - event_reminder       : Upcoming event reminder → notify participants
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendPushNotifications, buildPushMessage, haversineDistance, getPushReceipts } from '../_shared/push.ts';

const PROXIMITY_RADIUS_KM = 200;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { type, payload } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-push] Trigger: ${type}, sender: ${user.id}`);

    // ---- Check if this push type is globally disabled by admin ----
    try {
      const { data: appCfg } = await supabaseAdmin
        .from('app_config')
        .select('disabled_push_types')
        .eq('id', 'main')
        .single();
      const disabledTypes: string[] = appCfg?.disabled_push_types || [];
      if (Array.isArray(disabledTypes) && disabledTypes.includes(type)) {
        console.log(`[send-push] Type "${type}" is globally disabled by admin. Skipping.`);
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'type_disabled_by_admin' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (cfgErr) {
      console.log('[send-push] Could not check disabled_push_types, proceeding:', cfgErr);
    }

    let sent = 0;
    let errors = 0;

    // ---- Helper: check if a user has a specific notification type enabled ----
    // Caches results for the duration of this request to avoid repeated queries
    const _prefCache = new Map<string, Record<string, boolean>>();
    const isNotifEnabled = async (userId: string, notifType: string): Promise<boolean> => {
      if (_prefCache.has(userId)) {
        const prefs = _prefCache.get(userId)!;
        return prefs[notifType] !== false;
      }
      try {
        const { data } = await supabaseAdmin
          .from('user_preferences')
          .select('notification_preferences')
          .eq('user_id', userId)
          .single();
        const prefs = data?.notification_preferences || {};
        _prefCache.set(userId, prefs);
        return prefs[notifType] !== false; // Default: enabled
      } catch {
        return true;
      }
    };

    // Batch check: filter a set of user IDs by notification preference
    const filterByNotifPref = async (userIds: Set<string>, notifType: string): Promise<Set<string>> => {
      // Batch fetch all preferences at once for efficiency
      const uidArray = [...userIds];
      if (uidArray.length === 0) return new Set();
      const { data: prefsData } = await supabaseAdmin
        .from('user_preferences')
        .select('user_id, notification_preferences')
        .in('user_id', uidArray);

      const prefMap = new Map<string, Record<string, boolean>>();
      (prefsData || []).forEach((p: any) => {
        prefMap.set(p.user_id, p.notification_preferences || {});
        _prefCache.set(p.user_id, p.notification_preferences || {});
      });

      const filtered = new Set<string>();
      for (const uid of uidArray) {
        const prefs = prefMap.get(uid);
        // If no preferences row exists, default is all enabled
        if (!prefs || prefs[notifType] !== false) {
          filtered.add(uid);
        }
      }
      return filtered;
    };

    // ============================================================
    // EVENT_CREATED: Ambassador created a sponsored event
    // Supports targeted user IDs via `targetUserIds` array.
    // If `targetUserIds` is provided, only those users get notified.
    // Otherwise, falls back to geo-proximity (200km / same city).
    // ============================================================
    if (type === 'event_created') {
      const { eventId, eventTitle, city, country, latitude, longitude, challengeType, ambassadorName, targetUserIds } = payload || {};
      if (!eventId || !eventTitle) {
        return new Response(JSON.stringify({ error: 'Missing eventId/eventTitle' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let matchedUserIds = new Set<string>();

      if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        // ---- TARGETED MODE: only send to specified users ----
        console.log(`[send-push] event_created: targeted mode, ${targetUserIds.length} user(s)`);
        targetUserIds.forEach((uid: string) => {
          if (uid !== user.id) matchedUserIds.add(uid);
        });
      } else {
        // ---- BROADCAST MODE: geo-proximity based ----
        const { data: tokens } = await supabaseAdmin
          .from('push_tokens')
          .select('user_id, token')
          .eq('active', true)
          .neq('user_id', user.id);

        if (!tokens || tokens.length === 0) {
          return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const userIds = [...new Set(tokens.map(t => t.user_id))];

        const { data: players } = await supabaseAdmin
          .from('players')
          .select('user_id, location, name')
          .in('user_id', userIds);

        const playerMap = new Map<string, any>();
        (players || []).forEach(p => {
          if (!playerMap.has(p.user_id)) playerMap.set(p.user_id, p);
        });

        for (const uid of userIds) {
          const player = playerMap.get(uid);
          if (!player?.location) {
            if (city) {
              const { data: userTerrains } = await supabaseAdmin
                .from('terrains').select('city').eq('user_id', uid).limit(5);
              const { data: userClubs } = await supabaseAdmin
                .from('clubs').select('city').eq('user_id', uid).limit(5);
              const userCities = [
                ...(userTerrains || []).map(t => t.city?.toLowerCase()),
                ...(userClubs || []).map(c => c.city?.toLowerCase()),
              ].filter(Boolean);
              if (userCities.includes(city.toLowerCase())) {
                matchedUserIds.add(uid);
              }
            }
            continue;
          }

          const playerLat = player.location.latitude;
          const playerLng = player.location.longitude;

          if (city && player.location.city?.toLowerCase() === city.toLowerCase()) {
            matchedUserIds.add(uid);
            continue;
          }

          if (latitude && longitude && playerLat && playerLng) {
            const dist = haversineDistance(latitude, longitude, playerLat, playerLng);
            if (dist <= PROXIMITY_RADIUS_KM) {
              matchedUserIds.add(uid);
            }
          }
        }
      }

      // Filter by notification preference
      const recipientUserIds = await filterByNotifPref(matchedUserIds, 'event_created');
      console.log(`[send-push] event_created: ${recipientUserIds.size} recipients (${matchedUserIds.size} matched, filtered by prefs)`);

      // Fetch tokens for recipients
      const { data: recipientTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', [...recipientUserIds])
        .eq('active', true);

      if (!recipientTokens || recipientTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const challengeLabel = challengeType === '10_tirs' ? '10 Tirs' : challengeType === '10_tirs_sautee' ? '10 Tirs sautes' : 'Precision';
      const messages = recipientTokens.map(t => buildPushMessage(
        t.token,
        `\u{1F3AF} Nouveau defi ambassadeur${city ? ` a ${city}` : ''} !`,
        `${ambassadorName || 'Un ambassadeur'} lance "${eventTitle}" (${challengeLabel}).${city ? ` Pres de chez vous !` : ''}`,
        { type: 'event_created', eventId },
        { channelId: 'tournament-reminders', priority: 'high' }
      ));

      const tickets = await sendPushNotifications(messages);
      sent = tickets.filter(t => t.status === 'ok').length;
      errors = tickets.filter(t => t.status === 'error').length;

      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i].details?.error === 'DeviceNotRegistered') {
          const invalidToken = messages[i]?.to;
          if (invalidToken) {
            await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
            console.log(`[send-push] Deactivated invalid token: ${invalidToken.substring(0, 30)}...`);
          }
        }
      }
    }

    // ============================================================
    // MEETUP_INVITATION: User invited to a meetup
    // ============================================================
    else if (type === 'meetup_invitation') {
      const { meetupId, meetupTitle, invitedUserId, inviterName, meetupDate, terrainName } = payload || {};
      if (!meetupId || !invitedUserId) {
        return new Response(JSON.stringify({ error: 'Missing meetupId/invitedUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(invitedUserId, 'meetup_invitation');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', invitedUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const dateStr = meetupDate ? new Date(meetupDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
        const messages = tokens.map(t => buildPushMessage(
          t.token,
          `\u{1F3AF} Invitation a un RDV petanque !`,
          `${inviterName || 'Un joueur'} vous invite a "${meetupTitle || 'RDV'}"${terrainName ? ` a ${terrainName}` : ''}${dateStr ? ` le ${dateStr}` : ''}.`,
          { type: 'meetup_invitation', meetupId },
          { channelId: 'share-requests', priority: 'high' }
        ));

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter(t => t.status === 'ok').length;
        errors = tickets.filter(t => t.status === 'error').length;
      }
    }

    // ============================================================
    // RANKING_CHANGED: Notify users whose ranking has changed
    // ============================================================
    else if (type === 'ranking_changed') {
      const { changes } = payload || {};
      if (!changes || !Array.isArray(changes) || changes.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter by notification preference in batch
      const allUserIds = new Set<string>(changes.map((c: any) => c.userId));
      const enabledUserIds = await filterByNotifPref(allUserIds, 'ranking_changed');

      const filteredChanges = changes.filter((c: any) => enabledUserIds.has(c.userId));
      if (filteredChanges.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'all_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userIdsList = filteredChanges.map((c: any) => c.userId);
      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', userIdsList)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const tokensByUser = new Map<string, string[]>();
        tokens.forEach(t => {
          if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
          tokensByUser.get(t.user_id)!.push(t.token);
        });

        const messages: any[] = [];
        for (const change of filteredChanges) {
          const userTokens = tokensByUser.get(change.userId) || [];
          const isUp = change.direction === 'up';
          const icon = isUp ? '\u{1F4C8}' : '\u{1F4C9}';
          const verb = isUp ? 'monte' : 'descendu';
          const diff = Math.abs(change.newRank - change.oldRank);

          for (const tk of userTokens) {
            messages.push(buildPushMessage(
              tk,
              `${icon} Classement mis a jour !`,
              `Vous etes ${verb} de ${diff} place(s) : #${change.oldRank} \u2192 #${change.newRank}.`,
              { type: 'ranking_changed', newRank: change.newRank, oldRank: change.oldRank },
              { channelId: 'tournament-reminders' }
            ));
          }
        }

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter(t => t.status === 'ok').length;
        errors = tickets.filter(t => t.status === 'error').length;
      }
    }

    // ============================================================
    // SHARE_REQUEST: Match/challenge share request
    // ============================================================
    else if (type === 'share_request') {
      const { recipientUserId, senderName, itemType, permission, itemSummary } = payload || {};
      if (!recipientUserId) {
        return new Response(JSON.stringify({ error: 'Missing recipientUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(recipientUserId, 'share_request');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', recipientUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const typeLabel = itemType === 'match' ? 'match' : 'defi';
        const permLabel = permission === 'write' ? 'modification' : 'lecture seule';
        const messages = tokens.map(t => buildPushMessage(
          t.token,
          `\u{1F3AF} ${senderName || 'Un joueur'} vous partage un ${typeLabel}`,
          `${itemSummary || 'Nouvelle demande de partage'} (${permLabel})`,
          { type: 'share_request', itemType },
          { channelId: 'share-requests', priority: 'high' }
        ));

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter(t => t.status === 'ok').length;
        errors = tickets.filter(t => t.status === 'error').length;
      }
    }

    // ============================================================
    // EVENT_REMINDER: Remind participants of an upcoming event
    // ============================================================
    else if (type === 'event_reminder') {
      const { eventId, eventTitle, startTime } = payload || {};
      if (!eventId) {
        return new Response(JSON.stringify({ error: 'Missing eventId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: participants } = await supabaseAdmin
        .from('sponsored_event_participants')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('status', 'accepted');

      if (!participants || participants.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter by notification preference in batch
      const participantIds = new Set<string>(participants.map(p => p.user_id));
      const enabledIds = await filterByNotifPref(participantIds, 'event_reminder');

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', [...enabledIds])
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const dateStr = startTime ? new Date(startTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const messages = tokens.map(t => buildPushMessage(
          t.token,
          `\u26A1 Defi ambassadeur bientot !`,
          `"${eventTitle || 'Evenement'}" commence ${dateStr ? `le ${dateStr}` : 'bientot'}. Preparez-vous !`,
          { type: 'event_reminder', eventId },
          { channelId: 'tournament-reminders' }
        ));

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter(t => t.status === 'ok').length;
        errors = tickets.filter(t => t.status === 'error').length;
      }
    }

    // ============================================================
    // WEEKLY_SUMMARY: Monday morning summary notification
    // ============================================================
    else if (type === 'weekly_summary') {
      const { summaries } = payload || {};
      // summaries: Array<{ userId, rank, matchesPlayed, wins, winRate, rankChange, rankDiff, previousRank }>
      if (!summaries || !Array.isArray(summaries) || summaries.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter by notification preference
      const allUserIds = new Set<string>(summaries.map((s: any) => s.userId));
      const enabledUserIds = await filterByNotifPref(allUserIds, 'ranking_changed');

      const filteredSummaries = summaries.filter((s: any) => enabledUserIds.has(s.userId));
      if (filteredSummaries.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'all_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userIdsList = filteredSummaries.map((s: any) => s.userId);
      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', userIdsList)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const tokensByUser = new Map<string, string[]>();
        tokens.forEach(t => {
          if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
          tokensByUser.get(t.user_id)!.push(t.token);
        });

        const messages: any[] = [];
        for (const summary of filteredSummaries) {
          const userTokens = tokensByUser.get(summary.userId) || [];
          if (userTokens.length === 0) continue;

          const rankIcon = summary.rankChange === 'up' ? '\u{1F4C8}' : summary.rankChange === 'down' ? '\u{1F4C9}' : '\u{1F3C6}';
          let body = `${summary.matchesPlayed} matchs, ${summary.wins} victoires (${summary.winRate}%). `;
          if (summary.rankChange === 'up') {
            body += `Tu as gagne ${summary.rankDiff} place(s) : #${summary.rank} !`;
          } else if (summary.rankChange === 'down') {
            body += `Tu as perdu ${summary.rankDiff} place(s) : #${summary.rank}.`;
          } else if (summary.rankChange === 'same') {
            body += `Position stable : #${summary.rank}.`;
          } else {
            body += `Premiere apparition au classement : #${summary.rank} !`;
          }

          for (const tk of userTokens) {
            messages.push(buildPushMessage(
              tk,
              `${rankIcon} Resume de ta semaine`,
              body,
              { type: 'ranking_changed', newRank: summary.rank, weeklyReset: true },
              { channelId: 'tournament-reminders' }
            ));
          }
        }

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter(t => t.status === 'ok').length;
        errors = tickets.filter(t => t.status === 'error').length;
      }
    }

    // ============================================================
    // TRUST_SCORE_IMPROVED: Notify user when trust score improves past threshold
    // ============================================================
    else if (type === 'trust_score_improved') {
      const { targetUserId, newScore, newLevel, previousScore } = payload || {};
      if (!targetUserId || newScore === undefined) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/newScore' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const levelLabels: Record<string, { fr: string; en: string }> = {
          verified: { fr: 'Verifie', en: 'Verified' },
          high: { fr: 'Fiable', en: 'Trusted' },
          medium: { fr: 'Standard', en: 'Standard' },
        };
        const levelLabel = levelLabels[newLevel]?.fr || newLevel;
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F6E1} Score de confiance ameliore !`,
          `Votre score est passe a ${newScore}/100 (${levelLabel}). Continuez a jouer avec d'autres joueurs !`,
          { type: 'trust_score_improved', newScore, newLevel },
          { channelId: 'tournament-reminders' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TRUST_WEEKLY_TIP: Weekly tip for users with low trust score
    // ============================================================
    else if (type === 'trust_weekly_tip') {
      const { targets } = payload || {};
      // targets: Array<{ userId: string; score: number }>
      if (!targets || !Array.isArray(targets) || targets.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userIdsList = targets.map((t: any) => t.userId);
      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', userIdsList)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const tokensByUser = new Map<string, string[]>();
        tokens.forEach((t: any) => {
          if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
          tokensByUser.get(t.user_id)!.push(t.token);
        });

        const messages: any[] = [];
        for (const target of targets) {
          const userTokens = tokensByUser.get(target.userId) || [];
          for (const tk of userTokens) {
            messages.push(buildPushMessage(
              tk,
              `\u{1F4AA} Ameliorez votre fiabilite`,
              `Jouez des matchs avec d'autres utilisateurs pour augmenter votre score (${target.score}/100).`,
              { type: 'trust_score_improved' },
              { channelId: 'tournament-reminders' }
            ));
          }
        }

        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // WITNESS_REQUEST: Notify witness user about attestation request
    // ============================================================
    else if (type === 'witness_request') {
      const { witnessUserId, requesterName, matchId, matchSummary } = payload || {};
      if (!witnessUserId || !matchId) {
        return new Response(JSON.stringify({ error: 'Missing witnessUserId/matchId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', witnessUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F441} Demande d'attestation de match`,
          `${requesterName || 'Un joueur'} vous demande d'attester un match${matchSummary ? ` (${matchSummary})` : ''}. Acceptez pour valider le match a 2x.`,
          { type: 'witness_request', matchId, action: 'view' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // WITNESS_ATTESTED: Notify requester that witness attested match
    // ============================================================
    else if (type === 'witness_attested') {
      const { requesterUserId, witnessName, matchId } = payload || {};
      if (!requesterUserId || !matchId) {
        return new Response(JSON.stringify({ error: 'Missing requesterUserId/matchId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', requesterUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u2705 Match atteste !`,
          `${witnessName || 'Un temoin'} a atteste votre match. Le poids de validation passe a 2.0x dans le classement.`,
          { type: 'witness_attested', matchId },
          { channelId: 'share-requests' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // SPONSOR_PUSH: Sponsor/partner sends push to nearby players
    // Gold: unlimited, Silver: 1/month (enforced client-side + DB tracking)
    // ============================================================
    else if (type === 'sponsor_push') {
      const { ambassadorId, ambassadorName, title: pushTitle, body: pushBody, radiusKm, city: sponsorCity } = payload || {};
      if (!ambassadorId || !pushTitle || !pushBody) {
        return new Response(JSON.stringify({ error: 'Missing ambassadorId/title/body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is the ambassador owner
      const { data: ambRecord } = await supabaseAdmin
        .from('ambassadors')
        .select('id, user_id, badge_type, ambassador_level')
        .eq('id', ambassadorId)
        .single();

      if (!ambRecord || ambRecord.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized: not ambassador owner' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check monthly limit for Silver (sponsor badge)
      if (ambRecord.badge_type === 'sponsor') {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const { data: usageData } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('ambassador_id', ambassadorId)
          .eq('event_type', 'sponsor_push')
          .gte('created_at', startOfMonth.toISOString());
        if (usageData && usageData.length >= 1) {
          return new Response(JSON.stringify({ error: 'Monthly push limit reached', sent: 0, errors: 0 }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (ambRecord.badge_type === 'ambassador') {
        // Ambassador push: Elite = unlimited, Confirmé = 1/month, Découverte = not allowed
        const ambLevel = ambRecord.ambassador_level || 'decouverte';
        if (ambLevel === 'decouverte') {
          return new Response(JSON.stringify({ error: 'Decouverte ambassadors cannot send push notifications. Upgrade to Confirme level.' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (ambLevel === 'confirme') {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          const { data: usageData } = await supabaseAdmin
            .from('ambassador_analytics')
            .select('id')
            .eq('ambassador_id', ambassadorId)
            .eq('event_type', 'sponsor_push')
            .gte('created_at', startOfMonth.toISOString());
          if (usageData && usageData.length >= 1) {
            return new Response(JSON.stringify({ error: 'Monthly push limit reached for Confirme level. Upgrade to Elite for unlimited.', sent: 0, errors: 0 }), {
              status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        // Elite = unlimited, fall through
      } else if (ambRecord.badge_type !== 'gold_sponsor') {
        return new Response(JSON.stringify({ error: 'Bronze partners cannot send push notifications' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const targetRadius = radiusKm || 200;

      // Get all active push tokens (exclude sender)
      const { data: allTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .eq('active', true)
        .neq('user_id', user.id);

      if (!allTokens || allTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allUserIds = [...new Set(allTokens.map(t => t.user_id))];

      // Get player locations for geo-filtering
      const { data: playerLocations } = await supabaseAdmin
        .from('players')
        .select('user_id, location')
        .in('user_id', allUserIds);

      const playerLocMap = new Map<string, any>();
      (playerLocations || []).forEach(p => {
        if (!playerLocMap.has(p.user_id) && p.location) playerLocMap.set(p.user_id, p.location);
      });

      // Also check terrains/clubs for users without direct location
      const usersWithoutLoc = allUserIds.filter(uid => !playerLocMap.has(uid));
      if (usersWithoutLoc.length > 0 && sponsorCity) {
        const { data: terrainCities } = await supabaseAdmin
          .from('terrains').select('user_id, city').in('user_id', usersWithoutLoc);
        const { data: clubCities } = await supabaseAdmin
          .from('clubs').select('user_id, city').in('user_id', usersWithoutLoc);
        const cityMap = new Map<string, Set<string>>();
        [...(terrainCities || []), ...(clubCities || [])].forEach((r: any) => {
          if (!cityMap.has(r.user_id)) cityMap.set(r.user_id, new Set());
          if (r.city) cityMap.get(r.user_id)!.add(r.city.toLowerCase());
        });
        // Mark city-matched users
        cityMap.forEach((cities, uid) => {
          if (cities.has(sponsorCity.toLowerCase())) {
            playerLocMap.set(uid, { city: sponsorCity });
          }
        });
      }

      // Get ambassador location for distance calc
      let ambLat: number | null = null;
      let ambLng: number | null = null;
      if (ambRecord) {
        const { data: ambPlayer } = await supabaseAdmin
          .from('players')
          .select('location')
          .eq('user_id', ambRecord.user_id)
          .limit(1)
          .maybeSingle();
        if (ambPlayer?.location?.latitude) {
          ambLat = ambPlayer.location.latitude;
          ambLng = ambPlayer.location.longitude;
        }
      }

      // Filter by geographic proximity
      const matchedUserIds = new Set<string>();
      for (const uid of allUserIds) {
        const loc = playerLocMap.get(uid);
        if (!loc) continue;

        // City match
        if (sponsorCity && loc.city?.toLowerCase() === sponsorCity.toLowerCase()) {
          matchedUserIds.add(uid);
          continue;
        }

        // Distance match
        if (ambLat && ambLng && loc.latitude && loc.longitude) {
          const dist = haversineDistance(ambLat, ambLng, loc.latitude, loc.longitude);
          if (dist <= targetRadius) {
            matchedUserIds.add(uid);
          }
        }
      }

      // Filter by notification preference
      const enabledUserIds = await filterByNotifPref(matchedUserIds, 'event_created');
      console.log(`[send-push] sponsor_push: ${enabledUserIds.size} recipients (${matchedUserIds.size} matched)`);

      // Build and send messages
      const { data: recipientTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', [...enabledUserIds])
        .eq('active', true);

      if (!recipientTokens || recipientTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_matching_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const messages = recipientTokens.map(t => buildPushMessage(
        t.token,
        pushTitle,
        pushBody,
        { type: 'sponsor_push', ambassadorId },
        { channelId: 'tournament-reminders', priority: 'high' }
      ));

      const tickets = await sendPushNotifications(messages);
      sent = tickets.filter(t => t.status === 'ok').length;
      errors = tickets.filter(t => t.status === 'error').length;

      // Deactivate invalid tokens
      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i].details?.error === 'DeviceNotRegistered') {
          const invalidToken = messages[i]?.to;
          if (invalidToken) {
            await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
          }
        }
      }
    }

    // ============================================================
    // AMBASSADOR_PROMOTION: Notify ambassador when promoted to next level
    // ============================================================
    else if (type === 'ambassador_promotion') {
      const { targetUserId, ambassadorName, newLevel, newLevelLabel } = payload || {};
      if (!targetUserId || !newLevel) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/newLevel' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const levelEmoji = newLevel === 'elite' ? '\u{1F451}' : '\u{1F680}';
        const levelName = newLevelLabel || (newLevel === 'elite' ? 'Elite' : 'Confirme');
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `${levelEmoji} Niveau superieur atteint !`,
          `Felicitations ${ambassadorName || 'Ambassadeur'} ! Vous etes desormais ambassadeur ${levelName}. De nouveaux avantages vous attendent.`,
          { type: 'ambassador_promotion', newLevel },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // ELO_RANK_CHANGED: Notify user when ELO rank tier changes
    // ============================================================
    else if (type === 'elo_rank_changed') {
      const { targetUserId, playerName, oldRank, newRank, oldElo, newElo, direction } = payload || {};
      if (!targetUserId || !newRank) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/newRank' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(targetUserId, 'ranking_changed');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const rankLabels: Record<string, { fr: string; en: string; emoji: string }> = {
          bronze: { fr: 'Bronze', en: 'Bronze', emoji: '\u{1F94E}' },
          silver: { fr: 'Argent', en: 'Silver', emoji: '\u{1FA99}' },
          gold: { fr: 'Or', en: 'Gold', emoji: '\u{1F3C5}' },
          diamond: { fr: 'Diamant', en: 'Diamond', emoji: '\u{1F48E}' },
          master: { fr: 'Maitre', en: 'Master', emoji: '\u{1F451}' },
        };
        const isPromotion = direction === 'up';
        const rankInfo = rankLabels[newRank] || rankLabels.bronze;
        const emoji = isPromotion ? rankInfo.emoji : '\u{1F4C9}';
        const title = isPromotion
          ? `${emoji} Nouveau rang ELO : ${rankInfo.fr} !`
          : `${emoji} Changement de rang ELO`;
        const body = isPromotion
          ? `Felicitations ! Votre ELO est passe a ${newElo} et vous atteignez le rang ${rankInfo.fr}. Continuez comme ca !`
          : `Votre ELO est descendu a ${newElo} (rang ${rankInfo.fr}). Rejouez pour remonter !`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'elo_rank_changed', newRank, newElo, oldRank, oldElo, direction },
          { channelId: 'tournament-reminders', priority: isPromotion ? 'high' : 'default' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // MAINTENANCE: Notify ALL users about upcoming/active maintenance
    // ============================================================
    else if (type === 'maintenance') {
      const { messageFr, messageEn, endTime } = payload || {};
      if (!messageFr && !messageEn) {
        return new Response(JSON.stringify({ error: 'Missing messageFr or messageEn' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is admin
      const { data: adminProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminProfile?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send maintenance notifications' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get ALL active push tokens
      const { data: allTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .eq('active', true);

      if (!allTokens || allTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[send-push] maintenance: sending to ${allTokens.length} tokens`);

      const endTimeStr = endTime
        ? new Date(endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '';

      const messages = allTokens.map((t: any) => buildPushMessage(
        t.token,
        `\u{1F6A7} Maintenance programmee`,
        `${messageFr || messageEn}${endTimeStr ? ` Fin estimee : ${endTimeStr}.` : ''}`,
        { type: 'maintenance' },
        { channelId: 'tournament-reminders', priority: 'high' }
      ));

      // Send in batches of 100 to avoid Expo API limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const tickets = await sendPushNotifications(batch);
        sent += tickets.filter((t: any) => t.status === 'ok').length;
        errors += tickets.filter((t: any) => t.status === 'error').length;

        // Deactivate invalid tokens
        for (let j = 0; j < tickets.length; j++) {
          if (tickets[j].details?.error === 'DeviceNotRegistered') {
            const invalidToken = batch[j]?.to;
            if (invalidToken) {
              await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
            }
          }
        }
      }
    }

    // ============================================================
    // ANNOUNCEMENT: Admin sends targeted announcement push
    // ============================================================
    else if (type === 'announcement') {
      const { titleFr, titleEn, messageFr, messageEn, targetType, targetValue, abTest, variantBTitleFr, variantBTitleEn, variantBMessageFr, variantBMessageEn, combinedFilters } = payload || {};
      if (!titleFr && !titleEn) {
        return new Response(JSON.stringify({ error: 'Missing title' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is admin
      const { data: adminAnn } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminAnn?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send announcements' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get ALL active push tokens first
      const { data: allAnnTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .eq('active', true);

      if (!allAnnTokens || allAnnTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let targetTokens = allAnnTokens;

      // Apply targeting filter (supports single target or combined filters)
      const hasCombined = combinedFilters && typeof combinedFilters === 'object' && Object.keys(combinedFilters).length > 0;
      if ((targetType && targetType !== 'all' && targetValue) || hasCombined) {
        const allUserIds = [...new Set(allAnnTokens.map((t: any) => t.user_id))];
        let matchedUserIds = new Set<string>();
        const combinedSets: Set<string>[] = [];

        // Helper to build a set from a single criteria
        const buildCriteriaSet = async (cType: string, cValue: string): Promise<Set<string>> => {
          const cSet = new Set<string>();
          if (cType === 'rank' && cValue) {
            const rankRanges: Record<string, { min: number; max: number }> = {
              bronze: { min: 0, max: 1099 }, silver: { min: 1100, max: 1199 },
              gold: { min: 1200, max: 1499 }, diamond: { min: 1500, max: 1799 },
              master: { min: 1800, max: 1999 }, grand_master: { min: 2000, max: 999999 },
            };
            const rankKeys = cValue.split(',').map((r: string) => r.trim()).filter(Boolean);
            for (const rk of rankKeys) {
              const range = rankRanges[rk];
              if (range) {
                const { data: rp } = await supabaseAdmin.from('players').select('user_id').gte('elo_rating', range.min).lte('elo_rating', range.max).in('user_id', allUserIds);
                (rp || []).forEach((p: any) => cSet.add(p.user_id));
              }
            }
          } else if (cType === 'account_age' && cValue) {
            const maxDays = parseInt(cValue) || 7;
            const cutoff = new Date(Date.now() - maxDays * 86400000).toISOString();
            const { data: nu } = await supabaseAdmin.from('user_profiles').select('id').gte('created_at', cutoff).in('id', allUserIds);
            (nu || []).forEach((u: any) => cSet.add(u.id));
          } else if (cType === 'match_count' && cValue) {
            const parts = cValue.split('-');
            const minM = parseInt(parts[0]) || 0;
            const maxM = parseInt(parts[1]) || 999999;
            const { data: ps } = await supabaseAdmin.from('players').select('user_id, stats').in('user_id', allUserIds);
            (ps || []).forEach((p: any) => { const mc = p.stats?.matchesPlayed || 0; if (mc >= minM && mc <= maxM) cSet.add(p.user_id); });
          } else if (cType === 'last_active' && cValue) {
            const days = parseInt(cValue) || 30;
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const { data: ip } = await supabaseAdmin.from('players').select('user_id').in('user_id', allUserIds).lt('last_match_date', cutoff);
            (ip || []).forEach((p: any) => cSet.add(p.user_id));
            const { data: nm } = await supabaseAdmin.from('players').select('user_id').in('user_id', allUserIds).is('last_match_date', null);
            (nm || []).forEach((p: any) => cSet.add(p.user_id));
          } else if (cType === 'city' && cValue) {
            const cl = cValue.toLowerCase();
            const { data: tc } = await supabaseAdmin.from('terrains').select('user_id, city').in('user_id', allUserIds);
            const { data: cc } = await supabaseAdmin.from('clubs').select('user_id, city').in('user_id', allUserIds);
            (tc || []).forEach((t: any) => { if (t.city?.toLowerCase() === cl) cSet.add(t.user_id); });
            (cc || []).forEach((c: any) => { if (c.city?.toLowerCase() === cl) cSet.add(c.user_id); });
          } else if (cType === 'club' && cValue) {
            const cl = cValue.toLowerCase();
            const { data: cp } = await supabaseAdmin.from('players').select('user_id, club').in('user_id', allUserIds);
            (cp || []).forEach((p: any) => { if (p.club?.toLowerCase() === cl) cSet.add(p.user_id); });
          }
          return cSet;
        };

        // Combined filters mode: intersect multiple criteria
        if (hasCombined) {
          for (const [cType, cValue] of Object.entries(combinedFilters as Record<string, string>)) {
            if (cValue) {
              const cSet = await buildCriteriaSet(cType, cValue);
              if (cSet.size > 0) combinedSets.push(cSet);
            }
          }
          if (combinedSets.length > 0) {
            // Intersect all sets
            let intersection = combinedSets[0];
            for (let si = 1; si < combinedSets.length; si++) {
              intersection = new Set([...intersection].filter(uid => combinedSets[si].has(uid)));
            }
            intersection.forEach(uid => matchedUserIds.add(uid));
            console.log(`[send-push] announcement: combined filters, ${combinedSets.length} criteria, ${matchedUserIds.size} matched after intersection`);
          }
        } else if (targetType === 'rank') {
          const rSet = await buildCriteriaSet('rank', targetValue);
          rSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'city') {
          const cSet = await buildCriteriaSet('city', targetValue);
          cSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'club') {
          const cSet = await buildCriteriaSet('club', targetValue);
          cSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'account_age') {
          const aSet = await buildCriteriaSet('account_age', targetValue);
          aSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'match_count') {
          const mSet = await buildCriteriaSet('match_count', targetValue);
          mSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'last_active') {
          const lSet = await buildCriteriaSet('last_active', targetValue);
          lSet.forEach(uid => matchedUserIds.add(uid));
        } else if (targetType === 'level') {
          const { data: profileUsers } = await supabaseAdmin.from('user_profiles').select('id').eq('level', targetValue).in('id', allUserIds);
          (profileUsers || []).forEach((p: any) => matchedUserIds.add(p.id));
        }

        console.log(`[send-push] announcement: ${targetType}=${targetValue}, matched ${matchedUserIds.size} users`);
        targetTokens = allAnnTokens.filter((t: any) => matchedUserIds.has(t.user_id));
      }

      if (targetTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_matching_users' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[send-push] announcement: sending to ${targetTokens.length} tokens`);

      const annTitle = titleFr || titleEn;
      const annBody = messageFr || messageEn;

      // Build platform breakdown for analytics
      const platformCounts: Record<string, number> = {};
      targetTokens.forEach((t: any) => {
        const platform = t.platform || 'unknown';
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      });

      // A/B test: split tokens 50/50
      let variantASent = 0, variantAErrors = 0, variantBSent = 0, variantBErrors = 0;
      const isAB = abTest === true && variantBTitleFr;
      const variantATokens = isAB ? targetTokens.filter((_: any, idx: number) => idx % 2 === 0) : targetTokens;
      const variantBTokens = isAB ? targetTokens.filter((_: any, idx: number) => idx % 2 === 1) : [];

      const ticketIds: string[] = [];
      const BATCH_SIZE = 100;

      // Send Variant A
      for (let i = 0; i < variantATokens.length; i += BATCH_SIZE) {
        const batch = variantATokens.slice(i, i + BATCH_SIZE).map((t: any) => buildPushMessage(
          t.token,
          `\u{1F4E2} ${annTitle}`,
          annBody,
          { type: 'announcement', variant: isAB ? 'A' : undefined },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(batch);
        const bSent = tickets.filter((t: any) => t.status === 'ok').length;
        const bErr = tickets.filter((t: any) => t.status === 'error').length;
        sent += bSent; errors += bErr;
        variantASent += bSent; variantAErrors += bErr;
        tickets.forEach((t: any) => { if (t.id) ticketIds.push(t.id); });
        for (let j = 0; j < tickets.length; j++) {
          if (tickets[j].details?.error === 'DeviceNotRegistered') {
            const invalidToken = batch[j]?.to;
            if (invalidToken) await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
          }
        }
      }

      // Send Variant B (if A/B test)
      if (isAB && variantBTokens.length > 0) {
        const vbTitle = variantBTitleFr || annTitle;
        const vbBody = variantBMessageFr || annBody;
        for (let i = 0; i < variantBTokens.length; i += BATCH_SIZE) {
          const batch = variantBTokens.slice(i, i + BATCH_SIZE).map((t: any) => buildPushMessage(
            t.token,
            `\u{1F4E2} ${vbTitle}`,
            vbBody,
            { type: 'announcement', variant: 'B' },
            { channelId: 'tournament-reminders', priority: 'high' }
          ));
          const tickets = await sendPushNotifications(batch);
          const bSent = tickets.filter((t: any) => t.status === 'ok').length;
          const bErr = tickets.filter((t: any) => t.status === 'error').length;
          sent += bSent; errors += bErr;
          variantBSent += bSent; variantBErrors += bErr;
          tickets.forEach((t: any) => { if (t.id) ticketIds.push(t.id); });
          for (let j = 0; j < tickets.length; j++) {
            if (tickets[j].details?.error === 'DeviceNotRegistered') {
              const invalidToken = batch[j]?.to;
              if (invalidToken) await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
            }
          }
        }
        console.log(`[send-push] A/B test: A=${variantASent}/${variantATokens.length}, B=${variantBSent}/${variantBTokens.length}`);
      }

      // Store ticket IDs for later receipt verification
      if (ticketIds.length > 0) {
        await supabaseAdmin.from('ambassador_analytics').insert({
          ambassador_id: '00000000-0000-0000-0000-000000000000',
          event_type: 'push_tickets',
          source_page: ticketIds.slice(0, 500).join(','),
          social_platform: `announcement:${payload?.titleFr || payload?.titleEn || 'unknown'}`.substring(0, 200),
        }).catch(() => {});
      }

      // Estimate opens by checking which targeted users logged in recently (within 2 hours)
      try {
        const twoHoursLater = new Date(Date.now() + 2 * 3600000).toISOString();
        // Store target user IDs for later open rate correlation
        const targetUserIds = [...new Set(targetTokens.map((t: any) => t.user_id))];
        await supabaseAdmin.from('ambassador_analytics').insert({
          ambassador_id: '00000000-0000-0000-0000-000000000000',
          event_type: 'announcement_targets',
          source_page: targetUserIds.slice(0, 500).join(','),
          social_platform: `ann_id:pending`,
        }).catch(() => {});
      } catch { /* silent */ }

      // Return A/B variant stats if applicable
      if (isAB) {
        return new Response(
          JSON.stringify({ sent, errors, variantASent, variantAErrors, variantBSent, variantBErrors }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================================
    // MODERATION_ACTION: Notify reported player of admin action
    // ============================================================
    else if (type === 'moderation_action') {
      const { targetUserId, action, reason } = payload || {};
      if (!targetUserId || !action) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/action' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is admin
      const { data: adminMod } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminMod?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send moderation notifications' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const actionLabels: Record<string, { title: string; body: string }> = {
          warned: {
            title: '\u26A0\uFE0F Avertissement de moderation',
            body: 'Votre compte a recu un avertissement suite a un signalement. Veuillez respecter les regles de la communaute.',
          },
          suspended: {
            title: '\u{1F6D1} Compte suspendu',
            body: 'Votre compte a ete temporairement suspendu suite a un signalement. Contactez le support si necessaire.',
          },
          banned: {
            title: '\u{274C} Compte banni',
            body: 'Votre compte a ete banni pour non-respect des regles de la communaute.',
          },
        };
        const labels = actionLabels[action] || actionLabels.warned;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          labels.title,
          labels.body,
          { type: 'moderation_action', action, reason },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // MAINTENANCE_END: Notify ALL users that maintenance is over
    // ============================================================
    else if (type === 'maintenance_end') {
      const { messageFr, messageEn } = payload || {};

      // Verify caller is admin
      const { data: adminProfileEnd } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminProfileEnd?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send maintenance_end notifications' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get ALL active push tokens
      const { data: allEndTokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .eq('active', true);

      if (!allEndTokens || allEndTokens.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_tokens' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[send-push] maintenance_end: sending to ${allEndTokens.length} tokens`);

      const endMsgFr = messageFr || 'L\'application est de nouveau operationnelle. Merci de votre patience !';
      const endMsgEn = messageEn || 'The application is back online. Thank you for your patience!';

      const messages = allEndTokens.map((t: any) => buildPushMessage(
        t.token,
        `\u2705 Maintenance terminee`,
        endMsgFr,
        { type: 'maintenance' },
        { channelId: 'tournament-reminders', priority: 'high' }
      ));

      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const tickets = await sendPushNotifications(batch);
        sent += tickets.filter((t: any) => t.status === 'ok').length;
        errors += tickets.filter((t: any) => t.status === 'error').length;

        for (let j = 0; j < tickets.length; j++) {
          if (tickets[j].details?.error === 'DeviceNotRegistered') {
            const invalidToken = batch[j]?.to;
            if (invalidToken) {
              await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
            }
          }
        }
      }
    }

    // ============================================================
    // CLUB_CLAIM: Notify club owner about a new ownership claim
    // ============================================================
    else if (type === 'club_claim') {
      const { ownerUserId, requesterName, clubName, clubId } = payload || {};
      if (!ownerUserId || !clubId) {
        return new Response(JSON.stringify({ error: 'Missing ownerUserId/clubId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', ownerUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F3E2} Revendication de club`,
          `${requesterName || 'Un utilisateur'} souhaite revendiquer la propriete de "${clubName || 'votre club'}". Consultez la demande.`,
          { type: 'club_claim', clubId },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CO_ADMIN: Notify user when added/removed as club co-admin
    // ============================================================
    else if (type === 'co_admin') {
      const { targetUserId, clubName, clubId, action: coAction, adderName } = payload || {};
      if (!targetUserId || !clubId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/clubId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAdded = coAction === 'added';
        const title = isAdded
          ? `\u{1F3E2} Vous etes co-admin !`
          : `\u{1F3E2} Co-admin retire`;
        const body = isAdded
          ? `${adderName || 'Le proprietaire'} vous a ajoute comme co-administrateur de "${clubName || 'un club'}".`
          : `Vous avez ete retire comme co-administrateur de "${clubName || 'un club'}".`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'club_claim', clubId },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CLUB_VERIFICATION: Notify club owner when admin verifies their club
    // ============================================================
    else if (type === 'club_verification') {
      const { targetUserId, clubName, clubId: verifiedClubId } = payload || {};
      if (!targetUserId || !verifiedClubId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/clubId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u2705 Club verifie !`,
          `Felicitations ! Votre club "${clubName || 'votre club'}" a ete verifie par un administrateur. Le badge bleu est desormais visible.`,
          { type: 'club_verification', clubId: verifiedClubId },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CLUB_VERIFICATION_DECISION: Detailed notification for verification/claim decision
    // Sends a rich push with decision summary and next steps
    // ============================================================
    else if (type === 'club_verification_decision') {
      const { targetUserId, clubName, clubId: decisionClubId, decision, requestType, adminMessage } = payload || {};
      // decision: 'accepted' | 'declined'
      // requestType: 'verification' | 'claim'
      if (!targetUserId || !decisionClubId || !decision) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/clubId/decision' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAccepted = decision === 'accepted';
        const isVerification = requestType === 'verification';

        let title: string;
        let body: string;

        if (isAccepted) {
          if (isVerification) {
            title = `\u2705 Club "${clubName || 'votre club'}" verifie !`;
            body = `Felicitations ! Votre demande de verification a ete acceptee. Le badge bleu est visible sur votre fiche. Vous avez desormais acces a la page Analytique (stats detaillees, matchmaking, comparaisons nationales, export CSV/PDF).`;
          } else {
            title = `\u2705 Reclamation acceptee : "${clubName || 'votre club'}"`;
            body = `Votre reclamation a ete validee par l'equipe admin. Vous etes desormais proprietaire et le club est verifie. Acces a l'Analytique debloque (stats, matchmaking, export).`;
          }
        } else {
          if (isVerification) {
            title = `\u274C Verification refusee : "${clubName || 'votre club'}"`;
            body = `Votre demande de verification n'a pas ete acceptee.${adminMessage ? ` Motif : ${adminMessage}` : ''} Vous pouvez soumettre une nouvelle preuve depuis la page de votre club.`;
          } else {
            title = `\u274C Reclamation refusee : "${clubName || 'votre club'}"`;
            body = `Votre reclamation de propriete n'a pas ete acceptee.${adminMessage ? ` Motif : ${adminMessage}` : ''} Si vous estimez qu'il s'agit d'une erreur, contactez le support.`;
          }
        }

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'club_verification', clubId: decisionClubId, decision, requestType },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // APPEAL_DEADLINE: Notify all admin users about overdue ban appeals
    // ============================================================
    else if (type === 'appeal_deadline') {
      const { overdueCount, oldestAppealDays } = payload || {};

      // Verify caller is admin
      const { data: adminDeadline } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminDeadline?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send appeal deadline notifications' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all admin users
      const { data: adminUsers } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('is_admin', true);

      if (!adminUsers || adminUsers.length === 0) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'no_admins' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const adminIds = adminUsers.map((a: any) => a.id);
      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', adminIds)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const count = overdueCount || 1;
        const days = oldestAppealDays || 2;
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{26A0}\u{FE0F} ${count} appel(s) de ban en retard`,
          `${count} appel(s) de ban en attente depuis plus de ${days} jour(s). Veuillez les examiner rapidement.`,
          { type: 'moderation_action', action: 'appeal_deadline' },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // BAN_APPEAL_RESPONSE: Notify banned user about appeal decision
    // ============================================================
    else if (type === 'ban_appeal_response') {
      const { targetUserId, appealStatus, adminResponse: appealMsg } = payload || {};
      if (!targetUserId || !appealStatus) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/appealStatus' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAccepted = appealStatus === 'accepted';
        const title = isAccepted
          ? `\u2705 Appel accepte - Compte reactif !`
          : `\u274C Appel rejete`;
        const body = isAccepted
          ? `Votre appel de ban a ete accepte. Votre compte est de nouveau actif.${appealMsg ? ` Message: ${appealMsg}` : ''}`
          : `Votre appel de ban a ete rejete.${appealMsg ? ` Raison: ${appealMsg}` : ' Contactez le support pour plus d\'informations.'}`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'moderation_action', action: isAccepted ? 'unbanned' : 'appeal_rejected' },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // MERGE_UNDO: Notify owner when admin undoes a merge (item re-created)
    // ============================================================
    else if (type === 'merge_undo') {
      const { targetUserId, itemName, itemType, targetName } = payload || {};
      if (!targetUserId || !itemName) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/itemName' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const typeLabels: Record<string, { fr: string }> = {
          player: { fr: 'joueur' },
          club: { fr: 'club' },
          terrain: { fr: 'terrain' },
          tournament: { fr: 'tournoi' },
        };
        const typeLabel = typeLabels[itemType]?.fr || itemType;
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F504} Fusion annulee : ${itemName}`,
          `La fusion de votre ${typeLabel} "${itemName}" dans "${targetName}" a ete annulee par un administrateur. Votre fiche est de nouveau disponible.`,
          { type: 'merge_undo', itemType, itemName },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CLUB_INVITATION_REMINDER: Remind player about pending invitation
    // ============================================================
    else if (type === 'club_invitation_reminder') {
      const { targetUserId, clubName, clubId: reminderClubId, inviterName, reminderDay, invitationId } = payload || {};
      if (!targetUserId || !reminderClubId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/clubId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(targetUserId, 'club_invitation');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isUrgent = reminderDay >= 21;
        const daysLeft = 30 - (reminderDay || 7);
        const title = isUrgent
          ? `\u{26A0}\u{FE0F} Dernier rappel : ${clubName || 'un club'}`
          : `\u{1F514} Invitation en attente : ${clubName || 'un club'}`;
        const body = isUrgent
          ? `L'invitation de "${clubName}" par ${inviterName || 'un club'} expire dans ${daysLeft} jours. Repondez maintenant !`
          : `${inviterName || 'Un club'} vous a invite a rejoindre "${clubName}" il y a ${reminderDay || 7} jours. Acceptez ou declinez avant l'expiration.`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'club_invitation_reminder', clubId: reminderClubId, invitationId },
          { channelId: 'share-requests', priority: isUrgent ? 'high' : 'default' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // NEW_FOLLOWER: Notify player when someone starts following them
    // ============================================================
    else if (type === 'new_follower') {
      const { targetUserId, followerName, followerAvatar, totalFollowers } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(targetUserId, 'new_follower');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const followerLabel = followerName || 'Un joueur';
        const totalLabel = totalFollowers > 1 ? ` Vous avez desormais ${totalFollowers} abonne(s).` : '';
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F464} Nouvel abonne !`,
          `${followerLabel} a commence a vous suivre.${totalLabel}`,
          { type: 'new_follower' },
          { channelId: 'share-requests', priority: 'default' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TERRAIN_ACTIVITY: Notify user when favorite terrain becomes active
    // ============================================================
    else if (type === 'terrain_activity') {
      const { targetUserId, activeTerrains } = payload || {};
      if (!targetUserId || !activeTerrains || !Array.isArray(activeTerrains) || activeTerrains.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/activeTerrains' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check notification preference
      const enabled = await isNotifEnabled(targetUserId, 'terrain_activity');
      if (!enabled) {
        return new Response(JSON.stringify({ sent: 0, errors: 0, reason: 'user_disabled' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const firstTerrain = activeTerrains[0];
        const reasonLabels: Record<string, string> = {
          meetup: 'RDV en cours',
          tournament: 'Tournoi en cours',
          recent_match: 'Partie en cours',
        };
        const reasonLabel = reasonLabels[firstTerrain.reason] || 'Activite detectee';
        const terrainCount = activeTerrains.length;
        const title = terrainCount === 1
          ? `\u{1F525} ${firstTerrain.terrainName} est actif !`
          : `\u{1F525} ${terrainCount} terrains favoris actifs !`;
        const body = terrainCount === 1
          ? `${reasonLabel} sur votre terrain favori "${firstTerrain.terrainName}". C'est le moment d'y aller !`
          : `${firstTerrain.terrainName} et ${terrainCount - 1} autre(s) terrain(s) favori(s) sont actifs en ce moment.`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'terrain_activity', terrainId: firstTerrain.terrainId },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CLUB_INVITATION: Notify player when invited to join a club
    // ============================================================
    else if (type === 'club_invitation') {
      const { targetUserId, title: invTitle, body: invBody, data: invData } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          invTitle || '\u{1F3E2} Invitation club',
          invBody || 'Vous avez recu une invitation a rejoindre un club.',
          invData || { type: 'club_invitation' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // CLUB_INVITATION_RESPONSE: Notify club owner when player accepts/declines
    // ============================================================
    else if (type === 'club_invitation_response') {
      const { targetUserId, playerName, clubName, clubId: respClubId, response: invResponse, declineReason } = payload || {};
      if (!targetUserId || !invResponse) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/response' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAccepted = invResponse === 'accepted';
        const title = isAccepted
          ? `\u2705 ${playerName || 'Un joueur'} a rejoint ${clubName || 'votre club'} !`
          : `\u274C ${playerName || 'Un joueur'} a refuse l'invitation`;
        let body = isAccepted
          ? `${playerName || 'Un joueur'} a accepte votre invitation et est desormais membre de ${clubName || 'votre club'}.`
          : `${playerName || 'Un joueur'} a decline l'invitation a rejoindre ${clubName || 'votre club'}.`;
        if (!isAccepted && declineReason) {
          body += ` Raison : "${declineReason.substring(0, 100)}"`;
        }

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'club_invitation_response', clubId: respClubId, response: invResponse },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // PLAYER_TRANSFER_REQUEST: Notify recipient about transfer request
    // ============================================================
    else if (type === 'player_transfer_request') {
      const { recipientUserId, senderName, playerName, matchCount, challengeCount } = payload || {};
      if (!recipientUserId || !playerName) {
        return new Response(JSON.stringify({ error: 'Missing recipientUserId/playerName' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', recipientUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const total = (matchCount || 0) + (challengeCount || 0);
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F504} Demande de transfert de joueur`,
          `${senderName || 'Un joueur'} souhaite vous transferer "${playerName}" (${total} match/defi). Consultez la demande.`,
          { type: 'player_transfer_request' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // PLAYER_TRANSFER_REMINDER: Admin sends reminder to recipients with pending transfers >7d
    // ============================================================
    else if (type === 'player_transfer_reminder') {
      const { targetUserId, playerName, senderName, transferId } = payload || {};
      if (!targetUserId || !playerName) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/playerName' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is admin
      const { data: adminReminder } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminReminder?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send transfer reminders' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F514} Transfert en attente`,
          `${senderName || 'Un joueur'} attend votre reponse pour le transfert de "${playerName}". Consultez vos notifications.`,
          { type: 'player_transfer_request', transferId },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // PLAYER_TRANSFER_URGENT_REMINDER: Admin sends urgent reminder for transfers expiring in 0-5 days
    // ============================================================
    else if (type === 'player_transfer_urgent_reminder') {
      const { targetUserId, playerName, senderName, transferId, daysLeft } = payload || {};
      if (!targetUserId || !playerName) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/playerName' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify caller is admin
      const { data: adminUrgent } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!adminUrgent?.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can send urgent transfer reminders' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const days = daysLeft ?? 5;
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{26A0}\u{FE0F} Transfert expire dans ${days}j !`,
          `${senderName || 'Un joueur'} attend votre reponse pour "${playerName}". Sans action, le transfert sera automatiquement annule.`,
          { type: 'player_transfer_request', transferId, urgent: true },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // PLAYER_TRANSFER_RESPONSE: Notify sender about transfer acceptance/decline
    // ============================================================
    else if (type === 'player_transfer_response') {
      const { senderUserId, recipientName, playerName, accepted } = payload || {};
      if (!senderUserId || !playerName) {
        return new Response(JSON.stringify({ error: 'Missing senderUserId/playerName' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', senderUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAccepted = accepted === true;
        const title = isAccepted
          ? `\u2705 Transfert accepte : ${playerName}`
          : `\u274C Transfert refuse : ${playerName}`;
        const body = isAccepted
          ? `${recipientName || 'Le destinataire'} a accepte le transfert de "${playerName}". Les matchs et defis ont ete reassignes.`
          : `${recipientName || 'Le destinataire'} a refuse le transfert de "${playerName}".`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'player_transfer_response', accepted: isAccepted },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_INVITATION: Notify user about team-up invitation for tournament
    // ============================================================
    else if (type === 'team_invitation') {
      const { targetUserId, inviterName, tournamentName, format } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const formatLabel = format === 'Triplette' ? 'triplette' : 'doublette';
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F91D} Invitation d'equipe !`,
          `${inviterName || 'Un joueur'} vous invite a former une ${formatLabel} pour "${tournamentName || 'un tournoi'}".`,
          { type: 'team_invitation' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_INVITATION_RESPONSE: Notify inviter about accept/decline
    // ============================================================
    else if (type === 'team_invitation_response') {
      const { targetUserId, responderName, tournamentName, accepted } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isAccepted = accepted === true;
        const title = isAccepted
          ? `\u2705 ${responderName || 'Un joueur'} accepte votre equipe !`
          : `\u274C ${responderName || 'Un joueur'} a decline`;
        const body = isAccepted
          ? `${responderName || 'Un joueur'} a accepte de former une equipe pour "${tournamentName || 'un tournoi'}".`
          : `${responderName || 'Un joueur'} a refuse votre invitation pour "${tournamentName || 'un tournoi'}".`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'team_invitation_response', accepted: isAccepted },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_DISSOLVED: Notify members when captain dissolves team
    // ============================================================
    else if (type === 'team_dissolved') {
      const { targetUserId, captainName, tournamentName, format } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F6AB} Equipe dissoute`,
          `${captainName || 'Le capitaine'} a dissous l'equipe ${format || ''} pour "${tournamentName || 'un tournoi'}".`,
          { type: 'team_dissolved' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_MEMBER_REMOVED: Notify member when removed from team
    // ============================================================
    else if (type === 'team_member_removed') {
      const { targetUserId, captainName, tournamentName, removedName } = payload || {};
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          `\u{1F6AB} Retire de l'equipe`,
          `${captainName || 'Le capitaine'} vous a retire de l'equipe pour "${tournamentName || 'un tournoi'}".`,
          { type: 'team_member_removed' },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_CHAT_MESSAGE: Notify team member about new chat message
    // ============================================================
    else if (type === 'team_chat_message') {
      const { targetUserId, senderName, teamId: chatTeamId, tournamentName: chatTournamentName, messagePreview } = payload || {};
      if (!targetUserId || !chatTeamId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/teamId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const title = `\u{1F4AC} ${senderName || 'Coequipier'}${chatTournamentName ? ` (${chatTournamentName})` : ''}`;
        const body = messagePreview || 'Nouveau message dans le chat equipe';
        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'team_chat_message', teamId: chatTeamId },
          { channelId: 'share-requests', priority: 'default' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // TEAM_DEADLINE_REMINDER: Remind captain about approaching team formation deadline
    // ============================================================
    else if (type === 'team_deadline_reminder') {
      const { targetUserId, tournamentName, teamId: dlTeamId, daysLeft, slotsLeft, format } = payload || {};
      if (!targetUserId || !dlTeamId) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/teamId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isUrgent = daysLeft <= 1;
        const icon = isUrgent ? '\u{26A0}\u{FE0F}' : '\u{23F0}';
        const title = isUrgent
          ? `${icon} Dernier jour pour completer votre equipe !`
          : `${icon} ${daysLeft}j pour completer votre equipe`;
        const body = `Votre ${format || 'equipe'} pour "${tournamentName || 'un tournoi'}" a encore ${slotsLeft || 1} place(s) libre(s). Invitez des coequipiers avant la date limite.`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'team_deadline_reminder', teamId: dlTeamId },
          { channelId: 'tournament-reminders', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    // ============================================================
    // DEVICE_TRANSFER_DECISION: Notify user about device transfer validation/rejection
    // ============================================================
    else if (type === 'device_transfer_decision') {
      const { targetUserId, decision } = payload || {};
      if (!targetUserId || !decision) {
        return new Response(JSON.stringify({ error: 'Missing targetUserId/decision' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tokens } = await supabaseAdmin
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId)
        .eq('active', true);

      if (tokens && tokens.length > 0) {
        const isValidated = decision === 'validated';
        const title = isValidated
          ? `\u2705 Transfert d'appareil valide !`
          : `\u274C Transfert d'appareil refuse`;
        const body = isValidated
          ? `Votre demande de transfert a ete validee. Votre ancien appareil a ete delie. Connectez-vous sur votre nouvel appareil.`
          : `Votre demande de transfert d'appareil a ete refusee. Contactez le support si necessaire.`;

        const messages = tokens.map((t: any) => buildPushMessage(
          t.token,
          title,
          body,
          { type: 'device_transfer_decision', decision },
          { channelId: 'share-requests', priority: 'high' }
        ));
        const tickets = await sendPushNotifications(messages);
        sent = tickets.filter((t: any) => t.status === 'ok').length;
        errors = tickets.filter((t: any) => t.status === 'error').length;
      }
    }

    else {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-push] Done: ${sent} sent, ${errors} errors`);

    return new Response(
      JSON.stringify({ sent, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[send-push] Fatal error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
