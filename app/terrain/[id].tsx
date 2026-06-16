import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';

import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
import theme from '@/constants/theme';
import { config } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import ShareModal from '@/components/ui/ShareModal';
import ModificationLogsSection from '@/components/ui/ModificationLogsSection';
import SharedBadge from '@/components/ui/SharedBadge';
import MergePickerModal from '@/components/ui/MergePickerModal';
import { isSharedWithMe, saveSharedItemToMyAccount, recordShareView } from '@/services/shareService';
import { toggleItemPublic } from '@/services/publicItemsService';
import { getMeetupsForTerrain, Meetup } from '@/services/meetupService';
import { TextInput } from 'react-native';
import { fetchTerrainReviews, submitTerrainReview, deleteTerrainReview, computeRatingStats, TerrainReview, TerrainRatingStats, fetchReviewVotes, voteOnReview, ReviewVoteCounts, flagReview } from '@/services/terrainReviewService';
import { uploadImageToStorage } from '@/services/storageService';
import { decode } from '@/services/base64';
import { getSupabaseClient } from '@/template';
import { useAlert } from '@/template';
import { useAuth } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import SponsoredItemBanner from '@/components/ui/SponsoredItemBanner';

// Community stats type for terrain detail
interface TerrainCommunityStats {
  totalMatches: number;
  recentMatches: number;
  totalChallenges: number;
  recentChallenges: number;
  totalTournaments: number;
  recentTournaments: number;
  peakDow: number;
  peakHour: number;
  peakDowCount: number;
  peakHourCount: number;
  popularityRank?: number;
  popularityScore?: number;
}


