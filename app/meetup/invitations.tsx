import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import {
  getPendingInvitations,
  respondToMeetup,
  scheduleMeetupNotifications,
  cancelMeetupReminder,
  cancelAllMeetupReminders,
  PendingInvitation,
  MeetupReminderSettings,
} from '@/services/meetupService';
import {
  requestNotificationPermissions,
  areNotificationsEnabled,
} from '@/services/notificationService';

const InvitationCard = React.memo(({ invitation: inv, index, respondingId, onRespond, t, language }: {
  invitation: PendingInvitation;
  index: number;
  respondingId: string | null;
  onRespond: (inv: PendingInvitation, status: 'accepted' | 'declined') => void;
  t: (s: string, k: string) => string;
  language: string;
}) => {
  const mDate = new Date(inv.date);
  const isPast = mDate < new Date();
  const daysUntil = Math.max(0, Math.ceil((mDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const isResponding = respondingId === inv.meetupId;

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(Math.min(index * 60, 300))}
      style={styles.card}
    >
      <Pressable
        style={styles.cardTop}
        onPress={() => router.push(`/meetup/${inv.meetupId}` as any)}
      >
        <View style={styles.dateCol}>
          <Text style={styles.dateDay}>{mDate.getDate()}</Text>
          <Text style={styles.dateMonth}>
            {mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}
          </Text>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.cardTitle} numberOfLines={1}>{inv.title}</Text>
          <View style={styles.metaRow}>
            <MaterialIcons name="schedule" size={13} color={theme.textMuted} />
            <Text style={styles.metaText}>
              {mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {daysUntil <= 1 && !isPast ? (
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>
                  {daysUntil === 0 ? t('notifications', 'todayLabel') : t('notifications', 'tomorrowLabel')}
                </Text>
              </View>
            ) : null}
          </View>
          {inv.terrainName ? (
            <View style={styles.metaRow}>
              <MaterialIcons name="place" size={13} color={theme.primary} />
              <Text style={styles.terrainText} numberOfLines={1}>
                {inv.terrainName}{inv.terrainCity ? ` • ${inv.terrainCity}` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <MaterialIcons name="person" size={13} color={theme.accent} />
            <Text style={styles.creatorText}>
              {t('meetup', 'invitedBy')} {inv.creatorName || t('meetup', 'unknownUser')}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <MaterialIcons name="group" size={12} color={theme.success} />
            <Text style={styles.confirmText}>
              {inv.acceptedCount}/{inv.maxParticipants} {t('meetup', 'confirmedCount')}
            </Text>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
      </Pressable>

      {!isPast ? (
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.actionBtn, styles.declineBtn, isResponding && styles.actionDisabled]}
            onPress={() => onRespond(inv, 'declined')}
            disabled={isResponding}
          >
            <MaterialIcons name="close" size={18} color={theme.error} />
            <Text style={[styles.actionBtnText, { color: theme.error }]}>{t('meetup', 'decline')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.acceptBtn, isResponding && styles.actionDisabled]}
            onPress={() => onRespond(inv, 'accepted')}
            disabled={isResponding}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color={theme.success} />
            ) : (
              <>
                <MaterialIcons name="check" size={18} color={theme.success} />
                <Text style={[styles.actionBtnText, { color: theme.success }]}>{t('meetup', 'accept')}</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardPast}>
          <MaterialIcons name="history" size={14} color={theme.textMuted} />
          <Text style={styles.cardPastText}>{t('meetup', 'meetupPassed')}</Text>
        </View>
      )}
    </Animated.View>
  );
});

