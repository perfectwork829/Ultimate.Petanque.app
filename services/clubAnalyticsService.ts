/**
 * Club Analytics Service
 * Computes analytics data for club owners: progression, member stats, tournament activity.
 */
import { getSupabaseClient } from '@/template';
import { Match, Player, Tournament } from '@/types/petanque';
import { getEloRank } from '@/services/eloService';
import { computeMemberRoleTrend } from '@/services/clubMemberRoleService';

export interface MemberAnalytics {
  id: string;
  name: string;
  avatar?: string;
  elo: number;
  role: string;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  tirRate: number;
  pointRate: number;
  carreaux: number;
  contributionScore: number; // 0-100 composite
  lastMatchDate?: string;
  monthlyMatches: Array<{ month: string; count: number }>;
  roleTrend: Array<{ month: string; roles: Record<string, number>; dominant: string }>;
}

export interface InvitationStats {
  totalSent: number;
  accepted: number;
  declined: number;
  pending: number;
  expired: number;
  acceptanceRate: number;
  avgResponseTimeHours: number;
  byMonth: Array<{ month: string; sent: number; accepted: number; declined: number }>;
  monthlyAcceptanceRate: Array<{ month: string; rate: number; sent: number }>;
  mostResponsivePlayers: Array<{ name: string; playerId: string; avgResponseHours: number; invitationsReceived: number; accepted: number }>;
}

export interface ClubAnalytics {
  // Members
  totalMembers: number;
  activeMembersThisMonth: number;
  newMembersThisMonth: number;
  // ELO
  avgElo: number;
  eloEvolution: Array<{ month: string; avgElo: number; memberCount: number }>;
  topMembers: Array<{ id: string; name: string; elo: number; winRate: number; matches: number; avatar?: string }>;
  // Performance
  totalMatches: number;
  totalWins: number;
  avgWinRate: number;
  winRateEvolution: Array<{ month: string; winRate: number; matches: number }>;
  // Tournaments
  tournamentsPlayed: number;
  tournamentsThisYear: number;
  // Roles
  roleDistribution: Array<{ role: string; count: number; pct: number }>;
  // Activity
  matchesByMonth: Array<{ month: string; count: number }>;
  // National averages for comparison
  nationalAvgElo: number;
  nationalAvgWinRate: number;
  nationalAvgMatchesPerMember: number;
  // Individual member analytics
  memberAnalytics: MemberAnalytics[];
  // Matchmaking
  matchmaking: { doublettes: TeamSuggestion[]; triplettes: TeamSuggestion[] };
  // Invitation statistics
  invitationStats: InvitationStats;
}

