import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import theme from '@/constants/theme';
import config, { GameFormat, TournamentType, TournamentLevel, TournamentCategory, RegistrationType, TournamentScope } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import { Image } from 'expo-image';
import * as ImagePicker from '@/services/imagePicker';
import { decode } from '@/services/base64';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/template';

type TournamentStatus = 'À venir' | 'En cours' | 'Terminé';

const CADRAGE_ICONS: Record<TournamentType, string> = {
  'Poules': 'grid-view', 'Élimination directe': 'call-split', 'Mixte': 'merge-type',
  'Suisse': 'sync-alt', 'A/B/C': 'account-tree', 'Tirage intégral': 'shuffle', 'Autre': 'tune',
};

const FORMAT_CONFIG_KEYS: Record<string, { icon: string; playersKey: string; boulesKey: string }> = {
  'Tête-à-tête': { icon: 'person', playersKey: '1vs1', boulesKey: '3boules' },
  'Doublette': { icon: 'people', playersKey: '2vs2', boulesKey: '3boules' },
  'Triplette': { icon: 'groups', playersKey: '3vs3', boulesKey: '2boules' },
};

const LEVEL_ICONS: Record<string, string> = {
  'Loisir / Amical': 'sentiment-satisfied', 'Promotion': 'trending-up', 'Honneur': 'shield',
  'Élite': 'diamond', 'Vétérans': 'elderly', 'Jeunes (Minimes)': 'child-care',
  'Jeunes (Cadets)': 'school', 'Jeunes (Juniors)': 'sports',
};

const FINAL_RESULTS = ['1er', '2ème', '3ème', 'Demi-finale', 'Quart de finale', '1/8 finale', 'Poules', 'Autre'] as const;
const FINAL_RESULT_CFG: Record<string, { icon: string; color: string }> = {
  '1er': { icon: 'emoji-events', color: theme.carreauColor }, '2ème': { icon: 'workspace-premium', color: theme.accent },
  '3ème': { icon: 'military-tech', color: '#CD7F32' }, 'Demi-finale': { icon: 'trending-up', color: theme.primary },
  'Quart de finale': { icon: 'trending-flat', color: theme.warning }, '1/8 finale': { icon: 'sports', color: theme.textSecondary },
  'Poules': { icon: 'group', color: theme.textSecondary }, 'Autre': { icon: 'more-horiz', color: theme.textMuted },
};

