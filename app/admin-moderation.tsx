/**
 * Admin Moderation Page
 *
 * Allows admins to:
 * - View all player reports with stats dashboard
 * - Filter by status (pending, warned, suspended, banned, dismissed)
 * - Take quick actions (warn, suspend, ban, dismiss)
 * - View detailed profile of reported player (stats + trust score)
 * - Add admin notes to reports
 * - View moderation action history
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import {
  getPlayerReports,
  updateReportStatus,
  getReportedPlayerDetail,
  deleteReport,
  getReportStats,
  PlayerReport,
  ReportedPlayerDetail,
} from '@/services/moderationService';
import { fetchFlaggedReviews, moderateReview, deleteTerrainReview } from '@/services/terrainReviewService';
import { getEloRank } from '@/services/eloService';
import { getAllAppeals, respondToAppeal, BanAppeal } from '@/services/banAppealService';
import { logAdminAction } from '@/services/adminActivityLogService';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { ModerationSkeleton } from '@/components/ui/AdminSkeleton';

type FilterKey = 'all' | 'pending' | 'warned' | 'suspended' | 'banned' | 'dismissed';

const REASON_ANALYTICS_COLORS: Record<string, string> = {
  fake_stats: '#EF4444',
  unsportsmanlike: '#D97706',
  harassment: '#991B1B',
  cheating: '#DC2626',
  inappropriate: '#7C3AED',
  other: '#64748B',
};

const FILTERS: { key: FilterKey; icon: string; color: string; labelFr: string; labelEn: string }[] = [
  { key: 'all', icon: 'list', color: '#64748B', labelFr: 'Tout', labelEn: 'All' },
  { key: 'pending', icon: 'schedule', color: '#F59E0B', labelFr: 'En attente', labelEn: 'Pending' },
  { key: 'warned', icon: 'warning-amber', color: '#D97706', labelFr: 'Avertis', labelEn: 'Warned' },
  { key: 'suspended', icon: 'pause-circle', color: '#EF4444', labelFr: 'Suspendus', labelEn: 'Suspended' },
  { key: 'banned', icon: 'block', color: '#991B1B', labelFr: 'Bannis', labelEn: 'Banned' },
  { key: 'dismissed', icon: 'check-circle', color: '#10B981', labelFr: 'Classes', labelEn: 'Dismissed' },
];

const ACTION_OPTIONS: { key: 'warned' | 'suspended' | 'banned' | 'dismissed'; icon: string; color: string; labelFr: string; labelEn: string; descFr: string; descEn: string }[] = [
  { key: 'warned', icon: 'warning-amber', color: '#D97706', labelFr: 'Avertir', labelEn: 'Warn', descFr: 'Envoyer un avertissement au joueur', descEn: 'Send a warning to the player' },
  { key: 'suspended', icon: 'pause-circle', color: '#EF4444', labelFr: 'Suspendre', labelEn: 'Suspend', descFr: 'Suspendre temporairement le joueur', descEn: 'Temporarily suspend the player' },
  { key: 'banned', icon: 'block', color: '#991B1B', labelFr: 'Bannir', labelEn: 'Ban', descFr: 'Bannir definitivement le joueur', descEn: 'Permanently ban the player' },
  { key: 'dismissed', icon: 'check-circle', color: '#10B981', labelFr: 'Classer', labelEn: 'Dismiss', descFr: 'Classer le signalement sans action', descEn: 'Dismiss the report without action' },
];

const REASON_LABELS: Record<string, { fr: string; en: string; icon: string; color: string }> = {
  fake_stats: { fr: 'Stats falsifiees', en: 'Fake stats', icon: 'trending-up', color: '#EF4444' },
  unsportsmanlike: { fr: 'Comportement antisportif', en: 'Unsportsmanlike', icon: 'sports', color: '#D97706' },
  harassment: { fr: 'Harcelement', en: 'Harassment', icon: 'report', color: '#991B1B' },
  cheating: { fr: 'Triche', en: 'Cheating', icon: 'security', color: '#DC2626' },
  inappropriate: { fr: 'Contenu inapproprie', en: 'Inappropriate', icon: 'visibility-off', color: '#7C3AED' },
  other: { fr: 'Autre', en: 'Other', icon: 'help-outline', color: '#64748B' },
};

const STATUS_CONFIG: Record<string, { icon: string; color: string; bgColor: string; labelFr: string; labelEn: string }> = {
  pending: { icon: 'schedule', color: '#F59E0B', bgColor: '#FEF3C7', labelFr: 'En attente', labelEn: 'Pending' },
  warned: { icon: 'warning-amber', color: '#D97706', bgColor: '#FEF3C7', labelFr: 'Averti', labelEn: 'Warned' },
  suspended: { icon: 'pause-circle', color: '#EF4444', bgColor: '#FEF2F2', labelFr: 'Suspendu', labelEn: 'Suspended' },
  banned: { icon: 'block', color: '#991B1B', bgColor: '#FEF2F2', labelFr: 'Banni', labelEn: 'Banned' },
  dismissed: { icon: 'check-circle', color: '#10B981', bgColor: '#DCFCE7', labelFr: 'Classe', labelEn: 'Dismissed' },
};

export default function AdminModerationScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, warned: 0, suspended: 0, banned: 0, dismissed: 0 });
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  // Reason analytics
  const reasonAnalytics = useMemo(() => {
    const counts: Record<string, number> = {};
    reports.forEach(r => {
      const reason = r.reason || 'other';
      counts[reason] = (counts[reason] || 0) + 1;
    });
    const total = reports.length;
    return Object.entries(counts)
      .map(([reason, count]) => ({
        reason,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: REASON_ANALYTICS_COLORS[reason] || '#64748B',
        label: REASON_LABELS[reason] || REASON_LABELS.other,
      }))
      .sort((a, b) => b.count - a.count);
  }, [reports]);

  // Action modal
  const [actionReport, setActionReport] = useState<PlayerReport | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Player detail modal
  const [detailPlayer, setDetailPlayer] = useState<ReportedPlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Appeals
  const [appeals, setAppeals] = useState<(BanAppeal & { userName?: string; userEmail?: string })[]>([]);
  const [showAppeals, setShowAppeals] = useState(false);
  const [appealResponse, setAppealResponse] = useState('');
  const [respondingAppeal, setRespondingAppeal] = useState<string | null>(null);
  const [activeAppealId, setActiveAppealId] = useState<string | null>(null);

  // Review moderation state
  const [flaggedReviews, setFlaggedReviews] = useState<Array<any>>([]);
  const [showReviewMod, setShowReviewMod] = useState(false);
  const [moderatingReview, setModeratingReview] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [reportsResult, statsResult, appealsResult, flaggedResult] = await Promise.all([
        getPlayerReports(100),
        getReportStats(),
        getAllAppeals(50),
        fetchFlaggedReviews(),
      ]);
      setReports(reportsResult.reports);
      setStats(statsResult);
      setAppeals(appealsResult.appeals || []);
      setFlaggedReviews(flaggedResult.reviews || []);
    } catch (e) {
      console.log('Error loading moderation data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    let items = reports;
    if (filter !== 'all') items = items.filter(r => r.status === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter(r =>
        r.reportedPlayerName?.toLowerCase().includes(s) ||
        r.reporterName?.toLowerCase().includes(s) ||
        r.reason?.toLowerCase().includes(s) ||
        r.details?.toLowerCase().includes(s)
      );
    }
    return items;
  }, [reports, filter, search]);

  // Open action modal
  const handleOpenAction = useCallback((report: PlayerReport) => {
    Haptics.selectionAsync();
    setActionReport(report);
    setActionNotes(report.adminNotes || '');
  }, []);

  // Execute action
  const handleAction = useCallback(async (action: 'warned' | 'suspended' | 'banned' | 'dismissed') => {
    if (!actionReport) return;
    const actionLabel = ACTION_OPTIONS.find(a => a.key === action);
    const confirmMsg = action === 'banned'
      ? (fr ? 'Bannir definitivement ce joueur ?' : 'Permanently ban this player?')
      : action === 'suspended'
        ? (fr ? 'Suspendre ce joueur ?' : 'Suspend this player?')
        : undefined;

    const execute = async () => {
      setActionSubmitting(true);
      const { error } = await updateReportStatus(actionReport.id, action, actionNotes.trim() || undefined);
      if (error) {
        showAlert(fr ? 'Erreur' : 'Error', error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setReports(prev => prev.map(r => r.id === actionReport.id ? { ...r, status: action, adminNotes: actionNotes.trim() || r.adminNotes } : r));
        setStats(prev => ({
          ...prev,
          pending: prev.pending - (actionReport.status === 'pending' ? 1 : 0),
          [action]: (prev as any)[action] + 1,
        }));
        setActionReport(null);
        setActionNotes('');
      }
      setActionSubmitting(false);
    };

    if (confirmMsg) {
      Alert.alert(confirmMsg, '', [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? (actionLabel?.labelFr || '') : (actionLabel?.labelEn || ''), style: 'destructive', onPress: execute },
      ]);
    } else {
      await execute();
    }
  }, [actionReport, actionNotes, fr, showAlert]);

  // Open player detail
  const handleViewPlayer = useCallback(async (playerId: string) => {
    Haptics.selectionAsync();
    setDetailLoading(true);
    setShowDetailModal(true);
    const { player } = await getReportedPlayerDetail(playerId);
    setDetailPlayer(player);
    setDetailLoading(false);
  }, []);

  // Delete report
  const handleDelete = useCallback((reportId: string) => {
    Alert.alert(
      fr ? 'Supprimer le signalement ?' : 'Delete report?',
      fr ? 'Cette action est irreversible.' : 'This action is irreversible.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Supprimer' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteReport(reportId);
            if (error) showAlert(fr ? 'Erreur' : 'Error', error);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setReports(prev => prev.filter(r => r.id !== reportId));
              await getReportStats().then(setStats);
            }
          },
        },
      ]
    );
  }, [fr, showAlert]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatShortDate = (d: string) =>
    new Date(d).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Moderation' : 'Moderation'}</Text>
        </View>
        <AdminQuickNav currentRoute="/admin-moderation" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <ModerationSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="Moderation">
    <AdminGuard language={language} requiredPermission="moderation">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Moderation' : 'Moderation'}</Text>
      </View>

      <AdminQuickNav currentRoute="/admin-moderation" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Stats Dashboard */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={s.statsGrid}>
            <View style={[s.statCard, { borderColor: '#F59E0B30' }]}>
              <View style={[s.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="schedule" size={18} color="#F59E0B" />
              </View>
              <Text style={[s.statValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
              <Text style={s.statLabel}>{fr ? 'En attente' : 'Pending'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#D9770630' }]}>
              <View style={[s.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="warning-amber" size={18} color="#D97706" />
              </View>
              <Text style={[s.statValue, { color: '#D97706' }]}>{stats.warned}</Text>
              <Text style={s.statLabel}>{fr ? 'Avertis' : 'Warned'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#EF444430' }]}>
              <View style={[s.statIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="pause-circle" size={18} color="#EF4444" />
              </View>
              <Text style={[s.statValue, { color: '#EF4444' }]}>{stats.suspended}</Text>
              <Text style={s.statLabel}>{fr ? 'Suspendus' : 'Suspended'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#991B1B30' }]}>
              <View style={[s.statIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="block" size={18} color="#991B1B" />
              </View>
              <Text style={[s.statValue, { color: '#991B1B' }]}>{stats.banned}</Text>
              <Text style={s.statLabel}>{fr ? 'Bannis' : 'Banned'}</Text>
            </View>
          </View>
          <View style={s.totalRow}>
            <MaterialIcons name="flag" size={16} color="#64748B" />
            <Text style={s.totalText}>{stats.total} {fr ? 'signalements au total' : 'total reports'}</Text>
            <View style={s.totalDismissed}>
              <MaterialIcons name="check-circle" size={12} color="#10B981" />
              <Text style={s.totalDismissedText}>{stats.dismissed} {fr ? 'classes' : 'dismissed'}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ===== REVIEW MODERATION SECTION ===== */}
        {flaggedReviews.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(20)}>
            <Pressable
              style={[s.appealsBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
              onPress={() => { Haptics.selectionAsync(); setShowReviewMod(!showReviewMod); }}
            >
              <View style={[s.appealsBannerIcon, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="rate-review" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.appealsBannerTitle, { color: '#991B1B' }]}>
                  {flaggedReviews.length} {fr ? 'avis signale(s)' : 'flagged review(s)'}
                </Text>
                <Text style={[s.appealsBannerDesc, { color: '#B91C1C' }]}>{fr ? 'Cliquez pour moderer' : 'Click to moderate'}</Text>
              </View>
              <MaterialIcons name={showReviewMod ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showReviewMod ? (
              <View style={{ gap: 8, marginBottom: 14 }}>
                {flaggedReviews.map((rev) => (
                  <View key={rev.id} style={[s.reportCard, { borderLeftColor: rev.moderationStatus === 'hidden' ? '#94A3B8' : '#EF4444' }]}>
                    <View style={s.reportHeader}>
                      <View style={[s.reportAvatarPlaceholder, { backgroundColor: '#FEE2E2' }]}>
                        <MaterialIcons name="star" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.reportPlayerName}>{rev.playerName || (fr ? 'Anonyme' : 'Anonymous')}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={{ flexDirection: 'row', gap: 1 }}>
                            {[1, 2, 3, 4, 5].map(st => <MaterialIcons key={st} name={st <= rev.rating ? 'star' : 'star-border'} size={11} color="#F59E0B" />)}
                          </View>
                          {rev.terrainName ? (
                            <Text style={{ fontSize: 10, color: '#64748B' }}>{rev.terrainName}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <MaterialIcons name="flag" size={11} color="#EF4444" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444' }}>{rev.flagCount}x</Text>
                      </View>
                    </View>
                    {rev.comment ? (
                      <View style={[s.reportDetails, { marginTop: 0 }]}>
                        <MaterialIcons name="format-quote" size={13} color="#94A3B8" />
                        <Text style={s.reportDetailsText} numberOfLines={4}>{rev.comment}</Text>
                      </View>
                    ) : null}
                    {rev.photoUrl ? (
                      <View style={{ marginTop: 6, marginBottom: 6 }}>
                        <Image source={{ uri: rev.photoUrl }} style={{ width: '100%', height: 100, borderRadius: 10 }} contentFit="cover" transition={200} />
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                      <MaterialIcons name="calendar-today" size={10} color="#94A3B8" />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>{new Date(rev.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      <View style={{ marginLeft: 8, backgroundColor: rev.moderationStatus === 'hidden' ? '#F1F5F9' : rev.moderationStatus === 'approved' ? '#DCFCE7' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: rev.moderationStatus === 'hidden' ? '#64748B' : rev.moderationStatus === 'approved' ? '#10B981' : '#D97706' }}>
                          {rev.moderationStatus === 'hidden' ? (fr ? 'Masque' : 'Hidden') : rev.moderationStatus === 'approved' ? (fr ? 'Approuve' : 'Approved') : (fr ? 'Signale' : 'Flagged')}
                        </Text>
                      </View>
                    </View>
                    <View style={s.reportActions}>
                      <Pressable
                        style={[s.actionBtnView, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}
                        onPress={async () => {
                          setModeratingReview(rev.id);
                          const { error } = await moderateReview(rev.id, 'approved');
                          if (!error) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setFlaggedReviews(prev => prev.map(r => r.id === rev.id ? { ...r, moderationStatus: 'approved', flagged: false } : r));
                          } else { showAlert(fr ? 'Erreur' : 'Error', error); }
                          setModeratingReview(null);
                        }}
                        disabled={moderatingReview === rev.id}
                      >
                        {moderatingReview === rev.id ? <ActivityIndicator size="small" color="#10B981" /> : (
                          <><MaterialIcons name="check-circle" size={14} color="#10B981" /><Text style={[s.actionBtnViewText, { color: '#10B981' }]}>{fr ? 'Approuver' : 'Approve'}</Text></>
                        )}
                      </Pressable>
                      <Pressable
                        style={[s.actionBtnAction, { backgroundColor: '#64748B' }]}
                        onPress={async () => {
                          setModeratingReview(rev.id);
                          const { error } = await moderateReview(rev.id, 'hidden');
                          if (!error) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setFlaggedReviews(prev => prev.map(r => r.id === rev.id ? { ...r, moderationStatus: 'hidden' } : r));
                          } else { showAlert(fr ? 'Erreur' : 'Error', error); }
                          setModeratingReview(null);
                        }}
                        disabled={moderatingReview === rev.id}
                      >
                        <MaterialIcons name="visibility-off" size={14} color="#FFF" />
                        <Text style={s.actionBtnActionText}>{fr ? 'Masquer' : 'Hide'}</Text>
                      </Pressable>
                      <Pressable
                        style={s.actionBtnDelete}
                        onPress={() => {
                          Alert.alert(
                            fr ? 'Supprimer cet avis ?' : 'Delete this review?',
                            fr ? 'Action irreversible.' : 'This cannot be undone.',
                            [
                              { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                              { text: fr ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => {
                                const { error } = await deleteTerrainReview(rev.id);
                                if (!error) {
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  setFlaggedReviews(prev => prev.filter(r => r.id !== rev.id));
                                } else { showAlert(fr ? 'Erreur' : 'Error', error); }
                              }},
                            ]
                          );
                        }}
                      >
                        <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                    {rev.terrainId ? (
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9' }}
                        onPress={() => router.push(`/terrain/${rev.terrainId}` as any)}
                      >
                        <MaterialIcons name="open-in-new" size={12} color="#64748B" />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>{fr ? 'Voir le terrain' : 'View terrain'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Pending Appeals Banner */}
        {appeals.filter(a => a.status === 'pending').length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(15)}>
            <Pressable
              style={s.appealsBanner}
              onPress={() => { Haptics.selectionAsync(); setShowAppeals(!showAppeals); }}
            >
              <View style={s.appealsBannerIcon}>
                <MaterialIcons name="rate-review" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.appealsBannerTitle}>
                  {appeals.filter(a => a.status === 'pending').length} {fr ? 'appel(s) de ban en attente' : 'pending ban appeal(s)'}
                </Text>
                <Text style={s.appealsBannerDesc}>{fr ? 'Cliquez pour examiner' : 'Click to review'}</Text>
              </View>
              <MaterialIcons name={showAppeals ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showAppeals ? (
              <View style={s.appealsList}>
                {appeals.filter(a => a.status === 'pending').map((appeal) => (
                  <View key={appeal.id} style={s.appealCard}>
                    <View style={s.appealCardHeader}>
                      <View style={s.appealAvatar}>
                        <Text style={s.appealAvatarText}>{(appeal.userName || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appealUserName}>{appeal.userName || (fr ? 'Utilisateur' : 'User')}</Text>
                        {appeal.userEmail ? <Text style={s.appealUserEmail}>{appeal.userEmail}</Text> : null}
                        <Text style={s.appealDate}>{formatDate(appeal.createdAt)}</Text>
                      </View>
                      <View style={s.appealStatusBadge}>
                        <MaterialIcons name="schedule" size={10} color="#D97706" />
                        <Text style={s.appealStatusText}>{fr ? 'En attente' : 'Pending'}</Text>
                      </View>
                    </View>
                    <View style={s.appealMessageBox}>
                      <MaterialIcons name="format-quote" size={13} color="#94A3B8" />
                      <Text style={s.appealMessageText}>{appeal.message}</Text>
                    </View>
                    {/* Response input */}
                    {activeAppealId === appeal.id ? (
                      <View style={s.appealResponseForm}>
                        <TextInput
                          style={s.appealResponseInput}
                          value={appealResponse}
                          onChangeText={setAppealResponse}
                          placeholder={fr ? 'Reponse admin (facultatif)...' : 'Admin response (optional)...'}
                          placeholderTextColor="#94A3B8"
                          multiline
                          numberOfLines={2}
                          maxLength={500}
                        />
                        <View style={s.appealResponseActions}>
                          <Pressable
                            style={s.appealRejectBtn}
                            onPress={async () => {
                              setRespondingAppeal(appeal.id);
                              const { error } = await respondToAppeal(appeal.id, 'rejected', appealResponse.trim() || undefined);
                              setRespondingAppeal(null);
                              if (error) { showAlert(fr ? 'Erreur' : 'Error', error); }
                              else {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                setAppeals(prev => prev.map(a => a.id === appeal.id ? { ...a, status: 'rejected' as const } : a));
                                setActiveAppealId(null); setAppealResponse('');
                                logAdminAction({ actionType: 'moderation_dismiss', targetType: 'appeal', targetId: appeal.id, targetName: appeal.userName, actionDetail: 'Ban appeal rejected' });
                              }
                            }}
                            disabled={respondingAppeal === appeal.id}
                          >
                            {respondingAppeal === appeal.id ? <ActivityIndicator size="small" color="#EF4444" /> : (
                              <><MaterialIcons name="close" size={14} color="#EF4444" /><Text style={s.appealRejectText}>{fr ? 'Rejeter' : 'Reject'}</Text></>
                            )}
                          </Pressable>
                          <Pressable
                            style={s.appealAcceptBtn}
                            onPress={async () => {
                              Alert.alert(
                                fr ? 'Accepter l\'appel ?' : 'Accept appeal?',
                                fr ? 'Le joueur sera debanni automatiquement.' : 'The player will be automatically unbanned.',
                                [
                                  { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                                  { text: fr ? 'Accepter' : 'Accept', onPress: async () => {
                                    setRespondingAppeal(appeal.id);
                                    const { error } = await respondToAppeal(appeal.id, 'accepted', appealResponse.trim() || undefined);
                                    setRespondingAppeal(null);
                                    if (error) { showAlert(fr ? 'Erreur' : 'Error', error); }
                                    else {
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                      setAppeals(prev => prev.map(a => a.id === appeal.id ? { ...a, status: 'accepted' as const } : a));
                                      setActiveAppealId(null); setAppealResponse('');
                                      showAlert(fr ? 'Appel accepte' : 'Appeal accepted', fr ? 'Le joueur a ete debanni.' : 'The player has been unbanned.');
                                      logAdminAction({ actionType: 'moderation_dismiss', targetType: 'appeal', targetId: appeal.id, targetName: appeal.userName, actionDetail: 'Ban appeal accepted - player unbanned' });
                                      loadData(); // Refresh reports
                                    }
                                  }},
                                ]
                              );
                            }}
                            disabled={respondingAppeal === appeal.id}
                          >
                            {respondingAppeal === appeal.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                              <><MaterialIcons name="check" size={14} color="#FFF" /><Text style={s.appealAcceptText}>{fr ? 'Accepter & Debannir' : 'Accept & Unban'}</Text></>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        style={s.appealReviewBtn}
                        onPress={() => { setActiveAppealId(appeal.id); setAppealResponse(''); }}
                      >
                        <MaterialIcons name="rate-review" size={14} color="#D97706" />
                        <Text style={s.appealReviewBtnText}>{fr ? 'Examiner' : 'Review'}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {/* Resolved appeals */}
                {appeals.filter(a => a.status !== 'pending').length > 0 ? (
                  <View style={s.appealsResolvedHeader}>
                    <Text style={s.appealsResolvedTitle}>{fr ? 'Appels traites' : 'Resolved appeals'}</Text>
                  </View>
                ) : null}
                {appeals.filter(a => a.status !== 'pending').slice(0, 5).map((appeal) => (
                  <View key={appeal.id} style={[s.appealCard, { opacity: 0.7 }]}>
                    <View style={s.appealCardHeader}>
                      <View style={[s.appealAvatar, { backgroundColor: appeal.status === 'accepted' ? '#DCFCE7' : '#FEF2F2' }]}>
                        <MaterialIcons name={appeal.status === 'accepted' ? 'check' : 'close'} size={16} color={appeal.status === 'accepted' ? '#10B981' : '#EF4444'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appealUserName}>{appeal.userName || (fr ? 'Utilisateur' : 'User')}</Text>
                        <Text style={s.appealDate}>{formatShortDate(appeal.createdAt)}</Text>
                      </View>
                      <View style={[s.appealStatusBadge, { backgroundColor: appeal.status === 'accepted' ? '#DCFCE7' : '#FEF2F2' }]}>
                        <Text style={[s.appealStatusText, { color: appeal.status === 'accepted' ? '#10B981' : '#EF4444' }]}>
                          {appeal.status === 'accepted' ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Rejete' : 'Rejected')}
                        </Text>
                      </View>
                    </View>
                    {appeal.adminResponse ? (
                      <View style={[s.adminNotesRow, { marginBottom: 0 }]}>
                        <MaterialIcons name="edit-note" size={12} color="#7C3AED" />
                        <Text style={s.adminNotesText}>{appeal.adminResponse}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Report Reason Analytics */}
        {reasonAnalytics.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(30)}>
            <View style={s.analyticsCard}>
              <View style={s.analyticsHeader}>
                <MaterialIcons name="pie-chart" size={16} color="#7C3AED" />
                <Text style={s.analyticsTitle}>{fr ? 'Repartition des raisons' : 'Reason breakdown'}</Text>
              </View>
              {reasonAnalytics.map(item => (
                <View key={item.reason} style={s.analyticsRow}>
                  <View style={s.analyticsLabelRow}>
                    <View style={[s.analyticsDot, { backgroundColor: item.color }]} />
                    <MaterialIcons name={item.label.icon as any} size={12} color={item.color} />
                    <Text style={s.analyticsLabel}>{fr ? item.label.fr : item.label.en}</Text>
                    <Text style={s.analyticsCount}>{item.count}</Text>
                  </View>
                  <View style={s.analyticsBarBg}>
                    <View style={[s.analyticsBarFill, { width: `${Math.max(4, item.pct)}%`, backgroundColor: item.color }]} />
                  </View>
                  <Text style={[s.analyticsPct, { color: item.color }]}>{item.pct}%</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {/* Search */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)}>
          <View style={s.searchWrap}>
            <MaterialIcons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={fr ? 'Rechercher joueur, raison...' : 'Search player, reason...'}
              placeholderTextColor="#94A3B8"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={16} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterBar}>
          {FILTERS.map(f => {
            const isActive = filter === f.key;
            const count = f.key === 'all' ? stats.total : (stats as any)[f.key] || 0;
            return (
              <Pressable
                key={f.key}
                style={[s.filterChip, isActive && { backgroundColor: f.color, borderColor: f.color }]}
                onPress={() => { Haptics.selectionAsync(); setFilter(f.key); }}
              >
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? '#FFF' : '#64748B'} />
                <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>
                  {fr ? f.labelFr : f.labelEn}
                </Text>
                <View style={[s.filterChipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.filterChipBadgeText, isActive && { color: '#FFF' }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Reports list */}
        {filteredReports.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><MaterialIcons name={search || filter !== 'all' ? 'filter-list-off' : 'security'} size={40} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{search || filter !== 'all' ? (fr ? 'Aucun resultat' : 'No results') : (fr ? 'Aucun signalement' : 'No reports')}</Text>
            <Text style={s.emptyDesc}>{search || filter !== 'all' ? (fr ? 'Essayez un autre filtre' : 'Try another filter') : (fr ? 'Les signalements de joueurs apparaitront ici' : 'Player reports will appear here')}</Text>
          </View>
        ) : (
          filteredReports.map((report, idx) => {
            const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
            const reasonCfg = REASON_LABELS[report.reason] || REASON_LABELS.other;
            const isPending = report.status === 'pending';
            return (
              <Animated.View key={report.id} entering={FadeInDown.duration(250).delay(idx * 30)}>
                <View style={[s.reportCard, { borderLeftColor: statusCfg.color }]}>
                  {/* Header */}
                  <View style={s.reportHeader}>
                    <Pressable style={s.reportAvatarWrap} onPress={() => handleViewPlayer(report.reportedPlayerId)}>
                      {report.reportedPlayerAvatar ? (
                        <Image source={{ uri: report.reportedPlayerAvatar }} style={s.reportAvatar} contentFit="cover" transition={200} />
                      ) : (
                        <View style={s.reportAvatarPlaceholder}>
                          <Text style={s.reportAvatarText}>{report.reportedPlayerName?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                      )}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Pressable onPress={() => handleViewPlayer(report.reportedPlayerId)}>
                        <Text style={s.reportPlayerName}>{report.reportedPlayerName || (fr ? 'Joueur inconnu' : 'Unknown player')}</Text>
                      </Pressable>
                      <View style={s.reportMetaRow}>
                        {report.reportedPlayerClub ? (
                          <View style={s.reportMetaChip}>
                            <MaterialIcons name="home" size={10} color="#64748B" />
                            <Text style={s.reportMetaText}>{report.reportedPlayerClub}</Text>
                          </View>
                        ) : null}
                        {report.reportedPlayerElo ? (
                          <View style={s.reportMetaChip}>
                            <MaterialIcons name="leaderboard" size={10} color="#64748B" />
                            <Text style={s.reportMetaText}>ELO {report.reportedPlayerElo}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: statusCfg.bgColor }]}>
                      <MaterialIcons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
                      <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>{fr ? statusCfg.labelFr : statusCfg.labelEn}</Text>
                    </View>
                  </View>

                  {/* Reason */}
                  <View style={s.reportReasonRow}>
                    <View style={[s.reasonBadge, { backgroundColor: reasonCfg.color + '10', borderColor: reasonCfg.color + '25' }]}>
                      <MaterialIcons name={reasonCfg.icon as any} size={12} color={reasonCfg.color} />
                      <Text style={[s.reasonBadgeText, { color: reasonCfg.color }]}>{fr ? reasonCfg.fr : reasonCfg.en}</Text>
                    </View>
                    <Text style={s.reportDate}>{formatShortDate(report.createdAt)}</Text>
                  </View>

                  {/* Details */}
                  {report.details ? (
                    <View style={s.reportDetails}>
                      <MaterialIcons name="format-quote" size={13} color="#94A3B8" />
                      <Text style={s.reportDetailsText} numberOfLines={3}>{report.details}</Text>
                    </View>
                  ) : null}

                  {/* Reporter */}
                  <View style={s.reporterRow}>
                    <MaterialIcons name="person-outline" size={12} color="#94A3B8" />
                    <Text style={s.reporterText}>{fr ? 'Signale par' : 'Reported by'} {report.reporterName || '...'}</Text>
                  </View>

                  {/* Admin notes */}
                  {report.adminNotes ? (
                    <View style={s.adminNotesRow}>
                      <MaterialIcons name="edit-note" size={13} color="#7C3AED" />
                      <Text style={s.adminNotesText}>{report.adminNotes}</Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  <View style={s.reportActions}>
                    <Pressable style={s.actionBtnView} onPress={() => handleViewPlayer(report.reportedPlayerId)}>
                      <MaterialIcons name="person-search" size={14} color="#2563EB" />
                      <Text style={s.actionBtnViewText}>{fr ? 'Profil' : 'Profile'}</Text>
                    </Pressable>
                    {isPending ? (
                      <Pressable style={s.actionBtnAction} onPress={() => handleOpenAction(report)}>
                        <MaterialIcons name="gavel" size={14} color="#FFF" />
                        <Text style={s.actionBtnActionText}>{fr ? 'Agir' : 'Act'}</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={s.actionBtnEdit} onPress={() => handleOpenAction(report)}>
                        <MaterialIcons name="edit" size={14} color="#64748B" />
                        <Text style={s.actionBtnEditText}>{fr ? 'Modifier' : 'Edit'}</Text>
                      </Pressable>
                    )}
                    <Pressable style={s.actionBtnDelete} onPress={() => handleDelete(report.id)} hitSlop={8}>
                      <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* ===== ACTION MODAL ===== */}
      <Modal
        visible={!!actionReport}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!actionSubmitting) { setActionReport(null); setActionNotes(''); } }}
      >
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => { if (!actionSubmitting) { setActionReport(null); setActionNotes(''); } }} disabled={actionSubmitting}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Action de moderation' : 'Moderation action'}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {actionReport ? (
              <>
                {/* Report summary */}
                <View style={s.modalReportSummary}>
                  <View style={s.modalReportRow}>
                    <View style={s.modalReportAvatar}>
                      <Text style={s.modalReportAvatarText}>{actionReport.reportedPlayerName?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalReportName}>{actionReport.reportedPlayerName}</Text>
                      <Text style={s.modalReportReason}>
                        {fr ? (REASON_LABELS[actionReport.reason]?.fr || actionReport.reason) : (REASON_LABELS[actionReport.reason]?.en || actionReport.reason)}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_CONFIG[actionReport.status]?.bgColor || '#F1F5F9' }]}>
                      <Text style={[s.statusBadgeText, { color: STATUS_CONFIG[actionReport.status]?.color || '#64748B' }]}>
                        {fr ? STATUS_CONFIG[actionReport.status]?.labelFr : STATUS_CONFIG[actionReport.status]?.labelEn}
                      </Text>
                    </View>
                  </View>
                  {actionReport.details ? (
                    <View style={[s.reportDetails, { marginTop: 10 }]}>
                      <MaterialIcons name="format-quote" size={13} color="#94A3B8" />
                      <Text style={s.reportDetailsText}>{actionReport.details}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Admin notes */}
                <View style={s.modalNotesWrap}>
                  <View style={s.modalNotesLabel}>
                    <MaterialIcons name="edit-note" size={16} color="#7C3AED" />
                    <Text style={s.modalNotesLabelText}>{fr ? 'Notes admin' : 'Admin notes'}</Text>
                  </View>
                  <TextInput
                    style={s.modalNotesInput}
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    placeholder={fr ? 'Notes internes (facultatif)...' : 'Internal notes (optional)...'}
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                  />
                  <Text style={s.modalNotesCount}>{actionNotes.length}/500</Text>
                </View>

                {/* Action buttons */}
                <Text style={s.modalActionsTitle}>{fr ? 'Choisir une action' : 'Choose an action'}</Text>
                <View style={s.modalActionsGrid}>
                  {ACTION_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.key}
                      style={({ pressed }) => [s.modalActionBtn, { borderColor: opt.color + '30' }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={() => handleAction(opt.key)}
                      disabled={actionSubmitting}
                    >
                      <View style={[s.modalActionIcon, { backgroundColor: opt.color + '12' }]}>
                        <MaterialIcons name={opt.icon as any} size={22} color={opt.color} />
                      </View>
                      <Text style={[s.modalActionLabel, { color: opt.color }]}>{fr ? opt.labelFr : opt.labelEn}</Text>
                      <Text style={s.modalActionDesc}>{fr ? opt.descFr : opt.descEn}</Text>
                      {actionSubmitting ? <ActivityIndicator size="small" color={opt.color} style={{ marginTop: 6 }} /> : null}
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ===== PLAYER DETAIL MODAL ===== */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowDetailModal(false); setDetailPlayer(null); }}
      >
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => { setShowDetailModal(false); setDetailPlayer(null); }}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Profil signale' : 'Reported profile'}</Text>
            <View style={{ width: 40 }} />
          </View>

          {detailLoading ? (
            <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
          ) : detailPlayer ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Player hero */}
              <View style={s.detailHero}>
                {detailPlayer.avatar ? (
                  <Image source={{ uri: detailPlayer.avatar }} style={s.detailAvatar} contentFit="cover" transition={200} />
                ) : (
                  <View style={s.detailAvatarPlaceholder}>
                    <Text style={s.detailAvatarText}>{detailPlayer.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                  </View>
                )}
                <Text style={s.detailName}>{detailPlayer.name}</Text>
                <View style={s.detailBadgeRow}>
                  <View style={s.detailBadge}>
                    <MaterialIcons name="sports" size={12} color={theme.primary} />
                    <Text style={s.detailBadgeText}>{detailPlayer.role}</Text>
                  </View>
                  <View style={s.detailBadge}>
                    <MaterialIcons name="signal-cellular-alt" size={12} color="#D97706" />
                    <Text style={s.detailBadgeText}>{detailPlayer.level}</Text>
                  </View>
                  {detailPlayer.club ? (
                    <View style={s.detailBadge}>
                      <MaterialIcons name="home" size={12} color="#10B981" />
                      <Text style={s.detailBadgeText}>{detailPlayer.club}</Text>
                    </View>
                  ) : null}
                </View>
                {(() => {
                  const eloR = getEloRank(detailPlayer.eloRating);
                  return (
                    <View style={[s.detailEloBadge, { backgroundColor: eloR.color + '12' }]}>
                      <MaterialIcons name={eloR.icon as any} size={16} color={eloR.color} />
                      <Text style={[s.detailEloText, { color: eloR.color }]}>ELO {detailPlayer.eloRating} - {eloR.label[fr ? 'fr' : 'en']}</Text>
                    </View>
                  );
                })()}
              </View>

              {/* Stats grid */}
              <View style={s.detailStatsGrid}>
                <View style={s.detailStatItem}>
                  <Text style={s.detailStatValue}>{detailPlayer.matchesPlayed}</Text>
                  <Text style={s.detailStatLabel}>{fr ? 'Matchs' : 'Matches'}</Text>
                </View>
                <View style={s.detailStatItem}>
                  <Text style={[s.detailStatValue, { color: '#10B981' }]}>{detailPlayer.winRate}%</Text>
                  <Text style={s.detailStatLabel}>{fr ? 'Victoires' : 'Win rate'}</Text>
                </View>
                <View style={s.detailStatItem}>
                  <Text style={[s.detailStatValue, { color: theme.primary }]}>{detailPlayer.tirRate}%</Text>
                  <Text style={s.detailStatLabel}>Tir</Text>
                </View>
                <View style={s.detailStatItem}>
                  <Text style={[s.detailStatValue, { color: theme.carreauColor }]}>{detailPlayer.carreauRate}%</Text>
                  <Text style={s.detailStatLabel}>Carreau</Text>
                </View>
              </View>

              {/* Trust score */}
              <View style={s.detailTrustCard}>
                <View style={s.detailTrustHeader}>
                  <MaterialIcons name="shield" size={20} color={detailPlayer.trustScore !== null && detailPlayer.trustScore >= 70 ? '#10B981' : detailPlayer.trustScore !== null && detailPlayer.trustScore >= 40 ? '#F59E0B' : '#EF4444'} />
                  <Text style={s.detailTrustTitle}>{fr ? 'Score de confiance' : 'Trust Score'}</Text>
                </View>
                {detailPlayer.trustScore !== null ? (
                  <>
                    <View style={s.detailTrustBarBg}>
                      <View style={[s.detailTrustBarFill, {
                        width: `${Math.max(4, detailPlayer.trustScore)}%`,
                        backgroundColor: detailPlayer.trustScore >= 70 ? '#10B981' : detailPlayer.trustScore >= 40 ? '#F59E0B' : '#EF4444',
                      }]} />
                    </View>
                    <View style={s.detailTrustRow}>
                      <Text style={s.detailTrustValue}>{detailPlayer.trustScore}/100</Text>
                      <Text style={s.detailTrustLevel}>{detailPlayer.trustLevel || 'Unknown'}</Text>
                    </View>
                    {detailPlayer.trustFlags.length > 0 ? (
                      <View style={s.detailTrustFlags}>
                        {detailPlayer.trustFlags.map((flag: any, idx: number) => (
                          <View key={idx} style={s.detailTrustFlag}>
                            <MaterialIcons name="flag" size={10} color="#EF4444" />
                            <Text style={s.detailTrustFlagText}>{typeof flag === 'string' ? flag : flag.type || JSON.stringify(flag)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={s.detailTrustNA}>{fr ? 'Pas encore analyse' : 'Not yet analyzed'}</Text>
                )}
              </View>

              {/* Report count + meta */}
              <View style={s.detailMetaCard}>
                <View style={s.detailMetaItem}>
                  <MaterialIcons name="flag" size={16} color="#EF4444" />
                  <Text style={s.detailMetaLabel}>{fr ? 'Signalements' : 'Reports'}</Text>
                  <Text style={[s.detailMetaValue, { color: '#EF4444' }]}>{detailPlayer.reportCount}</Text>
                </View>
                <View style={s.detailMetaDivider} />
                <View style={s.detailMetaItem}>
                  <MaterialIcons name="calendar-today" size={16} color="#64748B" />
                  <Text style={s.detailMetaLabel}>{fr ? 'Inscription' : 'Joined'}</Text>
                  <Text style={s.detailMetaValue}>{formatShortDate(detailPlayer.createdAt)}</Text>
                </View>
                <View style={s.detailMetaDivider} />
                <View style={s.detailMetaItem}>
                  <MaterialIcons name="sports" size={16} color="#64748B" />
                  <Text style={s.detailMetaLabel}>{fr ? 'Dernier match' : 'Last match'}</Text>
                  <Text style={s.detailMetaValue}>{detailPlayer.lastMatchDate ? formatShortDate(detailPlayer.lastMatchDate) : '-'}</Text>
                </View>
                <View style={s.detailMetaDivider} />
                <View style={s.detailMetaItem}>
                  <MaterialIcons name={detailPlayer.isPublic ? 'visibility' : 'visibility-off'} size={16} color="#64748B" />
                  <Text style={s.detailMetaLabel}>{fr ? 'Profil public' : 'Public profile'}</Text>
                  <Text style={s.detailMetaValue}>{detailPlayer.isPublic ? (fr ? 'Oui' : 'Yes') : (fr ? 'Non' : 'No')}</Text>
                </View>
              </View>

              {/* Navigate to full player page */}
              <Pressable
                style={s.detailViewFullBtn}
                onPress={() => { setShowDetailModal(false); router.push(`/player/${detailPlayer.playerId}` as any); }}
              >
                <MaterialIcons name="open-in-new" size={16} color={theme.primary} />
                <Text style={s.detailViewFullText}>{fr ? 'Voir la fiche complete' : 'View full player card'}</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={s.center}>
              <MaterialIcons name="error-outline" size={40} color="#CBD5E1" />
              <Text style={{ fontSize: 14, color: '#94A3B8', marginTop: 8 }}>{fr ? 'Joueur introuvable' : 'Player not found'}</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </AdminGuard>
    </PageErrorBoundary>
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

  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 16 },
  totalText: { fontSize: 12, color: '#64748B', fontWeight: '500', flex: 1 },
  totalDismissed: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  totalDismissedText: { fontSize: 10, fontWeight: '700', color: '#10B981' },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 12 },

  // Filter
  filterBar: { paddingBottom: 16, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterChipBadge: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterChipBadgeText: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },

  // Report card
  reportCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reportAvatarWrap: {},
  reportAvatar: { width: 42, height: 42, borderRadius: 12 },
  reportAvatarPlaceholder: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  reportAvatarText: { fontSize: 17, fontWeight: '700', color: '#64748B' },
  reportPlayerName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  reportMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  reportMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  reportMetaText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },

  // Reason
  reportReasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  reasonBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  reasonBadgeText: { fontSize: 11, fontWeight: '700' },
  reportDate: { fontSize: 10, color: '#94A3B8' },

  // Details
  reportDetails: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  reportDetailsText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 17, fontStyle: 'italic' },

  // Reporter
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  reporterText: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },

  // Admin notes
  adminNotesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: '#F5F3FF', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EDE9FE' },
  adminNotesText: { flex: 1, fontSize: 11, color: '#7C3AED', fontWeight: '500', lineHeight: 16 },

  // Actions
  reportActions: { flexDirection: 'row', gap: 8, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  actionBtnView: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE' },
  actionBtnViewText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  actionBtnAction: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#0F172A' },
  actionBtnActionText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  actionBtnEdit: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnEditText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  actionBtnDelete: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalCloseBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },

  // Modal report summary
  modalReportSummary: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  modalReportRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalReportAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  modalReportAvatarText: { fontSize: 18, fontWeight: '700', color: '#64748B' },
  modalReportName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  modalReportReason: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Modal notes
  modalNotesWrap: { marginBottom: 20 },
  modalNotesLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  modalNotesLabelText: { fontSize: 13, fontWeight: '600', color: '#7C3AED' },
  modalNotesInput: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 14, color: '#0F172A', lineHeight: 20, minHeight: 80, textAlignVertical: 'top', borderWidth: 1.5, borderColor: '#E2E8F0' },
  modalNotesCount: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 4 },

  // Modal actions
  modalActionsTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12, paddingHorizontal: 4 },
  modalActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modalActionBtn: { width: '48%', backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5 },
  modalActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalActionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  modalActionDesc: { fontSize: 10, color: '#94A3B8', textAlign: 'center', lineHeight: 14 },

  // Analytics
  analyticsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  analyticsTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  analyticsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  analyticsLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 130 },
  analyticsDot: { width: 8, height: 8, borderRadius: 4 },
  analyticsLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', flex: 1 },
  analyticsCount: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  analyticsBarBg: { flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  analyticsBarFill: { height: '100%', borderRadius: 3 },
  analyticsPct: { fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right' },

  // Detail modal
  detailHero: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  detailAvatar: { width: 80, height: 80, borderRadius: 24, marginBottom: 12 },
  detailAvatarPlaceholder: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailAvatarText: { fontSize: 32, fontWeight: '700', color: '#64748B' },
  detailName: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 },
  detailBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  detailBadgeText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  detailEloBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  detailEloText: { fontSize: 13, fontWeight: '700' },

  // Detail stats
  detailStatsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  detailStatItem: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  detailStatValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  detailStatLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Trust card
  detailTrustCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  detailTrustHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  detailTrustTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  detailTrustBarBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  detailTrustBarFill: { height: '100%', borderRadius: 4 },
  detailTrustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTrustValue: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  detailTrustLevel: { fontSize: 12, fontWeight: '600', color: '#64748B', textTransform: 'capitalize' },
  detailTrustFlags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  detailTrustFlag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  detailTrustFlagText: { fontSize: 10, fontWeight: '600', color: '#EF4444' },
  detailTrustNA: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 4 },

  // Detail meta
  detailMetaCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  detailMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  detailMetaLabel: { fontSize: 13, fontWeight: '500', color: '#64748B', flex: 1 },
  detailMetaValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  detailMetaDivider: { height: 1, backgroundColor: '#F1F5F9' },

  // View full btn
  detailViewFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE' },
  detailViewFullText: { fontSize: 14, fontWeight: '700', color: '#2563EB' },

  // Appeals
  appealsBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#FDE68A' },
  appealsBannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  appealsBannerTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  appealsBannerDesc: { fontSize: 11, color: '#B45309', marginTop: 2 },
  appealsList: { gap: 8, marginBottom: 14 },
  appealCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FDE68A', borderLeftWidth: 3, borderLeftColor: '#D97706' },
  appealCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  appealAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  appealAvatarText: { fontSize: 15, fontWeight: '700', color: '#D97706' },
  appealUserName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  appealUserEmail: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  appealDate: { fontSize: 10, color: '#CBD5E1', marginTop: 1 },
  appealStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  appealStatusText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
  appealMessageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FDE68A' },
  appealMessageText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17, fontStyle: 'italic' },
  appealReviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  appealReviewBtnText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
  appealResponseForm: { gap: 10 },
  appealResponseInput: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 13, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', minHeight: 60, textAlignVertical: 'top' },
  appealResponseActions: { flexDirection: 'row', gap: 8 },
  appealRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  appealRejectText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  appealAcceptBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: '#10B981' },
  appealAcceptText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  appealsResolvedHeader: { paddingTop: 8, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  appealsResolvedTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' },
});