export default function InvitationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { showAlert } = useAlert();

  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Reminder modal state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderInvitation, setReminderInvitation] = useState<PendingInvitation | null>(null);
  const [reminderOneDayBefore, setReminderOneDayBefore] = useState(false);
  const [reminderThreeHoursBefore, setReminderThreeHoursBefore] = useState(false);
  const [reminderOneHourBefore, setReminderOneHourBefore] = useState(true);
  const [reminderSaving, setReminderSaving] = useState(false);

  const loadInvitations = useCallback(async () => {
    const { invitations: data } = await getPendingInvitations();
    setInvitations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  }, [loadInvitations]);

  const handleRespond = useCallback(async (inv: PendingInvitation, status: 'accepted' | 'declined') => {
    setRespondingId(inv.meetupId);
    const { error } = await respondToMeetup(inv.meetupId, status);
    setRespondingId(null);

    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (status === 'accepted') {
      // Show reminder configuration modal
      setReminderInvitation(inv);
      setReminderOneDayBefore(false);
      setReminderThreeHoursBefore(false);
      setReminderOneHourBefore(true);
      setShowReminderModal(true);
      // Remove from list immediately
      setInvitations(prev => prev.filter(i => i.meetupId !== inv.meetupId));
    } else {
      await cancelAllMeetupReminders(inv.meetupId);
      setInvitations(prev => prev.filter(i => i.meetupId !== inv.meetupId));
    }
  }, [t, showAlert]);

  const handleSaveReminders = useCallback(async () => {
    if (!reminderInvitation) return;
    setReminderSaving(true);
    try {
      let hasPermission = await areNotificationsEnabled();
      if (!hasPermission) {
        hasPermission = await requestNotificationPermissions();
      }
      if (!hasPermission) {
        showAlert(t('meetup', 'enableNotifications'));
        setReminderSaving(false);
        return;
      }
      const settings: MeetupReminderSettings = {
        oneDayBefore: reminderOneDayBefore,
        threeHoursBefore: reminderThreeHoursBefore,
        oneHourBefore: reminderOneHourBefore,
      };
      const anyEnabled = settings.oneDayBefore || settings.threeHoursBefore || settings.oneHourBefore;
      if (anyEnabled) {
        const ids = await scheduleMeetupNotifications(
          { id: reminderInvitation.meetupId, date: reminderInvitation.date, title: reminderInvitation.title } as any,
          reminderInvitation.terrainName || '',
          settings
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(t('meetup', 'remindersScheduled'), `${ids.length} ${t('meetup', 'remindersScheduledCount')}`);
      } else {
        await cancelAllMeetupReminders(reminderInvitation.meetupId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      showAlert(t('common', 'error'), t('meetup', 'reminderErrorScheduling'));
    } finally {
      setReminderSaving(false);
      setShowReminderModal(false);
      setReminderInvitation(null);
    }
  }, [reminderInvitation, reminderOneDayBefore, reminderThreeHoursBefore, reminderOneHourBefore, t, showAlert]);

  const handleSkipReminders = useCallback(() => {
    setShowReminderModal(false);
    setReminderInvitation(null);
  }, []);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('meetup', 'pendingInvitations')}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('meetup', 'pendingInvitations')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <FlatList
        data={invitations}
        keyExtractor={(item) => item.meetupId}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListHeaderComponent={invitations.length > 0 ? (
          <View style={styles.countRow}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{invitations.length}</Text>
            </View>
            <Text style={styles.countLabel}>
              {invitations.length === 1 ? t('meetup', 'pendingInvitationSingular') : t('meetup', 'pendingInvitationPlural')}
            </Text>
          </View>
        ) : null}
        renderItem={({ item: inv, index }) => (
          <InvitationCard
            invitation={inv}
            index={index}
            respondingId={respondingId}
            onRespond={handleRespond}
            t={t}
            language={language}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="mail-outline" size={56} color={theme.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('meetup', 'noInvitations')}</Text>
            <Text style={styles.emptyText}>{t('meetup', 'noInvitationsDesc')}</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>{t('common', 'back')}</Text>
            </Pressable>
          </View>
        }
      />

      {/* Reminder Configuration Modal */}
      <Modal
        visible={showReminderModal}
        animationType="slide"
        transparent
        onRequestClose={handleSkipReminders}
      >
        <View style={styles.reminderOverlay}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.reminderModal}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderHeaderIcon}>
                <MaterialIcons name="notifications-active" size={24} color={theme.primary} />
              </View>
              <Text style={styles.reminderTitle}>{t('meetup', 'reminders')}</Text>
              <Text style={styles.reminderSubtitle}>
                {reminderInvitation?.title || ''}
              </Text>
            </View>

            <View style={styles.reminderToggles}>
              <View style={styles.reminderRow}>
                <View style={styles.reminderInfo}>
                  <MaterialIcons name="today" size={18} color={theme.textSecondary} />
                  <Text style={styles.reminderLabel}>{t('meetup', 'reminderOneDayBefore')}</Text>
                </View>
                <Switch
                  value={reminderOneDayBefore}
                  onValueChange={(v) => { setReminderOneDayBefore(v); Haptics.selectionAsync(); }}
                  trackColor={{ false: theme.border, true: theme.primary + '60' }}
                  thumbColor={reminderOneDayBefore ? theme.primary : theme.textMuted}
                />
              </View>
              <View style={styles.reminderRowBorder} />
              <View style={styles.reminderRow}>
                <View style={styles.reminderInfo}>
                  <MaterialIcons name="schedule" size={18} color={theme.textSecondary} />
                  <Text style={styles.reminderLabel}>{t('meetup', 'reminderThreeHoursBefore')}</Text>
                </View>
                <Switch
                  value={reminderThreeHoursBefore}
                  onValueChange={(v) => { setReminderThreeHoursBefore(v); Haptics.selectionAsync(); }}
                  trackColor={{ false: theme.border, true: theme.primary + '60' }}
                  thumbColor={reminderThreeHoursBefore ? theme.primary : theme.textMuted}
                />
              </View>
              <View style={styles.reminderRowBorder} />
              <View style={styles.reminderRow}>
                <View style={styles.reminderInfo}>
                  <MaterialIcons name="alarm" size={18} color={theme.textSecondary} />
                  <Text style={styles.reminderLabel}>{t('meetup', 'reminderOneHourBefore')}</Text>
                </View>
                <Switch
                  value={reminderOneHourBefore}
                  onValueChange={(v) => { setReminderOneHourBefore(v); Haptics.selectionAsync(); }}
                  trackColor={{ false: theme.border, true: theme.primary + '60' }}
                  thumbColor={reminderOneHourBefore ? theme.primary : theme.textMuted}
                />
              </View>
            </View>

            <View style={styles.reminderActions}>
              <Pressable style={styles.reminderSkipBtn} onPress={handleSkipReminders}>
                <Text style={styles.reminderSkipText}>{t('common', 'close')}</Text>
              </Pressable>
              <Pressable
                style={[styles.reminderSaveBtn, reminderSaving && { opacity: 0.6 }]}
                onPress={handleSaveReminders}
                disabled={reminderSaving}
              >
                {reminderSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="notifications" size={18} color="#FFF" />
                    <Text style={styles.reminderSaveText}>{t('common', 'save')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  // Count row
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  countBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  countLabel: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  // Card
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  dateCol: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 22, fontWeight: '900', color: theme.primary, lineHeight: 24 },
  dateMonth: { fontSize: 10, fontWeight: '700', color: theme.primary, letterSpacing: 0.5 },
  infoCol: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  metaText: { fontSize: 13, color: theme.textMuted },
  terrainText: { fontSize: 13, fontWeight: '600', color: theme.primary },
  creatorText: { fontSize: 12, color: theme.accent, fontWeight: '600' },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: theme.success + '10',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  confirmText: { fontSize: 11, fontWeight: '600', color: theme.success },
  soonBadge: {
    backgroundColor: theme.warning + '18',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  soonText: { fontSize: 10, fontWeight: '700', color: theme.warning },
  // Actions
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  declineBtn: {
    borderColor: theme.error + '30',
    backgroundColor: theme.error + '06',
  },
  acceptBtn: {
    borderColor: theme.success + '30',
    backgroundColor: theme.success + '06',
  },
  actionDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  // Past
  cardPast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: theme.textMuted + '08',
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  cardPastText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  // Reminder modal
  reminderOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  reminderModal: { backgroundColor: theme.surface, borderRadius: 24, padding: 24, ...theme.shadows.cardElevated },
  reminderHeader: { alignItems: 'center', marginBottom: 20 },
  reminderHeaderIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  reminderTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  reminderSubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
  reminderToggles: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, overflow: 'hidden' as const, marginBottom: 20 },
  reminderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 14, paddingVertical: 12 },
  reminderRowBorder: { height: 1, backgroundColor: theme.border, marginHorizontal: 14 },
  reminderInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, flex: 1 },
  reminderLabel: { fontSize: 14, fontWeight: '500' as const, color: theme.textPrimary },
  reminderActions: { flexDirection: 'row' as const, gap: 12 },
  reminderSkipBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.backgroundSecondary },
  reminderSkipText: { fontSize: 15, fontWeight: '600' as const, color: theme.textSecondary },
  reminderSaveBtn: { flex: 2, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.primary },
  reminderSaveText: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },
});
