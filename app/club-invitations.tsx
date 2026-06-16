/**
 * Club Invitation Hub
 *
 * Dedicated page for managing received club invitations.
 * Lists pending invitations with accept/decline buttons,
 * supports decline reason, displays invitation messages,
 * and auto-updates member status in the club.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import {
  ClubInvitation,
  getStoredInvitations,
  updateInvitationStatus,
} from '@/services/clubInvitationService';
import { useAppData, useAppActions } from '@/contexts/AppContext';

export default function ClubInvitationsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { players } = useAppData();
  const { refreshPlayers } = useAppActions();
  const selfPlayer = players.find(p => p.userId === user?.id);
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitations, setInvitations] = useState<ClubInvitation[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'all' | 'sent'>('pending');
  const [sentInvitations, setSentInvitations] = useState<ClubInvitation[]>([]);

  // Decline reason modal
  const [showDeclineModal, setShowDeclineModal] = useState<ClubInvitation | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const loadInvitations = useCallback(async () => {
    try {
      const all = await getStoredInvitations();
      // Filter invitations sent TO current user
      const myInvitations = all.filter(inv => inv.invitedUserId === user?.id);
      setInvitations(myInvitations);
      // Filter invitations sent BY current user (as club owner)
      const mySentInvitations = all.filter(inv => inv.inviterUserId === user?.id);
      setSentInvitations(mySentInvitations);
    } catch {
      setInvitations([]);
      setSentInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  }, [loadInvitations]);

  const handleAccept = useCallback(async (invitation: ClubInvitation) => {
    setProcessingId(invitation.id);
    Haptics.selectionAsync();

    try {
      await updateInvitationStatus(invitation.id, 'accepted');

      // Update player's club assignment in database
      const supabase = getSupabaseClient();
      const selfPlayer = players.find(p => p.userId === user?.id);
      if (selfPlayer) {
        await supabase.from('players').update({
          club_id: invitation.clubId,
          club: invitation.clubName,
          updated_at: new Date().toISOString(),
        }).eq('id', selfPlayer.id);
      }

      // Update club members count
      const { data: clubData } = await supabase
        .from('clubs')
        .select('members_count')
        .eq('id', invitation.clubId)
        .single();

      if (clubData) {
        await supabase.from('clubs').update({
          members_count: (clubData.members_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', invitation.clubId);
      }

      // Send push notification to club owner
      try {
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'club_invitation_response',
            payload: {
              targetUserId: invitation.inviterUserId,
              playerName: selfPlayer?.name || user?.username || user?.email || '',
              clubName: invitation.clubName,
              clubId: invitation.clubId,
              response: 'accepted',
            },
          },
        });
      } catch { /* silent */ }

      setInvitations(prev => prev.map(inv =>
        inv.id === invitation.id ? { ...inv, status: 'accepted' } : inv
      ));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        fr ? 'Invitation acceptee' : 'Invitation accepted',
        fr ? `Vous avez rejoint ${invitation.clubName}` : `You joined ${invitation.clubName}`
      );

      try { refreshPlayers(); } catch { /* silent */ }
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message || 'Failed to accept invitation');
    }

    setProcessingId(null);
  }, [user?.id, players, fr, showAlert, refreshPlayers]);

  const handleDecline = useCallback(async (invitation: ClubInvitation, reason?: string) => {
    setProcessingId(invitation.id);
    Haptics.selectionAsync();

    try {
      await updateInvitationStatus(invitation.id, 'declined', reason || undefined);

      // Send push notification to club owner
      try {
        const supabase = getSupabaseClient();
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'club_invitation_response',
            payload: {
              targetUserId: invitation.inviterUserId,
              playerName: selfPlayer?.name || user?.username || user?.email || '',
              clubName: invitation.clubName,
              clubId: invitation.clubId,
              response: 'declined',
              declineReason: reason || undefined,
            },
          },
        });
      } catch { /* silent */ }

      setInvitations(prev => prev.map(inv =>
        inv.id === invitation.id ? { ...inv, status: 'declined', declineReason: reason || undefined } : inv
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeclineModal(null);
      setDeclineReason('');
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }

    setProcessingId(null);
  }, [showAlert, fr]);

  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');
  const displayInvitations = tab === 'pending' ? pendingInvitations : tab === 'all' ? invitations : sentInvitations;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Invitations Club' : 'Club Invitations'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Invitations Club' : 'Club Invitations'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(300)} style={s.hero}>
          <View style={s.heroIcon}>
            <MaterialIcons name="mail" size={32} color="#7C3AED" />
          </View>
          <Text style={s.heroTitle}>{fr ? 'Invitations de club' : 'Club Invitations'}</Text>
          <Text style={s.heroSub}>
            {fr
              ? 'Gerez les invitations recues pour rejoindre des clubs. Acceptez pour devenir membre automatiquement.'
              : 'Manage received invitations to join clubs. Accept to become a member automatically.'}
          </Text>
          {pendingInvitations.length > 0 ? (
            <View style={s.heroBadge}>
              <MaterialIcons name="schedule" size={14} color="#F59E0B" />
              <Text style={s.heroBadgeText}>
                {pendingInvitations.length} {fr ? 'en attente' : 'pending'}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Tabs */}
        <View style={s.tabs}>
          <Pressable
            style={[s.tab, tab === 'pending' && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab('pending'); }}
          >
            <MaterialIcons name="schedule" size={14} color={tab === 'pending' ? '#FFF' : '#64748B'} />
            <Text style={[s.tabText, tab === 'pending' && s.tabTextActive]}>
              {fr ? 'En attente' : 'Pending'}
            </Text>
            {pendingInvitations.length > 0 ? (
              <View style={[s.tabBadge, tab === 'pending' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <Text style={[s.tabBadgeText, tab === 'pending' && { color: '#FFF' }]}>{pendingInvitations.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={[s.tab, tab === 'all' && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab('all'); }}
          >
            <MaterialIcons name="history" size={14} color={tab === 'all' ? '#FFF' : '#64748B'} />
            <Text style={[s.tabText, tab === 'all' && s.tabTextActive]}>
              {fr ? 'Toutes' : 'All'}
            </Text>
            <View style={[s.tabBadge, tab === 'all' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={[s.tabBadgeText, tab === 'all' && { color: '#FFF' }]}>{invitations.length}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[s.tab, tab === 'sent' && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab('sent'); }}
          >
            <MaterialIcons name="send" size={14} color={tab === 'sent' ? '#FFF' : '#64748B'} />
            <Text style={[s.tabText, tab === 'sent' && s.tabTextActive]}>
              {fr ? 'Envoyees' : 'Sent'}
            </Text>
            <View style={[s.tabBadge, tab === 'sent' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={[s.tabBadgeText, tab === 'sent' && { color: '#FFF' }]}>{sentInvitations.length}</Text>
            </View>
          </Pressable>
        </View>

        {/* Invitation List */}
        {displayInvitations.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={s.emptyState}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="mail-outline" size={48} color="#CBD5E1" />
            </View>
            <Text style={s.emptyTitle}>
              {tab === 'pending'
                ? (fr ? 'Aucune invitation en attente' : 'No pending invitations')
                : tab === 'sent'
                  ? (fr ? 'Aucune invitation envoyee' : 'No sent invitations')
                  : (fr ? 'Aucune invitation' : 'No invitations')}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'sent'
                ? (fr
                  ? 'Invitez des joueurs depuis la page de votre club pour les voir apparaitre ici.'
                  : 'Invite players from your club page to see them appear here.')
                : (fr
                  ? 'Les proprietaires de club peuvent vous inviter a rejoindre leur club.'
                  : 'Club owners can invite you to join their club.')}
            </Text>
          </Animated.View>
        ) : (
          displayInvitations.map((inv, idx) => {
            const isPending = inv.status === 'pending';
            const isAccepted = inv.status === 'accepted';
            const isDeclined = inv.status === 'declined';
            const dateStr = new Date(inv.createdAt).toLocaleDateString(
              fr ? 'fr-FR' : 'en-US',
              { day: 'numeric', month: 'short', year: 'numeric' }
            );

            return (
              <Animated.View key={inv.id} entering={FadeInDown.duration(250).delay(idx * 40)}>
                <View style={[
                  s.invCard,
                  isAccepted && { borderColor: '#10B98130', borderLeftColor: '#10B981' },
                  isDeclined && { borderColor: '#EF444430', borderLeftColor: '#EF4444', opacity: 0.7 },
                ]}>
                  {/* Club header */}
                  <View style={s.invHeader}>
                    {inv.clubLogo ? (
                      <Image source={{ uri: inv.clubLogo }} style={s.invLogo} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                    ) : (
                      <View style={s.invLogoPlaceholder}>
                        <MaterialIcons name="home" size={20} color="#7C3AED" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.invClubName} numberOfLines={1}>{inv.clubName}</Text>
                      <Text style={s.invInviter}>
                        {tab === 'sent'
                          ? `${fr ? 'Envoye a' : 'Sent to'} ${inv.invitedPlayerName}`
                          : `${fr ? 'Invite par' : 'Invited by'} ${inv.inviterName}`}
                      </Text>
                    </View>
                    {/* Status badge */}
                    {isAccepted ? (
                      <View style={[s.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                        <MaterialIcons name="check-circle" size={12} color="#10B981" />
                        <Text style={[s.statusText, { color: '#10B981' }]}>{fr ? 'Accepte' : 'Accepted'}</Text>
                      </View>
                    ) : isDeclined ? (
                      <View style={[s.statusBadge, { backgroundColor: '#FEF2F2' }]}>
                        <MaterialIcons name="cancel" size={12} color="#EF4444" />
                        <Text style={[s.statusText, { color: '#EF4444' }]}>{fr ? 'Refuse' : 'Declined'}</Text>
                      </View>
                    ) : (
                      <View style={[s.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                        <MaterialIcons name="schedule" size={12} color="#F59E0B" />
                        <Text style={[s.statusText, { color: '#F59E0B' }]}>{fr ? 'En attente' : 'Pending'}</Text>
                      </View>
                    )}
                  </View>

                  {/* Invitation message from club */}
                  {inv.message ? (
                    <View style={s.invMessageBox}>
                      <MaterialIcons name="format-quote" size={14} color="#7C3AED" />
                      <Text style={s.invMessageText}>{inv.message}</Text>
                    </View>
                  ) : null}

                  {/* Decline reason (visible to sent tab) */}
                  {isDeclined && inv.declineReason && tab === 'sent' ? (
                    <View style={[s.invMessageBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                      <MaterialIcons name="info-outline" size={14} color="#EF4444" />
                      <Text style={[s.invMessageText, { color: '#991B1B' }]}>
                        {fr ? 'Raison du refus : ' : 'Decline reason: '}{inv.declineReason}
                      </Text>
                    </View>
                  ) : null}

                  {/* Reminder status + expiration countdown for pending invitations */}
                  {isPending ? (() => {
                    const createdDate = new Date(inv.createdAt);
                    const nowDate = new Date();
                    const daysSinceCreated = Math.floor((nowDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                    const daysUntilExpiry = Math.max(0, 30 - daysSinceCreated);
                    const reminderSent7 = daysSinceCreated >= 7;
                    const reminderSent21 = daysSinceCreated >= 21;
                    return (
                      <View style={s.reminderRow}>
                        {/* Expiration countdown */}
                        <View style={[s.reminderChip, daysUntilExpiry <= 9 ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' } : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                          <MaterialIcons name="timer" size={11} color={daysUntilExpiry <= 9 ? '#EF4444' : '#D97706'} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: daysUntilExpiry <= 9 ? '#EF4444' : '#D97706' }}>
                            {daysUntilExpiry === 0
                              ? (fr ? 'Expire aujourd\'hui' : 'Expires today')
                              : `${fr ? 'Expire dans' : 'Expires in'} ${daysUntilExpiry}${fr ? 'j' : 'd'}`}
                          </Text>
                        </View>
                        {/* Reminder indicators */}
                        {reminderSent21 ? (
                          <View style={[s.reminderChip, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                            <MaterialIcons name="notifications-active" size={11} color="#EF4444" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>{fr ? 'Dernier rappel envoye' : 'Final reminder sent'}</Text>
                          </View>
                        ) : reminderSent7 ? (
                          <View style={[s.reminderChip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                            <MaterialIcons name="notifications" size={11} color="#3B82F6" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'Rappel envoye' : 'Reminder sent'}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })() : null}

                  {/* Date */}
                  <Text style={s.invDate}>{dateStr}</Text>

                  {/* Actions for pending (received only, not sent) */}
                  {isPending && tab !== 'sent' ? (
                    <View style={s.invActions}>
                      <Pressable
                        style={[s.invBtn, s.invBtnDecline]}
                        onPress={() => {
                          setDeclineReason('');
                          setShowDeclineModal(inv);
                        }}
                        disabled={processingId === inv.id}
                      >
                        <MaterialIcons name="close" size={16} color="#EF4444" />
                        <Text style={[s.invBtnText, { color: '#EF4444' }]}>{fr ? 'Refuser' : 'Decline'}</Text>
                      </Pressable>
                      <Pressable
                        style={[s.invBtn, s.invBtnAccept]}
                        onPress={() => handleAccept(inv)}
                        disabled={processingId === inv.id}
                      >
                        {processingId === inv.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <MaterialIcons name="check" size={16} color="#FFF" />
                            <Text style={[s.invBtnText, { color: '#FFF' }]}>{fr ? 'Accepter' : 'Accept'}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : isAccepted ? (
                    <Pressable
                      style={s.viewClubBtn}
                      onPress={() => router.push(`/club/${inv.clubId}` as any)}
                    >
                      <MaterialIcons name="open-in-new" size={14} color="#7C3AED" />
                      <Text style={s.viewClubBtnText}>{fr ? 'Voir le club' : 'View club'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            );
          })
        )}

        {/* Info */}
        <View style={s.infoBox}>
          <MaterialIcons name="info-outline" size={16} color={theme.textMuted} />
          <Text style={s.infoText}>
            {fr
              ? 'Quand vous acceptez une invitation, votre fiche joueur est automatiquement associee au club. Si vous refusez, vous pouvez expliquer la raison et le proprietaire du club la verra.'
              : 'When you accept an invitation, your player card is automatically linked to the club. If you decline, you can explain the reason and the club owner will see it.'}
          </Text>
        </View>
      </ScrollView>

      {/* Decline Reason Modal */}
      <Modal visible={showDeclineModal !== null} animationType="fade" transparent>
        <View style={s.declineOverlay}>
          <View style={s.declineCard}>
            <Text style={s.declineTitle}>{fr ? 'Refuser l\'invitation' : 'Decline Invitation'}</Text>
            <Text style={s.declineSub}>
              {fr
                ? `Refuser l'invitation de ${showDeclineModal?.clubName}. Vous pouvez optionnellement expliquer la raison.`
                : `Decline the invitation from ${showDeclineModal?.clubName}. You can optionally explain the reason.`}
            </Text>
            <TextInput
              style={s.declineInput}
              placeholder={fr ? 'Raison du refus (optionnel)...' : 'Decline reason (optional)...'}
              placeholderTextColor={theme.textMuted}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              numberOfLines={3}
              maxLength={250}
            />
            <View style={s.declineActions}>
              <Pressable
                style={s.declineCancelBtn}
                onPress={() => { setShowDeclineModal(null); setDeclineReason(''); }}
              >
                <Text style={s.declineCancelText}>{fr ? 'Annuler' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={s.declineConfirmBtn}
                onPress={() => showDeclineModal ? handleDecline(showDeclineModal, declineReason.trim() || undefined) : null}
                disabled={processingId === showDeclineModal?.id}
              >
                {processingId === showDeclineModal?.id ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={s.declineConfirmText}>{fr ? 'Refuser' : 'Decline'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  hero: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  heroSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 10 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  tabActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#FFF' },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  emptyState: { backgroundColor: theme.surface, borderRadius: 20, padding: 40, alignItems: 'center' },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  invCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: theme.border, borderLeftWidth: 4, borderLeftColor: '#7C3AED' },
  invHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  invLogo: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' as const },
  invLogoPlaceholder: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  invClubName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  invInviter: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  invDate: { fontSize: 11, color: theme.textMuted, marginBottom: 10 },
  invMessageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#7C3AED08', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#7C3AED15' },
  invMessageText: { flex: 1, fontSize: 13, color: '#4C1D95', fontStyle: 'italic', lineHeight: 19 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  invActions: { flexDirection: 'row', gap: 10 },
  invBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  invBtnDecline: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  invBtnAccept: { backgroundColor: '#7C3AED' },
  invBtnText: { fontSize: 14, fontWeight: '700' },
  viewClubBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#7C3AED10', borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED20' },
  viewClubBtnText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, marginTop: 8 },
  infoText: { flex: 1, fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  // Reminder indicators
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  reminderChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  // Decline modal
  declineOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 },
  declineCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, maxWidth: 420, alignSelf: 'center', width: '100%' },
  declineTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  declineSub: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, marginBottom: 16 },
  declineInput: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, fontSize: 15, color: theme.textPrimary, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border, marginBottom: 16 },
  declineActions: { flexDirection: 'row', gap: 10 },
  declineCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, backgroundColor: theme.backgroundSecondary, borderRadius: 12 },
  declineCancelText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  declineConfirmBtn: { flex: 1.5, alignItems: 'center', paddingVertical: 14, backgroundColor: '#EF4444', borderRadius: 12 },
  declineConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
