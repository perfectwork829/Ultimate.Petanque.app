import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppActions } from '@/contexts/AppContext';
import { getMergeLogs, undoMerge, isUndoable, getUndoTimeRemaining, deleteMergeLog, MergeLog } from '@/services/mergeHistoryService';

type FilterType = 'all' | 'player' | 'club' | 'terrain' | 'tournament';

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  player: { icon: 'person', color: '#4F46E5' },
  club: { icon: 'home', color: '#F97316' },
  terrain: { icon: 'sports-soccer', color: '#22C55E' },
  tournament: { icon: 'emoji-events', color: '#EAB308' },
};

export default function MergeHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { refreshData } = useAppActions();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const [logs, setLogs] = useState<MergeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    const { logs: fetched } = await getMergeLogs();
    setLogs(fetched);
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadLogs();
      setLoading(false);
    };
    init();
  }, [loadLogs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  }, [loadLogs]);

  const handleUndo = useCallback(async (log: MergeLog) => {
    setUndoingId(log.id);
    const { error } = await undoMerge(log);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshData();
    }
    setLogs(prev => prev.filter(l => l.id !== log.id));
    setUndoingId(null);
  }, [refreshData]);

  const handleDelete = useCallback(async (logId: string) => {
    Haptics.selectionAsync();
    await deleteMergeLog(logId);
    setLogs(prev => prev.filter(l => l.id !== logId));
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = logs.length;
    const undoable = logs.filter(isUndoable).length;
    const expired = total - undoable;
    const totalRelations = logs.reduce((sum, l) => sum + (l.reassignedRelations?.length || 0), 0);
    const byType: Record<string, number> = {};
    logs.forEach(l => { byType[l.mergeType] = (byType[l.mergeType] || 0) + 1; });
    return { total, undoable, expired, totalRelations, byType };
  }, [logs]);

  // Filtered + searched
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter !== 'all') {
      result = result.filter(l => l.mergeType === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(l =>
        l.sourceName.toLowerCase().includes(q) ||
        l.targetName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, filter, search]);

  const FILTERS: { id: FilterType; label: string; icon: string; color: string }[] = useMemo(() => [
    { id: 'all', label: t('common', 'all'), icon: 'layers', color: theme.primary },
    { id: 'player', label: t('directory', 'players'), icon: 'person', color: TYPE_CONFIG.player.color },
    { id: 'club', label: t('directory', 'clubs'), icon: 'home', color: TYPE_CONFIG.club.color },
    { id: 'terrain', label: t('directory', 'terrains'), icon: 'sports-soccer', color: TYPE_CONFIG.terrain.color },
    { id: 'tournament', label: t('directory', 'tournaments'), icon: 'emoji-events', color: TYPE_CONFIG.tournament.color },
  ], [language]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mergeHistory', 'title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mergeHistory', 'title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
      >
        {/* Stats Cards */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="merge-type" size={20} color={theme.primary} />
            </View>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>{t('mergeHistory', 'totalMerges')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: theme.warning + '15' }]}>
              <MaterialIcons name="undo" size={20} color={theme.warning} />
            </View>
            <Text style={styles.statValue}>{stats.undoable}</Text>
            <Text style={styles.statLabel}>{t('mergeHistory', 'undoableCount')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: theme.success + '15' }]}>
              <MaterialIcons name="link" size={20} color={theme.success} />
            </View>
            <Text style={styles.statValue}>{stats.totalRelations}</Text>
            <Text style={styles.statLabel}>{t('mergeHistory', 'relationsReassigned')}</Text>
          </View>
        </Animated.View>

        {/* Type breakdown */}
        {stats.total > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.breakdownRow}>
            {Object.entries(stats.byType).map(([type, count]) => {
              const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.player;
              return (
                <Pressable
                  key={type}
                  style={[styles.breakdownChip, filter === type && { backgroundColor: cfg.color + '20', borderColor: cfg.color }]}
                  onPress={() => { Haptics.selectionAsync(); setFilter(filter === type ? 'all' : type as FilterType); }}
                >
                  <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                  <Text style={[styles.breakdownChipText, { color: cfg.color }]}>{count}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}

        {/* Search */}
        <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('mergeHistory', 'searchPlaceholder')}
            placeholderTextColor={theme.textMuted}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </Animated.View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {FILTERS.map(f => {
            const isActive = filter === f.id;
            return (
              <Pressable
                key={f.id}
                style={[styles.filterChip, isActive && { backgroundColor: f.color }]}
                onPress={() => { Haptics.selectionAsync(); setFilter(f.id); }}
              >
                <MaterialIcons name={f.icon as any} size={14} color={isActive ? '#FFF' : theme.textSecondary} />
                <Text style={[styles.filterChipText, isActive && { color: '#FFF' }]}>{f.label}</Text>
                {f.id !== 'all' && stats.byType[f.id] ? (
                  <View style={[styles.filterChipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={[styles.filterChipBadgeText, isActive && { color: '#FFF' }]}>{stats.byType[f.id]}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Results count */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {filteredLogs.length} {filteredLogs.length !== 1 ? t('mergeHistory', 'mergesPlural') : t('mergeHistory', 'mergeSingular')}
          </Text>
        </View>

        {/* Log cards */}
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, idx) => {
            const cfg = TYPE_CONFIG[log.mergeType] || TYPE_CONFIG.player;
            const canUndo = isUndoable(log);
            const timeLeft = canUndo ? getUndoTimeRemaining(log, language as 'fr' | 'en') : '';
            return (
              <Animated.View key={log.id} entering={FadeInDown.duration(250).delay(idx * 40)} style={styles.logCard}>
                {/* Card header */}
                <View style={styles.logCardHeader}>
                  <View style={[styles.logTypeIcon, { backgroundColor: cfg.color + '15' }]}>
                    <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
                  </View>
                  <View style={styles.logCardHeaderInfo}>
                    <Text style={styles.logCardDate}>
                      {new Date(log.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {canUndo ? (
                      <View style={styles.undoableBadge}>
                        <MaterialIcons name="timer" size={10} color={theme.warning} />
                        <Text style={styles.undoableBadgeText}>{timeLeft}</Text>
                      </View>
                    ) : (
                      <View style={styles.expiredBadge}>
                        <MaterialIcons name="lock-clock" size={10} color={theme.textMuted} />
                        <Text style={styles.expiredBadgeText}>{t('directory', 'mergeUndoExpired')}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable style={styles.logDeleteBtn} onPress={() => handleDelete(log.id)} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={theme.textMuted} />
                  </Pressable>
                </View>

                {/* Merge visualization */}
                <View style={styles.mergeViz}>
                  <View style={styles.mergeVizItem}>
                    <MaterialIcons name="delete-outline" size={14} color={theme.error} />
                    <Text style={styles.mergeVizSourceName} numberOfLines={1}>{log.sourceName}</Text>
                  </View>
                  <View style={styles.mergeVizArrow}>
                    <MaterialIcons name="arrow-forward" size={16} color={theme.textMuted} />
                  </View>
                  <View style={styles.mergeVizItem}>
                    <MaterialIcons name="check-circle" size={14} color={theme.success} />
                    <Text style={styles.mergeVizTargetName} numberOfLines={1}>{log.targetName}</Text>
                  </View>
                </View>

                {/* Relations info */}
                {log.reassignedRelations.length > 0 ? (
                  <View style={styles.relationsInfo}>
                    <MaterialIcons name="link" size={14} color={theme.textSecondary} />
                    <Text style={styles.relationsInfoText}>
                      {log.reassignedRelations.length} {t('directory', 'mergeRelationsCount')}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                {canUndo ? (
                  <View style={styles.logActions}>
                    <Pressable
                      style={styles.undoBtn}
                      disabled={undoingId === log.id}
                      onPress={() => handleUndo(log)}
                    >
                      {undoingId === log.id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <>
                          <MaterialIcons name="undo" size={16} color="#FFF" />
                          <Text style={styles.undoBtnText}>{t('directory', 'mergeUndoBtn')}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </Animated.View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="check-circle" size={56} color={theme.success} />
            </View>
            <Text style={styles.emptyTitle}>
              {search.trim() || filter !== 'all'
                ? t('common', 'noResults')
                : t('directory', 'mergeHistoryEmpty')}
            </Text>
            <Text style={styles.emptyText}>
              {search.trim() || filter !== 'all'
                ? t('mergeHistory', 'tryOtherFilters')
                : t('directory', 'mergeHistoryEmptyDesc')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  scrollView: { flex: 1 },
  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 14, alignItems: 'center', ...theme.shadows.card,
  },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', color: theme.textSecondary, marginTop: 2, textAlign: 'center' },
  // Breakdown
  breakdownRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  breakdownChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.full,
    borderWidth: 1.5, borderColor: 'transparent', ...theme.shadows.card,
  },
  breakdownChipText: { fontSize: 14, fontWeight: '700' },
  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md, paddingHorizontal: 14, height: 44, gap: 10,
    marginBottom: 12, ...theme.shadows.card,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.textPrimary },
  // Filters
  filtersRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.borderRadius.full, backgroundColor: theme.surface,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterChipBadge: {
    backgroundColor: theme.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: theme.borderRadius.full,
  },
  filterChipBadgeText: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },
  // Results
  resultsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  resultsCount: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  // Log cards
  logCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16,
    marginBottom: 12, ...theme.shadows.card,
  },
  logCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logTypeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logCardHeaderInfo: { flex: 1, marginLeft: 12 },
  logCardDate: { fontSize: 13, fontWeight: '500', color: theme.textPrimary },
  undoableBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
    backgroundColor: theme.warning + '10', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: theme.borderRadius.full, alignSelf: 'flex-start',
  },
  undoableBadgeText: { fontSize: 10, fontWeight: '600', color: theme.warning },
  expiredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
    backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: theme.borderRadius.full, alignSelf: 'flex-start',
  },
  expiredBadgeText: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  logDeleteBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: theme.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  // Merge visualization
  mergeViz: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12,
  },
  mergeVizItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mergeVizArrow: { width: 24, alignItems: 'center' },
  mergeVizSourceName: { fontSize: 13, fontWeight: '600', color: theme.error, flex: 1 },
  mergeVizTargetName: { fontSize: 13, fontWeight: '600', color: theme.success, flex: 1 },
  // Relations
  relationsInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border,
  },
  relationsInfoText: { fontSize: 12, color: theme.textSecondary },
  // Actions
  logActions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.error, paddingVertical: 10, borderRadius: theme.borderRadius.md,
  },
  undoBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: theme.success + '10',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
});
