/**
 * useTerrainActivity — Dedicated hook for terrain activity scoring.
 * Extracted from directory.tsx to:
 * 1. Fix declaration order (terrainActivityMap must be defined before getCompareValue)
 * 2. Reduce re-renders in directory by isolating async data loading
 * 3. Enable reuse across map and other screens
 *
 * "Active Now" priority system:
 *  - Priority 1: Terrains with an ongoing meetup/tournament RIGHT NOW
 *  - Priority 2: Terrains with habitual activity at the same day-of-week + hour window
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';

export interface TerrainActivityInfo {
  score: number;
  matchCount: number;
  peakLabel: string;
  rank: number;
  recentMatches: number;
  recentChallenges: number;
  recentTournaments: number;
  /** True when something is happening RIGHT NOW (ongoing meetup, tournament, or very recent match) */
  isActiveNow: boolean;
  /** Label describing why the terrain is active now */
  activeNowLabel: string;
  /** Score based on habitual activity at this day-of-week + hour */
  habitualScore: number;
}

interface MeetupEntry {
  date: string;
  endTime: string | null;
}

interface GlobalTerrainStats {
  totalMatches: number;
  recentMatches: number;
  totalChallenges: number;
  recentChallenges: number;
  totalTournaments: number;
  recentTournaments: number;
  peakDow: number;
  peakHour: number;
  peakDowCount: number;
  peakHourCount: number;
}

