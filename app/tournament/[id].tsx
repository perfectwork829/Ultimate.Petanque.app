import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
  Switch,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import config from '@/constants/config';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData, useAppActions, useAppUI } from '@/contexts/AppContext';
import { TextInput } from 'react-native';
import { TournamentType } from '@/constants/config';
import ShareModal from '@/components/ui/ShareModal';
import ModificationLogsSection from '@/components/ui/ModificationLogsSection';
import SharedBadge from '@/components/ui/SharedBadge';
import MergePickerModal from '@/components/ui/MergePickerModal';
import { isSharedWithMe, saveSharedItemToMyAccount, recordShareView } from '@/services/shareService';
import { toggleItemPublic } from '@/services/publicItemsService';
import { useAlert } from '@/template';
import { useAuth } from '@/template';
import { showInterstitial } from '@/services/adService';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import SponsoredItemBanner from '@/components/ui/SponsoredItemBanner';
import TeamBracketView from '@/components/feature/TeamBracketView';
import * as ImagePicker from '@/services/imagePicker';
import { decode } from '@/services/base64';
import { getSupabaseClient } from '@/template';
import { uploadImageToStorage } from '@/services/storageService';
import {
  requestNotificationPermissions,
  areNotificationsEnabled,
  scheduleTournamentNotifications,
  cancelTournamentNotifications,
  sendTestNotification,
} from '@/services/notificationService';
import { detectLinkedPlayers, createShareRequests, getShareRequestsForItem, MatchShareRequest } from '@/services/matchShareService';

