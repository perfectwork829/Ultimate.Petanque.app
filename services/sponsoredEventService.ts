import { getSupabaseClient } from '@/template';
import { notifyWitnessesForResult, notifyAttestationReceived, notifyCreatorParticipantRegistered, notifyCreatorResultSubmitted, notifyCreatorAllWitnessesAttested } from './eventNotificationService';

export interface SponsoredEvent {
  id: string;
  ambassadorId: string;
  creatorUserId: string;
  title: string;
  description?: string;
  challengeType: string;
  challengeMode: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  scope: 'terrain' | 'city' | 'country' | 'world';
  terrainId?: string;
  terrainName?: string;
  city?: string;
  country?: string;
  maxParticipants: number;
  minWitnesses: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  shareCode: string;
  resultsPublished: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  ambassadorName?: string;
  ambassadorPhoto?: string;
  ambassadorBadgeType?: string;
}

export interface SponsoredEventParticipant {
  id: string;
  eventId: string;
  userId: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  challengeId?: string;
  rank?: number;
  scoreValue?: number;
  respondedAt?: string;
  completedAt?: string;
  createdAt: string;
  // Joined
  userName?: string;
  userAvatar?: string;
  witnessCount?: number;
  witnessesAttested?: number;
}

export interface SponsoredEventWitness {
  id: string;
  eventId: string;
  participantId: string;
  witnessUserId: string;
  attested: boolean;
  attestedAt?: string;
  notes?: string;
  createdAt: string;
  // Joined
  witnessName?: string;
}

function generateEventCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EVT-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Get the ambassador record for the current user */
export async function getMyAmbassadorRecord(): Promise<{ ambassador: any | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { ambassador: null, error: 'Non authentifie' };

    const { data, error } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) return { ambassador: null, error: error.message };
    return { ambassador: data, error: null };
  } catch (e: any) {
    return { ambassador: null, error: e.message };
  }
}

/** Check tier-based challenge limit for the current month */
export async function checkChallengeLimit(ambassadorId: string, badgeType: string): Promise<{ allowed: boolean; used: number; limit: number | null; error: string | null }> {
  try {
    // Gold & Silver = unlimited, Bronze = 1/month
    // Ambassador: check level - Elite/Confirmé = unlimited, Découverte = 2/month
    if (badgeType === 'gold_sponsor' || badgeType === 'sponsor') {
      return { allowed: true, used: 0, limit: null, error: null };
    }

    // For ambassadors, check level
    if (badgeType === 'ambassador') {
      const supabase = getSupabaseClient();
      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('ambassador_level')
        .eq('id', ambassadorId)
        .maybeSingle();
      const level = ambData?.ambassador_level || 'decouverte';
      if (level === 'confirme' || level === 'elite') {
        return { allowed: true, used: 0, limit: null, error: null };
      }
      // Découverte = 2/month
      const limit = 2;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data: events, error } = await supabase
        .from('sponsored_events')
        .select('id')
        .eq('ambassador_id', ambassadorId)
        .gte('created_at', startOfMonth.toISOString());
      if (error) return { allowed: false, used: 0, limit, error: error.message };
      const used = events?.length || 0;
      return { allowed: used < limit, used, limit, error: null };
    }

    const limit = badgeType === 'partner' ? 1 : 0; // partner = Bronze tier
    if (limit === 0) return { allowed: false, used: 0, limit: 0, error: null };

    const supabase = getSupabaseClient();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: events, error } = await supabase
      .from('sponsored_events')
      .select('id')
      .eq('ambassador_id', ambassadorId)
      .gte('created_at', startOfMonth.toISOString());

    if (error) return { allowed: false, used: 0, limit, error: error.message };
    const used = events?.length || 0;
    return { allowed: used < limit, used, limit, error: null };
  } catch (e: any) {
    return { allowed: false, used: 0, limit: 1, error: e.message };
  }
}

