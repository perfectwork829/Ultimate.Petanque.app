import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimiter.ts';

// Rate limit: 5 attempts per 60 seconds per user
const RATE_LIMIT_MAX = 5;
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

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: prevent brute-force code guessing
    const rlResult = checkRateLimit(`promo:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rlResult.allowed) {
      console.log(`[validate-promo-code] Rate limited user ${user.id}`);
      return rateLimitResponse(rlResult, corsHeaders);
    }

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedCode = code.trim().toUpperCase();

    // Check if user is already premium
    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    if (profile?.is_premium) {
      return new Response(JSON.stringify({ error: 'already_premium' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the promo code
    const { data: promoCode, error: promoError } = await supabaseClient
      .from('promo_codes')
      .select('*')
      .eq('code', trimmedCode)
      .eq('is_active', true)
      .single();

    if (promoError || !promoCode) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'expired_code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check max uses
    if (promoCode.current_uses >= promoCode.max_uses) {
      return new Response(JSON.stringify({ error: 'max_uses_reached' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user already redeemed this code
    const { data: existingRedemption } = await supabaseClient
      .from('promo_code_redemptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('promo_code_id', promoCode.id)
      .single();

    if (existingRedemption) {
      return new Response(JSON.stringify({ error: 'already_redeemed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Redeem: increment uses, create redemption, set premium
    const { error: updateError } = await supabaseClient
      .from('promo_codes')
      .update({
        current_uses: promoCode.current_uses + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promoCode.id);

    if (updateError) {
      console.error('Error updating promo code:', updateError);
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabaseClient.from('promo_code_redemptions').insert({
      user_id: user.id,
      promo_code_id: promoCode.id,
    });

    // Set user as premium
    await supabaseClient.from('user_profiles').update({
      is_premium: true,
    }).eq('id', user.id);

    console.log(`[validate-promo-code] User ${user.id} redeemed code "${trimmedCode}"`);

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
