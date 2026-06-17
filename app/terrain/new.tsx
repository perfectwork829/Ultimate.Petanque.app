import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Switch,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
import theme from '@/constants/theme';
import config, { TerrainType } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import { useAuth } from '@/template';
import { uploadTerrainPhotos } from '@/services/storageService';
import { toMapCoord } from '@/utils/mapPlayerLocation';
import {
  checkDuplicatePublicTerrains,
  importPublicItemToDirectory,
  PublicTerrain,
} from '@/services/publicItemsService';

// Store last selected placeId for duplicate detection
let lastPlaceId: string | undefined;
let lastPhotoRef: string | undefined;

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/**
 * Build a URL that loads in `<Image />` for a Google place photo.
 * - Places API (New) returns `photos[].name` like `places/ChIJ…/photos/Aw…` → use Place Photos (New) media endpoint.
 * - Legacy `photo_reference` strings (no `places/` prefix) → classic Place Photo API.
 * @see https://developers.google.com/maps/documentation/places/web-service/place-photos
 */
function getGooglePlacePhotoDisplayUrl(photoRef: string, maxPx: number = 1200): string {
  const key = GOOGLE_API_KEY;
  if (!key || !photoRef.trim()) return '';
  if (photoRef.startsWith('places/')) {
    return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${maxPx}&maxHeightPx=${maxPx}&key=${encodeURIComponent(key)}`;
  }
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxPx}&photo_reference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(key)}`;
}

/** Resolve a CDN URL for New Places photos (skipHttpRedirect JSON) so `<Image>` loads reliably on native. */
async function resolvePlacePhotoUriForDisplay(photoRef: string, apiKey: string, maxPx: number): Promise<string> {
  if (!apiKey?.trim() || !photoRef?.trim()) return '';
  const ref = photoRef.trim();
  if (ref.startsWith('places/')) {
    const jsonUrl = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${maxPx}&maxHeightPx=${maxPx}&key=${encodeURIComponent(apiKey)}&skipHttpRedirect=true`;
    try {
      const res = await fetch(jsonUrl);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await res.json();
          const uri = j.photoUri || j.photo_uri;
          if (typeof uri === 'string' && uri.length > 0) {
            if (uri.startsWith('https://')) return uri;
            if (uri.startsWith('http://')) return uri;
            if (uri.startsWith('//')) return `https:${uri}`;
            return `https://${uri.replace(/^\/+/, '')}`;
          }
        }
      }
    } catch {
      /* use direct media URL */
    }
    return `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${maxPx}&maxHeightPx=${maxPx}&key=${encodeURIComponent(apiKey)}`;
  }
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxPx}&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(apiKey)}`;
}

function getGoogleStaticMapPreviewUrl(lat: number, lng: number, apiKey: string): string {
  if (!apiKey?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=400x400&scale=2&maptype=roadmap&markers=color:0x2563EB%7C${lat},${lng}&key=${encodeURIComponent(apiKey)}`;
}

