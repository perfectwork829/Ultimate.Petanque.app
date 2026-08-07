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
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';
import { useFocusEffect } from '@react-navigation/native';

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
  /** True only when configured weekly/habitual activity matches the current weekday + hour window. */
  hasActivityToday?: boolean;
  hasHabitualNow?: boolean;
  hasLiveMeetup?: boolean;
  hasLiveTournament?: boolean;
  hasLiveMatch?: boolean;
  hasLiveChallenge?: boolean;
}

interface MeetupEntry {
  date: string;
  endTime: string | null;
}

interface SponsoredChallengeEntry {
  id: string;
  title: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
}

function parseDateMs(value?: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function combineDateAndTimeMs(baseDate?: string | null, timeValue?: string | null): number | null {
  if (!baseDate || !timeValue) return null;

  const direct = parseDateMs(timeValue);
  if (direct != null) return direct;

  const match = String(timeValue).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const base = new Date(baseDate);
  if (Number.isNaN(base.getTime())) return null;

  base.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
  return base.getTime();
}

function getEndMs(startMs: number, baseDate?: string | null, endTime?: string | null, defaultHours = 3): number {
  let endMs = combineDateAndTimeMs(baseDate, endTime);
  if (endMs == null) endMs = startMs + defaultHours * 60 * 60 * 1000;
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
  return endMs;
}

function getDateKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isSponsoredChallengeLiveNow(challenge: SponsoredChallengeEntry, now: Date): boolean {
  const status = String(challenge.status || 'upcoming').toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'canceled') return false;

  const eventDateKey = getDateKey(challenge.eventDate || challenge.startTime);
  if (!eventDateKey || eventDateKey !== todayKey(now)) return false;

  const startMs = combineDateAndTimeMs(challenge.eventDate, challenge.startTime) ?? parseDateMs(challenge.eventDate);
  if (startMs == null) return false;
  const endMs = getEndMs(startMs, challenge.eventDate, challenge.endTime, 3);
  const nowMs = now.getTime();

  // Active rows should pulse during their scheduled time window. If the backend
  // has already marked the event active but times are missing, same-day active is enough.
  if (nowMs >= startMs && nowMs <= endMs) return true;
  return status === 'active' && nowMs <= endMs;
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isTodayLike(dateValue: string | null | undefined, now: Date): boolean {
  const ms = parseDateMs(dateValue);
  if (ms == null) return false;
  return isSameLocalDate(new Date(ms), now);
}

function parseHourValue(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value);
  const m = text.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

function normalizeDow(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // JavaScript: Sunday=0. Some stored schedules use Monday=1..Sunday=7.
    if (value >= 0 && value <= 6) return value;
    if (value === 7) return 0;
  }
  const text = String(value).trim().toLowerCase();
  const names: Record<string, number> = {
    sun: 0, sunday: 0, dimanche: 0, dim: 0,
    mon: 1, monday: 1, lundi: 1, lun: 1,
    tue: 2, tuesday: 2, mardi: 2, mar: 2,
    wed: 3, wednesday: 3, mercredi: 3, mer: 3,
    thu: 4, thursday: 4, jeudi: 4, jeu: 4,
    fri: 5, friday: 5, vendredi: 5, ven: 5,
    sat: 6, saturday: 6, samedi: 6, sam: 6,
  };
  if (text in names) return names[text];
  const n = Number(text);
  if (Number.isFinite(n)) {
    if (n >= 0 && n <= 6) return n;
    if (n === 7) return 0;
  }
  return null;
}

function hourInWindow(hour: number, start: number | null, end: number | null, tolerance = 1): boolean {
  if (start == null && end == null) return false;
  const s = start ?? end;
  const e = end ?? start;
  if (s == null || e == null) return false;

  // Single hour value: allow small tolerance because user asked for around 10AM.
  if (s === e) return Math.abs(s - hour) <= tolerance;

  if (s <= e) return hour >= s - tolerance && hour <= e + tolerance;
  // Overnight schedule.
  return hour >= s - tolerance || hour <= e + tolerance;
}

function getTerrainWeeklyActivityEntries(terrain: any): any[] {
  const raw =
    terrain?.weeklyActivity ??
    terrain?.weekly_activity ??
    terrain?.peakHours ??
    terrain?.peak_hours ??
    terrain?.activitySchedule ??
    terrain?.activity_schedule ??
    terrain?.popularTimes ??
    terrain?.popular_times ??
    terrain?.habitualActivity ??
    terrain?.habitual_activity ??
    null;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([day, value]) => ({ day, value }));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([day, value]) => ({ day, value }));
  }
  return [];
}

