import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from '@/services/haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

import theme, { blurhash } from '@/constants/theme';
import AdBanner from '@/components/ui/AdBanner';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import ModificationLogsSection from '@/components/ui/ModificationLogsSection';
import SharedBadge from '@/components/ui/SharedBadge';
import ShareModal from '@/components/ui/ShareModal';
import MergePickerModal from '@/components/ui/MergePickerModal';
import { Image } from 'expo-image';
import { useAlert } from '@/template';
import { getMyActiveMeetups, inviteSingleUserToMeetup, Meetup as MeetupType } from '@/services/meetupService';
import { submitReport, REPORT_REASONS, ReportReason } from '@/services/reportService';
import { countTransferableItems, searchRegisteredUsers, sendTransferRequest } from '@/services/playerTransferService';
import { isFollowingPlayer, toggleFollowPlayer, getFollowerCount, getFollowingCount } from '@/services/activityFeedService';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import SponsoredItemBanner from '@/components/ui/SponsoredItemBanner';

// Gold pulse dot for Gold partner badges
const GoldPulseDot = React.memo(({ color }: { color: string }) => {
  const opacity = useSharedValue(0.4);
  React.useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginLeft: 3 }, style]} />;
});

import { computeQuickTrustScore, getTrustScoreColor, getTrustScoreIcon, getTrustLevelLabel, getTrustBadgeDescription, fetchTrustScore, TrustScoreData } from '@/services/trustScoreService';
import { LEADERBOARD_MIN_MATCHES } from '@/services/leaderboardService';
import { fetchEloHistory, getEloRank, getEloColor, formatEloDelta, EloHistoryEntry, ELO_INITIAL, fetchPlayerRoleElos, calculateInactivityDecay } from '@/services/eloService';
import { fetchWeeklyRankHistory } from '@/services/weeklyLeaderboardService';
import Svg, { Polygon, Line, Circle as SvgCircle, Text as SvgText, G, Rect } from 'react-native-svg';
import { Modal, Switch, TextInput } from 'react-native';
import * as Linking from 'expo-linking';
import EloSection from '@/components/feature/player/EloSection';
import EloSparkline from '@/components/feature/player/EloSparkline';
import GamePreferencesSection from '@/components/feature/player/GamePreferencesSection';
import GlobalRankBadge from '@/components/feature/player/GlobalRankBadge';
import { computeHeadToHeadRoleAnalysis, computeSeasonalRoleEvolution, generateRoleEvolutionPdfHtml, getRoleColor as getRoleColorService, getRoleIcon as getRoleIconService } from '@/services/roleAnalysisService';
import { fetchPlayerGeoRank, PlayerGeoRank } from '@/services/geoLeaderboardService';
import { getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';

// ============================================
// Mini Radar Chart for preferences
// ============================================
function MiniRadar({ data, labels, size }: {
  data: { label: string; value: number; color: string }[];
  labels: string[];
  size: number;
}) {
  if (data.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const R = (size - 50) / 2;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const levels = [33, 66, 100];

  const getPoint = (angle: number, value: number) => ({
    x: cx + (value / 100) * R * Math.sin(angle),
    y: cy - (value / 100) * R * Math.cos(angle),
  });

  const pts = data.map((d, i) => getPoint(i * angleStep, d.value));
  const polygon = pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={size} height={size}>
      {levels.map(level => {
        const lpts = Array.from({ length: n }, (_, i) => {
          const p = getPoint(i * angleStep, level);
          return `${p.x},${p.y}`;
        }).join(' ');
        return <Polygon key={level} points={lpts} fill="none" stroke={theme.border} strokeWidth={0.8} opacity={0.4} />;
      })}
      {data.map((_, i) => {
        const p = getPoint(i * angleStep, 100);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={theme.border} strokeWidth={0.6} opacity={0.4} />;
      })}
      <Polygon points={polygon} fill={theme.primary + '18'} stroke={theme.primary} strokeWidth={2} opacity={0.9} />
      {pts.map((p, i) => (
        <SvgCircle key={i} cx={p.x} cy={p.y} r={4} fill={data[i].color} stroke="#FFF" strokeWidth={2} />
      ))}
      {data.map((d, i) => {
        const p = getPoint(i * angleStep, 120);
        return (
          <G key={`l-${i}`}>
            <SvgText x={p.x} y={p.y + 4} fontSize="10" fill={theme.textSecondary} textAnchor="middle" fontWeight="600">
              {labels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'Tireur': return '#F97316';
    case 'Pointeur': return '#3B82F6';
    case 'Milieu': return '#8B5CF6';
    default: return theme.textSecondary;
  }
}

function getRoleIcon(role: string): any {
  switch (role) {
    case 'Tireur': return 'gps-fixed';
    case 'Pointeur': return 'adjust';
    case 'Milieu': return 'swap-horiz';
    default: return 'person';
  }
}

export default function PlayerDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { selfPlayer, matches, boulesSets, players, challenges: allChallenges, isPremium, loading: appLoading } = useAppData();
  const { getPlayerById, getMatchesByPlayer, getClubById, getTerrainById, deletePlayer, updatePlayer, getSharedPermission } = useAppActions();

  const player = getPlayerById(id!);
  const playerMatches = getMatchesByPlayer(id!);
  const recentMatches = playerMatches.slice(0, 5);
  const { clubs, terrains: allTerrains } = useAppData();
  const clubEntity = player?.clubId ? getClubById(player.clubId) : null;
  const terrainEntity = player?.terrainId ? getTerrainById(player.terrainId) : null;
  const clubDisplayName = clubEntity?.name || player?.club || null;
  const terrainDisplayName = terrainEntity?.name || player?.terrainName || null;
  const isSelf = selfPlayer && player?.id === selfPlayer.id;
  const sharedPermission = getSharedPermission(id!);
  const isSharedItem = sharedPermission !== null;
  const isReadOnly = sharedPermission === 'read';

  const [showShareModal, setShowShareModal] = React.useState(false);
  const [showMergePicker, setShowMergePicker] = React.useState(false);
  const [showMeetupPicker, setShowMeetupPicker] = React.useState(false);
  const [activeMeetups, setActiveMeetups] = React.useState<MeetupType[]>([]);
  const [loadingMeetups, setLoadingMeetups] = React.useState(false);
  const [invitingToMeetup, setInvitingToMeetup] = React.useState<string | null>(null);

  const [showReportModal, setShowReportModal] = React.useState(false);
  const [showTransferModal, setShowTransferModal] = React.useState(false);
  const [transferSearch, setTransferSearch] = React.useState('');
  const [transferResults, setTransferResults] = React.useState<Array<{ id: string; username: string; email: string; avatar?: string }>>([]);
  const [transferSearching, setTransferSearching] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState<{ id: string; username: string; email: string } | null>(null);
  const [transferMessage, setTransferMessage] = React.useState('');
  const [transferCounts, setTransferCounts] = React.useState<{ matchCount: number; challengeCount: number }>({ matchCount: 0, challengeCount: 0 });
  const [transferSending, setTransferSending] = React.useState(false);
  const [transferCountsLoading, setTransferCountsLoading] = React.useState(false);
  const transferSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [togglingFollow, setTogglingFollow] = React.useState(false);
  const [followerCount, setFollowerCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [ambassadorData, setAmbassadorData] = React.useState<Ambassador | null>(null);
  const [reportReason, setReportReason] = React.useState<ReportReason | ''>('');
  const [reportDetails, setReportDetails] = React.useState('');
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const isPublicItem = player?.isPublic === true;
  const playerUserId = player?.userId;
  const isRealUser = isPublicItem && playerUserId && playerUserId !== user?.id;
  // Allow editing own players (self or locally created) but not other real users' profiles
  const isOtherRealUser = !!(isPublicItem && playerUserId && playerUserId !== user?.id);
  const canEdit = !isReadOnly && !isOtherRealUser && (isSelf || (playerUserId === user?.id));
  // A player linked to a real registered user account (self or other user's public profile)
  // Locally created players have player.id !== player.userId (different UUIDs), so they're excluded
  const isLinkedToRealUser = !!(isSelf || (playerUserId && player?.id === playerUserId));

  const [trustScore, setTrustScore] = React.useState<TrustScoreData | null>(null);
  const [trustScoreLoading, setTrustScoreLoading] = React.useState(false);
  React.useEffect(() => {
    if (!player) { setTrustScore(null); return; }
    const loadScore = async () => {
      setTrustScoreLoading(true);
      const dbScore = await fetchTrustScore(player.id);
      if (dbScore) {
        setTrustScore(dbScore);
      } else {
        setTrustScore(computeQuickTrustScore({ stats: player.stats, createdAt: player.createdAt }));
      }
      setTrustScoreLoading(false);
    };
    loadScore();
  }, [player?.id, player?.stats?.matchesPlayed]);
  const isSelfPlayer = selfPlayer && player?.id === selfPlayer.id;
  const { showAlert } = useAlert();

  // Check follow status + load follower/following counts
  React.useEffect(() => {
    if (!user?.id || !id || isSelf) return;
    isFollowingPlayer(user.id, id).then(setIsFollowing).catch(() => {});
  }, [user?.id, id, isSelf]);

  React.useEffect(() => {
    if (!id) return;
    getFollowerCount(id).then(setFollowerCount).catch(() => {});
    if (playerUserId) {
      getFollowingCount(playerUserId).then(setFollowingCount).catch(() => {});
    }
  }, [id, playerUserId]);

  const handleToggleFollow = React.useCallback(async () => {
    if (!user?.id || !id || togglingFollow) return;
    setTogglingFollow(true);
    Haptics.selectionAsync();
    const { following, error } = await toggleFollowPlayer(user.id, id);
    if (!error) {
      setIsFollowing(following);
      setFollowerCount(prev => following ? prev + 1 : Math.max(0, prev - 1));
    }
    setTogglingFollow(false);
  }, [user?.id, id, togglingFollow]);

  React.useEffect(() => {
    if (!player) return;
    const playerUserId2 = (player as any)?.userId;
    // Only fetch ambassador data for players linked to a real user account
    if (!playerUserId2) { setAmbassadorData(null); return; }
    fetchAmbassadors().then(({ ambassadors }) => {
      // Only match by explicit playerId link — not by userId (which would flag all players owned by a partner)
      const amb = ambassadors.find(a => a.playerId === id);
      setAmbassadorData(amb || null);
    });
  }, [id, player]);
  const { updatePlayer: updatePlayerFn } = useAppActions();
  const [refreshing, setRefreshing] = React.useState(false);
  const [exportingRoleEvo, setExportingRoleEvo] = React.useState(false);
  const [screenDims, setScreenDims] = React.useState(() => Dimensions.get('window'));
  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenDims(window));
    return () => sub?.remove();
  }, []);
  const screenWidth = Math.max(1, screenDims.width);
  const isTablet = screenWidth >= 600;

  const [eloHistory, setEloHistory] = React.useState<EloHistoryEntry[]>([]);
  const [eloLoading, setEloLoading] = React.useState(false);
  const [roleElos, setRoleElos] = React.useState<{ tireur: number; pointeur: number; milieu: number } | null>(null);
  const [inactivityDecay, setInactivityDecay] = React.useState<{ decayAmount: number; daysSince: number } | null>(null);
  const [rankHistory, setRankHistory] = React.useState<Array<{ weekStart: string; rank: number; eloRating: number; matchesPlayed: number; winRate: number }>>([]);
  const [rankHistoryLoading, setRankHistoryLoading] = React.useState(false);
  const [geoRank, setGeoRank] = React.useState<PlayerGeoRank | null>(null);
  const [geoRankLoading, setGeoRankLoading] = React.useState(false);
  React.useEffect(() => {
    if (!player) return;
    setEloLoading(true);
    fetchEloHistory(player.id, 30).then(({ history }) => {
      setEloHistory(history);
      setEloLoading(false);
    }).catch(() => setEloLoading(false));
    fetchPlayerRoleElos(player.id).then(setRoleElos).catch(() => {});
    if (player.lastMatchDate) {
      const lastMatch = new Date(player.lastMatchDate);
      const daysSince = Math.floor((new Date().getTime() - lastMatch.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 30) {
        const { decayAmount } = calculateInactivityDecay(player.eloRating || ELO_INITIAL, player.lastMatchDate);
        if (decayAmount > 0) setInactivityDecay({ decayAmount, daysSince });
      }
    }
    const playerUserId3 = (player as any)?.userId;
    if (playerUserId3) {
      setRankHistoryLoading(true);
      fetchWeeklyRankHistory(playerUserId3, 12).then(({ history }) => {
        setRankHistory(history);
        setRankHistoryLoading(false);
      }).catch(() => setRankHistoryLoading(false));
    }
    // Fetch geo ranking
    if (player.isPublic) {
      setGeoRankLoading(true);
      fetchPlayerGeoRank(player.id).then(({ geoRank: gr }) => {
        setGeoRank(gr);
        setGeoRankLoading(false);
      }).catch(() => setGeoRankLoading(false));
    }
  }, [player?.id]);

  const eloChartData = React.useMemo(() => {
    if (eloHistory.length === 0) return null;
    const sorted = [...eloHistory].reverse();
    const points = sorted.map(h => h.eloAfter);
    const min = Math.min(...points, ELO_INITIAL) - 30;
    const max = Math.max(...points, ELO_INITIAL) + 30;
    const currentElo = sorted[sorted.length - 1]?.eloAfter || player?.eloRating || ELO_INITIAL;
    const weekAgoElo = sorted.length > 7 ? sorted[sorted.length - 8]?.eloAfter : sorted[0]?.eloAfter || ELO_INITIAL;
    const weekDelta = currentElo - weekAgoElo;
    return { points, min, max, currentElo, weekDelta, entries: sorted };
  }, [eloHistory, player?.eloRating]);

  const currentEloRank = React.useMemo(() => {
    const elo = player?.eloRating || ELO_INITIAL;
    return getEloRank(elo);
  }, [player?.eloRating]);

  const { refreshData } = useAppActions();

  // Use InteractionManager-based deferred render instead of arbitrary timeout
  const belowFoldReady = (() => {
    const { useDeferredRender } = require('@/hooks/useDeferredRender');
    return useDeferredRender(0);
  })();

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const handleOpenSharePreview = React.useCallback(() => {
    if (!player) return;
    Haptics.selectionAsync();
    setShowShareModal(true);
  }, [player]);

  const roleAnalysis = React.useMemo(() => {
    const roleCounts: Record<string, number> = { 'Pointeur': 0, 'Milieu': 0, 'Tireur': 0 };
    const allMatches = matches.filter(m => m.teamA.players.includes(id!) || m.teamB.players.includes(id!));
    allMatches.forEach(match => {
      if (match.teamA.players.includes(id!) && match.teamA.playerRoles) {
        const pr = match.teamA.playerRoles.find(r => r.playerId === id!);
        if (pr && roleCounts[pr.role] !== undefined) roleCounts[pr.role]++;
      }
      if (match.teamB.players.includes(id!) && match.teamB.playerRoles) {
        const pr = match.teamB.playerRoles.find(r => r.playerId === id!);
        if (pr && roleCounts[pr.role] !== undefined) roleCounts[pr.role]++;
      }
    });
    const totalWithRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);
    const preferredRole = totalWithRoles > 0 ? Object.entries(roleCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0] : player?.role || 'Milieu';
    return { roleCounts, totalWithRoles, preferredRole };
  }, [matches, id, player?.role]);

  const terrainAnalysis = React.useMemo(() => {
    const terrainCounts: Record<string, number> = {};
    const allMatches = matches.filter(m => m.teamA.players.includes(id!) || m.teamB.players.includes(id!));
    allMatches.forEach(m => { if (m.terrainType) terrainCounts[m.terrainType] = (terrainCounts[m.terrainType] || 0) + 1; });
    const totalWithTerrain = Object.values(terrainCounts).reduce((a, b) => a + b, 0);
    const preferredTerrain = totalWithTerrain > 0 ? Object.entries(terrainCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0] : '';
    return { terrainCounts, totalWithTerrain, preferredTerrain };
  }, [matches, id]);

  const partnerAnalysis = React.useMemo(() => {
    const partnerCounts: Record<string, { count: number; name: string }> = {};
    const allMatches = matches.filter(m => m.teamA.players.includes(id!) || m.teamB.players.includes(id!));
    allMatches.forEach(match => {
      const inA = match.teamA.players.includes(id!);
      const inB = match.teamB.players.includes(id!);
      if (inA && match.teamA.players.length > 1) {
        match.teamA.players.forEach((pid, idx) => {
          if (pid !== id!) { if (!partnerCounts[pid]) partnerCounts[pid] = { count: 0, name: match.teamA.playerNames[idx] || pid }; partnerCounts[pid].count++; }
        });
      } else if (inB && match.teamB.players.length > 1) {
        match.teamB.players.forEach((pid, idx) => {
          if (pid !== id!) { if (!partnerCounts[pid]) partnerCounts[pid] = { count: 0, name: match.teamB.playerNames[idx] || pid }; partnerCounts[pid].count++; }
        });
      }
    });
    const totalWithPartners = Object.values(partnerCounts).reduce((a, b) => a + b.count, 0);
    let preferredPartner = { id: '', name: '', count: 0 };
    if (totalWithPartners > 0) {
      const best = Object.entries(partnerCounts).reduce((a, b) => b[1].count > a[1].count ? b : a);
      preferredPartner = { id: best[0], name: best[1].name, count: best[1].count };
    }
    return { partnerCounts, totalWithPartners, preferredPartner };
  }, [matches, id]);

  const preferredBoulesAnalysis = React.useMemo(() => {
    if (!isSelf || !player || boulesSets.length === 0) return null;
    const pid = player.id;
    const role = player.role || 'Milieu';
    const setPerf: Record<string, { matches: number; wins: number; tirsSuccess: number; totalTirs: number; pointsSuccess: number; totalPoints: number; carreaux: number }> = {};
    matches.forEach(m => {
      if (!m.boulesSetId) return;
      const inA = m.teamA.players.includes(pid);
      const inB = m.teamB.players.includes(pid);
      if (!inA && !inB) return;
      if (!setPerf[m.boulesSetId]) setPerf[m.boulesSetId] = { matches: 0, wins: 0, tirsSuccess: 0, totalTirs: 0, pointsSuccess: 0, totalPoints: 0, carreaux: 0 };
      const s = setPerf[m.boulesSetId]; s.matches++;
      if ((inA && m.winner === 'A') || (inB && m.winner === 'B')) s.wins++;
      if (m.playerActions) { const pa = m.playerActions.find(a => a.playerId === pid); if (pa) { s.tirsSuccess += pa.actions.tirsSuccess; s.totalTirs += pa.actions.tirs; s.pointsSuccess += pa.actions.pointsSuccess; s.totalPoints += pa.actions.points; s.carreaux += pa.actions.carreaux; } }
    });
    const entries = Object.entries(setPerf).filter(([_, s]) => s.matches > 0);
    if (entries.length === 0) return null;
    const scored = entries.map(([setId, s]) => {
      let score = 0;
      if (role === 'Tireur') score = s.wins * 3 + s.tirsSuccess + s.carreaux * 2;
      else if (role === 'Pointeur') score = s.wins * 3 + s.pointsSuccess * 2;
      else score = s.wins * 3 + s.tirsSuccess + s.pointsSuccess + s.carreaux;
      return { setId, ...s, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const set = boulesSets.find(bs => bs.id === best.setId);
    if (!set) return null;
    return { set, stats: best, role };
  }, [isSelf, player?.id, player?.role, matches, boulesSets]);

  let totalTirs = 0, totalTirsSuccess = 0, totalPoints = 0, totalPointsSuccess = 0, totalCarreaux = 0;
  if (player) {
    matches.filter(m => m.teamA.players.includes(id!) || m.teamB.players.includes(id!)).forEach(m => {
      if (m.playerActions) {
        m.playerActions.filter(pa => pa.playerId === id!).forEach(pa => {
          totalTirs += pa.actions.tirs; totalTirsSuccess += pa.actions.tirsSuccess;
          totalPoints += pa.actions.points; totalPointsSuccess += pa.actions.pointsSuccess;
          totalCarreaux += pa.actions.carreaux;
        });
      }
    });
  }
  const tirRate = totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 100) : (player?.stats.tirRate || 0);
  const pointRate = totalPoints > 0 ? Math.round((totalPointsSuccess / totalPoints) * 100) : (player?.stats.pointRate || 0);
  const carreauRate = totalTirsSuccess > 0 ? Math.round((totalCarreaux / totalTirsSuccess) * 100) : (player?.stats.carreauRate || 0);

  const totalMatchCount = playerMatches.length;
  const tournamentMatches = playerMatches.filter(m => m.mode === 'Tournoi');
  const trainingMatches = playerMatches.filter(m => m.mode === "Entra\u00EEnement");

  const radarData = React.useMemo(() => {
    if (!player) return [];
    const rolePct = roleAnalysis.totalWithRoles > 0 ? Math.round((roleAnalysis.roleCounts[roleAnalysis.preferredRole] / roleAnalysis.totalWithRoles) * 100) : 50;
    const terrainPct = terrainAnalysis.totalWithTerrain > 0 ? Math.round((terrainAnalysis.terrainCounts[terrainAnalysis.preferredTerrain] / terrainAnalysis.totalWithTerrain) * 100) : 50;
    const partnerPct = partnerAnalysis.totalWithPartners > 0 ? Math.round((partnerAnalysis.preferredPartner.count / partnerAnalysis.totalWithPartners) * 100) : 50;
    return [
      { label: t('gamePreferences', 'roleLabel'), value: rolePct, color: getRoleColor(roleAnalysis.preferredRole) },
      { label: t('gamePreferences', 'terrainLabel'), value: terrainPct, color: theme.success },
      { label: t('gamePreferences', 'partnerLabel'), value: partnerPct, color: '#EC4899' },
      { label: t('gamePreferences', 'winLabel'), value: player.stats.winRate, color: theme.carreauColor },
      { label: t('gamePreferences', 'shotLabel'), value: tirRate, color: theme.accent },
    ];
  }, [player, roleAnalysis, terrainAnalysis, partnerAnalysis, tirRate, language]);

  const handleDelete = () => {
    if (isSelf) { Alert.alert(t('player', 'impossible'), t('player', 'cannotDeleteSelf')); return; }
    Alert.alert(t('player', 'deletePlayer'), `${t('player', 'deleteConfirm')} "${player?.name}" ? ${t('player', 'deleteIrreversible')}`, [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { if (player) { await deletePlayer(player.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); } } },
    ]);
  };

  if (!player) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.headerBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} /></Pressable>
          <Text style={s.headerTitle}>{t('player', 'playerProfile')}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.textSecondary }}>{t('player', 'playerNotFound')}</Text></View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{t('player', 'playerProfile')}</Text>
        <View style={s.headerActions}>
          <Pressable style={s.headerIconBtn} onPress={handleOpenSharePreview}>
            <MaterialIcons name="share" size={20} color={theme.success} />
          </Pressable>
          {!isSelf && user?.id && isRealUser ? (
            <Pressable
              style={[s.headerIconBtn, { backgroundColor: isFollowing ? '#EC4899' + '15' : theme.backgroundSecondary }]}
              onPress={handleToggleFollow}
              disabled={togglingFollow}
            >
              {togglingFollow ? <ActivityIndicator size="small" color="#EC4899" /> : (
                <MaterialIcons name={isFollowing ? 'person-remove' : 'person-add'} size={20} color={isFollowing ? '#EC4899' : theme.textSecondary} />
              )}
            </Pressable>
          ) : null}
          {isRealUser ? (
            <Pressable style={[s.headerIconBtn, { backgroundColor: theme.error + '10' }]} onPress={() => { Haptics.selectionAsync(); setShowReportModal(true); }}>
              <MaterialIcons name="flag" size={20} color={theme.error} />
            </Pressable>
          ) : null}
          {isRealUser ? (
            <Pressable style={[s.headerIconBtn, { backgroundColor: theme.accent + '15' }]} onPress={async () => { Haptics.selectionAsync(); setLoadingMeetups(true); setShowMeetupPicker(true); const { meetups: mts } = await getMyActiveMeetups(); setActiveMeetups(mts); setLoadingMeetups(false); }}>
              <MaterialIcons name="event" size={20} color={theme.accent} />
            </Pressable>
          ) : null}
          {!isPublicItem && !isSelf && canEdit ? (
            <Pressable style={[s.headerIconBtn, { backgroundColor: '#0EA5E9' + '15' }]} onPress={async () => {
              Haptics.selectionAsync();
              setShowTransferModal(true);
              setTransferCountsLoading(true);
              const counts = await countTransferableItems(id!);
              setTransferCounts(counts);
              setTransferCountsLoading(false);
            }}>
              <MaterialIcons name="swap-horiz" size={20} color="#0EA5E9" />
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable style={[s.headerIconBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => router.push(`/player/edit/${id}`)}>
              <MaterialIcons name="edit" size={20} color={theme.primary} />
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable style={[s.headerIconBtn, { backgroundColor: theme.backgroundSecondary }]} onPress={() => {
              Haptics.selectionAsync();
              Alert.alert(
                language === 'fr' ? 'Actions avancees' : 'Advanced Actions',
                '',
                [
                  { text: language === 'fr' ? 'Fusionner avec un autre joueur' : 'Merge with another player', onPress: () => setShowMergePicker(true) },
                  ...(!isSelf && !isSharedItem ? [{ text: language === 'fr' ? 'Supprimer' : 'Delete', style: 'destructive' as const, onPress: handleDelete }] : []),
                  { text: language === 'fr' ? 'Annuler' : 'Cancel', style: 'cancel' as const },
                ]
              );
            }}>
              <MaterialIcons name="more-vert" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <View style={isTablet ? s.tabletRow : undefined}>
          <View style={isTablet ? s.tabletLeft : undefined}>

            {/* ===== HERO CARD ===== */}
            <View style={s.heroCard}>
              {sharedPermission ? (<View style={{ marginBottom: 8 }}><SharedBadge permission={sharedPermission} /></View>) : null}

              <View style={s.heroIdentityBlock}>
                <View style={s.avatarContainer}>
                  <View style={s.avatar}>
                    {player.avatar ? (
                      <Image source={{ uri: player.avatar }} style={s.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                    ) : (
                      <Text style={s.avatarText}>{player.name.split(' ').map(n => n[0]).join('')}</Text>
                    )}
                  </View>
                  <View style={[s.roleBadgeOnAvatar, { backgroundColor: getRoleColor(player.role) }]}>
                    <MaterialIcons name={getRoleIcon(player.role)} size={14} color="#FFF" />
                  </View>
                </View>

                {/* Follower / Following counters — only for players linked to real users */}
              {isLinkedToRealUser && (followerCount > 0 || followingCount > 0 || playerUserId) ? (
                <Pressable style={s.followStatsRow} onPress={() => { Haptics.selectionAsync(); if (isSelf) router.push('/following' as any); }}>
                  <View style={s.followStatItem}>
                    <Text style={s.followStatValue}>{followerCount}</Text>
                    <Text style={s.followStatLabel}>{language === 'fr' ? 'abonnes' : 'followers'}</Text>
                  </View>
                  <View style={s.followStatDivider} />
                  <View style={s.followStatItem}>
                    <Text style={s.followStatValue}>{followingCount}</Text>
                    <Text style={s.followStatLabel}>{language === 'fr' ? 'abonnements' : 'following'}</Text>
                  </View>
                  {isSelf ? <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} /> : null}
                </Pressable>
              ) : null}

              <View style={s.heroNameRow}>
                  <Text style={s.heroName}>{player.name}</Text>
                  {ambassadorData ? (() => {
                    const isPartnerTier = ['partner', 'sponsor', 'gold_sponsor'].includes(ambassadorData.badgeType);
                    const partnerTierConfig: Record<string, { label: string; labelEn: string; color: string; icon: string }> = {
                      gold_sponsor: { label: 'Partenaire Or', labelEn: 'Gold Partner', color: '#D4A017', icon: 'star' },
                      sponsor: { label: 'Partenaire Argent', labelEn: 'Silver Partner', color: '#78909C', icon: 'workspace-premium' },
                      partner: { label: 'Partenaire Bronze', labelEn: 'Bronze Partner', color: '#A1887F', icon: 'workspace-premium' },
                    };
                    const ptc = isPartnerTier ? partnerTierConfig[ambassadorData.badgeType] : null;
                    return ptc ? (
                      <View style={[s.ambassadorBadge, { backgroundColor: ptc.color + '12', borderColor: ptc.color + '30' }]}>
                        <MaterialIcons name={ptc.icon as any} size={12} color={ptc.color} />
                        <Text style={[s.ambassadorBadgeText, { color: ptc.color }]}>{language === 'fr' ? ptc.label : ptc.labelEn}</Text>
                        {ambassadorData.badgeType === 'gold_sponsor' ? <GoldPulseDot color={ptc.color} /> : null}
                      </View>
                    ) : (
                      <View style={s.ambassadorBadge}>
                        <MaterialIcons name="verified" size={12} color="#7C3AED" />
                        <Text style={s.ambassadorBadgeText}>{language === 'fr' ? 'Ambassadeur' : 'Ambassador'}</Text>
                      </View>
                    );
                  })() : isSelf && isPremium ? (
                    <View style={s.premiumBadge}>
                      <MaterialIcons name="star" size={12} color="#C0C0C0" />
                      <Text style={s.premiumBadgeText}>Premium</Text>
                    </View>
                  ) : null}
                </View>
                {player.nickname ? <Text style={s.heroNickname}>"{player.nickname}"</Text> : null}
              </View>

              <View style={s.heroSectionBlock}>
                <View style={s.heroSectionBlockHeader}>
                  <MaterialIcons name="sports" size={12} color={theme.textMuted} />
                  <Text style={s.heroSectionBlockLabel}>{language === 'fr' ? 'JEU' : 'GAME'}</Text>
                </View>
                <View style={s.badgesRow}>
                  <View style={[s.pillBadge, { backgroundColor: getRoleColor(player.role) + '15' }]}>
                    <MaterialIcons name={getRoleIcon(player.role)} size={14} color={getRoleColor(player.role)} />
                    <Text style={[s.pillBadgeText, { color: getRoleColor(player.role) }]}>{t('roles', player.role)}</Text>
                  </View>
                  {player.handedness ? (
                    <View style={[s.pillBadge, { backgroundColor: '#6366F1' + '15' }]}>
                      <MaterialIcons name={player.handedness === 'left' ? 'front-hand' : player.handedness === 'ambidextrous' ? 'swap-horiz' : 'back-hand'} size={14} color="#6366F1" />
                      <Text style={[s.pillBadgeText, { color: '#6366F1' }]}>
                        {player.handedness === 'right' ? t('player', 'rightHanded') : player.handedness === 'left' ? t('player', 'leftHanded') : t('player', 'ambidextrous')}
                      </Text>
                    </View>
                  ) : null}
                  {player.experience ? (
                    <View style={[s.pillBadge, { backgroundColor: '#9333EA' + '15' }]}>
                      <MaterialIcons name="timeline" size={14} color="#9333EA" />
                      <Text style={[s.pillBadgeText, { color: '#9333EA' }]}>
                        {t('player', player.experience === 'less_than_1' ? 'experienceLessThan1' : player.experience === '1_to_3' ? 'experience1to3' : player.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {(clubDisplayName || terrainDisplayName || player.location?.city || player.country) ? (
                <View style={s.heroSectionBlock}>
                  <View style={s.heroSectionBlockHeader}>
                    <MaterialIcons name="place" size={12} color={theme.textMuted} />
                    <Text style={s.heroSectionBlockLabel}>{language === 'fr' ? 'LIEU' : 'LOCATION'}</Text>
                  </View>
                  {(clubDisplayName || terrainDisplayName) ? (
                    <View style={s.infoPillsRow}>
                      {clubDisplayName ? (clubEntity ? (
                        <Pressable style={[s.infoPill, { backgroundColor: theme.carreauColor + '12' }]} onPress={() => router.push(`/club/${clubEntity.id}`)}>
                          <MaterialIcons name="location-city" size={14} color={theme.carreauColor} />
                          <Text style={[s.infoPillText, { color: theme.carreauColor }]}>{clubDisplayName}</Text>
                          <MaterialIcons name="chevron-right" size={14} color={theme.carreauColor} />
                        </Pressable>
                      ) : (
                        <View style={[s.infoPill, { backgroundColor: theme.carreauColor + '12' }]}>
                          <MaterialIcons name="location-city" size={14} color={theme.carreauColor} />
                          <Text style={[s.infoPillText, { color: theme.carreauColor }]}>{clubDisplayName}</Text>
                        </View>
                      )) : null}
                      {terrainDisplayName ? (terrainEntity ? (
                        <Pressable style={[s.infoPill, { backgroundColor: theme.success + '12' }]} onPress={() => router.push(`/terrain/${terrainEntity.id}`)}>
                          <MaterialIcons name="sports-soccer" size={14} color={theme.success} />
                          <Text style={[s.infoPillText, { color: theme.success }]}>{terrainDisplayName}</Text>
                          <MaterialIcons name="chevron-right" size={14} color={theme.success} />
                        </Pressable>
                      ) : (
                        <View style={[s.infoPill, { backgroundColor: theme.success + '12' }]}>
                          <MaterialIcons name="sports-soccer" size={14} color={theme.success} />
                          <Text style={[s.infoPillText, { color: theme.success }]}>{terrainDisplayName}</Text>
                        </View>
                      )) : null}
                    </View>
                  ) : null}
                  {(player.location?.city || player.country) ? (
                    <View style={s.locationPill}>
                      <MaterialIcons name="place" size={14} color={theme.textSecondary} />
                      <Text style={s.locationPillText}>{[player.location?.city, player.country].filter(Boolean).join(', ')}</Text>
                    </View>
                  ) : null}
                  {(player.location?.latitude || player.location?.longitude) ? (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.success + '10', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, marginBottom: 8, borderWidth: 1, borderColor: theme.success + '25' }}
                      onPress={() => router.push({ pathname: '/(tabs)/map', params: { lat: String(player.location?.latitude), lng: String(player.location?.longitude), name: player.name, mf: String(Date.now()) } } as any)}
                    >
                      <MaterialIcons name="map" size={16} color={theme.success} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.success }}>{language === 'fr' ? 'Voir sur la carte' : 'View on map'}</Text>
                      <MaterialIcons name="chevron-right" size={16} color={theme.success} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {((player.phone || player.email) && (isSharedItem ? (player.showContactPublic === true) : (player.showContactPublic !== false || !player.isPublic))) || (ambassadorData && (ambassadorData.youtubeUrl || ambassadorData.tiktokUrl || ambassadorData.instagramHandle || ambassadorData.twitterHandle || ambassadorData.websiteUrl)) ? (
                <View style={s.heroSectionBlock}>
                  <View style={s.heroSectionBlockHeader}>
                    <MaterialIcons name="contact-phone" size={12} color={theme.textMuted} />
                    <Text style={s.heroSectionBlockLabel}>CONTACT</Text>
                  </View>
                  {ambassadorData && (ambassadorData.youtubeUrl || ambassadorData.tiktokUrl || ambassadorData.instagramHandle || ambassadorData.twitterHandle || ambassadorData.websiteUrl) ? (
                    <View style={s.ambSocialRow}>
                      {ambassadorData.youtubeUrl ? (<Pressable style={[s.ambSocialBtn, { backgroundColor: '#FF000012' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'youtube'); Linking.openURL(ambassadorData.youtubeUrl!); }}><MaterialIcons name="play-arrow" size={16} color="#FF0000" /><Text style={[s.ambSocialText, { color: '#FF0000' }]}>YouTube</Text></Pressable>) : null}
                      {ambassadorData.tiktokUrl ? (<Pressable style={[s.ambSocialBtn, { backgroundColor: '#00000008' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'tiktok'); Linking.openURL(ambassadorData.tiktokUrl!); }}><MaterialIcons name="music-note" size={16} color="#000" /><Text style={[s.ambSocialText, { color: '#000' }]}>TikTok</Text></Pressable>) : null}
                      {ambassadorData.instagramHandle ? (<Pressable style={[s.ambSocialBtn, { backgroundColor: '#E4405F12' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'instagram'); Linking.openURL(`https://instagram.com/${ambassadorData.instagramHandle!.replace('@', '')}`); }}><MaterialIcons name="camera-alt" size={16} color="#E4405F" /><Text style={[s.ambSocialText, { color: '#E4405F' }]}>@{ambassadorData.instagramHandle!.replace('@', '')}</Text></Pressable>) : null}
                      {ambassadorData.twitterHandle ? (<Pressable style={[s.ambSocialBtn, { backgroundColor: '#1DA1F212' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'twitter'); Linking.openURL(`https://x.com/${ambassadorData.twitterHandle!.replace('@', '')}`); }}><MaterialIcons name="alternate-email" size={16} color="#1DA1F2" /><Text style={[s.ambSocialText, { color: '#1DA1F2' }]}>{ambassadorData.twitterHandle}</Text></Pressable>) : null}
                      {ambassadorData.websiteUrl ? (<Pressable style={[s.ambSocialBtn, { backgroundColor: theme.primary + '10' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'website'); Linking.openURL(ambassadorData.websiteUrl!.startsWith('http') ? ambassadorData.websiteUrl! : `https://${ambassadorData.websiteUrl}`); }}><MaterialIcons name="language" size={16} color={theme.primary} /><Text style={[s.ambSocialText, { color: theme.primary }]}>Web</Text></Pressable>) : null}
                    </View>
                  ) : null}
                  {ambassadorData ? (() => {
                    const isPartnerTier = ['partner', 'sponsor', 'gold_sponsor'].includes(ambassadorData.badgeType);
                    if (isPartnerTier) {
                      const ptColor = ambassadorData.badgeType === 'gold_sponsor' ? '#D4A017' : ambassadorData.badgeType === 'sponsor' ? '#78909C' : '#A1887F';
                      return (
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <Pressable style={[s.ambPageBtn, { flex: 1, backgroundColor: ptColor + '10', borderColor: ptColor + '25' }]} onPress={() => { Haptics.selectionAsync(); router.push('/partners' as any); }}>
                            <MaterialIcons name="storefront" size={16} color={ptColor} />
                            <Text style={[s.ambPageBtnText, { color: ptColor }]}>{language === 'fr' ? 'Ma page' : 'My Page'}</Text>
                          </Pressable>
                          <Pressable style={[s.ambPageBtn, { flex: 1, backgroundColor: '#6366F110', borderColor: '#6366F125' }]} onPress={() => { Haptics.selectionAsync(); router.push(`/partner/${ambassadorData.id}` as any); }}>
                            <MaterialIcons name="visibility" size={16} color="#6366F1" />
                            <Text style={[s.ambPageBtnText, { color: '#6366F1' }]}>{language === 'fr' ? 'Voir le profil' : 'View Profile'}</Text>
                          </Pressable>
                        </View>
                      );
                    }
                    return (
                      <Pressable style={s.ambPageBtn} onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/ambassadors', params: { scrollTo: ambassadorData.id } } as any); }}>
                        <MaterialIcons name="verified" size={16} color="#7C3AED" />
                        <Text style={s.ambPageBtnText}>{language === 'fr' ? 'Voir la page ambassadeur' : 'View ambassador page'}</Text>
                        <MaterialIcons name="chevron-right" size={16} color="#7C3AED" />
                      </Pressable>
                    );
                  })() : null}
                  {(player.phone || player.email) && (isSharedItem ? (player.showContactPublic === true) : (player.showContactPublic !== false || !player.isPublic)) ? (
                    <View style={s.contactPillsRow}>
                      {player.phone ? (<Pressable style={s.contactPill} onPress={() => Linking.openURL(`tel:${player.phone}`)}><MaterialIcons name="phone" size={14} color={theme.primary} /><Text style={s.contactPillText}>{player.phone}</Text></Pressable>) : null}
                      {player.email ? (<Pressable style={s.contactPill} onPress={() => Linking.openURL(`mailto:${player.email}`)}><MaterialIcons name="email" size={14} color={theme.primary} /><Text style={s.contactPillText}>{player.email}</Text></Pressable>) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isLinkedToRealUser && trustScore ? (
                trustScore.level === 'suspicious' && trustScore.score === 0 ? (
                  <View style={[s.trustScoreBadge, { borderColor: '#EF444430', backgroundColor: '#EF444408' }]}>
                    <View style={[s.trustScoreIconBg, { backgroundColor: '#EF444415' }]}><MaterialIcons name="block" size={18} color="#EF4444" /></View>
                    <View style={s.trustScoreInfo}>
                      <View style={s.trustScoreTopRow}>
                        <Text style={[s.trustScoreLabel, { color: '#EF4444' }]}>{language === 'fr' ? 'Compte restreint' : 'Restricted Account'}</Text>
                        <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}><Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>{language === 'fr' ? 'BANNI' : 'BANNED'}</Text></View>
                      </View>
                      <Text style={[s.trustScoreDesc, { color: '#EF4444', marginTop: 4 }]} numberOfLines={2}>
                        {language === 'fr' ? 'Ce profil a ete restreint pour non-respect des regles. Ses matchs ne comptent pas dans les classements.' : 'This profile has been restricted for rule violations. Their matches do not count in leaderboards.'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Pressable style={[s.trustScoreBadge, { borderColor: getTrustScoreColor(trustScore.level) + '25', backgroundColor: getTrustScoreColor(trustScore.level) + '06' }]} onPress={isSelfPlayer ? () => router.push('/trust-score' as any) : undefined}>
                    <View style={[s.trustScoreIconBg, { backgroundColor: getTrustScoreColor(trustScore.level) + '15' }]}><MaterialIcons name={getTrustScoreIcon(trustScore.level) as any} size={16} color={getTrustScoreColor(trustScore.level)} /></View>
                    <View style={s.trustScoreInfo}>
                      <View style={s.trustScoreTopRow}>
                        <Text style={[s.trustScoreLabel, { color: getTrustScoreColor(trustScore.level) }]}>{getTrustLevelLabel(trustScore.level, language === 'fr')}</Text>
                        <Text style={[s.trustScoreValue, { color: getTrustScoreColor(trustScore.level) }]}>{trustScore.score}/100</Text>
                      </View>
                      <View style={s.trustScoreBarTrack}><View style={[s.trustScoreBarFill, { width: `${trustScore.score}%`, backgroundColor: getTrustScoreColor(trustScore.level) }]} /></View>
                      <Text style={s.trustScoreDesc} numberOfLines={2}>{getTrustBadgeDescription(trustScore.level, language === 'fr')}</Text>
                    </View>
                    {isSelfPlayer ? (<MaterialIcons name="chevron-right" size={18} color={getTrustScoreColor(trustScore.level)} style={{ marginLeft: 'auto', marginTop: 2 }} />) : null}
                  </Pressable>
                )
              ) : null}

              {/* ===== ELO SECTION IN HERO (matching me.tsx) — only for players linked to real users ===== */}
              {player.eloRating && isLinkedToRealUser ? (() => {
                const eloR = getEloRank(player.eloRating);
                return (
                  <View style={s.heroSectionBlock}>
                    <View style={s.heroSectionBlockHeader}>
                      <MaterialIcons name={eloR.icon as any} size={12} color={eloR.color} />
                      <Text style={[s.heroSectionBlockLabel, { color: eloR.color }]}>ELO</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                      <Text style={{ fontSize: 28, fontWeight: '900', color: eloR.color }}>{player.eloRating}</Text>
                      <View style={{ backgroundColor: eloR.color + '15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: eloR.color + '30' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: eloR.color }}>{eloR.label[language === 'fr' ? 'fr' : 'en']}</Text>
                      </View>
                    </View>
                    {/* ELO Sparkline Chart */}
                    {eloChartData && eloChartData.points.length >= 3 ? (
                      <View style={{ alignItems: 'center', marginBottom: 8 }}>
                        <EloSparkline
                          points={eloChartData.entries.map(e => ({ elo: e.eloAfter, won: e.won }))}
                          currentElo={eloChartData.currentElo}
                          weekDelta={eloChartData.weekDelta}
                          width={Math.min(screenWidth - 120, 220)}
                          height={40}
                          language={language}
                        />
                      </View>
                    ) : null}
                    {roleElos ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                        {[{ label: 'Tireur', value: roleElos.tireur, color: '#F97316', icon: 'gps-fixed' }, { label: 'Pointeur', value: roleElos.pointeur, color: '#3B82F6', icon: 'adjust' }, { label: 'Milieu', value: roleElos.milieu, color: '#8B5CF6', icon: 'swap-horiz' }].map(r => (
                          <View key={r.label} style={{ alignItems: 'center', backgroundColor: r.color + '08', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                            <MaterialIcons name={r.icon as any} size={10} color={r.color} />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: r.color }}>{r.value}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })() : null}

              {/* ===== UNIFIED RANKING HUB — only for players linked to real users ===== */}
              {isLinkedToRealUser ? (
              <View style={s.rankingHub}>
                {/* League tier compact */}
                <GlobalRankBadge
                  playerId={player.id}
                  playerUserId={(player as any)?.userId}
                  eloRating={player.eloRating || ELO_INITIAL}
                  isPublic={player.isPublic ?? false}
                  language={language}
                  compact
                />

                {/* Geo ranks inline row */}
                {geoRank && (geoRank.city || geoRank.country || geoRank.continent) ? (
                  <Pressable style={s.geoRankInlineCard} onPress={() => router.push('/leaderboard-geo' as any)}>
                    <View style={s.geoRankInlineHeader}>
                      <MaterialIcons name="public" size={12} color="#3B82F6" />
                      <Text style={s.geoRankInlineTitle}>{language === 'fr' ? 'Geographique' : 'Geographic'}</Text>
                      <MaterialIcons name="chevron-right" size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
                    </View>
                    <View style={s.geoRankInlineRow}>
                      {geoRank.city ? (
                        <View style={s.geoRankInlineChip}>
                          <MaterialIcons name="location-city" size={12} color="#3B82F6" />
                          <Text style={s.geoRankInlineLabel} numberOfLines={1}>{geoRank.city.name}</Text>
                          <Text style={[s.geoRankInlineRank, { color: geoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }]}>#{geoRank.city.rank}</Text>
                          <Text style={s.geoRankInlineTotal}>/{geoRank.city.total}</Text>
                        </View>
                      ) : null}
                      {geoRank.country ? (
                        <View style={s.geoRankInlineChip}>
                          <Text style={{ fontSize: 11 }}>{getCountryFlag(geoRank.country.name)}</Text>
                          <Text style={s.geoRankInlineLabel} numberOfLines={1}>{geoRank.country.name}</Text>
                          <Text style={[s.geoRankInlineRank, { color: geoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }]}>#{geoRank.country.rank}</Text>
                          <Text style={s.geoRankInlineTotal}>/{geoRank.country.total}</Text>
                        </View>
                      ) : null}
                      {geoRank.continent ? (
                        <View style={s.geoRankInlineChip}>
                          <Text style={{ fontSize: 11 }}>{getContinentFlag(geoRank.continent.name)}</Text>
                          <Text style={s.geoRankInlineLabel} numberOfLines={1}>{getContinentLabel(geoRank.continent.name, language === 'fr')}</Text>
                          <Text style={[s.geoRankInlineRank, { color: '#F59E0B' }]}>#{geoRank.continent.rank}</Text>
                          <Text style={s.geoRankInlineTotal}>/{geoRank.continent.total}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ) : null}
              </View>
              ) : null}

              {isLinkedToRealUser && player.isPublic && player.stats.matchesPlayed < LEADERBOARD_MIN_MATCHES ? (
                <Pressable style={s.leaderboardProgressCard} onPress={() => router.push('/leaderboard' as any)}>
                  <View style={s.leaderboardProgressHeader}>
                    <MaterialIcons name="leaderboard" size={16} color="#D97706" />
                    <Text style={s.leaderboardProgressTitle}>{player.stats.matchesPlayed}/{LEADERBOARD_MIN_MATCHES} {t('leaderboard', 'matches')}</Text>
                    <Text style={s.leaderboardProgressMotivation}>{player.stats.matchesPlayed >= 7 ? t('leaderboard', 'progressMotivation1') : player.stats.matchesPlayed >= 3 ? t('leaderboard', 'progressMotivation2') : t('leaderboard', 'progressMotivation3')}</Text>
                  </View>
                  <View style={s.leaderboardProgressTrack}><View style={[s.leaderboardProgressFill, { width: `${Math.min((player.stats.matchesPlayed / LEADERBOARD_MIN_MATCHES) * 100, 100)}%` }]} /></View>
                  <Text style={s.leaderboardProgressDesc}>{t('leaderboard', 'progressAlmostThere').replace('{remaining}', String(LEADERBOARD_MIN_MATCHES - player.stats.matchesPlayed))}</Text>
                </Pressable>
              ) : null}

              {/* Sponsored Player Banner — inside hero card, at the end */}
              {(player as any)?.sponsorId ? (
                <View style={{ width: '100%', marginBottom: 8 }}>
                  <SponsoredItemBanner sponsorId={(player as any).sponsorId} page="player-detail" />
                </View>
              ) : null}

              <View style={s.quickStatsBar}>
                <View style={s.quickStatItem}><Text style={s.quickStatValue}>{player.stats.matchesPlayed}</Text><Text style={s.quickStatLabel}>{t('player', 'matchesUpper')}</Text></View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}><Text style={[s.quickStatValue, { color: theme.success }]}>{player.stats.wins}</Text><Text style={s.quickStatLabel}>{t('player', 'victories')}</Text></View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}><Text style={[s.quickStatValue, { color: theme.accent }]}>{player.stats.winRate}%</Text><Text style={s.quickStatLabel}>{t('player', 'winsLabel')}</Text></View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}><Text style={[s.quickStatValue, { color: theme.error }]}>{player.stats.losses}</Text><Text style={s.quickStatLabel}>{t('player', 'defeats')}</Text></View>
              </View>
            </View>
          </View>

          <View style={isTablet ? s.tabletRight : undefined}>
            {/* ===== GAME PREFERENCES with Radar ===== */}
            {belowFoldReady ? (
              <GamePreferencesSection
                roleAnalysis={roleAnalysis}
                terrainAnalysis={terrainAnalysis}
                partnerAnalysis={partnerAnalysis}
                preferredBoulesAnalysis={preferredBoulesAnalysis}
                playerBoules={player.boules}
                radarData={radarData}
                language={language}
                t={t}
                screenWidth={screenWidth}
                partnerPlayer={partnerAnalysis.totalWithPartners > 0 ? getPlayerById(partnerAnalysis.preferredPartner.id) : null}
              />
            ) : (roleAnalysis.totalWithRoles > 0 || terrainAnalysis.totalWithTerrain > 0 || partnerAnalysis.totalWithPartners > 0 || preferredBoulesAnalysis) ? (
              <View style={s.sectionCard}>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionIconBox, { backgroundColor: '#8B5CF615' }]}><MaterialIcons name="psychology" size={18} color="#8B5CF6" /></View>
                  <Text style={s.sectionTitle}>{t('gamePreferences', 'title')}</Text>
                </View>
                <Text style={s.sectionDesc}>{t('gamePreferences', 'descOther')}</Text>
                {radarData.length >= 3 ? (
                  <View style={s.radarContainer}>
                    <MiniRadar data={radarData} labels={radarData.map(d => d.label)} size={Math.min(screenWidth - 96, 220)} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {belowFoldReady ? (<>
        {/* ===== HEAD-TO-HEAD ROLE ANALYSIS ===== */}
        {(() => {
          if (!selfPlayer || isSelf || !player) return null;
          const h2h = computeHeadToHeadRoleAnalysis(selfPlayer.id, player.id, matches, language);
          if (!h2h || h2h.totalMatches === 0) return null;
          return (
            <View style={s.sectionCard}>
              {/* H2H Share Card button */}
              <Pressable
                style={{ position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#8B5CF6' + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#8B5CF6' + '25', zIndex: 2 }}
                onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/share-card', params: { type: 'h2h', opponentId: player.id } } as any); }}
              >
                <MaterialIcons name="camera-alt" size={12} color="#8B5CF6" />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>{language === 'fr' ? 'Partage RS' : 'Social Share'}</Text>
              </Pressable>
              <View style={s.sectionHeader}>
                <View style={[s.sectionIconBox, { backgroundColor: '#EC489915' }]}><MaterialIcons name="compare-arrows" size={18} color="#EC4899" /></View>
                <Text style={s.sectionTitle}>{language === 'fr' ? 'Face-a-face par role' : 'Head-to-Head by Role'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{language === 'fr' ? 'Vous' : 'You'}</Text>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: h2h.player1Wins >= h2h.player2Wins ? '#10B981' : theme.textSecondary }}>{h2h.player1Wins}</Text>
                </View>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }}>{h2h.totalMatches} {language === 'fr' ? 'matchs' : 'matches'}</Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>vs</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{player.name.split(' ')[0]}</Text>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: h2h.player2Wins >= h2h.player1Wins ? '#10B981' : theme.textSecondary }}>{h2h.player2Wins}</Text>
                </View>
              </View>
              {h2h.roles.map(roleData => {
                const rc = getRoleColorService(roleData.role);
                const ri = getRoleIconService(roleData.role);
                const p1Better = (roleData.player1.tirRate + roleData.player1.pointRate) >= (roleData.player2.tirRate + roleData.player2.pointRate);
                return (
                  <View key={roleData.role} style={{ backgroundColor: rc + '06', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: rc + '18' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: rc + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={ri as any} size={14} color={rc} />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: rc }}>{t('roles', roleData.role)}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginLeft: 'auto' }}>
                        {roleData.player1.matches + roleData.player2.matches} {language === 'fr' ? 'matchs' : 'matches'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[{ label: language === 'fr' ? 'Vous' : 'You', d: roleData.player1, isBetter: p1Better }, { label: player.name.split(' ')[0], d: roleData.player2, isBetter: !p1Better }].map((side, si) => (
                        <View key={si} style={{ flex: 1, backgroundColor: side.isBetter ? '#10B98108' : theme.backgroundSecondary, borderRadius: 10, padding: 10, borderWidth: side.isBetter ? 1 : 0, borderColor: '#10B98125' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: side.isBetter ? '#10B981' : theme.textMuted, textAlign: 'center', marginBottom: 6 }}>{side.label} {side.isBetter ? '\u2B50' : ''}</Text>
                          <View style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: theme.textMuted }}>{language === 'fr' ? 'Tir' : 'Shot'}</Text>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#F97316' }}>{side.d.tirRate}%</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: theme.textMuted }}>Point</Text>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#3B82F6' }}>{side.d.pointRate}%</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: theme.textMuted }}>Car.</Text>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>{side.d.carreaux}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                    {h2h.recommendation ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: rc + '15' }}>
                        <MaterialIcons name="lightbulb" size={12} color={rc} />
                        <Text style={{ fontSize: 10, color: rc, fontWeight: '600', flex: 1 }}>{h2h.recommendation}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* ===== SEASONAL ROLE EVOLUTION ===== */}
        {(() => {
          if (!player) return null;
          const evo = computeSeasonalRoleEvolution(id!, matches, language);
          if (!evo || evo.seasons.length < 2) return null;
          const chartW = Math.max(1, screenWidth - 80);
          const barH = 24;
          const barGap = 6;
          const labelW = 42;
          const chartAreaW = chartW - labelW;
          const chartH = evo.seasons.length * (barH + barGap) + 10;
          const roleOrder = ['Tireur', 'Pointeur', 'Milieu'] as const;
          return (
            <View style={s.sectionCard}>
              <View style={[s.sectionHeader, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.sectionIconBox, { backgroundColor: '#6366F115' }]}><MaterialIcons name="timeline" size={18} color="#6366F1" /></View>
                  <Text style={s.sectionTitle}>{language === 'fr' ? 'Evolution du role' : 'Role Evolution'}</Text>
                </View>
                <Pressable
                  style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#6366F110', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#6366F120' }}
                  onPress={async () => {
                    if (exportingRoleEvo) return;
                    setExportingRoleEvo(true);
                    Haptics.selectionAsync();
                    try {
                      const fullHtml = generateRoleEvolutionPdfHtml(player.name, evo, language);
                      const fileName = `role_evolution_${player.name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.pdf`;
                      if (Platform.OS === 'web') {
                        const pw = window.open('', '_blank');
                        if (pw) { pw.document.write(fullHtml); pw.document.close(); pw.print(); }
                      } else {
                        const PrintModule = require('expo-print');
                        const FSModule = require('expo-file-system');
                        const SharingModule = require('expo-sharing');
                        const { uri } = await PrintModule.printToFileAsync({ html: fullHtml });
                        const newUri = `${FSModule.cacheDirectory}${fileName}`;
                        await FSModule.moveAsync({ from: uri, to: newUri });
                        if (await SharingModule.isAvailableAsync()) {
                          await SharingModule.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: fileName });
                        }
                      }
                    } catch (e) {
                      console.log('Role evolution PDF export error:', e);
                    } finally {
                      setExportingRoleEvo(false);
                    }
                  }}
                  disabled={exportingRoleEvo}
                >
                  {exportingRoleEvo ? <ActivityIndicator size="small" color="#6366F1" /> : <MaterialIcons name="picture-as-pdf" size={16} color="#6366F1" />}
                </Pressable>
              </View>
              {/* Migration summary */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, backgroundColor: evo.hasEvolution ? '#6366F108' : theme.backgroundSecondary, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: evo.hasEvolution ? '#6366F120' : theme.border }}>
                <MaterialIcons name={evo.hasEvolution ? 'trending-flat' : 'check-circle'} size={16} color={evo.hasEvolution ? '#6366F1' : theme.success} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: evo.hasEvolution ? '#6366F1' : theme.success }}>{evo.migrationSummary}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{evo.seasons.length} {language === 'fr' ? 'periodes' : 'periods'}</Text>
              </View>
              {/* Stacked bar chart */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Svg width={chartW} height={chartH}>
                  {evo.seasons.map((season, sIdx) => {
                    const y = sIdx * (barH + barGap);
                    let xOffset = labelW;
                    const segments: React.ReactNode[] = [];
                    roleOrder.forEach((role, rIdx) => {
                      const rd = season.roles.find(r => r.role === role);
                      if (!rd || rd.count === 0) return;
                      const w = Math.max(2, (rd.pct / 100) * chartAreaW);
                      const rc = getRoleColorService(role);
                      const isFirst = xOffset === labelW;
                      const isLast = rIdx === roleOrder.length - 1 || roleOrder.slice(rIdx + 1).every(r2 => (season.roles.find(r3 => r3.role === r2)?.count || 0) === 0);
                      segments.push(
                        <Rect key={`${sIdx}-${role}`} x={xOffset} y={y} width={w} height={barH} rx={isFirst && isLast ? 6 : isFirst ? 6 : isLast ? 6 : 0} fill={rc} opacity={season.dominantRole === role ? 1 : 0.55} />
                      );
                      if (rd.pct >= 18) {
                        segments.push(
                          <SvgText key={`t-${sIdx}-${role}`} x={xOffset + w / 2} y={y + barH / 2 + 4} fontSize="9" fill="#FFF" fontWeight="700" textAnchor="middle">{rd.pct}%</SvgText>
                        );
                      }
                      xOffset += w;
                    });
                    return (
                      <G key={sIdx}>
                        <SvgText x={0} y={y + barH / 2 + 4} fontSize="9" fill={theme.textMuted} fontWeight="600">{season.periodLabel}</SvgText>
                        {segments}
                        <SvgText x={chartW - 2} y={y + barH / 2 + 4} fontSize="8" fill={theme.textMuted} fontWeight="500" textAnchor="end">{season.totalMatches}</SvgText>
                      </G>
                    );
                  })}
                </Svg>
              </View>
              {/* Legend */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                {roleOrder.map(role => (
                  <View key={role} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: getRoleColorService(role) }} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textSecondary }}>{t('roles', role)}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ===== MATCH STATISTICS ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="sports" size={18} color={theme.primary} /></View>
            <Text style={s.sectionTitle}>{t('player', 'matchesSection')}</Text>
          </View>
          <View style={s.matchStatRow}>
            <View style={s.matchStatLabels}>
              <Text style={[s.matchStatLabel, { color: theme.success }]}>{player.stats.wins} {t('player', 'won')}</Text>
              <Text style={[s.matchStatLabel, { color: theme.error }]}>{player.stats.losses} {t('player', 'lost')}</Text>
            </View>
            <View style={s.progressBarTrack}>
              <View style={[s.progressBarFill, { flex: Math.max(player.stats.wins, 0.01), backgroundColor: theme.success }]} />
              <View style={[s.progressBarFill, { flex: Math.max(player.stats.losses, 0.01), backgroundColor: theme.error }]} />
            </View>
          </View>
          <View style={s.modeBreakdownRow}>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="emoji-events" size={16} color={theme.carreauColor} /></View>
              <View><Text style={s.modeBreakdownValue}>{tournamentMatches.length}</Text><Text style={s.modeBreakdownLabel}>{t('player', 'tournaments')}</Text></View>
            </View>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.primary + '15' }]}><MaterialIcons name="fitness-center" size={16} color={theme.primary} /></View>
              <View><Text style={s.modeBreakdownValue}>{trainingMatches.length}</Text><Text style={s.modeBreakdownLabel}>{t('player', 'trainings')}</Text></View>
            </View>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.textSecondary + '15' }]}><MaterialIcons name="numbers" size={16} color={theme.textSecondary} /></View>
              <View><Text style={s.modeBreakdownValue}>{((player.stats.avgPointsScored - player.stats.avgPointsConceded) > 0 ? '+' : '')}{(player.stats.avgPointsScored - player.stats.avgPointsConceded).toFixed(1)}</Text><Text style={s.modeBreakdownLabel}>{t('player', 'differential')}</Text></View>
            </View>
          </View>
        </View>

        {/* ===== SHOT PERFORMANCE ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.accent + '15' }]}><MaterialIcons name="gps-fixed" size={18} color={theme.accent} /></View>
            <Text style={s.sectionTitle}>{t('player', 'performancesLabel')}</Text>
          </View>
          {[
            { icon: 'gps-fixed', label: t('player', 'shotRate'), rate: tirRate, success: totalTirsSuccess || player.stats.tirRate, total: totalTirs || 100, color: theme.accent },
            { icon: 'adjust', label: t('player', 'pointRate'), rate: pointRate, success: totalPointsSuccess || player.stats.pointRate, total: totalPoints || 100, color: theme.primary },
            { icon: 'stars', label: t('player', 'carreauRate'), rate: carreauRate, success: totalCarreaux || player.stats.carreauRate, total: totalTirsSuccess || 100, color: theme.carreauColor },
          ].map((item, idx) => (
            <View key={idx} style={[s.perfRow, idx === 2 && { borderBottomWidth: 0 }]}>
              <View style={[s.perfIcon, { backgroundColor: item.color + '15' }]}><MaterialIcons name={item.icon as any} size={18} color={item.color} /></View>
              <View style={s.perfInfo}>
                <View style={s.perfTopRow}><Text style={s.perfLabel}>{item.label}</Text><Text style={[s.perfValue, { color: item.color }]}>{item.rate}%</Text></View>
                <View style={s.perfBarTrack}><View style={[s.perfBarFill, { width: `${item.rate}%`, backgroundColor: item.color }]} /></View>
                {(totalTirs > 0 || totalPoints > 0) ? (<Text style={s.perfSubtext}>{item.success} / {item.total}</Text>) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Ad Banner - between performances and detailed stats */}
        <AdBanner position="inline" />

        {/* ===== DETAILED STATS ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.warning + '15' }]}><MaterialIcons name="bar-chart" size={18} color={theme.warning} /></View>
            <Text style={s.sectionTitle}>{t('player', 'details')}</Text>
          </View>
          <View style={s.detailRow}><Text style={s.detailLabel}>{t('player', 'pointsScoredPerMatch')}</Text><Text style={s.detailValue}>{player.stats.avgPointsScored}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>{t('player', 'pointsConcededPerMatch')}</Text><Text style={s.detailValue}>{player.stats.avgPointsConceded}</Text></View>
          <View style={[s.detailRow, { borderBottomWidth: 0 }]}><Text style={s.detailLabel}>{t('player', 'memberSince')}</Text><Text style={s.detailValue}>{new Date(player.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })}</Text></View>
        </View>

        {/* ===== RECENT MATCHES ===== */}
        {recentMatches.length > 0 ? (
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: theme.success + '15' }]}><MaterialIcons name="history" size={18} color={theme.success} /></View>
              <Text style={s.sectionTitle}>{t('player', 'recentMatches')}</Text>
            </View>
            {recentMatches.map((match, idx) => {
              const isTeamA = match.teamA.players.includes(id!);
              const won = (isTeamA && match.winner === 'A') || (!isTeamA && match.winner === 'B');
              return (
                <Pressable key={match.id} style={[s.matchCard, idx === recentMatches.length - 1 && { borderBottomWidth: 0 }]} onPress={() => router.push(`/match/${match.id}`)}>
                  <View style={[s.matchIndicator, { backgroundColor: won ? theme.success : theme.error }]} />
                  <View style={s.matchContent}>
                    <Text style={s.matchTeams} numberOfLines={1}>{match.teamA.playerNames.join(', ')} vs {match.teamB.playerNames.join(', ')}</Text>
                    <Text style={s.matchMeta}>{t('formats', match.format)} {"•"} {new Date(match.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <View style={s.matchScoreBox}>
                    <Text style={[s.matchScoreText, won && { color: theme.success }]}>{isTeamA ? match.teamA.score : match.teamB.score}</Text>
                    <Text style={s.matchScoreSep}>-</Text>
                    <Text style={[s.matchScoreText, !won && { color: theme.error }]}>{isTeamA ? match.teamB.score : match.teamA.score}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ModificationLogsSection itemType="player" itemId={id!} isOwner={!isSharedItem && !!user?.id} />
        </>) : (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        )}
      </ScrollView>

      {player ? (<ShareModal visible={showShareModal} onClose={() => setShowShareModal(false)} itemType="player" itemId={player.id} itemName={player.name} />) : null}
      <MergePickerModal visible={showMergePicker} onClose={() => setShowMergePicker(false)} itemType="player" currentItemId={id!} />

      {/* Report Player Modal */}
      <Modal visible={showReportModal} animationType="slide" transparent onRequestClose={() => setShowReportModal(false)}>
        <View style={s.mipOverlay}>
          <View style={s.mipContent}>
            <View style={s.mipHeader}>
              <View style={{ flex: 1 }}><Text style={s.mipTitle}>{t('reports', 'reportTitle')}</Text><Text style={s.mipSubtitle}>{player?.name}</Text></View>
              <Pressable style={s.mipClose} onPress={() => setShowReportModal(false)}><MaterialIcons name="close" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>{t('reports', 'reportDesc')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('reports', 'reason')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {REPORT_REASONS.map(reason => (
                <Pressable key={reason} style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: reportReason === reason ? theme.error + '15' : theme.backgroundSecondary, borderWidth: 1.5, borderColor: reportReason === reason ? theme.error : theme.border }]} onPress={() => setReportReason(reason)}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: reportReason === reason ? theme.error : theme.textSecondary }}>{t('reports', reason)}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.textPrimary, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border }} value={reportDetails} onChangeText={setReportDetails} placeholder={t('reports', 'detailsPlaceholder')} placeholderTextColor={theme.textMuted} multiline numberOfLines={3} />
            <Pressable style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.error, borderRadius: 14, paddingVertical: 14, marginTop: 16 }, (!reportReason || reportSubmitting) && { opacity: 0.5 }]} disabled={!reportReason || reportSubmitting} onPress={async () => {
              if (!reportReason) { showAlert(t('reports', 'selectReason')); return; }
              setReportSubmitting(true);
              const { error: err } = await submitReport({ reportedPlayerId: id!, reportedUserId: playerUserId || undefined, reason: reportReason, details: reportDetails.trim() || undefined });
              setReportSubmitting(false);
              if (err === 'already_reported') { showAlert(t('reports', 'alreadyReported'), t('reports', 'alreadyReportedDesc')); }
              else if (err) { showAlert(t('reports', 'errorSubmit'), err); }
              else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('reports', 'success'), t('reports', 'successDesc')); setShowReportModal(false); setReportReason(''); setReportDetails(''); }
            }}>
              {reportSubmitting ? (<ActivityIndicator size="small" color="#FFF" />) : (<><MaterialIcons name="flag" size={18} color="#FFF" /><Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{t('reports', 'submit')}</Text></>)}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Transfer to User Modal */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => { setShowTransferModal(false); setTransferTarget(null); setTransferSearch(''); setTransferResults([]); setTransferMessage(''); }}>
        <View style={s.mipOverlay}>
          <View style={[s.mipContent, { maxHeight: '80%' }]}>
            <View style={s.mipHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.mipTitle}>{language === 'fr' ? 'Transferer le joueur' : 'Transfer Player'}</Text>
                <Text style={s.mipSubtitle}>{player?.name}</Text>
              </View>
              <Pressable style={s.mipClose} onPress={() => { setShowTransferModal(false); setTransferTarget(null); setTransferSearch(''); setTransferResults([]); setTransferMessage(''); }}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Transfer counts */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: theme.primary + '08', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.primary + '20' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.primary }}>{transferCountsLoading ? '...' : transferCounts.matchCount}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '600' }}>{language === 'fr' ? 'Matchs' : 'Matches'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#7C3AED08', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#7C3AED20' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#7C3AED' }}>{transferCountsLoading ? '...' : transferCounts.challengeCount}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '600' }}>{language === 'fr' ? 'Defis' : 'Challenges'}</Text>
              </View>
            </View>

            {!transferTarget ? (
              <>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>{language === 'fr' ? 'Recherchez l\'utilisateur inscrit a qui transferer les matchs et defis de ce joueur.' : 'Search for the registered user to transfer this player\'s matches and challenges to.'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, height: 44, gap: 8, borderWidth: 1, borderColor: theme.border, marginBottom: 12 }}>
                  <MaterialIcons name="search" size={18} color={theme.textMuted} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 }}
                    placeholder={language === 'fr' ? 'Nom ou email...' : 'Name or email...'}
                    placeholderTextColor={theme.textMuted}
                    value={transferSearch}
                    onChangeText={(text) => {
                      setTransferSearch(text);
                      if (transferSearchTimer.current) clearTimeout(transferSearchTimer.current);
                      if (text.trim().length < 2) { setTransferResults([]); return; }
                      transferSearchTimer.current = setTimeout(async () => {
                        setTransferSearching(true);
                        const { users } = await searchRegisteredUsers(text, user?.id);
                        setTransferResults(users);
                        setTransferSearching(false);
                      }, 400);
                    }}
                    autoFocus
                  />
                  {transferSearching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                </View>
                <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                  {transferResults.map((u) => (
                    <Pressable
                      key={u.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 8 }}
                      onPress={() => { Haptics.selectionAsync(); setTransferTarget({ id: u.id, username: u.username, email: u.email }); }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                        {u.avatar ? (
                          <Image source={{ uri: u.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                        ) : (
                          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.primary }}>{(u.username || u.email || '?').charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{u.username || u.email}</Text>
                        {u.username ? <Text style={{ fontSize: 11, color: theme.textMuted }}>{u.email}</Text> : null}
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                    </Pressable>
                  ))}
                  {transferSearch.trim().length >= 2 && !transferSearching && transferResults.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                      <MaterialIcons name="person-search" size={36} color={theme.textMuted} />
                      <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>{language === 'fr' ? 'Aucun utilisateur trouve' : 'No user found'}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : (
              <>
                {/* Selected target */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.success + '08', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: theme.success + '30' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.success + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="person" size={22} color={theme.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{transferTarget.username || transferTarget.email}</Text>
                    {transferTarget.username ? <Text style={{ fontSize: 11, color: theme.textMuted }}>{transferTarget.email}</Text> : null}
                  </View>
                  <Pressable onPress={() => setTransferTarget(null)} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>

                {/* Message */}
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 6 }}>{language === 'fr' ? 'Message (optionnel)' : 'Message (optional)'}</Text>
                <TextInput
                  style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.textPrimary, minHeight: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}
                  placeholder={language === 'fr' ? 'Ex: Ce sont nos matchs du club...' : 'E.g.: These are our club matches...'}
                  placeholderTextColor={theme.textMuted}
                  value={transferMessage}
                  onChangeText={setTransferMessage}
                  multiline
                  maxLength={300}
                />

                {/* Summary */}
                <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MaterialIcons name="info-outline" size={16} color={theme.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{language === 'fr' ? 'Resume du transfert' : 'Transfer Summary'}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 18 }}>
                    {language === 'fr'
                      ? `${transferCounts.matchCount} match(s) et ${transferCounts.challengeCount} defi(s) de "${player?.name}" seront reassignes au profil de ${transferTarget.username || transferTarget.email} apres acceptation.`
                      : `${transferCounts.matchCount} match(es) and ${transferCounts.challengeCount} challenge(s) from "${player?.name}" will be reassigned to ${transferTarget.username || transferTarget.email}\'s profile after acceptance.`}
                  </Text>
                </View>

                {/* Send button */}
                <Pressable
                  style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 16 }, transferSending && { opacity: 0.6 }]}
                  disabled={transferSending}
                  onPress={async () => {
                    if (!player || !transferTarget || !user) return;
                    setTransferSending(true);
                    const { error: err } = await sendTransferRequest({
                      senderUserId: user.id,
                      recipientUserId: transferTarget.id,
                      playerId: player.id,
                      playerName: player.name,
                      matchCount: transferCounts.matchCount,
                      challengeCount: transferCounts.challengeCount,
                      message: transferMessage.trim() || undefined,
                    });
                    setTransferSending(false);
                    if (err === 'already_pending') {
                      showAlert(language === 'fr' ? 'Demande existante' : 'Existing request', language === 'fr' ? 'Une demande de transfert est deja en attente pour ce joueur.' : 'A transfer request is already pending for this player.');
                    } else if (err) {
                      showAlert(language === 'fr' ? 'Erreur' : 'Error', err);
                    } else {
                      // Send push notification to recipient
                      try {
                        const _pushModule = await import('@/services/pushTokenService');
                        _pushModule.triggerServerPush('player_transfer_request', {
                          recipientUserId: transferTarget.id,
                          senderName: user?.username || user?.email || '',
                          playerName: player?.name,
                          matchCount: transferCounts.matchCount,
                          challengeCount: transferCounts.challengeCount,
                        }).catch(() => {});
                      } catch { /* silent */ }
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      showAlert(language === 'fr' ? 'Demande envoyee' : 'Request sent', language === 'fr' ? `${transferTarget.username || transferTarget.email} recevra une notification pour accepter le transfert.` : `${transferTarget.username || transferTarget.email} will receive a notification to accept the transfer.`);
                      setShowTransferModal(false);
                      setTransferTarget(null);
                      setTransferSearch('');
                      setTransferResults([]);
                      setTransferMessage('');
                    }
                  }}
                >
                  {transferSending ? <ActivityIndicator size="small" color="#FFF" /> : (
                    <>
                      <MaterialIcons name="send" size={18} color="#FFF" />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{language === 'fr' ? 'Envoyer la demande' : 'Send Request'}</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Meetup Invitation Picker */}
      <Modal visible={showMeetupPicker} animationType="slide" transparent onRequestClose={() => setShowMeetupPicker(false)}>
        <View style={s.mipOverlay}>
          <View style={s.mipContent}>
            <View style={s.mipHeader}>
              <View style={{ flex: 1 }}><Text style={s.mipTitle}>{t('meetup', 'inviteToMeetup')}</Text><Text style={s.mipSubtitle}>{player?.name}</Text></View>
              <Pressable style={s.mipClose} onPress={() => setShowMeetupPicker(false)}><MaterialIcons name="close" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <Text style={s.mipDesc}>{t('meetup', 'chooseMeetup')}</Text>
            {loadingMeetups ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
            ) : activeMeetups.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {activeMeetups.map((m) => {
                  const mDate = new Date(m.date);
                  return (
                    <Pressable key={m.id} style={[s.mipItem, invitingToMeetup === m.id && { opacity: 0.6 }]} disabled={!!invitingToMeetup} onPress={async () => {
                      if (!playerUserId) return;
                      setInvitingToMeetup(m.id);
                      const { error } = await inviteSingleUserToMeetup(m.id, playerUserId);
                      setInvitingToMeetup(null);
                      if (error === 'already_participant') { showAlert(t('meetup', 'alreadyParticipant')); }
                      else if (error) { showAlert(t('common', 'error'), error); }
                      else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showAlert(t('meetup', 'inviteSentSuccess'), t('meetup', 'inviteSentSuccessDesc')); setShowMeetupPicker(false); }
                    }}>
                      <View style={s.mipItemDate}><Text style={s.mipItemDay}>{mDate.getDate()}</Text><Text style={s.mipItemMonth}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}><Text style={s.mipItemTitle} numberOfLines={1}>{m.title}</Text><Text style={s.mipItemTime}>{mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>
                      {invitingToMeetup === m.id ? <ActivityIndicator size="small" color={theme.primary} /> : (<View style={s.mipArrow}><MaterialIcons name="send" size={16} color={theme.primary} /></View>)}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="event-busy" size={40} color={theme.textMuted} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>{t('meetup', 'noActiveMeetups')}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 }}>{t('meetup', 'noActiveMeetupsDesc')}</Text>
                <Pressable style={s.mipCreateBtn} onPress={() => { setShowMeetupPicker(false); router.push('/meetup/new' as any); }}><MaterialIcons name="add" size={18} color="#FFF" /><Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('meetup', 'createMeetupFirst')}</Text></Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.success + '15', borderRadius: 20 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  tabletRow: { flexDirection: 'row' as const, gap: 16, marginBottom: 4 },
  tabletLeft: { flex: 1 },
  tabletRight: { flex: 1 },
  heroCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 24, alignItems: 'center', marginBottom: 16, ...theme.shadows.card },
  avatarContainer: { position: 'relative', marginBottom: 14 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#FFF' },
  roleBadgeOnAvatar: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.surface },
  heroNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, marginBottom: 4 },
  heroName: { fontSize: 24, fontWeight: '700', color: theme.textPrimary },
  premiumBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#E8E8E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C0C0C040' },
  premiumBadgeText: { fontSize: 11, fontWeight: '700' as const, color: '#808080', letterSpacing: 0.5 },
  ambassadorBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#7C3AED12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: '#7C3AED30' },
  ambassadorBadgeText: { fontSize: 11, fontWeight: '700' as const, color: '#7C3AED', letterSpacing: 0.5 },
  ambSocialRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'center' as const, gap: 8, marginBottom: 8, marginTop: 4 },
  ambSocialBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  ambSocialText: { fontSize: 12, fontWeight: '600' as const },
  ambPageBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#7C3AED10', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#7C3AED25' },
  ambPageBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#7C3AED' },
  heroNickname: { fontSize: 15, fontStyle: 'italic' as const, color: theme.textSecondary, marginBottom: 8 },
  heroIdentityBlock: { alignItems: 'center' as const, marginBottom: 4 },
  heroSectionBlock: { width: '100%' as const, paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  heroSectionBlockHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginBottom: 8 },
  heroSectionBlockLabel: { fontSize: 9, fontWeight: '800' as const, color: theme.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 12, marginTop: 4 },
  pillBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillBadgeText: { fontSize: 13, fontWeight: '600' },
  infoPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  infoPillText: { fontSize: 13, fontWeight: '600' },
  contactPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  contactPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '10', borderRadius: 20 },
  contactPillText: { fontSize: 13, fontWeight: '500', color: theme.primary },
  trustScoreBadge: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, marginBottom: 14, borderWidth: 1, width: '100%' },
  trustScoreIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 2 },
  trustScoreInfo: { flex: 1 },
  trustScoreTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 6 },
  trustScoreLabel: { fontSize: 14, fontWeight: '700' as const },
  trustScoreValue: { fontSize: 13, fontWeight: '800' as const },
  trustScoreBarTrack: { height: 5, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' as const, marginBottom: 6 },
  trustScoreBarFill: { height: '100%' as const, borderRadius: 3 },
  trustScoreDesc: { fontSize: 11, color: theme.textSecondary, lineHeight: 15 },
  leaderboardProgressCard: { backgroundColor: '#D9770608', borderRadius: 14, padding: 12, width: '100%', marginBottom: 14, borderWidth: 1, borderColor: '#D9770620' },
  leaderboardProgressHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
  leaderboardProgressTitle: { fontSize: 13, fontWeight: '700' as const, color: '#92400E', flex: 1 },
  leaderboardProgressMotivation: { fontSize: 10, fontWeight: '600' as const, color: '#B45309', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' as const },
  leaderboardProgressTrack: { height: 6, backgroundColor: '#D9770615', borderRadius: 3, overflow: 'hidden' as const, marginBottom: 6 },
  leaderboardProgressFill: { height: '100%' as const, backgroundColor: '#D97706', borderRadius: 3 },
  leaderboardProgressDesc: { fontSize: 11, color: '#92400E', fontWeight: '500' as const },
  locationPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginBottom: 16 },
  locationPillText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
  quickStatsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg, paddingVertical: 14, paddingHorizontal: 16, width: '100%' },
  quickStatItem: { alignItems: 'center', flex: 1 },
  quickStatValue: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
  quickStatLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
  quickStatDivider: { width: 1, height: 28, backgroundColor: theme.border, marginHorizontal: 8 },
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 17, marginBottom: 12 },
  radarContainer: { alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegend: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  radarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  radarLegendTexts: { flex: 1 },
  radarLegendLabel: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  radarLegendDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  radarLegendValue: { fontSize: 14, fontWeight: '700' },
  prefItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  prefItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefItemInfo: { flex: 1 },
  prefItemLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  prefItemValue: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },
  prefItemPct: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  matchStatRow: { marginBottom: 16 },
  matchStatLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  matchStatLabel: { fontSize: 13, fontWeight: '600' },
  progressBarTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: theme.backgroundSecondary },
  progressBarFill: { height: '100%' },
  modeBreakdownRow: { flexDirection: 'row', gap: 10 },
  modeBreakdownItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12 },
  modeBreakdownIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeBreakdownValue: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  modeBreakdownLabel: { fontSize: 10, color: theme.textMuted },
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  perfIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  perfInfo: { flex: 1 },
  perfTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  perfLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  perfValue: { fontSize: 20, fontWeight: '800' },
  perfBarTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  perfBarFill: { height: '100%', borderRadius: 3 },
  perfSubtext: { fontSize: 11, color: theme.textMuted },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  detailLabel: { fontSize: 14, color: theme.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityInfo: { flex: 1 },
  visibilityTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  visibilityDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  visibilityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  visibilityBadgeText: { fontSize: 12, fontWeight: '700' },
  matchCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  matchIndicator: { width: 4, height: 36, borderRadius: 2, marginRight: 12 },
  matchContent: { flex: 1 },
  matchTeams: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  matchMeta: { fontSize: 12, color: theme.textMuted },
  matchScoreBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  matchScoreText: { fontSize: 18, fontWeight: '700', color: theme.textSecondary },
  matchScoreSep: { fontSize: 14, color: theme.textMuted },
  mipOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' as const, paddingHorizontal: 24 },
  mipContent: { backgroundColor: theme.surface, borderRadius: 24, padding: 24 },
  mipHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 },
  mipTitle: { fontSize: 18, fontWeight: '700' as const, color: theme.textPrimary },
  mipSubtitle: { fontSize: 13, color: theme.primary, fontWeight: '600' as const, marginTop: 2 },
  mipClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  mipDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
  mipItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10 },
  mipItemDate: { width: 46, height: 46, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const },
  mipItemDay: { fontSize: 18, fontWeight: '900' as const, color: theme.primary, lineHeight: 20 },
  mipItemMonth: { fontSize: 9, fontWeight: '700' as const, color: theme.primary, letterSpacing: 0.5 },
  mipItemTitle: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary, marginBottom: 2 },
  mipItemTime: { fontSize: 12, color: theme.textMuted },
  mipArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const },
  mipCreateBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },

  // Unified ranking hub
  // Follow stats
  followStatsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: theme.backgroundSecondary, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20, marginBottom: 10, gap: 0 },
  followStatItem: { alignItems: 'center' as const, paddingHorizontal: 14 },
  followStatValue: { fontSize: 17, fontWeight: '800' as const, color: theme.textPrimary },
  followStatLabel: { fontSize: 10, color: theme.textMuted, marginTop: 1, fontWeight: '600' as const },
  followStatDivider: { width: 1, height: 24, backgroundColor: theme.border },

  rankingHub: { width: '100%' as const, marginBottom: 4 },
  // Geo Rank inline
  geoRankInlineCard: { width: '100%' as const, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  geoRankInlineHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
  geoRankInlineTitle: { fontSize: 10, fontWeight: '700' as const, color: theme.textSecondary, letterSpacing: 0.3 },
  geoRankInlineRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  geoRankInlineChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  geoRankInlineLabel: { fontSize: 10, fontWeight: '600' as const, color: theme.textSecondary, maxWidth: 60 },
  geoRankInlineRank: { fontSize: 14, fontWeight: '900' as const },
  geoRankInlineTotal: { fontSize: 9, fontWeight: '600' as const, color: theme.textMuted },
});
