import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform, RefreshControl, Share as RNShare } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import theme, { blurhash } from '@/constants/theme';
import { useAuth, useAlert } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import {
  getSponsoredEvent, getEventParticipants, getMyParticipationStatus,
  registerForEvent, declineEvent, withdrawFromEvent, attestAsWitness, publishResults,
  cancelSponsoredEvent, inviteUsersToEvent, reinviteUser, SponsoredEvent, SponsoredEventParticipant,
} from '@/services/sponsoredEventService';
import { getSupabaseClient } from '@/template';
import { Dimensions, Modal, FlatList, TextInput } from 'react-native';
import { config } from '@/constants/config';
import QRCode from 'react-native-qrcode-svg';
import {
  scheduleEventReminders, cancelEventReminders, getScheduledEventReminders,
  markAllEventNotificationsRead, EventReminderSettings,
} from '@/services/eventNotificationService';
import { requestNotificationPermissions, areNotificationsEnabled } from '@/services/notificationService';
import * as Haptics from '@/services/haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Switch } from 'react-native';

export default function SponsoredEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { language } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [event, setEvent] = useState<SponsoredEvent | null>(null);
  const [participants, setParticipants] = useState<SponsoredEventParticipant[]>([]);
  const [myStatus, setMyStatus] = useState<string | null>(null);

  // Reminders state
  const [reminderDay, setReminderDay] = useState(false);
  const [reminder3h, setReminder3h] = useState(false);
  const [reminder1h, setReminder1h] = useState(false);
  const [remindersLoading, setRemindersLoading] = useState(false);

  const [prevAcceptedCount, setPrevAcceptedCount] = useState(0);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const shareSheetHeight = useMemo(() => Math.round(Dimensions.get('window').height * 0.88), []);

  const isCreator = event?.creatorUserId === user?.id;
  const acceptedCount = participants.filter(p => p.status === 'accepted' || p.status === 'completed').length;
  const completedCount = participants.filter(p => p.status === 'completed').length;
  const recentRegistrants = [...participants].filter(p => p.status === 'accepted' || p.status === 'completed').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  const fillPercent = event ? Math.min(100, Math.round((acceptedCount / event.maxParticipants) * 100)) : 0;

  const loadData = useCallback(async () => {
    if (!id) return;
    const [{ event: ev }, { participants: parts }, status] = await Promise.all([
      getSponsoredEvent(id),
      getEventParticipants(id),
      getMyParticipationStatus(id),
    ]);
    setEvent(ev);
    setParticipants(parts);
    setMyStatus(status);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Detect new participants for badge animation
  useEffect(() => {
    if (acceptedCount > prevAcceptedCount && prevAcceptedCount > 0) {
      setShowNewBadge(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const t = setTimeout(() => setShowNewBadge(false), 3000);
      return () => clearTimeout(t);
    }
    setPrevAcceptedCount(acceptedCount);
  }, [acceptedCount]);

  // Poll for participant updates every 15s when event is active/upcoming
  useEffect(() => {
    if (!id || !event || event.status === 'completed' || event.status === 'cancelled') return;
    const interval = setInterval(async () => {
      const { participants: parts } = await getEventParticipants(id);
      setParticipants(parts);
    }, 15000);
    return () => clearInterval(interval);
  }, [id, event?.status]);

  // Load reminder state
  useEffect(() => {
    if (id) {
      getScheduledEventReminders(id).then(state => {
        setReminderDay(state.oneDayBefore);
        setReminder3h(state.threeHoursBefore);
        setReminder1h(state.oneHourBefore);
      });
      // Mark notifications as read when viewing the event
      markAllEventNotificationsRead(id);
    }
  }, [id]);

  const handleRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleToggleReminder = async (type: 'day' | '3h' | '1h', value: boolean) => {
    if (!event) return;
    const startTime = new Date(event.startTime);
    if (startTime <= new Date()) {
      showAlert(language === 'fr' ? 'Evenement passe' : 'Event past', language === 'fr' ? 'Les rappels ne sont disponibles que pour les evenements a venir' : 'Reminders are only available for upcoming events');
      return;
    }
    const perms = await areNotificationsEnabled();
    if (!perms) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        showAlert(language === 'fr' ? 'Permission requise' : 'Permission required', language === 'fr' ? 'Activez les notifications dans les reglages' : 'Enable notifications in settings');
        return;
      }
    }
    Haptics.selectionAsync();
    const newDay = type === 'day' ? value : reminderDay;
    const new3h = type === '3h' ? value : reminder3h;
    const new1h = type === '1h' ? value : reminder1h;
    setReminderDay(newDay);
    setReminder3h(new3h);
    setReminder1h(new1h);
    setRemindersLoading(true);
    if (!newDay && !new3h && !new1h) {
      await cancelEventReminders(event.id);
    } else {
      await scheduleEventReminders({
        eventId: event.id,
        eventTitle: event.title,
        startTime,
        oneDayBefore: newDay,
        threeHoursBefore: new3h,
        oneHourBefore: new1h,
      });
    }
    setRemindersLoading(false);
  };

  const handleRegister = async () => {
    if (!id) return;
    const { error } = await registerForEvent(id);
    if (error) { showAlert(language === 'fr' ? 'Erreur' : 'Error', error); return; }
    setMyStatus('accepted');
    // Auto-schedule reminders on registration
    if (event) {
      const startTime = new Date(event.startTime);
      if (startTime > new Date()) {
        const perms = await areNotificationsEnabled();
        if (perms) {
          await scheduleEventReminders({ eventId: event.id, eventTitle: event.title, startTime, oneDayBefore: true, threeHoursBefore: true, oneHourBefore: true });
          setReminderDay(true); setReminder3h(true); setReminder1h(true);
        }
      }
    }
    loadData();
  };

  const handleDecline = async () => {
    if (!id) return;
    await declineEvent(id);
    setMyStatus('declined');
    loadData();
  };

  const handleWithdraw = async () => {
    if (!id) return;
    showAlert(
      language === 'fr' ? 'Se desinscrire ?' : 'Withdraw?',
      language === 'fr' ? 'Vous serez retire de la liste des participants.' : 'You will be removed from the participant list.',
      [
        { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: language === 'fr' ? 'Confirmer' : 'Confirm', style: 'destructive', onPress: async () => {
          const { error } = await withdrawFromEvent(id);
          if (error) { showAlert(language === 'fr' ? 'Erreur' : 'Error', error); return; }
          setMyStatus(null);
          loadData();
        }},
      ]
    );
  };

  const handleAttest = async (participantId: string) => {
    if (!id) return;
    const { error } = await attestAsWitness(id, participantId);
    if (error) { showAlert(language === 'fr' ? 'Erreur' : 'Error', error); return; }
    showAlert(language === 'fr' ? 'Attestation enregistree' : 'Attestation recorded');
    loadData();
  };

  const handlePublish = async () => {
    if (!id) return;
    showAlert(language === 'fr' ? 'Publier les resultats ?' : 'Publish results?', language === 'fr' ? 'Les classements seront calcules et publies.' : 'Rankings will be calculated and published.', [
      { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
      { text: language === 'fr' ? 'Publier' : 'Publish', onPress: async () => {
        const { error } = await publishResults(id);
        if (error) { showAlert('Error', error); return; }
        loadData();
      }},
    ]);
  };

  const handleCancel = async () => {
    if (!id) return;
    showAlert(language === 'fr' ? 'Annuler l\'evenement ?' : 'Cancel event?', '', [
      { text: language === 'fr' ? 'Non' : 'No', style: 'cancel' },
      { text: language === 'fr' ? 'Oui' : 'Yes', style: 'destructive', onPress: async () => {
        await cancelSponsoredEvent(id);
        router.back();
      }},
    ]);
  };

  const [showShareModal, setShowShareModal] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [playerPickerSearch, setPlayerPickerSearch] = useState('');
  const [myPlayers, setMyPlayers] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [invitingPlayerIds, setInvitingPlayerIds] = useState<Set<string>>(new Set());
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchInviting, setBatchInviting] = useState(false);
  const [reinvitingUserId, setReinvitingUserId] = useState<string | null>(null);

  const handleShare = async () => {
    setShowShareModal(true);
  };

  const handleShareOption = async (option: 'native' | 'code' | 'link' | 'inapp') => {
    if (!event) return;
    Haptics.selectionAsync();
    const shareMsg = language === 'fr'
      ? `Rejoins mon defi ambassadeur "${event.title}" sur Ultimate Petanque !\nCode: ${event.shareCode}\nType: ${challengeName(event.challengeType)}\n${event.city ? `Lieu: ${event.city}` : ''}\nDate: ${new Date(event.startTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}\n\nTelecharge l'app: ${config.appDownloadUrl}`
      : `Join my ambassador challenge "${event.title}" on Ultimate Petanque!\nCode: ${event.shareCode}\nType: ${challengeName(event.challengeType)}\n${event.city ? `Location: ${event.city}` : ''}\nDate: ${new Date(event.startTime).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}\n\nDownload the app: ${config.appDownloadUrl}`;

    if (option === 'native') {
      setShowShareModal(false);
      try { await RNShare.share({ message: shareMsg }); } catch {}
    } else if (option === 'code') {
      setShowShareModal(false);
      try {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(event.shareCode);
        showAlert(language === 'fr' ? 'Code copie' : 'Code copied', language === 'fr' ? `Code "${event.shareCode}" copie dans le presse-papier` : `Code "${event.shareCode}" copied to clipboard`);
      } catch {
        try { await RNShare.share({ message: event.shareCode }); } catch {}
      }
    } else if (option === 'link') {
      setShowShareModal(false);
      try {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(shareMsg);
        showAlert(language === 'fr' ? 'Message copie' : 'Message copied', language === 'fr' ? 'Le message d\'invitation a ete copie' : 'Invitation message has been copied');
      } catch {
        try { await RNShare.share({ message: shareMsg }); } catch {}
      }
    } else if (option === 'inapp') {
      setShowShareModal(false);
      try { await RNShare.share({ message: shareMsg }); } catch {}
    }
  };

  // Load players for invitation picker
  const loadPlayersForInvite = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPlayers(true);
    const supabase = getSupabaseClient();
    try {
      // Get user's players that have user accounts (user_id linked)
      const { data: allPlayers } = await supabase
        .from('players')
        .select('id, name, user_id, avatar, club, role')
        .eq('user_id', user.id)
        .order('name');

      // Also get public players from community
      const { data: publicPlayers } = await supabase
        .from('players')
        .select('id, name, user_id, avatar, club, role')
        .eq('is_public', true)
        .neq('user_id', user.id)
        .not('user_id', 'is', null)
        .limit(100);

      const combined = [...(allPlayers || []), ...(publicPlayers || [])];
      // Deduplicate by user_id
      const seen = new Set<string>();
      const unique = combined.filter(p => {
        if (!p.user_id || seen.has(p.user_id)) return false;
        seen.add(p.user_id);
        return p.user_id !== user.id;
      });
      setMyPlayers(unique);

      // Mark already-invited participants
      if (id) {
        const { data: existingParts } = await supabase
          .from('sponsored_event_participants')
          .select('user_id')
          .eq('event_id', id);
        const existingSet = new Set((existingParts || []).map((p: any) => p.user_id));
        setInvitedPlayerIds(existingSet);
      }
    } catch { /* silent */ }
    setLoadingPlayers(false);
  }, [user?.id, id]);

  const handleInvitePlayer = useCallback(async (targetUserId: string, playerName: string) => {
    if (!id || !event) return;
    setInvitingPlayerIds(prev => new Set([...prev, targetUserId]));
    const { invited, error: invErr } = await inviteUsersToEvent(id, [targetUserId]);
    setInvitingPlayerIds(prev => { const next = new Set(prev); next.delete(targetUserId); return next; });
    if (invErr) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', invErr);
      return;
    }
    if (invited === 0) {
      showAlert(language === 'fr' ? 'Deja inscrit' : 'Already registered');
    } else {
      setInvitedPlayerIds(prev => new Set([...prev, targetUserId]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Send targeted push notification to specific invited user
      try {
        const supabase = getSupabaseClient();
        const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', user?.id).maybeSingle();
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'event_created',
            payload: {
              eventId: id,
              eventTitle: event.title,
              city: event.city,
              challengeType: event.challengeType,
              ambassadorName: profile?.username || 'Ambassadeur',
              targetUserIds: [targetUserId],
            },
          },
        });
      } catch { /* silent */ }
    }
    loadData();
  }, [id, event, user?.id, language]);

  const filteredPlayers = useMemo(() => {
    if (!playerPickerSearch.trim()) return myPlayers;
    const q = playerPickerSearch.toLowerCase();
    return myPlayers.filter(p => p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q));
  }, [myPlayers, playerPickerSearch]);

  const selectablePlayers = useMemo(() => {
    return filteredPlayers.filter(p => !invitedPlayerIds.has(p.user_id));
  }, [filteredPlayers, invitedPlayerIds]);

  const toggleSelectPlayer = useCallback((userId: string) => {
    setSelectedForBatch(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedForBatch.size === selectablePlayers.length) {
      setSelectedForBatch(new Set());
    } else {
      setSelectedForBatch(new Set(selectablePlayers.map(p => p.user_id)));
    }
  }, [selectablePlayers, selectedForBatch.size]);

  const handleBatchInvite = useCallback(async () => {
    if (!id || !event || selectedForBatch.size === 0) return;
    setBatchInviting(true);
    const userIds = Array.from(selectedForBatch);
    const { invited, error: invErr } = await inviteUsersToEvent(id, userIds);
    setBatchInviting(false);
    if (invErr) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', invErr);
      return;
    }
    if (invited === 0) {
      showAlert(language === 'fr' ? 'Tous deja inscrits' : 'All already registered');
    } else {
      setInvitedPlayerIds(prev => {
        const next = new Set(prev);
        userIds.forEach(uid => next.add(uid));
        return next;
      });
      setSelectedForBatch(new Set());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        language === 'fr' ? 'Invitations envoyees' : 'Invitations sent',
        language === 'fr' ? `${invited} joueur(s) invite(s) avec succes` : `${invited} player(s) invited successfully`
      );
      // Send targeted batch push notification to specific invited users
      try {
        const supabase = getSupabaseClient();
        const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', user?.id).maybeSingle();
        await supabase.functions.invoke('send-push', {
          body: {
            type: 'event_created',
            payload: {
              eventId: id,
              eventTitle: event.title,
              city: event.city,
              challengeType: event.challengeType,
              ambassadorName: profile?.username || 'Ambassadeur',
              targetUserIds: userIds,
            },
          },
        });
      } catch { /* silent */ }
    }
    loadData();
  }, [id, event, selectedForBatch, user?.id, language]);

  const handleReinvite = useCallback(async (userId: string, userName: string) => {
    if (!id) return;
    setReinvitingUserId(userId);
    Haptics.selectionAsync();
    const { error: err } = await reinviteUser(id, userId);
    setReinvitingUserId(null);
    if (err) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      language === 'fr' ? 'Reinvitation envoyee' : 'Re-invitation sent',
      language === 'fr' ? `${userName} a ete reinvite(e)` : `${userName} has been re-invited`
    );
    loadData();
  }, [id, language]);

  const invitationHistory = useMemo(() => {
    return [...participants].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [participants]);

  const challengeName = (type: string) => type === '10_tirs' ? '10 Tirs' : type === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision';

  if (loading) {
    return <SafeAreaView style={s.container}><View style={s.loadingWrap}><ActivityIndicator size="large" color={theme.primary} /></View></SafeAreaView>;
  }

  if (!event) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerRow}><Pressable onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} /></Pressable></View>
        <View style={s.loadingWrap}><Text style={{ color: theme.textMuted, fontSize: 16 }}>{language === 'fr' ? 'Evenement introuvable' : 'Event not found'}</Text></View>
      </SafeAreaView>
    );
  }

  const eventDateObj = new Date(event.startTime);
  const endDateObj = new Date(event.endTime);
  const isActive = event.status === 'active' || (event.status === 'upcoming' && new Date() >= eventDateObj && new Date() <= endDateObj);
  const isPast = event.status === 'completed' || new Date() > endDateObj;
  const rankedParticipants = [...participants].filter(p => p.status === 'completed' && p.rank).sort((a, b) => (a.rank || 99) - (b.rank || 99));

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}>

        {/* Header */}
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color="#FFF" /></Pressable>
          <View style={{ flex: 1 }} />
          <Pressable style={s.shareBtn} onPress={handleShare}><MaterialIcons name="share" size={20} color="#FFF" /></Pressable>
        </View>

        <LinearGradient colors={['#7C3AED', '#9333EA', '#A855F7']} style={s.heroGradient}>
          <View style={s.statusBadge}>
            <View style={[s.statusDot, { backgroundColor: event.status === 'active' ? '#22C55E' : event.status === 'completed' ? '#3B82F6' : event.status === 'cancelled' ? '#EF4444' : '#F59E0B' }]} />
            <Text style={s.statusText}>{event.status === 'upcoming' ? (language === 'fr' ? 'A venir' : 'Upcoming') : event.status === 'active' ? (language === 'fr' ? 'En cours' : 'Active') : event.status === 'completed' ? (language === 'fr' ? 'Termine' : 'Completed') : (language === 'fr' ? 'Annule' : 'Cancelled')}</Text>
          </View>
          <Text style={s.heroTitle}>{event.title}</Text>
          <View style={s.heroMeta}>
            <View style={s.heroMetaItem}><MaterialIcons name="track-changes" size={14} color="rgba(255,255,255,0.7)" /><Text style={s.heroMetaText}>{challengeName(event.challengeType)}</Text></View>
            <View style={s.heroMetaItem}><MaterialIcons name="event" size={14} color="rgba(255,255,255,0.7)" /><Text style={s.heroMetaText}>{eventDateObj.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text></View>
            <View style={s.heroMetaItem}><MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.7)" /><Text style={s.heroMetaText}>{eventDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
          </View>
          {event.ambassadorName ? (
            <View style={s.sponsorRow}>
              {event.ambassadorPhoto ? <Image source={{ uri: event.ambassadorPhoto }} style={s.sponsorAvatar} contentFit="cover" transition={200} cachePolicy="memory-disk" /> : null}
              <Text style={s.sponsorName}>{language === 'fr' ? 'Par' : 'By'} {event.ambassadorName}</Text>
              <MaterialIcons name="verified" size={14} color="rgba(255,255,255,0.6)" />
            </View>
          ) : null}
        </LinearGradient>

        {/* Share Code */}
        <View style={s.codeCard}>
          <Text style={s.codeLabel}>{language === 'fr' ? 'Code evenement' : 'Event code'}</Text>
          <Text style={s.codeValue}>{event.shareCode}</Text>
          <Text style={s.codeHint}>{language === 'fr' ? 'Partagez ce code pour inviter des participants' : 'Share this code to invite participants'}</Text>
        </View>

        {/* Info Grid */}
        <View style={s.infoGrid}>
          <View style={s.infoItem}>
            <MaterialIcons name={event.scope === 'terrain' ? 'place' : event.scope === 'city' ? 'location-city' : event.scope === 'country' ? 'flag' : 'public'} size={20} color={theme.primary} />
            <Text style={s.infoValue}>{event.terrainName || event.city || event.country || (language === 'fr' ? 'Mondial' : 'World')}</Text>
            <Text style={s.infoLabel}>{language === 'fr' ? 'Zone' : 'Zone'}</Text>
          </View>
          <View style={s.infoItem}>
            <MaterialIcons name="group" size={20} color={theme.success} />
            <Text style={s.infoValue}>{acceptedCount}/{event.maxParticipants}</Text>
            <Text style={s.infoLabel}>{language === 'fr' ? 'Inscrits' : 'Registered'}</Text>
          </View>
          <View style={s.infoItem}>
            <MaterialIcons name="visibility" size={20} color={theme.accent} />
            <Text style={s.infoValue}>{event.minWitnesses}</Text>
            <Text style={s.infoLabel}>{language === 'fr' ? 'Temoins min.' : 'Min. witnesses'}</Text>
          </View>
        </View>

        {event.description ? <View style={s.descCard}><Text style={s.descText}>{event.description}</Text></View> : null}

        {/* ===== PARTICIPANT COUNTER ===== */}
        <Animated.View entering={FadeInDown.duration(300)} style={s.counterCard}>
          <View style={s.counterHeader}>
            <View style={s.counterIconBg}>
              <MaterialIcons name="group" size={20} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.counterTitle}>{language === 'fr' ? 'Participants' : 'Participants'}</Text>
                {showNewBadge ? (
                  <Animated.View entering={FadeInDown.duration(300)} style={s.newBadge}>
                    <MaterialIcons name="person-add" size={10} color="#FFF" />
                    <Text style={s.newBadgeText}>+1</Text>
                  </Animated.View>
                ) : null}
              </View>
              <Text style={s.counterSubtitle}>{acceptedCount} / {event.maxParticipants} {language === 'fr' ? 'inscrits' : 'registered'}</Text>
            </View>
            <View style={s.counterValueBg}>
              <Text style={s.counterValue}>{fillPercent}%</Text>
            </View>
          </View>
          {/* Progress Bar */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${fillPercent}%`, backgroundColor: fillPercent >= 90 ? '#EF4444' : fillPercent >= 70 ? '#F59E0B' : '#7C3AED' }]} />
          </View>
          <View style={s.progressLabels}>
            <Text style={s.progressLabel}>0</Text>
            <Text style={[s.progressLabel, { color: fillPercent >= 90 ? '#EF4444' : '#7C3AED', fontWeight: '700' }]}>{acceptedCount}</Text>
            <Text style={s.progressLabel}>{event.maxParticipants}</Text>
          </View>
          {fillPercent >= 90 ? (
            <View style={s.almostFullBanner}>
              <MaterialIcons name="warning" size={14} color="#EF4444" />
              <Text style={s.almostFullText}>{language === 'fr' ? 'Presque complet !' : 'Almost full!'}</Text>
            </View>
          ) : null}
          {/* Recent Registrants */}
          {recentRegistrants.length > 0 ? (
            <View style={s.recentSection}>
              <Text style={s.recentTitle}>{language === 'fr' ? 'Derniers inscrits' : 'Recent registrants'}</Text>
              {recentRegistrants.map((p, idx) => (
                <Animated.View key={p.id} entering={FadeInDown.duration(200).delay(idx * 50)} style={s.recentRow}>
                  {p.userAvatar ? (
                    <Image source={{ uri: p.userAvatar }} style={s.recentAvatar} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[s.recentAvatar, { backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontWeight: '700', color: theme.primary, fontSize: 11 }}>{p.userName?.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.recentName} numberOfLines={1}>{p.userName} {p.userId === user?.id ? (language === 'fr' ? '(Vous)' : '(You)') : ''}</Text>
                    <Text style={s.recentDate}>{new Date(p.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={[s.recentStatusDot, { backgroundColor: p.status === 'completed' ? theme.success : theme.primary }]} />
                </Animated.View>
              ))}
            </View>
          ) : null}
        </Animated.View>

        {/* Reminders Section */}
        {(myStatus === 'accepted' || myStatus === 'completed' || isCreator) && !isPast && event.status !== 'cancelled' ? (
          <Animated.View entering={FadeInDown.duration(300)} style={s.remindersCard}>
            <View style={s.remindersHeader}>
              <View style={s.remindersIconBg}>
                <MaterialIcons name="notifications-active" size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.remindersTitle}>{language === 'fr' ? 'Rappels' : 'Reminders'}</Text>
                <Text style={s.remindersSubtitle}>
                  {(reminderDay || reminder3h || reminder1h)
                    ? `${[reminderDay, reminder3h, reminder1h].filter(Boolean).length} ${language === 'fr' ? 'rappel(s) programme(s)' : 'reminder(s) scheduled'}`
                    : (language === 'fr' ? 'Aucun rappel programme' : 'No reminders scheduled')}
                </Text>
              </View>
              {remindersLoading ? <ActivityIndicator size="small" color="#7C3AED" /> : null}
            </View>
            <View style={s.remindersList}>
              <View style={s.reminderItem}>
                <MaterialIcons name="today" size={16} color={reminderDay ? '#7C3AED' : theme.textMuted} />
                <Text style={[s.reminderLabel, reminderDay && { color: theme.textPrimary }]}>{language === 'fr' ? 'La veille (9h)' : 'Day before (9am)'}</Text>
                <Switch value={reminderDay} onValueChange={(v) => handleToggleReminder('day', v)} trackColor={{ false: theme.border, true: '#7C3AED60' }} thumbColor={reminderDay ? '#7C3AED' : theme.textMuted} />
              </View>
              <View style={s.reminderItem}>
                <MaterialIcons name="schedule" size={16} color={reminder3h ? '#7C3AED' : theme.textMuted} />
                <Text style={[s.reminderLabel, reminder3h && { color: theme.textPrimary }]}>{language === 'fr' ? '3 heures avant' : '3 hours before'}</Text>
                <Switch value={reminder3h} onValueChange={(v) => handleToggleReminder('3h', v)} trackColor={{ false: theme.border, true: '#7C3AED60' }} thumbColor={reminder3h ? '#7C3AED' : theme.textMuted} />
              </View>
              <View style={s.reminderItem}>
                <MaterialIcons name="alarm" size={16} color={reminder1h ? '#7C3AED' : theme.textMuted} />
                <Text style={[s.reminderLabel, reminder1h && { color: theme.textPrimary }]}>{language === 'fr' ? '1 heure avant' : '1 hour before'}</Text>
                <Switch value={reminder1h} onValueChange={(v) => handleToggleReminder('1h', v)} trackColor={{ false: theme.border, true: '#7C3AED60' }} thumbColor={reminder1h ? '#7C3AED' : theme.textMuted} />
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Registration CTA */}
        {!isPast && event.status !== 'cancelled' ? (
          <View style={s.ctaSection}>
            {myStatus === 'accepted' || myStatus === 'completed' ? (
              <View style={s.registeredBadge}>
                <MaterialIcons name="check-circle" size={20} color={theme.success} />
                <Text style={s.registeredText}>{language === 'fr' ? 'Vous etes inscrit' : 'You are registered'}</Text>
                {myStatus === 'accepted' ? (
                  <Pressable style={s.withdrawBtn} onPress={handleWithdraw}>
                    <Text style={s.withdrawBtnText}>{language === 'fr' ? 'Se desinscrire' : 'Withdraw'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : myStatus === 'declined' ? (
              <View style={s.declinedBadge}>
                <MaterialIcons name="cancel" size={20} color={theme.textMuted} />
                <Text style={s.declinedText}>{language === 'fr' ? 'Vous avez decline' : 'You declined'}</Text>
                <Pressable style={s.reRegisterBtn} onPress={handleRegister}><Text style={s.reRegisterText}>{language === 'fr' ? 'Changer d\'avis' : 'Change mind'}</Text></Pressable>
              </View>
            ) : (
              <View style={s.ctaButtons}>
                <Pressable style={s.registerBtn} onPress={handleRegister}>
                  <MaterialIcons name="how-to-reg" size={20} color="#FFF" />
                  <Text style={s.registerBtnText}>{language === 'fr' ? 'S\'inscrire' : 'Register'}</Text>
                </Pressable>
                <Pressable style={s.declineBtn} onPress={handleDecline}>
                  <Text style={s.declineBtnText}>{language === 'fr' ? 'Decliner' : 'Decline'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {/* Results / Rankings */}
        {event.resultsPublished && rankedParticipants.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <MaterialIcons name="emoji-events" size={18} color={theme.carreauColor} />
              <Text style={s.sectionTitle}>{language === 'fr' ? 'Classement' : 'Rankings'}</Text>
            </View>
            {rankedParticipants.map((p) => {
              const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : null;
              return (
                <View key={p.id} style={[s.rankRow, p.rank === 1 && { backgroundColor: '#FEF3C7' }]}>
                  <Text style={s.rankNum}>{medal || `#${p.rank}`}</Text>
                  {p.userAvatar ? <Image source={{ uri: p.userAvatar }} style={s.rankAvatar} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[s.rankAvatar, { backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontWeight: '700', color: theme.primary }}>{p.userName?.charAt(0)}</Text></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={s.rankName}>{p.userName}</Text>
                    <View style={s.rankWitnessRow}>
                      <MaterialIcons name="visibility" size={11} color={p.witnessesAttested! >= event.minWitnesses ? theme.success : theme.textMuted} />
                      <Text style={[s.rankWitnessText, p.witnessesAttested! >= event.minWitnesses && { color: theme.success }]}>{p.witnessesAttested}/{event.minWitnesses}</Text>
                    </View>
                  </View>
                  <Text style={s.rankScore}>{p.scoreValue !== undefined ? `${p.scoreValue}%` : '-'}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Participants List */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <MaterialIcons name="group" size={18} color={theme.primary} />
            <Text style={s.sectionTitle}>{language === 'fr' ? 'Participants' : 'Participants'} ({acceptedCount})</Text>
          </View>
          {participants.length === 0 ? (
            <View style={s.emptyParticipants}>
              <MaterialIcons name="person-add" size={32} color={theme.textMuted} />
              <Text style={s.emptyParticipantsText}>{language === 'fr' ? 'Aucun participant' : 'No participants'}</Text>
            </View>
          ) : (
            participants.filter(p => p.status !== 'declined').map((p) => (
              <View key={p.id} style={s.participantRow}>
                {p.userAvatar ? <Image source={{ uri: p.userAvatar }} style={s.participantAvatar} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[s.participantAvatar, { backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontWeight: '700', color: theme.primary, fontSize: 13 }}>{p.userName?.charAt(0)}</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={s.participantName}>{p.userName} {p.userId === user?.id ? (language === 'fr' ? '(Vous)' : '(You)') : ''}</Text>
                  <View style={s.participantStatusRow}>
                    <View style={[s.participantStatusBadge, { backgroundColor: p.status === 'completed' ? theme.success + '15' : p.status === 'accepted' ? theme.primary + '15' : theme.warning + '15' }]}>
                      <Text style={[s.participantStatusText, { color: p.status === 'completed' ? theme.success : p.status === 'accepted' ? theme.primary : theme.warning }]}>{p.status === 'completed' ? (language === 'fr' ? 'Termine' : 'Done') : p.status === 'accepted' ? (language === 'fr' ? 'Inscrit' : 'Registered') : (language === 'fr' ? 'En attente' : 'Pending')}</Text>
                    </View>
                    {p.status === 'completed' ? (
                      <View style={s.witnessInfo}>
                        <MaterialIcons name="visibility" size={12} color={p.witnessesAttested! >= event.minWitnesses ? theme.success : theme.warning} />
                        <Text style={s.witnessInfoText}>{p.witnessesAttested}/{event.minWitnesses}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {p.status === 'completed' && p.scoreValue !== undefined ? <Text style={s.participantScore}>{p.scoreValue}%</Text> : null}
                {/* Attest button (if not self and participant completed) */}
                {p.status === 'completed' && p.userId !== user?.id ? (
                  <Pressable style={s.attestBtn} onPress={() => handleAttest(p.id)}>
                    <MaterialIcons name="verified" size={16} color={theme.success} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Invitation History */}
        {isCreator && invitationHistory.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <MaterialIcons name="history" size={18} color="#7C3AED" />
              <Text style={s.sectionTitle}>{language === 'fr' ? 'Historique des invitations' : 'Invitation History'}</Text>
              <View style={{ flex: 1 }} />
              <View style={s.invHistoryCount}>
                <Text style={s.invHistoryCountText}>{invitationHistory.length}</Text>
              </View>
            </View>
            {invitationHistory.map((p) => {
              const statusConfig = p.status === 'accepted' || p.status === 'completed'
                ? { color: theme.success, icon: 'check-circle' as const, label: p.status === 'completed' ? (language === 'fr' ? 'Termine' : 'Completed') : (language === 'fr' ? 'Accepte' : 'Accepted') }
                : p.status === 'declined'
                  ? { color: theme.error, icon: 'cancel' as const, label: language === 'fr' ? 'Decline' : 'Declined' }
                  : { color: '#F59E0B', icon: 'schedule' as const, label: language === 'fr' ? 'En attente' : 'Pending' };
              return (
                <View key={`inv-${p.id}`} style={s.invHistoryRow}>
                  {p.userAvatar ? (
                    <Image source={{ uri: p.userAvatar }} style={s.invHistoryAvatar} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[s.invHistoryAvatar, { backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontWeight: '700', color: theme.primary, fontSize: 12 }}>{p.userName?.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.invHistoryName} numberOfLines={1}>{p.userName} {p.userId === user?.id ? (language === 'fr' ? '(Vous)' : '(You)') : ''}</Text>
                    <Text style={s.invHistoryDate}>
                      {language === 'fr' ? 'Invite le' : 'Invited'} {new Date(p.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {p.respondedAt ? (
                      <Text style={s.invHistoryRespondDate}>
                        {language === 'fr' ? 'Repondu le' : 'Responded'} {new Date(p.respondedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[s.invHistoryStatusBadge, { backgroundColor: statusConfig.color + '15' }]}>
                    <MaterialIcons name={statusConfig.icon} size={12} color={statusConfig.color} />
                    <Text style={[s.invHistoryStatusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                  </View>
                  {p.status === 'declined' ? (
                    <Pressable
                      style={[s.invHistoryReinviteBtn, reinvitingUserId === p.userId && { opacity: 0.5 }]}
                      onPress={() => handleReinvite(p.userId, p.userName || '')}
                      disabled={reinvitingUserId === p.userId}
                    >
                      {reinvitingUserId === p.userId ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                      ) : (
                        <MaterialIcons name="refresh" size={16} color="#7C3AED" />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ===== ANALYTICS DASHBOARD ===== */}
        {isCreator && participants.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)} style={s.section}>
            <View style={s.sectionHeader}>
              <MaterialIcons name="analytics" size={18} color="#7C3AED" />
              <Text style={s.sectionTitle}>{language === 'fr' ? 'Analytiques' : 'Analytics'}</Text>
            </View>
            {/* Conversion Funnel */}
            <View style={s.analyticsCard}>
              <Text style={s.analyticsCardTitle}>{language === 'fr' ? 'Entonnoir de conversion' : 'Conversion Funnel'}</Text>
              {(() => {
                const invited = participants.length;
                const accepted = participants.filter(p => p.status === 'accepted' || p.status === 'completed').length;
                const completed = participants.filter(p => p.status === 'completed').length;
                const declined = participants.filter(p => p.status === 'declined').length;
                const pending = participants.filter(p => p.status === 'pending').length;
                const steps = [
                  { label: language === 'fr' ? 'Invites' : 'Invited', count: invited, color: '#94A3B8', pct: 100 },
                  { label: language === 'fr' ? 'Acceptes' : 'Accepted', count: accepted, color: '#7C3AED', pct: invited > 0 ? Math.round((accepted / invited) * 100) : 0 },
                  { label: language === 'fr' ? 'Termines' : 'Completed', count: completed, color: theme.success, pct: invited > 0 ? Math.round((completed / invited) * 100) : 0 },
                ];
                return (
                  <View style={{ gap: 8 }}>
                    {steps.map((step, idx) => (
                      <View key={idx} style={s.funnelRow}>
                        <View style={{ width: 80 }}>
                          <Text style={s.funnelLabel}>{step.label}</Text>
                          <Text style={[s.funnelCount, { color: step.color }]}>{step.count}</Text>
                        </View>
                        <View style={s.funnelBarTrack}>
                          <View style={[s.funnelBarFill, { width: `${step.pct}%`, backgroundColor: step.color }]} />
                        </View>
                        <Text style={s.funnelPct}>{step.pct}%</Text>
                      </View>
                    ))}
                    <View style={s.funnelStatsRow}>
                      <View style={s.funnelStatChip}>
                        <MaterialIcons name="schedule" size={12} color="#F59E0B" />
                        <Text style={s.funnelStatText}>{pending} {language === 'fr' ? 'en attente' : 'pending'}</Text>
                      </View>
                      <View style={s.funnelStatChip}>
                        <MaterialIcons name="cancel" size={12} color={theme.error} />
                        <Text style={s.funnelStatText}>{declined} {language === 'fr' ? 'declines' : 'declined'}</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Registration Timeline */}
            <View style={[s.analyticsCard, { marginTop: 10 }]}>
              <Text style={s.analyticsCardTitle}>{language === 'fr' ? 'Inscriptions dans le temps' : 'Registration Over Time'}</Text>
              {(() => {
                // Group registrations by day
                const dayMap = new Map<string, number>();
                participants.forEach(p => {
                  const day = new Date(p.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                  dayMap.set(day, (dayMap.get(day) || 0) + 1);
                });
                const entries = Array.from(dayMap.entries()).slice(-7);
                const maxVal = Math.max(...entries.map(e => e[1]), 1);
                return entries.length > 0 ? (
                  <View style={s.timelineChart}>
                    {entries.map(([day, count], idx) => (
                      <View key={idx} style={s.timelineBarCol}>
                        <Text style={s.timelineBarValue}>{count}</Text>
                        <View style={[s.timelineBar, { height: Math.max(8, (count / maxVal) * 60) }]} />
                        <Text style={s.timelineBarLabel}>{day}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={s.analyticsEmpty}>{language === 'fr' ? 'Pas encore de donnees' : 'No data yet'}</Text>;
              })()}
            </View>

            {/* Demographics */}
            <View style={[s.analyticsCard, { marginTop: 10 }]}>
              <Text style={s.analyticsCardTitle}>{language === 'fr' ? 'Demographie des participants' : 'Participant Demographics'}</Text>
              {(() => {
                // We show club distribution from participant names since we have limited data
                const statusCounts = { accepted: 0, completed: 0, pending: 0, declined: 0 };
                participants.forEach(p => { statusCounts[p.status as keyof typeof statusCounts] = (statusCounts[p.status as keyof typeof statusCounts] || 0) + 1; });
                const totalWitnesses = participants.reduce((s, p) => s + (p.witnessCount || 0), 0);
                const totalAttested = participants.reduce((s, p) => s + (p.witnessesAttested || 0), 0);
                const attestRate = totalWitnesses > 0 ? Math.round((totalAttested / totalWitnesses) * 100) : 0;
                return (
                  <View style={s.demoGrid}>
                    <View style={s.demoItem}>
                      <View style={[s.demoIconBg, { backgroundColor: theme.success + '15' }]}>
                        <MaterialIcons name="group" size={16} color={theme.success} />
                      </View>
                      <Text style={s.demoValue}>{participants.length}</Text>
                      <Text style={s.demoLabel}>{language === 'fr' ? 'Total' : 'Total'}</Text>
                    </View>
                    <View style={s.demoItem}>
                      <View style={[s.demoIconBg, { backgroundColor: '#7C3AED15' }]}>
                        <MaterialIcons name="check-circle" size={16} color="#7C3AED" />
                      </View>
                      <Text style={s.demoValue}>{statusCounts.completed}</Text>
                      <Text style={s.demoLabel}>{language === 'fr' ? 'Termines' : 'Completed'}</Text>
                    </View>
                    <View style={s.demoItem}>
                      <View style={[s.demoIconBg, { backgroundColor: theme.accent + '15' }]}>
                        <MaterialIcons name="visibility" size={16} color={theme.accent} />
                      </View>
                      <Text style={s.demoValue}>{attestRate}%</Text>
                      <Text style={s.demoLabel}>{language === 'fr' ? 'Taux attestation' : 'Attest rate'}</Text>
                    </View>
                    <View style={s.demoItem}>
                      <View style={[s.demoIconBg, { backgroundColor: '#F59E0B15' }]}>
                        <MaterialIcons name="verified" size={16} color="#F59E0B" />
                      </View>
                      <Text style={s.demoValue}>{totalAttested}/{totalWitnesses}</Text>
                      <Text style={s.demoLabel}>{language === 'fr' ? 'Temoins' : 'Witnesses'}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          </Animated.View>
        ) : null}

        {/* Creator Actions */}
        {isCreator ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <MaterialIcons name="settings" size={18} color={theme.textSecondary} />
              <Text style={s.sectionTitle}>{language === 'fr' ? 'Actions' : 'Actions'}</Text>
            </View>
            {!event.resultsPublished && completedCount > 0 ? (
              <Pressable style={s.actionBtn} onPress={handlePublish}>
                <MaterialIcons name="leaderboard" size={20} color={theme.carreauColor} />
                <Text style={s.actionBtnText}>{language === 'fr' ? 'Publier les resultats' : 'Publish results'}</Text>
              </Pressable>
            ) : null}
            {event.status !== 'cancelled' && event.status !== 'completed' ? (
              <Pressable style={[s.actionBtn, { borderColor: theme.error + '30' }]} onPress={handleCancel}>
                <MaterialIcons name="cancel" size={20} color={theme.error} />
                <Text style={[s.actionBtnText, { color: theme.error }]}>{language === 'fr' ? 'Annuler l\'evenement' : 'Cancel event'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

      </ScrollView>

      {/* Share Options Modal */}
      <Modal visible={showShareModal} animationType="slide" transparent onRequestClose={() => setShowShareModal(false)}>
        <View style={s.shareOverlay}>
          <View style={[s.shareContent, { height: shareSheetHeight }]}>
            <View style={s.shareHeader}>
              <Text style={s.shareHeaderTitle}>{language === 'fr' ? 'Partager le defi' : 'Share challenge'}</Text>
              <Pressable style={s.shareCloseBtn} onPress={() => setShowShareModal(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={s.shareBodyScroll}
              contentContainerStyle={[s.shareScrollContent, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >

            {/* Event preview */}
            <View style={s.sharePreview}>
              <LinearGradient colors={['#7C3AED', '#9333EA']} style={s.sharePreviewGradient}>
                <MaterialIcons name="campaign" size={20} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <Text style={s.sharePreviewTitle} numberOfLines={1}>{event?.title}</Text>
                  <Text style={s.sharePreviewSub}>{challengeName(event?.challengeType || '')} {event?.city ? `• ${event.city}` : ''}</Text>
                </View>
                <View style={s.sharePreviewCode}>
                  <Text style={s.sharePreviewCodeText}>{event?.shareCode}</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Share options */}
            <View style={s.shareOptions}>
              <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => handleShareOption('native')}>
                <View style={[s.shareOptionIcon, { backgroundColor: '#7C3AED15' }]}>
                  <MaterialIcons name="share" size={22} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Partager via...' : 'Share via...'}</Text>
                  <Text style={s.shareOptionDesc}>{language === 'fr' ? 'WhatsApp, SMS, e-mail, etc.' : 'WhatsApp, SMS, email, etc.'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => handleShareOption('code')}>
                <View style={[s.shareOptionIcon, { backgroundColor: '#F59E0B15' }]}>
                  <MaterialIcons name="content-copy" size={22} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Copier le code' : 'Copy code'}</Text>
                  <Text style={s.shareOptionDesc}>{language === 'fr' ? `Code: ${event?.shareCode}` : `Code: ${event?.shareCode}`}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => handleShareOption('link')}>
                <View style={[s.shareOptionIcon, { backgroundColor: '#3B82F615' }]}>
                  <MaterialIcons name="description" size={22} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Copier l\'invitation' : 'Copy invitation'}</Text>
                  <Text style={s.shareOptionDesc}>{language === 'fr' ? 'Message complet avec details' : 'Full message with details'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => { setShowShareModal(false); router.push({ pathname: '/share-card', params: { type: 'sponsored-event', id: event?.id } } as any); }}>
                <View style={[s.shareOptionIcon, { backgroundColor: '#A855F715' }]}>
                  <MaterialIcons name="camera-alt" size={22} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Partage reseaux sociaux' : 'Social Media Share'}</Text>
                  <Text style={s.shareOptionDesc}>{language === 'fr' ? 'Image avec QR code pour Instagram, TikTok, Facebook' : 'Image with QR code for Instagram, TikTok, Facebook'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => { setShowShareModal(false); router.push('/share-hub' as any); }}>
                <View style={[s.shareOptionIcon, { backgroundColor: '#22C55E15' }]}>
                  <MaterialIcons name="qr-code-2" size={22} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Mon code de partage' : 'My share code'}</Text>
                  <Text style={s.shareOptionDesc}>{language === 'fr' ? 'Partager via QR code / lien app' : 'Share via QR code / app link'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              {isCreator ? (
                <Pressable style={({ pressed }) => [s.shareOption, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => { setShowShareModal(false); loadPlayersForInvite(); setShowPlayerPicker(true); }}>
                  <View style={[s.shareOptionIcon, { backgroundColor: '#2563EB15' }]}>
                    <MaterialIcons name="person-add" size={22} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.shareOptionTitle}>{language === 'fr' ? 'Inviter des joueurs' : 'Invite players'}</Text>
                    <Text style={s.shareOptionDesc}>{language === 'fr' ? 'Envoyer des notifications directes' : 'Send direct push notifications'}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* QR Code */}
            <View style={s.shareQRSection}>
              <Text style={s.shareQRLabel}>{language === 'fr' ? 'QR Code de l\'evenement' : 'Event QR Code'}</Text>
              <View style={s.shareQRWrap}>
                <QRCode
                  value={`${config.appDownloadUrl}?event=${event?.shareCode || ''}`}
                  size={160}
                  color="#7C3AED"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={s.shareQRHint}>{language === 'fr' ? 'Scannez pour rejoindre' : 'Scan to join'}</Text>
            </View>

            {/* Tip */}
            <View style={s.shareTip}>
              <MaterialIcons name="lightbulb" size={16} color="#F59E0B" />
              <Text style={s.shareTipText}>
                {language === 'fr'
                  ? 'Les joueurs peuvent rejoindre en entrant le code dans l\'onglet Evenements sponsorises.'
                  : 'Players can join by entering the code in the Sponsored Events tab.'}
              </Text>
            </View>

            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Player Picker Modal */}
      <Modal visible={showPlayerPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPlayerPicker(false)}>
        <SafeAreaView style={s.container}>
          <View style={s.ppHeader}>
            <Pressable style={s.ppCloseBtn} onPress={() => setShowPlayerPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.ppTitle}>{language === 'fr' ? 'Inviter des joueurs' : 'Invite players'}</Text>
              <Text style={s.ppSubtitle}>{invitedPlayerIds.size} {language === 'fr' ? 'deja inscrit(s)' : 'already registered'}</Text>
            </View>
          </View>
          {/* Select All / Batch Header */}
          <View style={s.ppBatchHeader}>
            <Pressable style={s.ppSelectAllBtn} onPress={handleSelectAll}>
              <MaterialIcons name={selectedForBatch.size === selectablePlayers.length && selectablePlayers.length > 0 ? 'check-box' : 'check-box-outline-blank'} size={20} color={theme.primary} />
              <Text style={s.ppSelectAllText}>
                {selectedForBatch.size === selectablePlayers.length && selectablePlayers.length > 0
                  ? (language === 'fr' ? 'Tout deselecter' : 'Deselect all')
                  : (language === 'fr' ? 'Tout selectionner' : 'Select all')}
              </Text>
            </Pressable>
            {selectedForBatch.size > 0 ? (
              <View style={s.ppSelectedCount}>
                <Text style={s.ppSelectedCountText}>{selectedForBatch.size}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.ppSearchBar}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={s.ppSearchInput}
              value={playerPickerSearch}
              onChangeText={setPlayerPickerSearch}
              placeholder={language === 'fr' ? 'Rechercher un joueur...' : 'Search player...'}
              placeholderTextColor={theme.textMuted}
            />
            {playerPickerSearch.length > 0 ? (
              <Pressable onPress={() => setPlayerPickerSearch('')}>
                <MaterialIcons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {loadingPlayers ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredPlayers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: p }) => {
                const alreadyInvited = invitedPlayerIds.has(p.user_id);
                const isInviting = invitingPlayerIds.has(p.user_id);
                const isSelected = selectedForBatch.has(p.user_id);
                return (
                  <Pressable style={[s.ppPlayerRow, isSelected && { borderColor: '#7C3AED40', backgroundColor: '#7C3AED08' }]} onPress={() => { if (!alreadyInvited) toggleSelectPlayer(p.user_id); }}>
                    {!alreadyInvited ? (
                      <View style={[s.ppCheckbox, isSelected && s.ppCheckboxActive]}>
                        {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                      </View>
                    ) : null}
                    <View style={s.ppPlayerAvatar}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.primary }}>{p.name.charAt(0)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ppPlayerName} numberOfLines={1}>{p.name}</Text>
                      {p.club ? <Text style={s.ppPlayerClub} numberOfLines={1}>{p.club}</Text> : null}
                    </View>
                    {alreadyInvited ? (
                      <View style={s.ppInvitedBadge}>
                        <MaterialIcons name="check-circle" size={14} color={theme.success} />
                        <Text style={s.ppInvitedText}>{language === 'fr' ? 'Inscrit' : 'Joined'}</Text>
                      </View>
                    ) : isInviting ? (
                      <ActivityIndicator size="small" color="#7C3AED" />
                    ) : (
                      <Pressable style={s.ppInviteBtn} onPress={(e) => { e.stopPropagation?.(); handleInvitePlayer(p.user_id, p.name); }}>
                        <MaterialIcons name="person-add" size={16} color="#FFF" />
                        <Text style={s.ppInviteBtnText}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <MaterialIcons name="person-search" size={48} color={theme.textMuted} />
                  <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 12 }}>
                    {language === 'fr' ? 'Aucun joueur trouve' : 'No players found'}
                  </Text>
                </View>
              }
            />
          )}
          {/* Batch Invite Floating Button */}
          {selectedForBatch.size > 0 ? (
            <View style={s.ppBatchBar}>
              <Pressable
                style={[s.ppBatchInviteBtn, batchInviting && { opacity: 0.6 }]}
                onPress={handleBatchInvite}
                disabled={batchInviting}
              >
                {batchInviting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <MaterialIcons name="send" size={18} color="#FFF" />
                )}
                <Text style={s.ppBatchInviteBtnText}>
                  {language === 'fr'
                    ? `Inviter ${selectedForBatch.size} joueur${selectedForBatch.size > 1 ? 's' : ''}`
                    : `Invite ${selectedForBatch.size} player${selectedForBatch.size > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  shareBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  heroGradient: { padding: 24, paddingTop: 64, paddingBottom: 28 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 10 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  sponsorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  sponsorAvatar: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  sponsorName: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  // Code
  codeCard: { backgroundColor: '#FFF', margin: 16, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  codeLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  codeValue: { fontSize: 28, fontWeight: '900', color: '#7C3AED', letterSpacing: 3, marginBottom: 4 },
  codeHint: { fontSize: 12, color: theme.textMuted },
  // Info Grid
  infoGrid: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 16 },
  infoItem: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  infoValue: { fontSize: 15, fontWeight: '800', color: theme.textPrimary, marginTop: 6, textAlign: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' },
  descCard: { backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  descText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  // CTA
  ctaSection: { marginHorizontal: 16, marginBottom: 20 },
  ctaButtons: { flexDirection: 'row', gap: 10 },
  registerBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 16 },
  registerBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, backgroundColor: '#F1F5F9' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  registeredBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.success + '10', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.success + '20', flexWrap: 'wrap' as const },
  registeredText: { fontSize: 15, fontWeight: '600', color: theme.success, flex: 1 },
  withdrawBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.error + '10', borderRadius: 8, borderWidth: 1, borderColor: theme.error + '20' },
  withdrawBtnText: { fontSize: 12, fontWeight: '600', color: theme.error },
  declinedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 14, padding: 16 },
  declinedText: { fontSize: 15, fontWeight: '600', color: theme.textMuted, flex: 1 },
  reRegisterBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '10', borderRadius: 8 },
  reRegisterText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  // Section
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  // Participants
  emptyParticipants: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyParticipantsText: { fontSize: 14, color: theme.textMuted, marginTop: 8 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  participantAvatar: { width: 38, height: 38, borderRadius: 12, overflow: 'hidden' },
  participantName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  participantStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  participantStatusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  participantStatusText: { fontSize: 10, fontWeight: '700' },
  witnessInfo: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  witnessInfoText: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  participantScore: { fontSize: 18, fontWeight: '900', color: theme.primary },
  attestBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.success + '10', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.success + '20' },
  // Rankings
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  rankNum: { fontSize: 18, fontWeight: '900', color: theme.textPrimary, minWidth: 36, textAlign: 'center' },
  rankAvatar: { width: 36, height: 36, borderRadius: 12, overflow: 'hidden' },
  rankName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  rankWitnessRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  rankWitnessText: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  rankScore: { fontSize: 20, fontWeight: '900', color: theme.success },
  // Actions
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  // Participant Counter
  counterCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#7C3AED20' },
  counterHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 12 },
  counterIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center' as const, justifyContent: 'center' as const },
  counterTitle: { fontSize: 16, fontWeight: '700' as const, color: theme.textPrimary },
  counterSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  counterValueBg: { backgroundColor: '#7C3AED12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  counterValue: { fontSize: 16, fontWeight: '900' as const, color: '#7C3AED' },
  newBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#22C55E', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  newBadgeText: { fontSize: 10, fontWeight: '800' as const, color: '#FFF' },
  progressTrack: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, borderRadius: 5 },
  progressLabels: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 4, paddingHorizontal: 2 },
  progressLabel: { fontSize: 10, fontWeight: '500' as const, color: theme.textMuted },
  almostFullBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#FECACA' },
  almostFullText: { fontSize: 12, fontWeight: '700' as const, color: '#EF4444' },
  recentSection: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  recentTitle: { fontSize: 12, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  recentRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 8 },
  recentAvatar: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' as const },
  recentName: { fontSize: 13, fontWeight: '600' as const, color: theme.textPrimary },
  recentDate: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  recentStatusDot: { width: 8, height: 8, borderRadius: 4 },
  // Reminders
  remindersCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#7C3AED20' },
  remindersHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  remindersIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  remindersTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  remindersSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  remindersList: { gap: 8 },
  reminderItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  reminderLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: theme.textSecondary },
  // Share modal
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
  shareContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%' as const,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  },
  /** Bounded flex child so ScrollView scrolls instead of growing past the sheet. */
  shareBodyScroll: { flex: 1, minHeight: 0 },
  shareScrollContent: { flexGrow: 1 },
  shareHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  shareHeaderTitle: { fontSize: 18, fontWeight: '700' as const, color: theme.textPrimary },
  shareCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center' as const, justifyContent: 'center' as const },
  sharePreview: { marginHorizontal: 20, marginTop: 16, borderRadius: 14, overflow: 'hidden' as const },
  sharePreviewGradient: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 14 },
  sharePreviewTitle: { fontSize: 14, fontWeight: '700' as const, color: '#FFF' },
  sharePreviewSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  sharePreviewCode: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  sharePreviewCodeText: { fontSize: 14, fontWeight: '900' as const, color: '#FFF', letterSpacing: 1.5 },
  shareOptions: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  shareOption: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  shareOptionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  shareOptionTitle: { fontSize: 15, fontWeight: '600' as const, color: theme.textPrimary },
  shareOptionDesc: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  shareTip: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8, marginHorizontal: 20, marginTop: 16, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  shareTipText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  // QR Code section
  shareQRSection: { alignItems: 'center' as const, paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 16 },
  shareQRLabel: { fontSize: 12, fontWeight: '700' as const, color: theme.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 },
  shareQRWrap: { padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 2, borderColor: '#7C3AED20', ...theme.shadows.card },
  shareQRHint: { fontSize: 12, color: theme.textMuted, marginTop: 10 },
  // Player picker
  ppHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  ppCloseBtn: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  ppTitle: { fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary },
  ppSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  ppSearchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginHorizontal: 16, marginVertical: 10, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: '#E2E8F0' },
  ppSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary },
  ppPlayerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  ppPlayerAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  ppPlayerName: { fontSize: 15, fontWeight: '600' as const, color: theme.textPrimary },
  ppPlayerClub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  ppInviteBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: '#7C3AED', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  ppInviteBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#FFF' },
  ppInvitedBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: theme.success + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  ppInvitedText: { fontSize: 12, fontWeight: '600' as const, color: theme.success },
  // Batch invite styles
  ppBatchHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  ppSelectAllBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.primary + '08', borderRadius: 10 },
  ppSelectAllText: { fontSize: 14, fontWeight: '600' as const, color: theme.primary },
  ppSelectedCount: { backgroundColor: '#7C3AED', minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 6 },
  ppSelectedCountText: { fontSize: 13, fontWeight: '800' as const, color: '#FFF' },
  ppCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: theme.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  ppCheckboxActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  ppBatchBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: theme.border },
  ppBatchInviteBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 16 },
  ppBatchInviteBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },
  // Invitation History
  invHistoryCount: { backgroundColor: '#7C3AED15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  invHistoryCountText: { fontSize: 13, fontWeight: '800' as const, color: '#7C3AED' },
  invHistoryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  invHistoryAvatar: { width: 36, height: 36, borderRadius: 10, overflow: 'hidden' as const },
  invHistoryName: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary },
  invHistoryDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  invHistoryRespondDate: { fontSize: 10, color: theme.textMuted, marginTop: 1, fontStyle: 'italic' as const },
  invHistoryStatusBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  invHistoryStatusText: { fontSize: 10, fontWeight: '700' as const },
  invHistoryReinviteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED12', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: '#7C3AED20' },
  // Analytics
  analyticsCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  analyticsCardTitle: { fontSize: 13, fontWeight: '700' as const, color: theme.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 },
  analyticsEmpty: { fontSize: 13, color: theme.textMuted, textAlign: 'center' as const, paddingVertical: 16 },
  funnelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  funnelLabel: { fontSize: 11, fontWeight: '600' as const, color: theme.textSecondary },
  funnelCount: { fontSize: 18, fontWeight: '900' as const },
  funnelBarTrack: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' as const },
  funnelBarFill: { height: '100%' as const, borderRadius: 4 },
  funnelPct: { fontSize: 12, fontWeight: '700' as const, color: theme.textMuted, width: 36, textAlign: 'right' as const },
  funnelStatsRow: { flexDirection: 'row' as const, gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  funnelStatChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  funnelStatText: { fontSize: 12, fontWeight: '600' as const, color: theme.textSecondary },
  timelineChart: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-around' as const, height: 100, paddingTop: 10 },
  timelineBarCol: { alignItems: 'center' as const, gap: 4, flex: 1 },
  timelineBarValue: { fontSize: 11, fontWeight: '800' as const, color: '#7C3AED' },
  timelineBar: { width: 24, backgroundColor: '#7C3AED', borderRadius: 6, minHeight: 8 },
  timelineBarLabel: { fontSize: 9, fontWeight: '600' as const, color: theme.textMuted },
  demoGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  demoItem: { width: '47%' as any, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center' as const, gap: 6 },
  demoIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  demoValue: { fontSize: 18, fontWeight: '900' as const, color: theme.textPrimary },
  demoLabel: { fontSize: 10, fontWeight: '600' as const, color: theme.textMuted, textTransform: 'uppercase' as const },
});
