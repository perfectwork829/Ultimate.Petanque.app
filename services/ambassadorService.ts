import { getSupabaseClient } from '@/template';

export type AmbassadorLevel = 'decouverte' | 'confirme' | 'elite';

export interface Ambassador {
  id: string;
  userId: string;
  playerId?: string;
  displayName: string;
  bio?: string;
  photo?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  websiteUrl?: string;
  isFeatured: boolean;
  isActive: boolean;
  badgeType: string;
  ambassadorLevel: AmbassadorLevel;
  referralCode?: string;
  referralCount: number;
  totalReferralXp: number;
  brandColor?: string;
  // Joined player stats (if available)
  stats?: {
    matchesPlayed: number;
    wins: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
  };
  role?: string;
  level?: string;
  club?: string;
  city?: string;
}

let cachedAmbassadors: Ambassador[] | null = null;
let cachedAmbassadorUserIds: Set<string> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1 minute

/** Fetch only true ambassadors (excludes sponsors/partners) */
export async function fetchAmbassadorsOnly(): Promise<{ ambassadors: Ambassador[]; error: string | null }> {
  const { ambassadors, error } = await fetchAmbassadors();
  if (error) return { ambassadors: [], error };
  const filtered = ambassadors.filter(a => a.badgeType === 'ambassador' || !['gold_sponsor', 'sponsor', 'partner'].includes(a.badgeType));
  return { ambassadors: filtered, error: null };
}

/** Fetch only sponsors/partners (excludes pure ambassadors) */
export async function fetchSponsorsOnly(): Promise<{ ambassadors: Ambassador[]; error: string | null }> {
  const { ambassadors, error } = await fetchAmbassadors();
  if (error) return { ambassadors: [], error };
  const filtered = ambassadors.filter(a => ['gold_sponsor', 'sponsor', 'partner'].includes(a.badgeType));
  return { ambassadors: filtered, error: null };
}

/** Check if a user is a sponsor/partner */
export async function isUserSponsor(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('ambassadors')
      .select('id, badge_type')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('badge_type', ['gold_sponsor', 'sponsor', 'partner'])
      .limit(1);
    if (error) return false;
    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

export async function fetchAmbassadors(options?: { forceRefresh?: boolean }): Promise<{ ambassadors: Ambassador[]; error: string | null }> {
  const now = Date.now();
  if (!options?.forceRefresh && cachedAmbassadors && now - lastFetchTime < CACHE_TTL) {
    return { ambassadors: cachedAmbassadors, error: null };
  }

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return { ambassadors: [], error: error.message };

    const ambassadorRows = data || [];

    // Fetch linked player data for stats
    const playerIds = ambassadorRows.map((a: any) => a.player_id).filter(Boolean);
    let playerMap = new Map<string, any>();
    if (playerIds.length > 0) {
      const { data: playersData } = await supabase
        .from('players')
        .select('id, stats, role, level, club, location')
        .in('id', playerIds);
      if (playersData) {
        playersData.forEach((p: any) => playerMap.set(p.id, p));
      }
    }

    const ambassadors: Ambassador[] = ambassadorRows.map((a: any) => {
      const player = a.player_id ? playerMap.get(a.player_id) : null;
      return {
        id: a.id,
        userId: a.user_id,
        playerId: a.player_id || undefined,
        displayName: a.display_name,
        bio: a.bio || undefined,
        photo: a.photo || undefined,
        youtubeUrl: a.youtube_url || undefined,
        tiktokUrl: a.tiktok_url || undefined,
        instagramHandle: a.instagram_handle || undefined,
        twitterHandle: a.twitter_handle || undefined,
        websiteUrl: a.website_url || undefined,
        isFeatured: a.is_featured,
        isActive: a.is_active !== false,
        badgeType: a.badge_type || 'ambassador',
        ambassadorLevel: (a.ambassador_level || 'decouverte') as AmbassadorLevel,
        referralCode: a.referral_code || undefined,
        referralCount: a.referral_count || 0,
        totalReferralXp: a.total_referral_xp || 0,
        brandColor: a.brand_color || undefined,
        stats: player?.stats ? {
          matchesPlayed: player.stats.matchesPlayed || 0,
          wins: player.stats.wins || 0,
          winRate: player.stats.winRate || 0,
          tirRate: player.stats.tirRate || 0,
          pointRate: player.stats.pointRate || 0,
          carreauRate: player.stats.carreauRate || 0,
        } : undefined,
        role: player?.role || undefined,
        level: player?.level || undefined,
        club: player?.club || undefined,
        city: player?.location?.city || undefined,
      };
    });

    cachedAmbassadors = ambassadors;
    cachedAmbassadorUserIds = new Set(ambassadors.map(a => a.userId));
    lastFetchTime = now;

    return { ambassadors, error: null };
  } catch (e: any) {
    return { ambassadors: [], error: e.message || 'Failed to fetch ambassadors' };
  }
}

