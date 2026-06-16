import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useAuth } from '@/template';
import { useAlert } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import QRCode from 'react-native-qrcode-svg';
import MeetupChat from '@/components/feature/MeetupChat';
import { config } from '@/constants/config';
import {
  Meetup,
  MeetupResponse,
  InvitableUser,
  MeetupReminderSettings,
  findMeetupByCode,
  getMeetupResponses,
  respondToMeetup,
  cancelMeetup,
  deleteMeetup,
  getMyResponseStatus,
  scheduleMeetupReminder,
  cancelMeetupReminder,
  scheduleMeetupNotifications,
  cancelAllMeetupReminders,
  getInvitableUsers,
  inviteUsersToMeetup,
} from '@/services/meetupService';
import {
  requestNotificationPermissions,
  areNotificationsEnabled,
} from '@/services/notificationService';

const ResponseItem = React.memo(({ response: r, t }: { response: MeetupResponse; t: (s: string, k: string) => string }) => (
  <View style={styles.responseItem}>
    <View style={[styles.responseAvatar, {
      backgroundColor: r.status === 'accepted' ? theme.success + '15' : r.status === 'declined' ? theme.error + '15' : theme.warning + '15',
    }]}>
      <MaterialIcons
        name={r.status === 'accepted' ? 'check' : r.status === 'declined' ? 'close' : 'schedule'}
        size={16}
        color={r.status === 'accepted' ? theme.success : r.status === 'declined' ? theme.error : theme.warning}
      />
    </View>
    <Text style={styles.responseName}>{r.user_name || t('meetup', 'unknownUser')}</Text>
    <Text style={[styles.responseStatus, {
      color: r.status === 'accepted' ? theme.success : r.status === 'declined' ? theme.error : theme.warning,
    }]}>
      {r.status === 'accepted' ? t('meetup', 'accepted') : r.status === 'declined' ? t('meetup', 'declined') : t('meetup', 'pending')}
    </Text>
  </View>
));

