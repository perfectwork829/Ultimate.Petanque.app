import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Modal,
  Dimensions,
  RefreshControl,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';

import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import theme, { blurhash } from '@/constants/theme';

// Animated gold pulse dot for Gold partners in directory
const GoldPulse = React.memo(({ color }: { color: string }) => {
  const opacity = useSharedValue(0.4);
  React.useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginLeft: 2 }, style]} />;
});
import config from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { Terrain, Player, Club, Tournament } from '@/types/petanque';
import { TerrainType } from '@/constants/config';
import { useLanguage } from '@/hooks/useLanguage';
import { SharedOverlayBadge } from '@/components/ui/SharedBadge';
import AdBanner from '@/components/ui/AdBanner';

import { getSponsoredEvents, SponsoredEvent } from '@/services/sponsoredEventService';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';

import MergePickerModal from '@/components/ui/MergePickerModal';
import { useScrollPrefetch } from '@/hooks/useFlatListOptimizers';
import { useTerrainActivity } from '@/hooks/useTerrainActivity';
import { getEloRank, getEloColor, ELO_INITIAL, ELO_RANKS } from '@/services/eloService';
import { getCurrentPositionAsync, requestForegroundPermissionsAsync, Accuracy } from '@/services/location';
import { getSupabaseClient, useAuth, useAlert } from '@/template';
import { computeQuickTrustScore, getTrustScoreColor, getLevelFromScore } from '@/services/trustScoreService';
import { saveMergeLog, getMergeLogs, undoMerge, isUndoable, getUndoTimeRemaining, deleteMergeLog, MergeLog, ReassignedRelation } from '@/services/mergeHistoryService';
import { getMyActiveMeetups, inviteSingleUserToMeetup, Meetup } from '@/services/meetupService';

type DirectoryTab = 'players' | 'clubs' | 'terrains' | 'tournaments' | 'events';
type TournamentStatus = 'all' | 'À venir' | 'En cours' | 'Terminé';
const DIRECTORY_TOURNAMENT_YELLOW = '#EAB308';
type SortField = 'elo' | 'name' | 'win_rate' | 'members' | 'activity' | 'courts' | 'participants' | 'date' | 'city' | 'club' | 'country';
type SortDirection = 'asc' | 'desc';
type SortCriterion = { field: SortField; direction: SortDirection };

