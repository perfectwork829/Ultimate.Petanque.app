// ============================================
// DEVICE FINGERPRINT SERVICE
// Generates device fingerprint and enforces
// account creation cooldown
// ============================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getSupabaseClient } from '@/template';

const STORAGE_KEY = '@device_registration_history';
const MAX_ACCOUNTS_PER_DEVICE = 1;
const COOLDOWN_HOURS = 24; // hours between account creations

/**
 * QA/dev can explicitly disable this with EXPO_PUBLIC_SKIP_DEVICE_ACCOUNT_LIMIT=true.
 * Do NOT disable automatically in __DEV__, otherwise the one-account-per-device
 * security rule does not run in emulator/dev builds.
 */
function isDeviceAccountLimitDisabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_SKIP_DEVICE_ACCOUNT_LIMIT;
  return flag === '1' || flag === 'true';
}

interface DeviceRegistrationHistory {
  fingerprint: string;
  registrations: { email: string; date: string }[];
}

export type DeviceBindingResult = {
  allowed: boolean;
  reason?: string;
  bound?: boolean;
  alreadyBound?: boolean;
};

/**
 * Generate a stable device fingerprint using available platform info
 */
export async function getDeviceFingerprint(): Promise<string> {
  try {
    let parts: string[] = [Platform.OS, Platform.Version?.toString() || 'unknown'];

    // Try expo-device for more info
    try {
      const Device = require('expo-device');
      if (Device?.brand) parts.push(Device.brand);
      if (Device?.modelName) parts.push(Device.modelName);
      if (Device?.osName) parts.push(Device.osName);
      if (Device?.deviceYearClass) parts.push(String(Device.deviceYearClass));
    } catch { /* silent - expo-device may not be available */ }

    // Try expo-application for app-level ID
    try {
      const Application = require('expo-application');
      if (Platform.OS === 'android' && Application?.getAndroidId) {
        const androidId = await Application.getAndroidId();
        if (androidId) parts.push(androidId);
      } else if (Platform.OS === 'ios') {
        const installId = await Application?.getInstallationTimeAsync?.();
        if (installId) parts.push(String(installId));
      }
    } catch { /* silent */ }

    // Add a persistent random ID as fallback (generated once per install)
    let persistentId = await AsyncStorage.getItem('@device_persistent_id');
    if (!persistentId) {
      persistentId = generateRandomId();
      await AsyncStorage.setItem('@device_persistent_id', persistentId);
    }
    parts.push(persistentId);

    // Create a simple hash from all parts
    const raw = parts.join('|');
    return simpleHash(raw);
  } catch {
    // Ultimate fallback
    let fallbackId = await AsyncStorage.getItem('@device_persistent_id');
    if (!fallbackId) {
      fallbackId = generateRandomId();
      await AsyncStorage.setItem('@device_persistent_id', fallbackId);
    }
    return simpleHash(`${Platform.OS}|${fallbackId}`);
  }
}

/**
 * Check if device can create a new account
 * Returns { allowed, reason } 
 */