/** Clear in-memory ambassador list (e.g. after admin tier change — map reloads fresh data). */
export function invalidateAmbassadorCache(): void {
  cachedAmbassadors = null;
  cachedAmbassadorUserIds = null;
  lastFetchTime = 0;
  import('@/services/goldSponsorAdReplacement')
    .then(({ onAmbassadorCacheInvalidated }) => onAmbassadorCacheInvalidated())
    .catch(() => {});
}

/** Check if a user is an ambassador (direct DB query, not limited to is_active) */
export async function isUserAmbassador(userId: string): Promise<boolean> {
  // First check the cache for active ambassadors (fast path)
  if (cachedAmbassadorUserIds && Date.now() - lastFetchTime < CACHE_TTL) {
    if (cachedAmbassadorUserIds.has(userId)) return true;
  }
  // If not found in cache, query DB directly (includes inactive ambassadors for portal access)
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('ambassadors')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (error) return false;
    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

/** Get the set of ambassador user IDs (for leaderboard badge display) */
export async function getAmbassadorUserIds(): Promise<Set<string>> {
  if (cachedAmbassadorUserIds && Date.now() - lastFetchTime < CACHE_TTL) {
    return cachedAmbassadorUserIds;
  }
  await fetchAmbassadors();
  return cachedAmbassadorUserIds ?? new Set();
}

/** Get featured ambassadors only (for home page widget) */
export async function getFeaturedAmbassadors(): Promise<Ambassador[]> {
  const { ambassadors } = await fetchAmbassadors();
  const featured = ambassadors.filter(a => a.isFeatured);
  return featured.length > 0 ? featured : ambassadors.slice(0, 3);
}

/** Generate a unique referral code for an ambassador */
export async function generateReferralCode(ambassadorId: string, displayName: string): Promise<{ code: string | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Generate code from display name initials + random
    const initials = displayName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'AMB';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 5; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const code = `${initials}-${suffix}`;

    const { error } = await supabase
      .from('ambassadors')
      .update({ referral_code: code, updated_at: new Date().toISOString() })
      .eq('id', ambassadorId);

    if (error) return { code: null, error: error.message };
    invalidateAmbassadorCache();
    return { code, error: null };
  } catch (e: any) {
    return { code: null, error: e.message };
  }
}

/** Track a referral via code */
export async function trackReferral(referralCode: string, referredUserId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Find ambassador with this code
    const { data: amb, error: findErr } = await supabase
      .from('ambassadors')
      .select('id, referral_count, total_referral_xp')
      .eq('referral_code', referralCode.toUpperCase().trim())
      .maybeSingle();

    if (findErr || !amb) return { success: false, error: 'Code invalide' };

    // Increment referral count and XP
    const xpPerReferral = 10;
    const { error: upErr } = await supabase
      .from('ambassadors')
      .update({
        referral_count: (amb.referral_count || 0) + 1,
        total_referral_xp: (amb.total_referral_xp || 0) + xpPerReferral,
        updated_at: new Date().toISOString(),
      })
      .eq('id', amb.id);

    if (upErr) return { success: false, error: upErr.message };

    // Track analytics event
    await supabase.from('ambassador_analytics').insert({
      ambassador_id: amb.id,
      event_type: 'referral',
      viewer_id: referredUserId,
      source_page: 'referral_code',
    }).catch(() => {});

    // Check for auto-promotion after referral
    checkAndPromoteAmbassador(amb.id).catch(() => {});

    // Send referral notification to ambassador (fire-and-forget)
    notifyReferralUsed(referralCode, referredUserId).catch(() => {});

    invalidateAmbassadorCache();
    return { success: true, error: null };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Update ambassador level */
export async function updateAmbassadorLevel(ambassadorId: string, level: AmbassadorLevel): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('ambassadors')
      .update({ ambassador_level: level, updated_at: new Date().toISOString() })
      .eq('id', ambassadorId);
    if (error) return { error: error.message };
    invalidateAmbassadorCache();
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Check if ambassador qualifies for a level promotion and apply it */
export async function checkAndPromoteAmbassador(ambassadorId: string): Promise<{ promoted: boolean; newLevel: AmbassadorLevel | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // Get current ambassador data
    const { data: amb, error: ambErr } = await supabase
      .from('ambassadors')
      .select('id, ambassador_level, referral_count, user_id')
      .eq('id', ambassadorId)
      .maybeSingle();

    if (ambErr || !amb) return { promoted: false, newLevel: null, error: ambErr?.message || 'Ambassador not found' };

    const currentLevel = (amb.ambassador_level || 'decouverte') as AmbassadorLevel;
    // Already at max level
    if (currentLevel === 'elite') return { promoted: false, newLevel: null, error: null };

    // Determine next level
    const nextLevel: AmbassadorLevel = currentLevel === 'decouverte' ? 'confirme' : 'elite';
    const nextConf = AMBASSADOR_LEVELS[nextLevel];

    // Get referral count from ambassador record
    const referrals = amb.referral_count || 0;

    // Count sponsored events created by this ambassador
    const { data: events } = await supabase
      .from('sponsored_events')
      .select('id')
      .eq('ambassador_id', ambassadorId);
    const eventCount = events?.length || 0;

    // Count total impressions (all-time banner_impression events)
    const { data: impressions } = await supabase
      .from('ambassador_analytics')
      .select('id')
      .eq('ambassador_id', ambassadorId)
      .eq('event_type', 'banner_impression');
    const impressionCount = impressions?.length || 0;

    // Check thresholds
    const meetsReferrals = referrals >= nextConf.minReferrals;
    const meetsEvents = eventCount >= nextConf.minEvents;
    const meetsImpressions = impressionCount >= nextConf.minImpressions;

    if (meetsReferrals && meetsEvents && meetsImpressions) {
      // Promote!
      const { error: upErr } = await supabase
        .from('ambassadors')
        .update({ ambassador_level: nextLevel, updated_at: new Date().toISOString() })
        .eq('id', ambassadorId);

      if (upErr) return { promoted: false, newLevel: null, error: upErr.message };

      // Track promotion event in analytics
      await supabase.from('ambassador_analytics').insert({
        ambassador_id: ambassadorId,
        event_type: 'level_promotion',
        source_page: `promoted_to_${nextLevel}`,
        viewer_id: amb.user_id,
      }).catch(() => {});

      // Send push notification for promotion (fire-and-forget)
      sendPromotionPush(amb.user_id, ambassadorId, nextLevel).catch(() => {});

      invalidateAmbassadorCache();
      return { promoted: true, newLevel: nextLevel, error: null };
    }

    return { promoted: false, newLevel: null, error: null };
  } catch (e: any) {
    return { promoted: false, newLevel: null, error: e.message };
  }
}

