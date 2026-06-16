/**
 * Push Quota Service
 * Fetches and computes push notification quota usage for ambassadors and sponsors.
 * Quotas reset automatically on the 1st of each month (computed dynamically).
 */
import { getSupabaseClient } from '@/template';

export interface PushQuotaInfo {
  used: number;
  limit: number; // 0 = not allowed, -1 = unlimited
  remaining: number; // -1 = unlimited
  resetDate: string; // ISO string of next month 1st
  resetLabel: string; // "1er avril" or "April 1"
  percentage: number; // 0-100
  isUnlimited: boolean;
  canSend: boolean;
}

/** Compute the start of the current month */
function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Compute next month 1st date */
function getNextResetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

/** Get days remaining until quota reset */
export function getDaysUntilReset(): number {
  const now = new Date();
  const reset = getNextResetDate();
  return Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get push notification limit based on badge type and level.
 * Returns -1 for unlimited, 0 for not allowed.
 */
function getPushLimit(badgeType: string, ambassadorLevel?: string): number {
  switch (badgeType) {
    case 'gold_sponsor':
      return -1; // unlimited
    case 'sponsor': // silver
      return 1;
    case 'bronze_sponsor':
      return 0;
    case 'ambassador':
      switch (ambassadorLevel) {
        case 'elite': return -1; // unlimited
        case 'confirme': return 1;
        case 'decouverte':
        default: return 0;
      }
    default:
      return 0;
  }
}

/**
 * Fetch push quota info for a specific ambassador/sponsor.
 */
export async function fetchPushQuota(
  ambassadorId: string,
  badgeType: string,
  ambassadorLevel?: string,
  language: string = 'fr'
): Promise<PushQuotaInfo> {
  const limit = getPushLimit(badgeType, ambassadorLevel);
  const isUnlimited = limit === -1;
  const resetDate = getNextResetDate();

  const resetLabel = language === 'fr'
    ? `${resetDate.getDate()} ${resetDate.toLocaleDateString('fr-FR', { month: 'long' })}`
    : resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  if (limit === 0) {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      resetDate: resetDate.toISOString(),
      resetLabel,
      percentage: 0,
      isUnlimited: false,
      canSend: false,
    };
  }

  // Fetch usage for current month
  const supabase = getSupabaseClient();
  const startOfMonth = getStartOfMonth();

  try {
    const { data, error } = await supabase
      .from('ambassador_analytics')
      .select('id')
      .eq('ambassador_id', ambassadorId)
      .eq('event_type', 'sponsor_push')
      .gte('created_at', startOfMonth.toISOString());

    const used = error ? 0 : (data?.length || 0);
    const remaining = isUnlimited ? -1 : Math.max(0, limit - used);
    const percentage = isUnlimited ? 0 : (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

    return {
      used,
      limit,
      remaining,
      resetDate: resetDate.toISOString(),
      resetLabel,
      percentage,
      isUnlimited,
      canSend: isUnlimited || remaining > 0,
    };
  } catch {
    return {
      used: 0,
      limit,
      remaining: isUnlimited ? -1 : limit,
      resetDate: resetDate.toISOString(),
      resetLabel,
      percentage: 0,
      isUnlimited,
      canSend: limit !== 0,
    };
  }
}
