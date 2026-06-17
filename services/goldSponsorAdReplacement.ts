import { AppState, type AppStateStatus } from 'react-native';
import { fetchAmbassadors, type Ambassador } from '@/services/ambassadorService';

type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

/** Whether a gold sponsor currently replaces AdMob for non-premium users. */
let goldSponsorBlocksAds = false;
let appStateBound = false;

export function subscribeGoldSponsorAdRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

function notifyGoldSponsorAdRefresh(): void {
  refreshListeners.forEach(listener => {
    try {
      listener();
    } catch {
      /* listener error */
    }
  });
}

function setGoldSponsorBlocksAds(blocks: boolean): void {
  if (blocks === goldSponsorBlocksAds) return;
  goldSponsorBlocksAds = blocks;
  notifyGoldSponsorAdRefresh();
}

export function hasActiveGoldSponsorAdReplacement(): boolean {
  return goldSponsorBlocksAds;
}

/** Active gold sponsor that replaces banner/interstitial ads (non-premium users). */
export async function getActiveGoldSponsorForAdReplacement(
  options?: { forceRefresh?: boolean },
): Promise<Ambassador | null> {
  const { ambassadors } = await fetchAmbassadors({ forceRefresh: options?.forceRefresh });
  const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor' && a.isActive) || null;
  setGoldSponsorBlocksAds(!!gold);
  return gold;
}

/** Refresh gold sponsor ad-replacement state from the server (bypasses ambassador cache). */
export async function syncGoldSponsorAdReplacement(): Promise<boolean> {
  await getActiveGoldSponsorForAdReplacement({ forceRefresh: true });
  notifyGoldSponsorAdRefresh();
  return goldSponsorBlocksAds;
}

/** Re-sync when ambassador cache is cleared (e.g. admin tier change on this device). */
export async function onAmbassadorCacheInvalidated(): Promise<void> {
  try {
    await getActiveGoldSponsorForAdReplacement({ forceRefresh: true });
  } catch {
    setGoldSponsorBlocksAds(false);
  }
  notifyGoldSponsorAdRefresh();
}

/** Re-fetch gold sponsor state when the app returns to the foreground. */
export function bindGoldSponsorSyncOnAppResume(): void {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      syncGoldSponsorAdReplacement().catch(() => {});
    }
  });
}
