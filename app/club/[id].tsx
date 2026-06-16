
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import * as Haptics from '@/services/haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
// Animations removed for layout stability
import { Image } from 'expo-image';
import * as ImagePicker from '@/services/imagePicker';
// expo-document-picker and expo-file-system loaded dynamically to avoid web bundler issues
import * as Linking2 from 'expo-linking';
import { decode } from '@/services/base64';
import { getSupabaseClient } from '@/template';
import { uploadImageToStorage } from '@/services/storageService';
import theme, { blurhash } from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import ShareModal from '@/components/ui/ShareModal';
import SponsoredItemBanner from '@/components/ui/SponsoredItemBanner';
import ModificationLogsSection from '@/components/ui/ModificationLogsSection';
import SharedBadge from '@/components/ui/SharedBadge';
import MergePickerModal from '@/components/ui/MergePickerModal';
import { isSharedWithMe, saveSharedItemToMyAccount, recordShareView } from '@/services/shareService';
import { toggleItemPublic } from '@/services/publicItemsService';
import { fetchGeoLeaderboard, GeoEntry } from '@/services/geoLeaderboardService';
import { getCountryFlag, getContinentFlag, getContinentLabel, getContinent } from '@/constants/geoData';
import { useAlert } from '@/template';
import { useAuth } from '@/template';
import { submitClubClaim, hasExistingClaim, getReceivedClaims, acceptClubClaim, declineClubClaim, ClubClaimRequest, submitVerificationRequest } from '@/services/clubClaimService';
import { getClubCoAdmins, addClubCoAdmin, removeClubCoAdmin, updateCoAdminPermission, CoAdmin, CoAdminPermission } from '@/services/clubCoManagementService';
import { sendClubInvitation, getClubInvitations, removeInvitation, hasBeenInvited, ClubInvitation } from '@/services/clubInvitationService';
import { fetchClubMemberRoles, assignMemberRole, removeMemberRole, getRoleConfig, getRoleLabel, CLUB_ROLES, ClubMemberRole, ClubMemberRoleEntry } from '@/services/clubMemberRoleService';
import { fetchClubLeaderboard, sortClubLeaderboard, type LeaderboardClub } from '@/services/clubLeaderboardService';