function SectionCard({ children, title, subtitle, icon, color, delay = 0, required = false }: {
  children: React.ReactNode; title: string; subtitle?: string; icon: string; color: string; delay?: number; required?: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(delay)} style={styles.sectionCard}>
      <View style={styles.sectionCardHeader}>
        <View style={[styles.sectionCardIcon, { backgroundColor: color + '15' }]}>
          <MaterialIcons name={icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sectionCardTitle}>{title}</Text>
            {required ? <View style={styles.requiredDot} /> : null}
          </View>
          {subtitle ? <Text style={styles.sectionCardSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </Animated.View>
  );
}

function AccordionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function StepIndicator({ step, total, label }: { step: number; total: number; label: string }) {
  const pct = Math.round((step / total) * 100);
  return (
    <View style={styles.stepIndicator}>
      <View style={styles.stepBarTrack}>
        <Animated.View entering={FadeIn.duration(600)} style={[styles.stepBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

export default function EditTournamentScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { clubs, terrains, loading: appLoading } = useAppData();
  const { getTournamentById, updateTournament } = useAppActions();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const tournament = getTournamentById(id!);

  const CADRAGE_CONFIG = useMemo(() => ({
    'Poules': { description: t('cadrage', 'poulesDesc'), matches: t('cadrage', 'poulesMatches'), points: t('cadrage', 'poulesPoints'), specifics: [t('cadrage', 'poulesSpec1'), t('cadrage', 'poulesSpec2'), t('cadrage', 'poulesSpec3')] },
    'Élimination directe': { description: t('cadrage', 'elimDesc'), matches: t('cadrage', 'elimMatches'), points: t('cadrage', 'elimPoints'), specifics: [t('cadrage', 'elimSpec1'), t('cadrage', 'elimSpec2'), t('cadrage', 'elimSpec3')] },
    'Mixte': { description: t('cadrage', 'mixteDesc'), matches: t('cadrage', 'mixteMatches'), points: t('cadrage', 'mixtePoints'), specifics: [t('cadrage', 'mixteSpec1'), t('cadrage', 'mixteSpec2'), t('cadrage', 'mixteSpec3')] },
    'Suisse': { description: t('cadrage', 'suisseDesc'), matches: t('cadrage', 'suisseMatches'), points: t('cadrage', 'suissePoints'), specifics: [t('cadrage', 'suisseSpec1'), t('cadrage', 'suisseSpec2'), t('cadrage', 'suisseSpec3')] },
    'A/B/C': { description: t('cadrage', 'abcDesc'), matches: t('cadrage', 'abcMatches'), points: t('cadrage', 'abcPoints'), specifics: [t('cadrage', 'abcSpec1'), t('cadrage', 'abcSpec2'), t('cadrage', 'abcSpec3')] },
    'Tirage intégral': { description: t('cadrage', 'tirageDesc'), matches: t('cadrage', 'tirageMatches'), points: t('cadrage', 'tiragePoints'), specifics: [t('cadrage', 'tirageSpec1'), t('cadrage', 'tirageSpec2'), t('cadrage', 'tirageSpec3')] },
    'Autre': { description: t('cadrage', 'autreDesc'), matches: t('cadrage', 'autreMatches'), points: t('cadrage', 'autrePoints'), specifics: [t('cadrage', 'autreSpec1'), t('cadrage', 'autreSpec2')] },
  } as Record<TournamentType, { description: string; matches: string; points: string; specifics: string[] }>), [t]);

  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [type, setType] = useState<TournamentType>('Poules');
  const [format, setFormat] = useState<GameFormat>('Doublette');
  const [status, setStatus] = useState<TournamentStatus>('À venir');
  const [terrainId, setTerrainId] = useState<string | undefined>();
  const [location, setLocation] = useState<LocationData>({ address: '', city: '', country: 'France', latitude: 0, longitude: 0 });
  const [clubId, setClubId] = useState<string | undefined>();
  const [maxParticipants, setMaxParticipants] = useState('32');
  const [prize, setPrize] = useState('');
  const [description, setDescription] = useState('');
  const [registrationCost, setRegistrationCost] = useState('');
  const [prizeWon, setPrizeWon] = useState('');
  const [finalResult, setFinalResult] = useState<string | undefined>();
  const [tournamentLevel, setTournamentLevel] = useState<TournamentLevel | string | undefined>();
  const [customLevel, setCustomLevel] = useState('');
  const [showCustomLevelInput, setShowCustomLevelInput] = useState(false);
  const [tournamentCategory, setTournamentCategory] = useState<TournamentCategory | undefined>();
  const [registrationType, setRegistrationType] = useState<RegistrationType | undefined>();
  const [tournamentScope, setTournamentScope] = useState<TournamentScope | undefined>();

  // Modal states
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearch, setTerrainSearch] = useState('');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [showCadragePicker, setShowCadragePicker] = useState(false);
  const [showResultPicker, setShowResultPicker] = useState(false);

  // Poster state
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterType, setPosterType] = useState<'image' | 'pdf'>('image');
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [showPosterFullscreen, setShowPosterFullscreen] = useState(false);

  const filteredTerrains = useMemo(() => {
    const s = terrainSearch.toLowerCase();
    return terrains.filter(tr => !s || tr.name.toLowerCase().includes(s) || tr.city.toLowerCase().includes(s));
  }, [terrains, terrainSearch]);

  const filteredClubs = useMemo(() => {
    const s = clubSearch.toLowerCase();
    return clubs.filter(c => !s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s));
  }, [clubs, clubSearch]);

  const selectedTerrainObj = terrainId ? terrains.find(t => t.id === terrainId) : null;
  const selectedClubObj = clubId ? clubs.find(c => c.id === clubId) : null;

  // Accordion state
  const [showLevelSection, setShowLevelSection] = useState(false);
  const [showCategorySection, setShowCategorySection] = useState(false);
  const [showRegistrationSection, setShowRegistrationSection] = useState(false);
  const [showScopeSection, setShowScopeSection] = useState(false);
  const [showParticipantsSection, setShowParticipantsSection] = useState(false);
  const [showFinancesSection, setShowFinancesSection] = useState(false);
  const [showDescriptionSection, setShowDescriptionSection] = useState(false);
  const [showPosterSection, setShowPosterSection] = useState(false);

  useEffect(() => {
    if (tournament) {
      setName(tournament.name);
      setDate(new Date(tournament.date));
      setType(tournament.type);
      setFormat(tournament.format);
      setStatus(tournament.status);
      setTerrainId(tournament.terrainId);
      setLocation({ address: tournament.location.name || '', city: tournament.location.city || '', country: 'France', latitude: tournament.location.latitude || 0, longitude: tournament.location.longitude || 0 });
      setClubId(tournament.clubId);
      setMaxParticipants(tournament.maxParticipants?.toString() || '32');
      setPrize(tournament.prize || '');
      setDescription(tournament.description || '');
      setRegistrationCost(tournament.registrationCost?.toString() || '');
      setPrizeWon(tournament.prizeWon?.toString() || '');
      setFinalResult(tournament.finalResult);
      if (tournament.tournamentLevel) {
        const isCustom = !config.tournamentLevels.includes(tournament.tournamentLevel as TournamentLevel);
        if (isCustom) { setShowCustomLevelInput(true); setCustomLevel(tournament.tournamentLevel); }
        setTournamentLevel(tournament.tournamentLevel);
      }
      setTournamentCategory(tournament.tournamentCategory);
      setRegistrationType(tournament.registrationType);
      setTournamentScope(tournament.tournamentScope);
      if (tournament.endDate) setEndDate(new Date(tournament.endDate));
      if (tournament.posterUrl) {
        setPosterUrl(tournament.posterUrl);
        setPosterType(tournament.posterUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');
      }
    }
  }, [tournament]);

  const uploadPosterFile = React.useCallback(async (fileUri: string, fileName: string, mimeType: string) => {
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

  const showPosterUploadOptions = React.useCallback(() => {
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

  const handleRemovePoster = React.useCallback(() => {
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

  const getStatusFromDate = (selectedDate: Date, end?: Date | null): TournamentStatus => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    if (start > today) return 'À venir';
    if (end) { const endD = new Date(end); endD.setHours(23, 59, 59, 999); if (endD < today) return 'Terminé'; return 'En cours'; }
    if (start.getTime() === today.getTime()) return 'En cours';
    return 'Terminé';
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) { setDate(selectedDate); if (endDate && selectedDate > endDate) setEndDate(null); const newStatus = getStatusFromDate(selectedDate, endDate && selectedDate <= endDate ? endDate : undefined); setStatus(newStatus); Haptics.selectionAsync(); }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) { setEndDate(selectedDate); const newStatus = getStatusFromDate(date, selectedDate); setStatus(newStatus); Haptics.selectionAsync(); }
  };

  const hasLocation = terrainId || location.city.trim();
  const progressFilled = [name.trim(), hasLocation ? 'yes' : ''].filter(Boolean).length + 1;
  const progressLabel = !name.trim() ? t('tournament', 'startWithName') : !hasLocation ? t('tournament', 'chooseLocation') : t('tournament', 'saveChanges');

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t('common', 'error'), t('tournament', 'errorNameRequired')); return; }
    if (!terrainId && !location.city.trim()) { Alert.alert(t('common', 'error'), t('tournament', 'errorCityRequired')); return; }
    const selectedClub = clubs.find(c => c.id === clubId);
    const terrain = terrains.find(t => t.id === terrainId);
    const levelToSave = showCustomLevelInput && customLevel.trim()
      ? customLevel.trim()
      : tournamentLevel;
    try {
      await updateTournament(id!, {
        name: name.trim(),
        date: date.toISOString(),
        endDate: endDate ? endDate.toISOString() : undefined,
        type,
        format,
        status,
        location: {
          name: terrain?.name || location.address.trim() || location.city.trim(),
          city: terrain?.city || location.city.trim(),
          latitude: terrain?.location?.latitude ?? location.latitude ?? 0,
          longitude: terrain?.location?.longitude ?? location.longitude ?? 0,
        },
        terrainId: terrain?.id,
        terrainName: terrain?.name,
        terrainType: terrain?.type,
        clubId,
        clubName: selectedClub?.name,
        maxParticipants: parseInt(maxParticipants, 10) || 32,
        prize: prize.trim() || undefined,
        description: description.trim() || undefined,
        tournamentLevel: levelToSave,
        tournamentCategory,
        registrationType,
        tournamentScope,
        registrationCost: registrationCost ? parseFloat(registrationCost) : undefined,
        prizeWon: prizeWon ? parseFloat(prizeWon) : undefined,
        finalResult,
        posterUrl: posterUrl ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      console.log('[EditTournament] Save error:', error);
      Alert.alert(t('common', 'error'), error?.message || t('tournament', 'errorSave'));
    }
  };

  if (!tournament) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          <View style={styles.headerCenter}><Text style={styles.headerTitle}>{t('tournament', 'editTournament')}</Text></View>
          <View style={styles.headerBtn} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={{ fontSize: 16, color: theme.textMuted }}>{t('tournament', 'tournamentNotFound')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
        <View style={styles.headerCenter}><Text style={styles.headerTitle}>{t('tournament', 'editTournament')}</Text></View>
        <Pressable
          style={[styles.headerSaveBtn, (!name.trim() || (!terrainId && !location.city.trim())) && styles.headerSaveBtnDisabled]}
          onPress={handleSave}
          disabled={!name.trim() || (!terrainId && !location.city.trim())}
        >
          <Text style={styles.headerSaveBtnText}>{t('common', 'save')}</Text>
        </Pressable>
      </View>

      <StepIndicator step={progressFilled} total={3} label={progressLabel} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Icon */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.iconSection}>
            <View style={styles.tournamentIcon}><MaterialIcons name="emoji-events" size={48} color="#FFF" /></View>
          </Animated.View>

          {/* 1. Nom */}
          <SectionCard title={t('tournament', 'tournamentName')} icon="emoji-events" color={theme.carreauColor} delay={50} required>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder={t('tournament', 'namePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" />
          </SectionCard>

          {/* 2. Statut */}
          <SectionCard title={t('tournament', 'statusLabel')} icon="flag" color={theme.warning} delay={75}>
            <View style={styles.statusContainer}>
              {(['À venir', 'En cours', 'Terminé'] as TournamentStatus[]).map(s => {
                const statusCfg: Record<string, { icon: string; color: string }> = { 'À venir': { icon: 'schedule', color: theme.primary }, 'En cours': { icon: 'play-circle', color: theme.warning }, 'Terminé': { icon: 'check-circle', color: theme.success } };
                const cfg = statusCfg[s];
                return (
                  <Pressable key={s} style={[styles.statusChip, status === s && [styles.statusChipActive, { borderColor: cfg.color }]]} onPress={() => { Haptics.selectionAsync(); setStatus(s); }}>
                    <MaterialIcons name={cfg.icon as any} size={18} color={status === s ? cfg.color : theme.textSecondary} />
                    <Text style={[styles.statusText, status === s && { color: cfg.color }]}>{t('tournamentStatus', s)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 3. Dates */}
          <SectionCard title={t('tournament', 'dates')} icon="event" color={theme.primary} delay={100} required>
            <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <MaterialIcons name="today" size={20} color={theme.primary} />
              <Text style={styles.dateText}>{date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            </Pressable>
            {showDatePicker ? <DateTimePicker value={date} mode="date" display="default" onChange={handleDateChange} /> : null}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.endDateLabel}>{t('tournament', 'endDateOptional')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable style={[styles.dateButton, { flex: 1 }]} onPress={() => setShowEndDatePicker(true)}>
                  <MaterialIcons name="event" size={20} color={endDate ? theme.accent : theme.textMuted} />
                  <Text style={[styles.dateText, !endDate && { color: theme.textMuted }]}>
                    {endDate ? endDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('tournament', 'singleDayOnly')}
                  </Text>
                </Pressable>
                {endDate ? (
                  <Pressable style={styles.removeEndDateBtn} onPress={() => { Haptics.selectionAsync(); setEndDate(null); setStatus(getStatusFromDate(date)); }}>
                    <MaterialIcons name="close" size={18} color={theme.error} />
                  </Pressable>
                ) : null}
              </View>
              {showEndDatePicker ? <DateTimePicker value={endDate || date} mode="date" display="default" onChange={handleEndDateChange} minimumDate={date} /> : null}
            </View>
          </SectionCard>

          {/* 4. Lieu (Modal Terrain Picker) */}
          <SectionCard title={t('tournament', 'location')} icon="place" color={theme.success} delay={150} required>
            <Pressable style={styles.pickerButton} onPress={() => { setTerrainSearch(''); setShowTerrainPicker(true); }}>
              {selectedTerrainObj ? (
                <View style={styles.pickerSelected}>
                  <MaterialIcons name="sports-soccer" size={20} color={theme.success} />
                  <View style={styles.pickerSelectedInfo}>
                    <Text style={styles.pickerSelectedName}>{selectedTerrainObj.name}</Text>
                    <Text style={styles.pickerSelectedSub}>{selectedTerrainObj.address}, {selectedTerrainObj.city}</Text>
                  </View>
                  <Pressable onPress={(e) => { e.stopPropagation(); setTerrainId(undefined); Haptics.selectionAsync(); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickerPlaceholder}>
                  <MaterialIcons name="place" size={20} color={theme.textMuted} />
                  <Text style={styles.pickerPlaceholderText}>{t('tournament', 'selectTerrainOrAddress')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              )}
            </Pressable>
            {!terrainId ? (
              <Animated.View entering={FadeInDown.duration(250)} style={{ marginTop: 14 }}>
                <LocationPicker label={t('tournament', 'tournamentLocation')} value={location} onChange={setLocation} placeholder={t('tournament', 'searchAddress')} required showAddressField />
              </Animated.View>
            ) : null}
          </SectionCard>

          {/* 5. Format */}
          <SectionCard title={t('tournament', 'gameFormat')} icon="groups" color={theme.accent} delay={175} required>
            <View style={styles.formatGrid}>
              {config.game.formats.map(f => {
                const cfg = FORMAT_CONFIG_KEYS[f]; const isActive = format === f;
                return (
                  <Pressable key={f} style={[styles.formatCard, isActive && styles.formatCardActive]} onPress={() => { Haptics.selectionAsync(); setFormat(f); }}>
                    <View style={[styles.formatCardIconBox, isActive && styles.formatCardIconBoxActive]}><MaterialIcons name={cfg.icon as any} size={22} color={isActive ? '#FFF' : theme.textSecondary} /></View>
                    <Text style={[styles.formatCardName, isActive && styles.formatCardNameActive]}>{t('formats', f)}</Text>
                    <Text style={styles.formatCardMeta}>{t('formatDetails', cfg.playersKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 6. Cadrage (Modal Picker) */}
          <SectionCard title={t('tournament', 'cadrage')} icon="account-tree" color={theme.tirColor} delay={200}>
            <Pressable style={styles.pickerButton} onPress={() => setShowCadragePicker(true)}>
              <View style={styles.pickerSelected}>
                <MaterialIcons name={(CADRAGE_ICONS[type] || 'tune') as any} size={20} color={theme.tirColor} />
                <View style={styles.pickerSelectedInfo}>
                  <Text style={styles.pickerSelectedName}>{t('tournamentTypes', type)}</Text>
                  <Text style={styles.pickerSelectedSub} numberOfLines={1}>{CADRAGE_CONFIG[type]?.description}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </View>
            </Pressable>
            {type && CADRAGE_CONFIG[type] ? (
              <Animated.View entering={FadeIn.duration(250)} style={styles.cadrageInfo}>
                <View style={styles.cadrageInfoHeader}><MaterialIcons name="info-outline" size={16} color={theme.tirColor} /><Text style={styles.cadrageInfoTitle}>{CADRAGE_CONFIG[type].description}</Text></View>
                <View style={styles.cadrageInfoStats}>
                  <View style={styles.cadrageInfoStat}><MaterialIcons name="sports" size={13} color={theme.textMuted} /><Text style={styles.cadrageInfoStatText}>{CADRAGE_CONFIG[type].matches}</Text></View>
                  <View style={styles.cadrageInfoStat}><MaterialIcons name="flag" size={13} color={theme.textMuted} /><Text style={styles.cadrageInfoStatText}>{CADRAGE_CONFIG[type].points}</Text></View>
                </View>
                <View style={styles.cadrageInfoBullets}>
                  {CADRAGE_CONFIG[type].specifics.map((s, i) => (<View key={i} style={styles.cadrageInfoBullet}><View style={styles.bulletDot} /><Text style={styles.bulletText}>{s}</Text></View>))}
                </View>
              </Animated.View>
            ) : null}
          </SectionCard>

          {/* 7. Club organisateur (Modal Picker) */}
          <SectionCard title={t('tournament', 'organizingClub')} icon="home-work" color={theme.primaryLight} delay={225}>
            <Pressable style={styles.pickerButton} onPress={() => { setClubSearch(''); setShowClubPicker(true); }}>
              {selectedClubObj ? (
                <View style={styles.pickerSelected}>
                  <MaterialIcons name="home-work" size={20} color={theme.primaryLight} />
                  <View style={styles.pickerSelectedInfo}>
                    <Text style={styles.pickerSelectedName}>{selectedClubObj.name}</Text>
                    <Text style={styles.pickerSelectedSub}>{selectedClubObj.city}</Text>
                  </View>
                  <Pressable onPress={(e) => { e.stopPropagation(); setClubId(undefined); Haptics.selectionAsync(); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickerPlaceholder}>
                  <MaterialIcons name="home-work" size={20} color={theme.textMuted} />
                  <Text style={styles.pickerPlaceholderText}>{t('tournament', 'none')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              )}
            </Pressable>
          </SectionCard>

          {/* 8-13: Accordions (Finances, Niveau, Catégorie, Inscription, Envergure, Participants) */}
          {/* 8. Finances */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowFinancesSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="payments" size={18} color={theme.carreauColor} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'finances')}</Text>
                {(registrationCost || prize) ? <Text style={[styles.accordionValueText, { color: theme.carreauColor }]}>{registrationCost ? `${registrationCost}\u20ac` : ''}{registrationCost && prize ? ' • ' : ''}{prize || ''}</Text> : <Text style={styles.sectionCardSubtitle}>{t('tournament', 'financesSubtitle')}</Text>}
              </View>
              <MaterialIcons name={showFinancesSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showFinancesSection ? (
              <View style={styles.accordionContent}>
                <View style={styles.financeRow}>
                  <View style={styles.financeField}><Text style={styles.financeLabel}>{t('tournament', 'registrationCost')}</Text><TextInput style={styles.financeInput} value={registrationCost} onChangeText={setRegistrationCost} placeholder="0" placeholderTextColor={theme.textMuted} keyboardType="numeric" /></View>
                  <View style={styles.financeField}><Text style={styles.financeLabel}>{t('tournament', 'prize')}</Text><TextInput style={styles.financeInput} value={prize} onChangeText={setPrize} placeholder={t('tournament', 'prizePlaceholder')} placeholderTextColor={theme.textMuted} /></View>
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 9. Niveau */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowLevelSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.success + '15' }]}><MaterialIcons name="signal-cellular-alt" size={18} color={theme.success} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'levelTitle')}</Text>
                {tournamentLevel ? <Text style={[styles.accordionValueText, { color: theme.success }]}>{showCustomLevelInput ? customLevel : t('tournamentLevels', tournamentLevel)}</Text> : <Text style={styles.sectionCardSubtitle}>{t('tournament', 'levelSubtitle')}</Text>}
              </View>
              <MaterialIcons name={showLevelSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showLevelSection ? (
              <View style={styles.accordionContent}>
                <View style={styles.levelGrid}>
                  {config.tournamentLevels.map(level => {
                    const isActive = tournamentLevel === level && !showCustomLevelInput;
                    const ico = LEVEL_ICONS[level] || 'star';
                    return (
                      <Pressable key={level} style={[styles.levelChip, isActive && styles.levelChipActive]} onPress={() => { Haptics.selectionAsync(); setShowCustomLevelInput(false); setCustomLevel(''); setTournamentLevel(tournamentLevel === level ? undefined : level); }}>
                        <MaterialIcons name={ico as any} size={14} color={isActive ? theme.success : theme.textMuted} />
                        <Text style={[styles.levelChipText, isActive && styles.levelChipTextActive]} numberOfLines={1}>{t('tournamentLevels', level)}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={[styles.levelChip, showCustomLevelInput && styles.levelChipActive]} onPress={() => { Haptics.selectionAsync(); setShowCustomLevelInput(prev => { const next = !prev; if (next) { setTournamentLevel(customLevel.trim() || undefined); } else { setCustomLevel(''); } return next; }); }}>
                    <MaterialIcons name="add" size={14} color={showCustomLevelInput ? theme.success : theme.textMuted} />
                    <Text style={[styles.levelChipText, showCustomLevelInput && styles.levelChipTextActive]}>{t('tournament', 'otherLevel')}</Text>
                  </Pressable>
                </View>
                {showCustomLevelInput ? (
                  <View style={[styles.customInput, { marginBottom: 4 }]}>
                    <TextInput style={styles.customInputField} value={customLevel} onChangeText={(text) => { setCustomLevel(text); setTournamentLevel(text.trim() || undefined); }} placeholder={t('tournament', 'customLevelPlaceholderLong')} placeholderTextColor={theme.textMuted} autoFocus />
                    {customLevel.trim() ? <MaterialIcons name="check-circle" size={18} color={theme.success} /> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </AccordionCard>

          {/* 10. Catégorie */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowCategorySection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.warning + '15' }]}><MaterialIcons name="verified" size={18} color={theme.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'tournamentType')}</Text>
                {tournamentCategory ? <Text style={[styles.accordionValueText, { color: theme.warning }]}>{t('tournamentCategories', tournamentCategory)}</Text> : null}
              </View>
              <MaterialIcons name={showCategorySection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showCategorySection ? (
              <View style={styles.accordionContent}>
                <View style={styles.chipGrid}>
                  {config.tournamentCategories.map(cat => {
                    const isActive = tournamentCategory === cat;
                    return (<Pressable key={cat} style={[styles.chipOutline, isActive && styles.chipOutlineActiveWarn]} onPress={() => { Haptics.selectionAsync(); setTournamentCategory(tournamentCategory === cat ? undefined : cat); }}><Text style={[styles.chipOutlineText, isActive && styles.chipOutlineTextWarn]}>{t('tournamentCategories', cat)}</Text></Pressable>);
                  })}
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 11. Inscription */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowRegistrationSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="how-to-reg" size={18} color={theme.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'registration')}</Text>
                {registrationType ? <Text style={[styles.accordionValueText, { color: theme.primary }]}>{t('registrationTypes', registrationType)}</Text> : null}
              </View>
              <MaterialIcons name={showRegistrationSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showRegistrationSection ? (
              <View style={styles.accordionContent}>
                <View style={styles.chipGrid}>
                  {config.registrationTypes.map(reg => {
                    const isActive = registrationType === reg;
                    return (<Pressable key={reg} style={[styles.chipOutline, isActive && styles.chipOutlineActivePrimary]} onPress={() => { Haptics.selectionAsync(); setRegistrationType(registrationType === reg ? undefined : reg); }}><Text style={[styles.chipOutlineText, isActive && styles.chipOutlineTextPrimary]}>{t('registrationTypes', reg)}</Text></Pressable>);
                  })}
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 12. Envergure */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowScopeSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.accent + '15' }]}><MaterialIcons name="public" size={18} color={theme.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'scope')}</Text>
                {tournamentScope ? <Text style={[styles.accordionValueText, { color: theme.accent }]}>{t('tournamentScopes', tournamentScope)}</Text> : <Text style={styles.sectionCardSubtitle}>{t('tournament', 'scopeSubtitle')}</Text>}
              </View>
              <MaterialIcons name={showScopeSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showScopeSection ? (
              <View style={styles.accordionContent}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                  {config.tournamentScopes.map(scope => {
                    const isActive = tournamentScope === scope;
                    return (<Pressable key={scope} style={[styles.chipBtn, isActive && styles.chipBtnActiveAccent]} onPress={() => { Haptics.selectionAsync(); setTournamentScope(tournamentScope === scope ? undefined : scope); }}><Text style={[styles.chipBtnText, isActive && styles.chipBtnTextAccent]}>{t('tournamentScopes', scope)}</Text></Pressable>);
                  })}
                </ScrollView>
              </View>
            ) : null}
          </AccordionCard>

          {/* 13. Participants */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowParticipantsSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="people-outline" size={18} color={theme.carreauColor} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'maxParticipants')}</Text>
                <Text style={[styles.accordionValueText, { color: theme.carreauColor }]}>{maxParticipants}</Text>
              </View>
              <MaterialIcons name={showParticipantsSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showParticipantsSection ? (
              <View style={styles.accordionContent}>
                <View style={styles.participantsCountRow}>
                  <Pressable
                    style={styles.participantsCountBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      const current = parseInt(maxParticipants) || 1;
                      if (current > 1) setMaxParticipants(String(current - 1));
                    }}
                  >
                    <MaterialIcons name="remove" size={22} color={theme.textSecondary} />
                  </Pressable>
                  <TextInput
                    style={styles.participantsCountInput}
                    value={maxParticipants}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      setMaxParticipants(cleaned);
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                  />
                  <Pressable
                    style={styles.participantsCountBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      const current = parseInt(maxParticipants) || 0;
                      setMaxParticipants(String(current + 1));
                    }}
                  >
                    <MaterialIcons name="add" size={22} color={theme.carreauColor} />
                  </Pressable>
                </View>
                <View style={styles.participantsRow}>
                  {['8', '16', '24', '32', '48', '64', '128'].map(num => {
                    const isActive = maxParticipants === num;
                    return (<Pressable key={num} style={[styles.participantPill, isActive && styles.participantPillActive]} onPress={() => { Haptics.selectionAsync(); setMaxParticipants(num); }}><Text style={[styles.participantPillText, isActive && styles.participantPillTextActive]}>{num}</Text></Pressable>);
                  })}
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 14. Résultat final (Modal Picker - only for finished tournaments) */}
          {status === 'Terminé' ? (
            <SectionCard title={t('tournament', 'finalResultUpper')} icon="workspace-premium" color={theme.carreauColor} delay={400}>
              <Pressable style={styles.pickerButton} onPress={() => setShowResultPicker(true)}>
                {finalResult ? (
                  <View style={styles.pickerSelected}>
                    <MaterialIcons name={(FINAL_RESULT_CFG[finalResult]?.icon || 'help') as any} size={20} color={FINAL_RESULT_CFG[finalResult]?.color || theme.textMuted} />
                    <View style={styles.pickerSelectedInfo}>
                      <Text style={[styles.pickerSelectedName, { color: FINAL_RESULT_CFG[finalResult]?.color }]}>{finalResult}</Text>
                    </View>
                    <Pressable onPress={(e) => { e.stopPropagation(); setFinalResult(undefined); Haptics.selectionAsync(); }} hitSlop={8}>
                      <MaterialIcons name="close" size={18} color={theme.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.pickerPlaceholder}>
                    <MaterialIcons name="workspace-premium" size={20} color={theme.textMuted} />
                    <Text style={styles.pickerPlaceholderText}>{t('tournament', 'none')}</Text>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </View>
                )}
              </Pressable>
            </SectionCard>
          ) : null}

          {/* 15. Gain obtenu (only for finished tournaments) */}
          {status === 'Terminé' ? (
            <SectionCard title={t('tournament', 'prizeWonUpper')} icon="savings" color={theme.success} delay={425}>
              <TextInput style={styles.textInput} value={prizeWon} onChangeText={setPrizeWon} placeholder="Ex: 50" placeholderTextColor={theme.textMuted} keyboardType="numeric" />
            </SectionCard>
          ) : null}

          {/* 15. Description */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowDescriptionSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.textSecondary + '15' }]}><MaterialIcons name="description" size={18} color={theme.textSecondary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'description')}</Text>
                {description.trim() ? <Text style={styles.accordionValueText} numberOfLines={1}>{description.trim()}</Text> : <Text style={styles.sectionCardSubtitle}>{t('tournament', 'descriptionSubtitle')}</Text>}
              </View>
              <MaterialIcons name={showDescriptionSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showDescriptionSection ? (
              <View style={styles.accordionContent}>
                <TextInput style={[styles.textInput, styles.textArea]} value={description} onChangeText={setDescription} placeholder={t('tournament', 'descriptionPlaceholder')} placeholderTextColor={theme.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
              </View>
            ) : null}
          </AccordionCard>

          {/* 16. Tournament Poster (collapsible — avoids overlapping accordion content above) */}
          <AccordionCard>
            <Pressable style={styles.accordionHeader} onPress={() => { Haptics.selectionAsync(); setShowPosterSection(p => !p); }}>
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="image" size={18} color={theme.carreauColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionCardTitle}>{language === 'fr' ? 'Affiche du tournoi' : 'Tournament Poster'}</Text>
                {posterUrl ? (
                  <Text style={[styles.accordionValueText, { color: theme.carreauColor }]}>
                    {posterType === 'pdf'
                      ? (language === 'fr' ? 'PDF ajouté' : 'PDF added')
                      : (language === 'fr' ? 'Image ajoutée' : 'Image added')}
                  </Text>
                ) : (
                  <Text style={styles.sectionCardSubtitle}>{language === 'fr' ? 'Photo ou PDF' : 'Photo or PDF'}</Text>
                )}
              </View>
              <MaterialIcons name={showPosterSection ? 'expand-less' : 'expand-more'} size={24} color={theme.textMuted} />
            </Pressable>
            {showPosterSection ? (
              <View style={styles.accordionContent}>
                {posterUrl ? (
                  <View style={styles.posterPreviewBox}>
                    <Pressable onPress={() => posterType === 'pdf' ? require('react-native').Linking.openURL(posterUrl) : setShowPosterFullscreen(true)}>
                      {posterType === 'image' ? (
                        <Image source={{ uri: posterUrl }} style={styles.posterPreviewImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                      ) : (
                        <View style={styles.posterPdfPreview}>
                          <MaterialIcons name="picture-as-pdf" size={40} color={theme.error} />
                          <Text style={styles.posterPdfText}>{language === 'fr' ? 'Document PDF' : 'PDF Document'}</Text>
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.posterActionsRow}>
                      <Pressable style={styles.posterReplaceBtn} onPress={showPosterUploadOptions}>
                        <MaterialIcons name="refresh" size={16} color={theme.primary} />
                        <Text style={styles.posterReplaceBtnText}>{language === 'fr' ? 'Remplacer' : 'Replace'}</Text>
                      </Pressable>
                      <Pressable style={styles.posterDeleteBtn} onPress={handleRemovePoster}>
                        <MaterialIcons name="delete-outline" size={16} color={theme.error} />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.posterUploadBox} onPress={showPosterUploadOptions}>
                    <View style={styles.posterUploadIcon}>
                      <MaterialIcons name="image" size={26} color={theme.carreauColor} />
                    </View>
                    <Text style={styles.posterUploadTitle}>{language === 'fr' ? 'Ajouter une affiche' : 'Add a poster'}</Text>
                    <Text style={styles.posterUploadSubtitle}>{language === 'fr' ? 'Photo ou PDF' : 'Photo or PDF'}</Text>
                  </Pressable>
                )}
                {uploadingPoster ? (
                  <View style={styles.posterUploadingRow}>
                    <ActivityIndicator size="large" color={theme.carreauColor} />
                    <Text style={styles.posterUploadingText}>{language === 'fr' ? 'Envoi en cours...' : 'Uploading...'}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </AccordionCard>

        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={({ pressed }) => [styles.saveButton, (!name.trim() || (!terrainId && !location.city.trim())) && styles.saveButtonDisabled, pressed && name.trim() && (terrainId || location.city.trim()) && styles.saveButtonPressed]} onPress={handleSave}>
            <MaterialIcons name="check" size={22} color="#FFF" />
            <Text style={styles.saveButtonText}>{t('tournament', 'saveChanges')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Poster Fullscreen Modal */}
      <Modal visible={showPosterFullscreen} animationType="fade" transparent onRequestClose={() => setShowPosterFullscreen(false)}>
        <View style={styles.posterFullscreenBackdrop}>
          <Pressable style={styles.posterFullscreenClose} onPress={() => setShowPosterFullscreen(false)}>
            <MaterialIcons name="close" size={24} color="#FFF" />
          </Pressable>
          {posterUrl ? <Image source={{ uri: posterUrl }} style={styles.posterFullscreenImage} contentFit="contain" transition={200} /> : null}
        </View>
      </Modal>

      {/* Terrain Picker Modal */}
      <Modal visible={showTerrainPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTerrainPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('tournament', 'location')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowTerrainPicker(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={terrainSearch} onChangeText={setTerrainSearch} placeholder={t('profile', 'searchTerrain')} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <Pressable style={[styles.modalPickerItem, !terrainId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(undefined); setShowTerrainPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="edit-location" size={20} color={theme.textMuted} /></View>
            <View style={{ flex: 1 }}><Text style={styles.modalPickerItemName}>{t('tournament', 'otherLocation')}</Text><Text style={styles.modalPickerItemSub}>{t('tournament', 'manualAddressEntry')}</Text></View>
            {!terrainId ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
          </Pressable>
          <FlatList data={filteredTerrains} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} renderItem={({ item: tr }) => {
            const tc = config.terrainTypes.find(t => t.id === tr.type);
            return (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, terrainId === tr.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(tr.id); setShowTerrainPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.success + '15' }]}><MaterialIcons name={(tc?.icon as any) || 'landscape'} size={20} color={theme.success} /></View>
                <View style={{ flex: 1 }}><Text style={styles.modalPickerItemName}>{tr.name}</Text><Text style={styles.modalPickerItemSub}>{tr.address}, {tr.city}</Text></View>
                {terrainId === tr.id ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
              </Pressable>
            );
          }} ListEmptyComponent={<View style={styles.modalEmpty}><MaterialIcons name="landscape" size={40} color={theme.textMuted} /><Text style={styles.modalEmptyText}>{t('tournament', 'noTerrainsRegistered')}</Text></View>} />
        </SafeAreaView>
      </Modal>

      {/* Cadrage Picker Modal */}
      <Modal visible={showCadragePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCadragePicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('tournament', 'cadrage')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowCadragePicker(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {config.tournamentTypes.map(ct => {
              const cadrageIcon = CADRAGE_ICONS[ct] || 'tune';
              const isActive = type === ct;
              const cfg = CADRAGE_CONFIG[ct];
              return (
                <Pressable key={ct} style={[styles.cadrageModalItem, isActive && styles.cadrageModalItemActive]} onPress={() => { Haptics.selectionAsync(); setType(ct); setShowCadragePicker(false); }}>
                  <View style={styles.cadrageModalItemHeader}>
                    <View style={[styles.cadrageModalItemIconBox, isActive && { backgroundColor: theme.tirColor }]}>
                      <MaterialIcons name={cadrageIcon as any} size={22} color={isActive ? '#FFF' : theme.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cadrageModalItemName, isActive && { color: theme.tirColor }]}>{t('tournamentTypes', ct)}</Text>
                      {cfg ? <Text style={styles.cadrageModalItemDesc} numberOfLines={2}>{cfg.description}</Text> : null}
                    </View>
                    {isActive ? <MaterialIcons name="check-circle" size={22} color={theme.tirColor} /> : null}
                  </View>
                  {cfg ? (
                    <View style={styles.cadrageModalItemDetails}>
                      <View style={styles.cadrageModalItemStat}><MaterialIcons name="sports" size={12} color={theme.textMuted} /><Text style={styles.cadrageModalItemStatText}>{cfg.matches}</Text></View>
                      <View style={styles.cadrageModalItemStat}><MaterialIcons name="flag" size={12} color={theme.textMuted} /><Text style={styles.cadrageModalItemStatText}>{cfg.points}</Text></View>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Result Picker Modal */}
      <Modal visible={showResultPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowResultPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('tournament', 'finalResultUpper')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowResultPicker(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Pressable style={[styles.modalPickerItem, !finalResult && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setFinalResult(undefined); setShowResultPicker(false); }}>
              <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
              <Text style={styles.modalPickerItemName}>{t('tournament', 'none')}</Text>
              {!finalResult ? <MaterialIcons name="check-circle" size={20} color={theme.carreauColor} /> : null}
            </Pressable>
            {FINAL_RESULTS.map(result => {
              const cfg = FINAL_RESULT_CFG[result] || { icon: 'help', color: theme.textMuted };
              const isSelected = finalResult === result;
              return (
                <Pressable key={result} style={[styles.resultModalItem, isSelected && { borderColor: cfg.color }]} onPress={() => { Haptics.selectionAsync(); setFinalResult(result); setShowResultPicker(false); }}>
                  <View style={[styles.resultModalItemIconBox, { backgroundColor: cfg.color + '15' }]}>
                    <MaterialIcons name={cfg.icon as any} size={24} color={cfg.color} />
                  </View>
                  <Text style={[styles.resultModalItemName, isSelected && { color: cfg.color }]}>{result}</Text>
                  {isSelected ? <MaterialIcons name="check-circle" size={22} color={cfg.color} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Club Picker Modal */}
      <Modal visible={showClubPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowClubPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('tournament', 'organizingClub')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowClubPicker(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={clubSearch} onChangeText={setClubSearch} placeholder={t('profile', 'searchClub')} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <Pressable style={[styles.modalPickerItem, !clubId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(undefined); setShowClubPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
            <Text style={styles.modalPickerItemName}>{t('tournament', 'none')}</Text>
            {!clubId ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
          </Pressable>
          <FlatList data={filteredClubs} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} renderItem={({ item: club }) => (
            <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, clubId === club.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(club.id); setShowClubPicker(false); }}>
              <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.primaryLight + '15' }]}><MaterialIcons name="home-work" size={20} color={theme.primaryLight} /></View>
              <View style={{ flex: 1 }}><Text style={styles.modalPickerItemName}>{club.name}</Text><Text style={styles.modalPickerItemSub}>{club.city}</Text></View>
              {clubId === club.id ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
            </Pressable>
          )} ListEmptyComponent={<View style={styles.modalEmpty}><MaterialIcons name="home-work" size={40} color={theme.textMuted} /><Text style={styles.modalEmptyText}>{t('profile', 'noClubRegistered')}</Text></View>} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.carreauColor, borderRadius: theme.borderRadius.md, minWidth: 72, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtnDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  headerSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  stepIndicator: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  stepBarTrack: { height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  stepBarFill: { height: '100%', backgroundColor: theme.carreauColor, borderRadius: 2 },
  stepLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  iconSection: { alignItems: 'center', marginBottom: 14 },
  tournamentIcon: { width: 96, height: 96, borderRadius: 20, backgroundColor: theme.carreauColor, alignItems: 'center', justifyContent: 'center' },

  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, overflow: 'hidden', ...theme.shadows.card },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionCardIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionCardSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  requiredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.error },

  textInput: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 13, borderRadius: theme.borderRadius.md, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  textArea: { minHeight: 90, paddingTop: 13 },

  // Status
  statusContainer: { flexDirection: 'row', gap: 10 },
  statusChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 2, borderColor: 'transparent' },
  statusChipActive: { backgroundColor: theme.backgroundSecondary },
  statusText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },

  // Date
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 16, paddingVertical: 14, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.border },
  dateText: { fontSize: 15, color: theme.textPrimary, textTransform: 'capitalize', flex: 1 },
  endDateLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  removeEndDateBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.error + '15', borderRadius: theme.borderRadius.md },

  // Format
  formatGrid: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  formatCardActive: { borderColor: theme.accent, backgroundColor: theme.accent + '08' },
  formatCardIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  formatCardIconBoxActive: { backgroundColor: theme.accent },
  formatCardName: { fontSize: 13, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  formatCardNameActive: { color: theme.accent },
  formatCardMeta: { fontSize: 10, color: theme.textMuted },

  // Cadrage info
  cadrageInfo: { marginTop: 12, padding: 12, backgroundColor: theme.tirColor + '06', borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.tirColor + '15' },
  cadrageInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cadrageInfoTitle: { fontSize: 13, fontWeight: '600', color: theme.tirColor, flex: 1 },
  cadrageInfoStats: { flexDirection: 'row', gap: 16, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.tirColor + '10' },
  cadrageInfoStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cadrageInfoStatText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  cadrageInfoBullets: { gap: 5 },
  cadrageInfoBullet: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.tirColor },
  bulletText: { fontSize: 12, color: theme.textSecondary },

  // Picker
  pickerButton: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  pickerSelected: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerSelectedInfo: { flex: 1 },
  pickerSelectedName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerSelectedSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pickerPlaceholder: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerPlaceholderText: { flex: 1, fontSize: 15, color: theme.textMuted },

  // Chips
  chipScroll: { gap: 8 },
  chipBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.full, borderWidth: 1.5, borderColor: 'transparent' },
  chipBtnActiveAccent: { borderColor: theme.accent, backgroundColor: theme.accent + '08' },
  chipBtnText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  chipBtnTextAccent: { color: theme.accent },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipOutline: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1.5, borderColor: 'transparent' },
  chipOutlineActiveWarn: { borderColor: theme.warning, backgroundColor: theme.warning + '08' },
  chipOutlineActivePrimary: { borderColor: theme.primary, backgroundColor: theme.primary + '08' },
  chipOutlineText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  chipOutlineTextWarn: { color: theme.warning },
  chipOutlineTextPrimary: { color: theme.primary },

  // Level
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1.5, borderColor: 'transparent' },
  levelChipActive: { borderColor: theme.success, backgroundColor: theme.success + '08' },
  levelChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  levelChipTextActive: { color: theme.success },
  customInput: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1.5, borderColor: theme.success, paddingRight: 12 },
  customInputField: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.textPrimary },

  // Participants
  participantsCountRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 16, marginBottom: 14 },
  participantsCountBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: theme.border },
  participantsCountInput: { fontSize: 28, fontWeight: '800' as const, color: theme.carreauColor, width: 80, textAlign: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, paddingVertical: 8, borderWidth: 1.5, borderColor: theme.carreauColor + '30' },
  participantsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' as const },
  participantPill: { minWidth: 44, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.full, borderWidth: 1.5, borderColor: 'transparent' },
  participantPillActive: { borderColor: theme.carreauColor, backgroundColor: theme.carreauColor + '10' },
  participantPillText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
  participantPillTextActive: { color: theme.carreauColor },

  // Finance
  financeRow: { flexDirection: 'row', gap: 12 },
  financeField: { flex: 1 },
  financeLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  financeInput: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 12, borderRadius: theme.borderRadius.md, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },

  // Accordion
  accordionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  accordionContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border },
  accordionValueText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 2 },

  // Poster
  posterPreviewBox: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, overflow: 'hidden' },
  posterPreviewImage: { width: '100%', height: 200 },
  posterPdfPreview: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, gap: 8 },
  posterPdfText: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  posterActionsRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: theme.border },
  posterReplaceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: theme.primary + '10', borderRadius: theme.borderRadius.md },
  posterReplaceBtnText: { fontSize: 13, fontWeight: '600', color: theme.primary },
  posterDeleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.error + '10', borderRadius: theme.borderRadius.md },
  posterUploadBox: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 28, alignItems: 'center', borderWidth: 2, borderColor: theme.carreauColor + '25', borderStyle: 'dashed' },
  posterUploadIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.carreauColor + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  posterUploadTitle: { fontSize: 14, fontWeight: '600', color: theme.carreauColor, marginBottom: 4 },
  posterUploadSubtitle: { fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  posterUploadingRow: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  posterUploadingText: { fontSize: 13, color: theme.textSecondary },
  posterFullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  posterFullscreenClose: { position: 'absolute', top: 60, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  posterFullscreenImage: { width: '100%', height: '80%' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalCloseBtn: { padding: 8 },
  modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  modalPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  modalPickerItemActive: { borderWidth: 2, borderColor: theme.success },
  modalPickerItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalPickerItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  modalPickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },

  // Cadrage modal
  cadrageModalItem: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card },
  cadrageModalItemActive: { borderColor: theme.tirColor, backgroundColor: theme.tirColor + '06' },
  cadrageModalItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cadrageModalItemIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center' },
  cadrageModalItemName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  cadrageModalItemDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
  cadrageModalItemDetails: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  cadrageModalItemStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cadrageModalItemStatText: { fontSize: 11, color: theme.textMuted, fontWeight: '500' },

  // Result modal
  resultModalItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card },
  resultModalItemIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resultModalItemName: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.textPrimary },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.carreauColor, paddingVertical: 16, borderRadius: theme.borderRadius.md, ...theme.shadows.cardElevated },
  saveButtonDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  saveButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
