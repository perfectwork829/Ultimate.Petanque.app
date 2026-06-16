/**
 * Maintenance Service
 *
 * Fetches maintenance status from app_config table.
 * Used by MaintenanceBanner to display maintenance warnings/countdown.
 * Admins can trigger maintenance mode + push notifications.
 */

import { getSupabaseClient } from '@/template';
import { triggerServerPush } from '@/services/pushTokenService';

export interface MaintenanceStatus {
  isActive: boolean;
  isScheduled: boolean;
  messageFr: string | null;
  messageEn: string | null;
  endTime: string | null;
  startedAt: string | null;
  scheduledAt: string | null;
  scheduledMessageFr: string | null;
  scheduledMessageEn: string | null;
  scheduledDurationMinutes: number | null;
  scheduledSendPush: boolean;
}

/**
 * Fetch current maintenance status from app_config.
 * Uses anon-accessible RLS policy so it works for all users.
 */
const DEFAULT_STATUS: MaintenanceStatus = {
  isActive: false, isScheduled: false, messageFr: null, messageEn: null,
  endTime: null, startedAt: null, scheduledAt: null,
  scheduledMessageFr: null, scheduledMessageEn: null,
  scheduledDurationMinutes: null, scheduledSendPush: false,
};

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'main')
      .single();

    if (error || !data) return { ...DEFAULT_STATUS };

    const now = Date.now();
    const scheduledAt = data.scheduled_maintenance_at;
    const isScheduledFuture = !!scheduledAt && new Date(scheduledAt).getTime() > now;
    // Scheduled time passed but maintenance_mode not yet formally enabled
    const isScheduledPast = !!scheduledAt && new Date(scheduledAt).getTime() <= now && !data.maintenance_mode;

    // Compute end time for auto-activated scheduled maintenance
    let computedEndTime = data.maintenance_end_time;
    if (isScheduledPast && data.scheduled_duration_minutes && !computedEndTime) {
      computedEndTime = new Date(new Date(scheduledAt).getTime() + data.scheduled_duration_minutes * 60000).toISOString();
    }

    return {
      isActive: data.maintenance_mode === true || isScheduledPast,
      isScheduled: isScheduledFuture,
      messageFr: data.maintenance_mode ? data.maintenance_message_fr : (isScheduledPast ? data.scheduled_message_fr : data.maintenance_message_fr),
      messageEn: data.maintenance_mode ? data.maintenance_message_en : (isScheduledPast ? data.scheduled_message_en : data.maintenance_message_en),
      endTime: computedEndTime,
      startedAt: data.maintenance_started_at || (isScheduledPast ? scheduledAt : null),
      scheduledAt: scheduledAt,
      scheduledMessageFr: data.scheduled_message_fr,
      scheduledMessageEn: data.scheduled_message_en,
      scheduledDurationMinutes: data.scheduled_duration_minutes,
      scheduledSendPush: data.scheduled_send_push ?? false,
    };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

/**
 * Enable maintenance mode (admin only).
 * Optionally sends push notification to all users.
 */
