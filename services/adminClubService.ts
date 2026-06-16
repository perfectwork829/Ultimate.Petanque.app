/**
 * Admin Club Service
 *
 * Duplicate detection and merge for clubs (admin only).
 */

import { getSupabaseClient } from '@/template';
import { saveMergeLog } from '@/services/mergeHistoryService';

export interface ClubDuplicateGroup {
  clubs: { id: string; name: string; city: string; membersCount: number; isVerified: boolean; isPublic: boolean; description: string | null; logo: string | null; address: string | null; contactEmail: string | null; facilities: string[]; foundedYear: number | null; createdAt: string; userId: string }[];
  nameSimilarity: number;
  sameCity: boolean;
}

/**
 * Normalize a name for similarity comparison.
 */
function normalizeName(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check name similarity (0-1 score).
 */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  // Levenshtein-lite: character overlap
  const setA = new Set(na.split(''));
  const setB = new Set(nb.split(''));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Detect potential duplicate clubs by name similarity (>0.7) in the same city.
 */
export function detectDuplicateClubs(
  clubs: { id: string; name: string; city: string; membersCount: number; isVerified: boolean; isPublic: boolean; description: string | null; logo: string | null; address: string | null; contactEmail: string | null; facilities: string[]; foundedYear: number | null; createdAt: string; userId: string }[],
  nameThreshold = 0.7
): ClubDuplicateGroup[] {
  const groups: ClubDuplicateGroup[] = [];
  const used = new Set<string>();

  for (let i = 0; i < clubs.length; i++) {
    if (used.has(clubs[i].id)) continue;
    const a = clubs[i];
    const cityA = normalizeName(a.city);

    const group: typeof clubs = [a];
    let bestSim = 0;
    let sameCity = false;

    for (let j = i + 1; j < clubs.length; j++) {
      if (used.has(clubs[j].id)) continue;
      const b = clubs[j];
      const cityB = normalizeName(b.city);

      // Must be same city (normalized)
      if (cityA !== cityB) continue;

      const sim = nameSimilarity(a.name, b.name);
      if (sim < nameThreshold) continue;

      group.push(b);
      used.add(b.id);
      bestSim = Math.max(bestSim, sim);
      sameCity = true;
    }

    if (group.length > 1) {
      used.add(a.id);
      groups.push({
        clubs: group,
        nameSimilarity: Math.round(bestSim * 100) / 100,
        sameCity,
      });
    }
  }

  return groups;
}

/**
 * Pick the most complete club from a pair.
 */
export function pickBestClub(
  a: { id: string; membersCount: number; isVerified: boolean; description: string | null; logo: string | null; address: string | null; contactEmail: string | null; facilities: string[]; foundedYear: number | null; isPublic: boolean },
  b: { id: string; membersCount: number; isVerified: boolean; description: string | null; logo: string | null; address: string | null; contactEmail: string | null; facilities: string[]; foundedYear: number | null; isPublic: boolean }
): { keepId: string; deleteId: string } {
  let scoreA = 0;
  let scoreB = 0;

  // Verified clubs always win
  if (a.isVerified && !b.isVerified) return { keepId: a.id, deleteId: b.id };
  if (b.isVerified && !a.isVerified) return { keepId: b.id, deleteId: a.id };

  scoreA += a.membersCount * 3;
  scoreB += b.membersCount * 3;
  if (a.description) scoreA += 2;
  if (b.description) scoreB += 2;
  if (a.logo) scoreA += 2;
  if (b.logo) scoreB += 2;
  if (a.address) scoreA += 1;
  if (b.address) scoreB += 1;
  if (a.contactEmail) scoreA += 1;
  if (b.contactEmail) scoreB += 1;
  scoreA += (a.facilities?.length || 0);
  scoreB += (b.facilities?.length || 0);
  if (a.foundedYear) scoreA += 1;
  if (b.foundedYear) scoreB += 1;
  if (a.isPublic) scoreA += 1;
  if (b.isPublic) scoreB += 1;

  return scoreA >= scoreB
    ? { keepId: a.id, deleteId: b.id }
    : { keepId: b.id, deleteId: a.id };
}

/**
 * Get a preview of what will be affected by merging two clubs.
 */
export async function getClubMergePreview(keepId: string, deleteId: string): Promise<{
  preview: {
    players: number;
    matches: number;
    tournaments: number;
    terrains: number;
    sharedItems: number;
    claimRequests: number;
  };
  error: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const [playersRes, tournamentsRes, terrainsRes, sharedRes, claimsRes] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', deleteId),
      supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('club_id', deleteId),
      supabase.from('terrains').select('id', { count: 'exact', head: true }).eq('club_id', deleteId),
      supabase.from('shared_items').select('id', { count: 'exact', head: true }).eq('item_type', 'club').eq('item_id', deleteId),
      supabase.from('club_claim_requests').select('id', { count: 'exact', head: true }).eq('club_id', deleteId),
    ]);

    // Count matches by players belonging to the deleted club
    const { data: clubPlayers } = await supabase.from('players').select('user_id').eq('club_id', deleteId);
    let matchCount = 0;
    if (clubPlayers && clubPlayers.length > 0) {
      const userIds = clubPlayers.map((p: any) => p.user_id);
      const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).in('user_id', userIds);
      matchCount = count || 0;
    }

    return {
      preview: {
        players: playersRes.count || 0,
        matches: matchCount,
        tournaments: tournamentsRes.count || 0,
        terrains: terrainsRes.count || 0,
        sharedItems: sharedRes.count || 0,
        claimRequests: claimsRes.count || 0,
      },
      error: null,
    };
  } catch (e: any) {
    return {
      preview: { players: 0, matches: 0, tournaments: 0, terrains: 0, sharedItems: 0, claimRequests: 0 },
      error: e.message,
    };
  }
}