export default function DirectoryScreen() {
  const insets = useSafeAreaInsets();
  const { players, clubs, tournaments, terrains, selfPlayer, favoriteTerrainIds, favoriteClubIds, sharedMatchIds, sharedChallengeIds } = useAppData();  
  const { getSharedPermission, refreshData, updatePlayer, updateClub, updateTerrain, updateTournament, deletePlayer, deleteClub, deleteTerrain, deleteTournament } = useAppActions();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // GPS / distance filter state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<'all' | '5' | '10' | '25' | '50' | '100'>('all');
  const gpsRequestedRef = useRef(false);

  const requestGPS = useCallback(async () => {
    if (gpsRequestedRef.current || userLocation) return;
    gpsRequestedRef.current = true;
    setGpsLoading(true);
    try {
      const { status } = await requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } else {
        showAlert(t('directory', 'gpsRequired'));
      }
    } catch {
      showAlert(t('directory', 'gpsError'));
    }
    setGpsLoading(false);
  }, [userLocation, showAlert, t]);

  // Haversine distance in km
  const haversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Request GPS when distance filter is activated
  useEffect(() => {
    if (distanceFilter !== 'all' && !userLocation && !gpsLoading) {
      requestGPS();
    }
  }, [distanceFilter, userLocation, gpsLoading, requestGPS]);

  // Helper: check if item is within distance
  const isWithinDistance = useCallback((itemLat?: number, itemLon?: number): boolean => {
    if (distanceFilter === 'all' || !userLocation || !itemLat || !itemLon) return distanceFilter === 'all';
    const dist = haversineDistance(userLocation.latitude, userLocation.longitude, itemLat, itemLon);
    return dist <= Number(distanceFilter);
  }, [distanceFilter, userLocation, haversineDistance]);

  // Meetup invitation state
  const [showMeetupPicker, setShowMeetupPicker] = useState(false);
  const [meetupPickerUserId, setMeetupPickerUserId] = useState<string | null>(null);
  const [meetupPickerUserName, setMeetupPickerUserName] = useState('');
  const [activeMeetups, setActiveMeetups] = useState<Meetup[]>([]);
  const [loadingMeetups, setLoadingMeetups] = useState(false);
  const [invitingToMeetup, setInvitingToMeetup] = useState<string | null>(null);

  const handleInviteToMeetup = useCallback(async (targetUserId: string, targetName: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    Haptics.selectionAsync();
    setMeetupPickerUserId(targetUserId);
    setMeetupPickerUserName(targetName);
    setLoadingMeetups(true);
    setShowMeetupPicker(true);
    const { meetups: mts } = await getMyActiveMeetups();
    setActiveMeetups(mts);
    setLoadingMeetups(false);
  }, [user?.id]);

  const handleConfirmInvite = useCallback(async (meetupId: string) => {
    if (!meetupPickerUserId) return;
    setInvitingToMeetup(meetupId);
    const { error } = await inviteSingleUserToMeetup(meetupId, meetupPickerUserId);
    setInvitingToMeetup(null);
    if (error === 'already_participant') {
      showAlert(t('meetup', 'alreadyParticipant'));
    } else if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('meetup', 'inviteSentSuccess'), t('meetup', 'inviteSentSuccessDesc'));
      setShowMeetupPicker(false);
    }
  }, [meetupPickerUserId, showAlert, t]);
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<DirectoryTab>('players');

  // Responsive dimensions for tablet
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;
  const numColumns = isTablet ? 2 : 1;
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  const [showSortModal, setShowSortModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRealUsersOnly, setShowRealUsersOnly] = useState(false);
  const [showActiveNow, setShowActiveNow] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  // Pagination state
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showDuplicateBanner, setShowDuplicateBanner] = useState(true);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ type: 'player' | 'club' | 'terrain' | 'tournament'; id: string } | null>(null);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  const [quickMerging, setQuickMerging] = useState<string | null>(null);
  const [showMergeHistory, setShowMergeHistory] = useState(false);
  const [mergeLogs, setMergeLogs] = useState<MergeLog[]>([]);
  const [loadingMergeLogs, setLoadingMergeLogs] = useState(false);
  const [undoingMerge, setUndoingMerge] = useState<string | null>(null);

  const loadMergeLogs = useCallback(async () => {
    setLoadingMergeLogs(true);
    const { logs } = await getMergeLogs();
    setMergeLogs(logs);
    setLoadingMergeLogs(false);
  }, []);

  const handleUndoMerge = useCallback(async (log: MergeLog) => {
    setUndoingMerge(log.id);
    const { error } = await undoMerge(log);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshData();
    }
    setMergeLogs(prev => prev.filter(l => l.id !== log.id));
    setUndoingMerge(null);
  }, [refreshData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Events state
  const [sponsoredEvents, setSponsoredEvents] = useState<SponsoredEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Partner data for tier badges in directory — lazy loaded
  const [partnerUserIds, setPartnerUserIds] = useState<Map<string, any>>(new Map());
  const partnerLoaded = useRef(false);
  useEffect(() => {
    // Defer partner badge loading to avoid blocking initial render
    const timer = setTimeout(() => {
      if (partnerLoaded.current) return;
      partnerLoaded.current = true;
      fetchAmbassadors().then(({ ambassadors }) => {
        const map = new Map<string, any>();
        ambassadors.forEach(a => {
          const isActiveSponsor = (a as any).isActive !== false && (a as any).status !== 'inactive' && (a as any).status !== 'disabled';
          if (isActiveSponsor && (a.badgeType === 'gold_sponsor' || a.badgeType === 'sponsor' || a.badgeType === 'partner')) {
            const info = { tier: a.badgeType, name: a.displayName, isActive: true, brandColor: (a as any).brandColor || null };
            map.set(a.userId, info);
            // Key by ambassador ID (for sponsorId lookups on clubs/terrains/tournaments)
            map.set(a.id, info);
            // Also key by playerId so player cards can look up by player.id
            if (a.playerId) map.set(a.playerId, info);
          }
        });
        setPartnerUserIds(map);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, []);
  const loadSponsoredEvents = useCallback(async () => {
    setEventsLoading(true);
    const [r1, r2, r3] = await Promise.all([getSponsoredEvents(), getSponsoredEvents('completed'), getSponsoredEvents('cancelled')]);
    const all = [...r1.events];
    r2.events.forEach(e => { if (!all.find(x => x.id === e.id)) all.push(e); });
    r3.events.forEach(e => { if (!all.find(x => x.id === e.id)) all.push(e); });
    all.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    console.log("---------------loading events");
    setSponsoredEvents(all);
    setEventsLoading(false);
  }, []);

  useEffect(() => { loadSponsoredEvents(); }, [loadSponsoredEvents]);

  // Tab configuration (uses t() for labels)
  const TABS: { id: DirectoryTab; label: string; icon: string; color: string }[] = useMemo(() => [
    { id: 'players', label: t('directory', 'players'), icon: 'person', color: theme.primary },
    { id: 'clubs', label: t('directory', 'clubs'), icon: 'home', color: theme.accent },
    { id: 'terrains', label: t('directory', 'terrains'), icon: 'sports-soccer', color: theme.success },
    { id: 'tournaments', label: t('directory', 'tournaments'), icon: 'emoji-events', color: DIRECTORY_TOURNAMENT_YELLOW },
    { id: 'events', label: language === 'fr' ? 'Defis' : 'Challenges', icon: 'campaign', color: '#7C3AED' },
  ], [language]);

  // Dynamic gradient colors per tab
  const activeGradient: [string, string, string] = useMemo(() => {
    const gradients: Record<DirectoryTab, [string, string, string]> = {
      players: ['#0F172A', '#1E3A8A', '#2563EB'],
      clubs: ['#451A03', '#92400E', '#D97706'],
      terrains: ['#022C22', '#064E3B', '#10B981'],
      tournaments: ['#422006', '#A16207', DIRECTORY_TOURNAMENT_YELLOW],
      events: ['#4C1D95', '#6D28D9', '#7C3AED'],
    };
    return gradients[activeTab];
  }, [activeTab]);

  const activeTabColor = useMemo(() => {
    const colors: Record<DirectoryTab, string> = {
      players: theme.primary,
      clubs: theme.accent,
      terrains: theme.success,
      tournaments: DIRECTORY_TOURNAMENT_YELLOW,
      events: '#7C3AED',
    };
    return colors[activeTab];
  }, [activeTab]);

  // All filters state
  const [filters, setFilters] = useState<{
    playerClub: string; playerCity: string; playerCountry: string; playerLevel: string; playerRole: string; playerEloRank: string; playerExperience: string; playerTerrain: string;
    clubCity: string; clubCountry: string; clubEquipment: string; clubMembersRange: string;
    terrainType: string; terrainCity: string; terrainCountry: string; terrainLighting: string; terrainCovered: string; terrainEnvironment: string; terrainAccess: string; terrainParking: string; terrainToilets: string;
    tournamentStatus: string; tournamentFormat: string; tournamentLevel: string; tournamentCategory: string; tournamentRegistration: string; tournamentScope: string; tournamentCity: string; tournamentDate: string;
    eventStatus: string; eventType: string; eventAmbassador: string;
  }>({
    // Player filters
    playerClub: 'all',
    playerCity: 'all',
    playerCountry: 'all',
    playerLevel: 'all',
    playerRole: 'all',
    playerEloRank: 'all',
    playerExperience: 'all',
    playerTerrain: 'all',
    // Club filters
    clubCity: 'all',
    clubCountry: 'all',
    clubEquipment: 'all',
    clubMembersRange: 'all',
    // Terrain filters
    terrainType: 'all' as TerrainType | 'all',
    terrainCity: 'all',
    terrainCountry: 'all',
    terrainLighting: 'all' as 'all' | 'yes' | 'no',
    terrainCovered: 'all' as 'all' | 'yes' | 'no',
    terrainEnvironment: 'all' as 'all' | 'indoor' | 'outdoor',
    terrainAccess: 'all' as 'all' | 'public' | 'private',
    terrainParking: 'all' as 'all' | 'yes' | 'no',
    terrainToilets: 'all' as 'all' | 'yes' | 'no',
    // Tournament filters
    tournamentStatus: 'all' as TournamentStatus,
    tournamentFormat: 'all',
    tournamentLevel: 'all',
    tournamentCategory: 'all',
    tournamentRegistration: 'all',
    tournamentScope: 'all',
    tournamentCity: 'all',
    tournamentDate: 'all',
    // Event filters
    eventStatus: 'all',
    eventType: 'all',
    eventAmbassador: 'all',
  });

  // Reset pagination when tab or filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, searchQuery, filters, showRealUsersOnly, showActiveNow, distanceFilter, sortCriteria, visibilityFilter]);

  // Reset sort when tab changes
  useEffect(() => {
    setSortCriteria([]);
  }, [activeTab]);

  // Levenshtein-based duplicate detection — debounced for performance
  // Stable fingerprint to avoid recalculating when data hasn't changed
  const dataFingerprint = useMemo(() => {
    return `${players.length}-${clubs.length}-${terrains.length}-${tournaments.length}-${dismissedPairs.size}`;
  }, [players.length, clubs.length, terrains.length, tournaments.length, dismissedPairs.size]);

  const [duplicates, setDuplicates] = useState<{ itemA: any; itemB: any; score: number; type: string; pairKey: string }[]>([]);
  const duplicateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce duplicate calculation by 500ms to avoid blocking UI
    if (duplicateTimerRef.current) clearTimeout(duplicateTimerRef.current);
    duplicateTimerRef.current = setTimeout(() => {
      const normalize = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const levenshtein = (a: string, b: string): number => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        // Optimized: early exit if length difference makes threshold impossible
        const maxLen = Math.max(a.length, b.length);
        if (Math.abs(a.length - b.length) > maxLen * 0.3) return maxLen;
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
          }
        }
        return matrix[b.length][a.length];
      };
      const similarity = (a: string, b: string): number => {
        const na = normalize(a);
        const nb = normalize(b);
        if (na === nb) return 100;
        if (na.includes(nb) || nb.includes(na)) return 85;
        const maxLen = Math.max(na.length, nb.length);
        if (maxLen === 0) return 0;
        return Math.round((1 - levenshtein(na, nb) / maxLen) * 100);
      };
      const findDuplicates = <T extends { id: string; name: string }>(items: T[], type: string) => {
        const pairs: { itemA: T; itemB: T; score: number; type: string; pairKey: string }[] = [];
        // Cap comparison to first 100 items to avoid O(n^2) explosion
        const capped = items.slice(0, 100);
        for (let i = 0; i < capped.length; i++) {
          for (let j = i + 1; j < capped.length; j++) {
            const score = similarity(capped[i].name, capped[j].name);
            if (score >= 70) {
              const pairKey = `${type}-${[capped[i].id, capped[j].id].sort().join('-')}`;
              if (!dismissedPairs.has(pairKey)) {
                pairs.push({ itemA: capped[i], itemB: capped[j], score, type, pairKey });
              }
            }
          }
        }
        return pairs;
      };
      const result = [
        ...findDuplicates(players, 'player'),
        ...findDuplicates(clubs, 'club'),
        ...findDuplicates(terrains, 'terrain'),
        ...findDuplicates(tournaments, 'tournament'),
      ].sort((a, b) => b.score - a.score);
      setDuplicates(result);
    }, 500);
    return () => { if (duplicateTimerRef.current) clearTimeout(duplicateTimerRef.current); };
  }, [dataFingerprint, players, clubs, terrains, tournaments, dismissedPairs]);

  // Set active tab from navigation param
  React.useEffect(() => {
    if (tabParam && ['players', 'clubs', 'terrains', 'tournaments', 'events'].includes(tabParam)) {
      setActiveTab(tabParam as DirectoryTab);
    }
  }, [tabParam]);


  // === CASCADING FILTER VALUES ===
  // Each filter's options are computed from data filtered by ALL OTHER active filters (except itself)
  // This ensures selecting one filter narrows the options of the others.
  
  // Helper: apply player filters except the excluded one
  const getPlayerBaseFiltered = useCallback((excludeFilter?: string) => {
    return players.filter(p => {

      if (excludeFilter !== 'playerClub' && filters.playerClub !== 'all' && p.club !== filters.playerClub) return false;
      if (excludeFilter !== 'playerCity' && filters.playerCity !== 'all' && p.location?.city !== filters.playerCity) return false;
      if (excludeFilter !== 'playerCountry' && filters.playerCountry !== 'all' && (p.country || 'France') !== filters.playerCountry) return false;
      if (excludeFilter !== 'playerRole' && filters.playerRole !== 'all' && p.role !== filters.playerRole) return false;
      if (excludeFilter !== 'playerExperience' && filters.playerExperience !== 'all' && p.experience !== filters.playerExperience) return false;
      if (excludeFilter !== 'playerTerrain' && filters.playerTerrain !== 'all' && p.terrainName !== filters.playerTerrain) return false;
      if (excludeFilter !== 'playerEloRank' && filters.playerEloRank !== 'all') {
        const elo = p.eloRating || ELO_INITIAL;
        const match = filters.playerEloRank === 'bronze' ? elo < 1100 : filters.playerEloRank === 'silver' ? (elo >= 1100 && elo < 1200) : filters.playerEloRank === 'gold' ? (elo >= 1200 && elo < 1500) : filters.playerEloRank === 'diamond' ? (elo >= 1500 && elo < 1800) : filters.playerEloRank === 'master' ? (elo >= 1800 && elo < 2000) : filters.playerEloRank === 'grand_master' ? elo >= 2000 : true;
        if (!match) return false;
      }
      if (showRealUsersOnly && !(selfPlayer && p.id === selfPlayer.id) && p.isPublic !== true) return false;
      if (distanceFilter !== 'all' && userLocation) {
        if (!p.location?.latitude || !p.location?.longitude) return false;
        const dist = haversineDistance(userLocation.latitude, userLocation.longitude, p.location.latitude, p.location.longitude);
        if (dist > Number(distanceFilter)) return false;
      }
      return true;
    });
  }, [players, filters, selfPlayer, showRealUsersOnly, distanceFilter, userLocation, haversineDistance]);

  const getClubBaseFiltered = useCallback((excludeFilter?: string) => {
    return clubs.filter(c => {
      if (excludeFilter !== 'clubCity' && filters.clubCity !== 'all' && c.city !== filters.clubCity) return false;
      if (excludeFilter !== 'clubCountry' && filters.clubCountry !== 'all' && (c.country || 'France') !== filters.clubCountry) return false;
      if (excludeFilter !== 'clubEquipment' && filters.clubEquipment !== 'all' && !(c.facilities && c.facilities.includes(filters.clubEquipment))) return false;
      if (excludeFilter !== 'clubMembersRange' && filters.clubMembersRange !== 'all') {
        const count = c.membersCount || 0;
        const match = filters.clubMembersRange === '1-10' ? (count >= 1 && count <= 10) : filters.clubMembersRange === '11-30' ? (count >= 11 && count <= 30) : filters.clubMembersRange === '31-50' ? (count >= 31 && count <= 50) : filters.clubMembersRange === '50+' ? count > 50 : true;
        if (!match) return false;
      }
      if (distanceFilter !== 'all' && userLocation) {
        if (!c.location?.latitude || !c.location?.longitude) return false;
        const dist = haversineDistance(userLocation.latitude, userLocation.longitude, c.location.latitude, c.location.longitude);
        if (dist > Number(distanceFilter)) return false;
      }
      return true;
    });
  }, [clubs, filters, distanceFilter, userLocation, haversineDistance]);

  const getTerrainBaseFiltered = useCallback((excludeFilter?: string) => {
    return terrains.filter(tr => {
      if (excludeFilter !== 'terrainType' && filters.terrainType !== 'all' && tr.type !== filters.terrainType) return false;
      if (excludeFilter !== 'terrainCity' && filters.terrainCity !== 'all' && tr.city !== filters.terrainCity) return false;
      if (excludeFilter !== 'terrainCountry' && filters.terrainCountry !== 'all' && (tr.location?.country || 'France') !== filters.terrainCountry) return false;
      if (excludeFilter !== 'terrainLighting' && filters.terrainLighting !== 'all' && (filters.terrainLighting === 'yes' ? !tr.lighting : tr.lighting)) return false;
      if (excludeFilter !== 'terrainCovered' && filters.terrainCovered !== 'all' && (filters.terrainCovered === 'yes' ? !tr.covered : tr.covered)) return false;
      if (excludeFilter !== 'terrainEnvironment' && filters.terrainEnvironment !== 'all' && (tr.environment || 'outdoor') !== filters.terrainEnvironment) return false;
      if (excludeFilter !== 'terrainAccess' && filters.terrainAccess !== 'all' && (filters.terrainAccess === 'public' ? (tr.publicAccess === false) : (tr.publicAccess !== false))) return false;
      if (excludeFilter !== 'terrainParking' && filters.terrainParking !== 'all' && (filters.terrainParking === 'yes' ? !tr.parking : tr.parking)) return false;
      if (excludeFilter !== 'terrainToilets' && filters.terrainToilets !== 'all' && (filters.terrainToilets === 'yes' ? !tr.toilets : tr.toilets)) return false;
      if (distanceFilter !== 'all' && userLocation) {
        if (!tr.location?.latitude || !tr.location?.longitude) return false;
        const dist = haversineDistance(userLocation.latitude, userLocation.longitude, tr.location.latitude, tr.location.longitude);
        if (dist > Number(distanceFilter)) return false;
      }
      return true;
    });
  }, [terrains, filters, distanceFilter, userLocation, haversineDistance]);

  const getTournamentBaseFiltered = useCallback((excludeFilter?: string) => {
    const result = tournaments.filter(tr => {
      if (excludeFilter !== 'tournamentStatus' && filters.tournamentStatus !== 'all' && tr.status !== filters.tournamentStatus) return false;
      if (excludeFilter !== 'tournamentFormat' && filters.tournamentFormat !== 'all' && tr.format !== filters.tournamentFormat) return false;
      if (excludeFilter !== 'tournamentLevel' && filters.tournamentLevel !== 'all' && tr.tournamentLevel !== filters.tournamentLevel) return false;
      if (excludeFilter !== 'tournamentCategory' && filters.tournamentCategory !== 'all' && tr.tournamentCategory !== filters.tournamentCategory) return false;
      if (excludeFilter !== 'tournamentRegistration' && filters.tournamentRegistration !== 'all' && tr.registrationType !== filters.tournamentRegistration) return false;
      if (excludeFilter !== 'tournamentScope' && filters.tournamentScope !== 'all' && tr.tournamentScope !== filters.tournamentScope) return false;
      if (excludeFilter !== 'tournamentCity' && filters.tournamentCity !== 'all' && (tr.location?.city || tr.terrainName) !== filters.tournamentCity) return false;
      if (excludeFilter !== 'tournamentDate' && filters.tournamentDate !== 'all') {
        const td = new Date(tr.date); const now = new Date();
        const match = filters.tournamentDate === 'this_month' ? (td.getFullYear() === now.getFullYear() && td.getMonth() === now.getMonth()) : filters.tournamentDate === 'next_3_months' ? (() => { const tm = new Date(); tm.setMonth(tm.getMonth() + 3); return td >= now && td <= tm; })() : filters.tournamentDate === 'this_year' ? td.getFullYear() === now.getFullYear() : filters.tournamentDate === 'past' ? td < now : true;
        if (!match) return false;
      }
      if (distanceFilter !== 'all' && userLocation) {
        if (!tr.location?.latitude || !tr.location?.longitude) return false;
        const dist = haversineDistance(userLocation.latitude, userLocation.longitude, tr.location.latitude, tr.location.longitude);
        if (dist > Number(distanceFilter)) return false;
      }
      return true;
    });
    return result;
  }, [tournaments, filters, distanceFilter, userLocation, haversineDistance]);

  // Cascading unique values with counts
  const uniqueValues = useMemo(() => {
    const countedOptions = (items: string[]): { value: string; count: number }[] => {
      const map = new Map<string, number>();
      items.forEach(v => { if (v) map.set(v, (map.get(v) || 0) + 1); });
      return Array.from(map.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    };

    // Player cascading options
    const pForClub = getPlayerBaseFiltered('playerClub');
    const pForCity = getPlayerBaseFiltered('playerCity');
    const pForCountry = getPlayerBaseFiltered('playerCountry');
    const pForRole = getPlayerBaseFiltered('playerRole');
    const pForExp = getPlayerBaseFiltered('playerExperience');
    const pForTerrain = getPlayerBaseFiltered('playerTerrain');
    const pForElo = getPlayerBaseFiltered('playerEloRank');

    // Club cascading options
    const cForCity = getClubBaseFiltered('clubCity');
    const cForCountry = getClubBaseFiltered('clubCountry');
    const cForEquip = getClubBaseFiltered('clubEquipment');
    const cForMembers = getClubBaseFiltered('clubMembersRange');

    // Terrain cascading options
    const tForType = getTerrainBaseFiltered('terrainType');
    const tForCity = getTerrainBaseFiltered('terrainCity');
    const tForCountry = getTerrainBaseFiltered('terrainCountry');

    // Tournament cascading options
    const trForFormat = getTournamentBaseFiltered('tournamentFormat');
    const trForLevel = getTournamentBaseFiltered('tournamentLevel');
    const trForCat = getTournamentBaseFiltered('tournamentCategory');
    const trForReg = getTournamentBaseFiltered('tournamentRegistration');
    const trForScope = getTournamentBaseFiltered('tournamentScope');
    const trForCity = getTournamentBaseFiltered('tournamentCity');

    return {
      playerClubs: countedOptions(pForClub.map(p => p.club).filter(Boolean) as string[]),
      playerCities: countedOptions(pForCity.map(p => p.location?.city).filter(Boolean) as string[]),
      playerCountries: countedOptions(pForCountry.map(p => p.country || 'France')),
      playerRoles: ['Pointeur', 'Tireur', 'Milieu'].map(r => ({ value: r, count: pForRole.filter(p => p.role === r).length })),
      playerExperiences: ['less_than_1', '1_to_3', '3_to_10', 'more_than_10'].map(e => ({ value: e, count: pForExp.filter(p => p.experience === e).length })),
      playerTerrains: countedOptions(pForTerrain.map(p => p.terrainName).filter(Boolean) as string[]),
      playerEloRanks: ['bronze', 'silver', 'gold', 'diamond', 'master', 'grand_master'].map(rank => {
        const elos = pForElo.map(p => p.eloRating || ELO_INITIAL);
        const count = elos.filter(elo => rank === 'bronze' ? elo < 1100 : rank === 'silver' ? (elo >= 1100 && elo < 1200) : rank === 'gold' ? (elo >= 1200 && elo < 1500) : rank === 'diamond' ? (elo >= 1500 && elo < 1800) : rank === 'master' ? (elo >= 1800 && elo < 2000) : elo >= 2000).length;
        return { value: rank, count };
      }),
      clubCities: countedOptions(cForCity.map(c => c.city).filter(Boolean) as string[]),
      clubCountries: countedOptions(cForCountry.map(c => c.country || 'France')),
      clubEquipments: (() => {
        const allF = new Set<string>(); cForEquip.forEach(c => (c.facilities || []).forEach(f => allF.add(f)));
        return Array.from(allF).sort().map(f => ({ value: f, count: cForEquip.filter(c => c.facilities?.includes(f)).length }));
      })(),
      clubMembersRanges: ['1-10', '11-30', '31-50', '50+'].map(r => {
        const count = cForMembers.filter(c => { const n = c.membersCount || 0; return r === '1-10' ? (n >= 1 && n <= 10) : r === '11-30' ? (n >= 11 && n <= 30) : r === '31-50' ? (n >= 31 && n <= 50) : n > 50; }).length;
        return { value: r, count };
      }),
      terrainTypes: config.terrainTypes.map(tc => ({ value: tc.id, count: tForType.filter(tr => tr.type === tc.id).length })),
      terrainCities: countedOptions(tForCity.map(tr => tr.city).filter(Boolean) as string[]),
      terrainCountries: countedOptions(tForCountry.map(tr => tr.location?.country || 'France')),
      tournamentFormats: countedOptions(trForFormat.map(t => t.format).filter(Boolean) as string[]),
      tournamentLevels: countedOptions(trForLevel.map(t => t.tournamentLevel).filter(Boolean) as string[]),
      tournamentCategories: countedOptions(trForCat.map(t => t.tournamentCategory).filter(Boolean) as string[]),
      tournamentRegistrations: countedOptions(trForReg.map(t => t.registrationType).filter(Boolean) as string[]),
      tournamentScopes: countedOptions(trForScope.map(t => t.tournamentScope).filter(Boolean) as string[]),
      tournamentCities: countedOptions(trForCity.map(t => t.location?.city || t.terrainName).filter(Boolean) as string[]),
    };
  }, [getPlayerBaseFiltered, getClubBaseFiltered, getTerrainBaseFiltered, getTournamentBaseFiltered]);

  // Active filter counts (include distance filter)
  const activeFilterCounts = useMemo(() => {
    const distCount = distanceFilter !== 'all' ? 1 : 0;
    return {
      players: [filters.playerClub, filters.playerCity, filters.playerCountry, filters.playerLevel, filters.playerRole, filters.playerEloRank, filters.playerExperience, filters.playerTerrain].filter(f => f !== 'all').length + distCount,
      clubs: [filters.clubCity, filters.clubCountry, filters.clubEquipment, filters.clubMembersRange].filter(f => f !== 'all').length + distCount,
      terrains: [filters.terrainType, filters.terrainCity, filters.terrainCountry, filters.terrainLighting, filters.terrainCovered, filters.terrainEnvironment, filters.terrainAccess, filters.terrainParking, filters.terrainToilets].filter(f => f !== 'all').length + distCount,
      tournaments: [filters.tournamentStatus, filters.tournamentFormat, filters.tournamentLevel, filters.tournamentCategory, filters.tournamentRegistration, filters.tournamentScope, filters.tournamentCity, filters.tournamentDate].filter(f => f !== 'all').length + distCount,
      events: [filters.eventStatus, filters.eventType, filters.eventAmbassador].filter(f => f !== 'all').length,
    };
  }, [filters, distanceFilter]);

  const currentFilterCount = activeFilterCounts[activeTab];

  // Singular label for current tab
  const getTabSingular = (tab: DirectoryTab) => {
    const map: Record<DirectoryTab, string> = {
      players: t('directory', 'player'),
      clubs: t('directory', 'club'),
      terrains: t('directory', 'terrain'),
      tournaments: t('directory', 'tournament'),
      events: language === 'fr' ? 'defi' : 'challenge',
    };
    return map[tab];
  };

  const getTabPlural = (tab: DirectoryTab) => {
    const map: Record<DirectoryTab, string> = {
      players: t('directory', 'playersLabel'),
      clubs: t('directory', 'clubsLabel'),
      terrains: t('directory', 'terrainsLabel'),
      tournaments: t('directory', 'tournamentsLabel'),
      events: language === 'fr' ? 'defis ambassadeurs' : 'ambassador challenges',
    };
    return map[tab];
  };

  // Search placeholders
  const getSearchPlaceholder = () => {
    const map: Record<DirectoryTab, string> = {
      players: t('directory', 'searchPlayer'),
      clubs: t('directory', 'searchClub'),
      terrains: t('directory', 'searchTerrain'),
      tournaments: t('directory', 'searchTournament'),
      events: language === 'fr' ? 'Rechercher un defi...' : 'Search a challenge...',
    };
    return map[activeTab];
  };

  // Terrain activity scores (extracted to dedicated hook for correct declaration order + reduced re-renders)
  const terrainActivityMap = useTerrainActivity();

  // Multi-criteria sort comparator
  const getCompareValue = useCallback((item: any, field: SortField): any => {
    switch (field) {
      case 'elo': return item.eloRating || ELO_INITIAL;
      case 'name': return (item.name || '').toLowerCase();
      case 'win_rate': return item.stats?.winRate || 0;
      case 'members': return item.membersCount || 0;
      case 'activity': return terrainActivityMap.get(item.id)?.score || 0;
      case 'courts': return item.courtsCount || 1;
      case 'participants': return item.participants || 0;
      case 'date': return new Date(item.date || item.startTime || 0).getTime();
      case 'city': return (item.city || item.location?.city || '').toLowerCase();
      case 'club': return (item.club || '').toLowerCase();
      case 'country': return (item.country || 'France').toLowerCase();
      default: return 0;
    }
  }, [terrainActivityMap]);

  const applyMultiSort = useCallback((data: any[]): any[] => {
    if (sortCriteria.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const criterion of sortCriteria) {
        const va = getCompareValue(a, criterion.field);
        const vb = getCompareValue(b, criterion.field);
        let cmp = 0;
        if (typeof va === 'string' && typeof vb === 'string') {
          cmp = va.localeCompare(vb);
        } else {
          cmp = (va as number) - (vb as number);
        }
        if (criterion.direction === 'desc') cmp = -cmp;
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [sortCriteria, getCompareValue]);

  // Filtered data
  const filteredPlayers = useMemo(() => {
    let result = players.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.club?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesClub = filters.playerClub === 'all' || p.club === filters.playerClub;
      const matchesCity = filters.playerCity === 'all' || p.location?.city === filters.playerCity;
      const matchesCountry = filters.playerCountry === 'all' || (p.country || 'France') === filters.playerCountry;
      const matchesLevel = true;
      const matchesRole = filters.playerRole === 'all' || p.role === filters.playerRole;
      const matchesEloRank = filters.playerEloRank === 'all' || (() => {
        const elo = p.eloRating || ELO_INITIAL;
        switch (filters.playerEloRank) {
          case 'bronze': return elo < 1100;
          case 'silver': return elo >= 1100 && elo < 1200;
          case 'gold': return elo >= 1200 && elo < 1500;
          case 'diamond': return elo >= 1500 && elo < 1800;
          case 'master': return elo >= 1800 && elo < 2000;
          case 'grand_master': return elo >= 2000;
          default: return true;
        }
      })();
      const matchesExperience = filters.playerExperience === 'all' || p.experience === filters.playerExperience;
      const matchesTerrain = filters.playerTerrain === 'all' || p.terrainName === filters.playerTerrain;
      const matchesRealUser = !showRealUsersOnly || (selfPlayer && p.id === selfPlayer.id) || (p.isPublic === true);
      const matchesDist = isWithinDistance(p.location?.latitude, p.location?.longitude);
      const matchesVisibility = visibilityFilter === 'all' || (visibilityFilter === 'public' ? p.isPublic === true : p.isPublic !== true);
      return matchesSearch && matchesClub && matchesCity && matchesCountry && matchesLevel && matchesRole && matchesEloRank && matchesExperience && matchesTerrain && matchesRealUser && matchesDist && matchesVisibility;
    });
    
    // Apply multi-criteria sort or fallback to distance sort
    if (sortCriteria.length > 0) {
      result = applyMultiSort(result);
    } else if (distanceFilter !== 'all' && userLocation) {
      result.sort((a, b) => {
        const da = (a.location?.latitude && a.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) : 99999;
        const db = (b.location?.latitude && b.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude) : 99999;
        return da - db;
      });
    }
    
    // Gold partners get priority position
    if (sortCriteria.length === 0) {
      const goldIds = new Set<string>();
      partnerUserIds.forEach((info, uid) => { if (info.tier === 'gold_sponsor') goldIds.add(uid); });
      if (goldIds.size > 0) {
        const goldPlayers: typeof result = [];
        const rest: typeof result = [];
        result.forEach(p => {
          if (goldIds.has(p.id) || goldIds.has((p as any).userId || '')) goldPlayers.push(p);
          else rest.push(p);
        });
        result = [...goldPlayers, ...rest];
      }
    }
    // Put selfPlayer at top
    if (selfPlayer) {
      const selfIndex = result.findIndex(p => p.id === selfPlayer.id);
      if (selfIndex > 0) {
        const [self] = result.splice(selfIndex, 1);
        result.unshift(self);
      }
    }
    return result;
  }, [players, searchQuery, filters, selfPlayer, showRealUsersOnly, user?.id, isWithinDistance, distanceFilter, userLocation, haversineDistance, sortCriteria, applyMultiSort, partnerUserIds, visibilityFilter]);

  // Counts for tabs
  const counts = useMemo(() => ({
    players: filteredPlayers.length,
    clubs: clubs.length,
    terrains: terrains.length,
    tournaments: tournaments.length,
    events: sponsoredEvents.length,
  }), [filteredPlayers.length, clubs.length, terrains.length, tournaments.length, sponsoredEvents.length]);


  const filteredClubs = useMemo(() => {
    let result = clubs.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.city.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCity = filters.clubCity === 'all' || c.city === filters.clubCity;
      const matchesCountry = filters.clubCountry === 'all' || (c.country || 'France') === filters.clubCountry;
      const matchesEquipment = filters.clubEquipment === 'all' || (c.facilities && c.facilities.includes(filters.clubEquipment));
      const matchesMembersRange = filters.clubMembersRange === 'all' || (() => {
        const count = c.membersCount || 0;
        switch (filters.clubMembersRange) {
          case '1-10': return count >= 1 && count <= 10;
          case '11-30': return count >= 11 && count <= 30;
          case '31-50': return count >= 31 && count <= 50;
          case '50+': return count > 50;
          default: return true;
        }
      })();
      const matchesDist = isWithinDistance(c.location?.latitude, c.location?.longitude);
      const matchesVisibility = visibilityFilter === 'all' || (visibilityFilter === 'public' ? c.isPublic === true : c.isPublic !== true);
      return matchesSearch && matchesCity && matchesCountry && matchesEquipment && matchesMembersRange && matchesDist && matchesVisibility;
    });
    // Apply multi-criteria sort or fallback to distance sort
    if (sortCriteria.length > 0) {
      result = applyMultiSort(result);
    } else if (distanceFilter !== 'all' && userLocation) {
      result.sort((a, b) => {
        const da = (a.location?.latitude && a.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) : 99999;
        const db = (b.location?.latitude && b.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude) : 99999;
        return da - db;
      });
    }
    // Gold-sponsored clubs get priority position
    if (sortCriteria.length === 0) {
      const goldIds = new Set<string>();
      partnerUserIds.forEach((info, uid) => { if (info.tier === 'gold_sponsor') goldIds.add(uid); });
      if (goldIds.size > 0) {
        const gold: typeof result = [];
        const rest: typeof result = [];
        result.forEach(c => {
          if ((c as any).sponsorId && goldIds.has((c as any).sponsorId as string)) gold.push(c);
          else rest.push(c);
        });
        result = [...gold, ...rest];
      }
    }
    return result;
  }, [clubs, searchQuery, filters, isWithinDistance, distanceFilter, userLocation, haversineDistance, sortCriteria, applyMultiSort, partnerUserIds]);

  // terrainMeetupsMap, globalTerrainStats, and terrainActivityMap are now in useTerrainActivity hook

  const filteredTerrains = useMemo(() => {
    let result = terrains.filter(tr => {
      const matchesSearch = tr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tr.city.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filters.terrainType === 'all' || tr.type === filters.terrainType;
      const matchesCity = filters.terrainCity === 'all' || tr.city === filters.terrainCity;
      const matchesCountry = filters.terrainCountry === 'all' || (tr.location?.country || 'France') === filters.terrainCountry;
      const matchesLighting = filters.terrainLighting === 'all' || 
        (filters.terrainLighting === 'yes' ? tr.lighting : !tr.lighting);
      const matchesCovered = filters.terrainCovered === 'all' || 
        (filters.terrainCovered === 'yes' ? tr.covered : !tr.covered);
      const matchesEnvironment = filters.terrainEnvironment === 'all' || 
        (tr.environment || 'outdoor') === filters.terrainEnvironment;
      const matchesAccess = filters.terrainAccess === 'all' ||
        (filters.terrainAccess === 'public' ? (tr.publicAccess !== false) : (tr.publicAccess === false));
      const matchesParking = filters.terrainParking === 'all' ||
        (filters.terrainParking === 'yes' ? tr.parking : !tr.parking);
      const matchesToilets = filters.terrainToilets === 'all' ||
        (filters.terrainToilets === 'yes' ? tr.toilets : !tr.toilets);
      const matchesDist = isWithinDistance(tr.location?.latitude, tr.location?.longitude);
      const matchesVisibility = visibilityFilter === 'all' || (visibilityFilter === 'public' ? tr.isPublic === true : tr.isPublic !== true);
      return matchesSearch && matchesType && matchesCity && matchesCountry && matchesLighting && matchesCovered && matchesEnvironment && matchesAccess && matchesParking && matchesToilets && matchesDist && matchesVisibility;
    });
    // Apply multi-criteria sort or fallback
    if (sortCriteria.length > 0) {
      result = applyMultiSort(result);
    } else if (showActiveNow) {
      // "Active Now" priority system:
      // 1. Terrains active RIGHT NOW (ongoing meetup/tournament/recent match) — sorted by score desc
      // 2. Terrains with habitual activity at this day+hour — sorted by habitualScore desc
      // Exclude terrains with no activity signal at all
      const activeNowTerrains: typeof result = [];
      const habitualTerrains: typeof result = [];
      result.forEach(tr => {
        const info = terrainActivityMap.get(tr.id);
        if (!info) return;
        if (info.isActiveNow) {
          activeNowTerrains.push(tr);
        } else if (info.habitualScore > 0) {
          habitualTerrains.push(tr);
        }
      });
      // Sort each group independently
      activeNowTerrains.sort((a, b) => (terrainActivityMap.get(b.id)?.score || 0) - (terrainActivityMap.get(a.id)?.score || 0));
      habitualTerrains.sort((a, b) => (terrainActivityMap.get(b.id)?.habitualScore || 0) - (terrainActivityMap.get(a.id)?.habitualScore || 0));
      result = [...activeNowTerrains, ...habitualTerrains];
    } else if (distanceFilter !== 'all' && userLocation) {
      result.sort((a, b) => {
        const da = (a.location?.latitude && a.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) : 99999;
        const db = (b.location?.latitude && b.location?.longitude) ? haversineDistance(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude) : 99999;
        return da - db;
      });
    }
    // Gold-sponsored terrains get priority position
    if (sortCriteria.length === 0 && !showActiveNow) {
      const goldIds = new Set<string>();
      partnerUserIds.forEach((info, uid) => { if (info.tier === 'gold_sponsor') goldIds.add(uid); });
      if (goldIds.size > 0) {
        const gold: typeof result = [];
        const rest: typeof result = [];
        result.forEach(tr => {
          if (tr.sponsorId && goldIds.has(tr.sponsorId)) gold.push(tr);
          else rest.push(tr);
        });
        result = [...gold, ...rest];
      }
    }
    return result;
  }, [terrains, searchQuery, filters, showActiveNow, terrainActivityMap, isWithinDistance, distanceFilter, userLocation, haversineDistance, sortCriteria, applyMultiSort, partnerUserIds]);

  const filteredTournaments = useMemo(() => {
    const statusOrder: Record<string, number> = { 'En cours': 0, 'À venir': 1, 'Terminé': 2 };
    const result = tournaments.filter(tr => {
      const matchesSearch = tr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tr.location.city.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filters.tournamentStatus === 'all' || tr.status === filters.tournamentStatus;
      const matchesFormat = filters.tournamentFormat === 'all' || tr.format === filters.tournamentFormat;
      const matchesLevel = filters.tournamentLevel === 'all' || tr.tournamentLevel === filters.tournamentLevel;
      const matchesCategory = filters.tournamentCategory === 'all' || tr.tournamentCategory === filters.tournamentCategory;
      const matchesRegistration = filters.tournamentRegistration === 'all' || tr.registrationType === filters.tournamentRegistration;
      const matchesScope = filters.tournamentScope === 'all' || tr.tournamentScope === filters.tournamentScope;
      const matchesCity = filters.tournamentCity === 'all' || (tr.location?.city || tr.terrainName) === filters.tournamentCity;
      const matchesDate = filters.tournamentDate === 'all' || (() => {
        const td = new Date(tr.date);
        const now = new Date();
        switch (filters.tournamentDate) {
          case 'this_month': {
            return td.getFullYear() === now.getFullYear() && td.getMonth() === now.getMonth();
          }
          case 'next_3_months': {
            const threeMonths = new Date(); threeMonths.setMonth(threeMonths.getMonth() + 3);
            return td >= now && td <= threeMonths;
          }
          case 'this_year': {
            return td.getFullYear() === now.getFullYear();
          }
          case 'past': {
            return td < now;
          }
          default: return true;
        }
      })();
      const matchesDist = isWithinDistance(tr.location?.latitude, tr.location?.longitude);
      const matchesVisibility = visibilityFilter === 'all' || (visibilityFilter === 'public' ? (tr as any).isPublic === true : (tr as any).isPublic !== true);
      return matchesSearch && matchesStatus && matchesFormat && matchesLevel && matchesCategory && matchesRegistration && matchesScope && matchesCity && matchesDate && matchesDist && matchesVisibility;
    });
    if (sortCriteria.length > 0) {
      return applyMultiSort(result);
    }
    const sorted = result.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
    // Gold-sponsored tournaments get priority position
    if (sortCriteria.length === 0) {
      const goldIds = new Set<string>();
      partnerUserIds.forEach((info, uid) => { if (info.tier === 'gold_sponsor') goldIds.add(uid); });
      if (goldIds.size > 0) {
        const gold: typeof sorted = [];
        const rest: typeof sorted = [];
        sorted.forEach(tr => {
          if ((tr as any).sponsorId && goldIds.has((tr as any).sponsorId as string)) gold.push(tr);
          else rest.push(tr);
        });
        return [...gold, ...rest];
      }
    }
    return sorted;
  }, [tournaments, searchQuery, filters, isWithinDistance, sortCriteria, applyMultiSort, partnerUserIds]);

  // Filtered events for events tab
  const filteredEvents = useMemo(() => {
    const getEffectiveEventStatus = (e: SponsoredEvent) => {
      if (e.status === 'completed' || e.status === 'cancelled') return e.status;
      const end = new Date(e.endTime || e.eventDate);
      const start = new Date(e.startTime || e.eventDate);
      const now = new Date();
      if (!Number.isNaN(end.getTime()) && now.getTime() > end.getTime()) return 'completed';
      if (e.status === 'upcoming' && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && now >= start && now <= end) return 'active';
      return e.status;
    };

    const filtered = sponsoredEvents.filter(e => {
      const effectiveStatus = getEffectiveEventStatus(e);
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || e.title.toLowerCase().includes(q) || (e.ambassadorName || '').toLowerCase().includes(q) || (e.city || '').toLowerCase().includes(q);
      const matchesStatus = filters.eventStatus === 'all' || effectiveStatus === filters.eventStatus;
      const matchesType = filters.eventType === 'all' || e.challengeType === filters.eventType;
      const matchesAmbassador = filters.eventAmbassador === 'all' || e.ambassadorId === filters.eventAmbassador;
      return matchesSearch && matchesStatus && matchesType && matchesAmbassador;
    }).map(e => ({ ...e, status: getEffectiveEventStatus(e) as any }));
    if (sortCriteria.length > 0) return applyMultiSort(filtered);
    return filtered;
  }, [sponsoredEvents, searchQuery, filters.eventStatus, filters.eventType, filters.eventAmbassador, sortCriteria, applyMultiSort]);

  // Get current filtered data (after all filtered arrays are defined)
  const getCurrentData = useCallback(() => {
    switch (activeTab) {
      case 'players': return filteredPlayers;
      case 'clubs': return filteredClubs;
      case 'terrains': return filteredTerrains;
      case 'tournaments': return filteredTournaments;
      case 'events': return filteredEvents as any[];
      default: return filteredPlayers;
    }
  }, [activeTab, filteredPlayers, filteredClubs, filteredTerrains, filteredTournaments, filteredEvents]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const data = getCurrentData();
    return data.slice(0, visibleCount);
  }, [visibleCount, getCurrentData]);

  const hasMore = useMemo(() => {
    return getCurrentData().length > visibleCount;
  }, [visibleCount, getCurrentData]);

  const handleLoadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount(prev => prev + PAGE_SIZE);
    }
  }, [hasMore]);

  // Scroll-ahead image prefetch for avatars and terrain photos
  const getItemImageUrl = useCallback((item: any) => {
    if (!item) return undefined;
    if (activeTab === 'players') return item.avatar;
    if (activeTab === 'terrains') return item.photos?.[0];
    if (activeTab === 'tournaments') {
      const url = item.posterUrl as string | undefined;
      return url && !url.toLowerCase().endsWith('.pdf') ? url : undefined;
    }
    return undefined;
  }, [activeTab]);
  const scrollPrefetch = useScrollPrefetch(getItemImageUrl, 10);
  useEffect(() => { scrollPrefetch.setData(paginatedData); }, [paginatedData]);

  const clearFilters = useCallback(() => {
    setDistanceFilter('all');
    if (activeTab === 'players') {
      setFilters(f => ({ ...f, playerClub: 'all', playerCity: 'all', playerCountry: 'all', playerLevel: 'all', playerRole: 'all', playerEloRank: 'all', playerExperience: 'all', playerTerrain: 'all' }));
    } else if (activeTab === 'clubs') {
      setFilters(f => ({ ...f, clubCity: 'all', clubCountry: 'all', clubEquipment: 'all', clubMembersRange: 'all' }));
    } else if (activeTab === 'terrains') {
      setFilters(f => ({ ...f, terrainType: 'all', terrainCity: 'all', terrainCountry: 'all', terrainLighting: 'all', terrainCovered: 'all', terrainEnvironment: 'all', terrainAccess: 'all', terrainParking: 'all', terrainToilets: 'all' }));
    } else if (activeTab === 'tournaments') {
      setFilters(f => ({ ...f, tournamentStatus: 'all', tournamentFormat: 'all', tournamentLevel: 'all', tournamentCategory: 'all', tournamentRegistration: 'all', tournamentScope: 'all', tournamentCity: 'all', tournamentDate: 'all' }));
    } else if (activeTab === 'events') {
      setFilters(f => ({ ...f, eventStatus: 'all', eventType: 'all', eventAmbassador: 'all' }));
    }
  }, [activeTab]);

  // Sort fields available per tab
  const getSortFields = useCallback((): { field: SortField; label: string; icon: string; defaultDir: SortDirection }[] => {
    switch (activeTab) {
      case 'players': return [
        { field: 'elo', label: 'ELO', icon: 'trending-up', defaultDir: 'desc' },
        { field: 'win_rate', label: t('directory', 'sortWinRate'), icon: 'emoji-events', defaultDir: 'desc' },
        { field: 'name', label: t('directory', 'sortName'), icon: 'sort-by-alpha', defaultDir: 'asc' },
        { field: 'city', label: t('directory', 'sortCity'), icon: 'place', defaultDir: 'asc' },
        { field: 'club', label: t('directory', 'sortClub'), icon: 'home', defaultDir: 'asc' },
      ];
      case 'clubs': return [
        { field: 'members', label: t('directory', 'sortMembersDesc'), icon: 'groups', defaultDir: 'desc' },
        { field: 'name', label: t('directory', 'sortName'), icon: 'sort-by-alpha', defaultDir: 'asc' },
        { field: 'city', label: t('directory', 'sortCity'), icon: 'place', defaultDir: 'asc' },
      ];
      case 'terrains': return [
        { field: 'activity', label: t('directory', 'sortActivityDesc'), icon: 'local-fire-department', defaultDir: 'desc' },
        { field: 'courts', label: t('directory', 'sortCourtsDesc'), icon: 'sports-soccer', defaultDir: 'desc' },
        { field: 'name', label: t('directory', 'sortName'), icon: 'sort-by-alpha', defaultDir: 'asc' },
        { field: 'city', label: t('directory', 'sortCity'), icon: 'place', defaultDir: 'asc' },
      ];
      case 'tournaments': return [
        { field: 'participants', label: t('directory', 'sortParticipantsDesc'), icon: 'people', defaultDir: 'desc' },
        { field: 'date', label: t('directory', 'sortDateDesc'), icon: 'event', defaultDir: 'desc' },
        { field: 'name', label: t('directory', 'sortName'), icon: 'sort-by-alpha', defaultDir: 'asc' },
        { field: 'city', label: t('directory', 'sortCity'), icon: 'place', defaultDir: 'asc' },
      ];
      case 'events': return [
        { field: 'date', label: t('directory', 'sortDateDesc'), icon: 'event', defaultDir: 'desc' },
      ];
      default: return [];
    }
  }, [activeTab, t]);

  const addSortCriterion = useCallback((field: SortField, defaultDir: SortDirection) => {
    setSortCriteria(prev => {
      if (prev.find(c => c.field === field)) return prev;
      return [...prev, { field, direction: defaultDir }];
    });
  }, []);

  const removeSortCriterion = useCallback((field: SortField) => {
    setSortCriteria(prev => prev.filter(c => c.field !== field));
  }, []);

  const toggleSortDirection = useCallback((field: SortField) => {
    setSortCriteria(prev => prev.map(c => c.field === field ? { ...c, direction: c.direction === 'asc' ? 'desc' : 'asc' } : c));
  }, []);

  const moveSortCriterion = useCallback((field: SortField, direction: 'up' | 'down') => {
    setSortCriteria(prev => {
      const idx = prev.findIndex(c => c.field === field);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  const sortCriteriaLabels = useMemo(() => {
    const fields = getSortFields();
    return sortCriteria.map(c => {
      const f = fields.find(sf => sf.field === c.field);
      return f ? `${f.label} ${c.direction === 'desc' ? '↓' : '↑'}` : c.field;
    });
  }, [sortCriteria, getSortFields]);

  const getTerrainTypeConfig = (type: string) => {
    return config.terrainTypes.find(tc => tc.id === type) || config.terrainTypes[0];
  };

  // Translate tournament status for display
  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      'À venir': t('tournamentStatus', 'upcoming'),
      'En cours': t('tournamentStatus', 'inProgress'),
      'Terminé': t('tournamentStatus', 'completed'),
    };
    return map[status] || status;
  };

  // Render functions — use memoized components
  const renderPlayer = useCallback(({ item }: { item: Player }) => {
    return <MemoizedPlayerCard item={item} selfPlayer={selfPlayer} getSharedPermission={getSharedPermission} partnerUserIds={partnerUserIds} t={t} language={language} handleInviteToMeetup={handleInviteToMeetup} user={user} />;
  }, [selfPlayer, getSharedPermission, partnerUserIds, t, language, handleInviteToMeetup, user]);

  const renderClub = useCallback(({ item }: { item: Club }) => {
    return <MemoizedClubCard item={item} favoriteClubIds={favoriteClubIds} getSharedPermission={getSharedPermission} partnerUserIds={partnerUserIds} t={t} language={language} userId={user?.id} />;
  }, [favoriteClubIds, getSharedPermission, partnerUserIds, t, language, user?.id]);

  const renderTerrain = useCallback(({ item }: { item: Terrain }) => {
    const activityInfo = terrainActivityMap.get(item.id) || undefined;
    return <MemoizedTerrainCard item={item} favoriteTerrainIds={favoriteTerrainIds} getSharedPermission={getSharedPermission} partnerUserIds={partnerUserIds} t={t} language={language} getTerrainTypeConfig={getTerrainTypeConfig} activityInfo={activityInfo} userId={user?.id} />;
  }, [favoriteTerrainIds, getSharedPermission, partnerUserIds, t, language, terrainActivityMap, user?.id]);

  const renderTournament = useCallback(({ item }: { item: Tournament }) => {
    return <MemoizedTournamentCard item={item} getSharedPermission={getSharedPermission} partnerUserIds={partnerUserIds} t={t} language={language} getStatusLabel={getStatusLabel} userId={user?.id} />;
  }, [getSharedPermission, partnerUserIds, t, language, user?.id]);

  const renderEvent = useCallback(({ item }: { item: any }) => {
    return <MemoizedEventCard item={item} language={language} />;
  }, [language]);

  const getCurrentRenderItem = () => {
    switch (activeTab) {
      case 'players': return renderPlayer;
      case 'clubs': return renderClub;
      case 'terrains': return renderTerrain;
      case 'tournaments': return renderTournament;
      case 'events': return renderEvent;
    }
  };

  // Distance filter section for all tabs except events
  const renderDistanceFilter = () => {
    if (activeTab === 'events') return null;
    return (
      <FilterSection
        title={t('directory', 'distanceFilter')}
        options={[{ value: 'all', count: -1 }, { value: '5', count: -1 }, { value: '10', count: -1 }, { value: '25', count: -1 }, { value: '50', count: -1 }, { value: '100', count: -1 }]}
        value={distanceFilter}
        onChange={(v) => setDistanceFilter(v as any)}
        labels={{ all: t('directory', 'distanceAll'), '5': '5 km', '10': '10 km', '25': '25 km', '50': '50 km', '100': '100 km' }}
        icons={{ '5': 'near-me', '10': 'near-me', '25': 'explore', '50': 'explore', '100': 'public' }}
        allLabel={t('directory', 'distanceAll')}
        showSearch={false}
      />
    );
  };

  // Filter Modal Content
  const renderFilterContent = () => {
    switch (activeTab) {
      case 'players': {
        return (
          <>
            {renderDistanceFilter()}
            <FilterSection
              title={t('directory', 'role')}
              options={uniqueValues.playerRoles}
              value={filters.playerRole}
              onChange={(v) => setFilters(f => ({ ...f, playerRole: v }))}
              icons={{ 'Pointeur': 'radio-button-on', 'Tireur': 'gps-fixed', 'Milieu': 'swap-horiz' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('player', 'experienceLabel')}
              options={uniqueValues.playerExperiences}
              labels={{ all: t('directory', 'allLabel'), less_than_1: t('player', 'experienceLessThan1'), '1_to_3': t('player', 'experience1to3'), '3_to_10': t('player', 'experience3to10'), more_than_10: t('player', 'experienceMoreThan10') }}
              value={filters.playerExperience}
              onChange={(v) => setFilters(f => ({ ...f, playerExperience: v }))}
              icons={{ less_than_1: 'child-care', '1_to_3': 'school', '3_to_10': 'trending-up', more_than_10: 'emoji-events' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={language === 'fr' ? 'Rang ELO' : 'ELO Rank'}
              options={uniqueValues.playerEloRanks}
              labels={{ all: t('directory', 'allLabel'), bronze: 'Bronze', silver: language === 'fr' ? 'Argent' : 'Silver', gold: language === 'fr' ? 'Or' : 'Gold', diamond: language === 'fr' ? 'Diamant' : 'Diamond', master: language === 'fr' ? 'Maitre' : 'Master', grand_master: language === 'fr' ? 'Grand Maitre' : 'Grand Master' }}
              value={filters.playerEloRank}
              onChange={(v) => setFilters(f => ({ ...f, playerEloRank: v }))}
              icons={{ bronze: 'shield', silver: 'workspace-premium', gold: 'emoji-events', diamond: 'diamond', master: 'military-tech', grand_master: 'auto-awesome' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            {uniqueValues.playerTerrains.length > 0 ? (
              <FilterSection
                title={language === 'fr' ? 'Terrain de pratique' : 'Practice terrain'}
                options={uniqueValues.playerTerrains}
                value={filters.playerTerrain}
                onChange={(v) => setFilters(f => ({ ...f, playerTerrain: v }))}
                icons={{}}
                allLabel={t('directory', 'allLabel')}
                searchPlaceholder={t('directory', 'searchInFilter')}
              />
            ) : null}
            <FilterSection
              title={t('directory', 'clubs')}
              options={uniqueValues.playerClubs}
              value={filters.playerClub}
              onChange={(v) => setFilters(f => ({ ...f, playerClub: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'city')}
              options={uniqueValues.playerCities}
              value={filters.playerCity}
              onChange={(v) => setFilters(f => ({ ...f, playerCity: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'country')}
              options={uniqueValues.playerCountries}
              value={filters.playerCountry}
              onChange={(v) => setFilters(f => ({ ...f, playerCountry: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
          </>
        );
      }
      case 'clubs': {
        const facilityLabels: Record<string, string> = { all: t('directory', 'allLabel') };
        uniqueValues.clubEquipments.forEach(f => { facilityLabels[f.value] = t('facilityLabels', f.value) || f.value; });
        return (
          <>
            {renderDistanceFilter()}
            <FilterSection
              title={language === 'fr' ? 'Nombre de membres' : 'Member count'}
              options={uniqueValues.clubMembersRanges}
              labels={{ all: t('directory', 'allLabel'), '1-10': '1-10', '11-30': '11-30', '31-50': '31-50', '50+': '50+' }}
              value={filters.clubMembersRange}
              onChange={(v) => setFilters(f => ({ ...f, clubMembersRange: v }))}
              icons={{ '1-10': 'person', '11-30': 'people', '31-50': 'groups', '50+': 'diversity-3' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            {uniqueValues.clubEquipments.length > 0 ? (
              <FilterSection
                title={language === 'fr' ? 'Equipements' : 'Facilities'}
                options={uniqueValues.clubEquipments}
                labels={facilityLabels}
                value={filters.clubEquipment}
                onChange={(v) => setFilters(f => ({ ...f, clubEquipment: v }))}
                icons={{}}
                allLabel={t('directory', 'allLabel')}
                searchPlaceholder={t('directory', 'searchInFilter')}
              />
            ) : null}
            <FilterSection
              title={t('directory', 'city')}
              options={uniqueValues.clubCities}
              value={filters.clubCity}
              onChange={(v) => setFilters(f => ({ ...f, clubCity: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'country')}
              options={uniqueValues.clubCountries}
              value={filters.clubCountry}
              onChange={(v) => setFilters(f => ({ ...f, clubCountry: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
          </>
        );
      }
      case 'terrains':
        return (
          <>
            {renderDistanceFilter()}
            <FilterSection
              title={t('directory', 'environmentLabel')}
              options={[{ value: 'indoor', count: -1 }, { value: 'outdoor', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), indoor: t('directory', 'indoorLabel'), outdoor: t('directory', 'outdoorLabel') }}
              value={filters.terrainEnvironment}
              onChange={(v) => setFilters(f => ({ ...f, terrainEnvironment: v as 'all' | 'indoor' | 'outdoor' }))}
              icons={{ indoor: 'domain', outdoor: 'park' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'surfaceType')}
              options={uniqueValues.terrainTypes}
              labels={{ all: t('directory', 'allLabel'), ...Object.fromEntries(config.terrainTypes.map(tc => [tc.id, t('terrainTypes', tc.id)])) }}
              value={filters.terrainType}
              onChange={(v) => setFilters(f => ({ ...f, terrainType: v as TerrainType | 'all' }))}
              icons={Object.fromEntries(config.terrainTypes.map(tc => [tc.id, tc.icon]))}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'city')}
              options={uniqueValues.terrainCities}
              value={filters.terrainCity}
              onChange={(v) => setFilters(f => ({ ...f, terrainCity: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'country')}
              options={uniqueValues.terrainCountries}
              value={filters.terrainCountry}
              onChange={(v) => setFilters(f => ({ ...f, terrainCountry: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'lightingLabel')}
              options={[{ value: 'yes', count: -1 }, { value: 'no', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), yes: t('directory', 'withLighting'), no: t('directory', 'withoutLighting') }}
              value={filters.terrainLighting}
              onChange={(v) => setFilters(f => ({ ...f, terrainLighting: v as 'all' | 'yes' | 'no' }))}
              icons={{ yes: 'lightbulb', no: 'lightbulb-outline' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'coverLabel')}
              options={[{ value: 'yes', count: -1 }, { value: 'no', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), yes: t('directory', 'coveredLabel'), no: t('directory', 'outdoorCover') }}
              value={filters.terrainCovered}
              onChange={(v) => setFilters(f => ({ ...f, terrainCovered: v as 'all' | 'yes' | 'no' }))}
              icons={{ yes: 'roofing', no: 'wb-sunny' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'accessFilterLabel')}
              options={[{ value: 'public', count: -1 }, { value: 'private', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), public: t('directory', 'publicAccessLabel'), private: t('directory', 'privateAccessLabel') }}
              value={filters.terrainAccess}
              onChange={(v) => setFilters(f => ({ ...f, terrainAccess: v as 'all' | 'public' | 'private' }))}
              icons={{ public: 'public', private: 'lock' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('terrain', 'parking')}
              options={[{ value: 'yes', count: -1 }, { value: 'no', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), yes: language === 'fr' ? 'Avec parking' : 'With parking', no: language === 'fr' ? 'Sans parking' : 'Without parking' }}
              value={filters.terrainParking}
              onChange={(v) => setFilters(f => ({ ...f, terrainParking: v as 'all' | 'yes' | 'no' }))}
              icons={{ yes: 'local-parking', no: 'block' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('terrain', 'toilets')}
              options={[{ value: 'yes', count: -1 }, { value: 'no', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), yes: language === 'fr' ? 'Avec toilettes' : 'With restrooms', no: language === 'fr' ? 'Sans toilettes' : 'Without restrooms' }}
              value={filters.terrainToilets}
              onChange={(v) => setFilters(f => ({ ...f, terrainToilets: v as 'all' | 'yes' | 'no' }))}
              icons={{ yes: 'wc', no: 'block' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
          </>
        );
      case 'events':
        return (
          <>
            <FilterSection
              title={language === 'fr' ? 'Statut' : 'Status'}
              options={[{ value: 'upcoming', count: -1 }, { value: 'active', count: -1 }, { value: 'completed', count: -1 }, { value: 'cancelled', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), upcoming: language === 'fr' ? 'A venir' : 'Upcoming', active: language === 'fr' ? 'En cours' : 'Active', completed: language === 'fr' ? 'Termine' : 'Completed', cancelled: language === 'fr' ? 'Annule' : 'Cancelled' }}
              value={filters.eventStatus}
              onChange={(v) => setFilters(f => ({ ...f, eventStatus: v }))}
              icons={{ upcoming: 'event', active: 'play-circle', completed: 'check-circle', cancelled: 'cancel' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={language === 'fr' ? 'Type de defi' : 'Challenge type'}
              options={[{ value: '10_tirs', count: -1 }, { value: '10_tirs_sautee', count: -1 }, { value: 'precision', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), '10_tirs': '10 Tirs', '10_tirs_sautee': language === 'fr' ? '10 Tirs sautee' : '10 Lob Shots', precision: language === 'fr' ? 'Precision' : 'Precision' }}
              value={filters.eventType}
              onChange={(v) => setFilters(f => ({ ...f, eventType: v }))}
              icons={{ '10_tirs': 'gps-fixed', '10_tirs_sautee': 'flight-takeoff', precision: 'stars' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            {(() => {
              const ambOptions = sponsoredEvents.reduce((acc, e) => {
                if (e.ambassadorId && !acc.find(a => a.value === e.ambassadorId)) acc.push({ value: e.ambassadorId, count: -1 });
                return acc;
              }, [] as { value: string; count: number }[]);
              const ambLabels: Record<string, string> = { all: t('directory', 'allLabel') };
              sponsoredEvents.forEach(e => { if (e.ambassadorId && e.ambassadorName) ambLabels[e.ambassadorId] = e.ambassadorName; });
              return ambOptions.length > 0 ? (
                <FilterSection
                  title={language === 'fr' ? 'Ambassadeur' : 'Ambassador'}
                  options={ambOptions}
                  labels={ambLabels}
                  value={filters.eventAmbassador}
                  onChange={(v) => setFilters(f => ({ ...f, eventAmbassador: v }))}
                  icons={{}}
                  allLabel={t('directory', 'allLabel')}
                  searchPlaceholder={t('directory', 'searchInFilter')}
                />
              ) : null;
            })()}
          </>
        );
      case 'tournaments':
        return (
          <>
            {renderDistanceFilter()}
            <FilterSection
              title={language === 'fr' ? 'Periode' : 'Date Range'}
              options={[{ value: 'this_month', count: -1 }, { value: 'next_3_months', count: -1 }, { value: 'this_year', count: -1 }, { value: 'past', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), this_month: language === 'fr' ? 'Ce mois' : 'This month', next_3_months: language === 'fr' ? '3 prochains mois' : 'Next 3 months', this_year: language === 'fr' ? 'Cette annee' : 'This year', past: language === 'fr' ? 'Passes' : 'Past' }}
              value={filters.tournamentDate}
              onChange={(v) => setFilters(f => ({ ...f, tournamentDate: v }))}
              icons={{ this_month: 'today', next_3_months: 'date-range', this_year: 'calendar-today', past: 'history' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'status')}
              options={[{ value: 'À venir', count: -1 }, { value: 'En cours', count: -1 }, { value: 'Terminé', count: -1 }]}
              labels={{ all: t('directory', 'allLabel'), 'À venir': t('tournamentStatus', 'upcoming'), 'En cours': t('tournamentStatus', 'inProgress'), 'Terminé': t('tournamentStatus', 'completed') }}
              value={filters.tournamentStatus}
              onChange={(v) => setFilters(f => ({ ...f, tournamentStatus: v as TournamentStatus }))}
              icons={{ 'À venir': 'event', 'En cours': 'play-circle', 'Terminé': 'check-circle' }}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            <FilterSection
              title={t('directory', 'locationLabel')}
              options={uniqueValues.tournamentCities}
              value={filters.tournamentCity}
              onChange={(v) => setFilters(f => ({ ...f, tournamentCity: v }))}
              allLabel={t('directory', 'allLabel')}
              searchPlaceholder={t('directory', 'searchInFilter')}
            />
            <FilterSection
              title={t('directory', 'format')}
              options={uniqueValues.tournamentFormats}
              value={filters.tournamentFormat}
              onChange={(v) => setFilters(f => ({ ...f, tournamentFormat: v }))}
              allLabel={t('directory', 'allLabel')}
              showSearch={false}
            />
            {uniqueValues.tournamentLevels.length > 0 && (
              <FilterSection
                title={t('directory', 'level')}
                options={uniqueValues.tournamentLevels}
                value={filters.tournamentLevel}
                onChange={(v) => setFilters(f => ({ ...f, tournamentLevel: v }))}
                icons={{ 'Loisir / Amical': 'mood', 'Promotion': 'trending-up', 'Honneur': 'star', 'Élite': 'emoji-events' }}
                labels={Object.fromEntries(uniqueValues.tournamentLevels.map(l => [l.value, t('tournamentLevels', l.value)]))}
                allLabel={t('directory', 'allLabel')}
                showSearch={false}
              />
            )}
            {uniqueValues.tournamentCategories.length > 0 && (
              <FilterSection
                title={t('directory', 'tournamentType')}
                options={uniqueValues.tournamentCategories}
                labels={Object.fromEntries(uniqueValues.tournamentCategories.map(c => [c.value, t('tournamentCategories', c.value)]))}
                value={filters.tournamentCategory}
                onChange={(v) => setFilters(f => ({ ...f, tournamentCategory: v }))}
                allLabel={t('directory', 'allLabel')}
                showSearch={false}
              />
            )}
            {uniqueValues.tournamentRegistrations.length > 0 && (
              <FilterSection
                title={t('directory', 'registrationType')}
                options={uniqueValues.tournamentRegistrations}
                value={filters.tournamentRegistration}
                onChange={(v) => setFilters(f => ({ ...f, tournamentRegistration: v }))}
                labels={Object.fromEntries(uniqueValues.tournamentRegistrations.map(r => [r.value, t('registrationTypes', r.value)]))}
                icons={{ 'Inscription libre': 'lock-open', 'Sur invitation': 'mail', 'Réservé aux licenciés': 'verified', 'Ouvert': 'public' }}
                allLabel={t('directory', 'allLabel')}
                showSearch={false}
              />
            )}
            {uniqueValues.tournamentScopes.length > 0 && (
              <FilterSection
                title={t('directory', 'scopeLabel')}
                options={uniqueValues.tournamentScopes}
                value={filters.tournamentScope}
                onChange={(v) => setFilters(f => ({ ...f, tournamentScope: v }))}
                labels={Object.fromEntries(uniqueValues.tournamentScopes.map(s => [s.value, t('tournamentScopes', s.value)]))}
                icons={{ 'Tournoi de club': 'home', 'Championnat départemental': 'place', 'Championnat régional': 'map', 'Championnat national': 'flag', 'Championnat international': 'public' }}
                allLabel={t('directory', 'allLabel')}
                showSearch={false}
              />
            )}
          </>
        );
    }
  };

  const tabConfig = TABS.find(tc => tc.id === activeTab);
  const currentData = getCurrentData();
  const dataCount = currentData.length;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header - Gradient Hero */}
      <View style={styles.header}>
        <View style={[styles.headerGradient, { backgroundColor: '#0F172A' }]}>
          {/* Decorative circles for glassmorphism depth */}
          <View style={styles.headerDecoCircle1} />
          <View style={styles.headerDecoCircle2} />
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('directory', 'directory')}</Text>
              <Text style={styles.headerSubtitleText}>
                {dataCount} {getTabPlural(activeTab)}{searchQuery ? ` ${t('directory', 'forSearch')} "${searchQuery}"` : ''}
              </Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={styles.searchInput}
                placeholder={getSearchPlaceholder()}
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              ) : null}
            </View>
            {activeTab === 'players' ? (
              <Pressable
                style={[styles.headerRealUserBtn, showRealUsersOnly && styles.headerRealUserBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setShowRealUsersOnly(!showRealUsersOnly); }}
              >
                <MaterialIcons name="verified" size={16} color={showRealUsersOnly ? '#FFF' : 'rgba(255,255,255,0.7)'} />
              </Pressable>
            ) : null}
            {activeTab === 'terrains' ? (
              <Pressable
                style={[styles.headerRealUserBtn, showActiveNow && { backgroundColor: '#22C55E', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }]}
                onPress={() => { Haptics.selectionAsync(); setShowActiveNow(!showActiveNow); }}
              >
                <MaterialIcons name="local-fire-department" size={16} color={showActiveNow ? '#FFF' : 'rgba(255,255,255,0.7)'} />
              </Pressable>
            ) : null}
            {activeTab === 'terrains' && showActiveNow && terrainActivityMap.size > 0 ? (
              <Pressable
                style={[styles.headerRealUserBtn, { backgroundColor: '#3B82F6', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }]}
                onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(tabs)/map', params: { filter: 'terrains', activeNow: 'true' } } as any); }}
              >
                <MaterialIcons name="map" size={16} color="#FFF" />
              </Pressable>
            ) : null}
            {activeTab !== 'events' ? (
              <Pressable
                style={[styles.headerRealUserBtn, visibilityFilter !== 'all' && { backgroundColor: visibilityFilter === 'public' ? theme.success : theme.textMuted, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibilityFilter(prev => prev === 'all' ? 'public' : prev === 'public' ? 'private' : 'all');
                }}
              >
                <MaterialIcons name={visibilityFilter === 'public' ? 'public' : visibilityFilter === 'private' ? 'lock' : 'visibility'} size={16} color={visibilityFilter !== 'all' ? '#FFF' : 'rgba(255,255,255,0.7)'} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.sortButton, sortCriteria.length > 0 && styles.sortButtonActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setShowSortModal(true);
              }}
            >
              <MaterialIcons 
                name="swap-vert" 
                size={20} 
                color={sortCriteria.length > 0 ? '#FFF' : 'rgba(255,255,255,0.6)'} 
              />
              {sortCriteria.length > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{sortCriteria.length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={[styles.filterButton, currentFilterCount > 0 && styles.filterButtonActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setShowFilters(true);
              }}
            >
              <MaterialIcons 
                name="tune" 
                size={20} 
                color={currentFilterCount > 0 ? '#FFF' : 'rgba(255,255,255,0.6)'} 
              />
              {currentFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{currentFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* Header Stats Summary */}
          <View style={styles.headerStatsSummary}>
            {TABS.map((tab, i) => (
              <React.Fragment key={tab.id}>
                {i > 0 ? <View style={styles.headerStatsDivider} /> : null}
                <Pressable style={styles.headerStatsItem} onPress={() => { setActiveTab(tab.id); setSearchQuery(''); }}>
                  <Text style={[styles.headerStatsValue, activeTab === tab.id && { color: '#FFF', fontSize: 19 }]}>{counts[tab.id]}</Text>
                  <Text style={[styles.headerStatsLabel, activeTab === tab.id && { color: 'rgba(255,255,255,0.7)' }]}>{tab.label}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContainer}
          >
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={[styles.tab, isActive && { backgroundColor: tab.color, ...theme.shadows.card }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab(tab.id);
                    setSearchQuery('');
                  }}
                >
                  <MaterialIcons 
                    name={tab.icon as any} 
                    size={18} 
                    color={isActive ? '#FFF' : theme.textSecondary} 
                  />
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                      {counts[tab.id]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Quick Add Button for current tab */}
          <Pressable
            style={({ pressed }) => [styles.quickAddBtn, { backgroundColor: activeTabColor }, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const routes: Record<DirectoryTab, string> = {
                players: '/player/new',
                clubs: '/club/new',
                terrains: '/terrain/new',
                tournaments: '/tournament/new',
                events: '/sponsored-event/new',
              };
              router.push(routes[activeTab] as any);
            }}
          >
            <MaterialIcons name="add" size={22} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* Duplicate Detection Banner */}
      {duplicates.length > 0 && showDuplicateBanner ? (
        <View style={styles.duplicateBanner}>
          <View style={styles.duplicateBannerIcon}>
            <MaterialIcons name="content-copy" size={18} color={theme.warning} />
          </View>
          <View style={styles.duplicateBannerContent}>
            <Text style={styles.duplicateBannerTitle}>{t('directory', 'duplicateBannerTitle')}</Text>
            <Text style={styles.duplicateBannerDesc}>{duplicates.length} {t('directory', 'duplicateBannerDesc')}</Text>
          </View>
          <Pressable
            style={styles.duplicateBannerBtn}
            onPress={() => { Haptics.selectionAsync(); setShowDuplicateModal(true); }}
          >
            <Text style={styles.duplicateBannerBtnText}>{t('directory', 'duplicateBannerAction')}</Text>
          </Pressable>
          <Pressable style={styles.duplicateBannerClose} onPress={() => setShowDuplicateBanner(false)} hitSlop={8}>
            <MaterialIcons name="close" size={14} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Sort Indicator */}
      {sortCriteria.length > 0 ? (
        <View style={styles.sortIndicator}>
          <MaterialIcons name="swap-vert" size={14} color={activeTabColor} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 8 }} style={{ flex: 1 }}>
            {sortCriteriaLabels.map((label, i) => (
              <View key={i} style={[styles.sortIndicatorChip, { backgroundColor: activeTabColor + '12', borderColor: activeTabColor + '30' }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: activeTabColor, marginRight: 2 }}>{i + 1}</Text>
                <Text style={[styles.sortIndicatorChipText, { color: activeTabColor }]}>{label}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={() => setSortCriteria([])} hitSlop={8} style={styles.sortIndicatorClear}>
            <MaterialIcons name="close" size={14} color={activeTabColor} />
          </Pressable>
        </View>
      ) : null}

      {/* Active Filters Display */}
      {currentFilterCount > 0 ? (
        <View style={styles.activeFiltersContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeFiltersScroll}
          >
            <Pressable style={styles.clearAllButton} onPress={clearFilters}>
              <MaterialIcons name="clear-all" size={16} color={theme.error} />
              <Text style={styles.clearAllText}>{t('directory', 'clearLabel')}</Text>
            </Pressable>
            {distanceFilter !== 'all' && activeTab !== 'events' && <ActiveFilterChip label={`${distanceFilter} km`} onRemove={() => setDistanceFilter('all')} icon="near-me" />}
            {activeTab === 'players' && (
              <>
                {filters.playerRole !== 'all' && <ActiveFilterChip label={t('roles', filters.playerRole)} onRemove={() => setFilters(f => ({ ...f, playerRole: 'all' }))} />}
                {filters.playerEloRank !== 'all' && (() => { const eloLabels: Record<string, string> = { bronze: 'Bronze', silver: language === 'fr' ? 'Argent' : 'Silver', gold: language === 'fr' ? 'Or' : 'Gold', diamond: language === 'fr' ? 'Diamant' : 'Diamond', master: language === 'fr' ? 'Maitre' : 'Master', grand_master: language === 'fr' ? 'Grand Maitre' : 'Grand Master' }; return <ActiveFilterChip label={eloLabels[filters.playerEloRank] || filters.playerEloRank} onRemove={() => setFilters(f => ({ ...f, playerEloRank: 'all' }))} icon="diamond" />; })()}
                {filters.playerExperience !== 'all' && <ActiveFilterChip label={t('player', filters.playerExperience === 'less_than_1' ? 'experienceLessThan1' : filters.playerExperience === '1_to_3' ? 'experience1to3' : filters.playerExperience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')} onRemove={() => setFilters(f => ({ ...f, playerExperience: 'all' }))} icon="timeline" />}
                {filters.playerTerrain !== 'all' && <ActiveFilterChip label={filters.playerTerrain} onRemove={() => setFilters(f => ({ ...f, playerTerrain: 'all' }))} icon="sports-soccer" />}
                {filters.playerClub !== 'all' && <ActiveFilterChip label={filters.playerClub} onRemove={() => setFilters(f => ({ ...f, playerClub: 'all' }))} />}
                {filters.playerCity !== 'all' && <ActiveFilterChip label={filters.playerCity} onRemove={() => setFilters(f => ({ ...f, playerCity: 'all' }))} />}
                {filters.playerCountry !== 'all' && <ActiveFilterChip label={filters.playerCountry} onRemove={() => setFilters(f => ({ ...f, playerCountry: 'all' }))} />}
              </>
            )}
            {activeTab === 'clubs' && (
              <>
                {filters.clubMembersRange !== 'all' && <ActiveFilterChip label={filters.clubMembersRange} onRemove={() => setFilters(f => ({ ...f, clubMembersRange: 'all' }))} icon="people" />}
                {filters.clubEquipment !== 'all' && <ActiveFilterChip label={t('facilityLabels', filters.clubEquipment) || filters.clubEquipment} onRemove={() => setFilters(f => ({ ...f, clubEquipment: 'all' }))} icon="fitness-center" />}
                {filters.clubCity !== 'all' && <ActiveFilterChip label={filters.clubCity} onRemove={() => setFilters(f => ({ ...f, clubCity: 'all' }))} />}
                {filters.clubCountry !== 'all' && <ActiveFilterChip label={filters.clubCountry} onRemove={() => setFilters(f => ({ ...f, clubCountry: 'all' }))} />}
              </>
            )}
            {activeTab === 'terrains' && (
              <>
                {filters.terrainEnvironment !== 'all' && <ActiveFilterChip label={filters.terrainEnvironment === 'indoor' ? t('directory', 'indoorShort') : t('directory', 'outdoorShort')} onRemove={() => setFilters(f => ({ ...f, terrainEnvironment: 'all' }))} icon={filters.terrainEnvironment === 'indoor' ? 'domain' : 'park'} />}
                {filters.terrainType !== 'all' && <ActiveFilterChip label={t('terrainTypes', filters.terrainType)} onRemove={() => setFilters(f => ({ ...f, terrainType: 'all' }))} />}
                {filters.terrainCity !== 'all' && <ActiveFilterChip label={filters.terrainCity} onRemove={() => setFilters(f => ({ ...f, terrainCity: 'all' }))} />}
                {filters.terrainCountry !== 'all' && <ActiveFilterChip label={filters.terrainCountry} onRemove={() => setFilters(f => ({ ...f, terrainCountry: 'all' }))} icon="public" />}
                {filters.terrainLighting !== 'all' && <ActiveFilterChip label={filters.terrainLighting === 'yes' ? t('directory', 'litLabel') : t('directory', 'notLitLabel')} onRemove={() => setFilters(f => ({ ...f, terrainLighting: 'all' }))} icon="lightbulb" />}
                {filters.terrainCovered !== 'all' && <ActiveFilterChip label={filters.terrainCovered === 'yes' ? t('directory', 'coveredLabel') : t('directory', 'outdoorShort')} onRemove={() => setFilters(f => ({ ...f, terrainCovered: 'all' }))} icon="roofing" />}
                {filters.terrainAccess !== 'all' && <ActiveFilterChip label={filters.terrainAccess === 'public' ? t('directory', 'publicAccessShort') : t('directory', 'privateAccessShort')} onRemove={() => setFilters(f => ({ ...f, terrainAccess: 'all' }))} icon={filters.terrainAccess === 'public' ? 'public' : 'lock'} />}
                {filters.terrainParking !== 'all' && <ActiveFilterChip label={filters.terrainParking === 'yes' ? 'Parking' : (language === 'fr' ? 'Sans parking' : 'No parking')} onRemove={() => setFilters(f => ({ ...f, terrainParking: 'all' }))} icon="local-parking" />}
                {filters.terrainToilets !== 'all' && <ActiveFilterChip label={filters.terrainToilets === 'yes' ? (language === 'fr' ? 'Toilettes' : 'Restrooms') : (language === 'fr' ? 'Sans toilettes' : 'No restrooms')} onRemove={() => setFilters(f => ({ ...f, terrainToilets: 'all' }))} icon="wc" />}
              </>
            )}
            {activeTab === 'events' && (
              <>
                {filters.eventStatus !== 'all' && <ActiveFilterChip label={filters.eventStatus === 'upcoming' ? (language === 'fr' ? 'A venir' : 'Upcoming') : filters.eventStatus === 'active' ? (language === 'fr' ? 'En cours' : 'Active') : filters.eventStatus === 'completed' ? (language === 'fr' ? 'Termine' : 'Completed') : (language === 'fr' ? 'Annule' : 'Cancelled')} onRemove={() => setFilters(f => ({ ...f, eventStatus: 'all' }))} icon="event" />}
                {filters.eventType !== 'all' && <ActiveFilterChip label={filters.eventType === '10_tirs' ? '10 Tirs' : filters.eventType === '10_tirs_sautee' ? (language === 'fr' ? '10 Tirs sautee' : '10 Lob Shots') : 'Precision'} onRemove={() => setFilters(f => ({ ...f, eventType: 'all' }))} icon="track-changes" />}
                {filters.eventAmbassador !== 'all' && (() => { const amb = sponsoredEvents.find(e => e.ambassadorId === filters.eventAmbassador); return <ActiveFilterChip label={amb?.ambassadorName || filters.eventAmbassador} onRemove={() => setFilters(f => ({ ...f, eventAmbassador: 'all' }))} icon="verified" />; })()}
              </>
            )}
            {activeTab === 'tournaments' && (
              <>
                {filters.tournamentDate !== 'all' && (() => { const dl: Record<string, string> = { this_month: language === 'fr' ? 'Ce mois' : 'This month', next_3_months: language === 'fr' ? '3 prochains mois' : 'Next 3 months', this_year: language === 'fr' ? 'Cette annee' : 'This year', past: language === 'fr' ? 'Passes' : 'Past' }; return <ActiveFilterChip label={dl[filters.tournamentDate] || filters.tournamentDate} onRemove={() => setFilters(f => ({ ...f, tournamentDate: 'all' }))} icon="date-range" />; })()}
                {filters.tournamentStatus !== 'all' && <ActiveFilterChip label={getStatusLabel(filters.tournamentStatus)} onRemove={() => setFilters(f => ({ ...f, tournamentStatus: 'all' }))} icon="event" />}
                {filters.tournamentCity !== 'all' && <ActiveFilterChip label={filters.tournamentCity} onRemove={() => setFilters(f => ({ ...f, tournamentCity: 'all' }))} icon="place" />}
                {filters.tournamentFormat !== 'all' && <ActiveFilterChip label={t('formats', filters.tournamentFormat)} onRemove={() => setFilters(f => ({ ...f, tournamentFormat: 'all' }))} />}
                {filters.tournamentLevel !== 'all' && <ActiveFilterChip label={t('tournamentLevels', filters.tournamentLevel)} onRemove={() => setFilters(f => ({ ...f, tournamentLevel: 'all' }))} icon="star" />}
                {filters.tournamentCategory !== 'all' && <ActiveFilterChip label={t('tournamentCategories', filters.tournamentCategory)} onRemove={() => setFilters(f => ({ ...f, tournamentCategory: 'all' }))} />}
                {filters.tournamentRegistration !== 'all' && <ActiveFilterChip label={t('registrationTypes', filters.tournamentRegistration)} onRemove={() => setFilters(f => ({ ...f, tournamentRegistration: 'all' }))} />}
                {filters.tournamentScope !== 'all' && <ActiveFilterChip label={t('tournamentScopes', filters.tournamentScope)} onRemove={() => setFilters(f => ({ ...f, tournamentScope: 'all' }))} icon="flag" />}
              </>
            )}
          </ScrollView>
        </View>
      ) : null}

      {/* Active Now Banner */}
      {showActiveNow && activeTab === 'terrains' ? (
        <View style={styles.activeNowBanner}>
          <View style={styles.activeNowBannerIcon}>
            <MaterialIcons name="local-fire-department" size={18} color="#22C55E" />
          </View>
          <View style={styles.activeNowBannerContent}>
            <Text style={styles.activeNowBannerTitle}>{t('directory', 'activeNowLabel')}</Text>
            <Text style={styles.activeNowBannerDesc}>{t('directory', 'activeNowDesc')}</Text>
          </View>
          <Pressable style={styles.activeNowBannerClose} onPress={() => setShowActiveNow(false)} hitSlop={8}>
            <MaterialIcons name="close" size={16} color="#22C55E" />
          </Pressable>
        </View>
      ) : null}



      {/* Results Count - only when searching */}
      {searchQuery ? (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {dataCount} {dataCount !== 1 ? getTabPlural(activeTab) : getTabSingular(activeTab)}
          </Text>
          <Text style={styles.searchingFor}>{t('directory', 'forSearch')} "{searchQuery}"</Text>
        </View>
      ) : null}



      {/* List */}
      <View style={styles.listContainer}>
        {isTablet ? (
          <FlatList
            key={`tablet-${activeTab}-${numColumns}`}
            data={paginatedData as any[]}
            renderItem={getCurrentRenderItem() as any}
            keyExtractor={(item: any) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.tabletRow}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 100,
              maxWidth: 960,
              alignSelf: 'center' as const,
              width: '100%',
            }}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            removeClippedSubviews={true}
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            extraData={partnerUserIds}
            onViewableItemsChanged={scrollPrefetch.onViewableItemsChanged}
            viewabilityConfig={scrollPrefetch.viewabilityConfig}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            ListFooterComponent={
              hasMore ? (
                <View style={styles.loadMoreFooter}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name={tabConfig?.icon as any || 'search'} size={48} color={theme.textMuted} />
                <Text style={styles.emptyTitle}>{t('directory', 'noResultsFound')}</Text>
                <Text style={styles.emptyText}>
                  {searchQuery 
                    ? `${t('directoryExtra', 'noPrefix')} ${getTabSingular(activeTab)} ${t('directory', 'noMatchSearch')} "${searchQuery}"`
                    : currentFilterCount > 0 
                      ? t('directory', 'tryModifyFilters')
                      : `${t('directoryExtra', 'noPrefix')} ${getTabSingular(activeTab)} ${t('directory', 'noRegistered')}`
                  }
                </Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={paginatedData as any[]}
            renderItem={getCurrentRenderItem() as any}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ 
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 100,
            }}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            removeClippedSubviews={true}
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={15}
            extraData={partnerUserIds}
            onViewableItemsChanged={scrollPrefetch.onViewableItemsChanged}
            viewabilityConfig={scrollPrefetch.viewabilityConfig}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.primary}
                colors={[theme.primary]}
              />
            }
            ListFooterComponent={
              <>
                {hasMore ? (
                  <View style={styles.loadMoreFooter}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : dataCount > 3 ? <AdBanner position="inline" /> : null}
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name={tabConfig?.icon as any || 'search'} size={48} color={theme.textMuted} />
                <Text style={styles.emptyTitle}>{t('directory', 'noResultsFound')}</Text>
                <Text style={styles.emptyText}>
                  {searchQuery 
                    ? `${t('directoryExtra', 'noPrefix')} ${getTabSingular(activeTab)} ${t('directory', 'noMatchSearch')} "${searchQuery}"`
                    : currentFilterCount > 0 
                      ? t('directory', 'tryModifyFilters')
                      : `${t('directoryExtra', 'noPrefix')} ${getTabSingular(activeTab)} ${t('directory', 'noRegistered')}`
                  }
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Duplicate Detection Modal */}
      <Modal
        visible={showDuplicateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalIcon, { backgroundColor: theme.warning + '15' }]}>
                <MaterialIcons name="content-copy" size={20} color={theme.warning} />
              </View>
              <Text style={styles.modalTitle}>{t('directory', 'duplicateModalTitle')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.modalCloseButton, { backgroundColor: theme.primary + '15' }]}
                onPress={() => { setShowDuplicateModal(false); loadMergeLogs(); setShowMergeHistory(true); }}
              >
                <MaterialIcons name="history" size={20} color={theme.primary} />
              </Pressable>
              <Pressable style={styles.modalCloseButton} onPress={() => setShowDuplicateModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.textPrimary} />
              </Pressable>
            </View>
          </View>
          <FlatList
            data={duplicates}
            keyExtractor={(item) => item.pairKey}
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name="check-circle" size={48} color={theme.success} />
                <Text style={[styles.emptyTitle, { color: theme.success }]}>{t('common', 'noResults')}</Text>
              </View>
            }
            renderItem={({ item: dup }) => {
              const typeIcons: Record<string, { icon: string; color: string }> = {
                player: { icon: 'person', color: theme.primary },
                club: { icon: 'home', color: theme.accent },
                terrain: { icon: 'sports-soccer', color: theme.success },
                tournament: { icon: 'emoji-events', color: DIRECTORY_TOURNAMENT_YELLOW },
              };
              const cfg = typeIcons[dup.type] || typeIcons.player;
              return (
                <View style={styles.duplicateCard}>
                  <View style={styles.duplicateCardHeader}>
                    <View style={[styles.duplicateTypeIcon, { backgroundColor: cfg.color + '15' }]}>
                      <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
                    </View>
                    <View style={styles.duplicateScoreBadge}>
                      <Text style={styles.duplicateScoreText}>{dup.score}%</Text>
                    </View>
                  </View>
                  <View style={styles.duplicateNames}>
                    <View style={styles.duplicateNameItem}>
                      <Text style={styles.duplicateNameText} numberOfLines={1}>{dup.itemA.name}</Text>
                    </View>
                    <MaterialIcons name="compare-arrows" size={18} color={theme.textMuted} />
                    <View style={styles.duplicateNameItem}>
                      <Text style={styles.duplicateNameText} numberOfLines={1}>{dup.itemB.name}</Text>
                    </View>
                  </View>
                  {/* Quick merge for >90% */}
                  {dup.score >= 90 ? (
                    <Pressable
                      style={styles.quickMergeBtn}
                      onPress={async () => {
                        Haptics.selectionAsync();
                        setQuickMerging(dup.pairKey);
                        try {
                          const a = dup.itemA as any;
                          const b = dup.itemB as any;
                          // Determine which item is "more complete" (target) and which is the duplicate (source)
                          const scoreCompleteness = (item: any) => {
                            let score = 0;
                            const fields = Object.keys(item).filter(k => !['id', 'userId', 'user_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'stats', 'isPublic', 'showContactPublic'].includes(k));
                            for (const k of fields) {
                              const v = item[k];
                              if (v === null || v === undefined || v === '' || v === 0 || v === false) continue;
                              if (typeof v === 'string') score += v.trim().length;
                              else if (Array.isArray(v)) score += v.length * 5;
                              else if (typeof v === 'object') score += JSON.stringify(v).length;
                              else score += 3;
                            }
                            return score;
                          };
                          const scoreA = scoreCompleteness(a);
                          const scoreB = scoreCompleteness(b);
                          // Target = the more complete one, Source = the less complete one to delete
                          const target = scoreA >= scoreB ? a : b;
                          const source = scoreA >= scoreB ? b : a;
                          const pick = (va: any, vb: any) => {
                            const sa = typeof va === 'string' ? va.trim() : '';
                            const sb = typeof vb === 'string' ? vb.trim() : '';
                            if (!sa && !sb) return undefined;
                            if (!sa) return vb;
                            if (!sb) return va;
                            return sa.length >= sb.length ? va : vb;
                          };
                          const pickNum = (va: any, vb: any) => {
                            if (va && !vb) return va;
                            if (!va && vb) return vb;
                            if (va && vb) return Math.max(Number(va), Number(vb));
                            return undefined;
                          };
                          const pickObj = (va: any, vb: any) => {
                            if (va && !vb) return va;
                            if (!va && vb) return vb;
                            if (va && vb) return JSON.stringify(va).length >= JSON.stringify(vb).length ? va : vb;
                            return undefined;
                          };
                          const pickArr = (va: any, vb: any) => {
                            const aa = Array.isArray(va) ? va : [];
                            const ab = Array.isArray(vb) ? vb : [];
                            return aa.length >= ab.length ? (aa.length > 0 ? va : undefined) : (ab.length > 0 ? vb : undefined);
                          };
                          let updates: Record<string, any> = {};
                          const fields = Object.keys(source).filter(k => !['id', 'userId', 'user_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'stats'].includes(k));
                          for (const k of fields) {
                            const vTarget = target[k];
                            const vSource = source[k];
                            let best;
                            if (typeof vTarget === 'object' && !Array.isArray(vTarget) && vTarget !== null) best = pickObj(vTarget, vSource);
                            else if (Array.isArray(vTarget) || Array.isArray(vSource)) best = pickArr(vTarget, vSource);
                            else if (typeof vTarget === 'number' || typeof vSource === 'number') best = pickNum(vTarget, vSource);
                            else best = pick(vTarget, vSource);
                            if (best !== undefined && JSON.stringify(best) !== JSON.stringify(vTarget)) {
                              updates[k] = best;
                            }
                          }
                          // Update the target with best fields from both
                          const updaters: Record<string, (id: string, u: any) => Promise<void>> = {
                            player: updatePlayer, club: updateClub, terrain: updateTerrain, tournament: updateTournament,
                          };
                          const updater = updaters[dup.type];
                          if (updater && Object.keys(updates).length > 0) {
                            await updater(target.id, updates);
                          }
                          const mergedTarget = { ...target, ...updates };
                          // Reassign relations from source to target, then delete source
                          // Build reassigned relations log for undo
                          const reassigned: ReassignedRelation[] = [];
                          if (dup.type === 'club') {
                            const linkedPlayers = players.filter(p => p.clubId === source.id);
                            for (const p of linkedPlayers) {
                              reassigned.push({ type: 'player', id: p.id, field: 'club_id', oldValue: source.id, newValue: target.id });
                              reassigned.push({ type: 'player', id: p.id, field: 'club', oldValue: source.name, newValue: mergedTarget.name });
                              await updatePlayer(p.id, { club: mergedTarget.name, clubId: target.id });
                            }
                            const linkedTournaments = tournaments.filter(t => t.clubId === source.id);
                            for (const lt of linkedTournaments) {
                              reassigned.push({ type: 'tournament', id: lt.id, field: 'club_id', oldValue: source.id, newValue: target.id });
                              await updateTournament(lt.id, { clubId: target.id, clubName: mergedTarget.name });
                            }
                            const linkedTerrains = terrains.filter(t => t.clubId === source.id);
                            for (const lt of linkedTerrains) {
                              reassigned.push({ type: 'terrain', id: lt.id, field: 'club_id', oldValue: source.id, newValue: target.id });
                              await updateTerrain(lt.id, { clubId: target.id, clubName: mergedTarget.name } as any);
                            }
                            // Save merge log before delete
                            await saveMergeLog({ mergeType: 'club', targetId: target.id, targetName: mergedTarget.name, sourceId: source.id, sourceName: source.name, sourceSnapshot: source, reassignedRelations: reassigned });
                            await deleteClub(source.id);
                          } else if (dup.type === 'terrain') {
                            const linkedClubs = clubs.filter(c => c.terrainId === source.id);
                            for (const c of linkedClubs) {
                              reassigned.push({ type: 'club', id: c.id, field: 'terrain_id', oldValue: source.id, newValue: target.id });
                              await updateClub(c.id, { terrainId: target.id, terrainName: mergedTarget.name } as any);
                            }
                            const linkedPlayers = players.filter(p => p.terrainId === source.id);
                            for (const p of linkedPlayers) {
                              reassigned.push({ type: 'player', id: p.id, field: 'terrain_id', oldValue: source.id, newValue: target.id });
                              await updatePlayer(p.id, { terrainId: target.id, terrainName: mergedTarget.name });
                            }
                            const linkedTournaments = tournaments.filter(t => t.terrainId === source.id);
                            for (const lt of linkedTournaments) {
                              reassigned.push({ type: 'tournament', id: lt.id, field: 'terrain_id', oldValue: source.id, newValue: target.id });
                              await updateTournament(lt.id, { terrainId: target.id, terrainName: mergedTarget.name } as any);
                            }
                            await saveMergeLog({ mergeType: 'terrain', targetId: target.id, targetName: mergedTarget.name, sourceId: source.id, sourceName: source.name, sourceSnapshot: source, reassignedRelations: reassigned });
                            const { error: delTerrainErr } = await deleteTerrain(source.id);
                            if (delTerrainErr) {
                              showAlert(t('common', 'error'), delTerrainErr);
                              return;
                            }
                          } else if (dup.type === 'player') {
                            await saveMergeLog({ mergeType: 'player', targetId: target.id, targetName: mergedTarget.name, sourceId: source.id, sourceName: source.name, sourceSnapshot: source, reassignedRelations: [] });
                            await deletePlayer(source.id);
                          } else if (dup.type === 'tournament') {
                            await saveMergeLog({ mergeType: 'tournament', targetId: target.id, targetName: mergedTarget.name, sourceId: source.id, sourceName: source.name, sourceSnapshot: source, reassignedRelations: [] });
                            const { error: delTournamentErr } = await deleteTournament(source.id);
                            if (delTournamentErr) {
                              showAlert(t('common', 'error'), delTournamentErr);
                              return;
                            }
                          }
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setDismissedPairs(prev => new Set([...prev, dup.pairKey]));
                        } catch (e) {
                          showAlert(t('common', 'error'), e instanceof Error ? e.message : String(e));
                        }
                        setQuickMerging(null);
                      }}
                      disabled={quickMerging === dup.pairKey}
                    >
                      <MaterialIcons name="auto-fix-high" size={14} color="#FFF" />
                      <Text style={styles.quickMergeBtnText}>
                        {quickMerging === dup.pairKey ? '...' : t('directory', 'duplicateQuickMerge')}
                      </Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.duplicateActions}>
                    <Pressable
                      style={styles.duplicateMergeBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowDuplicateModal(false);
                        setMergeTarget({ type: dup.type as any, id: dup.itemA.id });
                      }}
                    >
                      <MaterialIcons name="merge-type" size={16} color="#FFF" />
                      <Text style={styles.duplicateMergeBtnText}>{t('directory', 'duplicateMerge')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.duplicateDismissBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDismissedPairs(prev => new Set([...prev, dup.pairKey]));
                      }}
                    >
                      <MaterialIcons name="visibility-off" size={16} color={theme.textSecondary} />
                      <Text style={styles.duplicateDismissBtnText}>{t('directory', 'duplicateDismiss')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Merge History Modal */}
      <Modal
        visible={showMergeHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMergeHistory(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalIcon, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="history" size={20} color={theme.primary} />
              </View>
              <Text style={styles.modalTitle}>{t('directory', 'mergeHistoryTitle')}</Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={() => setShowMergeHistory(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          {loadingMergeLogs ? (
            <View style={[styles.emptyState, { flex: 1 }]}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.emptyTitle}>{t('common', 'loading')}</Text>
            </View>
          ) : (
            <FlatList
              data={mergeLogs}
              keyExtractor={(item) => item.id}
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialIcons name="check-circle" size={48} color={theme.success} />
                  <Text style={styles.emptyTitle}>{t('directory', 'mergeHistoryEmpty')}</Text>
                  <Text style={styles.emptyText}>{t('directory', 'mergeHistoryEmptyDesc')}</Text>
                </View>
              }
              renderItem={({ item: log }) => {
                const typeIcons: Record<string, { icon: string; color: string }> = {
                  player: { icon: 'person', color: theme.primary },
                  club: { icon: 'home', color: theme.accent },
                  terrain: { icon: 'sports-soccer', color: theme.success },
                  tournament: { icon: 'emoji-events', color: DIRECTORY_TOURNAMENT_YELLOW },
                };
                const cfg = typeIcons[log.mergeType] || typeIcons.player;
                const canUndo = isUndoable(log);
                const timeLeft = getUndoTimeRemaining(log, language as 'fr' | 'en');
                return (
                  <View style={styles.mergeHistoryCard}>
                    <View style={styles.duplicateCardHeader}>
                      <View style={[styles.duplicateTypeIcon, { backgroundColor: cfg.color + '15' }]}>
                        <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.mergeHistorySource} numberOfLines={1}>
                          {log.sourceName} <Text style={{ color: theme.textMuted, fontWeight: '400' }}>{t('directory', 'mergedInto')}</Text> {log.targetName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: theme.textMuted }}>
                            {new Date(log.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                          {log.reassignedRelations.length > 0 ? (
                            <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                              {log.reassignedRelations.length} {t('directory', 'mergeRelationsCount')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    {canUndo ? (
                      <View style={styles.mergeHistoryActions}>
                        <View style={styles.mergeHistoryTimer}>
                          <MaterialIcons name="timer" size={12} color={theme.warning} />
                          <Text style={styles.mergeHistoryTimerText}>{timeLeft}</Text>
                        </View>
                        <Pressable
                          style={styles.mergeUndoBtn}
                          disabled={undoingMerge === log.id}
                          onPress={() => handleUndoMerge(log)}
                        >
                          <MaterialIcons name="undo" size={14} color="#FFF" />
                          <Text style={styles.mergeUndoBtnText}>
                            {undoingMerge === log.id ? '...' : t('directory', 'mergeUndoBtn')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.mergeHistoryExpired}>
                        <MaterialIcons name="lock-clock" size={14} color={theme.textMuted} />
                        <Text style={styles.mergeHistoryExpiredText}>{t('directory', 'mergeUndoExpired')}</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Merge Picker Modal */}
      {mergeTarget ? (
        <MergePickerModal
          visible={!!mergeTarget}
          onClose={() => setMergeTarget(null)}
          itemType={mergeTarget.type}
          currentItemId={mergeTarget.id}
        />
      ) : null}

      {/* Meetup Invitation Picker Modal */}
      <Modal
        visible={showMeetupPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMeetupPicker(false)}
      >
        <View style={styles.meetupOverlay}>
          <View style={styles.meetupPickerContent}>
            <View style={styles.meetupPickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.meetupPickerTitle}>{t('meetup', 'inviteToMeetup')}</Text>
                <Text style={styles.meetupPickerSubtitle}>{meetupPickerUserName}</Text>
              </View>
              <Pressable style={styles.meetupPickerClose} onPress={() => setShowMeetupPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.meetupPickerDesc}>{t('meetup', 'chooseMeetup')}</Text>
            {loadingMeetups ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : activeMeetups.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {activeMeetups.map((m) => {
                  const mDate = new Date(m.date);
                  return (
                    <Pressable
                      key={m.id}
                      style={[styles.meetupPickerItem, invitingToMeetup === m.id && { opacity: 0.6 }]}
                      onPress={() => handleConfirmInvite(m.id)}
                      disabled={!!invitingToMeetup}
                    >
                      <View style={styles.meetupPickerItemDate}>
                        <Text style={styles.meetupPickerItemDay}>{mDate.getDate()}</Text>
                        <Text style={styles.meetupPickerItemMonth}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.meetupPickerItemTitle} numberOfLines={1}>{m.title}</Text>
                        <Text style={styles.meetupPickerItemTime}>
                          {mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      {invitingToMeetup === m.id ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <View style={styles.meetupPickerItemArrow}>
                          <MaterialIcons name="send" size={16} color={theme.primary} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="event-busy" size={40} color={theme.textMuted} />
                <Text style={styles.meetupPickerEmptyText}>{t('meetup', 'noActiveMeetups')}</Text>
                <Text style={styles.meetupPickerEmptyDesc}>{t('meetup', 'noActiveMeetupsDesc')}</Text>
                <Pressable
                  style={styles.meetupPickerCreateBtn}
                  onPress={() => { setShowMeetupPicker(false); router.push('/meetup/new' as any); }}
                >
                  <MaterialIcons name="add" size={18} color="#FFF" />
                  <Text style={styles.meetupPickerCreateBtnText}>{t('meetup', 'createMeetupFirst')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Sort Modal — Multi-criteria with reorder */}
      <Modal
        visible={showSortModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortModal(false)}>
          <Pressable style={styles.sortModalContent} onPress={(e) => e.stopPropagation?.()}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.sortModalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: activeTabColor + '15' }]}>
                <MaterialIcons name="swap-vert" size={20} color={activeTabColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sortModalTitle}>{t('directory', 'sortTitle')}</Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{t('directory', 'sortMultiHint')}</Text>
              </View>
              <Pressable style={styles.sortModalClose} onPress={() => setShowSortModal(false)}>
                <MaterialIcons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Active criteria — ordered with reorder controls */}
            {sortCriteria.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                  {t('directory', 'sortActiveCriteria')} ({sortCriteria.length})
                </Text>
                {sortCriteria.map((criterion, idx) => {
                  const fieldInfo = getSortFields().find(f => f.field === criterion.field);
                  if (!fieldInfo) return null;
                  return (
                    <View key={criterion.field} style={[styles.sortActiveItem, { borderColor: activeTabColor + '25' }]}> 
                      <View style={[styles.sortPriorityBadge, { backgroundColor: activeTabColor }]}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFF' }}>{idx + 1}</Text>
                      </View>
                      <View style={[styles.sortOptionIcon, { backgroundColor: activeTabColor + '15' }]}>
                        <MaterialIcons name={fieldInfo.icon as any} size={16} color={activeTabColor} />
                      </View>
                      <Text style={[styles.sortOptionText, { color: activeTabColor, fontWeight: '700', flex: 1 }]} numberOfLines={1}>{fieldInfo.label}</Text>
                      <Pressable
                        style={[styles.sortDirToggle, { backgroundColor: criterion.direction === 'desc' ? activeTabColor + '15' : theme.backgroundSecondary }]}
                        onPress={() => { Haptics.selectionAsync(); toggleSortDirection(criterion.field); }}
                        hitSlop={4}
                      >
                        <MaterialIcons name={criterion.direction === 'desc' ? 'arrow-downward' : 'arrow-upward'} size={14} color={criterion.direction === 'desc' ? activeTabColor : theme.textSecondary} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: criterion.direction === 'desc' ? activeTabColor : theme.textSecondary }}>
                          {criterion.direction === 'desc' ? t('directory', 'sortDesc') : t('directory', 'sortAsc')}
                        </Text>
                      </Pressable>
                      <View style={styles.sortReorderBtns}>
                        <Pressable
                          style={[styles.sortReorderBtn, idx === 0 && { opacity: 0.3 }]}
                          onPress={() => { if (idx > 0) { Haptics.selectionAsync(); moveSortCriterion(criterion.field, 'up'); } }}
                          disabled={idx === 0}
                          hitSlop={4}
                        >
                          <MaterialIcons name="keyboard-arrow-up" size={18} color={theme.textSecondary} />
                        </Pressable>
                        <Pressable
                          style={[styles.sortReorderBtn, idx === sortCriteria.length - 1 && { opacity: 0.3 }]}
                          onPress={() => { if (idx < sortCriteria.length - 1) { Haptics.selectionAsync(); moveSortCriterion(criterion.field, 'down'); } }}
                          disabled={idx === sortCriteria.length - 1}
                          hitSlop={4}
                        >
                          <MaterialIcons name="keyboard-arrow-down" size={18} color={theme.textSecondary} />
                        </Pressable>
                      </View>
                      <Pressable
                        style={styles.sortRemoveBtn}
                        onPress={() => { Haptics.selectionAsync(); removeSortCriterion(criterion.field); }}
                        hitSlop={4}
                      >
                        <MaterialIcons name="close" size={16} color={theme.error} />
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable
                  style={[styles.sortClearAllBtn, { borderColor: theme.error + '30' }]}
                  onPress={() => { Haptics.selectionAsync(); setSortCriteria([]); }}
                >
                  <MaterialIcons name="clear-all" size={16} color={theme.error} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.error }}>{t('directory', 'clearAll')}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Available criteria to add */}
            {(() => {
              const available = getSortFields().filter(f => !sortCriteria.find(c => c.field === f.field));
              if (available.length === 0) return null;
              return (
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                    {t('directory', 'sortAddCriteria')}
                  </Text>
                  {available.map(fieldInfo => (
                    <Pressable
                      key={fieldInfo.field}
                      style={styles.sortOption}
                      onPress={() => {
                        Haptics.selectionAsync();
                        addSortCriterion(fieldInfo.field, fieldInfo.defaultDir);
                      }}
                    >
                      <View style={styles.sortOptionIcon}>
                        <MaterialIcons name={fieldInfo.icon as any} size={18} color={theme.textMuted} />
                      </View>
                      <Text style={styles.sortOptionText}>{fieldInfo.label}</Text>
                      <View style={[styles.sortAddBtnSmall, { borderColor: activeTabColor + '40' }]}>
                        <MaterialIcons name="add" size={16} color={activeTabColor} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              );
            })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalIcon, { backgroundColor: tabConfig?.color + '15' }]}>
                <MaterialIcons name={tabConfig?.icon as any} size={20} color={tabConfig?.color} />
              </View>
              <Text style={styles.modalTitle}>
                {activeTab === 'players' ? t('directory', 'filterPlayers') :
                 activeTab === 'clubs' ? t('directory', 'filterClubs') :
                 activeTab === 'terrains' ? t('directory', 'filterTerrains') :
                 activeTab === 'events' ? (language === 'fr' ? 'Filtrer les defis' : 'Filter challenges') :
                 t('directory', 'filterTournaments')}
              </Text>
            </View>
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => setShowFilters(false)}
            >
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          
          <ScrollView 
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {renderFilterContent()}
          </ScrollView>

          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable style={styles.clearButton} onPress={clearFilters}>
              <MaterialIcons name="clear-all" size={20} color={theme.textSecondary} />
              <Text style={styles.clearButtonText}>{t('directory', 'clearAll')}</Text>
            </Pressable>
            <Pressable 
              style={[styles.applyButton, { backgroundColor: tabConfig?.color }]}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.applyButtonText}>
                {t('directory', 'seeResults')} {dataCount} {dataCount !== 1 ? t('directory', 'resultCountPlural') : t('directory', 'resultCount')}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// MEMOIZED CARD COMPONENTS
// ============================================
function getActiveSponsorInfo(partnerUserIds: Map<string, any>, sponsorId?: string | null): any | undefined {
  if (!sponsorId) return undefined;
  const info = partnerUserIds.get(String(sponsorId));
  if (!info || info.isActive === false) return undefined;
  return info;
}

const MemoizedPlayerCard = React.memo(({ item, selfPlayer, getSharedPermission, partnerUserIds, t, language, handleInviteToMeetup, user }: {
  item: Player; selfPlayer: Player | null; getSharedPermission: (id: string) => string | null;
  partnerUserIds: Map<string, any>; t: (s: string, k: string) => string;
  language: string; handleInviteToMeetup: (id: string, name: string) => void; user: any;
}) => {

  const isSelf = selfPlayer && item.id === selfPlayer.id;
  const sharedPerm = getSharedPermission(item.id);
  const isPublicItem = (item as any).isPublic;

  const isRealUser = item.isPublic === true && (item.id == item.userId);

  // Only show partner badge for players with explicit playerId link in ambassadors table
  const partnerInfo = partnerUserIds.get(item.id);
  const sponsorInfo = getActiveSponsorInfo(partnerUserIds, item.sponsorId);
  const hasSponsor = !!sponsorInfo;
  return (
    <Pressable
      style={[styles.itemCard, isSelf && styles.selfCard]}
      onPress={() => isSelf ? router.push('/player/me') : router.push(`/player/${item.id}`)}
    >
      <View style={[styles.itemAvatarOuter, isSelf && styles.selfAvatarOuter]}>
        <View style={[styles.itemAvatar, isSelf && styles.selfAvatar, sponsorInfo && { borderWidth: 2, borderColor: (sponsorInfo as any)?.brandColor || '#2563EB' }]}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" recyclingKey={item.id} />
          ) : (
            <Text style={styles.avatarText}>{item.name.split(' ').map(n => n[0]).join('')}</Text>
          )}
        </View>
        {isSelf ? (
          <>
            <View style={styles.selfBadge}><MaterialIcons name="star" size={10} color="#FFF" /></View>
            <View style={styles.selfVerifiedBadge}><MaterialIcons name="verified" size={12} color="#FFF" /></View>
          </>
        ) : isRealUser ? (
          <View style={styles.verifiedBadge}><MaterialIcons name="verified" size={11} color="#FFF" /></View>
        ) : isPublicItem ? (
          <View style={styles.publicOverlay}><MaterialIcons name="public" size={10} color={theme.success} /></View>
        ) : sharedPerm ? <SharedOverlayBadge permission={sharedPerm} /> : null}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={[styles.itemTitle, isSelf && { color: theme.primary }]} numberOfLines={1}>{item.name}</Text>
          {isSelf ? (
            <>
              <View style={styles.moiBadge}><Text style={styles.moiBadgeText}>{t('directory', 'me')}</Text></View>
              <View style={styles.realUserBadge}><MaterialIcons name="verified" size={10} color={theme.primary} /><Text style={styles.realUserBadgeText}>{t('meetup', 'registeredUser')}</Text></View>
            </>
          ) : isRealUser ? (
            <View style={styles.realUserBadge}><MaterialIcons name="verified" size={10} color={theme.primary} /><Text style={styles.realUserBadgeText}>{t('meetup', 'registeredUser')}</Text></View>
          ) : null}
        </View>
        <View style={styles.itemMeta}>
          {item.club ? <View style={styles.metaItem}><MaterialIcons name="home" size={12} color={theme.textMuted} /><Text style={styles.metaText} numberOfLines={1}>{item.club}</Text></View> : null}
          {item.location?.city ? <View style={styles.metaItem}><MaterialIcons name="place" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{item.location.city}</Text></View> : null}
        </View>
        <View style={styles.itemTags}>
          {hasSponsor && sponsorInfo ? (
            <View style={[styles.tag, { backgroundColor: '#2563EB12', borderWidth: 1, borderColor: '#2563EB25' }]}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
              <Text style={[styles.tagText, { color: '#2563EB' }]}>{language === 'fr' ? 'Sponsorise' : 'Sponsored'}</Text>
            </View>
          ) : null}
          {partnerInfo ? (() => {
            const pColor = partnerInfo.tier === 'gold_sponsor' ? '#D4A017' : partnerInfo.tier === 'sponsor' ? '#78909C' : '#A1887F';
            const pLabel = language === 'fr' ? (partnerInfo.tier === 'gold_sponsor' ? 'Partenaire Or' : partnerInfo.tier === 'sponsor' ? 'Partenaire Argent' : 'Partenaire Bronze') : (partnerInfo.tier === 'gold_sponsor' ? 'Gold Partner' : partnerInfo.tier === 'sponsor' ? 'Silver Partner' : 'Bronze Partner');
            return (
              <View style={[styles.tag, { backgroundColor: pColor + '15', borderWidth: 1, borderColor: pColor + '30' }]}>
                <MaterialIcons name={partnerInfo.tier === 'gold_sponsor' ? 'star' : 'workspace-premium'} size={10} color={pColor} />
                <Text style={[styles.tagText, { color: pColor }]}>{pLabel}</Text>
                {partnerInfo.tier === 'gold_sponsor' ? <GoldPulse color={pColor} /> : null}
              </View>
            );
          })() : null}
          {item.eloRating && item.userId && item.id === item.userId ? (() => { const eloRank = getEloRank(item.eloRating); return (
            <View style={[styles.tag, { backgroundColor: eloRank.color + '12', borderWidth: 1, borderColor: eloRank.color + '25' }]}>
              <MaterialIcons name={eloRank.icon as any} size={10} color={eloRank.color} />
              <Text style={[styles.tagText, { color: eloRank.color }]}>{item.eloRating}</Text>
            </View>
          ); })() : null}
          <View style={[styles.tag, { backgroundColor: theme.primary + '15' }]}><Text style={[styles.tagText, { color: theme.primary }]}>{t('roles', item.role)}</Text></View>
          {item.experience ? <View style={[styles.tag, { backgroundColor: '#9333EA' + '15' }]}><Text style={[styles.tagText, { color: '#9333EA' }]}>{t('player', item.experience === 'less_than_1' ? 'experienceLessThan1' : item.experience === '1_to_3' ? 'experience1to3' : item.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}</Text></View> : null}
          <View style={[styles.tag, { backgroundColor: theme.success + '15' }]}><Text style={[styles.tagText, { color: theme.success }]}>{item.stats.winRate}%</Text></View>
          {(() => {
            const ts = computeQuickTrustScore({ stats: item.stats, createdAt: item.createdAt });
            if (ts.score < 45) {
              const tsColor = getTrustScoreColor(ts.level);
              return (
                <View style={[styles.tag, { backgroundColor: tsColor + '12', borderWidth: 1, borderColor: tsColor + '25' }]}>
                  <MaterialIcons name="shield" size={9} color={tsColor} />
                  <Text style={[styles.tagText, { color: tsColor }]}>{ts.score}</Text>
                </View>
              );
            }
            return null;
          })()}
          {(item.location?.latitude || item.location?.longitude) ? (
            <Pressable style={[styles.tag, styles.mapLinkBtn]} onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); router.push({ pathname: '/(tabs)/map', params: { lat: String(item.location.latitude), lng: String(item.location.longitude), name: item.name, mf: String(Date.now()) } } as any); }} hitSlop={4}>
              <MaterialIcons name="map" size={13} color={theme.success} />
            </Pressable>
          ) : null}
          {isRealUser ? (
            <Pressable style={[styles.tag, styles.inviteMeetupBtn]} onPress={(e) => { e.stopPropagation?.(); handleInviteToMeetup(item.id, item.name); }} hitSlop={4}>
              <MaterialIcons name="event" size={13} color={theme.primary} />
              <Text style={styles.inviteMeetupBtnText}>{t('meetup', 'inviteToMeetup')}</Text>
            </Pressable>
          ) : null}
        </View>
        
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
});

// Helper: map link for geolocated items
const MapLinkButton = React.memo(({ lat, lng, name }: { lat: number; lng: number; name: string }) => {
  if (!lat && !lng) return null;
  return (
    <Pressable style={styles.mapLinkBtn} onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/(tabs)/map', params: { lat: String(lat), lng: String(lng), name, mf: String(Date.now()) } } as any); }} hitSlop={4}>
      <MaterialIcons name="map" size={13} color={theme.success} />
    </Pressable>
  );
});

const MemoizedClubCard = React.memo(({ item, favoriteClubIds, getSharedPermission, partnerUserIds, t, language, userId }: {
  item: Club; favoriteClubIds: string[]; getSharedPermission: (id: string) => string | null;
  partnerUserIds: Map<string, any>; t: (s: string, k: string) => string; language: string; userId?: string;
}) => {
  const isOwner = !!(userId && item.userId && item.userId === userId);
  const sharedPerm = getSharedPermission(item.id);
  const isPublicItem = (item as any).isPublic;
  const isFavorite = favoriteClubIds.includes(item.id);
  const sponsorInfo = getActiveSponsorInfo(partnerUserIds, (item as any).sponsorId);
  const hasSponsor = !!sponsorInfo;
  return (
    <Pressable style={[styles.itemCard, isFavorite && styles.favoriteCard]} onPress={() => router.push(`/club/${item.id}`)}>
      <View style={[styles.itemAvatar, { backgroundColor: theme.accent }]}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" recyclingKey={`club-${item.id}`} />
        ) : (
          <MaterialIcons name="home" size={24} color="#FFF" />
        )}
        {isFavorite ? <View style={styles.favoriteBadge}><MaterialIcons name="favorite" size={10} color={theme.error} /></View>
        : isPublicItem ? <View style={styles.publicOverlay}><MaterialIcons name="public" size={10} color={theme.success} /></View>
        : sharedPerm ? <SharedOverlayBadge permission={sharedPerm} /> : null}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
          {isOwner ? (
            <View style={styles.ownerBadge}>
              <MaterialIcons name="person" size={9} color={theme.accent} />
              <Text style={styles.ownerBadgeText}>{language === 'fr' ? 'Moi' : 'Mine'}</Text>
            </View>
          ) : null}
          {item.isVerified ? (
            <View style={styles.clubVerifiedBadge}>
              <MaterialIcons name="verified" size={14} color="#2563EB" />
            </View>
          ) : null}
          {hasSponsor ? (
            <View style={styles.sponsorBadge}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
            </View>
          ) : null}
        </View>
        <View style={styles.itemMeta}>
          <View style={styles.metaItem}><MaterialIcons name="place" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{item.city}, {item.country || 'France'}</Text></View>
          {item.terrainName ? <View style={styles.metaItem}><MaterialIcons name="sports-soccer" size={12} color={theme.success} /><Text style={[styles.metaText, { color: theme.success }]}>{item.terrainName}</Text></View> : null}
        </View>
        <View style={styles.itemTags}>
          {hasSponsor ? (
            <View style={[styles.tag, { backgroundColor: '#2563EB12', borderWidth: 1, borderColor: '#2563EB25' }]}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
              <Text style={[styles.tagText, { color: '#2563EB' }]}>{language === 'fr' ? 'Sponsorise' : 'Sponsored'}</Text>
            </View>
          ) : null}
          <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><MaterialIcons name="people" size={10} color={theme.textSecondary} /><Text style={[styles.tagText, { color: theme.textSecondary }]}>{item.membersCount}</Text></View>
          {item.foundedYear ? <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><Text style={[styles.tagText, { color: theme.textSecondary }]}>{t('directory', 'since')} {item.foundedYear}</Text></View> : null}
        </View>
      </View>
      {item.location?.latitude && item.location?.longitude ? <MapLinkButton lat={item.location.latitude} lng={item.location.longitude} name={item.name} /> : null}
      <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
});

const MemoizedTerrainCard = React.memo(({ item, favoriteTerrainIds, getSharedPermission, partnerUserIds, t, language, getTerrainTypeConfig, activityInfo, userId }: {
  item: Terrain; favoriteTerrainIds: string[]; getSharedPermission: (id: string) => string | null;
  partnerUserIds: Map<string, any>; t: (s: string, k: string) => string;
  language: string; getTerrainTypeConfig: (type: string) => any;
  activityInfo?: { score: number; matchCount: number; peakLabel: string; rank?: number; recentMatches?: number; recentChallenges?: number; recentTournaments?: number; isActiveNow?: boolean; activeNowLabel?: string; habitualScore?: number };
  userId?: string;
}) => {
  const typeConfig = getTerrainTypeConfig(item.type);
  const isOwner = !!(userId && item.userId && item.userId === userId);
  const isFavorite = favoriteTerrainIds.includes(item.id);
  const sharedPerm = getSharedPermission(item.id);
  const isPublicItem = (item as any).isPublic;
  const sponsorInfo = getActiveSponsorInfo(partnerUserIds, item.sponsorId);
  const hasSponsor = !!sponsorInfo;
  const hasMultiPhotos = item.photos && item.photos.length > 1;
  const [photoIdx, setPhotoIdx] = React.useState(0);
  return (
    <Pressable style={[styles.itemCard, isFavorite && styles.favoriteCard]} onPress={() => router.push(`/terrain/${item.id}`)}>
      <View style={[styles.itemAvatar, { backgroundColor: theme.success }]}>
        {item.photos && item.photos.length > 0 ? (
          <Image source={{ uri: item.photos[hasMultiPhotos ? photoIdx : 0] }} style={styles.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.terrain }} cachePolicy="memory-disk" recyclingKey={`${item.id}-${photoIdx}`} />
        ) : <MaterialIcons name={typeConfig.icon as any} size={24} color="#FFF" />}
        {hasMultiPhotos ? (
          <View style={styles.photoCountOverlay}>
            <MaterialIcons name="photo-library" size={8} color="#FFF" />
            <Text style={styles.photoCountText}>{item.photos!.length}</Text>
          </View>
        ) : null}
        {isFavorite ? <View style={styles.favoriteBadge}><MaterialIcons name="favorite" size={10} color={theme.error} /></View>
        : isPublicItem ? <View style={styles.publicOverlay}><MaterialIcons name="public" size={10} color={theme.success} /></View>
        : sharedPerm ? <SharedOverlayBadge permission={sharedPerm} /> : null}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
          {isOwner ? (
            <View style={styles.ownerBadge}>
              <MaterialIcons name="person" size={9} color={theme.success} />
              <Text style={[styles.ownerBadgeText, { color: theme.success }]}>{language === 'fr' ? 'Moi' : 'Mine'}</Text>
            </View>
          ) : null}
          {hasSponsor ? (
            <View style={styles.sponsorBadge}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
            </View>
          ) : null}
        </View>
        <View style={styles.itemMeta}>
          <View style={styles.metaItem}><MaterialIcons name="place" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{item.city}</Text></View>
          {item.clubName ? <View style={styles.metaItem}><MaterialIcons name="home" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{item.clubName}</Text></View> : null}
        </View>
        <View style={styles.itemTags}>
          {hasSponsor ? (
            <View style={[styles.tag, { backgroundColor: '#2563EB12', borderWidth: 1, borderColor: '#2563EB25' }]}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
              <Text style={[styles.tagText, { color: '#2563EB' }]}>{language === 'fr' ? 'Sponsorise' : 'Sponsored'}</Text>
            </View>
          ) : null}
          <View style={[styles.tag, { backgroundColor: theme.success + '15' }]}><Text style={[styles.tagText, { color: theme.success }]}>{t('terrainTypes', item.type)}</Text></View>
          <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><Text style={[styles.tagText, { color: theme.textSecondary }]}>{item.courtsCount} {item.courtsCount > 1 ? t('directory', 'terrainCountPlural') : t('directory', 'terrainCount')}</Text></View>
          {item.lighting ? <View style={[styles.tag, { backgroundColor: theme.warning + '15' }]}><MaterialIcons name="lightbulb" size={10} color={theme.warning} /></View> : null}
          {item.covered ? <View style={[styles.tag, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="roofing" size={10} color={theme.primary} /></View> : null}
          {item.publicAccess === false ? <View style={[styles.tag, { backgroundColor: theme.error + '15' }]}><MaterialIcons name="lock" size={10} color={theme.error} /><Text style={[styles.tagText, { color: theme.error }]}>{t('directory', 'privateAccessShort')}</Text></View> : null}
          {item.parking ? <View style={[styles.tag, { backgroundColor: '#6366F115' }]}><MaterialIcons name="local-parking" size={10} color="#6366F1" /></View> : null}
          {item.toilets ? <View style={[styles.tag, { backgroundColor: '#EC489915' }]}><MaterialIcons name="wc" size={10} color="#EC4899" /></View> : null}
        </View>
        {activityInfo ? (
          <View style={styles.activityScoreRow}>
            {activityInfo.isActiveNow ? (
              <View style={[styles.activityRankBadge, { backgroundColor: '#EF4444', flexDirection: 'row' as const, gap: 3, paddingHorizontal: 8 }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' }} />
                <Text style={styles.activityRankText}>LIVE</Text>
              </View>
            ) : activityInfo.rank && activityInfo.rank <= 10 ? (
              <View style={[styles.activityRankBadge, activityInfo.rank === 1 ? { backgroundColor: '#D4A017' } : activityInfo.rank <= 3 ? { backgroundColor: '#78909C' } : { backgroundColor: '#A1887F' }]}>
                <Text style={styles.activityRankText}>#{activityInfo.rank}</Text>
              </View>
            ) : null}
            <View style={[styles.activityScoreBadge, activityInfo.isActiveNow && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <MaterialIcons name={activityInfo.isActiveNow ? 'sensors' : 'local-fire-department'} size={12} color={activityInfo.isActiveNow ? '#EF4444' : '#22C55E'} />
              <Text style={[styles.activityScoreText, activityInfo.isActiveNow && { color: '#DC2626' }]}>{activityInfo.peakLabel}</Text>
            </View>
            {(activityInfo.recentMatches || activityInfo.recentChallenges || activityInfo.recentTournaments) ? (
              <View style={styles.activityBreakdown}>
                {activityInfo.recentMatches ? <View style={styles.activityBreakdownItem}><MaterialIcons name="sports" size={9} color="#3B82F6" /><Text style={styles.activityBreakdownText}>{activityInfo.recentMatches}</Text></View> : null}
                {activityInfo.recentChallenges ? <View style={styles.activityBreakdownItem}><MaterialIcons name="gps-fixed" size={9} color="#7C3AED" /><Text style={styles.activityBreakdownText}>{activityInfo.recentChallenges}</Text></View> : null}
                {activityInfo.recentTournaments ? <View style={styles.activityBreakdownItem}><MaterialIcons name="emoji-events" size={9} color="#F59E0B" /><Text style={styles.activityBreakdownText}>{activityInfo.recentTournaments}</Text></View> : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {item.location?.latitude && item.location?.longitude ? <MapLinkButton lat={item.location.latitude} lng={item.location.longitude} name={item.name} /> : null}
      <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
});

const MemoizedTournamentCard = React.memo(({ item, getSharedPermission, partnerUserIds, t, language, getStatusLabel, userId }: {
  item: Tournament; getSharedPermission: (id: string) => string | null;
  partnerUserIds: Map<string, any>;
  t: (s: string, k: string) => string; language: string; getStatusLabel: (s: string) => string; userId?: string;
}) => {
  const isOwner = !!(userId && item.userId && item.userId === userId);
  const statusConfig: Record<string, { bg: string; color: string }> = {
    'À venir': { bg: theme.primary + '15', color: theme.primary },
    'En cours': { bg: theme.warning + '15', color: theme.warning },
    'Terminé': { bg: theme.backgroundSecondary, color: theme.textSecondary },
  };
  const status = statusConfig[item.status] || statusConfig['Terminé'];
  const sharedPerm = getSharedPermission(item.id);
  const isPublicItem = (item as any).isPublic;
  const sponsorInfo = getActiveSponsorInfo(partnerUserIds, (item as any).sponsorId);
  const hasSponsor = !!sponsorInfo;
  const posterUrl = item.posterUrl;
  const isPosterPdf = !!posterUrl && posterUrl.toLowerCase().endsWith('.pdf');
  const hasPosterImage = !!posterUrl && !isPosterPdf;
  return (
    <Pressable style={styles.itemCard} onPress={() => router.push(`/tournament/${item.id}`)}>
      <View style={[styles.itemAvatar, { backgroundColor: DIRECTORY_TOURNAMENT_YELLOW }]}>
        {hasPosterImage ? (
          <Image source={{ uri: posterUrl }} style={styles.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.banner }} cachePolicy="memory-disk" recyclingKey={`${item.id}-poster`} />
        ) : isPosterPdf ? (
          <MaterialIcons name="picture-as-pdf" size={24} color="#FFF" />
        ) : (
          <MaterialIcons name="emoji-events" size={24} color="#FFF" />
        )}
        {isPublicItem ? <View style={styles.publicOverlay}><MaterialIcons name="public" size={10} color={theme.success} /></View>
        : sharedPerm ? <SharedOverlayBadge permission={sharedPerm} /> : null}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
          {isOwner ? (
            <View style={styles.ownerBadge}>
              <MaterialIcons name="person" size={9} color={DIRECTORY_TOURNAMENT_YELLOW} />
              <Text style={[styles.ownerBadgeText, { color: DIRECTORY_TOURNAMENT_YELLOW }]}>{language === 'fr' ? 'Moi' : 'Mine'}</Text>
            </View>
          ) : null}
          {hasSponsor ? (
            <View style={styles.sponsorBadge}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
            </View>
          ) : null}
        </View>
        <View style={styles.itemMeta}>
          <View style={styles.metaItem}><MaterialIcons name="event" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{new Date(item.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text></View>
          <View style={styles.metaItem}><MaterialIcons name="place" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{item.terrainName || item.location.city}</Text></View>
        </View>
        <View style={styles.itemTags}>
          {hasSponsor ? (
            <View style={[styles.tag, { backgroundColor: '#2563EB12', borderWidth: 1, borderColor: '#2563EB25' }]}>
              <MaterialIcons name="handshake" size={10} color="#2563EB" />
              <Text style={[styles.tagText, { color: '#2563EB' }]}>{language === 'fr' ? 'Sponsorise' : 'Sponsored'}</Text>
            </View>
          ) : null}
          <View style={[styles.tag, { backgroundColor: status.bg }]}><Text style={[styles.tagText, { color: status.color }]}>{getStatusLabel(item.status)}</Text></View>
          <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><Text style={[styles.tagText, { color: theme.textSecondary }]}>{t('formats', item.format)}</Text></View>
          <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><Text style={[styles.tagText, { color: theme.textSecondary }]}>{t('tournamentTypes', item.type)}</Text></View>
        </View>
      </View>
      {item.location?.latitude && item.location?.longitude ? <MapLinkButton lat={item.location.latitude} lng={item.location.longitude} name={item.name} /> : null}
      <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
});

const MemoizedEventCard = React.memo(({ item, language }: { item: any; language: string }) => {
  const ev = item as SponsoredEvent;
  const evDate = new Date(ev.startTime);
  const endDate = new Date(ev.endTime);
  const now = new Date();
  const effectiveStatus =
    ev.status === 'cancelled' || ev.status === 'completed'
      ? ev.status
      : (!Number.isNaN(endDate.getTime()) && now.getTime() > endDate.getTime())
        ? 'completed'
        : (ev.status === 'upcoming' && !Number.isNaN(evDate.getTime()) && !Number.isNaN(endDate.getTime()) && now >= evDate && now <= endDate)
          ? 'active'
          : ev.status;
  const isActive = effectiveStatus === 'active';
  const sc = isActive ? '#22C55E' : effectiveStatus === 'completed' ? '#3B82F6' : effectiveStatus === 'cancelled' ? '#EF4444' : '#F59E0B';
  const typeColor: Record<string, string> = { '10_tirs': '#2563EB', '10_tirs_sautee': '#D97706', precision: '#7C3AED' };
  const tc = typeColor[ev.challengeType] || '#7C3AED';
  const challengeLabel = ev.challengeType === '10_tirs' ? '10 Tirs' : ev.challengeType === '10_tirs_sautee' ? (language === 'fr' ? '10 Tirs sautee' : '10 Lob Shots') : (language === 'fr' ? 'Precision' : 'Precision');
  return (
    <Pressable style={[styles.itemCard, { borderLeftWidth: 3, borderLeftColor: sc }]} onPress={() => router.push(`/sponsored-event/${ev.id}` as any)}>
      <View style={[styles.itemAvatar, { backgroundColor: tc + '15' }]}>
        <MaterialIcons name={ev.challengeType === '10_tirs' ? 'gps-fixed' : ev.challengeType === 'precision' ? 'stars' : 'flight-takeoff'} size={24} color={tc} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={1}>{ev.title}</Text>
        <View style={styles.itemMeta}>
          <View style={styles.metaItem}><MaterialIcons name="event" size={12} color={theme.textMuted} /><Text style={styles.metaText}>{evDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text></View>
          {ev.ambassadorName ? <View style={styles.metaItem}><MaterialIcons name="verified" size={12} color="#7C3AED" /><Text style={[styles.metaText, { color: '#7C3AED' }]}>{ev.ambassadorName}</Text></View> : null}
        </View>
        <View style={styles.itemTags}>
          <View style={[styles.tag, { backgroundColor: sc + '15' }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sc }} /><Text style={[styles.tagText, { color: sc }]}>{isActive ? (language === 'fr' ? 'En cours' : 'Active') : effectiveStatus === 'upcoming' ? (language === 'fr' ? 'A venir' : 'Upcoming') : effectiveStatus === 'completed' ? (language === 'fr' ? 'Termine' : 'Completed') : (language === 'fr' ? 'Annule' : 'Cancelled')}</Text></View>
          <View style={[styles.tag, { backgroundColor: tc + '12' }]}><Text style={[styles.tagText, { color: tc }]}>{challengeLabel}</Text></View>
          <View style={[styles.tag, { backgroundColor: theme.backgroundSecondary }]}><MaterialIcons name="group" size={10} color={theme.textSecondary} /><Text style={[styles.tagText, { color: theme.textSecondary }]}>{ev.maxParticipants}</Text></View>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
    </Pressable>
  );
});

// Filter Section Component — supports cascading counts and inline search
function FilterSection({ 
  title, 
  options, 
  value, 
  onChange, 
  labels = {}, 
  icons = {},
  allLabel = 'Tous',
  showSearch,
  searchPlaceholder,
}: { 
  title: string; 
  options: { value: string; count: number }[]; 
  value: string; 
  onChange: (v: string) => void;
  labels?: Record<string, string>;
  icons?: Record<string, string>;
  allLabel?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
}) {
  const [filterSearch, setFilterSearch] = useState('');
  // Auto-enable search for lists with > 6 options
  const shouldShowSearch = showSearch !== false && (showSearch === true || searchPlaceholder !== undefined) && options.length > 6;

  // Filter options by search query
  const visibleOptions = useMemo(() => {
    if (!filterSearch || !shouldShowSearch) return options;
    const q = filterSearch.toLowerCase();
    return options.filter(o => {
      const label = labels[o.value] || o.value;
      return label.toLowerCase().includes(q);
    });
  }, [options, filterSearch, shouldShowSearch, labels]);

  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      {shouldShowSearch ? (
        <View style={styles.filterSearchBar}>
          <MaterialIcons name="search" size={16} color={theme.textMuted} />
          <TextInput
            style={styles.filterSearchInput}
            placeholder={searchPlaceholder || 'Search...'}
            placeholderTextColor={theme.textMuted}
            value={filterSearch}
            onChangeText={setFilterSearch}
          />
          {filterSearch.length > 0 ? (
            <Pressable onPress={() => setFilterSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={14} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
        {/* Always show "All" option first */}
        {(() => {
          const isActive = value === 'all';
          return (
            <Pressable
              key="all"
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => { Haptics.selectionAsync(); onChange('all'); }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]} numberOfLines={1}>
                {allLabel}
              </Text>
              {isActive ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
            </Pressable>
          );
        })()}
        {visibleOptions.map(option => {
          const isActive = value === option.value;
          const label = labels[option.value] || option.value;
          const icon = icons[option.value];
          const showCount = option.count >= 0;
          const isDisabled = option.count === 0 && !isActive;
          return (
            <Pressable
              key={option.value}
              style={[styles.filterChip, isActive && styles.filterChipActive, isDisabled && styles.filterChipDisabled]}
              onPress={() => {
                if (isDisabled) return;
                Haptics.selectionAsync();
                onChange(option.value);
              }}
            >
              {icon ? (
                <MaterialIcons 
                  name={icon as any} 
                  size={14} 
                  color={isActive ? '#FFF' : isDisabled ? theme.textMuted : theme.textSecondary} 
                />
              ) : null}
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive, isDisabled && styles.filterChipTextDisabled]} numberOfLines={1}>
                {label}
              </Text>
              {showCount ? (
                <View style={[styles.filterChipCount, isActive && styles.filterChipCountActive]}>
                  <Text style={[styles.filterChipCountText, isActive && styles.filterChipCountTextActive]}>{option.count}</Text>
                </View>
              ) : null}
              {isActive ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Active Filter Chip Component
function ActiveFilterChip({ label, onRemove, icon }: { label: string; onRemove: () => void; icon?: string }) {
  return (
    <Pressable style={styles.activeFilterChip} onPress={onRemove}>
      {icon && <MaterialIcons name={icon as any} size={12} color={theme.primary} />}
      <Text style={styles.activeFilterChipText}>{label}</Text>
      <MaterialIcons name="close" size={14} color={theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  header: {
    backgroundColor: theme.surface,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerGradient: {
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  headerDecoCircle1: {
    position: 'absolute' as const,
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerDecoCircle2: {
    position: 'absolute' as const,
    bottom: -20,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  headerStatsSummary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerStatsDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerStatsItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  headerStatsValue: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: 'rgba(255,255,255,0.5)',
    transition: 'color 0.2s',
  } as any,
  headerStatsLabel: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  headerSubtitleText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 3,
    fontWeight: '500',
  },
  headerTablet: {
    maxWidth: 960,
    alignSelf: 'center' as const,
    width: '100%',
  },
  headerStats: {
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  headerStatsText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  headerRealUserBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRealUserBtnActive: {
    backgroundColor: theme.primary,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: theme.error,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  tabsWrapper: {
    paddingLeft: 16,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    marginLeft: 4,
    ...theme.shadows.cardElevated,
  },
  tabsContainer: {
    gap: 8,
    paddingRight: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  tabLabelActive: {
    color: '#FFF',
  },
  tabCount: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  tabCountTextActive: {
    color: '#FFF',
  },
  activeFiltersContainer: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF2',
  },
  activeFiltersScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.error + '08',
    borderWidth: 1.5,
    borderColor: theme.error + '25',
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.error,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.primary + '30',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.primary,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  searchingFor: {
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  listContainer: {
    flex: 1,
  },
  tabletRow: {
    gap: 12,
  },
  itemCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  selfCard: {
    borderWidth: 2,
    borderColor: theme.primary,
    // backgroundColor: theme.primary + '04',
  },
  favoriteCard: {
    borderWidth: 2,
    borderColor: theme.error + '40',
    backgroundColor: theme.error + '03',
  },
  itemAvatarOuter: {
    position: 'relative' as const,
    width: 52,
    height: 52,
    marginRight: 12,
  },
  selfAvatarOuter: {
    width: 58,
    height: 58,
    marginRight: 10,
  },
  itemAvatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
  },
  selfAvatar: {
    backgroundColor: theme.primary,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 15,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  selfBadge: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.carreauColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: theme.surface,
    zIndex: 3,
  },
  selfVerifiedBadge: {
    position: 'absolute' as const,
    top: -3,
    left: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2.5,
    borderColor: theme.surface,
    zIndex: 4,
  },
  favoriteBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.surface,
  },
  publicOverlay: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: theme.surface,
    zIndex: 3,
  },
  verifiedBadge: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: theme.surface,
    zIndex: 3,
  },
  realUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.primary + '12',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  realUserBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.primary,
  },
  inviteMeetupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.primary + '25',
  },
  inviteMeetupBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
    flex: 1,
    letterSpacing: -0.1,
  },
  moiBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  moiBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  itemTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  filterChipScroll: {
    paddingRight: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  filterChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    maxWidth: 180,
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  filterChipTextDisabled: {
    color: theme.textMuted,
  },
  filterChipDisabled: {
    opacity: 0.45,
  },
  filterChipCount: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center' as const,
  },
  filterChipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterChipCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.textMuted,
  },
  filterChipCountTextActive: {
    color: '#FFF',
  },
  filterSearchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterSearchInput: {
    flex: 1,
    fontSize: 13,
    color: theme.textPrimary,
    padding: 0,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.backgroundSecondary,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  applyButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.primary,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Duplicate Banner
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  duplicateBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  duplicateBannerContent: { flex: 1 },
  duplicateBannerTitle: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  duplicateBannerDesc: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  duplicateBannerBtn: {
    backgroundColor: theme.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    marginLeft: 8,
  },
  duplicateBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  duplicateBannerClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Duplicate Modal Cards
  duplicateCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  duplicateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  duplicateTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateScoreBadge: {
    backgroundColor: theme.warning + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  duplicateScoreText: { fontSize: 13, fontWeight: '700', color: theme.warning },
  duplicateNames: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  duplicateNameItem: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  duplicateNameText: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, textAlign: 'center' },
  duplicateActions: {
    flexDirection: 'row',
    gap: 10,
  },
  duplicateMergeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  duplicateMergeBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  duplicateDismissBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  duplicateDismissBtnText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  quickMergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.success,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
  },
  quickMergeBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  // Merge History
  mergeHistoryCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  mergeHistorySource: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  mergeHistoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  mergeHistoryTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.warning + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  mergeHistoryTimerText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.warning,
  },
  mergeUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.error,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
  },
  mergeUndoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  mergeHistoryExpired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  mergeHistoryExpiredText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  loadMoreFooter: {
    paddingVertical: 20,
    alignItems: 'center' as const,
  },
  clubVerifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB10',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sponsorBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: '#2563EB25',
  },
  ownerBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: theme.accent + '10',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.accent + '25',
  },
  ownerBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: theme.accent,
  },
  mapLinkBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.success + '12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: theme.success + '25',
  },
  // Active Now
  activeNowBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    gap: 10,
  },
  activeNowBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22C55E15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  activeNowBannerContent: { flex: 1 },
  activeNowBannerTitle: { fontSize: 13, fontWeight: '700' as const, color: '#166534' },
  activeNowBannerDesc: { fontSize: 11, color: '#16A34A', marginTop: 2 },
  activeNowBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22C55E12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  activityScoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 5,
    marginTop: 6,
  },
  activityRankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 28,
    alignItems: 'center' as const,
  },
  activityRankText: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#FFF',
    letterSpacing: 0.3,
  },
  activityScoreBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  activityScoreText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#16A34A',
  },
  activityBreakdown: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  activityBreakdownItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  activityBreakdownText: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: '#64748B',
  },
  photoCountOverlay: {
    position: 'absolute' as const,
    top: 3,
    right: 3,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoCountText: {
    fontSize: 8,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  // Meetup Invitation Picker
  meetupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  meetupPickerContent: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 24,
  },
  meetupPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  meetupPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  meetupPickerSubtitle: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  meetupPickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetupPickerDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  meetupPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  meetupPickerItemDate: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetupPickerItemDay: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.primary,
    lineHeight: 20,
  },
  meetupPickerItemMonth: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.primary,
    letterSpacing: 0.5,
  },
  meetupPickerItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  meetupPickerItemTime: {
    fontSize: 12,
    color: theme.textMuted,
  },
  meetupPickerItemArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetupPickerEmptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: 12,
  },
  meetupPickerEmptyDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  meetupPickerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  meetupPickerCreateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  // Real Users Filter
  realUserFilterRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  realUserFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.primary + '10',
    borderRadius: theme.borderRadius.full,
    borderWidth: 1.5,
    borderColor: theme.primary + '30',
  },
  realUserFilterChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  realUserFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  realUserFilterTextActive: {
    color: '#FFF',
  },
  // Sort Indicator
  sortIndicator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  sortIndicatorText: {
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
  },
  sortIndicatorClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Sort Modal
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center' as const,
    paddingHorizontal: 24,
  },
  sortModalContent: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    paddingVertical: 8,
    maxHeight: 420,
  },
  sortModalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: theme.textPrimary,
    flex: 1,
  },
  sortModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sortOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortOptionText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: theme.textPrimary,
    flex: 1,
  },
  sortOptionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.border,
  },
  // Multi-sort specific styles
  sortActiveItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  sortPriorityBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortDirToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sortReorderBtns: {
    flexDirection: 'column' as const,
    gap: 0,
  },
  sortReorderBtn: {
    width: 24,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.error + '08',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortClearAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    marginTop: 4,
  },
  sortAddBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sortIndicatorChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  sortIndicatorChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
