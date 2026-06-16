import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
  Linking,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import {
  requestNotificationPermissions,
  areNotificationsEnabled,
  getAllScheduledNotifications,
  cancelTournamentNotifications,
} from '@/services/notificationService';
import {
  getReceivedShareRequests,
  acceptShareRequest,
  declineShareRequest,
  markShareRequestsSeen,
  autoDeclineExpiredShareRequests,
  getShareRequestRemainingTime,
  MatchShareRequest,
} from '@/services/matchShareService';
import { respondToAttestation, fetchAllMyAttestations } from '@/services/witnessService';
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/services/notificationPreferencesService';
import {
  getPendingInvitations,
  respondToMeetup,
  PendingInvitation,
} from '@/services/meetupService';
import {
  getReceivedClaims,
  acceptClubClaim,
  declineClubClaim,
  ClubClaimRequest,
} from '@/services/clubClaimService';
import {
  getReceivedTransferRequests,
  acceptTransferRequest,
  declineTransferRequest,
  PlayerTransferRequest,
} from '@/services/playerTransferService';
import {
  getPendingTeamInvitations,
  respondToTeamInvitation,
  getTeamSize,
  TeamInvitation,
} from '@/services/teamInvitationService';

type TabKey = 'invitations' | 'witness' | 'teams' | 'transfers' | 'claims' | 'tournaments' | 'preferences';

const TABS: { key: TabKey; labelFr: string; labelEn: string; icon: string; color: string }[] = [
  { key: 'invitations', labelFr: 'Invitations', labelEn: 'Invitations', icon: 'mail', color: theme.primary },
  { key: 'teams', labelFr: 'Equipes', labelEn: 'Teams', icon: 'groups', color: '#22C55E' },
  { key: 'witness', labelFr: 'Attestations', labelEn: 'Witness', icon: 'visibility', color: '#7C3AED' },
  { key: 'transfers', labelFr: 'Transferts', labelEn: 'Transfers', icon: 'swap-horiz', color: '#0EA5E9' },
  { key: 'claims', labelFr: 'Clubs', labelEn: 'Claims', icon: 'verified-user', color: '#2563EB' },
  { key: 'tournaments', labelFr: 'Tournois', labelEn: 'Tournaments', icon: 'emoji-events', color: theme.carreauColor },
  { key: 'preferences', labelFr: 'Réglages', labelEn: 'Settings', icon: 'tune', color: '#64748B' },
];

const NOTIF_ITEMS: { key: keyof NotificationPreferences; icon: string; color: string; labelFr: string; labelEn: string; descFr: string; descEn: string }[] = [
  { key: 'event_created', icon: 'campaign', color: '#7C3AED', labelFr: 'Defis ambassadeurs', labelEn: 'Ambassador challenges', descFr: 'Evenements dans un rayon de 200km', descEn: 'Events within 200km radius' },
  { key: 'meetup_invitation', icon: 'event', color: '#10B981', labelFr: 'Invitations RDV', labelEn: 'Meetup invitations', descFr: 'Rendez-vous terrain', descEn: 'Terrain meetup alerts' },
  { key: 'ranking_changed', icon: 'leaderboard', color: '#D97706', labelFr: 'Classement', labelEn: 'Rankings', descFr: 'Changements de position', descEn: 'Position changes' },
  { key: 'share_request', icon: 'share', color: '#2563EB', labelFr: 'Partage', labelEn: 'Sharing', descFr: 'Demandes de partage recues', descEn: 'Received share requests' },
  { key: 'event_reminder', icon: 'alarm', color: '#F59E0B', labelFr: 'Rappels', labelEn: 'Reminders', descFr: 'Rappels avant evenements', descEn: 'Pre-event reminders' },
];

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
  matchTeamA?: string;
  matchTeamB?: string;
  matchScoreA?: number;
  matchScoreB?: number;
  matchDate?: string;
  snapshot?: Record<string, any>;
}

