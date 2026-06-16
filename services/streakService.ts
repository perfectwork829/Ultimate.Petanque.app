/**
 * Streak Service — Consecutive day tracking for the 'En Feu' badge.
 * Computes current streak, best streak, and schedules daily reminder notifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAK_KEY = '@streak_data';

export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastPlayDate: string | null; // ISO date YYYY-MM-DD
  streakDates: string[]; // Last 30 day-strings for sparkline
}

/** Get today's date as YYYY-MM-DD */
function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get yesterday's date as YYYY-MM-DD */
function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute streak data from match/challenge dates.
 * This is the source of truth — always recomputed from actual data.
 */
export function computeStreakFromDates(allDates: string[]): StreakData {
  if (allDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastPlayDate: null, streakDates: [] };
  }

  // Deduplicate and sort descending
  const uniqueDates = [...new Set(
    allDates.map(dateStr => {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
  )].sort().reverse();

  const today = getTodayISO();
  const yesterday = getYesterdayISO();

  // Current streak: count consecutive days from today or yesterday backwards
  let currentStreak = 0;
  const startsToday = uniqueDates[0] === today;
  const startsYesterday = uniqueDates[0] === yesterday;

  if (startsToday || startsYesterday) {
    currentStreak = 1;
    const startIdx = 0;
    for (let i = startIdx; i < uniqueDates.length - 1; i++) {
      const curr = new Date(uniqueDates[i]);
      const prev = new Date(uniqueDates[i + 1]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Best streak: find longest consecutive run in all dates
  let bestStreak = 0;
  let tempStreak = 1;
  const ascending = [...uniqueDates].reverse();
  for (let i = 1; i < ascending.length; i++) {
    const curr = new Date(ascending[i]);
    const prev = new Date(ascending[i - 1]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      tempStreak++;
    } else {
      bestStreak = Math.max(bestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, tempStreak, currentStreak);

  // Keep last 30 dates for sparkline visualization
  const streakDates = uniqueDates.slice(0, 30);

  return {
    currentStreak,
    bestStreak,
    lastPlayDate: uniqueDates[0] || null,
    streakDates,
  };
}

/**
 * Check if user played today.
 */
export function playedToday(streakData: StreakData): boolean {
  return streakData.lastPlayDate === getTodayISO();
}

/**
 * Check if streak is at risk (played yesterday but not today).
 */
export function streakAtRisk(streakData: StreakData): boolean {
  if (streakData.currentStreak === 0) return false;
  return streakData.lastPlayDate === getYesterdayISO();
}

/**
 * Get streak status text for display.
 */
export function getStreakStatus(streakData: StreakData, language: 'fr' | 'en'): { status: 'active' | 'at_risk' | 'broken' | 'none'; text: string; color: string } {
  const today = getTodayISO();
  const yesterday = getYesterdayISO();

  if (streakData.currentStreak === 0) {
    return {
      status: 'none',
      text: language === 'fr' ? 'Pas de serie' : 'No streak',
      color: '#9CA3AF',
    };
  }

  if (streakData.lastPlayDate === today) {
    return {
      status: 'active',
      text: language === 'fr' ? 'Serie active' : 'Active streak',
      color: '#F97316',
    };
  }

  if (streakData.lastPlayDate === yesterday) {
    return {
      status: 'at_risk',
      text: language === 'fr' ? 'Joue aujourd\'hui !' : 'Play today!',
      color: '#EF4444',
    };
  }

  return {
    status: 'broken',
    text: language === 'fr' ? 'Serie perdue' : 'Streak lost',
    color: '#9CA3AF',
  };
}

/**
 * Persist streak data to local cache for fast access.
 */
export async function cacheStreakData(data: StreakData): Promise<void> {
  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch { /* silent */ }
}

/**
 * Load cached streak data.
 */
export async function loadCachedStreak(): Promise<StreakData | null> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* silent */ }
  return null;
}

/**
 * Generate daily activity data for the last 7 days (for sparkline on stats page).
 * Returns an array of { date, matchCount, challengeCount, total } for each of the last 7 days.
 */
export function getDailyActivityLast7Days(
  matches: Array<{ date: string }>,
  challenges: Array<{ date: string }>,
  language: 'fr' | 'en' = 'en'
): Array<{ date: string; dayLabel: string; matchCount: number; challengeCount: number; total: number }> {
  const result: Array<{ date: string; dayLabel: string; matchCount: number; challengeCount: number; total: number }> = [];
  
  const frDayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = language === 'fr' ? frDayLabels[d.getDay()] : d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
    
    const matchCount = matches.filter(m => {
      const md = new Date(m.date);
      return `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}` === dateStr;
    }).length;
    
    const challengeCount = challenges.filter(c => {
      const cd = new Date(c.date);
      return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}` === dateStr;
    }).length;
    
    result.push({ date: dateStr, dayLabel, matchCount, challengeCount, total: matchCount + challengeCount });
  }
  
  return result;
}