/** Create a sponsored event */
export async function createSponsoredEvent(data: {
  ambassadorId: string;
  title: string;
  description?: string;
  challengeType: string;
  challengeMode?: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  scope: 'terrain' | 'city' | 'country' | 'world';
  terrainId?: string;
  terrainName?: string;
  city?: string;
  country?: string;
  maxParticipants?: number;
  minWitnesses?: number;
}): Promise<{ event: SponsoredEvent | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { event: null, error: 'Non authentifie' };

    const shareCode = generateEventCode();

    const { data: event, error } = await supabase
      .from('sponsored_events')
      .insert({
        ambassador_id: data.ambassadorId,
        creator_user_id: userData.user.id,
        title: data.title,
        description: data.description || null,
        challenge_type: data.challengeType,
        challenge_mode: data.challengeMode || 'solo',
        event_date: data.eventDate,
        start_time: data.startTime,
        end_time: data.endTime,
        scope: data.scope,
        terrain_id: data.terrainId || null,
        terrain_name: data.terrainName || null,
        city: data.city || null,
        country: data.country || 'France',
        max_participants: data.maxParticipants || 50,
        min_witnesses: data.minWitnesses || 2,
        share_code: shareCode,
      })
      .select('*')
      .single();

    if (error) return { event: null, error: error.message };

    // Trigger server-side push to nearby users (fire-and-forget)
    if (event) {
      import('./pushTokenService').then(({ triggerServerPush }) => {
        triggerServerPush('event_created', {
          eventId: event.id,
          eventTitle: data.title,
          city: data.city || null,
          country: data.country || 'France',
          latitude: null, // Will be resolved from terrain if available
          longitude: null,
          challengeType: data.challengeType,
          ambassadorName: null, // Resolved server-side if needed
        }).catch(() => {});
      }).catch(() => {});

      // Check for auto-promotion after event creation
      checkPromotionAfterEvent(data.ambassadorId);
    }

    return { event: mapEvent(event), error: null };
  } catch (e: any) {
    return { event: null, error: e.message };
  }
}

/** Check and trigger auto-promotion after event creation */
async function checkPromotionAfterEvent(ambassadorId: string): Promise<void> {
  try {
    const { checkAndPromoteAmbassador } = await import('./ambassadorService');
    await checkAndPromoteAmbassador(ambassadorId);
  } catch { /* silent */ }
}

/** Get all sponsored events (upcoming/active) */
export async function getSponsoredEvents(status?: string): Promise<{ events: SponsoredEvent[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('sponsored_events')
      .select('*, ambassadors(display_name, photo, badge_type)')
      .order('event_date', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['upcoming', 'active']);
    }

    const { data, error } = await query;
    if (error) return { events: [], error: error.message };

    const events = (data || []).map((e: any) => ({
      ...mapEvent(e),
      ambassadorName: e.ambassadors?.display_name,
      ambassadorPhoto: e.ambassadors?.photo,
      ambassadorBadgeType: e.ambassadors?.badge_type,
    }));

    return { events, error: null };
  } catch (e: any) {
    return { events: [], error: e.message };
  }
}

/** Get my created sponsored events */
export async function getMySponsoredEvents(): Promise<{ events: SponsoredEvent[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { events: [], error: 'Non authentifie' };

    const { data, error } = await supabase
      .from('sponsored_events')
      .select('*, ambassadors(display_name, photo, badge_type)')
      .eq('creator_user_id', userData.user.id)
      .order('event_date', { ascending: false });

    if (error) return { events: [], error: error.message };

    const events = (data || []).map((e: any) => ({
      ...mapEvent(e),
      ambassadorName: e.ambassadors?.display_name,
      ambassadorPhoto: e.ambassadors?.photo,
      ambassadorBadgeType: e.ambassadors?.badge_type,
    }));

    return { events, error: null };
  } catch (e: any) {
    return { events: [], error: e.message };
  }
}