export default function NotificationsHubScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const params = useLocalSearchParams<{ tab?: string }>();
  const fr = language === 'fr';
  const { tournaments } = useAppData();
  const { toggleTournamentNotification, isTournamentNotificationEnabled } = useAppActions();

  const [activeTab, setActiveTab] = useState<TabKey>((params.tab as TabKey) || 'invitations');

  // Sync tab from navigation params
  useEffect(() => {
    if (params.tab && TABS.some(t => t.key === params.tab)) {
      setActiveTab(params.tab as TabKey);
    }
  }, [params.tab]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [matchRequests, setMatchRequests] = useState<MatchShareRequest[]>([]);
  const [meetupInvitations, setMeetupInvitations] = useState<PendingInvitation[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const [witnessInvitations, setWitnessInvitations] = useState<WitnessInvitation[]>([]);
  const [respondingWitnessId, setRespondingWitnessId] = useState<string | null>(null);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());

  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied'>('denied');
  const [scheduledCount, setScheduledCount] = useState(0);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Transfers state
  const [transferRequests, setTransferRequests] = useState<PlayerTransferRequest[]>([]);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);
  const [transferFilter, setTransferFilter] = useState('all');

  // Team invitations state
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [respondingTeamId, setRespondingTeamId] = useState<string | null>(null);

  // Claims state
  const [clubClaims, setClubClaims] = useState<ClubClaimRequest[]>([]);
  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null);
  const [claimFilter, setClaimFilter] = useState('all');
  const [proofFullscreen, setProofFullscreen] = useState<string | null>(null);

  // Filter state
  const [invFilter, setInvFilter] = useState('all');
  const [witnessFilter, setWitnessFilter] = useState('all');
  const [tournamentFilter, setTournamentFilter] = useState('all');

  // Badge counts
  const pendingMatchCount = matchRequests.filter(r => r.status === 'pending').length;
  const pendingMeetupCount = meetupInvitations.length;
  const pendingWitnessCount = witnessInvitations.filter(i => i.status === 'pending').length;
  const pendingTeamCount = teamInvitations.filter(i => i.status === 'pending').length;
  const pendingTransferCount = transferRequests.filter(r => r.status === 'pending').length;
  const pendingClaimCount = clubClaims.filter(c => c.status === 'pending').length;
  const tabBadges: Record<TabKey, number> = {
    invitations: pendingMatchCount + pendingMeetupCount,
    teams: pendingTeamCount,
    witness: pendingWitnessCount,
    transfers: pendingTransferCount,
    claims: pendingClaimCount,
    tournaments: 0,
    preferences: 0,
  };

  const handleTabChange = useCallback((key: TabKey) => {
    Haptics.selectionAsync();
    if (key === 'preferences') {
      router.push('/notification-preferences' as any);
      return;
    }
    setActiveTab(key);
    setInvFilter('all');
    setWitnessFilter('all');
    setTransferFilter('all');
    setClaimFilter('all');
    setTournamentFilter('all');
  }, []);

  const isWithinDays = useCallback((dateStr: string, days: number) => {
    const diffMs = Math.abs(new Date(dateStr).getTime() - Date.now());
    return diffMs <= days * 86400000;
  }, []);

  // Filtered data
  const filteredMatchRequests = useMemo(() => {
    if (invFilter === 'meetups') return [];
    let items = matchRequests;
    if (invFilter === 'pending') items = items.filter(r => r.status === 'pending');
    if (invFilter === 'thisWeek') items = items.filter(r => isWithinDays(r.createdAt, 7));
    return items;
  }, [matchRequests, invFilter, isWithinDays]);

  const filteredMeetupInvitations = useMemo(() => {
    if (invFilter === 'matches') return [];
    let items = meetupInvitations;
    if (invFilter === 'thisWeek') items = items.filter(i => isWithinDays(i.date, 7));
    return items;
  }, [meetupInvitations, invFilter, isWithinDays]);

  const filteredWitnessInvitations = useMemo(() => {
    let items = witnessInvitations;
    if (witnessFilter === 'pending') items = items.filter(i => i.status === 'pending');
    if (witnessFilter === 'attested') items = items.filter(i => i.status === 'attested');
    if (witnessFilter === 'declined') items = items.filter(i => i.status === 'declined');
    if (witnessFilter === 'thisWeek') items = items.filter(i => isWithinDays(i.createdAt, 7));
    return items;
  }, [witnessInvitations, witnessFilter, isWithinDays]);

  const tournamentsWithNotifs = useMemo(() => tournaments.filter(t => isTournamentNotificationEnabled(t.id)), [tournaments, isTournamentNotificationEnabled]);

  // Load all data
  const loadAllData = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    try {
      // Auto-decline expired share requests (7 days)
      await autoDeclineExpiredShareRequests();
      const { requests } = await getReceivedShareRequests();
      setMatchRequests(requests);
      if (requests.length > 0) markShareRequestsSeen(requests.map(r => r.id));

      const { invitations: meetups } = await getPendingInvitations();
      setMeetupInvitations(meetups);

      const allAttestations = await fetchAllMyAttestations();
      const enriched: WitnessInvitation[] = [];
      for (const row of allAttestations) {
        let requesterName = row.witnessName || '';
        let matchTeamA = '', matchTeamB = '', matchScoreA = 0, matchScoreB = 0, matchDate = '';
        const itemType = row.itemType || 'match';
        const itemId = row.itemId || row.matchId;
        try { const { data: p } = await supabase.from('user_profiles').select('username').eq('id', row.requesterUserId).single(); if (p?.username) requesterName = p.username; } catch {}
        if (itemType === 'match' && itemId) {
          try {
            const { data: m } = await supabase.from('matches').select('date, team_a, team_b').eq('id', itemId).single();
            if (m) {
              matchDate = m.date;
              const ta = typeof m.team_a === 'string' ? JSON.parse(m.team_a) : m.team_a;
              const tb = typeof m.team_b === 'string' ? JSON.parse(m.team_b) : m.team_b;
              matchTeamA = (ta?.playerNames || []).join(', ') || 'Team A';
              matchTeamB = (tb?.playerNames || []).join(', ') || 'Team B';
              matchScoreA = ta?.score || 0; matchScoreB = tb?.score || 0;
            }
          } catch {}
        } else if (itemType === 'challenge' && itemId) {
          try {
            const { data: ch } = await supabase.from('challenges').select('date, type, mode, success_count, total_shots, total_points').eq('id', itemId).single();
            if (ch) {
              matchDate = ch.date;
              const typeLabel = ch.type === 'precision' ? 'Precision' : ch.type === '10_tirs_sautee' ? '10 Tirs Sautee' : '10 Tirs';
              matchTeamA = typeLabel;
              matchTeamB = ch.mode === '1v1' ? '1v1' : 'Solo';
              matchScoreA = ch.success_count || ch.total_points || 0;
              matchScoreB = ch.total_shots || 0;
            }
          } catch {}
        }
        enriched.push({ id: row.id, matchId: row.matchId, itemType, itemId, requesterUserId: row.requesterUserId, requesterName, status: row.status, createdAt: row.createdAt, attestationType: row.attestationType || 'standard', matchTeamA, matchTeamB, matchScoreA, matchScoreB, matchDate, snapshot: row.itemSnapshot || undefined });
      }
      setWitnessInvitations(enriched);

      const enabled = await areNotificationsEnabled();
      setPermissionStatus(enabled ? 'granted' : 'denied');

      // Auto-cancel notifications for past tournaments
      const now = Date.now();
      for (const t of tournaments) {
        if (isTournamentNotificationEnabled(t.id)) {
          const tDate = new Date(t.date);
          if (tDate.getTime() < now) {
            await cancelTournamentNotifications(t.id);
            toggleTournamentNotification(t.id);
          }
        }
      }

      // Count only tournament-related scheduled notifications
      const scheduled = await getAllScheduledNotifications();
      const tournamentScheduled = scheduled.filter((n: any) =>
        (n.identifier || '').startsWith('tournament_')
      );
      setScheduledCount(tournamentScheduled.length);

      // Load transfer requests
      const { requests: transferData } = await getReceivedTransferRequests();
      setTransferRequests(transferData);

      // Load club claims
      const { claims: claimsData } = await getReceivedClaims();
      setClubClaims(claimsData);

      // Load team invitations
      const { invitations: teamInvs } = await getPendingTeamInvitations();
      setTeamInvitations(teamInvs);

      const prefs = await loadNotificationPreferences();
      setNotifPrefs(prefs);
      setPrefsLoaded(true);
    } catch (e) { console.log('Error loading notifications hub:', e); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  const handleRefresh = useCallback(async () => { setRefreshing(true); await loadAllData(); setRefreshing(false); }, [loadAllData]);

  // Handlers
  const handleAcceptMatch = useCallback(async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessingIds(prev => new Set(prev).add(id));
    const { error } = await acceptShareRequest(id);
    if (!error) setMatchRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'accepted' } : r));
    setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const handleDeclineMatch = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessingIds(prev => new Set(prev).add(id));
    const { error } = await declineShareRequest(id);
    if (!error) setMatchRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'declined' } : r));
    setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const handleRespondMeetup = useCallback(async (inv: PendingInvitation, status: 'accepted' | 'declined') => {
    setProcessingIds(prev => new Set(prev).add(inv.meetupId));
    const { error } = await respondToMeetup(inv.meetupId, status);
    setProcessingIds(prev => { const n = new Set(prev); n.delete(inv.meetupId); return n; });
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMeetupInvitations(prev => prev.filter(i => i.meetupId !== inv.meetupId));
  }, [fr, showAlert]);

  const handleRespondWitness = useCallback(async (invitationId: string, response: 'attested' | 'declined') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRespondingWitnessId(invitationId);
    const { error } = await respondToAttestation(invitationId, response);
    setRespondingWitnessId(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
    setWitnessInvitations(prev => prev.map(inv => inv.id === invitationId ? { ...inv, status: response } : inv));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(fr ? 'Succes' : 'Success', response === 'attested' ? (fr ? 'Atteste avec succes (2.0x)' : 'Attested successfully (2.0x)') : (fr ? 'Demande refusee' : 'Request declined'));
  }, [showAlert, fr]);

  const getDaysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);

  const toggleSnapshot = useCallback((id: string) => {
    Haptics.selectionAsync();
    setExpandedSnapshots(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const handleDisableTournamentNotif = useCallback(async (tid: string, name: string) => {
    Alert.alert(fr ? 'Desactiver ?' : 'Disable?', `"${name}"`, [
      { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
      { text: fr ? 'Desactiver' : 'Disable', style: 'destructive', onPress: async () => {
        await cancelTournamentNotifications(tid);
        toggleTournamentNotification(tid);
        const scheduled = await getAllScheduledNotifications();
        setScheduledCount(scheduled.length);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  }, [fr, toggleTournamentNotification]);

  const handleTogglePref = useCallback((key: keyof NotificationPreferences) => {
    Haptics.selectionAsync();
    setNotifPrefs(prev => { const u = { ...prev, [key]: !prev[key] }; saveNotificationPreferences(u).catch(() => {}); return u; });
  }, []);

  // Claims handlers
  const handleAcceptClaim = useCallback(async (claimId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessingClaimId(claimId);
    const { error } = await acceptClubClaim(claimId);
    setProcessingClaimId(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
    setClubClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: 'accepted' as const } : c));
    showAlert(fr ? 'Succes' : 'Success', fr ? 'Propriete transferee avec succes. Badge Contributeur obtenu.' : 'Ownership transferred successfully. Contributor badge earned.');
  }, [fr, showAlert]);

  const handleDeclineClaim = useCallback(async (claimId: string) => {
    Alert.alert(fr ? 'Refuser la revendication ?' : 'Decline this claim?', '', [
      { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
      { text: fr ? 'Refuser' : 'Decline', style: 'destructive', onPress: async () => {
        setProcessingClaimId(claimId);
        const { error } = await declineClubClaim(claimId);
        setProcessingClaimId(null);
        if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
        setClubClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: 'declined' as const } : c));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  }, [fr, showAlert]);

  const filteredTransfers = useMemo(() => {
    let items = transferRequests;
    if (transferFilter === 'pending') items = items.filter(r => r.status === 'pending');
    if (transferFilter === 'accepted') items = items.filter(r => r.status === 'accepted');
    if (transferFilter === 'declined') items = items.filter(r => r.status === 'declined');
    return items;
  }, [transferRequests, transferFilter]);

  const handleAcceptTransfer = useCallback(async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessingTransferId(id);
    const { error } = await acceptTransferRequest(id);
    setProcessingTransferId(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
    const req = transferRequests.find(r => r.id === id);
    setTransferRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'accepted' as const } : r));
    showAlert(fr ? 'Transfert accepte' : 'Transfer accepted', fr ? 'Les matchs et defis ont ete reassignes a votre profil.' : 'Matches and challenges have been reassigned to your profile.');
    // Notify sender
    if (req) {
      try {
        const _pushModule = await import('@/services/pushTokenService');
        _pushModule.triggerServerPush('player_transfer_response', {
          senderUserId: req.senderUserId,
          recipientName: user?.username || user?.email || '',
          playerName: req.playerName,
          accepted: true,
        }).catch(() => {});
      } catch { /* silent */ }
    }
  }, [fr, showAlert, transferRequests, user]);

  const handleDeclineTransfer = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessingTransferId(id);
    const { error } = await declineTransferRequest(id);
    setProcessingTransferId(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
    const req = transferRequests.find(r => r.id === id);
    setTransferRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'declined' as const } : r));
    // Notify sender
    if (req) {
      try {
        const _pushModule = await import('@/services/pushTokenService');
        _pushModule.triggerServerPush('player_transfer_response', {
          senderUserId: req.senderUserId,
          recipientName: user?.username || user?.email || '',
          playerName: req.playerName,
          accepted: false,
        }).catch(() => {});
      } catch { /* silent */ }
    }
  }, [showAlert, fr, transferRequests, user]);

  const filteredClaims = useMemo(() => {
    let items = clubClaims;
    if (claimFilter === 'pending') items = items.filter(c => c.status === 'pending');
    if (claimFilter === 'accepted') items = items.filter(c => c.status === 'accepted');
    if (claimFilter === 'declined') items = items.filter(c => c.status === 'declined');
    return items;
  }, [clubClaims, claimFilter]);

  const enabledPrefCount = Object.values(notifPrefs).filter(Boolean).length;

  // ============ RENDER HELPERS ============
  const renderFilterChips = (filters: { key: string; labelFr: string; labelEn: string; icon: string }[], active: string, setActive: (k: string) => void) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipBar}>
      {filters.map(f => {
        const isActive = active === f.key;
        return (
          <Pressable key={f.key} style={[s.chip, isActive && s.chipActive]} onPress={() => { Haptics.selectionAsync(); setActive(f.key); }}>
            <MaterialIcons name={f.icon as any} size={14} color={isActive ? '#FFF' : theme.textSecondary} />
            <Text style={[s.chipText, isActive && s.chipTextActive]}>{fr ? f.labelFr : f.labelEn}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderEmpty = (icon: string, filtered: boolean) => (
    <View style={s.emptyWrap}>
      <View style={s.emptyIconBg}><MaterialIcons name={filtered ? 'filter-list-off' as any : icon as any} size={40} color={theme.textMuted} /></View>
      <Text style={s.emptyTitle}>{filtered ? (fr ? 'Aucun resultat' : 'No results') : (fr ? 'Rien ici pour le moment' : 'Nothing here yet')}</Text>
      <Text style={s.emptyDesc}>{filtered ? (fr ? 'Essayez un autre filtre' : 'Try a different filter') : (fr ? 'Les nouvelles notifications apparaitront ici' : 'New notifications will appear here')}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}><Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} /></Pressable><Text style={s.headerTitle}>{fr ? 'Notifications' : 'Notifications'}</Text><View style={{ width: 40 }} /></View>
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} /></Pressable>
        <Text style={s.headerTitle}>{fr ? 'Notifications' : 'Notifications'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Navigation */}
      <View style={s.tabNavWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabNavContent}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const badge = tabBadges[tab.key];
            return (
              <Pressable
                key={tab.key}
                style={[s.tabNavItem, isActive && { backgroundColor: tab.color, borderColor: tab.color }]}
                onPress={() => handleTabChange(tab.key)}
              >
                <MaterialIcons name={tab.icon as any} size={18} color={isActive ? '#FFF' : tab.color} />
                <Text style={[s.tabNavLabel, isActive && s.tabNavLabelActive]}>{fr ? tab.labelFr : tab.labelEn}</Text>
                {badge > 0 ? (
                  <View style={[s.tabNavBadge, isActive && { backgroundColor: '#FFF' }]}>
                    <Text style={[s.tabNavBadgeText, isActive && { color: tab.color }]}>{badge > 9 ? '9+' : badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >

        {/* ========== INVITATIONS TAB ========== */}
        {activeTab === 'invitations' ? (
          <View>
            {renderFilterChips([
              { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
              { key: 'pending', labelFr: 'En attente', labelEn: 'Pending', icon: 'schedule' },
              { key: 'matches', labelFr: 'Matchs', labelEn: 'Matches', icon: 'sports' },
              { key: 'meetups', labelFr: 'RDV', labelEn: 'Meetups', icon: 'event' },
              { key: 'thisWeek', labelFr: 'Cette semaine', labelEn: 'This week', icon: 'date-range' },
            ], invFilter, setInvFilter)}

            {/* Match invitations */}
            {filteredMatchRequests.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <View style={[s.sectionDot, { backgroundColor: theme.primary }]} />
                  <Text style={s.sectionLabel}>{fr ? 'Matchs & Defis' : 'Matches & Challenges'}</Text>
                  <Text style={s.sectionCount}>{filteredMatchRequests.length}</Text>
                </View>
                {filteredMatchRequests.map((req, i) => {
                  const isPending = req.status === 'pending';
                  const isProcessing = processingIds.has(req.id);
                  const isMatch = req.itemType === 'match';
                  const remaining = isPending ? getShareRequestRemainingTime(req.createdAt, req.status) : null;
                  return (
                    <Animated.View key={req.id} entering={FadeInDown.duration(250).delay(i * 30)}>
                      <View style={[s.card, !isPending && { opacity: 0.7 }]}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIconBg, { backgroundColor: (isMatch ? theme.primary : theme.accent) + '12' }]}>
                            <MaterialIcons name={isMatch ? 'sports' : 'gps-fixed'} size={20} color={isMatch ? theme.primary : theme.accent} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{isMatch ? (fr ? 'Match partage' : 'Shared match') : (fr ? 'Defi partage' : 'Shared challenge')}</Text>
                            <Text style={s.cardMeta}>{req.senderName || (fr ? 'Joueur' : 'Player')} {req.itemSummary ? `• ${req.itemSummary}` : ''}</Text>
                            {remaining ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <MaterialIcons name="timer" size={10} color={remaining.daysLeft <= 1 ? '#EF4444' : '#F59E0B'} />
                                <Text style={{ fontSize: 10, fontWeight: '600', color: remaining.daysLeft <= 1 ? '#EF4444' : '#F59E0B' }}>
                                  {remaining.isExpired
                                    ? (fr ? 'Expire' : 'Expired')
                                    : remaining.daysLeft > 0
                                      ? `${remaining.daysLeft}${fr ? 'j' : 'd'} ${remaining.hoursLeft}h ${fr ? 'restant' : 'left'}`
                                      : `${remaining.hoursLeft}h ${fr ? 'restant' : 'left'}`}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={[s.permChip, { backgroundColor: (req.permission === 'write' ? theme.accent : theme.primary) + '12' }]}>
                            <MaterialIcons name={req.permission === 'write' ? 'edit' : 'visibility'} size={10} color={req.permission === 'write' ? theme.accent : theme.primary} />
                            <Text style={[s.permChipText, { color: req.permission === 'write' ? theme.accent : theme.primary }]}>{req.permission === 'write' ? (fr ? 'Modif.' : 'Edit') : (fr ? 'Lect.' : 'Read')}</Text>
                          </View>
                        </View>
                        {isPending ? (
                          <View style={s.actionRow}>
                            <Pressable style={s.declineBtn} onPress={() => handleDeclineMatch(req.id)} disabled={isProcessing}><MaterialIcons name="close" size={16} color={theme.error} /><Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text></Pressable>
                            <Pressable style={s.acceptBtn} onPress={() => handleAcceptMatch(req.id)} disabled={isProcessing}>
                              {isProcessing ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Accepter' : 'Accept'}</Text></>}
                            </Pressable>
                          </View>
                        ) : (
                          <View style={s.statusRow}>
                            <MaterialIcons name={req.status === 'accepted' ? 'check-circle' : 'cancel'} size={14} color={req.status === 'accepted' ? theme.success : theme.textMuted} />
                            <Text style={[s.statusText, { color: req.status === 'accepted' ? theme.success : theme.textMuted }]}>{req.status === 'accepted' ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Refuse' : 'Declined')}</Text>
                            <Text style={s.statusDate}>{new Date(req.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {/* Meetup invitations */}
            {filteredMeetupInvitations.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <View style={[s.sectionDot, { backgroundColor: theme.success }]} />
                  <Text style={s.sectionLabel}>{fr ? 'Rendez-vous terrain' : 'Meetup Invitations'}</Text>
                  <Text style={s.sectionCount}>{filteredMeetupInvitations.length}</Text>
                </View>
                {filteredMeetupInvitations.map((inv, i) => {
                  const mDate = new Date(inv.date);
                  const isPast = mDate < new Date();
                  const isProcessing = processingIds.has(inv.meetupId);
                  return (
                    <Animated.View key={inv.meetupId} entering={FadeInDown.duration(250).delay(i * 30)}>
                      <View style={[s.card, isPast && { opacity: 0.6 }]}>
                        <Pressable style={s.cardRow} onPress={() => router.push(`/meetup/${inv.meetupId}` as any)}>
                          <View style={s.dateBlock}>
                            <Text style={s.dateBlockDay}>{mDate.getDate()}</Text>
                            <Text style={s.dateBlockMonth}>{mDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>{inv.title}</Text>
                            <Text style={s.cardMeta}>{mDate.toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })} {inv.terrainName ? `• ${inv.terrainName}` : ''}</Text>
                            <Text style={s.cardMetaSub}>{fr ? 'Par' : 'By'} {inv.creatorName || '?'} • {inv.acceptedCount}/{inv.maxParticipants}</Text>
                          </View>
                          <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                        </Pressable>
                        {!isPast ? (
                          <View style={s.actionRow}>
                            <Pressable style={s.declineBtn} onPress={() => handleRespondMeetup(inv, 'declined')} disabled={isProcessing}><MaterialIcons name="close" size={16} color={theme.error} /><Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text></Pressable>
                            <Pressable style={s.acceptBtn} onPress={() => handleRespondMeetup(inv, 'accepted')} disabled={isProcessing}>
                              {isProcessing ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Accepter' : 'Accept'}</Text></>}
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {filteredMatchRequests.length === 0 && filteredMeetupInvitations.length === 0 ? renderEmpty('mail-outline', invFilter !== 'all') : null}
          </View>
        ) : null}

        {/* ========== TEAMS TAB ========== */}
        {activeTab === 'teams' ? (
          <View>
            <View style={s.tipBanner}>
              <View style={[s.tipIcon, { backgroundColor: '#DCFCE7' }]}><MaterialIcons name="info-outline" size={16} color="#22C55E" /></View>
              <Text style={[s.tipText, { color: '#166534' }]}>{fr ? 'Acceptez les invitations pour former votre equipe de doublette ou triplette pour les tournois.' : 'Accept invitations to form your doubles or triples team for tournaments.'}</Text>
            </View>

            {teamInvitations.length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: '#22C55E' }]} /><Text style={s.sectionLabel}>{fr ? 'Invitations d\'equipe' : 'Team Invitations'}</Text><Text style={s.sectionCount}>{teamInvitations.length}</Text></View>
                {teamInvitations.map((inv, idx) => {
                  const isPending = inv.status === 'pending';
                  const teamSize = getTeamSize(inv.format);
                  return (
                    <Animated.View key={inv.id} entering={FadeInDown.duration(250).delay(idx * 40)}>
                      <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: isPending ? '#22C55E' : '#94A3B8' }, !isPending && { opacity: 0.65 }]}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIconBg, { backgroundColor: '#22C55E12' }]}>
                            <MaterialIcons name="groups" size={20} color="#22C55E" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>
                              <Text style={{ fontWeight: '700', color: '#0F172A' }}>{inv.inviterName}</Text>
                              {' '}{fr ? 'vous invite' : 'invites you'}
                            </Text>
                            <Text style={s.cardMeta}>{inv.tournamentName}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <View style={{ backgroundColor: '#22C55E15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#22C55E' }}>{inv.format}</Text>
                              </View>
                              <Text style={{ fontSize: 10, color: '#64748B' }}>{teamSize} {fr ? 'joueurs' : 'players'}</Text>
                            </View>
                          </View>
                        </View>
                        {isPending ? (
                          <View style={s.actionRow}>
                            <Pressable
                              style={s.declineBtn}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                setRespondingTeamId(inv.id);
                                const { error } = await respondToTeamInvitation(inv.id, 'declined');
                                setRespondingTeamId(null);
                                if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
                                setTeamInvitations(prev => prev.filter(i => i.id !== inv.id));
                              }}
                              disabled={respondingTeamId === inv.id}
                            >
                              <MaterialIcons name="close" size={16} color={theme.error} />
                              <Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text>
                            </Pressable>
                            <Pressable
                              style={[s.acceptBtn, { backgroundColor: '#22C55E' }]}
                              onPress={async () => {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                setRespondingTeamId(inv.id);
                                const { error, teamComplete } = await respondToTeamInvitation(inv.id, 'accepted');
                                setRespondingTeamId(null);
                                if (error) { showAlert(fr ? 'Erreur' : 'Error', error); return; }
                                setTeamInvitations(prev => prev.filter(i => i.id !== inv.id));
                                if (teamComplete) {
                                  showAlert(fr ? 'Equipe complete !' : 'Team complete!', fr ? 'Votre equipe est formee pour ce tournoi.' : 'Your team is ready for this tournament.');
                                } else {
                                  showAlert(fr ? 'Invitation acceptee' : 'Invitation accepted');
                                }
                              }}
                              disabled={respondingTeamId === inv.id}
                            >
                              {respondingTeamId === inv.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                                <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Accepter' : 'Accept'}</Text></>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <View style={s.statusRow}>
                            <MaterialIcons name={inv.status === 'accepted' ? 'check-circle' : 'cancel'} size={14} color={inv.status === 'accepted' ? theme.success : theme.textMuted} />
                            <Text style={[s.statusText, { color: inv.status === 'accepted' ? theme.success : theme.textMuted }]}>{inv.status === 'accepted' ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Refuse' : 'Declined')}</Text>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : renderEmpty('groups', false)}
          </View>
        ) : null}

        {/* ========== WITNESS TAB ========== */}
        {activeTab === 'witness' ? (
          <View>
            {renderFilterChips([
              { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
              { key: 'pending', labelFr: 'En attente', labelEn: 'Pending', icon: 'schedule' },
              { key: 'attested', labelFr: 'Attestees', labelEn: 'Attested', icon: 'check-circle' },
              { key: 'declined', labelFr: 'Refusees', labelEn: 'Declined', icon: 'cancel' },
              { key: 'thisWeek', labelFr: 'Cette semaine', labelEn: 'This week', icon: 'date-range' },
            ], witnessFilter, setWitnessFilter)}

            <View style={s.tipBanner}>
              <View style={s.tipIcon}><MaterialIcons name="info-outline" size={16} color="#7C3AED" /></View>
              <Text style={s.tipText}>{fr ? 'Attestez les matchs auxquels vous avez assiste. Poids x2.0 dans le classement.' : 'Attest matches you witnessed. Weight upgrades to 2.0x in leaderboard.'}</Text>
            </View>

            {filteredWitnessInvitations.filter(i => i.status === 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: '#D97706' }]} /><Text style={s.sectionLabel}>{fr ? 'En attente' : 'Pending'}</Text><Text style={s.sectionCount}>{filteredWitnessInvitations.filter(i => i.status === 'pending').length}</Text></View>
                {filteredWitnessInvitations.filter(i => i.status === 'pending').map((inv, idx) => {
                  const isChallenge = inv.itemType === 'challenge';
                  const isOpponent = inv.attestationType === 'opponent_confirmation';
                  const iconName = isOpponent ? 'people' : isChallenge ? 'track-changes' : 'sports';
                  const iconColor = isOpponent ? '#3B82F6' : isChallenge ? '#7C3AED' : '#D97706';
                  const itemRoute = isChallenge ? `/challenge/${inv.itemId}` : `/match/${inv.itemId || inv.matchId}`;
                  return (
                    <Animated.View key={inv.id} entering={FadeInDown.duration(250).delay(idx * 40)}>
                      <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: isOpponent ? '#3B82F6' : '#D97706' }]}>
                        <Pressable style={s.cardRow} onPress={() => router.push(itemRoute as any)}>
                          <View style={[s.cardIconBg, { backgroundColor: iconColor + '10' }]}><MaterialIcons name={iconName as any} size={20} color={iconColor} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>
                              {isChallenge
                                ? (inv.matchTeamA || 'Challenge')
                                : `${inv.matchTeamA || 'Team A'} vs ${inv.matchTeamB || 'Team B'}`}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {isChallenge ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <View style={{ backgroundColor: '#7C3AED15', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
                                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'DEFI' : 'CHALLENGE'}</Text>
                                  </View>
                                  <Text style={s.cardMeta}>{inv.matchScoreA}/{inv.matchScoreB}</Text>
                                </View>
                              ) : (
                                <Text style={s.cardMeta}>{inv.matchScoreA} - {inv.matchScoreB}</Text>
                              )}
                              {inv.matchDate ? <><View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#94A3B8' }} /><Text style={s.cardMeta}>{new Date(inv.matchDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text></> : null}
                            </View>
                            <Text style={s.cardMetaSub}>{fr ? 'Demande par' : 'By'} {inv.requesterName}</Text>
                          </View>
                          <MaterialIcons name="open-in-new" size={16} color={theme.primary} />
                        </Pressable>
                        {isOpponent ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4, backgroundColor: '#3B82F608', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#3B82F615' }}>
                            <MaterialIcons name="handshake" size={13} color="#3B82F6" />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#3B82F6', flex: 1 }}>
                              {fr ? 'Confirmation adversaire - confirmez le resultat' : 'Opponent confirmation - confirm the result'}
                            </Text>
                          </View>
                        ) : null}
                        {/* Snapshot preview */}
                        {inv.snapshot ? (
                          <View style={{ marginTop: 6, marginBottom: 4 }}>
                            <Pressable
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#F1F5F9', borderRadius: 8, alignSelf: 'flex-start' }}
                              onPress={() => toggleSnapshot(inv.id)}
                            >
                              <MaterialIcons name={expandedSnapshots.has(inv.id) ? 'expand-less' : 'expand-more'} size={14} color="#64748B" />
                              <MaterialIcons name="photo-camera" size={12} color="#64748B" />
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>{fr ? 'Apercu snapshot' : 'Snapshot preview'}</Text>
                            </Pressable>
                            {expandedSnapshots.has(inv.id) ? (
                              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 }}>
                                {isChallenge ? (
                                  <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 10, color: '#64748B' }}>Type</Text>
                                      <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.type} ({inv.snapshot.mode})</Text>
                                    </View>
                                    {inv.snapshot.successCount !== undefined ? (
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B' }}>{fr ? 'Score' : 'Score'}</Text>
                                        <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.successCount}/{inv.snapshot.totalShots}{inv.snapshot.successRate ? ` (${inv.snapshot.successRate}%)` : ''}</Text>
                                      </View>
                                    ) : null}
                                    {inv.snapshot.playerName ? (
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B' }}>{fr ? 'Joueur' : 'Player'}</Text>
                                        <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.playerName}{inv.snapshot.opponentName ? ` vs ${inv.snapshot.opponentName}` : ''}</Text>
                                      </View>
                                    ) : null}
                                  </>
                                ) : inv.snapshot.teamA ? (
                                  <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 10, color: '#64748B' }}>{fr ? 'Equipes' : 'Teams'}</Text>
                                      <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.teamA?.playerNames?.join(', ')} vs {inv.snapshot.teamB?.playerNames?.join(', ')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                      <Text style={{ fontSize: 10, color: '#64748B' }}>Score</Text>
                                      <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '700' }}>{inv.snapshot.teamA?.score} - {inv.snapshot.teamB?.score}</Text>
                                    </View>
                                    {inv.snapshot.format ? (
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B' }}>Format</Text>
                                        <Text style={{ fontSize: 10, color: '#0F172A', fontWeight: '600' }}>{inv.snapshot.format}{inv.snapshot.duration ? ` - ${inv.snapshot.duration} min` : ''}</Text>
                                      </View>
                                    ) : null}
                                  </>
                                ) : null}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingTop: 3, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                                  <MaterialIcons name="lock-clock" size={9} color="#CBD5E1" />
                                  <Text style={{ fontSize: 8, color: '#CBD5E1' }}>{inv.snapshot.snapshotAt ? new Date(inv.snapshot.snapshotAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                        <View style={s.actionRow}>
                          <Pressable style={s.declineBtn} onPress={() => handleRespondWitness(inv.id, 'declined')} disabled={respondingWitnessId === inv.id}><MaterialIcons name="close" size={16} color={theme.error} /><Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text></Pressable>
                          <Pressable style={[s.acceptBtn, { backgroundColor: '#7C3AED' }]} onPress={() => handleRespondWitness(inv.id, 'attested')} disabled={respondingWitnessId === inv.id}>
                            {respondingWitnessId === inv.id ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Attester (2.0x)' : 'Attest (2.0x)'}</Text></>}
                          </Pressable>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {filteredWitnessInvitations.filter(i => i.status !== 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: theme.textMuted }]} /><Text style={s.sectionLabel}>{fr ? 'Historique' : 'History'}</Text></View>
                {filteredWitnessInvitations.filter(i => i.status !== 'pending').map((inv, idx) => {
                  const c = inv.status === 'attested' ? '#22C55E' : '#EF4444';
                  const isChallenge = inv.itemType === 'challenge';
                  const isOpponent = inv.attestationType === 'opponent_confirmation';
                  const itemRoute = isChallenge ? `/challenge/${inv.itemId}` : `/match/${inv.itemId || inv.matchId}`;
                  return (
                    <Animated.View key={inv.id} entering={FadeIn.duration(200).delay(idx * 25)}>
                      <Pressable style={[s.card, { borderLeftWidth: 3, borderLeftColor: c, opacity: 0.75 }]} onPress={() => router.push(itemRoute as any)}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIconBg, { backgroundColor: c + '10' }]}><MaterialIcons name={inv.status === 'attested' ? 'check-circle' : 'cancel'} size={20} color={c} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>
                              {isChallenge
                                ? (inv.matchTeamA || 'Challenge')
                                : `${inv.matchTeamA || 'Team A'} vs ${inv.matchTeamB || 'Team B'}`}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {isChallenge ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <View style={{ backgroundColor: '#7C3AED15', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
                                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'DEFI' : 'CHALLENGE'}</Text>
                                  </View>
                                  <Text style={s.cardMeta}>{inv.matchScoreA}/{inv.matchScoreB}</Text>
                                </View>
                              ) : (
                                <Text style={s.cardMeta}>{inv.matchScoreA} - {inv.matchScoreB}</Text>
                              )}
                              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#94A3B8' }} />
                              <Text style={s.cardMeta}>{inv.requesterName}</Text>
                              {isOpponent ? <View style={{ backgroundColor: '#3B82F612', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}><Text style={{ fontSize: 8, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'ADV.' : 'OPP.'}</Text></View> : null}
                            </View>
                          </View>
                          <View style={[s.statusChip, { backgroundColor: c + '12' }]}><Text style={[s.statusChipText, { color: c }]}>{inv.status === 'attested' ? (fr ? 'Atteste' : 'Attested') : (fr ? 'Refuse' : 'Declined')}</Text></View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {filteredWitnessInvitations.length === 0 ? renderEmpty('visibility-off', witnessFilter !== 'all') : null}
          </View>
        ) : null}

        {/* ========== TRANSFERS TAB ========== */}
        {activeTab === 'transfers' ? (
          <View>
            {renderFilterChips([
              { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
              { key: 'pending', labelFr: 'En attente', labelEn: 'Pending', icon: 'schedule' },
              { key: 'accepted', labelFr: 'Acceptes', labelEn: 'Accepted', icon: 'check-circle' },
              { key: 'declined', labelFr: 'Refuses', labelEn: 'Declined', icon: 'cancel' },
            ], transferFilter, setTransferFilter)}

            <View style={s.tipBanner}>
              <View style={[s.tipIcon, { backgroundColor: '#DBEAFE' }]}><MaterialIcons name="info-outline" size={16} color="#0EA5E9" /></View>
              <Text style={[s.tipText, { color: '#0369A1' }]}>{fr ? 'Quand vous acceptez un transfert, les matchs et defis du joueur local sont reassignes a votre profil et vos statistiques sont mises a jour.' : 'When you accept a transfer, the local player\'s matches and challenges are reassigned to your profile and stats are updated.'}</Text>
            </View>

            {filteredTransfers.filter(r => r.status === 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: '#0EA5E9' }]} /><Text style={s.sectionLabel}>{fr ? 'En attente' : 'Pending'}</Text><Text style={s.sectionCount}>{filteredTransfers.filter(r => r.status === 'pending').length}</Text></View>
                {filteredTransfers.filter(r => r.status === 'pending').map((req, idx) => (
                  <Animated.View key={req.id} entering={FadeInDown.duration(250).delay(idx * 40)}>
                    <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: '#0EA5E9' }]}>
                      <View style={s.cardRow}>
                        <View style={[s.cardIconBg, { backgroundColor: '#0EA5E912' }]}><MaterialIcons name="swap-horiz" size={20} color="#0EA5E9" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle} numberOfLines={1}>{req.playerName}</Text>
                          <Text style={s.cardMeta}>{fr ? 'De' : 'From'} {req.senderName || '?'}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.primary + '10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                              <MaterialIcons name="sports" size={10} color={theme.primary} />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>{req.matchCount} {fr ? 'matchs' : 'matches'}</Text>
                            </View>
                            {req.challengeCount > 0 ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7C3AED10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                <MaterialIcons name="track-changes" size={10} color="#7C3AED" />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{req.challengeCount} {fr ? 'defis' : 'challenges'}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      {req.message ? (
                        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <MaterialIcons name="format-quote" size={14} color="#94A3B8" />
                          <Text style={{ flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18, fontStyle: 'italic' }}>{req.message}</Text>
                        </View>
                      ) : null}
                      <View style={s.actionRow}>
                        <Pressable style={s.declineBtn} onPress={() => handleDeclineTransfer(req.id)} disabled={processingTransferId === req.id}><MaterialIcons name="close" size={16} color={theme.error} /><Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text></Pressable>
                        <Pressable style={[s.acceptBtn, { backgroundColor: '#0EA5E9' }]} onPress={() => handleAcceptTransfer(req.id)} disabled={processingTransferId === req.id}>
                          {processingTransferId === req.id ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Accepter' : 'Accept'}</Text></>}
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>
            ) : null}

            {filteredTransfers.filter(r => r.status !== 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: theme.textMuted }]} /><Text style={s.sectionLabel}>{fr ? 'Historique' : 'History'}</Text></View>
                {filteredTransfers.filter(r => r.status !== 'pending').map((req, idx) => {
                  const color = req.status === 'accepted' ? '#22C55E' : '#EF4444';
                  return (
                    <Animated.View key={req.id} entering={FadeIn.duration(200).delay(idx * 25)}>
                      <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: color, opacity: 0.75 }]}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIconBg, { backgroundColor: color + '10' }]}><MaterialIcons name={req.status === 'accepted' ? 'check-circle' : 'cancel'} size={20} color={color} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>{req.playerName}</Text>
                            <Text style={s.cardMeta}>{fr ? 'De' : 'From'} {req.senderName || '?'} {"•"} {req.matchCount} {fr ? 'matchs' : 'matches'}</Text>
                          </View>
                          <View style={[s.statusChip, { backgroundColor: color + '12' }]}><Text style={[s.statusChipText, { color }]}>{req.status === 'accepted' ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Refuse' : 'Declined')}</Text></View>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {filteredTransfers.length === 0 ? renderEmpty('swap-horiz', transferFilter !== 'all') : null}
          </View>
        ) : null}

        {/* ========== CLAIMS TAB ========== */}
        {activeTab === 'claims' ? (
          <View>
            {renderFilterChips([
              { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
              { key: 'pending', labelFr: 'En attente', labelEn: 'Pending', icon: 'schedule' },
              { key: 'accepted', labelFr: 'Acceptees', labelEn: 'Accepted', icon: 'check-circle' },
              { key: 'declined', labelFr: 'Refusees', labelEn: 'Declined', icon: 'cancel' },
            ], claimFilter, setClaimFilter)}

            <View style={s.tipBanner}>
              <View style={[s.tipIcon, { backgroundColor: '#DBEAFE' }]}><MaterialIcons name="info-outline" size={16} color="#2563EB" /></View>
              <Text style={[s.tipText, { color: '#1D4ED8' }]}>{fr ? 'Les demandes de revendication de vos clubs apparaissent ici. Acceptez pour transferer la propriete et obtenir le badge Contributeur.' : 'Ownership claims for your clubs appear here. Accept to transfer ownership and earn the Contributor badge.'}</Text>
            </View>

            {filteredClaims.filter(c => c.status === 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: '#F59E0B' }]} /><Text style={s.sectionLabel}>{fr ? 'En attente' : 'Pending'}</Text><Text style={s.sectionCount}>{filteredClaims.filter(c => c.status === 'pending').length}</Text></View>
                {filteredClaims.filter(c => c.status === 'pending').map((claim, idx) => (
                  <Animated.View key={claim.id} entering={FadeInDown.duration(250).delay(idx * 40)}>
                    <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: '#F59E0B' }]}>
                      <View style={s.cardRow}>
                        <View style={[s.cardIconBg, { backgroundColor: '#F59E0B12' }]}><MaterialIcons name="verified-user" size={20} color="#F59E0B" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle} numberOfLines={1}>{claim.requesterName || claim.requesterEmail || (fr ? 'Utilisateur' : 'User')}</Text>
                          <Text style={s.cardMeta}>{claim.requesterEmail || ''}</Text>
                          <Text style={s.cardMetaSub}>{new Date(claim.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        </View>
                        <Pressable onPress={() => router.push(`/club/${claim.clubId}` as any)} hitSlop={8}>
                          <MaterialIcons name="open-in-new" size={16} color={theme.primary} />
                        </Pressable>
                      </View>
                      {claim.message ? (
                        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <MaterialIcons name="format-quote" size={14} color="#94A3B8" />
                          <Text style={{ flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18, fontStyle: 'italic' }}>{claim.message}</Text>
                        </View>
                      ) : null}
                      {claim.proofUrl ? (
                        <Pressable
                          style={{ borderRadius: 10, overflow: 'hidden', marginTop: 8, borderWidth: 1, borderColor: '#2563EB20' }}
                          onPress={() => claim.proofUrl!.toLowerCase().endsWith('.pdf') ? Linking.openURL(claim.proofUrl!) : setProofFullscreen(claim.proofUrl!)}
                        >
                          {claim.proofUrl.toLowerCase().endsWith('.pdf') ? (
                            <View style={{ width: '100%', height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', gap: 4 }}>
                              <MaterialIcons name="picture-as-pdf" size={28} color="#EF4444" />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#0F172A' }}>{fr ? 'Document PDF' : 'PDF Document'}</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: claim.proofUrl }} style={{ width: '100%', height: 100 }} contentFit="cover" transition={200} />
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: '#EFF6FF' }}>
                            <MaterialIcons name={claim.proofUrl.toLowerCase().endsWith('.pdf') ? 'open-in-new' : 'photo'} size={13} color="#2563EB" />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#2563EB' }}>{fr ? 'Piece justificative jointe' : 'Supporting proof attached'}</Text>
                          </View>
                        </Pressable>
                      ) : null}
                      <View style={s.actionRow}>
                        <Pressable style={s.declineBtn} onPress={() => handleDeclineClaim(claim.id)} disabled={processingClaimId === claim.id}><MaterialIcons name="close" size={16} color={theme.error} /><Text style={s.declineBtnText}>{fr ? 'Refuser' : 'Decline'}</Text></Pressable>
                        <Pressable style={[s.acceptBtn, { backgroundColor: '#10B981' }]} onPress={() => handleAcceptClaim(claim.id)} disabled={processingClaimId === claim.id}>
                          {processingClaimId === claim.id ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="check" size={16} color="#FFF" /><Text style={s.acceptBtnText}>{fr ? 'Accepter le transfert' : 'Accept transfer'}</Text></>}
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>
            ) : null}

            {filteredClaims.filter(c => c.status !== 'pending').length > 0 ? (
              <View style={s.section}>
                <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: theme.textMuted }]} /><Text style={s.sectionLabel}>{fr ? 'Historique' : 'History'}</Text></View>
                {filteredClaims.filter(c => c.status !== 'pending').map((claim, idx) => {
                  const color = claim.status === 'accepted' ? '#22C55E' : '#EF4444';
                  return (
                    <Animated.View key={claim.id} entering={FadeIn.duration(200).delay(idx * 25)}>
                      <Pressable style={[s.card, { borderLeftWidth: 3, borderLeftColor: color, opacity: 0.75 }]} onPress={() => router.push(`/club/${claim.clubId}` as any)}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIconBg, { backgroundColor: color + '10' }]}><MaterialIcons name={claim.status === 'accepted' ? 'check-circle' : 'cancel'} size={20} color={color} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>{claim.requesterName || claim.requesterEmail || (fr ? 'Utilisateur' : 'User')}</Text>
                            <Text style={s.cardMeta}>{new Date(claim.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                          </View>
                          <View style={[s.statusChip, { backgroundColor: color + '12' }]}><Text style={[s.statusChipText, { color }]}>{claim.status === 'accepted' ? (fr ? 'Transfere' : 'Transferred') : (fr ? 'Refuse' : 'Declined')}</Text></View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {filteredClaims.length === 0 ? renderEmpty('verified-user', claimFilter !== 'all') : null}

            {/* Proof Fullscreen Modal */}
            <Modal visible={!!proofFullscreen} animationType="fade" transparent onRequestClose={() => setProofFullscreen(null)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                <Pressable style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }} onPress={() => setProofFullscreen(null)}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="close" size={28} color="#FFF" />
                  </View>
                </Pressable>
                {proofFullscreen ? <Image source={{ uri: proofFullscreen }} style={{ width: 360, height: 500 }} contentFit="contain" transition={200} /> : null}
              </View>
            </Modal>
          </View>
        ) : null}

        {/* ========== TOURNAMENTS TAB ========== */}
        {activeTab === 'tournaments' ? (
          <View>
            {renderFilterChips([
              { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
              { key: 'thisWeek', labelFr: 'Cette semaine', labelEn: 'This week', icon: 'date-range' },
              { key: 'thisMonth', labelFr: 'Ce mois', labelEn: 'This month', icon: 'calendar-month' },
              { key: 'past', labelFr: 'Passes', labelEn: 'Past', icon: 'history' },
            ], tournamentFilter, setTournamentFilter)}

            {/* Permission status */}
            <View style={[s.statusCard, { borderColor: permissionStatus === 'granted' ? theme.success + '30' : theme.warning + '30' }]}>
              <View style={[s.statusCardIcon, { backgroundColor: (permissionStatus === 'granted' ? theme.success : theme.warning) + '15' }]}>
                <MaterialIcons name={permissionStatus === 'granted' ? 'notifications-active' : 'notifications-off'} size={22} color={permissionStatus === 'granted' ? theme.success : theme.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.statusCardTitle, { color: permissionStatus === 'granted' ? theme.success : theme.warning }]}>{permissionStatus === 'granted' ? (fr ? 'Notifications actives' : 'Notifications active') : (fr ? 'Notifications desactivees' : 'Notifications disabled')}</Text>
                <Text style={s.statusCardSub}>{permissionStatus === 'granted' ? `${scheduledCount} ${fr ? 'rappels' : 'reminders'}` : (fr ? 'Activez pour recevoir les rappels' : 'Enable to receive reminders')}</Text>
              </View>
              {permissionStatus !== 'granted' ? <Pressable style={s.enableBtn} onPress={async () => { const g = await requestNotificationPermissions(); setPermissionStatus(g ? 'granted' : 'denied'); }}><Text style={s.enableBtnText}>{fr ? 'Activer' : 'Enable'}</Text></Pressable> : null}
            </View>

            {(() => {
              let filtered = tournamentsWithNotifs;
              if (tournamentFilter === 'thisWeek') filtered = filtered.filter(t => { const d = getDaysUntil(t.date); return d >= 0 && d <= 7; });
              if (tournamentFilter === 'thisMonth') filtered = filtered.filter(t => { const d = getDaysUntil(t.date); return d >= 0 && d <= 30; });
              if (tournamentFilter === 'past') filtered = filtered.filter(t => getDaysUntil(t.date) < 0);
              return filtered.length > 0 ? (
                <View style={s.section}>
                  <View style={s.sectionRow}><View style={[s.sectionDot, { backgroundColor: theme.carreauColor }]} /><Text style={s.sectionLabel}>{fr ? 'Rappels actifs' : 'Active reminders'}</Text><Text style={s.sectionCount}>{filtered.length}</Text></View>
                  {filtered.map((tournament, i) => {
                    const daysUntil = getDaysUntil(tournament.date);
                    const isPast = daysUntil < 0;
                    return (
                      <Animated.View key={tournament.id} entering={FadeIn.duration(200).delay(i * 30)}>
                        <View style={[s.card, isPast && { opacity: 0.55 }]}>
                          <Pressable style={s.cardRow} onPress={() => router.push(`/tournament/${tournament.id}`)}>
                            <View style={[s.cardIconBg, { backgroundColor: theme.carreauColor + '12' }]}><MaterialIcons name="emoji-events" size={20} color={isPast ? theme.textMuted : theme.carreauColor} /></View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.cardTitle} numberOfLines={1}>{tournament.name}</Text>
                              <Text style={s.cardMeta}>{new Date(tournament.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })} {!isPast ? `• ${daysUntil === 0 ? (fr ? "Aujourd'hui" : 'Today') : `${daysUntil}${fr ? 'j' : 'd'}`}` : ''}</Text>
                            </View>
                            <Pressable style={s.iconBtn} onPress={() => handleDisableTournamentNotif(tournament.id, tournament.name)} hitSlop={8}>
                              <MaterialIcons name="notifications-off" size={16} color={theme.error} />
                            </Pressable>
                          </Pressable>
                        </View>
                      </Animated.View>
                    );
                  })}
                </View>
              ) : renderEmpty('notifications-none', tournamentFilter !== 'all');
            })()}
          </View>
        ) : null}

        {/* PREFERENCES TAB: handled by navigation in handleTabChange */}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Tab navigation
  tabNavWrap: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 10 },
  tabNavContent: { paddingHorizontal: 16, gap: 8 },
  tabNavItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  tabNavLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  tabNavLabelActive: { color: '#FFF' },
  tabNavBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabNavBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },

  // Filter chips
  chipBar: { paddingBottom: 14, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFF' },

  // Section
  section: { marginBottom: 24 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', letterSpacing: 0.3, flex: 1 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: '#94A3B8', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },

  // Card
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  cardIconBg: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', lineHeight: 20 },
  cardMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  cardMetaSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  permChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  permChipText: { fontSize: 10, fontWeight: '700' },

  // Date block
  dateBlock: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  dateBlockDay: { fontSize: 17, fontWeight: '800', color: '#2563EB', lineHeight: 19 },
  dateBlockMonth: { fontSize: 8, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  acceptBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 12, backgroundColor: '#0F172A' },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F8FAFC' },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusDate: { fontSize: 11, color: '#94A3B8', marginLeft: 'auto' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 10, fontWeight: '700' },

  // Tip
  tipBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#EDE9FE' },
  tipIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, fontSize: 12, color: '#6D28D9', lineHeight: 17, fontWeight: '500' },

  // Status card
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, gap: 12, borderWidth: 1 },
  statusCardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusCardTitle: { fontSize: 14, fontWeight: '700' },
  statusCardSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  enableBtn: { backgroundColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  enableBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },

  // Preferences
  prefHero: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, gap: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  prefHeroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  prefHeroTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  prefHeroSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  prefList: { gap: 6 },
  prefCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F1F5F9' },
  prefCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prefCardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefCardLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  prefCardDesc: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },

  // Footnote
  footnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginTop: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  footnoteText: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 16 },
});