function terrainWeeklyActivityMatchesNow(terrain: any, now: Date): boolean {
  const currentDow = now.getDay();
  const currentHour = now.getHours();
  const currentMonth = now.getMonth() + 1;

  return getTerrainWeeklyActivityEntries(terrain).some((entry: any) => {
    const value = entry?.value;
    const source = value && typeof value === 'object' && !Array.isArray(value) ? { ...entry, ...value } : entry;

    const dow = normalizeDow(
      source.dayOfWeek ??
      source.day_of_week ??
      source.weekday ??
      source.weekDay ??
      source.dow ??
      source.day
    );
    if (dow == null || dow !== currentDow) return false;

    const months = source.months ?? source.seasonMonths ?? source.season_months;
    if (Array.isArray(months) && months.length > 0) {
      const normalizedMonths = months.map((m: any) => Number(m)).filter((m: number) => Number.isFinite(m));
      if (normalizedMonths.length > 0 && !normalizedMonths.includes(currentMonth)) return false;
    }

    const hours = source.hours ?? source.hourSlots ?? source.hour_slots;
    if (Array.isArray(hours)) {
      return hours.some((h: any) => hourInWindow(currentHour, parseHourValue(h), parseHourValue(h), 1));
    }

    const startHour = parseHourValue(source.startHour ?? source.start_hour ?? source.startTime ?? source.start_time ?? source.from);
    const endHour = parseHourValue(source.endHour ?? source.end_hour ?? source.endTime ?? source.end_time ?? source.to);
    const hour = parseHourValue(source.hour ?? source.time ?? source.label);

    return hourInWindow(currentHour, startHour ?? hour, endHour ?? hour, 1);
  });
}

function getChallengeTerrainId(challenge: any): string | null {
  const terrainId =
    challenge?.terrainId ??
    challenge?.terrain_id ??
    challenge?.courtId ??
    challenge?.court_id ??
    challenge?.terrain?.id ??
    null;

  return terrainId ? String(terrainId) : null;
}

