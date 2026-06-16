/**
 * Role Analysis Service
 *
 * Analyzes historical match data to determine optimal roles for players
 * and provides per-role performance breakdowns.
 */

import { Match, PlayerAction } from '@/types/petanque';

export type PlayerRoleType = 'Pointeur' | 'Milieu' | 'Tireur';

export interface RolePerformance {
  role: PlayerRoleType;
  matchCount: number;
  tirs: number;
  tirsSuccess: number;
  points: number;
  pointsSuccess: number;
  carreaux: number;
  tirRate: number;
  pointRate: number;
  carreauRate: number;
  score: number; // 0-100 compatibility score
}

export interface RoleSuggestion {
  bestRole: PlayerRoleType;
  confidence: number; // 0-100
  performances: RolePerformance[];
  reason: string;
}

/**
 * Analyze a player's historical performance per role across all matches
 */
export function analyzePlayerRoles(
  playerId: string,
  matches: Match[],
  language: string = 'fr'
): RoleSuggestion | null {
  const fr = language === 'fr';
  const roleStats: Record<PlayerRoleType, {
    matchCount: number;
    tirs: number;
    tirsSuccess: number;
    points: number;
    pointsSuccess: number;
    carreaux: number;
  }> = {
    Pointeur: { matchCount: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
    Milieu: { matchCount: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
    Tireur: { matchCount: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
  };

  let totalMatchesWithRole = 0;

  for (const match of matches) {
    // Find what role this player had in this match
    let playerRole: PlayerRoleType | null = null;
    const teamARoleEntry = match.teamA.playerRoles?.find(r => r.playerId === playerId);
    const teamBRoleEntry = match.teamB.playerRoles?.find(r => r.playerId === playerId);
    if (teamARoleEntry) playerRole = teamARoleEntry.role as PlayerRoleType;
    else if (teamBRoleEntry) playerRole = teamBRoleEntry.role as PlayerRoleType;

    if (!playerRole) continue;

    // Find player actions in this match
    const pa = match.playerActions?.find(a => a.playerId === playerId);
    if (!pa) {
      roleStats[playerRole].matchCount++;
      totalMatchesWithRole++;
      continue;
    }

    roleStats[playerRole].matchCount++;
    roleStats[playerRole].tirs += pa.actions.tirs;
    roleStats[playerRole].tirsSuccess += pa.actions.tirsSuccess;
    roleStats[playerRole].points += pa.actions.points;
    roleStats[playerRole].pointsSuccess += pa.actions.pointsSuccess;
    roleStats[playerRole].carreaux += pa.actions.carreaux;
    totalMatchesWithRole++;
  }

  // Also check role segments stored in player actions
  for (const match of matches) {
    const pa = match.playerActions?.find(a => a.playerId === playerId);
    if (!pa || !(pa as any).roleSegments) continue;
    const segments = (pa as any).roleSegments as { role: PlayerRoleType; actions: typeof pa.actions }[];
    for (const seg of segments) {
      if (!roleStats[seg.role]) continue;
      // These are already counted in the main actions, so we skip double-counting
      // Role segments are for display within a single match
    }
  }

  if (totalMatchesWithRole < 2) return null;

  // Compute per-role performance scores
  const performances: RolePerformance[] = (['Pointeur', 'Milieu', 'Tireur'] as PlayerRoleType[]).map(role => {
    const rs = roleStats[role];
    const tirRate = rs.tirs > 0 ? Math.round((rs.tirsSuccess / rs.tirs) * 100) : 0;
    const pointRate = rs.points > 0 ? Math.round((rs.pointsSuccess / rs.points) * 100) : 0;
    const carreauRate = rs.tirs > 0 ? Math.round((rs.carreaux / rs.tirs) * 100) : 0;

    // Score computation based on role expectations
    let score = 0;
    if (role === 'Tireur') {
      // Tireur: heavy weight on tir success and carreaux
      score = tirRate * 0.6 + carreauRate * 0.25 + pointRate * 0.15;
    } else if (role === 'Pointeur') {
      // Pointeur: heavy weight on point success
      score = pointRate * 0.6 + tirRate * 0.25 + carreauRate * 0.15;
    } else {
      // Milieu: balanced
      score = tirRate * 0.4 + pointRate * 0.4 + carreauRate * 0.2;
    }

    // Boost score if enough data (confidence factor)
    const dataFactor = Math.min(1, rs.matchCount / 5);
    score = Math.round(score * dataFactor);

    return {
      role,
      matchCount: rs.matchCount,
      tirs: rs.tirs,
      tirsSuccess: rs.tirsSuccess,
      points: rs.points,
      pointsSuccess: rs.pointsSuccess,
      carreaux: rs.carreaux,
      tirRate,
      pointRate,
      carreauRate,
      score: Math.min(100, Math.max(0, score)),
    };
  });

  // Sort by score descending
  const sorted = [...performances].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (best.matchCount === 0 && sorted[1].matchCount === 0) return null;

  // Confidence based on data volume and score gap
  const scoreGap = best.score - (sorted[1]?.score || 0);
  const dataVolume = Math.min(100, totalMatchesWithRole * 10);
  const confidence = Math.min(100, Math.round((scoreGap * 0.6 + dataVolume * 0.4)));

  // Generate reason
  let reason = '';
  if (best.role === 'Tireur') {
    reason = fr
      ? `${best.tirRate}% reussite au tir sur ${best.matchCount} match(s)`
      : `${best.tirRate}% shot success over ${best.matchCount} match(es)`;
  } else if (best.role === 'Pointeur') {
    reason = fr
      ? `${best.pointRate}% reussite au point sur ${best.matchCount} match(s)`
      : `${best.pointRate}% point success over ${best.matchCount} match(es)`;
  } else {
    reason = fr
      ? `Polyvalent: ${best.tirRate}% tir, ${best.pointRate}% point`
      : `Versatile: ${best.tirRate}% shot, ${best.pointRate}% point`;
  }

  return {
    bestRole: best.role,
    confidence,
    performances: sorted,
    reason,
  };
}

/**
 * Get role suggestion color based on confidence
 */
export function getSuggestionColor(confidence: number): string {
  if (confidence >= 70) return '#10B981';
  if (confidence >= 40) return '#D97706';
  return '#94A3B8';
}

/**
 * Get role icon name
 */
export function getRoleIcon(role: PlayerRoleType): string {
  switch (role) {
    case 'Tireur': return 'gps-fixed';
    case 'Pointeur': return 'adjust';
    case 'Milieu': return 'swap-horiz';
    default: return 'person';
  }
}

/**
 * Get role color
 */
export function getRoleColor(role: PlayerRoleType): string {
  switch (role) {
    case 'Tireur': return '#F97316';
    case 'Pointeur': return '#3B82F6';
    case 'Milieu': return '#8B5CF6';
    default: return '#64748B';
  }
}

// ============================================
// HEAD-TO-HEAD ROLE ANALYSIS
// ============================================

export interface H2HRoleData {
  role: PlayerRoleType;
  player1: { matches: number; tirs: number; tirsSuccess: number; points: number; pointsSuccess: number; carreaux: number; tirRate: number; pointRate: number };
  player2: { matches: number; tirs: number; tirsSuccess: number; points: number; pointsSuccess: number; carreaux: number; tirRate: number; pointRate: number };
}

export interface HeadToHeadRoleResult {
  totalMatches: number;
  player1Wins: number;
  player2Wins: number;
  roles: H2HRoleData[];
  recommendation: string;
}

/**
 * Compare two players' performance per role from their shared matches.
 */
export function computeHeadToHeadRoleAnalysis(
  player1Id: string,
  player2Id: string,
  matches: Match[],
  language: string = 'fr'
): HeadToHeadRoleResult | null {
  const fr = language === 'fr';
  // Find all matches where both players participated
  const sharedMatches = matches.filter(m => {
    const allPlayers = [...m.teamA.players, ...m.teamB.players];
    return allPlayers.includes(player1Id) && allPlayers.includes(player2Id);
  });

  if (sharedMatches.length === 0) return null;

  let p1Wins = 0, p2Wins = 0;
  const roleAgg: Record<PlayerRoleType, { p1: { m: number; t: number; ts: number; p: number; ps: number; c: number }; p2: { m: number; t: number; ts: number; p: number; ps: number; c: number } }> = {
    Pointeur: { p1: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 }, p2: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 } },
    Milieu: { p1: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 }, p2: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 } },
    Tireur: { p1: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 }, p2: { m: 0, t: 0, ts: 0, p: 0, ps: 0, c: 0 } },
  };

  for (const match of sharedMatches) {
    const p1InA = match.teamA.players.includes(player1Id);
    const p2InA = match.teamA.players.includes(player2Id);
    const p1Won = (p1InA && match.winner === 'A') || (!p1InA && match.winner === 'B');
    const p2Won = (p2InA && match.winner === 'A') || (!p2InA && match.winner === 'B');
    if (p1Won) p1Wins++;
    if (p2Won) p2Wins++;

    // Get roles
    const getRole = (pid: string): PlayerRoleType | null => {
      const aRole = match.teamA.playerRoles?.find(r => r.playerId === pid);
      if (aRole) return aRole.role as PlayerRoleType;
      const bRole = match.teamB.playerRoles?.find(r => r.playerId === pid);
      if (bRole) return bRole.role as PlayerRoleType;
      return null;
    };

    const p1Role = getRole(player1Id);
    const p2Role = getRole(player2Id);

    // Aggregate actions
    const addActions = (pid: string, role: PlayerRoleType, key: 'p1' | 'p2') => {
      if (!role || !roleAgg[role]) return;
      roleAgg[role][key].m++;
      const pa = match.playerActions?.find(a => a.playerId === pid);
      if (pa) {
        roleAgg[role][key].t += pa.actions.tirs;
        roleAgg[role][key].ts += pa.actions.tirsSuccess;
        roleAgg[role][key].p += pa.actions.points;
        roleAgg[role][key].ps += pa.actions.pointsSuccess;
        roleAgg[role][key].c += pa.actions.carreaux;
      }
    };

    if (p1Role) addActions(player1Id, p1Role, 'p1');
    if (p2Role) addActions(player2Id, p2Role, 'p2');
  }

  const roles: H2HRoleData[] = (['Tireur', 'Pointeur', 'Milieu'] as PlayerRoleType[]).map(role => {
    const p1 = roleAgg[role].p1;
    const p2 = roleAgg[role].p2;
    return {
      role,
      player1: {
        matches: p1.m, tirs: p1.t, tirsSuccess: p1.ts, points: p1.p, pointsSuccess: p1.ps, carreaux: p1.c,
        tirRate: p1.t > 0 ? Math.round((p1.ts / p1.t) * 100) : 0,
        pointRate: p1.p > 0 ? Math.round((p1.ps / p1.p) * 100) : 0,
      },
      player2: {
        matches: p2.m, tirs: p2.t, tirsSuccess: p2.ts, points: p2.p, pointsSuccess: p2.ps, carreaux: p2.c,
        tirRate: p2.t > 0 ? Math.round((p2.ts / p2.t) * 100) : 0,
        pointRate: p2.p > 0 ? Math.round((p2.ps / p2.p) * 100) : 0,
      },
    };
  }).filter(r => r.player1.matches > 0 || r.player2.matches > 0);

  // Generate alignment recommendation
  let recommendation = '';
  if (roles.length > 0) {
    const bestP1 = [...roles].sort((a, b) => {
      const scoreA = a.player1.tirRate * 0.5 + a.player1.pointRate * 0.5;
      const scoreB = b.player1.tirRate * 0.5 + b.player1.pointRate * 0.5;
      return scoreB - scoreA;
    })[0];
    recommendation = fr
      ? `Meilleur role en commun : ${bestP1.role} (Tir ${bestP1.player1.tirRate}% vs ${bestP1.player2.tirRate}%)`
      : `Best shared role: ${bestP1.role} (Shot ${bestP1.player1.tirRate}% vs ${bestP1.player2.tirRate}%)`;
  }

  return { totalMatches: sharedMatches.length, player1Wins: p1Wins, player2Wins: p2Wins, roles, recommendation };
}

