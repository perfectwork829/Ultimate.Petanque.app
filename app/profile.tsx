import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
// expo-document-picker and expo-file-system loaded dynamically to avoid web bundler issues
import * as Linking from 'expo-linking';
import { decode } from '@/services/base64';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { uploadPlayerAvatar } from '@/services/storageService';
import { deactivatePushToken } from '@/services/pushTokenService';
import { getMaintenanceStatus } from '@/services/maintenanceService';
import theme from '@/constants/theme';
import config, { PlayerRole } from '@/constants/config';
import { useAppData, useAppActions, useAppUI } from '@/contexts/AppContext';
import { Club, Terrain } from '@/types/petanque';
import { getUnreadShareNotificationCount } from '@/services/shareService';
import { getPendingShareRequestCount } from '@/services/matchShareService';
import { isUserAmbassador, isUserSponsor } from '@/services/ambassadorService';
import { useLanguage } from '@/hooks/useLanguage';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import AdBanner from '@/components/ui/AdBanner';
import { getEloRank } from '@/services/eloService';
import { fetchPlayerGeoRank, PlayerGeoRank } from '@/services/geoLeaderboardService';
import { getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';
import XPBar from '@/components/ui/XPBar';
import BadgeUnlockModal from '@/components/ui/BadgeUnlockModal';
import { BADGES, getBadgeName, getBadgeDescription } from '@/services/badgeService';
import { useBadges } from '@/hooks/useBadges';
import { computeStreakFromDates, getStreakStatus, StreakData } from '@/services/streakService';
import { extraTranslations } from '@/constants/i18nExtra';
import { Switch } from 'react-native';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES, loadNotificationPreferences, saveNotificationPreferences } from '@/services/notificationPreferencesService';
import { APP_VERSION_DISPLAY } from '@/constants/appVersion';
import {
  AUTH_EMAIL_OTP_MAX_LENGTH,
  isCompleteEmailOtp,
  normalizeEmailOtpInput,
} from '@/constants/authOtp';