/** Get a single sponsored event by ID */
export async function getSponsoredEvent(id: string): Promise<{ event: SponsoredEvent | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsored_events')
      .select('*, ambassadors(display_name, photo, badge_type)')
      .eq('id', id)
      .single();

    if (error) return { event: null, error: error.message };

    return {
      event: {
        ...mapEvent(data),
        ambassadorName: data.ambassadors?.display_name,
        ambassadorPhoto: data.ambassadors?.photo,
        ambassadorBadgeType: data.ambassadors?.badge_type,
      },
      error: null,
    };
  } catch (e: any) {
    return { event: null, error: e.message };
  }
}

/** Find event by share code */
export async function findEventByCode(code: string): Promise<{ event: SponsoredEvent | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsored_events')
      .select('*, ambassadors(display_name, photo, badge_type)')
      .eq('share_code', code.toUpperCase().trim())
      .maybeSingle();

    if (error || !data) return { event: null, error: 'Code introuvable' };

    return {
      event: {
        ...mapEvent(data),
        ambassadorName: data.ambassadors?.display_name,
        ambassadorPhoto: data.ambassadors?.photo,
        ambassadorBadgeType: data.ambassadors?.badge_type,
      },
      error: null,
    };
  } catch (e: any) {
    return { event: null, error: e.message };
  }
}