/**
 * Merge two clubs: transfer all references from deleteId to keepId, then delete.
 */
/**
 * Fetch club merge history from merge_logs.
 */
export async function getClubMergeHistory(limit = 20): Promise<{ logs: { id: string; targetName: string; sourceName: string; createdAt: string; sourceSnapshot: any }[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('merge_logs')
      .select('id, target_name, source_name, created_at, source_snapshot, reassigned_relations')
      .eq('merge_type', 'club')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { logs: [], error: error.message };
    return {
      logs: (data || []).map((r: any) => ({
        id: r.id,
        targetName: r.target_name,
        sourceName: r.source_name,
        createdAt: r.created_at,
        sourceSnapshot: r.source_snapshot || {},
      })),
      error: null,
    };
  } catch (e: any) {
    return { logs: [], error: e.message };
  }
}

/**
 * Compute monthly health scores for a club over 6 months.
 * Returns monthly snapshots: { month, score, matches, members }.
 */
export async function getClubHealthTrends(clubId: string, language: 'fr' | 'en' = 'fr'): Promise<{
  trends: { month: string; score: number; matches: number; members: number; color: string }[];
  direction: 'improving' | 'declining' | 'stable';
  error: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date();
    const trends: { month: string; score: number; matches: number; members: number; color: string }[] = [];

    // Get all players for this club
    const { data: clubPlayers } = await supabase.from('players').select('user_id, created_at').eq('club_id', clubId);
    const playerUserIds = (clubPlayers || []).map((p: any) => p.user_id);

    // Get all matches for club players in last 6 months
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    let allMatches: any[] = [];
    if (playerUserIds.length > 0) {
      const { data } = await supabase.from('matches').select('user_id, date').in('user_id', playerUserIds).gte('date', sixMonthsAgo);
      allMatches = data || [];
    }

    // Get tournaments for club
    const { data: tournaments } = await supabase.from('tournaments').select('date').eq('club_id', clubId).gte('date', sixMonthsAgo.slice(0, 10));

    // Get club creation date for age calculation
    const { data: clubData } = await supabase.from('clubs').select('created_at, members_count').eq('id', clubId).single();

    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthLabel = monthStart.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });

      // Matches in this month
      const monthMatches = allMatches.filter(m => {
        const d = new Date(m.date);
        return d >= monthStart && d <= monthEnd;
      }).length;

      // Tournaments in this month
      const monthTournaments = (tournaments || []).filter((t: any) => {
        const d = new Date(t.date);
        return d >= monthStart && d <= monthEnd;
      }).length;

      // Members who joined up to this month
      const membersAtMonth = (clubPlayers || []).filter((p: any) => {
        return new Date(p.created_at) <= monthEnd;
      }).length;

      // Age in months at this point
      const clubCreated = clubData?.created_at ? new Date(clubData.created_at) : monthStart;
      const ageMonths = Math.max(0, Math.floor((monthEnd.getTime() - clubCreated.getTime()) / (30 * 24 * 60 * 60 * 1000)));

      // Score calculation (same formula as computeHealthScores)
      const memberActivity = Math.min(membersAtMonth * 2, 30);
      const age = Math.min(ageMonths * 2, 20);
      const rawScore = Math.min(100, monthMatches * 3 + monthTournaments * 10 + memberActivity + age);
      const score = Math.round(rawScore);
      const color = score >= 70 ? '#10B981' : score >= 40 ? '#D97706' : score >= 15 ? '#EF4444' : '#94A3B8';

      trends.push({ month: monthLabel, score, matches: monthMatches, members: membersAtMonth, color });
    }

    // Determine direction
    let direction: 'improving' | 'declining' | 'stable' = 'stable';
    if (trends.length >= 3) {
      const recent = trends.slice(-2).reduce((s, t) => s + t.score, 0) / 2;
      const older = trends.slice(0, 2).reduce((s, t) => s + t.score, 0) / 2;
      if (recent > older + 5) direction = 'improving';
      else if (recent < older - 5) direction = 'declining';
    }

    return { trends, direction, error: null };
  } catch (e: any) {
    return { trends: [], direction: 'stable', error: e.message };
  }
}

