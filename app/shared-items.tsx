import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import theme from '@/constants/theme';
import {
  getMySharedItems,
  getSharedWithMe,
  revokeShare,
  updateSharePermission,
  fetchItemName,
  saveSharedItemToMyAccount,
  getShareNotifications,
  getMyShareViewStats,
  getShareAccessLogs,
  extendShareExpiration,
  regenerateShareCode,
  getShareAnalyticsData,
  SharedItem,
  ShareItemType,
  SharePermission,
  ShareNotification,
  ShareViewStats,
  ShareAccessLog,
  ShareAnalyticsData,
} from '@/services/shareService';
import { useAlert } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';

const ALL_TYPES: ShareItemType[] = ['player', 'club', 'terrain', 'tournament', 'match', 'challenge'];

const TYPE_ICON: Record<ShareItemType, string> = {
  player: 'person',
  club: 'home',
  terrain: 'landscape',
  tournament: 'emoji-events',
  match: 'sports',
  challenge: 'flag',
};

const TYPE_COLOR: Record<ShareItemType, string> = {
  player: theme.primary,
  club: theme.accent,
  terrain: theme.success,
  tournament: theme.carreauColor,
  match: theme.tirColor,
  challenge: theme.warning,
};

const TYPE_LABEL_KEY: Record<ShareItemType, string> = {
  player: 'playerLabel',
  club: 'clubLabel',
  terrain: 'terrainLabel',
  tournament: 'tournamentLabel',
  match: 'matchLabel',
  challenge: 'challengeLabel',
};

const TYPE_FILTER_KEY: Record<string, string> = {
  all: 'filterAll',
  player: 'filterPlayer',
  club: 'filterClub',
  terrain: 'filterTerrain',
  tournament: 'filterTournament',
  match: 'filterMatch',
  challenge: 'filterChallenge',
};

const ROUTE_MAP: Record<ShareItemType, string> = {
  player: '/player/',
  club: '/club/',
  terrain: '/terrain/',
  tournament: '/tournament/',
  match: '/match/',
  challenge: '',
};

type Tab = 'shared_by_me' | 'shared_with_me';
type FilterType = 'all' | ShareItemType;

interface EnrichedSharedItem extends SharedItem {
  itemName: string;
  accessorNames?: string[];
  viewStats?: ShareViewStats;
}