export async function canCreateAccount(email: string): Promise<{ allowed: boolean; reason?: string }> {
  if (isDeviceAccountLimitDisabled()) {
    return { allowed: true };
  }
  try {
    const fingerprint = await getDeviceFingerprint();

    // 1. Check local history first (fast)
    const localHistory = await getLocalHistory();
    if (localHistory) {
      const normalizedEmail = email.toLowerCase();
      const alreadyRegisteredThisEmail = localHistory.registrations.some(
        r => r.email.toLowerCase() === normalizedEmail
      );

      // Same email = allow retry/recovery flow. Do this before max-account check.
      if (alreadyRegisteredThisEmail) {
        return { allowed: true };
      }

      // Check max accounts
      if (localHistory.registrations.length >= MAX_ACCOUNTS_PER_DEVICE) {
        return { allowed: false, reason: 'max_accounts_reached' };
      }

      // Check cooldown
      const lastRegistration = localHistory.registrations[localHistory.registrations.length - 1];
      if (lastRegistration) {
        const lastDate = new Date(lastRegistration.date);
        const hoursSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < COOLDOWN_HOURS) {
          return { allowed: false, reason: 'cooldown_active' };
        }
      }
    }

    // 2. Check server-side (comprehensive)
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .select('email, registered_at')
      .eq('device_fingerprint', fingerprint)
      .order('registered_at', { ascending: false })
      .limit(MAX_ACCOUNTS_PER_DEVICE + 1);

    if (!error && data) {
      // Filter registrations in the last 30 days
      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - 30);
      const recentRegistrations = data.filter(d => new Date(d.registered_at) > recentCutoff);

      if (recentRegistrations.length >= MAX_ACCOUNTS_PER_DEVICE) {
        return { allowed: false, reason: 'max_accounts_reached' };
      }

      // Check cooldown from server data
      if (data.length > 0) {
        const lastDate = new Date(data[0].registered_at);
        const hoursSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < COOLDOWN_HOURS) {
          // Allow if same email
          if (data[0].email?.toLowerCase() === email.toLowerCase()) {
            return { allowed: true };
          }
          return { allowed: false, reason: 'cooldown_active' };
        }
      }
    }

    return { allowed: true };
  } catch {
    // On error, allow (don't block legitimate users)
    return { allowed: true };
  }
}

/**
 * Record/bind this device to the authenticated account.
 * The operation is idempotent locally and best-effort server-side.
 */
export async function recordDeviceBinding(
  email: string,
  authMethod: string = 'email',
  userId?: string | null
): Promise<{ bound: boolean; alreadyBound: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || isDeviceAccountLimitDisabled()) {
    return { bound: false, alreadyBound: false };
  }

  try {
    const fingerprint = await getDeviceFingerprint();
    const now = new Date().toISOString();

    // Save locally, but do not duplicate the same email.
    const history = await getLocalHistory() || { fingerprint, registrations: [] };
    const alreadyBoundLocally = history.registrations.some(
      r => r.email.toLowerCase() === normalizedEmail
    );

    if (!alreadyBoundLocally) {
      history.registrations.push({ email: normalizedEmail, date: now });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    // Save server-side only if this device/email pair is not already present.
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('device_registrations')
      .select('id')
      .eq('device_fingerprint', fingerprint)
      .eq('email', normalizedEmail)
      .limit(1);

    const alreadyBoundOnServer = Array.isArray(existing) && existing.length > 0;

    if (!alreadyBoundOnServer) {
      await supabase.from('device_registrations').insert({
        device_fingerprint: fingerprint,
        email: normalizedEmail,
        user_id: userId ?? null,
        registered_at: now,
        auth_method: authMethod,
      }).then(() => {}).catch(() => {});
    }

    return {
      bound: true,
      alreadyBound: alreadyBoundLocally || alreadyBoundOnServer,
    };
  } catch {
    return { bound: false, alreadyBound: false };
  }
}

/**
 * Backward-compatible name used by registration code.
 */
export async function recordAccountCreation(
  email: string,
  authMethod: string = 'email',
  userId?: string | null
): Promise<void> {
  await recordDeviceBinding(email, authMethod, userId);
}

/**
 * Check the device rule and bind the device to this account if allowed.
 */
export async function ensureDeviceBoundToAccount(
  email: string,
  authMethod: string = 'email',
  userId?: string | null
): Promise<DeviceBindingResult> {
  const allowedResult = await canLoginOnDevice(email);
  if (!allowedResult.allowed) {
    return allowedResult;
  }

  const binding = await recordDeviceBinding(email, authMethod, userId);
  return {
    allowed: true,
    bound: binding.bound,
    alreadyBound: binding.alreadyBound,
  };
}

/**
 * Check if this device can log in with the given email.
 * Enforces 1-account-per-device: if device is already bound to a different account, block login.
 */
