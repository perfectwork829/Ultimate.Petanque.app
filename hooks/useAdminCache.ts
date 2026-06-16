/**
 * useAdminCache — Hook to consume AdminCacheContext
 */
import { useContext } from 'react';
import { AdminCacheContext } from '@/contexts/AdminCacheContext';

export function useAdminCache() {
  const context = useContext(AdminCacheContext);
  if (!context) {
    // Return a no-op fallback when used outside AdminCacheProvider
    return {
      getCached: () => null,
      setCached: () => {},
      invalidate: () => {},
      invalidateAll: () => {},
      isCacheValid: () => false,
      sharedStats: null,
      setSharedStats: () => {},
      sharedStatsAge: Infinity,
    } as any;
  }
  return context;
}