// ============================================
// SEASONAL ROLE EVOLUTION
// ============================================

export interface SeasonalRoleData {
  period: string;
  periodLabel: string;
  startDate: Date;
  totalMatches: number;
  roles: { role: PlayerRoleType; count: number; pct: number }[];
  dominantRole: PlayerRoleType;
}

export interface RoleEvolutionResult {
  seasons: SeasonalRoleData[];
  hasEvolution: boolean;
  migrationPath: PlayerRoleType[];
  migrationSummary: string;
}

/**
 * Analyze how a player's preferred role has evolved over time.
 * Groups matches into periods (quarters, semesters, or years depending on data span)
 * and tracks the dominant role per period.
 */
export function computeSeasonalRoleEvolution(
  playerId: string,
  matches: Match[],
  language: string = 'fr'
): RoleEvolutionResult | null {
  const fr = language === 'fr';

  // Collect matches with role data
  const matchesWithRoles: { date: Date; role: PlayerRoleType }[] = [];
  for (const match of matches) {
    let playerRole: PlayerRoleType | null = null;
    const aEntry = match.teamA.playerRoles?.find(r => r.playerId === playerId);
    const bEntry = match.teamB.playerRoles?.find(r => r.playerId === playerId);
    if (aEntry) playerRole = aEntry.role as PlayerRoleType;
    else if (bEntry) playerRole = bEntry.role as PlayerRoleType;
    if (!playerRole) continue;
    matchesWithRoles.push({ date: new Date(match.date), role: playerRole });
  }

  if (matchesWithRoles.length < 3) return null;

  matchesWithRoles.sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstDate = matchesWithRoles[0].date;
  const lastDate = matchesWithRoles[matchesWithRoles.length - 1].date;
  const spanMonths = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

  // Determine granularity
  let periodMonths: number;
  if (spanMonths > 24) periodMonths = 12;
  else if (spanMonths > 12) periodMonths = 6;
  else periodMonths = 3;

  // Generate period buckets
  const periods: { start: Date; end: Date; label: string; key: string }[] = [];
  let cursor = new Date(firstDate.getFullYear(), Math.floor(firstDate.getMonth() / periodMonths) * periodMonths, 1);
  while (cursor <= lastDate) {
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + periodMonths);
    let label: string;
    if (periodMonths === 12) {
      label = `${cursor.getFullYear()}`;
    } else if (periodMonths === 6) {
      label = `${cursor.getMonth() < 6 ? 'S1' : 'S2'} ${cursor.getFullYear().toString().slice(-2)}`;
    } else {
      label = `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear().toString().slice(-2)}`;
    }
    periods.push({ start: new Date(cursor), end, label, key: `${cursor.getFullYear()}-${cursor.getMonth()}` });
    cursor = new Date(end);
  }

  // Aggregate per period
  const seasons: SeasonalRoleData[] = [];
  for (const period of periods) {
    const pm = matchesWithRoles.filter(m => m.date >= period.start && m.date < period.end);
    if (pm.length === 0) continue;
    const rc: Record<PlayerRoleType, number> = { Pointeur: 0, Milieu: 0, Tireur: 0 };
    pm.forEach(m => { rc[m.role]++; });
    const total = pm.length;
    const roles = (['Tireur', 'Pointeur', 'Milieu'] as PlayerRoleType[]).map(role => ({
      role, count: rc[role], pct: Math.round((rc[role] / total) * 100),
    }));
    const dominant = roles.reduce((a, b) => b.count > a.count ? b : a).role;
    seasons.push({ period: period.key, periodLabel: period.label, startDate: period.start, totalMatches: total, roles, dominantRole: dominant });
  }

  if (seasons.length < 2) return null;

  // Detect migration path (only when dominant role changes)
  const migrationPath: PlayerRoleType[] = [seasons[0].dominantRole];
  for (let i = 1; i < seasons.length; i++) {
    if (seasons[i].dominantRole !== migrationPath[migrationPath.length - 1]) {
      migrationPath.push(seasons[i].dominantRole);
    }
  }

  const hasEvolution = migrationPath.length > 1;
  const migrationSummary = hasEvolution
    ? migrationPath.join(' \u2192 ')
    : (fr ? 'Role stable : ' + migrationPath[0] : 'Stable role: ' + migrationPath[0]);

  return { seasons, hasEvolution, migrationPath, migrationSummary };
}

