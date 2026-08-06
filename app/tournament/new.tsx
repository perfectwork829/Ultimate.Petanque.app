import React, { useState, useMemo, useCallback } from 'react';
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
  Modal,
  FlatList,
  ActivityIndicator,
  Linking,
  Keyboard,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

function SectionCard({ children, title, subtitle, icon, color, delay = 0, required = false, style }: {
  children: React.ReactNode; title: string; subtitle?: string; icon: string; color: string; delay?: number; required?: boolean; style?: ViewStyle | ViewStyle[];
}) {
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(delay)} style={[styles.sectionCard, style]}>
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

function AccordionCard({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
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

export default function NewTournamentScreen() {
  const insets = useSafeAreaInsets();
  const { clubs, terrains } = useAppData();
  const { addTournament } = useAppActions();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [type, setType] = useState<TournamentType>('Mixte');
  const [format, setFormat] = useState<GameFormat>('Doublette');
  const [terrainId, setTerrainId] = useState<string | undefined>();
  const [manualLocation, setManualLocation] = useState<LocationData>({ address: '', city: '', country: 'France', latitude: 0, longitude: 0 });
  const [clubId, setClubId] = useState<string | undefined>();
  const [maxParticipants, setMaxParticipants] = useState('32');
  const [prize, setPrize] = useState('');
  const [description, setDescription] = useState('');
  const [registrationCost, setRegistrationCost] = useState('');
  const [tournamentLevel, setTournamentLevel] = useState<TournamentLevel | string | undefined>();
  const [customLevel, setCustomLevel] = useState('');
  const [showCustomLevelInput, setShowCustomLevelInput] = useState(false);
  const [tournamentCategory, setTournamentCategory] = useState<TournamentCategory | undefined>();
  const [registrationType, setRegistrationType] = useState<RegistrationType | undefined>();
  const [tournamentScope, setTournamentScope] = useState<TournamentScope | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  // Modal states
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearch, setTerrainSearch] = useState('');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [showCadragePicker, setShowCadragePicker] = useState(false);

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

  // Poster state (uploaded to storage before tournament exists — linked on create)
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterType, setPosterType] = useState<'image' | 'pdf'>('image');
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [showPosterFullscreen, setShowPosterFullscreen] = useState(false);

  const progress = useMemo(() => {
    let filled = 0; const total = 4;
    if (name.trim()) filled++;
    filled++; // date always filled
    if (terrainId || hasManualLocation) filled++;
    filled++; // format always filled
    return { filled, total };
  }, [name, terrainId, hasManualLocation]);

  const progressLabel = useMemo(() => {
    if (!name.trim()) return t('tournament', 'startWithName');
    if (!terrainId && !hasManualLocation) return t('tournament', 'chooseLocation');
    return t('tournament', 'readyToCreate');
  }, [name, terrainId, hasManualLocation, t]);

  const CADRAGE_CONFIG = useMemo(() => ({
    'Poules': { icon: 'grid-view', description: t('cadrage', 'poulesDesc'), matches: t('cadrage', 'poulesMatches'), points: t('cadrage', 'poulesPoints'), specifics: [t('cadrage', 'poulesSpec1'), t('cadrage', 'poulesSpec2'), t('cadrage', 'poulesSpec3')] },
    'Élimination directe': { icon: 'call-split', description: t('cadrage', 'elimDesc'), matches: t('cadrage', 'elimMatches'), points: t('cadrage', 'elimPoints'), specifics: [t('cadrage', 'elimSpec1'), t('cadrage', 'elimSpec2'), t('cadrage', 'elimSpec3')] },
    'Mixte': { icon: 'merge-type', description: t('cadrage', 'mixteDesc'), matches: t('cadrage', 'mixteMatches'), points: t('cadrage', 'mixtePoints'), specifics: [t('cadrage', 'mixteSpec1'), t('cadrage', 'mixteSpec2'), t('cadrage', 'mixteSpec3')] },
    'Suisse': { icon: 'sync-alt', description: t('cadrage', 'suisseDesc'), matches: t('cadrage', 'suisseMatches'), points: t('cadrage', 'suissePoints'), specifics: [t('cadrage', 'suisseSpec1'), t('cadrage', 'suisseSpec2'), t('cadrage', 'suisseSpec3')] },
    'A/B/C': { icon: 'account-tree', description: t('cadrage', 'abcDesc'), matches: t('cadrage', 'abcMatches'), points: t('cadrage', 'abcPoints'), specifics: [t('cadrage', 'abcSpec1'), t('cadrage', 'abcSpec2'), t('cadrage', 'abcSpec3')] },
    'Tirage intégral': { icon: 'shuffle', description: t('cadrage', 'tirageDesc'), matches: t('cadrage', 'tirageMatches'), points: t('cadrage', 'tiragePoints'), specifics: [t('cadrage', 'tirageSpec1'), t('cadrage', 'tirageSpec2'), t('cadrage', 'tirageSpec3')] },
    'Autre': { icon: 'tune', description: t('cadrage', 'autreDesc'), matches: t('cadrage', 'autreMatches'), points: t('cadrage', 'autrePoints'), specifics: [t('cadrage', 'autreSpec1'), t('cadrage', 'autreSpec2')] },
  } as Record<TournamentType, { icon: string; description: string; matches: string; points: string; specifics: string[] }>), [t]);

  const safeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const safeNumber = (value: unknown, fallback = 0): number => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value.replace(',', '.')) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };

  const hasManualLocation = Boolean(
    safeText(manualLocation.city) ||
    safeText(manualLocation.address) ||
    safeText(manualLocation.formattedAddress) ||
    (safeNumber(manualLocation.latitude) !== 0 && safeNumber(manualLocation.longitude) !== 0)
  );

  const canSave = Boolean(name.trim() && (terrainId || hasManualLocation)) && !isSaving;

  const uploadPosterFile = useCallback(async (fileUri: string, fileName: string, mimeType: string) => {
    if (!user) {
      Alert.alert(t('common', 'error'), language === 'fr' ? 'Connectez-vous pour ajouter une affiche' : 'Sign in to add a poster');
      return;
    }
    setUploadingPoster(true);
    try {
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${user.id}/new_poster_${Date.now()}.${fileExt}`;
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
      setPosterUrl(urlData.publicUrl);
      setPosterType(fileExt === 'pdf' ? 'pdf' : 'image');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.log('Error uploading poster:', error);
      Alert.alert(t('common', 'error'), error.message || 'Upload failed');
    } finally {
      setUploadingPoster(false);
    }
  }, [user, supabase, t, language]);

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
        { text: t('common', 'delete'), style: 'destructive', onPress: () => {
          setPosterUrl(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }},
      ]
    );
  }, [t, language]);

  const getStatusFromDate = (startDate: Date, end?: Date | null): 'À venir' | 'En cours' | 'Terminé' => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    if (start > today) return 'À venir';
    if (end) { const endD = new Date(end); endD.setHours(23, 59, 59, 999); if (endD < today) return 'Terminé'; return 'En cours'; }
    if (start.getTime() === today.getTime()) return 'En cours';
    return 'Terminé';
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) { setDate(selectedDate); if (endDate && selectedDate > endDate) setEndDate(null); }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) setEndDate(selectedDate);
  };

  const handleSave = async () => {
    if (isSaving) return;

    const cleanName = safeText(name);
    const selectedClub = clubs.find(c => c.id === clubId);
    const terrain = terrains.find(t => t.id === terrainId);

    const manualAddress = safeText(manualLocation.address) || safeText(manualLocation.formattedAddress);
    const manualCity = safeText(manualLocation.city) || manualAddress;
    const manualCountry = safeText(manualLocation.country) || 'France';
    const manualLat = safeNumber(manualLocation.latitude, 0);
    const manualLng = safeNumber(manualLocation.longitude, 0);

    const terrainLat = safeNumber(terrain?.location?.latitude, 0);
    const terrainLng = safeNumber(terrain?.location?.longitude, 0);

    const locationName = safeText(terrain?.name) || manualAddress || manualCity;
    const locationCity = safeText(terrain?.city) || manualCity;
    const locationLat = terrain ? terrainLat : manualLat;
    const locationLng = terrain ? terrainLng : manualLng;

    if (!cleanName) {
      Alert.alert(t('common', 'error'), t('tournament', 'errorNameRequired'));
      return;
    }

    if (!terrain && !hasManualLocation) {
      Alert.alert(t('common', 'error'), t('tournament', 'errorLocationRequired'));
      return;
    }

    setIsSaving(true);
    try {
      const tournamentPayload = {
        name: cleanName,
        date: date.toISOString(),
        type,
        format,
        location: {
          name: locationName || cleanName,
          city: locationCity || manualCountry,
          country: manualCountry,
          address: manualAddress || undefined,
          formattedAddress: safeText(manualLocation.formattedAddress) || undefined,
          latitude: locationLat,
          longitude: locationLng,
          lat: locationLat,
          lng: locationLng,
        },
        terrainId: terrain?.id,
        terrainName: terrain?.name,
        terrainType: terrain?.type,
        clubId: selectedClub?.id,
        clubName: selectedClub?.name,
        status: getStatusFromDate(date, endDate),
        endDate: endDate ? endDate.toISOString() : undefined,
        participants: 0,
        maxParticipants: parseInt(maxParticipants, 10) || 32,
        prize: safeText(prize) || undefined,
        description: safeText(description) || undefined,
        tournamentLevel: tournamentLevel || undefined,
        tournamentCategory: tournamentCategory || undefined,
        registrationType: registrationType || undefined,
        tournamentScope: tournamentScope || undefined,
        registrationCost: safeText(registrationCost) ? safeNumber(registrationCost, 0) : undefined,
        posterUrl: posterUrl ?? undefined,
      };

      const { error } = await addTournament(tournamentPayload as any);
      if (error) {
        Alert.alert(t('common', 'error'), error);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/directory' as any);
      }, 80);
    } catch (e: any) {
      console.log('[NewTournament] create failed:', e);
      Alert.alert(t('common', 'error'), e?.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}><Text style={styles.headerTitle}>{t('tournament', 'newTournament')}</Text></View>
        <Pressable
          style={[styles.headerSaveBtn, !canSave && styles.headerSaveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.headerSaveBtnText}>{t('common', 'save')}</Text>}
        </Pressable>
      </View>

      <StepIndicator step={progress.filled} total={progress.total} label={progressLabel} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" removeClippedSubviews={false}>

          {/* 1. Nom */}
          <SectionCard title={t('tournament', 'tournamentName')} icon="emoji-events" color={theme.carreauColor} delay={50} required>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder={t('tournament', 'namePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" autoFocus />
          </SectionCard>

          {/* 2. Dates */}
          <SectionCard title={t('tournament', 'dates')} subtitle={endDate ? t('tournament', 'multiDay') : t('tournament', 'singleDay')} icon="event" color={theme.primary} delay={100} required>
            <View style={styles.dateRow}>
              <Pressable style={[styles.dateCard, styles.dateCardStart]} onPress={() => setShowDatePicker(true)}>
                <View style={styles.dateCardLabel}><MaterialIcons name="today" size={14} color={theme.primary} /><Text style={styles.dateCardLabelText}>{t('tournament', 'startLabel')}</Text></View>
                <Text style={styles.dateCardDay}>{date.getDate()}</Text>
                <Text style={styles.dateCardMonth}>{date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: 'numeric' })}</Text>
                <Text style={styles.dateCardWeekday}>{date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long' })}</Text>
              </Pressable>
              <Pressable style={[styles.dateCard, endDate ? styles.dateCardEnd : styles.dateCardAdd]} onPress={() => setShowEndDatePicker(true)}>
                {endDate ? (
                  <>
                    <View style={styles.dateCardLabel}>
                      <MaterialIcons name="event" size={14} color={theme.accent} />
                      <Text style={[styles.dateCardLabelText, { color: theme.accent }]}>{t('tournament', 'endLabel')}</Text>
                      <Pressable hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setEndDate(null); }} style={styles.dateRemoveBtn}>
                        <MaterialIcons name="close" size={12} color={theme.error} />
                      </Pressable>
                    </View>
                    <Text style={[styles.dateCardDay, { color: theme.accent }]}>{endDate.getDate()}</Text>
                    <Text style={styles.dateCardMonth}>{endDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: 'numeric' })}</Text>
                    <Text style={styles.dateCardWeekday}>{endDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long' })}</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.addEndDateIcon}><MaterialIcons name="add" size={24} color={theme.textMuted} /></View>
                    <Text style={styles.addEndDateText}>{t('tournament', 'endDate')}</Text>
                    <Text style={styles.addEndDateHint}>{t('tournament', 'multiDays')}</Text>
                  </>
                )}
              </Pressable>
            </View>
            {showDatePicker ? <DateTimePicker value={date} mode="date" display="default" onChange={handleDateChange} minimumDate={new Date()} /> : null}
            {showEndDatePicker ? <DateTimePicker value={endDate || date} mode="date" display="default" onChange={handleEndDateChange} minimumDate={date} /> : null}
          </SectionCard>

          {/* 3. Lieu (Modal Picker) */}
          <SectionCard title={t('tournament', 'location')} icon="place" color={theme.success} delay={150} required style={styles.locationSectionCard}>
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
              <Animated.View entering={FadeInDown.duration(250)} style={styles.locationPickerWrapper}>
                <LocationPicker label={t('tournament', 'tournamentLocation')} value={manualLocation} onChange={setManualLocation} placeholder={t('tournament', 'searchAddress')} required showAddressField />
              </Animated.View>
            ) : null}
          </SectionCard>

          {/* 4. Format */}
          <SectionCard title={t('tournament', 'gameFormat')} icon="groups" color={theme.accent} delay={175} required style={styles.gameFormatSectionCard}>
            <View style={styles.formatGrid}>
              {config.game.formats.map(f => {
                const cfg = FORMAT_CONFIG_KEYS[f]; const isActive = format === f;
                return (
                  <Pressable key={f} style={[styles.formatCard, isActive && styles.formatCardActive]} onPress={() => { Haptics.selectionAsync(); setFormat(f); }}>
                    <View style={[styles.formatCardIconBox, isActive && styles.formatCardIconBoxActive]}><MaterialIcons name={cfg.icon as any} size={22} color={isActive ? '#FFF' : theme.textSecondary} /></View>
                    <Text style={[styles.formatCardName, isActive && styles.formatCardNameActive]}>{t('formats', f)}</Text>
                    <Text style={styles.formatCardMeta}>{t('formatDetails', cfg.playersKey)}</Text>
                    <Text style={styles.formatCardMeta}>{t('formatDetails', cfg.boulesKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 5. Cadrage (Modal Picker) */}
          <SectionCard title={t('tournament', 'cadrage')} subtitle={t('tournament', 'competitionType')} icon="account-tree" color={theme.tirColor} delay={200} style={styles.cadrageSectionCard}>
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

          <AccordionCard style={styles.organizerClubSectionCard}>
            <Pressable
              style={styles.accordionHeader}
              onPress={() => {
                Haptics.selectionAsync();
                Keyboard.dismiss();
                setClubSearch('');
                setShowClubPicker(true);
              }}
            >
              <View style={[styles.sectionCardIcon, { backgroundColor: theme.primaryLight + '15' }]}>
                <MaterialIcons name="home-work" size={18} color={theme.primaryLight} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionCardTitle}>{t('tournament', 'organizingClub')}</Text>
                {selectedClubObj ? (
                  <Text style={[styles.accordionValueText, { color: theme.primaryLight }]} numberOfLines={1}>
                    {selectedClubObj.name}{selectedClubObj.city ? ` · ${selectedClubObj.city}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.sectionCardSubtitle}>{t('tournament', 'none')}</Text>
                )}
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>
          </AccordionCard>

          {/* 7. Finances - Accordion */}
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

          {/* 8. Niveau - Accordion */}
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

          {/* 9. Catégorie - Accordion */}
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

          {/* 10. Inscription - Accordion */}
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
                    return (<Pressable key={reg} style={[styles.chipOutline, isActive && styles.chipOutlineActiveWarn]} onPress={() => { Haptics.selectionAsync(); setRegistrationType(registrationType === reg ? undefined : reg); }}><Text style={[styles.chipOutlineText, isActive && styles.chipOutlineTextPrimary]}>{t('registrationTypes', reg)}</Text></Pressable>);
                  })}
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 11. Envergure - Accordion */}
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
                <View style={styles.chipGrid}>
                  {config.tournamentScopes.map(scope => {
                    const isActive = tournamentScope === scope;
                    return (<Pressable key={scope} style={[styles.chipOutline, isActive && styles.chipOutlineActivePrimary]} onPress={() => { Haptics.selectionAsync(); setTournamentScope(tournamentScope === scope ? undefined : scope); }}><Text style={[styles.chipBtnText, isActive && styles.chipBtnTextAccent]}>{t('tournamentScopes', scope)}</Text></Pressable>);
                  })}
                </View>
              </View>
            ) : null}
          </AccordionCard>

          {/* 12. Participants - Accordion */}
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

          {/* 13. Description - Accordion */}
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

          {/* 14. Tournament Poster */}
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
                    <Pressable onPress={() => posterType === 'pdf' ? Linking.openURL(posterUrl) : setShowPosterFullscreen(true)}>
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
                      <MaterialIcons name="add-photo-alternate" size={28} color={theme.carreauColor} />
                    </View>
                    <Text style={styles.posterUploadTitle}>{language === 'fr' ? 'Ajouter une affiche' : 'Add a poster'}</Text>
                    <Text style={styles.posterUploadSubtitle}>{language === 'fr' ? 'Photo ou PDF' : 'Photo or PDF'}</Text>
                  </Pressable>
                )}
                {uploadingPoster ? (
                  <View style={styles.posterUploadingRow}>
                    <ActivityIndicator size="small" color={theme.carreauColor} />
                    <Text style={styles.posterUploadingText}>{language === 'fr' ? 'Envoi en cours...' : 'Uploading...'}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </AccordionCard>

        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, pressed && canSave && styles.saveButtonPressed]} onPress={handleSave} disabled={!canSave}>
            <MaterialIcons name="emoji-events" size={22} color="#FFF" />
            <Text style={styles.saveButtonText}>{t('tournament', 'createTournament')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 4 }}>
            <Pressable style={styles.addNewItemBtn} onPress={() => { setShowTerrainPicker(false); router.push('/terrain/new'); }}>
              <MaterialIcons name="add" size={14} color={theme.primary} /><Text style={styles.addNewItemBtnText}>{t('tournament', 'terrainBtn')}</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
          <Pressable style={[styles.modalPickerItem, !terrainId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(undefined); setShowTerrainPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="edit-location" size={20} color={theme.textMuted} /></View>
            <View style={styles.modalPickerItemInfo}><Text style={styles.modalPickerItemName}>{t('tournament', 'otherLocation')}</Text><Text style={styles.modalPickerItemSub}>{t('tournament', 'manualAddressEntry')}</Text></View>
            {!terrainId ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
          </Pressable>
          <FlatList data={filteredTerrains} keyExtractor={(item) => item.id} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} renderItem={({ item: tr }) => {
            const tc = config.terrainTypes.find(t => t.id === tr.type);
            return (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, terrainId === tr.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(tr.id); setShowTerrainPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.success + '15' }]}><MaterialIcons name={(tc?.icon as any) || 'landscape'} size={20} color={theme.success} /></View>
                <View style={styles.modalPickerItemInfo}><Text style={styles.modalPickerItemName}>{tr.name}</Text><Text style={styles.modalPickerItemSub}>{tr.address}, {tr.city}</Text></View>
                {terrainId === tr.id ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
              </Pressable>
            );
          }} ListEmptyComponent={<View style={styles.modalEmpty}><MaterialIcons name="landscape" size={40} color={theme.textMuted} /><Text style={styles.modalEmptyText}>{t('tournament', 'noTerrainsRegistered')}</Text></View>} />
          </View>
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
          <View style={{ flex: 1 }}>
          <Pressable style={[styles.modalPickerItem, !clubId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(undefined); setShowClubPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
            <Text style={[styles.modalPickerItemName, { flex: 1 }]}>{t('tournament', 'none')}</Text>
            {!clubId ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
          </Pressable>
          <FlatList
            data={filteredClubs}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: club }) => (
            <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, clubId === club.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(club.id); setShowClubPicker(false); }}>
              <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.primaryLight + '15' }]}><MaterialIcons name="home-work" size={20} color={theme.primaryLight} /></View>
              <View style={styles.modalPickerItemInfo}><Text style={styles.modalPickerItemName}>{club.name}</Text><Text style={styles.modalPickerItemSub}>{club.city}</Text></View>
              {clubId === club.id ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
            </Pressable>
          )} ListEmptyComponent={<View style={styles.modalEmpty}><MaterialIcons name="home-work" size={40} color={theme.textMuted} /><Text style={styles.modalEmptyText}>{t('profile', 'noClubRegistered')}</Text></View>} />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Poster Fullscreen Modal */}
      <Modal visible={showPosterFullscreen} animationType="fade" transparent onRequestClose={() => setShowPosterFullscreen(false)}>
        <View style={styles.posterFullscreenBackdrop}>
          <Pressable style={styles.posterFullscreenClose} onPress={() => setShowPosterFullscreen(false)}>
            <MaterialIcons name="close" size={24} color="#FFF" />
          </Pressable>
          {posterUrl ? <Image source={{ uri: posterUrl }} style={styles.posterFullscreenImage} contentFit="contain" transition={200} /> : null}
        </View>
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

  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, position: 'relative', overflow: 'visible', ...theme.shadows.card },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionCardIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionCardSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  requiredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.error },

  // Keep Location, Game Format, Tournament System, and Organizing Club
  // in the normal document flow. Do not use descending zIndex/elevation here:
  // on Android, elevated lower cards can paint over the previous animated card
  // after LocationPicker expands/collapses, making Tournament System look cut
  // by Organizing Club. These cards stay flat and separated instead.
  locationSectionCard: {
    position: 'relative',
    zIndex: 1,
    elevation: 0,
    overflow: 'visible',
    marginBottom: 16,
  },
  locationPickerWrapper: {
    marginTop: 14,
    marginBottom: 22,
    position: 'relative',
    zIndex: 2,
    elevation: 0,
    overflow: 'visible',
  },
  gameFormatSectionCard: {
    position: 'relative',
    zIndex: 0,
    elevation: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cadrageSectionCard: {
    position: 'relative',
    zIndex: 0,
    elevation: 0,
    overflow: 'hidden',
    marginBottom: 24,
    paddingBottom: 18,
  },
  organizerClubSectionCard: {
    position: 'relative',
    zIndex: 0,
    elevation: 0,
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 16,
  },

  textInput: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 13, borderRadius: theme.borderRadius.md, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  textArea: { minHeight: 90, paddingTop: 13 },

  // Date
  dateRow: { flexDirection: 'row', gap: 12 },
  dateCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  dateCardStart: { borderColor: theme.primary + '40' },
  dateCardEnd: { borderColor: theme.accent + '40' },
  dateCardAdd: { borderStyle: 'dashed' as 'dashed', borderColor: theme.textMuted + '40', justifyContent: 'center' },
  dateCardLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, alignSelf: 'flex-start' },
  dateCardLabelText: { fontSize: 10, fontWeight: '600', color: theme.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateCardDay: { fontSize: 32, fontWeight: '800', color: theme.primary },
  dateCardMonth: { fontSize: 12, color: theme.textSecondary, fontWeight: '500', marginTop: 2, textTransform: 'capitalize' },
  dateCardWeekday: { fontSize: 11, color: theme.textMuted, textTransform: 'capitalize', marginTop: 1 },
  dateRemoveBtn: { marginLeft: 'auto', width: 20, height: 20, borderRadius: 10, backgroundColor: theme.error + '15', alignItems: 'center', justifyContent: 'center' },
  addEndDateIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  addEndDateText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  addEndDateHint: { fontSize: 10, color: theme.textMuted + 'AA', marginTop: 2 },

  // Format
  formatGrid: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  formatCardActive: { borderColor: theme.accent, backgroundColor: theme.accent + '08' },
  formatCardIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  formatCardIconBoxActive: { backgroundColor: theme.accent },
  formatCardName: { fontSize: 13, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  formatCardNameActive: { color: theme.accent },
  formatCardMeta: { fontSize: 10, color: theme.textMuted },

  // Cadrage info (shown below picker)
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

  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalCloseBtn: { padding: 8 },
  modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  modalPickerItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  modalPickerItemActive: { borderWidth: 2, borderColor: theme.success },
  modalPickerItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modalPickerItemInfo: { flex: 1, minWidth: 0 },
  modalPickerItemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  modalPickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },
  addNewItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '12', borderRadius: theme.borderRadius.sm },
  addNewItemBtnText: { fontSize: 12, fontWeight: '600', color: theme.primary },

  // Cadrage modal items
  cadrageModalItem: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card },
  cadrageModalItemActive: { borderColor: theme.tirColor, backgroundColor: theme.tirColor + '06' },
  cadrageModalItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cadrageModalItemIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center' },
  cadrageModalItemName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  cadrageModalItemDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
  cadrageModalItemDetails: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  cadrageModalItemStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cadrageModalItemStatText: { fontSize: 11, color: theme.textMuted, fontWeight: '500' },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.carreauColor, paddingVertical: 16, borderRadius: theme.borderRadius.md, ...theme.shadows.cardElevated },
  saveButtonDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  saveButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

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
});
