import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  TextInput, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import {
  fetchSuspiciousPlayers, updateSuspiciousStatus, updateTrustScore,
  getTrustScoreColor, getTrustScoreIcon, getTrustLevelLabel, getLevelFromScore,
  banPlayer, fetchDeletionAlerts, DeletionAlert,
  reverseDeletedEloLoss, fetchDeletionTimeline, DeletionTimelinePoint,
} from '@/services/trustScoreService';
import { fetchDeviceRegistrations, adminUnlinkDevice, adminUnlinkAllForDevice } from '@/services/deviceFingerprintService';
import { fetchPendingTransferRequests, validateTransferRequest, rejectTransferRequest, DeviceTransferRequest } from '@/services/deviceTransferService';
import { extraTranslations } from '@/constants/i18nExtra';
import { recalculateAllElo, ELO_RANKS, getEloRank, ELO_INITIAL, applyInactivityDecay } from '@/services/eloService';
import { useAdminCache } from '@/hooks/useAdminCache';

const et = extraTranslations.trustScore;

type StatusFilter = 'all' | 'flagged' | 'watch' | 'ok' | 'dismissed' | 'banned';

export default function AdminAntiCheatScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const isFr = language === 'fr';
  const adminCache = useAdminCache();

  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  // ELO recalculation
  const [recalculating, setRecalculating] = useState(false);

  // ELO dashboard
  const [eloDashboard, setEloDashboard] = useState<{
    totalPlayers: number;
    distribution: { tier: string; count: number; color: string; label: string }[];
    avgElo: number;
    decayCount: number;
    topPlayer: { name: string; elo: number } | null;
  } | null>(null);
  const [eloLoading, setEloLoading] = useState(true);
  const [applyingDecay, setApplyingDecay] = useState(false);

  // Deletion alerts
  const [deletionAlerts, setDeletionAlerts] = useState<DeletionAlert[]>([]);
  const [deletionAlertsLoading, setDeletionAlertsLoading] = useState(true);

  // Detail modal
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [adjustScore, setAdjustScore] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Deletion timeline & ELO reversal
  const [deletionTimeline, setDeletionTimeline] = useState<DeletionTimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [reversingElo, setReversingElo] = useState(false);

  // Bulk ELO reversal
  const [bulkReversing, setBulkReversing] = useState(false);

  // Deletion heatmap (day x hour) for detail modal
  const [deletionHeatmap, setDeletionHeatmap] = useState<number[][]>([]);

  // Device registrations management
  const [deviceRegs, setDeviceRegs] = useState<Array<{ id: string; fingerprint: string; email: string; userId: string | null; registeredAt: string; ipHint: string | null }>>([]);
  const [deviceRegsLoading, setDeviceRegsLoading] = useState(false);
  const [deviceRegsLoaded, setDeviceRegsLoaded] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // Device transfer requests
  const [transferRequests, setTransferRequests] = useState<DeviceTransferRequest[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  // Anti-cheat weekly analytics
  const [weeklyAnalytics, setWeeklyAnalytics] = useState<Array<{ week: string; blocked: number; registrations: number; multiAccount: number }>>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const cached = adminCache.getCached<any[]>('anticheat-players');
    if (cached) {
      setPlayers(cached);
      setLoading(false);
      // Background refresh
      fetchSuspiciousPlayers().then(({ players: p }) => {
        setPlayers(p);
        adminCache.setCached('anticheat-players', p, 30000);
      });
      return;
    }
    const { players: p, error } = await fetchSuspiciousPlayers();
    if (error) showAlert((et.adminTitle as any)?.[language] || 'Error', error);
    setPlayers(p);
    adminCache.setCached('anticheat-players', p, 30000);
    setLoading(false);
  }, [language]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load deletion alerts
  useEffect(() => {
    (async () => {
      setDeletionAlertsLoading(true);
      const { alerts } = await fetchDeletionAlerts();
      setDeletionAlerts(alerts);
      setDeletionAlertsLoading(false);
    })();
  }, [players]);

  // Load ELO dashboard
  useEffect(() => {
    (async () => {
      setEloLoading(true);
      try {
        const supabase = getSupabaseClient();
        const { data: allPlayers } = await supabase
          .from('players')
          .select('id, name, elo_rating, last_match_date');
        if (allPlayers && allPlayers.length > 0) {
          const dist = ELO_RANKS.map(rank => {
            const nextRank = ELO_RANKS[ELO_RANKS.indexOf(rank) - 1];
            const max = nextRank ? nextRank.minElo : Infinity;
            const count = allPlayers.filter(p => {
              const elo = p.elo_rating || ELO_INITIAL;
              return elo >= rank.minElo && elo < max;
            }).length;
            return { tier: rank.tier, count, color: rank.color, label: rank.label[isFr ? 'fr' : 'en'] };
          }).reverse();
          const totalElo = allPlayers.reduce((s, p) => s + (p.elo_rating || ELO_INITIAL), 0);
          const avgElo = Math.round(totalElo / allPlayers.length);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          const decayCount = allPlayers.filter(p => p.last_match_date && new Date(p.last_match_date) < cutoff && (p.elo_rating || ELO_INITIAL) > 800).length;
          const top = allPlayers.reduce((best, p) => (p.elo_rating || 0) > (best?.elo_rating || 0) ? p : best, allPlayers[0]);
          setEloDashboard({
            totalPlayers: allPlayers.length,
            distribution: dist,
            avgElo,
            decayCount,
            topPlayer: top ? { name: top.name, elo: top.elo_rating || ELO_INITIAL } : null,
          });
        }
      } catch { }
      setEloLoading(false);
    })();
  }, [isFr]);

  // Summary statistics
  const summaryStats = React.useMemo(() => {
    if (players.length === 0) return { total: 0, avg: 0, verified: 0, high: 0, medium: 0, low: 0, suspicious: 0, weeklyFlagged: 0 };
    const total = players.length;
    const avg = Math.round(players.reduce((s, p) => s + p.trustScore, 0) / total);
    let verified = 0, high = 0, medium = 0, low = 0, suspicious = 0;
    players.forEach(p => {
      const ts = p.trustScore;
      if (ts >= 80) verified++;
      else if (ts >= 65) high++;
      else if (ts >= 45) medium++;
      else if (ts >= 25) low++;
      else suspicious++;
    });
    // Weekly flagged: players analyzed in the last 7 days with flags
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyFlagged = players.filter(p => {
      if (p.flags.length === 0) return false;
      return p.analyzedAt ? new Date(p.analyzedAt) > oneWeekAgo : false;
    }).length;
    return { total, avg, verified, high, medium, low, suspicious, weeklyFlagged };
  }, [players]);

  const handleBatchDismissOk = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const okPlayers = players.filter(p => p.status === 'ok' && p.flags.length === 0);
    if (okPlayers.length === 0) return;
    for (const p of okPlayers) {
      await updateSuspiciousStatus(p.id, 'dismissed');
    }
    setPlayers(prev => prev.map(p => (p.status === 'ok' && p.flags.length === 0) ? { ...p, status: 'dismissed' } : p));
    showAlert(isFr ? `${okPlayers.length} joueurs ignores` : `${okPlayers.length} players dismissed`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleRunFullScan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setScanning(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.functions.invoke('detect-suspicious', { body: { mode: 'full' } });
      setTimeout(async () => {
        await loadData();
        setScanning(false);
        showAlert((et.adminScanComplete as any)?.[language] || 'Done');
      }, 3000);
    } catch (e: any) {
      setScanning(false);
      showAlert('Error', e.message);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    Haptics.selectionAsync();
    if (status === 'banned') {
      // Ban enforcement: set trust score to 0 and status to banned
      const player = players.find(p => p.id === id);
      const { error } = await banPlayer(id, player?.playerId || '');
      if (error) { showAlert('Error', error); return; }
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, status: 'banned', trustScore: 0 } : p));
      if (selectedPlayer?.id === id) setSelectedPlayer((prev: any) => prev ? { ...prev, status: 'banned', trustScore: 0 } : prev);
    } else {
      const { error } = await updateSuspiciousStatus(id, status);
      if (error) { showAlert('Error', error); return; }
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      if (selectedPlayer?.id === id) setSelectedPlayer((prev: any) => prev ? { ...prev, status } : prev);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedPlayer) return;
    setSavingNotes(true);
    const { error } = await updateSuspiciousStatus(selectedPlayer.id, selectedPlayer.status, adminNotes);
    setSavingNotes(false);
    if (error) { showAlert('Error', error); return; }
    setPlayers(prev => prev.map(p => p.id === selectedPlayer.id ? { ...p, adminNotes } : p));
    setSelectedPlayer((prev: any) => prev ? { ...prev, adminNotes } : prev);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAdjustScore = async () => {
    if (!selectedPlayer || !adjustScore) return;
    const newScore = parseInt(adjustScore);
    if (isNaN(newScore) || newScore < 0 || newScore > 100) {
      showAlert('Error', 'Score must be 0-100');
      return;
    }
    const { error } = await updateTrustScore(selectedPlayer.id, newScore);
    if (error) { showAlert('Error', error); return; }
    setPlayers(prev => prev.map(p => p.id === selectedPlayer.id ? { ...p, trustScore: newScore } : p));
    setSelectedPlayer((prev: any) => prev ? { ...prev, trustScore: newScore } : prev);
    setShowAdjustModal(false);
    setAdjustScore('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const filtered = players.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(p.playerName || '').toLowerCase().includes(q) && !p.playerId.includes(q)) return false;
    }
    return true;
  });

  const statusCounts = {
    all: players.length,
    flagged: players.filter(p => p.status === 'flagged').length,
    watch: players.filter(p => p.status === 'watch').length,
    ok: players.filter(p => p.status === 'ok').length,
    dismissed: players.filter(p => p.status === 'dismissed').length,
    banned: players.filter(p => p.status === 'banned').length,
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'flagged': return '#EF4444';
      case 'watch': return '#F97316';
      case 'ok': return '#22C55E';
      case 'dismissed': return '#6B7280';
      case 'banned': return '#DC2626';
      default: return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, any> = {
      ok: et.adminStatusOk, watch: et.adminStatusWatch,
      flagged: et.adminStatusFlagged, banned: et.adminStatusBanned,
      dismissed: et.adminStatusDismissed,
    };
    return (labels[status] as any)?.[language] || status;
  };

  // Bulk ELO reversal handler
  const handleBulkReverseElo = async () => {
    if (bulkReversing || deletionAlerts.length === 0) return;
    const totalAvoided = deletionAlerts.reduce((s, a) => s + a.avoidedEloLoss, 0);
    showAlert(
      ((et.bulkReverseEloConfirmTitle as any)?.[language] || 'Reverse ELO for {count} player(s)?').replace('{count}', String(deletionAlerts.length)),
      ((et.bulkReverseEloConfirmMsg as any)?.[language] || 'Subtract total {elo} ELO pts').replace('{elo}', String(totalAvoided)),
      [
        { text: isFr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: (et.reverseElo as any)?.[language] || 'Reverse',
          style: 'destructive',
          onPress: async () => {
            setBulkReversing(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            let reversed = 0;
            let totalEloSubtracted = 0;
            for (const alert of deletionAlerts) {
              if (alert.avoidedEloLoss === 0) continue;
              const { error, eloBefore, eloAfter } = await reverseDeletedEloLoss(alert.userId, alert.playerId);
              if (!error) {
                reversed++;
                totalEloSubtracted += (eloBefore - eloAfter);
              }
            }
            setBulkReversing(false);
            const msg = ((et.bulkReverseEloSuccess as any)?.[language] || '{count} reversed, {elo} pts')
              .replace('{count}', String(reversed))
              .replace('{elo}', String(totalEloSubtracted));
            showAlert(msg);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  return (
    <PageErrorBoundary pageName="AntiCheat">
    <AdminGuard language={language}>
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>{(et.adminTitle as any)?.[language] || 'Anti-cheat'}</Text>
          <Text style={st.headerSub}>{filtered.length} {(et.adminDesc as any)?.[language] || 'players'}</Text>
        </View>
        <Pressable
          style={[st.eloRecalcBtn, recalculating && { opacity: 0.6 }]}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setRecalculating(true);
            const { success, error, playersUpdated } = await recalculateAllElo();
            setRecalculating(false);
            if (success) {
              showAlert(t('leaderboard', 'eloRecalculated').replace('{count}', String(playersUpdated)));
            } else {
              showAlert('Error', error || 'Unknown error');
            }
          }}
          disabled={recalculating}
        >
          {recalculating ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="calculate" size={16} color="#FFF" />}
          <Text style={st.eloRecalcBtnText}>{recalculating ? t('leaderboard', 'eloRecalculating') : 'ELO'}</Text>
        </Pressable>
        <Pressable
          style={[st.scanBtn, scanning && { opacity: 0.6 }]}
          onPress={handleRunFullScan}
          disabled={scanning}
        >
          {scanning ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="radar" size={18} color="#FFF" />}
          <Text style={st.scanBtnText}>{scanning ? ((et.adminScanning as any)?.[language] || 'Scanning...') : ((et.adminRunFullScan as any)?.[language] || 'Scan')}</Text>
        </Pressable>
      </View>

      <AdminQuickNav currentRoute="/admin-anticheat" />

      <ScrollView
        style={st.mainScroll}
        contentContainerStyle={[st.mainScrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >

      {/* ============ DELETION ALERTS ============ */}
      {!deletionAlertsLoading && deletionAlerts.length > 0 ? (
        <View style={st.deletionSection}>
          <View style={st.deletionHeader}>
            <View style={[st.deletionIconWrap, { backgroundColor: '#EF444415' }]}>
              <MaterialIcons name="delete-sweep" size={18} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.deletionTitle}>{(et.deletionAlertTitle as any)?.[language] || 'Defeat Deletion Alerts'}</Text>
              <Text style={st.deletionSubtitle}>{(et.deletionAlertDesc as any)?.[language] || 'Players who deleted lost matches'}</Text>
            </View>
            <View style={st.deletionCountBadge}>
              <Text style={st.deletionCountText}>{deletionAlerts.length}</Text>
            </View>
          </View>
          {deletionAlerts.slice(0, 5).map((alert, idx) => {
            const isCritical = alert.recentDeletedLost7d >= 5 || alert.deletedLostMatches >= 10;
            const severityColor = isCritical ? '#EF4444' : '#F59E0B';
            const severityLabel = isCritical
              ? ((et.deletionCritical as any)?.[language] || 'Critical')
              : ((et.deletionWarning as any)?.[language] || 'Warning');
            return (
              <Pressable
                key={alert.playerId}
                style={[st.deletionCard, { borderLeftColor: severityColor }]}
                onPress={() => {
                  const p = players.find(pl => pl.playerId === alert.playerId);
                  if (p) { setSelectedPlayer(p); setAdminNotes(p.adminNotes || ''); }
                  else router.push(`/player/${alert.playerId}` as any);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={st.deletionAvatar}>
                    {alert.playerAvatar ? (
                      <Image source={{ uri: alert.playerAvatar }} style={{ width: 32, height: 32, borderRadius: 10 }} contentFit="cover" />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary }}>{(alert.playerName || '?').charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.deletionPlayerName}>{alert.playerName || alert.playerId.substring(0, 8)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={[st.deletionSeverity, { backgroundColor: severityColor + '15', borderColor: severityColor + '30' }]}>
                        <MaterialIcons name={isCritical ? 'error' : 'warning'} size={10} color={severityColor} />
                        <Text style={[st.deletionSeverityText, { color: severityColor }]}>{severityLabel}</Text>
                      </View>
                      <View style={[st.deletionTrustBadge, { borderColor: getTrustScoreColor(alert.trustScore) }]}>
                        <Text style={[st.deletionTrustText, { color: getTrustScoreColor(alert.trustScore) }]}>{alert.trustScore}</Text>
                      </View>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
                <View style={st.deletionStatsRow}>
                  <View style={st.deletionStatItem}>
                    <Text style={[st.deletionStatValue, { color: '#EF4444' }]}>{alert.recentDeletedLost7d}</Text>
                    <Text style={st.deletionStatLabel}>{(et.recentDeletions7d as any)?.[language] || '7d'}</Text>
                  </View>
                  <View style={st.deletionStatDivider} />
                  <View style={st.deletionStatItem}>
                    <Text style={[st.deletionStatValue, { color: '#F97316' }]}>{alert.deletedLostMatches}</Text>
                    <Text style={st.deletionStatLabel}>{(et.deletedLostMatches as any)?.[language] || 'Losses del.'}</Text>
                  </View>
                  <View style={st.deletionStatDivider} />
                  <View style={st.deletionStatItem}>
                    <Text style={[st.deletionStatValue, { color: '#DC2626' }]}>-{alert.avoidedEloLoss}</Text>
                    <Text style={st.deletionStatLabel}>{(et.avoidedEloLoss as any)?.[language] || 'ELO avoided'}</Text>
                  </View>
                  <View style={st.deletionStatDivider} />
                  <View style={st.deletionStatItem}>
                    <Text style={[st.deletionStatValue, { color: theme.textSecondary }]}>{alert.totalDeletedMatches}</Text>
                    <Text style={st.deletionStatLabel}>{(et.totalDeletedMatches as any)?.[language] || 'Total del.'}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          {deletionAlerts.length > 5 ? (
            <Text style={st.deletionMoreText}>+{deletionAlerts.length - 5} {isFr ? 'autres alertes' : 'more alerts'}</Text>
          ) : null}
          {/* Bulk ELO reversal */}
          <Pressable
            style={[st.bulkReverseBtn, bulkReversing && { opacity: 0.6 }]}
            onPress={handleBulkReverseElo}
            disabled={bulkReversing}
          >
            {bulkReversing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="undo" size={14} color="#FFF" />}
            <Text style={st.bulkReverseBtnText}>
              {bulkReversing
                ? ((et.bulkReversing as any)?.[language] || 'Reversing...')
                : `${(et.bulkReverseElo as any)?.[language] || 'Reverse all'} (-${deletionAlerts.reduce((s, a) => s + a.avoidedEloLoss, 0)} ELO)`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ============ ELO Dashboard ============ */}
      {!eloLoading && eloDashboard ? (
        <View style={st.eloDashSection}>
          <View style={st.eloDashHeader}>
            <View style={[st.eloDashIcon, { backgroundColor: '#9333EA15' }]}>
              <MaterialIcons name="diamond" size={18} color="#9333EA" />
            </View>
            <Text style={st.eloDashTitle}>{isFr ? 'Tableau de bord ELO' : 'ELO Dashboard'}</Text>
          </View>

          {/* Top stats */}
          <View style={st.eloDashStatsRow}>
            <View style={st.eloDashStat}>
              <Text style={[st.eloDashStatValue, { color: '#9333EA' }]}>{eloDashboard.totalPlayers}</Text>
              <Text style={st.eloDashStatLabel}>{isFr ? 'Joueurs' : 'Players'}</Text>
            </View>
            <View style={st.eloDashStat}>
              <Text style={[st.eloDashStatValue, { color: getEloRank(eloDashboard.avgElo).color }]}>{eloDashboard.avgElo}</Text>
              <Text style={st.eloDashStatLabel}>{isFr ? 'ELO moyen' : 'Avg ELO'}</Text>
            </View>
            <View style={st.eloDashStat}>
              <Text style={[st.eloDashStatValue, { color: '#F59E0B' }]}>{eloDashboard.decayCount}</Text>
              <Text style={st.eloDashStatLabel}>{isFr ? 'En decay' : 'Decaying'}</Text>
            </View>
            {eloDashboard.topPlayer ? (
              <View style={st.eloDashStat}>
                <Text style={[st.eloDashStatValue, { color: getEloRank(eloDashboard.topPlayer.elo).color, fontSize: 14 }]}>{eloDashboard.topPlayer.elo}</Text>
                <Text style={st.eloDashStatLabel} numberOfLines={1}>{eloDashboard.topPlayer.name.split(' ')[0]}</Text>
              </View>
            ) : null}
          </View>

          {/* Rank distribution bar */}
          <View style={st.eloDashDistRow}>
            {eloDashboard.distribution.map(d => {
              const pct = eloDashboard.totalPlayers > 0 ? Math.round((d.count / eloDashboard.totalPlayers) * 100) : 0;
              return (
                <View key={d.tier} style={st.eloDashDistItem}>
                  <View style={st.eloDashDistBarTrack}>
                    <View style={[st.eloDashDistBarFill, { height: `${Math.max(pct, 4)}%`, backgroundColor: d.color }]} />
                  </View>
                  <Text style={[st.eloDashDistPct, { color: d.color }]}>{pct}%</Text>
                  <Text style={st.eloDashDistLabel} numberOfLines={1}>{d.label}</Text>
                  <Text style={[st.eloDashDistCount, { color: d.color }]}>{d.count}</Text>
                </View>
              );
            })}
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable
              style={[st.eloDashActionBtn, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B30' }, applyingDecay && { opacity: 0.6 }]}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setApplyingDecay(true);
                const { playersDecayed } = await applyInactivityDecay();
                setApplyingDecay(false);
                showAlert(isFr ? `Decay applique a ${playersDecayed} joueurs` : `Decay applied to ${playersDecayed} players`);
              }}
              disabled={applyingDecay}
            >
              {applyingDecay ? <ActivityIndicator size="small" color="#F59E0B" /> : <MaterialIcons name="timer-off" size={14} color="#F59E0B" />}
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>{isFr ? 'Appliquer decay' : 'Apply decay'}</Text>
            </Pressable>
            <Pressable
              style={[st.eloDashActionBtn, { backgroundColor: '#7C3AED15', borderColor: '#7C3AED30' }, recalculating && { opacity: 0.6 }]}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                setRecalculating(true);
                const { success, error, playersUpdated } = await recalculateAllElo();
                setRecalculating(false);
                if (success) {
                  showAlert(t('leaderboard', 'eloRecalculated').replace('{count}', String(playersUpdated)));
                } else {
                  showAlert('Error', error || 'Unknown');
                }
              }}
              disabled={recalculating}
            >
              {recalculating ? <ActivityIndicator size="small" color="#7C3AED" /> : <MaterialIcons name="calculate" size={14} color="#7C3AED" />}
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>{recalculating ? '...' : (isFr ? 'Recalculer ELO' : 'Recalc ELO')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Summary Statistics Dashboard */}
      {!loading && players.length > 0 ? (
        <View style={st.summarySection}>
          {/* Top stats row */}
          <View style={st.summaryRow}>
            <View style={st.summaryCard}>
              <Text style={st.summaryValue}>{summaryStats.total}</Text>
              <Text style={st.summaryLabel}>{isFr ? 'Analyses' : 'Analyzed'}</Text>
            </View>
            <View style={st.summaryCard}>
              <Text style={[st.summaryValue, { color: summaryStats.avg >= 65 ? '#22C55E' : summaryStats.avg >= 45 ? '#D97706' : '#EF4444' }]}>{summaryStats.avg}</Text>
              <Text style={st.summaryLabel}>{isFr ? 'Score moyen' : 'Avg score'}</Text>
            </View>
            <View style={st.summaryCard}>
              <Text style={[st.summaryValue, { color: '#EF4444' }]}>{summaryStats.weeklyFlagged}</Text>
              <Text style={st.summaryLabel}>{isFr ? 'Signales 7j' : 'Flagged 7d'}</Text>
            </View>
          </View>
          {/* Pie chart (simplified bar distribution) */}
          <View style={st.distRow}>
            {[
              { label: isFr ? 'Verifie' : 'Verified', count: summaryStats.verified, color: '#22C55E' },
              { label: isFr ? 'Fiable' : 'Trusted', count: summaryStats.high, color: '#3B82F6' },
              { label: 'Standard', count: summaryStats.medium, color: '#D97706' },
              { label: isFr ? 'A surveiller' : 'Watch', count: summaryStats.low, color: '#F97316' },
              { label: isFr ? 'Suspect' : 'Suspicious', count: summaryStats.suspicious, color: '#EF4444' },
            ].map(d => {
              const pct = summaryStats.total > 0 ? Math.round((d.count / summaryStats.total) * 100) : 0;
              return (
                <View key={d.label} style={st.distItem}>
                  <View style={st.distBarTrack}>
                    <View style={[st.distBarFill, { height: `${Math.max(pct, 4)}%`, backgroundColor: d.color }]} />
                  </View>
                  <Text style={[st.distPct, { color: d.color }]}>{pct}%</Text>
                  <Text style={st.distLabel} numberOfLines={1}>{d.label}</Text>
                  <Text style={st.distCount}>{d.count}</Text>
                </View>
              );
            })}
          </View>
          {/* Batch dismiss button */}
          {summaryStats.total > 0 ? (
            <Pressable style={st.batchDismissBtn} onPress={handleBatchDismissOk}>
              <MaterialIcons name="check-circle" size={16} color="#22C55E" />
              <Text style={st.batchDismissBtnText}>
                {isFr ? 'Ignorer tous les OK sans alertes' : 'Dismiss all OK with no flags'}
                {' '}({players.filter(p => p.status === 'ok' && p.flags.length === 0).length})
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ============ MATCH VALIDATION RATIO (per player) ============ */}
      {!loading && players.length > 0 ? (() => {
        // Compute validated vs local match ratio from players data
        const playersWithDetails = players.filter((p: any) => p.details);
        const totalAnalyzed = playersWithDetails.length;
        const highLocalRatio = playersWithDetails.filter((p: any) => {
          const mp = p.details?.multiPlayerRatio || 0;
          return mp < 30 && (p.details?.totalMatches || p.details?.matchesPlayed || 0) >= 5;
        });
        const avgMultiPlayerRatio = totalAnalyzed > 0
          ? Math.round(playersWithDetails.reduce((s: number, p: any) => s + (p.details?.multiPlayerRatio || 0), 0) / totalAnalyzed)
          : 0;

        return (
          <View style={st.deviceSection}>
            <View style={st.deviceHeaderRow}>
              <View style={[st.deviceIcon, { backgroundColor: '#3B82F615' }]}>
                <MaterialIcons name="fact-check" size={18} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.deviceTitle}>{isFr ? 'Ratio Matchs Valides' : 'Validated Match Ratio'}</Text>
                <Text style={st.deviceSubtitle}>{isFr ? 'Matchs multi-joueurs vs solo' : 'Multi-player vs solo matches'}</Text>
              </View>
              <View style={{ alignItems: 'center', backgroundColor: avgMultiPlayerRatio >= 50 ? '#22C55E15' : '#EF444415', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: avgMultiPlayerRatio >= 50 ? '#22C55E' : '#EF4444' }}>{avgMultiPlayerRatio}%</Text>
                <Text style={{ fontSize: 8, color: theme.textMuted, fontWeight: '600' }}>{isFr ? 'moy. multi' : 'avg multi'}</Text>
              </View>
            </View>

            {/* Summary stats */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#3B82F6' }}>{totalAnalyzed}</Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>{isFr ? 'Analyses' : 'Analyzed'}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>{highLocalRatio.length}</Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600', textAlign: 'center' }}>{isFr ? '<30% multi' : '<30% multi'}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#22C55E' }}>{totalAnalyzed - highLocalRatio.length}</Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600', textAlign: 'center' }}>{isFr ? 'Conformes' : 'Compliant'}</Text>
              </View>
            </View>

            {/* Ratio distribution bar */}
            {totalAnalyzed > 0 ? (
              <View style={{ marginTop: 10, height: 10, flexDirection: 'row', borderRadius: 5, overflow: 'hidden', backgroundColor: theme.backgroundSecondary }}>
                <View style={{ flex: Math.max(totalAnalyzed - highLocalRatio.length, 0.1), backgroundColor: '#22C55E', borderRadius: 5 }} />
                <View style={{ flex: Math.max(highLocalRatio.length, 0.1), backgroundColor: '#EF4444' }} />
              </View>
            ) : null}

            {/* Top offenders (high local ratio) */}
            {highLocalRatio.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {isFr ? 'Joueurs a forte proportion solo' : 'High solo ratio players'}
                </Text>
                {highLocalRatio.slice(0, 5).map((p: any) => (
                  <Pressable
                    key={p.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, marginBottom: 6 }}
                    onPress={() => { setSelectedPlayer(p); setAdminNotes(p.adminNotes || ''); }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{p.details?.multiPlayerRatio || 0}%</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{p.playerName || p.playerId.substring(0, 8)}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>
                        {p.details?.totalMatches || p.details?.matchesPlayed || 0} {isFr ? 'matchs' : 'matches'} • {p.details?.uniqueOpponents || 0} {isFr ? 'adversaires' : 'opponents'}
                      </Text>
                    </View>
                    <View style={[st.scoreCircle, { width: 36, height: 36, borderWidth: 2, borderColor: getTrustScoreColor(p.trustScore) }]}>
                      <Text style={[st.scoreText, { fontSize: 12, color: getTrustScoreColor(p.trustScore) }]}>{p.trustScore}</Text>
                    </View>
                  </Pressable>
                ))}
                {highLocalRatio.length > 5 ? (
                  <Text style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 4 }}>+{highLocalRatio.length - 5} {isFr ? 'autres' : 'more'}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })() : null}

      {/* ============ ANTI-CHEAT WEEKLY ANALYTICS ============ */}
      <View style={st.deviceSection}>
        <Pressable
          style={st.deviceHeaderRow}
          onPress={async () => {
            if (weeklyAnalytics.length > 0) { setWeeklyAnalytics([]); return; }
            setAnalyticsLoading(true);
            try {
              const supabase = getSupabaseClient();
              // Get registrations over last 12 weeks
              const twelveWeeksAgo = new Date(); twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
              const { data: regData } = await supabase.from('device_registrations').select('registered_at, device_fingerprint, email').gte('registered_at', twelveWeeksAgo.toISOString()).order('registered_at', { ascending: true });
              // Group by week
              const weekMap = new Map<string, { blocked: number; registrations: number; multiAccount: number }>();
              const fpEmailMap = new Map<string, Set<string>>();
              for (const r of regData || []) {
                const d = new Date(r.registered_at);
                const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
                const wk = monday.toISOString().split('T')[0];
                if (!weekMap.has(wk)) weekMap.set(wk, { blocked: 0, registrations: 0, multiAccount: 0 });
                weekMap.get(wk)!.registrations++;
                if (r.device_fingerprint && r.email) {
                  if (!fpEmailMap.has(r.device_fingerprint)) fpEmailMap.set(r.device_fingerprint, new Set());
                  fpEmailMap.get(r.device_fingerprint)!.add(r.email.toLowerCase());
                  if (fpEmailMap.get(r.device_fingerprint)!.size > 1) {
                    weekMap.get(wk)!.multiAccount++;
                  }
                }
              }
              const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([week, stats]) => ({ week: week.substring(5), ...stats }));
              setWeeklyAnalytics(weeks);
            } catch { /* silent */ }
            setAnalyticsLoading(false);
          }}
        >
          <View style={[st.deviceIcon, { backgroundColor: '#7C3AED15' }]}>
            <MaterialIcons name="analytics" size={18} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceTitle}>{isFr ? 'Analytiques Anti-Triche' : 'Anti-Cheat Analytics'}</Text>
            <Text style={st.deviceSubtitle}>{isFr ? 'Tendances hebdomadaires (12 sem.)' : 'Weekly trends (12 wks)'}</Text>
          </View>
          {analyticsLoading ? <ActivityIndicator size="small" color="#7C3AED" /> : (
            <MaterialIcons name={weeklyAnalytics.length > 0 ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
          )}
        </Pressable>
        {weeklyAnalytics.length > 0 ? (
          <View style={{ paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 90, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 10, paddingBottom: 24 }}>
              {weeklyAnalytics.map((w, i) => {
                const maxReg = Math.max(...weeklyAnalytics.map(wk => wk.registrations), 1);
                const regH = Math.max(4, (w.registrations / maxReg) * 50);
                const maH = Math.max(2, (w.multiAccount / Math.max(maxReg, 1)) * 50);
                return (
                  <View key={w.week} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
                      <View style={{ width: 6, height: regH, borderRadius: 3, backgroundColor: '#3B82F6' }} />
                      {w.multiAccount > 0 ? <View style={{ width: 5, height: maH, borderRadius: 3, backgroundColor: '#EF4444' }} /> : null}
                    </View>
                    <Text style={{ fontSize: 6, color: theme.textMuted, fontWeight: '500' }}>{w.week}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '600' }}>{isFr ? 'Inscriptions' : 'Registrations'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '600' }}>{isFr ? 'Multi-comptes' : 'Multi-accounts'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#3B82F6' }}>{weeklyAnalytics.reduce((s, w) => s + w.registrations, 0)}</Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600', marginTop: 2 }}>{isFr ? 'Total inscriptions' : 'Total registrations'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>{weeklyAnalytics.reduce((s, w) => s + w.multiAccount, 0)}</Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600', marginTop: 2 }}>{isFr ? 'Violations' : 'Violations'}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* ============ DEVICE TRANSFER REQUESTS ============ */}
      <View style={st.deviceSection}>
        <Pressable
          style={st.deviceHeaderRow}
          onPress={async () => {
            if (transferRequests.length > 0) { setTransferRequests([]); return; }
            setTransferLoading(true);
            const { requests, error: trErr } = await fetchPendingTransferRequests();
            if (trErr) showAlert('Error', trErr);
            setTransferRequests(requests);
            setTransferLoading(false);
          }}
        >
          <View style={[st.deviceIcon, { backgroundColor: '#F59E0B15' }]}>
            <MaterialIcons name="swap-horiz" size={18} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceTitle}>{isFr ? 'Transferts d\'appareils' : 'Device Transfers'}</Text>
            <Text style={st.deviceSubtitle}>{isFr ? 'Demandes en attente de validation' : 'Pending validation requests'}</Text>
          </View>
          {transferLoading ? <ActivityIndicator size="small" color="#F59E0B" /> : (
            <MaterialIcons name={transferRequests.length > 0 ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
          )}
        </Pressable>
        {transferRequests.length > 0 ? (
          <View style={{ paddingTop: 10 }}>
            {transferRequests.map((tr) => (
              <View key={tr.id} style={st.deviceCard}>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary }}>{tr.username || tr.userEmail || tr.userId.substring(0, 8)}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Code: <Text style={{ fontWeight: '800', color: '#F59E0B', letterSpacing: 2 }}>{tr.transferCode}</Text></Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                    {isFr ? 'Expire' : 'Expires'}: {new Date(tr.expiresAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {tr.oldFingerprint ? <Text style={{ fontSize: 8, color: theme.textMuted, fontFamily: 'monospace', marginTop: 2 }}>{tr.oldFingerprint}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22C55E15', paddingVertical: 10, borderRadius: 10 }}
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      const { error: vErr } = await validateTransferRequest(tr.id);
                      if (vErr) { showAlert('Error', vErr); return; }
                      setTransferRequests(prev => prev.filter(r => r.id !== tr.id));
                      showAlert(isFr ? 'Transfert valide' : 'Transfer validated');
                    }}
                  >
                    <MaterialIcons name="check" size={16} color="#22C55E" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#22C55E' }}>{isFr ? 'Valider' : 'Validate'}</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EF444415', paddingVertical: 10, borderRadius: 10 }}
                    onPress={async () => {
                      Haptics.selectionAsync();
                      const { error: rErr } = await rejectTransferRequest(tr.id);
                      if (rErr) { showAlert('Error', rErr); return; }
                      setTransferRequests(prev => prev.filter(r => r.id !== tr.id));
                    }}
                  >
                    <MaterialIcons name="close" size={16} color="#EF4444" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{isFr ? 'Rejeter' : 'Reject'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {transferRequests.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center', paddingVertical: 16 }}>{isFr ? 'Aucune demande en attente' : 'No pending requests'}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ============ DEVICE MANAGEMENT ============ */}
      <View style={st.deviceSection}>
        <Pressable
          style={st.deviceHeaderRow}
          onPress={async () => {
            if (deviceRegsLoaded) {
              setDeviceRegsLoaded(false);
              setDeviceRegs([]);
              return;
            }
            setDeviceRegsLoading(true);
            const { registrations, error: err } = await fetchDeviceRegistrations();
            if (err) showAlert('Error', err);
            setDeviceRegs(registrations);
            setDeviceRegsLoading(false);
            setDeviceRegsLoaded(true);
          }}
        >
          <View style={[st.deviceIcon, { backgroundColor: '#0EA5E915' }]}>
            <MaterialIcons name="devices" size={18} color="#0EA5E9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceTitle}>{isFr ? 'Gestion des appareils' : 'Device Management'}</Text>
            <Text style={st.deviceSubtitle}>{isFr ? 'Delier des comptes de leurs appareils' : 'Unlink accounts from their devices'}</Text>
          </View>
          {deviceRegsLoading ? <ActivityIndicator size="small" color="#0EA5E9" /> : (
            <MaterialIcons name={deviceRegsLoaded ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
          )}
        </Pressable>

        {deviceRegsLoaded ? (
          <View style={{ paddingTop: 10 }}>
            <View style={[st.searchBar, { marginHorizontal: 0, marginBottom: 10 }]}>
              <MaterialIcons name="search" size={18} color={theme.textMuted} />
              <TextInput style={st.searchInput} value={deviceSearch} onChangeText={setDeviceSearch} placeholder={isFr ? 'Filtrer par email ou fingerprint...' : 'Filter by email or fingerprint...'} placeholderTextColor={theme.textMuted} />
              {deviceSearch.length > 0 ? <Pressable onPress={() => setDeviceSearch('')} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable> : null}
            </View>

            {(() => {
              const filteredDevices = deviceRegs.filter(d => {
                if (!deviceSearch.trim()) return true;
                const q = deviceSearch.toLowerCase();
                return d.email.toLowerCase().includes(q) || d.fingerprint.toLowerCase().includes(q);
              });

              // Group by fingerprint for multi-account detection
              const fpGroups = new Map<string, typeof filteredDevices>();
              filteredDevices.forEach(d => {
                if (!fpGroups.has(d.fingerprint)) fpGroups.set(d.fingerprint, []);
                fpGroups.get(d.fingerprint)!.push(d);
              });
              const multiAccountFps = Array.from(fpGroups.entries()).filter(([_, regs]) => {
                const uniqueEmails = new Set(regs.map(r => r.email.toLowerCase()));
                return uniqueEmails.size > 1;
              });

              return (
                <>
                  {/* Multi-account alerts */}
                  {multiAccountFps.length > 0 ? (
                    <View style={{ backgroundColor: '#EF444408', borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#EF444420' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="warning" size={14} color="#EF4444" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>
                          {multiAccountFps.length} {isFr ? 'appareil(s) multi-compte detecte(s)' : 'multi-account device(s) detected'}
                        </Text>
                      </View>
                      {multiAccountFps.slice(0, 3).map(([fp, regs]) => {
                        const emails = [...new Set(regs.map(r => r.email))];
                        return (
                          <View key={fp} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#EF444415' }}>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted, fontFamily: 'monospace' }}>{fp.substring(0, 12)}...</Text>
                            <View style={{ flex: 1 }}>
                              {emails.map(e => <Text key={e} style={{ fontSize: 11, color: '#EF4444', fontWeight: '600' }}>{e}</Text>)}
                            </View>
                            <Pressable
                              style={{ backgroundColor: '#EF444415', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                const { error: err, count } = await adminUnlinkAllForDevice(fp);
                                if (err) { showAlert('Error', err); return; }
                                setDeviceRegs(prev => prev.filter(d => d.fingerprint !== fp));
                                showAlert(isFr ? `${count} enregistrement(s) supprime(s)` : `${count} registration(s) removed`);
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>{isFr ? 'Tout delier' : 'Unlink all'}</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, fontWeight: '600' }}>
                    {filteredDevices.length} {isFr ? 'enregistrement(s)' : 'registration(s)'}
                  </Text>

                  {filteredDevices.slice(0, 50).map((d) => (
                    <View key={d.id} style={st.deviceCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{d.email || 'Unknown'}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Text style={{ fontSize: 9, color: theme.textMuted, fontFamily: 'monospace' }}>{d.fingerprint}</Text>
                            {(d as any).authMethod ? (
                              <View style={{ backgroundColor: (d as any).authMethod === 'google' ? '#EA433515' : '#3B82F615', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: (d as any).authMethod === 'google' ? '#EA4335' : '#3B82F6' }}>{((d as any).authMethod || 'email').toUpperCase()}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                            {new Date(d.registeredAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Pressable
                          style={[st.deviceUnlinkBtn, unlinkingId === d.id && { opacity: 0.6 }]}
                          onPress={async () => {
                            Haptics.selectionAsync();
                            setUnlinkingId(d.id);
                            const { error: err } = await adminUnlinkDevice(d.id);
                            setUnlinkingId(null);
                            if (err) { showAlert('Error', err); return; }
                            setDeviceRegs(prev => prev.filter(r => r.id !== d.id));
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          }}
                          disabled={unlinkingId === d.id}
                        >
                          {unlinkingId === d.id ? <ActivityIndicator size="small" color="#EF4444" /> : (
                            <><MaterialIcons name="link-off" size={14} color="#EF4444" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{isFr ? 'Delier' : 'Unlink'}</Text></>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {filteredDevices.length > 50 ? (
                    <Text style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center', paddingVertical: 8 }}>+{filteredDevices.length - 50} {isFr ? 'autres' : 'more'}...</Text>
                  ) : null}
                </>
              );
            })()}
          </View>
        ) : null}
      </View>

      {/* Status filter chips */}
      <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
        {(['all', 'flagged', 'watch', 'ok', 'dismissed', 'banned'] as StatusFilter[]).map(sf => (
          <Pressable
            key={sf}
            style={[st.filterChip, statusFilter === sf && { backgroundColor: sf === 'all' ? theme.primary : getStatusColor(sf), borderColor: sf === 'all' ? theme.primary : getStatusColor(sf) }]}
            onPress={() => { Haptics.selectionAsync(); setStatusFilter(sf); }}
          >
            <Text style={[st.filterChipText, statusFilter === sf && { color: '#FFF' }]}>{sf === 'all' ? (isFr ? 'Tous' : 'All') : getStatusLabel(sf)}</Text>
            <View style={[st.filterCount, statusFilter === sf && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={[st.filterCountText, statusFilter === sf && { color: '#FFF' }]}>{statusCounts[sf]}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView></View>

      {/* Search */}
      <View style={st.searchBar}>
        <MaterialIcons name="search" size={18} color={theme.textMuted} />
        <TextInput style={st.searchInput} value={search} onChangeText={setSearch} placeholder={isFr ? 'Rechercher un joueur...' : 'Search player...'} placeholderTextColor={theme.textMuted} />
        {search.length > 0 ? <Pressable onPress={() => setSearch('')} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable> : null}
      </View>

      <View style={st.listInner}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <MaterialIcons name="check-circle" size={48} color={theme.success} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>
              {(et.adminNoPlayers as any)?.[language] || 'No players'}
            </Text>
          </View>
        ) : (
          filtered.map((p, idx) => {
            const scoreColor = getTrustScoreColor(p.trustScore);
            const level = getLevelFromScore(p.trustScore);
            return (
              <View key={p.id}>
                <Pressable
                  style={[st.playerCard, { borderLeftColor: getStatusColor(p.status) }]}
                  onPress={() => { setSelectedPlayer(p); setAdminNotes(p.adminNotes || ''); }}
                >
                  <View style={st.playerHeader}>
                    <View style={st.playerAvatar}>
                      {p.playerAvatar ? (
                        <Image source={{ uri: p.playerAvatar }} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSecondary }}>{(p.playerName || '?').charAt(0)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.playerName}>{p.playerName || p.playerId.substring(0, 8)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={[st.statusBadge, { backgroundColor: getStatusColor(p.status) + '15', borderColor: getStatusColor(p.status) + '30' }]}>
                          <Text style={[st.statusBadgeText, { color: getStatusColor(p.status) }]}>{getStatusLabel(p.status)}</Text>
                        </View>
                        {p.flags.length > 0 ? (
                          <View style={st.flagCountBadge}>
                            <MaterialIcons name="flag" size={10} color="#EF4444" />
                            <Text style={st.flagCountText}>{p.flags.length}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[st.scoreCircle, { borderColor: scoreColor }]}>
                      <Text style={[st.scoreText, { color: scoreColor }]}>{p.trustScore}</Text>
                    </View>
                  </View>
                  {p.flags.length > 0 ? (
                    <View style={st.flagsRow}>
                      {p.flags.slice(0, 3).map((flag: string, fi: number) => (
                        <View key={fi} style={st.flagChip}>
                          <Text style={st.flagChipText}>{flag.replace(/_/g, ' ')}</Text>
                        </View>
                      ))}
                      {p.flags.length > 3 ? <Text style={st.flagMore}>+{p.flags.length - 3}</Text> : null}
                    </View>
                  ) : null}
                  {/* Quick actions */}
                  <View style={st.quickActions}>
                    {p.status !== 'dismissed' ? (
                      <Pressable style={[st.qAction, { backgroundColor: '#6B728015' }]} onPress={() => handleUpdateStatus(p.id, 'dismissed')}>
                        <MaterialIcons name="check" size={14} color="#6B7280" />
                        <Text style={[st.qActionText, { color: '#6B7280' }]}>{(et.adminDismiss as any)?.[language] || 'Dismiss'}</Text>
                      </Pressable>
                    ) : null}
                    {p.status !== 'banned' ? (
                      <Pressable style={[st.qAction, { backgroundColor: '#EF444415' }]} onPress={() => handleUpdateStatus(p.id, 'banned')}>
                        <MaterialIcons name="block" size={14} color="#EF4444" />
                        <Text style={[st.qActionText, { color: '#EF4444' }]}>{(et.adminBan as any)?.[language] || 'Ban'}</Text>
                      </Pressable>
                    ) : null}
                    {p.status === 'banned' || p.status === 'dismissed' ? (
                      <Pressable style={[st.qAction, { backgroundColor: '#22C55E15' }]} onPress={() => handleUpdateStatus(p.id, 'ok')}>
                        <MaterialIcons name="undo" size={14} color="#22C55E" />
                        <Text style={[st.qActionText, { color: '#22C55E' }]}>{isFr ? 'Restaurer' : 'Restore'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={selectedPlayer !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedPlayer(null)}>
        <SafeAreaView style={st.detailContainer}>
          <View style={st.detailHeader}>
            <Pressable style={st.detailClose} onPress={() => setSelectedPlayer(null)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={st.detailTitle}>{selectedPlayer?.playerName || 'Player'}</Text>
            <Pressable style={st.detailViewBtn} onPress={() => { setSelectedPlayer(null); router.push(`/player/${selectedPlayer?.playerId}` as any); }}>
              <MaterialIcons name="open-in-new" size={20} color={theme.primary} />
            </Pressable>
          </View>
          {selectedPlayer ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
              {/* Load deletion timeline when player selected */}
              {(() => {
                // Use a self-invoking component pattern to trigger load
                return null;
              })()}
              {/* Score hero */}
              <View style={[st.detailScoreCard, { borderColor: getTrustScoreColor(selectedPlayer.trustScore) + '30' }]}>
                <View style={[st.detailScoreCircle, { borderColor: getTrustScoreColor(selectedPlayer.trustScore) }]}>
                  <Text style={[st.detailScoreValue, { color: getTrustScoreColor(selectedPlayer.trustScore) }]}>{selectedPlayer.trustScore}</Text>
                  <Text style={st.detailScoreMax}>/100</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.detailLevel, { color: getTrustScoreColor(selectedPlayer.trustScore) }]}>
                    {getTrustLevelLabel(getLevelFromScore(selectedPlayer.trustScore), isFr)}
                  </Text>
                  <Text style={st.detailStatus}>Status: {getStatusLabel(selectedPlayer.status)}</Text>
                  <Text style={st.detailAnalyzed}>
                    {selectedPlayer.analyzedAt ? new Date(selectedPlayer.analyzedAt).toLocaleString(isFr ? 'fr-FR' : 'en-US') : '-'}
                  </Text>
                </View>
                <Pressable
                  style={st.adjustBtn}
                  onPress={() => { setAdjustScore(String(selectedPlayer.trustScore)); setShowAdjustModal(true); }}
                >
                  <MaterialIcons name="edit" size={16} color={theme.primary} />
                  <Text style={st.adjustBtnText}>{(et.adminAdjustScore as any)?.[language] || 'Adjust'}</Text>
                </Pressable>
              </View>

              {/* Stats from details */}
              {selectedPlayer.details ? (
                <View style={st.detailSection}>
                  <Text style={st.detailSectionTitle}>{(et.adminPlayerStats as any)?.[language] || 'Stats'}</Text>
                  <View style={st.detailStatsGrid}>
                    {[
                      { label: 'Matches', value: selectedPlayer.details.totalMatches || selectedPlayer.details.matchesPlayed || '-' },
                      { label: 'Multi-player %', value: `${selectedPlayer.details.multiPlayerRatio || 0}%` },
                      { label: isFr ? 'Adversaires uniques' : 'Unique opponents', value: selectedPlayer.details.uniqueOpponents || '-' },
                      { label: isFr ? 'Coherence' : 'Consistency', value: `${selectedPlayer.details.performanceConsistency || 0}%` },
                      { label: isFr ? 'Modifs externes' : 'External mods', value: selectedPlayer.details.modificationLogs?.external || 0 },
                      { label: isFr ? 'Matchs/semaine' : 'Matches/week', value: selectedPlayer.details.matchesPerWeek || '-' },
                      { label: isFr ? 'Defaites supprimees' : 'Deleted losses', value: selectedPlayer.details.deletionAnalysis?.deletedLostMatches || 0 },
                      { label: isFr ? 'Perte ELO evitee' : 'ELO loss avoided', value: selectedPlayer.details.deletionAnalysis?.avoidedEloLoss ? `-${selectedPlayer.details.deletionAnalysis.avoidedEloLoss}` : '0' },
                      { label: isFr ? 'Anciennete (jours)' : 'Account age (days)', value: selectedPlayer.details.accountAgeDays || '-' },
                      { label: isFr ? 'Signalements' : 'Reports', value: selectedPlayer.details.totalReports || 0 },
                    ].map((stat, i) => (
                      <View key={i} style={st.detailStatItem}>
                        <Text style={st.detailStatValue}>{stat.value}</Text>
                        <Text style={st.detailStatLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Deletion Timeline & ELO Reversal */}
              {selectedPlayer.details?.deletionAnalysis?.deletedLostMatches > 0 ? (
                <View style={st.detailSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="delete-sweep" size={16} color="#EF4444" />
                      <Text style={st.detailSectionTitle}>{(et.deletionTimeline as any)?.[language] || 'Deletion History'}</Text>
                    </View>
                    <Pressable
                      style={[st.timelineLoadBtn, timelineLoading && { opacity: 0.6 }]}
                      onPress={async () => {
                        setTimelineLoading(true);
                        const { timeline } = await fetchDeletionTimeline(selectedPlayer.userId);
                        setDeletionTimeline(timeline);
                        // Build heatmap (7 days x 24 hours)
                        try {
                          const supabase = getSupabaseClient();
                          const { data: softDels } = await supabase
                            .from('soft_deletes')
                            .select('deleted_at')
                            .eq('user_id', selectedPlayer.userId)
                            .eq('table_name', 'matches');
                          const hm: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
                          for (const sd of softDels || []) {
                            const dt = new Date(sd.deleted_at);
                            const dow = (dt.getDay() + 6) % 7; // Monday=0
                            const hour = dt.getHours();
                            hm[dow][hour]++;
                          }
                          setDeletionHeatmap(hm);
                        } catch { setDeletionHeatmap([]); }
                        setTimelineLoading(false);
                      }}
                      disabled={timelineLoading}
                    >
                      {timelineLoading ? <ActivityIndicator size="small" color="#EF4444" /> : <MaterialIcons name="refresh" size={14} color="#EF4444" />}
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#EF4444' }}>{timelineLoading ? '...' : (isFr ? 'Charger' : 'Load')}</Text>
                    </Pressable>
                  </View>

                  {/* Deletion Heatmap (day x hour) */}
                  {deletionHeatmap.length > 0 ? (
                    <View style={st.heatmapContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <MaterialIcons name="grid-on" size={14} color="#7C3AED" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary }}>{(et.deletionHeatmapTitle as any)?.[language] || 'Deletion Heatmap'}</Text>
                      </View>
                      <Text style={{ fontSize: 9, color: theme.textMuted, marginBottom: 6 }}>{(et.deletionHeatmapDesc as any)?.[language] || 'Day vs hour'}</Text>
                      <View style={{ flexDirection: 'row', gap: 1 }}>
                        <View style={{ gap: 1, marginRight: 2 }}>
                          <View style={{ height: 12 }} />
                          {[isFr ? 'L' : 'M', isFr ? 'Ma' : 'Tu', isFr ? 'Me' : 'W', isFr ? 'J' : 'Th', isFr ? 'V' : 'F', isFr ? 'S' : 'Sa', isFr ? 'D' : 'Su'].map((d, i) => (
                            <View key={i} style={{ height: 12, justifyContent: 'center' }}>
                              <Text style={{ fontSize: 7, fontWeight: '600', color: theme.textMuted }}>{d}</Text>
                            </View>
                          ))}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 1 }}>
                          {Array.from({ length: 24 }, (_, h) => {
                            return (
                              <View key={h} style={{ gap: 1, alignItems: 'center' }}>
                                <Text style={{ fontSize: 6, fontWeight: '600', color: theme.textMuted, height: 12, textAlign: 'center' }}>{h}</Text>
                                {Array.from({ length: 7 }, (_, d) => {
                                  const count = deletionHeatmap[d]?.[h] || 0;
                                  const maxHeat = Math.max(...deletionHeatmap.flat(), 1);
                                  const intensity = count / maxHeat;
                                  const bg = count === 0 ? theme.backgroundSecondary
                                    : intensity < 0.33 ? '#FDE047'
                                    : intensity < 0.66 ? '#F97316'
                                    : '#EF4444';
                                  return (
                                    <View key={d} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: bg }} />
                                  );
                                })}
                              </View>
                            );
                          })}
                        </ScrollView>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                        <Text style={{ fontSize: 7, color: theme.textMuted }}>0</Text>
                        {[theme.backgroundSecondary, '#FDE047', '#F97316', '#EF4444'].map((c, i) => (
                          <View key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
                        ))}
                        <Text style={{ fontSize: 7, color: theme.textMuted }}>max</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Deletion summary stats */}
                  <View style={st.deletionSummaryRow}>
                    <View style={st.deletionSummaryItem}>
                      <Text style={[st.deletionSummaryValue, { color: '#EF4444' }]}>{selectedPlayer.details?.deletionAnalysis?.deletedLostMatches || 0}</Text>
                      <Text style={st.deletionSummaryLabel}>{(et.deletedLostMatches as any)?.[language] || 'Lost del.'}</Text>
                    </View>
                    <View style={st.deletionSummaryDivider} />
                    <View style={st.deletionSummaryItem}>
                      <Text style={[st.deletionSummaryValue, { color: '#DC2626' }]}>-{selectedPlayer.details?.deletionAnalysis?.avoidedEloLoss || 0}</Text>
                      <Text style={st.deletionSummaryLabel}>{(et.avoidedEloLoss as any)?.[language] || 'ELO avoided'}</Text>
                    </View>
                    <View style={st.deletionSummaryDivider} />
                    <View style={st.deletionSummaryItem}>
                      <Text style={[st.deletionSummaryValue, { color: '#F97316' }]}>{selectedPlayer.details?.deletionAnalysis?.recentDeletedLost7d || 0}</Text>
                      <Text style={st.deletionSummaryLabel}>{(et.recentDeletions7d as any)?.[language] || '7d'}</Text>
                    </View>
                    <View style={st.deletionSummaryDivider} />
                    <View style={st.deletionSummaryItem}>
                      <Text style={[st.deletionSummaryValue, { color: theme.textSecondary }]}>{selectedPlayer.details?.deletionAnalysis?.totalDeletedMatches || 0}</Text>
                      <Text style={st.deletionSummaryLabel}>{(et.totalDeletedMatches as any)?.[language] || 'Total'}</Text>
                    </View>
                  </View>

                  {/* Timeline chart */}
                  {deletionTimeline.length > 0 ? (
                    <View style={st.timelineContainer}>
                      <Text style={st.timelineLabel}>{(et.deletionTimelineDesc as any)?.[language] || 'Deleted losses per week'}</Text>
                      <View style={st.timelineChart}>
                        {(() => {
                          const maxVal = Math.max(...deletionTimeline.map(t => t.deletedLostCount), 1);
                          const maxElo = Math.max(...deletionTimeline.map(t => t.avoidedEloLoss), 1);
                          return deletionTimeline.slice(-12).map((point, idx) => {
                            const barHeight = Math.max(4, (point.deletedLostCount / maxVal) * 60);
                            const eloBarHeight = Math.max(2, (point.avoidedEloLoss / maxElo) * 60);
                            const weekLabel = point.weekStart.substring(5);
                            return (
                              <View key={point.weekStart} style={st.timelineBarGroup}>
                                <View style={st.timelineBarsWrap}>
                                  <View style={[st.timelineBar, { height: barHeight, backgroundColor: '#EF4444' }]} />
                                  <View style={[st.timelineBarElo, { height: eloBarHeight, backgroundColor: '#F59E0B' }]} />
                                </View>
                                <Text style={st.timelineBarValue}>{point.deletedLostCount}</Text>
                                <Text style={st.timelineBarWeek}>{weekLabel}</Text>
                                {point.avoidedEloLoss > 0 ? (
                                  <Text style={st.timelineBarEloValue}>-{point.avoidedEloLoss}</Text>
                                ) : null}
                              </View>
                            );
                          });
                        })()}
                      </View>
                      <View style={st.timelineLegend}>
                        <View style={st.timelineLegendItem}>
                          <View style={[st.timelineLegendDot, { backgroundColor: '#EF4444' }]} />
                          <Text style={st.timelineLegendText}>{(et.deletionTimelineLost as any)?.[language] || 'Losses'}</Text>
                        </View>
                        <View style={st.timelineLegendItem}>
                          <View style={[st.timelineLegendDot, { backgroundColor: '#F59E0B' }]} />
                          <Text style={st.timelineLegendText}>ELO</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {/* ELO Reversal button */}
                  <Pressable
                    style={[st.reverseEloBtn, reversingElo && { opacity: 0.6 }]}
                    onPress={() => {
                      const avoidedElo = selectedPlayer.details?.deletionAnalysis?.avoidedEloLoss || 0;
                      if (avoidedElo === 0) {
                        showAlert((et.reverseEloNone as any)?.[language] || 'No ELO to reverse');
                        return;
                      }
                      showAlert(
                        (et.reverseEloConfirmTitle as any)?.[language] || 'Reverse ELO?',
                        ((et.reverseEloConfirmMsg as any)?.[language] || 'Subtract {elo} ELO pts').replace('{elo}', String(avoidedElo)),
                        [
                          { text: isFr ? 'Annuler' : 'Cancel', style: 'cancel' },
                          {
                            text: (et.reverseElo as any)?.[language] || 'Reverse',
                            style: 'destructive',
                            onPress: async () => {
                              setReversingElo(true);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                              const { error, eloBefore, eloAfter, matchesReversed } = await reverseDeletedEloLoss(
                                selectedPlayer.userId,
                                selectedPlayer.playerId
                              );
                              setReversingElo(false);
                              if (error) {
                                showAlert('Error', error);
                              } else {
                                const msg = ((et.reverseEloSuccess as any)?.[language] || 'Reversed: {before} -> {after} ({count})')
                                  .replace('{before}', String(eloBefore))
                                  .replace('{after}', String(eloAfter))
                                  .replace('{count}', String(matchesReversed));
                                showAlert(msg);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    disabled={reversingElo}
                  >
                    {reversingElo ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="undo" size={16} color="#FFF" />}
                    <Text style={st.reverseEloBtnText}>
                      {reversingElo
                        ? ((et.reversing as any)?.[language] || 'Reversing...')
                        : `${(et.reverseElo as any)?.[language] || 'Reverse ELO'} (-${selectedPlayer.details?.deletionAnalysis?.avoidedEloLoss || 0} pts)`}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Flags */}
              <View style={st.detailSection}>
                <Text style={st.detailSectionTitle}>{(et.adminFlags as any)?.[language] || 'Flags'} ({selectedPlayer.flags.length})</Text>
                {selectedPlayer.flags.length === 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                    <MaterialIcons name="check-circle" size={20} color={theme.success} />
                    <Text style={{ fontSize: 14, color: theme.success, fontWeight: '600' }}>{isFr ? 'Aucune alerte' : 'No flags'}</Text>
                  </View>
                ) : (
                  selectedPlayer.flags.map((flag: string, fi: number) => (
                    <View key={fi} style={st.detailFlagRow}>
                      <MaterialIcons name="warning" size={14} color="#F97316" />
                      <Text style={st.detailFlagText}>{flag.replace(/_/g, ' ')}</Text>
                    </View>
                  ))
                )}
              </View>

              {/* Admin notes */}
              <View style={st.detailSection}>
                <Text style={st.detailSectionTitle}>{(et.adminNotes as any)?.[language] || 'Admin notes'}</Text>
                <TextInput
                  style={st.notesInput}
                  value={adminNotes}
                  onChangeText={setAdminNotes}
                  placeholder={isFr ? 'Notes internes...' : 'Internal notes...'}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  numberOfLines={4}
                />
                <Pressable style={[st.saveNotesBtn, savingNotes && { opacity: 0.6 }]} onPress={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="save" size={16} color="#FFF" />}
                  <Text style={st.saveNotesBtnText}>{(et.adminSaveNotes as any)?.[language] || 'Save'}</Text>
                </Pressable>
              </View>

              {/* Status actions */}
              <View style={st.detailSection}>
                <Text style={st.detailSectionTitle}>Actions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['ok', 'watch', 'flagged', 'banned', 'dismissed'].map(s => (
                    <Pressable
                      key={s}
                      style={[st.statusActionBtn, { borderColor: getStatusColor(s), backgroundColor: selectedPlayer.status === s ? getStatusColor(s) : getStatusColor(s) + '10' }]}
                      onPress={() => handleUpdateStatus(selectedPlayer.id, s)}
                    >
                      <Text style={[st.statusActionText, { color: selectedPlayer.status === s ? '#FFF' : getStatusColor(s) }]}>{getStatusLabel(s)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Adjust score modal */}
      <Modal visible={showAdjustModal} animationType="fade" transparent onRequestClose={() => setShowAdjustModal(false)}>
        <View style={st.adjustOverlay}>
          <View style={st.adjustContent}>
            <Text style={st.adjustTitle}>{(et.adminAdjustScore as any)?.[language] || 'Adjust Score'}</Text>
            <TextInput
              style={st.adjustInput}
              value={adjustScore}
              onChangeText={setAdjustScore}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="0-100"
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={st.adjustCancel} onPress={() => setShowAdjustModal(false)}>
                <Text style={st.adjustCancelText}>{t('common', 'cancel')}</Text>
              </Pressable>
              <Pressable style={st.adjustConfirm} onPress={handleAdjustScore}>
                <Text style={st.adjustConfirmText}>{t('common', 'save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </AdminGuard>
    </PageErrorBoundary>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSub: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  scanBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  eloRecalcBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  eloRecalcBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  filterChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  filterCount: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  filterCountText: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary, padding: 0 },

  mainScroll: { flex: 1 },
  mainScrollContent: { paddingTop: 0 },
  listInner: { paddingHorizontal: 16, paddingTop: 4 },

  playerCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, ...theme.shadows.card },
  playerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  playerAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  playerName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  flagCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EF444412', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  flagCountText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  scoreCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 16, fontWeight: '900' },

  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  flagChip: { backgroundColor: '#F9731612', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  flagChipText: { fontSize: 10, fontWeight: '600', color: '#F97316' },
  flagMore: { fontSize: 10, fontWeight: '600', color: theme.textMuted, alignSelf: 'center' },

  quickActions: { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  qAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  qActionText: { fontSize: 12, fontWeight: '600' },

  // Detail modal
  detailContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  detailClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: theme.textPrimary, textAlign: 'center' },
  detailViewBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  detailScoreCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, ...theme.shadows.card },
  detailScoreCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  detailScoreValue: { fontSize: 24, fontWeight: '900' },
  detailScoreMax: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
  detailLevel: { fontSize: 16, fontWeight: '700' },
  detailStatus: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  detailAnalyzed: { fontSize: 10, color: theme.textMuted, marginTop: 2 },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  adjustBtnText: { fontSize: 12, fontWeight: '600', color: theme.primary },

  detailSection: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 12, ...theme.shadows.card },
  detailSectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' },
  detailStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailStatItem: { width: '47%', backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, alignItems: 'center' },
  detailStatValue: { fontSize: 16, fontWeight: '800', color: theme.textPrimary },
  detailStatLabel: { fontSize: 10, color: theme.textMuted, marginTop: 2, textAlign: 'center' },
  detailFlagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  detailFlagText: { fontSize: 13, fontWeight: '500', color: theme.textPrimary, flex: 1 },
  notesInput: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, fontSize: 14, color: theme.textPrimary, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border, marginBottom: 10 },
  saveNotesBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 12, borderRadius: 12 },
  saveNotesBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  statusActionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  statusActionText: { fontSize: 13, fontWeight: '700' },

  // Adjust modal
  adjustOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 40 },
  adjustContent: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
  adjustTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 },
  adjustInput: { fontSize: 32, fontWeight: '900', color: theme.primary, textAlign: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: 140, marginBottom: 20, borderWidth: 2, borderColor: theme.primary + '30' },
  adjustCancel: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: theme.backgroundSecondary },
  adjustCancelText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  adjustConfirm: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary },
  adjustConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Summary dashboard
  summarySection: { marginHorizontal: 16, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  summaryCard: { flex: 1, backgroundColor: theme.surface, borderRadius: 14, padding: 12, alignItems: 'center', ...theme.shadows.card },
  summaryValue: { fontSize: 22, fontWeight: '900', color: theme.textPrimary },
  summaryLabel: { fontSize: 10, color: theme.textMuted, marginTop: 2, textAlign: 'center', fontWeight: '600' },
  distRow: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 6, marginBottom: 10, ...theme.shadows.card },
  distItem: { flex: 1, alignItems: 'center', gap: 4 },
  distBarTrack: { width: '100%', height: 50, backgroundColor: theme.backgroundSecondary, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  distBarFill: { width: '100%', borderRadius: 6 },
  distPct: { fontSize: 11, fontWeight: '800' },
  distLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600', textAlign: 'center' },
  distCount: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },
  batchDismissBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E12', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#22C55E30' },
  batchDismissBtnText: { fontSize: 13, fontWeight: '600', color: '#22C55E' },

  // ELO Dashboard
  eloDashSection: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.surface, borderRadius: 16, padding: 14, ...theme.shadows.card, borderWidth: 1, borderColor: '#9333EA' + '15' },
  eloDashHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 12 },
  eloDashIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  eloDashTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  eloDashStatsRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 10 },
  eloDashStat: { flex: 1, alignItems: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 4 },
  eloDashStatValue: { fontSize: 18, fontWeight: '900' as const },
  eloDashStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, fontWeight: '600' as const, textAlign: 'center' as const },
  eloDashDistRow: { flexDirection: 'row' as const, gap: 4 },
  eloDashDistItem: { flex: 1, alignItems: 'center' as const, gap: 3 },
  eloDashDistBarTrack: { width: '100%' as const, height: 44, backgroundColor: theme.backgroundSecondary, borderRadius: 6, overflow: 'hidden' as const, justifyContent: 'flex-end' as const },
  eloDashDistBarFill: { width: '100%' as const, borderRadius: 6 },
  eloDashDistPct: { fontSize: 10, fontWeight: '800' as const },
  eloDashDistLabel: { fontSize: 7, color: theme.textMuted, fontWeight: '600' as const, textAlign: 'center' as const },
  eloDashDistCount: { fontSize: 10, fontWeight: '700' as const },
  eloDashActionBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },

  // Deletion alerts
  deletionSection: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.surface, borderRadius: 16, padding: 14, ...theme.shadows.card, borderWidth: 1, borderColor: '#EF4444' + '20' },
  deletionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 12 },
  deletionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  deletionTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  deletionSubtitle: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  deletionCountBadge: { backgroundColor: '#EF4444', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 8 },
  deletionCountText: { fontSize: 12, fontWeight: '800' as const, color: '#FFF' },
  deletionCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 3 },
  deletionAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.surface, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  deletionPlayerName: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  deletionSeverity: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  deletionSeverityText: { fontSize: 9, fontWeight: '700' as const },
  deletionTrustBadge: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  deletionTrustText: { fontSize: 10, fontWeight: '900' as const },
  deletionStatsRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  deletionStatItem: { flex: 1, alignItems: 'center' as const },
  deletionStatValue: { fontSize: 16, fontWeight: '800' as const },
  deletionStatLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600' as const, marginTop: 2, textAlign: 'center' as const },
  deletionStatDivider: { width: 1, height: 24, backgroundColor: theme.border },
  deletionMoreText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' as const, textAlign: 'center' as const, paddingTop: 4 },

  // Deletion timeline
  timelineLoadBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#EF444412', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  deletionSummaryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 12 },
  deletionSummaryItem: { flex: 1, alignItems: 'center' as const },
  deletionSummaryValue: { fontSize: 18, fontWeight: '800' as const },
  deletionSummaryLabel: { fontSize: 9, color: theme.textMuted, fontWeight: '600' as const, marginTop: 2, textAlign: 'center' as const },
  deletionSummaryDivider: { width: 1, height: 28, backgroundColor: theme.border },
  timelineContainer: { marginBottom: 12 },
  timelineLabel: { fontSize: 11, color: theme.textMuted, fontWeight: '600' as const, marginBottom: 8 },
  timelineChart: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 4, height: 110, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 10, paddingBottom: 28 },
  timelineBarGroup: { flex: 1, alignItems: 'center' as const, gap: 2 },
  timelineBarsWrap: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 1 },
  timelineBar: { width: 8, borderRadius: 4 },
  timelineBarElo: { width: 6, borderRadius: 3, opacity: 0.7 },
  timelineBarValue: { fontSize: 8, fontWeight: '800' as const, color: '#EF4444' },
  timelineBarWeek: { fontSize: 7, color: theme.textMuted, fontWeight: '500' as const },
  timelineBarEloValue: { fontSize: 7, fontWeight: '700' as const, color: '#F59E0B' },
  timelineLegend: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 16, marginTop: 8 },
  timelineLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  timelineLegendDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLegendText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' as const },
  reverseEloBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 12 },
  reverseEloBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#FFF' },

  // Bulk reverse ELO
  bulkReverseBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  bulkReverseBtnText: { fontSize: 12, fontWeight: '700' as const, color: '#FFF' },

  // Heatmap
  heatmapContainer: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 12 },

  // Device management
  deviceSection: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.surface, borderRadius: 16, padding: 14, ...theme.shadows.card, borderWidth: 1, borderColor: '#0EA5E9' + '15' },
  deviceHeaderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  deviceIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  deviceTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  deviceSubtitle: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  deviceCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 6 },
  deviceUnlinkBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#EF444410', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
});