// Phase IDs - DB values (French), translated at display time
const PHASE_IDS = {
  BASE: [
    { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
    { id: '1/16 finale', labelKey: '1/16 finale', shortKey: '1/16' },
    { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
    { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
    { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
    { id: 'Petite finale', labelKey: 'Petite F.', shortKey: 'PF' },
    { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
  ],
  BY_CADRAGE: {
    'Poules': [
      { id: 'Poule 1', labelKey: 'Poule 1', shortKey: 'P1' },
      { id: 'Poule 2', labelKey: 'Poule 2', shortKey: 'P2' },
      { id: 'Poule 3', labelKey: 'Poule 3', shortKey: 'P3' },
      { id: 'Classement', labelKey: 'Classement', shortKey: 'CL' },
    ],
    'Élimination directe': [
      { id: '1/16 finale', labelKey: '1/16 finale', shortKey: '1/16' },
      { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
      { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Mixte': [
      { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
      { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
      { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Suisse': [
      { id: 'Ronde 1', labelKey: 'Ronde 1', shortKey: 'R1' },
      { id: 'Ronde 2', labelKey: 'Ronde 2', shortKey: 'R2' },
      { id: 'Ronde 3', labelKey: 'Ronde 3', shortKey: 'R3' },
      { id: 'Ronde 4', labelKey: 'Ronde 4', shortKey: 'R4' },
      { id: 'Ronde 5', labelKey: 'Ronde 5', shortKey: 'R5' },
      { id: 'Classement', labelKey: 'Class.', shortKey: 'CL' },
    ],
    'A/B/C': [
      { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
      { id: 'Tableau A', labelKey: 'Tab. A', shortKey: 'A' },
      { id: 'Tableau B', labelKey: 'Tab. B', shortKey: 'B' },
      { id: 'Tableau C', labelKey: 'Tab. C', shortKey: 'C' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Tirage intégral': [
      { id: 'Tour 1', labelKey: 'Tour 1', shortKey: 'T1' },
      { id: 'Tour 2', labelKey: 'Tour 2', shortKey: 'T2' },
      { id: 'Tour 3', labelKey: 'Tour 3', shortKey: 'T3' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
  } as Record<TournamentType, { id: string; labelKey: string; shortKey: string }[]>,
} as const;

const TimelineMatchCard = React.memo(({ match, t, language }: { match: any; t: (s: string, k: string) => string; language: string }) => {
  const isWin = match.winner === 'A';
  const dotColor = isWin ? theme.success : theme.error;

  return (
    <Pressable
      style={styles.timelineItem}
      onPress={() => router.push(`/match/${match.id}`)}
    >
      <View style={styles.timelineDotCol}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: dotColor + '40' }]}>
          <MaterialIcons name={isWin ? 'check' : 'close'} size={12} color="#FFF" />
        </View>
      </View>
      <View style={[styles.timelineCard, { borderLeftColor: dotColor }]}>
        <View style={styles.tlCardHeader}>
          <View style={[styles.tlPhaseBadge, { backgroundColor: dotColor + '15' }]}>
            <Text style={[styles.tlPhaseBadgeText, { color: dotColor }]}>
              {match.tournamentPhase ? t('tournamentPhases', match.tournamentPhase) : t('tournamentPhases', 'Match')}
            </Text>
          </View>
          {match.tournamentBracket ? (
            <View style={styles.tlBracketTag}>
              <Text style={styles.tlBracketTagText}>{match.tournamentBracket}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={styles.tlDate}>
            {new Date(match.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <View style={styles.tlScoreRow}>
          <View style={styles.tlTeam}>
            <Text style={styles.tlTeamLabel}>{t('tournament', 'meLabel')}</Text>
            <Text style={styles.tlTeamNames} numberOfLines={1}>{match.teamA.playerNames.slice(0, 2).join(' • ')}</Text>
          </View>
          <View style={styles.tlScoreBox}>
            <Text style={[styles.tlScoreNum, isWin && { color: theme.success }]}>{match.teamA.score}</Text>
            <Text style={styles.tlScoreSep}>-</Text>
            <Text style={[styles.tlScoreNum, !isWin && { color: theme.error }]}>{match.teamB.score}</Text>
          </View>
          <View style={[styles.tlTeam, { alignItems: 'flex-end' }]}>
            <Text style={styles.tlTeamLabel}>{t('tournament', 'opponentLabel')}</Text>
            <Text style={styles.tlTeamNames} numberOfLines={1}>{match.teamB.playerNames.slice(0, 2).join(' • ')}</Text>
          </View>
        </View>
        <View style={styles.tlCardFooter}>
          <View style={[styles.tlResultBadge, { backgroundColor: dotColor + '12' }]}>
            <MaterialIcons name={isWin ? 'check-circle' : 'cancel'} size={13} color={dotColor} />
            <Text style={[styles.tlResultText, { color: dotColor }]}>{isWin ? t('tournament', 'victory') : t('tournament', 'defeat')}</Text>
          </View>
          {match.duration > 0 ? (
            <Text style={styles.tlDuration}>{Math.floor(match.duration / 60)}:{(match.duration % 60).toString().padStart(2, '0')}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
        </View>
      </View>
    </Pressable>
  );
});

export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tournamentNotifications, loading: appLoading } = useAppData();
  const { getTournamentById, getClubById, getTerrainById, getMatchesByTournament, updateTournament, deleteTournament, toggleTournamentNotification, isTournamentNotificationEnabled, getSharedPermission, setItemPublic, refreshData } = useAppActions();
  const [refreshing, setRefreshing] = useState(false);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const tournament = getTournamentById(id!);
  const terrain = tournament?.terrainId ? getTerrainById(tournament.terrainId) : null;
  const tournamentMatches = getMatchesByTournament(id!);
  
  // Build translated phases
  const buildPhases = useCallback((phaseList: { id: string; labelKey: string; shortKey: string }[]) => {
    return phaseList.map(p => ({ id: p.id, label: t('tournamentPhases', p.labelKey), short: t('tournamentPhases', p.shortKey) }));
  }, [t]);

  const BASE_PHASES = useMemo(() => buildPhases(PHASE_IDS.BASE), [buildPhases]);

  // Get phases based on tournament cadrage
  const tournamentPhases = useMemo(() => {
    if (!tournament) return BASE_PHASES;
    const cadragePhases = PHASE_IDS.BY_CADRAGE[tournament.type];
    if (!cadragePhases) return BASE_PHASES;
    return buildPhases(cadragePhases);
  }, [tournament, BASE_PHASES, buildPhases]);

  // End tournament modal state
  const [endTournamentStep, setEndTournamentStep] = useState(0); // 0=hidden, 1=result, 2=details, 3=summary
  const [selectedFinalResult, setSelectedFinalResult] = useState<string | null>(null);
  const [prizeWonInput, setPrizeWonInput] = useState('');
  const [isSavingEnd, setIsSavingEnd] = useState(false);
  
  // Notification modal state
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    oneWeek: true,
    threeDays: true,
    oneDayBefore: true,
  });
  const [isScheduling, setIsScheduling] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [showShareModal, setShowShareModal] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublicState, setIsPublicState] = useState(false);
  const [showMergePicker, setShowMergePicker] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [showPublicPreview, setShowPublicPreview] = useState(false);

  // Quick share state
  const [quickShareState, setQuickShareState] = useState<'idle' | 'loading' | 'sent' | 'no_accounts' | 'already_shared'>('idle');
  const [quickShareCount, setQuickShareCount] = useState(0);
  const [shareRequests, setShareRequests] = useState<MatchShareRequest[]>([]);

  // Poster state
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterType, setPosterType] = useState<'image' | 'pdf'>('image');
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [showPosterFullscreen, setShowPosterFullscreen] = useState(false);
  const supabase = getSupabaseClient();

  const { showAlert: showShareAlert } = useAlert();
  const sharedPermission = getSharedPermission(id!);
  const isSharedItem = sharedPermission !== null;
  const isReadOnly = sharedPermission === 'read';
  const isOwner = !!(user?.id && tournament && tournament.userId && tournament.userId === user.id);
  const canEdit = !isReadOnly && isOwner;



  useEffect(() => {
    if (id) {
      isSharedWithMe('tournament', id).then(shared => { setIsShared(shared); if (shared) recordShareView('tournament', id, 'tournament-detail'); });
      getShareRequestsForItem('tournament', id).then(({ requests }) => setShareRequests(requests)).catch(() => {});
    }
  }, [id]);

  // Quick share with tournament players
  const handleQuickShareWithPlayers = useCallback(async () => {
    if (!tournament || !user?.id || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickShareState('loading');
    try {
      // Collect all unique player IDs from tournament matches
      const allPlayerIds = new Set<string>();
      myMatches.forEach(m => {
        [...(m.teamA.players || []), ...(m.teamB.players || [])].forEach(pid => {
          if (pid !== '1' && pid !== '2') allPlayerIds.add(pid);
        });
      });
      if (allPlayerIds.size === 0) {
        setQuickShareState('no_accounts');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const { linkedPlayers } = await detectLinkedPlayers([...allPlayerIds], user.id);
      if (linkedPlayers.length === 0) {
        setQuickShareState('no_accounts');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const alreadySharedIds = new Set(shareRequests.map(r => r.recipientUserId));
      const newRecipients = linkedPlayers.filter(p => !alreadySharedIds.has(p.userId));
      if (newRecipients.length === 0) {
        setQuickShareState('already_shared');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const senderName = user.username || user.email?.split('@')[0] || 'Joueur';
      const summary = `${tournament.name} - ${t('formats', tournament.format)} (${myStats.wins}V/${myStats.losses}D)`;
      const { requests: newReqs, error } = await createShareRequests({
        itemType: 'match' as any,
        itemId: id,
        senderUserId: user.id,
        senderName,
        recipients: newRecipients.map(p => ({ userId: p.userId, permission: 'read' as const })),
        itemSummary: summary,
      });
      if (error) {
        showShareAlert(t('common', 'error'), error);
        setQuickShareState('idle');
        return;
      }
      setQuickShareCount(newReqs.length);
      setShareRequests(prev => [...newReqs, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuickShareState('sent');
      setTimeout(() => setQuickShareState('idle'), 3000);
    } catch (e: any) {
      showShareAlert(t('common', 'error'), e.message);
      setQuickShareState('idle');
    }
  }, [tournament, user, id, myMatches, shareRequests, myStats, t, showShareAlert]);

  useEffect(() => {
    if (tournament) setIsPublicState(tournament.isPublic ?? false);
  }, [tournament?.isPublic]);

  // Load poster
  useEffect(() => {
    if (tournament?.posterUrl) {
      setPosterUrl(tournament.posterUrl);
      setPosterType(tournament.posterUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');
    } else {
      setPosterUrl(null);
    }
  }, [tournament?.posterUrl]);

  const uploadPosterFile = useCallback(async (fileUri: string, fileName: string, mimeType: string) => {
    if (!tournament || !user) return;
    setUploadingPoster(true);
    try {
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${user.id}/${tournament.id}_poster_${Date.now()}.${fileExt}`;
      let base64Data: string;
      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => { const result = reader.result as string; resolve(result.split(',')[1]); };
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system');
        base64Data = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const { error: uploadError } = await supabase.storage.from('terrain-photos').upload(storagePath, decode(base64Data), { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('terrain-photos').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      await updateTournament(tournament.id, { posterUrl: publicUrl } as any);

      setPosterUrl(publicUrl);
      setPosterType(fileExt === 'pdf' ? 'pdf' : 'image');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.log('Error uploading poster:', error);
      Alert.alert(t('common', 'error'), error.message || 'Upload failed');
    } finally {
      setUploadingPoster(false);
    }
  }, [tournament, user, supabase, updateTournament, t]);

  const showPosterUploadOptions = useCallback(() => {
    Alert.alert(
      language === 'fr' ? 'Affiche du tournoi' : 'Tournament Poster',
      language === 'fr' ? 'Ajoutez une affiche ou un document' : 'Add a poster or document',
      [
        { text: t('player', 'fromCamera'), onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
          if (!result.canceled && result.assets[0]) {
            const ext = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
            await uploadPosterFile(result.assets[0].uri, `poster.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
          }
        }},
        { text: t('player', 'fromGallery'), onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
          if (!result.canceled && result.assets[0]) {
            const ext = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
            await uploadPosterFile(result.assets[0].uri, `poster.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
          }
        }},
        { text: t('player', 'fromFiles'), onPress: async () => {
          try {
            const DocumentPicker = require('expo-document-picker');
            const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
            if (!result.canceled && result.assets && result.assets[0]) {
              await uploadPosterFile(result.assets[0].uri, result.assets[0].name || 'poster.pdf', result.assets[0].mimeType || 'application/pdf');
            }
          } catch (e) { console.log('Error picking document:', e); }
        }},
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  }, [t, language, uploadPosterFile]);

  const handleRemovePoster = useCallback(() => {
    Alert.alert(
      language === 'fr' ? 'Supprimer l affiche' : 'Remove poster',
      '',
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
          if (!tournament) return;
          await updateTournament(tournament.id, { posterUrl: undefined } as any);
          setPosterUrl(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }},
      ]
    );
  }, [tournament, updateTournament, t, language]);

  const handleOpenPublicPreview = useCallback(() => {
    if (!tournament || togglingPublic || isSharedItem) return;
    Haptics.selectionAsync();
    setShowPublicPreview(true);
  }, [tournament, togglingPublic, isSharedItem]);

  const handleConfirmPublic = useCallback(async () => {
    if (!tournament) return;
    setTogglingPublic(true);
    Haptics.selectionAsync();
    const newVal = !isPublicState;
    const { error } = await toggleItemPublic('tournaments', tournament.id, newVal);
    if (error) {
      showShareAlert(t('common', 'error'), error);
    } else {
      setIsPublicState(newVal);
      setItemPublic('tournaments', tournament.id, newVal);
    }
    setTogglingPublic(false);
    setShowPublicPreview(false);
  }, [tournament, isPublicState, togglingPublic, showShareAlert, t]);

  const handleOpenShare = useCallback(() => {
    if (!tournament) return;
    Haptics.selectionAsync();
    setShowShareModal(true);
  }, [tournament]);
  
  // Notification state
  const isNotificationEnabled = tournament ? isTournamentNotificationEnabled(tournament.id) : false;

  // Check if tournament is upcoming (can set notifications)
  const isUpcoming = tournament && tournament.status === 'À venir';
  const tournamentDate = tournament ? new Date(tournament.date) : new Date();
  const daysUntilTournament = Math.ceil((tournamentDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  // Check notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      const enabled = await areNotificationsEnabled();
      setPermissionStatus(enabled ? 'granted' : 'denied');
    };
    checkPermission();
  }, []);

  // Handle notification toggle
  const handleNotificationPress = useCallback(async () => {
    if (!tournament) return;
    Haptics.selectionAsync();
    
    if (!isUpcoming) {
      Alert.alert(
        t('tournament', 'pastTournament'),
        t('tournament', 'notifOnlyUpcoming')
      );
      return;
    }
    
    // Check permission status
    const enabled = await areNotificationsEnabled();
    setPermissionStatus(enabled ? 'granted' : 'denied');
    
    setShowNotificationModal(true);
  }, [tournament, isUpcoming]);

  // Request permission
  const handleRequestPermission = useCallback(async () => {
    Haptics.selectionAsync();
    const granted = await requestNotificationPermissions();
    setPermissionStatus(granted ? 'granted' : 'denied');
    
    if (!granted) {
      Alert.alert(
        t('tournament', 'notifPermRequired'),
        t('tournament', 'notifEnableInSettings'),
        [
          { text: t('common', 'cancel'), style: 'cancel' },
          { 
            text: t('tournament', 'openSettings'), 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }
          },
        ]
      );
    }
  }, []);

  // Send test notification
  const handleTestNotification = useCallback(async () => {
    Haptics.selectionAsync();
    await sendTestNotification();
    Alert.alert(t('tournament', 'testSent'), t('tournament', 'testSentMsg'));
  }, []);

  // Save notification settings
  const handleSaveNotifications = useCallback(async () => {
    if (!tournament) return;
    
    setIsScheduling(true);
    
    try {
      if (isNotificationEnabled) {
        // Disable - cancel notifications
        await cancelTournamentNotifications(tournament.id);
        toggleTournamentNotification(tournament.id);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowNotificationModal(false);
        Alert.alert(t('tournament', 'notifDisabled'), t('tournament', 'notifDisabledMsg'));
      } else {
        // Enable - schedule notifications
        const scheduledIds = await scheduleTournamentNotifications({
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          tournamentDate: tournamentDate,
          oneWeekBefore: notificationSettings.oneWeek && daysUntilTournament >= 7,
          threeDaysBefore: notificationSettings.threeDays && daysUntilTournament >= 3,
          oneDayBefore: notificationSettings.oneDayBefore && daysUntilTournament >= 1,
        });
        
        toggleTournamentNotification(tournament.id);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowNotificationModal(false);
        
        // Build reminder message
        const reminders = [];
        if (notificationSettings.oneWeek && daysUntilTournament >= 7) reminders.push(t('tournament', 'oneWeekBefore'));
        if (notificationSettings.threeDays && daysUntilTournament >= 3) reminders.push(t('tournament', 'threeDaysBefore'));
        if (notificationSettings.oneDayBefore && daysUntilTournament >= 1) reminders.push(t('tournament', 'dayBefore'));
        
        Alert.alert(
          t('tournament', 'notifScheduled'),
          scheduledIds.length > 0 
            ? `${scheduledIds.length} ${t('tournament', 'remindersScheduledMsg')} : ${reminders.join(', ')}.`
            : t('tournament', 'noReminderScheduled')
        );
      }
    } catch (error) {
      console.log('Error scheduling notifications:', error);
      Alert.alert(t('common', 'error'), t('tournament', 'errorScheduling'));
    } finally {
      setIsScheduling(false);
    }
  }, [tournament, isNotificationEnabled, notificationSettings, daysUntilTournament, tournamentDate, toggleTournamentNotification]);

  // Filter and sort matches
  const myMatches = useMemo(() => {
    return tournamentMatches.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [tournamentMatches]);

  // Calculate stats
  const myStats = useMemo(() => {
    const wins = myMatches.filter(m => m.winner === 'A').length;
    const losses = myMatches.filter(m => m.winner === 'B').length;
    const totalPointsFor = myMatches.reduce((acc, m) => acc + m.teamA.score, 0);
    const totalPointsAgainst = myMatches.reduce((acc, m) => acc + m.teamB.score, 0);
    
    let totalTirs = 0, totalTirsSuccess = 0, totalCarreaux = 0;
    myMatches.forEach(match => {
      if (match.playerActions) {
        match.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
          totalTirs += pa.actions.tirs;
          totalTirsSuccess += pa.actions.tirsSuccess;
          totalCarreaux += pa.actions.carreaux;
        });
      }
    });

    return {
      played: myMatches.length,
      wins,
      losses,
      winRate: myMatches.length > 0 ? Math.round((wins / myMatches.length) * 100) : 0,
      totalPointsFor,
      totalPointsAgainst,
      pointDiff: totalPointsFor - totalPointsAgainst,
      tirRate: totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 100) : null,
      carreaux: totalCarreaux,
    };
  }, [myMatches]);

  // Journey status
  const journeyStatus = useMemo(() => {
    if (myMatches.length === 0) return { status: 'not_started', label: t('tournament', 'waiting'), color: theme.textMuted, icon: 'hourglass-empty' };
    
    const lastMatch = myMatches[myMatches.length - 1];
    const lastMatchWon = lastMatch.winner === 'A';
    const phase = lastMatch.tournamentPhase?.toLowerCase() || '';
    const lastPhaseIndex = tournamentPhases.findIndex(p => p.id === lastMatch.tournamentPhase);
    const isLastPhase = lastPhaseIndex === tournamentPhases.length - 1;
    
    if (isLastPhase && lastMatchWon) {
      return { status: 'champion', label: t('tournament', 'champion'), color: theme.carreauColor, icon: 'emoji-events' };
    }
    if ((phase.includes('finale') || isLastPhase) && !lastMatchWon) {
      return { status: 'finalist', label: phase === 'finale' ? t('tournament', 'finalist') : t('tournament', 'journeyEnded'), color: theme.accent, icon: 'workspace-premium' };
    }
    if ((tournament?.type === 'Suisse' || tournament?.type === 'Poules') && phase.includes('classement')) {
      return { status: 'completed', label: t('tournament', 'ranked'), color: theme.success, icon: 'emoji-events' };
    }
    if (lastMatchWon) {
      return { status: 'advancing', label: t('tournament', 'inTheRunning'), color: theme.success, icon: 'trending-up' };
    }
    if (tournament?.type === 'Élimination directe' || tournament?.type === 'Tirage intégral') {
      return { status: 'eliminated', label: t('tournament', 'eliminated'), color: theme.error, icon: 'block' };
    }
    return { status: 'continuing', label: t('tournament', 'continuing'), color: theme.warning, icon: 'trending-flat' };
  }, [myMatches, tournamentPhases, tournament]);

  // Current phase progress
  const currentPhaseIndex = useMemo(() => {
    if (myMatches.length === 0) return 0;
    const lastMatch = myMatches[myMatches.length - 1];
    const idx = tournamentPhases.findIndex(p => p.id === lastMatch.tournamentPhase);
    return idx >= 0 ? idx + 1 : 0;
  }, [myMatches, tournamentPhases]);

  // End tournament: select result
  const handleSelectResult = useCallback((result: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedFinalResult(result);
    // Pre-fill prize if tournament already has one
    if (tournament?.prizeWon) setPrizeWonInput(tournament.prizeWon.toString());
    setEndTournamentStep(2);
  }, [tournament]);

  // End tournament: go to summary
  const handleGoToSummary = useCallback(() => {
    Haptics.selectionAsync();
    setEndTournamentStep(3);
  }, []);

  // End tournament: confirm and save
  const handleConfirmEndTournament = useCallback(async () => {
    if (!tournament || !selectedFinalResult) return;
    setIsSavingEnd(true);
    try {
      const prizeValue = prizeWonInput ? parseFloat(prizeWonInput) : undefined;
      await updateTournament(tournament.id, {
        status: 'Terminé',
        finalResult: selectedFinalResult,
        prizeWon: prizeValue,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEndTournamentStep(0);
      setSelectedFinalResult(null);
      setPrizeWonInput('');
      // Show interstitial ad after tournament closure
      showInterstitial();
    } catch (e) {
      console.log('Error ending tournament:', e);
      Alert.alert(t('common', 'error'), t('tournament', 'errorEndTournament'));
    } finally {
      setIsSavingEnd(false);
    }
  }, [tournament, selectedFinalResult, prizeWonInput, updateTournament]);

  // Reset end tournament modal
  const handleCloseEndTournament = useCallback(() => {
    setEndTournamentStep(0);
    setSelectedFinalResult(null);
    setPrizeWonInput('');
  }, []);

  if (!tournament) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('tournament', 'myJourney')}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={styles.emptyText}>{t('tournament', 'tournamentNotFound')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('tournament', 'myJourney')}</Text>
        <View style={styles.headerActions}>
          {isShared && (
            <Pressable
              style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
              onPress={async () => {
                setIsSaving(true);
                const { newItemId, error } = await saveSharedItemToMyAccount('tournament', id!);
                setIsSaving(false);
                if (error) {
                  showShareAlert(t('common', 'error'), error);
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  showShareAlert(t('tournament', 'savedLabel'), t('tournament', 'tournamentCopied'));
                  if (newItemId) router.replace(`/tournament/${newItemId}` as any);
                }
              }}
              disabled={isSaving}
            >
              <MaterialIcons name="save-alt" size={22} color={theme.accent} />
            </Pressable>
          )}
          <Pressable style={styles.shareButton} onPress={handleOpenShare}>
            <MaterialIcons name="share" size={20} color={theme.success} />
          </Pressable>
          {canEdit && (
            <Pressable style={styles.editButton} onPress={() => setShowMergePicker(true)}>
              <MaterialIcons name="compare-arrows" size={20} color={theme.accent} />
            </Pressable>
          )}
          <Pressable 
            style={[styles.notificationButton, isNotificationEnabled && styles.notificationButtonActive]}
            onPress={handleNotificationPress}
          >
            <MaterialIcons 
              name={isNotificationEnabled ? 'notifications-active' : 'notifications-none'} 
              size={20} 
              color={isNotificationEnabled ? theme.warning : theme.textSecondary} 
            />
          </Pressable>
          {canEdit && (
            <Pressable 
              style={styles.editButton}
              onPress={() => router.push(`/tournament/edit/${tournament.id}`)}
            >
              <MaterialIcons name="edit" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {/* Tournament Hero Card */}
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.heroCard, isTablet && styles.tournamentCardTablet]}>
          {/* Accent banner */}
          <View style={[styles.heroAccent, { backgroundColor: journeyStatus.color }]} />
          
          <View style={styles.heroContent}>
            {/* Trophy + Name */}
            <View style={styles.heroTopRow}>
              <View style={styles.heroTrophyCircle}>
                <MaterialIcons name="emoji-events" size={32} color={theme.carreauColor} />
              </View>
              <View style={styles.heroTitleArea}>
                <Text style={styles.heroTournamentName} numberOfLines={2}>{tournament.name}</Text>
                {sharedPermission ? (
                  <View style={{ marginTop: 4 }}>
                    <SharedBadge permission={sharedPermission} size="small" />
                  </View>
                ) : null}
              </View>
            </View>

            {/* Meta pills */}
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaPill}>
                <MaterialIcons name="event" size={13} color={theme.primary} />
                <Text style={styles.heroMetaPillText}>
                  {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {tournament.endDate
                    ? ` → ${new Date(tournament.endDate).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`
                    : ''}
                </Text>
              </View>
              <View style={styles.heroMetaPill}>
                <MaterialIcons name="place" size={13} color={theme.success} />
                <Text style={styles.heroMetaPillText}>{tournament.location.city}</Text>
              </View>
              <View style={styles.heroMetaPill}>
                <MaterialIcons name="groups" size={13} color={theme.accent} />
                <Text style={styles.heroMetaPillText}>{t('formats', tournament.format)}</Text>
              </View>
              {tournament.maxParticipants ? (
                <View style={styles.heroMetaPill}>
                  <MaterialIcons name="people-outline" size={13} color={theme.carreauColor} />
                  <Text style={styles.heroMetaPillText}>
                    {tournament.participants || 0}/{tournament.maxParticipants} {language === 'fr' ? 'joueurs' : 'players'}
                  </Text>
                </View>
              ) : null}
              {tournament.registrationCost != null && tournament.registrationCost > 0 ? (
                <View style={styles.heroMetaPill}>
                  <MaterialIcons name="payments" size={13} color={theme.carreauColor} />
                  <Text style={styles.heroMetaPillText}>{tournament.registrationCost}€ {t('tournament', 'registrationCost').toLowerCase()}</Text>
                </View>
              ) : null}
              {tournament.prize ? (
                <View style={styles.heroMetaPill}>
                  <MaterialIcons name="card-giftcard" size={13} color={theme.warning} />
                  <Text style={styles.heroMetaPillText} numberOfLines={2}>{tournament.prize}</Text>
                </View>
              ) : null}
              {tournament.clubName ? (
                <View style={styles.heroMetaPill}>
                  <MaterialIcons name="home-work" size={13} color={theme.primaryLight} />
                  <Text style={styles.heroMetaPillText} numberOfLines={1}>{tournament.clubName}</Text>
                </View>
              ) : null}
            </View>

            {/* Final Result Banner */}
            {tournament.finalResult && tournament.status === 'Terminé' && (() => {
              const resultConfig: Record<string, { icon: string; color: string }> = {
                '1er': { icon: 'emoji-events', color: '#FFD700' },
                '2ème': { icon: 'workspace-premium', color: '#A8B4C0' },
                '3ème': { icon: 'military-tech', color: '#CD7F32' },
                'Demi-finale': { icon: 'trending-up', color: theme.primary },
                'Quart de finale': { icon: 'trending-flat', color: theme.warning },
                '1/8 finale': { icon: 'sports', color: theme.textSecondary },
                'Poules': { icon: 'group', color: theme.textSecondary },
                'Autre': { icon: 'more-horiz', color: theme.textMuted },
              };
              const cfg = resultConfig[tournament.finalResult || ''] || { icon: 'sports', color: theme.textSecondary };
              return (
                <View style={[styles.heroResultBanner, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '30' }]}>
                  <View style={[styles.heroResultIcon, { backgroundColor: cfg.color + '20' }]}>
                    <MaterialIcons name={cfg.icon as any} size={24} color={cfg.color} />
                  </View>
                  <Text style={[styles.heroResultText, { color: cfg.color }]}>
                    {t('palmaresResults', tournament.finalResult)}
                  </Text>
                </View>
              );
            })()}

            {/* Classification Badges */}
            {(tournament.tournamentLevel || tournament.tournamentCategory || tournament.registrationType || tournament.tournamentScope) ? (
              <View style={styles.classificationBadgesContainer}>
                {tournament.tournamentLevel ? (
                  <View style={[styles.classificationBadge, { backgroundColor: theme.success + '12' }]}>
                    <MaterialIcons name="signal-cellular-alt" size={11} color={theme.success} />
                    <Text style={[styles.classificationBadgeText, { color: theme.success }]}>{t('tournamentLevels', tournament.tournamentLevel)}</Text>
                  </View>
                ) : null}
                {tournament.tournamentCategory ? (
                  <View style={[styles.classificationBadge, { backgroundColor: theme.warning + '12' }]}>
                    <MaterialIcons name="category" size={11} color={theme.warning} />
                    <Text style={[styles.classificationBadgeText, { color: theme.warning }]}>{t('tournamentCategories', tournament.tournamentCategory)}</Text>
                  </View>
                ) : null}
                {tournament.registrationType ? (
                  <View style={[styles.classificationBadge, { backgroundColor: theme.primary + '12' }]}>
                    <MaterialIcons name="how-to-reg" size={11} color={theme.primary} />
                    <Text style={[styles.classificationBadgeText, { color: theme.primary }]}>{t('registrationTypes', tournament.registrationType)}</Text>
                  </View>
                ) : null}
                {tournament.tournamentScope ? (
                  <View style={[styles.classificationBadge, { backgroundColor: theme.accent + '12' }]}>
                    <MaterialIcons name="public" size={11} color={theme.accent} />
                    <Text style={[styles.classificationBadgeText, { color: theme.accent }]}>{t('tournamentScopes', tournament.tournamentScope)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {tournament.description?.trim() ? (
              <View style={styles.heroDescriptionBox}>
                <MaterialIcons name="description" size={16} color={theme.textSecondary} />
                <Text style={styles.heroDescriptionText}>{tournament.description}</Text>
              </View>
            ) : null}

            {/* Terrain Info */}
            {terrain ? (
              <Pressable
                style={styles.heroTerrainRow}
                onPress={() => router.push(`/terrain/${terrain.id}`)}
              >
                <View style={styles.heroTerrainIcon}>
                  <MaterialIcons
                    name={config.terrainTypes.find(t => t.id === terrain.type)?.icon as any || 'landscape'}
                    size={16}
                    color={theme.accent}
                  />
                </View>
                <Text style={styles.heroTerrainName} numberOfLines={1}>{terrain.name}</Text>
                <Text style={styles.heroTerrainType}>{t('terrainTypes', terrain.type)}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
            ) : null}

            {/* View on Map */}
            {(tournament.location?.latitude || tournament.location?.longitude) ? (
              <Pressable
                style={styles.heroMapBtn}
                onPress={() => router.push({ pathname: '/(tabs)/map', params: { lat: String(tournament.location.latitude), lng: String(tournament.location.longitude), name: tournament.name, mf: String(Date.now()) } } as any)}
              >
                <MaterialIcons name="map" size={16} color={theme.success} />
                <Text style={styles.heroMapBtnText}>{language === 'fr' ? 'Voir sur la carte' : 'View on map'}</Text>
                <MaterialIcons name="chevron-right" size={16} color={theme.success} />
              </Pressable>
            ) : null}

            {/* Sponsor Banner */}
            {(tournament as any).sponsorId ? (
              <View style={{ marginTop: 14 }}>
                <SponsoredItemBanner sponsorId={(tournament as any).sponsorId} page="tournament-detail" style={{ marginBottom: 0 }} />
              </View>
            ) : null}

            {/* Team Bracket View — always show for Doublette/Triplette */}
            {(tournament.format === 'Doublette' || tournament.format === 'Triplette') ? (
              <View style={{ marginTop: 14 }}>
                <TeamBracketView tournamentId={tournament.id} format={tournament.format} language={language} />
              </View>
            ) : null}
          </View>
        </Animated.View>

        <View style={isTablet ? styles.tabletRow : undefined}>
        {/* Status & Stats Card */}
        <Animated.View entering={FadeInDown.duration(400).delay(60)} style={[styles.statusCardNew, isTablet && styles.tabletHalf]}>
          {/* Status Header */}
          <View style={styles.statusHeaderRow}>
            <View style={[styles.statusIconCircle, { backgroundColor: journeyStatus.color + '18', borderColor: journeyStatus.color + '40' }]}>
              <MaterialIcons name={journeyStatus.icon as any} size={28} color={journeyStatus.color} />
            </View>
            <View style={styles.statusHeaderInfo}>
              <Text style={[styles.statusLabelNew, { color: journeyStatus.color }]}>{journeyStatus.label}</Text>
              <Text style={styles.statusSubtextNew}>{t('tournamentTypes', tournament.type)} • {t('formats', tournament.format)}</Text>
            </View>
          </View>

          {/* Stats Grid */}
          {myStats.played > 0 ? (
            <View style={styles.statsGridNew}>
              <View style={styles.statsGridItem}>
                <Text style={styles.statsGridValue}>{myStats.played}</Text>
                <Text style={styles.statsGridLabel}>{t('tournament', 'matchesLabel')}</Text>
              </View>
              <View style={styles.statsGridDivider} />
              <View style={styles.statsGridItem}>
                <Text style={[styles.statsGridValue, { color: theme.success }]}>{myStats.wins}</Text>
                <Text style={styles.statsGridLabel}>{t('tournament', 'victoriesLabel')}</Text>
              </View>
              <View style={styles.statsGridDivider} />
              <View style={styles.statsGridItem}>
                <Text style={[styles.statsGridValue, { color: theme.error }]}>{myStats.losses}</Text>
                <Text style={styles.statsGridLabel}>{t('tournament', 'defeatsLabel')}</Text>
              </View>
              <View style={styles.statsGridDivider} />
              <View style={styles.statsGridItem}>
                <Text style={[styles.statsGridValue, { color: theme.primary }]}>{myStats.winRate}%</Text>
                <Text style={styles.statsGridLabel}>{language === 'en' ? 'Win' : 'Vict.'}</Text>
              </View>
              {myStats.tirRate !== null ? (
                <>
                  <View style={styles.statsGridDivider} />
                  <View style={styles.statsGridItem}>
                    <Text style={[styles.statsGridValue, { color: theme.tirColor }]}>{myStats.tirRate}%</Text>
                    <Text style={styles.statsGridLabel}>{t('tournament', 'shotLabel')}</Text>
                  </View>
                </>
              ) : null}
              <View style={styles.statsGridDivider} />
              <View style={styles.statsGridItem}>
                <Text style={[styles.statsGridValue, { color: myStats.pointDiff >= 0 ? theme.success : theme.error }]}>
                  {myStats.pointDiff > 0 ? '+' : ''}{myStats.pointDiff}
                </Text>
                <Text style={styles.statsGridLabel}>Diff.</Text>
              </View>
            </View>
          ) : null}

          {/* Win/Loss Visual Bar */}
          {myStats.played > 0 ? (
            <View style={styles.winLossBarContainer}>
              <View style={styles.winLossBar}>
                <View style={[styles.winLossBarFill, { width: `${myStats.winRate}%`, backgroundColor: theme.success }]} />
              </View>
              <View style={styles.winLossLabels}>
                <Text style={[styles.winLossLabel, { color: theme.success }]}>{myStats.wins}V</Text>
                <Text style={[styles.winLossLabel, { color: theme.error }]}>{myStats.losses}D</Text>
              </View>
            </View>
          ) : null}
        </Animated.View>

        {/* Phase Progress */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)} style={[styles.section, isTablet && styles.tabletHalf]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('tournament', 'progression')}</Text>
            <View style={styles.cadrageBadge}>
              <MaterialIcons name="category" size={12} color={theme.primary} />
              <Text style={styles.cadrageBadgeText}>{t('tournamentTypes', tournament.type)}</Text>
            </View>
          </View>
          <View style={styles.progressCardNew}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.phasesScrollNew}
            >
              {tournamentPhases.map((phase, index) => {
                const isCompleted = index < currentPhaseIndex;
                const isCurrent = index === currentPhaseIndex;
                const matchesInPhase = myMatches.filter(m => m.tournamentPhase === phase.id);
                const hasMatchInPhase = matchesInPhase.length > 0;
                const lastMatchInPhase = matchesInPhase[matchesInPhase.length - 1];
                const wonPhase = lastMatchInPhase?.winner === 'A';
                const showMatchCount = (tournament.type === 'Suisse' || tournament.type === 'Poules') && matchesInPhase.length > 0;
                const isLast = index === tournamentPhases.length - 1;

                return (
                  <View key={phase.id} style={styles.phaseStepContainer}>
                    {/* Connector line before */}
                    {index > 0 ? (
                      <View style={[
                        styles.phaseConnector,
                        isCompleted && wonPhase && { backgroundColor: theme.success },
                        isCompleted && !wonPhase && { backgroundColor: theme.error },
                      ]} />
                    ) : null}

                    {/* Phase circle */}
                    <View style={[
                      styles.phaseCircleNew,
                      isCompleted && wonPhase && styles.phaseCircleNewWon,
                      isCompleted && !wonPhase && styles.phaseCircleNewLost,
                      isCurrent && styles.phaseCircleNewCurrent,
                      !isCompleted && !isCurrent && styles.phaseCircleNewFuture,
                    ]}>
                      {isCompleted && hasMatchInPhase ? (
                        <MaterialIcons
                          name={wonPhase ? 'check' : 'close'}
                          size={18}
                          color="#FFF"
                        />
                      ) : showMatchCount ? (
                        <Text style={[
                          styles.phaseNumberNew,
                          isCurrent && { color: theme.primary, fontWeight: '800' as const },
                        ]}>
                          {matchesInPhase.length}
                        </Text>
                      ) : (
                        <Text style={[
                          styles.phaseNumberNew,
                          isCurrent && { color: theme.primary, fontWeight: '800' as const },
                        ]}>
                          {index + 1}
                        </Text>
                      )}
                    </View>

                    {/* Phase label */}
                    <Text style={[
                      styles.phaseLabelNew,
                      isCompleted && wonPhase && { color: theme.success, fontWeight: '600' as const },
                      isCompleted && !wonPhase && { color: theme.error, fontWeight: '600' as const },
                      isCurrent && { color: theme.primary, fontWeight: '700' as const },
                    ]}>
                      {phase.short}
                    </Text>

                    {/* Match count badge for pool/swiss */}
                    {showMatchCount && matchesInPhase.length > 1 ? (
                      <View style={[styles.phaseMatchCountBadge, { backgroundColor: (wonPhase ? theme.success : theme.error) + '20' }]}>
                        <Text style={[styles.phaseMatchCountText, { color: wonPhase ? theme.success : theme.error }]}>
                          {matchesInPhase.filter(m => m.winner === 'A').length}V-{matchesInPhase.filter(m => m.winner === 'B').length}D
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.cadrageDescNew}>
              <View style={styles.cadrageDescIconBg}>
                <MaterialIcons name="info-outline" size={14} color={theme.tirColor} />
              </View>
              <Text style={styles.cadrageDescText}>
                {tournament.type === 'Poules' && t('tournament', 'poulesDesc')}
                {tournament.type === 'Élimination directe' && t('tournament', 'eliminationDesc')}
                {tournament.type === 'Mixte' && t('tournament', 'mixteDesc')}
                {tournament.type === 'Suisse' && t('tournament', 'suisseDesc')}
                {tournament.type === 'A/B/C' && t('tournament', 'abcDesc')}
                {tournament.type === 'Tirage intégral' && t('tournament', 'tirageDesc')}
                {tournament.type === 'Autre' && t('tournament', 'autreDesc')}
              </Text>
            </View>
          </View>
        </Animated.View>

        </View>

        {/* Tournament Poster */}
        {posterUrl ? (
          <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{language === 'fr' ? 'AFFICHE' : 'POSTER'}</Text>
            </View>
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, overflow: 'hidden', ...theme.shadows.cardElevated }}>
              <Pressable style={{ position: 'relative', minHeight: 200 }} onPress={() => posterType === 'pdf' ? Linking.openURL(posterUrl) : setShowPosterFullscreen(true)}>
                {posterType === 'image' ? (
                  <Image source={{ uri: posterUrl }} style={{ width: '100%', height: 260 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                ) : (
                  <View style={{ width: '100%', height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, gap: 8 }}>
                    <MaterialIcons name="picture-as-pdf" size={48} color={theme.error} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textPrimary }}>{language === 'fr' ? 'Document PDF' : 'PDF Document'}</Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{language === 'fr' ? 'Appuyez pour ouvrir' : 'Tap to open'}</Text>
                  </View>
                )}
              </Pressable>
              {canEdit && !isSharedItem ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: theme.primary + '10', borderRadius: theme.borderRadius.md }} onPress={showPosterUploadOptions}>
                    <MaterialIcons name="refresh" size={18} color={theme.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.primary }}>{language === 'fr' ? 'Remplacer' : 'Replace'}</Text>
                  </Pressable>
                  <Pressable style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.error + '10', borderRadius: theme.borderRadius.md }} onPress={handleRemovePoster}>
                    <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </Animated.View>
        ) : canEdit && !isSharedItem ? (
          <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
            <Pressable style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: theme.carreauColor + '25', borderStyle: 'dashed', ...theme.shadows.card }} onPress={showPosterUploadOptions}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.carreauColor + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <MaterialIcons name="image" size={32} color={theme.carreauColor} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.carreauColor, marginBottom: 6 }}>{language === 'fr' ? 'Ajouter une affiche' : 'Add a poster'}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center' }}>{language === 'fr' ? 'Photo ou PDF de l affiche du tournoi' : 'Photo or PDF of the tournament poster'}</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {uploadingPoster ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.section}>
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 40, alignItems: 'center', gap: 12, ...theme.shadows.card }}>
              <ActivityIndicator size="large" color={theme.carreauColor} />
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{language === 'fr' ? 'Envoi en cours...' : 'Uploading...'}</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Poster Fullscreen Modal */}
        <Modal visible={showPosterFullscreen} animationType="fade" transparent onRequestClose={() => setShowPosterFullscreen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
            <Pressable style={{ position: 'absolute', top: 60, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }} onPress={() => setShowPosterFullscreen(false)}>
              <MaterialIcons name="close" size={24} color="#FFF" />
            </Pressable>
            {posterUrl ? <Image source={{ uri: posterUrl }} style={{ width: '100%', height: '80%' }} contentFit="contain" transition={200} /> : null}
          </View>
        </Modal>

        {/* Quick Share with Tournament Players */}
        {canEdit && !isSharedItem && myMatches.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(140)}>
            <Pressable
              style={[styles.quickShareBtn, quickShareState === 'sent' && styles.quickShareBtnSent, quickShareState === 'loading' && { opacity: 0.7 }]}
              onPress={handleQuickShareWithPlayers}
              disabled={quickShareState === 'loading' || quickShareState === 'sent'}
            >
              {quickShareState === 'loading' ? (
                <>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={styles.quickShareText}>{language === 'fr' ? 'Detection des comptes...' : 'Detecting accounts...'}</Text>
                </>
              ) : quickShareState === 'sent' ? (
                <>
                  <View style={[styles.quickShareIconBg, { backgroundColor: '#10B98115' }]}>
                    <MaterialIcons name="check-circle" size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quickShareTitle, { color: '#10B981' }]}>{language === 'fr' ? 'Demandes envoyees !' : 'Requests sent!'}</Text>
                    <Text style={styles.quickShareSub}>{quickShareCount} {language === 'fr' ? 'joueur(s) notifie(s)' : 'player(s) notified'}</Text>
                  </View>
                </>
              ) : quickShareState === 'no_accounts' ? (
                <>
                  <View style={[styles.quickShareIconBg, { backgroundColor: '#F59E0B15' }]}>
                    <MaterialIcons name="person-off" size={20} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quickShareTitle, { color: '#F59E0B' }]}>{language === 'fr' ? 'Aucun compte detecte' : 'No accounts detected'}</Text>
                    <Text style={styles.quickShareSub}>{language === 'fr' ? 'Les joueurs n\'ont pas de compte lie' : 'Players have no linked accounts'}</Text>
                  </View>
                </>
              ) : quickShareState === 'already_shared' ? (
                <>
                  <View style={[styles.quickShareIconBg, { backgroundColor: theme.primary + '15' }]}>
                    <MaterialIcons name="done-all" size={20} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quickShareTitle, { color: theme.primary }]}>{language === 'fr' ? 'Deja partage' : 'Already shared'}</Text>
                    <Text style={styles.quickShareSub}>{language === 'fr' ? 'Tous les joueurs ont deja recu une demande' : 'All players already received a request'}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.quickShareIconBg, { backgroundColor: '#22C55E15' }]}>
                    <MaterialIcons name="group-add" size={20} color="#22C55E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickShareTitle}>{language === 'fr' ? 'Partager avec les coequipiers' : 'Share with teammates'}</Text>
                    <Text style={styles.quickShareSub}>{language === 'fr' ? 'Envoie automatique aux joueurs avec un compte' : 'Auto-send to players with an account'}</Text>
                  </View>
                  <View style={styles.quickShareArrow}>
                    <MaterialIcons name="send" size={16} color="#22C55E" />
                  </View>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Match Timeline */}
        <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tournament', 'myMatches')}</Text>
            <Text style={styles.sectionCount}>{myMatches.length}</Text>
          </View>

          {myMatches.length > 0 ? (
            <View style={styles.timelineContainer}>
              {/* Vertical timeline line */}
              <View style={styles.timelineLine} />

              {myMatches.map((match, idx) => (
                <TimelineMatchCard key={match.id} match={match} t={t} language={language} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyMatches}>
              <MaterialIcons name="sports" size={48} color={theme.textMuted} />
              <Text style={styles.emptyMatchesText}>{t('tournament', 'noMatchRecorded')}</Text>
              <Text style={styles.emptyMatchesHint}>{t('tournament', 'addFirstMatch')}</Text>
            </View>
          )}

          {/* Visibility Toggle - only for owner */}
          {canEdit && !isSharedItem && (
            <View style={styles.visibilitySection}>
              <Text style={styles.sectionTitle}>{t('map', 'visibility').toUpperCase()}</Text>
              <Pressable
                style={styles.visibilityCard}
                onPress={handleOpenPublicPreview}
                disabled={togglingPublic}
              >
                <View style={[styles.visibilityIcon, { backgroundColor: isPublicState ? theme.success + '15' : theme.textMuted + '15' }]}>
                  <MaterialIcons name={isPublicState ? 'public' : 'lock'} size={22} color={isPublicState ? theme.success : theme.textMuted} />
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={styles.visibilityTitle}>{t('map', 'visibilityToggle')}</Text>
                  <Text style={styles.visibilityDesc}>
                    {isPublicState ? t('map', 'publicItemsDesc') : t('map', 'makePublic')}
                  </Text>
                </View>
                <View style={[styles.visibilityBadge, { backgroundColor: isPublicState ? theme.success + '20' : theme.textMuted + '15' }]}>
                  <Text style={[styles.visibilityBadgeText, { color: isPublicState ? theme.success : theme.textMuted }]}>
                    {isPublicState ? t('map', 'publicLabel') : t('map', 'privateLabel')}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* Delete Tournament - only for owner */}
          {canEdit && !isSharedItem && (
            <View style={styles.deleteTournamentSection}>
              <Pressable
                style={styles.deleteTournamentBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    language === 'fr' ? 'Supprimer ce tournoi ?' : 'Delete this tournament?',
                    language === 'fr' ? 'Cette action est irreversible. Tous les matchs associes seront dissocies.' : 'This action is irreversible. All associated matches will be unlinked.',
                    [
                      { text: t('common', 'cancel'), style: 'cancel' },
                      { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
                        try {
                          const { error } = await deleteTournament(tournament.id);
                          if (error) {
                            Alert.alert(t('common', 'error'), error);
                            return;
                          }
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          router.back();
                        } catch (e: any) {
                          Alert.alert(t('common', 'error'), e?.message || 'Delete failed');
                        }
                      }},
                    ]
                  );
                }}
              >
                <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                <Text style={styles.deleteTournamentBtnText}>{language === 'fr' ? 'Supprimer ce tournoi' : 'Delete this tournament'}</Text>
              </Pressable>
            </View>
          )}

          {/* Modification Logs - only visible to owner */}
          <ModificationLogsSection
            itemType="tournament"
            itemId={id!}
            isOwner={!isSharedItem && !!user?.id}
          />
        </Animated.View>
      </ScrollView>

      {/* Action Buttons - only for own tournaments (not shared) */}
      {canEdit && !isSharedItem && (
        <Animated.View 
          entering={FadeIn.duration(300).delay(300)}
          style={[styles.fabContainer, { bottom: insets.bottom + 24 }]}
        >
          <Pressable 
            style={styles.fabSecondary}
            onPress={() => setEndTournamentStep(1)}
          >
            <MaterialIcons name="flag" size={22} color={theme.error} />
          </Pressable>
          <Pressable 
            style={styles.fab} 
            onPress={() => router.push(`/match/new?tournamentId=${tournament.id}`)}
          >
            <MaterialIcons name="add" size={28} color="#FFF" />
            <Text style={styles.fabText}>{t('tournament', 'newMatch')}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Notification Settings Modal */}
      <Modal
        visible={showNotificationModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalClose} onPress={() => setShowNotificationModal(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('tournament', 'notifications')}</Text>
            <Pressable 
              style={[styles.modalSave, (isScheduling || permissionStatus !== 'granted') && styles.modalSaveDisabled]}
              onPress={handleSaveNotifications}
              disabled={isScheduling || permissionStatus !== 'granted'}
            >
              {isScheduling ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.modalSaveText, permissionStatus !== 'granted' && styles.modalSaveTextDisabled]}>
                  {isNotificationEnabled ? t('tournament', 'disableLabel') : t('tournament', 'enableLabel')}
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.notificationModalScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Tournament Info */}
            <View style={styles.notificationTournamentInfo}>
              <View style={styles.notificationTournamentIcon}>
                <MaterialIcons name="emoji-events" size={28} color={theme.carreauColor} />
              </View>
              <View style={styles.notificationTournamentDetails}>
                <Text style={styles.notificationTournamentName} numberOfLines={2}>
                  {tournament?.name}
                </Text>
                <Text style={styles.notificationTournamentDate}>
                  {tournamentDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </Text>
                {daysUntilTournament > 0 ? (
                  <View style={styles.daysCountdown}>
                    <MaterialIcons name="schedule" size={14} color={theme.primary} />
                    <Text style={styles.daysCountdownText}>
                      {t('tournament', 'inDaysCount')} {daysUntilTournament} {daysUntilTournament > 1 ? t('tournament', 'daysUnit') : t('tournament', 'dayUnit')}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.daysCountdown, { backgroundColor: theme.warning + '15' }]}>
                    <MaterialIcons name="event" size={14} color={theme.warning} />
                    <Text style={[styles.daysCountdownText, { color: theme.warning }]}>
                      {daysUntilTournament === 0 ? t('tournament', 'todayLabel') : t('tournament', 'passedLabel')}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Permission Status */}
            {permissionStatus !== 'granted' && (
              <View style={styles.permissionBanner}>
                <View style={styles.permissionBannerIcon}>
                  <MaterialIcons name="notifications-off" size={24} color={theme.warning} />
                </View>
                <View style={styles.permissionBannerContent}>
                  <Text style={styles.permissionBannerTitle}>{t('tournament', 'permissionsRequired')}</Text>
                  <Text style={styles.permissionBannerDesc}>
                    {t('tournament', 'enableNotifToReceive')}
                  </Text>
                </View>
                <Pressable style={styles.permissionBannerBtn} onPress={handleRequestPermission}>
                  <Text style={styles.permissionBannerBtnText}>{t('tournament', 'authorize')}</Text>
                </Pressable>
              </View>
            )}

            {/* Current Status */}
            <View style={[
              styles.notificationStatusBanner,
              isNotificationEnabled ? styles.notificationStatusEnabled : styles.notificationStatusDisabled
            ]}>
              <MaterialIcons 
                name={isNotificationEnabled ? 'notifications-active' : 'notifications-off'} 
                size={24} 
                color={isNotificationEnabled ? theme.success : theme.textMuted} 
              />
              <View style={styles.notificationStatusInfo}>
                <Text style={[
                  styles.notificationStatusTitle,
                  { color: isNotificationEnabled ? theme.success : theme.textSecondary }
                ]}>
                  {isNotificationEnabled ? t('tournament', 'scheduledReminders') : t('tournament', 'remindersDisabled')}
                </Text>
                <Text style={styles.notificationStatusDesc}>
                  {isNotificationEnabled 
                    ? t('tournament', 'willReceivePush')
                    : t('tournament', 'enableToReceive')
                  }
                </Text>
              </View>
            </View>

            {/* Reminder Options */}
            <View style={styles.notificationSection}>
              <Text style={styles.notificationSectionTitle}>{t('tournament', 'remindersToSchedule')}</Text>
              <Text style={styles.notificationSectionSubtitle}>
                {t('tournament', 'chooseWhenReminder')}
              </Text>

              {/* 1 Week Before */}
              <View style={[
                styles.notificationOption,
                daysUntilTournament < 7 && styles.notificationOptionDisabled
              ]}>
                <View style={[styles.notificationOptionIcon, { backgroundColor: theme.primary + '15' }]}>
                  <MaterialIcons name="date-range" size={22} color={theme.primary} />
                </View>
                <View style={styles.notificationOptionInfo}>
                  <Text style={styles.notificationOptionTitle}>{t('tournament', 'oneWeekBeforeLabel')}</Text>
                  <Text style={styles.notificationOptionDesc}>
                    {daysUntilTournament >= 7 
                      ? `${new Date(tournamentDate.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} ${t('tournament', 'atTime')} 9h00`
                      : t('tournament', 'deadlinePassed')
                    }
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.oneWeek && daysUntilTournament >= 7}
                  onValueChange={(val) => setNotificationSettings(prev => ({ ...prev, oneWeek: val }))}
                  trackColor={{ false: theme.border, true: theme.primary + '50' }}
                  thumbColor={notificationSettings.oneWeek && daysUntilTournament >= 7 ? theme.primary : theme.surface}
                  disabled={daysUntilTournament < 7}
                />
              </View>

              {/* 3 Days Before */}
              <View style={[
                styles.notificationOption,
                daysUntilTournament < 3 && styles.notificationOptionDisabled
              ]}>
                <View style={[styles.notificationOptionIcon, { backgroundColor: theme.accent + '15' }]}>
                  <MaterialIcons name="event-note" size={22} color={theme.accent} />
                </View>
                <View style={styles.notificationOptionInfo}>
                  <Text style={styles.notificationOptionTitle}>{t('tournament', 'threeDaysBeforeLabel')}</Text>
                  <Text style={styles.notificationOptionDesc}>
                    {daysUntilTournament >= 3 
                      ? `${new Date(tournamentDate.getTime() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} ${t('tournament', 'atTime')} 9h00`
                      : t('tournament', 'deadlinePassed')
                    }
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.threeDays && daysUntilTournament >= 3}
                  onValueChange={(val) => setNotificationSettings(prev => ({ ...prev, threeDays: val }))}
                  trackColor={{ false: theme.border, true: theme.accent + '50' }}
                  thumbColor={notificationSettings.threeDays && daysUntilTournament >= 3 ? theme.accent : theme.surface}
                  disabled={daysUntilTournament < 3}
                />
              </View>

              {/* 1 Day Before */}
              <View style={[
                styles.notificationOption,
                daysUntilTournament < 1 && styles.notificationOptionDisabled
              ]}>
                <View style={[styles.notificationOptionIcon, { backgroundColor: theme.warning + '15' }]}>
                  <MaterialIcons name="today" size={22} color={theme.warning} />
                </View>
                <View style={styles.notificationOptionInfo}>
                  <Text style={styles.notificationOptionTitle}>{t('tournament', 'dayBeforeLabel')}</Text>
                  <Text style={styles.notificationOptionDesc}>
                    {daysUntilTournament >= 1 
                      ? `${new Date(tournamentDate.getTime() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} ${t('tournament', 'atTime')} 18h00`
                      : t('tournament', 'deadlinePassed')
                    }
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.oneDayBefore && daysUntilTournament >= 1}
                  onValueChange={(val) => setNotificationSettings(prev => ({ ...prev, oneDayBefore: val }))}
                  trackColor={{ false: theme.border, true: theme.warning + '50' }}
                  thumbColor={notificationSettings.oneDayBefore && daysUntilTournament >= 1 ? theme.warning : theme.surface}
                  disabled={daysUntilTournament < 1}
                />
              </View>
            </View>

            {/* Test notification */}
            {permissionStatus === 'granted' && (
              <Pressable style={styles.testNotificationBtn} onPress={handleTestNotification}>
                <MaterialIcons name="send" size={18} color={theme.primary} />
                <Text style={styles.testNotificationBtnText}>{t('tournament', 'sendTestNotif')}</Text>
              </Pressable>
            )}

            {/* Info */}
            <View style={styles.notificationInfoCard}>
              <MaterialIcons name="info-outline" size={20} color={theme.textMuted} />
              <Text style={styles.notificationInfoText}>
                {t('tournament', 'notifInfoText')}
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ===== PUBLIC PREVIEW MODAL ===== */}
      <Modal visible={showPublicPreview} animationType="slide" transparent>
        <View style={styles.pvOverlay}>
          <View style={styles.pvModal}>
            <View style={styles.pvHeader}>
              <View style={[styles.pvHeaderIcon, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="public" size={22} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pvHeaderTitle}>{t('preview', 'publicTournamentTitle')}</Text>
                <Text style={styles.pvHeaderSub}>{t('preview', 'publicTournamentDesc')}</Text>
              </View>
              <Pressable style={styles.pvCloseBtn} onPress={() => setShowPublicPreview(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.pvScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.pvCard}>
                <View style={styles.pvAvatarRow}>
                  <View style={styles.pvAvatarTournament}>
                    <MaterialIcons name="emoji-events" size={28} color={theme.carreauColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pvName}>{tournament.name}</Text>
                    <Text style={styles.pvSubtext}>{t('formats', tournament.format)} • {t('tournamentTypes', tournament.type)}</Text>
                  </View>
                </View>

                <View style={styles.pvLocationRow}>
                  <MaterialIcons name="event" size={14} color={theme.textSecondary} />
                  <Text style={styles.pvLocationText}>
                    {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>

                <View style={styles.pvLocationRow}>
                  <MaterialIcons name="place" size={14} color={theme.textSecondary} />
                  <Text style={styles.pvLocationText}>{tournament.location.city}</Text>
                </View>

                {(tournament.tournamentLevel || tournament.tournamentCategory) ? (
                  <View style={styles.pvInfoRow}>
                    {tournament.tournamentLevel ? (
                      <View style={styles.pvInfoPill}>
                        <MaterialIcons name="signal-cellular-alt" size={12} color={theme.success} />
                        <Text style={[styles.pvInfoText, { color: theme.success }]}>{t('tournamentLevels', tournament.tournamentLevel)}</Text>
                      </View>
                    ) : null}
                    {tournament.tournamentCategory ? (
                      <View style={styles.pvInfoPill}>
                        <MaterialIcons name="category" size={12} color={theme.warning} />
                        <Text style={[styles.pvInfoText, { color: theme.warning }]}>{t('tournamentCategories', tournament.tournamentCategory)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {terrain ? (
                  <View style={styles.pvInfoRow}>
                    <View style={styles.pvInfoPill}>
                      <MaterialIcons name="sports-soccer" size={12} color={theme.accent} />
                      <Text style={[styles.pvInfoText, { color: theme.accent }]}>{terrain.name}</Text>
                    </View>
                  </View>
                ) : null}

                {tournament.finalResult && tournament.status === 'Termine' ? (
                  <View style={[styles.pvResultBanner, { backgroundColor: theme.carreauColor + '10' }]}>
                    <MaterialIcons name="emoji-events" size={16} color={theme.carreauColor} />
                    <Text style={[styles.pvResultText, { color: theme.carreauColor }]}>{t('palmaresResults', tournament.finalResult)}</Text>
                  </View>
                ) : null}

                <View style={styles.pvStatsRow}>
                  <View style={styles.pvStatItem}>
                    <Text style={styles.pvStatValue}>{tournament.participants || 0}</Text>
                    <Text style={styles.pvStatLabel}>{t('tournament', 'participants')}</Text>
                  </View>
                  <View style={styles.pvStatDivider} />
                  <View style={styles.pvStatItem}>
                    <Text style={styles.pvStatValue}>{tournament.maxParticipants || 32}</Text>
                    <Text style={styles.pvStatLabel}>Max</Text>
                  </View>
                  <View style={styles.pvStatDivider} />
                  <View style={styles.pvStatItem}>
                    <Text style={[styles.pvStatValue, { color: tournament.status === 'A venir' ? theme.primary : tournament.status === 'Termine' ? theme.success : theme.warning }]}>
                      {t('tournamentStatus', tournament.status)}
                    </Text>
                    <Text style={styles.pvStatLabel}>{t('preview', 'statusLabel')}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.pvNote}>
                <MaterialIcons name="visibility" size={16} color={theme.primary} />
                <Text style={styles.pvNoteText}>{t('preview', 'publicNoteTournament')}</Text>
              </View>
            </ScrollView>

            <View style={styles.pvActions}>
              <Pressable style={styles.pvCancelBtn} onPress={() => setShowPublicPreview(false)}>
                <Text style={styles.pvCancelText}>{t('common', 'cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.pvConfirmBtn, { backgroundColor: isPublicState ? theme.error : theme.success }]} onPress={handleConfirmPublic} disabled={togglingPublic}>
                {togglingPublic ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name={isPublicState ? 'lock' : 'public'} size={18} color="#FFF" />
                    <Text style={styles.pvConfirmText}>{isPublicState
                      ? t('preview', 'makePrivate')
                      : t('preview', 'makePublic')
                    }</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        itemType="tournament"
        itemId={tournament.id}
        itemName={tournament.name}
      />

      <MergePickerModal
        visible={showMergePicker}
        onClose={() => setShowMergePicker(false)}
        itemType="tournament"
        currentItemId={id!}
      />

      {/* End Tournament Modal - Multi-Step */}
      <Modal
        visible={endTournamentStep > 0}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseEndTournament}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalClose} onPress={endTournamentStep > 1 ? () => setEndTournamentStep(endTournamentStep - 1) : handleCloseEndTournament}>
              <MaterialIcons name={endTournamentStep > 1 ? 'arrow-back' : 'close'} size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {endTournamentStep === 1 ? t('tournament', 'finalRanking') : endTournamentStep === 2 ? t('tournament', 'detailsLabel') : t('tournament', 'confirmationLabel')}
            </Text>
            <View style={styles.endStepIndicator}>
              <Text style={styles.endStepText}>{endTournamentStep}/3</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.endProgressBar}>
            <View style={[styles.endProgressFill, { width: `${(endTournamentStep / 3) * 100}%` }]} />
          </View>

          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Tournament header in all steps */}
            <View style={styles.quickTournamentInfo}>
              <MaterialIcons name="emoji-events" size={20} color={theme.carreauColor} />
              <Text style={styles.quickTournamentName}>{tournament.name}</Text>
            </View>

            {/* STEP 1: Result Selection with Podium */}
            {endTournamentStep === 1 && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <Text style={styles.endTournamentQuestion}>{t('tournament', 'whatIsYourRanking')}</Text>

                {/* Visual Podium - Top 3 */}
                <View style={styles.podiumContainer}>
                  {/* 2nd place */}
                  <Pressable style={styles.podiumSpot} onPress={() => handleSelectResult('2ème')}>
                    <View style={[styles.podiumIcon, { backgroundColor: '#C0C0C0' + '25' }]}>
                      <MaterialIcons name="workspace-premium" size={28} color="#C0C0C0" />
                    </View>
                    <View style={[styles.podiumBlock, styles.podiumBlock2nd]}>
                      <Text style={[styles.podiumLabel, { color: '#C0C0C0' }]}>{t('palmaresResults', '2ème')}</Text>
                    </View>
                  </Pressable>
                  {/* 1st place */}
                  <Pressable style={styles.podiumSpot} onPress={() => handleSelectResult('1er')}>
                    <View style={[styles.podiumIcon, { backgroundColor: '#FFD700' + '25' }]}>
                      <MaterialIcons name="emoji-events" size={36} color="#FFD700" />
                    </View>
                    <View style={[styles.podiumBlock, styles.podiumBlock1st]}>
                      <Text style={[styles.podiumLabel, { color: '#FFD700' }]}>{t('palmaresResults', '1er')}</Text>
                    </View>
                  </Pressable>
                  {/* 3rd place */}
                  <Pressable style={styles.podiumSpot} onPress={() => handleSelectResult('3ème')}>
                    <View style={[styles.podiumIcon, { backgroundColor: '#CD7F32' + '25' }]}>
                      <MaterialIcons name="military-tech" size={28} color="#CD7F32" />
                    </View>
                    <View style={[styles.podiumBlock, styles.podiumBlock3rd]}>
                      <Text style={[styles.podiumLabel, { color: '#CD7F32' }]}>{t('palmaresResults', '3ème')}</Text>
                    </View>
                  </Pressable>
                </View>

                {/* Other results */}
                <Text style={styles.endOtherResultsTitle}>{t('tournament', 'otherRanking')}</Text>
                <View style={styles.endOtherResults}>
                  {[
                    { id: 'Demi-finale', label: t('tournament', 'semiFinal'), icon: 'trending-up', color: '#4A90D9' },
                    { id: 'Quart de finale', label: t('tournament', 'quarterFinal'), icon: 'trending-flat', color: '#F5A623' },
                    { id: '1/8 finale', label: t('tournament', 'roundOf16'), icon: 'sports', color: '#7B8794' },
                    { id: 'Poules', label: t('tournament', 'eliminatedInGroups'), icon: 'group', color: '#7B8794' },
                    { id: 'Autre', label: t('tournament', 'other'), icon: 'more-horiz', color: theme.textMuted },
                  ].map(item => (
                    <Pressable
                      key={item.id}
                      style={styles.endOtherResultItem}
                      onPress={() => handleSelectResult(item.id)}
                    >
                      <View style={[styles.endOtherResultIcon, { backgroundColor: item.color + '15' }]}>
                        <MaterialIcons name={item.icon as any} size={20} color={item.color} />
                      </View>
                      <Text style={styles.endOtherResultLabel}>{item.label}</Text>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* STEP 2: Prize & Details */}
            {endTournamentStep === 2 && selectedFinalResult && (
              <Animated.View entering={FadeInDown.duration(300)}>
                {/* Selected result badge */}
                {(() => {
                  const cfg = {
                    '1er': { icon: 'emoji-events', color: '#FFD700', label: t('tournament', 'championCelebration') },
                    '2ème': { icon: 'workspace-premium', color: '#C0C0C0', label: t('tournament', 'finalistCelebration') },
                    '3ème': { icon: 'military-tech', color: '#CD7F32', label: t('tournament', 'thirdPlace') },
                  }[selectedFinalResult] || { icon: 'sports', color: theme.textSecondary, label: selectedFinalResult };
                  const isPodium = ['1er', '2ème', '3ème'].includes(selectedFinalResult);
                  return (
                    <View style={[styles.endSelectedResultBadge, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40' }]}>
                      <MaterialIcons name={cfg.icon as any} size={32} color={cfg.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.endSelectedResultLabel, { color: cfg.color }]}>{cfg.label}</Text>
                        {isPodium && <Text style={styles.endSelectedResultSub}>{t('tournament', 'finalRankingLabel')}</Text>}
                      </View>
                      <Pressable style={styles.endChangeBtn} onPress={() => setEndTournamentStep(1)}>
                        <Text style={styles.endChangeBtnText}>{t('tournament', 'changeLabel')}</Text>
                      </Pressable>
                    </View>
                  );
                })()}

                {/* Prize input */}
                <View style={styles.endDetailSection}>
                  <Text style={styles.endDetailSectionTitle}>{t('tournament', 'tournamentPrize')}</Text>
                  <View style={styles.endPrizeInputRow}>
                    <MaterialIcons name="emoji-events" size={22} color={theme.success} />
                    <TextInput
                      style={styles.endPrizeInput}
                      value={prizeWonInput}
                      onChangeText={setPrizeWonInput}
                      placeholder="0"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.endPrizeUnit}>€</Text>
                  </View>
                  {tournament.registrationCost ? (
                    <View style={styles.endCostInfo}>
                      <MaterialIcons name="info-outline" size={14} color={theme.textMuted} />
                      <Text style={styles.endCostInfoText}>
                        {t('tournament', 'registrationLabel')} : {tournament.registrationCost}€ — 
                        {t('tournament', 'netLabel')} : {((parseFloat(prizeWonInput) || 0) - tournament.registrationCost) >= 0 ? '+' : ''}
                        {((parseFloat(prizeWonInput) || 0) - tournament.registrationCost).toFixed(0)}€
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Stats summary */}
                <View style={styles.endDetailSection}>
                  <Text style={styles.endDetailSectionTitle}>{t('tournament', 'journeySummary')}</Text>
                  <View style={styles.endTournamentStats}>
                    <View style={styles.endTournamentStatsRow}>
                      <View style={styles.endTournamentStatItem}>
                        <Text style={styles.endTournamentStatValue}>{myStats.played}</Text>
                        <Text style={styles.endTournamentStatLabel}>{t('tournament', 'matchesLabel')}</Text>
                      </View>
                      <View style={styles.endTournamentStatItem}>
                        <Text style={[styles.endTournamentStatValue, { color: theme.success }]}>{myStats.wins}</Text>
                        <Text style={styles.endTournamentStatLabel}>{t('tournament', 'victoriesLabel')}</Text>
                      </View>
                      <View style={styles.endTournamentStatItem}>
                        <Text style={[styles.endTournamentStatValue, { color: theme.error }]}>{myStats.losses}</Text>
                        <Text style={styles.endTournamentStatLabel}>{t('tournament', 'defeatsLabel')}</Text>
                      </View>
                      {myStats.tirRate !== null ? (
                        <View style={styles.endTournamentStatItem}>
                          <Text style={[styles.endTournamentStatValue, { color: theme.tirColor }]}>{myStats.tirRate}%</Text>
                          <Text style={styles.endTournamentStatLabel}>{t('tournament', 'shotLabel')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Continue button */}
                <Pressable style={styles.endContinueBtn} onPress={handleGoToSummary}>
                  <Text style={styles.endContinueBtnText}>{t('tournament', 'continueBtn')}</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                </Pressable>
              </Animated.View>
            )}

            {/* STEP 3: Confirmation Summary */}
            {endTournamentStep === 3 && selectedFinalResult && (
              <Animated.View entering={FadeInDown.duration(300)}>
                {(() => {
                  const isPodium = ['1er', '2ème', '3ème'].includes(selectedFinalResult);
                  const resultCfg: Record<string, { icon: string; color: string }> = {
                    '1er': { icon: 'emoji-events', color: '#FFD700' },
                    '2ème': { icon: 'workspace-premium', color: '#C0C0C0' },
                    '3ème': { icon: 'military-tech', color: '#CD7F32' },
                  };
                  const cfg = resultCfg[selectedFinalResult] || { icon: 'sports', color: theme.textSecondary };
                  const prize = parseFloat(prizeWonInput) || 0;

                  return (
                    <>
                      {/* Celebration for podium */}
                      {isPodium && (
                        <Animated.View entering={FadeIn.duration(500)} style={styles.endCelebration}>
                          <View style={[styles.endCelebrationIcon, { backgroundColor: cfg.color + '20' }]}>
                            <MaterialIcons name={cfg.icon as any} size={56} color={cfg.color} />
                          </View>
                          <Text style={[styles.endCelebrationTitle, { color: cfg.color }]}>
                            {selectedFinalResult === '1er' ? t('tournament', 'championCelebration') : selectedFinalResult === '2ème' ? t('tournament', 'finalistCelebration') : t('tournament', 'podiumCelebration')}
                          </Text>
                          <Text style={styles.endCelebrationSub}>{tournament.name}</Text>
                        </Animated.View>
                      )}

                      {!isPodium && (
                        <View style={styles.endSummaryHeader}>
                          <View style={[styles.endSummaryIcon, { backgroundColor: cfg.color + '20' }]}>
                            <MaterialIcons name={cfg.icon as any} size={36} color={cfg.color} />
                          </View>
                          <Text style={styles.endSummaryResult}>{t('palmaresResults', selectedFinalResult)}</Text>
                          <Text style={styles.endSummaryTournament}>{tournament.name}</Text>
                        </View>
                      )}

                      {/* Summary card */}
                      <View style={styles.endSummaryCard}>
                        <View style={styles.endSummaryRow}>
                          <MaterialIcons name="emoji-events" size={18} color={theme.textSecondary} />
                          <Text style={styles.endSummaryRowLabel}>{t('tournament', 'rankingLabel')}</Text>
                          <Text style={[styles.endSummaryRowValue, { color: cfg.color }]}>{t('palmaresResults', selectedFinalResult)}</Text>
                        </View>
                        <View style={styles.endSummaryDivider} />
                        <View style={styles.endSummaryRow}>
                          <MaterialIcons name="sports" size={18} color={theme.textSecondary} />
                          <Text style={styles.endSummaryRowLabel}>{t('tournament', 'matchesPlayed')}</Text>
                          <Text style={styles.endSummaryRowValue}>{myStats.played} ({myStats.wins}V-{myStats.losses}D)</Text>
                        </View>
                        <View style={styles.endSummaryDivider} />
                        <View style={styles.endSummaryRow}>
                          <MaterialIcons name="show-chart" size={18} color={theme.textSecondary} />
                          <Text style={styles.endSummaryRowLabel}>{t('tournament', 'pointDiff')}</Text>
                          <Text style={[styles.endSummaryRowValue, { color: myStats.pointDiff >= 0 ? theme.success : theme.error }]}>
                            {myStats.pointDiff > 0 ? '+' : ''}{myStats.pointDiff}
                          </Text>
                        </View>
                        {prize > 0 && (
                          <>
                            <View style={styles.endSummaryDivider} />
                            <View style={styles.endSummaryRow}>
                              <MaterialIcons name="payments" size={18} color={theme.success} />
                              <Text style={styles.endSummaryRowLabel}>{t('tournament', 'gainsLabel')}</Text>
                              <Text style={[styles.endSummaryRowValue, { color: theme.success }]}>+{prize}€</Text>
                            </View>
                          </>
                        )}
                        {tournament.registrationCost ? (
                          <>
                            <View style={styles.endSummaryDivider} />
                            <View style={styles.endSummaryRow}>
                              <MaterialIcons name="receipt" size={18} color={theme.textMuted} />
                              <Text style={styles.endSummaryRowLabel}>{t('tournament', 'registrationLabel')}</Text>
                              <Text style={[styles.endSummaryRowValue, { color: theme.error }]}>-{tournament.registrationCost}€</Text>
                            </View>
                          </>
                        ) : null}
                      </View>

                      {/* Status change notice */}
                      <View style={styles.endNotice}>
                        <MaterialIcons name="info" size={18} color={theme.primary} />
                        <Text style={styles.endNoticeText}>
                          {t('tournament', 'endNotice')}
                        </Text>
                      </View>

                      {/* Confirm button */}
                      <Pressable
                        style={[styles.endConfirmBtn, isSavingEnd && { opacity: 0.7 }]}
                        onPress={handleConfirmEndTournament}
                        disabled={isSavingEnd}
                      >
                        {isSavingEnd ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <MaterialIcons name="check" size={22} color="#FFF" />
                            <Text style={styles.endConfirmBtnText}>{t('tournament', 'endTournament')}</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  );
                })()}
              </Animated.View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent + '15',
    borderRadius: 20,
  },
  shareButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  notificationButtonActive: {
    backgroundColor: theme.warning + '20',
  },
  editButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  scrollContentTablet: {
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%',
    paddingHorizontal: 24,
  },
  tournamentCardTablet: {
    padding: 24,
  },
  tabletRow: {
    flexDirection: 'row' as const,
    gap: 16,
    marginBottom: 0,
  },
  tabletHalf: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.textMuted,
    marginTop: 12,
  },
  // Hero Card
  heroCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    marginBottom: 14,
    overflow: 'hidden',
    ...theme.shadows.cardElevated,
  },
  heroAccent: {
    height: 5,
    width: '100%',
  },
  heroContent: {
    padding: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTrophyCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.carreauColor + '12',
    borderWidth: 2,
    borderColor: theme.carreauColor + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroTitleArea: {
    flex: 1,
  },
  heroTournamentName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textPrimary,
    letterSpacing: -0.3,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  heroMetaPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  heroDescriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.backgroundSecondary,
    padding: 12,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 14,
  },
  heroDescriptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.textSecondary,
  },
  heroResultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  heroResultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroResultText: {
    fontSize: 18,
    fontWeight: '800',
  },
  heroTerrainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  heroTerrainIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTerrainName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  heroTerrainType: {
    fontSize: 12,
    color: theme.textMuted,
  },
  heroMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.success + '10',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.full,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.success + '25',
    justifyContent: 'center',
  },
  heroMapBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.success,
  },

  tournamentCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  classificationBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  classificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  classificationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  terrainInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 10,
  },
  terrainInfoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  terrainInfoContent: {
    flex: 1,
  },
  terrainInfoName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  terrainInfoType: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  finalResultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  finalResultBannerText: {
    fontSize: 16,
    fontWeight: '700',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.textMuted,
    marginHorizontal: 6,
  },
  // Status Card New
  statusCardNew: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 18,
    marginBottom: 16,
    ...theme.shadows.cardElevated,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusHeaderInfo: {
    flex: 1,
  },
  statusLabelNew: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statusSubtextNew: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  statsGridNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  statsGridItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsGridValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  statsGridLabel: {
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  statsGridDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.border,
  },
  winLossBarContainer: {
    gap: 6,
  },
  winLossBar: {
    height: 6,
    backgroundColor: theme.error + '30',
    borderRadius: 3,
    overflow: 'hidden',
  },
  winLossBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  winLossLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  winLossLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cadrageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  cadrageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.primary,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
    marginLeft: 8,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  // Phase Progress New
  progressCardNew: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 18,
    ...theme.shadows.cardElevated,
  },
  phasesScrollNew: {
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  phaseStepContainer: {
    alignItems: 'center',
    flexDirection: 'column',
    position: 'relative',
    minWidth: 56,
  },
  phaseConnector: {
    position: 'absolute',
    top: 20,
    left: -16,
    width: 16,
    height: 3,
    backgroundColor: theme.border,
    borderRadius: 1.5,
  },
  phaseCircleNew: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  phaseCircleNewWon: {
    backgroundColor: theme.success,
    borderColor: theme.success,
  },
  phaseCircleNewLost: {
    backgroundColor: theme.error,
    borderColor: theme.error,
  },
  phaseCircleNewCurrent: {
    backgroundColor: theme.primary + '10',
    borderColor: theme.primary,
    borderWidth: 3,
  },
  phaseCircleNewFuture: {
    backgroundColor: theme.backgroundSecondary,
    borderColor: theme.border,
  },
  phaseNumberNew: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textMuted,
  },
  phaseLabelNew: {
    fontSize: 11,
    color: theme.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  phaseMatchCountBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  phaseMatchCountText: {
    fontSize: 9,
    fontWeight: '700',
  },
  cadrageDescNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  cadrageDescIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.tirColor + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadrageDescText: {
    fontSize: 12,
    color: theme.textMuted,
    flex: 1,
    lineHeight: 17,
  },
  // Timeline
  timelineContainer: {
    position: 'relative',
    paddingLeft: 24,
  },
  timelineLine: {
    position: 'absolute',
    left: 11,
    top: 12,
    bottom: 12,
    width: 2.5,
    backgroundColor: theme.border,
    borderRadius: 1.5,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  timelineDotCol: {
    position: 'absolute',
    left: -24,
    top: 18,
    width: 24,
    alignItems: 'center',
    zIndex: 2,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  tlCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  tlPhaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  tlPhaseBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tlBracketTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: theme.primary + '12',
    borderRadius: theme.borderRadius.full,
  },
  tlBracketTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.primary,
  },
  tlDate: {
    fontSize: 11,
    color: theme.textMuted,
  },
  tlScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tlTeam: {
    flex: 1,
  },
  tlTeamLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tlTeamNames: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  tlScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginHorizontal: 10,
  },
  tlScoreNum: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.textSecondary,
    minWidth: 22,
    textAlign: 'center',
  },
  tlScoreSep: {
    fontSize: 14,
    color: theme.textMuted,
    marginHorizontal: 4,
  },
  tlCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 8,
  },
  tlResultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  tlResultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tlDuration: {
    fontSize: 11,
    color: theme.textMuted,
  },
  emptyMatches: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 32,
    alignItems: 'center',
    ...theme.shadows.card,
  },
  emptyMatchesText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: 12,
  },
  emptyMatchesHint: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.full,
    gap: 8,
    ...theme.shadows.cardElevated,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.primary,
    ...theme.shadows.card,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  modalSave: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.primary,
  },
  modalSaveTextDisabled: {
    color: theme.textMuted,
  },
  modalContent: {
    flex: 1,
  },
  modalScroll: {
    padding: 16,
  },
  quickTournamentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.carreauColor + '10',
    padding: 12,
    borderRadius: theme.borderRadius.md,
    marginBottom: 20,
  },
  quickTournamentName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    flex: 1,
  },
  endTournamentQuestion: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  endStepIndicator: {
    width: 40,
    alignItems: 'center',
  },
  endStepText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
  },
  endProgressBar: {
    height: 3,
    backgroundColor: theme.border,
  },
  endProgressFill: {
    height: '100%',
    backgroundColor: theme.primary,
  },
  // Podium
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  podiumSpot: {
    alignItems: 'center',
    flex: 1,
  },
  podiumIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  podiumBlock: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: theme.border,
  },
  podiumBlock1st: {
    height: 64,
    borderColor: '#FFD700' + '60',
    backgroundColor: '#FFD700' + '10',
  },
  podiumBlock2nd: {
    height: 48,
    borderColor: '#C0C0C0' + '60',
    backgroundColor: '#C0C0C0' + '10',
  },
  podiumBlock3rd: {
    height: 36,
    borderColor: '#CD7F32' + '60',
    backgroundColor: '#CD7F32' + '10',
  },
  podiumLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  // Other results
  endOtherResultsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingLeft: 4,
  },
  endOtherResults: {
    gap: 8,
  },
  endOtherResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 14,
    borderRadius: theme.borderRadius.md,
    gap: 12,
    ...theme.shadows.card,
  },
  endOtherResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOtherResultLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  // Step 2: Details
  endSelectedResultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  endSelectedResultLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  endSelectedResultSub: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  endChangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.backgroundSecondary,
  },
  endChangeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
  },
  endDetailSection: {
    marginBottom: 20,
  },
  endDetailSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 10,
  },
  endPrizeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  endPrizeInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    padding: 0,
  },
  endPrizeUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  endCostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  endCostInfoText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  endTournamentStats: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  endTournamentStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  endTournamentStatItem: {
    alignItems: 'center',
  },
  endTournamentStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  endTournamentStatLabel: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
  endContinueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
    marginTop: 8,
  },
  endContinueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Step 3: Summary & Confirmation
  endCelebration: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 20,
  },
  endCelebrationIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  endCelebrationTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  endCelebrationSub: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  endSummaryHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
  },
  endSummaryIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  endSummaryResult: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  endSummaryTournament: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  endSummaryCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  endSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  endSummaryRowLabel: {
    flex: 1,
    fontSize: 14,
    color: theme.textSecondary,
  },
  endSummaryRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  endSummaryDivider: {
    height: 1,
    backgroundColor: theme.border,
  },
  endNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.primary + '10',
    padding: 14,
    borderRadius: theme.borderRadius.md,
    marginBottom: 20,
  },
  endNoticeText: {
    flex: 1,
    fontSize: 12,
    color: theme.primary,
    lineHeight: 18,
  },
  endConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.success,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
  },
  endConfirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  notificationModalScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  notificationTournamentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  notificationTournamentIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: theme.carreauColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  notificationTournamentDetails: {
    flex: 1,
  },
  notificationTournamentName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  notificationTournamentDate: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  daysCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  daysCountdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.warning + '15',
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.warning + '30',
  },
  permissionBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBannerContent: {
    flex: 1,
  },
  permissionBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  permissionBannerDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  permissionBannerBtn: {
    backgroundColor: theme.warning,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
  },
  permissionBannerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  notificationStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 20,
    gap: 14,
  },
  notificationStatusEnabled: {
    backgroundColor: theme.success + '15',
    borderWidth: 1,
    borderColor: theme.success + '30',
  },
  notificationStatusDisabled: {
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  notificationStatusInfo: {
    flex: 1,
  },
  notificationStatusTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  notificationStatusDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  notificationSection: {
    marginBottom: 20,
  },
  notificationSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  notificationSectionSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 16,
  },
  notificationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 10,
    ...theme.shadows.card,
  },
  notificationOptionDisabled: {
    opacity: 0.5,
  },
  notificationOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  notificationOptionInfo: {
    flex: 1,
  },
  notificationOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  notificationOptionDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  testNotificationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary + '15',
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 16,
  },
  testNotificationBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  notificationInfoCard: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    gap: 12,
  },
  notificationInfoText: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
  },
  visibilitySection: {
    marginBottom: 20,
    marginTop: 20
  },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  visibilityIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  visibilityInfo: {
    flex: 1,
  },
  visibilityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  visibilityDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  visibilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  visibilityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ===== Preview Modal =====
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
  pvModal: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: 0 },
  pvHeader: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  pvHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  pvHeaderTitle: { fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary },
  pvHeaderSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, lineHeight: 18 },
  pvCloseBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 18, backgroundColor: theme.backgroundSecondary },
  pvScroll: { paddingHorizontal: 20, paddingTop: 16 },
  pvCard: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12 },
  pvAvatarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginBottom: 12 },
  pvAvatarTournament: { width: 56, height: 56, borderRadius: 16, backgroundColor: theme.carreauColor + '12', borderWidth: 2, borderColor: theme.carreauColor + '30', alignItems: 'center' as const, justifyContent: 'center' as const },
  pvName: { fontSize: 18, fontWeight: '700' as const, color: theme.textPrimary },
  pvSubtext: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  pvLocationRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginBottom: 8 },
  pvLocationText: { fontSize: 12, color: theme.textSecondary },
  pvInfoRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 },
  pvInfoPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.surface, borderRadius: 12 },
  pvInfoText: { fontSize: 12, fontWeight: '600' as const },
  pvResultBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md, marginBottom: 10 },
  pvResultText: { fontSize: 14, fontWeight: '700' as const },
  pvStatsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, paddingVertical: 10, paddingHorizontal: 12 },
  pvStatItem: { alignItems: 'center' as const, flex: 1 },
  pvStatValue: { fontSize: 16, fontWeight: '700' as const, color: theme.textPrimary },
  pvStatLabel: { fontSize: 9, color: theme.textSecondary, marginTop: 1, textTransform: 'uppercase' as const },
  pvStatDivider: { width: 1, height: 24, backgroundColor: theme.border, marginHorizontal: 6 },
  pvNote: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, backgroundColor: theme.primary + '08', borderRadius: theme.borderRadius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.primary + '15' },
  pvNoteText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  pvActions: { flexDirection: 'row' as const, gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: theme.border },
  pvCancelBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 14, borderRadius: theme.borderRadius.md, backgroundColor: theme.backgroundSecondary },
  pvCancelText: { fontSize: 15, fontWeight: '600' as const, color: theme.textSecondary },
  pvConfirmBtn: { flex: 2, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 14, borderRadius: theme.borderRadius.md },
  pvConfirmText: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },
  // Quick share
  quickShareBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#22C55E30', ...theme.shadows.card },
  quickShareBtnSent: { borderColor: '#10B98140', backgroundColor: '#F0FDF4' },
  quickShareIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  quickShareTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  quickShareSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  quickShareText: { fontSize: 13, fontWeight: '600' as const, color: theme.textSecondary },
  quickShareArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#22C55E12', alignItems: 'center' as const, justifyContent: 'center' as const },
  // Delete tournament
  deleteTournamentSection: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: theme.border },
  deleteTournamentBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: theme.error + '08', paddingVertical: 16, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.error + '20' },
  deleteTournamentBtnText: { fontSize: 15, fontWeight: '600' as const, color: theme.error },
});