export async function mergeClubs(keepId: string, deleteId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Get keep club data for member count update
    const { data: keepClub } = await supabase.from('clubs').select('members_count').eq('id', keepId).single();
    const { data: deleteClub } = await supabase.from('clubs').select('members_count').eq('id', deleteId).single();

    // Transfer players from deleted club to kept club
    await supabase
      .from('players')
      .update({ club_id: keepId })
      .eq('club_id', deleteId);

    // Transfer tournaments
    await supabase
      .from('tournaments')
      .update({ club_id: keepId })
      .eq('club_id', deleteId);

    // Transfer terrains associated with deleted club
    await supabase
      .from('terrains')
      .update({ club_id: keepId })
      .eq('club_id', deleteId);

    // Transfer shared items referencing deleted club
    await supabase
      .from('shared_items')
      .update({ item_id: keepId })
      .eq('item_type', 'club')
      .eq('item_id', deleteId);

    // Delete club claim requests for deleted club
    await supabase
      .from('club_claim_requests')
      .delete()
      .eq('club_id', deleteId);

    // Update member count on kept club
    const newMemberCount = (keepClub?.members_count || 0) + (deleteClub?.members_count || 0);
    await supabase
      .from('clubs')
      .update({ members_count: newMemberCount, updated_at: new Date().toISOString() })
      .eq('id', keepId);

    // Snapshot the deleted club before removal
    const { data: delSnapshot } = await supabase.from('clubs').select('*').eq('id', deleteId).single();

    // Delete the duplicate club
    const { error: delError } = await supabase
      .from('clubs')
      .delete()
      .eq('id', deleteId);

    if (delError) return { error: delError.message };

    // Log the merge for history/undo
    try {
      const { data: keepData } = await supabase.from('clubs').select('name').eq('id', keepId).single();
      await saveMergeLog({
        mergeType: 'club',
        targetId: keepId,
        targetName: keepData?.name || keepId,
        sourceId: deleteId,
        sourceName: delSnapshot?.name || deleteId,
        sourceSnapshot: delSnapshot || {},
        reassignedRelations: [],
      });
    } catch { /* non-blocking */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}