export async function enableMaintenance(params: {
  messageFr: string;
  messageEn: string;
  endTime?: string;
  sendPush?: boolean;
}): Promise<{ error: string | null; pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('app_config')
      .update({
        maintenance_mode: true,
        maintenance_message_fr: params.messageFr,
        maintenance_message_en: params.messageEn,
        maintenance_end_time: params.endTime || null,
        maintenance_started_at: now,
        updated_at: now,
      })
      .eq('id', 'main');

    if (error) return { error: error.message };

    // Send push notification to all users
    let pushResult = { sent: 0, errors: 0 };
    if (params.sendPush) {
      pushResult = await triggerServerPush('maintenance', {
        messageFr: params.messageFr,
        messageEn: params.messageEn,
        endTime: params.endTime || null,
      }).catch(() => ({ sent: 0, errors: 0 }));
    }

    return { error: null, pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Schedule maintenance for a future date/time (admin only).
 */
export async function scheduleMaintenance(params: {
  scheduledAt: string;
  messageFr: string;
  messageEn: string;
  durationMinutes?: number;
  sendPush?: boolean;
}): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('app_config')
      .update({
        scheduled_maintenance_at: params.scheduledAt,
        scheduled_message_fr: params.messageFr,
        scheduled_message_en: params.messageEn,
        scheduled_duration_minutes: params.durationMinutes || null,
        scheduled_send_push: params.sendPush ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Cancel a scheduled maintenance (admin only).
 */
export async function cancelScheduledMaintenance(): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('app_config')
      .update({
        scheduled_maintenance_at: null,
        scheduled_message_fr: null,
        scheduled_message_en: null,
        scheduled_duration_minutes: null,
        scheduled_send_push: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Auto-activate a scheduled maintenance that has reached its start time.
 * Only succeeds for admin users (RLS). Silently fails for others.
 * Copies scheduled fields to active fields, clears schedule, optionally sends push.
 */
export async function autoActivateScheduledMaintenance(status: MaintenanceStatus): Promise<{ pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();
    const endTime = status.scheduledDurationMinutes && status.scheduledAt
      ? new Date(new Date(status.scheduledAt).getTime() + status.scheduledDurationMinutes * 60000).toISOString()
      : null;

    const { error } = await supabase
      .from('app_config')
      .update({
        maintenance_mode: true,
        maintenance_message_fr: status.scheduledMessageFr,
        maintenance_message_en: status.scheduledMessageEn,
        maintenance_end_time: endTime,
        maintenance_started_at: status.scheduledAt || new Date().toISOString(),
        scheduled_maintenance_at: null,
        scheduled_message_fr: null,
        scheduled_message_en: null,
        scheduled_duration_minutes: null,
        scheduled_send_push: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');

    if (error) return {}; // Silently fail (likely non-admin)

    // Send push if configured
    let pushResult = { sent: 0, errors: 0 };
    if (status.scheduledSendPush) {
      pushResult = await triggerServerPush('maintenance', {
        messageFr: status.scheduledMessageFr,
        messageEn: status.scheduledMessageEn,
        endTime,
      }).catch(() => ({ sent: 0, errors: 0 }));
    }

    return { pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch {
    return {};
  }
}

/**
 * Disable maintenance mode (admin only).
 * Optionally sends a recap push notification to all users.
 */
export async function disableMaintenance(params?: {
  sendRecapPush?: boolean;
  recapMessageFr?: string;
  recapMessageEn?: string;
}): Promise<{ error: string | null; pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('app_config')
      .update({
        maintenance_mode: false,
        maintenance_message_fr: null,
        maintenance_message_en: null,
        maintenance_end_time: null,
        maintenance_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');

    if (error) return { error: error.message };

    // Send recap push notification
    let pushResult = { sent: 0, errors: 0 };
    if (params?.sendRecapPush) {
      pushResult = await triggerServerPush('maintenance_end', {
        messageFr: params.recapMessageFr || null,
        messageEn: params.recapMessageEn || null,
      }).catch(() => ({ sent: 0, errors: 0 }));
    }

    return { error: null, pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============================================================
// Maintenance History (maintenance_logs table)
// ============================================================

export interface MaintenanceLogEntry {
  id: string;
  adminUserId: string;
  adminName: string | null;
  action: 'enabled' | 'disabled';
  messageFr: string | null;
  messageEn: string | null;
  endTime: string | null;
  pushSent: boolean;
  pushSentCount: number;
  pushErrorCount: number;
  createdAt: string;
}

/**
 * Log a maintenance action to maintenance_logs (admin only).
 */
export async function logMaintenanceAction(params: {
  action: 'enabled' | 'disabled';
  adminName?: string;
  messageFr?: string;
  messageEn?: string;
  endTime?: string;
  pushSent?: boolean;
  pushSentCount?: number;
  pushErrorCount?: number;
}): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Not authenticated' };

    const { error } = await supabase.from('maintenance_logs').insert({
      admin_user_id: userData.user.id,
      admin_name: params.adminName || null,
      action: params.action,
      message_fr: params.messageFr || null,
      message_en: params.messageEn || null,
      end_time: params.endTime || null,
      push_sent: params.pushSent ?? false,
      push_sent_count: params.pushSentCount ?? 0,
      push_error_count: params.pushErrorCount ?? 0,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Fetch maintenance history from maintenance_logs (admin only).
 */
export async function getMaintenanceHistory(limit = 20): Promise<{ logs: MaintenanceLogEntry[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('maintenance_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { logs: [], error: error.message };

    const logs: MaintenanceLogEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name,
      action: row.action,
      messageFr: row.message_fr,
      messageEn: row.message_en,
      endTime: row.end_time,
      pushSent: row.push_sent,
      pushSentCount: row.push_sent_count || 0,
      pushErrorCount: row.push_error_count || 0,
      createdAt: row.created_at,
    }));

    return { logs, error: null };
  } catch (e: any) {
    return { logs: [], error: e.message };
  }
}
