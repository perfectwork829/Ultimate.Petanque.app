import { fetchAmbassadors, type Ambassador } from '@/services/ambassadorService';

type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

/** Whether a gold sponsor currently replaces AdMob for non-premium users. */
let goldSponsorBlocksAds = false;

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

export function hasActiveGoldSponsorAdReplacement(): boolean {
  return goldSponsorBlocksAds;
}

/** Active gold sponsor that replaces banner/interstitial ads (non-premium users). */
export async function getActiveGoldSponsorForAdReplacement(): Promise<Ambassador | null> {
  const { ambassadors } = await fetchAmbassadors();
  const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor' && a.isActive) || null;
  goldSponsorBlocksAds = !!gold;
  return gold;
}

/** Refresh gold sponsor ad-replacement state from the server. */
export async function syncGoldSponsorAdReplacement(): Promise<boolean> {
  await getActiveGoldSponsorForAdReplacement();
  notifyGoldSponsorAdRefresh();
  return goldSponsorBlocksAds;
}

/** Called when ambassador list cache is cleared — resets ad block until next sync. */
export function onAmbassadorCacheInvalidated(): void {
  goldSponsorBlocksAds = false;
  notifyGoldSponsorAdRefresh();
}