export default function ClubDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, tournaments, loading: appLoading } = useAppData();
  const { getClubById, deleteClub, updateClub, getSharedPermission, setItemPublic, isFavoriteClub, toggleFavoriteClub, refreshData } = useAppActions();
  const [refreshing, setRefreshing] = React.useState(false);
  const [screenWidth, setScreenWidth] = React.useState(() => Dimensions.get('window').width || 375);
  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const { terrains: allTerrains } = useAppData();
  const club = getClubById(id!);
  const clubPlayers = players.filter(p => p.clubId === id);
  const clubTournaments = tournaments.filter(tr => tr.clubId === id);
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [isShared, setIsShared] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublicState, setIsPublicState] = React.useState(false);
  const [togglingPublic, setTogglingPublic] = React.useState(false);
  const { showAlert } = useAlert();
  const [showMergePicker, setShowMergePicker] = React.useState(false);
  const [showPublicPreview, setShowPublicPreview] = React.useState(false);
  const [previewShowContacts, setPreviewShowContacts] = React.useState(false);

  // Claim system state
  const [showClaimModal, setShowClaimModal] = React.useState(false);
  const [claimMessage, setClaimMessage] = React.useState('');
  const [claimStatus, setClaimStatus] = React.useState<string | null>(null);
  const [submittingClaim, setSubmittingClaim] = React.useState(false);
  const [claimProofUri, setClaimProofUri] = React.useState<string | null>(null);
  const [claimProofUrl, setClaimProofUrl] = React.useState<string | null>(null);
  const [claimProofType, setClaimProofType] = React.useState<'image' | 'pdf'>('image');
  const [uploadingProof, setUploadingProof] = React.useState(false);
  const [showProofFullscreen, setShowProofFullscreen] = React.useState<string | null>(null);
  const [pendingClaims, setPendingClaims] = React.useState<ClubClaimRequest[]>([]);
  const [processingClaimId, setProcessingClaimId] = React.useState<string | null>(null);

  // Co-management state
  const [coAdmins, setCoAdmins] = React.useState<CoAdmin[]>([]);
  const [showCoAdminModal, setShowCoAdminModal] = React.useState(false);
  const [coAdminEmail, setCoAdminEmail] = React.useState('');
  const [addingCoAdmin, setAddingCoAdmin] = React.useState(false);
  const [isCoAdmin, setIsCoAdmin] = React.useState(false);
  const [newCoAdminPerm, setNewCoAdminPerm] = React.useState<CoAdminPermission>('edit');
  const [updatingPermId, setUpdatingPermId] = React.useState<string | null>(null);

  // Club member invitations state
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [clubInvitations, setClubInvitations] = React.useState<ClubInvitation[]>([]);
  const [invitingPlayerId, setInvitingPlayerId] = React.useState<string | null>(null);
  const [inviteSearch, setInviteSearch] = React.useState('');
  const [inviteFilteredPlayers, setInviteFilteredPlayers] = React.useState<typeof players>([]);

  // Club member roles state
  const [memberRoles, setMemberRoles] = React.useState<ClubMemberRoleEntry[]>([]);
  const [showRoleModal, setShowRoleModal] = React.useState<{ playerId: string; playerName: string; currentRole?: ClubMemberRole } | null>(null);
  const [assigningRole, setAssigningRole] = React.useState(false);

  const sharedPermission = getSharedPermission(id!);
  const isSharedItem = sharedPermission !== null;
  const isReadOnly = sharedPermission === 'read';
  const isOwner = !!(user?.id && club?.userId && club.userId === user.id);
  const isCoadmin = !!(user?.id && club && (club as any).adminUserIds?.includes(user.id));
  const canEdit = !isReadOnly && (isOwner || isCoadmin);
  const supabase = getSupabaseClient();

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  // Club card state
  const [clubCardUrl, setClubCardUrl] = React.useState<string | null>(null);
  const [clubCardType, setClubCardType] = React.useState<'image' | 'pdf'>('image');
  const [uploadingCard, setUploadingCard] = React.useState(false);
  const [showCardFullscreen, setShowCardFullscreen] = React.useState(false);
  // const [screenWidth2, setScreenWidth2] = React.useState(() => Dimensions.get('window').width || 375); // This variable `screenWidth2` is unused.

  // Geo ranking state for club (ranks this club among other clubs with compositeScore > 0 only)
  const [clubGeoRank, setClubGeoRank] = React.useState<{ city?: { rank: number; total: number }; country?: { rank: number; total: number }; continent?: { rank: number; total: number }; world?: { rank: number; total: number } } | null>(null);
  /** True after fetch when this club has no qualifying leaderboard score (compositeScore = 0) — show hero placeholder */
  const [geoRankPendingPlaceholder, setGeoRankPendingPlaceholder] = React.useState(false);

  React.useEffect(() => {
    if (!club) return;
    const matchLb = (c: LeaderboardClub) => c.id === club.id || c.name === club.name;
    setGeoRankPendingPlaceholder(false);
    fetchClubLeaderboard().then(({ clubs: allClubs }) => {
      if (!allClubs?.length) {
        setClubGeoRank(null);
        setGeoRankPendingPlaceholder(false);
        return;
      }

      const myEntry = allClubs.find(matchLb);
      const myScore = myEntry?.stats?.compositeScore ?? 0;
      if (myScore <= 0) {
        setClubGeoRank(null);
        setGeoRankPendingPlaceholder(true);
        return;
      }

      const qualified = allClubs.filter((c: LeaderboardClub) => c.stats.compositeScore > 0);
      const sorted = sortClubLeaderboard(qualified, 'compositeScore');
      const result: {
        city?: { rank: number; total: number };
        country?: { rank: number; total: number };
        continent?: { rank: number; total: number };
        world?: { rank: number; total: number };
      } = {};

      // City ranking: qualified clubs in the same city
      if (club.city) {
        const cityClubs = sorted.filter((c) => c.city?.toLowerCase() === club.city!.toLowerCase());
        const myIdx = cityClubs.findIndex(matchLb);
        if (myIdx >= 0) result.city = { rank: myIdx + 1, total: cityClubs.length };
        else if (cityClubs.length > 0) result.city = { rank: cityClubs.length + 1, total: cityClubs.length + 1 };
      }
      const clubCountry = club.country || 'France';
      const countryClubs = sorted.filter((c) => (c.country || 'France').toLowerCase() === clubCountry.toLowerCase());
      const countryIdx = countryClubs.findIndex(matchLb);
      if (countryIdx >= 0) result.country = { rank: countryIdx + 1, total: countryClubs.length };
      else if (countryClubs.length > 0) result.country = { rank: countryClubs.length + 1, total: countryClubs.length + 1 };

      const continent = getContinent(clubCountry);
      if (continent) {
        const contClubs = sorted.filter((c) => getContinent(c.country || 'France') === continent);
        const contIdx = contClubs.findIndex(matchLb);
        if (contIdx >= 0) result.continent = { rank: contIdx + 1, total: contClubs.length };
        else if (contClubs.length > 0) result.continent = { rank: contClubs.length + 1, total: contClubs.length + 1 };
      }

      const worldIdx = sorted.findIndex(matchLb);
      if (worldIdx >= 0) result.world = { rank: worldIdx + 1, total: sorted.length };
      else result.world = { rank: sorted.length + 1, total: sorted.length + 1 };

      setGeoRankPendingPlaceholder(false);
      setClubGeoRank(Object.keys(result).length > 0 ? result : null);
    }).catch(() => {
      setClubGeoRank(null);
      setGeoRankPendingPlaceholder(false);
    });
  }, [club?.id, club?.isPublic, club?.city, club?.country, club?.name]);

  // Load club member roles
  React.useEffect(() => {
    if (!id) return;
    fetchClubMemberRoles(id).then(({ roles }) => setMemberRoles(roles));
  }, [id]);

  // Load club invitations for owner or co-admin
  React.useEffect(() => {
    if (!id || !user?.id) return;
    const isOwner = club?.userId === user.id;
    const isCo = (club as any)?.adminUserIds?.includes?.(user.id);
    if (!isOwner && !isCo) return;
    getClubInvitations(id).then(invs => setClubInvitations(invs.filter(i => i.status === 'pending')));
  }, [id, user?.id, club?.userId]);

  // Filter players for invite modal search — using useMemo to avoid render thrashing
  const inviteFilteredPlayersMemo = React.useMemo(() => {
    if (!showInviteModal) return [];
    const q = inviteSearch.trim().toLowerCase();
    const memberIds = new Set(clubPlayers.map(p => p.id));
    const pendingInviteIds = new Set(clubInvitations.map(i => i.invitedPlayerId));
    return players
      .filter(p => !memberIds.has(p.id))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q))
      .slice(0, 20)
      .map(p => ({ ...p, _isInvited: pendingInviteIds.has(p.id) }));
  }, [inviteSearch, showInviteModal, players, clubPlayers, clubInvitations]);

  // Invite message state
  const [inviteMessage, setInviteMessage] = React.useState('');

  const handleInvitePlayer = React.useCallback(async (player: any) => {
    if (!club || !user || invitingPlayerId) return;
    setInvitingPlayerId(player.id);
    const alreadyInvited = await hasBeenInvited(club.id, player.id);
    if (alreadyInvited) {
      showAlert(language === 'fr' ? 'Deja invite' : 'Already invited', language === 'fr' ? 'Ce joueur a deja une invitation en attente.' : 'This player already has a pending invitation.');
      setInvitingPlayerId(null);
      return;
    }
    const { invitation, error: err } = await sendClubInvitation({
      clubId: club.id,
      clubName: club.name,
      clubLogo: club.logo,
      playerId: player.id,
      playerName: player.name,
      playerUserId: player.userId,
      inviterUserId: user.id,
      inviterName: user.username || user.email,
      message: inviteMessage.trim() || undefined,
    });
    setInvitingPlayerId(null);
    if (err) {
      showAlert(t('common', 'error'), err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(language === 'fr' ? 'Invitation envoyee' : 'Invitation sent', `${player.name} ${language === 'fr' ? 'a ete invite a rejoindre' : 'has been invited to join'} ${club.name}`);
      if (invitation) setClubInvitations(prev => [invitation, ...prev]);
    }
  }, [club, user, invitingPlayerId, showAlert, language, t]);

  const isFavorite = id ? isFavoriteClub(id) : false;

  const handleToggleFavorite = () => {
    if (id) {
      toggleFavoriteClub(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleUploadLogo = React.useCallback(() => {
    if (!club || !canEdit || isSharedItem) return;
    Alert.alert(
      t('club', 'clubLabel'),
      language === 'fr' ? 'Logo du club' : 'Club logo',
      [
        { text: t('player', 'fromCamera'), onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { showAlert(t('profile', 'permissionRequired'), t('profile', 'cameraPermission')); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
          if (!result.canceled && result.assets[0]) {
            setUploadingLogo(true);
            const url = await uploadImageToStorage('avatars', `avatars/clubs/${user?.id}`, result.assets[0].uri);
            setUploadingLogo(false);
            if (url) { await updateClub(club.id, { logo: url }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
            else { showAlert(t('common', 'error'), t('profile', 'errorUploadPhoto')); }
          }
        }},
        { text: t('player', 'fromGallery'), onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { showAlert(t('profile', 'permissionRequired'), t('profile', 'galleryPermission')); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
          if (!result.canceled && result.assets[0]) {
            setUploadingLogo(true);
            const url = await uploadImageToStorage('avatars', `avatars/clubs/${user?.id}`, result.assets[0].uri);
            setUploadingLogo(false);
            if (url) { await updateClub(club.id, { logo: url }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
            else { showAlert(t('common', 'error'), t('profile', 'errorUploadPhoto')); }
          }
        }},
        ...(club.logo ? [{ text: language === 'fr' ? 'Supprimer le logo' : 'Remove logo', style: 'destructive' as const, onPress: async () => {
          await updateClub(club.id, { logo: undefined });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}] : []),
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  }, [club, canEdit, isSharedItem, user?.id, updateClub, showAlert, t, language]);

  React.useEffect(() => {
    if (id) {
      isSharedWithMe('club', id).then(shared => { setIsShared(shared); if (shared) recordShareView('club', id, 'club-detail'); });
    }
  }, [id]);

  React.useEffect(() => {
    if (club) setIsPublicState(club.isPublic ?? false);
  }, [club?.id, club?.isPublic]);

  // Check claim status & load pending claims & co-admins
  React.useEffect(() => {
    if (!id || !user?.id) return;
    // Check if I have a claim
    hasExistingClaim(id, user.id).then(({ hasClaim, status }) => {
      if (hasClaim) setClaimStatus(status);
    }).catch(() => {});
    // If I own this club, load pending claims and co-admins
    if (club?.userId === user.id) {
      getReceivedClaims().then(({ claims }) => {
        setPendingClaims(claims.filter(c => c.clubId === id && c.status === 'pending'));
      }).catch(() => {});
      getClubCoAdmins(id).then(({ coAdmins: admins }) => {
        setCoAdmins(admins);
      }).catch(() => {});
    } else {
      // Check if I am a co-admin
      getClubCoAdmins(id).then(({ coAdmins: admins }) => {
        setCoAdmins(admins);
        setIsCoAdmin(admins.some(a => a.id === user.id));
      }).catch(() => {});
    }
  }, [id, user?.id, club?.userId]);

  // Load club card URL
  React.useEffect(() => {
    if (club?.clubCardUrl) {
      setClubCardUrl(club.clubCardUrl);
      setClubCardType(club.clubCardUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image');
    } else {
      setClubCardUrl(null);
    }
  }, [club?.clubCardUrl]);



  // Club card upload helpers
  const uploadClubCardFile = React.useCallback(async (fileUri: string, fileName: string, mimeType: string) => {
    if (!club || !user) return;
    setUploadingCard(true);
    try {
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${user.id}/${club.id}_card_${Date.now()}.${fileExt}`;
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
      const { error: uploadError } = await supabase.storage.from('club-cards').upload(storagePath, decode(base64Data), { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('club-cards').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      await updateClub(club.id, { clubCardUrl: publicUrl } as any);
      setClubCardUrl(publicUrl);
      setClubCardType(fileExt === 'pdf' ? 'pdf' : 'image');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('club', 'clubCardUpdated'));
    } catch (error: any) {
      console.log('Error uploading club card:', error);
      showAlert(t('common', 'error'), error.message || t('club', 'errorUploadClubCard'));
    } finally {
      setUploadingCard(false);
    }
  }, [club, user, supabase, updateClub, showAlert, t]);

  const showClubCardUploadOptions = React.useCallback(() => {
    Alert.alert(
      t('club', 'clubCardLabel'), t('club', 'clubCardDesc'),
      [
        { text: t('player', 'fromCamera'), onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { showAlert(t('profile', 'permissionRequired'), t('profile', 'cameraPermission')); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
          if (!result.canceled && result.assets[0]) {
            const ext = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
            await uploadClubCardFile(result.assets[0].uri, `club_card.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
          }
        }},
        { text: t('player', 'fromGallery'), onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { showAlert(t('profile', 'permissionRequired'), t('profile', 'galleryPermission')); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
          if (!result.canceled && result.assets[0]) {
            const ext = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
            await uploadClubCardFile(result.assets[0].uri, `club_card.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
          }
        }},
        { text: t('player', 'fromFiles'), onPress: async () => {
          try {
            const DocumentPicker = require('expo-document-picker');
            const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
            if (!result.canceled && result.assets && result.assets[0]) {
              await uploadClubCardFile(result.assets[0].uri, result.assets[0].name || 'club_card.pdf', result.assets[0].mimeType || 'application/pdf');
            }
          } catch (e) { console.log('Error picking document:', e); }
        }},
        { text: t('common', 'cancel'), style: 'cancel' },
      ]
    );
  }, [t, uploadClubCardFile, showAlert]);

  const handleRemoveClubCard = React.useCallback(() => {
    Alert.alert(t('club', 'removeClubCard'), '', [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => {
        if (!club) return;
        try {
          await updateClub(club.id, { clubCardUrl: undefined } as any);
          setClubCardUrl(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showAlert(t('common', 'success'), t('club', 'clubCardRemoved'));
        } catch (e: any) { showAlert(t('common', 'error'), e.message); }
      }},
    ]);
  }, [club, updateClub, showAlert, t]);

  const handleOpenPublicPreview = React.useCallback(() => {
    if (!club || togglingPublic || isSharedItem) return;
    Haptics.selectionAsync();
    setPreviewShowContacts(club.showContactPublic ?? false);
    setShowPublicPreview(true);
  }, [club, togglingPublic, isSharedItem]);

  const handleConfirmPublic = React.useCallback(async () => {
    if (!club) return;
    setTogglingPublic(true);
    Haptics.selectionAsync();
    const newVal = !isPublicState;
    const { error } = await toggleItemPublic('clubs', club.id, newVal);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      setIsPublicState(newVal);
      setItemPublic('clubs', club.id, newVal);
      await updateClub(club.id, { showContactPublic: previewShowContacts } as any);
    }
    setTogglingPublic(false);
    setShowPublicPreview(false);
  }, [club, isPublicState, togglingPublic, previewShowContacts, showAlert, t, updateClub]);

  const handleOpenSharePreview = React.useCallback(() => {
    if (!club) return;
    Haptics.selectionAsync();
    setShowShareModal(true);
  }, [club]);

  const handleDelete = () => {
    Alert.alert(
      t('club', 'deleteClub'),
      `${t('club', 'deleteConfirm')} "${club?.name}" ? ${t('club', 'deleteLinkedTerrains')}`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            if (club) {
              await deleteClub(club.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            }
          },
        },
      ]
    );
  };

  if (!club) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('club', 'clubLabel')}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.textSecondary }}>{t('club', 'clubNotFound')}</Text>
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
        <Text style={styles.headerTitle}>{t('club', 'clubLabel')}</Text>
        <View style={styles.headerActions}>
          {/* Pending claims notification badge for owner */}
          {canEdit && !isSharedItem && pendingClaims.length > 0 ? (
            <Pressable
              style={styles.claimNotifBtn}
              onPress={() => router.push({ pathname: '/notifications-hub', params: { tab: 'claims' } } as any)}
            >
              <MaterialIcons name="verified-user" size={20} color="#F59E0B" />
              <View style={styles.claimNotifBadge}>
                <Text style={styles.claimNotifBadgeText}>{pendingClaims.length > 9 ? '9+' : pendingClaims.length}</Text>
              </View>
            </Pressable>
          ) : null}
          {isShared && (
            <Pressable
              style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
              onPress={async () => {
                setIsSaving(true);
                const { newItemId, error } = await saveSharedItemToMyAccount('club', id!);
                setIsSaving(false);
                if (error) {
                  showAlert(t('common', 'error'), error);
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  showAlert(t('club', 'savedLabel'), t('club', 'clubCopied'));
                  if (newItemId) router.replace(`/club/${newItemId}` as any);
                }
              }}
              disabled={isSaving}
            >
              <MaterialIcons name="save-alt" size={22} color={theme.accent} />
            </Pressable>
          )}
          <Pressable style={styles.shareButton} onPress={handleOpenSharePreview}>
            <MaterialIcons name="share" size={22} color={theme.success} />
          </Pressable>
          <Pressable
            style={[styles.shareButton, { backgroundColor: '#9333EA10' }]}
            onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/club-compare', params: { clubA: club.id } } as any); }}
          >
            <MaterialIcons name="compare-arrows" size={22} color="#9333EA" />
          </Pressable>
          <Pressable
            style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]}
            onPress={handleToggleFavorite}
          >
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={22}
              color={isFavorite ? theme.error : theme.textSecondary}
            />
          </Pressable>
          {canEdit && (
            <Pressable
              style={styles.editButton}
              onPress={() => router.push(`/club/edit/${id}`)}
            >
              <MaterialIcons name="edit" size={22} color={theme.primary} />
            </Pressable>
          )}
          {/* Analytics button for owner/co-admin — only if club is verified */}
          {canEdit && !isSharedItem && club?.isVerified ? (
            <Pressable
              style={[styles.editButton, { backgroundColor: '#8B5CF610' }]}
              onPress={() => router.push({ pathname: '/club-analytics', params: { id: id! } } as any)}
            >
              <MaterialIcons name="analytics" size={22} color="#8B5CF6" />
            </Pressable>
          ) : canEdit && !isSharedItem && !club?.isVerified ? (
            <Pressable
              style={[styles.editButton, { backgroundColor: '#F59E0B10' }]}
              onPress={() => router.push({ pathname: '/club-analytics', params: { id: id! } } as any)}
            >
              <MaterialIcons name="analytics" size={22} color="#F59E0B" />
            </Pressable>
          ) : null}
          {canEdit && (
            <Pressable
              style={styles.editButton}
              onPress={() => {
                Haptics.selectionAsync();
                Alert.alert(
                  language === 'fr' ? 'Actions avancees' : 'Advanced Actions',
                  '',
                  [
                    { text: language === 'fr' ? 'Fusionner avec un autre club' : 'Merge with another club', onPress: () => setShowMergePicker(true) },
                    ...(!isSharedItem ? [{ text: language === 'fr' ? 'Supprimer' : 'Delete', style: 'destructive' as const, onPress: handleDelete }] : []),
                    { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' as const },
                  ]
                );
              }}
            >
              <MaterialIcons name="more-vert" size={22} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && styles.scrollContentTablet]}
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
        {/* Club Card */}
        <View style={[styles.clubCard, isTablet && styles.clubCardTablet]}>
          <Pressable style={styles.clubIconPressable} onPress={handleUploadLogo} disabled={!canEdit || isSharedItem || uploadingLogo}>
            {uploadingLogo ? (
              <View style={styles.clubIcon}>
                <ActivityIndicator size="large" color="#FFF" />
              </View>
            ) : club.logo ? (
              <View style={styles.clubLogoWrap}>
                <Image source={{ uri: club.logo }} style={styles.clubLogoImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                {canEdit && !isSharedItem ? (
                  <View style={styles.clubLogoEditBadge}>
                    <MaterialIcons name="camera-alt" size={14} color="#FFF" />
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.clubIcon}>
                <MaterialIcons name="home" size={48} color="#FFF" />
                {canEdit && !isSharedItem ? (
                  <View style={styles.clubLogoEditBadge}>
                    <MaterialIcons name="camera-alt" size={14} color="#FFF" />
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={[styles.clubName, { marginBottom: 0 }]}>{club.name}</Text>
            {club.isVerified ? (
              <View style={styles.verifiedBadge}>
                <MaterialIcons name="verified" size={18} color="#2563EB" />
              </View>
            ) : null}
          </View>
          {/* Owner / Co-admin badge */}
          {user?.id && club.userId === user.id && club.isVerified ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7C3AED12', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, marginBottom: 6, borderWidth: 1, borderColor: '#7C3AED25' }}>
              <MaterialIcons name="admin-panel-settings" size={14} color="#7C3AED" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>{language === 'fr' ? 'Proprietaire' : 'Owner'}</Text>
            </View>
          ) : isCoAdmin ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#3B82F612', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, marginBottom: 6, borderWidth: 1, borderColor: '#3B82F625' }}>
              <MaterialIcons name="shield" size={14} color="#3B82F6" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>{language === 'fr' ? 'Co-administrateur' : 'Co-admin'}</Text>
            </View>
          ) : null}
          {sharedPermission ? (
            <View style={{ marginBottom: 8 }}>
              <SharedBadge permission={sharedPermission} />
            </View>
          ) : null}
          <View style={styles.clubMeta}>
            <MaterialIcons name="place" size={16} color={theme.textSecondary} />
            <Text style={styles.clubMetaText}>{club.address ? `${club.address}, ` : ''}{club.city}</Text>
          </View>
          {club.description ? <Text style={styles.clubDescription}>{club.description}</Text> : null}

          {/* Quick Stats - integrated in Hero Card */}
          <View style={styles.heroStatsBar}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{club.membersCount}</Text>
              <Text style={styles.heroStatLabel}>{t('club', 'members')}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{club.foundedYear || '-'}</Text>
              <Text style={styles.heroStatLabel}>{t('club', 'founded')}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{clubTournaments.length}</Text>
              <Text style={styles.heroStatLabel}>{t('club', 'tournamentsLabel')}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{club.membershipCost ? `${club.membershipCost}\u20AC` : '-'}</Text>
              <Text style={styles.heroStatLabel}>{t('club', 'membership')}</Text>
            </View>
          </View>

          {/* Geographic Ranking — only clubs with compositeScore > 0; otherwise explanatory placeholder */}
          {geoRankPendingPlaceholder ? (
            <View style={[styles.geoRankSection, styles.geoRankPendingCard, { alignSelf: 'stretch' }]}>
              <View style={styles.geoRankHeader}>
                <MaterialIcons name="insights" size={14} color="#64748B" />
                <Text style={[styles.geoRankTitle, styles.geoRankPendingTitleMuted]}>{t('club', 'geoRankPendingTitle')}</Text>
              </View>
              <Text style={styles.geoRankPendingBody}>{t('club', 'geoRankPendingBody')}</Text>
              {(isOwner || isCoadmin) && !isReadOnly ? (
                <Pressable
                  style={styles.geoRankPendingCta}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowInviteModal(true);
                  }}
                >
                  <MaterialIcons name="person-add" size={18} color="#FFF" />
                  <Text style={styles.geoRankPendingCtaText}>{t('club', 'geoRankInviteCta')}</Text>
                </Pressable>
              ) : (
                <Text style={styles.geoRankPendingHint}>{t('club', 'geoRankPendingVisitorHint')}</Text>
              )}
            </View>
          ) : clubGeoRank && (clubGeoRank.city || clubGeoRank.country || clubGeoRank.continent) ? (
            <View style={[styles.geoRankSection, { alignSelf: 'stretch' }]}>
              <View style={styles.geoRankHeader}>
                <MaterialIcons name="public" size={14} color="#3B82F6" />
                <Text style={styles.geoRankTitle}>{language === 'fr' ? 'Classement geographique' : 'Geographic Ranking'}</Text>
              </View>
              <View style={styles.geoRankRow}>
                {clubGeoRank.city ? (
                  <View style={styles.geoRankBadge}>
                    <MaterialIcons name="location-city" size={14} color="#3B82F6" />
                    <Text style={styles.geoRankBadgeLabel}>{club.city}</Text>
                    <Text style={[styles.geoRankBadgeRank, { color: clubGeoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }]}>#{clubGeoRank.city.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{clubGeoRank.city.total}</Text>
                  </View>
                ) : null}
                {clubGeoRank.country ? (
                  <View style={styles.geoRankBadge}>
                    <Text style={{ fontSize: 14 }}>{getCountryFlag(club.country || '')}</Text>
                    <Text style={styles.geoRankBadgeLabel} numberOfLines={1}>{club.country}</Text>
                    <Text style={[styles.geoRankBadgeRank, { color: clubGeoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }]}>#{clubGeoRank.country.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{clubGeoRank.country.total}</Text>
                  </View>
                ) : null}
                {clubGeoRank.continent ? (
                  <View style={styles.geoRankBadge}>
                    <Text style={{ fontSize: 14 }}>{getContinentFlag(getContinent(club.country || ''))}</Text>
                    <Text style={styles.geoRankBadgeLabel} numberOfLines={1}>{getContinentLabel(getContinent(club.country || ''), language === 'fr')}</Text>
                    <Text style={[styles.geoRankBadgeRank, { color: clubGeoRank.continent.rank <= 3 ? '#F59E0B' : '#F59E0B' }]}>#{clubGeoRank.continent.rank}</Text>
                    <Text style={styles.geoRankBadgeTotal}>/{clubGeoRank.continent.total}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Facilities inline */}
          {club.facilities && club.facilities.length > 0 ? (
            <View style={[styles.inlineFacilitiesSection, { alignSelf: 'stretch' }]}>
              <View style={styles.facilitiesGridInline}>
                {club.facilities.map((facility, index) => (
                  <View key={index} style={styles.facilityTagInline}>
                    <MaterialIcons name="check-circle" size={14} color={theme.success} />
                    <Text style={styles.facilityTextInline}>{t('facilityLabels', facility) || facility}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Contact inline */}
          {(club.contactEmail || club.contactPhone) && !isSharedItem && (club.showContactPublic !== false || !club.isPublic) ? (
            <View style={[styles.inlineContactSection, { alignSelf: 'stretch' }]}>
              {club.contactEmail ? (
                <Pressable style={styles.contactRowInline} onPress={() => Linking.openURL(`mailto:${club.contactEmail}`)}>
                  <MaterialIcons name="email" size={18} color={theme.primary} />
                  <Text style={styles.contactTextInline}>{club.contactEmail}</Text>
                </Pressable>
              ) : null}
              {club.contactPhone ? (
                <Pressable style={styles.contactRowInline} onPress={() => Linking.openURL(`tel:${club.contactPhone}`)}>
                  <MaterialIcons name="phone" size={18} color={theme.primary} />
                  <Text style={styles.contactTextInline}>{club.contactPhone}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Social / Web links */}
          {(club.website || club.facebookUrl || club.instagramHandle) ? (
            <View style={[styles.inlineContactSection, { alignSelf: 'stretch' }]}>
              {club.website ? (
                <Pressable style={styles.contactRowInline} onPress={() => { const url = club.website!.startsWith('http') ? club.website! : `https://${club.website}`; Linking.openURL(url); }}>
                  <MaterialIcons name="language" size={18} color={theme.accent} />
                  <Text style={styles.contactTextInline} numberOfLines={1}>{club.website}</Text>
                </Pressable>
              ) : null}
              {club.facebookUrl ? (
                <Pressable style={styles.contactRowInline} onPress={() => { const url = club.facebookUrl!.startsWith('http') ? club.facebookUrl! : `https://${club.facebookUrl}`; Linking.openURL(url); }}>
                  <MaterialIcons name="facebook" size={18} color="#1877F2" />
                  <Text style={[styles.contactTextInline, { color: '#1877F2' }]} numberOfLines={1}>{club.facebookUrl}</Text>
                </Pressable>
              ) : null}
              {club.instagramHandle ? (
                <Pressable style={styles.contactRowInline} onPress={() => { const handle = club.instagramHandle!.replace('@', ''); Linking.openURL(`https://instagram.com/${handle}`); }}>
                  <MaterialIcons name="camera-alt" size={18} color="#E4405F" />
                  <Text style={[styles.contactTextInline, { color: '#E4405F' }]} numberOfLines={1}>@{club.instagramHandle!.replace('@', '')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Sponsor Banner — inside Hero Card, only when sponsor_id is explicitly set */}
          {(club as any).sponsorId ? (
            <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
              <SponsoredItemBanner sponsorId={(club as any).sponsorId} page="club-detail" style={{ marginBottom: 0 }} />
            </View>
          ) : null}
        </View>



        {/* Club Card - right after main card */}
        {clubCardUrl ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('club', 'clubCardLabel')}</Text>
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, overflow: 'hidden', ...theme.shadows.card }}>
              <Pressable style={{ position: 'relative', minHeight: 180 }} onPress={() => clubCardType === 'pdf' ? Linking.openURL(clubCardUrl) : setShowCardFullscreen(true)}>
                {clubCardType === 'image' ? (
                  <Image source={{ uri: clubCardUrl }} style={{ width: '100%', height: 200 }} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.default }} cachePolicy="memory-disk" />
                ) : (
                  <View style={{ width: '100%', height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, gap: 8 }}>
                    <MaterialIcons name="picture-as-pdf" size={48} color={theme.error} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textPrimary }}>{t('player', 'pdfDocument')}</Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('player', 'tapToView')}</Text>
                  </View>
                )}
              </Pressable>
              {canEdit && !isSharedItem ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: theme.primary + '10', borderRadius: theme.borderRadius.md }} onPress={showClubCardUploadOptions}>
                    <MaterialIcons name="refresh" size={18} color={theme.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.primary }}>{t('club', 'replaceClubCard')}</Text>
                  </Pressable>
                  <Pressable style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.error + '10', borderRadius: theme.borderRadius.md }} onPress={handleRemoveClubCard}>
                    <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : canEdit && !isSharedItem ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('club', 'clubCardLabel')}</Text>
            <Pressable style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: theme.primary + '25', borderStyle: 'dashed', ...theme.shadows.card }} onPress={showClubCardUploadOptions}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <MaterialIcons name="badge" size={32} color={theme.primary} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.primary, marginBottom: 6 }}>{t('club', 'addClubCard')}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center' }}>{t('club', 'clubCardDesc')}</Text>
            </Pressable>
          </View>
        ) : null}



        <View style={isTablet ? styles.tabletRow : undefined}>
        {/* Location */}
        <View style={[styles.section, isTablet && styles.tabletHalf]}>
          <Text style={styles.sectionTitle}>{t('club', 'locationLabel')}</Text>
          <View style={styles.locationCard}>
            <View style={styles.locationInfo}>
              <Text style={styles.locationAddress}>{club.address}</Text>
              <Text style={styles.locationCity}>{club.city}</Text>
            </View>
            <Pressable
              style={styles.mapButton}
              onPress={() => {
                const lat = club.location?.latitude;
                const lng = club.location?.longitude;
                if (lat || lng) {
                  router.push({ pathname: '/(tabs)/map', params: { lat: String(lat || 0), lng: String(lng || 0), name: club.name, mf: String(Date.now()) } } as any);
                } else {
                  router.push('/(tabs)/map');
                }
              }}
            >
              <MaterialIcons name="map" size={20} color={theme.primary} />
              <Text style={styles.mapButtonText}>{t('club', 'viewOnMap')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Main Terrain */}
        {club.terrainId ? (() => {
          const mainTerrain = allTerrains.find(t => t.id === club.terrainId);
          if (!mainTerrain) return null;
          return (
            <View style={[styles.section, isTablet && styles.tabletHalf]}>
              <Text style={styles.sectionTitle}>{t('club', 'mainTerrainLabel')}</Text>
              <Pressable
                style={styles.locationCard}
                onPress={() => router.push(`/terrain/${mainTerrain.id}`)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.success + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="sports-soccer" size={22} color={theme.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationAddress}>{mainTerrain.name}</Text>
                    <Text style={styles.locationCity}>{t('terrainTypes', mainTerrain.type)} {"•"} {mainTerrain.city}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              </Pressable>
            </View>
          );
        })() : null}

        </View>

        {/* Members + Invite Section */}
        <View style={isTablet ? styles.tabletRow : undefined}>
        {clubPlayers.length > 0 ? (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('club', 'membersCount')} ({clubPlayers.length})</Text>
              {canEdit && !isSharedItem ? (
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                  onPress={() => { Haptics.selectionAsync(); setInviteSearch(''); setShowInviteModal(true); }}
                >
                  <MaterialIcons name="person-add" size={14} color={theme.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
                </Pressable>
              ) : null}
            </View>
            {/* Pending invitations */}
            {clubInvitations.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                {clubInvitations.map(inv => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B08', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#F59E0B20', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="schedule" size={16} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{inv.invitedPlayerName}</Text>
                      <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '500' }}>{language === 'fr' ? 'Invitation en attente' : 'Invitation pending'}</Text>
                    </View>
                    <Pressable
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.error + '10', alignItems: 'center', justifyContent: 'center' }}
                      onPress={async () => {
                        await removeInvitation(inv.id);
                        setClubInvitations(prev => prev.filter(i => i.id !== inv.id));
                        Haptics.selectionAsync();
                      }}
                    >
                      <MaterialIcons name="close" size={14} color={theme.error} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {clubPlayers.slice(0, 5).map(player => (
              <Pressable
                key={player.id}
                style={styles.memberCard}
                onPress={() => router.push(`/player/${player.id}`)}
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitials}>
                    {player.name.split(' ').map(n => n[0]).join('')}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{player.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.memberRole}>{player.role}</Text>
                    {(() => {
                      const mr = memberRoles.find(r => r.playerId === player.id);
                      if (!mr || mr.role === 'player') return null;
                      const rc = getRoleConfig(mr.role);
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rc.color + '12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                          <MaterialIcons name={rc.icon as any} size={10} color={rc.color} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: rc.color }}>{getRoleLabel(mr.role, language === 'fr')}</Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
                <View style={styles.memberStats}>
                  {canEdit && !isSharedItem ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        const currentMr = memberRoles.find(r => r.playerId === player.id);
                        setShowRoleModal({ playerId: player.id, playerName: player.name, currentRole: currentMr?.role as ClubMemberRole | undefined });
                      }}
                      hitSlop={8}
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.primary + '08', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MaterialIcons name="badge" size={14} color={theme.primary} />
                    </Pressable>
                  ) : null}
                  <Text style={styles.memberWinRate}>{player.stats.winRate}%</Text>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : canEdit && !isSharedItem ? (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('club', 'membersCount')} (0)</Text>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                onPress={() => { Haptics.selectionAsync(); setInviteSearch(''); setShowInviteModal(true); }}
              >
                <MaterialIcons name="person-add" size={14} color={theme.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
              </Pressable>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, ...theme.shadows.card }}>
              <MaterialIcons name="people-outline" size={40} color={theme.textMuted} />
              <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 8 }}>{language === 'fr' ? 'Aucun membre' : 'No members'}</Text>
            </View>
          </View>
        ) : null}

        {/* Tournaments */}
        {clubTournaments.length > 0 && (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <Text style={styles.sectionTitle}>{t('club', 'organizedTournaments')}</Text>
            {clubTournaments.map(tournament => (
              <Pressable
                key={tournament.id}
                style={styles.tournamentCard}
                onPress={() => router.push(`/tournament/${tournament.id}`)}
              >
                <View style={styles.tournamentDate}>
                  <Text style={styles.tournamentDay}>
                    {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric' })}
                  </Text>
                  <Text style={styles.tournamentMonth}>
                    {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' })}
                  </Text>
                </View>
                <View style={styles.tournamentInfo}>
                  <Text style={styles.tournamentName}>{tournament.name}</Text>
                  <Text style={styles.tournamentFormat}>
                    {t('formats', tournament.format)} • {t('tournamentTypes', tournament.type)}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: tournament.status === 'À venir' ? theme.primaryLight + '30' : theme.backgroundSecondary }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: tournament.status === 'À venir' ? theme.primary : theme.textSecondary }
                  ]}>
                    {t('tournamentStatus', tournament.status)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        </View>

        {/* Upload in progress overlay */}
        {uploadingCard ? (
          <View style={styles.section}>
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 40, alignItems: 'center', gap: 12, ...theme.shadows.card }}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('club', 'uploadingClubCard')}</Text>
            </View>
          </View>
        ) : null}

        {/* Pending Claims - only for owner */}
        {canEdit && !isSharedItem && pendingClaims.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('club', 'pendingClaims').toUpperCase()}</Text>
            {pendingClaims.map(claim => (
              <View key={claim.id} style={styles.claimCard}>
                <View style={styles.claimCardHeader}>
                  <View style={styles.claimAvatar}>
                    <MaterialIcons name="person" size={20} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimName}>{claim.requesterName || claim.requesterEmail || (language === 'fr' ? 'Utilisateur' : 'User')}</Text>
                    {claim.requesterEmail ? <Text style={styles.claimEmail}>{claim.requesterEmail}</Text> : null}
                    <Text style={styles.claimDate}>{new Date(claim.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                </View>
                {claim.message ? (
                  <View style={styles.claimMessageBox}>
                    <MaterialIcons name="format-quote" size={14} color={theme.textMuted} />
                    <Text style={styles.claimMessageText}>{claim.message}</Text>
                  </View>
                ) : null}
                {claim.proofUrl ? (
                  <Pressable
                    style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#2563EB25' }}
                    onPress={() => claim.proofUrl!.toLowerCase().endsWith('.pdf') ? Linking.openURL(claim.proofUrl!) : setShowProofFullscreen(claim.proofUrl!)}
                  >
                    {claim.proofUrl.toLowerCase().endsWith('.pdf') ? (
                      <View style={{ width: '100%', height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', gap: 4 }}>
                        <MaterialIcons name="picture-as-pdf" size={32} color={theme.error} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textPrimary }}>{t('club', 'claimProofPdf')}</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: claim.proofUrl }} style={{ width: '100%', height: 120 }} contentFit="cover" transition={200} />
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#EFF6FF' }}>
                      <MaterialIcons name={claim.proofUrl.toLowerCase().endsWith('.pdf') ? 'open-in-new' : 'photo'} size={14} color="#2563EB" />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563EB' }}>{t('club', 'claimProofView')}</Text>
                    </View>
                  </Pressable>
                ) : null}
                <View style={styles.claimActions}>
                  <Pressable
                    style={styles.claimDeclineBtn}
                    onPress={() => {
                      Alert.alert(
                        t('club', 'declineClaim'),
                        t('club', 'declineClaimConfirm'),
                        [
                          { text: t('common', 'cancel'), style: 'cancel' },
                          { text: t('club', 'declineClaim'), style: 'destructive', onPress: async () => {
                            setProcessingClaimId(claim.id);
                            const { error } = await declineClubClaim(claim.id);
                            setProcessingClaimId(null);
                            if (!error) {
                              setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            } else {
                              showAlert(t('common', 'error'), error);
                            }
                          }},
                        ]
                      );
                    }}
                    disabled={processingClaimId === claim.id}
                  >
                    <MaterialIcons name="close" size={16} color={theme.error} />
                    <Text style={styles.claimDeclineText}>{t('club', 'declineClaim')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.claimAcceptBtn}
                    onPress={() => {
                      Alert.alert(
                        t('club', 'acceptClaim'),
                        t('club', 'acceptClaimConfirm'),
                        [
                          { text: t('common', 'cancel'), style: 'cancel' },
                          { text: t('club', 'acceptClaim'), onPress: async () => {
                            setProcessingClaimId(claim.id);
                            const { error } = await acceptClubClaim(claim.id);
                            setProcessingClaimId(null);
                            if (!error) {
                              setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              showAlert(t('common', 'success'), t('club', 'claimTransferred') + '\n' + t('club', 'contributorBadge'));
                            } else {
                              showAlert(t('common', 'error'), error);
                            }
                          }},
                        ]
                      );
                    }}
                    disabled={processingClaimId === claim.id}
                  >
                    {processingClaimId === claim.id ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <MaterialIcons name="check" size={16} color="#FFF" />
                        <Text style={styles.claimAcceptText}>{t('club', 'acceptClaim')}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Verification Checklist — for owner of unverified club */}
        {canEdit && !isSharedItem && !club.isVerified && user?.id && club.userId === user.id ? (() => {
          const matchCount = 0; // Will be computed from context if needed
          const criteria = [
            { key: 'address', met: !!club.address, label: t('club', 'checklistAddress'), icon: 'place' },
            { key: 'members', met: club.membersCount >= 2, label: t('club', 'checklistMembers'), icon: 'people' },
            { key: 'desc', met: !!club.description, label: t('club', 'checklistDescription'), icon: 'description' },
            { key: 'contact', met: !!(club.contactEmail || club.contactPhone), label: t('club', 'checklistContact'), icon: 'contact-phone' },
            { key: 'logo', met: !!club.logo, label: t('club', 'checklistLogo'), icon: 'image' },
            { key: 'proof', met: claimStatus === 'pending' || claimStatus === 'accepted', label: t('club', 'checklistProof'), icon: 'verified-user' },
          ];
          const metCount = criteria.filter(c => c.met).length;
          const progress = Math.round((metCount / criteria.length) * 100);
          const allInfoMet = criteria.filter(c => c.key !== 'proof').every(c => c.met);
          const proofSent = claimStatus === 'pending' || claimStatus === 'accepted';
          return (
            <View style={styles.section}>
              <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 18, borderWidth: 1.5, borderColor: '#F59E0B30', ...theme.shadows.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="checklist" size={22} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{t('club', 'verificationChecklist')}</Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>{t('club', 'verificationChecklistDesc')}</Text>
                  </View>
                  <View style={{ backgroundColor: progress === 100 ? '#10B98115' : '#F59E0B15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: progress === 100 ? '#10B981' : '#F59E0B' }}>{progress}%</Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={{ height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
                  <View style={{ height: '100%', width: `${Math.max(3, progress)}%`, backgroundColor: progress === 100 ? '#10B981' : '#F59E0B', borderRadius: 3 }} />
                </View>
                {/* Criteria items */}
                <View style={{ gap: 8 }}>
                  {criteria.map(c => (
                    <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.met ? '#10B98115' : theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={c.met ? 'check-circle' : (c.icon as any)} size={16} color={c.met ? '#10B981' : theme.textMuted} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: c.met ? '#10B981' : theme.textPrimary, textDecorationLine: c.met ? 'line-through' : 'none' }}>{c.label}</Text>
                      {!c.met && c.key !== 'proof' ? (
                        <Pressable style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.primary + '12', borderRadius: 8 }} onPress={() => router.push(`/club/edit/${id}` as any)}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>{language === 'fr' ? 'Completer' : 'Complete'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
                {/* Proof upload — final step */}
                {allInfoMet && !proofSent ? (
                  <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#F59E0B', marginBottom: 8 }}>{t('club', 'checklistProofDesc')}</Text>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 14 }}
                      onPress={() => setShowClaimModal(true)}
                    >
                      <MaterialIcons name="upload-file" size={18} color="#FFF" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('club', 'checklistSubmitProof')}</Text>
                    </Pressable>
                  </View>
                ) : proofSent && claimStatus === 'pending' ? (
                  <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="schedule" size={18} color="#F59E0B" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#F59E0B' }}>{t('club', 'checklistProofPending')}</Text>
                  </View>
                ) : null}
                {/* Analytics advantage teaser */}
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 8 }}>{t('club', 'analyticsAdvantages')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { icon: 'bar-chart', label: language === 'fr' ? 'Stats detaillees' : 'Detailed stats' },
                      { icon: 'groups', label: 'Matchmaking' },
                      { icon: 'compare-arrows', label: language === 'fr' ? 'Comparaison nationale' : 'National comparison' },
                      { icon: 'file-download', label: language === 'fr' ? 'Export CSV/PDF' : 'CSV/PDF export' },
                    ].map((a, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#8B5CF608', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#8B5CF615' }}>
                        <MaterialIcons name={a.icon as any} size={11} color="#8B5CF6" />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#8B5CF6' }}>{a.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          );
        })() : null}

        {/* ===== SIMPLIFIED VISIBILITY SECTION (bottom of page) ===== */}
        {canEdit && !isSharedItem ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'fr' ? 'VISIBILITE' : 'VISIBILITY'}</Text>
            <Pressable
              style={styles.visibilityCard}
              onPress={async () => {
                if (togglingPublic) return;
                Haptics.selectionAsync();
                setTogglingPublic(true);
                const newVal = !isPublicState;
                const { error } = await toggleItemPublic('clubs', club.id, newVal);
                if (error) { showAlert(t('common', 'error'), error); }
                else { setIsPublicState(newVal); setItemPublic('clubs', club.id, newVal); }
                setTogglingPublic(false);
              }}
              disabled={togglingPublic}
            >
              <View style={[styles.visibilityIcon, { backgroundColor: isPublicState ? theme.success + '15' : theme.textMuted + '15' }]}>
                <MaterialIcons name={isPublicState ? 'public' : 'lock'} size={22} color={isPublicState ? theme.success : theme.textMuted} />
              </View>
              <View style={styles.visibilityInfo}>
                <Text style={styles.visibilityTitle}>{language === 'fr' ? 'Visibilite communaute' : 'Community Visibility'}</Text>
                <Text style={styles.visibilityDesc}>
                  {isPublicState ? (language === 'fr' ? 'Visible dans l\'annuaire et sur la carte' : 'Visible in directory and on map') : (language === 'fr' ? 'Masque de l\'annuaire et de la carte' : 'Hidden from directory and map')}
                </Text>
              </View>
              {togglingPublic ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <View style={[styles.visibilityBadge, { backgroundColor: isPublicState ? theme.success + '20' : theme.textMuted + '15' }]}>
                  <Text style={[styles.visibilityBadgeText, { color: isPublicState ? theme.success : theme.textMuted }]}>
                    {isPublicState ? (language === 'fr' ? 'Actif' : 'On') : (language === 'fr' ? 'Inactif' : 'Off')}
                  </Text>
                </View>
              )}
            </Pressable>
            {isPublicState && (club.contactEmail || club.contactPhone) ? (
              <Pressable
                style={[styles.visibilityCard, { marginTop: 8 }]}
                onPress={async () => {
                  Haptics.selectionAsync();
                  const newVal = !(club.showContactPublic ?? false);
                  try { await updateClub(club.id, { showContactPublic: newVal } as any); } catch (e: any) { showAlert(t('common', 'error'), e.message); }
                }}
              >
                <View style={[styles.visibilityIcon, { backgroundColor: (club.showContactPublic ? theme.success : theme.textMuted) + '15' }]}>
                  <MaterialIcons name={club.showContactPublic ? 'contact-phone' : 'phone-disabled'} size={22} color={club.showContactPublic ? theme.success : theme.textMuted} />
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={styles.visibilityTitle}>{language === 'fr' ? 'Visibilite infos contact' : 'Contact Info Visibility'}</Text>
                  <Text style={styles.visibilityDesc}>
                    {club.showContactPublic ? (language === 'fr' ? 'Email et telephone visibles dans l\'annuaire et sur la carte' : 'Email and phone visible in directory and on map') : (language === 'fr' ? 'Email et telephone masques dans l\'annuaire et sur la carte' : 'Email and phone hidden in directory and on map')}
                  </Text>
                </View>
                <View style={[styles.visibilityBadge, { backgroundColor: (club.showContactPublic ? theme.success : theme.textMuted) + '15' }]}>
                  <Text style={[styles.visibilityBadgeText, { color: club.showContactPublic ? theme.success : theme.textMuted }]}>
                    {club.showContactPublic ? (language === 'fr' ? 'Actif' : 'On') : (language === 'fr' ? 'Inactif' : 'Off')}
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Claim Club Button - for non-owners (sends to admin) */}
        {user?.id && club.userId && club.userId !== user.id && !isSharedItem ? (
          <View style={styles.section}>
            {claimStatus === 'pending' ? (
              <View style={styles.claimStatusCard}>
                <View style={[styles.claimStatusIcon, { backgroundColor: '#F59E0B15' }]}>
                  <MaterialIcons name="schedule" size={22} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimStatusTitle}>{t('club', 'claimPending')}</Text>
                  <Text style={styles.claimStatusDesc}>{t('club', 'claimPendingDesc')}</Text>
                </View>
              </View>
            ) : claimStatus === 'accepted' ? (
              <View style={styles.claimStatusCard}>
                <View style={[styles.claimStatusIcon, { backgroundColor: '#10B98115' }]}>
                  <MaterialIcons name="check-circle" size={22} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.claimStatusTitle, { color: '#10B981' }]}>{t('club', 'claimAccepted')}</Text>
                </View>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.claimButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={() => setShowClaimModal(true)}
              >
                <View style={styles.claimButtonIcon}>
                  <MaterialIcons name="verified-user" size={22} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimButtonTitle}>{t('club', 'claimThisClub')}</Text>
                  <Text style={styles.claimButtonDesc}>{t('club', 'claimDesc')}</Text>
                </View>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal visible={showRoleModal !== null} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 24, maxWidth: 400, alignSelf: 'center', width: '100%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>{language === 'fr' ? 'Attribuer un role' : 'Assign Role'}</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>{showRoleModal?.playerName}</Text>
            <View style={{ gap: 8 }}>
              {CLUB_ROLES.map(r => {
                const isActive = showRoleModal?.currentRole === r.id;
                return (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: isActive ? r.color + '12' : theme.backgroundSecondary, borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? r.color + '40' : theme.border, opacity: pressed ? 0.85 : 1 }]}
                    onPress={async () => {
                      if (!showRoleModal || !club || !user || assigningRole) return;
                      setAssigningRole(true);
                      const player = clubPlayers.find(p => p.id === showRoleModal.playerId);
                      if (r.id === 'player') {
                        const existing = memberRoles.find(mr => mr.playerId === showRoleModal.playerId);
                        if (existing) {
                          await removeMemberRole(existing.id);
                          setMemberRoles(prev => prev.filter(mr => mr.id !== existing.id));
                        }
                      } else {
                        const { entry } = await assignMemberRole({
                          clubId: club.id,
                          playerId: showRoleModal.playerId,
                          userId: (player as any)?.userId || user.id,
                          role: r.id,
                          assignedBy: user.id,
                        });
                        if (entry) {
                          setMemberRoles(prev => {
                            const filtered = prev.filter(mr => mr.playerId !== showRoleModal.playerId);
                            return [...filtered, entry];
                          });
                        }
                      }
                      setAssigningRole(false);
                      setShowRoleModal(null);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                    disabled={assigningRole}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: r.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={r.icon as any} size={18} color={r.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary }}>{language === 'fr' ? r.labelFr : r.labelEn}</Text>
                    </View>
                    {isActive ? <MaterialIcons name="check-circle" size={20} color={r.color} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={{ marginTop: 16, alignItems: 'center', paddingVertical: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 12 }}
              onPress={() => setShowRoleModal(null)}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textSecondary }}>{language === 'fr' ? 'Annuler' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        itemType="club"
        itemId={club.id}
        itemName={club.name}
      />

      {/* Merge Picker Modal */}
      <MergePickerModal
        visible={showMergePicker}
        onClose={() => setShowMergePicker(false)}
        itemType="club"
        currentItemId={id!}
      />

      {/* Invite Members Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary }}>{language === 'fr' ? 'Inviter des joueurs' : 'Invite Players'}</Text>
              <Pressable onPress={() => { setShowInviteModal(false); setInviteMessage(''); }} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            {/* Invitation message field */}
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{language === 'fr' ? 'Message joint (optionnel)' : 'Attached message (optional)'}</Text>
              <TextInput
                style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 12, fontSize: 14, color: theme.textPrimary, minHeight: 50, textAlignVertical: 'top', borderWidth: 1, borderColor: '#7C3AED20' }}
                placeholder={language === 'fr' ? 'Ex: Rejoignez-nous pour la saison 2026 !' : 'Ex: Join us for the 2026 season!'}
                placeholderTextColor={theme.textMuted}
                value={inviteMessage}
                onChangeText={setInviteMessage}
                multiline
                maxLength={200}
              />
              {inviteMessage.trim().length > 0 ? (
                <Text style={{ fontSize: 10, color: theme.textMuted, textAlign: 'right', marginTop: 4 }}>{inviteMessage.length}/200</Text>
              ) : null}
            </View>
            <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderColor: theme.border }}>
                <MaterialIcons name="search" size={20} color={theme.textMuted} />
                <TextInput
                  style={{ flex: 1, height: 44, fontSize: 15, color: theme.textPrimary }}
                  placeholder={language === 'fr' ? 'Rechercher un joueur...' : 'Search players...'}
                  placeholderTextColor={theme.textMuted}
                  value={inviteSearch}
                  onChangeText={setInviteSearch}
                />
                {inviteSearch.length > 0 ? (
                  <Pressable onPress={() => setInviteSearch('')} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <FlatList
              data={inviteFilteredPlayersMemo as any[]}
              keyExtractor={(item: any) => item.id}
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              initialNumToRender={10}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <MaterialIcons name="search-off" size={40} color={theme.textMuted} />
                  <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 8 }}>{language === 'fr' ? 'Aucun joueur trouve' : 'No players found'}</Text>
                </View>
              }
              renderItem={({ item: player }: { item: any }) => {
                const isMember = clubPlayers.some(cp => cp.id === player.id);
                const isInvited = player._isInvited || clubInvitations.some(i => i.invitedPlayerId === player.id);
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {player.avatar ? (
                        <Image source={{ uri: player.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.primary }}>{player.name.charAt(0)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{player.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {player.club ? <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>{player.club}</Text> : null}
                        {player.city ? <Text style={{ fontSize: 12, color: theme.textMuted }}>{player.city}</Text> : null}
                      </View>
                    </View>
                    {isMember ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.success + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                        <MaterialIcons name="check-circle" size={14} color={theme.success} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.success }}>{language === 'fr' ? 'Membre' : 'Member'}</Text>
                      </View>
                    ) : isInvited ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                        <MaterialIcons name="schedule" size={14} color="#F59E0B" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#F59E0B' }}>{language === 'fr' ? 'Invite' : 'Invited'}</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, opacity: pressed ? 0.85 : 1 }]}
                        onPress={() => handleInvitePlayer(player)}
                        disabled={invitingPlayerId === player.id}
                      >
                        {invitingPlayerId === player.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <MaterialIcons name="person-add" size={14} color="#FFF" />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{language === 'fr' ? 'Inviter' : 'Invite'}</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  headerActions: { flexDirection: 'row', gap: 4 },
  saveButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent + '15', borderRadius: 20 },
  shareButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  editButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  favoriteButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  favoriteButtonActive: { backgroundColor: theme.error + '15', borderRadius: 20 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  tabletRow: { flexDirection: 'row' as const, gap: 16 },
  tabletHalf: { flex: 1 },
  clubCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 20, marginBottom: 16, alignItems: 'center', ...theme.shadows.card },
  clubCardTablet: { maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  clubIconPressable: { marginBottom: 12 },
  clubIcon: { width: 88, height: 88, borderRadius: 20, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadows.cardElevated },
  clubLogoWrap: { width: 88, height: 88, borderRadius: 20, overflow: 'hidden', ...theme.shadows.cardElevated },
  clubLogoImage: { width: 88, height: 88, borderRadius: 20 },
  clubLogoEditBadge: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  clubName: { fontSize: 22, fontWeight: '700', color: theme.textPrimary, marginBottom: 8, textAlign: 'center' },
  verifiedBadge: { backgroundColor: '#2563EB12', borderRadius: 12, padding: 4 },
  clubMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  clubMetaText: { fontSize: 14, color: theme.textSecondary },
  clubDescription: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  geoRankSection: { marginTop: 12, width: '100%', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12 },
  geoRankPendingCard: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  geoRankPendingTitleMuted: { color: theme.textSecondary },
  geoRankPendingBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 12 },
  geoRankPendingHint: { fontSize: 12, color: theme.textMuted, fontStyle: 'italic' as const },
  geoRankPendingCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: theme.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
  },
  geoRankPendingCtaText: { fontSize: 14, fontWeight: '700' as const, color: '#FFF' },
  geoRankHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  geoRankTitle: { fontSize: 12, fontWeight: '700', color: '#3B82F6', letterSpacing: 0.5 },
  geoRankRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  geoRankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surface, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  geoRankBadgeLabel: { fontSize: 10, fontWeight: '600', color: theme.textPrimary, flexShrink: 1 },
  geoRankBadgeRank: { fontSize: 13, fontWeight: '800' },
  geoRankBadgeTotal: { fontSize: 10, color: theme.textMuted },
  inlineFacilitiesSection: { marginTop: 12, width: '100%' },
  facilitiesGridInline: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  facilityTagInline: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  facilityTextInline: { fontSize: 13, color: theme.textPrimary },
  inlineContactSection: { marginTop: 10, width: '100%', gap: 6 },
  contactRowInline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  contactTextInline: { fontSize: 13, color: theme.primary, flexShrink: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 1, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heroStatsBar: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, paddingVertical: 14, paddingHorizontal: 12, marginTop: 14, width: '100%' as any },
  heroStatItem: { flex: 1, alignItems: 'center' as const },
  heroStatValue: { fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary },
  heroStatLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: theme.border, marginHorizontal: 4 },
  locationCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, ...theme.shadows.card },
  locationInfo: { marginBottom: 8 },
  locationAddress: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  locationCity: { fontSize: 13, color: theme.textSecondary },
  mapButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primaryLight + '20', paddingVertical: 10, borderRadius: theme.borderRadius.md, marginTop: 8 },
  mapButtonText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, padding: 12, marginBottom: 8, gap: 12, ...theme.shadows.card },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  memberInitials: { fontSize: 16, fontWeight: '700', color: theme.primary },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  memberRole: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  memberStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberWinRate: { fontSize: 14, fontWeight: '700', color: theme.success },
  tournamentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 8, gap: 12, ...theme.shadows.card },
  tournamentDate: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  tournamentDay: { fontSize: 18, fontWeight: '900', color: theme.primary, lineHeight: 20 },
  tournamentMonth: { fontSize: 9, fontWeight: '700', color: theme.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
  tournamentInfo: { flex: 1 },
  tournamentName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  tournamentFormat: { fontSize: 12, color: theme.textSecondary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  visibilityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, ...theme.shadows.card },
  visibilityIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  visibilityInfo: { flex: 1 },
  visibilityTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  visibilityDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  visibilityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.borderRadius.full },
  visibilityBadgeText: { fontSize: 12, fontWeight: '700' },
  claimNotifBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  claimNotifBadge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  claimNotifBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  claimCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F59E0B25', ...theme.shadows.card },
  claimCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  claimAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  claimName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  claimEmail: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  claimDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  claimMessageBox: { flexDirection: 'row', gap: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, marginBottom: 12 },
  claimMessageText: { fontSize: 13, color: theme.textPrimary, flex: 1, fontStyle: 'italic', lineHeight: 19 },
  claimActions: { flexDirection: 'row', gap: 8 },
  claimDeclineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.error + '10', borderWidth: 1, borderColor: theme.error + '25' },
  claimDeclineText: { fontSize: 13, fontWeight: '600', color: theme.error },
  claimAcceptBtn: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#2563EB' },
  claimAcceptText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  claimStatusCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, ...theme.shadows.card },
  claimStatusIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  claimStatusTitle: { fontSize: 15, fontWeight: '600', color: '#F59E0B' },
  claimStatusDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  claimButton: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, borderWidth: 1, borderColor: '#2563EB25', ...theme.shadows.card },
  claimButtonIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2563EB15', alignItems: 'center', justifyContent: 'center' },
  claimButtonTitle: { fontSize: 15, fontWeight: '600', color: '#2563EB' },
  claimButtonDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
});