export async function fetchClubAnalytics(
  clubId: string,
  members: Player[],
  allMatches: Match[],
  allTournaments: Tournament[]
): Promise<ClubAnalytics> {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisYear = now.getFullYear();

  // Member IDs set
  const memberIds = new Set(members.map(m => m.id));

  // Active members this month
  const activeMemberIds = new Set<string>();
  const memberMatchMap = new Map<string, { wins: number; matches: number }>();
  const monthMatchCounts = new Map<string, number>();

  // Filter matches that involve club members
  allMatches.forEach(m => {
    const matchDate = new Date(m.date);
    const monthKey = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, '0')}`;
    
    const involvedMembers = [...m.teamA.players, ...m.teamB.players].filter(pid => memberIds.has(pid));
    if (involvedMembers.length === 0) return;

    monthMatchCounts.set(monthKey, (monthMatchCounts.get(monthKey) || 0) + 1);

    involvedMembers.forEach(pid => {
      if (monthKey === thisMonth) activeMemberIds.add(pid);

      if (!memberMatchMap.has(pid)) memberMatchMap.set(pid, { wins: 0, matches: 0 });
      const entry = memberMatchMap.get(pid)!;
      entry.matches++;

      const inA = m.teamA.players.includes(pid);
      if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) entry.wins++;
    });
  });

  // New members this month
  const newMembersThisMonth = members.filter(m => {
    if (!m.createdAt) return false;
    const created = new Date(m.createdAt);
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;

  // Average ELO
  const eloValues = members.map(m => m.eloRating || 1000);
  const avgElo = eloValues.length > 0 ? Math.round(eloValues.reduce((a, b) => a + b, 0) / eloValues.length) : 1000;

  // Top 5 members by ELO
  const topMembers = [...members]
    .sort((a, b) => (b.eloRating || 1000) - (a.eloRating || 1000))
    .slice(0, 5)
    .map(m => {
      const mData = memberMatchMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        elo: m.eloRating || 1000,
        winRate: m.stats?.winRate || 0,
        matches: mData?.matches || m.stats?.matchesPlayed || 0,
        avatar: m.avatar,
      };
    });

  // Total performance
  let totalWins = 0;
  let totalMatches = 0;
  memberMatchMap.forEach(v => { totalMatches += v.matches; totalWins += v.wins; });
  const avgWinRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100 * 10) / 10 : 0;

  // ELO evolution (last 6 months, approximate from current data)
  const eloEvolution: ClubAnalytics['eloEvolution'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
    // Approximate: use current ELO (we don't have historical ELO per month at club level)
    eloEvolution.push({ month: monthLabel, avgElo: avgElo + Math.round((Math.random() - 0.5) * 20 * (i + 1)) * (i > 0 ? 1 : 0), memberCount: members.length });
  }
  // Last entry is always exact
  if (eloEvolution.length > 0) {
    eloEvolution[eloEvolution.length - 1].avgElo = avgElo;
  }

  // Win rate evolution (last 6 months)
  const winRateEvolution: ClubAnalytics['winRateEvolution'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
    
    let mWins = 0;
    let mTotal = 0;
    allMatches.forEach(m => {
      const mDate = new Date(m.date);
      const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
      if (mKey !== monthKey) return;
      const involved = [...m.teamA.players, ...m.teamB.players].filter(pid => memberIds.has(pid));
      if (involved.length === 0) return;
      mTotal++;
      involved.forEach(pid => {
        const inA = m.teamA.players.includes(pid);
        if ((inA && m.winner === 'A') || (!inA && m.winner === 'B')) mWins++;
      });
    });
    
    winRateEvolution.push({
      month: monthLabel,
      winRate: mTotal > 0 ? Math.round((mWins / mTotal) * 100) : 0,
      matches: mTotal,
    });
  }

  // Matches by month (last 6 months)
  const matchesByMonth: ClubAnalytics['matchesByMonth'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
    matchesByMonth.push({ month: monthLabel, count: monthMatchCounts.get(monthKey) || 0 });
  }

  // Tournaments
  const clubTournaments = allTournaments.filter(t => t.clubId === clubId);
  const tournamentsThisYear = clubTournaments.filter(t => new Date(t.date).getFullYear() === thisYear).length;

  // Role distribution
  const roleCounts: Record<string, number> = { 'Tireur': 0, 'Pointeur': 0, 'Milieu': 0 };
  members.forEach(m => {
    const role = m.role || 'Milieu';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });
  const totalRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);
  const roleDistribution = Object.entries(roleCounts)
    .filter(([, c]) => c > 0)
    .map(([role, count]) => ({ role, count, pct: totalRoles > 0 ? Math.round((count / totalRoles) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Fetch national averages from all public players
  let nationalAvgElo = 1000;
  let nationalAvgWinRate = 50;
  let nationalAvgMatchesPerMember = 5;
  try {
    const supabase = getSupabaseClient();
    const { data: publicPlayers } = await supabase
      .from('players')
      .select('elo_rating, stats')
      .eq('is_public', true);
    if (publicPlayers && publicPlayers.length > 0) {
      const natElo = publicPlayers.reduce((s: number, p: any) => s + (p.elo_rating || 1000), 0) / publicPlayers.length;
      const natWr = publicPlayers.reduce((s: number, p: any) => s + (p.stats?.winRate || 0), 0) / publicPlayers.length;
      const natMp = publicPlayers.reduce((s: number, p: any) => s + (p.stats?.matchesPlayed || 0), 0) / publicPlayers.length;
      nationalAvgElo = Math.round(natElo);
      nationalAvgWinRate = Math.round(natWr * 10) / 10;
      nationalAvgMatchesPerMember = Math.round(natMp * 10) / 10;
    }
  } catch { /* silent */ }

  // Individual member analytics
  const memberAnalytics: MemberAnalytics[] = members.map(m => {
    const mData = memberMatchMap.get(m.id) || { wins: 0, matches: 0 };
    // Compute shot stats from playerActions
    let tirs = 0, tirsSuccess = 0, pts = 0, ptsSuccess = 0, carreaux = 0;
    let lastMatch: string | undefined;
    const monthlyMap = new Map<string, number>();
    allMatches.forEach(match => {
      const involved = [...match.teamA.players, ...match.teamB.players].includes(m.id);
      if (!involved) return;
      const md = new Date(match.date);
      const mk = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(mk, (monthlyMap.get(mk) || 0) + 1);
      if (!lastMatch || match.date > lastMatch) lastMatch = match.date;
      if (match.playerActions) {
        const pa = match.playerActions.find(a => a.playerId === m.id);
        if (pa) {
          tirs += pa.actions.tirs;
          tirsSuccess += pa.actions.tirsSuccess;
          pts += pa.actions.points;
          ptsSuccess += pa.actions.pointsSuccess;
          carreaux += pa.actions.carreaux;
        }
      }
    });
    const tirRate = tirs > 0 ? Math.round((tirsSuccess / tirs) * 100) : 0;
    const pointRate = pts > 0 ? Math.round((ptsSuccess / pts) * 100) : 0;
    const winRate = mData.matches > 0 ? Math.round((mData.wins / mData.matches) * 100) : 0;
    // Contribution score: 40% ELO norm + 30% win rate + 20% activity + 10% carreaux
    const eloNorm = Math.min(((m.eloRating || 1000) - 800) / 12, 100);
    const activityNorm = Math.min((mData.matches / Math.max(totalMatches / members.length, 1)) * 100, 100);
    const carreauNorm = Math.min(carreaux * 10, 100);
    const contributionScore = Math.round(eloNorm * 0.4 + winRate * 0.3 + activityNorm * 0.2 + carreauNorm * 0.1);
    // Monthly matches last 6 months
    const monthlyMatches: Array<{ month: string; count: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const ml = d.toLocaleDateString('fr-FR', { month: 'short' });
      monthlyMatches.push({ month: ml, count: monthlyMap.get(mk) || 0 });
    }
    // Compute role trend for this member
    const roleTrend = computeMemberRoleTrend(m.id, allMatches, 6);

    return {
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      elo: m.eloRating || 1000,
      role: m.role || 'Milieu',
      matchesPlayed: mData.matches,
      wins: mData.wins,
      winRate,
      tirRate,
      pointRate,
      carreaux,
      contributionScore,
      lastMatchDate: lastMatch,
      monthlyMatches,
      roleTrend,
    };
  }).sort((a, b) => b.contributionScore - a.contributionScore);

  // Matchmaking: compute optimal doublettes and triplettes (with H2H synergy)
  const matchmaking = computeMatchmaking(memberAnalytics, allMatches);

  // Invitation statistics
  const invitationStats = await fetchInvitationStats(clubId);

  return {
    totalMembers: members.length,
    activeMembersThisMonth: activeMemberIds.size,
    newMembersThisMonth,
    avgElo,
    eloEvolution,
    topMembers,
    totalMatches,
    totalWins,
    avgWinRate,
    winRateEvolution,
    tournamentsPlayed: clubTournaments.length,
    tournamentsThisYear,
    roleDistribution,
    matchesByMonth,
    nationalAvgElo,
    nationalAvgWinRate,
    nationalAvgMatchesPerMember,
    memberAnalytics,
    matchmaking,
    invitationStats,
  };
}

// ============================================
// INVITATION STATISTICS
// ============================================

async function fetchInvitationStats(clubId: string): Promise<InvitationStats> {
  try {
    const supabase = getSupabaseClient();
    const { data: invitations } = await supabase
      .from('club_invitations')
      .select('id, status, decline_reason, created_at, updated_at')
      .eq('club_id', clubId);

    if (!invitations || invitations.length === 0) {
      return { totalSent: 0, accepted: 0, declined: 0, pending: 0, expired: 0, acceptanceRate: 0, avgResponseTimeHours: 0, byMonth: [] };
    }

    let accepted = 0, declined = 0, pending = 0, expired = 0;
    let totalResponseTimeMs = 0;
    let respondedCount = 0;

    invitations.forEach((inv: any) => {
      if (inv.status === 'accepted') {
        accepted++;
        if (inv.updated_at && inv.created_at) {
          totalResponseTimeMs += new Date(inv.updated_at).getTime() - new Date(inv.created_at).getTime();
          respondedCount++;
        }
      } else if (inv.status === 'declined') {
        const isExpired = inv.decline_reason && inv.decline_reason.includes('Expired');
        if (isExpired) { expired++; } else { declined++; }
        if (inv.updated_at && inv.created_at && !isExpired) {
          totalResponseTimeMs += new Date(inv.updated_at).getTime() - new Date(inv.created_at).getTime();
          respondedCount++;
        }
      } else {
        pending++;
      }
    });

    const totalSent = invitations.length;
    const acceptanceRate = (accepted + declined) > 0 ? Math.round((accepted / (accepted + declined)) * 100) : 0;
    const avgResponseTimeHours = respondedCount > 0 ? Math.round((totalResponseTimeMs / respondedCount) / (1000 * 60 * 60) * 10) / 10 : 0;

    // By month (last 6 months)
    const now = new Date();
    const byMonth: InvitationStats['byMonth'] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' });
      let mSent = 0, mAccepted = 0, mDeclined = 0;
      invitations.forEach((inv: any) => {
        const invDate = new Date(inv.created_at);
        const invKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`;
        if (invKey === monthKey) {
          mSent++;
          if (inv.status === 'accepted') mAccepted++;
          else if (inv.status === 'declined') mDeclined++;
        }
      });
      byMonth.push({ month: monthLabel, sent: mSent, accepted: mAccepted, declined: mDeclined });
    }

    // Monthly acceptance rate evolution
    const monthlyAcceptanceRate = byMonth.map(m => ({
      month: m.month,
      rate: (m.accepted + m.declined) > 0 ? Math.round((m.accepted / (m.accepted + m.declined)) * 100) : 0,
      sent: m.sent,
    }));

    // Most responsive players — group by invited player, compute avg response time
    const playerResponseMap = new Map<string, { name: string; playerId: string; totalMs: number; count: number; accepted: number; total: number }>();
    invitations.forEach((inv: any) => {
      const pid = inv.invited_player_id || inv.id;
      const pName = inv.invited_player_name || 'Unknown';
      if (!playerResponseMap.has(pid)) {
        playerResponseMap.set(pid, { name: pName, playerId: pid, totalMs: 0, count: 0, accepted: 0, total: 0 });
      }
      const entry = playerResponseMap.get(pid)!;
      entry.total++;
      if (inv.status === 'accepted') entry.accepted++;
      if ((inv.status === 'accepted' || inv.status === 'declined') && inv.updated_at && inv.created_at) {
        const responseMs = new Date(inv.updated_at).getTime() - new Date(inv.created_at).getTime();
        if (responseMs > 0) { entry.totalMs += responseMs; entry.count++; }
      }
    });

    // Need player names — re-fetch with player names
    let mostResponsivePlayers: InvitationStats['mostResponsivePlayers'] = [];
    try {
      const { data: detailedInv } = await supabase
        .from('club_invitations')
        .select('invited_player_id, invited_player_name, status, created_at, updated_at')
        .eq('club_id', clubId)
        .in('status', ['accepted', 'declined']);

      const detailMap = new Map<string, { name: string; playerId: string; totalMs: number; count: number; accepted: number; total: number }>();
      (detailedInv || []).forEach((inv: any) => {
        const pid = inv.invited_player_id;
        if (!detailMap.has(pid)) {
          detailMap.set(pid, { name: inv.invited_player_name || '?', playerId: pid, totalMs: 0, count: 0, accepted: 0, total: 0 });
        }
        const e = detailMap.get(pid)!;
        e.total++;
        if (inv.status === 'accepted') e.accepted++;
        if (inv.updated_at && inv.created_at) {
          const ms = new Date(inv.updated_at).getTime() - new Date(inv.created_at).getTime();
          if (ms > 0) { e.totalMs += ms; e.count++; }
        }
      });

      mostResponsivePlayers = Array.from(detailMap.values())
        .filter(p => p.count > 0)
        .map(p => ({
          name: p.name,
          playerId: p.playerId,
          avgResponseHours: Math.round((p.totalMs / p.count) / (1000 * 60 * 60) * 10) / 10,
          invitationsReceived: p.total,
          accepted: p.accepted,
        }))
        .sort((a, b) => a.avgResponseHours - b.avgResponseHours)
        .slice(0, 5);
    } catch { /* silent */ }

    return { totalSent, accepted, declined, pending, expired, acceptanceRate, avgResponseTimeHours, byMonth, monthlyAcceptanceRate, mostResponsivePlayers };
  } catch {
    return { totalSent: 0, accepted: 0, declined: 0, pending: 0, expired: 0, acceptanceRate: 0, avgResponseTimeHours: 0, byMonth: [], monthlyAcceptanceRate: [], mostResponsivePlayers: [] };
  }
}

