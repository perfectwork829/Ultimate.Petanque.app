import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { respondToAttestation, fetchAllMyAttestations } from '@/services/witnessService';

interface WitnessInvitation {
  id: string;
  matchId: string;
  itemType: string;
  itemId: string;
  requesterUserId: string;
  requesterName: string;
  status: string;
  createdAt: string;
  attestationType?: string;
  matchSummary?: string;
  matchDate?: string;
  matchTeamA?: string;
  matchTeamB?: string;
  matchScoreA?: number;
  matchScoreB?: number;
  snapshot?: Record<string, any>;
}

export default function WitnessInvitationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const isFr = language === 'fr';

  const [invitations, setInvitations] = useState<WitnessInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());

  const loadInvitations = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    try {
      const allAttestations = await fetchAllMyAttestations();

      const enriched: WitnessInvitation[] = [];
      for (const row of allAttestations) {
        let requesterName = row.witnessName || '';
        let matchSummary = '';
        let matchDate = '';
        let matchTeamA = '';
        let matchTeamB = '';
        let matchScoreA = 0;
        let matchScoreB = 0;
        const itemType = row.itemType || 'match';
        const itemId = row.itemId || row.matchId;

        // Fetch requester name
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', row.requesterUserId)
            .single();
          if (profile?.username) requesterName = profile.username;
        } catch { /* silent */ }

        // Fetch item details based on type
        if (itemType === 'match' && itemId) {
          try {
            const { data: match } = await supabase
              .from('matches')
              .select('date, team_a, team_b, winner, format, duration')
              .eq('id', itemId)
              .single();
            if (match) {
              matchDate = match.date;
              const ta = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
              const tb = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
              matchTeamA = (ta?.playerNames || []).join(', ') || 'Team A';
              matchTeamB = (tb?.playerNames || []).join(', ') || 'Team B';
              matchScoreA = ta?.score || 0;
              matchScoreB = tb?.score || 0;
              matchSummary = `${matchTeamA} vs ${matchTeamB} (${matchScoreA}-${matchScoreB})`;
            }
          } catch { /* silent */ }
        } else if (itemType === 'challenge' && itemId) {
          try {
            const { data: ch } = await supabase
              .from('challenges')
              .select('date, type, mode, success_count, total_shots, total_points')
              .eq('id', itemId)
              .single();
            if (ch) {
              matchDate = ch.date;
              const typeLabel = ch.type === 'precision' ? 'Precision' : ch.type === '10_tirs_sautee' ? '10 Tirs Sautee' : '10 Tirs';
              matchTeamA = typeLabel;
              matchTeamB = ch.mode === '1v1' ? '1v1' : 'Solo';
              matchScoreA = ch.success_count || ch.total_points || 0;
              matchScoreB = ch.total_shots || 0;
              matchSummary = `${typeLabel} (${ch.mode}) - ${matchScoreA}/${matchScoreB}`;
            }
          } catch { /* silent */ }
        }

        enriched.push({
          id: row.id,
          matchId: row.matchId,
          itemType,
          itemId,
          requesterUserId: row.requesterUserId,
          requesterName,
          status: row.status,
          createdAt: row.createdAt,
          attestationType: row.attestationType || 'standard',
          matchSummary,
          matchDate,
          matchTeamA,
          matchTeamB,
          matchScoreA,
          matchScoreB,
          snapshot: row.itemSnapshot || undefined,
        });
      }

      setInvitations(enriched);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  };

  const handleRespond = async (invitationId: string, response: 'attested' | 'declined') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRespondingId(invitationId);
    const { error } = await respondToAttestation(invitationId, response);
    setRespondingId(null);
    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }
    setInvitations(prev => prev.map(inv =>
      inv.id === invitationId ? { ...inv, status: response } : inv
    ));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      t('common', 'success'),
      response === 'attested'
        ? (isFr ? 'Atteste avec succes. Le poids passe a 2.0x.' : 'Attested successfully. Weight upgraded to 2.0x.')
        : (isFr ? 'Demande refusee.' : 'Request declined.')
    );
  };

  const pendingCount = invitations.filter(i => i.status === 'pending').length;
  const historyCount = invitations.filter(i => i.status !== 'pending').length;

  const getStatusColor = (status: string) => {
    if (status === 'attested') return '#22C55E';
    if (status === 'declined') return '#EF4444';
    return '#D97706';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'attested') return isFr ? 'Atteste' : 'Attested';
    if (status === 'declined') return isFr ? 'Refuse' : 'Declined';
    return isFr ? 'En attente' : 'Pending';
  };

  const getItemRoute = (inv: WitnessInvitation) => {
    if (inv.itemType === 'challenge') return `/challenge/${inv.itemId}` as any;
    return `/match/${inv.itemId || inv.matchId}` as any;
  };

  const toggleSnapshot = (id: string) => {
    Haptics.selectionAsync();
    setExpandedSnapshots(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>{isFr ? 'Attestations de temoin' : 'Witness Attestations'}</Text>
          {pendingCount > 0 ? (
            <Text style={st.headerSub}>{pendingCount} {isFr ? 'en attente' : 'pending'}</Text>
          ) : null}
        </View>
        <View style={st.headerBadge}>
          <MaterialIcons name="visibility" size={18} color="#7C3AED" />
        </View>
      </View>

      {loading ? (
        <View style={st.centerState}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={st.scrollView}
          contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          {/* Info banner */}
          <Animated.View entering={FadeInDown.duration(300)} style={st.infoBanner}>
            <MaterialIcons name="info-outline" size={16} color="#7C3AED" />
            <Text style={st.infoBannerText}>
              {isFr
                ? 'Lorsque vous attestez un match ou un defi, son poids dans le classement passe a 2.0x. Attestez uniquement les elements auxquels vous avez assiste.'
                : 'When you attest a match or challenge, its leaderboard weight upgrades to 2.0x. Only attest items you witnessed in person.'}
            </Text>
          </Animated.View>

          {/* Pending invitations */}
          {pendingCount > 0 ? (
            <View style={st.section}>
              <Text style={st.sectionTitle}>{isFr ? 'EN ATTENTE' : 'PENDING'}</Text>
              {invitations
                .filter(i => i.status === 'pending')
                .map((inv, idx) => (
                  <Animated.View key={inv.id} entering={FadeInDown.duration(300).delay(idx * 60)}>
                    <View style={[st.card, { borderLeftColor: '#D97706' }]}>
                      {/* Item preview */}
                      <View style={st.matchPreview}>
                        <View style={[st.matchPreviewIcon, { backgroundColor: inv.attestationType === 'opponent_confirmation' ? '#3B82F612' : inv.itemType === 'challenge' ? '#7C3AED12' : '#D9770612' }]}>
                          <MaterialIcons name={inv.attestationType === 'opponent_confirmation' ? 'people' : inv.itemType === 'challenge' ? 'track-changes' : 'sports'} size={20} color={inv.attestationType === 'opponent_confirmation' ? '#3B82F6' : inv.itemType === 'challenge' ? '#7C3AED' : '#D97706'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.matchPreviewTitle} numberOfLines={1}>
                            {inv.itemType === 'challenge'
                              ? (inv.matchTeamA || 'Challenge')
                              : `${inv.matchTeamA || 'Team A'} vs ${inv.matchTeamB || 'Team B'}`}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            {inv.itemType === 'challenge' ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ backgroundColor: '#7C3AED15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{isFr ? 'DEFI' : 'CHALLENGE'}</Text>
                                </View>
                                <Text style={st.matchPreviewScore}>{inv.matchScoreA}/{inv.matchScoreB}</Text>
                              </View>
                            ) : (
                              <Text style={st.matchPreviewScore}>
                                {inv.matchScoreA} - {inv.matchScoreB}
                              </Text>
                            )}
                            {inv.matchDate ? (
                              <>
                                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted }} />
                                <Text style={st.matchPreviewDate}>
                                  {new Date(inv.matchDate).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                                </Text>
                              </>
                            ) : null}
                          </View>
                        </View>
                        <Pressable
                          style={st.viewMatchBtn}
                          onPress={() => router.push(getItemRoute(inv))}
                        >
                          <MaterialIcons name="open-in-new" size={16} color={theme.primary} />
                        </Pressable>
                      </View>

                      {/* Opponent confirmation badge */}
                      {inv.attestationType === 'opponent_confirmation' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, backgroundColor: '#3B82F608', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#3B82F615' }}>
                          <MaterialIcons name="handshake" size={14} color="#3B82F6" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#3B82F6' }}>
                            {isFr ? 'Confirmation adversaire - le joueur vous demande de confirmer le resultat' : 'Opponent confirmation - the player asks you to confirm the result'}
                          </Text>
                        </View>
                      ) : null}

                      {/* Snapshot preview */}
                      {inv.snapshot ? (
                        <View style={{ marginBottom: 10 }}>
                          <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#F1F5F9', borderRadius: 8, alignSelf: 'flex-start' }}
                            onPress={() => toggleSnapshot(inv.id)}
                          >
                            <MaterialIcons name={expandedSnapshots.has(inv.id) ? 'expand-less' : 'expand-more'} size={16} color="#64748B" />
                            <MaterialIcons name="photo-camera" size={13} color="#64748B" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>{isFr ? 'Apercu du snapshot' : 'Snapshot preview'}</Text>
                          </Pressable>
                          {expandedSnapshots.has(inv.id) ? (
                            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 }}>
                              {inv.itemType === 'match' && inv.snapshot.teamA ? (
                                <>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>{isFr ? 'Equipe A' : 'Team A'}</Text>
                                    <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.teamA?.playerNames?.join(', ') || '-'} ({inv.snapshot.teamA?.score})</Text>
                                  </View>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>{isFr ? 'Equipe B' : 'Team B'}</Text>
                                    <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.teamB?.playerNames?.join(', ') || '-'} ({inv.snapshot.teamB?.score})</Text>
                                  </View>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>Format</Text>
                                    <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.format || '-'}</Text>
                                  </View>
                                  {inv.snapshot.duration ? (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>{isFr ? 'Duree' : 'Duration'}</Text>
                                      <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.duration} min</Text>
                                    </View>
                                  ) : null}
                                </>
                              ) : inv.itemType === 'challenge' ? (
                                <>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>Type</Text>
                                    <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.type || '-'}</Text>
                                  </View>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>Mode</Text>
                                    <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.mode || '-'}</Text>
                                  </View>
                                  {inv.snapshot.successCount !== undefined ? (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>{isFr ? 'Resultat' : 'Result'}</Text>
                                      <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.successCount}/{inv.snapshot.totalShots}{inv.snapshot.successRate ? ` (${inv.snapshot.successRate}%)` : ''}</Text>
                                    </View>
                                  ) : null}
                                  {inv.snapshot.playerName ? (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>{isFr ? 'Joueur' : 'Player'}</Text>
                                      <Text style={{ fontSize: 11, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.playerName}{inv.snapshot.opponentName ? ` vs ${inv.snapshot.opponentName}` : ''}</Text>
                                    </View>
                                  ) : null}
                                </>
                              ) : null}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                                <MaterialIcons name="lock-clock" size={10} color="#94A3B8" />
                                <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '500' }}>
                                  Snapshot {inv.snapshot.snapshotAt ? new Date(inv.snapshot.snapshotAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Requester info */}
                      <View style={st.requesterRow}>
                        <View style={st.requesterAvatar}>
                          <Text style={st.requesterAvatarText}>{(inv.requesterName || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.requesterName}>{inv.requesterName}</Text>
                          <Text style={st.requesterDate}>
                            {isFr ? 'Demande le' : 'Requested on'}{' '}
                            {new Date(inv.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>

                      {/* Action buttons */}
                      <View style={st.actionRow}>
                        <Pressable
                          style={[st.declineBtn, respondingId === inv.id && { opacity: 0.5 }]}
                          onPress={() => handleRespond(inv.id, 'declined')}
                          disabled={respondingId === inv.id}
                        >
                          <MaterialIcons name="close" size={18} color="#EF4444" />
                          <Text style={st.declineBtnText}>{isFr ? 'Refuser' : 'Decline'}</Text>
                        </Pressable>
                        <Pressable
                          style={[st.attestBtn, respondingId === inv.id && { opacity: 0.5 }]}
                          onPress={() => handleRespond(inv.id, 'attested')}
                          disabled={respondingId === inv.id}
                        >
                          {respondingId === inv.id ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <MaterialIcons name="check" size={18} color="#FFF" />
                          )}
                          <Text style={st.attestBtnText}>{isFr ? 'Attester (2.0x)' : 'Attest (2.0x)'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                ))}
            </View>
          ) : null}

          {/* History */}
          {historyCount > 0 ? (
            <View style={st.section}>
              <Text style={st.sectionTitle}>{isFr ? 'HISTORIQUE' : 'HISTORY'}</Text>
              {invitations
                .filter(i => i.status !== 'pending')
                .map((inv, idx) => {
                  const sc = getStatusColor(inv.status);
                  return (
                    <Animated.View key={inv.id} entering={FadeInDown.duration(300).delay(idx * 40)}>
                      <Pressable
                        style={[st.card, { borderLeftColor: sc, opacity: 0.85 }]}
                        onPress={() => router.push(getItemRoute(inv))}
                      >
                        <View style={st.matchPreview}>
                          <View style={[st.matchPreviewIcon, { backgroundColor: sc + '12' }]}>
                            <MaterialIcons
                              name={inv.status === 'attested' ? 'check-circle' : 'cancel'}
                              size={20}
                              color={sc}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.matchPreviewTitle} numberOfLines={1}>
                              {inv.itemType === 'challenge'
                                ? (inv.matchTeamA || 'Challenge')
                                : `${inv.matchTeamA || 'Team A'} vs ${inv.matchTeamB || 'Team B'}`}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              {inv.itemType === 'challenge' ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <View style={{ backgroundColor: '#7C3AED15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{isFr ? 'DEFI' : 'CHALLENGE'}</Text>
                                  </View>
                                  <Text style={st.matchPreviewScore}>{inv.matchScoreA}/{inv.matchScoreB}</Text>
                                </View>
                              ) : (
                                <Text style={st.matchPreviewScore}>
                                  {inv.matchScoreA} - {inv.matchScoreB}
                                </Text>
                              )}
                              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted }} />
                              <Text style={st.requesterDate}>{inv.requesterName}</Text>
                            </View>
                          </View>
                          <View style={[st.statusBadge, { backgroundColor: sc + '15', borderColor: sc + '30' }]}>
                            <Text style={[st.statusBadgeText, { color: sc }]}>{getStatusLabel(inv.status)}</Text>
                          </View>
                        </View>
                        {/* Snapshot preview for history */}
                        {inv.snapshot ? (
                          <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F1F5F9', borderRadius: 6, alignSelf: 'flex-start' }}
                            onPress={(e) => { e.stopPropagation?.(); toggleSnapshot(inv.id); }}
                          >
                            <MaterialIcons name="photo-camera" size={11} color="#94A3B8" />
                            <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>{expandedSnapshots.has(inv.id) ? (isFr ? 'Masquer' : 'Hide') : 'Snapshot'}</Text>
                          </Pressable>
                        ) : null}
                        {inv.snapshot && expandedSnapshots.has(inv.id) ? (
                          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', gap: 3 }}>
                            {inv.itemType === 'match' && inv.snapshot.teamA ? (
                              <>
                                <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.teamA?.playerNames?.join(', ')} ({inv.snapshot.teamA?.score}) vs {inv.snapshot.teamB?.playerNames?.join(', ')} ({inv.snapshot.teamB?.score})</Text>
                                <Text style={{ fontSize: 9, color: '#64748B' }}>{inv.snapshot.format}{inv.snapshot.duration ? ` - ${inv.snapshot.duration} min` : ''}</Text>
                              </>
                            ) : inv.itemType === 'challenge' ? (
                              <>
                                <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.type} ({inv.snapshot.mode}){inv.snapshot.successCount !== undefined ? ` - ${inv.snapshot.successCount}/${inv.snapshot.totalShots}` : ''}</Text>
                                {inv.snapshot.playerName ? <Text style={{ fontSize: 9, color: '#64748B' }}>{inv.snapshot.playerName}{inv.snapshot.opponentName ? ` vs ${inv.snapshot.opponentName}` : ''}</Text> : null}
                              </>
                            ) : null}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <MaterialIcons name="lock-clock" size={8} color="#CBD5E1" />
                              <Text style={{ fontSize: 8, color: '#CBD5E1' }}>{inv.snapshot.snapshotAt ? new Date(inv.snapshot.snapshotAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                            </View>
                          </View>
                        ) : null}
                      </Pressable>
                    </Animated.View>
                  );
                })}
            </View>
          ) : null}

          {/* Empty state */}
          {invitations.length === 0 ? (
            <View style={st.emptyState}>
              <View style={st.emptyIcon}>
                <MaterialIcons name="visibility-off" size={40} color={theme.textMuted} />
              </View>
              <Text style={st.emptyTitle}>{isFr ? 'Aucune demande' : 'No requests'}</Text>
              <Text style={st.emptyDesc}>
                {isFr
                  ? 'Vous recevrez des demandes lorsqu\'un joueur vous invitera a attester un match ou un defi auquel vous avez assiste.'
                  : 'You will receive requests when a player invites you to attest a match or challenge you witnessed.'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSub: { fontSize: 11, color: '#D97706', fontWeight: '600', marginTop: 1 },
  headerBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#7C3AED08', borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#7C3AED20' },
  infoBannerText: { flex: 1, fontSize: 12, color: '#7C3AED', lineHeight: 18, fontWeight: '500' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 1, marginBottom: 12 },

  card: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, ...theme.shadows.card },

  matchPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  matchPreviewIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#D9770612', alignItems: 'center', justifyContent: 'center' },
  matchPreviewTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  matchPreviewScore: { fontSize: 14, fontWeight: '800', color: theme.primary },
  matchPreviewDate: { fontSize: 12, color: theme.textMuted },
  viewMatchBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },

  requesterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  requesterAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' },
  requesterAvatarText: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  requesterName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  requesterDate: { fontSize: 11, color: theme.textMuted, marginTop: 1 },

  actionRow: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#EF444410', borderWidth: 1, borderColor: '#EF444425' },
  declineBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  attestBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED' },
  attestBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 },
});
