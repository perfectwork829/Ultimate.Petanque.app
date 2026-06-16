/**
 * Announcement Service
 *
 * Manages admin announcements: create, send push, and fetch history.
 */

import { getSupabaseClient } from '@/template';
import { triggerServerPush } from '@/services/pushTokenService';

export interface Announcement {
  id: string;
  adminUserId: string;
  adminName: string | null;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  targetType: 'all' | 'city' | 'club' | 'level' | 'rank' | 'account_age' | 'match_count' | 'last_active';
  targetValue: string | null;
  pushSentCount: number;
  pushErrorCount: number;
  createdAt: string;
  scheduledAt: string | null;
  status: 'sent' | 'scheduled' | 'cancelled';
  platformBreakdown: { ios?: number; android?: number; unknown?: number } | null;
  abData: {
    variantB?: { titleFr: string; titleEn: string; messageFr: string; messageEn: string };
    variantASent?: number; variantAErrors?: number;
    variantBSent?: number; variantBErrors?: number;
    winner?: 'A' | 'B' | null;
    winnerDeterminedAt?: string;
    resent?: boolean;
    resentAt?: string;
    resentSent?: number;
    resentErrors?: number;
  } | null;
  estimatedOpens: number;
}

export interface CustomTemplate {
  id: string;
  name: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  targetType: string;
  targetValue: string;
  createdAt: string;
}

/**
 * Send an announcement push notification and log it.
 */
