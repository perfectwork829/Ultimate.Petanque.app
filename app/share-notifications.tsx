import React, { useState, useEffect, useCallback } from 'react';
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
import theme from '@/constants/theme';
import {
  getShareNotifications,
  markShareNotificationsRead,
  deleteShareNotification,
  ShareNotification,
  ShareItemType,
} from '@/services/shareService';
import { useLanguage } from '@/hooks/useLanguage';
import { Language } from '@/constants/i18n';

const TYPE_ICON: Record<ShareItemType, string> = {
  player: 'person',
  club: 'home',
  terrain: 'landscape',
  tournament: 'emoji-events',
};

const TYPE_COLOR: Record<ShareItemType, string> = {
  player: theme.primary,
  club: theme.accent,
  terrain: theme.success,
  tournament: theme.carreauColor,
};

const TYPE_LABEL_KEY: Record<ShareItemType, string> = {
  player: 'playerLabel',
  club: 'clubLabel',
  terrain: 'terrainLabel',
  tournament: 'tournamentLabel',
};

const ROUTE_MAP: Record<ShareItemType, string> = {
  player: '/player/',
  club: '/club/',
  terrain: '/terrain/',
  tournament: '/tournament/',
};

function formatRelativeDate(dateStr: string, lang: Language): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return lang === 'fr' ? "A l'instant" : 'Just now';
  if (diffMins < 60) return lang === 'fr' ? `Il y a ${diffMins} min` : `${diffMins} min ago`;
  if (diffHours < 24) return lang === 'fr' ? `Il y a ${diffHours}h` : `${diffHours}h ago`;
  if (diffDays < 7) return lang === 'fr' ? `Il y a ${diffDays}j` : `${diffDays}d ago`;
  return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
}

