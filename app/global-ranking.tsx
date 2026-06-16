/**
 * Global Ranking — Redirects to unified leaderboard hub.
 * The global ranking features are now integrated into the Players tab of /leaderboard.
 */
import { useEffect } from 'react';
import { router } from 'expo-router';

export default function GlobalRankingRedirect() {
  useEffect(() => {
    router.replace('/leaderboard' as any);
  }, []);
  return null;
}
