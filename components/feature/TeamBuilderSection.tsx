/**
 * TeamBuilderSection — Team-up UI for tournament doubles/triples.
 * Shows in home page "My Journey" section, under upcoming tournaments.
 * Allows inviting players, tracking acceptance, auto-team formation.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput,
  ScrollView, ActivityIndicator, FlatList, Platform, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { getSupabaseClient, useAuth } from '@/template';
import {
  sendTeamInvitation, getMyTeamInvitations, getMyTournamentTeam,
  getTeamSize, dissolveTeam, removeMemberFromTeam, getMyTeams,
  TeamInvitation, TournamentTeam,
} from '@/services/teamInvitationService';
import { getTeamMessageCount } from '@/services/teamChatService';
import { Tournament, Terrain } from '@/types/petanque';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppData } from '@/contexts/AppContext';
import { useRef } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDistance } from '@/services/terrainProximityService';
import { isTeamUpEligibleTournament } from '@/utils/tournamentTeamFormat';
import { useHomeDistanceFilterLocation } from '@/hooks/useHomeDistanceFilterLocation';
import {
  HOME_DISTANCE_OPTIONS,
  type DistanceFilter,
  buildCoordsMap,
  filterItemsByDistance,
  resolveTournamentCoords,
} from '@/utils/homeDistanceCoords';

type TeamableTournament = Tournament & { distanceKm?: number };

const DISTANCE_OPTIONS = HOME_DISTANCE_OPTIONS;
const SCROLL_ITEM_LIMIT = 3;
const TOURNAMENT_ROW_HEIGHT = 66;
const SCROLL_MAX_HEIGHT = SCROLL_ITEM_LIMIT * TOURNAMENT_ROW_HEIGHT;

// Haversine distance in km between two lat/lng points (player search proximity)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  tournaments: Tournament[];
  terrains: Terrain[];
  language: string;
  selfPlayerName: string;
}

export default function TeamBuilderSection({ tournaments, terrains, language, selfPlayerName }: Props) {
  const { user } = useAuth();
  const { matches } = useAppData();
  const { t } = useLanguage();
  const fr = language === 'fr';
  const [showModal, setShowModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [team, setTeam] = useState<TournamentTeam | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; avatar?: string; club?: string; userId: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dissolving, setDissolving] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [chatMsgCount, setChatMsgCount] = useState(0);

  // Recent partners
  const [recentPartners, setRecentPartners] = useState<Array<{ id: string; name: string; avatar?: string; club?: string; userId: string; count: number }>>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);

  // Synergy detail tooltip
  const [synergyDetail, setSynergyDetail] = useState<{ name: string; userId: string; score: number; color: string; bgColor: string; label: string; breakdown: { winRate: number; frequency: number; elo: number; role: number } } | null>(null);

  // Nearby filter state (player search in modal)
  const [nearbyMode, setNearbyMode] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Tournament list distance filter
  const [tournamentDistanceFilter, setTournamentDistanceFilter] = useState<DistanceFilter>('all');
  const { location: listUserLocation, loading: listGpsLoading, denied: listGpsDenied, requestLocation: requestListGPS } = useHomeDistanceFilterLocation();
  const [tournamentCoordsMap, setTournamentCoordsMap] = useState<Map<string, { lat: number; lng: number }>>(new Map());

  // Partner match history stats
  type PartnerStats = { wins: number; losses: number; total: number; winRate: number; lastDate: string | null };
  const partnerStatsCache = useRef<Map<string, PartnerStats>>(new Map());

  // Win rate badge helper
  const getWinRateBadge = useCallback((winRate: number): { color: string; bgColor: string; label: string } => {
    if (winRate > 60) return { color: '#16A34A', bgColor: '#22C55E15', label: `${winRate}%` };
    if (winRate >= 40) return { color: '#D97706', bgColor: '#F59E0B15', label: `${winRate}%` };
    return { color: '#DC2626', bgColor: '#EF444415', label: `${winRate}%` };
  }, []);

  // Synergy score: composite of win rate, frequency, ELO compatibility, role complementarity
  const computeSynergyScore = useCallback((partnerUserId: string, partnerRole?: string, partnerElo?: number): { score: number; color: string; bgColor: string; label: string; breakdown: { winRate: number; frequency: number; elo: number; role: number } } => {
    const ps = getPartnerMatchStats(partnerUserId);
    // 1. Win rate component (0-30 pts)
    const winRatePts = ps.total > 0 ? Math.round((ps.winRate / 100) * 30) : 15;
    // 2. Frequency component (0-25 pts) — more matches = higher score
    const freqPts = Math.min(25, Math.round((ps.total / 10) * 25));
    // 3. ELO compatibility (0-25 pts) — closer ELO = better synergy, or bonus if both strong
    let eloPts = 15; // default when no ELO data
    if (partnerElo && user?.id) {
      // Find user's own ELO from matches context
      const ownPlayers = matches.length > 0 ? matches[0]?.teamA : null;
      // Simplify: use 1000 as base, reward similar ELO levels
      const ownElo = 1000; // approximate
      const diff = Math.abs(partnerElo - ownElo);
      if (diff < 100) eloPts = 25;
      else if (diff < 200) eloPts = 20;
      else if (diff < 400) eloPts = 15;
      else eloPts = 10;
    }
    // 4. Role complementarity (0-20 pts) — Tireur+Pointeur = best
    let rolePts = 10; // default
    if (partnerRole) {
      // Check self player role from matches or use generic
      const complementary = (partnerRole === 'Tireur' || partnerRole === 'Pointeur');
      rolePts = complementary ? 20 : partnerRole === 'Milieu' ? 15 : 10;
    }
    const score = Math.min(100, winRatePts + freqPts + eloPts + rolePts);
    const color = score >= 75 ? '#16A34A' : score >= 50 ? '#D97706' : score >= 30 ? '#EA580C' : '#DC2626';
    const bgColor = score >= 75 ? '#22C55E10' : score >= 50 ? '#F59E0B10' : score >= 30 ? '#F9731610' : '#EF444410';
    const label = score >= 75 ? (fr ? 'Excellente' : 'Excellent') : score >= 50 ? (fr ? 'Bonne' : 'Good') : score >= 30 ? (fr ? 'Moyenne' : 'Average') : (fr ? 'Faible' : 'Low');
    return { score, color, bgColor, label, breakdown: { winRate: winRatePts, frequency: freqPts, elo: eloPts, role: rolePts } };
  }, [getPartnerMatchStats, user?.id, matches, fr]);

  // Compute win rate history over last N shared matches for sparkline
  const getSynergyHistory = useCallback((partnerUserId: string): number[] => {
    if (!user?.id || matches.length === 0) return [];
    const sharedMatches: { date: string; won: boolean }[] = [];
    matches.forEach(m => {
      const teamA = m.teamA as any;
      const teamB = m.teamB as any;
      const myInA = teamA?.playerIds?.includes(user.id);
      const myInB = teamB?.playerIds?.includes(user.id);
      const partnerInA = teamA?.playerIds?.includes(partnerUserId);
      const partnerInB = teamB?.playerIds?.includes(partnerUserId);
      const sameTeam = (myInA && partnerInA) || (myInB && partnerInB);
      if (!sameTeam) return;
      const myTeamLabel = myInA ? 'A' : 'B';
      sharedMatches.push({ date: m.date, won: m.winner === myTeamLabel });
    });
    sharedMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const last = sharedMatches.slice(-10);
    if (last.length < 2) return [];
    const history: number[] = [];
    let wins = 0;
    last.forEach((m, i) => {
      if (m.won) wins++;
      history.push(Math.round((wins / (i + 1)) * 100));
    });
    return history;
  }, [user?.id, matches]);

  // Favorite partners
  const [favoritePartnerIds, setFavoritePartnerIds] = useState<Set<string>>(new Set());

  // Search filters
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterCity, setFilterCity] = useState('');
  const [filterEloMin, setFilterEloMin] = useState('');
  const [filterEloMax, setFilterEloMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Deadline toggle & My Teams
  const [deadlineEnabledMap, setDeadlineEnabledMap] = useState<Record<string, boolean>>({});
  const [showTeamsModal, setShowTeamsModal] = useState(false);
  const [myTeamsList, setMyTeamsList] = useState<TournamentTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamTournamentNames, setTeamTournamentNames] = useState<Map<string, { name: string; date: string }>>(new Map());

  useEffect(() => {
    if (tournamentDistanceFilter !== 'all' && !listUserLocation && !listGpsLoading) {
      requestListGPS();
    }
  }, [tournamentDistanceFilter, listUserLocation, listGpsLoading, requestListGPS]);

  const allTeamableTournaments = useMemo(() => {
    return tournaments
      .filter(t => isTeamUpEligibleTournament(t))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [tournaments]);

  useEffect(() => {
    if (tournamentDistanceFilter === 'all' || allTeamableTournaments.length === 0) {
      setTournamentCoordsMap(new Map());
      return;
    }
    let cancelled = false;
    buildCoordsMap(allTeamableTournaments, t => resolveTournamentCoords(t, terrains)).then(map => {
      if (!cancelled) setTournamentCoordsMap(map);
    });
    return () => { cancelled = true; };
  }, [tournamentDistanceFilter, allTeamableTournaments, terrains]);

  const teamableTournaments = useMemo((): TeamableTournament[] => {
    if (tournamentDistanceFilter === 'all') return allTeamableTournaments;
    if (!listUserLocation) return [];
    const maxKm = Number(tournamentDistanceFilter);
    return filterItemsByDistance(allTeamableTournaments, tournamentCoordsMap, listUserLocation, maxKm);
  }, [allTeamableTournaments, tournamentDistanceFilter, listUserLocation, tournamentCoordsMap]);

  const distanceLabels: Record<DistanceFilter, string> = {
    all: t('directory', 'distanceAll'),
    '5': '5 km',
    '10': '10 km',
    '25': '25 km',
    '50': '50 km',
    '100': '100 km',
  };

  // Load favorite partners from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('favorite_partner_ids').then(raw => {
      if (raw) {
        try { setFavoritePartnerIds(new Set(JSON.parse(raw))); } catch { /* silent */ }
      }
    }).catch(() => {});
  }, []);

  const toggleFavoritePartner = useCallback(async (partnerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavoritePartnerIds(prev => {
      const next = new Set(prev);
      if (next.has(partnerId)) next.delete(partnerId);
      else next.add(partnerId);
      AsyncStorage.setItem('favorite_partner_ids', JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // Load deadline preferences from AsyncStorage
  useEffect(() => {
    if (teamableTournaments.length === 0) return;
    const loadPrefs = async () => {
      const map: Record<string, boolean> = {};
      for (const t of teamableTournaments) {
        const val = await AsyncStorage.getItem(`team_deadline_${t.id}`);
        map[t.id] = val === null ? false : val === 'enabled';
      }
      setDeadlineEnabledMap(map);
    };
    loadPrefs();
  }, [teamableTournaments]);

  // Team formation deadline: 2 days before tournament
  const DEADLINE_DAYS = 2;
  const getDeadlineInfo = useCallback((tournamentDate: string) => {
    const deadline = new Date(new Date(tournamentDate).getTime() - DEADLINE_DAYS * 86400000);
    const now = new Date();
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
    const isPast = daysLeft <= 0;
    const isUrgent = daysLeft > 0 && daysLeft <= 3;
    return { deadline, daysLeft, isPast, isUrgent };
  }, []);

  const isDeadlineActive = useCallback((tournamentId: string, tournamentDate: string) => {
    if (deadlineEnabledMap[tournamentId] !== true) return { deadline: new Date(), daysLeft: 999, isPast: false, isUrgent: false };
    return getDeadlineInfo(tournamentDate);
  }, [deadlineEnabledMap, getDeadlineInfo]);

  const toggleDeadline = useCallback(async (tournamentId: string) => {
    Haptics.selectionAsync();
    const current = deadlineEnabledMap[tournamentId] === true;
    const newVal = !current;
    setDeadlineEnabledMap(prev => ({ ...prev, [tournamentId]: newVal }));
    await AsyncStorage.setItem(`team_deadline_${tournamentId}`, newVal ? 'enabled' : 'disabled');
  }, [deadlineEnabledMap]);

  const handleOpenTeams = useCallback(async () => {
    Haptics.selectionAsync();
    setShowTeamsModal(true);
    setTeamsLoading(true);
    const { teams } = await getMyTeams();
    setMyTeamsList(teams);
    const ids = [...new Set(teams.map(t => t.tournamentId))];
    if (ids.length > 0) {
      const sb = getSupabaseClient();
      const { data } = await sb.from('tournaments').select('id, name, date').in('id', ids);
      const tMap = new Map<string, { name: string; date: string }>();
      (data || []).forEach((r: any) => tMap.set(r.id, { name: r.name, date: r.date }));
      setTeamTournamentNames(tMap);
    }
    setTeamsLoading(false);
  }, []);

  // Compute match history stats with a partner
  const getPartnerMatchStats = useCallback((partnerUserId: string): PartnerStats => {
    const cached = partnerStatsCache.current.get(partnerUserId);
    if (cached) return cached;
    if (!user?.id || matches.length === 0) return { wins: 0, losses: 0, total: 0, winRate: 0, lastDate: null };
    let wins = 0, losses = 0, total = 0;
    let lastDate: string | null = null;
    matches.forEach(m => {
      const teamA = m.teamA as any;
      const teamB = m.teamB as any;
      const myInA = teamA?.playerIds?.includes(user.id);
      const myInB = teamB?.playerIds?.includes(user.id);
      const partnerInA = teamA?.playerIds?.includes(partnerUserId);
      const partnerInB = teamB?.playerIds?.includes(partnerUserId);
      const sameTeam = (myInA && partnerInA) || (myInB && partnerInB);
      if (!sameTeam) return;
      total++;
      const myTeamLabel = myInA ? 'A' : 'B';
      if (m.winner === myTeamLabel) wins++;
      else losses++;
      if (!lastDate || new Date(m.date) > new Date(lastDate)) lastDate = m.date;
    });
    const stats: PartnerStats = { wins, losses, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, lastDate };
    partnerStatsCache.current.set(partnerUserId, stats);
    return stats;
  }, [user?.id, matches]);

  // Load recent partners from past matches
  const loadRecentPartners = useCallback(async () => {
    if (!user?.id || matches.length === 0) return;
    setLoadingPartners(true);
    try {
      // Extract partner player IDs from matches where user was on team A
      const partnerMap = new Map<string, { name: string; count: number }>();
      matches.forEach(m => {
        const teamA = m.teamA as any;
        const teamB = m.teamB as any;
        // Check if user is in team A
        const inTeamA = teamA?.playerIds?.includes(user.id);
        const inTeamB = teamB?.playerIds?.includes(user.id);
        const myTeam = inTeamA ? teamA : inTeamB ? teamB : null;
        if (!myTeam || !myTeam.playerIds) return;
        myTeam.playerIds.forEach((pid: string, idx: number) => {
          if (pid === user.id) return;
          const existing = partnerMap.get(pid);
          const name = myTeam.playerNames?.[idx] || 'Unknown';
          if (existing) {
            existing.count += 1;
          } else {
            partnerMap.set(pid, { name, count: 1 });
          }
        });
      });

      if (partnerMap.size === 0) { setLoadingPartners(false); return; }

      // Look up these players in the public players table for avatar/club
      const sb = getSupabaseClient();
      const partnerIds = [...partnerMap.keys()];
      const { data: playerData } = await sb
        .from('players')
        .select('id, name, avatar, club, user_id')
        .in('id', partnerIds)
        .eq('is_public', true);

      const results = (playerData || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        club: p.club,
        userId: p.user_id,
        count: partnerMap.get(p.id)?.count || partnerMap.get(p.user_id)?.count || 1,
      })).sort((a: any, b: any) => b.count - a.count).slice(0, 5);

      // Also include partners not in public players (use match data)
      if (results.length < 5) {
        const foundIds = new Set(results.map((r: any) => r.id));
        partnerMap.forEach((val, pid) => {
          if (!foundIds.has(pid) && results.length < 5) {
            results.push({ id: pid, name: val.name, avatar: undefined, club: undefined, userId: pid, count: val.count });
          }
        });
      }

      setRecentPartners(results);
    } catch { /* silent */ }
    setLoadingPartners(false);
  }, [user?.id, matches]);

  const loadTeamData = useCallback(async (tournamentId: string) => {
    setLoadingInvites(true);
    const [{ invitations: inv }, { team: t }] = await Promise.all([
      getMyTeamInvitations(tournamentId),
      getMyTournamentTeam(tournamentId),
    ]);
    setInvitations(inv);
    setTeam(t);
    // Load chat message count if team exists
    if (t) {
      getTeamMessageCount(t.id).then(setChatMsgCount).catch(() => {});
    }
    setLoadingInvites(false);
  }, []);

  const handleOpenModal = useCallback((tournament: Tournament) => {
    Haptics.selectionAsync();
    setSelectedTournament(tournament);
    setShowModal(true);
    loadTeamData(tournament.id);
    loadRecentPartners();
  }, [loadTeamData, loadRecentPartners]);

  // Search players with filters
  const handleSearch = useCallback(async (query: string) => {
    setSearch(query);
    if (query.trim().length < 2 && !filterRole && !filterCity && !filterEloMin) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const supabase = getSupabaseClient();
      let q = supabase
        .from('players')
        .select('id, name, avatar, club, user_id, role, city, elo_rating, location')
        .eq('is_public', true)
        .neq('user_id', user?.id || '');

      if (query.trim().length >= 2) {
        q = q.ilike('name', `%${query.trim()}%`);
      }
      if (filterRole) {
        q = q.eq('role', filterRole);
      }
      if (filterCity) {
        q = q.ilike('city', `%${filterCity.trim()}%`);
      }
      if (filterEloMin) {
        q = q.gte('elo_rating', parseInt(filterEloMin) || 0);
      }
      if (filterEloMax) {
        q = q.lte('elo_rating', parseInt(filterEloMax) || 9999);
      }

      const { data } = await q.limit(20);
      // Map results and calculate distance to tournament location
      const tournamentLoc = selectedTournament?.location as any;
      const tLat = tournamentLoc?.latitude;
      const tLng = tournamentLoc?.longitude;
      const hasLocation = tLat && tLng && tLat !== 0 && tLng !== 0;

      let results = (data || []).map((p: any) => {
        let distance: number | null = null;
        if (hasLocation && p.location?.latitude && p.location?.longitude) {
          distance = Math.round(haversineKm(tLat, tLng, p.location.latitude, p.location.longitude));
        }
        return {
          id: p.id, name: p.name, avatar: p.avatar, club: p.club, userId: p.user_id,
          role: p.role, city: p.city, eloRating: p.elo_rating, distance,
        };
      });

      // Sort by proximity: use user GPS location if nearbyMode, else tournament location
      if (nearbyMode && userLocation) {
        results = results.map((r: any) => {
          if (r.location?.latitude && r.location?.longitude) {
            r.distance = Math.round(haversineKm(userLocation.lat, userLocation.lng, r.location.latitude, r.location.longitude));
          }
          return r;
        });
      }
      const shouldSort = (nearbyMode && userLocation) || hasLocation;
      if (shouldSort) {
        results.sort((a: any, b: any) => {
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
          if (a.distance !== null) return -1;
          if (b.distance !== null) return 1;
          return 0;
        });
      }

      setSearchResults(results);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [user?.id, filterRole, filterCity, filterEloMin, filterEloMax, nearbyMode, userLocation]);

  // Trigger search when filters change
  useEffect(() => {
    if (showModal && (filterRole || filterCity || filterEloMin || filterEloMax)) {
      handleSearch(search);
    }
  }, [filterRole, filterCity, filterEloMin, filterEloMax]);

  const handleInvite = useCallback(async (player: { id: string; name: string; userId: string }) => {
    if (!selectedTournament || !user?.id) return;
    setSending(player.userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await sendTeamInvitation({
      tournamentId: selectedTournament.id,
      inviteeUserId: player.userId,
      inviterName: selfPlayerName,
      inviteeName: player.name,
      tournamentName: selectedTournament.name,
      format: selectedTournament.format,
    });
    setSending(null);
    if (error) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadTeamData(selectedTournament.id);
    setSearch('');
    setSearchResults([]);
  }, [selectedTournament, user?.id, selfPlayerName, loadTeamData]);

  const handleDissolve = useCallback(async () => {
    if (!team || !selectedTournament) return;
    Alert.alert(
      fr ? 'Dissoudre l\'equipe ?' : 'Dissolve team?',
      fr ? 'Tous les membres seront notifies. Cette action est irreversible.' : 'All members will be notified. This action is irreversible.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Dissoudre' : 'Dissolve',
          style: 'destructive',
          onPress: async () => {
            setDissolving(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const { error } = await dissolveTeam(team.id);
            setDissolving(false);
            if (!error) {
              setTeam(null);
              setInvitations([]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }, [team, selectedTournament, fr]);

  const handleRemoveMember = useCallback(async (memberId: string, memberName: string) => {
    if (!team) return;
    Alert.alert(
      fr ? `Retirer ${memberName} ?` : `Remove ${memberName}?`,
      fr ? 'Le joueur sera notifie et l\'equipe repassera en formation.' : 'The player will be notified and the team will revert to forming.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Retirer' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingMember(memberId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await removeMemberFromTeam(team.id, memberId);
            setRemovingMember(null);
            if (!error && selectedTournament) {
              await loadTeamData(selectedTournament.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }, [team, fr, selectedTournament, loadTeamData]);

  if (allTeamableTournaments.length === 0) {
    // Show motivating empty state with create tournament prompt
    return (
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.headerIcon}>
            <MaterialIcons name="groups" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{fr ? 'Former une equipe' : 'Team Up'}</Text>
            <Text style={s.headerSub}>{fr ? 'Invitez des partenaires pour vos tournois' : 'Invite partners for your tournaments'}</Text>
          </View>
        </View>
        <View style={s.emptyStateWrap}>
          <View style={s.emptyStateIconRing}>
            <MaterialIcons name="emoji-events" size={28} color="#22C55E" />
          </View>
          <Text style={s.emptyStateTitle}>
            {fr ? 'Pret a jouer en equipe ?' : 'Ready to play as a team?'}
          </Text>
          <Text style={s.emptyStateDesc}>
            {fr
              ? 'Creez un tournoi en Doublette ou Triplette, puis invitez vos coequipiers preferes. L\u2019app calcule automatiquement votre synergie !'
              : 'Create a Doubles or Triples tournament, then invite your favorite teammates. The app automatically calculates your synergy!'}
          </Text>
          <Pressable
            style={({ pressed }) => [s.emptyStateCTA, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/tournament/new' as any); }}
          >
            <MaterialIcons name="add" size={18} color="#FFF" />
            <Text style={s.emptyStateCTAText}>{fr ? 'Creer un tournoi' : 'Create tournament'}</Text>
          </Pressable>
          <View style={s.emptyStateHints}>
            <View style={s.emptyStateHintRow}>
              <MaterialIcons name="check-circle" size={12} color="#22C55E" />
              <Text style={s.emptyStateHintText}>{fr ? 'Score de synergie avec vos partenaires' : 'Synergy score with your partners'}</Text>
            </View>
            <View style={s.emptyStateHintRow}>
              <MaterialIcons name="check-circle" size={12} color="#22C55E" />
              <Text style={s.emptyStateHintText}>{fr ? 'Chat d\u2019equipe integre' : 'Built-in team chat'}</Text>
            </View>
            <View style={s.emptyStateHintRow}>
              <MaterialIcons name="check-circle" size={12} color="#22C55E" />
              <Text style={s.emptyStateHintText}>{fr ? 'Notifications d\u2019acceptation en temps reel' : 'Real-time acceptance notifications'}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const teamSize = selectedTournament ? getTeamSize(selectedTournament.format) : 2;
  const acceptedInvites = invitations.filter(i => i.status === 'accepted');
  const pendingInvites = invitations.filter(i => i.status === 'pending');
  const alreadyInvitedIds = new Set(invitations.map(i => i.inviteeUserId));
  const isTeamComplete = team?.status === 'complete' || (acceptedInvites.length + 1 >= teamSize);
  const slotsRemaining = teamSize - 1 - acceptedInvites.length;

  // Recommended partner: highest synergy score among eligible recent partners
  const recommendedPartnerId = useMemo(() => {
    if (recentPartners.length === 0 || !selectedTournament) return null;
    const eligible = recentPartners.filter(rp => !alreadyInvitedIds.has(rp.userId));
    if (eligible.length === 0) return null;
    let bestId: string | null = null;
    let bestScore = -1;
    eligible.forEach(p => {
      const syn = computeSynergyScore(p.userId);
      if (syn.score > bestScore) { bestScore = syn.score; bestId = p.userId; }
    });
    return bestScore >= 40 ? bestId : null;
  }, [recentPartners, selectedTournament, alreadyInvitedIds, computeSynergyScore]);

  const renderTournamentRow = (t: TeamableTournament) => (
    <Pressable
      key={t.id}
      style={({ pressed }) => [s.tournamentRow, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
      onPress={() => handleOpenModal(t)}
    >
      <View style={s.tournamentDate}>
        <Text style={s.tournamentDateDay}>{new Date(t.date).getDate()}</Text>
        <Text style={s.tournamentDateMonth}>
          {new Date(t.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.tournamentName} numberOfLines={1}>{t.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <View style={s.formatChip}>
            <Text style={s.formatChipText}>{t.format}</Text>
          </View>
          <Text style={s.tournamentCity} numberOfLines={1}>{(t.location as any)?.city || ''}</Text>
          {t.distanceKm != null ? (
            <View style={s.tournamentDistBadge}>
              <MaterialIcons name="near-me" size={9} color="#10B981" />
              <Text style={s.tournamentDistText}>{formatDistance(Math.round(t.distanceKm * 1000), language)}</Text>
            </View>
          ) : null}
        </View>
        {(() => {
          const dl = isDeadlineActive(t.id, t.date);
          if (dl.isPast) return (
            <View style={s.deadlineBadge}>
              <MaterialIcons name="lock-clock" size={10} color="#EF4444" />
              <Text style={[s.deadlineText, { color: '#EF4444' }]}>{fr ? 'Inscription fermee' : 'Registration closed'}</Text>
            </View>
          );
          if (dl.isUrgent) return (
            <View style={[s.deadlineBadge, { backgroundColor: '#FEF3C720' }]}>
              <MaterialIcons name="schedule" size={10} color="#D97706" />
              <Text style={[s.deadlineText, { color: '#D97706' }]}>{dl.daysLeft}j {fr ? 'restant(s)' : 'left'}</Text>
            </View>
          );
          return null;
        })()}
      </View>
      <View style={[s.inviteBtn, (() => { const dl = isDeadlineActive(t.id, t.date); return dl.isPast ? { opacity: 0.4 } : {}; })()]}>
        <MaterialIcons name="person-add" size={16} color="#22C55E" />
      </View>
    </Pressable>
  );

  return (
    <>
      {/* Section Card */}
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.headerIcon}>
            <MaterialIcons name="groups" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{fr ? 'Former une equipe' : 'Team Up'}</Text>
            <Text style={s.headerSub}>{fr ? 'Invitez des partenaires pour vos tournois' : 'Invite partners for your tournaments'}</Text>
          </View>
          <Pressable style={s.teamsHistoryBtn} onPress={handleOpenTeams}>
            <MaterialIcons name="history" size={16} color="#7C3AED" />
            <Text style={s.teamsHistoryBtnText}>{fr ? 'Equipes' : 'Teams'}</Text>
          </Pressable>
        </View>

        <View style={s.listFilterSection}>
          <View style={s.listFilterTitleRow}>
            <MaterialIcons name="near-me" size={14} color="#64748B" />
            <Text style={s.listFilterTitle}>{t('directory', 'distanceFilter')}</Text>
            {listGpsLoading ? <ActivityIndicator size="small" color="#22C55E" style={{ marginLeft: 6 }} /> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.listFilterChips}>
            {DISTANCE_OPTIONS.map(option => {
              const active = tournamentDistanceFilter === option;
              return (
                <Pressable
                  key={option}
                  style={[s.listFilterChip, active && s.listFilterChipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTournamentDistanceFilter(option);
                    if (option !== 'all') requestListGPS();
                  }}
                >
                  <Text style={[s.listFilterChipText, active && s.listFilterChipTextActive]}>{distanceLabels[option]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {tournamentDistanceFilter !== 'all' && listGpsDenied ? (
            <Text style={s.listFilterHint}>{t('directory', 'gpsRequired')}</Text>
          ) : null}
        </View>

        {listGpsLoading && tournamentDistanceFilter !== 'all' && !listUserLocation ? (
          <View style={s.listFilterEmpty}>
            <ActivityIndicator size="small" color="#22C55E" />
            <Text style={s.listFilterEmptyText}>
              {fr ? 'Localisation en cours...' : 'Getting your location...'}
            </Text>
          </View>
        ) : teamableTournaments.length === 0 ? (
          <View style={s.listFilterEmpty}>
            <MaterialIcons name="filter-alt-off" size={22} color="#94A3B8" />
            <Text style={s.listFilterEmptyText}>
              {tournamentDistanceFilter !== 'all' && allTeamableTournaments.length > 0
                ? (fr ? `Aucun tournoi dans ${tournamentDistanceFilter} km` : `No tournaments within ${tournamentDistanceFilter} km`)
                : (fr ? 'Aucun tournoi disponible' : 'No tournaments available')}
            </Text>
            {tournamentDistanceFilter !== 'all' ? (
              <Pressable style={s.listFilterResetBtn} onPress={() => setTournamentDistanceFilter('all')}>
                <Text style={s.listFilterResetText}>{t('directory', 'distanceAll')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : teamableTournaments.length > SCROLL_ITEM_LIMIT ? (
          <ScrollView
            style={[s.tournamentScrollList, { maxHeight: SCROLL_MAX_HEIGHT }]}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            persistentScrollbar={Platform.OS === 'android'}
          >
            {teamableTournaments.map(renderTournamentRow)}
          </ScrollView>
        ) : (
          teamableTournaments.map(renderTournamentRow)
        )}

        {teamableTournaments.length > SCROLL_ITEM_LIMIT ? (
          <Text style={s.tournamentScrollHint}>
            {fr
              ? `${teamableTournaments.length} tournois — faites defiler la liste`
              : `${teamableTournaments.length} tournaments — scroll the list`}
          </Text>
        ) : null}
      </View>

      {/* Team Builder Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalClose} onPress={() => setShowModal(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.modalTitle}>{fr ? 'Former une equipe' : 'Build Team'}</Text>
              {selectedTournament ? (
                <Text style={s.modalSub} numberOfLines={1}>{selectedTournament.name} • {selectedTournament.format}</Text>
              ) : null}
            </View>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {/* Team Status */}
            <View style={[s.teamStatusCard, isTeamComplete && { borderColor: '#22C55E40', backgroundColor: '#F0FDF4' }]}>
              {/* Deadline warning */}
              {selectedTournament && (() => {
                const dl = isDeadlineActive(selectedTournament.id, selectedTournament.date);
                if (dl.isPast && !isTeamComplete) return (
                  <View style={s.deadlineWarning}>
                    <MaterialIcons name="error-outline" size={16} color="#EF4444" />
                    <Text style={s.deadlineWarningText}>
                      {fr ? 'La date limite de formation est passee. Vous ne pouvez plus envoyer d\'invitations.' : 'Team formation deadline has passed. You can no longer send invitations.'}
                    </Text>
                  </View>
                );
                if (dl.isUrgent && !isTeamComplete) return (
                  <View style={[s.deadlineWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B30' }]}>
                    <MaterialIcons name="schedule" size={16} color="#D97706" />
                    <Text style={[s.deadlineWarningText, { color: '#92400E' }]}>
                      {fr ? `Plus que ${dl.daysLeft} jour(s) pour former votre equipe !` : `Only ${dl.daysLeft} day(s) left to form your team!`}
                    </Text>
                  </View>
                );
                return null;
              })()}
              <View style={s.teamStatusHeader}>
                <MaterialIcons name={isTeamComplete ? 'check-circle' : 'groups'} size={22} color={isTeamComplete ? '#22C55E' : theme.primary} />
                <Text style={[s.teamStatusTitle, isTeamComplete && { color: '#16A34A' }]}>
                  {isTeamComplete ? (fr ? 'Equipe complete !' : 'Team complete!') : `${acceptedInvites.length + 1}/${teamSize} ${fr ? 'joueurs' : 'players'}`}
                </Text>
              </View>

              {/* Team members */}
              <View style={s.membersRow}>
                {/* Creator (self) */}
                <View style={s.memberItem}>
                  <View style={[s.memberAvatar, { backgroundColor: theme.primary + '20' }]}>
                    <MaterialIcons name="person" size={18} color={theme.primary} />
                  </View>
                  <Text style={s.memberName} numberOfLines={1}>{selfPlayerName}</Text>
                  <View style={[s.memberBadge, { backgroundColor: theme.primary + '15' }]}>
                    <Text style={[s.memberBadgeText, { color: theme.primary }]}>{fr ? 'Capitaine' : 'Captain'}</Text>
                  </View>
                </View>

                {/* Accepted members — captain can remove */}
                {acceptedInvites.map(inv => (
                  <View key={inv.id} style={s.memberItem}>
                    <View style={[s.memberAvatar, { backgroundColor: '#22C55E20' }]}>
                      <MaterialIcons name="check" size={18} color="#22C55E" />
                    </View>
                    <Text style={s.memberName} numberOfLines={1}>{inv.inviteeName}</Text>
                    <View style={[s.memberBadge, { backgroundColor: '#22C55E15' }]}>
                      <Text style={[s.memberBadgeText, { color: '#22C55E' }]}>{fr ? 'Confirme' : 'Confirmed'}</Text>
                    </View>
                    {team && user?.id === team.creatorUserId ? (
                      <Pressable
                        style={s.removeMemberBtn}
                        onPress={() => handleRemoveMember(inv.inviteeUserId, inv.inviteeName)}
                        disabled={removingMember === inv.inviteeUserId}
                        hitSlop={6}
                      >
                        {removingMember === inv.inviteeUserId ? (
                          <ActivityIndicator size="small" color="#EF4444" />
                        ) : (
                          <MaterialIcons name="person-remove" size={14} color="#EF4444" />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                {/* Pending invites */}
                {pendingInvites.map(inv => (
                  <View key={inv.id} style={[s.memberItem, { opacity: 0.6 }]}>
                    <View style={[s.memberAvatar, { backgroundColor: '#F59E0B20' }]}>
                      <MaterialIcons name="schedule" size={18} color="#F59E0B" />
                    </View>
                    <Text style={s.memberName} numberOfLines={1}>{inv.inviteeName}</Text>
                    <View style={[s.memberBadge, { backgroundColor: '#F59E0B15' }]}>
                      <Text style={[s.memberBadgeText, { color: '#F59E0B' }]}>{fr ? 'En attente' : 'Pending'}</Text>
                    </View>
                  </View>
                ))}

                {/* Empty slots */}
                {Array.from({ length: Math.max(0, slotsRemaining - pendingInvites.length) }).map((_, i) => (
                  <View key={`empty-${i}`} style={[s.memberItem, { opacity: 0.3 }]}>
                    <View style={[s.memberAvatar, { backgroundColor: theme.border, borderStyle: 'dashed', borderWidth: 2, borderColor: theme.textMuted }]}>
                      <MaterialIcons name="person-add" size={16} color={theme.textMuted} />
                    </View>
                    <Text style={[s.memberName, { color: theme.textMuted }]}>{fr ? 'Poste libre' : 'Open slot'}</Text>
                  </View>
                ))}
              </View>

              {/* Progress bar */}
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${((acceptedInvites.length + 1) / teamSize) * 100}%`, backgroundColor: isTeamComplete ? '#22C55E' : theme.primary }]} />
              </View>

              {/* Deadline toggle - captain only */}
              {user?.id === (team?.creatorUserId || user?.id) && !isTeamComplete ? (
                <View style={s.deadlineToggleRow}>
                  <MaterialIcons name="timer" size={16} color={deadlineEnabledMap[selectedTournament?.id || ''] === true ? '#D97706' : '#94A3B8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.deadlineToggleLabel}>{fr ? 'Date limite formation' : 'Formation deadline'}</Text>
                    <Text style={s.deadlineToggleSub}>{fr ? 'Bloque les invitations 2j avant le tournoi' : 'Blocks invitations 2 days before tournament'}</Text>
                  </View>
                  <Switch
                    value={deadlineEnabledMap[selectedTournament?.id || ''] === true}
                    onValueChange={() => selectedTournament && toggleDeadline(selectedTournament.id)}
                    trackColor={{ false: '#E2E8F0', true: '#F59E0B50' }}
                    thumbColor={deadlineEnabledMap[selectedTournament?.id || ''] === true ? '#F59E0B' : '#94A3B8'}
                  />
                </View>
              ) : null}
            </View>

            {!isTeamComplete && !(selectedTournament && isDeadlineActive(selectedTournament.id, selectedTournament.date).isPast) ? (
              <View style={s.searchSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={s.searchLabel}>{fr ? 'Inviter un joueur' : 'Invite a player'}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                  {/* Nearby chip */}
                  <Pressable
                    style={[s.nearbyChip, nearbyMode && { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                    onPress={async () => {
                      if (nearbyMode) { setNearbyMode(false); return; }
                      Haptics.selectionAsync();
                      setLoadingLocation(true);
                      try {
                        const Location = require('@/services/location');
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        if (status === 'granted') {
                          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
                          setNearbyMode(true);
                          handleSearch(search || ' ');
                        }
                      } catch { /* silent */ }
                      setLoadingLocation(false);
                    }}
                    disabled={loadingLocation}
                  >
                    {loadingLocation ? (
                      <ActivityIndicator size="small" color={nearbyMode ? '#FFF' : '#10B981'} />
                    ) : (
                      <MaterialIcons name="near-me" size={13} color={nearbyMode ? '#FFF' : '#10B981'} />
                    )}
                    <Text style={[s.nearbyChipText, nearbyMode && { color: '#FFF' }]}>{fr ? 'Proximite' : 'Nearby'}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.filterToggleBtn, showFilters && { backgroundColor: '#0F172A', borderColor: '#0F172A' }]}
                    onPress={() => { Haptics.selectionAsync(); setShowFilters(p => !p); }}
                  >
                    <MaterialIcons name="tune" size={14} color={showFilters ? '#FFF' : '#64748B'} />
                    <Text style={[s.filterToggleText, showFilters && { color: '#FFF' }]}>{fr ? 'Filtres' : 'Filters'}</Text>
                    {(filterRole || filterCity || filterEloMin) ? <View style={s.filterActiveDot} /> : null}
                  </Pressable>
                  </View>
                </View>

                {/* Filter chips */}
                {showFilters ? (
                  <View style={s.filtersContainer}>
                    {/* Role filter */}
                    <View style={s.filterRow}>
                      <Text style={s.filterLabel}>{fr ? 'Poste' : 'Role'}</Text>
                      <View style={s.filterChipsRow}>
                        {(['Tireur', 'Pointeur', 'Milieu'] as const).map(r => (
                          <Pressable
                            key={r}
                            style={[s.filterChip, filterRole === r && s.filterChipActive]}
                            onPress={() => { Haptics.selectionAsync(); setFilterRole(filterRole === r ? '' : r); }}
                          >
                            <Text style={[s.filterChipText, filterRole === r && s.filterChipTextActive]}>{r}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    {/* City filter */}
                    <View style={s.filterRow}>
                      <Text style={s.filterLabel}>{fr ? 'Ville' : 'City'}</Text>
                      <TextInput
                        style={s.filterInput}
                        value={filterCity}
                        onChangeText={setFilterCity}
                        placeholder={fr ? 'Ex: Lyon' : 'Ex: Paris'}
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    {/* ELO range */}
                    <View style={s.filterRow}>
                      <Text style={s.filterLabel}>ELO</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                        <TextInput style={[s.filterInput, { flex: 1 }]} value={filterEloMin} onChangeText={setFilterEloMin} placeholder="Min" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
                        <Text style={{ color: '#94A3B8', alignSelf: 'center' }}>-</Text>
                        <TextInput style={[s.filterInput, { flex: 1 }]} value={filterEloMax} onChangeText={setFilterEloMax} placeholder="Max" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
                      </View>
                    </View>
                    {/* Clear filters */}
                    {(filterRole || filterCity || filterEloMin || filterEloMax) ? (
                      <Pressable style={s.clearFiltersBtn} onPress={() => { setFilterRole(''); setFilterCity(''); setFilterEloMin(''); setFilterEloMax(''); }}>
                        <MaterialIcons name="clear" size={14} color="#EF4444" />
                        <Text style={s.clearFiltersText}>{fr ? 'Effacer les filtres' : 'Clear filters'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Recent Partners Section */}
                {recentPartners.length > 0 && !search.trim() ? (
                  <View style={s.recentPartnersSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <MaterialIcons name="history" size={14} color="#7C3AED" />
                      <Text style={s.recentPartnersTitle}>{fr ? 'Partenaires recents' : 'Recent Partners'}</Text>
                    </View>
                    {[...recentPartners].filter(rp => !alreadyInvitedIds.has(rp.userId)).sort((a, b) => {
                  const aFav = favoritePartnerIds.has(a.userId) ? 1 : 0;
                  const bFav = favoritePartnerIds.has(b.userId) ? 1 : 0;
                  if (aFav !== bFav) return bFav - aFav;
                  return b.count - a.count;
                }).slice(0, 5).map(partner => (
                      <View key={partner.id} style={s.recentPartnerItem}>
                        {partner.avatar ? (
                          <Image source={{ uri: partner.avatar }} style={s.recentPartnerAvatar} contentFit="cover" transition={200} />
                        ) : (
                          <View style={[s.recentPartnerAvatar, { backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#7C3AED' }}>{partner.name.charAt(0)}</Text>
                          </View>
                        )}
                        <Pressable
                          style={s.favoriteBtn}
                          onPress={() => toggleFavoritePartner(partner.userId)}
                          hitSlop={6}
                        >
                          <MaterialIcons
                            name={favoritePartnerIds.has(partner.userId) ? 'star' : 'star-outline'}
                            size={18}
                            color={favoritePartnerIds.has(partner.userId) ? '#F59E0B' : '#CBD5E1'}
                          />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={s.recentPartnerName} numberOfLines={1}>{partner.name}</Text>
                            {favoritePartnerIds.has(partner.userId) ? (
                              <View style={s.favBadge}>
                                <MaterialIcons name="star" size={8} color="#F59E0B" />
                              </View>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <View style={s.recentPartnerCountBadge}>
                              <MaterialIcons name="sports" size={9} color="#7C3AED" />
                              <Text style={s.recentPartnerCountText}>{partner.count} {fr ? 'match' : 'match'}{partner.count > 1 ? (fr ? 's' : 'es') : ''}</Text>
                            </View>
                            {partner.club ? <Text style={{ fontSize: 10, color: '#94A3B8' }}>{partner.club}</Text> : null}
                          </View>
                          {/* Synergy score + Partner match history */}
                          {(() => {
                            const synergy = computeSynergyScore(partner.userId);
                            const ps = getPartnerMatchStats(partner.userId);
                            const isRecommended = recommendedPartnerId === partner.userId;
                            return (
                              <View style={{ gap: 3 }}>
                                {isRecommended ? (
                                  <View style={s.recommendedBadge}>
                                    <MaterialIcons name="auto-awesome" size={10} color="#D97706" />
                                    <Text style={s.recommendedBadgeText}>{fr ? 'Recommande' : 'Recommended'}</Text>
                                  </View>
                                ) : null}
                                <Pressable style={s.synergyRow} onPress={() => setSynergyDetail({ name: partner.name, userId: partner.userId, ...synergy })}>
                                  <View style={[s.synergyBadge, { backgroundColor: synergy.bgColor, borderColor: synergy.color + '30' }]}>
                                    <View style={[s.synergyRing, { borderColor: synergy.color }]}>
                                      <Text style={[s.synergyScoreText, { color: synergy.color }]}>{synergy.score}</Text>
                                    </View>
                                    <Text style={[s.synergyLabel, { color: synergy.color }]}>{synergy.label}</Text>
                                  </View>
                                  <MaterialIcons name="info-outline" size={12} color={synergy.color} style={{ marginLeft: 2 }} />
                                </Pressable>
                                {ps.total > 0 ? (
                                  <View style={s.partnerStatsRow}>
                                    <View style={s.partnerStatChip}>
                                      <MaterialIcons name="emoji-events" size={9} color="#22C55E" />
                                      <Text style={[s.partnerStatText, { color: '#22C55E' }]}>{ps.wins}W</Text>
                                    </View>
                                    <View style={s.partnerStatChip}>
                                      <Text style={[s.partnerStatText, { color: '#EF4444' }]}>{ps.losses}L</Text>
                                    </View>
                                    {ps.lastDate ? (
                                      <Text style={s.partnerStatDate}>{new Date(ps.lastDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })()}
                        </View>
                        {alreadyInvitedIds.has(partner.userId) ? (
                          <View style={s.invitedChip}>
                            <MaterialIcons name="check" size={12} color="#22C55E" />
                          </View>
                        ) : (
                          <Pressable
                            style={s.invitePlayerBtn}
                            onPress={() => handleInvite({ id: partner.id, name: partner.name, userId: partner.userId })}
                            disabled={sending === partner.userId}
                          >
                            {sending === partner.userId ? <ActivityIndicator size="small" color="#FFF" /> : (
                              <><MaterialIcons name="person-add" size={14} color="#FFF" /><Text style={s.invitePlayerBtnText}>{fr ? 'Inviter' : 'Invite'}</Text></>
                            )}
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {[...recentPartners].filter(rp => !alreadyInvitedIds.has(rp.userId)).length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 }}>{fr ? 'Tous deja invites' : 'All already invited'}</Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={s.searchBar}>
                  <MaterialIcons name="search" size={18} color={theme.textMuted} />
                  <TextInput
                    style={s.searchInput}
                    value={search}
                    onChangeText={handleSearch}
                    placeholder={fr ? 'Rechercher un joueur...' : 'Search a player...'}
                    placeholderTextColor={theme.textMuted}
                  />
                  {search.length > 0 ? (
                    <Pressable onPress={() => { setSearch(''); setSearchResults([]); }} hitSlop={8}>
                      <MaterialIcons name="close" size={16} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                {searching ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 12 }} />
                ) : null}

                {searchResults.length > 0 ? (
                  <View style={s.resultsList}>
                    {searchResults.map((player) => {
                      const isInvited = alreadyInvitedIds.has(player.userId);
                      const isSending = sending === player.userId;
                      const pRole = (player as any).role;
                      const pCity = (player as any).city;
                      const pElo = (player as any).eloRating;
                      return (
                        <View key={player.id} style={s.resultItem}>
                          {player.avatar ? (
                            <Image source={{ uri: player.avatar }} style={s.resultAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} />
                          ) : (
                            <View style={[s.resultAvatar, s.resultAvatarFallback]}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.primary }}>{player.name.charAt(0)}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={s.resultName} numberOfLines={1}>{player.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                              {pRole ? <View style={s.resultRoleChip}><Text style={s.resultRoleText}>{pRole}</Text></View> : null}
                              {pElo && pElo > 1000 ? <Text style={s.resultElo}>{pElo}</Text> : null}
                              {(player as any).distance !== null && (player as any).distance !== undefined ? (
                                <View style={s.distanceBadge}>
                                  <MaterialIcons name="place" size={9} color="#10B981" />
                                  <Text style={s.distanceText}>{(player as any).distance < 1 ? '<1' : (player as any).distance} km</Text>
                                </View>
                              ) : null}
                              {pCity ? <Text style={s.resultCity} numberOfLines={1}>{pCity}</Text> : null}
                              {!pRole && !pElo && player.club ? <Text style={s.resultClub} numberOfLines={1}>{player.club}</Text> : null}
                            </View>
                            {/* Synergy score + Match history */}
                            {(() => {
                              const synergy = computeSynergyScore(player.userId, (player as any).role, (player as any).eloRating);
                              const ps = getPartnerMatchStats(player.userId);
                              return (
                                <View style={{ gap: 3 }}>
                                  <Pressable style={s.synergyRow} onPress={() => setSynergyDetail({ name: player.name, userId: player.userId, ...synergy })}>
                                    <View style={[s.synergyBadge, { backgroundColor: synergy.bgColor, borderColor: synergy.color + '30' }]}>
                                      <View style={[s.synergyRing, { borderColor: synergy.color }]}>
                                        <Text style={[s.synergyScoreText, { color: synergy.color }]}>{synergy.score}</Text>
                                      </View>
                                      <Text style={[s.synergyLabel, { color: synergy.color }]}>{synergy.label}</Text>
                                    </View>
                                    <MaterialIcons name="info-outline" size={12} color={synergy.color} style={{ marginLeft: 2 }} />
                                  </Pressable>
                                  {ps.total > 0 ? (
                                    <View style={s.partnerStatsRow}>
                                      <View style={s.partnerStatChip}>
                                        <MaterialIcons name="emoji-events" size={9} color="#22C55E" />
                                        <Text style={[s.partnerStatText, { color: '#22C55E' }]}>{ps.wins}W</Text>
                                      </View>
                                      <View style={s.partnerStatChip}>
                                        <Text style={[s.partnerStatText, { color: '#EF4444' }]}>{ps.losses}L</Text>
                                      </View>
                                      {ps.lastDate ? (
                                        <Text style={s.partnerStatDate}>{new Date(ps.lastDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                                      ) : null}
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })()}
                          </View>
                          {/* Favorite star in search results */}
                          <Pressable
                            style={s.favoriteBtn}
                            onPress={() => toggleFavoritePartner(player.userId)}
                            hitSlop={4}
                          >
                            <MaterialIcons
                              name={favoritePartnerIds.has(player.userId) ? 'star' : 'star-outline'}
                              size={16}
                              color={favoritePartnerIds.has(player.userId) ? '#F59E0B' : '#CBD5E1'}
                            />
                          </Pressable>
                          {isInvited ? (
                            <View style={s.invitedChip}>
                              <MaterialIcons name="check" size={12} color="#22C55E" />
                              <Text style={s.invitedChipText}>{fr ? 'Invite' : 'Invited'}</Text>
                            </View>
                          ) : (
                            <Pressable
                              style={[s.invitePlayerBtn, isSending && { opacity: 0.6 }]}
                              onPress={() => handleInvite(player)}
                              disabled={isSending}
                            >
                              {isSending ? <ActivityIndicator size="small" color="#FFF" /> : (
                                <><MaterialIcons name="person-add" size={14} color="#FFF" /><Text style={s.invitePlayerBtnText}>{fr ? 'Inviter' : 'Invite'}</Text></>
                              )}
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : search.trim().length >= 2 && !searching ? (
                  <Text style={s.noResults}>{fr ? 'Aucun joueur trouve' : 'No players found'}</Text>
                ) : null}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {/* Team Chat button */}
                {team ? (
                  <Pressable
                    style={s.chatBtn}
                    onPress={() => { setShowModal(false); router.push(`/team-chat/${team.id}` as any); }}
                  >
                    <MaterialIcons name="chat" size={18} color="#FFF" />
                    <Text style={s.chatBtnText}>{fr ? 'Chat equipe' : 'Team Chat'}</Text>
                    {chatMsgCount > 0 ? (
                      <View style={s.chatBadge}><Text style={s.chatBadgeText}>{chatMsgCount}</Text></View>
                    ) : null}
                  </Pressable>
                ) : null}
                <Pressable
                  style={s.viewTournamentBtn}
                  onPress={() => { setShowModal(false); router.push(`/tournament/${selectedTournament?.id}` as any); }}
                >
                  <MaterialIcons name="emoji-events" size={18} color="#FFF" />
                  <Text style={s.viewTournamentBtnText}>{fr ? 'Voir le tournoi' : 'View Tournament'}</Text>
                </Pressable>
                {/* Dissolve button (captain only) */}
                {team && user?.id === team.creatorUserId ? (
                  <Pressable
                    style={s.dissolveBtn}
                    onPress={handleDissolve}
                    disabled={dissolving}
                  >
                    {dissolving ? <ActivityIndicator size="small" color="#EF4444" /> : (
                      <><MaterialIcons name="group-off" size={16} color="#EF4444" /><Text style={s.dissolveBtnText}>{fr ? 'Dissoudre l\'equipe' : 'Dissolve team'}</Text></>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Synergy Detail Tooltip Modal */}
      <Modal visible={synergyDetail !== null} animationType="fade" transparent onRequestClose={() => setSynergyDetail(null)}>
        <Pressable style={s.synergyOverlay} onPress={() => setSynergyDetail(null)}>
          <Pressable style={s.synergyTooltip} onPress={() => {}}>
            {synergyDetail ? (
              <>
                <View style={s.synergyTooltipHeader}>
                  <View style={[s.synergyTooltipScoreRing, { borderColor: synergyDetail.color }]}>
                    <Text style={[s.synergyTooltipScoreNum, { color: synergyDetail.color }]}>{synergyDetail.score}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.synergyTooltipName}>{fr ? 'Synergie avec' : 'Synergy with'} {synergyDetail.name}</Text>
                    <Text style={[s.synergyTooltipLabel, { color: synergyDetail.color }]}>{synergyDetail.label}</Text>
                  </View>
                  <Pressable onPress={() => setSynergyDetail(null)} hitSlop={8}>
                    <MaterialIcons name="close" size={20} color="#94A3B8" />
                  </Pressable>
                </View>
                <View style={s.synergyBreakdown}>
                  {[
                    { label: fr ? 'Taux de victoire' : 'Win Rate', value: synergyDetail.breakdown.winRate, max: 30, icon: 'emoji-events', color: '#22C55E' },
                    { label: fr ? 'Frequence matchs' : 'Match Frequency', value: synergyDetail.breakdown.frequency, max: 25, icon: 'sports', color: '#3B82F6' },
                    { label: fr ? 'Compatibilite ELO' : 'ELO Compatibility', value: synergyDetail.breakdown.elo, max: 25, icon: 'leaderboard', color: '#F59E0B' },
                    { label: fr ? 'Complement. role' : 'Role Complement.', value: synergyDetail.breakdown.role, max: 20, icon: 'swap-horiz', color: '#7C3AED' },
                  ].map((item, i) => (
                    <View key={i} style={s.synergyBreakdownRow}>
                      <View style={[s.synergyBreakdownIcon, { backgroundColor: item.color + '12' }]}>
                        <MaterialIcons name={item.icon as any} size={14} color={item.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={s.synergyBreakdownLabel}>{item.label}</Text>
                          <Text style={[s.synergyBreakdownValue, { color: item.color }]}>{item.value}/{item.max}</Text>
                        </View>
                        <View style={s.synergyBarTrack}>
                          <View style={[s.synergyBarFill, { width: `${(item.value / item.max) * 100}%`, backgroundColor: item.color }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
                {/* Synergy History Sparkline */}
                {(() => {
                  const history = getSynergyHistory(synergyDetail.userId);
                  if (history.length < 2) return null;
                  const maxVal = Math.max(...history, 1);
                  const chartW = 260;
                  const chartH = 48;
                  return (
                    <View style={s.sparklineSection}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <MaterialIcons name="show-chart" size={14} color="#3B82F6" />
                        <Text style={s.sparklineTitle}>{fr ? 'Evolution taux de victoire' : 'Win Rate Evolution'}</Text>
                        <Text style={s.sparklineSub}>{fr ? `(${history.length} matchs)` : `(${history.length} matches)`}</Text>
                      </View>
                      <View style={{ width: chartW, height: chartH + 20, alignSelf: 'center' }}>
                        {/* Grid lines */}
                        {[0, 50, 100].map(pct => (
                          <View key={pct} style={{ position: 'absolute', left: 20, right: 0, bottom: (pct / 100) * chartH + 8, height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0' }} />
                        ))}
                        <Text style={{ position: 'absolute', left: 0, bottom: 4, fontSize: 8, color: '#94A3B8', fontWeight: '600' }}>0</Text>
                        <Text style={{ position: 'absolute', left: 0, bottom: chartH / 2 + 4, fontSize: 8, color: '#94A3B8', fontWeight: '600' }}>50</Text>
                        <Text style={{ position: 'absolute', left: 0, bottom: chartH + 2, fontSize: 8, color: '#94A3B8', fontWeight: '600' }}>100</Text>
                        {/* Dots + connecting lines */}
                        {history.map((val, i) => {
                          const xStep = (chartW - 28) / (history.length - 1);
                          const x = 20 + i * xStep;
                          const y = chartH + 8 - (val / maxVal) * chartH;
                          const dotColor = val >= 60 ? '#22C55E' : val >= 40 ? '#F59E0B' : '#EF4444';
                          return (
                            <React.Fragment key={i}>
                              {i > 0 ? (
                                <View style={{ position: 'absolute', left: 20 + (i - 1) * xStep, top: chartH + 8 - (history[i - 1] / maxVal) * chartH, width: xStep, height: 2, backgroundColor: '#3B82F620', transform: [{ rotate: `${Math.atan2((history[i - 1] - val) / maxVal * chartH, xStep) * 180 / Math.PI}deg` }], transformOrigin: 'left center' }} />
                              ) : null}
                              <View style={{ position: 'absolute', left: x - 4, top: y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, borderWidth: 2, borderColor: '#FFF', zIndex: 2 }} />
                              {i === history.length - 1 ? (
                                <Text style={{ position: 'absolute', left: x - 10, top: y - 16, fontSize: 9, fontWeight: '800' as any, color: dotColor }}>{val}%</Text>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </View>
                      {/* Trend indicator */}
                      {history.length >= 3 ? (() => {
                        const diff = history[history.length - 1] - history[0];
                        const trendIcon = diff > 5 ? 'trending-up' : diff < -5 ? 'trending-down' : 'trending-flat';
                        const trendColor = diff > 5 ? '#22C55E' : diff < -5 ? '#EF4444' : '#94A3B8';
                        const trendLabel = diff > 0 ? `+${diff}%` : `${diff}%`;
                        return (
                          <View style={[s.sparklineTrend, { backgroundColor: trendColor + '10', borderColor: trendColor + '25' }]}>
                            <MaterialIcons name={trendIcon as any} size={14} color={trendColor} />
                            <Text style={[s.sparklineTrendText, { color: trendColor }]}>{trendLabel} {fr ? 'sur la periode' : 'over period'}</Text>
                          </View>
                        );
                      })() : null}
                    </View>
                  );
                })()}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* My Teams Modal */}
      <Modal visible={showTeamsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTeamsModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalClose} onPress={() => setShowTeamsModal(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.modalTitle}>{fr ? 'Mes equipes' : 'My Teams'}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {teamsLoading ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
            ) : myTeamsList.length === 0 ? (
              <View style={s.teamsEmptyState}>
                <View style={s.teamsEmptyIcon}>
                  <MaterialIcons name="groups" size={40} color="#22C55E" />
                </View>
                <Text style={s.teamsEmptyTitle}>{fr ? 'Pas encore d\'equipe' : 'No teams yet'}</Text>
                <Text style={s.teamsEmptyDesc}>
                  {fr ? 'Inscrivez-vous a un tournoi et invitez des coequipiers.' : 'Register for a tournament and invite teammates.'}
                </Text>
              </View>
            ) : (
              myTeamsList.map((tm) => {
                const tInfo = teamTournamentNames.get(tm.tournamentId);
                const isComplete = tm.status === 'complete';
                const isCaptain = tm.creatorUserId === user?.id;
                const tSize = getTeamSize(tm.format);
                const tDate = tInfo?.date ? new Date(tInfo.date) : null;
                const colors = ['#22C55E', '#3B82F6', '#F59E0B', '#7C3AED'];
                return (
                  <Pressable
                    key={tm.id}
                    style={[s.teamsCard, isComplete && { borderColor: '#22C55E25', backgroundColor: '#FAFFFE' }]}
                    onPress={() => { setShowTeamsModal(false); router.push(`/tournament/${tm.tournamentId}` as any); }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <View style={[s.teamsStatusIcon, { backgroundColor: isComplete ? '#22C55E15' : '#F59E0B15' }]}>
                        <MaterialIcons name={isComplete ? 'check-circle' : 'groups'} size={20} color={isComplete ? '#22C55E' : '#F59E0B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.teamsCardName} numberOfLines={1}>{tInfo?.name || tm.tournamentId.slice(0, 8)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <View style={[s.teamsFormatChip, { backgroundColor: isComplete ? '#22C55E12' : '#F59E0B12' }]}>
                            <Text style={[s.teamsFormatText, { color: isComplete ? '#22C55E' : '#F59E0B' }]}>{tm.format}</Text>
                          </View>
                          <Text style={s.teamsStatusLabel}>
                            {isComplete ? (fr ? 'Complete' : 'Complete') : `${tm.memberUserIds.length}/${tSize}`}
                          </Text>
                          {isCaptain ? (
                            <View style={s.teamsCaptainBadge}>
                              <MaterialIcons name="star" size={9} color="#2563EB" />
                              <Text style={s.teamsCaptainText}>{fr ? 'Capitaine' : 'Captain'}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {tDate ? (
                        <View style={s.teamsDateCol}>
                          <Text style={s.teamsDateDay}>{tDate.getDate()}</Text>
                          <Text style={s.teamsDateMonth}>{tDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {tm.memberNames.map((name, i) => (
                        <View key={i} style={[s.teamsMemberChip, { backgroundColor: colors[i % 4] + '12' }]}>
                          <View style={[s.teamsMemberDot, { backgroundColor: colors[i % 4] }]}>
                            <Text style={s.teamsMemberInitial}>{name.charAt(0)}</Text>
                          </View>
                          <Text style={[s.teamsMemberName, { color: colors[i % 4] }]} numberOfLines={1}>{name}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#22C55E20', ...Platform.select({ ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  emptyStateWrap: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 8 },
  emptyStateIconRing: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#22C55E12', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#22C55E25', marginBottom: 14 },
  emptyStateTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
  emptyStateDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: 8 },
  emptyStateCTA: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#22C55E', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, ...Platform.select({ ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }, android: { elevation: 3 }, default: {} }) },
  emptyStateCTAText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  emptyStateHints: { marginTop: 18, gap: 8, alignSelf: 'stretch', paddingHorizontal: 16 },
  emptyStateHintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyStateHintText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#22C55E15', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  tournamentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  tournamentDate: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  tournamentDateDay: { fontSize: 17, fontWeight: '800', color: '#2563EB', lineHeight: 19 },
  tournamentDateMonth: { fontSize: 8, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5 },
  tournamentName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  tournamentCity: { fontSize: 11, color: '#64748B' },
  tournamentDistBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#10B98112', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  tournamentDistText: { fontSize: 9, fontWeight: '700', color: '#10B981' },
  listFilterSection: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listFilterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  listFilterTitle: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  listFilterChips: { gap: 8, paddingRight: 4 },
  listFilterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: 'transparent' },
  listFilterChipActive: { borderColor: '#22C55E', backgroundColor: '#22C55E10' },
  listFilterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  listFilterChipTextActive: { color: '#16A34A' },
  listFilterHint: { fontSize: 11, color: '#D97706', marginTop: 6 },
  listFilterEmpty: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  listFilterEmptyText: { fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center' },
  listFilterResetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#22C55E12', borderWidth: 1, borderColor: '#22C55E25' },
  listFilterResetText: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  tournamentScrollList: { marginBottom: 4 },
  tournamentScrollHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4 },
  formatChip: { backgroundColor: '#22C55E15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  formatChipText: { fontSize: 10, fontWeight: '700', color: '#22C55E' },
  inviteBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#22C55E12', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#22C55E25' },
  deadlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  deadlineText: { fontSize: 9, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modalContent: { padding: 16, paddingBottom: 40 },

  // Team status
  teamStatusCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 20 },
  deadlineWarning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#EF444420' },
  deadlineWarningText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#991B1B', lineHeight: 17 },
  teamStatusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  teamStatusTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  membersRow: { gap: 10, marginBottom: 14 },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },
  memberBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  memberBadgeText: { fontSize: 10, fontWeight: '700' },
  progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Search
  searchSection: { marginTop: 4 },
  searchLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  resultsList: { marginTop: 12, gap: 6 },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  resultAvatar: { width: 40, height: 40, borderRadius: 12 },
  resultAvatarFallback: { backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  resultName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  resultClub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  invitedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  invitedChipText: { fontSize: 11, fontWeight: '700', color: '#22C55E' },
  invitePlayerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0F172A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  invitePlayerBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  noResults: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 20 },
  viewTournamentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#22C55E', paddingVertical: 16, borderRadius: 14, marginTop: 12 },
  viewTournamentBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  dissolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  dissolveBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  removeMemberBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#0F172A', paddingVertical: 16, borderRadius: 14, marginTop: 12 },
  chatBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  chatBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chatBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  // Filter styles
  filterToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterToggleText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  filtersContainer: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', width: 50 },
  filterChipsRow: { flexDirection: 'row', gap: 6, flex: 1 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  filterChipTextActive: { color: '#FFF' },
  filterInput: { backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', flex: 1 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  clearFiltersText: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  // Favorite partner button
  favoriteBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as any, justifyContent: 'center' as any },
  favBadge: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#F59E0B15', alignItems: 'center' as any, justifyContent: 'center' as any },
  // Search result enhanced
  resultRoleChip: { backgroundColor: '#7C3AED12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  resultRoleText: { fontSize: 9, fontWeight: '700', color: '#7C3AED' },
  resultElo: { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  resultCity: { fontSize: 10, color: '#94A3B8' },
  distanceBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#10B98112', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  distanceText: { fontSize: 9, fontWeight: '700', color: '#10B981' },
  // Partner match stats
  partnerStatsRow: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 4, marginTop: 3 },
  partnerStatChip: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 2, backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  partnerStatText: { fontSize: 9, fontWeight: '700' as any },
  partnerStatWinRate: { fontSize: 9, fontWeight: '800' as any, color: '#0F172A' },
  winRateBadge: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  winRateBadgeText: { fontSize: 10, fontWeight: '800' as any },
  partnerStatDate: { fontSize: 9, color: '#94A3B8', fontWeight: '500' as any },
  // Synergy score
  synergyRow: { flexDirection: 'row' as any, alignItems: 'center' as any },
  synergyBadge: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  synergyRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center' as any, justifyContent: 'center' as any, backgroundColor: '#FFF' },
  synergyScoreText: { fontSize: 8, fontWeight: '900' as any },
  synergyLabel: { fontSize: 9, fontWeight: '700' as any },
  // Recent partners
  recentPartnersSection: { backgroundColor: '#7C3AED08', borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#7C3AED15' },
  recentPartnersTitle: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  recentPartnerItem: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#7C3AED10' },
  recentPartnerAvatar: { width: 36, height: 36, borderRadius: 10 },
  recentPartnerName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  recentPartnerCountBadge: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 3, backgroundColor: '#7C3AED10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recentPartnerCountText: { fontSize: 9, fontWeight: '700', color: '#7C3AED' },
  // Teams history button
  teamsHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7C3AED12', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED20' },
  teamsHistoryBtnText: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  // Deadline toggle
  deadlineToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  deadlineToggleLabel: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  deadlineToggleSub: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  // My Teams modal
  teamsEmptyState: { alignItems: 'center', paddingVertical: 48 },
  teamsEmptyIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#22C55E12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  teamsEmptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  teamsEmptyDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, paddingHorizontal: 24 },
  teamsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  teamsStatusIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  teamsCardName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  teamsFormatChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  teamsFormatText: { fontSize: 10, fontWeight: '700' },
  teamsStatusLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  teamsCaptainBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#2563EB12', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  teamsCaptainText: { fontSize: 9, fontWeight: '700', color: '#2563EB' },
  teamsDateCol: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  teamsDateDay: { fontSize: 15, fontWeight: '800', color: '#2563EB', lineHeight: 17 },
  teamsDateMonth: { fontSize: 7, fontWeight: '700', color: '#2563EB', letterSpacing: 0.3 },
  teamsMemberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  teamsMemberDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  teamsMemberInitial: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  teamsMemberName: { fontSize: 11, fontWeight: '600' },
  // Synergy tooltip
  synergyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' as any, alignItems: 'center' as any, padding: 24 },
  synergyTooltip: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16 }, android: { elevation: 8 }, default: {} }) },
  synergyTooltipHeader: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 12, marginBottom: 18 },
  synergyTooltipScoreRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center' as any, justifyContent: 'center' as any, backgroundColor: '#FFF' },
  synergyTooltipScoreNum: { fontSize: 18, fontWeight: '900' as any },
  synergyTooltipName: { fontSize: 14, fontWeight: '600' as any, color: '#0F172A' },
  synergyTooltipLabel: { fontSize: 12, fontWeight: '700' as any, marginTop: 2 },
  synergyBreakdown: { gap: 14 },
  synergyBreakdownRow: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 10 },
  synergyBreakdownIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center' as any, justifyContent: 'center' as any },
  synergyBreakdownLabel: { fontSize: 12, fontWeight: '600' as any, color: '#64748B' },
  synergyBreakdownValue: { fontSize: 12, fontWeight: '800' as any },
  synergyBarTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' as any },
  synergyBarFill: { height: '100%' as any, borderRadius: 3 },
  // Nearby chip
  nearbyChip: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#10B98112', borderWidth: 1, borderColor: '#10B98130' },
  nearbyChipText: { fontSize: 11, fontWeight: '700' as any, color: '#10B981' },
  // Sparkline
  sparklineSection: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  sparklineTitle: { fontSize: 12, fontWeight: '700' as any, color: '#0F172A' },
  sparklineSub: { fontSize: 10, color: '#94A3B8', fontWeight: '500' as any },
  sparklineTrend: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 6, alignSelf: 'center' as any, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  sparklineTrendText: { fontSize: 11, fontWeight: '700' as any },
  // Recommended partner badge
  recommendedBadge: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 4, alignSelf: 'flex-start' as any, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B30', marginBottom: 2 },
  recommendedBadgeText: { fontSize: 9, fontWeight: '800' as any, color: '#D97706', textTransform: 'uppercase' as any, letterSpacing: 0.3 },
});
