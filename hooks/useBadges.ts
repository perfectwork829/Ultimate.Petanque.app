/**
 * useBadges — Hook that loads badges, checks for new unlocks, and provides badge state.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { isUserAmbassador } from '@/services/ambassadorService';
import { fetchTrustScore } from '@/services/trustScoreService';
import {
  loadUserBadges,
  buildBadgeContext,
  checkAndAwardBadges,
  calculateTotalXp,
  syncXpToDb,
  UserBadge,
  BADGES,
} from '@/services/badgeService';

export function useBadges() {
  const { user } = useAuth();
  const { matches, challenges, userStats, sharedMatchIds, selfPlayer, boulesSets } = useAppData();

  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newlyUnlockedQueue, setNewlyUnlockedQueue] = useState<string[]>([]);
  const [currentUnlock, setCurrentUnlock] = useState<string | null>(null);
  const hasChecked = useRef(false);
  const lastCheckMatchCount = useRef(0);
  const lastCheckChallengeCount = useRef(0);
  const badgeCheckInFlight = useRef(false);

  // Load badges on mount
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      const result = await loadUserBadges(user.id);
      setBadges(result.badges);
      setXp(result.xp);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  // Check for new badges when data changes — debounced and skipped if data unchanged
  useEffect(() => {
    if (!user?.id || loading || matches.length === 0) return;
    // Skip if match/challenge count unchanged (prevents redundant DB queries)
    if (lastCheckMatchCount.current === matches.length && lastCheckChallengeCount.current === challenges.length && hasChecked.current) return;
    if (badgeCheckInFlight.current) return;

    const checkBadges = async () => {
      badgeCheckInFlight.current = true;
      lastCheckMatchCount.current = matches.length;
      lastCheckChallengeCount.current = challenges.length;
      hasChecked.current = true;
      const isAmb = await isUserAmbassador(user.id);

      // Count total carreaux
      let totalCarreaux = 0;
      matches.forEach((m: any) => {
        if (m.playerActions) {
          m.playerActions.forEach((pa: any) => {
            totalCarreaux += pa.actions?.carreaux || 0;
          });
        }
      });

      // Fetch trust score for trust badges
      let trustScore: number | null = null;
      try {
        const { selfPlayer } = require('@/contexts/AppContext');
      } catch {}
      // Attempt to get trust score from DB
      try {
        const { data: playerData } = await (await import('@/template')).getSupabaseClient()
          .from('players')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_public', true)
          .limit(1)
          .single();
        if (playerData?.id) {
          const ts = await fetchTrustScore(playerData.id);
          if (ts) trustScore = ts.score;
        }
      } catch { /* no trust score available */ }

      const context = buildBadgeContext({
        matches,
        challenges,
        userStats,
        sharedMatchIds,
        userId: user.id,
        isAmbassador: isAmb,
        leaderboardRank: null,
      });
      context.trustScore = trustScore;

      // Set ELO data for ELO badges
      if (selfPlayer) {
        context.eloRating = selfPlayer.eloRating || 1000;
        context.eloTireur = selfPlayer.eloTireur || 1000;
        context.eloPointeur = selfPlayer.eloPointeur || 1000;
        context.eloMilieu = selfPlayer.eloMilieu || 1000;
      }

      // Check geographic leadership badges
      try {
        const supabaseGeo = (await import('@/template')).getSupabaseClient();
        const cityName = selfPlayer?.city || (selfPlayer?.location as any)?.city;
        const countryName = selfPlayer?.country;
        const clubName = selfPlayer?.club;

        // City leader (#1 in city)
        if (cityName && selfPlayer?.isPublic) {
          const { data: cityPlayers } = await supabaseGeo
            .from('players')
            .select('id, elo_rating')
            .eq('city', cityName)
            .eq('is_public', true)
            .order('elo_rating', { ascending: false })
            .limit(1);
          if (cityPlayers && cityPlayers.length > 0 && cityPlayers[0].id === user.id) {
            context.isCityLeader = true;
            context.cityName = cityName;
          }
        }

        // Club leader (#1 in club)
        if (clubName && selfPlayer?.isPublic) {
          const { data: clubPlayers } = await supabaseGeo
            .from('players')
            .select('id, elo_rating')
            .eq('club', clubName)
            .eq('is_public', true)
            .order('elo_rating', { ascending: false })
            .limit(1);
          if (clubPlayers && clubPlayers.length > 0 && clubPlayers[0].id === user.id) {
            context.isClubLeader = true;
            context.clubName = clubName;
          }
        }

        // Country leader (#1 in country)
        if (countryName && selfPlayer?.isPublic) {
          const { data: countryPlayers } = await supabaseGeo
            .from('players')
            .select('id, elo_rating')
            .eq('country', countryName)
            .eq('is_public', true)
            .order('elo_rating', { ascending: false })
            .limit(1);
          if (countryPlayers && countryPlayers.length > 0 && countryPlayers[0].id === user.id) {
            context.isCountryLeader = true;
            context.countryName = countryName;
          }
        }

        // Continent leader (#1 in continent)
        if (countryName && selfPlayer?.isPublic) {
          const { getContinent } = await import('@/constants/geoData');
          const continent = getContinent(countryName);
          const { data: allPublicPlayers } = await supabaseGeo
            .from('players')
            .select('id, elo_rating, country')
            .eq('is_public', true)
            .order('elo_rating', { ascending: false });
          if (allPublicPlayers && allPublicPlayers.length > 0) {
            // Filter by continent
            const continentPlayers = allPublicPlayers.filter((p: any) => p.country && getContinent(p.country) === continent);
            if (continentPlayers.length > 0 && continentPlayers[0].id === user.id) {
              context.isContinentLeader = true;
              context.continentName = continent;
            }
            // World leader (#1 globally)
            if (allPublicPlayers[0].id === user.id) {
              context.isWorldLeader = true;
            }
          }
        }
      } catch { /* geo leadership check failed */ }

      // Fetch witness attestations given count for Trusted Witness badge
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const { data: attestationsGiven } = await supabase
          .from('match_witness_requests')
          .select('id')
          .eq('witness_user_id', user.id)
          .eq('status', 'attested');
        context.witnessAttestationsGiven = attestationsGiven?.length || 0;
      } catch { context.witnessAttestationsGiven = 0; }

      // Compute profile completeness for Complete Profile badge
      try {
        const supabasePC = (await import('@/template')).getSupabaseClient();
        const { data: profileData } = await supabasePC
          .from('user_profiles')
          .select('avatar, club, federation_card_url')
          .eq('id', user.id)
          .single();
        let filledCount = 0;
        const totalFields = 6;
        if (profileData?.avatar) filledCount++;
        if (profileData?.club || selfPlayer?.club) filledCount++;
        if (selfPlayer?.terrainId) filledCount++;
        if (selfPlayer?.location && (selfPlayer.location.latitude || selfPlayer.location.longitude)) filledCount++;
        if (boulesSets.length > 0 || (selfPlayer?.boules && (selfPlayer.boules.name || selfPlayer.boules.diameter || selfPlayer.boules.weight))) filledCount++;
        if (profileData?.federation_card_url) filledCount++;
        context.profileCompleteness = Math.round((filledCount / totalFields) * 100);
      } catch { context.profileCompleteness = 0; }

      const newBadgeIds = await checkAndAwardBadges(user.id, context, badges);

      if (newBadgeIds.length > 0) {
        // Reload badges to get fresh data
        const updated = await loadUserBadges(user.id);
        setBadges(updated.badges);
        setXp(updated.xp);
        setNewlyUnlockedQueue(prev => [...prev, ...newBadgeIds]);
      }

      // Sync XP
      const calculatedXp = calculateTotalXp({
        matchCount: matches.length,
        totalCarreaux,
        sharedAcceptedCount: sharedMatchIds.length,
        badgeCount: badges.length + newBadgeIds.length,
      });

      if (calculatedXp !== xp) {
        setXp(calculatedXp);
        await syncXpToDb(user.id, calculatedXp);
      }
      badgeCheckInFlight.current = false;
    };

    // Longer debounce (5s) to avoid hammering DB on rapid state changes
    const timer = setTimeout(checkBadges, 5000);
    return () => { clearTimeout(timer); };
  }, [user?.id, matches.length, challenges.length, sharedMatchIds.length, loading]);

  // Process unlock queue one at a time
  useEffect(() => {
    if (newlyUnlockedQueue.length > 0 && !currentUnlock) {
      setCurrentUnlock(newlyUnlockedQueue[0]);
      setNewlyUnlockedQueue(prev => prev.slice(1));
    }
  }, [newlyUnlockedQueue, currentUnlock]);

  const dismissUnlock = useCallback(() => {
    setCurrentUnlock(null);
  }, []);

  return {
    badges,
    xp,
    loading,
    currentUnlock,
    dismissUnlock,
    totalBadges: BADGES.length,
  };
}
