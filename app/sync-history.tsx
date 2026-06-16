import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppActions, useAppUI } from '@/contexts/AppContext';
import { getSyncHistory, clearSyncHistory, SyncHistoryEntry } from '@/services/syncHistoryService';
import { getQueueSize, getFailedOperations, clearFailedOperations, removeFailedOperation, FailedOperation } from '@/services/offlineQueueService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const TABLE_ICONS: Record<string, string> = {
  players: 'person',
  clubs: 'location-city',
  terrains: 'sports-soccer',
  tournaments: 'emoji-events',
  matches: 'sports',
  challenges: 'flag',
};

const TABLE_LABELS_FR: Record<string, string> = {
  players: 'Joueur',
  clubs: 'Club',
  terrains: 'Terrain',
  tournaments: 'Tournoi',
  matches: 'Match',
  challenges: 'Challenge',
};

const OP_LABELS_FR: Record<string, string> = {
  insert: 'Ajout',
  update: 'Modification',
  delete: 'Suppression',
};

const OP_LABELS_EN: Record<string, string> = {
  insert: 'Insert',
  update: 'Update',
  delete: 'Delete',
};

const OP_COLORS: Record<string, string> = {
  insert: theme.success,
  update: theme.primary,
  delete: theme.error,
};

export default function SyncHistoryScreen() {
  const { t, language } = useLanguage();
  const { refreshData, retryFailedOps } = useAppActions();
  const { isReplayingQueue } = useAppUI();
  const { isConnected } = useNetworkStatus();
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [failedOps, setFailedOps] = useState<FailedOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [h, qs, fo] = await Promise.all([getSyncHistory(), getQueueSize(), getFailedOperations()]);
      setHistory(h);
      setQueueSize(qs);
      setFailedOps(fo);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when replay finishes
  useEffect(() => {
    if (!isReplayingQueue) {
      loadData();
    }
  }, [isReplayingQueue, loadData]);

  const handleManualSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setManualSyncing(true);
    try {
      await refreshData();
      await loadData();
    } finally {
      setManualSyncing(false);
    }
  };

  const handleRetryAll = async () => {
    if (!isConnected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRetryingAll(true);
    try {
      await retryFailedOps();
      await loadData();
    } finally {
      setRetryingAll(false);
    }
  };

  const handleRetrySingle = async (opId: string) => {
    if (!isConnected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRetryingIds(prev => new Set(prev).add(opId));
    try {
      await retryFailedOps([opId]);
      await loadData();
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(opId);
        return next;
      });
    }
  };

  const handleRemoveFailedOp = async (opId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await removeFailedOperation(opId);
    setFailedOps(prev => prev.filter(op => op.id !== opId));
  };

  const handleClearAllFailed = () => {
    Alert.alert(
      t('syncHistory', 'clearFailedTitle'),
      t('syncHistory', 'clearFailedMsg'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('syncHistory', 'clearBtn'),
          style: 'destructive',
          onPress: async () => {
            await clearFailedOperations();
            setFailedOps([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      t('syncHistory', 'clearHistoryTitle'),
      t('syncHistory', 'clearHistoryMsg'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('syncHistory', 'clearBtn'),
          style: 'destructive',
          onPress: async () => {
            await clearSyncHistory();
            setHistory([]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    const timeStr = date.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (diffDays === 0) {
      if (diffMin < 1) return t('syncHistory', 'justNow');
      if (diffMin < 60) return `${diffMin} min · ${timeStr}`;
      return `${diffHours}h · ${timeStr}`;
    }
    if (diffDays === 1) return `${t('syncHistory', 'yesterday')} · ${timeStr}`;
    if (diffDays < 7) return `${diffDays}${t('syncHistory', 'daysAgo')} · ${timeStr}`;

    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
    }) + ` · ${timeStr}`;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.round(ms / 100) / 10;
    return `${secs}s`;
  };

  const getStatusColor = (entry: SyncHistoryEntry): string => {
    if (entry.failed > 0 && entry.succeeded === 0) return theme.error;
    if (entry.failed > 0) return theme.warning;
    return theme.success;
  };

  const getStatusIcon = (entry: SyncHistoryEntry): string => {
    if (entry.failed > 0 && entry.succeeded === 0) return 'error';
    if (entry.failed > 0) return 'warning';
    if (entry.conflictsDetected > 0) return 'sync-problem';
    return 'check-circle';
  };

  const renderFailedOpsSection = () => {
    if (failedOps.length === 0) return null;

    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.failedSection}>
        {/* Section header */}
        <View style={styles.failedHeader}>
          <View style={styles.failedHeaderLeft}>
            <View style={styles.failedIcon}>
              <MaterialIcons name="error" size={16} color={theme.error} />
            </View>
            <Text style={styles.failedTitle}>
              {failedOps.length} {t('syncHistory', 'failedOps')}
            </Text>
          </View>
          <Pressable onPress={handleClearAllFailed} hitSlop={8}>
            <Text style={styles.failedClearBtn}>
              {t('syncHistory', 'clearAllFailed')}
            </Text>
          </Pressable>
        </View>

        {/* Failed operation cards */}
        {failedOps.map((op, index) => {
          const opLabel = language === 'fr' ? (OP_LABELS_FR[op.type] || op.type) : (OP_LABELS_EN[op.type] || op.type);
          const tableLabel = language === 'fr' ? (TABLE_LABELS_FR[op.table] || op.table) : op.table;
          const tableIcon = TABLE_ICONS[op.table] || 'storage';
          const opColor = OP_COLORS[op.type] || theme.textSecondary;
          const isRetrying = retryingIds.has(op.id);
          const itemName = op.dbPayload?.name || op.dbPayload?.player_name || op.dbPayload?.tournament_name || '';

          return (
            <Animated.View
              key={op.id}
              entering={FadeInDown.duration(250).delay(index * 30)}
              style={styles.failedCard}
            >
              <View style={[styles.failedCardStrip, { backgroundColor: opColor }]} />
              <View style={styles.failedCardContent}>
                {/* Top row: icon + info */}
                <View style={styles.failedCardTop}>
                  <View style={[styles.failedCardIcon, { backgroundColor: opColor + '15' }]}>
                    <MaterialIcons name={tableIcon as any} size={18} color={opColor} />
                  </View>
                  <View style={styles.failedCardInfo}>
                    <View style={styles.failedCardInfoRow}>
                      <Text style={styles.failedCardOpLabel}>
                        {opLabel}
                      </Text>
                      <View style={[styles.failedCardTypeBadge, { backgroundColor: opColor + '15' }]}>
                        <Text style={[styles.failedCardTypeBadgeText, { color: opColor }]}>
                          {tableLabel}
                        </Text>
                      </View>
                      {op.retryCount > 0 ? (
                        <View style={styles.retryCountBadge}>
                          <MaterialIcons name="refresh" size={10} color={theme.textMuted} />
                          <Text style={styles.retryCountText}>{op.retryCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    {itemName ? (
                      <Text style={styles.failedCardItemName} numberOfLines={1}>{itemName}</Text>
                    ) : null}
                    <Text style={styles.failedCardDate}>
                      {formatDate(op.failedAt)}
                    </Text>
                  </View>
                </View>

                {/* Error message */}
                <View style={styles.failedCardError}>
                  <MaterialIcons name="error-outline" size={12} color={theme.error} />
                  <Text style={styles.failedCardErrorText} numberOfLines={2}>{op.error}</Text>
                </View>

                {/* Actions */}
                <View style={styles.failedCardActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.failedCardRetryBtn,
                      (!isConnected || isRetrying) && styles.failedCardRetryBtnDisabled,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => handleRetrySingle(op.id)}
                    disabled={!isConnected || isRetrying}
                  >
                    {isRetrying ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <MaterialIcons name="replay" size={14} color="#FFF" />
                        <Text style={styles.failedCardRetryBtnText}>
                          {t('syncHistory', 'retry')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.failedCardRemoveBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => handleRemoveFailedOp(op.id)}
                    disabled={isRetrying}
                  >
                    <MaterialIcons name="close" size={16} color={theme.textMuted} />
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          );
        })}

        {/* Retry all button */}
        <Pressable
          style={({ pressed }) => [
            styles.retryAllBtn,
            (!isConnected || retryingAll) && styles.retryAllBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleRetryAll}
          disabled={!isConnected || retryingAll}
        >
          {retryingAll ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <MaterialIcons name="replay" size={18} color="#FFF" />
          )}
          <Text style={styles.retryAllBtnText}>
            {retryingAll
              ? t('syncHistory', 'retrying')
              : `${t('syncHistory', 'retryAllCount')} (${failedOps.length})`}
          </Text>
        </Pressable>
      </Animated.View>
    );
  };

  const renderItem = ({ item, index }: { item: SyncHistoryEntry; index: number }) => {
    const statusColor = getStatusColor(item);
    const statusIcon = getStatusIcon(item);

    return (
      <Animated.View
        entering={FadeInDown.duration(300).delay(index * 40)}
        style={styles.entryCard}
      >
        {/* Status indicator */}
        <View style={[styles.statusStrip, { backgroundColor: statusColor }]} />

        <View style={styles.entryContent}>
          {/* Top row: icon + date + duration */}
          <View style={styles.entryHeader}>
            <View style={[styles.statusIcon, { backgroundColor: statusColor + '15' }]}>
              <MaterialIcons name={statusIcon as any} size={18} color={statusColor} />
            </View>
            <View style={styles.entryHeaderInfo}>
              <Text style={styles.entryDate}>{formatDate(item.date)}</Text>
              <Text style={styles.entryDuration}>{formatDuration(item.duration)}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.entryStats}>
            <View style={styles.entryStat}>
              <MaterialIcons name="check" size={14} color={theme.success} />
              <Text style={[styles.entryStatValue, { color: theme.success }]}>{item.succeeded}</Text>
              <Text style={styles.entryStatLabel}>
                {t('syncHistory', 'succeeded')}
              </Text>
            </View>

            {item.failed > 0 ? (
              <View style={styles.entryStat}>
                <MaterialIcons name="close" size={14} color={theme.error} />
                <Text style={[styles.entryStatValue, { color: theme.error }]}>{item.failed}</Text>
                <Text style={styles.entryStatLabel}>
                  {t('syncHistory', 'failed')}
                </Text>
              </View>
            ) : null}

            {item.conflictsDetected > 0 ? (
              <View style={styles.entryStat}>
                <MaterialIcons name="sync-problem" size={14} color={theme.warning} />
                <Text style={[styles.entryStatValue, { color: theme.warning }]}>{item.conflictsDetected}</Text>
                <Text style={styles.entryStatLabel}>
                  {t('syncHistory', 'conflicts')}
                </Text>
              </View>
            ) : null}

            <View style={styles.entryStat}>
              <MaterialIcons name="swap-vert" size={14} color={theme.textMuted} />
              <Text style={styles.entryStatValue}>{item.total}</Text>
              <Text style={styles.entryStatLabel}>total</Text>
            </View>
          </View>

          {/* Errors (if any) */}
          {item.errors.length > 0 ? (
            <View style={styles.errorsContainer}>
              {item.errors.slice(0, 3).map((err, i) => (
                <View key={i} style={styles.errorRow}>
                  <MaterialIcons name="error-outline" size={12} color={theme.error} />
                  <Text style={styles.errorText} numberOfLines={1}>{err}</Text>
                </View>
              ))}
              {item.errors.length > 3 ? (
                <Text style={styles.moreErrors}>
                  +{item.errors.length - 3} {t('syncHistory', 'moreErrors')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Queue Status Card */}
      <View style={[styles.queueCard, isReplayingQueue && styles.queueCardActive]}>
        <View style={styles.queueCardLeft}>
          <View style={[
            styles.queueIcon,
            { backgroundColor: isReplayingQueue ? theme.warning + '15' : (queueSize > 0 ? theme.primary + '15' : theme.success + '15') },
          ]}>
            <MaterialIcons
              name={isReplayingQueue ? 'cloud-sync' : (queueSize > 0 ? 'schedule' : 'cloud-done')}
              size={24}
              color={isReplayingQueue ? theme.warning : (queueSize > 0 ? theme.primary : theme.success)}
            />
          </View>
          <View>
            <Text style={styles.queueTitle}>
              {isReplayingQueue
                ? t('syncHistory', 'syncing')
                : queueSize > 0
                  ? `${queueSize} ${t('syncHistory', 'pending')}`
                  : t('syncHistory', 'queueEmpty')}
            </Text>
            <Text style={styles.queueSubtitle}>
              {isConnected
                ? t('syncHistory', 'connected')
                : t('syncHistory', 'offline')}
            </Text>
          </View>
        </View>
        {isReplayingQueue ? (
          <ActivityIndicator size="small" color={theme.warning} />
        ) : null}
      </View>

      {/* Manual Sync Button */}
      <Pressable
        style={({ pressed }) => [
          styles.syncButton,
          (!isConnected || manualSyncing || isReplayingQueue) && styles.syncButtonDisabled,
          pressed && { opacity: 0.85 },
        ]}
        onPress={handleManualSync}
        disabled={!isConnected || manualSyncing || isReplayingQueue}
      >
        {manualSyncing ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <MaterialIcons name="sync" size={20} color="#FFF" />
        )}
        <Text style={styles.syncButtonText}>
          {manualSyncing
            ? t('syncHistory', 'syncingBtn')
            : t('syncHistory', 'forceFullSync')}
        </Text>
      </Pressable>

      {/* Failed Operations Section */}
      {renderFailedOpsSection()}

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {t('syncHistory', 'historyLabel')}
        </Text>
        {history.length > 0 ? (
          <Pressable onPress={handleClearHistory} hitSlop={8}>
            <Text style={styles.clearBtn}>
              {t('common', 'clear')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <MaterialIcons name="cloud-queue" size={48} color={theme.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>
        {t('syncHistory', 'noHistory')}
      </Text>
      <Text style={styles.emptySubtitle}>
        {language === 'fr'
          ? "Les synchronisations hors-ligne apparaitront ici"
          : 'Offline sync replays will appear here'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t('syncHistory', 'title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            isTablet && styles.listContentTablet,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listContentTablet: {
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%',
    paddingHorizontal: 24,
  },
  headerContent: {
    marginBottom: 8,
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  queueCardActive: {
    borderWidth: 1,
    borderColor: theme.warning + '30',
  },
  queueCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  queueIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  queueSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 20,
  },
  syncButtonDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Failed Operations Section
  failedSection: {
    marginBottom: 20,
  },
  failedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  failedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  failedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.error,
  },
  failedClearBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
  },
  failedCard: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 8,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  failedCardStrip: {
    width: 4,
  },
  failedCardContent: {
    flex: 1,
    padding: 12,
  },
  failedCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  failedCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedCardInfo: {
    flex: 1,
  },
  failedCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  failedCardOpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  failedCardTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  failedCardTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  retryCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  retryCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.textMuted,
  },
  failedCardItemName: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 1,
  },
  failedCardDate: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 1,
  },
  failedCardError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: theme.error + '08',
    borderRadius: theme.borderRadius.sm,
    padding: 8,
    marginBottom: 8,
  },
  failedCardErrorText: {
    flex: 1,
    fontSize: 11,
    color: theme.error,
    lineHeight: 16,
  },
  failedCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  failedCardRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
  },
  failedCardRetryBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.5,
  },
  failedCardRetryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  failedCardRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.error,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    marginTop: 4,
  },
  retryAllBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.6,
  },
  retryAllBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  clearBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.error,
  },
  // Entry Card
  entryCard: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 10,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  statusStrip: {
    width: 4,
  },
  entryContent: {
    flex: 1,
    padding: 14,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  entryDuration: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: '500',
  },
  entryStats: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  entryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  entryStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  entryStatLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  errorsContainer: {
    marginTop: 10,
    backgroundColor: theme.error + '08',
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    gap: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: theme.error,
  },
  moreErrors: {
    fontSize: 11,
    color: theme.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
});
