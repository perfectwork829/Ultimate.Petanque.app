/**
 * Admin Maintenance Page
 *
 * Allows admins to enable/disable maintenance mode with:
 * - FR/EN message inputs
 * - Estimated end time picker
 * - Push notification toggle
 * - Real-time banner preview
 * - Maintenance history log
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import {
  getMaintenanceStatus,
  enableMaintenance,
  disableMaintenance,
  scheduleMaintenance,
  cancelScheduledMaintenance,
  logMaintenanceAction,
  getMaintenanceHistory,
  MaintenanceStatus,
  MaintenanceLogEntry,
} from '@/services/maintenanceService';

// Duration presets in minutes
const DURATION_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '8h', minutes: 480 },
];

// Schedule presets - return a future Date
const getSchedulePresets = (fr: boolean) => [
  { labelFr: 'Dans 1h', labelEn: 'In 1h', getDate: () => new Date(Date.now() + 3_600_000) },
  { labelFr: 'Dans 2h', labelEn: 'In 2h', getDate: () => new Date(Date.now() + 7_200_000) },
  { labelFr: 'Dans 4h', labelEn: 'In 4h', getDate: () => new Date(Date.now() + 14_400_000) },
  { labelFr: 'Ce soir 22h', labelEn: 'Tonight 10pm', getDate: () => { const d = new Date(); d.setHours(22, 0, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); return d; } },
  { labelFr: 'Demain 6h', labelEn: 'Tomorrow 6am', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0); return d; } },
  { labelFr: 'Demain 8h', labelEn: 'Tomorrow 8am', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; } },
  { labelFr: 'Demain 14h', labelEn: 'Tomorrow 2pm', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; } },
];

export default function AdminMaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  // Current status
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [messageFr, setMessageFr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [sendRecapPush, setSendRecapPush] = useState(true);
  const [recapMessageFr, setRecapMessageFr] = useState('L\'application est de nouveau operationnelle. Merci de votre patience !');
  const [recapMessageEn, setRecapMessageEn] = useState('The application is back online. Thank you for your patience!');
  const [selectedDuration, setSelectedDuration] = useState<number | null>(60);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [showCustomDuration, setShowCustomDuration] = useState(false);

  // Schedule mode
  const [formMode, setFormMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [selectedSchedulePreset, setSelectedSchedulePreset] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);
  const [customScheduleDate, setCustomScheduleDate] = useState(''); // DD/MM/YYYY
  const [customScheduleTime, setCustomScheduleTime] = useState(''); // HH:MM

  // History
  const [history, setHistory] = useState<MaintenanceLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Preview
  const [previewCountdown, setPreviewCountdown] = useState('');

  const loadData = useCallback(async () => {
    try {
      const result = await getMaintenanceStatus();
      setStatus(result);

      // Pre-fill form if maintenance is active
      if (result.isActive) {
        if (result.messageFr) setMessageFr(result.messageFr);
        if (result.messageEn) setMessageEn(result.messageEn);
      }
      // Pre-fill if scheduled
      if (result.isScheduled) {
        if (result.scheduledMessageFr) setMessageFr(result.scheduledMessageFr);
        if (result.scheduledMessageEn) setMessageEn(result.scheduledMessageEn);
        if (result.scheduledDurationMinutes) {
          const preset = DURATION_PRESETS.find(p => p.minutes === result.scheduledDurationMinutes);
          if (preset) setSelectedDuration(preset.minutes);
          else {
            setShowCustomDuration(true);
            setCustomHours(String(Math.floor(result.scheduledDurationMinutes / 60)));
            setCustomMinutes(String(result.scheduledDurationMinutes % 60));
          }
        }
        if (result.scheduledAt) setScheduleDate(new Date(result.scheduledAt));
        setSendPush(result.scheduledSendPush);
        setFormMode('scheduled');
      }

      const { logs } = await getMaintenanceHistory(20);
      setHistory(logs);
    } catch (e) {
      console.log('Error loading maintenance data:', e);
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

  // Compute end time from duration
  const getEndTime = useCallback((): string | undefined => {
    if (showCustomDuration) {
      const h = parseInt(customHours || '0', 10);
      const m = parseInt(customMinutes || '0', 10);
      const total = h * 60 + m;
      if (total <= 0) return undefined;
      return new Date(Date.now() + total * 60000).toISOString();
    }
    if (!selectedDuration) return undefined;
    return new Date(Date.now() + selectedDuration * 60000).toISOString();
  }, [selectedDuration, showCustomDuration, customHours, customMinutes]);

  // Preview countdown effect
  useEffect(() => {
    const endTime = getEndTime();
    if (!endTime) { setPreviewCountdown(''); return; }

    const update = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setPreviewCountdown(fr ? 'Bientot termine' : 'Ending soon'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (h > 0) setPreviewCountdown(`${h}h ${m.toString().padStart(2, '0')}m`);
      else setPreviewCountdown(`${m}m`);
    };
    update();
    const interval = setInterval(update, 10_000);
    return () => clearInterval(interval);
  }, [getEndTime, fr]);

  // Enable maintenance
  const handleEnable = useCallback(async () => {
    if (!messageFr.trim() && !messageEn.trim()) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'Un message est requis (FR ou EN)' : 'A message is required (FR or EN)');
      return;
    }
    Alert.alert(
      fr ? 'Activer la maintenance ?' : 'Enable maintenance?',
      fr
        ? `Les utilisateurs verront la banniere de maintenance.${sendPush ? ' Une notification push sera envoyee a tous.' : ''}`
        : `Users will see the maintenance banner.${sendPush ? ' A push notification will be sent to all.' : ''}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Activer' : 'Enable',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            const endTime = getEndTime();
            const result = await enableMaintenance({
              messageFr: messageFr.trim() || messageEn.trim(),
              messageEn: messageEn.trim() || messageFr.trim(),
              endTime,
              sendPush,
            });
            if (result.error) {
              showAlert(fr ? 'Erreur' : 'Error', result.error);
            } else {
              const sentCount = result.pushSent || 0;
              const errorCount = result.pushErrors || 0;
              await logMaintenanceAction({
                action: 'enabled',
                adminName: user?.username || user?.email || 'Admin',
                messageFr: messageFr.trim(),
                messageEn: messageEn.trim(),
                endTime,
                pushSent: sendPush,
                pushSentCount: sentCount,
                pushErrorCount: errorCount,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(
                fr ? 'Maintenance activee' : 'Maintenance enabled',
                sendPush
                  ? (fr ? `Push envoye : ${sentCount} succes, ${errorCount} erreur(s)` : `Push sent: ${sentCount} success, ${errorCount} error(s)`)
                  : undefined
              );
              await loadData();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }, [messageFr, messageEn, sendPush, getEndTime, fr, user, showAlert, loadData]);

  // Schedule maintenance
  const handleSchedule = useCallback(async () => {
    if (!messageFr.trim() && !messageEn.trim()) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'Un message est requis (FR ou EN)' : 'A message is required (FR or EN)');
      return;
    }

    // Compute schedule date
    let targetDate = scheduleDate;
    if (showCustomSchedule) {
      const parts = customScheduleDate.split('/');
      const timeParts = customScheduleTime.split(':');
      if (parts.length === 3 && timeParts.length === 2) {
        const d = new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10),
          parseInt(timeParts[0], 10),
          parseInt(timeParts[1], 10)
        );
        if (!isNaN(d.getTime()) && d.getTime() > Date.now()) targetDate = d;
        else {
          showAlert(fr ? 'Erreur' : 'Error', fr ? 'Date/heure invalide ou dans le passe' : 'Invalid or past date/time');
          return;
        }
      } else {
        showAlert(fr ? 'Erreur' : 'Error', fr ? 'Format: JJ/MM/AAAA et HH:MM' : 'Format: DD/MM/YYYY and HH:MM');
        return;
      }
    }
    if (!targetDate || targetDate.getTime() <= Date.now()) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'Selectionnez une date future' : 'Select a future date');
      return;
    }

    // Compute duration in minutes
    let durationMinutes: number | undefined;
    if (showCustomDuration) {
      const h = parseInt(customHours || '0', 10);
      const m = parseInt(customMinutes || '0', 10);
      if (h * 60 + m > 0) durationMinutes = h * 60 + m;
    } else if (selectedDuration) {
      durationMinutes = selectedDuration;
    }

    const scheduledDateStr = formatDate(targetDate.toISOString());
    Alert.alert(
      fr ? 'Planifier la maintenance ?' : 'Schedule maintenance?',
      fr
        ? `La maintenance sera activee le ${scheduledDateStr}.${sendPush ? ' Push envoye au demarrage.' : ''}`
        : `Maintenance will activate on ${scheduledDateStr}.${sendPush ? ' Push sent at start.' : ''}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Planifier' : 'Schedule',
          onPress: async () => {
            setSubmitting(true);
            const { error } = await scheduleMaintenance({
              scheduledAt: targetDate!.toISOString(),
              messageFr: messageFr.trim() || messageEn.trim(),
              messageEn: messageEn.trim() || messageFr.trim(),
              durationMinutes,
              sendPush,
            });
            if (error) {
              showAlert(fr ? 'Erreur' : 'Error', error);
            } else {
              await logMaintenanceAction({
                action: 'enabled',
                adminName: user?.username || user?.email || 'Admin',
                messageFr: `[PLANIFIE ${scheduledDateStr}] ${messageFr.trim()}`,
                messageEn: `[SCHEDULED ${scheduledDateStr}] ${messageEn.trim()}`,
                endTime: durationMinutes ? new Date(targetDate!.getTime() + durationMinutes * 60000).toISOString() : undefined,
                pushSent: false,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(
                fr ? 'Maintenance planifiee' : 'Maintenance scheduled',
                fr ? `Activation prevue : ${scheduledDateStr}` : `Activation scheduled: ${scheduledDateStr}`
              );
              await loadData();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }, [messageFr, messageEn, sendPush, scheduleDate, showCustomSchedule, customScheduleDate, customScheduleTime, showCustomDuration, customHours, customMinutes, selectedDuration, fr, user, showAlert, loadData]);

  // Cancel scheduled maintenance
  const handleCancelSchedule = useCallback(async () => {
    Alert.alert(
      fr ? 'Annuler la planification ?' : 'Cancel schedule?',
      fr ? 'La maintenance planifiee sera annulee.' : 'The scheduled maintenance will be cancelled.',
      [
        { text: fr ? 'Non' : 'No', style: 'cancel' },
        {
          text: fr ? 'Oui, annuler' : 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            const { error } = await cancelScheduledMaintenance();
            if (error) {
              showAlert(fr ? 'Erreur' : 'Error', error);
            } else {
              await logMaintenanceAction({
                action: 'disabled',
                adminName: user?.username || user?.email || 'Admin',
                messageFr: '[PLANIFICATION ANNULEE]',
                messageEn: '[SCHEDULE CANCELLED]',
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(fr ? 'Planification annulee' : 'Schedule cancelled');
              setScheduleDate(null);
              setSelectedSchedulePreset(null);
              setShowCustomSchedule(false);
              setFormMode('immediate');
              await loadData();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }, [fr, user, showAlert, loadData]);

  // Disable maintenance
  const handleDisable = useCallback(async () => {
    Alert.alert(
      fr ? 'Desactiver la maintenance ?' : 'Disable maintenance?',
      fr
        ? `La banniere sera masquee pour tous les utilisateurs.${sendRecapPush ? ' Un push de fin sera envoye.' : ''}`
        : `The banner will be hidden for all users.${sendRecapPush ? ' A recap push will be sent.' : ''}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Desactiver' : 'Disable',
          onPress: async () => {
            setSubmitting(true);
            const result = await disableMaintenance({
              sendRecapPush,
              recapMessageFr: recapMessageFr.trim() || recapMessageEn.trim() || undefined,
              recapMessageEn: recapMessageEn.trim() || recapMessageFr.trim() || undefined,
            });
            if (result.error) {
              showAlert(fr ? 'Erreur' : 'Error', result.error);
            } else {
              const sentCount = result.pushSent || 0;
              const errorCount = result.pushErrors || 0;
              await logMaintenanceAction({
                action: 'disabled',
                adminName: user?.username || user?.email || 'Admin',
                pushSent: sendRecapPush,
                pushSentCount: sentCount,
                pushErrorCount: errorCount,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(
                fr ? 'Maintenance desactivee' : 'Maintenance disabled',
                sendRecapPush
                  ? (fr ? `Push recap envoye : ${sentCount} succes, ${errorCount} erreur(s)` : `Recap push sent: ${sentCount} success, ${errorCount} error(s)`)
                  : undefined
              );
              setMessageFr('');
              setMessageEn('');
              await loadData();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }, [fr, user, showAlert, loadData, sendRecapPush]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Maintenance</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isActive = status?.isActive === true;
  const isScheduled = status?.isScheduled === true;
  const showForm = !isActive && !isScheduled;
  const schedulePresets = getSchedulePresets(fr);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Maintenance</Text>
      </View>

      <AdminQuickNav currentRoute="/admin-maintenance" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Current Status */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={[styles.statusCard, { borderColor: isActive ? '#D97706' + '40' : isScheduled ? '#2563EB40' : theme.success + '30' }]}>
            <View style={[styles.statusIcon, { backgroundColor: isActive ? '#D97706' + '15' : isScheduled ? '#2563EB15' : theme.success + '15' }]}>
              <MaterialIcons name={isActive ? 'construction' : isScheduled ? 'schedule' : 'check-circle'} size={28} color={isActive ? '#D97706' : isScheduled ? '#2563EB' : theme.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: isActive ? '#D97706' : isScheduled ? '#2563EB' : theme.success }]}>
                {isActive
                  ? (fr ? 'Maintenance en cours' : 'Maintenance active')
                  : isScheduled
                    ? (fr ? 'Maintenance planifiee' : 'Maintenance scheduled')
                    : (fr ? 'Application operationnelle' : 'Application operational')}
              </Text>
              {isActive && status?.startedAt ? (
                <Text style={styles.statusSub}>
                  {fr ? 'Depuis' : 'Since'} {formatDate(status.startedAt)}
                </Text>
              ) : null}
              {isActive && status?.endTime ? (
                <View style={styles.statusEndRow}>
                  <MaterialIcons name="timer" size={12} color="#D97706" />
                  <Text style={styles.statusEndText}>
                    {fr ? 'Fin estimee' : 'Estimated end'}: {formatDate(status.endTime)}
                  </Text>
                </View>
              ) : null}
              {isScheduled && status?.scheduledAt ? (
                <View style={[styles.statusEndRow, { marginTop: 3 }]}>
                  <MaterialIcons name="event" size={12} color="#2563EB" />
                  <Text style={[styles.statusEndText, { color: '#2563EB' }]}>
                    {fr ? 'Prevue' : 'Scheduled'}: {formatDate(status.scheduledAt)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isActive ? '#FEF3C7' : isScheduled ? '#DBEAFE' : '#DCFCE7' }]}>
              <View style={[styles.statusDot, { backgroundColor: isActive ? '#D97706' : isScheduled ? '#2563EB' : theme.success }]} />
              <Text style={[styles.statusBadgeText, { color: isActive ? '#92400E' : isScheduled ? '#1E40AF' : '#166534' }]}>
                {isActive ? 'ON' : isScheduled ? (fr ? 'PLANIF.' : 'SCHED.') : 'OFF'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Scheduled maintenance - cancel button */}
        {isScheduled ? (
          <Animated.View entering={FadeInDown.duration(300).delay(50)}>
            <View style={styles.scheduledInfoCard}>
              <View style={styles.scheduledInfoRow}>
                <MaterialIcons name="schedule" size={18} color="#2563EB" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduledInfoTitle}>{fr ? 'Activation automatique' : 'Auto-activation'}</Text>
                  <Text style={styles.scheduledInfoDesc}>
                    {fr ? 'La banniere apparaitra et le push sera envoye a l\'heure prevue.' : 'Banner will appear and push sent at the scheduled time.'}
                  </Text>
                  {status?.scheduledSendPush ? (
                    <View style={styles.scheduledPushBadge}>
                      <MaterialIcons name="notifications-active" size={11} color="#2563EB" />
                      <Text style={styles.scheduledPushText}>{fr ? 'Push au demarrage' : 'Push on start'}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.cancelScheduleBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleCancelSchedule}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <MaterialIcons name="event-busy" size={20} color="#EF4444" />
                  <Text style={styles.cancelScheduleBtnText}>
                    {fr ? 'Annuler la planification' : 'Cancel schedule'}
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Quick Disable Button when active */}
        {isActive ? (
          <Animated.View entering={FadeInDown.duration(300).delay(50)}>
            {/* Recap push toggle */}
            <View style={styles.recapPushCard}>
              <View style={[styles.toggleIcon, { backgroundColor: sendRecapPush ? '#10B981' + '15' : theme.textMuted + '15' }]}>
                <MaterialIcons name={sendRecapPush ? 'campaign' : 'notifications-off'} size={20} color={sendRecapPush ? '#10B981' : theme.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{fr ? 'Push de fin de maintenance' : 'Maintenance end push'}</Text>
                <Text style={styles.toggleDesc}>
                  {sendRecapPush
                    ? (fr ? 'Notifier tous les utilisateurs que l\'app est de retour' : 'Notify all users the app is back')
                    : (fr ? 'Pas de notification de fin' : 'No end notification')}
                </Text>
              </View>
              <Switch
                value={sendRecapPush}
                onValueChange={setSendRecapPush}
                trackColor={{ false: theme.border, true: '#10B981' + '60' }}
                thumbColor={sendRecapPush ? '#10B981' : theme.textMuted}
              />
            </View>
            {/* Custom recap push messages */}
            {sendRecapPush ? (
              <View style={styles.recapMessagesCard}>
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.fieldLabelFlag}>{"\u{1F1EB}\u{1F1F7}"}</Text>
                    <Text style={styles.fieldLabelText}>{fr ? 'Message fin (FR)' : 'End message (FR)'}</Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, { minHeight: 56 }]}
                    placeholder={fr ? 'L\'app est de retour...' : 'App is back...'}
                    placeholderTextColor={'#94A3B8'}
                    value={recapMessageFr}
                    onChangeText={setRecapMessageFr}
                    multiline
                    numberOfLines={2}
                    maxLength={200}
                  />
                  <Text style={styles.charCount}>{recapMessageFr.length}/200</Text>
                </View>
                <View style={[styles.fieldWrap, { marginBottom: 0 }]}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.fieldLabelFlag}>{"\u{1F1EC}\u{1F1E7}"}</Text>
                    <Text style={styles.fieldLabelText}>{fr ? 'Message fin (EN)' : 'End message (EN)'}</Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, { minHeight: 56 }]}
                    placeholder="App is back online..."
                    placeholderTextColor={'#94A3B8'}
                    value={recapMessageEn}
                    onChangeText={setRecapMessageEn}
                    multiline
                    numberOfLines={2}
                    maxLength={200}
                  />
                  <Text style={styles.charCount}>{recapMessageEn.length}/200</Text>
                </View>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.disableBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleDisable}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="power-settings-new" size={20} color="#FFF" />
                  <Text style={styles.disableBtnText}>
                    {fr ? 'Desactiver la maintenance' : 'Disable maintenance'}
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        {/* ===== FORM ===== */}
        {showForm ? (
          <Animated.View entering={FadeInDown.duration(300).delay(100)}>
            <View style={styles.formSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.sectionHeaderIcon, { backgroundColor: '#D97706' + '12' }]}>
                  <MaterialIcons name="edit-note" size={20} color="#D97706" />
                </View>
                <Text style={styles.sectionTitle}>{fr ? 'Configurer la maintenance' : 'Configure maintenance'}</Text>
              </View>

              {/* Mode toggle: Immediate vs Scheduled */}
              <View style={styles.modeToggle}>
                <Pressable
                  style={[styles.modeToggleItem, formMode === 'immediate' && styles.modeToggleItemActive]}
                  onPress={() => { setFormMode('immediate'); Haptics.selectionAsync(); }}
                >
                  <MaterialIcons name="flash-on" size={16} color={formMode === 'immediate' ? '#FFF' : '#64748B'} />
                  <Text style={[styles.modeToggleText, formMode === 'immediate' && styles.modeToggleTextActive]}>
                    {fr ? 'Immediat' : 'Immediate'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeToggleItem, formMode === 'scheduled' && styles.modeToggleItemActiveBlue]}
                  onPress={() => { setFormMode('scheduled'); Haptics.selectionAsync(); }}
                >
                  <MaterialIcons name="schedule" size={16} color={formMode === 'scheduled' ? '#FFF' : '#64748B'} />
                  <Text style={[styles.modeToggleText, formMode === 'scheduled' && styles.modeToggleTextActive]}>
                    {fr ? 'Planifier' : 'Schedule'}
                  </Text>
                </Pressable>
              </View>

              {/* Schedule date/time selection */}
              {formMode === 'scheduled' ? (
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldLabel}>
                    <MaterialIcons name="event" size={16} color="#2563EB" />
                    <Text style={[styles.fieldLabelText, { color: '#2563EB' }]}>{fr ? 'Date et heure de debut' : 'Start date and time'}</Text>
                  </View>
                  <View style={styles.durationGrid}>
                    {schedulePresets.map((preset, idx) => {
                      const isSelected = !showCustomSchedule && selectedSchedulePreset === idx;
                      return (
                        <Pressable
                          key={idx}
                          style={[styles.durationChip, isSelected && { backgroundColor: '#2563EB', borderColor: '#2563EB' }]}
                          onPress={() => {
                            setSelectedSchedulePreset(idx);
                            setScheduleDate(preset.getDate());
                            setShowCustomSchedule(false);
                            Haptics.selectionAsync();
                          }}
                        >
                          <Text style={[styles.durationChipText, isSelected && { color: '#FFF' }]}>
                            {fr ? preset.labelFr : preset.labelEn}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={[styles.durationChip, showCustomSchedule && { backgroundColor: '#2563EB', borderColor: '#2563EB' }]}
                      onPress={() => { setShowCustomSchedule(true); setSelectedSchedulePreset(null); setScheduleDate(null); Haptics.selectionAsync(); }}
                    >
                      <MaterialIcons name="edit-calendar" size={14} color={showCustomSchedule ? '#FFF' : theme.textSecondary} />
                    </Pressable>
                  </View>
                  {showCustomSchedule ? (
                    <View style={styles.customScheduleRow}>
                      <View style={[styles.customDurationField, { flex: 1 }]}>
                        <MaterialIcons name="calendar-today" size={14} color="#64748B" />
                        <TextInput
                          style={[styles.customDurationInput, { width: 90, textAlign: 'left' }]}
                          placeholder="JJ/MM/AAAA"
                          placeholderTextColor={theme.textMuted}
                          value={customScheduleDate}
                          onChangeText={setCustomScheduleDate}
                          keyboardType="number-pad"
                          maxLength={10}
                        />
                      </View>
                      <View style={styles.customDurationField}>
                        <MaterialIcons name="access-time" size={14} color="#64748B" />
                        <TextInput
                          style={[styles.customDurationInput, { width: 50, textAlign: 'left' }]}
                          placeholder="HH:MM"
                          placeholderTextColor={theme.textMuted}
                          value={customScheduleTime}
                          onChangeText={setCustomScheduleTime}
                          keyboardType="number-pad"
                          maxLength={5}
                        />
                      </View>
                    </View>
                  ) : null}
                  {scheduleDate ? (
                    <View style={styles.schedulePreviewRow}>
                      <MaterialIcons name="check-circle" size={14} color="#2563EB" />
                      <Text style={styles.schedulePreviewText}>{formatDate(scheduleDate.toISOString())}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Message FR */}
              <View style={styles.fieldWrap}>
                <View style={styles.fieldLabel}>
                  <Text style={styles.fieldLabelFlag}>🇫🇷</Text>
                  <Text style={styles.fieldLabelText}>{fr ? 'Message francais' : 'French message'}</Text>
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder={fr ? 'Maintenance en cours...' : 'Maintenance in progress...'}
                  placeholderTextColor={theme.textMuted}
                  value={messageFr}
                  onChangeText={setMessageFr}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
                <Text style={styles.charCount}>{messageFr.length}/200</Text>
              </View>

              {/* Message EN */}
              <View style={styles.fieldWrap}>
                <View style={styles.fieldLabel}>
                  <Text style={styles.fieldLabelFlag}>🇬🇧</Text>
                  <Text style={styles.fieldLabelText}>{fr ? 'Message anglais' : 'English message'}</Text>
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Maintenance in progress..."
                  placeholderTextColor={theme.textMuted}
                  value={messageEn}
                  onChangeText={setMessageEn}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
                <Text style={styles.charCount}>{messageEn.length}/200</Text>
              </View>

              {/* Duration */}
              <View style={styles.fieldWrap}>
                <View style={styles.fieldLabel}>
                  <MaterialIcons name="timer" size={16} color={theme.textSecondary} />
                  <Text style={styles.fieldLabelText}>{fr ? 'Duree estimee' : 'Estimated duration'}</Text>
                </View>
                <View style={styles.durationGrid}>
                  {DURATION_PRESETS.map(preset => {
                    const isSelected = !showCustomDuration && selectedDuration === preset.minutes;
                    return (
                      <Pressable
                        key={preset.minutes}
                        style={[styles.durationChip, isSelected && styles.durationChipActive]}
                        onPress={() => { setSelectedDuration(preset.minutes); setShowCustomDuration(false); Haptics.selectionAsync(); }}
                      >
                        <Text style={[styles.durationChipText, isSelected && styles.durationChipTextActive]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.durationChip, showCustomDuration && styles.durationChipActive]}
                    onPress={() => { setShowCustomDuration(true); setSelectedDuration(null); Haptics.selectionAsync(); }}
                  >
                    <MaterialIcons name="tune" size={14} color={showCustomDuration ? '#FFF' : theme.textSecondary} />
                  </Pressable>
                </View>
                {showCustomDuration ? (
                  <View style={styles.customDurationRow}>
                    <View style={styles.customDurationField}>
                      <TextInput
                        style={styles.customDurationInput}
                        placeholder="0"
                        placeholderTextColor={theme.textMuted}
                        value={customHours}
                        onChangeText={setCustomHours}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.customDurationUnit}>h</Text>
                    </View>
                    <View style={styles.customDurationField}>
                      <TextInput
                        style={styles.customDurationInput}
                        placeholder="0"
                        placeholderTextColor={theme.textMuted}
                        value={customMinutes}
                        onChangeText={setCustomMinutes}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.customDurationUnit}>min</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Push toggle */}
              <View style={styles.toggleCard}>
                <View style={[styles.toggleIcon, { backgroundColor: sendPush ? theme.primary + '15' : theme.textMuted + '15' }]}>
                  <MaterialIcons name={sendPush ? 'notifications-active' : 'notifications-off'} size={20} color={sendPush ? theme.primary : theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>{fr ? 'Notification push' : 'Push notification'}</Text>
                  <Text style={styles.toggleDesc}>
                    {sendPush
                      ? (fr ? 'Tous les utilisateurs seront notifies' : 'All users will be notified')
                      : (fr ? 'Pas de notification push' : 'No push notification')}
                  </Text>
                </View>
                <Switch
                  value={sendPush}
                  onValueChange={setSendPush}
                  trackColor={{ false: theme.border, true: theme.primary + '60' }}
                  thumbColor={sendPush ? theme.primary : theme.textMuted}
                />
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* ===== LIVE PREVIEW ===== */}
        <Animated.View entering={FadeInDown.duration(300).delay(150)}>
          <View style={styles.previewSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionHeaderIcon, { backgroundColor: '#7C3AED' + '12' }]}>
                <MaterialIcons name="preview" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.sectionTitle}>{fr ? 'Apercu de la banniere' : 'Banner preview'}</Text>
            </View>

            <View style={styles.previewFrame}>
              <View style={styles.previewStatusBar}>
                <Text style={styles.previewTime}>9:41</Text>
                <View style={styles.previewNotch} />
                <View style={styles.previewBattery} />
              </View>

              {(messageFr.trim() || messageEn.trim() || isActive) ? (
                <View style={[styles.previewBanner, formMode === 'scheduled' && !isActive && { backgroundColor: '#2563EB' }]}>
                  <View style={styles.previewBannerInner}>
                    <View style={styles.previewIconWrap}>
                      <MaterialIcons name={formMode === 'scheduled' && !isActive ? 'schedule' : 'construction'} size={16} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.previewHeaderRow}>
                        <Text style={styles.previewTitle}>{formMode === 'scheduled' && !isActive ? (fr ? 'Maintenance prevue' : 'Scheduled') : 'Maintenance'}</Text>
                        {previewCountdown ? (
                          <View style={styles.previewCountdownBadge}>
                            <MaterialIcons name="timer" size={9} color="#FFF" />
                            <Text style={styles.previewCountdownText}>{previewCountdown}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.previewMessage} numberOfLines={2}>
                        {isActive
                          ? (fr ? status?.messageFr : status?.messageEn) || (fr ? messageFr : messageEn)
                          : (fr ? messageFr : messageEn) || (fr ? 'Maintenance en cours...' : 'Maintenance in progress...')}
                      </Text>
                    </View>
                    <View style={styles.previewCloseBtn}>
                      <MaterialIcons name="close" size={10} color="rgba(255,255,255,0.5)" />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.previewEmpty}>
                  <MaterialIcons name="visibility-off" size={20} color={theme.textMuted} />
                  <Text style={styles.previewEmptyText}>
                    {fr ? 'Saisissez un message pour visualiser' : 'Enter a message to preview'}
                  </Text>
                </View>
              )}

              <View style={styles.previewContent}>
                <View style={styles.previewPlaceholder} />
                <View style={[styles.previewPlaceholder, { width: '70%' }]} />
                <View style={[styles.previewPlaceholder, { width: '50%' }]} />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Action button */}
        {showForm ? (
          <Animated.View entering={FadeInDown.duration(300).delay(200)}>
            {formMode === 'scheduled' ? (
              <Pressable
                style={({ pressed }) => [styles.scheduleBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, (!messageFr.trim() && !messageEn.trim()) && styles.enableBtnDisabled]}
                onPress={handleSchedule}
                disabled={submitting || (!messageFr.trim() && !messageEn.trim())}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="schedule-send" size={20} color="#FFF" />
                    <Text style={styles.enableBtnText}>
                      {fr ? 'Planifier la maintenance' : 'Schedule maintenance'}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.enableBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, (!messageFr.trim() && !messageEn.trim()) && styles.enableBtnDisabled]}
                onPress={handleEnable}
                disabled={submitting || (!messageFr.trim() && !messageEn.trim())}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="warning-amber" size={20} color="#FFF" />
                    <Text style={styles.enableBtnText}>
                      {fr ? 'Activer le mode maintenance' : 'Enable maintenance mode'}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </Animated.View>
        ) : null}

        {/* ===== HISTORY ===== */}
        <Animated.View entering={FadeIn.duration(300).delay(250)}>
          <Pressable
            style={styles.historyToggle}
            onPress={() => { setShowHistory(!showHistory); Haptics.selectionAsync(); }}
          >
            <View style={[styles.sectionHeaderIcon, { backgroundColor: '#64748B' + '12' }]}>
              <MaterialIcons name="history" size={20} color="#64748B" />
            </View>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>
              {fr ? 'Historique' : 'History'} ({history.length})
            </Text>
            <MaterialIcons name={showHistory ? 'expand-less' : 'expand-more'} size={22} color={theme.textSecondary} />
          </Pressable>
        </Animated.View>

        {showHistory ? (
          <View style={styles.historyList}>
            {history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <MaterialIcons name="event-note" size={32} color={theme.textMuted} />
                <Text style={styles.historyEmptyText}>
                  {fr ? 'Aucun historique' : 'No history yet'}
                </Text>
              </View>
            ) : (
              history.map((log, idx) => {
                const isEnabled = log.action === 'enabled';
                const color = isEnabled ? '#D97706' : '#10B981';
                return (
                  <Animated.View key={log.id} entering={FadeInDown.duration(200).delay(idx * 30)}>
                    <View style={[styles.historyCard, { borderLeftColor: color }]}>
                      <View style={styles.historyCardHeader}>
                        <View style={[styles.historyIconBg, { backgroundColor: color + '12' }]}>
                          <MaterialIcons
                            name={isEnabled ? 'construction' : 'check-circle'}
                            size={16}
                            color={color}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyAction}>
                            {isEnabled
                              ? (fr ? 'Maintenance activee' : 'Maintenance enabled')
                              : (fr ? 'Maintenance desactivee' : 'Maintenance disabled')}
                          </Text>
                          <Text style={styles.historyDate}>{formatDate(log.createdAt)}</Text>
                        </View>
                        {log.pushSent ? (
                          <View style={styles.historyPushBadge}>
                            <MaterialIcons name="notifications" size={10} color={theme.primary} />
                            <Text style={styles.historyPushText}>Push</Text>
                            {(log.pushSentCount > 0 || log.pushErrorCount > 0) ? (
                              <View style={styles.historyPushStats}>
                                <Text style={styles.historyPushStatsText}>{log.pushSentCount}<Text style={{ color: '#94A3B8' }}>/</Text>{log.pushSentCount + log.pushErrorCount}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {log.messageFr || log.messageEn ? (
                        <View style={styles.historyMessage}>
                          {log.messageFr ? (
                            <View style={styles.historyMsgRow}>
                              <Text style={styles.historyMsgFlag}>🇫🇷</Text>
                              <Text style={styles.historyMsgText} numberOfLines={2}>{log.messageFr}</Text>
                            </View>
                          ) : null}
                          {log.messageEn ? (
                            <View style={styles.historyMsgRow}>
                              <Text style={styles.historyMsgFlag}>🇬🇧</Text>
                              <Text style={styles.historyMsgText} numberOfLines={2}>{log.messageEn}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {log.endTime ? (
                        <View style={styles.historyEndRow}>
                          <MaterialIcons name="timer" size={11} color={theme.textMuted} />
                          <Text style={styles.historyEndText}>
                            {fr ? 'Fin estimee' : 'Est. end'}: {formatDate(log.endTime)}
                          </Text>
                        </View>
                      ) : null}
                      {log.pushSent && (log.pushSentCount > 0 || log.pushErrorCount > 0) ? (
                        <View style={styles.historyPushDetail}>
                          <View style={styles.historyPushDetailItem}>
                            <MaterialIcons name="check-circle" size={11} color="#10B981" />
                            <Text style={[styles.historyPushDetailText, { color: '#10B981' }]}>{log.pushSentCount} {fr ? 'envoyes' : 'sent'}</Text>
                          </View>
                          {log.pushErrorCount > 0 ? (
                            <View style={styles.historyPushDetailItem}>
                              <MaterialIcons name="error-outline" size={11} color="#EF4444" />
                              <Text style={[styles.historyPushDetailText, { color: '#EF4444' }]}>{log.pushErrorCount} {fr ? 'erreurs' : 'errors'}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      <Text style={styles.historyAdmin}>
                        {fr ? 'Par' : 'By'} {log.adminName || 'Admin'}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Status card
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 16, gap: 14, borderWidth: 1.5, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  statusIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '700' },
  statusSub: { fontSize: 12, color: '#64748B', marginTop: 3 },
  statusEndRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusEndText: { fontSize: 11, color: '#D97706', fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },

  // Recap push card
  recapPushCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 12 },
  recapMessagesCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#10B981' + '20', marginBottom: 12 },

  // Disable btn
  disableBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 16, marginBottom: 20, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  disableBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Form section
  formSection: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  sectionHeaderIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },

  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fieldLabelFlag: { fontSize: 16 },
  fieldLabelText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  textInput: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 14, color: '#0F172A', lineHeight: 20, minHeight: 72, textAlignVertical: 'top', borderWidth: 1.5, borderColor: '#E2E8F0' },
  charCount: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 4 },

  // Duration
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  durationChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  durationChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  durationChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  durationChipTextActive: { color: '#FFF' },
  customDurationRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  customDurationField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', paddingHorizontal: 12, gap: 4 },
  customDurationInput: { width: 40, fontSize: 16, fontWeight: '600', color: '#0F172A', paddingVertical: 10, textAlign: 'center' },
  customDurationUnit: { fontSize: 13, color: '#64748B', fontWeight: '500' },

  // Toggle
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleDesc: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Preview
  previewSection: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  previewFrame: { backgroundColor: '#0F172A', borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: '#1E293B' },
  previewStatusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  previewTime: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  previewNotch: { width: 80, height: 20, borderRadius: 10, backgroundColor: '#000' },
  previewBattery: { width: 22, height: 10, borderRadius: 3, backgroundColor: '#4ADE80', borderWidth: 1, borderColor: '#22C55E' },
  previewBanner: { backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 8 },
  previewBannerInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  previewIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  previewTitle: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  previewCountdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  previewCountdownText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  previewMessage: { fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 13 },
  previewCloseBtn: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  previewEmpty: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  previewEmptyText: { fontSize: 11, color: '#64748B' },
  previewContent: { padding: 16, gap: 10 },
  previewPlaceholder: { height: 12, borderRadius: 6, backgroundColor: '#1E293B', width: '90%' },

  // Mode toggle
  modeToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 3, marginBottom: 18, gap: 3 },
  modeToggleItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeToggleItemActive: { backgroundColor: '#0F172A' },
  modeToggleItemActiveBlue: { backgroundColor: '#2563EB' },
  modeToggleText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  modeToggleTextActive: { color: '#FFF' },

  // Schedule
  customScheduleRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  schedulePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#DBEAFE' },
  schedulePreviewText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },
  scheduledInfoCard: { backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#DBEAFE' },
  scheduledInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  scheduledInfoTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 3 },
  scheduledInfoDesc: { fontSize: 12, color: '#3B82F6', lineHeight: 17 },
  scheduledPushBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' },
  scheduledPushText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
  cancelScheduleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', paddingVertical: 14, borderRadius: 14, marginBottom: 20, borderWidth: 1, borderColor: '#FECACA' },
  cancelScheduleBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // Enable btn
  enableBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#D97706', paddingVertical: 16, borderRadius: 16, marginBottom: 20, shadowColor: '#D97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  scheduleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 16, marginBottom: 20, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  enableBtnDisabled: { opacity: 0.5 },
  enableBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // History
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  historyList: { gap: 6, marginBottom: 16 },
  historyEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  historyEmptyText: { fontSize: 13, color: '#94A3B8' },
  historyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3 },
  historyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  historyIconBg: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  historyAction: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  historyDate: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  historyPushBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.primary + '10', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyPushText: { fontSize: 10, fontWeight: '700', color: theme.primary },
  historyMessage: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8, gap: 6 },
  historyMsgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  historyMsgFlag: { fontSize: 12 },
  historyMsgText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 17 },
  historyEndRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  historyEndText: { fontSize: 11, color: '#94A3B8' },
  historyPushStats: { backgroundColor: '#EFF6FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, marginLeft: 2 },
  historyPushStatsText: { fontSize: 9, fontWeight: '700', color: theme.primary },
  historyPushDetail: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  historyPushDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyPushDetailText: { fontSize: 11, fontWeight: '600' },
  historyAdmin: { fontSize: 10, color: '#CBD5E1', marginTop: 6, fontWeight: '500' },
});