/** Get promotion progress for an ambassador */
export async function getPromotionProgress(ambassadorId: string, currentLevel: AmbassadorLevel): Promise<{
  referrals: number;
  events: number;
  impressions: number;
  nextLevel: AmbassadorLevel | null;
}> {
  if (currentLevel === 'elite') {
    return { referrals: 0, events: 0, impressions: 0, nextLevel: null };
  }

  const supabase = getSupabaseClient();

  const [ambRes, eventsRes, impressionsRes] = await Promise.all([
    supabase.from('ambassadors').select('referral_count').eq('id', ambassadorId).maybeSingle(),
    supabase.from('sponsored_events').select('id').eq('ambassador_id', ambassadorId),
    supabase.from('ambassador_analytics').select('id').eq('ambassador_id', ambassadorId).eq('event_type', 'banner_impression'),
  ]);

  return {
    referrals: ambRes.data?.referral_count || 0,
    events: eventsRes.data?.length || 0,
    impressions: impressionsRes.data?.length || 0,
    nextLevel: currentLevel === 'decouverte' ? 'confirme' : 'elite',
  };
}

/** Send push notification when an ambassador is promoted */
async function sendPromotionPush(userId: string, ambassadorId: string, newLevel: AmbassadorLevel): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // Get ambassador name
    const { data: amb } = await supabase
      .from('ambassadors')
      .select('display_name')
      .eq('id', ambassadorId)
      .maybeSingle();

    const levelLabels: Record<AmbassadorLevel, string> = {
      decouverte: 'Decouverte',
      confirme: 'Confirme',
      elite: 'Elite',
    };

    await supabase.functions.invoke('send-push', {
      body: {
        type: 'ambassador_promotion',
        payload: {
          targetUserId: userId,
          ambassadorName: amb?.display_name || 'Ambassadeur',
          newLevel,
          newLevelLabel: levelLabels[newLevel],
        },
      },
    });
  } catch { /* silent */ }
}

/** Notify ambassador when their referral code is used by a new player */
async function notifyReferralUsed(referralCode: string, referredUserId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('notify-referral', {
      body: {
        referralCode,
        referredUserId,
      },
    });
  } catch { /* silent */ }
}

/** Ambassador level configuration */
export const AMBASSADOR_LEVELS = {
  decouverte: {
    color: '#3B82F6',
    icon: 'explore' as const,
    minReferrals: 25,
    minEvents: 0,
    minImpressions: 0,
  },
  confirme: {
    color: '#7C3AED',
    icon: 'trending-up' as const,
    minReferrals: 50,
    minEvents: 3,
    minImpressions: 500,
  },
  elite: {
    color: '#F59E0B',
    icon: 'military-tech' as const,
    minReferrals: 100,
    minEvents: 10,
    minImpressions: 2000,
  },
} as const;