/** Register as participant */
export async function registerForEvent(eventId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    const { error } = await supabase
      .from('sponsored_event_participants')
      .upsert({
        event_id: eventId,
        user_id: userData.user.id,
        status: 'accepted',
        responded_at: new Date().toISOString(),
      }, { onConflict: 'event_id,user_id' });

    if (error) return { error: error.message };

    // Notify event creator (fire-and-forget)
    (async () => {
      try {
        const [{ data: profile }, { data: evData }] = await Promise.all([
          supabase.from('user_profiles').select('username').eq('id', userData.user.id).maybeSingle(),
          supabase.from('sponsored_events').select('title, creator_user_id').eq('id', eventId).maybeSingle(),
        ]);
        if (evData?.creator_user_id) {
          notifyCreatorParticipantRegistered(
            eventId,
            evData.creator_user_id,
            profile?.username || 'Joueur',
            evData.title || 'Evenement'
          ).catch(() => {});
        }
      } catch { /* silent */ }
    })();

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Withdraw from event (unregister) */
export async function withdrawFromEvent(eventId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    const { error } = await supabase
      .from('sponsored_event_participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userData.user.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Decline participation */
export async function declineEvent(eventId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    const { error } = await supabase
      .from('sponsored_event_participants')
      .upsert({
        event_id: eventId,
        user_id: userData.user.id,
        status: 'declined',
        responded_at: new Date().toISOString(),
      }, { onConflict: 'event_id,user_id' });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Get participants for an event */
export async function getEventParticipants(eventId: string): Promise<{ participants: SponsoredEventParticipant[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsored_event_participants')
      .select('*, user_profiles:user_id(username, avatar)')
      .eq('event_id', eventId)
      .order('rank', { ascending: true, nullsFirst: false });

    if (error) return { participants: [], error: error.message };

    // Get witness counts per participant
    const participantIds = (data || []).map((p: any) => p.id);
    let witnessMap = new Map<string, { total: number; attested: number }>();
    if (participantIds.length > 0) {
      const { data: witnesses } = await supabase
        .from('sponsored_event_witnesses')
        .select('participant_id, attested')
        .in('participant_id', participantIds);

      if (witnesses) {
        witnesses.forEach((w: any) => {
          const current = witnessMap.get(w.participant_id) || { total: 0, attested: 0 };
          current.total++;
          if (w.attested) current.attested++;
          witnessMap.set(w.participant_id, current);
        });
      }
    }

    const participants: SponsoredEventParticipant[] = (data || []).map((p: any) => {
      const wc = witnessMap.get(p.id);
      return {
        id: p.id,
        eventId: p.event_id,
        userId: p.user_id,
        status: p.status,
        challengeId: p.challenge_id,
        rank: p.rank,
        scoreValue: p.score_value ? parseFloat(p.score_value) : undefined,
        respondedAt: p.responded_at,
        completedAt: p.completed_at,
        createdAt: p.created_at,
        userName: p.user_profiles?.username || 'Utilisateur',
        userAvatar: p.user_profiles?.avatar,
        witnessCount: wc?.total || 0,
        witnessesAttested: wc?.attested || 0,
      };
    });

    return { participants, error: null };
  } catch (e: any) {
    return { participants: [], error: e.message };
  }
}

/** Submit challenge result for the event */
export async function submitEventResult(eventId: string, challengeId: string, scoreValue: number): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    // Get participant record
    const { data: participantData } = await supabase
      .from('sponsored_event_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    const { error } = await supabase
      .from('sponsored_event_participants')
      .update({
        challenge_id: challengeId,
        score_value: scoreValue,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('user_id', userData.user.id);

    if (error) return { error: error.message };

    // Send witness notifications + creator notification (fire-and-forget)
    if (participantData?.id) {
      const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', userData.user.id).maybeSingle();
      const { data: evData } = await supabase.from('sponsored_events').select('title, creator_user_id').eq('id', eventId).maybeSingle();
      const playerName = profile?.username || 'Joueur';
      const eventTitle = evData?.title || 'Evenement';
      notifyWitnessesForResult(eventId, participantData.id, playerName, eventTitle).catch(() => {});
      // Notify creator
      if (evData?.creator_user_id) {
        notifyCreatorResultSubmitted(eventId, evData.creator_user_id, playerName, scoreValue, eventTitle).catch(() => {});
      }
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Attest as witness for a participant */
export async function attestAsWitness(eventId: string, participantId: string, notes?: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { error: 'Non authentifie' };

    const { error } = await supabase
      .from('sponsored_event_witnesses')
      .upsert({
        event_id: eventId,
        participant_id: participantId,
        witness_user_id: userData.user.id,
        attested: true,
        attested_at: new Date().toISOString(),
        notes: notes || null,
      }, { onConflict: 'event_id,witness_user_id,participant_id' });

    if (error) return { error: error.message };

    // Notify participant that attestation was received + check if all witnesses attested (fire-and-forget)
    (async () => {
      try {
        const { data: partData } = await supabase.from('sponsored_event_participants').select('user_id').eq('id', participantId).maybeSingle();
        if (!partData?.user_id) return;
        const [{ data: profile }, { data: evData }] = await Promise.all([
          supabase.from('user_profiles').select('username').eq('id', userData.user.id).maybeSingle(),
          supabase.from('sponsored_events').select('title, creator_user_id, min_witnesses').eq('id', eventId).maybeSingle(),
        ]);
        const witnessName = profile?.username || 'Temoin';
        const eventTitle = evData?.title || 'Evenement';
        notifyAttestationReceived(eventId, partData.user_id, participantId, witnessName, eventTitle).catch(() => {});

        // Check if all required witnesses have attested
        if (evData?.creator_user_id && evData?.min_witnesses) {
          const { data: witnesses } = await supabase
            .from('sponsored_event_witnesses')
            .select('attested')
            .eq('participant_id', participantId)
            .eq('attested', true);
          const attestedCount = witnesses?.length || 0;
          if (attestedCount >= evData.min_witnesses) {
            // Get participant name
            const { data: partProfile } = await supabase.from('user_profiles').select('username').eq('id', partData.user_id).maybeSingle();
            notifyCreatorAllWitnessesAttested(
              eventId,
              evData.creator_user_id,
              partProfile?.username || 'Joueur',
              attestedCount,
              eventTitle
            ).catch(() => {});
          }
        }
      } catch { /* silent */ }
    })();

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Get witnesses for a participant */
export async function getParticipantWitnesses(participantId: string): Promise<{ witnesses: SponsoredEventWitness[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sponsored_event_witnesses')
      .select('*, user_profiles:witness_user_id(username)')
      .eq('participant_id', participantId);

    if (error) return { witnesses: [], error: error.message };

    const witnesses: SponsoredEventWitness[] = (data || []).map((w: any) => ({
      id: w.id,
      eventId: w.event_id,
      participantId: w.participant_id,
      witnessUserId: w.witness_user_id,
      attested: w.attested,
      attestedAt: w.attested_at,
      notes: w.notes,
      createdAt: w.created_at,
      witnessName: w.user_profiles?.username || 'Utilisateur',
    }));

    return { witnesses, error: null };
  } catch (e: any) {
    return { witnesses: [], error: e.message };
  }
}

/** Publish results and compute rankings */
export async function publishResults(eventId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    // Get all completed participants
    const { data: participants, error: pErr } = await supabase
      .from('sponsored_event_participants')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'completed')
      .not('score_value', 'is', null)
      .order('score_value', { ascending: false });

    if (pErr) return { error: pErr.message };

    // Assign ranks
    for (let i = 0; i < (participants || []).length; i++) {
      await supabase
        .from('sponsored_event_participants')
        .update({ rank: i + 1 })
        .eq('id', participants![i].id);
    }

    // Mark event as completed with results
    const { error } = await supabase
      .from('sponsored_events')
      .update({
        results_published: true,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Update event status */
export async function updateEventStatus(eventId: string, status: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('sponsored_events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Cancel an event */
export async function cancelSponsoredEvent(eventId: string): Promise<{ error: string | null }> {
  return updateEventStatus(eventId, 'cancelled');
}

/** Get my participation status for an event */
export async function getMyParticipationStatus(eventId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return null;

    const { data, error } = await supabase
      .from('sponsored_event_participants')
      .select('status')
      .eq('event_id', eventId)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return data.status;
  } catch {
    return null;
  }
}

/** Invite users to the event */
export async function inviteUsersToEvent(eventId: string, userIds: string[]): Promise<{ invited: number; error: string | null }> {
  try {
    if (userIds.length === 0) return { invited: 0, error: null };
    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('sponsored_event_participants')
      .select('user_id')
      .eq('event_id', eventId)
      .in('user_id', userIds);

    const existingIds = new Set((existing || []).map((r: any) => r.user_id));
    const newIds = userIds.filter(uid => !existingIds.has(uid));
    if (newIds.length === 0) return { invited: 0, error: null };

    const rows = newIds.map(uid => ({
      event_id: eventId,
      user_id: uid,
      status: 'pending',
    }));

    const { error } = await supabase
      .from('sponsored_event_participants')
      .insert(rows);

    if (error) return { invited: 0, error: error.message };
    return { invited: newIds.length, error: null };
  } catch (e: any) {
    return { invited: 0, error: e.message };
  }
}

/** Re-invite a declined user by resetting their status to pending */
export async function reinviteUser(eventId: string, userId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('sponsored_event_participants')
      .update({
        status: 'pending',
        responded_at: null,
      })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) return { error: error.message };

    // Send push notification to re-invited user
    try {
      const { data: evData } = await supabase.from('sponsored_events').select('title, challenge_type, city').eq('id', eventId).maybeSingle();
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', userData?.user?.id || '').maybeSingle();
      await supabase.functions.invoke('send-push', {
        body: {
          type: 'event_created',
          payload: {
            eventId,
            eventTitle: evData?.title || 'Evenement',
            city: evData?.city,
            challengeType: evData?.challenge_type,
            ambassadorName: profile?.username || 'Ambassadeur',
          },
        },
      });
    } catch { /* silent */ }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ============ EVENT LEADERBOARD ============

export interface EventLeaderboardEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  eventsParticipated: number;
  eventsCompleted: number;
  totalScore: number;
  avgScore: number;
  bestScore: number;
  podiums: number; // rank <= 3
  wins: number; // rank === 1
}

export interface EventLeaderboardResult {
  entries: EventLeaderboardEntry[];
  recentEvents: SponsoredEvent[];
  error: string | null;
}

/** Fetch global event leaderboard - top performers across all completed events */
export async function fetchEventLeaderboard(): Promise<EventLeaderboardResult> {
  try {
    const supabase = getSupabaseClient();

    // 1. Get all completed events with published results
    const { data: events, error: evErr } = await supabase
      .from('sponsored_events')
      .select('*, ambassadors(display_name, photo, badge_type)')
      .eq('results_published', true)
      .order('event_date', { ascending: false })
      .limit(50);

    if (evErr) return { entries: [], recentEvents: [], error: evErr.message };
    if (!events || events.length === 0) return { entries: [], recentEvents: [], error: null };

    const eventIds = events.map((e: any) => e.id);

    // 2. Get all completed participants with scores
    const { data: participants, error: pErr } = await supabase
      .from('sponsored_event_participants')
      .select('*, user_profiles:user_id(username, avatar)')
      .in('event_id', eventIds)
      .eq('status', 'completed')
      .not('score_value', 'is', null);

    if (pErr) return { entries: [], recentEvents: [], error: pErr.message };

    // 3. Aggregate by user
    const userMap = new Map<string, {
      userId: string;
      userName: string;
      userAvatar?: string;
      scores: number[];
      ranks: number[];
      eventsCount: number;
    }>();

    (participants || []).forEach((p: any) => {
      const uid = p.user_id;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          userName: p.user_profiles?.username || 'Joueur',
          userAvatar: p.user_profiles?.avatar,
          scores: [],
          ranks: [],
          eventsCount: 0,
        });
      }
      const entry = userMap.get(uid)!;
      entry.eventsCount++;
      if (p.score_value !== null && p.score_value !== undefined) {
        entry.scores.push(parseFloat(p.score_value));
      }
      if (p.rank) {
        entry.ranks.push(p.rank);
      }
    });

    // 4. Build leaderboard entries
    const entries: EventLeaderboardEntry[] = Array.from(userMap.values()).map(u => {
      const totalScore = u.scores.reduce((a, b) => a + b, 0);
      const avgScore = u.scores.length > 0 ? Math.round(totalScore / u.scores.length * 10) / 10 : 0;
      const bestScore = u.scores.length > 0 ? Math.max(...u.scores) : 0;
      const podiums = u.ranks.filter(r => r <= 3).length;
      const wins = u.ranks.filter(r => r === 1).length;
      return {
        userId: u.userId,
        userName: u.userName,
        userAvatar: u.userAvatar,
        eventsParticipated: u.eventsCount,
        eventsCompleted: u.scores.length,
        totalScore,
        avgScore,
        bestScore,
        podiums,
        wins,
      };
    });

    // Sort by wins desc, then podiums, then avg score
    entries.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.podiums !== a.podiums) return b.podiums - a.podiums;
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.eventsCompleted - a.eventsCompleted;
    });

    const recentEvents = events.slice(0, 5).map((e: any) => ({
      ...mapEvent(e),
      ambassadorName: e.ambassadors?.display_name,
      ambassadorPhoto: e.ambassadors?.photo,
      ambassadorBadgeType: e.ambassadors?.badge_type,
    }));

    return { entries, recentEvents, error: null };
  } catch (e: any) {
    return { entries: [], recentEvents: [], error: e.message };
  }
}

// ============ HELPERS ============

function mapEvent(e: any): SponsoredEvent {
  return {
    id: e.id,
    ambassadorId: e.ambassador_id,
    creatorUserId: e.creator_user_id,
    title: e.title,
    description: e.description,
    challengeType: e.challenge_type,
    challengeMode: e.challenge_mode || 'solo',
    eventDate: e.event_date,
    startTime: e.start_time,
    endTime: e.end_time,
    scope: e.scope,
    terrainId: e.terrain_id,
    terrainName: e.terrain_name,
    city: e.city,
    country: e.country,
    maxParticipants: e.max_participants,
    minWitnesses: e.min_witnesses,
    status: e.status,
    shareCode: e.share_code,
    resultsPublished: e.results_published,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}