export default function ShareNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const [notifications, setNotifications] = useState<ShareNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const result = await getShareNotifications();
      if (!result.error) {
        setNotifications(result.notifications);
      }
    } catch (e) {
      console.log('Error loading share notifications:', e);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadNotifications();
      setLoading(false);
    };
    load();
  }, [loadNotifications]);

  // Mark all as read on mount (after a short delay)
  useEffect(() => {
    const timer = setTimeout(async () => {
      const unread = notifications.filter(n => !n.isRead);
      if (unread.length > 0) {
        await markShareNotificationsRead();
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [notifications.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const handleNavigate = useCallback((itemType: ShareItemType, itemId: string) => {
    Haptics.selectionAsync();
    router.push(`${ROUTE_MAP[itemType]}${itemId}` as any);
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      t('share', 'deleteLabel'),
      t('share', 'deleteNotif'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await deleteShareNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
          },
        },
      ]
    );
  }, [t]);

  const handleClearAll = useCallback(() => {
    if (notifications.length === 0) return;
    Alert.alert(
      t('share', 'deleteAll'),
      t('share', 'deleteAllNotif'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('share', 'deleteAll'),
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            for (const n of notifications) {
              await deleteShareNotification(n.id);
            }
            setNotifications([]);
          },
        },
      ]
    );
  }, [notifications, t]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('share', 'shareNotifications')}</Text>
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
        <Text style={styles.headerTitle}>{t('share', 'shareNotifications')}</Text>
        {notifications.length > 0 ? (
          <Pressable style={styles.clearAllBtn} onPress={handleClearAll}>
            <MaterialIcons name="delete-sweep" size={22} color={theme.error} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
        }
      >
        {/* Summary */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.summaryCard}>
          <View style={[styles.summaryIcon, { backgroundColor: theme.success + '15' }]}>
            <MaterialIcons name="share" size={28} color={theme.success} />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryTitle}>
              {notifications.length === 0
                ? t('share', 'noNotifications')
                : `${notifications.length} ${notifications.length > 1 ? t('share', 'accessRecordedPlural') : t('share', 'accessRecorded')}`}
            </Text>
            <Text style={styles.summarySubtitle}>
              {unreadCount > 0
                ? `${unreadCount} ${unreadCount > 1 ? t('share', 'unreadPlural') : t('share', 'unread')}`
                : t('share', 'allUpToDate')}
            </Text>
          </View>
        </Animated.View>

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <View style={styles.notificationsList}>
            {notifications.map((notif, index) => {
              const color = TYPE_COLOR[notif.itemType];
              const icon = TYPE_ICON[notif.itemType];
              const labelKey = TYPE_LABEL_KEY[notif.itemType];
              return (
                <Animated.View
                  key={notif.id}
                  entering={FadeIn.duration(200).delay(index * 40)}
                >
                  <Pressable
                    style={[
                      styles.notifCard,
                      !notif.isRead && styles.notifCardUnread,
                    ]}
                    onPress={() => handleNavigate(notif.itemType, notif.itemId)}
                    onLongPress={() => handleDelete(notif.id)}
                  >
                    {/* Unread indicator */}
                    {!notif.isRead && <View style={styles.unreadDot} />}

                    {/* Accessor avatar */}
                    <View style={styles.notifAvatar}>
                      <Text style={styles.notifAvatarText}>
                        {(notif.accessorName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    {/* Content */}
                    <View style={styles.notifContent}>
                      <View style={styles.notifTextRow}>
                        <Text style={styles.notifName} numberOfLines={1}>
                          {notif.accessorName || t('share', 'user')}
                        </Text>
                        <Text style={styles.notifTime}>
                          {formatRelativeDate(notif.createdAt, language)}
                        </Text>
                      </View>

                      <Text style={styles.notifAction} numberOfLines={2}>
                        {t('share', 'accessedYourCard')} {t('share', labelKey).toLowerCase()}
                        {notif.itemName ? ` "${notif.itemName}"` : ''}
                      </Text>

                      {/* Badges */}
                      <View style={styles.notifBadges}>
                        <View style={[styles.notifTypeBadge, { backgroundColor: color + '15' }]}>
                          <MaterialIcons name={icon as any} size={12} color={color} />
                          <Text style={[styles.notifTypeBadgeText, { color }]}>{t('share', labelKey)}</Text>
                        </View>
                        <View style={[
                          styles.notifPermBadge,
                          { backgroundColor: notif.permission === 'read' ? theme.primary + '15' : theme.accent + '15' }
                        ]}>
                          <MaterialIcons
                            name={notif.permission === 'read' ? 'visibility' : 'edit'}
                            size={10}
                            color={notif.permission === 'read' ? theme.primary : theme.accent}
                          />
                          <Text style={[
                            styles.notifPermBadgeText,
                            { color: notif.permission === 'read' ? theme.primary : theme.accent }
                          ]}>
                            {notif.permission === 'read' ? t('share', 'readPermission') : t('share', 'editPermission')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="notifications-none" size={56} color={theme.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t('share', 'noNotifTitle')}</Text>
            <Text style={styles.emptyDesc}>
              {t('share', 'noNotifDesc')}
            </Text>
          </Animated.View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={16} color={theme.textMuted} />
          <Text style={styles.infoText}>
            {t('share', 'longPressInfo')}
          </Text>
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>
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
  clearAllBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Summary
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 20,
    ...theme.shadows.card,
  },
  summaryIcon: {
    width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  summaryInfo: { flex: 1 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 },
  summarySubtitle: { fontSize: 13, color: theme.textSecondary },

  // Notifications list
  notificationsList: { gap: 10, marginBottom: 20 },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg, padding: 14, gap: 12,
    ...theme.shadows.card,
  },
  notifCardUnread: {
    backgroundColor: theme.primary + '08',
    borderWidth: 1,
    borderColor: theme.primary + '20',
  },
  unreadDot: {
    position: 'absolute', top: 14, left: 14,
    width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary,
    zIndex: 1,
  },
  notifAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  notifAvatarText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  notifContent: { flex: 1 },
  notifTextRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2,
  },
  notifName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, flex: 1, marginRight: 8 },
  notifTime: { fontSize: 11, color: theme.textMuted },
  notifAction: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginBottom: 6 },
  notifBadges: { flexDirection: 'row', gap: 6 },
  notifTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full,
  },
  notifTypeBadgeText: { fontSize: 10, fontWeight: '600' },
  notifPermBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: theme.borderRadius.full,
  },
  notifPermBadgeText: { fontSize: 10, fontWeight: '600' },

  // Empty
  emptyState: {
    alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 40, ...theme.shadows.card, marginBottom: 20,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  emptyDesc: {
    fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },

  // Info
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: theme.border, marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 12, color: theme.textMuted, lineHeight: 17 },
});
