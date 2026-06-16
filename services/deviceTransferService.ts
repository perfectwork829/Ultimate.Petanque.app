/**
 * Device Transfer Service
 * Allows users to request transferring their account to a new device.
 * Generates a time-limited transfer code that an admin validates.
 */
import { getSupabaseClient } from '@/template';
import { getDeviceFingerprint } from './deviceFingerprintService';

export interface DeviceTransferRequest {
  id: string;
  userId: string;
  transferCode: string;
  oldFingerprint: string | null;
  newFingerprint: string | null;
  status: 'pending' | 'validated' | 'expired' | 'cancelled';
  expiresAt: string;
  validatedBy: string | null;
  validatedAt: string | null;
  createdAt: string;
  // Joined fields (admin view)
  userEmail?: string;
  username?: string;
}

/**
 * Generate a 6-character transfer code.
 */
function generateTransferCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a device transfer request (user-facing).
 * Generates a code valid for 48 hours.
 */
export async function createTransferRequest(): Promise<{ request: DeviceTransferRequest | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { request: null, error: 'Not authenticated' };

    // Check for existing pending request
    const { data: existing } = await supabase
      .from('device_transfer_requests')
      .select('id, status, expires_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return { request: null, error: 'A pending transfer request already exists' };
    }

    const fingerprint = await getDeviceFingerprint();
    const code = generateTransferCode();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const { data, error } = await supabase
      .from('device_transfer_requests')
      .insert({
        user_id: user.id,
        transfer_code: code,
        old_fingerprint: fingerprint,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) return { request: null, error: error.message };
    return { request: mapRequest(data), error: null };
  } catch (e: any) {
    return { request: null, error: e.message || 'Failed to create transfer request' };
  }
}

/**
 * Get the current user's active transfer request (if any).
 */
export async function getMyTransferRequest(): Promise<{ request: DeviceTransferRequest | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { request: null, error: null };

    const { data, error } = await supabase
      .from('device_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { request: null, error: error.message };
    if (!data) return { request: null, error: null };
    return { request: mapRequest(data), error: null };
  } catch (e: any) {
    return { request: null, error: e.message };
  }
}

/**
 * Cancel the current user's pending transfer request.
 */
export async function cancelTransferRequest(requestId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('device_transfer_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Admin: Fetch all pending transfer requests.
 */
export async function fetchPendingTransferRequests(): Promise<{ requests: DeviceTransferRequest[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_transfer_requests')
      .select('*, user_profiles!device_transfer_requests_user_id_fkey(email, username)')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) return { requests: [], error: error.message };
    return {
      requests: (data || []).map((d: any) => ({
        ...mapRequest(d),
        userEmail: d.user_profiles?.email,
        username: d.user_profiles?.username,
      })),
      error: null,
    };
  } catch (e: any) {
    return { requests: [], error: e.message };
  }
}

/**
 * Admin: Validate a transfer request — unlinks old device and allows new device binding.
 */
export async function validateTransferRequest(requestId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Get the transfer request
    const { data: req, error: fetchErr } = await supabase
      .from('device_transfer_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !req) return { error: 'Transfer request not found' };
    if (req.status !== 'pending') return { error: 'Request is not pending' };
    if (new Date(req.expires_at) < new Date()) return { error: 'Request has expired' };

    // Delete all device registrations for this user (unlink old device)
    await supabase
      .from('device_registrations')
      .delete()
      .eq('user_id', req.user_id);

    // Also delete by old fingerprint if available
    if (req.old_fingerprint) {
      await supabase
        .from('device_registrations')
        .delete()
        .eq('device_fingerprint', req.old_fingerprint)
        .eq('email', (await supabase.from('user_profiles').select('email').eq('id', req.user_id).single()).data?.email || '');
    }

    // Mark as validated
    const { error } = await supabase
      .from('device_transfer_requests')
      .update({
        status: 'validated',
        validated_by: user.id,
        validated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) return { error: error.message };

    // Send push notification to the user that their transfer was validated
    _sendDeviceTransferPush(supabase, req.user_id, 'validated').catch(() => {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to validate' };
  }
}

/**
 * Admin: Reject a transfer request.
 */
export async function rejectTransferRequest(requestId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Get the request first to send push
    const { data: req } = await supabase
      .from('device_transfer_requests')
      .select('user_id')
      .eq('id', requestId)
      .single();

    const { error } = await supabase
      .from('device_transfer_requests')
      .update({ status: 'expired' })
      .eq('id', requestId);
    if (error) return { error: error.message };

    // Send push notification about rejection
    if (req?.user_id) {
      _sendDeviceTransferPush(supabase, req.user_id, 'rejected').catch(() => {});
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============================================
// Push Notification Helper
// ============================================

async function _sendDeviceTransferPush(
  supabase: any,
  targetUserId: string,
  decision: 'validated' | 'rejected'
): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        type: 'device_transfer_decision',
        payload: {
          targetUserId,
          decision,
        },
      },
    });
  } catch { /* silent */ }
}

// ============================================
// Mapper
// ============================================

function mapRequest(row: any): DeviceTransferRequest {
  return {
    id: row.id,
    userId: row.user_id,
    transferCode: row.transfer_code,
    oldFingerprint: row.old_fingerprint,
    newFingerprint: row.new_fingerprint,
    status: row.status,
    expiresAt: row.expires_at,
    validatedBy: row.validated_by,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
  };
}
