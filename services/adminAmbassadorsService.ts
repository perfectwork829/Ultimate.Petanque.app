import type { SupabaseClient } from '@supabase/supabase-js';

export type AmbassadorAdminPatch = Record<string, string | number | boolean | null>;

const MIGRATION_FILE = 'database/migrations/20260519_ambassadors_admin_patch.sql';

const RLS_HINT_FR =
  'Enregistrement bloque par Supabase (RLS). Ouvrez Supabase → SQL Editor et executez le fichier ' +
  MIGRATION_FILE;

const RLS_HINT_EN =
  'Save blocked by Supabase (RLS). Open Supabase → SQL Editor and run ' + MIGRATION_FILE;

export function getAmbassadorRlsHintMessage(language?: string): string {
  return language === 'fr' ? RLS_HINT_FR : RLS_HINT_EN;
}

function isRlsError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('row-level security') || m.includes('rls') || m.includes('42501');
}

function isRpcNotFound(message: string): boolean {
  return (
    message.includes('admin_patch_ambassador') ||
    message.includes('admin_insert_ambassador') ||
    message.includes('Could not find the function') ||
    message.includes('PGRST202')
  );
}

function formatAdminError(message: string, language?: string): string {
  if (isRlsError(message)) {
    return getAmbassadorRlsHintMessage(language);
  }
  return message;
}

/** Build jsonb-safe patch (booleans stay boolean for RPC). */
function toRpcPatch(patch: AmbassadorAdminPatch): Record<string, unknown> {
  return { ...patch };
}

/**
 * Admin-only update for sponsors/partners (ambassadors table).
 * Prefer security-definer RPC; fall back to direct update only if RPC is missing.
 */
export async function patchAmbassadorForAdmin(
  supabase: SupabaseClient,
  id: string,
  patch: AmbassadorAdminPatch,
  language?: string
): Promise<{ error: string | null }> {
  const rpcPatch = toRpcPatch(patch);

  const { error: rpcError } = await supabase.rpc('admin_patch_ambassador', {
    p_id: id,
    p_patch: rpcPatch,
  });

  if (!rpcError) {
    return { error: null };
  }

  if (!isRpcNotFound(rpcError.message)) {
    return { error: formatAdminError(rpcError.message, language) };
  }

  const payload = { ...patch, updated_at: new Date().toISOString() };
  const { error: updateError } = await supabase.from('ambassadors').update(payload).eq('id', id);

  if (!updateError) {
    return { error: null };
  }

  return { error: formatAdminError(updateError.message, language) };
}

/**
 * Admin-only insert for new sponsor/partner/ambassador rows.
 */
export async function insertAmbassadorForAdmin(
  supabase: SupabaseClient,
  row: AmbassadorAdminPatch & { user_id: string; display_name: string },
  language?: string
): Promise<{ error: string | null; id?: string }> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_insert_ambassador', {
    p_row: row,
  });

  if (!rpcError) {
    const id = typeof rpcData === 'string' ? rpcData : (rpcData as { id?: string } | null)?.id;
    return { error: null, id: id ?? undefined };
  }

  if (!isRpcNotFound(rpcError.message)) {
    return { error: formatAdminError(rpcError.message, language) };
  }

  const { data, error: insertError } = await supabase.from('ambassadors').insert(row).select('id').single();

  if (!insertError) {
    return { error: null, id: data?.id };
  }

  return { error: formatAdminError(insertError.message, language) };
}
