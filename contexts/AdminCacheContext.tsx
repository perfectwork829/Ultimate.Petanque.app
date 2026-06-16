/**
 * AdminCacheContext
 *
 * Shared cache for admin pages to avoid redundant queries when navigating.
 * Provides a TTL-based cache with selective invalidation.
 * Data is pre-fetched once and shared across all admin pages.
 */

import React, { createContext, useState, useCallback, useRef } from 'react';

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

interface AdminCacheState {
  // Shared data across admin pages
  pendingReports: number;
  activeBans: number;
  flaggedPlayers: number;
  totalUsers: number;
  premiumUsers: number;
  totalClubs: number;
  verifiedClubs: number;
  totalTerrains: number;
  totalMatches: number;
  totalPlayers: number;
}

interface AdminCacheContextType {
  // Generic cache get/set
  getCached: <T>(key: string) => T | null;
  setCached: <T>(key: string, data: T, ttlMs?: number) => void;
  invalidate: (key: string) => void;
  invalidateAll: () => void;
  isCacheValid: (key: string) => boolean;

  // Shared stats (pre-fetched from dashboard)
  sharedStats: AdminCacheState | null;
  setSharedStats: (stats: AdminCacheState) => void;
  sharedStatsAge: number; // ms since last fetch
}

const DEFAULT_TTL = 30000; // 30 seconds

export const AdminCacheContext = createContext<AdminCacheContextType | undefined>(undefined);

export function AdminCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const ttlRef = useRef<Map<string, number>>(new Map());
  const [sharedStats, setSharedStatsState] = useState<AdminCacheState | null>(null);
  const sharedStatsTimestamp = useRef<number>(0);

  // Force re-render counter (used to trigger consumers)
  const [, setVersion] = useState(0);

  const getCached = useCallback(<T,>(key: string): T | null => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    const ttl = ttlRef.current.get(key) || DEFAULT_TTL;
    if (Date.now() - entry.timestamp > ttl) {
      cacheRef.current.delete(key);
      ttlRef.current.delete(key);
      return null;
    }
    return entry.data as T;
  }, []);

  const setCached = useCallback(<T,>(key: string, data: T, ttlMs: number = DEFAULT_TTL) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
    ttlRef.current.set(key, ttlMs);
  }, []);

  const invalidate = useCallback((key: string) => {
    cacheRef.current.delete(key);
    ttlRef.current.delete(key);
    setVersion(v => v + 1);
  }, []);

  const invalidateAll = useCallback(() => {
    cacheRef.current.clear();
    ttlRef.current.clear();
    sharedStatsTimestamp.current = 0;
    setSharedStatsState(null);
    setVersion(v => v + 1);
  }, []);

  const isCacheValid = useCallback((key: string): boolean => {
    const entry = cacheRef.current.get(key);
    if (!entry) return false;
    const ttl = ttlRef.current.get(key) || DEFAULT_TTL;
    return Date.now() - entry.timestamp <= ttl;
  }, []);

  const setSharedStats = useCallback((stats: AdminCacheState) => {
    setSharedStatsState(stats);
    sharedStatsTimestamp.current = Date.now();
  }, []);

  const sharedStatsAge = sharedStatsTimestamp.current > 0
    ? Date.now() - sharedStatsTimestamp.current
    : Infinity;

  return (
    <AdminCacheContext.Provider value={{
      getCached,
      setCached,
      invalidate,
      invalidateAll,
      isCacheValid,
      sharedStats,
      setSharedStats,
      sharedStatsAge,
    }}>
      {children}
    </AdminCacheContext.Provider>
  );
}