// ============================================
// SectionCard
// ============================================
function SectionCard({ children, title, subtitle, icon, color, delay = 0, required = false }: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  icon: string;
  color: string;
  delay?: number;
  required?: boolean;
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

export default function NewTerrainScreen() {
  const insets = useSafeAreaInsets();
  const { clubs } = useAppData();
  const { addTerrain } = useAppActions();
  const { t, language } = useLanguage();
  
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<TerrainType>('Stabilisé');
  const [description, setDescription] = useState('');
  const [clubId, setClubId] = useState<string | undefined>();
  const [courtsCount, setCourtsCount] = useState('1');
  const [publicAccess, setPublicAccess] = useState(true);
  const [lighting, setLighting] = useState(false);
  const [covered, setCovered] = useState(false);
  const [parking, setParking] = useState(false);
  const [toilets, setToilets] = useState(false);
  const [environment, setEnvironment] = useState<'indoor' | 'outdoor'>('outdoor');
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationData>({ address: '', city: '', country: 'France', latitude: 0, longitude: 0 });

  // Location-based name suggestion
  const [nameSuggestion, setNameSuggestion] = useState<string>('');

  // Google Places auto-photo
  const [googlePhotoUrls, setGooglePhotoUrls] = useState<string[]>([]);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [selectedGooglePhotos, setSelectedGooglePhotos] = useState<Set<number>>(new Set());
  const photoResolveGeneration = useRef(0);
  const lastMapCoordsRef = useRef({ lat: 0, lng: 0 });

  const handleLocationChange = useCallback((loc: LocationData) => {
    const gen = ++photoResolveGeneration.current;
    setLocation(loc);
    lastMapCoordsRef.current = { lat: loc.latitude, lng: loc.longitude };
    lastPlaceId = loc.placeId;
    lastPhotoRef = loc.googlePhotoRef;

    const hasCoords =
      Number.isFinite(loc.latitude) &&
      Number.isFinite(loc.longitude) &&
      (Math.abs(loc.latitude) > 1e-5 || Math.abs(loc.longitude) > 1e-5);

    let urls: string[] = [];
    if (loc.googlePhotoRefs && loc.googlePhotoRefs.length > 0 && GOOGLE_API_KEY) {
      urls = loc.googlePhotoRefs
        .slice(0, 10)
        .map(ref => getGooglePlacePhotoDisplayUrl(ref))
        .filter(Boolean) as string[];
    } else if (loc.googlePhotoRef && GOOGLE_API_KEY) {
      const u = getGooglePlacePhotoDisplayUrl(loc.googlePhotoRef);
      urls = u ? [u] : [];
    }

    if (urls.length === 0 && GOOGLE_API_KEY && hasCoords) {
      urls = [getGoogleStaticMapPreviewUrl(loc.latitude, loc.longitude, GOOGLE_API_KEY)];
    }

    setGooglePhotoUrls(urls);

    const refs =
      loc.googlePhotoRefs && loc.googlePhotoRefs.length > 0
        ? loc.googlePhotoRefs.slice(0, 10)
        : loc.googlePhotoRef
          ? [loc.googlePhotoRef]
          : [];

    if (GOOGLE_API_KEY && urls.length > 0 && refs.length > 0) {
      void (async () => {
        const out: string[] = [];
        for (let i = 0; i < urls.length; i++) {
          const ref = refs[i];
          if (ref?.startsWith('places/')) {
            const resolved = await resolvePlacePhotoUriForDisplay(ref, GOOGLE_API_KEY, 1000);
            out.push(resolved || urls[i]);
          } else {
            out.push(urls[i]);
          }
        }
        if (photoResolveGeneration.current !== gen) return;
        if (out.some((u, idx) => u !== urls[idx])) setGooglePhotoUrls(out);
      })();
    }

    // Generate name suggestion from Google Places result
    if (loc.placeName && loc.placeName !== loc.address) {
      // Use place name directly (e.g. "Boulodrome du Parc")
      const suggestion = loc.placeName;
      if (suggestion.length > 3 && suggestion.length < 80) {
        setNameSuggestion(suggestion);
      }
    } else if (loc.address && loc.city) {
      // Fallback: suggest "Boulodrome [neighborhood/street]" 
      const parts = loc.address.split(' ').filter(p => p.length > 2 && !/^\d+$/.test(p));
      if (parts.length >= 1) {
        const streetName = parts.slice(-2).join(' ');
        setNameSuggestion(`Boulodrome ${streetName}`);
      }
    }
  }, []);

  // Club picker modal
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');

  const filteredClubs = useMemo(() => {
    const s = clubSearch.toLowerCase();
    return clubs.filter(c => !s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s));
  }, [clubs, clubSearch]);

  const selectedClub = clubId ? clubs.find(c => c.id === clubId) : null;

  // Duplicates
  const [duplicates, setDuplicates] = useState<(PublicTerrain & { matchType: 'exact' | 'city' })[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    const trimmedCity = location.city.trim();
    if (trimmedCity.length < 2 && !lastPlaceId) { setDuplicates([]); setDuplicatesDismissed(false); return; }
    const timer = setTimeout(async () => {
      setCheckingDuplicates(true);
      const { duplicates: found } = await checkDuplicatePublicTerrains(trimmedCity, location.address.trim(), lastPlaceId);
      setDuplicates(found); setDuplicatesDismissed(false); setCheckingDuplicates(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [location.city, location.address]);

  const handleImportDuplicate = useCallback(async (item: PublicTerrain) => {
    setImportingId(item.id); Haptics.selectionAsync();
    const { newItemId, error } = await importPublicItemToDirectory('terrains', item.id);
    setImportingId(null);
    if (error) { showAlert(t('common', 'error'), error); }
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('common', 'success'), t('map', 'importSuccess')); router.back(); }
  }, [showAlert, t]);

  // Progress
  const progress = useMemo(() => {
    let filled = 0; const total = 4;
    if (name.trim()) filled++;
    filled++; // type always filled
    if (location.address.trim()) filled++;
    if (location.city.trim()) filled++;
    return { filled, total };
  }, [name, location.address, location.city]);

  const progressLabel = useMemo(() => {
    if (!name.trim()) return t('tournament', 'startWithName');
    if (!location.address.trim() || !location.city.trim()) return t('tournament', 'chooseLocation');
    return t('tournament', 'readyToCreate');
  }, [name, location.address, location.city, t]);

  const canSave = name.trim() && location.address.trim() && location.city.trim();

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorNameRequired')); return; }
    if (!location.address.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorAddressRequired')); return; }
    if (!location.city.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorCityRequired')); return; }
    setIsSaving(true);
    try {
      const uploadedPhotos = user?.id ? await uploadTerrainPhotos(user.id, photos) : [];
      const sc = clubs.find(c => c.id === clubId);
      await addTerrain({
        name: name.trim(), address: location.address.trim(), city: location.city.trim(),
        location: {
          latitude: toMapCoord(location.latitude),
          longitude: toMapCoord(location.longitude),
          country: location.country || 'France',
        },
        type, description: description.trim() || undefined, facilities: [], parking, toilets,
        clubId, clubName: sc?.name, isPublic: false, publicAccess,
        courtsCount: parseInt(courtsCount) || 1, lighting, covered, environment, photos: uploadedPhotos,
        googlePlaceId: lastPlaceId,
      } as any);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back();
    } catch (error) { Alert.alert(t('common', 'error'), t('terrain', 'errorSave')); } finally { setIsSaving(false); }
  };

  const showDuplicates = duplicates.length > 0 && !duplicatesDismissed;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('terrain', 'newTerrain')}</Text>
        </View>
        <Pressable
          style={[styles.headerSaveBtn, (!canSave || isSaving) && styles.headerSaveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.headerSaveBtnText}>{t('common', 'save')}</Text>}
        </Pressable>
      </View>

      <StepIndicator step={progress.filled} total={progress.total} label={progressLabel} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* 1. Nom du terrain */}
          <SectionCard title={t('terrain', 'terrainNameRequired').replace(' *', '')} icon="landscape" color={theme.accent} delay={100} required>
            <TextInput style={styles.textInput} value={name} onChangeText={(text) => { setName(text); if (text.trim()) setNameSuggestion(''); }} placeholder={t('terrain', 'namePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" autoFocus />
            {/* Auto-suggest name from Google Places */}
            {nameSuggestion && !name.trim() ? (
              <Pressable
                style={styles.nameSuggestionChip}
                onPress={() => {
                  setName(nameSuggestion);
                  setNameSuggestion('');
                  Haptics.selectionAsync();
                }}
              >
                <MaterialIcons name="auto-awesome" size={14} color={theme.accent} />
                <Text style={styles.nameSuggestionText} numberOfLines={1}>{nameSuggestion}</Text>
                <MaterialIcons name="arrow-forward" size={14} color={theme.accent} />
              </Pressable>
            ) : null}
          </SectionCard>

          {/* 2. Environnement */}
          <SectionCard title={t('terrain', 'environment')} icon="park" color={theme.success} delay={150}>
            <View style={styles.envGrid}>
              {config.terrainEnvironments.map(env => {
                const isActive = environment === env.id;
                return (
                  <Pressable key={env.id} style={[styles.envCard, isActive && styles.envCardActive]} onPress={() => { Haptics.selectionAsync(); setEnvironment(env.id as 'indoor' | 'outdoor'); }}>
                    <View style={[styles.envCardIconBox, isActive && styles.envCardIconBoxActive]}>
                      <MaterialIcons name={env.icon as any} size={26} color={isActive ? '#FFF' : theme.textSecondary} />
                    </View>
                    <Text style={[styles.envCardName, isActive && styles.envCardNameActive]}>{t('terrainEnv', env.id + 'Label')}</Text>
                    <Text style={styles.envCardDesc}>{t('terrainEnv', env.id + 'Desc')}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 3. Adresse */}
          <SectionCard title={t('terrain', 'addressRequired').replace(' *', '')} icon="place" color={theme.error} delay={200} required>
            <LocationPicker label="" value={location} onChange={handleLocationChange} placeholder={t('terrain', 'streetNumber')} required showAddressField />
            {/* Auto-filled details from Google Places */}
            {(location.postalCode || location.region) ? (
              <View style={styles.autoFilledRow}>
                {location.postalCode ? (
                  <View style={styles.autoFilledChip}>
                    <MaterialIcons name="local-post-office" size={12} color="#0EA5E9" />
                    <Text style={styles.autoFilledChipText}>{location.postalCode}</Text>
                  </View>
                ) : null}
                {location.region ? (
                  <View style={styles.autoFilledChip}>
                    <MaterialIcons name="map" size={12} color="#8B5CF6" />
                    <Text style={styles.autoFilledChipText}>{location.region}</Text>
                  </View>
                ) : null}
                {location.country && location.country !== 'France' ? (
                  <View style={styles.autoFilledChip}>
                    <MaterialIcons name="flag" size={12} color="#10B981" />
                    <Text style={styles.autoFilledChipText}>{location.country}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </SectionCard>

          {/* Photos — after address so place search can suggest Google photos first */}
          <SectionCard title={`${t('terrain', 'photosLabel')} (${photos.length}/5)`} icon="photo-camera" color={theme.primary} delay={225}>
            <View style={styles.photosGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoItem}>
                  <Image source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
                  <Pressable style={styles.removePhotoBtn} onPress={() => { setPhotos(prev => prev.filter((_, i) => i !== index)); Haptics.selectionAsync(); }}>
                    <MaterialIcons name="close" size={14} color="#FFF" />
                  </Pressable>
                </View>
              ))}
              {/* Google Places photos suggestion */}
              {photos.length < 5 && googlePhotoUrls.length > 0 ? (
                <Pressable
                  style={styles.googlePhotoSuggestion}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedGooglePhotos(new Set());
                    setShowPhotoPreview(true);
                  }}
                >
                  <Image source={{ uri: googlePhotoUrls[0] }} style={styles.photoImage} contentFit="cover" transition={200} />
                  <View style={styles.googlePhotoBadge}>
                    <MaterialIcons name="photo-library" size={12} color="#FFF" />
                    <Text style={styles.googlePhotoBadgeText}>{googlePhotoUrls.length} photo{googlePhotoUrls.length > 1 ? 's' : ''}</Text>
                  </View>
                </Pressable>
              ) : null}
              {photos.length < 5 ? (
                <>
                  <Pressable style={styles.addPhotoBtn} onPress={async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') { Alert.alert(t('common', 'error'), t('terrain', 'galleryPermissionMsg')); return; }
                    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8, selectionLimit: 5 - photos.length });
                    if (!result.canceled && result.assets) { setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 5)); Haptics.selectionAsync(); }
                  }}>
                    <MaterialIcons name="photo-library" size={22} color={theme.primary} />
                    <Text style={styles.addPhotoText}>{t('terrain', 'gallery')}</Text>
                  </Pressable>
                  <Pressable style={styles.addPhotoBtn} onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') { Alert.alert(t('common', 'error'), t('terrain', 'cameraPermissionMsg')); return; }
                    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
                    if (!result.canceled && result.assets?.[0]) { setPhotos(prev => [...prev, result.assets[0].uri].slice(0, 5)); Haptics.selectionAsync(); }
                  }}>
                    <MaterialIcons name="camera-alt" size={22} color={theme.primary} />
                    <Text style={styles.addPhotoText}>{t('terrain', 'photo')}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </SectionCard>

          {/* Duplicate Detection */}
          {checkingDuplicates ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.duplicateCheckingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.duplicateCheckingText}>{t('map', 'checkingDuplicates')}</Text>
            </Animated.View>
          ) : null}

          {showDuplicates ? (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.duplicateSection}>
              <View style={styles.duplicateHeader}>
                <View style={styles.duplicateHeaderLeft}>
                  <MaterialIcons name="info" size={20} color={theme.warning} />
                  <Text style={styles.duplicateTitle}>{duplicates.length === 1 ? t('map', 'duplicateFound') : t('map', 'duplicatesFound')}</Text>
                </View>
                <Pressable onPress={() => setDuplicatesDismissed(true)} hitSlop={8}><MaterialIcons name="close" size={18} color={theme.textMuted} /></Pressable>
              </View>
              <Text style={styles.duplicateDesc}>{t('map', 'duplicateTerrainDesc')}</Text>
              {duplicates.slice(0, 3).map(dup => (
                <View key={dup.id} style={styles.duplicateCard}>
                  <View style={styles.duplicateCardTop}>
                    <View style={[styles.duplicateIcon, { backgroundColor: theme.success }]}><MaterialIcons name="sports-soccer" size={16} color="#FFF" /></View>
                    <View style={styles.duplicateCardInfo}>
                      <Text style={styles.duplicateCardName} numberOfLines={1}>{dup.name}</Text>
                      <Text style={styles.duplicateCardMeta} numberOfLines={1}>{dup.city} {dup.address ? `• ${dup.address}` : ''}</Text>
                    </View>
                    <View style={[styles.matchBadge, dup.matchType === 'place_id' ? styles.matchBadgePlaceId : dup.matchType === 'exact' ? styles.matchBadgeExact : styles.matchBadgeCity]}>
                      <Text style={[styles.matchBadgeText, dup.matchType === 'place_id' ? styles.matchBadgeTextPlaceId : dup.matchType === 'exact' ? styles.matchBadgeTextExact : styles.matchBadgeTextCity]}>{dup.matchType === 'place_id' ? (t('map', 'exactLocation') || 'Lieu exact') : dup.matchType === 'exact' ? t('map', 'exactMatch') : t('map', 'cityMatch')}</Text>
                    </View>
                  </View>
                  <Pressable style={styles.importDuplicateBtn} onPress={() => handleImportDuplicate(dup)} disabled={importingId === dup.id}>
                    {importingId === dup.id ? <ActivityIndicator size="small" color="#FFF" /> : (<><MaterialIcons name="add-circle" size={16} color="#FFF" /><Text style={styles.importDuplicateBtnText}>{t('map', 'importInstead')}</Text></>)}
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.continueCreateBtn} onPress={() => setDuplicatesDismissed(true)}>
                <Text style={styles.continueCreateBtnText}>{t('map', 'continueCreation')}</Text>
                <MaterialIcons name="arrow-forward" size={16} color={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          ) : null}

          {/* 4. Type de Terrain */}
          <SectionCard title={t('terrain', 'terrainTypeRequired').replace(' *', '')} icon="terrain" color={theme.success} delay={250} required>
            <View style={styles.typeGrid}>
              {config.terrainTypes.map((tt) => {
                const isActive = type === tt.id;
                return (
                  <Pressable key={tt.id} style={[styles.typeCard, isActive && styles.typeCardActive]} onPress={() => { Haptics.selectionAsync(); setType(tt.id); }}>
                    <View style={[styles.typeCardIconBox, isActive && styles.typeCardIconBoxActive]}>
                      <MaterialIcons name={tt.icon as any} size={22} color={isActive ? '#FFF' : theme.textSecondary} />
                    </View>
                    <Text style={[styles.typeCardName, isActive && styles.typeCardNameActive]}>{t('terrainTypes', tt.id)}</Text>
                    <Text style={styles.typeCardDesc} numberOfLines={2}>{t('terrainTypeDescs', tt.id)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 5. Caractéristiques */}
          <SectionCard title={t('terrain', 'features')} icon="tune" color={theme.tirColor} delay={300}>
            <View style={styles.featuresCard}>
              <View style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <MaterialIcons name="public" size={22} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t('terrain', 'publicAccess')}</Text>
                    <Text style={styles.featureDesc}>{t('terrain', 'openToAll')}</Text>
                  </View>
                </View>
                <Switch value={publicAccess} onValueChange={setPublicAccess} trackColor={{ false: theme.border, true: theme.primary + '50' }} thumbColor={publicAccess ? theme.primary : theme.textMuted} />
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <MaterialIcons name="lightbulb" size={22} color={theme.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t('terrain', 'lighting')}</Text>
                    <Text style={styles.featureDesc}>{t('terrain', 'eveningPlay')}</Text>
                  </View>
                </View>
                <Switch value={lighting} onValueChange={setLighting} trackColor={{ false: theme.border, true: theme.warning + '50' }} thumbColor={lighting ? theme.warning : theme.textMuted} />
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <MaterialIcons name="roofing" size={22} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t('terrain', 'covered')}</Text>
                    <Text style={styles.featureDesc}>{t('terrain', 'weatherProtection')}</Text>
                  </View>
                </View>
                <Switch value={covered} onValueChange={setCovered} trackColor={{ false: theme.border, true: theme.accent + '50' }} thumbColor={covered ? theme.accent : theme.textMuted} />
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <MaterialIcons name="local-parking" size={22} color="#6366F1" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t('terrain', 'parking')}</Text>
                    <Text style={styles.featureDesc}>{t('terrain', 'parkingDesc')}</Text>
                  </View>
                </View>
                <Switch value={parking} onValueChange={setParking} trackColor={{ false: theme.border, true: '#6366F1' + '50' }} thumbColor={parking ? '#6366F1' : theme.textMuted} />
              </View>
              <View style={styles.featureDivider} />
              <View style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <MaterialIcons name="wc" size={22} color="#EC4899" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{t('terrain', 'toilets')}</Text>
                    <Text style={styles.featureDesc}>{t('terrain', 'toiletsDesc')}</Text>
                  </View>
                </View>
                <Switch value={toilets} onValueChange={setToilets} trackColor={{ false: theme.border, true: '#EC4899' + '50' }} thumbColor={toilets ? '#EC4899' : theme.textMuted} />
              </View>
            </View>
          </SectionCard>

          {/* 6. Nombre de terrains */}
          <SectionCard title={t('terrain', 'courtsCount')} icon="grid-view" color={theme.carreauColor} delay={350}>
            <View style={styles.courtsCountRow}>
              <Pressable
                style={styles.courtsCountBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  const current = parseInt(courtsCount) || 1;
                  if (current > 1) setCourtsCount(String(current - 1));
                }}
              >
                <MaterialIcons name="remove" size={22} color={theme.textSecondary} />
              </Pressable>
              <TextInput
                style={styles.courtsCountInput}
                value={courtsCount}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '');
                  setCourtsCount(cleaned);
                }}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
              />
              <Pressable
                style={styles.courtsCountBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  const current = parseInt(courtsCount) || 0;
                  setCourtsCount(String(current + 1));
                }}
              >
                <MaterialIcons name="add" size={22} color={theme.carreauColor} />
              </Pressable>
            </View>
            <View style={styles.countsRow}>
              {['1', '2', '4', '6', '8', '12'].map(num => {
                const isActive = courtsCount === num;
                return (
                  <Pressable key={num} style={[styles.countPill, isActive && styles.countPillActive]} onPress={() => { Haptics.selectionAsync(); setCourtsCount(num); }}>
                    <Text style={[styles.countPillText, isActive && styles.countPillTextActive]}>{num}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 7. Club associé (Modal Picker) */}
          <SectionCard title={t('terrain', 'associatedClub')} icon="home-work" color={theme.primaryLight} delay={400}>
            <Pressable style={styles.pickerButton} onPress={() => { setClubSearch(''); setShowClubPicker(true); }}>
              {selectedClub ? (
                <View style={styles.pickerSelected}>
                  <MaterialIcons name="home-work" size={20} color={theme.primaryLight} />
                  <View style={styles.pickerSelectedInfo}>
                    <Text style={styles.pickerSelectedName}>{selectedClub.name}</Text>
                    <Text style={styles.pickerSelectedSub}>{selectedClub.city}</Text>
                  </View>
                  <Pressable onPress={(e) => { e.stopPropagation(); setClubId(undefined); Haptics.selectionAsync(); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickerPlaceholder}>
                  <MaterialIcons name="home-work" size={20} color={theme.textMuted} />
                  <Text style={styles.pickerPlaceholderText}>{t('terrain', 'noneLabel')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              )}
            </Pressable>
          </SectionCard>

          {/* 8. Description */}
          <SectionCard title={t('terrain', 'descriptionLabel')} icon="description" color={theme.textSecondary} delay={430}>
            <TextInput style={[styles.textInput, styles.textArea]} value={description} onChangeText={setDescription} placeholder={t('terrain', 'descriptionPlaceholder')} placeholderTextColor={theme.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
          </SectionCard>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={({ pressed }) => [styles.saveButton, (!canSave || isSaving) && styles.saveButtonDisabled, pressed && canSave && !isSaving && styles.saveButtonPressed]}
            onPress={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="add-location-alt" size={22} color="#FFF" />}
            <Text style={styles.saveButtonText}>{t('terrain', 'createTerrain')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Google Places Photos Gallery Modal */}
      <Modal visible={showPhotoPreview} animationType="fade" transparent onRequestClose={() => setShowPhotoPreview(false)}>
        <View style={styles.photoPreviewOverlay}>
          <View style={styles.photoGalleryCard}>
            <View style={styles.photoPreviewHeader}>
              <MaterialIcons name="photo-library" size={20} color="#4285F4" />
              <Text style={styles.photoPreviewTitle}>
                {language === 'fr' ? `Photos Google Places (${googlePhotoUrls.length})` : `Google Places Photos (${googlePhotoUrls.length})`}
              </Text>
              <Pressable onPress={() => setShowPhotoPreview(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.photoGalleryDesc}>
              {language === 'fr'
                ? `Sélectionnez les photos à ajouter (max ${5 - photos.length})`
                : `Select photos to add (max ${5 - photos.length})`}
            </Text>
            <ScrollView style={styles.photoGalleryScroll} contentContainerStyle={styles.photoGalleryGrid} showsVerticalScrollIndicator={false}>
              {googlePhotoUrls.map((url, index) => {
                const isSelected = selectedGooglePhotos.has(index);
                const maxReached = !isSelected && selectedGooglePhotos.size >= (5 - photos.length);
                return (
                  <Pressable
                    key={index}
                    style={[styles.photoGalleryItem, isSelected && styles.photoGalleryItemSelected, maxReached && styles.photoGalleryItemDisabled]}
                    onPress={() => {
                      if (maxReached) return;
                      Haptics.selectionAsync();
                      setSelectedGooglePhotos(prev => {
                        const next = new Set(prev);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      });
                    }}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.photoGalleryImage}
                      contentFit="cover"
                      transition={200}
                      onError={() => {
                        setGooglePhotoUrls((prev) => {
                          const cur = prev[index];
                          if (!cur || cur.includes('staticmap')) return prev;
                          const { lat, lng } = lastMapCoordsRef.current;
                          if (GOOGLE_API_KEY && Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 1e-5 || Math.abs(lng) > 1e-5)) {
                            const next = [...prev];
                            next[index] = getGoogleStaticMapPreviewUrl(lat, lng, GOOGLE_API_KEY);
                            return next;
                          }
                          return prev;
                        });
                      }}
                    />
                    <View style={styles.photoGalleryCheck}>
                      {isSelected ? (
                        <MaterialIcons name="check-circle" size={24} color="#4285F4" />
                      ) : (
                        <View style={styles.photoGalleryCheckEmpty} />
                      )}
                    </View>
                    {maxReached ? <View style={styles.photoGalleryDisabledOverlay} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.photoPreviewActions}>
              <Pressable
                style={styles.photoPreviewSkipBtn}
                onPress={() => {
                  setShowPhotoPreview(false);
                  setGooglePhotoUrls([]);
                  Haptics.selectionAsync();
                }}
              >
                <MaterialIcons name="close" size={16} color={theme.textSecondary} />
                <Text style={styles.photoPreviewSkipText}>{language === 'fr' ? 'Ignorer' : 'Skip'}</Text>
              </Pressable>
              <Pressable
                style={[styles.photoPreviewUseBtn, selectedGooglePhotos.size === 0 && { opacity: 0.5 }]}
                onPress={() => {
                  if (selectedGooglePhotos.size === 0) return;
                  const selectedUrls = Array.from(selectedGooglePhotos)
                    .sort((a, b) => a - b)
                    .map(i => googlePhotoUrls[i]);
                  setPhotos(prev => [...prev, ...selectedUrls].slice(0, 5));
                  setGooglePhotoUrls([]);
                  setShowPhotoPreview(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                disabled={selectedGooglePhotos.size === 0}
              >
                <MaterialIcons name="add-photo-alternate" size={16} color="#FFF" />
                <Text style={styles.photoPreviewUseText}>
                  {selectedGooglePhotos.size === 0
                    ? (language === 'fr' ? 'Sélectionner' : 'Select')
                    : language === 'fr'
                      ? `Ajouter ${selectedGooglePhotos.size} photo${selectedGooglePhotos.size > 1 ? 's' : ''}`
                      : `Add ${selectedGooglePhotos.size} photo${selectedGooglePhotos.size > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Club Picker Modal */}
      <Modal visible={showClubPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowClubPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('terrain', 'associatedClub')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowClubPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={clubSearch} onChangeText={setClubSearch} placeholder={t('profile', 'searchClub')} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <Pressable style={[styles.modalPickerItem, !clubId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(undefined); setShowClubPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
            <Text style={[styles.modalPickerItemName, { flex: 1 }]}>{t('terrain', 'noneLabel')}</Text>
            {!clubId ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
          </Pressable>
          <FlatList
            data={filteredClubs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: club }) => (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, clubId === club.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(club.id); setShowClubPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.primaryLight + '15' }]}><MaterialIcons name="home-work" size={20} color={theme.primaryLight} /></View>
                <View style={styles.modalPickerItemInfo}><Text style={styles.modalPickerItemName}>{club.name}</Text><Text style={styles.modalPickerItemSub}>{club.city}</Text></View>
                {clubId === club.id ? <MaterialIcons name="check-circle" size={20} color={theme.primaryLight} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.modalEmpty}>
                <MaterialIcons name="home-work" size={40} color={theme.textMuted} />
                <Text style={styles.modalEmptyText}>{t('profile', 'noClubRegistered')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.accent, borderRadius: theme.borderRadius.md, minWidth: 72, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtnDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  headerSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  stepIndicator: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  stepBarTrack: { height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  stepBarFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 2 },
  stepLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // SectionCard
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionCardIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionCardSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  requiredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.error },

  // Inputs
  textInput: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 13, borderRadius: theme.borderRadius.md, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  textArea: { minHeight: 90, paddingTop: 13 },

  // Photos
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoItem: { width: 90, height: 90, borderRadius: theme.borderRadius.md, overflow: 'hidden', position: 'relative' },
  photoImage: { width: '100%', height: '100%' },
  removePhotoBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  addPhotoBtn: { width: 90, height: 90, borderRadius: theme.borderRadius.md, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border, borderStyle: 'dashed' as any, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPhotoText: { fontSize: 11, color: theme.primary, fontWeight: '600' },

  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: { width: '47%', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', minHeight: 110 },
  typeCardActive: { borderColor: theme.accent, backgroundColor: theme.accent + '08' },
  typeCardIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  typeCardIconBoxActive: { backgroundColor: theme.accent },
  typeCardName: { fontSize: 13, fontWeight: '700', color: theme.textPrimary, marginBottom: 2, textAlign: 'center' },
  typeCardNameActive: { color: theme.accent },
  typeCardDesc: { fontSize: 10, color: theme.textMuted, textAlign: 'center', lineHeight: 13 },

  // Picker button
  pickerButton: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  pickerSelected: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerSelectedInfo: { flex: 1 },
  pickerSelectedName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerSelectedSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pickerPlaceholder: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerPlaceholderText: { flex: 1, fontSize: 15, color: theme.textMuted },

  // Courts count
  courtsCountRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 16, marginBottom: 14 },
  courtsCountBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: theme.border },
  courtsCountInput: { fontSize: 28, fontWeight: '800' as const, color: theme.carreauColor, width: 80, textAlign: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, paddingVertical: 8, borderWidth: 1.5, borderColor: theme.carreauColor + '30' },
  countsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const },
  countPill: { minWidth: 44, alignItems: 'center' as const, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.full, borderWidth: 1.5, borderColor: 'transparent' },
  countPillActive: { borderColor: theme.carreauColor, backgroundColor: theme.carreauColor + '10' },
  countPillText: { fontSize: 13, fontWeight: '700' as const, color: theme.textSecondary },
  countPillTextActive: { color: theme.carreauColor },

  // Features
  featuresCard: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  featureDesc: { fontSize: 11, color: theme.textSecondary },
  featureDivider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },

  // Environment
  envGrid: { flexDirection: 'row', gap: 12 },
  envCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14, borderWidth: 2, borderColor: 'transparent', alignItems: 'center' },
  envCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '08' },
  envCardIconBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  envCardIconBoxActive: { backgroundColor: theme.primary },
  envCardName: { fontSize: 13, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', marginBottom: 4 },
  envCardNameActive: { color: theme.primary },
  envCardDesc: { fontSize: 10, color: theme.textMuted, textAlign: 'center', lineHeight: 13 },

  // Modals
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalCloseBtn: { padding: 8 },
  modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  modalPickerItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  modalPickerItemActive: { borderWidth: 2, borderColor: theme.primaryLight },
  modalPickerItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modalPickerItemInfo: { flex: 1, minWidth: 0 },
  modalPickerItemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  modalPickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },

  // Auto-filled address details
  autoFilledRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 10 },
  autoFilledChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.borderRadius.full, borderWidth: 1, borderColor: theme.border },
  autoFilledChipText: { fontSize: 12, fontWeight: '600' as const, color: theme.textSecondary },
  // Name suggestion
  nameSuggestionChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10, backgroundColor: theme.accent + '10', paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.accent + '25' },
  nameSuggestionText: { flex: 1, fontSize: 14, fontWeight: '600' as const, color: theme.accent },
  // Google photo suggestion
  googlePhotoSuggestion: { width: 90, height: 90, borderRadius: theme.borderRadius.md, overflow: 'hidden' as const, position: 'relative' as const, borderWidth: 2, borderColor: '#4285F4', borderStyle: 'solid' as const },
  googlePhotoBadge: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 3, backgroundColor: 'rgba(66,133,244,0.85)', paddingVertical: 3 },
  googlePhotoBadgeText: { fontSize: 9, fontWeight: '700' as const, color: '#FFF' },
  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.accent, paddingVertical: 16, borderRadius: theme.borderRadius.md, ...theme.shadows.cardElevated },
  saveButtonDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  saveButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Duplicates
  duplicateCheckingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  duplicateCheckingText: { fontSize: 13, color: theme.textMuted },
  duplicateSection: { backgroundColor: theme.warning + '08', borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.warning + '30' },
  duplicateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  duplicateHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  duplicateTitle: { fontSize: 15, fontWeight: '700', color: theme.warning },
  duplicateDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginBottom: 14 },
  duplicateCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 10, ...theme.shadows.card },
  duplicateCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  duplicateIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  duplicateCardInfo: { flex: 1, marginRight: 8 },
  duplicateCardName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  duplicateCardMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full },
  matchBadgeExact: { backgroundColor: theme.warning + '20' },
  matchBadgeCity: { backgroundColor: theme.primary + '15' },
  matchBadgeText: { fontSize: 10, fontWeight: '600' },
  matchBadgeTextExact: { color: theme.warning },
  matchBadgeTextCity: { color: theme.primary },
  matchBadgePlaceId: { backgroundColor: '#EF444420' },
  matchBadgeTextPlaceId: { color: '#EF4444' },
  importDuplicateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary, paddingVertical: 10, borderRadius: theme.borderRadius.md },
  importDuplicateBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
  continueCreateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 4 },
  continueCreateBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  // Photo preview modal
  photoPreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' as const, alignItems: 'center' as const, padding: 24 },
  photoGalleryCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, width: '100%', maxWidth: 400, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16 }, android: { elevation: 8 }, default: {} }) },
  photoPreviewHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 12 },
  photoPreviewTitle: { flex: 1, fontSize: 16, fontWeight: '700' as const, color: theme.textPrimary },
  photoGalleryDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center' as const, marginBottom: 12 },
  photoGalleryScroll: { maxHeight: 380 },
  photoGalleryGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, paddingBottom: 8 },
  photoGalleryItem: { width: '47%' as any, aspectRatio: 1, borderRadius: 12, overflow: 'hidden' as const, position: 'relative' as const, borderWidth: 2.5, borderColor: 'transparent' },
  photoGalleryItemSelected: { borderColor: '#4285F4' },
  photoGalleryItemDisabled: { opacity: 0.4 },
  photoGalleryImage: { width: '100%', height: '100%' },
  photoGalleryCheck: { position: 'absolute' as const, top: 6, right: 6 },
  photoGalleryCheckSelected: {},
  photoGalleryCheckEmpty: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFF', backgroundColor: 'rgba(0,0,0,0.3)' },
  photoGalleryDisabledOverlay: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)' },
  photoPreviewActions: { flexDirection: 'row' as const, gap: 10, marginTop: 12 },
  photoPreviewSkipBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  photoPreviewSkipText: { fontSize: 14, fontWeight: '600' as const, color: theme.textSecondary },
  photoPreviewUseBtn: { flex: 2, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: '#4285F4' },
  photoPreviewUseText: { fontSize: 14, fontWeight: '700' as const, color: '#FFF' },
});
