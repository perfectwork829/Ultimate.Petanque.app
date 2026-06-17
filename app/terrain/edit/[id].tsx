import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as Location from '@/services/location';
import * as ImagePicker from '@/services/imagePicker';
import theme from '@/constants/theme';
import config, { TerrainType } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import {
  checkDuplicatePublicTerrainsExcluding,
  fetchPublicTerrainById,
  PublicTerrain,
} from '@/services/publicItemsService';
import MergeComparisonModal, { MergeField } from '@/components/ui/MergeComparisonModal';
import { useAuth } from '@/template';
import { uploadTerrainPhotos } from '@/services/storageService';
import { isValidMapCoord, toMapCoord } from '@/utils/mapPlayerLocation';

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

export default function EditTerrainScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { clubs, loading: appLoading } = useAppData();
  const { getTerrainById, updateTerrain } = useAppActions();
  const { t } = useLanguage();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const terrain = getTerrainById(id || '');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
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
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Club picker modal
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');

  const filteredClubs = useMemo(() => {
    const s = clubSearch.toLowerCase();
    return clubs.filter(c => !s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s));
  }, [clubs, clubSearch]);

  const selectedClub = clubId ? clubs.find(c => c.id === clubId) : null;

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<(PublicTerrain & { matchType: 'exact' | 'city' })[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareFields, setCompareFields] = useState<MergeField[]>([]);
  const [comparePublicData, setComparePublicData] = useState<any>(null);
  const [comparePublicName, setComparePublicName] = useState('');

  // Load terrain data
  useEffect(() => {
    if (terrain) {
      setName(terrain.name);
      setAddress(terrain.address);
      setCity(terrain.city);
      setType(terrain.type);
      setDescription(terrain.description || '');
      setClubId(terrain.clubId);
      setCourtsCount(String(terrain.courtsCount ?? 1));
      setPublicAccess(terrain.publicAccess ?? true);
      setLighting(terrain.lighting);
      setCovered(terrain.covered);
      setLatitude(toMapCoord(terrain.location?.latitude));
      setLongitude(toMapCoord(terrain.location?.longitude));
      setPhotos(terrain.photos || []);
      setEnvironment(terrain.environment || 'outdoor');
      setParking((terrain as any).parking ?? false);
      setToilets((terrain as any).toilets ?? false);
    }
  }, [terrain]);

  // Request location permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
    })();
  }, []);

  // Check for duplicates when city/address changes
  useEffect(() => {
    const trimmedCity = city.trim();
    if (trimmedCity.length < 2 || !terrain) {
      setDuplicates([]);
      setDuplicatesDismissed(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingDuplicates(true);
      const { duplicates: found } = await checkDuplicatePublicTerrainsExcluding(trimmedCity, address.trim(), terrain.id);
      setDuplicates(found);
      setDuplicatesDismissed(false);
      setCheckingDuplicates(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [city, address, terrain?.id]);

  const handleMergeDuplicate = useCallback(async (dup: PublicTerrain) => {
    setMergingId(dup.id);
    Haptics.selectionAsync();
    const { item, error } = await fetchPublicTerrainById(dup.id);
    setMergingId(null);
    if (error || !item) { showAlert(t('common', 'error'), error || 'Not found'); return; }
    const selClubName = clubs.find(c => c.id === clubId)?.name || '';
    const fields: MergeField[] = [
      { key: 'name', label: t('modificationLogs', 'name'), myValue: name, publicValue: item.name || '', icon: 'label' },
      { key: 'address', label: t('modificationLogs', 'address'), myValue: address, publicValue: item.address || '', icon: 'place' },
      { key: 'city', label: t('modificationLogs', 'city'), myValue: city, publicValue: item.city || '', icon: 'location-city' },
      { key: 'type', label: t('modificationLogs', 'type'), myValue: t('terrainTypes', type), publicValue: item.type ? t('terrainTypes', item.type) : '', icon: 'landscape' },
      { key: 'description', label: t('modificationLogs', 'description'), myValue: description, publicValue: item.description || '', icon: 'notes' },
      { key: 'courtsCount', label: t('modificationLogs', 'courtsCount'), myValue: courtsCount, publicValue: item.courts_count ? String(item.courts_count) : '', icon: 'grid-view' },
      { key: 'lighting', label: t('modificationLogs', 'lighting'), myValue: String(lighting), publicValue: String(item.lighting ?? false), icon: 'lightbulb' },
      { key: 'covered', label: t('modificationLogs', 'covered'), myValue: String(covered), publicValue: String(item.covered ?? false), icon: 'roofing' },
      { key: 'clubName', label: t('club', 'clubLabel'), myValue: selClubName, publicValue: item.club_name || '', icon: 'home' },
      { key: 'location', label: t('modificationLogs', 'location'), myValue: isValidMapCoord(latitude, longitude) ? `${toMapCoord(latitude).toFixed(4)}, ${toMapCoord(longitude).toFixed(4)}` : '', publicValue: item.location ? `${toMapCoord(item.location.latitude).toFixed(4)}, ${toMapCoord(item.location.longitude).toFixed(4)}` : '', icon: 'my-location' },
    ];
    setCompareFields(fields);
    setComparePublicData(item);
    setComparePublicName(item.name || dup.name);
    setShowCompareModal(true);
  }, [name, address, city, description, latitude, longitude, courtsCount, clubId, clubs, type, lighting, covered, showAlert, t]);

  const handleApplyMerge = useCallback((selections: Record<string, 'mine' | 'public'>) => {
    if (!comparePublicData) return;
    const pub = comparePublicData;
    if (selections.name === 'public' && pub.name) setName(pub.name);
    if (selections.address === 'public' && pub.address) setAddress(pub.address);
    if (selections.city === 'public' && pub.city) setCity(pub.city);
    if (selections.type === 'public' && pub.type) setType(pub.type);
    if (selections.description === 'public') setDescription(pub.description || '');
    if (selections.courtsCount === 'public' && pub.courts_count) setCourtsCount(String(pub.courts_count));
    if (selections.lighting === 'public') setLighting(pub.lighting ?? false);
    if (selections.covered === 'public') setCovered(pub.covered ?? false);
    if (selections.clubName === 'public' && pub.club_name) {
      const matchedClub = clubs.find(c => c.name === pub.club_name);
      if (matchedClub) setClubId(matchedClub.id);
    }
    if (selections.location === 'public' && pub.location) {
      setLatitude(pub.location.latitude || 0);
      setLongitude(pub.location.longitude || 0);
    }
    setShowCompareModal(false);
    setDuplicatesDismissed(true);
    showAlert(t('common', 'success'), t('map', 'mergeSuccess'));
  }, [comparePublicData, clubs, showAlert, t]);

  // Geocode
  const geocodeAddress = async () => {
    if (!address.trim() || !city.trim()) return;
    setIsGeocoding(true);
    try {
      const fullAddress = `${address.trim()}, ${city.trim()}, France`;
      const results = await Location.geocodeAsync(fullAddress);
      if (results && results.length > 0) {
        setLatitude(toMapCoord(results[0].latitude));
        setLongitude(toMapCoord(results[0].longitude));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert(t('terrain', 'addressNotFound'), t('terrain', 'addressNotFoundMsg'));
      }
    } catch (error) { console.error('Geocoding error:', error); }
    finally { setIsGeocoding(false); }
  };

  const getCurrentLocation = async () => {
    if (!locationPermission) { Alert.alert(t('terrain', 'permissionRequired'), t('terrain', 'locationPermissionMsg')); return; }
    setIsGeocoding(true);
    try {
      const location = await Location.getCurrentPositionAsync({});
      setLatitude(toMapCoord(location.coords.latitude));
      setLongitude(toMapCoord(location.coords.longitude));
      const reverseResults = await Location.reverseGeocodeAsync({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      if (reverseResults && reverseResults.length > 0) {
        const result = reverseResults[0];
        if (result.street) setAddress(`${result.streetNumber || ''} ${result.street}`.trim());
        if (result.city) setCity(result.city);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) { Alert.alert(t('common', 'error'), t('terrain', 'errorGetPosition')); }
    finally { setIsGeocoding(false); }
  };

  // Progress
  const progress = useMemo(() => {
    let filled = 0; const total = 4;
    if (name.trim()) filled++;
    filled++; // type always filled
    if (address.trim()) filled++;
    if (city.trim()) filled++;
    return { filled, total };
  }, [name, address, city]);

  const progressLabel = useMemo(() => {
    if (!name.trim()) return t('tournament', 'startWithName');
    if (!address.trim() || !city.trim()) return t('tournament', 'chooseLocation');
    return t('tournament', 'readyToCreate');
  }, [name, address, city, t]);

  const canSave = name.trim() && address.trim() && city.trim();

  const handleSave = async () => {
    if (!terrain) return;
    if (!name.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorNameRequired')); return; }
    if (!address.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorAddressRequired')); return; }
    if (!city.trim()) { Alert.alert(t('common', 'error'), t('terrain', 'errorCityRequired')); return; }
    setIsSaving(true);
    try {
      const uploadedPhotos = user?.id ? await uploadTerrainPhotos(user.id, photos) : photos;
      const sc = clubs.find(c => c.id === clubId);
      const saveLat = toMapCoord(latitude);
      const saveLng = toMapCoord(longitude);
      await updateTerrain(terrain.id, {
        name: name.trim(), address: address.trim(), city: city.trim(),
        location: { latitude: saveLat, longitude: saveLng, country: terrain?.location?.country || 'France' }, type,
        description: description.trim() || undefined,
        clubId, clubName: sc?.name, publicAccess,
        courtsCount: parseInt(courtsCount, 10) || 1, lighting, covered, parking, toilets, environment, photos: uploadedPhotos,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.log('[EditTerrain] Save error:', error);
      Alert.alert(t('common', 'error'), t('terrain', 'errorSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const showCoordsPreview = isValidMapCoord(latitude, longitude);

  const showDuplicates = duplicates.length > 0 && !duplicatesDismissed;

  if (!terrain) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}><Text style={styles.headerTitle}>{t('terrain', 'editTerrain')}</Text></View>
          <View style={styles.headerBtn} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={{ fontSize: 16, color: theme.textMuted }}>{t('terrain', 'terrainNotFound')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('terrain', 'editTerrain')}</Text>
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

          {/* Photos */}
          <SectionCard title={`${t('terrain', 'photosLabel')} (${photos.length}/5)`} icon="photo-camera" color={theme.primary} delay={50}>
            <View style={styles.photosGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoItem}>
                  <Image source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
                  <Pressable style={styles.removePhotoBtn} onPress={() => { setPhotos(prev => prev.filter((_, i) => i !== index)); Haptics.selectionAsync(); }}>
                    <MaterialIcons name="close" size={14} color="#FFF" />
                  </Pressable>
                </View>
              ))}
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

          {/* 1. Nom du terrain */}
          <SectionCard title={t('terrain', 'terrainNameRequired').replace(' *', '')} icon="landscape" color={theme.accent} delay={100} required>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder={t('terrain', 'namePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" />
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
            <View style={styles.sectionHeader}>
              <View />
              <Pressable style={styles.locationButton} onPress={getCurrentLocation} disabled={isGeocoding}>
                {isGeocoding ? <ActivityIndicator size="small" color={theme.primary} /> : (
                  <><MaterialIcons name="my-location" size={16} color={theme.primary} /><Text style={styles.locationButtonText}>{t('terrain', 'myLocation')}</Text></>
                )}
              </Pressable>
            </View>
            <TextInput style={[styles.textInput, { marginBottom: 12 }]} value={address} onChangeText={setAddress} placeholder={t('terrain', 'streetNumber')} placeholderTextColor={theme.textMuted} />
            <TextInput style={[styles.textInput, { marginBottom: 12 }]} value={city} onChangeText={setCity} placeholder={t('terrain', 'cityRequired')} placeholderTextColor={theme.textMuted} />
            <Pressable style={[styles.geocodeButton, (!address.trim() || !city.trim()) && styles.geocodeButtonDisabled]} onPress={geocodeAddress} disabled={!address.trim() || !city.trim() || isGeocoding}>
              {isGeocoding ? <ActivityIndicator size="small" color="#FFF" /> : (
                <><MaterialIcons name="place" size={18} color="#FFF" /><Text style={styles.geocodeButtonText}>{t('terrain', 'geocodeAddress')}</Text></>
              )}
            </Pressable>
            {(showCoordsPreview) ? (
              <Animated.View entering={FadeInDown.duration(300)} style={styles.locationPreview}>
                <MaterialIcons name="check-circle" size={20} color={theme.success} />
                <View style={styles.locationPreviewInfo}>
                  <Text style={styles.locationPreviewTitle}>{t('terrain', 'positionSaved')}</Text>
                  <Text style={styles.locationPreviewCoords}>{toMapCoord(latitude).toFixed(6)}, {toMapCoord(longitude).toFixed(6)}</Text>
                </View>
                <Pressable style={styles.resetLocationBtn} onPress={() => { setLatitude(0); setLongitude(0); Haptics.selectionAsync(); }}>
                  <MaterialIcons name="close" size={18} color={theme.error} />
                </Pressable>
              </Animated.View>
            ) : null}
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
                    <View style={[styles.matchBadge, dup.matchType === 'exact' ? styles.matchBadgeExact : styles.matchBadgeCity]}>
                      <Text style={[styles.matchBadgeText, dup.matchType === 'exact' ? styles.matchBadgeTextExact : styles.matchBadgeTextCity]}>{dup.matchType === 'exact' ? t('map', 'exactMatch') : t('map', 'cityMatch')}</Text>
                    </View>
                  </View>
                  <View style={styles.duplicateCardDetails}>
                    <View style={styles.duplicateDetailChip}>
                      <MaterialIcons name={config.terrainTypes.find(tt => tt.id === dup.type)?.icon as any || 'landscape'} size={12} color={theme.textSecondary} />
                      <Text style={styles.duplicateDetailText}>{t('terrainTypes', dup.type)}</Text>
                    </View>
                    <View style={styles.duplicateDetailChip}>
                      <Text style={styles.duplicateDetailText}>{dup.courtsCount} {dup.courtsCount > 1 ? t('map', 'courts') : t('map', 'court')}</Text>
                    </View>
                    {dup.lighting ? <View style={styles.duplicateDetailChip}><MaterialIcons name="lightbulb" size={12} color={theme.warning} /></View> : null}
                    {dup.clubName ? <View style={styles.duplicateDetailChip}><MaterialIcons name="home" size={12} color={theme.accent} /><Text style={styles.duplicateDetailText} numberOfLines={1}>{dup.clubName}</Text></View> : null}
                  </View>
                  <Pressable style={styles.mergeDuplicateBtn} onPress={() => handleMergeDuplicate(dup)} disabled={mergingId === dup.id}>
                    {mergingId === dup.id ? <ActivityIndicator size="small" color="#FFF" /> : (<><MaterialIcons name="merge-type" size={16} color="#FFF" /><Text style={styles.mergeDuplicateBtnText}>{t('map', 'mergeWithPublic')}</Text></>)}
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.continueEditBtn} onPress={() => setDuplicatesDismissed(true)}>
                <Text style={styles.continueEditBtnText}>{t('map', 'keepMine')}</Text>
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
            <View style={styles.countsRow}>
              {['1', '2', '4', '6', '8', '10', '12', '18'].map(num => {
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
            {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="check" size={22} color="#FFF" />}
            <Text style={styles.saveButtonText}>{t('terrain', 'saveChanges')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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

      {/* Merge Comparison Modal */}
      <MergeComparisonModal
        visible={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        onApply={handleApplyMerge}
        fields={compareFields}
        myLabel={t('map', 'myData')}
        publicLabel={t('map', 'publicData')}
        publicItemName={comparePublicName}
        t={t}
      />
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
  countsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countPill: { minWidth: 44, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.full, borderWidth: 1.5, borderColor: 'transparent' },
  countPillActive: { borderColor: theme.carreauColor, backgroundColor: theme.carreauColor + '10' },
  countPillText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
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

  // Address section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '15', borderRadius: theme.borderRadius.sm },
  locationButtonText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  geocodeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 14, borderRadius: theme.borderRadius.md },
  geocodeButtonDisabled: { backgroundColor: theme.textMuted },
  geocodeButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  locationPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.success + '10', paddingHorizontal: 14, paddingVertical: 12, borderRadius: theme.borderRadius.md, marginTop: 12, borderWidth: 1, borderColor: theme.success + '30' },
  locationPreviewInfo: { flex: 1 },
  locationPreviewTitle: { fontSize: 14, fontWeight: '600', color: theme.success },
  locationPreviewCoords: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  resetLocationBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.error + '15', alignItems: 'center', justifyContent: 'center' },

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
  duplicateCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
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
  duplicateCardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  duplicateDetailChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.sm },
  duplicateDetailText: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
  mergeDuplicateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.accent, paddingVertical: 10, borderRadius: theme.borderRadius.md },
  mergeDuplicateBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
  continueEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 4 },
  continueEditBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
});