export async function canLoginOnDevice(email: string): Promise<{ allowed: boolean; reason?: string }> {
  if (isDeviceAccountLimitDisabled()) {
    return { allowed: true };
  }
  try {
    const fingerprint = await getDeviceFingerprint();

    // 1. Check local history first
    const localHistory = await getLocalHistory();
    if (localHistory && localHistory.registrations.length > 0) {
      const boundEmails = new Set(localHistory.registrations.map(r => r.email.toLowerCase()));
      // If device is bound to a different email, block
      if (boundEmails.size > 0 && !boundEmails.has(email.toLowerCase())) {
        return { allowed: false, reason: 'device_bound_to_other_account' };
      }
    }

    // 2. Check server-side
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .select('email')
      .eq('device_fingerprint', fingerprint)
      .order('registered_at', { ascending: false })
      .limit(5);

    if (!error && data && data.length > 0) {
      const serverEmails = new Set(data.map((d: any) => (d.email || '').toLowerCase()).filter(Boolean));
      if (serverEmails.size > 0 && !serverEmails.has(email.toLowerCase())) {
        return { allowed: false, reason: 'device_bound_to_other_account' };
      }
    }

    return { allowed: true };
  } catch {
    // On error, allow (don't block legitimate users)
    return { allowed: true };
  }
}

/**
 * Admin: Fetch all device registrations for management
 */
export async function fetchDeviceRegistrations(): Promise<{ registrations: Array<{ id: string; fingerprint: string; email: string; userId: string | null; registeredAt: string; ipHint: string | null }>; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .select('id, device_fingerprint, email, user_id, registered_at, ip_hint, auth_method')
      .order('registered_at', { ascending: false })
      .limit(200);
    if (error) return { registrations: [], error: error.message };
    return {
      registrations: (data || []).map((d: any) => ({
        id: d.id,
        fingerprint: d.device_fingerprint,
        email: d.email || '',
        userId: d.user_id,
        registeredAt: d.registered_at,
        ipHint: d.ip_hint,
        authMethod: d.auth_method || 'email',
      })),
      error: null,
    };
  } catch (e: any) {
    return { registrations: [], error: e.message || 'Failed to fetch' };
  }
}

/**
 * Admin: Unlink a device from an account by deleting the device registration record.
 * This allows the user to register/login on a new device, or allows a new user on this device.
 */
export async function adminUnlinkDevice(registrationId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('device_registrations')
      .delete()
      .eq('id', registrationId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message || 'Failed to unlink' };
  }
}

/**
 * Admin: Unlink ALL registrations for a specific device fingerprint
 */
export async function adminUnlinkAllForDevice(fingerprint: string): Promise<{ error: string | null; count: number }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('device_registrations')
      .delete()
      .eq('device_fingerprint', fingerprint)
      .select('id');
    if (error) return { error: error.message, count: 0 };
    return { error: null, count: data?.length || 0 };
  } catch (e: any) {
    return { error: e.message || 'Failed to unlink', count: 0 };
  }
}

/**
 * Post-OAuth device binding check.
 * Called after Google OAuth completes to verify the authenticated email matches the device binding.
 * Returns { allowed: true } if OK, or { allowed: false, reason } if device is bound to another account.
 */
export async function checkPostOAuthDeviceBinding(email: string): Promise<{ allowed: boolean; reason?: string }> {
  return canLoginOnDevice(email);
}

// ============================================
// HELPERS
// ============================================

/**
 * Clears on-device registration history only (dev / support).
 * Server rows in device_registrations must be removed separately (Admin → Anti-cheat or SQL).
 */
export async function clearLocalDeviceRegistrationHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* silent */ }
}

async function getLocalHistory(): Promise<DeviceRegistrationHistory | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* silent */ }
  return null;
}

function generateRandomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  // Convert to hex and pad
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Generate a longer fingerprint by hashing in sections
  let hash2 = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    const char = str.charCodeAt(i);
    hash2 = ((hash2 << 7) - hash2) + char;
    hash2 |= 0;
  }
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  return `${hex}-${hex2}`;
}