export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, operationLoading, sendOTP } = useAuth();
  const { showAlert } = useAlert();
  const { clubs, terrains, selfPlayer, userStats, matches, challenges, tournaments, boulesSets } = useAppData();
  const { addClub, updatePlayer, refreshData, addBoulesSet, updateBoulesSet, setPrimaryBoulesSet, setBatterySaver } = useAppActions();
  const playerRecordId = selfPlayer?.id ?? user?.id;
  const { isPremium, isAdmin, batterySaverEnabled } = useAppUI();
  const supabase = getSupabaseClient();
  const { t, language, setLanguage } = useLanguage();
  const params = useLocalSearchParams<{ edit?: string }>();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const [isEditing, setIsEditing] = useState(false);

  // Auto-open edit mode when navigated with edit=true param
  useEffect(() => {
    if (params.edit === 'true') {
      setIsEditing(true);
    }
  }, [params.edit]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Profile fields
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<PlayerRole>('Milieu');
  const [level, setLevel] = useState<string>('Intermédiaire');
  const [club, setClub] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Nickname
  const [nickname, setNickname] = useState('');

  // Boules
  const [boulesName, setBoulesName] = useState('');
  const [boulesDiameter, setBoulesDiameter] = useState('');
  const [boulesWeight, setBoulesWeight] = useState('');
  const [boulesSerialNumber, setBoulesSerialNumber] = useState('');

  // Handedness
  const [handedness, setHandedness] = useState<'right' | 'left' | 'ambidextrous' | ''>('');

  // Experience
  const [experience, setExperience] = useState<'less_than_1' | '1_to_3' | '3_to_10' | 'more_than_10' | ''>('');

  // Federation card state
  const [federationCardUrl, setFederationCardUrl] = useState<string | null>(null);
  const [federationCardType, setFederationCardType] = useState<'image' | 'pdf'>('image');
  const [uploadingCard, setUploadingCard] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);

  // Location
  const [location, setLocation] = useState<LocationData>({
    address: '',
    city: '',
    country: 'France',
    latitude: 0,
    longitude: 0,
  });

  // Terrain field
  const [terrainId, setTerrainId] = useState<string | null>(null);
  const [terrainName, setTerrainName] = useState('');
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearch, setTerrainSearch] = useState('');

  // Club picker state
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubCity, setNewClubCity] = useState('');
  
  // Share notifications count
  const [unreadShareCount, setUnreadShareCount] = useState(0);
  const [pendingMatchInviteCount, setPendingMatchInviteCount] = useState(0);
  const [pendingWitnessCount, setPendingWitnessCount] = useState(0);
  const [isAmbassador, setIsAmbassador] = useState(false);
  const [isSponsor, setIsSponsor] = useState(false);
  
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);

  // Maintenance status (admin only)
  const [maintenanceActive, setMaintenanceActive] = useState(false);

  // Badges & XP
  const { badges: userBadges, xp: userXp, loading: badgesLoading, currentUnlock, dismissUnlock, totalBadges } = useBadges();

  // Geo rank
  const [geoRank, setGeoRank] = useState<PlayerGeoRank | null>(null);

  // Expandable settings sections
  const [showNotifSection, setShowNotifSection] = useState(false);
  const [showShareSection, setShowShareSection] = useState(false);
  const [showConsentDetail, setShowConsentDetail] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    account: false,
    notifications: false,
    data: false,
    community: false,
    legal: false,
  });
  const toggleSection = (key: string) => {
    Haptics.selectionAsync();
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  // Consent date
  const [consentDate, setConsentDate] = useState<string | null>(null);
  
  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'otp'>('confirm');
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  
  // Load geo rank
  useEffect(() => {
    if (!selfPlayer?.isPublic || !user?.id) return;
    fetchPlayerGeoRank(selfPlayer.id).then(({ geoRank: gr }) => setGeoRank(gr)).catch(() => {});
  }, [selfPlayer?.isPublic, selfPlayer?.id, user?.id]);

  // Consolidated polling: share notifications, witness count, maintenance, notification prefs
  useEffect(() => {
    if (!user?.id) return;
    const loadPolledData = async () => {
      // Share notifications + match invites + witness requests
      try {
        const [count, matchInviteCount] = await Promise.all([
          getUnreadShareNotificationCount(),
          getPendingShareRequestCount(),
        ]);
        setUnreadShareCount(count);
        setPendingMatchInviteCount(matchInviteCount);
        const sb = getSupabaseClient();
        const { data: witnessData, error: wErr } = await sb
          .from('match_witness_requests')
          .select('id')
          .eq('witness_user_id', user.id)
          .eq('status', 'pending');
        if (!wErr && witnessData) setPendingWitnessCount(witnessData.length);
      } catch { /* silent */ }
      // Maintenance status (admin only)
      if (isAdmin) {
        try {
          const s = await getMaintenanceStatus();
          setMaintenanceActive(s.isActive || s.isScheduled);
        } catch { /* silent */ }
      }
    };
    loadPolledData();
    const interval = setInterval(loadPolledData, 30000);
    return () => clearInterval(interval);
  }, [user?.id, isAdmin]);

  // Load notification preferences + ambassador/sponsor status (one-time, no polling)
  useEffect(() => {
    if (!user?.id) return;
    loadNotificationPreferences().then(prefs => {
      setNotifPrefs(prefs);
      setNotifPrefsLoaded(true);
    });
    isUserAmbassador(user.id).then(setIsAmbassador);
    isUserSponsor(user.id).then(setIsSponsor);
  }, [user?.id]);

  const handleToggleNotifPref = (key: keyof NotificationPreferences) => {
    Haptics.selectionAsync();
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    saveNotificationPreferences(updated).catch(() => {});
  };

  // Load federation card URL
  useEffect(() => {
    if (!user?.id) return;
    const loadCard = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('federation_card_url')
          .eq('id', user.id)
          .single();
        if (!error && data?.federation_card_url) {
          setFederationCardUrl(data.federation_card_url);
          setFederationCardType(data.federation_card_url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');
        }
      } catch (e) {
        console.log('Error loading federation card:', e);
      } finally {
        setLoadingCard(false);
      }
    };
    loadCard();
  }, [user?.id]);


  // Filtered clubs based on search
  const filteredClubs = useMemo(() => {
    if (!clubSearch.trim()) return clubs;
    const search = clubSearch.toLowerCase();
    return clubs.filter(c => 
      c.name.toLowerCase().includes(search) ||
      c.city.toLowerCase().includes(search)
    );
  }, [clubs, clubSearch]);

  // Filtered terrains based on search
  const filteredTerrains = useMemo(() => {
    if (!terrainSearch.trim()) return terrains;
    const search = terrainSearch.toLowerCase();
    return terrains.filter(t => 
      t.name.toLowerCase().includes(search) ||
      t.city.toLowerCase().includes(search)
    );
  }, [terrains, terrainSearch]);

  const levels = [
    { id: 'Débutant', icon: 'school' },
    { id: 'Intermédiaire', icon: 'trending-up' },
    { id: 'Confirmé', icon: 'stars' },
    { id: 'Expert', icon: 'emoji-events' },
  ];

  const roles: { id: PlayerRole; icon: string }[] = [
    { id: 'Tireur', icon: 'gps-fixed' },
    { id: 'Pointeur', icon: 'adjust' },
    { id: 'Milieu', icon: 'swap-horiz' },
  ];

  // Profile completeness
  const profileCompleteness = useMemo(() => {
    const fields = [
      { id: 'avatar', label: language === 'fr' ? 'Photo de profil' : 'Profile photo', filled: !!avatarUrl, icon: 'camera-alt', color: theme.primary, tip: language === 'fr' ? 'Ajoutez une photo pour etre reconnu' : 'Add a photo to be recognized', action: () => showPhotoOptions() },
      { id: 'club', label: 'Club', filled: !!club, icon: 'location-city', color: theme.success, tip: language === 'fr' ? 'Rejoignez un club pour le classement' : 'Join a club for rankings', action: () => setIsEditing(true) },
      { id: 'terrain', label: language === 'fr' ? 'Terrain favori' : 'Favorite court', filled: !!terrainId, icon: 'sports-soccer', color: theme.carreauColor, tip: language === 'fr' ? 'Selectionnez votre terrain habituel' : 'Select your usual court', action: () => setIsEditing(true) },
      { id: 'location', label: language === 'fr' ? 'Localisation' : 'Location', filled: !!(location.latitude && location.longitude), icon: 'place', color: '#8B5CF6', tip: language === 'fr' ? 'Apparaissez sur la carte' : 'Appear on the map', action: () => setIsEditing(true) },
      { id: 'boules', label: language === 'fr' ? 'Boules' : 'Boules set', filled: boulesSets.length > 0 || !!(selfPlayer?.boules?.name), icon: 'sports-baseball', color: theme.accent, tip: language === 'fr' ? 'Comparez par equipement' : 'Compare by equipment', action: () => router.push('/equipment') },
      { id: 'federation', label: language === 'fr' ? 'Carte federation' : 'Federation card', filled: !!federationCardUrl, icon: 'badge', color: '#0EA5E9', tip: language === 'fr' ? 'Boostez votre confiance' : 'Boost trust score', action: () => showFederationUploadOptions() },
    ];
    const filledCount = fields.filter(f => f.filled).length;
    const percent = Math.round((filledCount / fields.length) * 100);
    return { fields, filledCount, total: fields.length, percent };
  }, [avatarUrl, club, terrainId, location.latitude, location.longitude, boulesSets, selfPlayer?.boules?.name, federationCardUrl, language]);

  // Load profile data - only when NOT editing to avoid resetting form during edit
  useEffect(() => {
    if (isEditing) return; // Don't reset form values while user is editing

    const loadProfile = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data) {
          setUsername(data.username || '');
          setRole(data.role || 'Milieu');
          setLevel(data.level || 'Intermédiaire');
          setAvatarUrl(data.avatar || null);
          setConsentDate(data.consent_date || null);
          // Set club from user_profiles as initial fallback only
          if (!selfPlayer) {
            setClub(data.club || '');
          }
        }
        
        // Sync from selfPlayer when available - selfPlayer is the source of truth
        // for club, terrain, handedness, phone, email (stored in players table)
        if (selfPlayer) {
          setClub(selfPlayer.club || '');
          setClubId(selfPlayer.clubId || null);
          setTerrainId(selfPlayer.terrainId || null);
          setTerrainName(
            selfPlayer.terrainName ||
            (selfPlayer.terrainId ? terrains.find(t => t.id === selfPlayer.terrainId)?.name || '' : '')
          );
          if (selfPlayer.avatar) setAvatarUrl(selfPlayer.avatar);
          setPhone(selfPlayer.phone || '');
          setEmail(selfPlayer.email || '');
          setHandedness(selfPlayer.handedness || '');
          setExperience(selfPlayer.experience || '');
          setNickname(selfPlayer.nickname || '');
          setBoulesName(selfPlayer.boules?.name || '');
          setBoulesDiameter(selfPlayer.boules?.diameter || '');
          setBoulesWeight(selfPlayer.boules?.weight || '');
          setBoulesSerialNumber(selfPlayer.boules?.serialNumber || '');
          // Location
          if (selfPlayer.location) {
            setLocation({
              address: selfPlayer.location.address || '',
              city: selfPlayer.location.city || '',
              country: selfPlayer.country || 'France',
              latitude: selfPlayer.location.latitude || 0,
              longitude: selfPlayer.location.longitude || 0,
            });
          }
        }

      } catch (error) {
        console.log('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user?.id, selfPlayer, isEditing]);



  const handlePickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('profile', 'permissionRequired'), t('profile', 'galleryPermission'));
        return;
      }

      // Launch picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0]);
      }
    } catch (error: any) {
      console.log('Error picking image:', error);
      showAlert(t('common', 'error'), t('profile', 'errorSelectImage'));
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('profile', 'permissionRequired'), t('profile', 'cameraPermission'));
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0]);
      }
    } catch (error: any) {
      console.log('Error taking photo:', error);
      showAlert(t('common', 'error'), t('profile', 'errorTakePhoto'));
    }
  };

  const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user?.id) return;

    setUploadingPhoto(true);
    try {
      // Upload via centralized storage service
      const publicUrl = await uploadPlayerAvatar(user.id, asset.uri);

      if (!publicUrl) {
        showAlert(t('common', 'error'), t('profile', 'errorUploadPhoto'));
        return;
      }

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      if (playerRecordId) {
        await updatePlayer(playerRecordId, { avatar: publicUrl });
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('profile', 'photoUpdated'));
    } catch (error: any) {
      console.log('Error uploading avatar:', error);
      showAlert(t('common', 'error'), error.message || t('profile', 'errorUploadPhoto'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      t('profile', 'photoProfile'),
      t('profile', 'chooseOption'),
      [
        { text: t('profile', 'takePhoto'), onPress: handleTakePhoto },
        { text: t('profile', 'chooseGallery'), onPress: handlePickImage },
        ...(avatarUrl ? [{ text: t('profile', 'removePhoto'), style: 'destructive' as const, onPress: handleRemovePhoto }] : []),
        { text: t('common', 'cancel'), style: 'cancel' as const },
      ]
    );
  };

  const handleRemovePhoto = async () => {
    if (!user?.id) return;

    try {
      // Update profile
      await supabase
        .from('user_profiles')
        .update({ avatar: null })
        .eq('id', user.id);

      setAvatarUrl(null);
      if (playerRecordId) {
        await updatePlayer(playerRecordId, { avatar: undefined });
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Error removing avatar:', error);
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      showAlert(t('common', 'error'), t('profile', 'usernameRequired'));
      return;
    }

    setSaving(true);
    try {
      // Update user profile
      const { error } = await supabase
        .from('user_profiles')
        .update({
          username: username.trim(),
          role,
          level,
          club: club || null,
        })
        .eq('id', user?.id);

      if (error) throw error;

      // Also update the player record (players.id is not always auth uid)
      if (playerRecordId) {
        // Only build boulesData from manual fields if no equipment sets exist
        // When equipment sets exist, primary set is managed via the picker
        const hasEquipmentSets = boulesSets.length > 0;
        const boulesData = !hasEquipmentSets && (boulesName.trim() || boulesDiameter.trim() || boulesWeight.trim() || boulesSerialNumber.trim())
          ? { name: boulesName.trim(), diameter: boulesDiameter.trim(), weight: boulesWeight.trim(), serialNumber: boulesSerialNumber.trim() || undefined }
          : hasEquipmentSets
            ? undefined // Let the equipment picker manage boules data
            : undefined;

        const playerUpdates: Record<string, any> = {
          name: username.trim(),
          nickname: nickname.trim() || null,
          role,
          level,
          club: club || null,
          clubId: clubId || null,
          terrainId: terrainId || null,
          terrainName: terrainName || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          handedness: handedness || null,
          experience: experience || null,
          country: location.country || 'France',
        };

        if (boulesData) {
          playerUpdates.boules = boulesData;
        }

        if (location.city) {
          playerUpdates.location = {
            city: location.city,
            latitude: location.latitude,
            longitude: location.longitude,
          };
        }

        await updatePlayer(playerRecordId, playerUpdates);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('profile', 'profileUpdated'));
      setIsEditing(false);
      // Refresh app data so home screen picks up the new name
      refreshData();
    } catch (error: any) {
      showAlert(t('common', 'error'), error.message || t('profile', 'errorUpdateProfile'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectClub = (selectedClub: Club) => {
    Haptics.selectionAsync();
    setClub(selectedClub.name);
    setClubId(selectedClub.id);
    setShowClubPicker(false);
    setClubSearch('');
  };

  const handleCreateClub = async () => {
    if (!newClubName.trim() || !newClubCity.trim()) {
      showAlert(t('common', 'error'), t('profile', 'nameAndCityRequired'));
      return;
    }

    try {
      const newClub: Omit<Club, 'id'> = {
        name: newClubName.trim(),
        city: newClubCity.trim(),
        location: { latitude: 0, longitude: 0 },
        membersCount: 1,
      };
      await addClub(newClub);
      
      setClub(newClubName.trim());
      setShowCreateClub(false);
      setShowClubPicker(false);
      setNewClubName('');
      setNewClubCity('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      showAlert(t('common', 'error'), error.message || t('profile', 'errorCreateClub'));
    }
  };

  const handleRemoveClub = () => {
    Haptics.selectionAsync();
    setClub('');
    setClubId(null);
  };

  // Federation card upload
  const uploadFederationFile = async (fileUri: string, fileName: string, mimeType: string) => {
    if (!user?.id) return;
    setUploadingCard(true);
    try {
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${user.id}/federation_card_${Date.now()}.${fileExt}`;

      let base64Data: string;
      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system');
        base64Data = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const { error: uploadError } = await supabase.storage
        .from('federation-cards')
        .upload(storagePath, decode(base64Data), {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('federation-cards')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ federation_card_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setFederationCardUrl(publicUrl);
      setFederationCardType(fileExt === 'pdf' ? 'pdf' : 'image');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('player', 'federationCardUpdated'));
    } catch (error: any) {
      console.log('Error uploading federation card:', error);
      showAlert(t('common', 'error'), error.message || t('player', 'errorUploadFederationCard'));
    } finally {
      setUploadingCard(false);
    }
  };

  const handlePickFedFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('profile', 'permissionRequired'), t('profile', 'galleryPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      await uploadFederationFile(asset.uri, `federation.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    }
  };

  const handlePickFedFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('profile', 'permissionRequired'), t('profile', 'cameraPermission'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      await uploadFederationFile(asset.uri, `federation.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    }
  };

  const handlePickFedDocument = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        await uploadFederationFile(file.uri, file.name || 'federation.pdf', file.mimeType || 'application/pdf');
      }
    } catch (error: any) {
      console.log('Error picking document:', error);
    }
  };

  const showFederationUploadOptions = () => {
    Alert.alert(
      t('player', 'chooseSource'),
      t('player', 'federationCardDesc'),
      [
        { text: t('player', 'fromCamera'), onPress: handlePickFedFromCamera },
        { text: t('player', 'fromGallery'), onPress: handlePickFedFromGallery },
        { text: t('player', 'fromFiles'), onPress: handlePickFedDocument },
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  };

  const handleRemoveFederationCard = () => {
    Alert.alert(
      t('player', 'removeFederationCard'),
      '',
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              await supabase
                .from('user_profiles')
                .update({ federation_card_url: null })
                .eq('id', user.id);
              setFederationCardUrl(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(t('common', 'success'), t('player', 'federationCardRemoved'));
            } catch (error: any) {
              showAlert(t('common', 'error'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleFedCardPress = () => {
    if (!federationCardUrl) return;
    if (federationCardType === 'pdf') {
      Linking.openURL(federationCardUrl);
    } else {
      setShowFullscreen(true);
    }
  };

  const handleSelectTerrain = (selectedTerrain: Terrain) => {
    Haptics.selectionAsync();
    setTerrainId(selectedTerrain.id);
    setTerrainName(selectedTerrain.name);
    setShowTerrainPicker(false);
    setTerrainSearch('');
  };

  const handleRemoveTerrain = () => {
    Haptics.selectionAsync();
    setTerrainId(null);
    setTerrainName('');
  };

  const handleSendDeleteOtp = async () => {
    const confirmWord = t('profile', 'deleteConfirmWord');
    if (deleteConfirmText.trim().toUpperCase() !== confirmWord) return;
    if (!user?.email) {
      showAlert(t('common', 'error'), 'Email not found');
      return;
    }
    setSendingOtp(true);
    try {
      const { error } = await sendOTP(user.email.trim().toLowerCase());
      if (error) {
        showAlert(t('common', 'error'), error);
        return;
      }
      setDeleteStep('otp');
    } catch (e: any) {
      showAlert(t('common', 'error'), e.message || 'Unknown error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!isCompleteEmailOtp(otpCode)) return;

    setDeletingAccount(true);
    try {
      const email = (user?.email || '').trim().toLowerCase();
      const token = normalizeEmailOtpInput(otpCode);
      let otpError: { message: string } | null = null;
      for (const type of ['email', 'signup'] as const) {
        const { error } = await supabase.auth.verifyOtp({ email, token, type });
        if (!error) {
          otpError = null;
          break;
        }
        otpError = error;
        if (type === 'email' && /invalid|expired|otp/i.test(error.message)) continue;
        break;
      }
      if (otpError) {
        showAlert(t('profile', 'deleteAccountOtpError'), otpError.message);
        setDeletingAccount(false);
        return;
      }

      // OTP verified, proceed with deletion
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const textContent = await error.context?.text();
            const parsed = textContent ? JSON.parse(textContent) : null;
            errorMessage = parsed?.error || textContent || error.message;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        showAlert(t('profile', 'deleteAccountError'), errorMessage);
        setDeletingAccount(false);
        return;
      }

      // Account deleted successfully - close modal and logout
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      showAlert(t('profile', 'deleteAccountSuccess'), t('profile', 'deleteAccountSuccessMsg'));
      // Small delay so the user sees the success message
      setTimeout(async () => {
        await logout();
      }, 1500);
    } catch (e: any) {
      showAlert(t('profile', 'deleteAccountError'), e.message || 'Unknown error');
      setDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t('profile', 'logoutConfirm'),
      t('profile', 'logoutMessage'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('profile', 'logoutConfirm'),
          style: 'destructive',
          onPress: async () => {
            await deactivatePushToken();
            const { error } = await logout();
            if (error) {
              showAlert(t('common', 'error'), error);
            } else {
              router.replace('/');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/(tabs)' as any)}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile', 'myProfile')}</Text>
        {isEditing ? (
          <View style={styles.headerActions}>
            <Pressable 
              style={styles.cancelButton}
              onPress={() => setIsEditing(false)}
            >
              <Text style={styles.cancelButtonText}>{t('common', 'cancel')}</Text>
            </Pressable>
            <Pressable 
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t('common', 'save')}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable 
            style={styles.editButton}
            onPress={() => setIsEditing(true)}
          >
            <MaterialIcons name="edit" size={20} color={theme.primary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Hero Section */}
        <View style={styles.heroSection}>
          {/* Avatar with photo picker */}
          <Pressable 
            testID="profile-avatar"
            style={styles.avatarContainer}
            onPress={showPhotoOptions}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {username ? username.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <MaterialIcons name="camera-alt" size={16} color="#FFF" />
            </View>
          </Pressable>

          {/* Name and Role */}
          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName}>{username || t('share', 'userFallback')}</Text>
              {isPremium ? (
                <View style={styles.premiumBadge}>
                  <MaterialIcons name="star" size={12} color="#C0C0C0" />
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              ) : null}
            </View>
            {selfPlayer?.nickname ? (
              <Text style={styles.heroNickname}>"{selfPlayer.nickname}"</Text>
            ) : null}
            <View style={styles.heroMeta}>
              <View style={styles.heroBadge}>
                <MaterialIcons 
                  name={roles.find(r => r.id === role)?.icon as any || 'person'} 
                  size={14} 
                  color={theme.primary} 
                />
                <Text style={styles.heroBadgeText}>{t('roles', role)}</Text>
              </View>

              {handedness ? (
                <View style={styles.heroBadge}>
                  <MaterialIcons name={handedness === 'left' ? 'front-hand' : handedness === 'ambidextrous' ? 'swap-horiz' : 'back-hand'} size={14} color="#6366F1" />
                  <Text style={[styles.heroBadgeText, { color: '#6366F1' }]}>
                    {handedness === 'right' ? t('player', 'rightHanded') : handedness === 'left' ? t('player', 'leftHanded') : t('player', 'ambidextrous')}
                  </Text>
                </View>
              ) : null}

              {selfPlayer?.experience ? (
                <View style={styles.heroBadge}>
                  <MaterialIcons name="timeline" size={14} color="#9333EA" />
                  <Text style={[styles.heroBadgeText, { color: '#9333EA' }]}>
                    {t('player', selfPlayer.experience === 'less_than_1' ? 'experienceLessThan1' : selfPlayer.experience === '1_to_3' ? 'experience1to3' : selfPlayer.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}
                  </Text>
                </View>
              ) : null}
            </View>
            {selfPlayer?.eloRating ? (() => {
              const eloR = getEloRank(selfPlayer.eloRating);
              return (
                <View style={[styles.heroBadge, { backgroundColor: eloR.color + '15', marginTop: 4 }]}>
                  <MaterialIcons name={eloR.icon as any} size={14} color={eloR.color} />
                  <Text style={[styles.heroBadgeText, { color: eloR.color }]}>
                    ELO {selfPlayer.eloRating} - {eloR.label[language === 'fr' ? 'fr' : 'en']}
                  </Text>
                </View>
              );
            })() : null}
            {club && (
              <View style={styles.heroClub}>
                <MaterialIcons name="location-city" size={14} color={theme.textSecondary} />
                <Text style={styles.heroClubText}>{club}</Text>
              </View>
            )}
          </View>

          {/* Boules summary in view mode - linked to primary set */}
          {!isEditing && (() => {
            const primarySet = boulesSets.find(bs => bs.isPrimary);
            const boulesSource = primarySet || (selfPlayer?.boules && (selfPlayer.boules.name || selfPlayer.boules.diameter || selfPlayer.boules.weight) ? selfPlayer.boules : null);
            if (!boulesSource) return null;
            const label = primarySet
              ? [primarySet.name, primarySet.brand, primarySet.diameter ? `${primarySet.diameter} mm` : '', primarySet.weight ? `${primarySet.weight} g` : ''].filter(Boolean).join(' • ')
              : [selfPlayer?.boules?.name, selfPlayer?.boules?.diameter ? `${selfPlayer.boules.diameter} mm` : '', selfPlayer?.boules?.weight ? `${selfPlayer.boules.weight} g` : ''].filter(Boolean).join(' • ');
            return (
              <Pressable style={styles.heroBoulesRow} onPress={() => router.push('/equipment')}>
                <MaterialIcons name="sports-baseball" size={16} color={theme.accent} />
                <Text style={styles.heroBoulesText} numberOfLines={1}>{label}</Text>
                {primarySet ? <View style={styles.heroBoulesPrimaryBadge}><MaterialIcons name="star" size={10} color="#FFF" /></View> : null}
                <MaterialIcons name="chevron-right" size={16} color={theme.accent} />
              </Pressable>
            );
          })()}

          {/* Geo Ranking Badges */}
          {geoRank && (geoRank.city || geoRank.country || geoRank.continent) ? (
            <Pressable style={styles.geoRankRow} onPress={() => router.push('/leaderboard-geo' as any)}>
              <View style={styles.geoRankHeader}>
                <MaterialIcons name="public" size={14} color="#3B82F6" />
                <Text style={styles.geoRankTitle}>{language === 'fr' ? 'Classement Geo' : 'Geo Ranking'}</Text>
                <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
              </View>
              <View style={styles.geoRankBadges}>
                {geoRank.continent ? (
                  <View style={[styles.geoRankBadge, { borderColor: '#F59E0B25' }]}>
                    <Text style={{ fontSize: 12 }}>{getContinentFlag(geoRank.continent.name)}</Text>
                    <Text style={[styles.geoRankBadgeRank, { color: geoRank.continent.rank <= 3 ? '#F59E0B' : theme.textSecondary }]}>#{geoRank.continent.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{geoRank.continent.total}</Text>
                  </View>
                ) : null}
                {geoRank.country ? (
                  <View style={[styles.geoRankBadge, { borderColor: '#10B98125' }]}>
                    <Text style={{ fontSize: 12 }}>{getCountryFlag(geoRank.country.name)}</Text>
                    <Text style={[styles.geoRankBadgeRank, { color: geoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }]}>#{geoRank.country.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{geoRank.country.total}</Text>
                  </View>
                ) : null}
                {geoRank.city ? (
                  <View style={[styles.geoRankBadge, { borderColor: '#3B82F625' }]}>
                    <MaterialIcons name="location-city" size={12} color="#3B82F6" />
                    <Text style={[styles.geoRankBadgeRank, { color: geoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }]}>#{geoRank.city.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{geoRank.city.total}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : null}

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{matches.length}</Text>
              <Text style={styles.quickStatLabel}>{t('profile', 'matches')}</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <Text style={[styles.quickStatValue, { color: theme.success }]}>
                {userStats.winRate}%
              </Text>
              <Text style={styles.quickStatLabel}>{t('profile', 'victories')}</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{challenges.length}</Text>
              <Text style={styles.quickStatLabel}>{t('profile', 'challenges')}</Text>
            </View>
          </View>

          {/* Profile Completeness */}
          {!isEditing && profileCompleteness.percent < 100 ? (
            <View style={styles.completenessContainer}>
              <View style={styles.completenessHeader}>
                <View style={styles.completenessLabelRow}>
                  <MaterialIcons name="verified-user" size={14} color={profileCompleteness.percent >= 80 ? theme.success : profileCompleteness.percent >= 50 ? theme.accent : theme.primary} />
                  <Text style={styles.completenessLabel}>
                    {language === 'fr' ? 'Profil' : 'Profile'}
                  </Text>
                </View>
                <Text style={[
                  styles.completenessPercent,
                  { color: profileCompleteness.percent >= 80 ? theme.success : profileCompleteness.percent >= 50 ? theme.accent : theme.primary }
                ]}>
                  {profileCompleteness.percent}%
                </Text>
              </View>
              <View style={styles.completenessBarBg}>
                <View style={[
                  styles.completenessBarFill,
                  {
                    width: `${Math.max(4, profileCompleteness.percent)}%`,
                    backgroundColor: profileCompleteness.percent >= 80 ? theme.success : profileCompleteness.percent >= 50 ? theme.accent : theme.primary,
                  },
                ]} />
              </View>
              <View style={styles.completenessDotsRow}>
                {profileCompleteness.fields.map(f => (
                  <Pressable
                    key={f.id}
                    style={[styles.completenessDot, f.filled && styles.completenessDotFilled, f.filled && { backgroundColor: f.color + '15', borderColor: f.color + '40' }]}
                    onPress={f.filled ? undefined : f.action}
                  >
                    <MaterialIcons name={f.icon as any} size={13} color={f.filled ? f.color : theme.textMuted} />
                  </Pressable>
                ))}
              </View>
              {/* First missing field tip */}
              {(() => {
                const missing = profileCompleteness.fields.find(f => !f.filled);
                if (!missing) return null;
                return (
                  <Pressable style={styles.completenessTip} onPress={missing.action}>
                    <View style={[styles.completenessTipIcon, { backgroundColor: missing.color + '12' }]}>
                      <MaterialIcons name={missing.icon as any} size={14} color={missing.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.completenessTipText} numberOfLines={1}>{missing.tip}</Text>
                    </View>
                    <MaterialIcons name="add-circle-outline" size={16} color={missing.color} />
                  </Pressable>
                );
              })()}
            </View>
          ) : null}
        </View>

        {/* Progression Section: XP + Streak + Badges (compact unified card) */}
        {!isEditing && (
          <View style={{ marginBottom: 20 }}>
            <View style={progStyles.card}>
              {/* XP Bar inline */}
              <XPBar xp={userXp} language={language} />

              {/* Streak + Badges side-by-side */}
              {(() => {
                const allDates = [...matches.map(m => m.date), ...challenges.map(c => c.date)];
                const streakData = computeStreakFromDates(allDates);
                const streakStatus = getStreakStatus(streakData, language as 'fr' | 'en');
                const et = extraTranslations.streak;
                const progressPercent = Math.min(100, Math.round((streakData.currentStreak / 7) * 100));
                return (
                  <>
                    <View style={progStyles.divider} />
                    <View style={progStyles.streakBadgeRow}>
                      {/* Streak compact */}
                      <View style={progStyles.streakCol}>
                        <View style={progStyles.streakHeader}>
                          <MaterialIcons name="local-fire-department" size={18} color={streakData.currentStreak > 0 ? '#F97316' : theme.textMuted} />
                          <Text style={progStyles.streakLabel}>{(et.streakTitle as any)?.[language] || 'Streak'}</Text>
                          {streakData.currentStreak >= 7 ? (
                            <View style={progStyles.fireTag}>
                              <MaterialIcons name="local-fire-department" size={9} color="#FFF" />
                            </View>
                          ) : null}
                        </View>
                        <View style={progStyles.streakNumbers}>
                          <View style={progStyles.streakNumItem}>
                            <Text style={[progStyles.streakNumValue, { color: streakData.currentStreak > 0 ? '#F97316' : theme.textMuted }]}>{streakData.currentStreak}</Text>
                            <Text style={progStyles.streakNumLabel}>{language === 'fr' ? 'actuel' : 'current'}</Text>
                          </View>
                          <View style={progStyles.streakNumDivider} />
                          <View style={progStyles.streakNumItem}>
                            <Text style={[progStyles.streakNumValue, { color: '#D97706' }]}>{streakData.bestStreak}</Text>
                            <Text style={progStyles.streakNumLabel}>{language === 'fr' ? 'record' : 'best'}</Text>
                          </View>
                        </View>
                        {/* Compact 7-day dots */}
                        {streakData.currentStreak < 7 ? (
                          <View style={progStyles.dotsRow}>
                            {[1, 2, 3, 4, 5, 6, 7].map(day => (
                              <View key={day} style={[progStyles.dot, day <= streakData.currentStreak && progStyles.dotActive]}>
                                {day <= streakData.currentStreak ? <MaterialIcons name="check" size={7} color="#FFF" /> : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {streakStatus.status === 'at_risk' && streakData.currentStreak > 0 ? (
                          <Pressable style={progStyles.atRiskRow} onPress={() => router.push('/match/new')}>
                            <MaterialIcons name="warning" size={11} color="#EF4444" />
                            <Text style={progStyles.atRiskText}>{language === 'fr' ? 'Jouez aujourd\'hui !' : 'Play today!'}</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      <View style={progStyles.vertDivider} />

                      {/* Badges compact */}
                      <View style={progStyles.badgeCol}>
                        <Pressable style={progStyles.badgeHeader} onPress={() => router.push('/badges' as any)}>
                          <MaterialIcons name="military-tech" size={18} color={theme.carreauColor} />
                          <Text style={progStyles.badgeLabel}>Badges</Text>
                          <View style={progStyles.badgeCountPill}>
                            <Text style={progStyles.badgeCountText}>{userBadges.length}/{totalBadges}</Text>
                          </View>
                        </Pressable>

                        {userBadges.length > 0 ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 2 }}>
                            {[...userBadges].sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime()).slice(0, 4).map((ub, idx) => {
                              const badge = BADGES.find(b => b.id === ub.badgeId);
                              if (!badge) return null;
                              return (
                                <Pressable key={badge.id} style={[progStyles.badgeChip, idx === 0 && { borderColor: badge.color + '40' }]} onPress={() => router.push('/badges' as any)}>
                                  <View style={[progStyles.badgeChipIcon, { backgroundColor: badge.color + '20' }]}>
                                    <MaterialIcons name={badge.icon as any} size={16} color={badge.color} />
                                  </View>
                                  <Text style={[progStyles.badgeChipName, idx === 0 && { color: badge.color }]} numberOfLines={1}>{getBadgeName(badge.id, language)}</Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        ) : (
                          <View style={progStyles.noBadges}>
                            <MaterialIcons name="lock-outline" size={18} color={theme.textMuted} />
                            <Text style={progStyles.noBadgesText}>{language === 'fr' ? 'Jouez pour debloquer' : 'Play to unlock'}</Text>
                          </View>
                        )}

                        {/* Locked preview dots */}
                        <View style={progStyles.lockedDotsRow}>
                          {BADGES.filter(b => !userBadges.find(ub => ub.badgeId === b.id)).slice(0, 4).map(badge => (
                            <View key={badge.id} style={progStyles.lockedDot}>
                              <MaterialIcons name={badge.icon as any} size={10} color={theme.textMuted + '40'} />
                            </View>
                          ))}
                          {BADGES.filter(b => !userBadges.find(ub => ub.badgeId === b.id)).length > 4 ? (
                            <Text style={progStyles.lockedMore}>+{BADGES.filter(b => !userBadges.find(ub => ub.badgeId === b.id)).length - 4}</Text>
                          ) : null}
                          <Pressable style={progStyles.viewAllBtn} onPress={() => router.push('/badges' as any)}>
                            <Text style={progStyles.viewAllText}>{language === 'fr' ? 'Tout' : 'All'}</Text>
                            <MaterialIcons name="chevron-right" size={12} color={theme.primary} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* Edit Mode Fields */}
        {isEditing && (
          <View style={styles.editSection}>
            <Text style={styles.sectionTitle}>{t('profile', 'editProfile')}</Text>
            
            {/* Username */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="person" size={18} color={theme.primary} />
                <Text style={styles.fieldLabel}>{t('profile', 'username')}</Text>
              </View>
              <TextInput
                style={styles.fieldInput}
                value={username}
                onChangeText={setUsername}
                placeholder={t('profile', 'usernamePlaceholder')}
                placeholderTextColor={theme.textMuted}
              />
            </View>

            {/* Nickname */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="format-quote" size={18} color={theme.carreauColor} />
                <Text style={styles.fieldLabel}>{t('player', 'nicknameLabel')}</Text>
              </View>
              <TextInput
                style={styles.fieldInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder={t('player', 'nicknamePlaceholder')}
                placeholderTextColor={theme.textMuted}
              />
            </View>

            {/* Role & Level Row */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="sports" size={18} color={theme.accent} />
                <Text style={styles.fieldLabel}>{t('profile', 'preferredRole')}</Text>
              </View>
              <View style={styles.optionGrid}>
                {roles.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.optionCard, role === r.id && styles.optionCardActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRole(r.id);
                    }}
                  >
                    <MaterialIcons 
                      name={r.icon as any} 
                      size={24} 
                      color={role === r.id ? theme.primary : theme.textSecondary} 
                    />
                    <Text style={[styles.optionText, role === r.id && styles.optionTextActive]}>
                      {t('roles', r.id)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Handedness Selection */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="back-hand" size={18} color="#6366F1" />
                <Text style={styles.fieldLabel}>{t('player', 'handedness')}</Text>
              </View>
              <View style={styles.optionGrid}>
                {([{ id: 'right', icon: 'back-hand', label: t('player', 'rightHanded') }, { id: 'left', icon: 'front-hand', label: t('player', 'leftHanded') }, { id: 'ambidextrous', icon: 'swap-horiz', label: t('player', 'ambidextrous') }] as const).map((h) => (
                  <Pressable
                    key={h.id}
                    style={[styles.optionCard, handedness === h.id && { borderColor: '#6366F1', backgroundColor: '#6366F1' + '10' }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setHandedness(handedness === h.id ? '' : h.id);
                    }}
                  >
                    <MaterialIcons 
                      name={h.icon as any} 
                      size={24} 
                      color={handedness === h.id ? '#6366F1' : theme.textSecondary} 
                    />
                    <Text style={[styles.optionText, handedness === h.id && { color: '#6366F1' }]}>
                      {h.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Experience */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="timeline" size={18} color="#9333EA" />
                <Text style={styles.fieldLabel}>{t('player', 'experienceLabel')}</Text>
              </View>
              <View style={styles.optionGrid}>
                {([{ id: 'less_than_1' as const, icon: 'child-care', label: t('player', 'experienceLessThan1') }, { id: '1_to_3' as const, icon: 'school', label: t('player', 'experience1to3') }, { id: '3_to_10' as const, icon: 'trending-up', label: t('player', 'experience3to10') }, { id: 'more_than_10' as const, icon: 'emoji-events', label: t('player', 'experienceMoreThan10') }]).map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.optionCard, experience === e.id && { borderColor: '#9333EA', backgroundColor: '#9333EA' + '10' }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setExperience(experience === e.id ? '' : e.id);
                    }}
                  >
                    <MaterialIcons
                      name={e.icon as any}
                      size={24}
                      color={experience === e.id ? '#9333EA' : theme.textSecondary}
                    />
                    <Text style={[styles.optionText, { fontSize: 11 }, experience === e.id && { color: '#9333EA' }]}>
                      {e.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Club Selection */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="location-city" size={18} color={theme.success} />
                <Text style={styles.fieldLabel}>Club</Text>
              </View>
              {club ? (
                <View style={styles.selectedClubContainer}>
                  <View style={styles.selectedClubInfo}>
                    <View style={styles.selectedClubIcon}>
                      <MaterialIcons name="home" size={20} color={theme.success} />
                    </View>
                    <Text style={styles.selectedClubName}>{club}</Text>
                  </View>
                  <View style={styles.selectedClubActions}>
                    <Pressable 
                      style={styles.changeClubBtn}
                      onPress={() => setShowClubPicker(true)}
                    >
                      <MaterialIcons name="swap-horiz" size={18} color={theme.primary} />
                    </Pressable>
                    <Pressable 
                      style={styles.removeClubBtn}
                      onPress={handleRemoveClub}
                    >
                      <MaterialIcons name="close" size={18} color={theme.error} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.selectClubButton}
                  onPress={() => setShowClubPicker(true)}
                >
                  <MaterialIcons name="add-circle-outline" size={22} color={theme.primary} />
                  <Text style={styles.selectClubButtonText}>{t('profile', 'selectClub')}</Text>
                </Pressable>
              )}
            </View>

            {/* Boules / Equipment - pick from registered sets */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="sports-baseball" size={18} color={theme.accent} />
                <Text style={styles.fieldLabel}>{t('player', 'boulesLabel')}</Text>
              </View>
              {boulesSets.length > 0 ? (
                <View style={styles.boulesSetPickerList}>
                  {boulesSets.map(bs => {
                    const isSelected = bs.isPrimary;
                    return (
                      <Pressable
                        key={bs.id}
                        style={[styles.boulesSetPickerItem, isSelected && styles.boulesSetPickerItemActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setPrimaryBoulesSet(bs.id);
                          setBoulesName(bs.name || '');
                          setBoulesDiameter(bs.diameter ? String(bs.diameter) : '');
                          setBoulesWeight(bs.weight ? String(bs.weight) : '');
                          setBoulesSerialNumber(bs.serialNumber || '');
                        }}
                      >
                        <View style={[styles.boulesSetPickerIcon, isSelected && styles.boulesSetPickerIconActive]}>
                          <MaterialIcons name="sports-baseball" size={20} color={isSelected ? '#FFF' : theme.textSecondary} />
                        </View>
                        <View style={styles.boulesSetPickerInfo}>
                          <Text style={[styles.boulesSetPickerName, isSelected && styles.boulesSetPickerNameActive]}>{bs.name}</Text>
                          <Text style={styles.boulesSetPickerMeta}>
                            {[bs.brand, bs.diameter ? `${bs.diameter}mm` : '', bs.weight ? `${bs.weight}g` : ''].filter(Boolean).join(' • ')}
                          </Text>
                        </View>
                        {isSelected ? (
                          <View style={styles.boulesSetPickerCheck}>
                            <MaterialIcons name="star" size={14} color="#FFF" />
                          </View>
                        ) : (
                          <MaterialIcons name="radio-button-unchecked" size={22} color={theme.border} />
                        )}
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={styles.boulesSetPickerAddBtn}
                    onPress={() => router.push('/equipment')}
                  >
                    <MaterialIcons name="add-circle-outline" size={20} color={theme.accent} />
                    <Text style={styles.boulesSetPickerAddText}>{t('equipment', 'manageSets')}</Text>
                    <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.selectClubButton, { borderColor: theme.accent + '30' }]}
                  onPress={() => router.push('/equipment')}
                >
                  <MaterialIcons name="add-circle-outline" size={22} color={theme.accent} />
                  <Text style={[styles.selectClubButtonText, { color: theme.accent }]}>
                    {t('equipment', 'addBoulesSetFull')}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Terrain Selection */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="sports-soccer" size={18} color={theme.carreauColor} />
                <Text style={styles.fieldLabel}>{t('profile', 'terrain')}</Text>
              </View>
              {terrainName ? (
                <View style={styles.selectedClubContainer}>
                  <View style={styles.selectedClubInfo}>
                    <View style={[styles.selectedClubIcon, { backgroundColor: theme.carreauColor + '20' }]}>
                      <MaterialIcons name="sports-soccer" size={20} color={theme.carreauColor} />
                    </View>
                    <Text style={styles.selectedClubName}>{terrainName}</Text>
                  </View>
                  <View style={styles.selectedClubActions}>
                    <Pressable 
                      style={styles.changeClubBtn}
                      onPress={() => setShowTerrainPicker(true)}
                    >
                      <MaterialIcons name="swap-horiz" size={18} color={theme.primary} />
                    </Pressable>
                    <Pressable 
                      style={styles.removeClubBtn}
                      onPress={handleRemoveTerrain}
                    >
                      <MaterialIcons name="close" size={18} color={theme.error} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={[styles.selectClubButton, { borderColor: theme.carreauColor + '30' }]}
                  onPress={() => setShowTerrainPicker(true)}
                >
                  <MaterialIcons name="add-circle-outline" size={22} color={theme.carreauColor} />
                  <Text style={[styles.selectClubButtonText, { color: theme.carreauColor }]}>{t('profile', 'selectTerrain')}</Text>
                </Pressable>
              )}
            </View>

            {/* Contact Info */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="contact-phone" size={18} color={theme.warning} />
                <Text style={styles.fieldLabel}>{t('profile', 'contact')}</Text>
              </View>
              <View style={styles.contactFieldContainer}>
                <View style={styles.contactFieldRow}>
                  <MaterialIcons name="phone" size={20} color={theme.textSecondary} />
                  <TextInput
                    style={styles.contactFieldInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder={t('profile', 'phone')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.contactFieldDivider} />
                <View style={styles.contactFieldRow}>
                  <MaterialIcons name="email" size={20} color={theme.textSecondary} />
                  <TextInput
                    style={styles.contactFieldInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('profile', 'emailAddress')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Location */}
            <View style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <MaterialIcons name="place" size={18} color={theme.success} />
                <Text style={styles.fieldLabel}>{t('profile', 'locationLabel')}</Text>
              </View>
              <LocationPicker
                label=""
                value={location}
                onChange={setLocation}
                placeholder={t('profile', 'locationPlaceholder')}
                showCityOnly
              />
            </View>

            {/* Auto-fill location suggestion */}
            {(() => {
              const locationEmpty = !location.latitude && !location.longitude;
              if (!locationEmpty) return null;
              const suggestions: { label: string; icon: string; color: string; city: string; lat: number; lng: number; address?: string; country?: string }[] = [];
              if (terrainId) {
                const tr = terrains.find(te => te.id === terrainId);
                if (tr && tr.location && (tr.location.latitude || tr.location.longitude)) {
                  suggestions.push({ label: t('profile', 'useTerrainLocation'), icon: 'sports-soccer', color: theme.success, city: tr.city, lat: tr.location.latitude, lng: tr.location.longitude, address: tr.address });
                }
              }
              if (clubId) {
                const cl = clubs.find(c => c.id === clubId);
                if (cl && cl.location && (cl.location.latitude || cl.location.longitude)) {
                  suggestions.push({ label: t('profile', 'useClubLocation'), icon: 'home', color: theme.accent, city: cl.city, lat: cl.location.latitude, lng: cl.location.longitude, address: cl.address });
                }
              }
              if (suggestions.length === 0) return null;
              return suggestions.map((sug, idx) => (
                <Pressable
                  key={idx}
                  style={styles.autoFillLocationBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setLocation({
                      address: sug.address || '',
                      city: sug.city || '',
                      country: sug.country || 'France',
                      latitude: sug.lat,
                      longitude: sug.lng,
                    });
                  }}
                >
                  <View style={[styles.autoFillLocationIcon, { backgroundColor: sug.color + '15' }]}>
                    <MaterialIcons name={sug.icon as any} size={16} color={sug.color} />
                  </View>
                  <Text style={styles.autoFillLocationText} numberOfLines={1}>{sug.label}</Text>
                  <View style={styles.autoFillLocationArrow}>
                    <MaterialIcons name="my-location" size={16} color={theme.primary} />
                  </View>
                </Pressable>
              ));
            })()}
          </View>
        )}

        {!isEditing && (
          <View style={styles.section}>
            <Pressable 
              style={styles.playerCardLink}
              onPress={() => router.push('/player/me')}
            >
              <View style={styles.playerCardLinkIcon}>
                <MaterialIcons name="badge" size={24} color={theme.primary} />
              </View>
              <View style={styles.playerCardLinkInfo}>
                <Text style={styles.playerCardLinkTitle}>{t('profile', 'myPlayerCard')}</Text>
                <Text style={styles.playerCardLinkSubtitle}>{t('profile', 'viewDetailedStats')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>

            <Pressable 
              style={[styles.playerCardLink, { marginTop: 10 }]}
              onPress={() => router.push('/equipment')}
            >
              <View style={[styles.playerCardLinkIcon, { backgroundColor: theme.accent + '15' }]}>
                <MaterialIcons name="sports-baseball" size={24} color={theme.accent} />
              </View>
              <View style={styles.playerCardLinkInfo}>
                <Text style={styles.playerCardLinkTitle}>{t('equipment', 'title')}</Text>
                <Text style={styles.playerCardLinkSubtitle}>{t('equipment', 'manageBoulesSets')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>

            <Pressable 
              style={[styles.playerCardLink, { marginTop: 10 }]}
              onPress={() => router.push('/palmares')}
            >
              <View style={[styles.playerCardLinkIcon, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="emoji-events" size={24} color={theme.carreauColor} />
              </View>
              <View style={styles.playerCardLinkInfo}>
                <Text style={styles.playerCardLinkTitle}>{t('profile', 'myPalmares')}</Text>
                <Text style={styles.playerCardLinkSubtitle}>{t('profile', 'tournamentsResultsGains')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>

            <Pressable 
              style={[styles.playerCardLink, { marginTop: 10 }]}
              onPress={() => { Haptics.selectionAsync(); router.push('/trust-score' as any); }}
            >
              <View style={[styles.playerCardLinkIcon, { backgroundColor: '#3B82F6' + '15' }]}>
                <MaterialIcons name="verified-user" size={24} color="#3B82F6" />
              </View>
              <View style={styles.playerCardLinkInfo}>
                <Text style={styles.playerCardLinkTitle}>{(extraTranslations.trustScore?.viewTrustScore as any)?.[language] || 'View my trust score'}</Text>
                <Text style={styles.playerCardLinkSubtitle}>{language === 'fr' ? 'Fiabilite et anti-triche' : 'Reliability and anti-cheat'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>


          </View>
        )}

        {/* Federation Card Section */}
        {!isEditing && !loading && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('player', 'federationCard').toUpperCase()}</Text>
            {uploadingCard ? (
              <View style={styles.fedUploadingCard}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={styles.fedUploadingText}>{t('player', 'uploadingCard')}</Text>
              </View>
            ) : federationCardUrl ? (
              <View style={styles.fedCardContainer}>
                <Pressable style={styles.fedCardPreview} onPress={handleFedCardPress}>
                  {federationCardType === 'image' ? (
                    <Image
                      source={{ uri: federationCardUrl }}
                      style={styles.fedCardImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={styles.fedPdfPreview}>
                      <MaterialIcons name="picture-as-pdf" size={48} color={theme.error} />
                      <Text style={styles.fedPdfText}>{t('player', 'pdfDocument')}</Text>
                      <Text style={styles.fedPdfSubtext}>{t('player', 'tapToView')}</Text>
                    </View>
                  )}
                  <View style={styles.fedCardOverlay}>
                    <View style={styles.fedCardOverlayBadge}>
                      <MaterialIcons name={federationCardType === 'pdf' ? 'open-in-new' : 'fullscreen'} size={16} color="#FFF" />
                      <Text style={styles.fedCardOverlayText}>{t('player', 'viewFullscreen')}</Text>
                    </View>
                  </View>
                </Pressable>
                <View style={styles.fedCardActions}>
                  <Pressable style={styles.fedReplaceBtn} onPress={showFederationUploadOptions}>
                    <MaterialIcons name="refresh" size={18} color={theme.primary} />
                    <Text style={styles.fedReplaceBtnText}>{t('player', 'replaceFederationCard')}</Text>
                  </Pressable>
                  <Pressable style={styles.fedRemoveBtn} onPress={handleRemoveFederationCard}>
                    <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.fedAddCard} onPress={showFederationUploadOptions}>
                <View style={styles.fedAddIcon}>
                  <MaterialIcons name="badge" size={32} color={theme.primary} />
                </View>
                <Text style={styles.fedAddTitle}>{t('player', 'addFederationCard')}</Text>
                <Text style={styles.fedAddDesc}>{t('player', 'federationCardDesc')}</Text>
                <View style={styles.fedAddFormats}>
                  <View style={styles.fedFormatChip}>
                    <MaterialIcons name="image" size={14} color={theme.textSecondary} />
                    <Text style={styles.fedFormatText}>JPG / PNG</Text>
                  </View>
                  <View style={styles.fedFormatChip}>
                    <MaterialIcons name="picture-as-pdf" size={14} color={theme.textSecondary} />
                    <Text style={styles.fedFormatText}>PDF</Text>
                  </View>
                </View>
              </Pressable>
            )}
          </View>
        )}

        {/* Ad Banner */}
        {!isEditing ? <AdBanner position="inline" /> : null}

        {/* Account Section */}
        {!isEditing && (
          <View style={styles.section}>
            {/* ===== SECTION: COMPTE ===== */}
            <Pressable style={[styles.accordionHeader, { marginTop: 0 }]} onPress={() => toggleSection('account')}>
              <Text style={styles.accordionTitle}>{language === 'fr' ? 'COMPTE' : 'ACCOUNT'}</Text>
              <MaterialIcons name={expandedSections.account ? 'expand-less' : 'expand-more'} size={20} color={theme.textSecondary} />
            </Pressable>

            {expandedSections.account ? (
            <>
            <Pressable style={styles.menuItem} onPress={() => { Haptics.selectionAsync(); router.push('/password'); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="lock" size={20} color={theme.primary} /></View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemText}>{t('profile', 'password')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>

            <Pressable style={styles.menuItem} onPress={() => { Haptics.selectionAsync(); setLanguage(language === 'fr' ? 'en' : 'fr'); }}>
              <View style={[styles.menuIcon, { backgroundColor: '#6366F1' + '15' }]}><MaterialIcons name="language" size={20} color="#6366F1" /></View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemText}>{t('profile', 'language')}</Text>
                <Text style={styles.menuItemSubtext}>{language === 'fr' ? 'Français' : 'English'}</Text>
              </View>
              <View style={styles.langBadge}><Text style={styles.langBadgeText}>{language.toUpperCase()}</Text></View>
            </Pressable>

            <Pressable style={styles.menuItem} onPress={() => { Haptics.selectionAsync(); router.push('/remove-ads' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: isPremium ? theme.success + '15' : theme.primary + '15' }]}><MaterialIcons name={isPremium ? 'verified' : 'block'} size={20} color={isPremium ? theme.success : theme.primary} /></View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemText}>{language === 'fr' ? 'Supprimer les pubs' : 'Remove Ads'}</Text>
              </View>
              {isPremium ? (
                <View style={{ backgroundColor: theme.success + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.borderRadius.full }}><Text style={{ fontSize: 11, fontWeight: '700', color: theme.success }}>Premium</Text></View>
              ) : <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />}
            </Pressable>

            {/* Device Transfer */}
            <Pressable style={styles.menuItem} onPress={() => { Haptics.selectionAsync(); router.push('/device-transfer' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' + '15' }]}><MaterialIcons name="swap-horiz" size={20} color="#F59E0B" /></View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemText}>{language === 'fr' ? 'Transferer mon compte' : 'Transfer my account'}</Text>
                <Text style={styles.menuItemSubtext}>{language === 'fr' ? 'Changer d\'appareil' : 'Change device'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>

            <Pressable 
              testID="delete-account-button"
              style={[styles.menuItem, { marginTop: 8, borderWidth: 1, borderColor: theme.textMuted + '20' }]}
              onPress={() => setShowDeleteModal(true)}
            >
              <View style={[styles.menuIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="delete-forever" size={20} color={theme.textMuted} /></View>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemText, { color: theme.textMuted }]}>{t('profile', 'deleteAccount')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>

            </>
            ) : null}

            {/* ===== SECTION: INVITATIONS, NOTIFICATIONS & PARTAGE ===== */}
            <Pressable style={styles.accordionHeader} onPress={() => toggleSection('notifications')}>
              <Text style={styles.accordionTitle}>{language === 'fr' ? 'INVITATIONS, NOTIFICATIONS & PARTAGE' : 'INVITATIONS, NOTIFICATIONS & SHARING'}</Text>
              <MaterialIcons name={expandedSections.notifications ? 'expand-less' : 'expand-more'} size={20} color={theme.textSecondary} />
            </Pressable>

            {expandedSections.notifications ? (
            <View style={styles.compactMenuGroup}>
              {/* Unified Notifications Hub */}
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); setPendingMatchInviteCount(0); setPendingWitnessCount(0); router.push('/notifications-hub' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="notifications" size={16} color={theme.primary} />
                  {(pendingMatchInviteCount + pendingWitnessCount) > 0 ? <View style={styles.shareNotifBadge}><Text style={styles.shareNotifBadgeText}>{(pendingMatchInviteCount + pendingWitnessCount) > 9 ? '9+' : (pendingMatchInviteCount + pendingWitnessCount)}</Text></View> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Notifications' : 'Notifications'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{language === 'fr' ? 'Invitations, attestations, rappels, preferences' : 'Invitations, attestations, reminders, preferences'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              {/* Club Invitations */}
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/club-invitations' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#7C3AED' + '15' }]}><MaterialIcons name="mail" size={16} color="#7C3AED" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Invitations Club' : 'Club Invitations'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{language === 'fr' ? 'Rejoindre un club, historique' : 'Join a club, history'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              {/* Unified Share Hub */}
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); setUnreadShareCount(0); router.push('/share-hub' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.success + '15' }]}><MaterialIcons name="share" size={16} color={theme.success} />
                  {unreadShareCount > 0 ? <View style={styles.shareNotifBadge}><Text style={styles.shareNotifBadgeText}>{unreadShareCount > 9 ? '9+' : unreadShareCount}</Text></View> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Partage' : 'Sharing'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{language === 'fr' ? 'Code, activite, gestion des partages' : 'Code, activity, share management'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            ) : null}

            {/* ===== SECTION: DONNEES & SYNC ===== */}
            <Pressable style={styles.accordionHeader} onPress={() => toggleSection('data')}>
              <Text style={styles.accordionTitle}>{language === 'fr' ? 'DONNEES & SYNCHRONISATION' : 'DATA & SYNC'}</Text>
              <MaterialIcons name={expandedSections.data ? 'expand-less' : 'expand-more'} size={20} color={theme.textSecondary} />
            </Pressable>

            {expandedSections.data ? (
            <View style={styles.compactMenuGroup}>
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/merge-history'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.warning + '15' }]}><MaterialIcons name="merge-type" size={16} color={theme.warning} /></View>
                <Text style={styles.compactMenuText}>{t('mergeHistory', 'title')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/sync-history'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#0EA5E9' + '15' }]}><MaterialIcons name="cloud-sync" size={16} color="#0EA5E9" /></View>
                <Text style={styles.compactMenuText}>{t('syncHistory', 'title')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/export'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#0EA5E9' + '15' }]}><MaterialIcons name="file-download" size={16} color="#0EA5E9" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Exporter mes donnees' : 'Export my data'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>CSV / PDF</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={async () => {
                Haptics.selectionAsync();
                try {
                  const sb = getSupabaseClient();
                  const tables = ['matches', 'challenges', 'tournaments', 'players', 'clubs', 'terrains', 'boules_sets'];
                  const allData: Record<string, any[]> = {};
                  for (const table of tables) {
                    const { data } = await sb.from(table).select('*').eq('user_id', user?.id || '');
                    allData[table] = data || [];
                  }
                  const jsonStr = JSON.stringify(allData, null, 2);
                  const filename = `petanque-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  if (Platform.OS === 'web') {
                    try {
                      const blob = new Blob([jsonStr], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = filename; a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      try { const ExpoClipboard = require('expo-clipboard'); await ExpoClipboard.setStringAsync(jsonStr); } catch {}
                    }
                  } else {
                    const FS = require('expo-file-system');
                    const SharingModule = require('expo-sharing');
                    const path = `${FS.cacheDirectory}${filename}`;
                    await FS.writeAsStringAsync(path, jsonStr, { encoding: FS.EncodingType.UTF8 });
                    const canShare = await SharingModule.isAvailableAsync();
                    if (canShare) await SharingModule.shareAsync(path, { mimeType: 'application/json', dialogTitle: language === 'fr' ? 'Sauvegarder mes donnees' : 'Backup my data' });
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (e: any) {
                  showAlert(language === 'fr' ? 'Erreur' : 'Error', e.message || 'Backup failed');
                }
              }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#7C3AED' + '15' }]}><MaterialIcons name="backup" size={16} color="#7C3AED" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Sauvegarde complete' : 'Full Backup'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>JSON ({language === 'fr' ? 'toutes les donnees' : 'all data'})</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <View style={[styles.compactMenuItem, { paddingVertical: 10 }]}>
                <View style={[styles.compactMenuIcon, { backgroundColor: (batterySaverEnabled ? theme.warning : '#10B981') + '15' }]}><MaterialIcons name={batterySaverEnabled ? 'battery-saver' : 'bolt'} size={16} color={batterySaverEnabled ? theme.warning : '#10B981'} /></View>
                <Text style={[styles.compactMenuText, { flex: 1 }]}>{t('syncHistory', 'batterySaver')}</Text>
                <Switch value={batterySaverEnabled} onValueChange={(val) => { Haptics.selectionAsync(); setBatterySaver(val); }} trackColor={{ false: theme.border, true: theme.warning + '60' }} thumbColor={batterySaverEnabled ? theme.warning : theme.textMuted} />
              </View>
            </View>

            ) : null}

            {/* ===== SECTION: COMMUNAUTE ===== */}
            <Pressable style={styles.accordionHeader} onPress={() => toggleSection('community')}>
              <Text style={styles.accordionTitle}>{language === 'fr' ? 'COMMUNAUTE' : 'COMMUNITY'}</Text>
              <MaterialIcons name={expandedSections.community ? 'expand-less' : 'expand-more'} size={20} color={theme.textSecondary} />
            </Pressable>

            {expandedSections.community ? (
            <View style={styles.compactMenuGroup}>
              {/* Joueurs suivis (above ambassadors) */}
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/following' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#EC4899' + '15' }]}><MaterialIcons name="person-add" size={16} color="#EC4899" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{language === 'fr' ? 'Joueurs suivis' : 'Followed Players'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{language === 'fr' ? 'Abonnements et abonnes' : 'Following and followers'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              {/* 1. Nos Ambassadeurs */}
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/ambassadors' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#7C3AED' + '15' }]}><MaterialIcons name="verified" size={16} color="#7C3AED" /></View>
                <Text style={styles.compactMenuText}>{language === 'fr' ? 'Nos Ambassadeurs' : 'Our Ambassadors'}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/ambassador-program' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#7C3AED' + '15' }]}><MaterialIcons name="stars" size={16} color="#7C3AED" /></View>
                <Text style={styles.compactMenuText}>{language === 'fr' ? 'Programme Ambassadeur' : 'Ambassador Program'}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              {/* 3. Portail Ambassadeur (si ambassadeur) */}
              {isAmbassador ? (
                <>
                  <View style={styles.compactMenuDivider} />
                  <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/ambassador-dashboard' as any); }}>
                    <View style={[styles.compactMenuIcon, { backgroundColor: '#7C3AED' + '15' }]}><MaterialIcons name="dashboard" size={16} color="#7C3AED" /></View>
                    <Text style={[styles.compactMenuText, { color: '#7C3AED', fontWeight: '700' }]}>{language === 'fr' ? 'Portail Ambassadeur' : 'Ambassador Portal'}</Text>
                    <MaterialIcons name="chevron-right" size={18} color="#7C3AED" />
                  </Pressable>
                </>
              ) : null}
              <View style={styles.compactMenuDivider} />
              {/* 4. Nos Partenaires */}
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/partners' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#FFD700' + '15' }]}><MaterialIcons name="handshake" size={16} color="#FFD700" /></View>
                <Text style={styles.compactMenuText}>{language === 'fr' ? 'Nos Partenaires' : 'Our Partners'}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/partner-program' as any); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: '#D4A017' + '15' }]}><MaterialIcons name="campaign" size={16} color="#D4A017" /></View>
                <Text style={styles.compactMenuText}>{language === 'fr' ? 'Programme Partenaire' : 'Partner Program'}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>

              {/* 5. Portail Partenaires (si sponsor) */}
              {isSponsor ? (
                <>
                  <View style={styles.compactMenuDivider} />
                  <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/sponsor-portal' as any); }}>
                    <View style={[styles.compactMenuIcon, { backgroundColor: '#D4A017' + '15' }]}><MaterialIcons name="dashboard" size={16} color="#D4A017" /></View>
                    <Text style={[styles.compactMenuText, { color: '#D4A017', fontWeight: '700' }]}>{language === 'fr' ? 'Portail Partenaires' : 'Partner Portal'}</Text>
                    <MaterialIcons name="chevron-right" size={18} color="#D4A017" />
                  </Pressable>
                </>
              ) : null}
            </View>

            ) : null}

            {/* ===== SECTION: LEGAL & AIDE ===== */}
            <Pressable style={styles.accordionHeader} onPress={() => toggleSection('legal')}>
              <Text style={styles.accordionTitle}>{language === 'fr' ? 'AIDE & LEGAL' : 'HELP & LEGAL'}</Text>
              <MaterialIcons name={expandedSections.legal ? 'expand-less' : 'expand-more'} size={20} color={theme.textSecondary} />
            </Pressable>

            {expandedSections.legal ? (
            <View style={styles.compactMenuGroup}>
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/faq'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="help-outline" size={16} color={theme.carreauColor} /></View>
                <Text style={styles.compactMenuText}>{t('profile', 'help')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />

              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/privacy-policy'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.warning + '15' }]}><MaterialIcons name="policy" size={16} color={theme.warning} /></View>
                <Text style={styles.compactMenuText}>{t('privacy', 'title')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); router.push('/terms'); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.accent + '15' }]}><MaterialIcons name="description" size={16} color={theme.accent} /></View>
                <Text style={styles.compactMenuText}>{t('terms', 'title')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
              <View style={styles.compactMenuDivider} />
              <Pressable style={styles.compactMenuItem} onPress={() => { Haptics.selectionAsync(); setShowConsentDetail(prev => !prev); }}>
                <View style={[styles.compactMenuIcon, { backgroundColor: theme.success + '15' }]}><MaterialIcons name="verified-user" size={16} color={theme.success} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compactMenuText}>{t('profile', 'consentDate')}</Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>
                    {consentDate ? new Date(consentDate).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : t('profile', 'consentNotYet')}
                  </Text>
                </View>
                <MaterialIcons name={showConsentDetail ? 'expand-less' : 'expand-more'} size={18} color={theme.textMuted} />
              </Pressable>
              {showConsentDetail ? (
                <>
                  <View style={styles.compactMenuDivider} />
                  <Pressable style={[styles.compactMenuItem, { paddingLeft: 52 }]} onPress={() => { Haptics.selectionAsync(); router.push('/terms'); }}>
                    <Text style={[styles.compactMenuText, { fontSize: 13 }]}>{t('profile', 'termsOfUse')}</Text>
                    <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
                  </Pressable>
                  <View style={styles.compactMenuDivider} />
                  <Pressable style={[styles.compactMenuItem, { paddingLeft: 52 }]} onPress={() => { Haptics.selectionAsync(); router.push('/privacy-policy'); }}>
                    <Text style={[styles.compactMenuText, { fontSize: 13 }]}>{t('profile', 'privacyPolicy')}</Text>
                    <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
                  </Pressable>
                </>
              ) : null}
            </View>

            ) : null}

            {/* Admin */}
            {isAdmin ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ADMIN</Text>
                <Pressable style={[styles.menuItem, { backgroundColor: '#0F172A' }]} onPress={() => { Haptics.selectionAsync(); router.push('/admin-dashboard' as any); }}>
                  <View style={[styles.menuIcon, { backgroundColor: '#FFF' + '20' }]}><MaterialIcons name="dashboard" size={20} color="#FFF" /></View>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemText, { color: '#FFF' }]}>{language === 'fr' ? 'Tableau de bord' : 'Dashboard'}</Text>
                    <Text style={[styles.menuItemSubtext, { color: '#94A3B8' }]}>{language === 'fr' ? 'Toutes les sections admin' : 'All admin sections'}</Text>
                  </View>
                  {maintenanceActive ? (
                    <View style={[styles.maintenanceBadge, { backgroundColor: '#FEF3C7', marginRight: 8 }]}>
                      <View style={[styles.maintenanceDot, { backgroundColor: '#D97706' }]} />
                      <Text style={[styles.maintenanceBadgeText, { color: '#92400E' }]}>MAINT.</Text>
                    </View>
                  ) : null}
                  <MaterialIcons name="chevron-right" size={20} color="#64748B" />
                </Pressable>
              </>
            ) : null}
          </View>
        )}

        {/* Logout & Creator Note */}
        {!isEditing && (
          <View style={styles.logoutSection}>
            <Pressable 
              testID="logout-button"
              style={styles.logoutButton}
              onPress={handleLogout}
              disabled={operationLoading}
            >
              {operationLoading ? (
                <ActivityIndicator color={theme.error} />
              ) : (
                <>
                  <MaterialIcons name="logout" size={20} color={theme.error} />
                  <Text style={styles.logoutButtonText}>{t('profile', 'logout')}</Text>
                </>
              )}
            </Pressable>

            <Pressable 
              style={styles.creatorNoteCard}
              onPress={() => { Haptics.selectionAsync(); router.push('/creator-note'); }}
            >
              <View style={styles.creatorNoteIconWrap}>
                <MaterialIcons name="favorite" size={22} color="#FFF" />
              </View>
              <View style={styles.creatorNoteContent}>
                <Text style={styles.creatorNoteTitle}>{t('creatorNote', 'title')}</Text>
                <Text style={styles.creatorNoteSubtitle}>{language === 'fr' ? 'Un mot personnel du fondateur' : 'A personal word from the founder'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.error + '80'} />
            </Pressable>
          </View>
        )}

        {/* App Version */}
        <Text style={styles.versionText}>{APP_VERSION_DISPLAY}</Text>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!deletingAccount && !sendingOtp) {
            setShowDeleteModal(false);
            setDeleteConfirmText('');
            setDeleteStep('confirm');
            setOtpCode('');
          }
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                if (!deletingAccount && !sendingOtp) {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                  setDeleteStep('confirm');
                  setOtpCode('');
                }
              }}
              disabled={deletingAccount || sendingOtp}
            >
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('profile', 'deleteAccount')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.deleteModalContent}>
            {deleteStep === 'confirm' ? (
              <>
                <View style={styles.deleteWarningIcon}>
                  <MaterialIcons name="warning" size={48} color={theme.error} />
                </View>
                <Text style={styles.deleteWarningTitle}>{t('profile', 'deleteAccountConfirm')}</Text>
                <Text style={styles.deleteWarningText}>{t('profile', 'deleteAccountWarning')}</Text>

                <View style={styles.deleteConfirmInput}>
                  <Text style={styles.deleteConfirmLabel}>{t('profile', 'deleteAccountTyping')}</Text>
                  <TextInput
                    style={styles.deleteConfirmField}
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    placeholder={t('profile', 'deleteConfirmWord')}
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="characters"
                    editable={!sendingOtp}
                  />
                </View>

                <Pressable
                  style={[
                    styles.deleteOtpSendButton,
                    deleteConfirmText.trim().toUpperCase() !== t('profile', 'deleteConfirmWord') && styles.deleteConfirmButtonDisabled,
                  ]}
                  onPress={handleSendDeleteOtp}
                  disabled={deleteConfirmText.trim().toUpperCase() !== t('profile', 'deleteConfirmWord') || sendingOtp}
                >
                  {sendingOtp ? (
                    <View style={styles.deleteConfirmButtonInner}>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.deleteConfirmButtonText}>{t('profile', 'deleteAccountSendingOtp')}</Text>
                    </View>
                  ) : (
                    <View style={styles.deleteConfirmButtonInner}>
                      <MaterialIcons name="email" size={20} color="#FFF" />
                      <Text style={styles.deleteConfirmButtonText}>{t('profile', 'deleteAccountSendOtp')}</Text>
                    </View>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={[styles.deleteWarningIcon, { backgroundColor: theme.primary + '15' }]}>
                  <MaterialIcons name="mark-email-read" size={48} color={theme.primary} />
                </View>
                <Text style={styles.deleteWarningTitle}>{t('profile', 'deleteAccountOtpTitle')}</Text>
                <Text style={styles.deleteWarningText}>
                  {t('profile', 'deleteAccountOtpDesc')}{' '}
                  <Text style={{ fontWeight: '700', color: theme.textPrimary }}>{user?.email}</Text>
                </Text>

                <View style={styles.deleteConfirmInput}>
                  <TextInput
                    style={[styles.deleteConfirmField, { borderColor: theme.primary + '30' }]}
                    value={otpCode}
                    onChangeText={(text) => setOtpCode(normalizeEmailOtpInput(text))}
                    placeholder={t('profile', 'deleteAccountOtpPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    maxLength={AUTH_EMAIL_OTP_MAX_LENGTH}
                    editable={!deletingAccount}
                    autoFocus
                  />
                </View>

                <Pressable
                  style={styles.otpResendBtn}
                  onPress={handleSendDeleteOtp}
                  disabled={sendingOtp}
                >
                  <MaterialIcons name="refresh" size={16} color={theme.primary} />
                  <Text style={styles.otpResendBtnText}>
                    {sendingOtp ? t('profile', 'deleteAccountSendingOtp') : t('profile', 'deleteAccountResendOtp')}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.deleteConfirmButton,
                    !isCompleteEmailOtp(otpCode) && styles.deleteConfirmButtonDisabled,
                  ]}
                  onPress={handleDeleteAccount}
                  disabled={!isCompleteEmailOtp(otpCode) || deletingAccount}
                >
                  {deletingAccount ? (
                    <View style={styles.deleteConfirmButtonInner}>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.deleteConfirmButtonText}>{t('profile', 'deletingAccount')}</Text>
                    </View>
                  ) : (
                    <View style={styles.deleteConfirmButtonInner}>
                      <MaterialIcons name="delete-forever" size={20} color="#FFF" />
                      <Text style={styles.deleteConfirmButtonText}>{t('profile', 'deleteAccountVerifyAndDelete')}</Text>
                    </View>
                  )}
                </Pressable>

                <Pressable
                  style={styles.otpBackBtn}
                  onPress={() => { setDeleteStep('confirm'); setOtpCode(''); }}
                  disabled={deletingAccount}
                >
                  <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
                  <Text style={styles.otpBackBtnText}>{t('common', 'back')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Terrain Picker Modal */}
      <Modal
        visible={showTerrainPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowTerrainPicker(false);
          setTerrainSearch('');
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowTerrainPicker(false);
                setTerrainSearch('');
              }}
            >
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('profile', 'chooseTerrain')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search */}
          <View style={styles.clubSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={styles.clubSearchInput}
              value={terrainSearch}
              onChangeText={setTerrainSearch}
              placeholder={t('profile', 'searchTerrain')}
              placeholderTextColor={theme.textMuted}
            />
            {terrainSearch.length > 0 ? (
              <Pressable onPress={() => setTerrainSearch('')}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Terrains list */}
          <ScrollView
            style={styles.clubsList}
            contentContainerStyle={styles.clubsListContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredTerrains.length > 0 ? (
              filteredTerrains.map((terr) => (
                <Pressable
                  key={terr.id}
                  style={[
                    styles.clubPickerItem,
                    terrainId === terr.id && styles.clubPickerItemActive,
                  ]}
                  onPress={() => handleSelectTerrain(terr)}
                >
                  <View style={[
                    styles.clubPickerIcon,
                    { backgroundColor: terrainId === terr.id ? theme.carreauColor : theme.backgroundSecondary },
                  ]}>
                    <MaterialIcons
                      name="sports-soccer"
                      size={24}
                      color={terrainId === terr.id ? '#FFF' : theme.textSecondary}
                    />
                  </View>
                  <View style={styles.clubPickerInfo}>
                    <Text style={styles.clubPickerName}>{terr.name}</Text>
                    <Text style={styles.clubPickerCity}>{terr.city} {"•"} {t('terrainTypes', terr.type)}</Text>
                  </View>
                  {terrainId === terr.id ? (
                    <MaterialIcons name="check-circle" size={24} color={theme.carreauColor} />
                  ) : null}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyClubsContainer}>
                <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                <Text style={styles.emptyClubsText}>
                  {terrainSearch ? t('common', 'noResults') : t('profile', 'noTerrainRegistered')}
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fullscreen Image Modal */}
      <Modal
        visible={showFullscreen}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          <Pressable style={styles.fullscreenClose} onPress={() => setShowFullscreen(false)}>
            <View style={styles.fullscreenCloseBtn}>
              <MaterialIcons name="close" size={28} color="#FFF" />
            </View>
          </Pressable>
          {federationCardUrl ? (
            <Image
              source={{ uri: federationCardUrl }}
              style={{ width: screenWidth, height: screenWidth * 1.4 }}
              contentFit="contain"
              transition={200}
            />
          ) : null}
        </View>
      </Modal>

      {/* Badge Unlock Modal */}
      <BadgeUnlockModal
        visible={currentUnlock !== null}
        badgeId={currentUnlock}
        language={language}
        onClose={dismissUnlock}
      />

      {/* Club Picker Modal */}
      <Modal
        visible={showClubPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowClubPicker(false);
          setShowCreateClub(false);
          setClubSearch('');
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowClubPicker(false);
                setShowCreateClub(false);
                setClubSearch('');
              }}
            >
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {showCreateClub ? t('profile', 'newClub') : t('profile', 'chooseClub')}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {!showCreateClub ? (
            <>
              {/* Search */}
              <View style={styles.clubSearchContainer}>
                <MaterialIcons name="search" size={20} color={theme.textMuted} />
                <TextInput
                  style={styles.clubSearchInput}
                  value={clubSearch}
                  onChangeText={setClubSearch}
                  placeholder={t('profile', 'searchClub')}
                  placeholderTextColor={theme.textMuted}
                />
                {clubSearch.length > 0 && (
                  <Pressable onPress={() => setClubSearch('')}>
                    <MaterialIcons name="close" size={20} color={theme.textMuted} />
                  </Pressable>
                )}
              </View>

              {/* Create club button */}
              <Pressable
                style={styles.createClubModalBtn}
                onPress={() => setShowCreateClub(true)}
              >
                <MaterialIcons name="add-business" size={22} color={theme.primary} />
                <Text style={styles.createClubModalBtnText}>{t('profile', 'createNewClub')}</Text>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              {/* Clubs list */}
              <ScrollView
                style={styles.clubsList}
                contentContainerStyle={styles.clubsListContent}
                showsVerticalScrollIndicator={false}
              >
                {filteredClubs.length > 0 ? (
                  filteredClubs.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.clubPickerItem,
                        clubId === c.id && styles.clubPickerItemActive,
                      ]}
                      onPress={() => handleSelectClub(c)}
                    >
                      <View style={[
                        styles.clubPickerIcon,
                        clubId === c.id && styles.clubPickerIconActive,
                      ]}>
                        <MaterialIcons
                          name="location-city"
                          size={24}
                          color={clubId === c.id ? '#FFF' : theme.textSecondary}
                        />
                      </View>
                      <View style={styles.clubPickerInfo}>
                        <Text style={styles.clubPickerName}>{c.name}</Text>
                        <Text style={styles.clubPickerCity}>{c.city}</Text>
                      </View>
                      {clubId === c.id && (
                        <MaterialIcons name="check-circle" size={24} color={theme.accent} />
                      )}
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.emptyClubsContainer}>
                    <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                    <Text style={styles.emptyClubsText}>
                      {clubSearch ? t('profile', 'noClubFound') : t('profile', 'noClubRegistered')}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.createClubFormModal}>
              <View style={styles.createClubFormField}>
                <Text style={styles.createClubLabel}>{t('profile', 'clubName')} *</Text>
                <TextInput
                  style={styles.createClubInput}
                  value={newClubName}
                  onChangeText={setNewClubName}
                  placeholder="Ex: Pétanque Club de Lyon"
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                />
              </View>

              <View style={styles.createClubFormField}>
                <Text style={styles.createClubLabel}>{t('profile', 'clubCity')} *</Text>
                <TextInput
                  style={styles.createClubInput}
                  value={newClubCity}
                  onChangeText={setNewClubCity}
                  placeholder="Ex: Lyon"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={styles.createClubActions}>
                <Pressable
                  style={styles.createClubCancelBtn}
                  onPress={() => {
                    setShowCreateClub(false);
                    setNewClubName('');
                    setNewClubCity('');
                  }}
                >
                  <Text style={styles.createClubCancelBtnText}>{t('common', 'cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.createClubConfirmBtn,
                    (!newClubName.trim() || !newClubCity.trim()) && styles.createClubConfirmBtnDisabled,
                  ]}
                  onPress={handleCreateClub}
                  disabled={!newClubName.trim() || !newClubCity.trim()}
                >
                  <Text style={styles.createClubConfirmBtnText}>{t('profile', 'createClub')}</Text>
                </Pressable>
              </View>
            </View>
          )}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 8,
  },
  editButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary + '15',
    borderRadius: 20,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.primary,
    borderRadius: theme.borderRadius.md,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  scrollContentTablet: {
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%',
    paddingHorizontal: 24,
  },
  // Hero Section
  heroSection: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...theme.shadows.card,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLoading: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFF',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.surface,
  },
  heroInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8E8E8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C0C0C0' + '40',
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#808080',
    letterSpacing: 0.5,
  },
  heroMeta: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  heroClub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroClubText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  heroNickname: {
    fontSize: 15,
    fontStyle: 'italic',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  heroBoulesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.accent + '10',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    marginTop: 8,
  },
  heroBoulesText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.accent,
    flex: 1,
  },
  heroBoulesPrimaryBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.carreauColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Geo Rank row
  geoRankRow: { width: '100%' as const, paddingTop: 10, marginTop: 6, marginBottom: 8, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  geoRankHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
  geoRankTitle: { fontSize: 11, fontWeight: '700' as const, color: '#3B82F6', flex: 1, letterSpacing: 0.3 },
  geoRankBadges: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8 },
  geoRankBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  geoRankBadgeRank: { fontSize: 15, fontWeight: '800' as const },
  geoRankBadgeTotal: { fontSize: 11, fontWeight: '600' as const, color: theme.textMuted },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
  },
  quickStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  quickStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  quickStatLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.border,
    marginHorizontal: 16,
  },
  // Edit Section
  editSection: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 4,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
    paddingLeft: 4,
  },
  fieldCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  fieldInput: {
    fontSize: 16,
    color: theme.textPrimary,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  optionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '10',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 8,
  },
  optionTextActive: {
    color: theme.primary,
  },
  levelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  levelCardActive: {
    borderColor: theme.carreauColor,
    backgroundColor: theme.carreauColor + '10',
  },
  levelText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  levelTextActive: {
    color: theme.carreauColor,
  },
  // Club selection
  selectedClubContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  selectedClubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedClubIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedClubName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  selectedClubActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeClubBtn: {
    padding: 8,
    backgroundColor: theme.primary + '15',
    borderRadius: theme.borderRadius.sm,
  },
  removeClubBtn: {
    padding: 8,
    backgroundColor: theme.error + '15',
    borderRadius: theme.borderRadius.sm,
  },
  selectClubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary + '10',
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.primary + '30',
    borderStyle: 'dashed',
  },
  selectClubButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primary,
  },
  // Player card link
  playerCardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  playerCardLinkIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  playerCardLinkInfo: {
    flex: 1,
  },
  playerCardLinkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  playerCardLinkSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 10,
    ...theme.shadows.card,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  menuItemSubtext: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  // Logout
  logoutSection: {
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.error + '10',
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.error + '30',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.error,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 12,
  },
  deleteAccountButtonText: {
    fontSize: 14,
    color: theme.textMuted,
    textDecorationLine: 'underline',
  },
  creatorNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 16,
    backgroundColor: theme.error + '08',
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.error + '20',
  },
  creatorNoteIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorNoteContent: {
    flex: 1,
  },
  creatorNoteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.error,
    marginBottom: 2,
  },
  creatorNoteSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  // Delete modal
  deleteModalContent: {
    padding: 24,
    alignItems: 'center',
  },
  deleteWarningIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  deleteWarningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteWarningText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteConfirmInput: {
    width: '100%',
    marginBottom: 24,
  },
  deleteConfirmLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  deleteConfirmField: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.error,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: 16,
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 2,
    borderColor: theme.error + '30',
  },
  deleteOtpSendButton: {
    width: '100%',
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  deleteConfirmButton: {
    width: '100%',
    backgroundColor: theme.error,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  deleteConfirmButtonDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.5,
  },
  deleteConfirmButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteConfirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  otpResendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 16,
  },
  otpResendBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  otpBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 12,
  },
  otpBackBtnText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  versionText: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  // Badges
  badgesSection: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginTop: 12,
    ...theme.shadows.card,
  },
  badgesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  badgesSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  badgesSectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeItem: {
    width: '18%',
    minWidth: 58,
    alignItems: 'center',
    gap: 4,
  },
  badgeItemLocked: {
    opacity: 0.4,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  badgeLabelLocked: {
    color: theme.textMuted,
  },
  // Financial button
  financialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  financialButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  financialButtonInfo: {
    flex: 1,
  },
  financialButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  financialButtonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  financialButtonBalance: {
    fontSize: 15,
    fontWeight: '700',
  },
  financialButtonDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.textMuted,
    marginHorizontal: 8,
  },
  financialButtonPodiums: {
    fontSize: 13,
    color: theme.carreauColor,
    fontWeight: '600',
    marginLeft: 3,
  },
  // Modal styles
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
  modalCloseBtn: {
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
  clubSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    gap: 10,
  },
  clubSearchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    padding: 0,
  },
  createClubModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary + '10',
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    gap: 12,
    marginBottom: 8,
  },
  createClubModalBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.primary,
  },
  clubsList: {
    flex: 1,
  },
  clubsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  clubPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 14,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
    ...theme.shadows.card,
  },
  clubPickerItemActive: {
    borderWidth: 2,
    borderColor: theme.accent,
  },
  clubPickerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  clubPickerIconActive: {
    backgroundColor: theme.accent,
  },
  clubPickerInfo: {
    flex: 1,
  },
  clubPickerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  clubPickerCity: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 2,
  },
  emptyClubsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyClubsText: {
    fontSize: 15,
    color: theme.textMuted,
    marginTop: 12,
  },
  createClubFormModal: {
    padding: 16,
  },
  createClubFormField: {
    marginBottom: 20,
  },
  createClubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  createClubInput: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.textPrimary,
    ...theme.shadows.card,
  },
  createClubActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  createClubCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  createClubCancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  createClubConfirmBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.primary,
    borderRadius: theme.borderRadius.md,
  },
  createClubConfirmBtnDisabled: {
    backgroundColor: theme.textMuted,
  },
  createClubConfirmBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Contact fields in edit mode
  contactFieldContainer: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  contactFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 10,
  },
  contactFieldInput: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    paddingVertical: 14,
  },
  contactFieldDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginLeft: 44,
  },
  // Sub-menu styles
  subMenuContainer: {
    marginLeft: 24,
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: theme.border,
    paddingLeft: 12,
    gap: 6,
  },
  subMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    ...theme.shadows.card,
  },
  subMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subMenuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  // Share notification badge
  shareNotifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: theme.surface,
  },
  shareNotifBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  langBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#6366F1' + '15',
  },
  langBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  // Compact menu group styles
  compactMenuGroup: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 10,
    overflow: 'hidden' as const,
    ...theme.shadows.card,
  },
  compactMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  compactMenuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  compactMenuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.textPrimary,
  },
  compactMenuDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginLeft: 58,
  },
  accordionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 16,
    marginBottom: 4,
  },
  accordionTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  maintenanceBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  maintenanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  maintenanceBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  // Boules edit fields
  boulesEditRow: {
    flexDirection: 'row',
    gap: 10,
  },
  boulesEditField: {
    flex: 1,
  },
  boulesEditLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 6,
  },
  // Federation card styles
  fedUploadingCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...theme.shadows.card,
  },
  fedUploadingText: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  fedCardContainer: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  fedCardPreview: {
    position: 'relative',
    width: '100%',
    minHeight: 200,
  },
  fedCardImage: {
    width: '100%',
    height: 220,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  fedPdfPreview: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
    gap: 8,
  },
  fedPdfText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  fedPdfSubtext: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  fedCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  fedCardOverlayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  fedCardOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  fedCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  fedReplaceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: theme.primary + '10',
    borderRadius: theme.borderRadius.md,
  },
  fedReplaceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  fedRemoveBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.error + '10',
    borderRadius: theme.borderRadius.md,
  },
  // Boules set picker styles
  boulesSetPickerList: {
    gap: 8,
  },
  boulesSetPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  boulesSetPickerItemActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accent + '08',
  },
  boulesSetPickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boulesSetPickerIconActive: {
    backgroundColor: theme.accent,
  },
  boulesSetPickerInfo: {
    flex: 1,
  },
  boulesSetPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  boulesSetPickerNameActive: {
    color: theme.accent,
  },
  boulesSetPickerMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  boulesSetPickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.carreauColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boulesSetPickerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 4,
  },
  boulesSetPickerAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.accent,
  },
  fedAddCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.primary + '25',
    borderStyle: 'dashed',
    ...theme.shadows.card,
  },
  fedAddIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  fedAddTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.primary,
    marginBottom: 6,
  },
  fedAddDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  fedAddFormats: {
    flexDirection: 'row',
    gap: 12,
  },
  fedFormatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  fedFormatText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  // Fullscreen modal
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullscreenCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoFillLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary + '08',
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.primary + '20',
    borderStyle: 'dashed',
    gap: 10,
  },
  autoFillLocationIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoFillLocationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  autoFillLocationArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Profile completeness
  completenessContainer: {
    width: '100%',
    marginTop: 16,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
  },
  completenessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  completenessLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completenessLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 0.3,
  },
  completenessPercent: {
    fontSize: 14,
    fontWeight: '800',
  },
  completenessBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: theme.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  completenessBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  completenessDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  completenessDot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completenessDotFilled: {
    borderStyle: 'solid',
  },
  completenessTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  completenessTipIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completenessTipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
});

const progStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 16,
    ...theme.shadows.card,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 14,
  },
  streakBadgeRow: {
    flexDirection: 'row' as const,
    gap: 0,
  },
  vertDivider: {
    width: 1,
    backgroundColor: theme.border,
    marginHorizontal: 14,
  },
  // Streak
  streakCol: {
    flex: 1,
    gap: 8,
  },
  streakHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: theme.textPrimary,
    flex: 1,
  },
  fireTag: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F97316',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  streakNumbers: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  streakNumItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  streakNumValue: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  streakNumLabel: {
    fontSize: 9,
    fontWeight: '600' as const,
    color: theme.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  streakNumDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.border,
    marginHorizontal: 6,
  },
  dotsRow: {
    flexDirection: 'row' as const,
    gap: 4,
    justifyContent: 'center' as const,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dotActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  atRiskRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#EF444410',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  atRiskText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#EF4444',
    flex: 1,
  },
  // Badges
  badgeCol: {
    flex: 1,
    gap: 8,
  },
  badgeHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: theme.textPrimary,
    flex: 1,
  },
  badgeCountPill: {
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  badgeCountText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: theme.primary,
  },
  badgeChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  badgeChipIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeChipName: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: theme.textPrimary,
    maxWidth: 70,
  },
  noBadges: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noBadgesText: {
    fontSize: 11,
    color: theme.textMuted,
    fontWeight: '500' as const,
  },
  lockedDotsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  lockedDot: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  lockedMore: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: theme.textMuted,
  },
  viewAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    marginLeft: 'auto' as any,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.primary + '10',
    borderRadius: 8,
  },
  viewAllText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: theme.primary,
  },
});