export async function sendAnnouncement(params: {
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  targetType: 'all' | 'city' | 'club' | 'level' | 'rank' | 'account_age' | 'match_count' | 'last_active';
  targetValue?: string;
  adminName?: string;
  scheduledAt?: string | null;
  abTest?: boolean;
  variantBTitleFr?: string;
  variantBTitleEn?: string;
  variantBMessageFr?: string;
  variantBMessageEn?: string;
  combinedFilters?: Record<string, string>;
}): Promise<{ error: string | null; pushSent?: number; pushErrors?: number; scheduled?: boolean }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Not authenticated' };

    // Build A/B data if enabled
    const abData = params.abTest ? {
      variantB: {
        titleFr: params.variantBTitleFr || params.titleFr,
        titleEn: params.variantBTitleEn || params.titleEn,
        messageFr: params.variantBMessageFr || params.messageFr,
        messageEn: params.variantBMessageEn || params.messageEn,
      },
    } : null;

    // If scheduled for the future, save without sending
    if (params.scheduledAt) {
      const schedDate = new Date(params.scheduledAt);
      if (schedDate.getTime() > Date.now() + 60000) {
        const { error: logError } = await supabase.from('announcements').insert({
          admin_user_id: userData.user.id,
          admin_name: params.adminName || null,
          title_fr: params.titleFr,
          title_en: params.titleEn,
          message_fr: params.messageFr,
          message_en: params.messageEn,
          target_type: params.targetType,
          target_value: params.targetValue || null,
          push_sent_count: 0,
          push_error_count: 0,
          scheduled_at: params.scheduledAt,
          status: 'scheduled',
          ab_data: abData,
        });
        if (logError) return { error: logError.message };
        return { error: null, pushSent: 0, pushErrors: 0, scheduled: true };
      }
    }

    // Send push via edge function
    const pushPayload: any = {
      titleFr: params.titleFr,
      titleEn: params.titleEn,
      messageFr: params.messageFr,
      messageEn: params.messageEn,
      targetType: params.targetType,
      targetValue: params.targetValue || null,
    };
    if (params.abTest) {
      pushPayload.abTest = true;
      pushPayload.variantBTitleFr = params.variantBTitleFr;
      pushPayload.variantBTitleEn = params.variantBTitleEn;
      pushPayload.variantBMessageFr = params.variantBMessageFr;
      pushPayload.variantBMessageEn = params.variantBMessageEn;
    }
    if (params.combinedFilters) {
      pushPayload.combinedFilters = params.combinedFilters;
    }
    const pushResult = await triggerServerPush('announcement', pushPayload).catch(() => ({ sent: 0, errors: 0 })) as any;

    // Log to announcements table
    const { error: logError } = await supabase.from('announcements').insert({
      admin_user_id: userData.user.id,
      admin_name: params.adminName || null,
      title_fr: params.titleFr,
      title_en: params.titleEn,
      message_fr: params.messageFr,
      message_en: params.messageEn,
      target_type: params.targetType,
      target_value: params.targetValue || null,
      push_sent_count: pushResult.sent || 0,
      push_error_count: pushResult.errors || 0,
      status: 'sent',
      ab_data: params.abTest ? {
        ...abData,
        variantASent: pushResult.variantASent || 0,
        variantAErrors: pushResult.variantAErrors || 0,
        variantBSent: pushResult.variantBSent || 0,
        variantBErrors: pushResult.variantBErrors || 0,
      } : null,
    });

    if (logError) console.log('Error logging announcement:', logError.message);

    return { error: null, pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Cancel a scheduled announcement.
 */
export async function cancelScheduledAnnouncement(id: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('announcements')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'scheduled');
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Send a previously scheduled announcement now.
 */
export async function sendScheduledAnnouncementNow(announcement: Announcement): Promise<{ error: string | null; pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();
    const pushResult = await triggerServerPush('announcement', {
      titleFr: announcement.titleFr,
      titleEn: announcement.titleEn,
      messageFr: announcement.messageFr,
      messageEn: announcement.messageEn,
      targetType: announcement.targetType,
      targetValue: announcement.targetValue || null,
    }).catch(() => ({ sent: 0, errors: 0 }));

    await supabase.from('announcements').update({
      status: 'sent',
      push_sent_count: pushResult.sent || 0,
      push_error_count: pushResult.errors || 0,
    }).eq('id', announcement.id);

    return { error: null, pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Fetch announcement history (admin only).
 */
export async function getAnnouncementHistory(limit = 30): Promise<{ announcements: Announcement[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { announcements: [], error: error.message };

    const announcements: Announcement[] = (data || []).map((row: any) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name,
      titleFr: row.title_fr,
      titleEn: row.title_en,
      messageFr: row.message_fr,
      messageEn: row.message_en,
      targetType: row.target_type,
      targetValue: row.target_value,
      pushSentCount: row.push_sent_count || 0,
      pushErrorCount: row.push_error_count || 0,
      createdAt: row.created_at,
      scheduledAt: row.scheduled_at || null,
      status: row.status || 'sent',
      platformBreakdown: row.platform_breakdown || null,
      abData: row.ab_data || null,
      estimatedOpens: row.estimated_opens || 0,
    }));

    return { announcements, error: null };
  } catch (e: any) {
    return { announcements: [], error: e.message };
  }
}

/**
 * Resend the winning A/B variant to the other half of recipients.
 */
export async function resendWinningVariant(announcement: Announcement, winner: 'A' | 'B'): Promise<{ error: string | null; pushSent?: number; pushErrors?: number }> {
  try {
    const supabase = getSupabaseClient();
    const titleFr = winner === 'B' && announcement.abData?.variantB?.titleFr ? announcement.abData.variantB.titleFr : announcement.titleFr;
    const titleEn = winner === 'B' && announcement.abData?.variantB?.titleEn ? announcement.abData.variantB.titleEn : announcement.titleEn;
    const messageFr = winner === 'B' && announcement.abData?.variantB?.messageFr ? announcement.abData.variantB.messageFr : announcement.messageFr;
    const messageEn = winner === 'B' && announcement.abData?.variantB?.messageEn ? announcement.abData.variantB.messageEn : announcement.messageEn;

    const pushResult = await triggerServerPush('announcement', {
      titleFr,
      titleEn,
      messageFr,
      messageEn,
      targetType: announcement.targetType,
      targetValue: announcement.targetValue || null,
    }).catch(() => ({ sent: 0, errors: 0 }));

    const updatedAbData = {
      ...announcement.abData,
      winner,
      resent: true,
      resentAt: new Date().toISOString(),
      resentSent: pushResult.sent || 0,
      resentErrors: pushResult.errors || 0,
    };
    await supabase.from('announcements').update({ ab_data: updatedAbData }).eq('id', announcement.id);

    return { error: null, pushSent: pushResult.sent, pushErrors: pushResult.errors };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Get distinct cities from players, terrains, and clubs for targeting.
 */
export async function getTargetCities(): Promise<string[]> {
  try {
    const supabase = getSupabaseClient();
    const cities = new Set<string>();

    const { data: players } = await supabase.from('players').select('location').eq('user_id', (await supabase.auth.getUser()).data.user?.id || '');
    // Get from terrains
    const { data: terrains } = await supabase.from('terrains').select('city');
    (terrains || []).forEach((t: any) => { if (t.city) cities.add(t.city); });

    // Get from clubs
    const { data: clubs } = await supabase.from('clubs').select('city');
    (clubs || []).forEach((c: any) => { if (c.city) cities.add(c.city); });

    return [...cities].sort();
  } catch {
    return [];
  }
}

/**
 * Get distinct club names for targeting.
 */
export async function getTargetClubs(): Promise<{ id: string; name: string; city: string }[]> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('clubs').select('id, name, city').order('name');
    return (data || []).map((c: any) => ({ id: c.id, name: c.name, city: c.city }));
  } catch {
    return [];
  }
}
