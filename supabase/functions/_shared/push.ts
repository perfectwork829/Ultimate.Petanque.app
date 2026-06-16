/**
 * Expo Push Notification utility for Edge Functions.
 * Uses the Expo Push API to send notifications to devices.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export interface PushMessage {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number; // seconds
}

export interface PushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Send push notifications in batches of 100 (Expo API limit).
 * Returns array of tickets for each message.
 */
export async function sendPushNotifications(messages: PushMessage[]): Promise<PushTicket[]> {
  if (messages.length === 0) return [];

  // Filter only valid Expo push tokens
  const validMessages = messages.filter(m => m.to && m.to.startsWith('ExponentPushToken['));
  if (validMessages.length === 0) return [];

  const allTickets: PushTicket[] = [];

  // Batch in groups of 100
  for (let i = 0; i < validMessages.length; i += 100) {
    const batch = validMessages.slice(i, i + 100);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[push] Expo API error (${response.status}):`, errText);
        batch.forEach(() => allTickets.push({ status: 'error', message: `HTTP ${response.status}` }));
        continue;
      }

      const result = await response.json();
      const tickets: PushTicket[] = result.data || [];
      allTickets.push(...tickets);

      // Log errors
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          console.error(`[push] Error sending to ${batch[idx]?.to}:`, ticket.message, ticket.details?.error);
        }
      });
    } catch (err: any) {
      console.error('[push] Network error:', err.message);
      batch.forEach(() => allTickets.push({ status: 'error', message: err.message }));
    }
  }

  return allTickets;
}

/**
 * Build a push message with sensible defaults.
 */
export function buildPushMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  options?: { channelId?: string; badge?: number; priority?: 'default' | 'normal' | 'high'; ttl?: number }
): PushMessage {
  return {
    to: token,
    title,
    body,
    data: data || {},
    sound: 'default',
    badge: options?.badge ?? 1,
    channelId: options?.channelId,
    priority: options?.priority ?? 'high',
    ttl: options?.ttl ?? 86400, // 24 hours
  };
}

/**
 * Check push notification receipts to verify actual delivery.
 * Call this with ticket IDs from a previous send (after ~15 minutes).
 * Returns receipt status for each ticket.
 */
export interface PushReceipt {
  id: string;
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export async function getPushReceipts(ticketIds: string[]): Promise<Map<string, PushReceipt>> {
  const receiptMap = new Map<string, PushReceipt>();
  if (ticketIds.length === 0) return receiptMap;

  // Batch in groups of 300 (Expo API limit for receipts)
  for (let i = 0; i < ticketIds.length; i += 300) {
    const batch = ticketIds.slice(i, i + 300);
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: batch }),
      });

      if (!response.ok) {
        console.error(`[push] Receipts API error (${response.status}):`, await response.text());
        continue;
      }

      const result = await response.json();
      const receipts = result.data || {};

      for (const [id, receipt] of Object.entries(receipts)) {
        const r = receipt as any;
        receiptMap.set(id, {
          id,
          status: r.status || 'error',
          message: r.message,
          details: r.details,
        });
      }
    } catch (err: any) {
      console.error('[push] Receipts network error:', err.message);
    }
  }

  return receiptMap;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
