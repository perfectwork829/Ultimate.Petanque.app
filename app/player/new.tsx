import React, { useState, useMemo } from 'react';
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
import { Image } from 'expo-image';
import * as ImagePicker from '@/services/imagePicker';
import { router } from 'expo-router';
import { uploadPlayerAvatar } from '@/services/storageService';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import config, { PlayerRole } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import { COMMON_COUNTRIES, getCountryFlag } from '@/constants/geoData';

const ROLE_CONFIG: Record<string, { icon: string; color: string }> = {
  'Tireur': { icon: 'gps-fixed', color: '#EF4444' },
  'Pointeur': { icon: 'radio-button-on', color: '#10B981' },
  'Milieu': { icon: 'swap-horiz', color: '#3B82F6' },
};

// ============================================
// SectionCard - Shared visual pattern
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

export default function NewPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { clubs, terrains } = useAppData();
  const { addPlayer } = useAppActions();
  const { t, language } = useLanguage();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [role, setRole] = useState<PlayerRole>('Milieu');

  const [clubId, setClubId] = useState<string | undefined>();
  const [terrainId, setTerrainId] = useState<string | undefined>();
  const [location, setLocation] = useState<LocationData>({
    address: '', city: '', country: 'France', latitude: 0, longitude: 0,
  });
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [handedness, setHandedness] = useState<'right' | 'left' | 'ambidextrous' | ''>('');
  const [experience, setExperience] = useState<'less_than_1' | '1_to_3' | '3_to_10' | 'more_than_10' | ''>('');
  const [boulesName, setBoulesName] = useState('');
  const [boulesDiameter, setBoulesDiameter] = useState('');
  const [boulesWeight, setBoulesWeight] = useState('');

  // Picker modals
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [terrainSearch, setTerrainSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase();
    return q ? COMMON_COUNTRIES.filter(c => c.toLowerCase().includes(q)) : COMMON_COUNTRIES;
  }, [countrySearch]);

  const filteredClubs = useMemo(() => {
    const s = clubSearch.toLowerCase();
    return clubs.filter(c => !s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s));
  }, [clubs, clubSearch]);

  const filteredTerrains = useMemo(() => {
    const s = terrainSearch.toLowerCase();
    return terrains.filter(tr => !s || tr.name.toLowerCase().includes(s) || tr.city.toLowerCase().includes(s));
  }, [terrains, terrainSearch]);

  // Progress
  const progressFilled = [name.trim(), location.city].filter(Boolean).length;
  const progressTotal = 2;
  const progressLabel = !name.trim()
    ? (t('player', 'nameIsRequired'))
    : !location.city
    ? (language === 'fr' ? 'Localisation requise' : 'Location required')
    : (t('tournament', 'readyToCreate'));

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('player', 'permissionRequired'), t('player', 'permissionPhotos')); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
    } catch (error) { console.log('Error picking image:', error); Alert.alert(t('common', 'error'), t('player', 'errorSelectPhoto')); }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('player', 'permissionRequired'), t('player', 'permissionCamera')); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
    } catch (error) { console.log('Error taking photo:', error); Alert.alert(t('common', 'error'), t('player', 'errorTakePhoto')); }
  };

  const showImageOptions = () => {
    Alert.alert(t('player', 'profilePhoto'), t('player', 'chooseOption'), [
      { text: t('player', 'takePhoto'), onPress: takePhoto },
      { text: t('player', 'chooseFromGallery'), onPress: pickImage },
      ...(avatarUri ? [{ text: t('player', 'removeLabel'), style: 'destructive' as const, onPress: () => setAvatarUri(null) }] : []),
      { text: t('common', 'cancel'), style: 'cancel' as const },
    ]);
  };

  const uploadAvatar = async (): Promise<string | undefined> => {
    if (!avatarUri) return undefined;
    if (avatarUri.startsWith('http://') || avatarUri.startsWith('https://')) return avatarUri;
    try {
      setUploadingAvatar(true);
      const url = await uploadPlayerAvatar('new_player', avatarUri);
      return url || undefined;
    } catch (error) { console.log('Error uploading avatar:', error); return undefined; } finally { setUploadingAvatar(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t('common', 'error'), t('player', 'nameIsRequired')); return; }
    if (!location.city) { Alert.alert(t('common', 'error'), language === 'fr' ? 'La localisation est obligatoire. Veuillez selectionner une ville.' : 'Location is required. Please select a city.'); return; }
    const selectedClub = clubs.find(c => c.id === clubId);
    const selectedTerrain = terrains.find(t => t.id === terrainId);
    const avatarUrl = await uploadAvatar();
    const boules = (boulesName.trim() || boulesDiameter || boulesWeight) ? {
      name: boulesName.trim() || undefined,
      diameter: boulesDiameter ? parseInt(boulesDiameter) : undefined,
      weight: boulesWeight ? parseInt(boulesWeight) : undefined,
    } : undefined;
    addPlayer({
      name: name.trim(), nickname: nickname.trim() || undefined, avatar: avatarUrl, role,
      clubId, club: selectedClub?.name, terrainId, terrainName: selectedTerrain?.name,
      phone: phone.trim() || undefined, email: email.trim() || undefined, handedness: handedness || undefined, experience: experience || undefined, boules,
      location: location.city ? { city: location.city, latitude: location.latitude, longitude: location.longitude } : undefined,
      country: location.country || 'France',
      city: location.city || undefined,
      stats: { matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0, avgPointsScored: 0, avgPointsConceded: 0 },
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const selectedClub = clubId ? clubs.find(c => c.id === clubId) : null;
  const selectedTerrain = terrainId ? terrains.find(tr => tr.id === terrainId) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('player', 'newPlayer')}</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <StepIndicator step={progressFilled} total={progressTotal} label={progressLabel} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.avatarSection}>
            <Pressable style={styles.avatarContainer} onPress={showImageOptions} disabled={uploadingAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" transition={200} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                {uploadingAvatar ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="camera-alt" size={16} color="#FFF" />}
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>{t('player', 'tapToAddPhoto')}</Text>
          </Animated.View>

          {/* 1. Nom */}
          <SectionCard title={t('player', 'nameLabel')} icon="person" color={theme.primary} delay={50} required>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder={t('player', 'namePlaceholder')} placeholderTextColor={theme.textMuted} autoCapitalize="words" autoFocus />
            <TextInput style={[styles.textInput, { marginTop: 10 }]} value={nickname} onChangeText={setNickname} placeholder={t('player', 'nicknamePlaceholder')} placeholderTextColor={theme.textMuted} />
          </SectionCard>

          {/* 2. Pays */}
          <SectionCard title={t('player', 'countryLabel') || 'Pays'} icon="flag" color="#6366F1" delay={75}>
            <Pressable style={styles.pickerButton} onPress={() => { setCountrySearch(''); setShowCountryPicker(true); }}>
              <View style={styles.pickerSelected}>
                <MaterialIcons name="flag" size={20} color="#6366F1" />
                <View style={styles.pickerSelectedInfo}>
                  <Text style={styles.pickerSelectedName}>{getCountryFlag(location.country || 'France')} {location.country || 'France'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </View>
            </Pressable>
          </SectionCard>

          {/* 3. Localisation */}
          <SectionCard title={t('player', 'locationLabel')} icon="my-location" color={theme.primaryLight} delay={100} required>
            <LocationPicker label="" value={location} onChange={setLocation} placeholder={t('player', 'searchCity')} showCityOnly />
            {(() => {
              const empty = !location.latitude && !location.longitude;
              if (!empty) return null;
              const suggestions: { label: string; icon: string; color: string; city: string; lat: number; lng: number; address?: string; country?: string }[] = [];
              if (terrainId) { const tr = terrains.find(te => te.id === terrainId); if (tr?.location?.latitude || tr?.location?.longitude) suggestions.push({ label: t('profile', 'useTerrainLocation'), icon: 'sports-soccer', color: theme.success, city: tr.city, lat: tr.location.latitude, lng: tr.location.longitude, address: tr.address, country: tr.country }); }
              if (clubId) { const cl = clubs.find(c => c.id === clubId); if (cl?.location?.latitude || cl?.location?.longitude) suggestions.push({ label: t('profile', 'useClubLocation'), icon: 'home', color: theme.accent, city: cl.city, lat: cl.location.latitude, lng: cl.location.longitude, address: cl.address, country: cl.country }); }
              return suggestions.map((sug, idx) => (
                <Pressable key={idx} style={styles.autoFillBtn} onPress={() => { Haptics.selectionAsync(); setLocation({ address: sug.address || '', city: sug.city || '', country: sug.country || 'France', latitude: sug.lat, longitude: sug.lng }); }}>
                  <View style={[styles.autoFillIcon, { backgroundColor: sug.color + '15' }]}><MaterialIcons name={sug.icon as any} size={16} color={sug.color} /></View>
                  <Text style={styles.autoFillText} numberOfLines={1}>{sug.label}</Text>
                  <MaterialIcons name="my-location" size={16} color={theme.primary} />
                </Pressable>
              ));
            })()}
          </SectionCard>

          {/* 3. Terrain de pratique (Picker) */}
          <SectionCard title={t('player', 'practiceTerrain')} icon="place" color={theme.success} delay={150}>
            <Pressable style={styles.pickerButton} onPress={() => { setTerrainSearch(''); setShowTerrainPicker(true); }}>
              {selectedTerrain ? (
                <View style={styles.pickerSelected}>
                  <MaterialIcons name="sports-soccer" size={20} color={theme.success} />
                  <View style={styles.pickerSelectedInfo}>
                    <Text style={styles.pickerSelectedName}>{selectedTerrain.name}</Text>
                    <Text style={styles.pickerSelectedSub}>{selectedTerrain.city} {'•'} {t('terrainTypes', selectedTerrain.type)}</Text>
                  </View>
                  <Pressable onPress={(e) => { e.stopPropagation(); setTerrainId(undefined); Haptics.selectionAsync(); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickerPlaceholder}>
                  <MaterialIcons name="place" size={20} color={theme.textMuted} />
                  <Text style={styles.pickerPlaceholderText}>{t('player', 'noTerrain')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              )}
            </Pressable>
          </SectionCard>

          {/* 4. Contact */}
          <SectionCard title={t('player', 'contactLabel')} icon="contacts" color={theme.textSecondary} delay={200}>
            <View style={styles.contactRow}>
              <MaterialIcons name="phone" size={20} color={theme.textSecondary} />
              <TextInput style={styles.contactInput} value={phone} onChangeText={setPhone} placeholder={t('player', 'phonePlaceholder')} placeholderTextColor={theme.textMuted} keyboardType="phone-pad" />
            </View>
            <View style={[styles.contactRow, { marginTop: 10 }]}>
              <MaterialIcons name="email" size={20} color={theme.textSecondary} />
              <TextInput style={styles.contactInput} value={email} onChangeText={setEmail} placeholder={t('player', 'emailPlaceholder')} placeholderTextColor={theme.textMuted} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </SectionCard>

          {/* 5. Club (Picker) */}
          <SectionCard title={t('player', 'clubLabel')} icon="home-work" color={theme.accent} delay={250}>
            <Pressable style={styles.pickerButton} onPress={() => { setClubSearch(''); setShowClubPicker(true); }}>
              {selectedClub ? (
                <View style={styles.pickerSelected}>
                  <MaterialIcons name="home-work" size={20} color={theme.accent} />
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
                  <Text style={styles.pickerPlaceholderText}>{t('player', 'noClub')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              )}
            </Pressable>
          </SectionCard>

          {/* 6. Experience */}
          <SectionCard title={t('player', 'experienceLabel')} icon="timeline" color="#9333EA" delay={290}>
            <View style={styles.roleGrid}>
              {([{ id: 'less_than_1' as const, icon: 'child-care', label: t('player', 'experienceLessThan1') }, { id: '1_to_3' as const, icon: 'school', label: t('player', 'experience1to3') }, { id: '3_to_10' as const, icon: 'trending-up', label: t('player', 'experience3to10') }, { id: 'more_than_10' as const, icon: 'emoji-events', label: t('player', 'experienceMoreThan10') }]).map(e => (
                <Pressable key={e.id} style={[styles.roleCard, experience === e.id && { backgroundColor: '#9333EA', borderColor: '#9333EA' }]} onPress={() => { Haptics.selectionAsync(); setExperience(experience === e.id ? '' : e.id); }}>
                  <MaterialIcons name={e.icon as any} size={20} color={experience === e.id ? '#FFF' : theme.textSecondary} />
                  <Text style={[styles.roleCardName, { fontSize: 11 }, experience === e.id && { color: '#FFF' }]}>{e.label}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          {/* 7. Rôle */}
          <SectionCard title={t('player', 'roleLabel')} icon="sports" color={theme.tirColor} delay={300} required>
            <View style={styles.roleGrid}>
              {config.playerRoles.map(r => {
                const cfg = ROLE_CONFIG[r] || { icon: 'sports', color: theme.primary };
                const isActive = role === r;
                return (
                  <Pressable key={r} style={[styles.roleCard, isActive && { borderColor: cfg.color, backgroundColor: cfg.color + '08' }]} onPress={() => { Haptics.selectionAsync(); setRole(r); }}>
                    <View style={[styles.roleCardIconBox, isActive && { backgroundColor: cfg.color }]}>
                      <MaterialIcons name={cfg.icon as any} size={22} color={isActive ? '#FFF' : theme.textSecondary} />
                    </View>
                    <Text style={[styles.roleCardName, isActive && { color: cfg.color }]}>{t('roles', r)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          {/* 8. Latéralité */}
          <SectionCard title={t('player', 'handedness')} icon="front-hand" color="#6366F1" delay={330}>
            <View style={styles.roleGrid}>
              {([{ id: 'right' as const, icon: 'back-hand', label: t('player', 'rightHanded') }, { id: 'left' as const, icon: 'front-hand', label: t('player', 'leftHanded') }, { id: 'ambidextrous' as const, icon: 'swap-horiz', label: t('player', 'ambidextrous') }]).map(h => (
                <Pressable key={h.id} style={[styles.roleCard, handedness === h.id && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]} onPress={() => { Haptics.selectionAsync(); setHandedness(handedness === h.id ? '' : h.id); }}>
                  <MaterialIcons name={h.icon as any} size={22} color={handedness === h.id ? '#FFF' : theme.textSecondary} />
                  <Text style={[styles.roleCardName, handedness === h.id && { color: '#FFF' }]}>{h.label}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          {/* 9. Boules */}
          <SectionCard title={t('player', 'boulesLabel')} icon="sports-baseball" color="#D97706" delay={430}>
            <TextInput style={styles.textInput} value={boulesName} onChangeText={setBoulesName} placeholder={t('player', 'boulesPlaceholder')} placeholderTextColor={theme.textMuted} />
            <View style={styles.specsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.specLabel}>{t('player', 'diameterLabel')}</Text>
                <TextInput style={styles.textInput} value={boulesDiameter} onChangeText={setBoulesDiameter} placeholder="Ex: 74" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.specLabel}>{t('player', 'weightLabel')}</Text>
                <TextInput style={styles.textInput} value={boulesWeight} onChangeText={setBoulesWeight} placeholder="Ex: 700" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
              </View>
            </View>
          </SectionCard>
        </ScrollView>

        {/* Save */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={({ pressed }) => [styles.saveButton, (!name.trim() || uploadingAvatar) && styles.saveButtonDisabled, pressed && name.trim() && !uploadingAvatar && styles.saveButtonPressed]}
            onPress={handleSave}
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? <ActivityIndicator color="#FFF" /> : <MaterialIcons name="person-add" size={22} color="#FFF" />}
            <Text style={styles.saveButtonText}>{uploadingAvatar ? t('player', 'saving') : t('player', 'createPlayer')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Club Picker Modal */}
      <Modal visible={showClubPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowClubPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('player', 'clubLabel')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowClubPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={clubSearch} onChangeText={setClubSearch} placeholder={t('profile', 'searchClub')} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          {/* No club option */}
          <Pressable style={[styles.modalPickerItem, !clubId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(undefined); setShowClubPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}>
              <MaterialIcons name="block" size={20} color={theme.textMuted} />
            </View>
            <Text style={styles.modalPickerItemName}>{t('player', 'noClub')}</Text>
            {!clubId ? <MaterialIcons name="check-circle" size={20} color={theme.accent} /> : null}
          </Pressable>
          <FlatList
            data={filteredClubs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: club }) => (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, clubId === club.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setClubId(club.id); setShowClubPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.accent + '15' }]}>
                  <MaterialIcons name="home-work" size={20} color={theme.accent} />
                </View>
                <View style={styles.modalPickerItemInfo}>
                  <Text style={styles.modalPickerItemName}>{club.name}</Text>
                  <Text style={styles.modalPickerItemSub}>{club.city}</Text>
                </View>
                {clubId === club.id ? <MaterialIcons name="check-circle" size={20} color={theme.accent} /> : null}
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

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountryPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('player', 'countryLabel') || 'Pays'}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowCountryPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={countrySearch} onChangeText={setCountrySearch} placeholder={t('player', 'searchCountry') || 'Rechercher un pays...'} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <FlatList data={filteredCountries} keyExtractor={(item) => item} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} renderItem={({ item: country }) => {
            const isActive = (location.country || 'France') === country;
            return (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, isActive && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setLocation({ ...location, country }); setShowCountryPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: '#6366F1' + '15' }]}>
                  <MaterialIcons name="flag" size={20} color="#6366F1" />
                </View>
                <Text style={styles.modalPickerItemName}>{getCountryFlag(country)} {country}</Text>
                {isActive ? <MaterialIcons name="check-circle" size={20} color="#6366F1" /> : null}
              </Pressable>
            );
          }} ListEmptyComponent={<View style={styles.modalEmpty}><MaterialIcons name="search-off" size={40} color={theme.textMuted} /><Text style={styles.modalEmptyText}>{t('common', 'noResults')}</Text></View>} />
        </SafeAreaView>
      </Modal>

      {/* Terrain Picker Modal */}
      <Modal visible={showTerrainPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTerrainPicker(false)}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('player', 'practiceTerrain')}</Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowTerrainPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={terrainSearch} onChangeText={setTerrainSearch} placeholder={t('profile', 'searchTerrain')} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          {/* No terrain option */}
          <Pressable style={[styles.modalPickerItem, !terrainId && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(undefined); setShowTerrainPicker(false); }}>
            <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}>
              <MaterialIcons name="not-listed-location" size={20} color={theme.textMuted} />
            </View>
            <Text style={styles.modalPickerItemName}>{t('player', 'noTerrain')}</Text>
            {!terrainId ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
          </Pressable>
          <FlatList
            data={filteredTerrains}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item: terrain }) => (
              <Pressable style={[styles.modalPickerItem, { marginHorizontal: 0 }, terrainId === terrain.id && styles.modalPickerItemActive]} onPress={() => { Haptics.selectionAsync(); setTerrainId(terrain.id); setShowTerrainPicker(false); }}>
                <View style={[styles.modalPickerItemIcon, { backgroundColor: theme.success + '15' }]}>
                  <MaterialIcons name="sports-soccer" size={20} color={theme.success} />
                </View>
                <View style={styles.modalPickerItemInfo}>
                  <Text style={styles.modalPickerItemName}>{terrain.name}</Text>
                  <Text style={styles.modalPickerItemSub}>{terrain.city} {'•'} {t('terrainTypes', terrain.type)}</Text>
                </View>
                {terrainId === terrain.id ? <MaterialIcons name="check-circle" size={20} color={theme.success} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.modalEmpty}>
                <MaterialIcons name="place" size={40} color={theme.textMuted} />
                <Text style={styles.modalEmptyText}>{t('profile', 'noTerrainRegistered')}</Text>
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  stepIndicator: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  stepBarTrack: { height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  stepBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 2 },
  stepLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 14 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarText: { fontSize: 34, fontWeight: '700', color: '#FFF' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.backgroundSecondary },
  avatarHint: { fontSize: 11, color: theme.textMuted, marginTop: 6 },

  // SectionCard
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionCardIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionCardSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  requiredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.error },

  // Inputs
  textInput: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 13, borderRadius: theme.borderRadius.md, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },

  // Role
  roleGrid: { flexDirection: 'row', gap: 10 },
  roleCard: { flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14, borderWidth: 2, borderColor: 'transparent' },
  roleCardIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.textMuted + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  roleCardName: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },

  // Picker button
  pickerButton: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  pickerSelected: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerSelectedInfo: { flex: 1 },
  pickerSelectedName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerSelectedSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pickerPlaceholder: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pickerPlaceholderText: { flex: 1, fontSize: 15, color: theme.textMuted },

  // Auto-fill
  autoFillBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.primary + '08', borderRadius: theme.borderRadius.md, padding: 12, marginTop: 10, borderWidth: 1, borderColor: theme.primary + '20', borderStyle: 'dashed' as any },
  autoFillIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  autoFillText: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.primary },

  // Boules
  specsRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  specLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Contact
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border },
  contactInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: theme.textPrimary },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: theme.borderRadius.md, ...theme.shadows.cardElevated },
  saveButtonDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  saveButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Modals
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalCloseBtn: { padding: 8 },
  modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  modalContent: { padding: 16, gap: 8 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, ...theme.shadows.card },
  modalItemActive: { borderWidth: 2, borderColor: theme.success },
  modalItemIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalItemText: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  modalPickerItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  modalPickerItemActive: { borderWidth: 2, borderColor: theme.primary },
  modalPickerItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modalPickerItemInfo: { flex: 1, minWidth: 0 },
  modalPickerItemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  modalPickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },
});
