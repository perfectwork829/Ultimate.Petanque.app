/**
 * admin-stats Edge Function
 * 
 * Aggregates ALL admin dashboard statistics in a single server-side request
 * instead of 16+ parallel client-side queries. Returns counts, weekly matches,
 * ELO distribution, monthly growth, moderation stats, push analytics,
 * declining clubs, onboarding funnel, and activity logs.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user is admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Run all queries in parallel using service role (bypasses RLS) ──
    const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const onboardingCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      usersRes,
      playersCountRes,
      terrainsCountRes,
      clubsCountRes,
      matchesCountRes,
      reportsRes,
      announcementsCountRes,
      suspiciousRes,
      appealsRes,
      weeklyMatchesRes,
      eloPlayersRes,
      clubsFullRes,
      pushLogsRes,
      activityLogsRes,
      appConfigRes,
      // Declining clubs data
      allPlayersRes,
      recentMatchesRes,
      // Onboarding step logs
      onboardingLogsRes,
      // Push token analytics
      pushTokensRes,
    ] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('id, is_premium, created_at, consent_date'),
      supabaseAdmin.from('players').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('terrains').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('clubs').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('matches').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('player_reports').select('status'),
      supabaseAdmin.from('announcements').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('suspicious_players').select('id, status'),
      supabaseAdmin.from('ban_appeals').select('id, status, created_at').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('matches').select('date').gte('date', eightWeeksAgo),
      supabaseAdmin.from('players').select('elo_rating'),
      supabaseAdmin.from('clubs').select('id, name, city, members_count, description, address, contact_email, is_public, is_verified'),
      supabaseAdmin.from('announcements').select('push_sent_count, push_error_count, target_type, created_at').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('admin_activity_logs').select('id, admin_user_id, admin_name, action_type, action_detail, target_type, target_id, target_name, metadata, created_at').order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('app_config').select('maintenance_mode, scheduled_maintenance_at').eq('id', 'main').single(),
      // For declining clubs
      supabaseAdmin.from('players').select('user_id, club_id'),
      supabaseAdmin.from('matches').select('user_id, date').gte('date', sixtyDaysAgo),
      // For onboarding funnel
      supabaseAdmin.from('onboarding_step_logs').select('session_id, step_number, step_name, action, created_at').gte('created_at', onboardingCutoff).order('created_at', { ascending: true }),
      // Push token analytics
      supabaseAdmin.from('push_tokens').select('user_id, active, platform, updated_at'),
    ]);

    const users = usersRes.data || [];
    const reports = reportsRes.data || [];
    const suspicious = suspiciousRes.data || [];
    const appeals = appealsRes.data || [];
    const allClubs = clubsFullRes.data || [];

    // ── Core stats ──
    const pendingReports = reports.filter((r: any) => r.status === 'pending').length;
    const activeWarnings = reports.filter((r: any) => r.status === 'warned').length;
    const activeBans = reports.filter((r: any) => r.status === 'banned').length;
    const dismissedReports = reports.filter((r: any) => r.status === 'dismissed').length;
    const flaggedPlayers = suspicious.filter((s: any) => s.status === 'flagged').length;
    const pendingAppeals = appeals.filter((a: any) => a.status === 'pending');
    const overdueThreshold = Date.now() - 48 * 60 * 60 * 1000;
    const overdueAppeals = pendingAppeals.filter((a: any) => new Date(a.created_at).getTime() < overdueThreshold).length;

    // ── ELO distribution ──
    const eloBuckets = { bronze: 0, silver: 0, gold: 0, diamond: 0, master: 0, grand_master: 0 };
    (eloPlayersRes.data || []).forEach((p: any) => {
      const elo = p.elo_rating || 1000;
      if (elo >= 2000) eloBuckets.grand_master++;
      else if (elo >= 1800) eloBuckets.master++;
      else if (elo >= 1500) eloBuckets.diamond++;
      else if (elo >= 1200) eloBuckets.gold++;
      else if (elo >= 1100) eloBuckets.silver++;
      else eloBuckets.bronze++;
    });

    // ── Weekly match counts (last 8 weeks) ──
    const now = new Date();
    const weeklyMatches: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const label = weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const count = (weeklyMatchesRes.data || []).filter((m: any) => {
        const d = new Date(m.date);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyMatches.push({ week: label, count });
    }

    // ── Monthly user growth (last 6 months) ──
    const monthlyGrowth: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const count = users.filter((u: any) => {
        const uDate = u.created_at || u.consent_date;
        if (!uDate) return false;
        const ud = new Date(uDate);
        return ud >= monthStart && ud < monthEnd;
      }).length;
      monthlyGrowth.push({ month: label, count });
    }

    // ── Recent signups (7 days) ──
    const recentSignups = users.filter((u: any) => {
      const d = u.created_at || u.consent_date;
      return d && d >= sevenDaysAgo;
    }).length;

    // ── Growth delta ──
    let growthDelta = 0;
    if (monthlyGrowth.length >= 2) {
      const curr = monthlyGrowth[monthlyGrowth.length - 1].count;
      const prev = monthlyGrowth[monthlyGrowth.length - 2].count;
      growthDelta = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
    }

    // ── Unverified clubs ──
    const unverifiedClubs = allClubs.filter((c: any) => !c.is_verified).map((c: any) => ({
      id: c.id, name: c.name, city: c.city, membersCount: c.members_count || 0,
      description: c.description, address: c.address, contactEmail: c.contact_email,
      isPublic: c.is_public || false,
    }));

    // ── Push analytics ──
    const pushData = pushLogsRes.data || [];
    const pushSent = pushData.reduce((s: number, a: any) => s + (a.push_sent_count || 0), 0);
    const pushErrors = pushData.reduce((s: number, a: any) => s + (a.push_error_count || 0), 0);
    const pushByType: Record<string, number> = {};
    pushData.forEach((a: any) => {
      const t = a.target_type || 'all';
      pushByType[t] = (pushByType[t] || 0) + (a.push_sent_count || 0);
    });

    // Daily push stats (last 7 days)
    const pushDaily: { date: string; sent: number; errors: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStr = d.toISOString().slice(0, 10);
      let daySent = 0;
      let dayErrors = 0;
      pushData.forEach((a: any) => {
        if (a.created_at && a.created_at.startsWith(dayStr)) {
          daySent += a.push_sent_count || 0;
          dayErrors += a.push_error_count || 0;
        }
      });
      pushDaily.push({ date: dayStr, sent: daySent, errors: dayErrors });
    }

    // ── Maintenance ──
    const maintenanceActive = appConfigRes.data?.maintenance_mode || false;
    const maintenanceScheduled = !!appConfigRes.data?.scheduled_maintenance_at;

    // ── Declining clubs ──
    const playerClubMap = new Map<string, string>();
    (allPlayersRes.data || []).forEach((p: any) => {
      if (p.club_id) playerClubMap.set(p.user_id, p.club_id);
    });
    const recentMData = recentMatchesRes.data || [];
    const decliningClubs: { id: string; name: string; city: string; score: number; prevScore: number; delta: number; color: string }[] = [];
    allClubs.forEach((c: any) => {
      const cid = c.id;
      let recentCount = 0;
      let prevCount = 0;
      recentMData.forEach((m: any) => {
        const pcid = playerClubMap.get(m.user_id);
        if (pcid !== cid) return;
        const md = new Date(m.date);
        if (md.toISOString() >= thirtyDaysAgo) recentCount++;
        else prevCount++;
      });
      const members = c.members_count || 0;
      const currentScore = Math.min(100, Math.round(recentCount * 3 + Math.min(members * 2, 30)));
      const prevScore = Math.min(100, Math.round(prevCount * 3 + Math.min(members * 2, 30)));
      const delta = currentScore - prevScore;
      if (delta < -5 || (currentScore < 20 && prevScore > currentScore)) {
        const color = currentScore >= 40 ? '#D97706' : currentScore >= 15 ? '#EF4444' : '#94A3B8';
        decliningClubs.push({ id: cid, name: c.name, city: c.city || '', score: currentScore, prevScore, delta, color });
      }
    });
    decliningClubs.sort((a, b) => a.delta - b.delta);

    // ── Push Token Analytics ──
    const allPushTokens = pushTokensRes.data || [];
    const activeTokens = allPushTokens.filter((t: any) => t.active);
    const inactiveTokens = allPushTokens.filter((t: any) => !t.active);
    const usersWithActiveToken = new Set(activeTokens.map((t: any) => t.user_id));
    const tokenCoverage = users.length > 0 ? Math.round((usersWithActiveToken.size / users.length) * 100) : 0;
    const deactivatedThisWeek = inactiveTokens.filter((t: any) => t.updated_at && t.updated_at >= sevenDaysAgo).length;
    const platformBreakdown: Record<string, number> = {};
    activeTokens.forEach((t: any) => {
      const p = t.platform || 'unknown';
      platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
    });
    const pushTokenAnalytics = {
      totalTokens: allPushTokens.length,
      activeTokens: activeTokens.length,
      inactiveTokens: inactiveTokens.length,
      usersWithToken: usersWithActiveToken.size,
      coverage: tokenCoverage,
      deactivatedThisWeek,
      platforms: platformBreakdown,
    };

    // ── Onboarding step analytics ──
    const onboardingLogs = onboardingLogsRes.data || [];
    let onboardingAnalytics: any = null;
    if (onboardingLogs.length > 0) {
      const STEP_LABELS: Record<number, string> = {
        0: 'Splash', 1: 'Language', 2: 'Promise', 3: 'Sponsor',
        4: 'Features', 5: 'Map Discovery', 6: 'Login CTA', 7: 'Profile', 8: 'Referral',
      };
      const sessionMap = new Map<string, Map<number, { enter?: string; complete?: string; skip?: string; name?: string }>>();
      onboardingLogs.forEach((l: any) => {
        if (!sessionMap.has(l.session_id)) sessionMap.set(l.session_id, new Map());
        const session = sessionMap.get(l.session_id)!;
        if (!session.has(l.step_number)) session.set(l.step_number, { name: l.step_name });
        const step = session.get(l.step_number)!;
        if (!step.name) step.name = l.step_name;
        (step as any)[l.action] = l.created_at;
      });

      const steps: any[] = [];
      let worstDropoff = 0;
      let worstDropoffName: string | null = null;
      for (let i = 0; i <= 8; i++) {
        let entered = 0, completed = 0, skipped = 0, totalDuration = 0, durationCount = 0;
        sessionMap.forEach((session) => {
          const step = session.get(i);
          if (!step) return;
          if (step.enter) entered++;
          if (step.complete) {
            completed++;
            if (step.enter) {
              const dur = (new Date(step.complete).getTime() - new Date(step.enter).getTime()) / 1000;
              if (dur > 0 && dur < 600) { totalDuration += dur; durationCount++; }
            }
          }
          if (step.skip) skipped++;
        });
        const dropoffRate = entered > 0 ? Math.round(((entered - completed - skipped) / entered) * 100) : 0;
        if (entered > 3 && dropoffRate > worstDropoff) { worstDropoff = dropoffRate; worstDropoffName = STEP_LABELS[i] || `Step ${i}`; }
        steps.push({ step: i, name: STEP_LABELS[i] || `Step ${i}`, entered, completed, skipped, avgDurationSec: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0, dropoffRate });
      }

      const totalSessions = sessionMap.size;
      const completedSessions = [...sessionMap.values()].filter(s => { const ls = s.get(8); return ls && (ls.enter || ls.complete); }).length;
      let totalDurationSum = 0, totalDurationCount = 0;
      sessionMap.forEach((session) => {
        const first = session.get(1);
        const last = session.get(8) || session.get(7);
        if (first?.enter && last) {
          const end = last.complete || last.enter;
          if (end) { const dur = (new Date(end).getTime() - new Date(first.enter).getTime()) / 1000; if (dur > 0 && dur < 3600) { totalDurationSum += dur; totalDurationCount++; } }
        }
      });

      onboardingAnalytics = {
        steps,
        totalSessions,
        completedSessions,
        completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
        avgTotalDurationSec: totalDurationCount > 0 ? Math.round(totalDurationSum / totalDurationCount) : 0,
        topDropoffStep: worstDropoffName,
      };
    }

    // ── Onboarding summary (from user_profiles) ──
    const totalUsersCount = users.length;
    const usersWithConsent = users.filter((u: any) => u.consent_date).length;
    const onboardingStats = {
      total: totalUsersCount,
      withProfile: usersWithConsent,
      withConsent: usersWithConsent,
      withRole: 0,
      conversionRate: totalUsersCount > 0 ? Math.round((usersWithConsent / totalUsersCount) * 100) : 0,
      avgDaysToProfile: 0,
    };

    // ── Build response ──
    const result = {
      stats: {
        totalUsers: users.length,
        premiumUsers: users.filter((u: any) => u.is_premium).length,
        totalPlayers: playersCountRes.count || 0,
        totalTerrains: terrainsCountRes.count || 0,
        totalClubs: clubsCountRes.count || 0,
        verifiedClubs: allClubs.filter((c: any) => c.is_verified).length,
        totalMatches: matchesCountRes.count || 0,
        pendingReports,
        activeWarnings,
        activeBans,
        dismissedReports,
        totalAnnouncements: announcementsCountRes.count || 0,
        flaggedPlayers,
        maintenanceActive,
        maintenanceScheduled,
        pendingAppeals: pendingAppeals.length,
        overdueAppeals,
      },
      eloDistribution: eloBuckets,
      weeklyMatches,
      monthlyGrowth,
      growthDelta,
      recentSignups,
      unverifiedClubs: unverifiedClubs.slice(0, 10),
      pushAnalytics: { sent: pushSent, errors: pushErrors, types: pushByType, daily: pushDaily },
      decliningClubs: decliningClubs.slice(0, 10),
      onboardingStats,
      onboardingAnalytics,
      pushTokenAnalytics,
      activityLogs: (activityLogsRes.data || []).map((row: any) => ({
        id: row.id,
        adminUserId: row.admin_user_id,
        adminName: row.admin_name,
        actionType: row.action_type,
        actionDetail: row.action_detail,
        targetType: row.target_type,
        targetId: row.target_id,
        targetName: row.target_name,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      })),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[admin-stats] Error:', error);
    return new Response(JSON.stringify({ error: `Server error: ${(error as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