export function useTerrainActivity(): Map<string, TerrainActivityInfo> {
  const { terrains, matches, tournaments } = useAppData();
  const { language } = useLanguage();

  // Meetups loaded from Supabase (loaded once) — now includes end_time
  const [terrainMeetupsMap, setTerrainMeetupsMap] = useState<Map<string, MeetupEntry[]>>(new Map());
  const meetupLoadRef = useRef(false);

  useEffect(() => {
    if (meetupLoadRef.current) return;
    meetupLoadRef.current = true;
    const loadMeetups = async () => {
      try {
        const supabase = getSupabaseClient();
        // Load meetups from the last 7 days forward (to catch ongoing ones)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('terrain_meetups')
          .select('terrain_id, date, end_time')
          .eq('status', 'active')
          .gte('date', weekAgo);
        if (error) {
          console.log('[useTerrainActivity] Error loading meetups:', error.message);
          return;
        }
        if (data) {
          const map = new Map<string, MeetupEntry[]>();
          data.forEach((r: any) => {
            const arr = map.get(r.terrain_id) || [];
            arr.push({ date: r.date, endTime: r.end_time || null });
            map.set(r.terrain_id, arr);
          });
          setTerrainMeetupsMap(map);
        }
      } catch (e) {
        console.log('[useTerrainActivity] Error loading meetups:', e);
      }
    };
    loadMeetups();
  }, []);

  // Global terrain activity stats from ALL users (community-representative scoring)
  const [globalTerrainStats, setGlobalTerrainStats] = useState<Map<string, GlobalTerrainStats>>(new Map());
  const globalStatsLoadRef = useRef(false);

  useEffect(() => {
    if (globalStatsLoadRef.current) return;
    globalStatsLoadRef.current = true;
    const loadGlobalStats = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('get_terrain_activity_stats');
        if (error) {
          console.log('[useTerrainActivity] Error loading global stats:', error.message);
          return;
        }
        if (data) {
          const map = new Map<string, GlobalTerrainStats>();
          (data as any[]).forEach((r: any) => {
            map.set(r.terrain_id, {
              totalMatches: Number(r.total_matches) || 0,
              recentMatches: Number(r.recent_matches) || 0,
              totalChallenges: Number(r.total_challenges) || 0,
              recentChallenges: Number(r.recent_challenges) || 0,
              totalTournaments: Number(r.total_tournaments) || 0,
              recentTournaments: Number(r.recent_tournaments) || 0,
              peakDow: Number(r.peak_dow) || 0,
              peakHour: Number(r.peak_hour) || 0,
              peakDowCount: Number(r.peak_dow_count) || 0,
              peakHourCount: Number(r.peak_hour_count) || 0,
            });
          });
          setGlobalTerrainStats(map);
        }
      } catch (e) {
        console.log('[useTerrainActivity] Error loading global terrain stats:', e);
      }
    };
    setTimeout(loadGlobalStats, 600);
  }, []);

  // Activity scores — ALWAYS computed (for sort-by-activity and display)
  const terrainActivityMap = useMemo(() => {
    const scoreMap = new Map<string, TerrainActivityInfo>();
    const now = new Date();
    const nowMs = now.getTime();
    const currentDow = now.getDay();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().slice(0, 10);

    const fr = language === 'fr';
    const dayNames = fr
      ? ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    terrains.forEach(tr => {
      const terrainMatches = matches.filter(m => m.terrainId === tr.id);

      // ========================================
      // 1) ACTIVE NOW detection (real-time)
      // ========================================
      let isActiveNow = false;
      let activeNowLabel = '';
      const activeNowReasons: string[] = [];

      // 1a. Ongoing meetups: start <= now <= end (or within 3h default window if no end_time)
      const terrainMeetups = terrainMeetupsMap.get(tr.id) || [];
      const ongoingMeetups = terrainMeetups.filter(mt => {
        const start = new Date(mt.date).getTime();
        const end = mt.endTime
          ? new Date(mt.endTime).getTime()
          : start + 3 * 60 * 60 * 1000; // Default 3h window
        return nowMs >= start && nowMs <= end;
      });
      if (ongoingMeetups.length > 0) {
        isActiveNow = true;
        activeNowReasons.push(
          ongoingMeetups.length === 1
            ? (fr ? 'RDV en cours' : 'Meetup in progress')
            : `${ongoingMeetups.length} ${fr ? 'RDV en cours' : 'meetups in progress'}`
        );
      }

      // 1b. Ongoing tournaments: status "En cours" or starts today
      const ongoingTournaments = tournaments.filter(t =>
        t.terrainId === tr.id &&
        (t.status === 'En cours' || (t.status === 'À venir' && t.date && t.date.slice(0, 10) === todayStr))
      );
      if (ongoingTournaments.length > 0) {
        isActiveNow = true;
        activeNowReasons.push(
          ongoingTournaments.length === 1
            ? (fr ? 'Tournoi en cours' : 'Tournament in progress')
            : `${ongoingTournaments.length} ${fr ? 'tournois en cours' : 'tournaments in progress'}`
        );
      }

      // 1c. Very recent match (within last 2 hours)
      const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
      const veryRecentMatches = terrainMatches.filter(m => {
        const matchTime = new Date(m.date).getTime();
        return matchTime >= twoHoursAgo && matchTime <= nowMs;
      });
      if (veryRecentMatches.length > 0) {
        isActiveNow = true;
        activeNowReasons.push(
          veryRecentMatches.length === 1
            ? (fr ? 'Partie recente' : 'Recent game')
            : `${veryRecentMatches.length} ${fr ? 'parties recentes' : 'recent games'}`
        );
      }

      if (activeNowReasons.length > 0) {
        activeNowLabel = activeNowReasons.join(' + ');
      }

      // ========================================
      // 2) HABITUAL SCORE (same day + hour window)
      // ========================================
      // Count how many times activity was recorded at the same day-of-week within ±2 hours
      let sameDayHourCount = 0;
      let sameDayCount = 0;
      terrainMatches.forEach(m => {
        const d = new Date(m.date);
        if (d.getDay() === currentDow) {
          sameDayCount++;
          const h = d.getHours();
          if (Math.abs(h - currentHour) <= 2) sameDayHourCount++;
        }
      });

      // Global community stats for habitual patterns
      const gStats = globalTerrainStats.get(tr.id);
      // Check if the global peak matches current day+hour
      let globalPeakMatchesCurrent = false;
      let globalPeakDowCount = 0;
      if (gStats && gStats.peakDow === currentDow) {
        globalPeakMatchesCurrent = true;
        globalPeakDowCount = gStats.peakDowCount;
        if (Math.abs(gStats.peakHour - currentHour) <= 2) {
          globalPeakDowCount += gStats.peakHourCount;
        }
      }

      // Habitual score: how likely is activity NOW based on historical patterns
      const habitualScore =
        sameDayHourCount * 15 +    // Personal matches at same day+hour (strong signal)
        sameDayCount * 3 +          // Personal matches on same day
        (globalPeakMatchesCurrent ? globalPeakDowCount * 5 : 0) + // Community peak matches current day
        (gStats && gStats.peakDow === currentDow && Math.abs(gStats.peakHour - currentHour) <= 2
          ? gStats.peakHourCount * 8 : 0); // Community peak matches current hour

      // ========================================
      // 3) GENERAL SCORE (for overall ranking)
      // ========================================
      const meetupsToday = terrainMeetups.filter(mt => mt.date.slice(0, 10) === todayStr);
      const tournamentBonus = ongoingTournaments.length * 25;
      const meetupBonus = meetupsToday.length * 30;

      const globalRecentBonus = gStats ? Math.min(gStats.recentMatches, 30) * 5 : 0;
      const globalTotalBonus = gStats ? Math.min(gStats.totalMatches, 100) : 0;
      const globalChallengeBonus = gStats ? Math.min(gStats.recentChallenges, 20) * 4 : 0;
      const globalChallengeTotalBonus = gStats ? Math.round(Math.min(gStats.totalChallenges, 50) * 0.5) : 0;
      const globalTournamentRecentBonus = gStats ? Math.min(gStats.recentTournaments, 10) * 8 : 0;
      const globalTournamentTotalBonus = gStats ? Math.min(gStats.totalTournaments, 30) * 2 : 0;

      const hourScore = sameDayHourCount * 10;
      const dayScore = sameDayCount * 3;
      const totalScore = Math.min(terrainMatches.length, 10);
      const rawScore = hourScore + dayScore + totalScore + tournamentBonus + meetupBonus +
        globalRecentBonus + globalTotalBonus + globalChallengeBonus + globalChallengeTotalBonus +
        globalTournamentRecentBonus + globalTournamentTotalBonus;

      if (rawScore > 0 || isActiveNow || habitualScore > 0) {
        // Build peak label
        let peakLabel = '';

        if (isActiveNow) {
          peakLabel = activeNowLabel;
        } else if (meetupsToday.length > 0) {
          peakLabel = meetupsToday.length === 1
            ? (fr ? 'RDV prevu aujourd\'hui' : 'Meetup today')
            : `${meetupsToday.length} ${fr ? 'RDV aujourd\'hui' : 'meetups today'}`;
        } else if (habitualScore > 10 && sameDayHourCount > 0) {
          peakLabel = `${sameDayHourCount} ${fr ? 'partie(s) habituelles' : 'usual game(s)'} ${dayNames[currentDow]} ~${currentHour}h`;
        } else if (gStats && gStats.peakDowCount > 0 && gStats.peakHourCount > 0) {
          peakLabel = `${fr ? 'Pic' : 'Peak'}: ${dayNames[gStats.peakDow]} ~${gStats.peakHour}h (${gStats.peakHourCount})`;
        } else if (sameDayHourCount > 0) {
          peakLabel = `${sameDayHourCount} ${fr ? 'partie(s)' : 'game(s)'} ${dayNames[currentDow]} ~${currentHour}h`;
        } else if (gStats && gStats.recentMatches + (gStats.recentChallenges || 0) > 0) {
          const recentTotal = gStats.recentMatches + (gStats.recentChallenges || 0);
          peakLabel = `${recentTotal} ${fr ? 'activites ce mois' : 'activities this month'}`;
        } else if (gStats && gStats.totalMatches + (gStats.totalChallenges || 0) > 0) {
          const allTotal = gStats.totalMatches + (gStats.totalChallenges || 0);
          peakLabel = `${allTotal} ${fr ? 'activites au total' : 'total activities'}`;
        } else if (sameDayCount > 0) {
          peakLabel = `${sameDayCount} ${fr ? 'partie(s) le' : 'game(s) on'} ${dayNames[currentDow]}`;
        } else {
          peakLabel = fr ? 'Terrain actif' : 'Active terrain';
        }

        const communityTotal = gStats ? gStats.totalMatches + gStats.totalChallenges : 0;
        const finalScore = Math.max(rawScore, isActiveNow ? 1 : 0, habitualScore > 0 ? 1 : 0);

        scoreMap.set(tr.id, {
          score: finalScore,
          matchCount: communityTotal + terrainMatches.length + ongoingTournaments.length + meetupsToday.length,
          peakLabel,
          rank: 0,
          recentMatches: gStats?.recentMatches || 0,
          recentChallenges: gStats?.recentChallenges || 0,
          recentTournaments: gStats?.recentTournaments || 0,
          isActiveNow,
          activeNowLabel,
          habitualScore,
        });
      }
    });

    // Compute popularity ranks
    const sorted = [...scoreMap.entries()].sort((a, b) => b[1].score - a[1].score);
    sorted.forEach(([id, data], index) => {
      scoreMap.set(id, { ...data, rank: index + 1 });
    });

    return scoreMap;
  }, [terrains, matches, tournaments, terrainMeetupsMap, language, globalTerrainStats]);

  return terrainActivityMap;
}
