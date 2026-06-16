import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract JWT token
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated client to verify user
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify the user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Starting account deletion for user: ${userId}`);

    // Create admin client for data deletion
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Delete all user data in order (respecting foreign key constraints)
    const tables = [
      'modification_logs',
      'share_notifications',
      'shared_items',
      'tournament_notifications',
      'challenges',
      'matches',
      'players',
      'tournaments',
      'terrains',
      'clubs',
    ];

    for (const table of tables) {
      // Delete where user is owner
      const { error: deleteError } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        // Some tables use owner_id instead of user_id
        if (table === 'modification_logs' || table === 'share_notifications') {
          const { error: altError } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('owner_id', userId);
          if (altError) {
            console.error(`Error deleting from ${table} (owner_id):`, altError.message);
          }
        } else if (table === 'shared_items') {
          const { error: altError } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('owner_id', userId);
          if (altError) {
            console.error(`Error deleting from ${table} (owner_id):`, altError.message);
          }
        } else {
          console.error(`Error deleting from ${table}:`, deleteError.message);
        }
      }
    }

    // Also delete shared items where user is recipient
    await supabaseAdmin
      .from('shared_items')
      .delete()
      .eq('shared_with_id', userId);

    // Also delete share notifications where user is accessor
    await supabaseAdmin
      .from('share_notifications')
      .delete()
      .eq('accessor_id', userId);

    // Also delete modification logs where user is modifier
    await supabaseAdmin
      .from('modification_logs')
      .delete()
      .eq('modifier_id', userId);

    // Delete user avatar from storage
    try {
      const { data: avatarFiles } = await supabaseAdmin.storage
        .from('avatars')
        .list('avatars', { search: userId });

      if (avatarFiles && avatarFiles.length > 0) {
        const filePaths = avatarFiles.map(f => `avatars/${f.name}`);
        await supabaseAdmin.storage.from('avatars').remove(filePaths);
        console.log(`Deleted ${filePaths.length} avatar files`);
      }
    } catch (storageError) {
      console.error('Error cleaning storage:', storageError);
      // Non-blocking - continue with account deletion
    }

    // Delete user_profiles (this should cascade from auth.users deletion, but explicit is safer)
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting user_profiles:', profileError.message);
    }

    // Delete auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError.message);
      return new Response(
        JSON.stringify({ error: `Failed to delete auth account: ${authDeleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Account deletion completed for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Account and all data deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error during account deletion:', error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
