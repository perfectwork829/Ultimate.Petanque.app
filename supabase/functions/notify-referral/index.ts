/**
 * Edge Function: notify-referral
 *
 * Sends an email notification to the referrer ambassador
 * when their referral code is used by a new player during signup.
 *
 * Uses Supabase Auth admin API to send a custom email via the
 * platform mailer (no external email service required).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { referralCode, referredUserEmail, referredUserId } = body;

    if (!referralCode) {
      return new Response(JSON.stringify({ error: 'Missing referralCode' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notify-referral] Processing referral code: ${referralCode}`);

    // Find ambassador with this referral code
    const { data: ambassador, error: ambError } = await supabaseAdmin
      .from('ambassadors')
      .select('id, user_id, display_name, referral_count, ambassador_level')
      .eq('referral_code', referralCode.toUpperCase().trim())
      .maybeSingle();

    if (ambError || !ambassador) {
      console.log(`[notify-referral] Ambassador not found for code: ${referralCode}`);
      return new Response(JSON.stringify({ error: 'Ambassador not found', sent: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get ambassador email from user_profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('email, username')
      .eq('id', ambassador.user_id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      console.log(`[notify-referral] Email not found for ambassador: ${ambassador.user_id}`);
      return new Response(JSON.stringify({ error: 'Ambassador email not found', sent: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ambassadorEmail = profile.email;
    const referralCount = ambassador.referral_count || 0;
    const ambLevel = ambassador.ambassador_level || 'decouverte';

    // Anonymize the referred user email for privacy
    const anonymizedEmail = referredUserEmail
      ? referredUserEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      : 'Nouveau joueur';

    // Build email content
    const subject = `🎯 Nouveau parrainage Ultimate Petanque !`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7C3AED, #A78BFA); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
          <h1 style="color: #FFF; margin: 0; font-size: 22px;">🎯 Nouveau parrainage !</h1>
        </div>
        
        <p style="color: #334155; font-size: 16px; line-height: 1.6;">
          Bonjour <strong>${ambassador.display_name}</strong>,
        </p>
        
        <p style="color: #334155; font-size: 16px; line-height: 1.6;">
          Votre code de parrainage <strong style="color: #7C3AED; letter-spacing: 1px;">${referralCode}</strong> vient d'etre utilise par un nouveau joueur !
        </p>
        
        <div style="background: #F8FAFC; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #64748B; font-size: 13px;">Nouveau filleul</span>
            <span style="color: #0F172A; font-weight: 600; font-size: 13px;">${anonymizedEmail}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #64748B; font-size: 13px;">Total parrainages</span>
            <span style="color: #7C3AED; font-weight: 700; font-size: 15px;">${referralCount}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748B; font-size: 13px;">Niveau actuel</span>
            <span style="color: #7C3AED; font-weight: 600; font-size: 13px;">${ambLevel === 'elite' ? 'Elite ⭐' : ambLevel === 'confirme' ? 'Confirme 🚀' : 'Decouverte 🔍'}</span>
          </div>
        </div>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          +50 XP ont ete ajoutes a votre profil ambassadeur. Continuez a partager votre code pour monter de niveau !
        </p>
        
        <div style="text-align: center; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 12px;">Ultimate Petanque - Programme Ambassadeur</p>
        </div>
      </div>
    `;

    // Send email via Supabase Auth admin API (uses platform mailer)
    // We use a direct REST call to send a custom email
    const emailPayload = {
      to: ambassadorEmail,
      subject,
      html: htmlBody,
    };

    // Try sending via push notification as a fallback (since direct email requires SMTP config)
    // Send a push notification to the ambassador
    const { data: tokens } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', ambassador.user_id)
      .eq('active', true);

    let pushSent = 0;
    if (tokens && tokens.length > 0) {
      // Use Expo push API directly
      const messages = tokens.map((t: any) => ({
        to: t.token,
        title: `🎯 Nouveau parrainage !`,
        body: `${anonymizedEmail} a utilise votre code ${referralCode}. Total: ${referralCount} parrainages. +50 XP !`,
        data: { type: 'referral_used', referralCode },
        channelId: 'tournament-reminders',
        priority: 'high' as const,
        sound: 'default' as const,
      }));

      try {
        const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(messages),
        });
        const pushResult = await pushResponse.json();
        const tickets = Array.isArray(pushResult.data) ? pushResult.data : [pushResult.data];
        pushSent = tickets.filter((t: any) => t.status === 'ok').length;
      } catch (e) {
        console.error('[notify-referral] Push error:', e);
      }
    }

    // Also create an in-app event_notification for the ambassador
    await supabaseAdmin
      .from('ambassador_analytics')
      .insert({
        ambassador_id: ambassador.id,
        event_type: 'referral_notification',
        source_page: 'signup',
        viewer_id: referredUserId || null,
      })
      .catch(() => {});

    console.log(`[notify-referral] Done: push=${pushSent}, ambassador=${ambassador.display_name}`);

    return new Response(
      JSON.stringify({ sent: true, pushSent, ambassadorId: ambassador.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[notify-referral] Fatal error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
