import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface PlayerAnalysis {
  player_id: string;
  user_id: string;
  trust_score: number;
  flags: string[];
  details: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    let requestingUserId: string | null = null;
    let isAdmin = false;
    if (token) {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      requestingUserId = user.id;
      const { data: profile } = await supabaseClient
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      isAdmin = profile?.is_admin === true;
    } else {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body for mode
    let body: any = {};
    try { body = await req.json(); } catch { /* no body is ok */ }
    const mode = body?.mode || 'full'; // 'full' (admin) or 'self' (single user)
    const targetUserId = body?.userId || requestingUserId;

    // Non-admin can only compute their own score
    if (!isAdmin && mode === 'full') {
      return new Response(JSON.stringify({ error: 'Admin only for full scan' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[detect-suspicious] Mode: ${mode}, Admin: ${isAdmin}, Target: ${targetUserId}`);

    // ============================================
    // FETCH DATA
    // ============================================
    
    // 1. Fetch players (all public for full mode, or single user for self mode)
    let players: any[] = [];
    if (mode === 'self' && targetUserId) {
      const { data, error } = await supabaseClient
        .from('players')
        .select('id, user_id, name, stats, created_at, is_public')
        .eq('user_id', targetUserId);
      if (!error && data) players = data;
    } else {
      const { data, error } = await supabaseClient
        .from('players')
        .select('id, user_id, name, stats, created_at, is_public')
        .eq('is_public', true);
      if (!error && data) players = data;
    }

    if (players.length === 0) {
      return new Response(JSON.stringify({ success: true, analyzed: 0, flagged: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const playerUserIds = players.map((p: any) => p.user_id).filter(Boolean);

    // 2. Fetch matches for these users
    const { data: allMatches } = await supabaseClient
      .from('matches')
      .select('id, user_id, team_a, team_b, winner, duration, date, created_at, participant_user_ids, player_actions')
      .in('user_id', playerUserIds);
    const matches = allMatches || [];

    // 3. Fetch challenges
    const { data: allChallenges } = await supabaseClient
      .from('challenges')
      .select('id, user_id, type, date, success_rate, participant_user_ids')
      .in('user_id', playerUserIds);
    const challenges = allChallenges || [];

    // 4. Fetch reports
    const { data: reports } = await supabaseClient
      .from('player_reports')
      .select('reported_player_id, status');
    const reportCounts = new Map<string, number>();
    const pendingReportCounts = new Map<string, number>();
    for (const r of reports || []) {
      reportCounts.set(r.reported_player_id, (reportCounts.get(r.reported_player_id) || 0) + 1);
      if (r.status === 'pending') {
        pendingReportCounts.set(r.reported_player_id, (pendingReportCounts.get(r.reported_player_id) || 0) + 1);
      }
    }

    // 5. Fetch modification logs for these users
    const { data: modLogs } = await supabaseClient
      .from('modification_logs')
      .select('owner_id, modifier_id, created_at')
      .in('owner_id', playerUserIds);
    const modLogsByUser = new Map<string, { total: number; external: number }>();
    for (const log of modLogs || []) {
      if (!modLogsByUser.has(log.owner_id)) modLogsByUser.set(log.owner_id, { total: 0, external: 0 });
      const entry = modLogsByUser.get(log.owner_id)!;
      entry.total++;
      if (log.modifier_id !== log.owner_id) entry.external++;
    }

    // 6. Device fingerprints for multi-account detection
    const { data: deviceRegs } = await supabaseClient
      .from('device_registrations')
      .select('device_fingerprint, email, user_id');
    const emailToFingerprints = new Map<string, Set<string>>();
    const fingerprintToEmails = new Map<string, Set<string>>();
    for (const dr of deviceRegs || []) {
      if (dr.email && dr.device_fingerprint) {
        if (!emailToFingerprints.has(dr.email)) emailToFingerprints.set(dr.email, new Set());
        emailToFingerprints.get(dr.email)!.add(dr.device_fingerprint);
        if (!fingerprintToEmails.has(dr.device_fingerprint)) fingerprintToEmails.set(dr.device_fingerprint, new Set());
        fingerprintToEmails.get(dr.device_fingerprint)!.add(dr.email);
      }
    }

    // 7. Fetch user emails for device check
    const { data: userProfiles } = await supabaseClient
      .from('user_profiles')
      .select('id, email')
      .in('id', playerUserIds);
    const userEmailMap = new Map<string, string>();
    for (const up of userProfiles || []) {
      if (up.email) userEmailMap.set(up.id, up.email.toLowerCase());
    }

    // ============================================
    // ANALYSIS
    // ============================================
    const results: PlayerAnalysis[] = [];
    const now = Date.now();

    for (const player of players) {
      const stats = player.stats || {};
      const matchesPlayed = stats.matchesPlayed || 0;
      const playerMatches = matches.filter((m: any) => m.user_id === player.user_id);
      const playerChallenges = challenges.filter((c: any) => c.user_id === player.user_id);

      const flags: string[] = [];
      const details: Record<string, any> = {};
      let score = 100; // Start at 100, subtract for issues

      const winRate = stats.winRate || 0;
      const tirRate = stats.tirRate || 0;
      const pointRate = stats.pointRate || 0;
      const carreauRate = stats.carreauRate || 0;

      // ================================================
      // FACTOR 1: Multi-Player Validation Ratio (30 pts)
      // ================================================
      const multiPlayerMatches = playerMatches.filter((m: any) => {
        const pids = m.participant_user_ids || [];
        return Array.isArray(pids) && pids.length >= 2;
      });
      const multiPlayerRatio = playerMatches.length > 0 ? multiPlayerMatches.length / playerMatches.length : 0;
      details.multiPlayerRatio = Math.round(multiPlayerRatio * 100);
      details.multiPlayerMatches = multiPlayerMatches.length;
      details.totalMatches = playerMatches.length;

      // Score: 0% multi-player = -30, 100% = 0
      const mpDeduction = Math.round((1 - multiPlayerRatio) * 30);
      score -= mpDeduction;
      if (multiPlayerRatio < 0.1 && matchesPlayed >= 10) {
        flags.push('very_low_multiplayer');
      } else if (multiPlayerRatio < 0.3 && matchesPlayed >= 10) {
        flags.push('low_multiplayer');
      }

      // ================================================
      // FACTOR 2: Adversary Diversity (20 pts)
      // ================================================
      const opponents = new Set<string>();
      for (const m of playerMatches) {
        const teamA = m.team_a?.players || [];
        const teamB = m.team_b?.players || [];
        const inA = teamA.includes(player.id);
        if (inA) teamB.forEach((p: string) => opponents.add(p));
        else teamA.forEach((p: string) => opponents.add(p));
      }
      const uniqueOpponents = opponents.size;
      const diversityRatio = playerMatches.length > 0 ? uniqueOpponents / playerMatches.length : 0;
      details.uniqueOpponents = uniqueOpponents;
      details.diversityRatio = Math.round(diversityRatio * 100) / 100;

      // Shannon-like entropy normalization
      if (uniqueOpponents <= 1 && matchesPlayed >= 10) {
        score -= 20;
        flags.push('single_opponent');
      } else if (diversityRatio < 0.15 && matchesPlayed >= 15) {
        score -= 15;
        flags.push('low_opponent_diversity');
      } else if (diversityRatio < 0.3 && matchesPlayed >= 15) {
        score -= 10;
      } else if (diversityRatio < 0.5) {
        score -= 5;
      }

      // ================================================
      // FACTOR 3: Performance Consistency (20 pts)
      // Uses 4-week sliding window standard deviation
      // ================================================
      const weeklyWinRates: number[] = [];
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      
      // Group matches by week
      const weekBuckets: Record<string, { wins: number; total: number }> = {};
      for (const m of playerMatches) {
        const mDate = new Date(m.date || m.created_at);
        if (mDate < fourWeeksAgo) continue;
        const weekNum = Math.floor((now - mDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const key = `w${weekNum}`;
        if (!weekBuckets[key]) weekBuckets[key] = { wins: 0, total: 0 };
        weekBuckets[key].total++;
        if (m.winner === 'A') weekBuckets[key].wins++;
      }
      
      const weekEntries = Object.values(weekBuckets).filter(w => w.total > 0);
      weekEntries.forEach(w => weeklyWinRates.push(w.total > 0 ? (w.wins / w.total) * 100 : 0));
      
      let performanceConsistency = 100;
      if (weeklyWinRates.length >= 2) {
        const mean = weeklyWinRates.reduce((a, b) => a + b, 0) / weeklyWinRates.length;
        const variance = weeklyWinRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / weeklyWinRates.length;
        const stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? stdDev / mean : 0;
        performanceConsistency = Math.max(0, 100 - Math.round(cv * 100));
        
        if (cv > 0.8) {
          flags.push('very_inconsistent_performance');
          score -= 15;
        } else if (cv > 0.5) {
          flags.push('inconsistent_performance');
          score -= 10;
        } else if (cv > 0.3) {
          score -= 5;
        }
      }
      details.performanceConsistency = performanceConsistency;
      details.weeklyWinRates = weeklyWinRates;

      // Check for sudden jumps (25+ point difference between consecutive weeks)
      for (let i = 1; i < weeklyWinRates.length; i++) {
        const delta = Math.abs(weeklyWinRates[i] - weeklyWinRates[i - 1]);
        if (delta > 40 && weekEntries[i]?.total >= 3 && weekEntries[i - 1]?.total >= 3) {
          if (!flags.includes('sudden_improvement')) {
            flags.push('sudden_improvement');
            score -= 5;
          }
        }
      }

      // ================================================
      // FACTOR 4: Modification History Cleanness (15 pts)
      // ================================================
      const modData = modLogsByUser.get(player.user_id) || { total: 0, external: 0 };
      details.modificationLogs = { total: modData.total, external: modData.external };
      
      // External modifications (by other players) reduce trust
      if (modData.external > 10) {
        score -= 12;
        flags.push('many_external_modifications');
      } else if (modData.external > 5) {
        score -= 8;
        flags.push('some_external_modifications');
      } else if (modData.external > 2) {
        score -= 4;
      }

      // ================================================
      // FACTOR 5: Play Frequency (10 pts)
      // ================================================
      const matchesPerWeek = playerMatches.length > 0 
        ? playerMatches.length / Math.max(1, (now - new Date(player.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 0;
      details.matchesPerWeek = Math.round(matchesPerWeek * 10) / 10;

      // Too many matches in a day = suspicious
      const dateCount = new Map<string, number>();
      for (const m of playerMatches) {
        const day = new Date(m.date || m.created_at).toISOString().split('T')[0];
        dateCount.set(day, (dateCount.get(day) || 0) + 1);
      }
      const maxMatchesPerDay = Math.max(...Array.from(dateCount.values()), 0);
      if (maxMatchesPerDay > 15) {
        score -= 10;
        flags.push('excessive_daily_matches');
        details.maxMatchesPerDay = maxMatchesPerDay;
      } else if (maxMatchesPerDay > 10) {
        score -= 5;
        flags.push('high_daily_matches');
        details.maxMatchesPerDay = maxMatchesPerDay;
      }

      // Too few matches = less trusted
      if (matchesPlayed < 5) {
        score -= 5;
      }

      // ================================================
      // FACTOR 6: Stats Regularity (bonus deductions)
      // ================================================
      if (winRate > 95 && matchesPlayed >= 10) {
        score -= 10;
        flags.push('extreme_win_rate');
        details.winRate = winRate;
      }
      if (tirRate > 85 && pointRate > 85 && matchesPlayed >= 10) {
        score -= 8;
        flags.push('unrealistic_combined_rates');
      }
      if (carreauRate > 50 && matchesPlayed >= 10) {
        score -= 8;
        flags.push('extreme_carreau_rate');
        details.carreauRate = carreauRate;
      }

      // ================================================
      // FACTOR 7: Account Age (5 pts)
      // ================================================
      const ageMs = now - new Date(player.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      details.accountAgeDays = Math.round(ageDays);
      if (ageDays < 7) {
        score -= 5;
        flags.push('very_new_account');
      } else if (ageDays < 30) {
        score -= 3;
      }

      // ================================================
      // FACTOR 8: Match Duration (suspicious short matches)
      // ================================================
      const shortMatches = playerMatches.filter((m: any) => m.duration && m.duration < 2);
      if (shortMatches.length > 5) {
        score -= 5;
        flags.push('many_very_short_matches');
        details.shortMatchCount = shortMatches.length;
      }

      // ================================================
      // FACTOR 9: Multi-Account Detection (10 pts)
      // ================================================
      const playerEmail = userEmailMap.get(player.user_id);
      if (playerEmail) {
        const userFingerprints = emailToFingerprints.get(playerEmail);
        if (userFingerprints) {
          const sharedDeviceAccounts = new Set<string>();
          for (const fp of userFingerprints) {
            const accountsOnDevice = fingerprintToEmails.get(fp);
            if (accountsOnDevice) {
              for (const email of accountsOnDevice) {
                if (email !== playerEmail) sharedDeviceAccounts.add(email);
              }
            }
          }
          if (sharedDeviceAccounts.size >= 3) {
            score -= 10;
            flags.push('multi_account_device_3plus');
            details.sharedDeviceAccounts = sharedDeviceAccounts.size;
          } else if (sharedDeviceAccounts.size >= 1) {
            score -= 5;
            flags.push('multi_account_device');
            details.sharedDeviceAccounts = sharedDeviceAccounts.size;
          }
        }
      }

      // ================================================
      // FACTOR 10: Reports
      // ================================================
      const totalReports = reportCounts.get(player.id) || 0;
      if (totalReports >= 3) {
        score -= 8;
        flags.push('multiple_reports');
      } else if (totalReports >= 1) {
        score -= 3;
        flags.push('has_reports');
      }
      details.totalReports = totalReports;

      // ================================================
      // FACTOR 12: Witness Abuse Detection (8 pts)
      // Detect frequent witness pairs and suspicious attestation patterns
      // ================================================
      const { data: witnessReqsSent } = await supabaseClient
        .from('match_witness_requests')
        .select('witness_user_id, created_at, status')
        .eq('requester_user_id', player.user_id)
        .gte('created_at', new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString());

      const { data: witnessReqsReceived } = await supabaseClient
        .from('match_witness_requests')
        .select('requester_user_id, created_at, status')
        .eq('witness_user_id', player.user_id)
        .gte('created_at', new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Count attestations per pair
      const witnessPairCounts = new Map<string, number>();
      for (const wr of witnessReqsSent || []) {
        const key = wr.witness_user_id;
        witnessPairCounts.set(key, (witnessPairCounts.get(key) || 0) + 1);
      }
      for (const wr of witnessReqsReceived || []) {
        const key = wr.requester_user_id;
        witnessPairCounts.set(key, (witnessPairCounts.get(key) || 0) + 1);
      }

      const maxPairCount = Math.max(...Array.from(witnessPairCounts.values()), 0);
      const totalWitnessActivity = (witnessReqsSent?.length || 0) + (witnessReqsReceived?.length || 0);
      details.witnessActivity = {
        sentThisWeek: witnessReqsSent?.length || 0,
        receivedThisWeek: witnessReqsReceived?.length || 0,
        maxPairCount,
        totalActivity: totalWitnessActivity,
      };

      // Frequent pair abuse: same duo > 5 attestations/week
      if (maxPairCount > 8) {
        score -= 8;
        flags.push('witness_abuse_extreme');
      } else if (maxPairCount > 5) {
        score -= 5;
        flags.push('witness_abuse_frequent_pair');
      }

      // Mutual attestation ring: both users attest each other many times
      let mutualAttestations = 0;
      for (const [partnerId, sentCount] of witnessPairCounts) {
        // Check if this partner also sent requests to current player
        const reverseCount = (witnessReqsReceived || [])
          .filter((wr: any) => wr.requester_user_id === partnerId).length;
        if (sentCount >= 2 && reverseCount >= 2) {
          mutualAttestations += sentCount + reverseCount;
        }
      }
      if (mutualAttestations > 6) {
        if (!flags.includes('witness_abuse_extreme')) {
          score -= 4;
          flags.push('witness_abuse_mutual_ring');
        }
      }
      details.mutualAttestations = mutualAttestations;

      // Count attested matches/challenges for trust factor
      const { data: attestedItems } = await supabaseClient
        .from('match_witness_requests')
        .select('id')
        .eq('requester_user_id', player.user_id)
        .eq('status', 'attested');
      details.witnessedMatchCount = attestedItems?.length || 0;

      // ================================================
      // FACTOR 13: Suspicious Match Deletion (15 pts)
      // Cross-reference soft_deletes (matches) with elo_history (won=false)
      // ================================================
      const { data: softDeletes } = await supabaseClient
        .from('soft_deletes')
        .select('item_id, deleted_at')
        .eq('user_id', player.user_id)
        .eq('table_name', 'matches');

      const deletedMatchIds = (softDeletes || []).map((sd: any) => sd.item_id);
      let deletedLostCount = 0;
      let deletedLostEloImpact = 0;
      let recentDeletedLostCount = 0; // last 7 days
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      if (deletedMatchIds.length > 0) {
        // Fetch ELO history for deleted matches where player lost
        const { data: eloEntries } = await supabaseClient
          .from('elo_history')
          .select('match_id, elo_delta, won, recorded_at')
          .eq('user_id', player.user_id)
          .eq('won', false)
          .in('match_id', deletedMatchIds);

        deletedLostCount = eloEntries?.length || 0;
        deletedLostEloImpact = (eloEntries || []).reduce((sum: number, e: any) => sum + Math.abs(e.elo_delta || 0), 0);

        // Count recent deletions (last 7 days)
        const recentDeletes = (softDeletes || []).filter((sd: any) => sd.deleted_at >= sevenDaysAgo);
        const recentDeletedIds = recentDeletes.map((sd: any) => sd.item_id);
        if (recentDeletedIds.length > 0) {
          const recentLost = (eloEntries || []).filter((e: any) => recentDeletedIds.includes(e.match_id));
          recentDeletedLostCount = recentLost.length;
        }
      }

      details.deletionAnalysis = {
        totalDeletedMatches: deletedMatchIds.length,
        deletedLostMatches: deletedLostCount,
        avoidedEloLoss: deletedLostEloImpact,
        recentDeletedLost7d: recentDeletedLostCount,
      };

      // Penalty: proportional to deleted lost matches
      if (deletedLostCount >= 10) {
        score -= 15;
        flags.push('mass_deletion_lost_matches');
      } else if (deletedLostCount >= 5) {
        score -= 10;
        flags.push('frequent_deletion_lost_matches');
      } else if (deletedLostCount >= 3) {
        score -= 7;
        flags.push('suspicious_deletion_lost_matches');
      } else if (deletedLostCount >= 1) {
        score -= 3;
        flags.push('deletion_lost_match');
      }

      // Extra penalty for recent burst deletions (3+ in 7 days)
      if (recentDeletedLostCount >= 5) {
        score -= 8;
        if (!flags.includes('mass_deletion_lost_matches')) flags.push('burst_deletion_7d');
      } else if (recentDeletedLostCount >= 3) {
        score -= 5;
        if (!flags.includes('frequent_deletion_lost_matches') && !flags.includes('mass_deletion_lost_matches')) {
          flags.push('burst_deletion_7d');
        }
      }

      // ================================================
      // BONUS: Arranged match detection
      // ================================================
      // Same opponent pair > 5 times this week with same/similar scores
      const recentMatches = playerMatches.filter((m: any) => {
        const d = new Date(m.date || m.created_at);
        return (now - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
      });
      const opponentPairCounts = new Map<string, { count: number; scores: string[] }>();
      for (const m of recentMatches) {
        const teamB = m.team_b?.players?.sort().join(',') || '';
        if (!opponentPairCounts.has(teamB)) opponentPairCounts.set(teamB, { count: 0, scores: [] });
        const entry = opponentPairCounts.get(teamB)!;
        entry.count++;
        entry.scores.push(`${m.team_a?.score || 0}-${m.team_b?.score || 0}`);
      }
      for (const [, data] of opponentPairCounts) {
        if (data.count >= 5) {
          const uniqueScores = new Set(data.scores).size;
          if (uniqueScores <= 2) {
            score -= 10;
            flags.push('arranged_matches');
            details.arrangedMatchDetails = { count: data.count, uniqueScores };
            break;
          }
        }
      }

      // ================================================
      // FACTOR 11: Inactivity Decay (-5 pts per month inactive, floor 30)
      // ================================================
      const sortedMatchDates = playerMatches
        .map((m: any) => new Date(m.date || m.created_at).getTime())
        .sort((a: number, b: number) => b - a);
      const lastPlayedTs = sortedMatchDates.length > 0 ? sortedMatchDates[0] : new Date(player.created_at).getTime();
      const daysSinceLastPlay = Math.floor((now - lastPlayedTs) / (1000 * 60 * 60 * 24));
      details.daysSinceLastPlay = daysSinceLastPlay;
      details.lastPlayedDate = new Date(lastPlayedTs).toISOString();

      if (daysSinceLastPlay >= 30) {
        const monthsInactive = Math.floor(daysSinceLastPlay / 30);
        const decayAmount = monthsInactive * 5;
        // Apply decay but ensure score does not drop below 30 from decay alone
        const preDecayScore = score;
        score = Math.max(30, score - decayAmount);
        details.inactivityDecay = { monthsInactive, decayApplied: preDecayScore - score };
        if (daysSinceLastPlay >= 60) {
          flags.push('inactive_2months');
        } else {
          flags.push('inactive_1month');
        }
      }

      // Clamp
      score = Math.max(0, Math.min(100, score));
      details.matchesPlayed = matchesPlayed;

      // Determine status
      const status = score < 25 ? 'flagged' : score < 50 ? 'watch' : 'ok';

      // Store ALL analyzed players (not just flagged) for trust badge display
      results.push({
        player_id: player.id,
        user_id: player.user_id,
        trust_score: score,
        flags,
        details,
      });
    }

    console.log(`[detect-suspicious] Analyzed ${players.length} players, ${results.filter(r => r.flags.length > 0).length} with flags`);

    // ============================================
    // UPSERT RESULTS + DETECT THRESHOLD CROSSINGS
    // ============================================
    // Fetch previous scores for threshold crossing detection
    const prevScoreMap = new Map<string, number>();
    if (results.length > 0) {
      const pids = results.map(r => r.player_id);
      try {
        const { data: prevData } = await supabaseClient
          .from('suspicious_players')
          .select('player_id, trust_score')
          .in('player_id', pids);
        (prevData || []).forEach((pd: any) => prevScoreMap.set(pd.player_id, pd.trust_score));
      } catch { /* no previous data is ok */ }
    }

    const thresholdCrossings: Array<{ userId: string; playerId: string; newScore: number; newLevel: string; previousScore: number }> = [];
    const lowScoreUsers: Array<{ userId: string; score: number }> = [];

    const getLevelStr = (s: number) => s >= 80 ? 'verified' : s >= 65 ? 'high' : s >= 45 ? 'medium' : s >= 25 ? 'low' : 'suspicious';

    for (const r of results) {
      const prevScore = prevScoreMap.get(r.player_id);
      const newLevel = getLevelStr(r.trust_score);

      // Detect upward threshold crossings (notify user)
      if (prevScore !== undefined && prevScore < r.trust_score) {
        const prevLevel = getLevelStr(prevScore);
        // Notify when crossing into 'high' (65+) or 'verified' (80+)
        if ((newLevel === 'high' && prevLevel !== 'high' && prevLevel !== 'verified') ||
            (newLevel === 'verified' && prevLevel !== 'verified')) {
          thresholdCrossings.push({
            userId: r.user_id,
            playerId: r.player_id,
            newScore: r.trust_score,
            newLevel,
            previousScore: prevScore,
          });
        }
      }

      // Collect users with score < 50 for weekly tips
      if (r.trust_score < 50) {
        lowScoreUsers.push({ userId: r.user_id, score: r.trust_score });
      }

      const { error: upsertError } = await supabaseClient
        .from('suspicious_players')
        .upsert({
          player_id: r.player_id,
          user_id: r.user_id,
          trust_score: r.trust_score,
          flags: r.flags,
          details: r.details,
          status: r.trust_score < 25 ? 'flagged' : r.trust_score < 50 ? 'watch' : 'ok',
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id' });

      if (upsertError) {
        console.error(`[detect-suspicious] Upsert error for ${r.player_id}:`, upsertError.message);
      }
    }

    // Send push notifications for threshold crossings
    if (thresholdCrossings.length > 0) {
      console.log(`[detect-suspicious] ${thresholdCrossings.length} threshold crossing(s) detected`);
      for (const tc of thresholdCrossings) {
        try {
          const supabaseAnon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
          // Use service role to invoke send-push internally
          const { data: tokens } = await supabaseClient
            .from('push_tokens')
            .select('token')
            .eq('user_id', tc.userId)
            .eq('active', true);

          if (tokens && tokens.length > 0) {
            const levelLabels: Record<string, string> = { verified: 'Verifie', high: 'Fiable', medium: 'Standard' };
            const label = levelLabels[tc.newLevel] || tc.newLevel;
            // Import push helpers - use inline fetch to Expo Push API
            const pushMessages = tokens.map((t: any) => ({
              to: t.token,
              title: '\u{1F6E1}\uFE0F Score de confiance ameliore !',
              body: `Votre score est passe a ${tc.newScore}/100 (${label}). Bravo !`,
              data: { type: 'trust_score_improved', newScore: tc.newScore, newLevel: tc.newLevel },
              channelId: 'tournament-reminders',
            }));
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(pushMessages),
            });
          }
        } catch (e) {
          console.error(`[detect-suspicious] Error sending trust score notification:`, e);
        }
      }
    }

    // ============================================
    // ADMIN PUSH NOTIFICATIONS FOR DELETION ALERTS
    // ============================================
    const deletionAlertPlayers = results.filter(r => {
      const da = r.details.deletionAnalysis;
      return da && (da.recentDeletedLost7d >= 3 || da.deletedLostMatches >= 5);
    });

    if (deletionAlertPlayers.length > 0) {
      console.log(`[detect-suspicious] ${deletionAlertPlayers.length} deletion alert(s) - notifying admins`);
      try {
        const { data: admins } = await supabaseClient
          .from('user_profiles')
          .select('id')
          .eq('is_admin', true);

        if (admins && admins.length > 0) {
          const adminIds = admins.map((a: any) => a.id);
          const { data: adminTokens } = await supabaseClient
            .from('push_tokens')
            .select('token, user_id')
            .in('user_id', adminIds)
            .eq('active', true);

          if (adminTokens && adminTokens.length > 0) {
            const totalAlerts = deletionAlertPlayers.length;
            const totalAvoided = deletionAlertPlayers.reduce((sum, p) => sum + (p.details.deletionAnalysis?.avoidedEloLoss || 0), 0);
            const topNames: string[] = [];
            for (const dp of deletionAlertPlayers.slice(0, 3)) {
              try {
                const { data: pInfo } = await supabaseClient
                  .from('players')
                  .select('name')
                  .eq('id', dp.player_id)
                  .single();
                if (pInfo?.name) topNames.push(pInfo.name);
              } catch { /* skip */ }
            }
            const namesStr = topNames.length > 0 ? topNames.join(', ') : 'Joueurs suspects';

            const pushMessages = adminTokens.map((t: any) => ({
              to: t.token,
              title: `\u26A0\uFE0F ${totalAlerts} alerte(s) suppression de defaites`,
              body: `${namesStr} - ${totalAvoided} pts ELO evites au total. Verifiez dans Anti-triche.`,
              data: { type: 'admin_deletion_alert', count: totalAlerts, totalAvoided },
              channelId: 'tournament-reminders',
            }));

            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(pushMessages),
            });
            console.log(`[detect-suspicious] Sent deletion alerts to ${adminTokens.length} admin tokens`);
          }
        }
      } catch (e) {
        console.error(`[detect-suspicious] Error sending deletion alert to admins:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: players.length,
        flagged: results.filter(r => r.trust_score < 50).length,
        results: mode === 'self' ? results.map(r => ({
          playerId: r.player_id,
          trustScore: r.trust_score,
          flags: r.flags,
          details: r.details,
        })) : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[detect-suspicious] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