function getChallengeDateValue(challenge: any): string | null {
  return challenge?.date ?? challenge?.eventDate ?? challenge?.event_date ?? challenge?.createdAt ?? challenge?.created_at ?? null;
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
  const { terrains, matches, tournaments, challenges } = useAppData();
  const { language } = useLanguage();

  // Meetups loaded from Supabase — refreshed on mount and screen focus, so newly-created RDVs
  // immediately affect the fire-button live court markers.
  const [terrainMeetupsMap, setTerrainMeetupsMap] = useState<Map<string, MeetupEntry[]>>(new Map());
  const [sponsoredChallengesMap, setSponsoredChallengesMap] = useState<Map<string, SponsoredChallengeEntry[]>>(new Map());

  const loadMeetups = useCallback(async () => {
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

      const map = new Map<string, MeetupEntry[]>();
      (data || []).forEach((r: any) => {
        const arr = map.get(r.terrain_id) || [];
        arr.push({ date: r.date, endTime: r.end_time || null });
        map.set(r.terrain_id, arr);
      });
      setTerrainMeetupsMap(map);
    } catch (e) {
      console.log('[useTerrainActivity] Error loading meetups:', e);
    }
  }, []);

  const loadSponsoredChallenges = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('sponsored_events')
        .select('id, title, terrain_id, event_date, start_time, end_time, status')
        .not('terrain_id', 'is', null)
        .neq('status', 'cancelled')
        .gte('event_date', sevenDaysAgo);

      if (error) {
        console.log('[useTerrainActivity] Error loading sponsored challenges:', error.message);
        return;
      }

      const map = new Map<string, SponsoredChallengeEntry[]>();
      (data || []).forEach((r: any) => {
        if (!r.terrain_id) return;
        const arr = map.get(String(r.terrain_id)) || [];
        arr.push({
          id: String(r.id),
          title: r.title || '',
          eventDate: r.event_date || null,
          startTime: r.start_time || null,
          endTime: r.end_time || null,
          status: r.status || null,
        });
        map.set(String(r.terrain_id), arr);
      });
      setSponsoredChallengesMap(map);
    } catch (e) {
      console.log('[useTerrainActivity] Error loading sponsored challenges:', e);
    }
  }, []);

  useEffect(() => {
    loadMeetups();
    loadSponsoredChallenges();
  }, [loadMeetups, loadSponsoredChallenges]);

  useFocusEffect(useCallback(() => {
    loadMeetups();
    loadSponsoredChallenges();
  }, [loadMeetups, loadSponsoredChallenges]));

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
        const start = parseDateMs(mt.date);
        if (start == null) return false;
        const end = getEndMs(start, mt.date, mt.endTime, 3);
        return nowMs >= start && nowMs <= end;
      });
      const hasLiveMeetup = ongoingMeetups.length > 0;
      if (hasLiveMeetup) {
        isActiveNow = true;
        activeNowReasons.push(
          ongoingMeetups.length === 1
            ? (fr ? 'RDV en cours' : 'Meetup in progress')
            : `${ongoingMeetups.length} ${fr ? 'RDV en cours' : 'meetups in progress'}`
        );
      }

      // 1b. Ongoing tournaments: in progress, or scheduled for today and not finished/cancelled.
      const ongoingTournaments = tournaments.filter((t: any) => {
        if (t.terrainId !== tr.id) return false;
        if (t.status === 'Terminé' || t.status === 'completed' || t.status === 'cancelled') return false;
        if (t.status === 'En cours') return true;
        return isTodayLike(t.date, now);
      });
      const hasLiveTournament = ongoingTournaments.length > 0;
      if (hasLiveTournament) {
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
        const matchTime = parseDateMs(m.date);
        return matchTime != null && matchTime >= twoHoursAgo && matchTime <= nowMs;
      });
      const hasLiveMatch = veryRecentMatches.length > 0;
      if (hasLiveMatch) {
        isActiveNow = true;
        activeNowReasons.push(
          veryRecentMatches.length === 1
            ? (fr ? 'Partie recente' : 'Recent game')
            : `${veryRecentMatches.length} ${fr ? 'parties recentes' : 'recent games'}`
        );
      }

      // 1d. Challenges at this terrain today are considered live court activity.
      const todayChallenges = (challenges || []).filter((c: any) =>
        getChallengeTerrainId(c) === String(tr.id) && isTodayLike(getChallengeDateValue(c), now)
      );

      const liveSponsoredChallenges = (sponsoredChallengesMap.get(String(tr.id)) || [])
        .filter(challenge => isSponsoredChallengeLiveNow(challenge, now));

      const liveChallengeCount = todayChallenges.length + liveSponsoredChallenges.length;
      const hasLiveChallenge = liveChallengeCount > 0;
      if (hasLiveChallenge) {
        isActiveNow = true;
        activeNowReasons.push(
          liveChallengeCount === 1
            ? (fr ? 'Defi en cours' : 'Challenge in progress')
            : `${liveChallengeCount} ${fr ? 'defis en cours' : 'challenges in progress'}`
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
        if (Number.isNaN(d.getTime())) return;
        if (d.getDay() === currentDow) {
          sameDayCount++;
          const h = d.getHours();
          if (Math.abs(h - currentHour) <= 2) sameDayHourCount++;
        }
      });

      (challenges || []).forEach((c: any) => {
        if (getChallengeTerrainId(c) !== String(tr.id)) return;
        const challengeDate = getChallengeDateValue(c);
        if (!challengeDate) return;
        const d = new Date(challengeDate);
        if (Number.isNaN(d.getTime())) return;
        if (d.getDay() === currentDow) {
          sameDayCount++;
          const h = d.getHours();
          if (Math.abs(h - currentHour) <= 2) sameDayHourCount++;
        }
      });

      // Global community stats for labels/ranking only.
      const gStats = globalTerrainStats.get(tr.id);
      const globalPeakSameDayAndHour = Boolean(
        gStats &&
        gStats.peakDow === currentDow &&
        Math.abs(gStats.peakHour - currentHour) <= 1 &&
        gStats.peakHourCount > 0
      );
      const weeklyActivityNow = terrainWeeklyActivityMatchesNow(tr, now);

      // Green habitual pulse must be STRICT: it should come from the court's
      // configured weekly/habitual activity and must match the current weekday
      // AND current hour window. Historical matches/challenges/global stats are
      // useful for ranking text, but they must not make a court pulse green.
      const hasActivityToday = Boolean(weeklyActivityNow);
      const hasHabitualNow = Boolean(weeklyActivityNow);

      // Habitual score for the green pulse. Keep this strict as well, otherwise
      // courts with old Tuesday activity can still appear when searching Tuesday
      // afternoon even if their recorded weekly activity was in the morning.
      const habitualScore = weeklyActivityNow ? 40 : 0;

      // ========================================
      // 3) GENERAL SCORE (for overall ranking)
      // ========================================
      const meetupsToday = terrainMeetups.filter(mt => isTodayLike(mt.date, now));
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
        } else if (weeklyActivityNow) {
          peakLabel = `${fr ? 'Activite habituelle' : 'Habitual activity'} ${dayNames[currentDow]} ~${currentHour}h`;
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
          hasActivityToday,
          hasHabitualNow,
          hasLiveMeetup,
          hasLiveTournament,
          hasLiveMatch,
          hasLiveChallenge,
        });
      }
    });

    // Compute popularity ranks
    const sorted = [...scoreMap.entries()].sort((a, b) => b[1].score - a[1].score);
    sorted.forEach(([id, data], index) => {
      scoreMap.set(id, { ...data, rank: index + 1 });
    });

    return scoreMap;
  }, [terrains, matches, tournaments, challenges, terrainMeetupsMap, sponsoredChallengesMap, language, globalTerrainStats]);

  return terrainActivityMap;
}
