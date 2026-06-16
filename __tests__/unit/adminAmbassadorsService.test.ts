import {
  getAmbassadorRlsHintMessage,
  patchAmbassadorForAdmin,
  insertAmbassadorForAdmin,
} from '@/services/adminAmbassadorsService';

function makeSupabase(opts: {
  rpcError?: string | null;
  updateError?: string | null;
  insertError?: string | null;
  rpcData?: unknown;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: opts.rpcData ?? null,
    error: opts.rpcError ? { message: opts.rpcError } : null,
  });
  const updateChain = {
    eq: jest.fn().mockReturnThis(),
  };
  const update = jest.fn().mockReturnValue(updateChain);
  updateChain.eq.mockResolvedValue({
    error: opts.updateError ? { message: opts.updateError } : null,
  });

  const insertChain = {
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: opts.insertError ? null : { id: 'new-id' },
      error: opts.insertError ? { message: opts.insertError } : null,
    }),
  };
  const insert = jest.fn().mockReturnValue(insertChain);

  return {
    rpc,
    from: jest.fn((table: string) => {
      if (table !== 'ambassadors') throw new Error('unexpected table');
      return { update, insert };
    }),
  } as any;
}

describe('adminAmbassadorsService', () => {
  test('getAmbassadorRlsHintMessage returns FR/EN paths', () => {
    expect(getAmbassadorRlsHintMessage('fr')).toContain('20260519_ambassadors_admin_patch.sql');
    expect(getAmbassadorRlsHintMessage('en')).toContain('20260519_ambassadors_admin_patch.sql');
  });

  test('patchAmbassadorForAdmin succeeds via RPC', async () => {
    const supabase = makeSupabase({ rpcError: null });
    const { error } = await patchAmbassadorForAdmin(supabase, 'id-1', { is_active: false });
    expect(error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('admin_patch_ambassador', {
      p_id: 'id-1',
      p_patch: { is_active: false },
    });
  });

  test('patchAmbassadorForAdmin maps RLS error to migration hint', async () => {
    const supabase = makeSupabase({
      rpcError: 'Could not find the function admin_patch_ambassador',
      updateError: 'new row violates row-level security policy for table "ambassadors"',
    });
    const { error } = await patchAmbassadorForAdmin(supabase, 'id-1', { is_active: false }, 'en');
    expect(error).toContain('20260519_ambassadors_admin_patch.sql');
  });

  test('insertAmbassadorForAdmin falls back on missing RPC', async () => {
    const supabase = makeSupabase({
      rpcError: 'Could not find the function admin_insert_ambassador',
      insertError: null,
    });
    const { error, id } = await insertAmbassadorForAdmin(
      supabase,
      { user_id: 'u1', display_name: 'Test', is_active: false },
      'fr'
    );
    expect(error).toBeNull();
    expect(id).toBe('new-id');
  });
});