export default function MeetupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string; code?: string }>();
  const params = useLocalSearchParams<{ id: string; code?: string }>();
  const insets = useSafeAreaInsets();
  const { terrains } = useAppData();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();

  const [meetup, setMeetup] = useState<Meetup | null>(null);
  const [responses, setResponses] = useState<MeetupResponse[]>([]);
  const [myStatus, setMyStatus] = useState<'accepted' | 'declined' | 'pending' | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitableUsers, setInvitableUsers] = useState<InvitableUser[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set());
  const [loadingInvitees, setLoadingInvitees] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');

  // Reminder state
  const [reminderOneDayBefore, setReminderOneDayBefore] = useState(false);
  const [reminderThreeHoursBefore, setReminderThreeHoursBefore] = useState(false);
  const [reminderOneHourBefore, setReminderOneHourBefore] = useState(true);
  const [notifPermission, setNotifPermission] = useState<boolean | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);

  const isCreator = meetup && user && meetup.creator_id === user.id;
  const terrain = meetup ? terrains.find(tr => tr.id === meetup.terrain_id) : null;
  const meetupDate = meetup ? new Date(meetup.date) : null;
  const isPast = meetupDate ? meetupDate < new Date() : false;
  const acceptedCount = responses.filter(r => r.status === 'accepted').length;
  const declinedCount = responses.filter(r => r.status === 'declined').length;
  const pendingCount = responses.filter(r => r.status === 'pending').length;
  const endTime = meetup?.end_time ? new Date(meetup.end_time as string) : null;
  const isExpired = endTime ? endTime < new Date() : isPast;
  const isCancelled = meetup?.status === 'cancelled';
  const isArchived = isExpired || isCancelled || meetup?.status === 'completed';

  const loadMeetup = useCallback(async () => {
    if (!id) return;

    // If id looks like a share code (starts with RDV-), find by code
    const isCode = id.startsWith('RDV-') || (params.code && params.code === 'true');
    let foundMeetup: Meetup | null = null;

    if (isCode) {
      const { meetup: m } = await findMeetupByCode(id);
      foundMeetup = m;
    } else {
      // Direct DB fetch
      const { getSupabaseClient } = require('@/template');
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('terrain_meetups')
        .select('*')
        .eq('id', id)
        .single();
      foundMeetup = data;
    }

    if (foundMeetup) {
      setMeetup(foundMeetup);
      // Load responses
      const { responses: resp } = await getMeetupResponses(foundMeetup.id);
      setResponses(resp);
      // Check my status
      const status = await getMyResponseStatus(foundMeetup.id);
      setMyStatus(status);
    }

    setLoading(false);
  }, [id, params.code]);

  useEffect(() => {
    loadMeetup();
    areNotificationsEnabled().then(setNotifPermission);
  }, [loadMeetup]);

  // Polling for new responses (every 15 seconds)
  useEffect(() => {
    if (!meetup || isPast) return;

    pollingRef.current = setInterval(async () => {
      const { responses: resp } = await getMeetupResponses(meetup.id);
      setResponses(resp);
    }, 15000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [meetup?.id, isPast]);

  const handleRespond = useCallback(async (status: 'accepted' | 'declined') => {
    if (!meetup) return;
    setResponding(true);
    const { error } = await respondToMeetup(meetup.id, status);
    setResponding(false);

    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMyStatus(status);

    // Schedule/cancel reminder
    if (status === 'accepted' && terrain) {
      await scheduleMeetupReminder(meetup, terrain.name);
    } else {
      await cancelMeetupReminder(meetup.id);
    }

    // Refresh responses
    const { responses: resp } = await getMeetupResponses(meetup.id);
    setResponses(resp);
  }, [meetup, terrain, t, showAlert]);

  const handleCancel = useCallback(() => {
    if (!meetup) return;
    Alert.alert(t('meetup', 'cancelMeetup'), t('meetup', 'cancelConfirm'), [
      { text: t('common', 'no'), style: 'cancel' },
      {
        text: t('common', 'yes'), style: 'destructive', onPress: async () => {
          await cancelMeetup(meetup.id);
          await cancelMeetupReminder(meetup.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    ]);
  }, [meetup, t]);

  const handleDelete = useCallback(() => {
    if (!meetup) return;
    Alert.alert(t('meetup', 'deleteMeetup'), t('meetup', 'deleteConfirm'), [
      { text: t('common', 'cancel'), style: 'cancel' },
      {
        text: t('common', 'delete'), style: 'destructive', onPress: async () => {
          await deleteMeetup(meetup.id);
          await cancelMeetupReminder(meetup.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    ]);
  }, [meetup, t]);

  const handleSaveReminders = useCallback(async () => {
    if (!meetup || !terrain) return;
    setReminderSaving(true);
    try {
      // Check/request permission
      let hasPermission = notifPermission;
      if (!hasPermission) {
        hasPermission = await requestNotificationPermissions();
        setNotifPermission(hasPermission);
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
        const ids = await scheduleMeetupNotifications(meetup, terrain.name, settings);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(t('meetup', 'remindersScheduled'), `${ids.length} ${t('meetup', 'remindersScheduledCount')}`);
      } else {
        await cancelAllMeetupReminders(meetup.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(t('common', 'success'), t('meetup', 'remindersDisabled'));
      }
    } catch {
      showAlert(t('common', 'error'), t('meetup', 'reminderErrorScheduling'));
    } finally {
      setReminderSaving(false);
    }
  }, [meetup, terrain, reminderOneDayBefore, reminderThreeHoursBefore, reminderOneHourBefore, notifPermission, t, showAlert]);

  const handleCopyCode = useCallback(async () => {
    if (meetup) {
      await Clipboard.setStringAsync(meetup.share_code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('meetup', 'codeCopied'));
    }
  }, [meetup, t, showAlert]);

  const handleOpenInvite = useCallback(async () => {
    setShowInviteModal(true);
    setLoadingInvitees(true);
    setInviteSearch('');
    setSelectedInvitees(new Set());
    const { users } = await getInvitableUsers();
    // Filter out users who already responded
    const respondedIds = new Set(responses.map(r => r.user_id));
    setInvitableUsers(users.filter(u => !respondedIds.has(u.userId)));
    setLoadingInvitees(false);
  }, [responses]);

  const toggleInvitee = useCallback((userId: string) => {
    setSelectedInvitees(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const handleSendInvitations = useCallback(async () => {
    if (!meetup || selectedInvitees.size === 0) return;
    setInviteSending(true);
    const { invited, error } = await inviteUsersToMeetup(meetup.id, Array.from(selectedInvitees));
    setInviteSending(false);
    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(t('meetup', 'inviteSuccess'), `${invited} ${t('meetup', 'inviteSuccessDesc')}`);
    setShowInviteModal(false);
    // Refresh responses
    const { responses: resp } = await getMeetupResponses(meetup.id);
    setResponses(resp);
  }, [meetup, selectedInvitees, t, showAlert]);

  const filteredInvitableUsers = useMemo(() => {
    const s = inviteSearch.toLowerCase();
    return invitableUsers.filter(u => !s || u.name.toLowerCase().includes(s) || u.club.toLowerCase().includes(s));
  }, [invitableUsers, inviteSearch]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('meetup', 'meetupLabel')}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!meetup) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('meetup', 'meetupLabel')}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.loadingContainer}>
          <MaterialIcons name="event-busy" size={64} color={theme.textMuted} />
          <Text style={styles.emptyText}>{t('meetup', 'meetupNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dateFormatted = meetupDate!.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = meetupDate!.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('meetup', 'meetupLabel')}</Text>
        <View style={styles.headerActions}>
          {isCreator ? (
            <>
              <Pressable style={styles.actionBtn} onPress={handleOpenInvite}>
                <MaterialIcons name="person-add" size={20} color={theme.accent} />
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleCopyCode}>
                <MaterialIcons name="content-copy" size={20} color={theme.primary} />
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleDelete}>
                <MaterialIcons name="delete" size={20} color={theme.error} />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        {isArchived ? (
          <View style={[styles.statusBanner, { backgroundColor: isCancelled ? theme.error + '15' : '#64748B15' }]}>
            <MaterialIcons name={isCancelled ? 'cancel' : 'archive'} size={18} color={isCancelled ? theme.error : '#64748B'} />
            <Text style={[styles.statusBannerText, { color: isCancelled ? theme.error : '#64748B' }]}>
              {isCancelled ? t('meetup', 'meetupCancelled') : (language === 'fr' ? 'Archive' : 'Archived')}
            </Text>
            {endTime && !isCancelled ? (
              <Text style={{ fontSize: 11, color: '#94A3B8', marginLeft: 4 }}>
                {language === 'fr' ? 'Termine a' : 'Ended at'} {endTime.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Hero Card */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroCard}>
          <View style={styles.heroIconBg}>
            <MaterialIcons name="event" size={32} color={theme.primary} />
          </View>
          <Text style={styles.heroTitle}>{meetup.title}</Text>
          
          <View style={styles.heroInfoRow}>
            <MaterialIcons name="calendar-today" size={16} color={theme.textSecondary} />
            <Text style={styles.heroInfoText}>{dateFormatted}</Text>
          </View>
          <View style={styles.heroInfoRow}>
            <MaterialIcons name="schedule" size={16} color={theme.textSecondary} />
            <Text style={styles.heroInfoText}>{timeFormatted}{endTime ? ` → ${endTime.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
          </View>
          
          {terrain ? (
            <Pressable style={styles.terrainRow} onPress={() => router.push(`/terrain/${terrain.id}`)}>
              <MaterialIcons name="place" size={16} color={theme.primary} />
              <Text style={styles.terrainRowText}>{terrain.name} • {terrain.city}</Text>
              <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}

          {meetup.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{meetup.notes}</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Share Code + QR */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <Pressable style={styles.shareCodeCard} onPress={handleCopyCode}>
            <View style={styles.shareCodeLeft}>
              <Text style={styles.shareCodeLabel}>{t('meetup', 'shareCodeLabel')}</Text>
              <Text style={styles.shareCodeValue}>{meetup.share_code}</Text>
            </View>
            <View style={styles.shareCodeCopy}>
              <MaterialIcons name="content-copy" size={20} color={theme.primary} />
            </View>
          </Pressable>
          {/* QR Code */}
          <View style={styles.qrCard}>
            <View style={styles.qrCardHeader}>
              <MaterialIcons name="qr-code-2" size={18} color={theme.primary} />
              <Text style={styles.qrCardTitle}>{language === 'fr' ? 'QR Code du meetup' : 'Meetup QR Code'}</Text>
            </View>
            <View style={styles.qrCardBody}>
              <View style={styles.qrWrap}>
                <QRCode
                  value={`${config.appDownloadUrl}?meetup=${meetup.share_code}`}
                  size={130}
                  color={theme.primary}
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={styles.qrHintText}>{language === 'fr' ? 'Scannez pour rejoindre' : 'Scan to join'}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Reminders Section */}
        {!isArchived ? (
          <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.remindersCard}>
            <View style={styles.remindersHeader}>
              <View style={styles.remindersHeaderLeft}>
                <MaterialIcons name="notifications-active" size={20} color={theme.primary} />
                <Text style={styles.sectionTitle}>{t('meetup', 'reminders')}</Text>
              </View>
              {notifPermission === false ? (
                <Pressable
                  style={styles.enableNotifBtn}
                  onPress={async () => {
                    const granted = await requestNotificationPermissions();
                    setNotifPermission(granted);
                  }}
                >
                  <Text style={styles.enableNotifBtnText}>{t('notifications', 'enable')}</Text>
                </Pressable>
              ) : null}
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

            <Pressable
              style={[styles.saveRemindersBtn, reminderSaving && { opacity: 0.6 }]}
              onPress={handleSaveReminders}
              disabled={reminderSaving}
            >
              {reminderSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="notifications" size={18} color="#FFF" />
                  <Text style={styles.saveRemindersBtnText}>
                    {t('common', 'save')}
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.remindersPastInfo}>
            <MaterialIcons name="notifications-off" size={16} color={theme.textMuted} />
            <Text style={styles.remindersPastText}>{isArchived ? (language === 'fr' ? 'RDV archive - notifications desactivees' : 'Meetup archived - notifications disabled') : t('meetup', 'meetupPastNoReminder')}</Text>
          </View>
        )}

        {/* Mini-Chat */}
        {!isArchived ? (
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <MeetupChat
              meetupId={meetup.id}
              userId={user?.id || ''}
              userName={user?.username || user?.email?.split('@')[0] || 'Joueur'}
              userAvatar={null}
              isParticipant={isCreator || myStatus === 'accepted'}
              language={language}
            />
          </Animated.View>
        ) : null}

        {/* Participants Summary */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.participantsCard}>
          <Text style={styles.sectionTitle}>{t('meetup', 'participants')} ({acceptedCount}/{meetup.max_participants})</Text>
          <View style={styles.participantsGrid}>
            <View style={styles.pStatItem}>
              <View style={[styles.pStatDot, { backgroundColor: theme.success }]} />
              <Text style={styles.pStatValue}>{acceptedCount}</Text>
              <Text style={styles.pStatLabel}>{t('meetup', 'accepted')}</Text>
            </View>
            <View style={styles.pStatItem}>
              <View style={[styles.pStatDot, { backgroundColor: theme.error }]} />
              <Text style={styles.pStatValue}>{declinedCount}</Text>
              <Text style={styles.pStatLabel}>{t('meetup', 'declined')}</Text>
            </View>
            <View style={styles.pStatItem}>
              <View style={[styles.pStatDot, { backgroundColor: theme.warning }]} />
              <Text style={styles.pStatValue}>{pendingCount}</Text>
              <Text style={styles.pStatLabel}>{t('meetup', 'pending')}</Text>
            </View>
          </View>

          {/* Responses list */}
          {responses.length > 0 ? (
            <View style={styles.responsesList}>
              {responses.map(r => (
                <ResponseItem key={r.id} response={r} t={t} />
              ))}
            </View>
          ) : (
            <View style={styles.noResponses}>
              <MaterialIcons name="group" size={32} color={theme.textMuted} />
              <Text style={styles.noResponsesText}>{t('meetup', 'noResponsesYet')}</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Invite Players Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteModal}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteHeaderTitle}>{t('meetup', 'invitePlayers')}</Text>
              <Pressable style={styles.inviteCloseBtn} onPress={() => setShowInviteModal(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.inviteSearchBar}>
              <MaterialIcons name="search" size={18} color={theme.textMuted} />
              <TextInput style={styles.inviteSearchInput} value={inviteSearch} onChangeText={setInviteSearch} placeholder={`${t('common', 'search')}...`} placeholderTextColor={theme.textMuted} />
            </View>
            <View style={styles.inviteInfoBanner}>
              <MaterialIcons name="info-outline" size={14} color={theme.primary} />
              <Text style={styles.inviteInfoText}>{t('meetup', 'inviteNote')}</Text>
            </View>
            {loadingInvitees ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredInvitableUsers}
                keyExtractor={item => item.userId}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: u }) => {
                  const isSelected = selectedInvitees.has(u.userId);
                  return (
                    <Pressable style={[styles.inviteeRow, isSelected && styles.inviteeRowSelected]} onPress={() => toggleInvitee(u.userId)}>
                      <View style={styles.inviteeAvatar}>
                        <Text style={styles.inviteeAvatarText}>{u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.inviteeName}>{u.name}</Text>
                          <View style={[styles.inviteSourceBadge, u.source === 'public' ? { backgroundColor: theme.success + '15' } : { backgroundColor: theme.accent + '15' }]}>
                            <Text style={[styles.inviteSourceText, { color: u.source === 'public' ? theme.success : theme.accent }]}>
                              {u.source === 'public' ? t('meetup', 'publicPlayer') : t('meetup', 'sharedPlayer')}
                            </Text>
                          </View>
                        </View>
                        {u.club || u.role ? <Text style={styles.inviteeSub}>{[u.club, u.role].filter(Boolean).join(' • ')}</Text> : null}
                      </View>
                      <View style={[styles.inviteeCheckbox, isSelected && styles.inviteeCheckboxSelected]}>
                        {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                    <MaterialIcons name="person-search" size={40} color={theme.textMuted} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginTop: 10, textAlign: 'center' }}>{t('meetup', 'noInvitablePlayers')}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, textAlign: 'center', lineHeight: 17 }}>{t('meetup', 'noInvitablePlayersDesc')}</Text>
                  </View>
                }
              />
            )}
            {selectedInvitees.size > 0 ? (
              <View style={styles.inviteActions}>
                <Pressable style={[styles.inviteSendBtn, inviteSending && { opacity: 0.6 }]} onPress={handleSendInvitations} disabled={inviteSending}>
                  {inviteSending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialIcons name="send" size={18} color="#FFF" />
                      <Text style={styles.inviteSendText}>{t('meetup', 'inviteSend')} ({selectedInvitees.size})</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Bottom Action - Response Buttons or Cancel */}
      {!isArchived ? (
        <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 16 }]}>
          {isCreator ? (
            <View style={styles.responseBtns}>
              <Pressable style={styles.cancelMeetupBtn} onPress={handleCancel}>
                <MaterialIcons name="cancel" size={20} color={theme.error} />
                <Text style={styles.cancelMeetupBtnText}>{t('meetup', 'cancelMeetup')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.responseBtns}>
              <Pressable
                style={[styles.responseBtn, styles.declineBtn, myStatus === 'declined' && styles.responseBtnActive]}
                onPress={() => handleRespond('declined')}
                disabled={responding}
              >
                <MaterialIcons name="close" size={22} color={myStatus === 'declined' ? '#FFF' : theme.error} />
                <Text style={[styles.responseBtnText, { color: myStatus === 'declined' ? '#FFF' : theme.error }]}>
                  {t('meetup', 'decline')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.responseBtn, styles.acceptBtn, myStatus === 'accepted' && styles.responseBtnActiveAccept]}
                onPress={() => handleRespond('accepted')}
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator size="small" color={myStatus === 'accepted' ? '#FFF' : theme.success} />
                ) : (
                  <>
                    <MaterialIcons name="check" size={22} color={myStatus === 'accepted' ? '#FFF' : theme.success} />
                    <Text style={[styles.responseBtnText, { color: myStatus === 'accepted' ? '#FFF' : theme.success }]}>
                      {t('meetup', 'accept')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  headerActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: theme.textMuted },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  // Status Banner
  statusBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, marginBottom: 16 },
  statusBannerText: { fontSize: 14, fontWeight: '700' },
  // Hero
  heroCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, ...theme.shadows.cardElevated, borderWidth: 1, borderColor: theme.border },
  heroIconBg: { width: 64, height: 64, borderRadius: 20, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.textPrimary, textAlign: 'center', marginBottom: 16 },
  heroInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  heroInfoText: { fontSize: 15, color: theme.textSecondary },
  terrainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: theme.primary + '08', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  terrainRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.primary },
  notesBox: { marginTop: 16, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, width: '100%' },
  notesText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  // Share Code
  shareCodeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: theme.primary + '25', ...theme.shadows.card },
  shareCodeLeft: { flex: 1 },
  shareCodeLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  shareCodeValue: { fontSize: 22, fontWeight: '900', color: theme.primary, letterSpacing: 2 },
  shareCodeCopy: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  // QR Code
  qrCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border, ...theme.shadows.card },
  qrCardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 14 },
  qrCardTitle: { fontSize: 13, fontWeight: '700' as const, color: theme.textPrimary },
  qrCardBody: { alignItems: 'center' as const },
  qrWrap: { padding: 12, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 2, borderColor: theme.primary + '15' },
  qrHintText: { fontSize: 11, color: theme.textMuted, marginTop: 8 },
  // Participants
  participantsCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, marginBottom: 16, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 },
  participantsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  pStatItem: { alignItems: 'center', gap: 4 },
  pStatDot: { width: 8, height: 8, borderRadius: 4 },
  pStatValue: { fontSize: 24, fontWeight: '900', color: theme.textPrimary },
  pStatLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '600' },
  responsesList: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, gap: 10 },
  responseItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  responseAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  responseName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  responseStatus: { fontSize: 12, fontWeight: '700' },
  noResponses: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  noResponsesText: { fontSize: 14, color: theme.textMuted },
  // Bottom Action
  bottomAction: { paddingHorizontal: 16, paddingTop: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  cancelMeetupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: theme.error + '10', borderWidth: 1.5, borderColor: theme.error + '30' },
  cancelMeetupBtnText: { fontSize: 16, fontWeight: '700', color: theme.error },
  responseBtns: { flexDirection: 'row', gap: 12 },
  responseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, borderWidth: 2 },
  declineBtn: { borderColor: theme.error + '30', backgroundColor: theme.error + '08' },
  acceptBtn: { borderColor: theme.success + '30', backgroundColor: theme.success + '08' },
  responseBtnActive: { backgroundColor: theme.error, borderColor: theme.error },
  responseBtnActiveAccept: { backgroundColor: theme.success, borderColor: theme.success },
  responseBtnText: { fontSize: 16, fontWeight: '700' },
  // Invite modal
  inviteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
  inviteModal: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', minHeight: '50%' },
  inviteHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  inviteHeaderTitle: { fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary },
  inviteCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  inviteSearchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.backgroundSecondary, marginHorizontal: 16, marginTop: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, gap: 8 },
  inviteSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  inviteInfoBanner: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8, backgroundColor: theme.primary + '08', borderRadius: 10, padding: 10, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.primary + '12' },
  inviteInfoText: { flex: 1, fontSize: 11, color: theme.textSecondary, lineHeight: 16 },
  inviteeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  inviteeRowSelected: { borderColor: theme.primary, backgroundColor: theme.primary + '06' },
  inviteeAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  inviteeAvatarText: { fontSize: 14, fontWeight: '700' as const, color: '#FFF' },
  inviteeName: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary },
  inviteeSub: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  inviteSourceBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  inviteSourceText: { fontSize: 9, fontWeight: '700' as const },
  inviteeCheckbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  inviteeCheckboxSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  inviteActions: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.border },
  inviteSendBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  inviteSendText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },
  // Reminders
  remindersCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, marginBottom: 16, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  remindersHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 14 },
  remindersHeaderLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  enableNotifBtn: { backgroundColor: theme.warning, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  enableNotifBtnText: { fontSize: 12, fontWeight: '600' as const, color: '#FFF' },
  reminderToggles: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, overflow: 'hidden' as const, marginBottom: 14 },
  reminderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 14, paddingVertical: 12 },
  reminderRowBorder: { height: 1, backgroundColor: theme.border, marginHorizontal: 14 },
  reminderInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, flex: 1 },
  reminderLabel: { fontSize: 14, fontWeight: '500' as const, color: theme.textPrimary },
  saveRemindersBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: theme.primary, paddingVertical: 14, borderRadius: 14 },
  saveRemindersBtnText: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },
  remindersPastInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  remindersPastText: { fontSize: 12, color: theme.textMuted, fontWeight: '500' as const },
});
