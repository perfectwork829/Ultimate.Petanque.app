/**
 * Ranking Change Detection Service
 *
 * Compares leaderboard rankings before and after a match is saved,
 * then triggers server-side push notifications for players whose rank changed.
 */
import { fetchLeaderboard, sortLeaderboard, LEADERBOARD_MIN_MATCHES } from '@/services/leaderboardService';
import { triggerServerPush } from '@/services/pushTokenService';

export interface RankChange {
  userId: string;
  playerName: string;
  oldRank: number;
  newRank: number;
  direction: 'up' | 'down';
}

// In-memory snapshot of the last known rankings (userId → rank)
let _lastRankings: Map<string, { rank: number; name: string }> = new Map();
let _initialized = false;

/**
 * Take a snapshot of the current leaderboard rankings.
 * Call this BEFORE saving a match to capture the "before" state.
 */
export async function snapshotRankings(): Promise<void> {
  try {
    const { players, error } = await fetchLeaderboard();
    if (error || !players || players.length === 0) return;

    const sorted = sortLeaderboard(players, 'winRate');
    _lastRankings = new Map();

    sorted.forEach((player, index) => {
      if (player.userId) {
        _lastRankings.set(player.userId, {
          rank: index + 1,
          name: player.name,
        });
      }
    });

    _initialized = true;
    console.log(`[rankingChange] Snapshot taken: ${_lastRankings.size} ranked players`);
  } catch (e) {
    console.log('[rankingChange] Snapshot error:', e);
  }
}

/**
 * Compare the current leaderboard with the last snapshot and detect rank changes.
 * Call this AFTER saving a match.
 * Returns the list of rank changes detected.
 */
export async function detectRankingChanges(): Promise<RankChange[]> {
  if (!_initialized || _lastRankings.size === 0) {
    console.log('[rankingChange] No previous snapshot, skipping detection');
    return [];
  }

  try {
    const { players, error } = await fetchLeaderboard();
    if (error || !players || players.length === 0) return [];

    const sorted = sortLeaderboard(players, 'winRate');
    const changes: RankChange[] = [];

    // Build new rankings map
    const newRankings = new Map<string, { rank: number; name: string }>();
    sorted.forEach((player, index) => {
      if (player.userId) {
        newRankings.set(player.userId, {
          rank: index + 1,
          name: player.name,
        });
      }
    });

    // Compare with previous snapshot
    for (const [userId, newData] of newRankings.entries()) {
      const oldData = _lastRankings.get(userId);
      if (!oldData) continue; // New entrant — skip (no previous rank to compare)

      if (oldData.rank !== newData.rank) {
        changes.push({
          userId,
          playerName: newData.name,
          oldRank: oldData.rank,
          newRank: newData.rank,
          direction: newData.rank < oldData.rank ? 'up' : 'down',
        });
      }
    }

    // Update snapshot for next comparison
    _lastRankings = newRankings;

    if (changes.length > 0) {
      console.log(`[rankingChange] Detected ${changes.length} rank change(s)`);
    }

    return changes;
  } catch (e) {
    console.log('[rankingChange] Detection error:', e);
    return [];
  }
}

/**
 * Detect ranking changes and notify affected players via server push.
 * This is the main entry point — call after saving a match.
 */
export async function detectAndNotifyRankingChanges(): Promise<void> {
  try {
    const changes = await detectRankingChanges();
    if (changes.length === 0) return;

    // Only notify for significant changes (rank shifted by at least 1)
    const significantChanges = changes.filter(c => Math.abs(c.newRank - c.oldRank) >= 1);
    if (significantChanges.length === 0) return;

    // Fire-and-forget: send push to all affected players
    triggerServerPush('ranking_changed', {
      changes: significantChanges.map(c => ({
        userId: c.userId,
        oldRank: c.oldRank,
        newRank: c.newRank,
        direction: c.direction,
      })),
    }).catch(() => {});

    console.log(`[rankingChange] Notified ${significantChanges.length} player(s) of rank changes`);
  } catch (e) {
    console.log('[rankingChange] Notify error:', e);
  }
}

/**
 * Initialize the ranking snapshot on app startup.
 * Should be called once after user is authenticated and data is loaded.
 */
export async function initRankingSnapshot(): Promise<void> {
  await snapshotRankings();
}