export default function SharedItemsScreen() {
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('shared_by_me');
  const [myShares, setMyShares] = useState<EnrichedSharedItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<EnrichedSharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [viewStats, setViewStats] = useState<Record<string, ShareViewStats>>({});
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [accessLogs, setAccessLogs] = useState<ShareAccessLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ShareAnalyticsData | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enrichItems = useCallback(async (items: SharedItem[], notifications?: ShareNotification[]): Promise<EnrichedSharedItem[]> => {
    const enriched: EnrichedSharedItem[] = [];
    const nameCache: Record<string, string> = {};
    for (const item of items) {
      const key = `${item.itemType}_${item.itemId}`;
      if (!nameCache[key]) {
        nameCache[key] = await fetchItemName(item.itemType, item.itemId);
      }
      // Find who used this share code
      const accessorNames: string[] = [];
      if (notifications) {
        const relatedNotifs = notifications.filter(
          n => n.itemType === item.itemType && n.itemId === item.itemId
        );
        relatedNotifs.forEach(n => {
          if (n.accessorName && !accessorNames.includes(n.accessorName)) {
            accessorNames.push(n.accessorName);
          }
        });
      }
      enriched.push({ ...item, itemName: nameCache[key], accessorNames });
    }
    return enriched;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [myResult, withMeResult, notifsResult] = await Promise.all([
        getMySharedItems(),
        getSharedWithMe(),
        getShareNotifications(),
      ]);

      const notifications = notifsResult.error ? [] : notifsResult.notifications;

      // Load view stats
      const viewStatsResult = await getMyShareViewStats();
      if (!viewStatsResult.error) setViewStats(viewStatsResult.stats);

      // Load analytics
      const analyticsResult = await getShareAnalyticsData(language);
      if (!analyticsResult.error && analyticsResult.data) setAnalyticsData(analyticsResult.data);

      if (!myResult.error) {
        const enrichedMy = await enrichItems(myResult.items, notifications);
        // Attach view stats
        enrichedMy.forEach(item => {
          if (viewStatsResult.stats[item.id]) {
            item.viewStats = viewStatsResult.stats[item.id];
          }
        });
        setMyShares(enrichedMy);
      }
      if (!withMeResult.error) {
        const enrichedWithMe = await enrichItems(withMeResult.items);
        setSharedWithMe(enrichedWithMe);
      }
    } catch (e) {
      console.log('Error loading shared items:', e);
    }
  }, [enrichItems]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    };
    init();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleToggleAccessLog = useCallback(async (sharedItemId: string) => {
    if (expandedLogId === sharedItemId) {
      setExpandedLogId(null);
      setAccessLogs([]);
      return;
    }
    setExpandedLogId(sharedItemId);
    setLogsLoading(true);
    const { logs } = await getShareAccessLogs(sharedItemId);
    setAccessLogs(logs);
    setLogsLoading(false);
  }, [expandedLogId]);

  const handleCopyCode = useCallback(async (code: string, id: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleRevoke = useCallback((item: EnrichedSharedItem) => {
    Alert.alert(
      t('share', 'revokeShare'),
      `${t('share', 'revokeShareMsg')} "${item.itemName}" ${t('share', 'revokeShareMsgEnd')}`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('share', 'revoke'),
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const { error } = await revokeShare(item.id);
            if (error) {
              showAlert(t('common', 'error'), error);
            } else {
              setMyShares(prev => prev.filter(s => s.id !== item.id));
            }
          },
        },
      ]
    );
  }, [showAlert, t]);

  const handleTogglePermission = useCallback(async (item: EnrichedSharedItem) => {
    const newPermission: SharePermission = item.permission === 'read' ? 'write' : 'read';
    const label = newPermission === 'read' ? t('share', 'readOnlyLabel') : t('share', 'readWriteLabel');

    Haptics.selectionAsync();
    const { error } = await updateSharePermission(item.id, newPermission);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      setMyShares(prev =>
        prev.map(s => (s.id === item.id ? { ...s, permission: newPermission } : s))
      );
      showAlert(t('share', 'permissionChanged'), `${t('share', 'nowIn')} "${label}"`);
    }
  }, [showAlert, t]);

  const handleNavigate = useCallback((itemType: ShareItemType, itemId: string) => {
    if (!ROUTE_MAP[itemType]) return;
    Haptics.selectionAsync();
    router.push(`${ROUTE_MAP[itemType]}${itemId}` as any);
  }, []);

  const handleRemoveSharedWithMe = useCallback((item: EnrichedSharedItem) => {
    Alert.alert(
      t('share', 'removeShare'),
      `${t('share', 'removeShareMsg')} "${item.itemName}" ?`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('share', 'removeLabel'),
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const { error } = await revokeShare(item.id);
            if (error) {
              showAlert(t('common', 'error'), error);
            } else {
              setSharedWithMe(prev => prev.filter(s => s.id !== item.id));
            }
          },
        },
      ]
    );
  }, [showAlert, t]);

  const handleSaveToMyAccount = useCallback(async (item: EnrichedSharedItem) => {
    Haptics.selectionAsync();
    const isMatchOrChallenge = item.itemType === 'match' || item.itemType === 'challenge';
    const { newItemId, error } = await saveSharedItemToMyAccount(item.itemType, item.itemId);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('share', 'saved'), isMatchOrChallenge ? t('share', 'importedToAccount') : `"${item.itemName}" ${t('share', 'copiedToDirectory')}`);
      if (newItemId && ROUTE_MAP[item.itemType]) {
        handleNavigate(item.itemType, newItemId);
      }
    }
  }, [showAlert, handleNavigate, t]);

  // Current items based on tab
  const allCurrentItems = activeTab === 'shared_by_me' ? myShares : sharedWithMe;

  // Available types for filter chips
  const availableTypes = useMemo(() => {
    const types = new Set<ShareItemType>();
    allCurrentItems.forEach(item => types.add(item.itemType));
    return Array.from(types);
  }, [allCurrentItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return allCurrentItems;
    return allCurrentItems.filter(item => item.itemType === activeFilter);
  }, [allCurrentItems, activeFilter]);

  // Group items by type
  const groupedItems = useMemo(() => {
    const groups: Record<ShareItemType, EnrichedSharedItem[]> = {
      player: [], club: [], terrain: [], tournament: [], match: [], challenge: [],
    };
    filteredItems.forEach(item => {
      groups[item.itemType].push(item);
    });
    return ALL_TYPES.filter(type => groups[type].length > 0).map(type => ({
      type,
      items: groups[type],
    }));
  }, [filteredItems]);

  // Stats per type
  const typeStats = useMemo(() => {
    const stats: Record<ShareItemType, number> = {
      player: 0, club: 0, terrain: 0, tournament: 0, match: 0, challenge: 0,
    };
    allCurrentItems.forEach(item => { stats[item.itemType]++; });
    return stats;
  }, [allCurrentItems]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }, [language]);

  // Compute expiration status for a shared item
  const getExpirationStatus = useCallback((item: EnrichedSharedItem): { status: 'permanent' | 'active' | 'expiring' | 'expired'; label: string; color: string; daysLeft?: number } => {
    if (!item.expiresAt) return { status: 'permanent', label: t('shareModal', 'expirationPermanent'), color: theme.success };
    const now = Date.now();
    const exp = new Date(item.expiresAt).getTime();
    const diff = exp - now;
    if (diff <= 0) return { status: 'expired', label: t('shareModal', 'expirationExpired'), color: theme.error };
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (daysLeft <= 2) return { status: 'expiring', label: t('shareModal', 'expirationExpiringSoon'), color: theme.warning, daysLeft };
    return { status: 'active', label: t('shareModal', 'expirationActive'), color: theme.primary, daysLeft };
  }, [t]);

  // Extend expiration handler
  const handleExtendExpiration = useCallback((item: EnrichedSharedItem) => {
    Haptics.selectionAsync();
    Alert.alert(
      t('shareModal', 'selectNewExpiration'),
      '',
      [
        { text: t('shareModal', 'extendTo1Day'), onPress: async () => {
          const d = new Date(); d.setDate(d.getDate() + 1);
          const { error } = await extendShareExpiration(item.id, d.toISOString());
          if (error) { showAlert(t('common', 'error'), error); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('shareModal', 'extendSuccess')); await loadData(); }
        }},
        { text: t('shareModal', 'extendTo1Week'), onPress: async () => {
          const d = new Date(); d.setDate(d.getDate() + 7);
          const { error } = await extendShareExpiration(item.id, d.toISOString());
          if (error) { showAlert(t('common', 'error'), error); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('shareModal', 'extendSuccess')); await loadData(); }
        }},
        { text: t('shareModal', 'extendTo1Month'), onPress: async () => {
          const d = new Date(); d.setMonth(d.getMonth() + 1);
          const { error } = await extendShareExpiration(item.id, d.toISOString());
          if (error) { showAlert(t('common', 'error'), error); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('shareModal', 'extendSuccess')); await loadData(); }
        }},
        { text: t('shareModal', 'extendMakePermanent'), onPress: async () => {
          const { error } = await extendShareExpiration(item.id, null);
          if (error) { showAlert(t('common', 'error'), error); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('shareModal', 'extendSuccess')); await loadData(); }
        }},
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  }, [showAlert, t, loadData]);

  // Regenerate expired code handler
  const handleRegenerateCode = useCallback((item: EnrichedSharedItem) => {
    Alert.alert(
      t('shareModal', 'regenerateConfirmTitle'),
      t('shareModal', 'regenerateConfirmMsg'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('shareModal', 'regenerateCode'), style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // Regenerate with 1 week expiration by default
          const d = new Date(); d.setDate(d.getDate() + 7);
          const { newShareCode, error } = await regenerateShareCode(item.id, d.toISOString());
          if (error) { showAlert(t('common', 'error'), error); }
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert(t('shareModal', 'regenerateSuccess'), `${t('shareModal', 'codeRegeneratedNew')} ${newShareCode}`);
            await loadData();
          }
        }},
      ]
    );
  }, [showAlert, t, loadData]);

  // Select mode handlers
  const toggleSelectMode = useCallback(() => {
    Haptics.selectionAsync();
    if (isSelectMode) {
      setIsSelectMode(false);
      setSelectedIds(new Set());
    } else {
      setIsSelectMode(true);
      setSelectedIds(new Set());
    }
  }, [isSelectMode]);

  const toggleItemSelection = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    Haptics.selectionAsync();
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(item => item.id)));
    }
  }, [filteredItems, selectedIds.size]);

  const handleBulkRevoke = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      t('shareModal', 'bulkRevokeConfirmTitle'),
      `${count} ${t('shareModal', 'bulkRevokeConfirmMsg')}`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('shareModal', 'bulkRevoke'), style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          let revokedCount = 0;
          for (const id of selectedIds) {
            const { error } = await revokeShare(id);
            if (!error) revokedCount++;
          }
          setMyShares(prev => prev.filter(s => !selectedIds.has(s.id)));
          setSelectedIds(new Set());
          setIsSelectMode(false);
          showAlert(`${revokedCount} ${t('shareModal', 'bulkRevokeSuccess')}`);
        }},
      ]
    );
  }, [selectedIds, showAlert, t]);

  const handleBulkExtend = useCallback(() => {
    Haptics.selectionAsync();
    Alert.alert(
      t('shareModal', 'selectNewExpiration'),
      '',
      [
        { text: t('shareModal', 'extendTo1Day'), onPress: () => doBulkExtend(1) },
        { text: t('shareModal', 'extendTo1Week'), onPress: () => doBulkExtend(7) },
        { text: t('shareModal', 'extendTo1Month'), onPress: () => doBulkExtend(30) },
        { text: t('shareModal', 'extendMakePermanent'), onPress: () => doBulkExtend(0) },
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  }, [selectedIds, t]);

  const doBulkExtend = useCallback(async (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let count = 0;
    for (const id of selectedIds) {
      let expiresAt: string | null = null;
      if (days > 0) {
        const d = new Date();
        if (days === 30) d.setMonth(d.getMonth() + 1);
        else d.setDate(d.getDate() + days);
        expiresAt = d.toISOString();
      }
      const { error } = await extendShareExpiration(id, expiresAt);
      if (!error) count++;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(`${count} ${t('shareModal', 'bulkExtendSuccess')}`);
    setSelectedIds(new Set());
    setIsSelectMode(false);
    await loadData();
  }, [selectedIds, showAlert, t, loadData]);

  const handleBulkRegenerate = useCallback(() => {
    Alert.alert(
      t('shareModal', 'regenerateConfirmTitle'),
      t('shareModal', 'regenerateConfirmMsg'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('shareModal', 'regenerateCode'), style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          let count = 0;
          for (const id of selectedIds) {
            const d = new Date(); d.setDate(d.getDate() + 7);
            const { error } = await regenerateShareCode(id, d.toISOString());
            if (!error) count++;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showAlert(`${count} ${t('shareModal', 'bulkRegenerateSuccess')}`);
          setSelectedIds(new Set());
          setIsSelectMode(false);
          await loadData();
        }},
      ]
    );
  }, [selectedIds, showAlert, t, loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('share', 'shareManagement')}</Text>
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
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('share', 'shareManagement')}</Text>
        {activeTab === 'shared_by_me' && myShares.length > 0 ? (
          <Pressable style={[styles.backBtn, isSelectMode && { backgroundColor: theme.primary + '15', borderRadius: 20 }]} onPress={toggleSelectMode}>
            <MaterialIcons name={isSelectMode ? 'close' : 'checklist'} size={22} color={isSelectMode ? theme.primary : theme.textSecondary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'shared_by_me' && styles.tabActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('shared_by_me'); setActiveFilter('all'); setIsSelectMode(false); setSelectedIds(new Set()); }}
        >
          <MaterialIcons name="upload" size={18} color={activeTab === 'shared_by_me' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'shared_by_me' && styles.tabTextActive]}>{t('share', 'myShares')}</Text>
          {myShares.length > 0 ? (
            <View style={[styles.tabBadge, activeTab === 'shared_by_me' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'shared_by_me' && styles.tabBadgeTextActive]}>{myShares.length}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'shared_with_me' && styles.tabActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('shared_with_me'); setActiveFilter('all'); setIsSelectMode(false); setSelectedIds(new Set()); }}
        >
          <MaterialIcons name="download" size={18} color={activeTab === 'shared_with_me' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'shared_with_me' && styles.tabTextActive]}>{t('share', 'received')}</Text>
          {sharedWithMe.length > 0 ? (
            <View style={[styles.tabBadge, activeTab === 'shared_with_me' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'shared_with_me' && styles.tabBadgeTextActive]}>{sharedWithMe.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
        }
      >
        {/* Analytics Section */}
        {activeTab === 'shared_by_me' && myShares.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.analyticsSection}>
            <Pressable
              style={styles.analyticsToggle}
              onPress={() => { Haptics.selectionAsync(); setShowAnalytics(!showAnalytics); }}
            >
              <View style={styles.analyticsToggleLeft}>
                <View style={styles.analyticsIconBg}>
                  <MaterialIcons name="insights" size={18} color={theme.primary} />
                </View>
                <Text style={styles.analyticsToggleTitle}>{t('shareModal', 'analyticsTitle')}</Text>
                {analyticsData && analyticsData.totalViews > 0 ? (
                  <View style={styles.analyticsMiniStat}>
                    <Text style={styles.analyticsMiniStatText}>{analyticsData.totalViews}</Text>
                  </View>
                ) : null}
              </View>
              <MaterialIcons name={showAnalytics ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
            </Pressable>

            {showAnalytics ? (
              analyticsData && analyticsData.totalViews > 0 ? (
                <View style={styles.analyticsContent}>
                  {/* Summary Stats */}
                  <View style={styles.analyticsSummaryRow}>
                    <View style={styles.analyticsSummaryChip}>
                      <MaterialIcons name="visibility" size={14} color={theme.primary} />
                      <Text style={styles.analyticsSummaryValue}>{analyticsData.totalViews}</Text>
                      <Text style={styles.analyticsSummaryLabel}>{t('shareModal', 'analyticsTotalViews')}</Text>
                    </View>
                    <View style={styles.analyticsSummaryChip}>
                      <MaterialIcons name="person" size={14} color={theme.accent} />
                      <Text style={[styles.analyticsSummaryValue, { color: theme.accent }]}>{analyticsData.totalUniqueViewers}</Text>
                      <Text style={styles.analyticsSummaryLabel}>{t('shareModal', 'analyticsUniqueViewers')}</Text>
                    </View>
                  </View>

                  {/* Views per Day Chart */}
                  {analyticsData.viewsByDay.some(d => d.count > 0) ? (
                    <View style={styles.chartSection}>
                      <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>{t('shareModal', 'analyticsViewsTimeline')}</Text>
                        <Text style={styles.chartSubtitle}>{t('shareModal', 'analyticsLast7Days')}</Text>
                      </View>
                      <View style={styles.chartBarsContainer}>
                        {(() => {
                          const maxCount = Math.max(...analyticsData.viewsByDay.map(d => d.count), 1);
                          return analyticsData.viewsByDay.map((day, i) => {
                            const barH = Math.max((day.count / maxCount) * 72, 3);
                            const isToday = i === analyticsData.viewsByDay.length - 1;
                            return (
                              <View key={i} style={styles.chartBarCol}>
                                {day.count > 0 ? <Text style={styles.chartBarValue}>{day.count}</Text> : null}
                                <View style={[styles.chartBar, { height: barH, backgroundColor: isToday ? theme.primary : theme.primary + '60' }]} />
                                <Text style={[styles.chartBarLabel, isToday && { color: theme.primary, fontWeight: '700' }]}>{day.label}</Text>
                              </View>
                            );
                          });
                        })()}
                      </View>
                    </View>
                  ) : null}

                  {/* Top Items */}
                  {analyticsData.topItems.length > 0 ? (
                    <View style={styles.chartSection}>
                      <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>{t('shareModal', 'analyticsTopItems')}</Text>
                      </View>
                      <View style={styles.topItemsList}>
                        {(() => {
                          const maxViews = Math.max(...analyticsData.topItems.map(i => i.viewCount), 1);
                          return analyticsData.topItems.map((item, i) => {
                            const barW = Math.max((item.viewCount / maxViews) * 100, 8);
                            const color = TYPE_COLOR[item.itemType] || theme.primary;
                            return (
                              <View key={i} style={styles.topItemRow}>
                                <View style={styles.topItemRank}>
                                  <Text style={[styles.topItemRankText, { color }]}>#{i + 1}</Text>
                                </View>
                                <View style={styles.topItemInfo}>
                                  <View style={styles.topItemNameRow}>
                                    <MaterialIcons name={TYPE_ICON[item.itemType] as any} size={12} color={color} />
                                    <Text style={styles.topItemName} numberOfLines={1}>{item.itemName}</Text>
                                  </View>
                                  <View style={styles.topItemBarTrack}>
                                    <View style={[styles.topItemBarFill, { width: `${barW}%`, backgroundColor: color + '40' }]} />
                                  </View>
                                </View>
                                <Text style={[styles.topItemCount, { color }]}>{item.viewCount}</Text>
                              </View>
                            );
                          });
                        })()}
                      </View>
                    </View>
                  ) : null}

                  {/* Peak Hours */}
                  {analyticsData.peakHours.some(h => h.count > 0) ? (
                    <View style={styles.chartSection}>
                      <View style={styles.chartHeader}>
                        <Text style={styles.chartTitle}>{t('shareModal', 'analyticsPeakHours')}</Text>
                        <Text style={styles.chartSubtitle}>{t('shareModal', 'analyticsLast30Days')}</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peakHoursScroll}>
                        {(() => {
                          const grouped = [
                            { label: '0-2', count: analyticsData.peakHours.slice(0, 3).reduce((s, h) => s + h.count, 0) },
                            { label: '3-5', count: analyticsData.peakHours.slice(3, 6).reduce((s, h) => s + h.count, 0) },
                            { label: '6-8', count: analyticsData.peakHours.slice(6, 9).reduce((s, h) => s + h.count, 0) },
                            { label: '9-11', count: analyticsData.peakHours.slice(9, 12).reduce((s, h) => s + h.count, 0) },
                            { label: '12-14', count: analyticsData.peakHours.slice(12, 15).reduce((s, h) => s + h.count, 0) },
                            { label: '15-17', count: analyticsData.peakHours.slice(15, 18).reduce((s, h) => s + h.count, 0) },
                            { label: '18-20', count: analyticsData.peakHours.slice(18, 21).reduce((s, h) => s + h.count, 0) },
                            { label: '21-23', count: analyticsData.peakHours.slice(21, 24).reduce((s, h) => s + h.count, 0) },
                          ];
                          const maxC = Math.max(...grouped.map(g => g.count), 1);
                          const peakIdx = grouped.reduce((pI, g, i) => g.count > grouped[pI].count ? i : pI, 0);
                          return grouped.map((g, i) => {
                            const barH = Math.max((g.count / maxC) * 56, 3);
                            const isPeak = i === peakIdx && g.count > 0;
                            return (
                              <View key={i} style={styles.peakHourCol}>
                                {g.count > 0 ? <Text style={[styles.peakHourValue, isPeak && { color: theme.warning, fontWeight: '800' }]}>{g.count}</Text> : null}
                                <View style={[styles.peakHourBar, { height: barH, backgroundColor: isPeak ? theme.warning : theme.accent + '50' }]} />
                                <Text style={[styles.peakHourLabel, isPeak && { color: theme.warning, fontWeight: '700' }]}>{g.label}</Text>
                              </View>
                            );
                          });
                        })()}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.analyticsEmptyState}>
                  <MaterialIcons name="bar-chart" size={32} color={theme.textMuted} />
                  <Text style={styles.analyticsEmptyText}>{t('shareModal', 'analyticsNoData')}</Text>
                </View>
              )
            ) : null}
          </Animated.View>
        ) : null}

        {/* Type Stats Summary */}
        {allCurrentItems.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.statsGrid}>
            {ALL_TYPES.filter(type => typeStats[type] > 0).map(type => {
              const color = TYPE_COLOR[type];
              const icon = TYPE_ICON[type];
              return (
                <Pressable
                  key={type}
                  style={[styles.statChip, activeFilter === type && { borderColor: color, backgroundColor: color + '10' }]}
                  onPress={() => { Haptics.selectionAsync(); setActiveFilter(activeFilter === type ? 'all' : type); }}
                >
                  <View style={[styles.statChipIcon, { backgroundColor: color + '15' }]}>
                    <MaterialIcons name={icon as any} size={16} color={color} />
                  </View>
                  <Text style={[styles.statChipCount, { color }]}>{typeStats[type]}</Text>
                  <Text style={styles.statChipLabel} numberOfLines={1}>{t('share', TYPE_LABEL_KEY[type])}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}

        {/* Filter active indicator */}
        {activeFilter !== 'all' ? (
          <View style={styles.filterActiveRow}>
            <View style={[styles.filterActiveBadge, { backgroundColor: TYPE_COLOR[activeFilter] + '15' }]}>
              <MaterialIcons name={TYPE_ICON[activeFilter] as any} size={14} color={TYPE_COLOR[activeFilter]} />
              <Text style={[styles.filterActiveText, { color: TYPE_COLOR[activeFilter] }]}>
                {t('share', TYPE_FILTER_KEY[activeFilter])} ({filteredItems.length})
              </Text>
            </View>
            <Pressable style={styles.clearFilterBtn} onPress={() => { Haptics.selectionAsync(); setActiveFilter('all'); }}>
              <MaterialIcons name="close" size={16} color={theme.textMuted} />
              <Text style={styles.clearFilterText}>{t('common', 'clear')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Grouped items */}
        {groupedItems.length > 0 ? (
          groupedItems.map((group, groupIdx) => {
            const groupColor = TYPE_COLOR[group.type];
            const groupIcon = TYPE_ICON[group.type];
            return (
              <Animated.View key={group.type} entering={FadeInDown.duration(300).delay(groupIdx * 50)} style={styles.groupSection}>
                {/* Group Header */}
                <View style={styles.groupHeader}>
                  <View style={[styles.groupHeaderIcon, { backgroundColor: groupColor + '15' }]}>
                    <MaterialIcons name={groupIcon as any} size={16} color={groupColor} />
                  </View>
                  <Text style={styles.groupHeaderTitle}>{t('share', TYPE_LABEL_KEY[group.type])}</Text>
                  <View style={[styles.groupHeaderCount, { backgroundColor: groupColor + '12' }]}>
                    <Text style={[styles.groupHeaderCountText, { color: groupColor }]}>{group.items.length}</Text>
                  </View>
                  <View style={[styles.groupHeaderLine, { backgroundColor: groupColor + '20' }]} />
                </View>

                {/* Items */}
                <View style={styles.groupItemsList}>
                  {group.items.map((item, index) => {
                    const color = TYPE_COLOR[item.itemType];
                    const isCopied = copiedId === item.id;
                    const hasAccessors = item.accessorNames && item.accessorNames.length > 0;

                    return (
                      <Animated.View key={item.id} entering={FadeIn.duration(200).delay(index * 30)}>
                        <Pressable
                          style={[styles.itemCard, isSelectMode && activeTab === 'shared_by_me' && selectedIds.has(item.id) && styles.itemCardSelected]}
                          onPress={() => isSelectMode && activeTab === 'shared_by_me' ? toggleItemSelection(item.id) : handleNavigate(item.itemType, item.itemId)}
                          onLongPress={() => { if (activeTab === 'shared_by_me' && !isSelectMode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsSelectMode(true); setSelectedIds(new Set([item.id])); } }}
                        >
                          {/* Selection checkbox */}
                          {isSelectMode && activeTab === 'shared_by_me' ? (
                            <View style={[styles.selectCheckbox, selectedIds.has(item.id) && styles.selectCheckboxActive]}>
                              {selectedIds.has(item.id) ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                            </View>
                          ) : null}
                          {/* Left accent */}
                          <View style={[styles.itemAccent, { backgroundColor: color }]} />

                          <View style={styles.itemBody}>
                            {/* Top row: name + actions */}
                            <View style={styles.itemTopRow}>
                              <View style={styles.itemNameGroup}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
                                <View style={styles.itemBadges}>
                                  <View style={[styles.itemPermBadge, { backgroundColor: item.permission === 'read' ? theme.primary + '12' : theme.accent + '12' }]}>
                                    <MaterialIcons
                                      name={item.permission === 'read' ? 'visibility' : 'edit'}
                                      size={10}
                                      color={item.permission === 'read' ? theme.primary : theme.accent}
                                    />
                                    <Text style={[styles.itemPermBadgeText, { color: item.permission === 'read' ? theme.primary : theme.accent }]}>
                                      {item.permission === 'read' ? t('share', 'readShort') : t('share', 'editShort')}
                                    </Text>
                                  </View>
                                  <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
                                  {activeTab === 'shared_by_me' ? (() => {
                                    const expStatus = getExpirationStatus(item);
                                    return (
                                      <View style={[styles.expBadge, { backgroundColor: expStatus.color + '12' }]}>
                                        <MaterialIcons
                                          name={expStatus.status === 'permanent' ? 'all-inclusive' : expStatus.status === 'expired' ? 'timer-off' : 'timer'}
                                          size={10}
                                          color={expStatus.color}
                                        />
                                        <Text style={[styles.expBadgeText, { color: expStatus.color }]}>
                                          {expStatus.daysLeft !== undefined ? `${expStatus.daysLeft}${language === 'fr' ? 'j' : 'd'}` : expStatus.label}
                                        </Text>
                                      </View>
                                    );
                                  })() : null}
                                </View>
                              </View>

                              {/* Action buttons */}
                              {activeTab === 'shared_by_me' ? (
                                <View style={styles.itemActions}>
                                  <Pressable style={[styles.actionBtn, isCopied && styles.actionBtnSuccess]} onPress={() => handleCopyCode(item.shareCode, item.id)} hitSlop={4}>
                                    <MaterialIcons name={isCopied ? 'check' : 'content-copy'} size={15} color={isCopied ? theme.success : theme.primary} />
                                  </Pressable>
                                  <Pressable style={styles.actionBtn} onPress={() => handleTogglePermission(item)} hitSlop={4}>
                                    <MaterialIcons name={item.permission === 'read' ? 'lock' : 'lock-open'} size={15} color={theme.warning} />
                                  </Pressable>
                                  {(() => {
                                    const expSt = getExpirationStatus(item);
                                    if (expSt.status === 'expired') return (
                                      <Pressable style={[styles.actionBtn, styles.actionBtnRegen]} onPress={() => handleRegenerateCode(item)} hitSlop={4}>
                                        <MaterialIcons name="refresh" size={15} color={theme.accent} />
                                      </Pressable>
                                    );
                                    return (
                                      <Pressable style={[styles.actionBtn, styles.actionBtnExtend]} onPress={() => handleExtendExpiration(item)} hitSlop={4}>
                                        <MaterialIcons name="update" size={15} color={theme.tirColor} />
                                      </Pressable>
                                    );
                                  })()}
                                  <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleRevoke(item)} hitSlop={4}>
                                    <MaterialIcons name="delete-outline" size={15} color={theme.error} />
                                  </Pressable>
                                </View>
                              ) : (
                                <View style={styles.itemActions}>
                                  <Pressable style={[styles.actionBtn, styles.actionBtnSave]} onPress={() => handleSaveToMyAccount(item)} hitSlop={4}>
                                    <MaterialIcons name="save-alt" size={15} color={theme.accent} />
                                  </Pressable>
                                  <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleRemoveSharedWithMe(item)} hitSlop={4}>
                                    <MaterialIcons name="close" size={15} color={theme.error} />
                                  </Pressable>
                                </View>
                              )}
                            </View>

                            {/* Share code + accessor info + view stats (my shares only) */}
                            {activeTab === 'shared_by_me' ? (
                              <View>
                                <View style={styles.itemBottomRow}>
                                  <View style={styles.codeContainer}>
                                    <MaterialIcons name="vpn-key" size={11} color={getExpirationStatus(item).status === 'expired' ? theme.error : theme.textMuted} />
                                    <Text style={[styles.codeText, getExpirationStatus(item).status === 'expired' && { textDecorationLine: 'line-through', color: theme.error + '80' }]}>{item.shareCode}</Text>
                                  </View>
                                  {hasAccessors ? (
                                    <View style={styles.accessorContainer}>
                                      <MaterialIcons name="people" size={12} color={theme.success} />
                                      <Text style={styles.accessorText} numberOfLines={1}>
                                        {item.accessorNames!.slice(0, 2).join(', ')}
                                        {item.accessorNames!.length > 2 ? ` +${item.accessorNames!.length - 2}` : ''}
                                      </Text>
                                    </View>
                                  ) : (
                                    <View style={styles.accessorContainer}>
                                      <MaterialIcons name="person-off" size={12} color={theme.textMuted} />
                                      <Text style={[styles.accessorText, { color: theme.textMuted }]}>{t('share', 'noOneYet')}</Text>
                                    </View>
                                  )}
                                </View>

                                {/* View Stats Row */}
                                <Pressable
                                  style={styles.viewStatsRow}
                                  onPress={() => { Haptics.selectionAsync(); handleToggleAccessLog(item.id); }}
                                >
                                  <View style={styles.viewStatChip}>
                                    <MaterialIcons name="visibility" size={12} color={item.viewStats ? theme.primary : theme.textMuted} />
                                    <Text style={[styles.viewStatText, item.viewStats ? { color: theme.primary, fontWeight: '700' } : null]}>
                                      {item.viewStats ? item.viewStats.viewCount : 0} {t('shareModal', 'viewsLabel')}
                                    </Text>
                                  </View>
                                  {item.viewStats && item.viewStats.uniqueViewers > 0 ? (
                                    <View style={styles.viewStatChip}>
                                      <MaterialIcons name="person" size={12} color={theme.accent} />
                                      <Text style={[styles.viewStatText, { color: theme.accent }]}>
                                        {item.viewStats.uniqueViewers} {t('shareModal', 'viewersLabel')}
                                      </Text>
                                    </View>
                                  ) : null}
                                  {item.viewStats?.lastViewedAt ? (
                                    <Text style={styles.viewStatDate}>
                                      {formatDate(item.viewStats.lastViewedAt)}
                                    </Text>
                                  ) : (
                                    <Text style={styles.viewStatDate}>{t('shareModal', 'noViewsYet')}</Text>
                                  )}
                                  <MaterialIcons name={expandedLogId === item.id ? 'expand-less' : 'expand-more'} size={16} color={theme.textMuted} />
                                </Pressable>

                                {/* Expanded Access Log */}
                                {expandedLogId === item.id ? (
                                  <View style={styles.accessLogSection}>
                                    <View style={styles.accessLogHeader}>
                                      <MaterialIcons name="history" size={14} color={theme.primary} />
                                      <Text style={styles.accessLogTitle}>{t('shareModal', 'viewAccessLog')}</Text>
                                    </View>
                                    {logsLoading ? (
                                      <ActivityIndicator size="small" color={theme.primary} style={{ paddingVertical: 12 }} />
                                    ) : accessLogs.length > 0 ? (
                                      <View style={styles.accessLogList}>
                                        {accessLogs.slice(0, 10).map((log, logIdx) => {
                                          const isFirst = logIdx === accessLogs.length - 1 || (
                                            logIdx < accessLogs.length - 1 &&
                                            accessLogs.slice(logIdx + 1).every(l => l.viewerId !== log.viewerId)
                                          );
                                          return (
                                            <View key={log.id} style={styles.accessLogRow}>
                                              <View style={[styles.accessLogDot, { backgroundColor: isFirst ? theme.success : theme.primary }]} />
                                              <View style={{ flex: 1 }}>
                                                <Text style={styles.accessLogName}>{log.viewerName || 'User'}</Text>
                                                <Text style={styles.accessLogTime}>
                                                  {new Date(log.viewedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                              </View>
                                              {isFirst ? (
                                                <View style={styles.firstVisitBadge}>
                                                  <Text style={styles.firstVisitText}>{t('shareModal', 'viewedFirstTime')}</Text>
                                                </View>
                                              ) : null}
                                            </View>
                                          );
                                        })}
                                        {accessLogs.length > 10 ? (
                                          <Text style={styles.accessLogMore}>+{accessLogs.length - 10} {t('shareModal', 'totalViews')}</Text>
                                        ) : null}
                                      </View>
                                    ) : (
                                      <Text style={styles.accessLogEmpty}>{t('shareModal', 'noViewsYet')}</Text>
                                    )}
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </Animated.View>
            );
          })
        ) : (
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons
                name={activeTab === 'shared_by_me' ? 'folder-off' : 'person-off'}
                size={56}
                color={theme.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter !== 'all'
                ? t('common', 'noResults')
                : activeTab === 'shared_by_me' ? t('share', 'noActiveShares') : t('share', 'noReceivedCards')}
            </Text>
            <Text style={styles.emptyDesc}>
              {activeFilter !== 'all'
                ? `${t('share', TYPE_FILTER_KEY[activeFilter])} — ${t('statsExtra', 'noItemsFound')}`
                : activeTab === 'shared_by_me'
                  ? t('share', 'noActiveSharesDesc')
                  : t('share', 'noReceivedCardsDesc')}
            </Text>
            {activeFilter !== 'all' ? (
              <Pressable style={styles.resetFilterBtn} onPress={() => setActiveFilter('all')}>
                <MaterialIcons name="refresh" size={16} color="#FFF" />
                <Text style={styles.resetFilterBtnText}>{t('common', 'reset')}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        )}

        {/* Legend */}
        {activeTab === 'shared_by_me' && myShares.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(200)} style={styles.legendCard}>
            <Text style={styles.legendTitle}>{t('share', 'actions')}</Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendIcon, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="content-copy" size={13} color={theme.primary} />
              </View>
              <Text style={styles.legendText}>{t('share', 'copyShareCode')}</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendIcon, { backgroundColor: theme.warning + '15' }]}>
                <MaterialIcons name="lock" size={13} color={theme.warning} />
              </View>
              <Text style={styles.legendText}>{t('share', 'toggleReadWrite')}</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendIcon, { backgroundColor: theme.error + '15' }]}>
                <MaterialIcons name="delete-outline" size={13} color={theme.error} />
              </View>
              <Text style={styles.legendText}>{t('share', 'revokeTheShare')}</Text>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Bulk Actions Floating Bar */}
      {isSelectMode && selectedIds.size > 0 && activeTab === 'shared_by_me' ? (
        <Animated.View entering={FadeInDown.duration(200)} style={[styles.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.bulkBarTop}>
            <Text style={styles.bulkBarCount}>{selectedIds.size} {t('shareModal', 'selectedCount')}</Text>
            <Pressable onPress={handleSelectAll} hitSlop={8}>
              <Text style={styles.bulkBarSelectAll}>{selectedIds.size === filteredItems.length ? t('shareModal', 'bulkDeselectAll') : t('shareModal', 'bulkSelectAll')}</Text>
            </Pressable>
          </View>
          <View style={styles.bulkBarActions}>
            <Pressable style={[styles.bulkBarBtn, styles.bulkBarBtnExtend]} onPress={handleBulkExtend}>
              <MaterialIcons name="update" size={18} color={theme.tirColor} />
              <Text style={[styles.bulkBarBtnText, { color: theme.tirColor }]}>{t('shareModal', 'bulkExtend')}</Text>
            </Pressable>
            <Pressable style={[styles.bulkBarBtn, styles.bulkBarBtnRegen]} onPress={handleBulkRegenerate}>
              <MaterialIcons name="refresh" size={18} color={theme.accent} />
              <Text style={[styles.bulkBarBtnText, { color: theme.accent }]}>{t('shareModal', 'bulkRegenerate')}</Text>
            </Pressable>
            <Pressable style={[styles.bulkBarBtn, styles.bulkBarBtnRevoke]} onPress={handleBulkRevoke}>
              <MaterialIcons name="delete-outline" size={18} color={theme.error} />
              <Text style={[styles.bulkBarBtnText, { color: theme.error }]}>{t('shareModal', 'bulkRevoke')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: theme.surface, paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 4, gap: 8,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: theme.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  tabTextActive: { color: theme.primary },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  tabBadgeActive: { backgroundColor: theme.primary + '15' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  tabBadgeTextActive: { color: theme.primary },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.md,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1.5, borderColor: theme.border,
    ...theme.shadows.card,
  },
  statChipIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  statChipCount: { fontSize: 16, fontWeight: '800' },
  statChipLabel: { fontSize: 12, fontWeight: '500', color: theme.textSecondary },

  // Filter active row
  filterActiveRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.borderRadius.full,
  },
  filterActiveText: { fontSize: 13, fontWeight: '600' },
  clearFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  clearFilterText: { fontSize: 12, fontWeight: '500', color: theme.textMuted },

  // Group section
  groupSection: { marginBottom: 20 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  groupHeaderIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  groupHeaderTitle: {
    fontSize: 13, fontWeight: '700', color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  groupHeaderCount: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  groupHeaderCountText: { fontSize: 11, fontWeight: '700' },
  groupHeaderLine: { flex: 1, height: 1 },

  // Item card
  groupItemsList: { gap: 8 },
  itemCard: {
    flexDirection: 'row', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md, overflow: 'hidden',
    ...theme.shadows.card,
  },
  itemAccent: { width: 4 },
  itemBody: { flex: 1, padding: 12 },
  itemTopRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  itemNameGroup: { flex: 1, marginRight: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  itemBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemPermBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  itemPermBadgeText: { fontSize: 10, fontWeight: '600' },
  itemDate: { fontSize: 11, color: theme.textMuted },
  itemActions: { flexDirection: 'row', gap: 5 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: theme.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnSuccess: { backgroundColor: theme.success + '15' },
  actionBtnDanger: { backgroundColor: theme.error + '10' },
  actionBtnSave: { backgroundColor: theme.accent + '15' },

  // Bottom row (code + accessor)
  itemBottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '60',
  },
  codeContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  codeText: {
    fontSize: 12, fontWeight: '600', color: theme.textMuted, letterSpacing: 1, fontFamily: 'monospace',
  },
  accessorContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    maxWidth: '50%',
  },
  accessorText: {
    fontSize: 11, fontWeight: '500', color: theme.success,
  },

  // Empty
  emptyState: {
    alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 40, ...theme.shadows.card, marginBottom: 20,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  emptyDesc: {
    fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 300,
  },
  resetFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: theme.primary, borderRadius: theme.borderRadius.full, marginTop: 16,
  },
  resetFilterBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },

  // Legend
  legendCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 14, gap: 8, borderWidth: 1, borderColor: theme.border,
  },
  legendTitle: {
    fontSize: 11, fontWeight: '600', color: theme.textSecondary, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 2,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendIcon: {
    width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
  },
  legendText: { fontSize: 12, color: theme.textPrimary },
  // View Stats
  viewStatsRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '40',
  },
  viewStatChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  viewStatText: { fontSize: 11, fontWeight: '600' as const, color: theme.textMuted },
  viewStatDate: { fontSize: 10, color: theme.textMuted, flex: 1, textAlign: 'right' as const },
  // Access Log
  accessLogSection: {
    marginTop: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 12,
  },
  accessLogHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 10,
  },
  accessLogTitle: { fontSize: 12, fontWeight: '700' as const, color: theme.textPrimary },
  accessLogList: { gap: 8 },
  accessLogRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
  },
  accessLogDot: { width: 8, height: 8, borderRadius: 4 },
  accessLogName: { fontSize: 13, fontWeight: '600' as const, color: theme.textPrimary },
  accessLogTime: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  firstVisitBadge: {
    backgroundColor: theme.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  firstVisitText: { fontSize: 9, fontWeight: '700' as const, color: theme.success },
  accessLogMore: { fontSize: 11, color: theme.textMuted, textAlign: 'center' as const, marginTop: 6 },
  accessLogEmpty: { fontSize: 12, color: theme.textMuted, textAlign: 'center' as const, paddingVertical: 12 },
  // Expiration badges
  expBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.borderRadius.full,
  },
  expBadgeText: { fontSize: 9, fontWeight: '700' as const },
  // Action button variants
  actionBtnExtend: { backgroundColor: theme.tirColor + '12' },
  actionBtnRegen: { backgroundColor: theme.accent + '15' },
  // Bulk select mode
  itemCardSelected: { borderWidth: 1.5, borderColor: theme.primary },
  selectCheckbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.border, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 10, marginRight: 4 },
  selectCheckboxActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  bulkBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 16, paddingTop: 12, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  bulkBarTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10 },
  bulkBarCount: { fontSize: 14, fontWeight: '700' as const, color: theme.primary },
  bulkBarSelectAll: { fontSize: 13, fontWeight: '600' as const, color: theme.primary },
  bulkBarActions: { flexDirection: 'row' as const, gap: 8 },
  bulkBarBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 12, borderRadius: theme.borderRadius.md },
  bulkBarBtnText: { fontSize: 12, fontWeight: '700' as const },
  bulkBarBtnExtend: { backgroundColor: theme.tirColor + '12' },
  bulkBarBtnRegen: { backgroundColor: theme.accent + '12' },
  bulkBarBtnRevoke: { backgroundColor: theme.error + '10' },
  // Analytics
  analyticsSection: { marginBottom: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, overflow: 'hidden' as const, ...theme.shadows.card },
  analyticsToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 14 },
  analyticsToggleLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  analyticsIconBg: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary + '12', alignItems: 'center' as const, justifyContent: 'center' as const },
  analyticsToggleTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  analyticsMiniStat: { backgroundColor: theme.primary + '12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  analyticsMiniStatText: { fontSize: 11, fontWeight: '800' as const, color: theme.primary },
  analyticsContent: { paddingHorizontal: 14, paddingBottom: 14, gap: 14 },
  analyticsSummaryRow: { flexDirection: 'row' as const, gap: 10 },
  analyticsSummaryChip: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  analyticsSummaryValue: { fontSize: 18, fontWeight: '800' as const, color: theme.primary },
  analyticsSummaryLabel: { fontSize: 10, color: theme.textMuted, flex: 1 },
  chartSection: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14 },
  chartHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  chartTitle: { fontSize: 12, fontWeight: '700' as const, color: theme.textPrimary },
  chartSubtitle: { fontSize: 10, color: theme.textMuted },
  chartBarsContainer: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, height: 100, paddingTop: 16 },
  chartBarCol: { flex: 1, alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 4 },
  chartBar: { width: 20, borderRadius: 4, minHeight: 3 },
  chartBarValue: { fontSize: 9, fontWeight: '700' as const, color: theme.primary },
  chartBarLabel: { fontSize: 9, fontWeight: '500' as const, color: theme.textMuted, marginTop: 2 },
  topItemsList: { gap: 8 },
  topItemRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  topItemRank: { width: 24, alignItems: 'center' as const },
  topItemRankText: { fontSize: 12, fontWeight: '800' as const },
  topItemInfo: { flex: 1, gap: 4 },
  topItemNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  topItemName: { fontSize: 12, fontWeight: '600' as const, color: theme.textPrimary, flex: 1 },
  topItemBarTrack: { height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' as const },
  topItemBarFill: { height: '100%' as any, borderRadius: 3 },
  topItemCount: { fontSize: 13, fontWeight: '800' as const, minWidth: 28, textAlign: 'right' as const },
  peakHoursScroll: { alignItems: 'flex-end' as const, gap: 6, paddingBottom: 4 },
  peakHourCol: { alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 4, minWidth: 38 },
  peakHourBar: { width: 24, borderRadius: 4, minHeight: 3 },
  peakHourValue: { fontSize: 9, fontWeight: '600' as const, color: theme.accent },
  peakHourLabel: { fontSize: 9, fontWeight: '500' as const, color: theme.textMuted },
  analyticsEmptyState: { alignItems: 'center' as const, gap: 8, paddingVertical: 20, paddingHorizontal: 14 },
  analyticsEmptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center' as const },
});