export default function TerrainDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { tournaments, loading: appLoading, matches: allMatches, players: allPlayers } = useAppData();
  const { getTerrainById, deleteTerrain, updateTerrain, isFavoriteTerrain, toggleFavoriteTerrain, getSharedPermission, setItemPublic, refreshData } = useAppActions();
  const [refreshing, setRefreshing] = useState(false);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublicState, setIsPublicState] = useState(false);
  const [showMergePicker, setShowMergePicker] = useState(false);
  const [showAllTournaments, setShowAllTournaments] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [showPublicPreview, setShowPublicPreview] = useState(false);

  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const sharedPermission = getSharedPermission(id || '');
  const isSharedItem = sharedPermission !== null;
  const isReadOnly = sharedPermission === 'read';

  const terrain = getTerrainById(id || '');
  const isOwner = !!(user?.id && terrain && terrain.userId && terrain.userId === user.id);
  const canEdit = !isReadOnly && isOwner;

  useEffect(() => {
    if (id) {
      isSharedWithMe('terrain', id).then(shared => { setIsShared(shared); if (shared) recordShareView('terrain', id, 'terrain-detail'); });
    }
  }, [id]);

  useEffect(() => {
    if (terrain) setIsPublicState(terrain.isPublic ?? false);
  }, [terrain?.id, terrain?.isPublic]);

  const handleOpenPublicPreview = () => {
    if (!terrain || togglingPublic || isSharedItem) return;
    Haptics.selectionAsync();
    setShowPublicPreview(true);
  };

  const handleConfirmPublic = async () => {
    if (!terrain) return;
    setTogglingPublic(true);
    Haptics.selectionAsync();
    const newVal = !isPublicState;
    const { error } = await toggleItemPublic('terrains', terrain.id, newVal);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      setIsPublicState(newVal);
      setItemPublic('terrains', terrain.id, newVal);
    }
    setTogglingPublic(false);
    setShowPublicPreview(false);
  };

  const handleOpenShare = () => {
    if (!terrain) return;
    Haptics.selectionAsync();
    setShowShareModal(true);
  };
  
  const isFavorite = id ? isFavoriteTerrain(id) : false;

  const handleToggleFavorite = () => {
    if (id) {
      toggleFavoriteTerrain(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('terrain', 'deleteTerrain'),
      `${t('terrain', 'deleteConfirm')} "${terrain?.name}" ? ${t('terrain', 'deleteIrreversible')}`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('common', 'delete'),
          style: 'destructive',
          onPress: async () => {
            if (!terrain) return;
            try {
              const { error } = await deleteTerrain(terrain.id);
              if (error) {
                showAlert(t('common', 'error'), error);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (e: any) {
              showAlert(t('common', 'error'), e?.message || String(e));
            }
          },
        },
      ]
    );
  };

  // Get tournaments at this terrain, sorted by status then date
  const terrainTournaments = React.useMemo(() => {
    if (!terrain?.id) return [];
    const statusOrder: Record<string, number> = { 'En cours': 0, 'À venir': 1, 'Terminé': 2 };
    return tournaments
      .filter(t => t.terrainId === terrain.id)
      .sort((a, b) => {
        const sa = statusOrder[a.status] ?? 3;
        const sb = statusOrder[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [tournaments, terrain?.id]);

  // Meetups state
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [meetupsLoading, setMeetupsLoading] = useState(false);

  // Player ratings / reviews state
  const [terrainRating, setTerrainRating] = useState<TerrainRatingStats>({ avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] });
  const [terrainReviews, setTerrainReviews] = useState<TerrainReview[]>([]);
  const [myReview, setMyReview] = useState<TerrainReview | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewPhotoUri, setReviewPhotoUri] = useState<string | null>(null);
  const [reviewPhotoUrl, setReviewPhotoUrl] = useState<string | null>(null);
  const [uploadingReviewPhoto, setUploadingReviewPhoto] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [frequentPlayers, setFrequentPlayers] = useState<Array<{ id: string; name: string; matchCount: number; avatar?: string }>>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reviewVotes, setReviewVotes] = useState<Map<string, ReviewVoteCounts>>(new Map());
  const [votingReviewId, setVotingReviewId] = useState<string | null>(null);

  // Clubs using this terrain (many-to-many: clubs.terrain_id + terrain.club_id)
  const [linkedClubs, setLinkedClubs] = useState<{ id: string; name: string; city?: string; logo?: string }[]>([]);

  // Peak hours by day of week
  const [peakHours, setPeakHours] = useState<{ day: number; hours: number[]; peakHour: number; matchCount: number }[]>([]);
  const [peakSeason, setPeakSeason] = useState<'all' | 'spring' | 'summer' | 'autumn' | 'winter'>('all');

  // Helper: get season from a date
  const getSeasonFromDate = (d: Date): 'spring' | 'summer' | 'autumn' | 'winter' => {
    const month = d.getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  };

  useEffect(() => {
    if (!terrain?.id) return;
    // Count matches at this terrain
    const terrainMatches = allMatches.filter(m => m.terrainId === terrain.id);
    // Compute frequent players
    const playerCounts: Record<string, { count: number; name: string; avatar?: string }> = {};
    terrainMatches.forEach(m => {
      [...m.teamA.players, ...m.teamB.players].forEach((pid, idx) => {
        if (!playerCounts[pid]) {
          const inA = m.teamA.players.includes(pid);
          const nameIdx = inA ? m.teamA.players.indexOf(pid) : m.teamB.players.indexOf(pid);
          const names = inA ? m.teamA.playerNames : m.teamB.playerNames;
          const playerData = allPlayers.find(p => p.id === pid);
          playerCounts[pid] = { count: 0, name: names[nameIdx] || 'Joueur', avatar: playerData?.avatar };
        }
        playerCounts[pid].count++;
      });
    });
    const sorted = Object.entries(playerCounts)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    setFrequentPlayers(sorted);

    // Compute peak hours by day of week from matches + meetups, filtered by season
    const filteredMatches = peakSeason === 'all' ? terrainMatches : terrainMatches.filter(m => getSeasonFromDate(new Date(m.date)) === peakSeason);
    const filteredMeetups = peakSeason === 'all' ? meetups : meetups.filter(mt => getSeasonFromDate(new Date(mt.date)) === peakSeason);
    // dayHours[dayOfWeek][hour] = count
    const dayHours: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    filteredMatches.forEach(m => {
      const d = new Date(m.date);
      const dow = d.getDay(); // 0=Sun
      const h = d.getHours();
      dayHours[dow][h]++;
    });
    filteredMeetups.forEach(mt => {
      const d = new Date(mt.date);
      const dow = d.getDay();
      const h = d.getHours();
      dayHours[dow][h]++;
    });
    const peakData = dayHours.map((hours, day) => {
      const total = hours.reduce((s, v) => s + v, 0);
      let peakHour = 0;
      let peakVal = 0;
      hours.forEach((v, h) => { if (v > peakVal) { peakVal = v; peakHour = h; } });
      return { day, hours, peakHour, matchCount: total };
    });
    setPeakHours(peakData);
  }, [terrain?.id, allMatches.length, meetups.length, peakSeason]);

  // Fetch terrain reviews + votes
  useEffect(() => {
    if (!terrain?.id) return;
    fetchTerrainReviews(terrain.id).then(({ reviews: revs }) => {
      setTerrainReviews(revs);
      setTerrainRating(computeRatingStats(revs));
      if (user?.id) {
        const mine = revs.find(r => r.userId === user?.id);
        if (mine) setMyReview(mine);
      }
      // Fetch votes after reviews load
      fetchReviewVotes(terrain.id, user?.id).then(votes => setReviewVotes(votes));
    });
  }, [terrain?.id, user?.id]);

  const handleVote = React.useCallback(async (reviewId: string, voteType: 'helpful' | 'not_helpful') => {
    if (!user || votingReviewId) return;
    setVotingReviewId(reviewId);
    Haptics.selectionAsync();
    const { error } = await voteOnReview(reviewId, user.id, voteType);
    if (!error && terrain) {
      const updated = await fetchReviewVotes(terrain.id, user.id);
      setReviewVotes(updated);
    }
    setVotingReviewId(null);
  }, [user, votingReviewId, terrain]);

  // Photo upload handler
  const handleAddPhoto = React.useCallback(() => {
    if (!terrain || !canEdit || uploadingPhoto) return;
    Alert.alert(
      language === 'fr' ? 'Ajouter une photo' : 'Add Photo',
      '',
      [
        { text: language === 'fr' ? 'Appareil photo' : 'Camera', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { showAlert(language === 'fr' ? 'Permission requise' : 'Permission required', language === 'fr' ? 'Acces a la camera requis' : 'Camera access required'); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled && result.assets[0]) uploadTerrainPhoto(result.assets[0].uri);
        }},
        { text: language === 'fr' ? 'Galerie' : 'Gallery', onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { showAlert(language === 'fr' ? 'Permission requise' : 'Permission required', language === 'fr' ? 'Acces a la galerie requis' : 'Gallery access required'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
          if (!result.canceled && result.assets[0]) uploadTerrainPhoto(result.assets[0].uri);
        }},
        { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
      ]
    );
  }, [terrain, canEdit, uploadingPhoto]);

  const uploadTerrainPhoto = React.useCallback(async (uri: string) => {
    if (!terrain || !user) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImageToStorage('terrain-photos', `terrain-photos/${terrain.id}/${Date.now()}`, uri);
      if (url) {
        const updatedPhotos = [...(terrain.photos || []), url];
        await updateTerrain(terrain.id, { photos: updatedPhotos });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showAlert(language === 'fr' ? 'Erreur' : 'Error', language === 'fr' ? 'Echec du telechargement' : 'Upload failed');
      }
    } catch (e: any) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  }, [terrain, user, updateTerrain, showAlert, language]);

  const handleSubmitReview = React.useCallback(async () => {
    if (!terrain || !user || reviewRating === 0 || submittingReview) return;
    setSubmittingReview(true);
    const selfPlayer = allPlayers.find(p => (p as any).userId === user?.id);
    // Upload review photo if present
    let finalPhotoUrl = reviewPhotoUrl || undefined;
    if (reviewPhotoUri && !reviewPhotoUrl) {
      setUploadingReviewPhoto(true);
      try {
        const url = await uploadImageToStorage('terrain-photos', `terrain-photos/reviews/${terrain.id}/${Date.now()}`, reviewPhotoUri);
        if (url) finalPhotoUrl = url;
      } catch { /* silent */ }
      setUploadingReviewPhoto(false);
    }
    const { review, error: err } = await submitTerrainReview({
      terrainId: terrain.id,
      userId: user.id,
      playerId: selfPlayer?.id,
      playerName: selfPlayer?.name || user.username || user.email,
      rating: reviewRating,
      comment: reviewComment.trim() || undefined,
      photoUrl: finalPhotoUrl,
    });
    setSubmittingReview(false);
    if (err) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', err);
    } else if (review) {
      setMyReview(review);
      setTerrainReviews(prev => {
        const filtered = prev.filter(r => r.userId !== user.id);
        const updated = [review, ...filtered];
        setTerrainRating(computeRatingStats(updated));
        return updated;
      });
      setShowReviewModal(false);
      setReviewRating(0);
      setReviewComment('');
      setReviewPhotoUri(null);
      setReviewPhotoUrl(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [terrain, user, reviewRating, reviewComment, submittingReview, showAlert, language, allPlayers]);

  const [communityStats, setCommunityStats] = useState<TerrainCommunityStats | null>(null);
  const [communityStatsLoading, setCommunityStatsLoading] = useState(true);

  // Load community stats for this terrain
  useEffect(() => {
    if (!terrain?.id) return;
    const loadCommunityStats = async () => {
      setCommunityStatsLoading(true);
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('get_terrain_activity_stats');
        if (data && !error) {
          const allStats = (data as any[]);
          const scored = allStats.map((r: any) => {
            const recentM = Number(r.recent_matches) || 0;
            const recentC = Number(r.recent_challenges) || 0;
            const recentT = Number(r.recent_tournaments) || 0;
            const totalM = Number(r.total_matches) || 0;
            const totalC = Number(r.total_challenges) || 0;
            const totalT = Number(r.total_tournaments) || 0;
            const score = recentM * 5 + recentC * 4 + recentT * 8 + totalM + Math.round(totalC * 0.5) + totalT * 2;
            return { terrainId: r.terrain_id, score, recentM, recentC, recentT, totalM, totalC, totalT, peakDow: Number(r.peak_dow) || 0, peakHour: Number(r.peak_hour) || 0, peakDowCount: Number(r.peak_dow_count) || 0, peakHourCount: Number(r.peak_hour_count) || 0 };
          }).sort((a: any, b: any) => b.score - a.score);
          const rank = scored.findIndex((s: any) => s.terrainId === terrain.id);
          const myStats = scored.find((s: any) => s.terrainId === terrain.id);
          if (myStats) {
            setCommunityStats({
              totalMatches: myStats.totalM, recentMatches: myStats.recentM,
              totalChallenges: myStats.totalC, recentChallenges: myStats.recentC,
              totalTournaments: myStats.totalT, recentTournaments: myStats.recentT,
              peakDow: myStats.peakDow, peakHour: myStats.peakHour,
              peakDowCount: myStats.peakDowCount, peakHourCount: myStats.peakHourCount,
              popularityRank: rank + 1, popularityScore: myStats.score,
            });
          } else { setCommunityStats(null); }
        }
      } catch (e) { console.log('[TerrainDetail] Error loading community stats:', e); }
      setCommunityStatsLoading(false);
    };
    loadCommunityStats();
  }, [terrain?.id]);

  useEffect(() => {
    if (terrain?.id) {
      setMeetupsLoading(true);
      getMeetupsForTerrain(terrain.id).then(({ meetups: m }) => {
        setMeetups(m);
        setMeetupsLoading(false);
      });

      // Fetch all clubs that reference this terrain
      const supabase = getSupabaseClient();
      supabase
        .from('clubs')
        .select('id, name, city, logo')
        .eq('terrain_id', terrain.id)
        .then(({ data }) => {
          const clubs: { id: string; name: string; city?: string; logo?: string }[] = [];
          const seenIds = new Set<string>();
          // Add clubs from DB query (clubs.terrain_id = this terrain)
          if (data) {
            for (const c of data) {
              if (!seenIds.has(c.id)) { seenIds.add(c.id); clubs.push({ id: c.id, name: c.name, city: c.city, logo: c.logo }); }
            }
          }
          // Also include the terrain's own clubId if not already present
          if (terrain.clubId && !seenIds.has(terrain.clubId)) {
            clubs.push({ id: terrain.clubId, name: terrain.clubName || '', city: undefined, logo: undefined });
          }
          setLinkedClubs(clubs);
        });
    }
  }, [terrain?.id, terrain?.clubId, terrain?.clubName]);

  if (!terrain) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('terrain', 'terrainDetails')}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={styles.emptyText}>{t('terrain', 'terrainNotFound')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const typeConfig = config.terrainTypes.find(tc => tc.id === terrain.type) || config.terrainTypes[0];

  const typeColors: Record<string, { bg: string; text: string; light: string }> = {
    'Stabilisé': { bg: theme.primary, text: '#FFF', light: theme.primary + '15' },
    'Graviers': { bg: theme.warning, text: '#FFF', light: theme.warning + '15' },
    'Sable': { bg: '#F59E0B', text: '#FFF', light: '#F59E0B15' },
    'Cailloux': { bg: theme.textSecondary, text: '#FFF', light: theme.textSecondary + '15' },
    'Terre battue': { bg: theme.success, text: '#FFF', light: theme.success + '15' },
  };
  const colors = typeColors[terrain.type] || typeColors['Stabilisé'];

  const hasPhotos = !!(terrain.photos && terrain.photos.length > 0);

  const openMaps = () => {
    const latitude = terrain.location?.latitude || 0;
    const longitude = terrain.location?.longitude || 0;
    const label = encodeURIComponent(terrain.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });
    Linking.openURL(url);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('terrain', 'terrainDetails')}</Text>
        <View style={styles.headerActions}>
          {isShared && (
            <Pressable
              style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
              onPress={async () => {
                setIsSaving(true);
                const { newItemId, error } = await saveSharedItemToMyAccount('terrain', id!);
                setIsSaving(false);
                if (error) {
                  showAlert(t('common', 'error'), error);
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  showAlert(t('terrain', 'savedLabel'), t('terrain', 'terrainCopied'));
                  if (newItemId) router.replace(`/terrain/${newItemId}` as any);
                }
              }}
              disabled={isSaving}
            >
              <MaterialIcons name="save-alt" size={22} color={theme.accent} />
            </Pressable>
          )}
          <Pressable style={styles.shareButton} onPress={handleOpenShare}>
            <MaterialIcons name="share" size={22} color={theme.success} />
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
              onPress={() => router.push(`/terrain/edit/${terrain.id}`)}
            >
              <MaterialIcons name="edit" size={22} color={theme.primary} />
            </Pressable>
          )}
          {canEdit && (
            <Pressable
              style={styles.editButton}
              onPress={() => {
                Haptics.selectionAsync();
                Alert.alert(
                  language === 'fr' ? 'Actions avancees' : 'Advanced Actions',
                  '',
                  [
                    { text: language === 'fr' ? 'Fusionner avec un autre terrain' : 'Merge with another terrain', onPress: () => setShowMergePicker(true) },
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
        {/* Photo Gallery */}
        {hasPhotos ? (
          <View style={styles.photoSection}>
            <Pressable onPress={() => { setGalleryIndex(currentPhotoIndex); setShowPhotoGallery(true); }}>
              <Image
                source={{ uri: terrain.photos![currentPhotoIndex] }}
                style={styles.mainPhoto}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="fullscreen" size={16} color="#FFF" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>{terrain.photos!.length}</Text>
              </View>
            </Pressable>
            {terrain.photos!.length > 1 && (
              <View style={styles.photoIndicators}>
                {terrain.photos!.map((_, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.photoIndicator,
                      index === currentPhotoIndex && styles.photoIndicatorActive
                    ]}
                    onPress={() => setCurrentPhotoIndex(index)}
                  />
                ))}
              </View>
            )}
            {terrain.photos!.length > 1 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoThumbnails}
              >
                {terrain.photos!.map((photo, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.thumbnail,
                      index === currentPhotoIndex && styles.thumbnailActive
                    ]}
                    onPress={() => setCurrentPhotoIndex(index)}
                  >
                    <Image
                      source={{ uri: photo }}
                      style={styles.thumbnailImage}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
                {canEdit && !isSharedItem ? (
                  <Pressable
                    style={[styles.thumbnail, { backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary + '25', borderStyle: 'dashed' }]}
                    onPress={handleAddPhoto}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? <ActivityIndicator size="small" color={theme.primary} /> : <MaterialIcons name="add-a-photo" size={20} color={theme.primary} />}
                  </Pressable>
                ) : null}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.heroSection}>
            {canEdit && !isSharedItem ? (
              <Pressable
                style={{ position: 'absolute', top: 8, right: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                onPress={handleAddPhoto}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? <ActivityIndicator size="small" color={theme.primary} /> : <MaterialIcons name="add-a-photo" size={20} color={theme.primary} />}
              </Pressable>
            ) : null}
            <View style={[styles.terrainIcon, { backgroundColor: colors.bg }]}>
              <MaterialIcons name={typeConfig.icon as any} size={56} color="#FFF" />
            </View>
            <Text style={styles.terrainName}>{terrain.name}</Text>
            {sharedPermission ? (
              <View style={{ marginBottom: 8 }}>
                <SharedBadge permission={sharedPermission} />
              </View>
            ) : null}
            <View style={[styles.typeBadge, { backgroundColor: colors.light }]}>
              <MaterialIcons name={typeConfig.icon as any} size={16} color={colors.bg} />
              <Text style={[styles.typeBadgeText, { color: colors.bg }]}>{t('terrainTypes', terrain.type)}</Text>
            </View>
            <Text style={styles.typeDescription}>{t('terrainTypeDescs', terrain.type)}</Text>

            {/* Sponsor Banner — inside hero (no photos), only when sponsor_id is explicitly set */}
            {(terrain as any).sponsorId ? (
              <View style={{ width: '100%', marginTop: 12 }}>
                <SponsoredItemBanner sponsorId={(terrain as any).sponsorId} page="terrain-detail" style={{ marginBottom: 0 }} />
              </View>
            ) : null}
          </View>
        )}

        {/* Name and Type (when photos are shown) */}
        {hasPhotos && (
          <View style={styles.nameSection}>
            <Text style={styles.terrainNameLarge}>{terrain.name}</Text>
            {sharedPermission ? (
              <View style={{ marginBottom: 8 }}>
                <SharedBadge permission={sharedPermission} />
              </View>
            ) : null}
            <View style={[styles.typeBadge, { backgroundColor: colors.light }]}>
              <MaterialIcons name={typeConfig.icon as any} size={16} color={colors.bg} />
              <Text style={[styles.typeBadgeText, { color: colors.bg }]}>{t('terrainTypes', terrain.type)}</Text>
            </View>
            <Text style={styles.typeDescription}>{t('terrainTypeDescs', terrain.type)}</Text>

            {/* Sponsor Banner — inside name section (with photos), only when sponsor_id is explicitly set */}
            {(terrain as any).sponsorId ? (
              <View style={{ width: '100%', marginTop: 12 }}>
                <SponsoredItemBanner sponsorId={(terrain as any).sponsorId} page="terrain-detail" style={{ marginBottom: 0 }} />
              </View>
            ) : null}
          </View>
        )}



        {/* Terrain Type Tips — moved above environment */}
        <View style={[styles.section, isTablet && styles.tabletHalf]}>
          <Text style={styles.sectionTitle}>{t('terrain', 'playingTips')}</Text>
          <View style={[styles.tipsCard, { backgroundColor: colors.light, borderColor: colors.bg + '30' }]}>
            <View style={styles.tipsHeader}>
              <MaterialIcons name="tips-and-updates" size={24} color={colors.bg} />
              <Text style={[styles.tipsTitle, { color: colors.bg }]}>{t('terrain', 'terrainType')} {t('terrainTypes', terrain.type)}</Text>
            </View>
            <View style={styles.tipsList}>
              {terrain.type === 'Stabilisé' && (
                <>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipStabilise1')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipStabilise2')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipStabilise3')}</Text>
                </>
              )}
              {terrain.type === 'Graviers' && (
                <>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipGraviers1')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipGraviers2')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipGraviers3')}</Text>
                </>
              )}
              {terrain.type === 'Sable' && (
                <>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipSable1')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipSable2')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipSable3')}</Text>
                </>
              )}
              {terrain.type === 'Cailloux' && (
                <>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipCailloux1')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipCailloux2')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipCailloux3')}</Text>
                </>
              )}
              {terrain.type === 'Terre battue' && (
                <>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipTerreBattue1')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipTerreBattue2')}</Text>
                  <Text style={styles.tipItem}>{"•"} {t('terrain', 'tipTerreBattue3')}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Environment badge */}
        {(terrain as any).environment ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: (terrain as any).environment === 'indoor' ? theme.accent + '12' : theme.success + '12', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: (terrain as any).environment === 'indoor' ? theme.accent + '25' : theme.success + '25' }}>
              <MaterialIcons name={(terrain as any).environment === 'indoor' ? 'home' : 'wb-sunny'} size={18} color={(terrain as any).environment === 'indoor' ? theme.accent : theme.success} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: (terrain as any).environment === 'indoor' ? theme.accent : theme.success }}>
                {(terrain as any).environment === 'indoor' ? (language === 'fr' ? 'Interieur' : 'Indoor') : (language === 'fr' ? 'Exterieur' : 'Outdoor')}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={isTablet ? styles.tabletRow : undefined}>
        {/* Location */}
        <View style={[styles.section, isTablet && styles.tabletHalf]}>
          <Text style={styles.sectionTitle}>{t('terrain', 'addressSection')}</Text>
          <Pressable style={styles.locationCard} onPress={openMaps}>
            <View style={styles.locationIcon}>
              <MaterialIcons name="place" size={24} color={theme.primary} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationAddress}>{terrain.address}</Text>
              <Text style={styles.locationCity}>{terrain.city}</Text>
            </View>
            <MaterialIcons name="directions" size={24} color={theme.primary} />
          </Pressable>
          {(terrain.location?.latitude || terrain.location?.longitude) ? (
            <Pressable
              style={styles.mapButton}
              onPress={() => router.push({ pathname: '/(tabs)/map', params: { lat: String(terrain.location?.latitude || 0), lng: String(terrain.location?.longitude || 0), name: terrain.name, mf: String(Date.now()) } } as any)}
            >
              <MaterialIcons name="map" size={20} color={theme.primary} />
              <Text style={styles.mapButtonText}>{t('club', 'viewOnMap')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Clubs using this terrain */}
        {linkedClubs.length > 0 ? (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <Text style={styles.sectionTitle}>{linkedClubs.length > 1 ? (language === 'fr' ? 'CLUBS UTILISANT CE TERRAIN' : 'CLUBS USING THIS TERRAIN') : t('terrain', 'clubSection')}</Text>
            {linkedClubs.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.clubCard, linkedClubs.length > 1 && { marginBottom: 8 }]}
                onPress={() => router.push(`/club/${c.id}`)}
              >
                <View style={styles.clubIcon}>
                  {c.logo ? (
                    <Image source={{ uri: c.logo }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" transition={200} />
                  ) : (
                    <MaterialIcons name="home" size={24} color={theme.accent} />
                  )}
                </View>
                <View style={styles.clubInfo}>
                  <Text style={styles.clubName}>{c.name}</Text>
                  <Text style={styles.clubSubtitle}>{c.city || t('terrain', 'organizingClub')}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : terrain.clubName ? (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <Text style={styles.sectionTitle}>{t('terrain', 'clubSection')}</Text>
            <Pressable 
              style={styles.clubCard}
              onPress={() => terrain.clubId && router.push(`/club/${terrain.clubId}`)}
            >
              <View style={styles.clubIcon}>
                <MaterialIcons name="home" size={24} color={theme.accent} />
              </View>
              <View style={styles.clubInfo}>
                <Text style={styles.clubName}>{terrain.clubName}</Text>
                <Text style={styles.clubSubtitle}>{t('terrain', 'organizingClub')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>
          </View>
        ) : null}

        </View>

        {/* Quick Info — 3 per row, below address */}
        <View style={styles.quickInfoGrid}>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="sports-soccer" size={20} color={theme.primary} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.courtsCount}</Text>
            <Text style={styles.quickInfoLabel}>{terrain.courtsCount > 1 ? t('terrain', 'courtsLabelPlural') : t('terrain', 'courtsLabel')}</Text>
          </View>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: terrain.lighting ? theme.warning + '15' : theme.textMuted + '15' }]}>
              <MaterialIcons name="lightbulb" size={20} color={terrain.lighting ? theme.warning : theme.textMuted} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.lighting ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
            <Text style={styles.quickInfoLabel}>{t('terrain', 'lighting')}</Text>
          </View>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: terrain.covered ? theme.accent + '15' : theme.textMuted + '15' }]}>
              <MaterialIcons name="roofing" size={20} color={terrain.covered ? theme.accent : theme.textMuted} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.covered ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
            <Text style={styles.quickInfoLabel}>{t('terrain', 'covered')}</Text>
          </View>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: terrain.parking ? '#6366F1' + '15' : theme.textMuted + '15' }]}>
              <MaterialIcons name="local-parking" size={20} color={terrain.parking ? '#6366F1' : theme.textMuted} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.parking ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
            <Text style={styles.quickInfoLabel}>{t('terrain', 'parking')}</Text>
          </View>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: terrain.toilets ? '#EC4899' + '15' : theme.textMuted + '15' }]}>
              <MaterialIcons name="wc" size={20} color={terrain.toilets ? '#EC4899' : theme.textMuted} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.toilets ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
            <Text style={styles.quickInfoLabel}>{t('terrain', 'toilets')}</Text>
          </View>
          <View style={styles.quickInfoItem}>
            <View style={[styles.quickInfoIcon, { backgroundColor: terrain.publicAccess ? theme.success + '15' : theme.error + '15' }]}>
              <MaterialIcons name={terrain.publicAccess ? 'public' : 'lock'} size={20} color={terrain.publicAccess ? theme.success : theme.error} />
            </View>
            <Text style={styles.quickInfoValue}>{terrain.publicAccess ? t('terrain', 'publicLabel') : t('terrain', 'privateLabel')}</Text>
            <Text style={styles.quickInfoLabel}>{t('terrain', 'accessLabel')}</Text>
          </View>
        </View>

        {/* Description */}
        {terrain.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('terrain', 'descriptionLabel')}</Text>
            <View style={styles.descriptionCard}>
              <Text style={styles.descriptionText}>{terrain.description}</Text>
            </View>
          </View>
        )}

        <View style={isTablet ? styles.tabletRow : undefined}>
        {/* Facilities */}
        {terrain.facilities && terrain.facilities.length > 0 && (
          <View style={[styles.section, isTablet && styles.tabletHalf]}>
            <Text style={styles.sectionTitle}>{t('terrain', 'facilitiesSection')}</Text>
            <View style={styles.facilitiesGrid}>
              {terrain.facilities.map((facility, index) => (
                <View key={index} style={styles.facilityItem}>
                  <MaterialIcons name="check-circle" size={18} color={theme.success} />
                  <Text style={styles.facilityText}>{facility}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        </View>

        {/* Peak Hours Section */}
        {(() => {
          const hasAnyData = peakHours.length === 7 && (allMatches.some(m => m.terrainId === terrain.id) || meetups.length > 0);
          return hasAnyData ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'fr' ? 'HEURES D\'AFFLUENCE' : 'PEAK HOURS'}</Text>
            <View style={{ backgroundColor: theme.surface, borderRadius: 20, overflow: 'hidden', ...theme.shadows.card }}>
              {/* Header with total stats */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#6366F110', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="insights" size={22} color="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>{language === 'fr' ? 'Affluence hebdomadaire' : 'Weekly Activity'}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                    {(() => {
                      const total = peakHours.reduce((s, ph) => s + ph.matchCount, 0);
                      return `${total} ${language === 'fr' ? 'activites enregistrees' : 'recorded activities'}`;
                    })()}
                  </Text>
                </View>
                {/* Best day highlight */}
                {(() => {
                  const dayNames = language === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const bestDay = peakHours.reduce((best, ph) => ph.matchCount > best.matchCount ? ph : best, peakHours[0]);
                  return bestDay.matchCount > 0 ? (
                    <View style={{ alignItems: 'center', backgroundColor: '#6366F110', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1', letterSpacing: 0.3 }}>{language === 'fr' ? 'MEILLEUR' : 'BEST'}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#6366F1', marginTop: 1 }}>{dayNames[bestDay.day]}</Text>
                    </View>
                  ) : null;
                })()}
              </View>

              {/* Season Selector - pill style */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 14 }}>
                {([
                  { id: 'all' as const, label: language === 'fr' ? 'Toutes saisons' : 'All seasons', icon: 'date-range', color: '#6366F1' },
                  { id: 'spring' as const, label: language === 'fr' ? 'Printemps' : 'Spring', icon: 'local-florist', color: '#10B981' },
                  { id: 'summer' as const, label: language === 'fr' ? 'Ete' : 'Summer', icon: 'wb-sunny', color: '#F59E0B' },
                  { id: 'autumn' as const, label: language === 'fr' ? 'Automne' : 'Autumn', icon: 'eco', color: '#D97706' },
                  { id: 'winter' as const, label: language === 'fr' ? 'Hiver' : 'Winter', icon: 'ac-unit', color: '#3B82F6' },
                ] as const).map(season => {
                  const isActive = peakSeason === season.id;
                  return (
                    <Pressable
                      key={season.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: isActive ? season.color : 'transparent', borderWidth: 1.5, borderColor: isActive ? season.color : theme.border }}
                      onPress={() => { setPeakSeason(season.id); Haptics.selectionAsync(); }}
                    >
                      <MaterialIcons name={season.icon as any} size={13} color={isActive ? '#FFF' : season.color} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#FFF' : theme.textSecondary }}>{season.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* No data for selected season */}
              {peakSeason !== 'all' && !peakHours.some(ph => ph.matchCount > 0) ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <MaterialIcons name="cloud-off" size={28} color={theme.textMuted} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, textAlign: 'center' }}>
                    {language === 'fr' ? 'Aucune donnee pour cette saison' : 'No data for this season'}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
                    {language === 'fr' ? 'Jouez des matchs pour alimenter les statistiques' : 'Play matches to populate statistics'}
                  </Text>
                </View>
              ) : (
              <>
              {/* Day-by-day bar chart */}
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {(() => {
                const dayNames = language === 'fr'
                  ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
                  : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const maxCount = Math.max(...peakHours.map(ph => ph.matchCount), 1);
                const orderedDays = [1, 2, 3, 4, 5, 6, 0];
                return (
                  <View style={{ gap: 4 }}>
                    {orderedDays.map(dayIdx => {
                      const ph = peakHours[dayIdx];
                      const barWidth = ph.matchCount > 0 ? Math.max(6, (ph.matchCount / maxCount) * 100) : 0;
                      const isToday = new Date().getDay() === dayIdx;
                      const hasActivity = ph.matchCount > 0;
                      const topHours = ph.hours.map((v, h) => ({ h, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 2);
                      const intensity = ph.matchCount / maxCount;
                      const barColor = intensity >= 0.7 ? '#EF4444' : intensity >= 0.4 ? '#F59E0B' : '#6366F1';
                      return (
                        <View key={dayIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, backgroundColor: isToday ? '#6366F106' : 'transparent', borderRadius: 10, paddingHorizontal: 4 }}>
                          <View style={{ width: 32 }}>
                            <Text style={{ fontSize: 12, fontWeight: isToday ? '800' : '600', color: isToday ? '#6366F1' : theme.textPrimary }}>{dayNames[dayIdx]}</Text>
                          </View>
                          <View style={{ flex: 1, height: 22, backgroundColor: theme.backgroundSecondary, borderRadius: 8, overflow: 'hidden' }}>
                            {hasActivity ? (
                              <View style={{ height: '100%' as any, width: `${barWidth}%`, backgroundColor: barColor, borderRadius: 8, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6, minWidth: 22 }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>{ph.matchCount}</Text>
                              </View>
                            ) : (
                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 9, color: theme.textMuted }}>-</Text>
                              </View>
                            )}
                          </View>
                          {/* Peak hour chips */}
                          <View style={{ width: 68, flexDirection: 'row', gap: 3, justifyContent: 'flex-end' }}>
                            {topHours.length > 0 ? topHours.slice(0, 1).map(x => (
                              <View key={x.h} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: barColor + '15', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                                <MaterialIcons name="schedule" size={8} color={barColor} />
                                <Text style={{ fontSize: 9, fontWeight: '700', color: barColor }}>{x.h}h</Text>
                              </View>
                            )) : (
                              <Text style={{ fontSize: 9, color: theme.textMuted }}>-</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
              </View>

              {/* Legend + insights */}
              <View style={{ borderTopWidth: 1, borderTopColor: theme.border + '50', paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
                {/* Color legend */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  {[
                    { color: '#6366F140', label: language === 'fr' ? 'Faible' : 'Low' },
                    { color: '#6366F1', label: language === 'fr' ? 'Modere' : 'Moderate' },
                    { color: '#F59E0B', label: language === 'fr' ? 'Moyen' : 'Medium' },
                    { color: '#EF4444', label: language === 'fr' ? 'Eleve' : 'High' },
                  ].map((leg, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: leg.color }} />
                      <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '600' }}>{leg.label}</Text>
                    </View>
                  ))}
                </View>
                {/* Quick insight */}
                {(() => {
                  const dayNamesFull = language === 'fr' ? ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const bestDay = peakHours.reduce((best, ph) => ph.matchCount > best.matchCount ? ph : best, peakHours[0]);
                  if (bestDay.matchCount === 0) return null;
                  const topHour = bestDay.hours.indexOf(Math.max(...bestDay.hours));
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366F108', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#6366F115' }}>
                      <MaterialIcons name="tips-and-updates" size={16} color="#6366F1" />
                      <Text style={{ flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 }}>
                        {language === 'fr'
                          ? `Le ${dayNamesFull[bestDay.day]} est le jour le plus actif, surtout vers ${topHour}h.`
                          : `${dayNamesFull[bestDay.day]} is the most active day, especially around ${topHour > 12 ? topHour - 12 : topHour}${topHour >= 12 ? 'PM' : 'AM'}.`}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              </>
              )}
            </View>
          </View>
        ) : null;
        })()}

        {/* Community Stats Section */}
        {communityStats ? (() => {
          const dayNames = language === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const totalRecent = communityStats.recentMatches + communityStats.recentChallenges + communityStats.recentTournaments;
          const totalAll = communityStats.totalMatches + communityStats.totalChallenges + communityStats.totalTournaments;
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{language === 'fr' ? 'STATISTIQUES COMMUNAUTAIRES' : 'COMMUNITY STATS'}</Text>
              <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 16, ...theme.shadows.card, gap: 14 }}>
                {/* Popularity + Rank Row */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {communityStats.popularityRank ? (
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: communityStats.popularityRank <= 3 ? '#D4A01712' : communityStats.popularityRank <= 10 ? '#78909C12' : '#F1F5F9', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: communityStats.popularityRank <= 3 ? '#D4A01725' : communityStats.popularityRank <= 10 ? '#78909C20' : theme.border }}>
                      <Text style={{ fontSize: 28, fontWeight: '900', color: communityStats.popularityRank <= 3 ? '#D4A017' : communityStats.popularityRank <= 10 ? '#78909C' : theme.textSecondary }}>#{communityStats.popularityRank}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 }}>{language === 'fr' ? 'Classement' : 'Ranking'}</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#22C55E12', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#22C55E25' }}>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: '#22C55E' }}>{totalRecent}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 }}>{language === 'fr' ? 'Ce mois' : 'This month'}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#3B82F612', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#3B82F625' }}>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: '#3B82F6' }}>{totalAll}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 }}>{language === 'fr' ? 'Total' : 'Total'}</Text>
                  </View>
                </View>

                {/* Activity breakdown */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3B82F608', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#3B82F615' }}>
                    <MaterialIcons name="sports" size={16} color="#3B82F6" />
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#3B82F6' }}>{communityStats.totalMatches}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>{language === 'fr' ? 'Matchs' : 'Matches'}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7C3AED08', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#7C3AED15' }}>
                    <MaterialIcons name="gps-fixed" size={16} color="#7C3AED" />
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#7C3AED' }}>{communityStats.totalChallenges}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>{language === 'fr' ? 'Defis' : 'Challenges'}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B08', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#F59E0B15' }}>
                    <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#F59E0B' }}>{communityStats.totalTournaments}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>{language === 'fr' ? 'Tournois' : 'Tournaments'}</Text>
                    </View>
                  </View>
                </View>

                {/* Community peak hours */}
                {communityStats.peakDowCount > 0 && communityStats.peakHourCount > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#6366F108', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#6366F118' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#6366F115', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="schedule" size={20} color="#6366F1" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>{language === 'fr' ? 'Pic communautaire' : 'Community Peak'}</Text>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                        {dayNames[communityStats.peakDow]} ~{communityStats.peakHour}h ({communityStats.peakHourCount} {language === 'fr' ? 'parties' : 'games'})
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })() : communityStatsLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : null}

        {/* Activity History Button */}
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366F112', paddingVertical: 14, borderRadius: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#6366F125' }}
          onPress={() => router.push(`/terrain-activity/${terrain.id}` as any)}
        >
          <MaterialIcons name="calendar-month" size={18} color="#6366F1" />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#6366F1' }}>{language === 'fr' ? 'Voir l\'historique d\'activite' : 'View Activity History'}</Text>
          <MaterialIcons name="chevron-right" size={18} color="#6366F1" />
        </Pressable>

        {/* Terrain Activity & Frequent Players */}
        {frequentPlayers.length > 0 ? (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>{language === 'fr' ? 'ACTIVITE DU TERRAIN' : 'TERRAIN ACTIVITY'}</Text>
            </View>
            {/* Frequent players */}
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, ...theme.shadows.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialIcons name="people" size={16} color={theme.primary} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{language === 'fr' ? 'Joueurs frequents' : 'Frequent Players'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {frequentPlayers.map((fp) => (
                  <Pressable key={fp.id} style={{ alignItems: 'center', width: 60 }} onPress={() => router.push(`/player/${fp.id}` as any)}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4 }}>
                      {fp.avatar ? (
                        <Image source={{ uri: fp.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.primary }}>{fp.name.charAt(0)}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textPrimary, textAlign: 'center' }} numberOfLines={1}>{fp.name.split(' ')[0]}</Text>
                    <Text style={{ fontSize: 9, color: theme.textMuted }}>{fp.count} {language === 'fr' ? 'm.' : 'g.'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Upcoming Meetups */}
        <View style={styles.section}>
          <View style={styles.meetupSectionHeader}>
            <Text style={styles.sectionTitle}>{t('meetup', 'upcomingMeetups').toUpperCase()}</Text>
            <Pressable
              style={styles.meetupAddBtn}
              onPress={() => router.push({ pathname: '/meetup/new', params: { terrainId: terrain.id } } as any)}
            >
              <MaterialIcons name="add" size={18} color={theme.primary} />
              <Text style={styles.meetupAddBtnText}>{t('meetup', 'createMeetupShort')}</Text>
            </Pressable>
          </View>
          {meetups.length > 0 ? (
            meetups.slice(0, 5).map((m, idx) => {
              const mDate = new Date(m.date);
              const isOwner = user && m.creator_id === user.id;
              return (
                <Pressable
                  key={m.id}
                  style={styles.meetupCard}
                  onPress={() => router.push(`/meetup/${m.id}` as any)}
                >
                  <View style={styles.meetupDateBadge}>
                    <Text style={styles.meetupDateDay}>{mDate.getDate()}</Text>
                    <Text style={styles.meetupDateMonth}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                  </View>
                  <View style={styles.meetupCardContent}>
                    <Text style={styles.meetupCardTitle} numberOfLines={1}>{m.title}</Text>
                    <Text style={styles.meetupCardTime}>
                      {mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {isOwner ? (
                    <View style={styles.meetupOwnerBadge}>
                      <MaterialIcons name="person" size={12} color={theme.primary} />
                    </View>
                  ) : null}
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </Pressable>
              );
            })
          ) : (
            <View style={styles.meetupEmptyCard}>
              <MaterialIcons name="event" size={32} color={theme.textMuted} />
              <Text style={styles.meetupEmptyText}>{t('meetup', 'noMeetups')}</Text>
            </View>
          )}
        </View>

        {/* Associated Tournaments */}
        <View style={styles.section}>
          <View style={styles.tournamentSectionHeader}>
            <Text style={styles.sectionTitle}>{t('terrain', 'associatedTournaments').toUpperCase()}</Text>
            {terrainTournaments.length > 0 ? (
              <View style={styles.tournamentCountBadge}>
                <Text style={styles.tournamentCountText}>{terrainTournaments.length}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              style={styles.tournamentAddBtn}
              onPress={() => router.push({ pathname: '/tournament/new', params: { terrainId: terrain.id, terrainName: terrain.name } } as any)}
            >
              <MaterialIcons name="add" size={16} color={theme.carreauColor} />
              <Text style={styles.tournamentAddBtnText}>{t('terrain', 'addTournamentHere')}</Text>
            </Pressable>
          </View>

          {terrainTournaments.length > 0 ? (
            <>
              {(showAllTournaments ? terrainTournaments : terrainTournaments.slice(0, 3)).map((tournament) => {
                const statusConfig: Record<string, { bg: string; color: string; icon: string }> = {
                  'À venir': { bg: theme.primary + '15', color: theme.primary, icon: 'event' },
                  'En cours': { bg: theme.warning + '15', color: theme.warning, icon: 'play-circle-filled' },
                  'Terminé': { bg: theme.success + '15', color: theme.success, icon: 'check-circle' },
                };
                const sc = statusConfig[tournament.status] || statusConfig['À venir'];
                return (
                  <Pressable
                    key={tournament.id}
                    style={({ pressed }) => [styles.tournamentCard, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
                    onPress={() => router.push(`/tournament/${tournament.id}`)}
                  >
                    <View style={[styles.tournamentIcon, { backgroundColor: sc.bg }]}>
                      <MaterialIcons name="emoji-events" size={20} color={sc.color} />
                    </View>
                    <View style={styles.tournamentInfo}>
                      <Text style={styles.tournamentName} numberOfLines={1}>{tournament.name}</Text>
                      <View style={styles.tournamentMetaRow}>
                        <MaterialIcons name="event" size={11} color={theme.textMuted} />
                        <Text style={styles.tournamentDate}>
                          {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                        <View style={styles.tournamentDot} />
                        <Text style={styles.tournamentFormat}>{tournament.format}</Text>
                      </View>
                      <View style={[styles.tournamentStatusBadge, { backgroundColor: sc.bg }]}>
                        <MaterialIcons name={sc.icon as any} size={10} color={sc.color} />
                        <Text style={[styles.tournamentStatusText, { color: sc.color }]}>
                          {tournament.status === 'À venir' ? t('tournamentStatus', 'upcoming') : tournament.status === 'En cours' ? t('tournamentStatus', 'inProgress') : t('tournamentStatus', 'completed')}
                        </Text>
                      </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </Pressable>
                );
              })}
              {terrainTournaments.length > 3 && !showAllTournaments ? (
                <Pressable
                  style={({ pressed }) => [styles.showAllTournamentsBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => setShowAllTournaments(true)}
                >
                  <Text style={styles.showAllTournamentsText}>
                    {t('terrain', 'showAllTournaments')} ({terrainTournaments.length - 3} {language === 'fr' ? 'de plus' : 'more'})
                  </Text>
                  <MaterialIcons name="expand-more" size={18} color={theme.carreauColor} />
                </Pressable>
              ) : null}
              {showAllTournaments && terrainTournaments.length > 3 ? (
                <Pressable
                  style={({ pressed }) => [styles.showAllTournamentsBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => setShowAllTournaments(false)}
                >
                  <Text style={styles.showAllTournamentsText}>{language === 'fr' ? 'Voir moins' : 'Show less'}</Text>
                  <MaterialIcons name="expand-less" size={18} color={theme.carreauColor} />
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.tournamentEmptyCard}>
              <View style={styles.tournamentEmptyIconBg}>
                <MaterialIcons name="emoji-events" size={32} color={theme.textMuted} />
              </View>
              <Text style={styles.tournamentEmptyText}>{t('terrain', 'noAssociatedTournaments')}</Text>
              <Pressable
                style={({ pressed }) => [styles.tournamentEmptyBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: '/tournament/new', params: { terrainId: terrain.id, terrainName: terrain.name } } as any)}
              >
                <MaterialIcons name="add" size={16} color="#FFF" />
                <Text style={styles.tournamentEmptyBtnText}>{t('terrain', 'addTournamentHere')}</Text>
              </Pressable>
            </View>
          )}
        </View>
        {/* Reviews & Ratings Section */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>{language === 'fr' ? 'AVIS ET NOTES' : 'REVIEWS & RATINGS'}</Text>
            {user ? (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (myReview) { setReviewRating(myReview.rating); setReviewComment(myReview.comment || ''); setReviewPhotoUrl(myReview.photoUrl || null); }
                  setShowReviewModal(true);
                }}
              >
                <MaterialIcons name={myReview ? 'edit' : 'rate-review'} size={14} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{myReview ? (language === 'fr' ? 'Modifier' : 'Edit') : (language === 'fr' ? 'Donner un avis' : 'Write Review')}</Text>
              </Pressable>
            ) : null}
          </View>
          {/* Rating display */}
          {terrainRating.count > 0 ? (
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, ...theme.shadows.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, fontWeight: '900', color: '#F59E0B' }}>{terrainRating.avg}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <MaterialIcons key={star} name={star <= Math.round(terrainRating.avg) ? 'star' : 'star-border'} size={14} color="#F59E0B" />
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{terrainRating.count} {language === 'fr' ? 'avis' : 'reviews'}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  {[5, 4, 3, 2, 1].map(level => (
                    <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 10, color: theme.textMuted, width: 8 }}>{level}</Text>
                      <View style={{ flex: 1, height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${terrainRating.count > 0 ? (terrainRating.distribution[level - 1] / terrainRating.count) * 100 : 0}%`, backgroundColor: '#F59E0B', borderRadius: 3 }} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 24, alignItems: 'center', ...theme.shadows.card, marginBottom: 12 }}>
              <MaterialIcons name="star-border" size={36} color={theme.textMuted} />
              <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 8 }}>{language === 'fr' ? 'Aucun avis pour le moment' : 'No reviews yet'}</Text>
            </View>
          )}
          {/* Review list (up to 5) */}
          {terrainReviews.slice(0, 5).map(rev => {
            const matchesOnTerrain = allMatches.filter(m => m.terrainId === terrain.id && [...m.teamA.players, ...m.teamB.players].some(pid => {
              const p = allPlayers.find(pl => pl.id === pid);
              return p && (p as any).userId === rev.userId;
            }));
            const hasPlayedHere = matchesOnTerrain.length > 0;
            // Confidence score: based on matches on this terrain + account age + review content
            const confidenceScore = (() => {
              let score = 0;
              // Matches played on this terrain (max 40 pts)
              score += Math.min(matchesOnTerrain.length * 10, 40);
              // Account age bonus (max 30 pts: 1pt per month, up to 30 months)
              const accountAgeMonths = Math.floor((Date.now() - new Date(rev.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000));
              score += Math.min(accountAgeMonths, 30);
              // Has comment (10 pts)
              if (rev.comment && rev.comment.length > 10) score += 10;
              // Has photo (10 pts)
              if (rev.photoUrl) score += 10;
              // Verified player (10 pts)
              if (hasPlayedHere) score += 10;
              return Math.min(score, 100);
            })();
            const confidenceColor = confidenceScore >= 70 ? '#10B981' : confidenceScore >= 40 ? '#F59E0B' : '#94A3B8';
            const confidenceLabel = confidenceScore >= 70 ? (language === 'fr' ? 'Fiable' : 'Reliable') : confidenceScore >= 40 ? (language === 'fr' ? 'Moyen' : 'Medium') : (language === 'fr' ? 'Faible' : 'Low');
            return (
            <View key={rev.id} style={{ backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 8, ...theme.shadows.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.primary }}>{(rev.playerName || '?').charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{rev.playerName || (language === 'fr' ? 'Anonyme' : 'Anonymous')}</Text>
                    {hasPlayedHere ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#10B98112', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                        <MaterialIcons name="verified" size={10} color="#10B981" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#10B981' }}>{language === 'fr' ? 'Verifie' : 'Verified'}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: confidenceColor + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: confidenceColor + '25' }}>
                      <MaterialIcons name="shield" size={9} color={confidenceColor} />
                      <Text style={{ fontSize: 9, fontWeight: '700', color: confidenceColor }}>{confidenceScore} - {confidenceLabel}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>{new Date(rev.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 1 }}>
                  {[1, 2, 3, 4, 5].map(s => <MaterialIcons key={s} name={s <= rev.rating ? 'star' : 'star-border'} size={14} color="#F59E0B" />)}
                </View>
              </View>
              {rev.comment ? <Text style={{ fontSize: 13, color: theme.textPrimary, lineHeight: 19 }}>{rev.comment}</Text> : null}
              {rev.photoUrl ? (
                <Pressable style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }} onPress={() => { setGalleryIndex(0); /* could open photo fullscreen */ }}>
                  <Image source={{ uri: rev.photoUrl }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" transition={200} />
                </Pressable>
              ) : null}
              {/* Voting + Report Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '60' }}>
                {/* Helpful / Not Helpful Votes */}
                {user ? (() => {
                  const vc = reviewVotes.get(rev.id) || { helpful: 0, notHelpful: 0, userVote: null };
                  const isVoting = votingReviewId === rev.id;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Pressable
                        onPress={() => handleVote(rev.id, 'helpful')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: vc.userVote === 'helpful' ? '#22C55E15' : theme.backgroundSecondary, borderWidth: 1, borderColor: vc.userVote === 'helpful' ? '#22C55E30' : 'transparent' }}
                        disabled={isVoting}
                        hitSlop={4}
                      >
                        <MaterialIcons name="thumb-up" size={13} color={vc.userVote === 'helpful' ? '#22C55E' : theme.textMuted} />
                        {vc.helpful > 0 ? <Text style={{ fontSize: 11, fontWeight: '700', color: vc.userVote === 'helpful' ? '#22C55E' : theme.textMuted }}>{vc.helpful}</Text> : null}
                      </Pressable>
                      <Pressable
                        onPress={() => handleVote(rev.id, 'not_helpful')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: vc.userVote === 'not_helpful' ? '#EF444415' : theme.backgroundSecondary, borderWidth: 1, borderColor: vc.userVote === 'not_helpful' ? '#EF444430' : 'transparent' }}
                        disabled={isVoting}
                        hitSlop={4}
                      >
                        <MaterialIcons name="thumb-down" size={13} color={vc.userVote === 'not_helpful' ? '#EF4444' : theme.textMuted} />
                        {vc.notHelpful > 0 ? <Text style={{ fontSize: 11, fontWeight: '700', color: vc.userVote === 'not_helpful' ? '#EF4444' : theme.textMuted }}>{vc.notHelpful}</Text> : null}
                      </Pressable>
                    </View>
                  );
                })() : <View />}
                {/* Report button */}
                {user && rev.userId !== user.id ? (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        language === 'fr' ? 'Signaler cet avis' : 'Report this review',
                        language === 'fr' ? 'Cet avis sera examine par notre equipe de moderation.' : 'This review will be examined by our moderation team.',
                        [
                          { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
                          { text: language === 'fr' ? 'Signaler' : 'Report', style: 'destructive', onPress: async () => {
                            const { error: flagErr } = await flagReview(rev.id);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            showAlert(
                              language === 'fr' ? 'Signalement envoye' : 'Report sent',
                              language === 'fr' ? 'Merci, notre equipe examinera cet avis.' : 'Thanks, our team will review this.'
                            );
                          }},
                        ]
                      );
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    hitSlop={8}
                  >
                    <MaterialIcons name="flag" size={12} color={theme.textMuted} />
                    <Text style={{ fontSize: 10, color: theme.textMuted }}>{language === 'fr' ? 'Signaler' : 'Report'}</Text>
                  </Pressable>
                ) : <View />}
              </View>
              {/* Delete own review */}
              {user && rev.userId === user.id ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      language === 'fr' ? 'Supprimer votre avis ?' : 'Delete your review?',
                      '',
                      [
                        { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
                        { text: language === 'fr' ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => {
                          await deleteTerrainReview(rev.id);
                          setMyReview(null);
                          setTerrainReviews(prev => {
                            const updated = prev.filter(r => r.id !== rev.id);
                            setTerrainRating(computeRatingStats(updated));
                            return updated;
                          });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }},
                      ]
                    );
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-end' }}
                  hitSlop={8}
                >
                  <MaterialIcons name="delete-outline" size={12} color={theme.error} />
                  <Text style={{ fontSize: 10, color: theme.error }}>{language === 'fr' ? 'Supprimer' : 'Delete'}</Text>
                </Pressable>
              ) : null}
            </View>
            );
          })}
        </View>

        {/* ===== SIMPLIFIED VISIBILITY ===== */}
        {canEdit && !isSharedItem && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'fr' ? 'VISIBILITE' : 'VISIBILITY'}</Text>
            <Pressable
              style={styles.visibilityCard}
              onPress={async () => {
                if (togglingPublic || !terrain) return;
                Haptics.selectionAsync();
                setTogglingPublic(true);
                const newVal = !isPublicState;
                const { error } = await toggleItemPublic('terrains', terrain.id, newVal);
                if (error) { showAlert(t('common', 'error'), error); }
                else { setIsPublicState(newVal); setItemPublic('terrains', terrain.id, newVal); }
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
          </View>
        )}

        {/* Modification Logs - only visible to owner */}
        <ModificationLogsSection
          itemType="terrain"
          itemId={id!}
          isOwner={!isSharedItem && !!user?.id}
        />
      </ScrollView>

      {/* ===== PUBLIC PREVIEW MODAL ===== */}
      <Modal visible={showPublicPreview} animationType="slide" transparent>
        <View style={styles.pvOverlay}>
          <View style={styles.pvModal}>
            <View style={styles.pvHeader}>
              <View style={[styles.pvHeaderIcon, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="public" size={22} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pvHeaderTitle}>{t('preview', 'publicTerrainTitle')}</Text>
                <Text style={styles.pvHeaderSub}>{t('preview', 'publicTerrainDesc')}</Text>
              </View>
              <Pressable style={styles.pvCloseBtn} onPress={() => setShowPublicPreview(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.pvScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.pvCard}>
                <View style={styles.pvAvatarRow}>
                  <View style={[styles.pvAvatar, { backgroundColor: colors.bg }]}>
                    <MaterialIcons name={typeConfig.icon as any} size={28} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pvName}>{terrain.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialIcons name={typeConfig.icon as any} size={14} color={colors.bg} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bg }}>{t('terrainTypes', terrain.type)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.pvLocationRow}>
                  <MaterialIcons name="place" size={14} color={theme.textSecondary} />
                  <Text style={styles.pvLocationText}>{terrain.address}, {terrain.city}</Text>
                </View>

                {terrain.clubName ? (
                  <View style={styles.pvInfoRow}>
                    <View style={styles.pvInfoPill}>
                      <MaterialIcons name="home" size={12} color={theme.accent} />
                      <Text style={[styles.pvInfoText, { color: theme.accent }]}>{terrain.clubName}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.pvStatsRow}>
                  <View style={styles.pvStatItem}>
                    <Text style={styles.pvStatValue}>{terrain.courtsCount}</Text>
                    <Text style={styles.pvStatLabel}>{terrain.courtsCount > 1 ? t('terrain', 'courtsLabelPlural') : t('terrain', 'courtsLabel')}</Text>
                  </View>
                  <View style={styles.pvStatDivider} />
                  <View style={styles.pvStatItem}>
                    <Text style={[styles.pvStatValue, { color: terrain.lighting ? theme.warning : theme.textMuted }]}>{terrain.lighting ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
                    <Text style={styles.pvStatLabel}>{t('terrain', 'lighting')}</Text>
                  </View>
                  <View style={styles.pvStatDivider} />
                  <View style={styles.pvStatItem}>
                    <Text style={[styles.pvStatValue, { color: terrain.covered ? theme.accent : theme.textMuted }]}>{terrain.covered ? t('terrain', 'yesLabel') : t('terrain', 'noLabel')}</Text>
                    <Text style={styles.pvStatLabel}>{t('terrain', 'covered')}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.pvNote}>
                <MaterialIcons name="map" size={16} color={theme.primary} />
                <Text style={styles.pvNoteText}>{t('preview', 'geoNoteTerrain')}</Text>
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

      {/* Photo Gallery Fullscreen Modal */}
      <Modal visible={showPhotoGallery} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Gallery Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
              <Pressable onPress={() => setShowPhotoGallery(false)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="close" size={24} color="#FFF" />
              </Pressable>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF' }}>{galleryIndex + 1} / {terrain.photos?.length || 0}</Text>
              {canEdit && !isSharedItem ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      language === 'fr' ? 'Supprimer cette photo ?' : 'Delete this photo?',
                      '',
                      [
                        { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' },
                        { text: language === 'fr' ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => {
                          const updatedPhotos = (terrain.photos || []).filter((_: any, i: number) => i !== galleryIndex);
                          await updateTerrain(terrain.id, { photos: updatedPhotos });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          if (galleryIndex >= updatedPhotos.length && galleryIndex > 0) setGalleryIndex(galleryIndex - 1);
                          if (updatedPhotos.length === 0) setShowPhotoGallery(false);
                        }},
                      ]
                    );
                  }}
                  hitSlop={8}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <MaterialIcons name="delete" size={22} color="#EF4444" />
                </Pressable>
              ) : <View style={{ width: 40 }} />}
            </View>
            {/* Photo Display */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }}>
              {terrain.photos && terrain.photos[galleryIndex] ? (
                <Image
                  source={{ uri: terrain.photos[galleryIndex] }}
                  style={{ width: '100%', height: '80%', borderRadius: 12 }}
                  contentFit="contain"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              ) : null}
            </View>
            {/* Navigation arrows */}
            {terrain.photos && terrain.photos.length > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 32, paddingBottom: 24 }}>
                <Pressable
                  onPress={() => { if (galleryIndex > 0) { setGalleryIndex(galleryIndex - 1); Haptics.selectionAsync(); } }}
                  style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: galleryIndex > 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }}
                  disabled={galleryIndex === 0}
                >
                  <MaterialIcons name="chevron-left" size={32} color={galleryIndex > 0 ? '#FFF' : 'rgba(255,255,255,0.2)'} />
                </Pressable>
                <Pressable
                  onPress={() => { if (galleryIndex < (terrain.photos?.length || 1) - 1) { setGalleryIndex(galleryIndex + 1); Haptics.selectionAsync(); } }}
                  style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: galleryIndex < (terrain.photos?.length || 1) - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }}
                  disabled={galleryIndex >= (terrain.photos?.length || 1) - 1}
                >
                  <MaterialIcons name="chevron-right" size={32} color={galleryIndex < (terrain.photos?.length || 1) - 1 ? '#FFF' : 'rgba(255,255,255,0.2)'} />
                </Pressable>
              </View>
            ) : null}
            {/* Thumbnail strip */}
            {terrain.photos && terrain.photos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
                {terrain.photos.map((photo: string, idx: number) => (
                  <Pressable key={idx} onPress={() => setGalleryIndex(idx)} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: idx === galleryIndex ? theme.primary : 'transparent' }}>
                    <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={showReviewModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary }}>{myReview ? (language === 'fr' ? 'Modifier votre avis' : 'Edit Review') : (language === 'fr' ? 'Donner un avis' : 'Write Review')}</Text>
              <Pressable onPress={() => { setShowReviewModal(false); setReviewRating(0); setReviewComment(''); }} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>{language === 'fr' ? 'Votre note' : 'Your rating'}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <Pressable key={star} onPress={() => { setReviewRating(star); Haptics.selectionAsync(); }} hitSlop={4}>
                  <MaterialIcons name={star <= reviewRating ? 'star' : 'star-border'} size={40} color="#F59E0B" />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{language === 'fr' ? 'Commentaire (optionnel)' : 'Comment (optional)'}</Text>
            <TextInput
              style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, fontSize: 15, color: theme.textPrimary, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}
              placeholder={language === 'fr' ? 'Partagez votre experience...' : 'Share your experience...'}
              placeholderTextColor={theme.textMuted}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              maxLength={500}
            />
            {/* Photo attachment */}
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{language === 'fr' ? 'Photo (optionnel)' : 'Photo (optional)'}</Text>
            {reviewPhotoUri || reviewPhotoUrl ? (
              <View style={{ marginBottom: 16, position: 'relative' }}>
                <Image source={{ uri: reviewPhotoUri || reviewPhotoUrl! }} style={{ width: '100%', height: 140, borderRadius: 12 }} contentFit="cover" transition={200} />
                <Pressable
                  onPress={() => { setReviewPhotoUri(null); setReviewPhotoUrl(null); }}
                  style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                  hitSlop={8}
                >
                  <MaterialIcons name="close" size={16} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: theme.border, borderStyle: 'dashed', marginBottom: 16 }}
                onPress={async () => {
                  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== 'granted') return;
                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
                  if (!result.canceled && result.assets[0]) setReviewPhotoUri(result.assets[0].uri);
                }}
              >
                <MaterialIcons name="add-a-photo" size={20} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted }}>{language === 'fr' ? 'Ajouter une photo' : 'Add a photo'}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [{ backgroundColor: reviewRating > 0 ? theme.primary : theme.textMuted, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.85 : 1 }]}
              onPress={handleSubmitReview}
              disabled={reviewRating === 0 || submittingReview || uploadingReviewPhoto}
            >
              {submittingReview ? <ActivityIndicator color="#FFF" /> : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>{myReview ? (language === 'fr' ? 'Mettre a jour' : 'Update') : (language === 'fr' ? 'Publier' : 'Submit')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {terrain && (
        <ShareModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          itemType="terrain"
          itemId={terrain.id}
          itemName={terrain.name}
        />
      )}

      <MergePickerModal
        visible={showMergePicker}
        onClose={() => setShowMergePicker(false)}
        itemType="terrain"
        currentItemId={id!}
      />
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
  headerActions: {
    flexDirection: 'row',
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
  favoriteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButtonActive: {
    backgroundColor: theme.error + '15',
    borderRadius: 20,
  },
  editButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContentTablet: {
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%',
    paddingHorizontal: 24,
  },
  tabletRow: {
    flexDirection: 'row' as const,
    gap: 16,
  },
  tabletHalf: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: theme.textMuted,
  },
  // Photo Section
  photoSection: {
    marginBottom: 16,
  },
  mainPhoto: {
    width: '100%',
    height: 220,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.backgroundSecondary,
  },
  photoIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.border,
  },
  photoIndicatorActive: {
    backgroundColor: theme.primary,
    width: 24,
  },
  photoThumbnails: {
    gap: 8,
    paddingTop: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: theme.primary,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  // Name Section (when photos are shown)
  nameSection: {
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 8,
  },
  terrainNameLarge: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  // Hero Section (when no photos)
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  terrainIcon: {
    width: 120,
    height: 120,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...theme.shadows.cardElevated,
  },
  terrainName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  quickInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 24,
    rowGap: 14,
    ...theme.shadows.card,
  },
  quickInfoItem: {
    width: '33.33%',
    alignItems: 'center',
    gap: 6,
  },
  quickInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickInfoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  quickInfoLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    gap: 12,
    ...theme.shadows.card,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationAddress: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  locationCity: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primaryLight + '20',
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    marginTop: 12,
  },
  mapButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primary,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    gap: 12,
    ...theme.shadows.card,
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  clubSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  descriptionCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  descriptionText: {
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 22,
  },
  facilitiesGrid: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    gap: 12,
    ...theme.shadows.card,
  },
  facilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  facilityText: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  tipsCard: {
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    borderWidth: 1,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  tipsList: {
    gap: 8,
  },
  tipItem: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  tournamentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tournamentCountBadge: {
    backgroundColor: theme.carreauColor + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tournamentCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.carreauColor,
  },
  tournamentAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.carreauColor + '12',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  tournamentAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.carreauColor,
  },
  tournamentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    ...theme.shadows.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tournamentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.carreauColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tournamentInfo: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  tournamentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  tournamentDate: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  tournamentDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.textMuted,
    marginHorizontal: 2,
  },
  tournamentFormat: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  tournamentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start' as const,
  },
  tournamentStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  showAllTournamentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: theme.carreauColor + '08',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.carreauColor + '18',
    marginTop: 4,
  },
  showAllTournamentsText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.carreauColor,
  },
  tournamentEmptyCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 10,
    ...theme.shadows.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tournamentEmptyIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.carreauColor + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tournamentEmptyText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
  },
  tournamentEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.carreauColor,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  tournamentEmptyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
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

  // Meetup section
  meetupSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  meetupAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  meetupAddBtnText: { fontSize: 12, fontWeight: '700', color: theme.primary },
  meetupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 10, gap: 12, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  meetupDateBadge: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  meetupDateDay: { fontSize: 18, fontWeight: '900', color: theme.primary, lineHeight: 20 },
  meetupDateMonth: { fontSize: 9, fontWeight: '700', color: theme.primary, letterSpacing: 0.5 },
  meetupCardContent: { flex: 1 },
  meetupCardTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  meetupCardTime: { fontSize: 13, color: theme.textSecondary },
  meetupOwnerBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  meetupEmptyCard: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 24, gap: 8, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  meetupEmptyText: { fontSize: 14, color: theme.textMuted },

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
  pvAvatar: { width: 56, height: 56, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  pvName: { fontSize: 18, fontWeight: '700' as const, color: theme.textPrimary },
  pvLocationRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginBottom: 8 },
  pvLocationText: { fontSize: 12, color: theme.textSecondary },
  pvInfoRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 },
  pvInfoPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.surface, borderRadius: 12 },
  pvInfoText: { fontSize: 12, fontWeight: '600' as const },
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
});