// ============================================
// ROLE EVOLUTION PDF EXPORT
// ============================================

/**
 * Generate a styled HTML document for PDF export of role evolution data.
 * Includes: migration path, stacked bar chart (SVG), detailed stats table per period.
 */
export function generateRoleEvolutionPdfHtml(
  playerName: string,
  evo: RoleEvolutionResult,
  language: string = 'fr'
): string {
  const fr = language === 'fr';
  const dateStr = new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const roleColors: Record<string, string> = { Tireur: '#F97316', Pointeur: '#3B82F6', Milieu: '#8B5CF6' };
  const roleOrder: PlayerRoleType[] = ['Tireur', 'Pointeur', 'Milieu'];

  // Migration path badges
  const migrationHtml = evo.migrationPath.map((role, i) => {
    const c = roleColors[role] || '#64748B';
    const arrow = i < evo.migrationPath.length - 1 ? '<span style="color:#9ca3af;font-size:18px;margin:0 8px">&rarr;</span>' : '';
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:${c}15;color:${c};font-weight:700;font-size:13px;padding:6px 14px;border-radius:10px;border:1px solid ${c}30">${role}</span>${arrow}`;
  }).join('');

  // SVG stacked bar chart
  const chartW = 480;
  const barH = 28;
  const barGap = 8;
  const labelW = 50;
  const chartAreaW = chartW - labelW - 40;
  const chartH = evo.seasons.length * (barH + barGap) + 10;

  let barsHtml = '';
  evo.seasons.forEach((season, sIdx) => {
    const y = sIdx * (barH + barGap);
    let xOffset = labelW;
    // Period label
    barsHtml += `<text x="0" y="${y + barH / 2 + 5}" font-size="10" fill="#6b7280" font-weight="600">${season.periodLabel}</text>`;
    // Stacked bars
    roleOrder.forEach((role) => {
      const rd = season.roles.find(r => r.role === role);
      if (!rd || rd.count === 0) return;
      const w = Math.max(3, (rd.pct / 100) * chartAreaW);
      const c = roleColors[role] || '#64748B';
      const opacity = season.dominantRole === role ? '1' : '0.5';
      barsHtml += `<rect x="${xOffset}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" fill="${c}" opacity="${opacity}"/>`;
      if (rd.pct >= 15) {
        barsHtml += `<text x="${(xOffset + w / 2).toFixed(1)}" y="${y + barH / 2 + 4}" font-size="10" fill="#FFF" font-weight="700" text-anchor="middle">${rd.pct}%</text>`;
      }
      xOffset += w;
    });
    // Match count
    barsHtml += `<text x="${chartW - 5}" y="${y + barH / 2 + 5}" font-size="9" fill="#9ca3af" font-weight="500" text-anchor="end">${season.totalMatches} ${fr ? 'matchs' : 'matches'}</text>`;
  });

  const chartSvg = `<svg width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;border:1px solid #e5e7eb;padding:8px 4px">${barsHtml}</svg>`;

  // Legend
  const legendHtml = roleOrder.map(role => {
    const c = roleColors[role];
    return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><span style="width:12px;height:12px;border-radius:3px;background:${c};display:inline-block"></span><span style="font-size:11px;font-weight:600;color:#374151">${role}</span></span>`;
  }).join('');

  // Detailed stats table
  const periodHeader = fr ? 'Periode' : 'Period';
  const matchesHeader = fr ? 'Matchs' : 'Matches';
  const dominantHeader = fr ? 'Role dominant' : 'Dominant Role';
  const tableHeaders = `<tr style="background:#f3f4f6"><th style="padding:8px 10px;text-align:left;border-bottom:2px solid #6366F1;font-size:12px;color:#374151">${periodHeader}</th><th style="padding:8px 10px;text-align:center;border-bottom:2px solid #6366F1;font-size:12px">${matchesHeader}</th><th style="padding:8px 10px;text-align:center;border-bottom:2px solid #F97316;font-size:12px">Tireur</th><th style="padding:8px 10px;text-align:center;border-bottom:2px solid #3B82F6;font-size:12px">Pointeur</th><th style="padding:8px 10px;text-align:center;border-bottom:2px solid #8B5CF6;font-size:12px">Milieu</th><th style="padding:8px 10px;text-align:left;border-bottom:2px solid #6366F1;font-size:12px">${dominantHeader}</th></tr>`;

  const tableRows = evo.seasons.map((season, idx) => {
    const dc = roleColors[season.dominantRole] || '#64748B';
    const tirData = season.roles.find(r => r.role === 'Tireur');
    const ptData = season.roles.find(r => r.role === 'Pointeur');
    const milData = season.roles.find(r => r.role === 'Milieu');
    const bgColor = idx % 2 === 0 ? '#ffffff' : '#fafafa';
    return `<tr style="background:${bgColor}"><td style="padding:7px 10px;font-weight:600;color:#374151;font-size:12px">${season.periodLabel}</td><td style="padding:7px 10px;text-align:center;font-size:12px;color:#6b7280">${season.totalMatches}</td><td style="padding:7px 10px;text-align:center;font-size:12px;font-weight:700;color:#F97316">${tirData ? `${tirData.count} (${tirData.pct}%)` : '-'}</td><td style="padding:7px 10px;text-align:center;font-size:12px;font-weight:700;color:#3B82F6">${ptData ? `${ptData.count} (${ptData.pct}%)` : '-'}</td><td style="padding:7px 10px;text-align:center;font-size:12px;font-weight:700;color:#8B5CF6">${milData ? `${milData.count} (${milData.pct}%)` : '-'}</td><td style="padding:7px 10px;font-size:12px"><span style="background:${dc}15;color:${dc};font-weight:700;padding:3px 10px;border-radius:8px;border:1px solid ${dc}30;font-size:11px">${season.dominantRole}</span></td></tr>`;
  }).join('');

  const title = fr ? 'Evolution du Role' : 'Role Evolution';
  const subtitle = fr ? 'Chemin de migration' : 'Migration Path';
  const chartTitle = fr ? 'Repartition par periode' : 'Distribution by Period';
  const tableTitle = fr ? 'Detail par periode' : 'Detail by Period';
  const summaryLabel = fr ? 'Resume' : 'Summary';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;color:#1a1a2e;max-width:600px;margin:0 auto}h1{font-size:22px;color:#6366F1;margin-bottom:4px}h2{font-size:16px;color:#374151;margin-top:24px;margin-bottom:12px}.subtitle{font-size:13px;color:#6b7280;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #e5e7eb}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}.summary-box{background:#6366F108;border:1px solid #6366F120;border-radius:12px;padding:14px;margin-bottom:20px;display:flex;align-items:center;gap:10px}.summary-icon{font-size:18px}.summary-text{font-size:13px;font-weight:700;color:${evo.hasEvolution ? '#6366F1' : '#10B981'}}</style></head><body><h1>${title} — ${playerName}</h1><div class="subtitle">${dateStr}</div><div class="summary-box"><span class="summary-icon">${evo.hasEvolution ? '\u2192' : '\u2713'}</span><span class="summary-text">${evo.migrationSummary}</span></div><h2>${subtitle}</h2><div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:20px">${migrationHtml}</div><h2>${chartTitle}</h2>${chartSvg}<div style="margin-top:10px;margin-bottom:20px">${legendHtml}</div><h2>${tableTitle}</h2><table><thead>${tableHeaders}</thead><tbody>${tableRows}</tbody></table><div class="footer">Ultimate Petanque — ${summaryLabel}: ${evo.seasons.length} ${fr ? 'periodes' : 'periods'} • ${evo.seasons.reduce((s, p) => s + p.totalMatches, 0)} ${fr ? 'matchs analyses' : 'matches analyzed'}</div></body></html>`;
}

// ============================================
// ROLE PERFORMANCE EXPORT DATA
// ============================================

export interface RoleExportData {
  role: PlayerRoleType;
  matchCount: number;
  wins: number;
  losses: number;
  winRate: number;
  tirRate: number;
  pointRate: number;
  carreauRate: number;
  tirs: number;
  tirsSuccess: number;
  points: number;
  pointsSuccess: number;
  carreaux: number;
}

/**
 * Generate role performance data suitable for CSV/PDF export.
 */
export function generateRoleExportData(
  selfPlayerId: string,
  matches: Match[],
): RoleExportData[] {
  const roleStats: Record<PlayerRoleType, { matchCount: number; wins: number; losses: number; tirs: number; tirsSuccess: number; points: number; pointsSuccess: number; carreaux: number }> = {
    Pointeur: { matchCount: 0, wins: 0, losses: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
    Milieu: { matchCount: 0, wins: 0, losses: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
    Tireur: { matchCount: 0, wins: 0, losses: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
  };

  for (const match of matches) {
    let playerRole: PlayerRoleType | null = null;
    let team: 'A' | 'B' | null = null;
    const aEntry = match.teamA.playerRoles?.find(r => r.playerId === selfPlayerId);
    const bEntry = match.teamB.playerRoles?.find(r => r.playerId === selfPlayerId);
    if (aEntry) { playerRole = aEntry.role as PlayerRoleType; team = 'A'; }
    else if (bEntry) { playerRole = bEntry.role as PlayerRoleType; team = 'B'; }
    if (!playerRole || !team) continue;

    const rs = roleStats[playerRole];
    rs.matchCount++;
    if (match.winner === team) rs.wins++;
    else rs.losses++;

    const pa = match.playerActions?.find(a => a.playerId === selfPlayerId);
    if (pa) {
      rs.tirs += pa.actions.tirs;
      rs.tirsSuccess += pa.actions.tirsSuccess;
      rs.points += pa.actions.points;
      rs.pointsSuccess += pa.actions.pointsSuccess;
      rs.carreaux += pa.actions.carreaux;
    }
  }

  return (['Tireur', 'Pointeur', 'Milieu'] as PlayerRoleType[]).map(role => {
    const rs = roleStats[role];
    return {
      role,
      matchCount: rs.matchCount,
      wins: rs.wins,
      losses: rs.losses,
      winRate: rs.matchCount > 0 ? Math.round((rs.wins / rs.matchCount) * 100) : 0,
      tirRate: rs.tirs > 0 ? Math.round((rs.tirsSuccess / rs.tirs) * 100) : 0,
      pointRate: rs.points > 0 ? Math.round((rs.pointsSuccess / rs.points) * 100) : 0,
      carreauRate: rs.tirs > 0 ? Math.round((rs.carreaux / rs.tirs) * 100) : 0,
      tirs: rs.tirs,
      tirsSuccess: rs.tirsSuccess,
      points: rs.points,
      pointsSuccess: rs.pointsSuccess,
      carreaux: rs.carreaux,
    };
  });
}
