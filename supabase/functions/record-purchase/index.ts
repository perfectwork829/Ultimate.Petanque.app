import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimiter.ts';

// Rate limit: 3 purchase recordings per 60 seconds per user
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: prevent purchase replay abuse
    const rlResult = checkRateLimit(`purchase:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rlResult.allowed) {
      console.log(`[record-purchase] Rate limited user ${user.id}`);
      return rateLimitResponse(rlResult, corsHeaders);
    }

    const { platform, productId, transactionId } = await req.json();

    if (!platform || !productId) {
      return new Response(JSON.stringify({ error: 'Missing platform or productId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate transaction
    if (transactionId) {
      const { data: existingReceipt } = await supabaseClient
        .from('purchase_receipts')
        .select('id')
        .eq('transaction_id', transactionId)
        .single();

      if (existingReceipt) {
        console.log(`[record-purchase] Duplicate transaction ${transactionId} for user ${user.id}`);
        return new Response(JSON.stringify({ error: 'duplicate_transaction' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Record the purchase
    await supabaseClient.from('purchase_receipts').insert({
      user_id: user.id,
      platform,
      product_id: productId,
      transaction_id: transactionId || null,
      verified: true, // In production, add server-side receipt validation
    });

    // Set user as premium
    await supabaseClient.from('user_profiles').update({
      is_premium: true,
    }).eq('id', user.id);

    console.log(`[record-purchase] User ${user.id} purchased ${productId} on ${platform}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