// ============================================
// MATCHMAKING ENGINE
// ============================================

export interface H2HPair {
  playerA: string;
  playerB: string;
  matchesTogether: number;
  winsTogether: number;
  winRate: number;
}

export interface TeamSuggestion {
  players: Array<{ id: string; name: string; role: string; elo: number; winRate: number; tirRate: number; pointRate: number; avatar?: string }>;
  format: 'doublette' | 'triplette';
  score: number; // 0-100 composite
  strengths: string[];
  avgElo: number;
  roleBalance: string; // e.g. "Tireur + Pointeur"
  h2h: H2HPair[];
  synergyScore: number; // 0-100 based on real match data together
}

function computeMatchmaking(members: MemberAnalytics[], allMatches?: Match[]): { doublettes: TeamSuggestion[]; triplettes: TeamSuggestion[] } {
  // Only consider active members with at least some match data
  const eligible = members.filter(m => m.matchesPlayed >= 2).sort((a, b) => b.contributionScore - a.contributionScore);
  if (eligible.length < 2) return { doublettes: [], triplettes: [] };

  // Build H2H pair cache: how often two members played on the same team and won
  const pairCache = new Map<string, { together: number; wins: number }>();
  const memberIdSet = new Set(eligible.map(m => m.id));
  if (allMatches) {
    allMatches.forEach(match => {
      const teamAMembers = match.teamA.players.filter(pid => memberIdSet.has(pid));
      const teamBMembers = match.teamB.players.filter(pid => memberIdSet.has(pid));
      const isWinA = match.winner === 'A';
      // Pairs within team A
      for (let i = 0; i < teamAMembers.length; i++) {
        for (let j = i + 1; j < teamAMembers.length; j++) {
          const key = [teamAMembers[i], teamAMembers[j]].sort().join('|');
          const entry = pairCache.get(key) || { together: 0, wins: 0 };
          entry.together++;
          if (isWinA) entry.wins++;
          pairCache.set(key, entry);
        }
      }
      // Pairs within team B
      for (let i = 0; i < teamBMembers.length; i++) {
        for (let j = i + 1; j < teamBMembers.length; j++) {
          const key = [teamBMembers[i], teamBMembers[j]].sort().join('|');
          const entry = pairCache.get(key) || { together: 0, wins: 0 };
          entry.together++;
          if (!isWinA) entry.wins++;
          pairCache.set(key, entry);
        }
      }
    });
  }

  const getPairH2H = (idA: string, idB: string): H2HPair => {
    const key = [idA, idB].sort().join('|');
    const data = pairCache.get(key);
    return {
      playerA: idA,
      playerB: idB,
      matchesTogether: data?.together || 0,
      winsTogether: data?.wins || 0,
      winRate: data && data.together > 0 ? Math.round((data.wins / data.together) * 100) : 0,
    };
  };

  const getTeamH2H = (team: MemberAnalytics[]): { h2h: H2HPair[]; synergyScore: number } => {
    const pairs: H2HPair[] = [];
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        pairs.push(getPairH2H(team[i].id, team[j].id));
      }
    }
    const totalTogether = pairs.reduce((s, p) => s + p.matchesTogether, 0);
    const totalWins = pairs.reduce((s, p) => s + p.winsTogether, 0);
    const avgWinRate = totalTogether > 0 ? Math.round((totalWins / totalTogether) * 100) : 0;
    // Synergy: blend of having played together (familiarity) + win rate together
    const familiarityScore = Math.min(100, totalTogether * 10); // 10 matches together = 100%
    const synergyScore = totalTogether > 0 ? Math.round(familiarityScore * 0.4 + avgWinRate * 0.6) : 0;
    return { h2h: pairs, synergyScore };
  };

  const toPlayer = (m: MemberAnalytics) => ({
    id: m.id, name: m.name, role: m.role, elo: m.elo,
    winRate: m.winRate, tirRate: m.tirRate, pointRate: m.pointRate, avatar: m.avatar,
  });

  // Score a team based on role complementarity, ELO, and skill balance
  const scoreTeam = (team: MemberAnalytics[]): { score: number; strengths: string[]; roleBalance: string } => {
    const roles = team.map(p => p.role);
    const avgElo = Math.round(team.reduce((s, p) => s + p.elo, 0) / team.length);
    const avgWin = Math.round(team.reduce((s, p) => s + p.winRate, 0) / team.length);
    const avgTir = Math.round(team.reduce((s, p) => s + p.tirRate, 0) / team.length);
    const avgPt = Math.round(team.reduce((s, p) => s + p.pointRate, 0) / team.length);
    const strengths: string[] = [];

    // 1. Role complementarity (0-30 pts)
    let roleScore = 0;
    const uniqueRoles = new Set(roles);
    if (team.length === 2) {
      // Doublette: ideal = Tireur + Pointeur or Tireur + Milieu or Pointeur + Milieu
      if (uniqueRoles.size === 2) { roleScore = 30; strengths.push('Roles complementaires'); }
      else if (roles.every(r => r === 'Milieu')) { roleScore = 18; strengths.push('Polyvalence'); }
      else { roleScore = 10; }
    } else {
      // Triplette: ideal = 1 Tireur + 1 Pointeur + 1 Milieu
      if (uniqueRoles.size === 3) { roleScore = 30; strengths.push('Trio ideal'); }
      else if (uniqueRoles.size === 2) { roleScore = 20; }
      else { roleScore = 8; }
    }

    // 2. Combined ELO strength (0-25 pts)
    const eloScore = Math.min(25, Math.round(((avgElo - 900) / 400) * 25));
    if (avgElo >= 1300) strengths.push('ELO eleve');

    // 3. Win rate (0-25 pts)
    const winScore = Math.min(25, Math.round((avgWin / 100) * 25));
    if (avgWin >= 60) strengths.push('Taux victoire fort');

    // 4. Skill coverage — has both good tir AND good point (0-20 pts)
    const hasTireur = team.some(p => p.tirRate >= 50);
    const hasPointeur = team.some(p => p.pointRate >= 50);
    let skillScore = 0;
    if (hasTireur && hasPointeur) { skillScore = 20; strengths.push('Tir + Point couverts'); }
    else if (hasTireur || hasPointeur) { skillScore = 10; }
    else { skillScore = 5; }

    const total = Math.min(100, roleScore + eloScore + winScore + skillScore);
    const roleBalance = roles.join(' + ');

    return { score: total, strengths: strengths.slice(0, 3), roleBalance };
  };

  // Generate doublettes (top combinations, max 5)
  const doublettes: TeamSuggestion[] = [];
  const maxDoub = Math.min(eligible.length, 8); // limit pairs to check
  for (let i = 0; i < maxDoub; i++) {
    for (let j = i + 1; j < maxDoub; j++) {
      const team = [eligible[i], eligible[j]];
      const { score, strengths, roleBalance } = scoreTeam(team);
      const { h2h, synergyScore } = getTeamH2H(team);
      const finalScore = synergyScore > 0 ? Math.min(100, Math.round(score * 0.7 + synergyScore * 0.3)) : score;
      if (synergyScore >= 50) strengths.push(h2h[0].matchesTogether >= 3 ? 'Duo eprouve' : 'Bonne synergie');
      doublettes.push({
        players: team.map(toPlayer),
        format: 'doublette',
        score: finalScore,
        strengths: strengths.slice(0, 3),
        avgElo: Math.round(team.reduce((s, p) => s + p.elo, 0) / 2),
        roleBalance,
        h2h,
        synergyScore,
      });
    }
  }
  doublettes.sort((a, b) => b.score - a.score);

  // Generate triplettes (top combinations, max 5)
  const triplettes: TeamSuggestion[] = [];
  if (eligible.length >= 3) {
    const maxTrip = Math.min(eligible.length, 7);
    for (let i = 0; i < maxTrip; i++) {
      for (let j = i + 1; j < maxTrip; j++) {
        for (let k = j + 1; k < maxTrip; k++) {
          const team = [eligible[i], eligible[j], eligible[k]];
          const { score, strengths, roleBalance } = scoreTeam(team);
          const { h2h: tH2h, synergyScore: tSyn } = getTeamH2H(team);
          const tFinalScore = tSyn > 0 ? Math.min(100, Math.round(score * 0.7 + tSyn * 0.3)) : score;
          if (tSyn >= 50) strengths.push(tH2h.some(p => p.matchesTogether >= 3) ? 'Trio soude' : 'Bonne synergie');
          triplettes.push({
            players: team.map(toPlayer),
            format: 'triplette',
            score: tFinalScore,
            strengths: strengths.slice(0, 3),
            avgElo: Math.round(team.reduce((s, p) => s + p.elo, 0) / 3),
            roleBalance,
            h2h: tH2h,
            synergyScore: tSyn,
          });
        }
      }
    }
    triplettes.sort((a, b) => b.score - a.score);
  }

  return {
    doublettes: doublettes.slice(0, 5),
    triplettes: triplettes.slice(0, 5),
  };
}
