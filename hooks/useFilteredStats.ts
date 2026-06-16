/**
 * useFilteredStats — Shared time-based filtering hook for stats and history.
 * 
 * Provides reusable time-period filtering for matches, challenges,
 * and any date-stamped data arrays. Used by both stats.tsx and history.tsx.
 */
import { useMemo, useState, useCallback } from 'react';

export type TimeFilter = 'today' | 'week' | 'month' | '3months' | '6months' | 'year' | 'all';

export type PeriodOption = 'all' | 'week' | '2weeks' | 'month' | '3months' | '6months' | 'year';

export const PERIOD_DAYS: Record<PeriodOption, number> = {
  all: 0,
  week: 7,
  '2weeks': 14,
  month: 30,
  '3months': 90,
  '6months': 180,
  year: 365,
};

export const PERIOD_KEYS: Record<PeriodOption, string> = {
  all: 'allTime',
  week: 'sevenDays',
  '2weeks': 'twoWeeks',
  month: 'oneMonth',
  '3months': 'threeMonths',
  '6months': 'sixMonths',
  year: 'oneYear',
};

export const PERIOD_IDS: PeriodOption[] = ['all', 'week', '2weeks', 'month', '3months', '6months', 'year'];

/**
 * Filter an array of date-stamped items by a time period.
 * Works with any object that has a `date` string property.
 */
export function filterByPeriod<T extends { date: string }>(items: T[], days: number): T[] {
  if (days === 0) return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return items.filter(item => new Date(item.date) >= cutoff);
}

/**
 * Filter by TimeFilter enum (used by stats.tsx).
 */
export function filterByTime<T extends { date: string }>(items: T[], filter: TimeFilter): T[] {
  if (filter === 'all') return items;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate: Date;
  switch (filter) {
    case 'today': startDate = new Date(startOfDay); break;
    case 'week': startDate = new Date(startOfDay); startDate.setDate(startDate.getDate() - 7); break;
    case 'month': startDate = new Date(startOfDay); startDate.setDate(startDate.getDate() - 30); break;
    case '3months': startDate = new Date(startOfDay); startDate.setMonth(startDate.getMonth() - 3); break;
    case '6months': startDate = new Date(startOfDay); startDate.setMonth(startDate.getMonth() - 6); break;
    case 'year': startDate = new Date(startOfDay); startDate.setFullYear(startDate.getFullYear() - 1); break;
    default: return items;
  }
  return items.filter(item => new Date(item.date) >= startDate);
}

/**
 * Get a human-readable date key for grouping items by day.
 */
export function getDateKey(date: Date, lang: 'fr' | 'en'): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return lang === 'fr' ? "Aujourd'hui" : 'Today';
  if (date.toDateString() === yesterday.toDateString()) return lang === 'fr' ? 'Hier' : 'Yesterday';
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Hook that manages period selection state and provides filtered data.
 */
export function usePeriodFilter<T extends { date: string }>(
  items: T[],
  initialPeriod: PeriodOption = 'all',
) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(initialPeriod);

  const filteredItems = useMemo(() => {
    const days = PERIOD_DAYS[selectedPeriod] || 0;
    return filterByPeriod(items, days);
  }, [items, selectedPeriod]);

  const selectPeriod = useCallback((period: PeriodOption) => {
    setSelectedPeriod(period);
  }, []);

  return {
    selectedPeriod,
    selectPeriod,
    filteredItems,
    periodDays: PERIOD_DAYS[selectedPeriod],
  };
}
