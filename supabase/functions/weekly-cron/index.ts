/**
 * Edge Function: weekly-cron
 *
 * Scheduled maintenance tasks (call weekly or daily):
 * 1. Clean up inactive/expired push tokens (older than 90 days with no update)
 * 2. Send weekly engagement reminders to inactive users
 * 3. Clean up expired shared items
 * 4. Clean up old ambassador analytics (older than 1 year)
 *
 * This function uses the service role key and does NOT require user auth.
 * Trigger via: scheduled cron, admin button, or manual invocation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendPushNotifications, buildPushMessage, getPushReceipts } from '../_shared/push.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Optional: verify caller via auth header or secret key
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let isAdmin = false;

    if (token) {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        isAdmin = profile?.is_admin === true;
      }
    }

    // Parse body for specific tasks
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const tasks = body.tasks || ['cleanup_tokens', 'cleanup_shares', 'engagement_reminders', 'cleanup_analytics', 'sponsor_digest', 'process_scheduled_pushes', 'process_scheduled_announcements', 'check_push_receipts', 'ab_auto_winner', 'elo_decay', 'elo_seasonal_reset', 'appeal_deadline_check', 'admin_weekly_report', 'weekly_digest_push', 'expire_invitations', 'invitation_reminders', 'transfer_reminders', 'transfer_escalation', 'transfer_expiration', 'transfer_urgent_reminders', 'transfer_archive', 'partner_expiration'];

    const results: Record<string, any> = {};

    // ============================================================
    // TASK 1: Clean up stale push tokens (no update for 90+ days)
    // ============================================================
    if (tasks.includes('cleanup_tokens')) {
      console.log('[weekly-cron] Cleaning up stale push tokens...');
      const threshold90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      // Deactivate tokens not updated in 90 days
      const { data: staleTokens, error: staleErr } = await supabaseAdmin
        .from('push_tokens')
        .select('id, token')
        .eq('active', true)
        .lt('updated_at', threshold90d);

      if (!staleErr && staleTokens && staleTokens.length > 0) {
        const ids = staleTokens.map(t => t.id);
        await supabaseAdmin
          .from('push_tokens')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('id', ids);
        console.log(`[weekly-cron] Deactivated ${ids.length} stale push tokens`);
        results.cleanup_tokens = { deactivated: ids.length };
      } else {
        results.cleanup_tokens = { deactivated: 0 };
      }

      // Also remove tokens that have been inactive for 180+ days (hard delete)
      const threshold180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: veryOld } = await supabaseAdmin
        .from('push_tokens')
        .select('id')
        .eq('active', false)
        .lt('updated_at', threshold180d);

      if (veryOld && veryOld.length > 0) {
        // Note: We don't hard delete user data, just log
        console.log(`[weekly-cron] Found ${veryOld.length} tokens inactive for 180+ days (not deleted per policy)`);
        results.cleanup_tokens.very_old_count = veryOld.length;
      }
    }

    // ============================================================
    // TASK 2: Clean up expired shared items
    // ============================================================
    if (tasks.includes('cleanup_shares')) {
      console.log('[weekly-cron] Cleaning up expired shared items...');
      const now = new Date().toISOString();

      const { data: expired } = await supabaseAdmin
        .from('shared_items')
        .select('id')
        .not('expires_at', 'is', null)
        .lt('expires_at', now);

      if (expired && expired.length > 0) {
        // Deactivate by setting is_public_link to false (soft approach)
        const ids = expired.map(s => s.id);
        await supabaseAdmin
          .from('shared_items')
          .update({ is_public_link: false })
          .in('id', ids);
        console.log(`[weekly-cron] Expired ${ids.length} shared items`);
        results.cleanup_shares = { expired: ids.length };
      } else {
        results.cleanup_shares = { expired: 0 };
      }
    }

    // ============================================================
    // TASK 3: Send engagement reminders to inactive users
    // (Users who haven't played in 7+ days but have active tokens)
    // ============================================================
    if (tasks.includes('engagement_reminders')) {
      console.log('[weekly-cron] Sending engagement reminders...');

      const threshold7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const threshold30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get users with active push tokens
      const { data: activeTokenUsers } = await supabaseAdmin
        .from('push_tokens')
        .select('user_id, token')
        .eq('active', true);

      if (!activeTokenUsers || activeTokenUsers.length === 0) {
        results.engagement_reminders = { sent: 0, reason: 'no_active_tokens' };
      } else {
        const userIds = [...new Set(activeTokenUsers.map(t => t.user_id))];
        const tokensByUser = new Map<string, string[]>();
        activeTokenUsers.forEach(t => {
          if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
          tokensByUser.get(t.user_id)!.push(t.token);
        });

        // Find users who had no matches or challenges in the last 7 days
        const { data: recentMatches } = await supabaseAdmin
          .from('matches')
          .select('user_id')
          .in('user_id', userIds)
          .gte('created_at', threshold7d);

        const { data: recentChallenges } = await supabaseAdmin
          .from('challenges')
          .select('user_id')
          .in('user_id', userIds)
          .gte('created_at', threshold7d);

        const activeUserIds = new Set<string>();
        (recentMatches || []).forEach(m => activeUserIds.add(m.user_id));
        (recentChallenges || []).forEach(c => activeUserIds.add(c.user_id));

        // Inactive = has token but no recent activity
        const inactiveUserIds = userIds.filter(uid => !activeUserIds.has(uid));

        // Don't spam: only users who haven't received this in 7 days
        // We use the analytics table to track last engagement reminder
        const { data: recentReminders } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('viewer_id')
          .eq('event_type', 'engagement_reminder')
          .gte('created_at', threshold7d);

        const recentlyRemindedIds = new Set<string>((recentReminders || []).map((r: any) => r.viewer_id).filter(Boolean));
        const eligibleUserIds = inactiveUserIds.filter(uid => !recentlyRemindedIds.has(uid));

        // Check notification preferences
        const { data: prefData } = await supabaseAdmin
          .from('user_preferences')
          .select('user_id, notification_preferences')
          .in('user_id', eligibleUserIds);

        const prefMap = new Map<string, any>();
        (prefData || []).forEach((p: any) => prefMap.set(p.user_id, p.notification_preferences || {}));

        const finalUserIds = eligibleUserIds.filter(uid => {
          const prefs = prefMap.get(uid);
          return !prefs || prefs.event_reminder !== false;
        });

        // Limit to 100 users per cron run to avoid Expo push limits
        const batch = finalUserIds.slice(0, 100);

        if (batch.length > 0) {
          const messages: any[] = [];
          const reminderMessages = [
            { title: '\u{1F3AF} Vos boules attendent !', body: 'Pas de partie depuis 7 jours. Lancez un match ou un defi pour maintenir votre classement !' },
            { title: '\u{1F4AA} Revenez sur le terrain !', body: 'Votre streak est en danger ! Jouez une partie pour ne pas perdre votre serie.' },
            { title: '\u{1F3C6} Le classement evolue sans vous', body: 'Vos rivaux jouent sans relache. Revenez defendre votre position !' },
          ];
          const msgIdx = Math.floor(Math.random() * reminderMessages.length);
          const msg = reminderMessages[msgIdx];

          for (const uid of batch) {
            const tokens = tokensByUser.get(uid) || [];
            for (const tk of tokens) {
              messages.push(buildPushMessage(
                tk,
                msg.title,
                msg.body,
                { type: 'retention', action: 'play_match' },
                { channelId: 'tournament-reminders' }
              ));
            }
          }

          const tickets = await sendPushNotifications(messages);
          const sent = tickets.filter(t => t.status === 'ok').length;
          const errors = tickets.filter(t => t.status === 'error').length;

          // Track reminders sent (for dedup next week)
          const reminderRows = batch.map(uid => ({
            ambassador_id: '00000000-0000-0000-0000-000000000000', // system placeholder
            event_type: 'engagement_reminder',
            viewer_id: uid,
            source_page: 'weekly_cron',
          }));

          // Insert in chunks of 50
          for (let i = 0; i < reminderRows.length; i += 50) {
            await supabaseAdmin.from('ambassador_analytics').insert(reminderRows.slice(i, i + 50)).catch(() => {});
          }

          // Deactivate invalid tokens
          for (let i = 0; i < tickets.length; i++) {
            if (tickets[i].details?.error === 'DeviceNotRegistered') {
              const invalidToken = messages[i]?.to;
              if (invalidToken) {
                await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
              }
            }
          }

          console.log(`[weekly-cron] Engagement reminders: ${sent} sent, ${errors} errors, ${batch.length} users`);
          results.engagement_reminders = { sent, errors, eligible: batch.length, total_inactive: inactiveUserIds.length };
        } else {
          results.engagement_reminders = { sent: 0, reason: 'no_eligible_users', total_inactive: inactiveUserIds.length };
        }
      }
    }

    // ============================================================
    // TASK 4: Sponsor Weekly Digest Email
    // ============================================================
    if (tasks.includes('sponsor_digest')) {
      console.log('[weekly-cron] Sending sponsor weekly digests...');

      try {
        // Get all active sponsors/partners
        const { data: sponsors } = await supabaseAdmin
          .from('ambassadors')
          .select('id, user_id, display_name, badge_type, ambassador_level, photo, brand_color')
          .eq('is_active', true)
          .in('badge_type', ['gold_sponsor', 'sponsor', 'partner']);

        if (sponsors && sponsors.length > 0) {
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          let digestsSent = 0;

          for (const sp of sponsors) {
            try {
              // Get this week's analytics for the sponsor
              const { data: weekEvents } = await supabaseAdmin
                .from('ambassador_analytics')
                .select('event_type, source_page')
                .eq('ambassador_id', sp.id)
                .gte('created_at', weekAgo.toISOString());

              if (!weekEvents || weekEvents.length === 0) continue;

              // Compute KPIs
              const impressions = weekEvents.filter(e => e.event_type === 'banner_impression').length;
              const clicks = weekEvents.filter(e => e.event_type === 'profile_view').length;
              const socialClicks = weekEvents.filter(e => e.event_type === 'social_click').length;
              const pushes = weekEvents.filter(e => e.event_type === 'sponsor_push').length;
              const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0';

              // Get previous week for comparison
              const twoWeeksAgo = new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
              const { data: prevWeekEvents } = await supabaseAdmin
                .from('ambassador_analytics')
                .select('event_type')
                .eq('ambassador_id', sp.id)
                .gte('created_at', twoWeeksAgo.toISOString())
                .lt('created_at', weekAgo.toISOString());

              const prevImpressions = prevWeekEvents?.filter(e => e.event_type === 'banner_impression').length || 0;
              const prevClicks = prevWeekEvents?.filter(e => e.event_type === 'profile_view').length || 0;

              const impChange = prevImpressions > 0 ? Math.round(((impressions - prevImpressions) / prevImpressions) * 100) : 0;
              const clkChange = prevClicks > 0 ? Math.round(((clicks - prevClicks) / prevClicks) * 100) : 0;

              const impArrow = impChange > 0 ? '▲' : impChange < 0 ? '▼' : '→';
              const clkArrow = clkChange > 0 ? '▲' : clkChange < 0 ? '▼' : '→';
              const impColor = impChange > 0 ? '#10B981' : impChange < 0 ? '#EF4444' : '#94A3B8';
              const clkColor = clkChange > 0 ? '#10B981' : clkChange < 0 ? '#EF4444' : '#94A3B8';

              const tierColor = sp.brand_color || (sp.badge_type === 'gold_sponsor' ? '#D4A017' : '#78909C');
              const tierLabel = sp.badge_type === 'gold_sponsor' ? 'GOLD PARTNER' : sp.badge_type === 'sponsor' ? 'SILVER PARTNER' : 'PARTNER';

              // Build push notification with digest summary
              const { data: tokens } = await supabaseAdmin
                .from('push_tokens')
                .select('token')
                .eq('user_id', sp.user_id)
                .eq('active', true);

              if (tokens && tokens.length > 0) {
                // Build rich digest content
                const weekLabel = `${weekAgo.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
                const title = `\u{1F4CA} Recap hebdo | ${sp.display_name}`;
                const bodyLines = [
                  `${impressions} impressions ${impArrow}${Math.abs(impChange)}%`,
                  `${clicks} clics ${clkArrow}${Math.abs(clkChange)}%`,
                  `CTR: ${ctr}% | Push: ${pushes}`,
                ].join(' • ');
                const body = bodyLines;

                const messages = tokens.map(t => buildPushMessage(
                  t.token,
                  title,
                  body,
                  { type: 'sponsor_digest', sponsorId: sp.id },
                  { channelId: 'sponsor-updates' }
                ));

                await sendPushNotifications(messages);
                digestsSent++;

                // ---- Build HTML Digest Email Template ----
                const profileUrl = `https://ultimatepetanque.app/partners?id=${sp.id}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(profileUrl)}&color=${(tierColor).replace('#', '')}`;
                const impChangeAbs = Math.abs(impChange);
                const clkChangeAbs = Math.abs(clkChange);
                const digestHtml = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8FAFC;color:#0F172A;}
  .wrapper{max-width:600px;margin:0 auto;background:#FFF;border-radius:16px;overflow:hidden;}
  .hero{background:linear-gradient(135deg,${tierColor},${tierColor}CC);padding:32px 24px;text-align:center;}
  .hero-logo{width:64px;height:64px;border-radius:18px;border:3px solid rgba(255,255,255,0.3);object-fit:cover;display:inline-block;}
  .hero-fallback{width:64px;height:64px;border-radius:18px;background:rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:28px;font-weight:900;}
  .hero h1{color:#FFF;font-size:22px;font-weight:800;margin:12px 0 4px;}
  .hero p{color:rgba(255,255,255,0.8);font-size:13px;margin:0;}
  .badge{display:inline-block;background:rgba(255,255,255,0.2);color:#FFF;font-size:9px;font-weight:800;padding:3px 10px;border-radius:8px;letter-spacing:0.5px;margin-top:8px;}
  .kpi-row{display:flex;gap:8px;padding:24px 20px 8px;}
  .kpi{flex:1;background:#F8FAFC;border-radius:14px;padding:16px 8px;text-align:center;border:1px solid #E2E8F0;}
  .kpi-val{font-size:26px;font-weight:900;color:#0F172A;line-height:1.2;}
  .kpi-label{font-size:9px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;}
  .kpi-change{font-size:10px;font-weight:800;margin-top:4px;}
  .section{padding:16px 20px;}
  .section-title{font-size:14px;font-weight:700;color:#0F172A;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #E2E8F0;}
  .trend-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
  .trend-label{font-size:12px;color:#64748B;flex:1;}
  .trend-val{font-size:14px;font-weight:800;}
  .bar-track{flex:2;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden;}
  .bar-fill{height:100%;border-radius:4px;}
  .cta-section{padding:20px;text-align:center;background:#F8FAFC;}
  .cta-btn{display:inline-block;background:${tierColor};color:#FFF;font-size:14px;font-weight:700;padding:14px 32px;border-radius:14px;text-decoration:none;}
  .footer{padding:16px 20px;text-align:center;border-top:1px solid #E2E8F0;}
  .footer p{font-size:11px;color:#94A3B8;margin:4px 0;}
  .qr-block{display:inline-block;padding:12px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;margin-top:8px;}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hero">
    ${sp.photo ? `<img src="${sp.photo}" class="hero-logo" alt="${sp.display_name}" />` : `<div class="hero-fallback">${(sp.display_name||'S').charAt(0)}</div>`}
    <h1>Recap Hebdomadaire</h1>
    <p>${weekLabel}</p>
    <div class="badge">${tierLabel}</div>
  </div>
  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-val">${impressions}</div>
      <div class="kpi-label">Impressions</div>
      <div class="kpi-change" style="color:${impColor}">${impArrow} ${impChangeAbs}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-val">${clicks}</div>
      <div class="kpi-label">Clics</div>
      <div class="kpi-change" style="color:${clkColor}">${clkArrow} ${clkChangeAbs}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:${tierColor}">${ctr}%</div>
      <div class="kpi-label">CTR</div>
    </div>
    <div class="kpi">
      <div class="kpi-val" style="color:#7C3AED">${pushes}</div>
      <div class="kpi-label">Push</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Performance vs semaine precedente</div>
    <div class="trend-row">
      <span class="trend-label">Impressions</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,Math.max(5,impressions/(prevImpressions||1)*50))}%;background:#3B82F6"></div></div>
      <span class="trend-val" style="color:#3B82F6">${impressions}</span>
    </div>
    <div class="trend-row">
      <span class="trend-label">Clics</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,Math.max(5,clicks/(prevClicks||1)*50))}%;background:#10B981"></div></div>
      <span class="trend-val" style="color:#10B981">${clicks}</span>
    </div>
    <div class="trend-row">
      <span class="trend-label">Social</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,Math.max(5,socialClicks*10))}%;background:#7C3AED"></div></div>
      <span class="trend-val" style="color:#7C3AED">${socialClicks}</span>
    </div>
  </div>
  <div class="cta-section">
    <a href="${profileUrl}" class="cta-btn">Voir le portail sponsor &rarr;</a>
    <div class="qr-block">
      <img src="${qrUrl}" width="80" height="80" alt="QR" style="display:block;margin:0 auto 4px" />
      <p style="font-size:9px;color:#94A3B8;margin:0">Scannez pour ouvrir</p>
    </div>
  </div>
  <div class="footer">
    <p><strong>Ultimate Petanque</strong> &middot; Digest automatique</p>
    <p>Genere le ${now.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</p>
  </div>
</div>
</body>
</html>`;

                // Store the HTML template for later retrieval
                await supabaseAdmin.from('ambassador_analytics').insert({
                  ambassador_id: sp.id,
                  event_type: 'digest_email_html',
                  source_page: digestHtml.substring(0, 10000),
                  viewer_id: sp.user_id,
                }).catch(() => {});
              }

              // Log digest event
              await supabaseAdmin.from('ambassador_analytics').insert({
                ambassador_id: sp.id,
                event_type: 'weekly_digest',
                source_page: `imp:${impressions}|clk:${clicks}|ctr:${ctr}|push:${pushes}`,
                viewer_id: sp.user_id,
              }).catch(() => {});

            } catch (spErr) {
              console.error(`[weekly-cron] Digest error for ${sp.display_name}:`, spErr);
            }
          }

          console.log(`[weekly-cron] Sponsor digests sent: ${digestsSent}/${sponsors.length}`);
          results.sponsor_digest = { sent: digestsSent, total_sponsors: sponsors.length };
        } else {
          results.sponsor_digest = { sent: 0, reason: 'no_active_sponsors' };
        }
      } catch (digestErr: any) {
        console.error('[weekly-cron] Sponsor digest task error:', digestErr.message);
        results.sponsor_digest = { error: digestErr.message };
      }
    }

    // ============================================================
    // TASK 5: Process Scheduled Push Notifications
    // ============================================================
    if (tasks.includes('process_scheduled_pushes')) {
      console.log('[weekly-cron] Processing scheduled push notifications...');
      try {
        const now = new Date().toISOString();

        // Find all scheduled pushes that are due (event_type = 'scheduled_push')
        const { data: scheduledPushes } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id, ambassador_id, source_page, social_platform')
          .eq('event_type', 'scheduled_push')
          .limit(50);

        let processed = 0;
        if (scheduledPushes && scheduledPushes.length > 0) {
          for (const sp of scheduledPushes) {
            try {
              // Parse source_page: title|body|scheduledIso|city|radius
              const parts = (sp.source_page || '').split('|');
              const title = parts[0] || 'Push';
              const body = parts[1] || '';
              const scheduledFor = parts[2] || '';
              const city = parts[3] || '';
              const radius = parseInt(parts[4]) || 200;

              // Check if it's time to send
              if (!scheduledFor || new Date(scheduledFor) > new Date()) continue;

              // Get ambassador info
              const { data: amb } = await supabaseAdmin
                .from('ambassadors')
                .select('id, display_name, user_id')
                .eq('id', sp.ambassador_id)
                .maybeSingle();

              if (!amb) continue;

              // Get push tokens to send to
              const { data: tokens } = await supabaseAdmin
                .from('push_tokens')
                .select('token')
                .eq('active', true)
                .limit(500);

              if (tokens && tokens.length > 0) {
                // For A/B tests, only send to half the audience per variant
                const isVariant = sp.social_platform === 'variant_a' || sp.social_platform === 'variant_b';
                const targetTokens = isVariant
                  ? tokens.filter((_, idx) => sp.social_platform === 'variant_a' ? idx % 2 === 0 : idx % 2 === 1)
                  : tokens;

                const messages = targetTokens.map(t => buildPushMessage(
                  t.token,
                  title,
                  body,
                  { type: 'sponsor_push', ambassadorId: amb.id, ambassadorName: amb.display_name },
                  { channelId: 'sponsor-updates' }
                ));

                if (messages.length > 0) {
                  const tickets = await sendPushNotifications(messages);
                  const sent = tickets.filter(t => t.status === 'ok').length;
                  console.log(`[weekly-cron] Scheduled push sent: ${sent}/${messages.length} for ${amb.display_name}`);
                }
              }

              // Mark as sent by converting event_type to sponsor_push
              await supabaseAdmin
                .from('ambassador_analytics')
                .update({ event_type: 'sponsor_push' })
                .eq('id', sp.id);

              processed++;
            } catch (spErr) {
              console.error(`[weekly-cron] Error processing scheduled push ${sp.id}:`, spErr);
            }
          }
        }

        console.log(`[weekly-cron] Processed ${processed} scheduled pushes`);
        results.process_scheduled_pushes = { processed };
      } catch (schedErr: any) {
        console.error('[weekly-cron] Scheduled push task error:', schedErr.message);
        results.process_scheduled_pushes = { error: schedErr.message };
      }
    }

    // ============================================================
    // TASK 5b: Process Scheduled Announcements
    // Sends announcements whose scheduled_at has passed
    // ============================================================
    if (tasks.includes('process_scheduled_announcements')) {
      console.log('[weekly-cron] Processing scheduled announcements...');
      try {
        const now = new Date().toISOString();

        // Find all scheduled announcements that are due
        const { data: dueAnnouncements } = await supabaseAdmin
          .from('announcements')
          .select('*')
          .eq('status', 'scheduled')
          .not('scheduled_at', 'is', null)
          .lte('scheduled_at', now);

        let processed = 0;
        let totalSent = 0;
        let totalErrors = 0;

        if (dueAnnouncements && dueAnnouncements.length > 0) {
          for (const ann of dueAnnouncements) {
            try {
              console.log(`[weekly-cron] Sending scheduled announcement: ${ann.title_fr || ann.title_en} (id: ${ann.id})`);

              // Get ALL active push tokens
              const { data: allTokens } = await supabaseAdmin
                .from('push_tokens')
                .select('user_id, token, platform')
                .eq('active', true);

              if (!allTokens || allTokens.length === 0) {
                await supabaseAdmin.from('announcements').update({
                  status: 'sent',
                  push_sent_count: 0,
                  push_error_count: 0,
                }).eq('id', ann.id);
                processed++;
                continue;
              }

              let targetTokens = allTokens;

              // Apply targeting filter
              if (ann.target_type && ann.target_type !== 'all' && ann.target_value) {
                const allUserIds = [...new Set(allTokens.map((t: any) => t.user_id))];
                const matchedUserIds = new Set<string>();

                if (ann.target_type === 'rank') {
                  const rankRanges: Record<string, { min: number; max: number }> = {
                    bronze: { min: 0, max: 1099 }, silver: { min: 1100, max: 1199 },
                    gold: { min: 1200, max: 1499 }, diamond: { min: 1500, max: 1799 },
                    master: { min: 1800, max: 1999 }, grand_master: { min: 2000, max: 999999 },
                  };
                  const rankKeys = ann.target_value.split(',').map((r: string) => r.trim()).filter(Boolean);
                  for (const rk of rankKeys) {
                    const range = rankRanges[rk];
                    if (range) {
                      const { data: rankPlayers } = await supabaseAdmin
                        .from('players').select('user_id')
                        .gte('elo_rating', range.min).lte('elo_rating', range.max)
                        .in('user_id', allUserIds);
                      (rankPlayers || []).forEach((p: any) => matchedUserIds.add(p.user_id));
                    }
                  }
                } else if (ann.target_type === 'city') {
                  const cityLower = ann.target_value.toLowerCase();
                  const { data: tCities } = await supabaseAdmin.from('terrains').select('user_id, city').in('user_id', allUserIds);
                  const { data: cCities } = await supabaseAdmin.from('clubs').select('user_id, city').in('user_id', allUserIds);
                  (tCities || []).forEach((t: any) => { if (t.city?.toLowerCase() === cityLower) matchedUserIds.add(t.user_id); });
                  (cCities || []).forEach((c: any) => { if (c.city?.toLowerCase() === cityLower) matchedUserIds.add(c.user_id); });
                } else if (ann.target_type === 'club') {
                  const clubLower = ann.target_value.toLowerCase();
                  const { data: clubPlayers } = await supabaseAdmin.from('players').select('user_id, club').in('user_id', allUserIds);
                  (clubPlayers || []).forEach((p: any) => { if (p.club?.toLowerCase() === clubLower) matchedUserIds.add(p.user_id); });
                } else if (ann.target_type === 'account_age') {
                  const maxDays = parseInt(ann.target_value) || 7;
                  const cutoff = new Date(Date.now() - maxDays * 86400000).toISOString();
                  const { data: newUsers } = await supabaseAdmin.from('user_profiles').select('id').gte('created_at', cutoff).in('id', allUserIds);
                  (newUsers || []).forEach((u: any) => matchedUserIds.add(u.id));
                } else if (ann.target_type === 'match_count') {
                  const parts = ann.target_value.split('-');
                  const minMatches = parseInt(parts[0]) || 0;
                  const maxMatches = parseInt(parts[1]) || 999999;
                  const { data: playerStats } = await supabaseAdmin.from('players').select('user_id, stats').in('user_id', allUserIds);
                  (playerStats || []).forEach((p: any) => {
                    const mc = p.stats?.matchesPlayed || 0;
                    if (mc >= minMatches && mc <= maxMatches) matchedUserIds.add(p.user_id);
                  });
                } else if (ann.target_type === 'last_active') {
                  const maxDays = parseInt(ann.target_value) || 30;
                  const cutoff = new Date(Date.now() - maxDays * 86400000).toISOString();
                  const { data: inactivePlayers } = await supabaseAdmin.from('players').select('user_id, last_match_date').in('user_id', allUserIds).lt('last_match_date', cutoff);
                  (inactivePlayers || []).forEach((p: any) => matchedUserIds.add(p.user_id));
                  // Also include users without any match
                  const { data: noMatchPlayers } = await supabaseAdmin.from('players').select('user_id').in('user_id', allUserIds).is('last_match_date', null);
                  (noMatchPlayers || []).forEach((p: any) => matchedUserIds.add(p.user_id));
                }

                targetTokens = allTokens.filter((t: any) => matchedUserIds.has(t.user_id));
              }

              if (targetTokens.length === 0) {
                await supabaseAdmin.from('announcements').update({
                  status: 'sent', push_sent_count: 0, push_error_count: 0,
                }).eq('id', ann.id);
                processed++;
                continue;
              }

              // Build platform breakdown
              const platformCounts: Record<string, number> = {};
              targetTokens.forEach((t: any) => { platformCounts[t.platform || 'unknown'] = (platformCounts[t.platform || 'unknown'] || 0) + 1; });

              const annTitle = ann.title_fr || ann.title_en;
              const annBody = ann.message_fr || ann.message_en;

              let annSent = 0;
              let annErrors = 0;
              const ticketIds: string[] = [];

              const BATCH_SIZE = 100;
              for (let i = 0; i < targetTokens.length; i += BATCH_SIZE) {
                const batch = targetTokens.slice(i, i + BATCH_SIZE).map((t: any) => buildPushMessage(
                  t.token,
                  `\u{1F4E2} ${annTitle}`,
                  annBody,
                  { type: 'announcement' },
                  { channelId: 'tournament-reminders', priority: 'high' }
                ));
                const tickets = await sendPushNotifications(batch);
                annSent += tickets.filter((t: any) => t.status === 'ok').length;
                annErrors += tickets.filter((t: any) => t.status === 'error').length;
                tickets.forEach((t: any) => { if (t.id) ticketIds.push(t.id); });

                for (let j = 0; j < tickets.length; j++) {
                  if (tickets[j].details?.error === 'DeviceNotRegistered') {
                    const invalidToken = batch[j]?.to;
                    if (invalidToken) {
                      await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
                    }
                  }
                }
              }

              // Update announcement as sent
              await supabaseAdmin.from('announcements').update({
                status: 'sent',
                push_sent_count: annSent,
                push_error_count: annErrors,
                platform_breakdown: platformCounts,
              }).eq('id', ann.id);

              // Store ticket IDs for later receipt checking
              if (ticketIds.length > 0) {
                await supabaseAdmin.from('ambassador_analytics').insert({
                  ambassador_id: '00000000-0000-0000-0000-000000000000',
                  event_type: 'push_tickets',
                  source_page: ticketIds.slice(0, 500).join(','),
                  social_platform: `announcement:${ann.id}`,
                }).catch(() => {});
              }

              totalSent += annSent;
              totalErrors += annErrors;
              processed++;
              console.log(`[weekly-cron] Scheduled announcement sent: ${annSent}/${targetTokens.length} for "${annTitle}"`);
            } catch (annErr: any) {
              console.error(`[weekly-cron] Error processing announcement ${ann.id}:`, annErr.message);
              // Mark as sent with error to avoid retrying forever
              await supabaseAdmin.from('announcements').update({
                status: 'sent', push_sent_count: 0, push_error_count: 1,
              }).eq('id', ann.id);
              processed++;
            }
          }
        }

        console.log(`[weekly-cron] Processed ${processed} scheduled announcements (${totalSent} sent, ${totalErrors} errors)`);
        results.process_scheduled_announcements = { processed, sent: totalSent, errors: totalErrors };
      } catch (schedAnnErr: any) {
        console.error('[weekly-cron] Scheduled announcements task error:', schedAnnErr.message);
        results.process_scheduled_announcements = { error: schedAnnErr.message };
      }
    }

    // ============================================================
    // TASK 5c: Check Push Receipts
    // Verifies delivery of previously sent push notifications
    // ============================================================
    if (tasks.includes('check_push_receipts')) {
      console.log('[weekly-cron] Checking push notification receipts...');
      try {
        // Fetch recent ticket IDs stored from the last 24 hours
        const threshold24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: ticketRecords } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id, source_page, social_platform')
          .eq('event_type', 'push_tickets')
          .gte('created_at', threshold24h)
          .limit(50);

        let totalChecked = 0;
        let totalDelivered = 0;
        let totalFailed = 0;
        let tokensDeactivated = 0;

        if (ticketRecords && ticketRecords.length > 0) {
          for (const record of ticketRecords) {
            const ticketIds = (record.source_page || '').split(',').filter(Boolean);
            if (ticketIds.length === 0) continue;

            const receipts = await getPushReceipts(ticketIds);
            totalChecked += receipts.size;

            for (const [ticketId, receipt] of receipts) {
              if (receipt.status === 'ok') {
                totalDelivered++;
              } else {
                totalFailed++;
                // Handle specific errors
                if (receipt.details?.error === 'DeviceNotRegistered') {
                  // Find and deactivate the token
                  // We cannot directly map ticket to token, so we log it
                  tokensDeactivated++;
                  console.log(`[weekly-cron] Receipt error DeviceNotRegistered for ticket ${ticketId}`);
                } else if (receipt.details?.error === 'MessageTooBig') {
                  console.log(`[weekly-cron] Receipt error MessageTooBig for ticket ${ticketId}`);
                } else if (receipt.details?.error === 'MessageRateExceeded') {
                  console.log(`[weekly-cron] Receipt error MessageRateExceeded for ticket ${ticketId}`);
                } else if (receipt.details?.error === 'InvalidCredentials') {
                  console.error(`[weekly-cron] CRITICAL: InvalidCredentials error - check Expo push credentials`);
                }
              }
            }

            // Clean up processed ticket records
            await supabaseAdmin.from('ambassador_analytics').delete().eq('id', record.id);
          }
        }

        const deliveryRate = totalChecked > 0 ? Math.round((totalDelivered / totalChecked) * 100) : 0;
        console.log(`[weekly-cron] Push receipts: ${totalChecked} checked, ${totalDelivered} delivered, ${totalFailed} failed, ${tokensDeactivated} tokens flagged, ${deliveryRate}% delivery rate`);
        results.check_push_receipts = {
          checked: totalChecked,
          delivered: totalDelivered,
          failed: totalFailed,
          tokensDeactivated,
          deliveryRate,
        };
      } catch (receiptErr: any) {
        console.error('[weekly-cron] Push receipts check error:', receiptErr.message);
        results.check_push_receipts = { error: receiptErr.message };
      }
    }

    // ============================================================
    // TASK 5d: A/B Auto-Winner Selection
    // After 24h, determine which A/B variant won and update ab_data
    // ============================================================
    if (tasks.includes('ab_auto_winner')) {
      console.log('[weekly-cron] Checking A/B test winners...');
      try {
        const threshold24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Find A/B announcements sent 24+ hours ago without a winner
        const { data: abAnnouncements } = await supabaseAdmin
          .from('announcements')
          .select('id, ab_data, title_fr, title_en, target_type, target_value, push_sent_count')
          .eq('status', 'sent')
          .not('ab_data', 'is', null)
          .lt('created_at', threshold24h)
          .limit(20);

        let processed = 0;
        let winnersFound = 0;

        if (abAnnouncements && abAnnouncements.length > 0) {
          for (const ann of abAnnouncements) {
            const ab = ann.ab_data as any;
            // Skip if already has a winner or no variant B data
            if (!ab || !ab.variantB || ab.winner) continue;

            const aSent = ab.variantASent || 0;
            const aErrors = ab.variantAErrors || 0;
            const bSent = ab.variantBSent || 0;
            const bErrors = ab.variantBErrors || 0;

            // Need at least some sends to determine winner
            if (aSent === 0 && bSent === 0) continue;

            const aRate = aSent > 0 ? Math.round(((aSent - aErrors) / aSent) * 100) : 0;
            const bRate = bSent > 0 ? Math.round(((bSent - bErrors) / bSent) * 100) : 0;

            const winner = aRate >= bRate ? 'A' : 'B';
            const updatedAbData = {
              ...ab,
              winner,
              winnerDeterminedAt: new Date().toISOString(),
              winnerRateA: aRate,
              winnerRateB: bRate,
            };

            await supabaseAdmin.from('announcements')
              .update({ ab_data: updatedAbData })
              .eq('id', ann.id);

            winnersFound++;
            processed++;
            console.log(`[weekly-cron] A/B winner for "${ann.title_fr || ann.title_en}": ${winner} (A=${aRate}%, B=${bRate}%)`);

            // Auto-resend winner to the other half
            if (!ab.resent) {
              try {
                const winnerTitle = winner === 'B' && ab.variantB?.titleFr ? ab.variantB.titleFr : ann.title_fr;
                const winnerBody = winner === 'B' && ab.variantB?.messageFr ? ab.variantB.messageFr : ann.message_fr;
                const { data: resendTokens } = await supabaseAdmin.from('push_tokens').select('user_id, token').eq('active', true);
                if (resendTokens && resendTokens.length > 0) {
                  // Send to the half that did NOT get the winner variant
                  const otherHalf = resendTokens.filter((_: any, idx: number) => winner === 'A' ? idx % 2 === 1 : idx % 2 === 0);
                  let resentSent = 0;
                  let resentErrors = 0;
                  const BATCH = 100;
                  for (let bi = 0; bi < otherHalf.length; bi += BATCH) {
                    const batch = otherHalf.slice(bi, bi + BATCH).map((t: any) => buildPushMessage(t.token, `\u{1F4E2} ${winnerTitle}`, winnerBody, { type: 'announcement', variant: winner }, { channelId: 'tournament-reminders', priority: 'high' }));
                    const tickets = await sendPushNotifications(batch);
                    resentSent += tickets.filter((t: any) => t.status === 'ok').length;
                    resentErrors += tickets.filter((t: any) => t.status === 'error').length;
                  }
                  updatedAbData.resent = true;
                  updatedAbData.resentAt = new Date().toISOString();
                  updatedAbData.resentSent = resentSent;
                  updatedAbData.resentErrors = resentErrors;
                  await supabaseAdmin.from('announcements').update({ ab_data: updatedAbData }).eq('id', ann.id);
                  console.log(`[weekly-cron] A/B auto-resend winner ${winner}: ${resentSent} sent, ${resentErrors} errors`);
                }
              } catch (resendErr: any) {
                console.error(`[weekly-cron] A/B auto-resend error for ${ann.id}:`, resendErr.message);
              }
            }
          }
        }

        console.log(`[weekly-cron] A/B auto-winner: ${winnersFound} winners found out of ${processed} processed`);
        results.ab_auto_winner = { processed, winnersFound };
      } catch (abErr: any) {
        console.error('[weekly-cron] A/B auto-winner error:', abErr.message);
        results.ab_auto_winner = { error: abErr.message };
      }
    }

    // ============================================================
    // TASK 6: ELO Inactivity Decay
    // Applies -10 ELO/month for players inactive 30+ days (floor 800)
    // ============================================================
    if (tasks.includes('elo_decay')) {
      console.log('[weekly-cron] Applying ELO inactivity decay...');
      try {
        const decayCutoff = new Date();
        decayCutoff.setDate(decayCutoff.getDate() - 30);

        const { data: inactivePlayers } = await supabaseAdmin
          .from('players')
          .select('id, user_id, elo_rating, last_match_date')
          .lt('last_match_date', decayCutoff.toISOString())
          .gt('elo_rating', 800);

        let decayed = 0;
        if (inactivePlayers && inactivePlayers.length > 0) {
          for (const p of inactivePlayers) {
            if (!p.last_match_date) continue;
            // Skip locally created players (only decay real user profiles)
            if (!p.user_id || p.id !== p.user_id) continue;
            const lastMatch = new Date(p.last_match_date);
            const now = new Date();
            const daysSince = Math.floor((now.getTime() - lastMatch.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince < 30) continue;
            const monthsInactive = Math.floor((daysSince - 30) / 30) + 1;
            const totalDecay = monthsInactive * 10;
            const decayedElo = Math.max(800, (p.elo_rating || 1000) - totalDecay);
            const actualDecay = (p.elo_rating || 1000) - decayedElo;
            if (actualDecay > 0) {
              await supabaseAdmin.from('players').update({ elo_rating: decayedElo }).eq('id', p.id);
              decayed++;
            }
          }
        }

        console.log(`[weekly-cron] ELO decay applied to ${decayed} players`);
        results.elo_decay = { playersDecayed: decayed, totalInactive: inactivePlayers?.length || 0 };
      } catch (eloErr: any) {
        console.error('[weekly-cron] ELO decay error:', eloErr.message);
        results.elo_decay = { error: eloErr.message };
      }
    }

    // ============================================================
    // TASK 7: ELO Seasonal Reset
    // Archives previous season and compresses ELO towards 1000
    // Only runs in January
    // ============================================================
    if (tasks.includes('elo_seasonal_reset')) {
      console.log('[weekly-cron] Checking ELO seasonal reset...');
      try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const previousYear = currentYear - 1;

        // Only apply in January
        if (now.getMonth() === 0) {
          // Check if already archived
          const { data: existing } = await supabaseAdmin
            .from('elo_seasons')
            .select('id')
            .eq('season_year', previousYear)
            .limit(1);

          if (!existing || existing.length === 0) {
            // Fetch all players
            const { data: allPlayers } = await supabaseAdmin
              .from('players')
              .select('id, user_id, elo_rating, elo_tireur, elo_pointeur, elo_milieu, stats');

            if (allPlayers && allPlayers.length > 0) {
              // Find peak ELO from history
              const yearStart = `${previousYear}-01-01T00:00:00Z`;
              const yearEnd = `${previousYear}-12-31T23:59:59Z`;
              const { data: historyData } = await supabaseAdmin
                .from('elo_history')
                .select('player_id, elo_after')
                .gte('recorded_at', yearStart)
                .lte('recorded_at', yearEnd);

              const peakEloMap = new Map<string, number>();
              if (historyData) {
                for (const h of historyData) {
                  const current = peakEloMap.get(h.player_id) || 1000;
                  if (h.elo_after > current) peakEloMap.set(h.player_id, h.elo_after);
                }
              }

              const COMPRESSION = 0.75;
              const seasonRows: any[] = [];
              let resetCount = 0;

              for (const p of allPlayers) {
                const finalElo = p.elo_rating || 1000;
                const peakElo = Math.max(peakEloMap.get(p.id) || finalElo, finalElo);
                const rankTiers = [
                  { tier: 'master', minElo: 1800 },
                  { tier: 'diamond', minElo: 1500 },
                  { tier: 'gold', minElo: 1200 },
                  { tier: 'silver', minElo: 1000 },
                  { tier: 'bronze', minElo: 0 },
                ];
                const rank = rankTiers.find(r => finalElo >= r.minElo) || rankTiers[4];

                if (p.user_id) {
                  seasonRows.push({
                    user_id: p.user_id,
                    player_id: p.id,
                    season_year: previousYear,
                    peak_elo: peakElo,
                    final_elo: finalElo,
                    final_rank: rank.tier,
                    matches_played: p.stats?.matchesPlayed || 0,
                    wins: p.stats?.wins || 0,
                    elo_tireur: p.elo_tireur || 1000,
                    elo_pointeur: p.elo_pointeur || 1000,
                    elo_milieu: p.elo_milieu || 1000,
                  });
                }

                const newElo = Math.round(1000 + (finalElo - 1000) * COMPRESSION);
                const newTireur = Math.round(1000 + ((p.elo_tireur || 1000) - 1000) * COMPRESSION);
                const newPointeur = Math.round(1000 + ((p.elo_pointeur || 1000) - 1000) * COMPRESSION);
                const newMilieu = Math.round(1000 + ((p.elo_milieu || 1000) - 1000) * COMPRESSION);

                await supabaseAdmin.from('players').update({
                  elo_rating: newElo,
                  elo_tireur: newTireur,
                  elo_pointeur: newPointeur,
                  elo_milieu: newMilieu,
                }).eq('id', p.id);
                resetCount++;
              }

              // Insert season archives
              for (let i = 0; i < seasonRows.length; i += 50) {
                await supabaseAdmin.from('elo_seasons').upsert(seasonRows.slice(i, i + 50), { onConflict: 'player_id,season_year' });
              }

              console.log(`[weekly-cron] Seasonal reset: ${resetCount} players compressed, ${seasonRows.length} seasons archived`);
              results.elo_seasonal_reset = { applied: true, playersReset: resetCount, seasonsArchived: seasonRows.length, season: previousYear };
            } else {
              results.elo_seasonal_reset = { applied: false, reason: 'no_players' };
            }
          } else {
            results.elo_seasonal_reset = { applied: false, reason: 'already_archived', season: previousYear };
          }
        } else {
          results.elo_seasonal_reset = { applied: false, reason: 'not_january', month: now.getMonth() };
        }
      } catch (seasonErr: any) {
        console.error('[weekly-cron] Seasonal reset error:', seasonErr.message);
        results.elo_seasonal_reset = { error: seasonErr.message };
      }
    }

    // ============================================================
    // TASK 8: Appeal Deadline Check - Notify admins of overdue appeals
    // ============================================================
    if (tasks.includes('appeal_deadline_check')) {
      console.log('[weekly-cron] Checking overdue ban appeals...');
      try {
        const threshold48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: overdueAppeals } = await supabaseAdmin
          .from('ban_appeals')
          .select('id, created_at')
          .eq('status', 'pending')
          .lt('created_at', threshold48h);

        const overdueCount = overdueAppeals?.length || 0;
        if (overdueCount > 0) {
          // Calculate oldest appeal age in days
          const oldestDate = overdueAppeals!.reduce((min: string, a: any) => a.created_at < min ? a.created_at : min, overdueAppeals![0].created_at);
          const oldestDays = Math.floor((Date.now() - new Date(oldestDate).getTime()) / (24 * 60 * 60 * 1000));

          // Check if we already sent a reminder today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { data: recentReminder } = await supabaseAdmin
            .from('ambassador_analytics')
            .select('id')
            .eq('event_type', 'appeal_deadline_reminder')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

          if (!recentReminder || recentReminder.length === 0) {
            // Send push to all admins
            const { data: adminUsers } = await supabaseAdmin
              .from('user_profiles')
              .select('id')
              .eq('is_admin', true);

            if (adminUsers && adminUsers.length > 0) {
              const adminIds = adminUsers.map((a: any) => a.id);
              const { data: adminTokens } = await supabaseAdmin
                .from('push_tokens')
                .select('user_id, token')
                .in('user_id', adminIds)
                .eq('active', true);

              if (adminTokens && adminTokens.length > 0) {
                const messages = adminTokens.map((t: any) => buildPushMessage(
                  t.token,
                  `\u{26A0}\u{FE0F} ${overdueCount} appel(s) de ban en retard`,
                  `${overdueCount} appel(s) en attente depuis plus de ${oldestDays} jour(s). Action requise.`,
                  { type: 'moderation_action', action: 'appeal_deadline' },
                  { channelId: 'tournament-reminders', priority: 'high' }
                ));
                const tickets = await sendPushNotifications(messages);
                const reminderSent = tickets.filter((t: any) => t.status === 'ok').length;
                console.log(`[weekly-cron] Appeal deadline reminder: ${reminderSent} sent to ${adminTokens.length} admin tokens`);

                // Track reminder to avoid duplicates today
                await supabaseAdmin.from('ambassador_analytics').insert({
                  ambassador_id: '00000000-0000-0000-0000-000000000000',
                  event_type: 'appeal_deadline_reminder',
                  source_page: `overdue:${overdueCount}|oldest:${oldestDays}d`,
                  viewer_id: adminIds[0],
                }).catch(() => {});

                results.appeal_deadline_check = { overdue: overdueCount, oldestDays, reminderSent };
              } else {
                results.appeal_deadline_check = { overdue: overdueCount, reason: 'no_admin_tokens' };
              }
            }
          } else {
            results.appeal_deadline_check = { overdue: overdueCount, reason: 'already_reminded_today' };
          }
        } else {
          results.appeal_deadline_check = { overdue: 0 };
        }
      } catch (appealErr: any) {
        console.error('[weekly-cron] Appeal deadline check error:', appealErr.message);
        results.appeal_deadline_check = { error: appealErr.message };
      }
    }

    // ============================================================
    // TASK 9: Admin Weekly Report - Send stats digest to all admins
    // ============================================================
    if (tasks.includes('admin_weekly_report')) {
      console.log('[weekly-cron] Generating admin weekly report...');
      try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Gather stats
        const [usersRes, matchesWeekRes, reportsRes, clubsRes, terrainsRes, appealsRes] = await Promise.all([
          supabaseAdmin.from('user_profiles').select('id, created_at', { count: 'exact' }),
          supabaseAdmin.from('matches').select('id', { count: 'exact' }).gte('created_at', weekAgo.toISOString()),
          supabaseAdmin.from('player_reports').select('status'),
          supabaseAdmin.from('clubs').select('id, is_verified', { count: 'exact' }),
          supabaseAdmin.from('terrains').select('id', { count: 'exact' }),
          supabaseAdmin.from('ban_appeals').select('id, status'),
        ]);

        const totalUsers = usersRes.count || 0;
        const newUsersWeek = (usersRes.data || []).filter((u: any) => u.created_at && new Date(u.created_at) >= weekAgo).length;
        const matchesThisWeek = matchesWeekRes.count || 0;
        const pendingReports = (reportsRes.data || []).filter((r: any) => r.status === 'pending').length;
        const activeBans = (reportsRes.data || []).filter((r: any) => r.status === 'banned').length;
        const totalClubs = clubsRes.count || 0;
        const verifiedClubs = (clubsRes.data || []).filter((c: any) => c.is_verified).length;
        const totalTerrains = terrainsRes.count || 0;
        const pendingAppeals = (appealsRes.data || []).filter((a: any) => a.status === 'pending').length;

        // Check dedup: only send once per week
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const { data: existing } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'admin_weekly_report')
          .gte('created_at', weekStart.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log('[weekly-cron] Admin weekly report already sent this week');
          results.admin_weekly_report = { sent: false, reason: 'already_sent_this_week' };
        } else {
          // Get all admin users
          const { data: adminUsers } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('is_admin', true);

          if (adminUsers && adminUsers.length > 0) {
            const adminIds = adminUsers.map((a: any) => a.id);
            const { data: adminTokens } = await supabaseAdmin
              .from('push_tokens')
              .select('token')
              .in('user_id', adminIds)
              .eq('active', true);

            if (adminTokens && adminTokens.length > 0) {
              const weekLabel = `${weekAgo.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
              const title = `\u{1F4CA} Rapport admin hebdo`;
              const bodyText = [
                `${totalUsers} utilisateurs (+${newUsersWeek})`,
                `${matchesThisWeek} matchs cette semaine`,
                `${totalClubs} clubs (${verifiedClubs} verifies)`,
                pendingReports > 0 ? `${pendingReports} signalement(s) en attente` : null,
                pendingAppeals > 0 ? `${pendingAppeals} appel(s) en attente` : null,
              ].filter(Boolean).join(' • ');

              const messages = adminTokens.map((t: any) => buildPushMessage(
                t.token,
                title,
                bodyText,
                { type: 'moderation_action', action: 'weekly_report' },
                { channelId: 'tournament-reminders', priority: 'default' }
              ));

              const tickets = await sendPushNotifications(messages);
              const sentCount = tickets.filter((t: any) => t.status === 'ok').length;

              // Track dedup
              await supabaseAdmin.from('ambassador_analytics').insert({
                ambassador_id: '00000000-0000-0000-0000-000000000000',
                event_type: 'admin_weekly_report',
                source_page: `users:${totalUsers}|new:${newUsersWeek}|matches:${matchesThisWeek}|clubs:${totalClubs}|reports:${pendingReports}|appeals:${pendingAppeals}`,
                viewer_id: adminIds[0],
              }).catch(() => {});

              console.log(`[weekly-cron] Admin weekly report sent to ${sentCount} tokens`);
              results.admin_weekly_report = {
                sent: true,
                sentCount,
                stats: { totalUsers, newUsersWeek, matchesThisWeek, totalClubs, verifiedClubs, totalTerrains, pendingReports, activeBans, pendingAppeals },
              };
            } else {
              results.admin_weekly_report = { sent: false, reason: 'no_admin_tokens' };
            }
          } else {
            results.admin_weekly_report = { sent: false, reason: 'no_admins' };
          }
        }
      } catch (reportErr: any) {
        console.error('[weekly-cron] Admin weekly report error:', reportErr.message);
        results.admin_weekly_report = { error: reportErr.message };
      }
    }

    // ============================================================
    // TASK 10: Weekly Digest Push Notification (Monday morning)
    // Sends personalized weekly summary to all active players
    // ============================================================
    if (tasks.includes('weekly_digest_push')) {
      console.log('[weekly-cron] Sending weekly digest push notifications...');
      try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Check dedup: only once per week
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
        weekStart.setHours(0, 0, 0, 0);
        const { data: existingDigest } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'weekly_digest_push')
          .gte('created_at', weekStart.toISOString())
          .limit(1);

        if (existingDigest && existingDigest.length > 0) {
          console.log('[weekly-cron] Weekly digest already sent this week');
          results.weekly_digest_push = { sent: false, reason: 'already_sent_this_week' };
        } else {
          // Fetch all active push tokens
          const { data: allTokens } = await supabaseAdmin
            .from('push_tokens')
            .select('user_id, token')
            .eq('active', true);

          if (!allTokens || allTokens.length === 0) {
            results.weekly_digest_push = { sent: 0, reason: 'no_tokens' };
          } else {
            const userIds = [...new Set(allTokens.map((t: any) => t.user_id))];
            const tokensByUser = new Map<string, string[]>();
            allTokens.forEach((t: any) => {
              if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
              tokensByUser.get(t.user_id)!.push(t.token);
            });

            // Filter by notification preference
            const { data: prefData } = await supabaseAdmin
              .from('user_preferences')
              .select('user_id, notification_preferences')
              .in('user_id', userIds);
            const prefMap = new Map<string, any>();
            (prefData || []).forEach((p: any) => prefMap.set(p.user_id, p.notification_preferences || {}));

            // Get matches from this week per user
            const { data: weekMatches } = await supabaseAdmin
              .from('matches')
              .select('user_id, team_a, team_b, winner, date')
              .gte('date', weekAgo.toISOString());

            // Compute per-user weekly stats
            const userWeekly = new Map<string, { matches: number; wins: number }>(); 
            if (weekMatches) {
              for (const m of weekMatches) {
                const allPlayers = [...(m.team_a?.players || []), ...(m.team_b?.players || [])];
                for (const pid of allPlayers) {
                  if (!userWeekly.has(pid)) userWeekly.set(pid, { matches: 0, wins: 0 });
                  const ws = userWeekly.get(pid)!;
                  ws.matches++;
                  const inA = (m.team_a?.players || []).includes(pid);
                  if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) ws.wins++;
                }
              }
            }

            // Get ELO history for delta
            const { data: eloHist } = await supabaseAdmin
              .from('elo_history')
              .select('user_id, elo_delta')
              .gte('recorded_at', weekAgo.toISOString());

            const userEloDelta = new Map<string, number>();
            if (eloHist) {
              for (const h of eloHist) {
                userEloDelta.set(h.user_id, (userEloDelta.get(h.user_id) || 0) + h.elo_delta);
              }
            }

            const messages: any[] = [];
            let eligibleCount = 0;

            for (const uid of userIds) {
              // Check preference
              const prefs = prefMap.get(uid);
              if (prefs && prefs.ranking_changed === false) continue;

              const tokens = tokensByUser.get(uid) || [];
              if (tokens.length === 0) continue;

              const ws = userWeekly.get(uid);
              const eloDelta = userEloDelta.get(uid) || 0;

              if (!ws || ws.matches === 0) continue; // Skip inactive users

              eligibleCount++;
              const winRate = ws.matches > 0 ? Math.round((ws.wins / ws.matches) * 100) : 0;
              const eloStr = eloDelta >= 0 ? `+${eloDelta}` : `${eloDelta}`;

              const title = `\u{1F4CA} Bilan de ta semaine`;
              const body = `${ws.matches} match${ws.matches > 1 ? 's' : ''}, ${ws.wins} victoire${ws.wins > 1 ? 's' : ''} (${winRate}%) | ELO: ${eloStr}`;

              for (const tk of tokens) {
                messages.push(buildPushMessage(
                  tk, title, body,
                  { type: 'ranking_changed', weeklyDigest: true },
                  { channelId: 'tournament-reminders' }
                ));
              }
            }

            // Send in batches
            let totalSent = 0;
            let totalErrors = 0;
            const BATCH_SIZE = 100;
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
              const batch = messages.slice(i, i + BATCH_SIZE);
              const tickets = await sendPushNotifications(batch);
              totalSent += tickets.filter((t: any) => t.status === 'ok').length;
              totalErrors += tickets.filter((t: any) => t.status === 'error').length;
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

            // Track dedup
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'weekly_digest_push',
              source_page: `sent:${totalSent}|errors:${totalErrors}|eligible:${eligibleCount}`,
            }).catch(() => {});

            console.log(`[weekly-cron] Weekly digest: ${totalSent} sent, ${totalErrors} errors, ${eligibleCount} eligible`);
            results.weekly_digest_push = { sent: totalSent, errors: totalErrors, eligible: eligibleCount };
          }
        }
      } catch (digestErr: any) {
        console.error('[weekly-cron] Weekly digest push error:', digestErr.message);
        results.weekly_digest_push = { error: digestErr.message };
      }
    }

    // ============================================================
    // TASK 11: Expire old club invitations (30+ days without response)
    // ============================================================
    if (tasks.includes('expire_invitations')) {
      console.log('[weekly-cron] Expiring old club invitations...');
      try {
        const threshold30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Find pending invitations older than 30 days
        const { data: expiredInvitations } = await supabaseAdmin
          .from('club_invitations')
          .select('id, club_id, club_name, inviter_user_id, invited_player_name')
          .eq('status', 'pending')
          .lt('created_at', threshold30d);

        if (expiredInvitations && expiredInvitations.length > 0) {
          const ids = expiredInvitations.map(i => i.id);
          // Update status to expired
          await supabaseAdmin
            .from('club_invitations')
            .update({ status: 'declined', decline_reason: 'Expired after 30 days', updated_at: new Date().toISOString() })
            .in('id', ids);

          // Notify club owners about expired invitations
          const ownerNotifs = new Map<string, { clubName: string; count: number; playerNames: string[] }>();
          expiredInvitations.forEach(inv => {
            const existing = ownerNotifs.get(inv.inviter_user_id) || { clubName: inv.club_name, count: 0, playerNames: [] };
            existing.count++;
            existing.playerNames.push(inv.invited_player_name);
            ownerNotifs.set(inv.inviter_user_id, existing);
          });

          for (const [ownerId, info] of ownerNotifs) {
            try {
              const { data: ownerTokens } = await supabaseAdmin
                .from('push_tokens')
                .select('token')
                .eq('user_id', ownerId)
                .eq('active', true);

              if (ownerTokens && ownerTokens.length > 0) {
                const names = info.playerNames.slice(0, 3).join(', ');
                const extra = info.count > 3 ? ` +${info.count - 3}` : '';
                const messages = ownerTokens.map(t => buildPushMessage(
                  t.token,
                  `\u23F0 ${info.count} invitation(s) expiree(s)`,
                  `Les invitations pour ${names}${extra} dans ${info.clubName} ont expire apres 30 jours sans reponse.`,
                  { type: 'club_invitation_response', clubId: null },
                  { channelId: 'share-requests' }
                ));
                await sendPushNotifications(messages);
              }
            } catch { /* silent */ }
          }

          console.log(`[weekly-cron] Expired ${expiredInvitations.length} club invitations`);
          results.expire_invitations = { expired: expiredInvitations.length };
        } else {
          results.expire_invitations = { expired: 0 };
        }
      } catch (invErr: any) {
        console.error('[weekly-cron] Invitation expiry error:', invErr.message);
        results.expire_invitations = { error: invErr.message };
      }
    }

    // ============================================================
    // TASK 12: Invitation Reminders (7 days and 21 days)
    // Sends push notifications to players who haven't responded
    // ============================================================
    if (tasks.includes('invitation_reminders')) {
      console.log('[weekly-cron] Sending invitation reminders...');
      try {
        const now = new Date();
        const threshold7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const threshold8d = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
        const threshold21d = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
        const threshold22d = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch pending invitations in the 7-day window (created 7-8 days ago)
        const { data: reminder7d } = await supabaseAdmin
          .from('club_invitations')
          .select('id, club_id, club_name, club_logo, inviter_name, invited_player_id, invited_player_name, invited_user_id, message, created_at')
          .eq('status', 'pending')
          .lt('created_at', threshold7d)
          .gte('created_at', threshold8d);

        // Fetch pending invitations in the 21-day window (created 21-22 days ago)
        const { data: reminder21d } = await supabaseAdmin
          .from('club_invitations')
          .select('id, club_id, club_name, club_logo, inviter_name, invited_player_id, invited_player_name, invited_user_id, message, created_at')
          .eq('status', 'pending')
          .lt('created_at', threshold21d)
          .gte('created_at', threshold22d);

        let sent7 = 0, sent21 = 0, errors7 = 0, errors21 = 0;

        // Process 7-day reminders
        const invitations7 = reminder7d || [];
        for (const inv of invitations7) {
          if (!inv.invited_user_id) continue;
          try {
            // Check notification preference
            const { data: prefData } = await supabaseAdmin
              .from('user_preferences')
              .select('notification_preferences')
              .eq('user_id', inv.invited_user_id)
              .maybeSingle();
            const prefs = prefData?.notification_preferences || {};
            if (prefs.club_invitation === false) continue;

            const { data: tokens } = await supabaseAdmin
              .from('push_tokens')
              .select('token')
              .eq('user_id', inv.invited_user_id)
              .eq('active', true);

            if (tokens && tokens.length > 0) {
              const messages = tokens.map((t: any) => buildPushMessage(
                t.token,
                `\u{1F514} Invitation en attente : ${inv.club_name}`,
                `${inv.inviter_name || 'Un club'} vous a invite a rejoindre "${inv.club_name}" il y a 7 jours. Acceptez ou declinez avant l'expiration automatique.`,
                { type: 'club_invitation_reminder', clubId: inv.club_id, invitationId: inv.id, reminderDay: 7 },
                { channelId: 'share-requests' }
              ));
              const tickets = await sendPushNotifications(messages);
              sent7 += tickets.filter((t: any) => t.status === 'ok').length;
              errors7 += tickets.filter((t: any) => t.status === 'error').length;

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
          } catch { /* silent per-invitation */ }
        }

        // Process 21-day reminders (urgent — 9 days before expiration)
        const invitations21 = reminder21d || [];
        for (const inv of invitations21) {
          if (!inv.invited_user_id) continue;
          try {
            // Check notification preference
            const { data: prefData } = await supabaseAdmin
              .from('user_preferences')
              .select('notification_preferences')
              .eq('user_id', inv.invited_user_id)
              .maybeSingle();
            const prefs = prefData?.notification_preferences || {};
            if (prefs.club_invitation === false) continue;

            const { data: tokens } = await supabaseAdmin
              .from('push_tokens')
              .select('token')
              .eq('user_id', inv.invited_user_id)
              .eq('active', true);

            if (tokens && tokens.length > 0) {
              const messages = tokens.map((t: any) => buildPushMessage(
                t.token,
                `\u{26A0}\u{FE0F} Dernier rappel : ${inv.club_name}`,
                `L'invitation de "${inv.club_name}" par ${inv.inviter_name || 'un club'} expire dans 9 jours. Repondez maintenant pour ne pas la perdre !`,
                { type: 'club_invitation_reminder', clubId: inv.club_id, invitationId: inv.id, reminderDay: 21 },
                { channelId: 'share-requests', priority: 'high' }
              ));
              const tickets = await sendPushNotifications(messages);
              sent21 += tickets.filter((t: any) => t.status === 'ok').length;
              errors21 += tickets.filter((t: any) => t.status === 'error').length;

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
          } catch { /* silent per-invitation */ }
        }

        console.log(`[weekly-cron] Invitation reminders: 7d=${sent7} sent/${invitations7.length} eligible, 21d=${sent21} sent/${invitations21.length} eligible`);
        results.invitation_reminders = {
          reminder_7d: { eligible: invitations7.length, sent: sent7, errors: errors7 },
          reminder_21d: { eligible: invitations21.length, sent: sent21, errors: errors21 },
        };
      } catch (remErr: any) {
        console.error('[weekly-cron] Invitation reminders error:', remErr.message);
        results.invitation_reminders = { error: remErr.message };
      }
    }

    // ============================================================
    // TASK 13: Transfer Reminders - Auto-remind recipients with pending transfers >7 days
    // ============================================================
    if (tasks.includes('transfer_reminders')) {
      console.log('[weekly-cron] Sending transfer reminders for pending >7 days...');
      try {
        const threshold7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Check dedup: only send once per week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);
        const { data: existingReminder } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'transfer_reminder_cron')
          .gte('created_at', weekStart.toISOString())
          .limit(1);

        if (existingReminder && existingReminder.length > 0) {
          console.log('[weekly-cron] Transfer reminders already sent this week');
          results.transfer_reminders = { sent: 0, reason: 'already_sent_this_week' };
        } else {
          // Fetch pending transfers older than 7 days
          const { data: overdueTransfers } = await supabaseAdmin
            .from('player_transfer_requests')
            .select('id, player_name, sender_user_id, recipient_user_id, created_at')
            .eq('status', 'pending')
            .lt('created_at', threshold7d);

          if (!overdueTransfers || overdueTransfers.length === 0) {
            results.transfer_reminders = { sent: 0, overdue: 0 };
          } else {
            // Group by recipient to send one push per recipient
            const recipientMap = new Map<string, { transfers: typeof overdueTransfers; senderIds: Set<string> }>();
            for (const t of overdueTransfers) {
              if (!recipientMap.has(t.recipient_user_id)) {
                recipientMap.set(t.recipient_user_id, { transfers: [], senderIds: new Set() });
              }
              const entry = recipientMap.get(t.recipient_user_id)!;
              entry.transfers.push(t);
              entry.senderIds.add(t.sender_user_id);
            }

            // Fetch sender names for readable messages
            const allSenderIds = [...new Set(overdueTransfers.map(t => t.sender_user_id))];
            const { data: senderProfiles } = await supabaseAdmin
              .from('user_profiles')
              .select('id, username, email')
              .in('id', allSenderIds);
            const senderNameMap = new Map<string, string>();
            (senderProfiles || []).forEach((p: any) => senderNameMap.set(p.id, p.username || p.email || '?'));

            let totalSent = 0;
            let totalErrors = 0;

            for (const [recipientId, info] of recipientMap) {
              try {
                // Check notification preference
                const { data: prefData } = await supabaseAdmin
                  .from('user_preferences')
                  .select('notification_preferences')
                  .eq('user_id', recipientId)
                  .maybeSingle();
                const prefs = prefData?.notification_preferences || {};
                if (prefs.share_request === false) continue;

                const { data: tokens } = await supabaseAdmin
                  .from('push_tokens')
                  .select('token')
                  .eq('user_id', recipientId)
                  .eq('active', true);

                if (!tokens || tokens.length === 0) continue;

                const count = info.transfers.length;
                const firstTransfer = info.transfers[0];
                const senderName = senderNameMap.get(firstTransfer.sender_user_id) || '?';

                let title: string;
                let body: string;
                if (count === 1) {
                  title = '\u{1F514} Transfert en attente';
                  body = `${senderName} attend votre reponse pour le transfert de "${firstTransfer.player_name}". Consultez vos notifications.`;
                } else {
                  title = `\u{1F514} ${count} transferts en attente`;
                  const playerNames = info.transfers.slice(0, 2).map(t => t.player_name).join(', ');
                  const extra = count > 2 ? ` +${count - 2}` : '';
                  body = `Vous avez ${count} demandes de transfert sans reponse (${playerNames}${extra}). Repondez pour debloquer les joueurs.`;
                }

                const messages = tokens.map((t: any) => buildPushMessage(
                  t.token,
                  title,
                  body,
                  { type: 'player_transfer_request' },
                  { channelId: 'share-requests', priority: 'high' }
                ));

                const tickets = await sendPushNotifications(messages);
                totalSent += tickets.filter((t: any) => t.status === 'ok').length;
                totalErrors += tickets.filter((t: any) => t.status === 'error').length;

                // Deactivate invalid tokens
                for (let i = 0; i < tickets.length; i++) {
                  if (tickets[i].details?.error === 'DeviceNotRegistered') {
                    const invalidToken = messages[i]?.to;
                    if (invalidToken) {
                      await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
                    }
                  }
                }
              } catch { /* silent per-recipient */ }
            }

            // Track dedup
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'transfer_reminder_cron',
              source_page: `sent:${totalSent}|errors:${totalErrors}|overdue:${overdueTransfers.length}|recipients:${recipientMap.size}`,
            }).catch(() => {});

            console.log(`[weekly-cron] Transfer reminders: ${totalSent} sent, ${totalErrors} errors, ${overdueTransfers.length} overdue, ${recipientMap.size} recipients`);
            results.transfer_reminders = { sent: totalSent, errors: totalErrors, overdue: overdueTransfers.length, recipients: recipientMap.size };
          }
        }
      } catch (trErr: any) {
        console.error('[weekly-cron] Transfer reminders error:', trErr.message);
        results.transfer_reminders = { error: trErr.message };
      }
    }

    // ============================================================
    // TASK 14: Transfer Escalation - Flag transfers pending 21+ days, notify admins
    // ============================================================
    if (tasks.includes('transfer_escalation')) {
      console.log('[weekly-cron] Checking for escalated transfers (pending 21+ days)...');
      try {
        const threshold21d = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

        // Dedup: only escalate once per week
        const escWeekStart = new Date();
        escWeekStart.setDate(escWeekStart.getDate() - escWeekStart.getDay() + 1);
        escWeekStart.setHours(0, 0, 0, 0);
        const { data: existingEsc } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'transfer_escalation_cron')
          .gte('created_at', escWeekStart.toISOString())
          .limit(1);

        if (existingEsc && existingEsc.length > 0) {
          console.log('[weekly-cron] Transfer escalation already sent this week');
          results.transfer_escalation = { sent: 0, reason: 'already_sent_this_week' };
        } else {
          // Find pending transfers older than 21 days
          const { data: escalatedTransfers } = await supabaseAdmin
            .from('player_transfer_requests')
            .select('id, player_name, sender_user_id, recipient_user_id, created_at')
            .eq('status', 'pending')
            .lt('created_at', threshold21d);

          if (!escalatedTransfers || escalatedTransfers.length === 0) {
            results.transfer_escalation = { escalated: 0 };
          } else {
            // Get admin users
            const { data: adminUsers } = await supabaseAdmin
              .from('user_profiles')
              .select('id')
              .eq('is_admin', true);

            if (!adminUsers || adminUsers.length === 0) {
              results.transfer_escalation = { escalated: escalatedTransfers.length, reason: 'no_admins' };
            } else {
              const adminIds = adminUsers.map((a: any) => a.id);
              const { data: adminTokens } = await supabaseAdmin
                .from('push_tokens')
                .select('user_id, token')
                .in('user_id', adminIds)
                .eq('active', true);

              // Fetch sender/recipient names for context
              const escUserIds = [...new Set(escalatedTransfers.flatMap(t => [t.sender_user_id, t.recipient_user_id]))];
              const { data: escProfiles } = await supabaseAdmin
                .from('user_profiles')
                .select('id, username, email')
                .in('id', escUserIds);
              const escNameMap = new Map<string, string>();
              (escProfiles || []).forEach((p: any) => escNameMap.set(p.id, p.username || p.email || '?'));

              // Build summary for admin notification
              const playerNames = escalatedTransfers.slice(0, 3).map(t => t.player_name).join(', ');
              const extra = escalatedTransfers.length > 3 ? ` +${escalatedTransfers.length - 3}` : '';
              const oldestDays = Math.floor((Date.now() - new Date(escalatedTransfers[escalatedTransfers.length - 1].created_at).getTime()) / 86400000);

              let escSent = 0;
              let escErrors = 0;

              if (adminTokens && adminTokens.length > 0) {
                const messages = adminTokens.map((t: any) => buildPushMessage(
                  t.token,
                  `\u{1F6A8} ${escalatedTransfers.length} transfert(s) escalade(s)`,
                  `${escalatedTransfers.length} transfert(s) en attente depuis +21 jours (${playerNames}${extra}). Plus ancien : ${oldestDays}j. Action requise.`,
                  { type: 'moderation_action', action: 'transfer_escalation' },
                  { channelId: 'tournament-reminders', priority: 'high' }
                ));

                const tickets = await sendPushNotifications(messages);
                escSent = tickets.filter((t: any) => t.status === 'ok').length;
                escErrors = tickets.filter((t: any) => t.status === 'error').length;

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

              // Track dedup + store escalated transfer IDs for dashboard
              const escalatedIds = escalatedTransfers.map(t => t.id);
              await supabaseAdmin.from('ambassador_analytics').insert({
                ambassador_id: '00000000-0000-0000-0000-000000000000',
                event_type: 'transfer_escalation_cron',
                source_page: `escalated:${escalatedTransfers.length}|oldest:${oldestDays}d|ids:${escalatedIds.slice(0, 10).join(',')}`,
                viewer_id: adminIds[0],
              }).catch(() => {});

              console.log(`[weekly-cron] Transfer escalation: ${escSent} push sent, ${escalatedTransfers.length} escalated transfers, oldest ${oldestDays}d`);
              results.transfer_escalation = {
                escalated: escalatedTransfers.length,
                oldestDays,
                pushSent: escSent,
                pushErrors: escErrors,
                transferIds: escalatedIds,
              };
            }
          }
        }
      } catch (escErr: any) {
        console.error('[weekly-cron] Transfer escalation error:', escErr.message);
        results.transfer_escalation = { error: escErr.message };
      }
    }

    // ============================================================
    // TASK 15: Transfer Expiration - Auto-cancel transfers pending 30+ days
    // ============================================================
    if (tasks.includes('transfer_expiration')) {
      console.log('[weekly-cron] Checking for expired transfers (pending 30+ days)...');
      try {
        const threshold30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Dedup: only run once per week
        const expWeekStart = new Date();
        expWeekStart.setDate(expWeekStart.getDate() - expWeekStart.getDay() + 1);
        expWeekStart.setHours(0, 0, 0, 0);
        const { data: existingExp } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'transfer_expiration_cron')
          .gte('created_at', expWeekStart.toISOString())
          .limit(1);

        if (existingExp && existingExp.length > 0) {
          console.log('[weekly-cron] Transfer expiration already processed this week');
          results.transfer_expiration = { expired: 0, reason: 'already_processed_this_week' };
        } else {
          // Find pending transfers older than 30 days
          const { data: expiredTransfers } = await supabaseAdmin
            .from('player_transfer_requests')
            .select('id, player_name, sender_user_id, recipient_user_id, created_at, match_count, challenge_count')
            .eq('status', 'pending')
            .lt('created_at', threshold30d);

          if (!expiredTransfers || expiredTransfers.length === 0) {
            results.transfer_expiration = { expired: 0 };
          } else {
            // Update status to 'expired'
            const expiredIds = expiredTransfers.map(t => t.id);
            await supabaseAdmin
              .from('player_transfer_requests')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .in('id', expiredIds);

            console.log(`[weekly-cron] Expired ${expiredIds.length} transfers`);

            // Fetch user profiles for readable names
            const expUserIds = [...new Set(expiredTransfers.flatMap(t => [t.sender_user_id, t.recipient_user_id]))];
            const { data: expProfiles } = await supabaseAdmin
              .from('user_profiles')
              .select('id, username, email')
              .in('id', expUserIds);
            const expNameMap = new Map<string, string>();
            (expProfiles || []).forEach((p: any) => expNameMap.set(p.id, p.username || p.email || '?'));

            let senderPushSent = 0;
            let recipientPushSent = 0;
            let pushErrors = 0;

            // Group by sender for consolidated notification
            const senderMap = new Map<string, { transfers: typeof expiredTransfers }>();
            for (const t of expiredTransfers) {
              if (!senderMap.has(t.sender_user_id)) senderMap.set(t.sender_user_id, { transfers: [] });
              senderMap.get(t.sender_user_id)!.transfers.push(t);
            }

            // Notify senders
            for (const [senderId, info] of senderMap) {
              try {
                const { data: sTokens } = await supabaseAdmin
                  .from('push_tokens')
                  .select('token')
                  .eq('user_id', senderId)
                  .eq('active', true);

                if (sTokens && sTokens.length > 0) {
                  const count = info.transfers.length;
                  const playerNames = info.transfers.slice(0, 2).map(t => t.player_name).join(', ');
                  const extra = count > 2 ? ` +${count - 2}` : '';
                  const title = count === 1
                    ? `\u{23F0} Transfert expire : ${info.transfers[0].player_name}`
                    : `\u{23F0} ${count} transfert(s) expire(s)`;
                  const body = count === 1
                    ? `Votre demande de transfert pour "${info.transfers[0].player_name}" a expire apres 30 jours sans reponse du destinataire.`
                    : `Vos demandes de transfert (${playerNames}${extra}) ont expire apres 30 jours sans reponse.`;

                  const messages = sTokens.map((t: any) => buildPushMessage(
                    t.token, title, body,
                    { type: 'player_transfer_response', expired: true },
                    { channelId: 'share-requests', priority: 'default' }
                  ));
                  const tickets = await sendPushNotifications(messages);
                  senderPushSent += tickets.filter((t: any) => t.status === 'ok').length;
                  pushErrors += tickets.filter((t: any) => t.status === 'error').length;

                  for (let i = 0; i < tickets.length; i++) {
                    if (tickets[i].details?.error === 'DeviceNotRegistered') {
                      const invalidToken = messages[i]?.to;
                      if (invalidToken) await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
                    }
                  }
                }
              } catch { /* silent per-sender */ }
            }

            // Group by recipient for consolidated notification
            const recipientMap = new Map<string, { transfers: typeof expiredTransfers }>();
            for (const t of expiredTransfers) {
              if (!recipientMap.has(t.recipient_user_id)) recipientMap.set(t.recipient_user_id, { transfers: [] });
              recipientMap.get(t.recipient_user_id)!.transfers.push(t);
            }

            // Notify recipients
            for (const [recipientId, info] of recipientMap) {
              try {
                // Check notification preference
                const { data: prefData } = await supabaseAdmin
                  .from('user_preferences')
                  .select('notification_preferences')
                  .eq('user_id', recipientId)
                  .maybeSingle();
                const prefs = prefData?.notification_preferences || {};
                if (prefs.share_request === false) continue;

                const { data: rTokens } = await supabaseAdmin
                  .from('push_tokens')
                  .select('token')
                  .eq('user_id', recipientId)
                  .eq('active', true);

                if (rTokens && rTokens.length > 0) {
                  const count = info.transfers.length;
                  const senderName = expNameMap.get(info.transfers[0].sender_user_id) || '?';
                  const playerNames = info.transfers.slice(0, 2).map(t => t.player_name).join(', ');
                  const extra = count > 2 ? ` +${count - 2}` : '';
                  const title = count === 1
                    ? `\u{23F0} Transfert expire : ${info.transfers[0].player_name}`
                    : `\u{23F0} ${count} transfert(s) expire(s)`;
                  const body = count === 1
                    ? `La demande de transfert de "${info.transfers[0].player_name}" par ${senderName} a expire apres 30 jours.`
                    : `${count} demandes de transfert (${playerNames}${extra}) ont expire apres 30 jours sans reponse.`;

                  const messages = rTokens.map((t: any) => buildPushMessage(
                    t.token, title, body,
                    { type: 'player_transfer_request' },
                    { channelId: 'share-requests', priority: 'default' }
                  ));
                  const tickets = await sendPushNotifications(messages);
                  recipientPushSent += tickets.filter((t: any) => t.status === 'ok').length;
                  pushErrors += tickets.filter((t: any) => t.status === 'error').length;

                  for (let i = 0; i < tickets.length; i++) {
                    if (tickets[i].details?.error === 'DeviceNotRegistered') {
                      const invalidToken = messages[i]?.to;
                      if (invalidToken) await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
                    }
                  }
                }
              } catch { /* silent per-recipient */ }
            }

            // Track dedup
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'transfer_expiration_cron',
              source_page: `expired:${expiredIds.length}|senderPush:${senderPushSent}|recipientPush:${recipientPushSent}|errors:${pushErrors}`,
            }).catch(() => {});

            console.log(`[weekly-cron] Transfer expiration: ${expiredIds.length} expired, sender push: ${senderPushSent}, recipient push: ${recipientPushSent}, errors: ${pushErrors}`);
            results.transfer_expiration = {
              expired: expiredIds.length,
              senderPushSent,
              recipientPushSent,
              pushErrors,
              transferIds: expiredIds,
            };
          }
        }
      } catch (expErr: any) {
        console.error('[weekly-cron] Transfer expiration error:', expErr.message);
        results.transfer_expiration = { error: expErr.message };
      }
    }

    // ============================================================
    // TASK 16: Transfer Urgent Reminders - Auto-remind recipients with transfers expiring in 0-5 days (25-30d pending)
    // ============================================================
    if (tasks.includes('transfer_urgent_reminders')) {
      console.log('[weekly-cron] Sending urgent reminders for transfers expiring soon (25-30 days)...');
      try {
        const twentyFiveDaysAgo = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Dedup: only send once per week
        const urgWeekStart = new Date();
        urgWeekStart.setDate(urgWeekStart.getDate() - urgWeekStart.getDay() + 1);
        urgWeekStart.setHours(0, 0, 0, 0);
        const { data: existingUrg } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'transfer_urgent_reminder_cron')
          .gte('created_at', urgWeekStart.toISOString())
          .limit(1);

        if (existingUrg && existingUrg.length > 0) {
          console.log('[weekly-cron] Urgent transfer reminders already sent this week');
          results.transfer_urgent_reminders = { sent: 0, reason: 'already_sent_this_week' };
        } else {
          // Find pending transfers created 25-30 days ago
          const { data: expiringTransfers } = await supabaseAdmin
            .from('player_transfer_requests')
            .select('id, player_name, sender_user_id, recipient_user_id, created_at')
            .eq('status', 'pending')
            .lt('created_at', twentyFiveDaysAgo)
            .gte('created_at', thirtyDaysAgo);

          if (!expiringTransfers || expiringTransfers.length === 0) {
            results.transfer_urgent_reminders = { sent: 0, expiring: 0 };
          } else {
            // Fetch sender names
            const urgSenderIds = [...new Set(expiringTransfers.map(t => t.sender_user_id))];
            const { data: urgSenderProfiles } = await supabaseAdmin
              .from('user_profiles')
              .select('id, username, email')
              .in('id', urgSenderIds);
            const urgSenderMap = new Map<string, string>();
            (urgSenderProfiles || []).forEach((p: any) => urgSenderMap.set(p.id, p.username || p.email || '?'));

            // Group by recipient
            const urgRecipientMap = new Map<string, { transfers: typeof expiringTransfers }>();
            for (const t of expiringTransfers) {
              if (!urgRecipientMap.has(t.recipient_user_id)) urgRecipientMap.set(t.recipient_user_id, { transfers: [] });
              urgRecipientMap.get(t.recipient_user_id)!.transfers.push(t);
            }

            let urgTotalSent = 0;
            let urgTotalErrors = 0;

            for (const [recipientId, info] of urgRecipientMap) {
              try {
                // Check notification preference
                const { data: urgPrefData } = await supabaseAdmin
                  .from('user_preferences')
                  .select('notification_preferences')
                  .eq('user_id', recipientId)
                  .maybeSingle();
                const urgPrefs = urgPrefData?.notification_preferences || {};
                if (urgPrefs.share_request === false) continue;

                const { data: urgTokens } = await supabaseAdmin
                  .from('push_tokens')
                  .select('token')
                  .eq('user_id', recipientId)
                  .eq('active', true);

                if (!urgTokens || urgTokens.length === 0) continue;

                const count = info.transfers.length;
                const firstT = info.transfers[0];
                const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(firstT.created_at).getTime()) / 86400000));
                const senderName = urgSenderMap.get(firstT.sender_user_id) || '?';

                let urgTitle: string;
                let urgBody: string;
                if (count === 1) {
                  urgTitle = `\u{26A0}\u{FE0F} Transfert expire dans ${daysLeft}j !`;
                  urgBody = `${senderName} attend votre reponse pour "${firstT.player_name}". Sans action, le transfert sera automatiquement annule.`;
                } else {
                  const playerNames = info.transfers.slice(0, 2).map(t => t.player_name).join(', ');
                  const extra = count > 2 ? ` +${count - 2}` : '';
                  urgTitle = `\u{26A0}\u{FE0F} ${count} transfert(s) expirent dans ${daysLeft}j !`;
                  urgBody = `Vous avez ${count} transferts sans reponse (${playerNames}${extra}). Ils seront annules automatiquement sans action de votre part.`;
                }

                const urgMessages = urgTokens.map((t: any) => buildPushMessage(
                  t.token, urgTitle, urgBody,
                  { type: 'player_transfer_request', urgent: true },
                  { channelId: 'share-requests', priority: 'high' }
                ));

                const urgTickets = await sendPushNotifications(urgMessages);
                urgTotalSent += urgTickets.filter((t: any) => t.status === 'ok').length;
                urgTotalErrors += urgTickets.filter((t: any) => t.status === 'error').length;

                // Deactivate invalid tokens
                for (let i = 0; i < urgTickets.length; i++) {
                  if (urgTickets[i].details?.error === 'DeviceNotRegistered') {
                    const invalidToken = urgMessages[i]?.to;
                    if (invalidToken) {
                      await supabaseAdmin.from('push_tokens').update({ active: false }).eq('token', invalidToken);
                    }
                  }
                }
              } catch { /* silent per-recipient */ }
            }

            // Track dedup
            const urgIds = expiringTransfers.map(t => t.id);
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'transfer_urgent_reminder_cron',
              source_page: `sent:${urgTotalSent}|errors:${urgTotalErrors}|expiring:${expiringTransfers.length}|recipients:${urgRecipientMap.size}|ids:${urgIds.slice(0, 10).join(',')}`,
            }).catch(() => {});

            console.log(`[weekly-cron] Urgent transfer reminders: ${urgTotalSent} sent, ${urgTotalErrors} errors, ${expiringTransfers.length} expiring, ${urgRecipientMap.size} recipients`);
            results.transfer_urgent_reminders = {
              sent: urgTotalSent,
              errors: urgTotalErrors,
              expiring: expiringTransfers.length,
              recipients: urgRecipientMap.size,
              transferIds: urgIds,
            };
          }
        }
      } catch (urgErr: any) {
        console.error('[weekly-cron] Urgent transfer reminders error:', urgErr.message);
        results.transfer_urgent_reminders = { error: urgErr.message };
      }
    }

    // ============================================================
    // TASK 17: Transfer Archive - Move resolved transfers older than 90 days to archive table
    // ============================================================
    if (tasks.includes('transfer_archive')) {
      console.log('[weekly-cron] Archiving resolved transfers older than 90 days...');
      try {
        const threshold90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        // Dedup: only run once per week
        const arcWeekStart = new Date();
        arcWeekStart.setDate(arcWeekStart.getDate() - arcWeekStart.getDay() + 1);
        arcWeekStart.setHours(0, 0, 0, 0);
        const { data: existingArc } = await supabaseAdmin
          .from('ambassador_analytics')
          .select('id')
          .eq('event_type', 'transfer_archive_cron')
          .gte('created_at', arcWeekStart.toISOString())
          .limit(1);

        if (existingArc && existingArc.length > 0) {
          console.log('[weekly-cron] Transfer archive already processed this week');
          results.transfer_archive = { archived: 0, reason: 'already_processed_this_week' };
        } else {
          // Find resolved transfers older than 90 days
          const { data: archivableTransfers } = await supabaseAdmin
            .from('player_transfer_requests')
            .select('id, player_name, sender_user_id, recipient_user_id, status, match_count, challenge_count, message, created_at, updated_at')
            .in('status', ['accepted', 'declined', 'expired'])
            .lt('updated_at', threshold90d);

          if (!archivableTransfers || archivableTransfers.length === 0) {
            results.transfer_archive = { archived: 0 };
          } else {
            // Insert into archive table in batches
            const archiveRows = archivableTransfers.map(t => ({
              original_id: t.id,
              player_name: t.player_name,
              sender_user_id: t.sender_user_id,
              recipient_user_id: t.recipient_user_id,
              status: t.status,
              match_count: t.match_count || 0,
              challenge_count: t.challenge_count || 0,
              message: t.message || null,
              created_at: t.created_at,
              updated_at: t.updated_at,
              archived_at: new Date().toISOString(),
            }));

            let insertedCount = 0;
            for (let i = 0; i < archiveRows.length; i += 50) {
              const batch = archiveRows.slice(i, i + 50);
              const { error: insertErr } = await supabaseAdmin.from('player_transfer_archives').insert(batch);
              if (!insertErr) insertedCount += batch.length;
              else console.error('[weekly-cron] Archive insert error:', insertErr.message);
            }

            // Delete archived records from original table
            if (insertedCount > 0) {
              const archivedIds = archivableTransfers.slice(0, insertedCount).map(t => t.id);
              for (let i = 0; i < archivedIds.length; i += 50) {
                const batch = archivedIds.slice(i, i + 50);
                await supabaseAdmin.from('player_transfer_requests').delete().in('id', batch);
              }
            }

            // Track dedup
            const statusCounts = { accepted: 0, declined: 0, expired: 0 };
            archivableTransfers.forEach(t => { if (statusCounts[t.status as keyof typeof statusCounts] !== undefined) statusCounts[t.status as keyof typeof statusCounts]++; });
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'transfer_archive_cron',
              source_page: `archived:${insertedCount}|accepted:${statusCounts.accepted}|declined:${statusCounts.declined}|expired:${statusCounts.expired}`,
            }).catch(() => {});

            console.log(`[weekly-cron] Transfer archive: ${insertedCount} archived (${statusCounts.accepted} accepted, ${statusCounts.declined} declined, ${statusCounts.expired} expired)`);
            results.transfer_archive = {
              archived: insertedCount,
              accepted: statusCounts.accepted,
              declined: statusCounts.declined,
              expired: statusCounts.expired,
            };
          }
        }
      } catch (arcErr: any) {
        console.error('[weekly-cron] Transfer archive error:', arcErr.message);
        results.transfer_archive = { error: arcErr.message };
      }
    }

    // ============================================================
    // TASK 18: Partner Expiration — Deactivate expired + warn 7d before
    // ============================================================
    if (tasks.includes('partner_expiration')) {
      console.log('[weekly-cron] Checking partner expirations...');
      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // 1. Auto-deactivate expired partners
        const { data: expiredPartners } = await supabaseAdmin
          .from('ambassadors')
          .select('id, user_id, display_name, badge_type, expires_at')
          .eq('is_active', true)
          .not('expires_at', 'is', null)
          .lt('expires_at', nowIso)
          .in('badge_type', ['gold_sponsor', 'sponsor', 'partner']);

        let deactivated = 0;
        if (expiredPartners && expiredPartners.length > 0) {
          const ids = expiredPartners.map(p => p.id);
          await supabaseAdmin
            .from('ambassadors')
            .update({ is_active: false, updated_at: nowIso })
            .in('id', ids);
          deactivated = ids.length;

          // Notify each expired partner
          for (const ep of expiredPartners) {
            try {
              const { data: tokens } = await supabaseAdmin
                .from('push_tokens')
                .select('token')
                .eq('user_id', ep.user_id)
                .eq('active', true);

              if (tokens && tokens.length > 0) {
                const tierLabel = ep.badge_type === 'gold_sponsor' ? 'Or' : ep.badge_type === 'sponsor' ? 'Argent' : 'Bronze';
                const messages = tokens.map((t: any) => buildPushMessage(
                  t.token,
                  `\u{26A0}\u{FE0F} Partenariat expire`,
                  `Votre partenariat ${tierLabel} "${ep.display_name}" a expire. Contactez l'equipe pour renouveler.`,
                  { type: 'partner_expired', partnerId: ep.id },
                  { channelId: 'sponsor-updates', priority: 'high' }
                ));
                await sendPushNotifications(messages);
              }
            } catch { /* silent */ }
          }

          // Also notify admins
          const { data: adminUsers } = await supabaseAdmin.from('user_profiles').select('id').eq('is_admin', true);
          if (adminUsers && adminUsers.length > 0) {
            const adminIds = adminUsers.map((a: any) => a.id);
            const { data: adminTokens } = await supabaseAdmin.from('push_tokens').select('token').in('user_id', adminIds).eq('active', true);
            if (adminTokens && adminTokens.length > 0) {
              const names = expiredPartners.slice(0, 3).map(p => p.display_name).join(', ');
              const extra = expiredPartners.length > 3 ? ` +${expiredPartners.length - 3}` : '';
              const adminMessages = adminTokens.map((t: any) => buildPushMessage(
                t.token,
                `\u{1F6A8} ${deactivated} partenaire(s) desactive(s)`,
                `Partenariats expires et desactives : ${names}${extra}. Renouvellement requis.`,
                { type: 'moderation_action', action: 'partner_expired' },
                { channelId: 'tournament-reminders', priority: 'high' }
              ));
              await sendPushNotifications(adminMessages);
            }
          }

          // CASCADE: Remove sponsor_id from all linked items
          for (const ep of expiredPartners) {
            try {
              await supabaseAdmin.from('terrains').update({ sponsor_id: null }).eq('sponsor_id', ep.id);
              await supabaseAdmin.from('clubs').update({ sponsor_id: null }).eq('sponsor_id', ep.id);
              await supabaseAdmin.from('tournaments').update({ sponsor_id: null }).eq('sponsor_id', ep.id);
              await supabaseAdmin.from('players').update({ sponsor_id: null }).eq('sponsor_id', ep.id);
              console.log(`[weekly-cron] Cascade: removed sponsor_id from items for ${ep.display_name}`);
            } catch (cascadeErr: any) {
              console.error(`[weekly-cron] Cascade error for ${ep.display_name}:`, cascadeErr.message);
            }
          }

          console.log(`[weekly-cron] Deactivated ${deactivated} expired partners (with cascade)`);
        }

        // 2. Send 7-day warning to partners expiring soon
        const { data: expiringSoon } = await supabaseAdmin
          .from('ambassadors')
          .select('id, user_id, display_name, badge_type, expires_at')
          .eq('is_active', true)
          .not('expires_at', 'is', null)
          .gt('expires_at', nowIso)
          .lte('expires_at', sevenDaysFromNow)
          .in('badge_type', ['gold_sponsor', 'sponsor', 'partner']);

        let warned = 0;
        if (expiringSoon && expiringSoon.length > 0) {
          // Dedup: check if we already warned today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { data: existingWarn } = await supabaseAdmin
            .from('ambassador_analytics')
            .select('id')
            .eq('event_type', 'partner_expiry_warning')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

          if (!existingWarn || existingWarn.length === 0) {
            for (const sp of expiringSoon) {
              try {
                const daysLeft = Math.ceil((new Date(sp.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
                const { data: tokens } = await supabaseAdmin
                  .from('push_tokens')
                  .select('token')
                  .eq('user_id', sp.user_id)
                  .eq('active', true);

                if (tokens && tokens.length > 0) {
                  const tierLabel = sp.badge_type === 'gold_sponsor' ? 'Or' : sp.badge_type === 'sponsor' ? 'Argent' : 'Bronze';
                  const messages = tokens.map((t: any) => buildPushMessage(
                    t.token,
                    `\u{23F0} Partenariat expire dans ${daysLeft}j`,
                    `Votre partenariat ${tierLabel} "${sp.display_name}" expire dans ${daysLeft} jour(s). Renouvelez pour continuer a beneficier des avantages.`,
                    { type: 'partner_expiry_warning', partnerId: sp.id, daysLeft },
                    { channelId: 'sponsor-updates' }
                  ));
                  await sendPushNotifications(messages);
                  warned++;
                }
              } catch { /* silent */ }
            }

            // Track dedup
            await supabaseAdmin.from('ambassador_analytics').insert({
              ambassador_id: '00000000-0000-0000-0000-000000000000',
              event_type: 'partner_expiry_warning',
              source_page: `warned:${warned}|expiring:${expiringSoon.length}`,
            }).catch(() => {});
          }
        }

        console.log(`[weekly-cron] Partner expiration: ${deactivated} deactivated, ${warned} warned`);
        results.partner_expiration = { deactivated, warned, expiringSoon: expiringSoon?.length || 0 };
      } catch (partnerErr: any) {
        console.error('[weekly-cron] Partner expiration error:', partnerErr.message);
        results.partner_expiration = { error: partnerErr.message };
      }
    }

    // ============================================================
    // TASK 19: Clean up old analytics (older than 365 days)
    // ============================================================
    if (tasks.includes('cleanup_analytics') && !results.cleanup_analytics) {
      console.log('[weekly-cron] Cleaning up old analytics...');
      const threshold365d = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

      // Count old records (we don't delete user data, but we can count)
      const { data: oldAnalytics } = await supabaseAdmin
        .from('ambassador_analytics')
        .select('id')
        .lt('created_at', threshold365d)
        .limit(1000);

      const count = oldAnalytics?.length || 0;
      console.log(`[weekly-cron] Found ${count} analytics records older than 1 year (retention notice only)`);
      results.cleanup_analytics = { old_records: count, action: 'logged_only' };
    }

    console.log('[weekly-cron] All tasks completed:', JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[weekly-cron] Fatal error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
