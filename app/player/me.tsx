import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import Svg, { Polygon, Line, Circle as SvgCircle, Text as SvgText, G } from 'react-native-svg';
import theme, { blurhash } from '@/constants/theme';
import { useAppData, useAppActions, useAppUI } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import ShareModal from '@/components/ui/ShareModal';
import { toggleItemPublic } from '@/services/publicItemsService';
import { getEloRank, ELO_INITIAL } from '@/services/eloService';
import { LEADERBOARD_MIN_MATCHES, fetchMultiPlayerMatchCount } from '@/services/leaderboardService';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { fetchPlayerGeoRank, PlayerGeoRank } from '@/services/geoLeaderboardService';
import GlobalRankBadge from '@/components/feature/player/GlobalRankBadge';
import EloSparkline from '@/components/feature/player/EloSparkline';
import { getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';
import SponsoredItemBanner from '@/components/ui/SponsoredItemBanner';
import ProfileCompletenessCard from '@/components/feature/ProfileCompletenessCard';

// ============================================
// Mini Radar Chart for preferences
// ============================================
function MiniRadar({ data, labels, colors, size }: {
  data: { label: string; value: number; color: string }[];
  labels: string[];
  colors: string[];
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

export default function MyPlayerCardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { selfPlayer, userStats, challengeStats, matches, challenges, players, boulesSets, loading } = useAppData();
  const { setItemPublic, getTerrainById, updatePlayer } = useAppActions();
  const { isPremium } = useAppUI();
  const { showAlert } = useAlert();
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [isPublic, setIsPublic] = React.useState(selfPlayer?.isPublic ?? false);
  const [togglingPublic, setTogglingPublic] = React.useState(false);
  const [showPublicPreview, setShowPublicPreview] = React.useState(false);

  const [previewShowContacts, setPreviewShowContacts] = React.useState(false);
  const [ambassadorData, setAmbassadorData] = React.useState<Ambassador | null>(null);
  const [geoRank, setGeoRank] = React.useState<PlayerGeoRank | null>(null);

  // Leaderboard qualification
  const [multiPlayerMatchCount, setMultiPlayerMatchCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!user?.id) return;
    fetchMultiPlayerMatchCount(user.id).then(setMultiPlayerMatchCount).catch(() => {});
  }, [user?.id]);

  // ELO history for sparkline
  const [eloHistory, setEloHistory] = React.useState<any[]>([]);
  const [roleElos, setRoleElos] = React.useState<{ tireur: number; pointeur: number; milieu: number } | null>(null);
  React.useEffect(() => {
    if (!selfPlayer?.id) return;
    const { fetchEloHistory: fetchHist, fetchPlayerRoleElos } = require('@/services/eloService');
    fetchHist(selfPlayer.id, 30).then(({ history }: any) => setEloHistory(history)).catch(() => {});
    fetchPlayerRoleElos(selfPlayer.id).then((re: any) => setRoleElos(re)).catch(() => {});
  }, [selfPlayer?.id]);

  const eloChartData = React.useMemo(() => {
    if (eloHistory.length === 0) return null;
    const sorted = [...eloHistory].reverse();
    const points = sorted.map((h: any) => h.eloAfter);
    const min = Math.min(...points, 1000) - 30;
    const max = Math.max(...points, 1000) + 30;
    const currentElo = sorted[sorted.length - 1]?.eloAfter || selfPlayer?.eloRating || 1000;
    const weekAgoElo = sorted.length > 7 ? sorted[sorted.length - 8]?.eloAfter : sorted[0]?.eloAfter || 1000;
    const weekDelta = currentElo - weekAgoElo;
    return { points, min, max, currentElo, weekDelta, entries: sorted };
  }, [eloHistory, selfPlayer?.eloRating]);

  const [screenDims, setScreenDims] = React.useState(() => Dimensions.get('window'));
  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenDims(window));
    return () => sub?.remove();
  }, []);
  const screenWidth = Math.max(1, screenDims.width);
  const isTablet = screenWidth >= 600;

  React.useEffect(() => {
    if (selfPlayer) setIsPublic(selfPlayer.isPublic ?? false);
  }, [selfPlayer?.isPublic]);

  // Load ambassador data for self player
  React.useEffect(() => {
    if (!selfPlayer || !user) return;
    fetchAmbassadors().then(({ ambassadors }) => {
      const amb = ambassadors.find(a => a.playerId === selfPlayer.id || a.userId === user.id);
      setAmbassadorData(amb || null);
    });
  }, [selfPlayer?.id, user?.id]);

  // Load geo rank (always for self; private profiles get preview ranks — see fetchPlayerGeoRank previewWhilePrivate)
  React.useEffect(() => {
    if (!selfPlayer?.id) return;
    fetchPlayerGeoRank(selfPlayer.id, { previewWhilePrivate: !selfPlayer.isPublic })
      .then(({ geoRank: gr }) => setGeoRank(gr))
      .catch(() => {});
  }, [selfPlayer?.isPublic, selfPlayer?.id]);

  // Direct contact toggle (independent of public profile toggle)
  const [togglingContacts, setTogglingContacts] = React.useState(false);
  const handleToggleContactVisibility = React.useCallback(async () => {
    if (!selfPlayer || togglingContacts) return;
    Haptics.selectionAsync();
    setTogglingContacts(true);
    const newVal = !(selfPlayer.showContactPublic ?? false);
    try {
      await updatePlayer(selfPlayer.id, { showContactPublic: newVal });
    } catch (e: any) {
      showAlert(t('common', 'error'), e.message);
    }
    setTogglingContacts(false);
  }, [selfPlayer, togglingContacts, updatePlayer, showAlert, t]);

  const handleTogglePublic = React.useCallback(() => {
    if (!selfPlayer || togglingPublic) return;
    Haptics.selectionAsync();
    setPreviewShowContacts(selfPlayer.showContactPublic ?? false);
    setShowPublicPreview(true);
  }, [selfPlayer, togglingPublic]);

  const handleConfirmPublic = React.useCallback(async () => {
    if (!selfPlayer) return;
    setTogglingPublic(true);
    Haptics.selectionAsync();
    const newVal = !isPublic;
    const { error } = await toggleItemPublic('players', selfPlayer.id, newVal);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      setIsPublic(newVal);
      setItemPublic('players', selfPlayer.id, newVal);
      await updatePlayer(selfPlayer.id, { showContactPublic: previewShowContacts });
    }
    setTogglingPublic(false);
    setShowPublicPreview(false);
  }, [selfPlayer, isPublic, togglingPublic, previewShowContacts, showAlert, t, updatePlayer]);

  const handleOpenShare = React.useCallback(() => {
    if (!selfPlayer) return;
    Haptics.selectionAsync();
    setShowShareModal(true);
  }, [selfPlayer]);

  const profileTerrainEntity = selfPlayer?.terrainId ? getTerrainById(selfPlayer.terrainId) : null;
  const profileTerrainName = profileTerrainEntity?.name || selfPlayer?.terrainName || null;

  // Role analysis
  const roleAnalysis = React.useMemo(() => {
    if (!selfPlayer) return { roleCounts: {} as Record<string, number>, totalWithRoles: 0, preferredRole: 'Milieu' };
    const roleCounts: Record<string, number> = { 'Pointeur': 0, 'Milieu': 0, 'Tireur': 0 };
    matches.forEach(match => {
      if (match.teamA.playerRoles) {
        match.teamA.playerRoles.forEach(pr => {
          if (pr.playerId === selfPlayer.id && roleCounts[pr.role] !== undefined) roleCounts[pr.role]++;
        });
      }
    });
    const totalWithRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);
    const preferredRole = totalWithRoles > 0
      ? Object.entries(roleCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0]
      : selfPlayer?.role || 'Milieu';
    return { roleCounts, totalWithRoles, preferredRole };
  }, [matches, selfPlayer]);

  const roleIcons: Record<string, { icon: string; color: string }> = {
    'Pointeur': { icon: 'radio-button-on', color: '#3B82F6' },
    'Milieu': { icon: 'swap-horiz', color: '#8B5CF6' },
    'Tireur': { icon: 'gps-fixed', color: '#F97316' },
  };

  // Terrain analysis
  const terrainAnalysis = React.useMemo(() => {
    if (!selfPlayer) return { terrainCounts: {} as Record<string, number>, totalWithTerrain: 0, preferredTerrain: '' };
    const terrainCounts: Record<string, number> = {};
    matches.forEach(match => { if (match.terrainType) terrainCounts[match.terrainType] = (terrainCounts[match.terrainType] || 0) + 1; });
    const totalWithTerrain = Object.values(terrainCounts).reduce((a, b) => a + b, 0);
    const preferredTerrain = totalWithTerrain > 0 ? Object.entries(terrainCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0] : '';
    return { terrainCounts, totalWithTerrain, preferredTerrain };
  }, [matches, selfPlayer]);

  // Partner analysis
  const partnerAnalysis = React.useMemo(() => {
    if (!selfPlayer) return { partnerCounts: {} as Record<string, { count: number; name: string }>, totalWithPartners: 0, preferredPartner: { id: '', name: '', count: 0 } };
    const partnerCounts: Record<string, { count: number; name: string }> = {};
    matches.forEach(match => {
      const inTeamA = match.teamA.players.includes(selfPlayer.id);
      const inTeamB = match.teamB.players.includes(selfPlayer.id);
      if (inTeamA && match.teamA.players.length > 1) {
        match.teamA.players.forEach((pid, idx) => {
          if (pid !== selfPlayer.id) {
            if (!partnerCounts[pid]) partnerCounts[pid] = { count: 0, name: match.teamA.playerNames[idx] || pid };
            partnerCounts[pid].count++;
          }
        });
      } else if (inTeamB && match.teamB.players.length > 1) {
        match.teamB.players.forEach((pid, idx) => {
          if (pid !== selfPlayer.id) {
            if (!partnerCounts[pid]) partnerCounts[pid] = { count: 0, name: match.teamB.playerNames[idx] || pid };
            partnerCounts[pid].count++;
          }
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
  }, [matches, selfPlayer]);

  // Preferred boules
  const preferredBoulesAnalysis = React.useMemo(() => {
    if (!selfPlayer || boulesSets.length === 0) return null;
    const pid = selfPlayer.id;
    const role = selfPlayer.role || 'Milieu';
    const setPerf: Record<string, { matches: number; wins: number; tirsSuccess: number; totalTirs: number; pointsSuccess: number; totalPoints: number; carreaux: number }> = {};
    matches.forEach(m => {
      if (!m.boulesSetId) return;
      const inA = m.teamA.players.includes(pid);
      const inB = m.teamB.players.includes(pid);
      if (!inA && !inB) return;
      if (!setPerf[m.boulesSetId]) setPerf[m.boulesSetId] = { matches: 0, wins: 0, tirsSuccess: 0, totalTirs: 0, pointsSuccess: 0, totalPoints: 0, carreaux: 0 };
      const s = setPerf[m.boulesSetId];
      s.matches++;
      if ((inA && m.winner === 'A') || (inB && m.winner === 'B')) s.wins++;
      if (m.playerActions) {
        const pa = m.playerActions.find(a => a.playerId === pid);
        if (pa) { s.tirsSuccess += pa.actions.tirsSuccess; s.totalTirs += pa.actions.tirs; s.pointsSuccess += pa.actions.pointsSuccess; s.totalPoints += pa.actions.points; s.carreaux += pa.actions.carreaux; }
      }
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
  }, [selfPlayer?.id, selfPlayer?.role, matches, boulesSets]);

  // Shot stats
  let totalTirs = 0, totalTirsSuccess = 0, totalPoints = 0, totalPointsSuccess = 0, totalCarreaux = 0, totalDevantBoule = 0, totalPointQualitiesSuccess = 0;
  matches.forEach(m => {
    if (m.playerActions) {
      m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        totalTirs += pa.actions.tirs;
        totalTirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        totalPointsSuccess += pa.actions.pointsSuccess;
        totalCarreaux += pa.actions.carreaux;
        if ((pa as any).detailedShots) {
          (pa as any).detailedShots.filter((s: any) => s.actionType === 'point' && s.success && s.pointQuality).forEach((s: any) => {
            totalPointQualitiesSuccess++;
            if (s.pointQuality === 'devant_boule') totalDevantBoule++;
          });
        }
      });
    }
  });
  const tirRate = totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 100) : 0;
  const pointRate = totalPoints > 0 ? Math.round((totalPointsSuccess / totalPoints) * 100) : 0;
  const carreauRate = totalTirsSuccess > 0 ? Math.round((totalCarreaux / totalTirsSuccess) * 100) : 0;
  const devantBouleRate = totalPointQualitiesSuccess > 0 ? Math.round((totalDevantBoule / totalPointQualitiesSuccess) * 100) : 0;

  const totalMatches = matches.length;
  const tournamentMatches = matches.filter(m => m.mode === 'Tournoi');
  const trainingMatches = matches.filter(m => m.mode === 'Entraînement');

  // Radar data for preferences
  const radarData = React.useMemo(() => {
    if (!selfPlayer) return [];
    const rolePct = roleAnalysis.totalWithRoles > 0 ? Math.round((roleAnalysis.roleCounts[roleAnalysis.preferredRole] / roleAnalysis.totalWithRoles) * 100) : 50;
    const terrainPct = terrainAnalysis.totalWithTerrain > 0 ? Math.round((terrainAnalysis.terrainCounts[terrainAnalysis.preferredTerrain] / terrainAnalysis.totalWithTerrain) * 100) : 50;
    const partnerPct = partnerAnalysis.totalWithPartners > 0 ? Math.round((partnerAnalysis.preferredPartner.count / partnerAnalysis.totalWithPartners) * 100) : 50;
    return [
      { label: t('gamePreferences', 'roleLabel'), value: rolePct, color: roleIcons[roleAnalysis.preferredRole]?.color || theme.primary },
      { label: t('gamePreferences', 'terrainLabel'), value: terrainPct, color: theme.success },
      { label: t('gamePreferences', 'partnerLabel'), value: partnerPct, color: '#EC4899' },
      { label: t('gamePreferences', 'winLabel'), value: userStats.winRate, color: theme.carreauColor },
      { label: t('gamePreferences', 'shotLabel'), value: tirRate, color: theme.accent },
    ];
  }, [selfPlayer, roleAnalysis, terrainAnalysis, partnerAnalysis, userStats.winRate, tirRate, language]);

  if (!selfPlayer) {
    if (loading) {
      return (
        <SafeAreaView style={s.container}>
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={s.loadingText}>{t('player', 'loadingCard')}</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{t('player', 'myPlayerCard')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingContainer}>
          <MaterialIcons name="person-outline" size={48} color={theme.textSecondary} />
          <Text style={[s.loadingText, { marginTop: 16, textAlign: 'center', paddingHorizontal: 24 }]}>
            {t('player', 'noPlayerCard')}
          </Text>
          <Pressable
            style={[s.headerIconBtn, { marginTop: 24, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: theme.primary }]}
            onPress={() => router.push({ pathname: '/profile', params: { edit: 'true' } } as any)}
          >
            <Text style={{ color: '#FFF', fontWeight: '600' }}>{t('player', 'editMyProfile')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{t('player', 'myPlayerCard')}</Text>
        <View style={s.headerActions}>
          <Pressable style={s.headerIconBtn} onPress={handleOpenShare}>
            <MaterialIcons name="share" size={20} color={theme.success} />
          </Pressable>
          <Pressable style={[s.headerIconBtn, { backgroundColor: theme.primary + '15' }]} onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/profile', params: { edit: 'true' } } as any); }}>
            <MaterialIcons name="edit" size={20} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={s.scrollView} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.scrollContentTablet]} showsVerticalScrollIndicator={false}>
        <View style={s.sectionCard}>
          <View style={isTablet ? s.tabletLeft : undefined}>

            {/* ===== HERO CARD (matching profile style) ===== */}
            <View style={ambassadorData ? s.heroCardAmbassador : s.heroCard}>
              {/* Ambassador prestige header */}
              {ambassadorData ? (
                <View style={s.ambPrestigeHeader}>
                  <View style={s.ambPrestigeIconWrap}>
                    <MaterialIcons name="verified" size={20} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.ambPrestigeTitle}>
                      {ambassadorData.badgeType === 'sponsor' ? 'Sponsor' : ambassadorData.badgeType === 'partner' ? (language === 'fr' ? 'Partenaire Officiel' : 'Official Partner') : (language === 'fr' ? 'Ambassadeur Officiel' : 'Official Ambassador')}
                    </Text>
                    <Text style={s.ambPrestigeSubtitle}>Ultimate Petanque</Text>
                  </View>
                  <Pressable
                    style={s.ambPrestigePortalBtn}
                    onPress={() => { Haptics.selectionAsync(); router.push('/ambassador-dashboard' as any); }}
                  >
                    <MaterialIcons name="dashboard" size={14} color="#FFF" />
                    <Text style={s.ambPrestigePortalText}>{language === 'fr' ? 'Portail' : 'Portal'}</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* ── BLOC 1: IDENTITE ── */}
              <View style={s.heroIdentityBlock}>
                {/* Avatar */}
                <View style={s.avatarContainer}>
                  <View style={ambassadorData ? s.avatarAmbassador : s.avatar}>
                    {selfPlayer.avatar ? (
                      <Image source={{ uri: selfPlayer.avatar }} style={ambassadorData ? s.avatarImageAmbassador : s.avatarImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                    ) : (
                      <Text style={s.avatarText}>{selfPlayer.name?.charAt(0).toUpperCase() || '?'}</Text>
                    )}
                  </View>
                  <View style={[s.roleBadgeOnAvatar, { backgroundColor: getRoleColor(selfPlayer.role) }]}>
                    <MaterialIcons name={getRoleIcon(selfPlayer.role)} size={14} color="#FFF" />
                  </View>
                </View>

                {/* Name & Nickname */}
                <View style={s.heroNameRow}>
                  <Text style={s.heroName}>{selfPlayer.name}</Text>
                  {ambassadorData ? (
                    <View style={s.ambassadorBadge}>
                      <MaterialIcons name="verified" size={12} color="#7C3AED" />
                    </View>
                  ) : isPremium ? (
                    <View style={s.premiumBadge}>
                      <MaterialIcons name="star" size={12} color="#C0C0C0" />
                      <Text style={s.premiumBadgeText}>Premium</Text>
                    </View>
                  ) : null}
                </View>
                {selfPlayer.nickname ? <Text style={s.heroNickname}>"{selfPlayer.nickname}"</Text> : null}
              </View>

              {/* ── PROFILE COMPLETENESS ── */}
              <View style={{ width: '100%', marginTop: 6 }}>
                <ProfileCompletenessCard player={selfPlayer} language={language} compact />
              </View>

              {/* ── LEADERBOARD QUALIFICATION ── */}
              {multiPlayerMatchCount !== null && multiPlayerMatchCount < LEADERBOARD_MIN_MATCHES && isPublic ? (
                <Pressable style={s.qualificationCard} onPress={() => router.push('/leaderboard' as any)}>
                  <View style={s.qualificationHeader}>
                    <View style={s.qualificationIconBg}>
                      <MaterialIcons name="leaderboard" size={16} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.qualificationTitle}>{language === 'fr' ? 'Qualification Classement' : 'Leaderboard Qualification'}</Text>
                      <Text style={s.qualificationSub}>{multiPlayerMatchCount}/{LEADERBOARD_MIN_MATCHES} {language === 'fr' ? 'matchs multi-joueurs' : 'multi-player matches'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="#D97706" />
                  </View>
                  <View style={s.qualificationBarTrack}>
                    <View style={[s.qualificationBarFill, { width: `${(multiPlayerMatchCount / LEADERBOARD_MIN_MATCHES) * 100}%` }]} />
                  </View>
                  <Text style={s.qualificationHint}>
                    {multiPlayerMatchCount === 0
                      ? (language === 'fr' ? 'Partagez un match avec un joueur reel pour commencer' : 'Share a match with a real player to start')
                      : multiPlayerMatchCount === 2
                        ? (language === 'fr' ? 'Encore 1 match ! Vous y etes presque' : 'Just 1 more match! Almost there')
                        : (language === 'fr' ? `Encore ${LEADERBOARD_MIN_MATCHES - multiPlayerMatchCount} match(s) pour apparaitre` : `${LEADERBOARD_MIN_MATCHES - multiPlayerMatchCount} more match(es) to appear`)}
                  </Text>
                </Pressable>
              ) : null}

              {/* ── BLOC 2: JEU ── */}
              <View style={s.heroSectionBlock}>
                <View style={s.heroSectionBlockHeader}>
                  <MaterialIcons name="sports" size={12} color={theme.textMuted} />
                  <Text style={s.heroSectionBlockLabel}>{language === 'fr' ? 'JEU' : 'GAME'}</Text>
                </View>
                <View style={s.badgesRow}>
                  <View style={[s.pillBadge, { backgroundColor: getRoleColor(selfPlayer.role) + '15' }]}>
                    <MaterialIcons name={getRoleIcon(selfPlayer.role)} size={14} color={getRoleColor(selfPlayer.role)} />
                    <Text style={[s.pillBadgeText, { color: getRoleColor(selfPlayer.role) }]}>{t('roles', selfPlayer.role)}</Text>
                  </View>
                  {selfPlayer.handedness ? (
                    <View style={[s.pillBadge, { backgroundColor: '#6366F1' + '15' }]}>
                      <MaterialIcons name={selfPlayer.handedness === 'left' ? 'front-hand' : selfPlayer.handedness === 'ambidextrous' ? 'swap-horiz' : 'back-hand'} size={14} color="#6366F1" />
                      <Text style={[s.pillBadgeText, { color: '#6366F1' }]}>
                        {selfPlayer.handedness === 'right' ? t('player', 'rightHanded') : selfPlayer.handedness === 'left' ? t('player', 'leftHanded') : t('player', 'ambidextrous')}
                      </Text>
                    </View>
                  ) : null}
                  {selfPlayer.experience ? (
                    <View style={[s.pillBadge, { backgroundColor: '#9333EA' + '15' }]}>
                      <MaterialIcons name="timeline" size={14} color="#9333EA" />
                      <Text style={[s.pillBadgeText, { color: '#9333EA' }]}>
                        {t('player', selfPlayer.experience === 'less_than_1' ? 'experienceLessThan1' : selfPlayer.experience === '1_to_3' ? 'experience1to3' : selfPlayer.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* ── BLOC 2b: ELO (clickable → palmares) ── */}
              {selfPlayer.eloRating ? (() => {
                const eloR = getEloRank(selfPlayer.eloRating);
                return (
                  <Pressable style={s.heroSectionBlock} onPress={() => router.push('/elo-awards' as any)}>
                    <View style={s.heroSectionBlockHeader}>
                      <MaterialIcons name={eloR.icon as any} size={12} color={eloR.color} />
                      <Text style={[s.heroSectionBlockLabel, { color: eloR.color }]}>ELO</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                      <Text style={{ fontSize: 28, fontWeight: '900', color: eloR.color }}>{selfPlayer.eloRating}</Text>
                      <View style={{ backgroundColor: eloR.color + '15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: eloR.color + '30' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: eloR.color }}>{eloR.label[language === 'fr' ? 'fr' : 'en']}</Text>
                      </View>
                    </View>
                    {/* ELO Sparkline Chart */}
                    {eloChartData && eloChartData.points.length >= 3 ? (
                      <View style={{ alignItems: 'center', marginBottom: 8 }}>
                        <EloSparkline
                          points={eloChartData.entries.map((e: any) => ({ elo: e.eloAfter, won: e.won }))}
                          currentElo={eloChartData.currentElo}
                          weekDelta={eloChartData.weekDelta}
                          width={Math.min(screenWidth - 120, 220)}
                          height={40}
                          language={language}
                        />
                      </View>
                    ) : null}
                    {/* ELO by Role */}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{language === 'fr' ? 'Voir mon palmares' : 'View my awards'}</Text>
                      <MaterialIcons name="chevron-right" size={14} color={theme.textMuted} />
                    </View>
                  </Pressable>
                );
              })() : null}

              {/* ── BLOC: GLOBAL RANK & LEAGUE TIER ── */}
              <View style={s.heroSectionBlock}>
                <GlobalRankBadge
                  playerId={selfPlayer.id}
                  playerUserId={user?.id}
                  eloRating={selfPlayer.eloRating || 1000}
                  isPublic={isPublic}
                  language={language}
                  compact
                />
              </View>

              {/* ── BLOC 2c: GEO RANKING (between ELO and LIEU) ── */}
              {geoRank && (geoRank.city || geoRank.country || geoRank.continent) ? (
                !isPublic ? (
                  <View style={[s.geoRankRow, s.geoRankLockedCard]}>
                    <View style={s.geoRankHeader}>
                      <MaterialIcons name="lock" size={14} color={theme.textMuted} />
                      <Text style={[s.geoRankTitle, s.geoRankLockedTitle]}>
                        {language === 'fr' ? 'Classement Geo' : 'Geo Ranking'}
                      </Text>
                    </View>
                    <Text style={s.geoRankHiddenExplainer}>{t('player', 'geoRankHiddenMessage')}</Text>
                    <View style={s.geoRankPublicToggleRow}>
                      <Text style={s.geoRankPublicToggleLabel}>{t('player', 'geoRankPublicCtaLabel')}</Text>
                      <Switch
                        value={false}
                        onValueChange={(v) => {
                          if (v) handleTogglePublic();
                        }}
                        trackColor={{ false: theme.border, true: theme.success + '80' }}
                        thumbColor="#FFF"
                      />
                    </View>
                    <View style={s.geoRankPreviewDimmed} pointerEvents="none">
                      <View style={s.geoRankBadges}>
                        {geoRank.continent ? (
                          <View style={[s.geoRankBadge, { borderColor: '#F59E0B25', opacity: 0.5 }]}>
                            <Text style={{ fontSize: 12 }}>{getContinentFlag(geoRank.continent.name)}</Text>
                            <Text style={[s.geoRankBadgeRank, { color: theme.textMuted }]}>#{geoRank.continent.rank}</Text>
                            <Text style={s.geoRankBadgeTotal}>/{geoRank.continent.total}</Text>
                          </View>
                        ) : null}
                        {geoRank.country ? (
                          <View style={[s.geoRankBadge, { borderColor: '#10B98125', opacity: 0.5 }]}>
                            <Text style={{ fontSize: 12 }}>{getCountryFlag(geoRank.country.name)}</Text>
                            <Text style={[s.geoRankBadgeRank, { color: theme.textMuted }]}>#{geoRank.country.rank}</Text>
                            <Text style={s.geoRankBadgeTotal}>/{geoRank.country.total}</Text>
                          </View>
                        ) : null}
                        {geoRank.city ? (
                          <View style={[s.geoRankBadge, { borderColor: '#3B82F625', opacity: 0.5 }]}>
                            <MaterialIcons name="location-city" size={12} color={theme.textMuted} />
                            <Text style={[s.geoRankBadgeRank, { color: theme.textMuted }]}>#{geoRank.city.rank}</Text>
                            <Text style={s.geoRankBadgeTotal}>/{geoRank.city.total}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ) : (
                  <Pressable style={s.geoRankRow} onPress={() => router.push('/leaderboard-geo' as any)}>
                    <View style={s.geoRankHeader}>
                      <MaterialIcons name="public" size={14} color="#3B82F6" />
                      <Text style={s.geoRankTitle}>{language === 'fr' ? 'Classement Geo' : 'Geo Ranking'}</Text>
                      <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
                    </View>
                    <View style={s.geoRankBadges}>
                      {geoRank.continent ? (
                        <Pressable style={[s.geoRankBadge, { borderColor: '#F59E0B25' }]} onPress={() => router.push({ pathname: '/city-leaderboard', params: { type: 'continent', value: geoRank.continent!.name } } as any)}>
                          <Text style={{ fontSize: 12 }}>{getContinentFlag(geoRank.continent.name)}</Text>
                          <Text style={[s.geoRankBadgeRank, { color: geoRank.continent.rank <= 3 ? '#F59E0B' : theme.textSecondary }]}>#{geoRank.continent.rank}</Text>
                          <Text style={s.geoRankBadgeTotal}>/{geoRank.continent.total}</Text>
                        </Pressable>
                      ) : null}
                      {geoRank.country ? (
                        <Pressable style={[s.geoRankBadge, { borderColor: '#10B98125' }]} onPress={() => router.push({ pathname: '/city-leaderboard', params: { type: 'country', value: geoRank.country!.name } } as any)}>
                          <Text style={{ fontSize: 12 }}>{getCountryFlag(geoRank.country.name)}</Text>
                          <Text style={[s.geoRankBadgeRank, { color: geoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }]}>#{geoRank.country.rank}</Text>
                          <Text style={s.geoRankBadgeTotal}>/{geoRank.country.total}</Text>
                        </Pressable>
                      ) : null}
                      {geoRank.city ? (
                        <Pressable style={[s.geoRankBadge, { borderColor: '#3B82F625' }]} onPress={() => router.push({ pathname: '/city-leaderboard', params: { city: geoRank.city!.name } } as any)}>
                          <MaterialIcons name="location-city" size={12} color="#3B82F6" />
                          <Text style={[s.geoRankBadgeRank, { color: geoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }]}>#{geoRank.city.rank}</Text>
                          <Text style={s.geoRankBadgeTotal}>/{geoRank.city.total}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Pressable>
                )
              ) : null}

              {/* ── BLOC 3: LIEU ── */}
              {(selfPlayer.club || profileTerrainName || selfPlayer.location?.city || selfPlayer.country) ? (
                <View style={s.heroSectionBlock}>
                  <View style={s.heroSectionBlockHeader}>
                    <MaterialIcons name="place" size={12} color={theme.textMuted} />
                    <Text style={s.heroSectionBlockLabel}>{language === 'fr' ? 'LIEU' : 'LOCATION'}</Text>
                  </View>
                  {(selfPlayer.club || profileTerrainName) ? (
                    <View style={s.infoPillsRow}>
                      {selfPlayer.club ? (
                        <View style={[s.infoPill, { backgroundColor: theme.carreauColor + '12' }]}>
                          <MaterialIcons name="location-city" size={14} color={theme.carreauColor} />
                          <Text style={[s.infoPillText, { color: theme.carreauColor }]}>{selfPlayer.club}</Text>
                        </View>
                      ) : null}
                      {profileTerrainEntity ? (
                        <Pressable style={[s.infoPill, { backgroundColor: theme.success + '12' }]} onPress={() => router.push(`/terrain/${profileTerrainEntity.id}`)}>
                          <MaterialIcons name="sports-soccer" size={14} color={theme.success} />
                          <Text style={[s.infoPillText, { color: theme.success }]}>{profileTerrainEntity.name}</Text>
                          <MaterialIcons name="chevron-right" size={14} color={theme.success} />
                        </Pressable>
                      ) : profileTerrainName ? (
                        <View style={[s.infoPill, { backgroundColor: theme.success + '12' }]}>
                          <MaterialIcons name="sports-soccer" size={14} color={theme.success} />
                          <Text style={[s.infoPillText, { color: theme.success }]}>{profileTerrainName}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {(selfPlayer.location?.city || selfPlayer.country) ? (
                    <View style={s.locationPill}>
                      <MaterialIcons name="place" size={14} color={theme.textSecondary} />
                      <Text style={s.locationPillText}>{[selfPlayer.location?.city, selfPlayer.country].filter(Boolean).join(', ')}</Text>
                    </View>
                  ) : null}
                  {(selfPlayer.location?.latitude || selfPlayer.location?.longitude) ? (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.success + '10', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, marginBottom: 8, borderWidth: 1, borderColor: theme.success + '25' }}
                      onPress={() => router.push({ pathname: '/(tabs)/map', params: { lat: String(selfPlayer.location?.latitude), lng: String(selfPlayer.location?.longitude), name: selfPlayer.name, mf: String(Date.now()) } } as any)}
                    >
                      <MaterialIcons name="map" size={16} color={theme.success} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.success }}>{language === 'fr' ? 'Voir sur la carte' : 'View on map'}</Text>
                      <MaterialIcons name="chevron-right" size={16} color={theme.success} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* ── BLOC 4: CONTACT & SOCIAL ── */}
              {(selfPlayer.phone || selfPlayer.email || (ambassadorData && (ambassadorData.youtubeUrl || ambassadorData.tiktokUrl || ambassadorData.instagramHandle || ambassadorData.twitterHandle || ambassadorData.websiteUrl))) ? (
                <View style={s.heroSectionBlock}>
                  <View style={s.heroSectionBlockHeader}>
                    <MaterialIcons name="contact-phone" size={12} color={theme.textMuted} />
                    <Text style={s.heroSectionBlockLabel}>{language === 'fr' ? 'CONTACT' : 'CONTACT'}</Text>
                  </View>
                  {/* Ambassador social links */}
                  {ambassadorData && (ambassadorData.youtubeUrl || ambassadorData.tiktokUrl || ambassadorData.instagramHandle || ambassadorData.twitterHandle || ambassadorData.websiteUrl) ? (
                    <View style={s.ambSocialRow}>
                      {ambassadorData.youtubeUrl ? (
                        <Pressable style={[s.ambSocialBtn, { backgroundColor: '#FF0000' + '12' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'youtube'); Linking.openURL(ambassadorData.youtubeUrl!); }}>
                          <MaterialIcons name="play-arrow" size={16} color="#FF0000" />
                          <Text style={[s.ambSocialText, { color: '#FF0000' }]}>YouTube</Text>
                        </Pressable>
                      ) : null}
                      {ambassadorData.tiktokUrl ? (
                        <Pressable style={[s.ambSocialBtn, { backgroundColor: '#000' + '08' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'tiktok'); Linking.openURL(ambassadorData.tiktokUrl!); }}>
                          <MaterialIcons name="music-note" size={16} color="#000" />
                          <Text style={[s.ambSocialText, { color: '#000' }]}>TikTok</Text>
                        </Pressable>
                      ) : null}
                      {ambassadorData.instagramHandle ? (
                        <Pressable style={[s.ambSocialBtn, { backgroundColor: '#E4405F' + '12' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'instagram'); const h = ambassadorData.instagramHandle!.replace('@', ''); Linking.openURL(`https://instagram.com/${h}`); }}>
                          <MaterialIcons name="camera-alt" size={16} color="#E4405F" />
                          <Text style={[s.ambSocialText, { color: '#E4405F' }]}>@{ambassadorData.instagramHandle!.replace('@', '')}</Text>
                        </Pressable>
                      ) : null}
                      {ambassadorData.twitterHandle ? (
                        <Pressable style={[s.ambSocialBtn, { backgroundColor: '#1DA1F2' + '12' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'twitter'); const h = ambassadorData.twitterHandle!.replace('@', ''); Linking.openURL(`https://x.com/${h}`); }}>
                          <MaterialIcons name="alternate-email" size={16} color="#1DA1F2" />
                          <Text style={[s.ambSocialText, { color: '#1DA1F2' }]}>{ambassadorData.twitterHandle}</Text>
                        </Pressable>
                      ) : null}
                      {ambassadorData.websiteUrl ? (
                        <Pressable style={[s.ambSocialBtn, { backgroundColor: theme.primary + '10' }]} onPress={() => { trackAmbassadorEvent(ambassadorData.id, 'social_click', 'website'); const u = ambassadorData.websiteUrl!.startsWith('http') ? ambassadorData.websiteUrl! : `https://${ambassadorData.websiteUrl}`; Linking.openURL(u); }}>
                          <MaterialIcons name="language" size={16} color={theme.primary} />
                          <Text style={[s.ambSocialText, { color: theme.primary }]}>Web</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {(selfPlayer.phone || selfPlayer.email) ? (
                    <View style={s.contactPillsRow}>
                      {selfPlayer.phone ? (
                        <Pressable style={s.contactPill} onPress={() => Linking.openURL(`tel:${selfPlayer.phone}`)}>
                          <MaterialIcons name="phone" size={14} color={theme.primary} />
                          <Text style={s.contactPillText}>{selfPlayer.phone}</Text>
                        </Pressable>
                      ) : null}
                      {selfPlayer.email ? (
                        <Pressable style={s.contactPill} onPress={() => Linking.openURL(`mailto:${selfPlayer.email}`)}>
                          <MaterialIcons name="email" size={14} color={theme.primary} />
                          <Text style={s.contactPillText}>{selfPlayer.email}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Ambassador quick actions */}
              {ambassadorData ? (
                <View style={s.ambQuickActions}>
                  <Pressable
                    style={s.ambQuickActionBtn}
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/ambassadors', params: { scrollTo: ambassadorData.id } } as any); }}
                  >
                    <MaterialIcons name="people" size={14} color="#7C3AED" />
                    <Text style={s.ambQuickActionText}>{language === 'fr' ? 'Ma page' : 'My page'}</Text>
                  </Pressable>
                  <Pressable
                    style={s.ambQuickActionBtn}
                    onPress={() => { Haptics.selectionAsync(); router.push('/sponsored-event/new' as any); }}
                  >
                    <MaterialIcons name="add-circle" size={14} color="#7C3AED" />
                    <Text style={s.ambQuickActionText}>{language === 'fr' ? 'Creer un defi' : 'New challenge'}</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Sponsored Player Banner — inside hero card, at the end */}
              {(selfPlayer as any)?.sponsorId ? (
                <View style={{ width: '100%', marginBottom: 8 }}>
                  <SponsoredItemBanner sponsorId={(selfPlayer as any).sponsorId} page="my-player-card" />
                </View>
              ) : null}

              {/* ── BLOC 5: STATS RAPIDES ── */}
              <View style={s.quickStatsBar}>
                <View style={s.quickStatItem}>
                  <Text style={s.quickStatValue}>{totalMatches}</Text>
                  <Text style={s.quickStatLabel}>{t('player', 'matchesUpper')}</Text>
                </View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}>
                  <Text style={[s.quickStatValue, { color: theme.success }]}>{userStats.wins}</Text>
                  <Text style={s.quickStatLabel}>{t('player', 'victories')}</Text>
                </View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}>
                  <Text style={[s.quickStatValue, { color: theme.accent }]}>{userStats.winRate}%</Text>
                  <Text style={s.quickStatLabel}>{t('player', 'winsLabel')}</Text>
                </View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStatItem}>
                  <Text style={[s.quickStatValue, { color: theme.carreauColor }]}>{challengeStats.totalChallenges}</Text>
                  <Text style={s.quickStatLabel}>{t('player', 'challenges')}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={isTablet ? s.tabletRight : undefined}>

            {/* ===== GAME PREFERENCES with Radar ===== */}
            {(roleAnalysis.totalWithRoles > 0 || terrainAnalysis.totalWithTerrain > 0 || partnerAnalysis.totalWithPartners > 0 || preferredBoulesAnalysis) ? (
              <View style={s.sectionCard}>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionIconBox, { backgroundColor: '#8B5CF6' + '15' }]}>
                    <MaterialIcons name="psychology" size={18} color="#8B5CF6" />
                  </View>
                  <Text style={s.sectionTitle}>{t('gamePreferences', 'title')}</Text>
                </View>
                <Text style={s.sectionDesc}>{t('gamePreferences', 'descSelf')}</Text>

                {/* Mini Radar */}
                {radarData.length >= 3 ? (
                  <View style={s.radarContainer}>
                    <MiniRadar data={radarData} labels={radarData.map(d => d.label)} colors={radarData.map(d => d.color)} size={Math.min(screenWidth - 96, 220)} />
                  </View>
                ) : null}

                {/* Radar Legend */}
                {radarData.length >= 3 ? (
                  <View style={s.radarLegend}>
                    {[
                      { color: radarData[0]?.color, label: radarData[0]?.label, desc: t('gamePreferences', 'roleLoyalty') },
                      { color: radarData[1]?.color, label: radarData[1]?.label, desc: t('gamePreferences', 'terrainLoyalty') },
                      { color: radarData[2]?.color, label: radarData[2]?.label, desc: t('gamePreferences', 'partnerConsistency') },
                      { color: radarData[3]?.color, label: radarData[3]?.label, desc: t('gamePreferences', 'overallWinRate') },
                      { color: radarData[4]?.color, label: radarData[4]?.label, desc: t('gamePreferences', 'shotAccuracy') },
                    ].map((item, i) => (
                      <View key={i} style={s.radarLegendItem}>
                        <View style={[s.radarLegendDot, { backgroundColor: item.color }]} />
                        <View style={s.radarLegendTexts}>
                          <Text style={s.radarLegendLabel}>{item.label}</Text>
                          <Text style={s.radarLegendDesc}>{item.desc}</Text>
                        </View>
                        <Text style={[s.radarLegendValue, { color: item.color }]}>{radarData[i]?.value}%</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Preferred Role */}
                {roleAnalysis.totalWithRoles > 0 ? (
                  <View style={s.prefItem}>
                    <View style={[s.prefItemIcon, { backgroundColor: (roleIcons[roleAnalysis.preferredRole]?.color || theme.primary) + '15' }]}>
                      <MaterialIcons name={(roleIcons[roleAnalysis.preferredRole]?.icon || 'person') as any} size={18} color={roleIcons[roleAnalysis.preferredRole]?.color || theme.primary} />
                    </View>
                    <View style={s.prefItemInfo}>
                      <Text style={s.prefItemLabel}>{t('player', 'preferredRole')}</Text>
                      <Text style={s.prefItemValue}>{t('roles', roleAnalysis.preferredRole)}</Text>
                    </View>
                    <Text style={s.prefItemPct}>{roleAnalysis.totalWithRoles > 0 ? Math.round((roleAnalysis.roleCounts[roleAnalysis.preferredRole] / roleAnalysis.totalWithRoles) * 100) : 0}%</Text>
                  </View>
                ) : null}

                {/* Preferred Terrain */}
                {terrainAnalysis.totalWithTerrain > 0 ? (
                  <View style={s.prefItem}>
                    <View style={[s.prefItemIcon, { backgroundColor: theme.success + '15' }]}>
                      <MaterialIcons name="landscape" size={18} color={theme.success} />
                    </View>
                    <View style={s.prefItemInfo}>
                      <Text style={s.prefItemLabel}>{t('player', 'preferredTerrain')}</Text>
                      <Text style={s.prefItemValue}>{t('terrainTypes', terrainAnalysis.preferredTerrain)}</Text>
                    </View>
                    <Text style={s.prefItemPct}>{Math.round((terrainAnalysis.terrainCounts[terrainAnalysis.preferredTerrain] / terrainAnalysis.totalWithTerrain) * 100)}%</Text>
                  </View>
                ) : null}

                {/* Preferred Partner */}
                {partnerAnalysis.totalWithPartners > 0 ? (() => {
                  const pp = players.find(p => p.id === partnerAnalysis.preferredPartner.id);
                  return (
                    <View style={s.prefItem}>
                      <View style={[s.prefItemIcon, { backgroundColor: '#EC4899' + '15', overflow: 'hidden' }]}>
                        {pp?.avatar ? (
                          <Image source={{ uri: pp.avatar }} style={{ width: 36, height: 36, borderRadius: 10 }} contentFit="cover" />
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#EC4899' }}>{partnerAnalysis.preferredPartner.name.charAt(0)}</Text>
                        )}
                      </View>
                      <View style={s.prefItemInfo}>
                        <Text style={s.prefItemLabel}>{t('player', 'preferredPartner')}</Text>
                        <Text style={s.prefItemValue}>{partnerAnalysis.preferredPartner.name}</Text>
                      </View>
                      <Text style={s.prefItemPct}>{partnerAnalysis.preferredPartner.count} {t('gamePreferences', 'matchesUnit')}</Text>
                    </View>
                  );
                })() : null}

                {/* Preferred Boules */}
                {preferredBoulesAnalysis ? (
                  <View style={s.prefItem}>
                    <View style={[s.prefItemIcon, { backgroundColor: theme.accent + '15' }]}>
                      <MaterialIcons name="sports-baseball" size={18} color={theme.accent} />
                    </View>
                    <View style={s.prefItemInfo}>
                      <Text style={s.prefItemLabel}>{t('equipment', 'preferredBoules')}</Text>
                      <Text style={s.prefItemValue}>{preferredBoulesAnalysis.set.name}</Text>
                    </View>
                    <Text style={s.prefItemPct}>{preferredBoulesAnalysis.stats.matches} {t('gamePreferences', 'matchesUnit')}</Text>
                  </View>
                ) : selfPlayer.boules && (selfPlayer.boules.name || selfPlayer.boules.diameter) ? (
                  <View style={s.prefItem}>
                    <View style={[s.prefItemIcon, { backgroundColor: theme.accent + '15' }]}>
                      <MaterialIcons name="sports-baseball" size={18} color={theme.accent} />
                    </View>
                    <View style={s.prefItemInfo}>
                      <Text style={s.prefItemLabel}>{t('equipment', 'boulesLabel')}</Text>
                      <Text style={s.prefItemValue}>{selfPlayer.boules.name || t('player', 'boulesLabel')}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* ===== MATCH STATISTICS with progress bars ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="sports" size={18} color={theme.primary} />
            </View>
            <Text style={s.sectionTitle}>{t('player', 'matchesSection')}</Text>
          </View>

          {/* Win/Loss bar */}
          <View style={s.matchStatRow}>
            <View style={s.matchStatLabels}>
              <Text style={[s.matchStatLabel, { color: theme.success }]}>{userStats.wins} {t('player', 'won')}</Text>
              <Text style={[s.matchStatLabel, { color: theme.error }]}>{userStats.losses} {t('player', 'lost')}</Text>
            </View>
            <View style={s.progressBarTrack}>
              <View style={[s.progressBarFill, { flex: Math.max(userStats.wins, 0.01), backgroundColor: theme.success }]} />
              <View style={[s.progressBarFill, { flex: Math.max(userStats.losses, 0.01), backgroundColor: theme.error }]} />
            </View>
          </View>

          {/* Mode breakdown */}
          <View style={s.modeBreakdownRow}>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="emoji-events" size={16} color={theme.carreauColor} />
              </View>
              <View>
                <Text style={s.modeBreakdownValue}>{tournamentMatches.length}</Text>
                <Text style={s.modeBreakdownLabel}>{t('player', 'tournaments')}</Text>
              </View>
            </View>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="fitness-center" size={16} color={theme.primary} />
              </View>
              <View>
                <Text style={s.modeBreakdownValue}>{trainingMatches.length}</Text>
                <Text style={s.modeBreakdownLabel}>{t('player', 'trainings')}</Text>
              </View>
            </View>
            <View style={s.modeBreakdownItem}>
              <View style={[s.modeBreakdownIcon, { backgroundColor: theme.textSecondary + '15' }]}>
                <MaterialIcons name="timer" size={16} color={theme.textSecondary} />
              </View>
              <View>
                <Text style={s.modeBreakdownValue}>{userStats.avgMatchDuration}</Text>
                <Text style={s.modeBreakdownLabel}>{t('player', 'avgDuration')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ===== ROLE EVOLUTION ===== */}
        {roleAnalysis.totalWithRoles > 0 ? (
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: '#F97316' + '15' }]}>
                <MaterialIcons name="swap-horiz" size={18} color="#F97316" />
              </View>
              <Text style={s.sectionTitle}>{language === 'fr' ? 'Evolution du Role' : 'Role Evolution'}</Text>
            </View>
            <View style={{ gap: 10, marginBottom: 12 }}>
              {Object.entries(roleAnalysis.roleCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([role, count]) => {
                const pct = roleAnalysis.totalWithRoles > 0 ? Math.round((count / roleAnalysis.totalWithRoles) * 100) : 0;
                const rc = roleIcons[role] || { icon: 'person', color: theme.textMuted };
                return (
                  <View key={role} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.perfIcon, { backgroundColor: rc.color + '15', width: 34, height: 34, borderRadius: 8 }]}>
                      <MaterialIcons name={rc.icon as any} size={16} color={rc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{t('roles', role)}</Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: rc.color }}>{pct}%</Text>
                      </View>
                      <View style={s.perfBarTrack}>
                        <View style={[s.perfBarFill, { width: `${pct}%`, backgroundColor: rc.color }]} />
                      </View>
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{count} {language === 'fr' ? 'matchs' : 'matches'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F97316' + '10', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#F97316' + '20' }}
              onPress={() => { Haptics.selectionAsync(); router.push('/role-performance' as any); }}
            >
              <MaterialIcons name="analytics" size={16} color="#F97316" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#F97316' }}>{language === 'fr' ? 'Voir analyse complete' : 'View full analysis'}</Text>
              <MaterialIcons name="chevron-right" size={16} color="#F97316" />
            </Pressable>
          </View>
        ) : null}

        {/* ===== SHOT PERFORMANCE with progress bars ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.accent + '15' }]}>
              <MaterialIcons name="gps-fixed" size={18} color={theme.accent} />
            </View>
            <Text style={s.sectionTitle}>{t('player', 'performancesLabel')}</Text>
          </View>

          {[
            { icon: 'gps-fixed', label: t('player', 'shotRate'), rate: tirRate, success: totalTirsSuccess, total: totalTirs, color: theme.accent },
            { icon: 'adjust', label: t('player', 'pointRate'), rate: pointRate, success: totalPointsSuccess, total: totalPoints, color: theme.primary },
            { icon: 'stars', label: t('player', 'carreauRate'), rate: carreauRate, success: totalCarreaux, total: totalTirsSuccess, color: theme.carreauColor },
            { icon: 'sports-baseball', label: t('stats', 'inFrontBallLabel'), rate: devantBouleRate, success: totalDevantBoule, total: totalPointQualitiesSuccess, color: '#8B5CF6' },
          ].map((item, idx) => (
            <View key={idx} style={[s.perfRow, idx === 3 && { borderBottomWidth: 0 }]}>
              <View style={[s.perfIcon, { backgroundColor: item.color + '15' }]}>
                <MaterialIcons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={s.perfInfo}>
                <View style={s.perfTopRow}>
                  <Text style={s.perfLabel}>{item.label}</Text>
                  <Text style={[s.perfValue, { color: item.color }]}>{item.rate}%</Text>
                </View>
                <View style={s.perfBarTrack}>
                  <View style={[s.perfBarFill, { width: `${item.rate}%`, backgroundColor: item.color }]} />
                </View>
                <Text style={s.perfSubtext}>{item.success} / {item.total}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ===== CHALLENGES ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.carreauColor + '15' }]}>
              <MaterialIcons name="star" size={18} color={theme.carreauColor} />
            </View>
            <Text style={s.sectionTitle}>{t('player', 'challengesLabel')}</Text>
          </View>

          {[
            { icon: 'gps-fixed', name: t('challengeNames', '10_tirs'), data: challengeStats.byType['10_tirs'], color: theme.accent },
            { icon: 'sports', name: t('challengeNames', '10_tirs_sautee'), data: challengeStats.byType['10_tirs_sautee'], color: theme.primary },
            { icon: 'stars', name: t('challengeNames', 'precision'), data: challengeStats.byType['precision'], color: theme.carreauColor, isPts: true },
          ].map((item, idx) => (
            <View key={idx} style={[s.challengeRow, idx === 2 && { borderBottomWidth: 0 }]}>
              <View style={[s.challengeIcon, { backgroundColor: item.color + '15' }]}>
                <MaterialIcons name={item.icon as any} size={16} color={item.color} />
              </View>
              <View style={s.challengeInfo}>
                <Text style={s.challengeName}>{item.name}</Text>
                <Text style={s.challengeCount}>{item.data.count} {t('player', 'challengeCount')}</Text>
              </View>
              <View style={s.challengeBestBadge}>
                <Text style={[s.challengeBestValue, { color: item.color }]}>{item.data.bestScore}{item.isPts ? '' : '%'}</Text>
                <Text style={s.challengeBestLabel}>{t('player', 'best')}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ===== SIMPLIFIED VISIBILITY ===== */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: (isPublic ? theme.success : theme.textMuted) + '15' }]}>
              <MaterialIcons name={isPublic ? 'public' : 'lock'} size={18} color={isPublic ? theme.success : theme.textMuted} />
            </View>
            <Text style={s.sectionTitle}>{language === 'fr' ? 'VISIBILITE' : 'VISIBILITY'}</Text>
          </View>

          {/* Toggle 1: Community Visibility — auto-save */}
          <Pressable
            style={s.visibilityRow}
            onPress={async () => {
              if (!selfPlayer || togglingPublic) return;
              Haptics.selectionAsync();
              setTogglingPublic(true);
              const newVal = !isPublic;
              const { error } = await toggleItemPublic('players', selfPlayer.id, newVal);
              if (error) { showAlert(t('common', 'error'), error); }
              else { setIsPublic(newVal); setItemPublic('players', selfPlayer.id, newVal); }
              setTogglingPublic(false);
            }}
            disabled={togglingPublic}
          >
            <View style={[{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: (isPublic ? theme.success : theme.textMuted) + '15' }]}>
              <MaterialIcons name={isPublic ? 'public' : 'lock'} size={20} color={isPublic ? theme.success : theme.textMuted} />
            </View>
            <View style={s.visibilityInfo}>
              <Text style={s.visibilityTitle}>{language === 'fr' ? 'Visibilite communaute' : 'Community Visibility'}</Text>
              <Text style={s.visibilityDesc}>{isPublic ? (language === 'fr' ? 'Visible dans l\'annuaire et sur la carte' : 'Visible in directory and on map') : (language === 'fr' ? 'Masque de l\'annuaire et de la carte' : 'Hidden from directory and map')}</Text>
            </View>
            {togglingPublic ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <View style={[s.visibilityBadge, { backgroundColor: isPublic ? theme.success + '20' : theme.textMuted + '15' }]}>
                <Text style={[s.visibilityBadgeText, { color: isPublic ? theme.success : theme.textMuted }]}>{isPublic ? (language === 'fr' ? 'Actif' : 'On') : (language === 'fr' ? 'Inactif' : 'Off')}</Text>
              </View>
            )}
          </Pressable>

          {/* Toggle 2: Contact Info Visibility — auto-save, only when community visible */}
          {isPublic && (selfPlayer.phone || selfPlayer.email) ? (
            <Pressable style={s.contactToggleCard} onPress={handleToggleContactVisibility} disabled={togglingContacts}>
              <View style={[s.contactToggleIcon, { backgroundColor: (selfPlayer.showContactPublic ? theme.success : theme.textMuted) + '15' }]}>
                <MaterialIcons name={selfPlayer.showContactPublic ? 'contact-phone' : 'phone-disabled'} size={18} color={selfPlayer.showContactPublic ? theme.success : theme.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.contactToggleTitle}>{language === 'fr' ? 'Visibilite infos contact' : 'Contact Info Visibility'}</Text>
                <Text style={s.contactToggleDesc}>
                  {selfPlayer.showContactPublic
                    ? (language === 'fr' ? 'Email et telephone visibles dans l\'annuaire et sur la carte' : 'Email and phone visible in directory and on map')
                    : (language === 'fr' ? 'Email et telephone masques dans l\'annuaire et sur la carte' : 'Email and phone hidden in directory and on map')}
                </Text>
              </View>
              {togglingContacts ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <View style={[s.contactToggleBadge, { backgroundColor: (selfPlayer.showContactPublic ? theme.success : theme.textMuted) + '15' }]}>
                  <Text style={[s.contactToggleBadgeText, { color: selfPlayer.showContactPublic ? theme.success : theme.textMuted }]}>
                    {selfPlayer.showContactPublic ? (language === 'fr' ? 'Actif' : 'On') : (language === 'fr' ? 'Inactif' : 'Off')}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* ===== EDIT BUTTON ===== */}
        <View>
          <Pressable style={s.editProfileBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push({ pathname: '/profile', params: { edit: 'true' } } as any); }}>
            <MaterialIcons name="edit" size={20} color="#FFF" />
            <Text style={s.editProfileBtnText}>{t('player', 'editMyProfile')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ===== PUBLIC PREVIEW MODAL ===== */}
      <Modal visible={showPublicPreview} animationType="slide" transparent>
        <View style={s.pvOverlay}>
          <View style={s.pvModal}>
            <View style={s.pvHeader}>
              <View style={[s.pvHeaderIcon, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="public" size={22} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pvHeaderTitle}>{t('preview', 'publicPlayerTitle')}</Text>
                <Text style={s.pvHeaderSub}>{t('preview', 'publicPlayerDesc')}</Text>
              </View>
              <Pressable style={s.pvCloseBtn} onPress={() => setShowPublicPreview(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={s.pvScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Preview Card */}
              <View style={s.pvCard}>
                <View style={s.pvAvatarRow}>
                  <View style={s.pvAvatar}>
                    {selfPlayer.avatar ? (
                      <Image source={{ uri: selfPlayer.avatar }} style={s.pvAvatarImg} contentFit="cover" transition={200} />
                    ) : (
                      <Text style={s.pvAvatarText}>{selfPlayer.name?.charAt(0).toUpperCase() || '?'}</Text>
                    )}
                    <View style={[s.pvRoleBadge, { backgroundColor: getRoleColor(selfPlayer.role) }]}>
                      <MaterialIcons name={getRoleIcon(selfPlayer.role)} size={10} color="#FFF" />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pvName}>{selfPlayer.name}</Text>
                    {selfPlayer.nickname ? <Text style={s.pvNickname}>"{selfPlayer.nickname}"</Text> : null}
                  </View>
                </View>

                <View style={s.pvBadgesRow}>
                  <View style={[s.pvBadge, { backgroundColor: getRoleColor(selfPlayer.role) + '15' }]}>
                    <Text style={[s.pvBadgeText, { color: getRoleColor(selfPlayer.role) }]}>{t('roles', selfPlayer.role)}</Text>
                  </View>
                  {selfPlayer.handedness ? (
                    <View style={[s.pvBadge, { backgroundColor: '#6366F1' + '15' }]}>
                      <Text style={[s.pvBadgeText, { color: '#6366F1' }]}>
                        {selfPlayer.handedness === 'right' ? t('player', 'rightHanded') : selfPlayer.handedness === 'left' ? t('player', 'leftHanded') : t('player', 'ambidextrous')}
                      </Text>
                    </View>
                  ) : null}
                  {selfPlayer.experience ? (
                    <View style={[s.pvBadge, { backgroundColor: '#9333EA' + '15' }]}>
                      <Text style={[s.pvBadgeText, { color: '#9333EA' }]}>
                        {t('player', selfPlayer.experience === 'less_than_1' ? 'experienceLessThan1' : selfPlayer.experience === '1_to_3' ? 'experience1to3' : selfPlayer.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {(selfPlayer.club || profileTerrainName) ? (
                  <View style={s.pvInfoRow}>
                    {selfPlayer.club ? (
                      <View style={s.pvInfoPill}>
                        <MaterialIcons name="location-city" size={12} color={theme.carreauColor} />
                        <Text style={[s.pvInfoText, { color: theme.carreauColor }]}>{selfPlayer.club}</Text>
                      </View>
                    ) : null}
                    {profileTerrainName ? (
                      <View style={s.pvInfoPill}>
                        <MaterialIcons name="sports-soccer" size={12} color={theme.success} />
                        <Text style={[s.pvInfoText, { color: theme.success }]}>{profileTerrainName}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {(selfPlayer.location?.city || selfPlayer.country) ? (
                  <View style={s.pvLocationRow}>
                    <MaterialIcons name="place" size={14} color={theme.textSecondary} />
                    <Text style={s.pvLocationText}>{[selfPlayer.location?.city, selfPlayer.country].filter(Boolean).join(', ')}</Text>
                  </View>
                ) : null}

                {previewShowContacts && (selfPlayer.phone || selfPlayer.email) ? (
                  <View style={s.pvContactRow}>
                    {selfPlayer.phone ? (
                      <View style={s.pvContactPill}>
                        <MaterialIcons name="phone" size={12} color={theme.primary} />
                        <Text style={s.pvContactText}>{selfPlayer.phone}</Text>
                      </View>
                    ) : null}
                    {selfPlayer.email ? (
                      <View style={s.pvContactPill}>
                        <MaterialIcons name="email" size={12} color={theme.primary} />
                        <Text style={s.pvContactText}>{selfPlayer.email}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={s.pvStatsRow}>
                  <View style={s.pvStatItem}>
                    <Text style={s.pvStatValue}>{totalMatches}</Text>
                    <Text style={s.pvStatLabel}>{t('player', 'matchesUpper')}</Text>
                  </View>
                  <View style={s.pvStatDivider} />
                  <View style={s.pvStatItem}>
                    <Text style={[s.pvStatValue, { color: theme.success }]}>{userStats.wins}</Text>
                    <Text style={s.pvStatLabel}>{t('player', 'victories')}</Text>
                  </View>
                  <View style={s.pvStatDivider} />
                  <View style={s.pvStatItem}>
                    <Text style={[s.pvStatValue, { color: theme.accent }]}>{userStats.winRate}%</Text>
                    <Text style={s.pvStatLabel}>{t('player', 'winsLabel')}</Text>
                  </View>
                </View>
              </View>

              {/* Contact Toggle */}
              {(selfPlayer.phone || selfPlayer.email) ? (
                <View style={s.pvToggleCard}>
                  <View style={s.pvToggleRow}>
                    <View style={[s.pvToggleIcon, { backgroundColor: (previewShowContacts ? theme.success : theme.textMuted) + '15' }]}>
                      <MaterialIcons name={previewShowContacts ? 'contact-phone' : 'phone-disabled'} size={18} color={previewShowContacts ? theme.success : theme.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pvToggleTitle}>{t('preview', 'showContacts')}</Text>
                      <Text style={s.pvToggleDesc}>{previewShowContacts
                        ? t('preview', 'contactsVisiblePlayer')
                        : t('preview', 'contactsHiddenPlayer')
                      }</Text>
                    </View>
                    <Switch
                      value={previewShowContacts}
                      onValueChange={(val) => {
                        setPreviewShowContacts(val);
                      }}
                      trackColor={{ false: theme.border, true: theme.success + '60' }}
                      thumbColor={previewShowContacts ? theme.success : theme.textMuted}
                    />
                  </View>
                </View>
              ) : null}

              {/* Geolocation note */}
              <View style={s.pvNote}>
                <MaterialIcons name="map" size={16} color={theme.primary} />
                <Text style={s.pvNoteText}>{t('preview', 'geoNotePlayer')}</Text>
              </View>
            </ScrollView>

            <View style={s.pvActions}>
              <Pressable style={s.pvCancelBtn} onPress={() => setShowPublicPreview(false)}>
                <Text style={s.pvCancelText}>{t('common', 'cancel')}</Text>
              </Pressable>
              <Pressable style={[s.pvConfirmBtn, { backgroundColor: isPublic ? theme.error : theme.success }]} onPress={handleConfirmPublic} disabled={togglingPublic}>
                {togglingPublic ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name={isPublic ? 'lock' : 'public'} size={18} color="#FFF" />
                    <Text style={s.pvConfirmText}>{isPublic
                      ? t('preview', 'makePrivateFem')
                      : t('preview', 'makePublicFem')
                    }</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>



      {selfPlayer ? (
        <ShareModal visible={showShareModal} onClose={() => setShowShareModal(false)} itemType="player" itemId={selfPlayer.id} itemName={selfPlayer.name} forceReadOnly />
      ) : null}
    </SafeAreaView>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: theme.textSecondary },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.success + '15', borderRadius: 20 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  tabletRow: { flexDirection: 'row' as const, gap: 16, marginBottom: 4 },
  tabletLeft: { flex: 1 },
  tabletRight: { flex: 1 },

  // Hero Card
  heroCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 24, alignItems: 'center', marginBottom: 16, ...theme.shadows.card, zIndex: 1 },
  heroCardAmbassador: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 0, alignItems: 'center' as const, marginBottom: 16, overflow: 'hidden' as const, borderWidth: 1.5, borderColor: '#7C3AED' + '25', ...theme.shadows.card, zIndex: 1 },
  // Ambassador prestige header
  ambPrestigeHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: '#7C3AED', paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: -24, marginBottom: 20, width: 'auto' as any, alignSelf: 'stretch' as const },
  ambPrestigeIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  ambPrestigeTitle: { fontSize: 14, fontWeight: '800' as const, color: '#FFF', letterSpacing: 0.3 },
  ambPrestigeSubtitle: { fontSize: 10, fontWeight: '600' as const, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  ambPrestigePortalBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  ambPrestigePortalText: { fontSize: 11, fontWeight: '700' as const, color: '#FFF' },
  ambQuickActions: { flexDirection: 'row' as const, gap: 8, marginBottom: 8, marginTop: 4 },
  ambQuickActionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: '#7C3AED' + '10', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: '#7C3AED' + '20' },
  ambQuickActionText: { fontSize: 12, fontWeight: '700' as const, color: '#7C3AED' },
  avatarContainer: { position: 'relative', marginBottom: 14 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarAmbassador: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.primary, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, borderWidth: 3, borderColor: '#7C3AED' + '40' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarImageAmbassador: { width: 94, height: 94, borderRadius: 47 },
  avatarText: { fontSize: 40, fontWeight: '700', color: '#FFF' },
  roleBadgeOnAvatar: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.surface },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 },
  heroName: { fontSize: 24, fontWeight: '700', color: theme.textPrimary },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8E8E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C0C0C0' + '40' },
  premiumBadgeText: { fontSize: 11, fontWeight: '700', color: '#808080', letterSpacing: 0.5 },
  ambassadorBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#7C3AED', alignItems: 'center' as const, justifyContent: 'center' as const },
  ambassadorBadgeText: { fontSize: 11, fontWeight: '700' as const, color: '#7C3AED', letterSpacing: 0.5 },
  ambSocialRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'center' as const, gap: 8, marginBottom: 8, marginTop: 4 },
  ambSocialBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  ambSocialText: { fontSize: 12, fontWeight: '600' as const },

  heroNickname: { fontSize: 15, fontStyle: 'italic', color: theme.textSecondary, marginBottom: 8 },

  // Hero card section blocks
  heroIdentityBlock: { alignItems: 'center' as const, marginBottom: 4 },
  heroSectionBlock: { width: '100%' as const, paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  heroSectionBlockHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginBottom: 8 },
  heroSectionBlockLabel: { fontSize: 9, fontWeight: '800' as const, color: theme.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' as const },

  // Badges
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 12, marginTop: 4 },
  pillBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillBadgeText: { fontSize: 13, fontWeight: '600' },

  // Info pills (club, terrain)
  infoPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  infoPillText: { fontSize: 13, fontWeight: '600' },

  // Contact pills
  contactPillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  contactPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '10', borderRadius: 20 },
  contactPillText: { fontSize: 13, fontWeight: '500', color: theme.primary },

  // Location pill
  locationPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginBottom: 16 },
  locationPillText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },

  // Quick Stats bar (matching profile)
  quickStatsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg, paddingVertical: 14, paddingHorizontal: 16, width: '100%' },
  quickStatItem: { alignItems: 'center', flex: 1 },
  quickStatValue: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
  quickStatLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 2 },
  quickStatDivider: { width: 1, height: 28, backgroundColor: theme.border, marginHorizontal: 8 },

  // Section Card
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card, position: 'relative' as const, zIndex: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 17, marginBottom: 12 },

  // Radar container
  radarContainer: { alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegend: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  radarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  radarLegendTexts: { flex: 1 },
  radarLegendLabel: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  radarLegendDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  radarLegendValue: { fontSize: 14, fontWeight: '700' },

  // Preference items
  prefItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  prefItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefItemInfo: { flex: 1 },
  prefItemLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  prefItemValue: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },
  prefItemPct: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },

  // Match stats
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

  // Performance rows
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  perfIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  perfInfo: { flex: 1 },
  perfTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  perfLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  perfValue: { fontSize: 20, fontWeight: '800' },
  perfBarTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  perfBarFill: { height: '100%', borderRadius: 3 },
  perfSubtext: { fontSize: 11, color: theme.textMuted },

  // Challenges
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  challengeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  challengeInfo: { flex: 1 },
  challengeName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  challengeCount: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  challengeBestBadge: { alignItems: 'flex-end' },
  challengeBestValue: { fontSize: 18, fontWeight: '800' },
  challengeBestLabel: { fontSize: 10, color: theme.textMuted, marginTop: 1 },

  // Visibility
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityInfo: { flex: 1 },
  visibilityTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  visibilityDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  visibilityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  visibilityBadgeText: { fontSize: 12, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.warning + '08', borderRadius: theme.borderRadius.md, padding: 12, marginTop: 12, borderWidth: 1, borderColor: theme.warning + '20' },
  privacyNoteText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  contactToggleCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginTop: 12, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  contactToggleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  contactToggleTitle: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary },
  contactToggleDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  contactToggleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  contactToggleBadgeText: { fontSize: 12, fontWeight: '700' as const },

  // Geo Rank row
  geoRankRow: { width: '100%' as const, paddingTop: 10, marginTop: 6, marginBottom: 8, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  geoRankHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
  geoRankTitle: { fontSize: 11, fontWeight: '700' as const, color: '#3B82F6', flex: 1, letterSpacing: 0.3 },
  geoRankBadges: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8 },
  geoRankBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  geoRankBadgeRank: { fontSize: 15, fontWeight: '800' as const },
  geoRankBadgeTotal: { fontSize: 11, fontWeight: '600' as const, color: theme.textMuted },
  geoRankLockedCard: { backgroundColor: theme.backgroundSecondary + '80', borderRadius: theme.borderRadius.md, padding: 10, borderWidth: 1, borderColor: theme.border },
  geoRankLockedTitle: { color: theme.textMuted, flex: 0 },
  geoRankHiddenExplainer: { fontSize: 12, color: theme.textSecondary, lineHeight: 17, marginBottom: 10 },
  geoRankPublicToggleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10, paddingVertical: 4 },
  geoRankPublicToggleLabel: { fontSize: 13, fontWeight: '600' as const, color: theme.textPrimary, flex: 1, marginRight: 8 },
  geoRankPreviewDimmed: { opacity: 0.85 },

  // Leaderboard Qualification Card
  qualificationCard: { width: '100%' as any, backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1.5, borderColor: '#FDE68A' },
  qualificationHeader: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 10, marginBottom: 10 },
  qualificationIconBg: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#F59E0B18', alignItems: 'center' as any, justifyContent: 'center' as any },
  qualificationTitle: { fontSize: 13, fontWeight: '700' as any, color: '#78350F' },
  qualificationSub: { fontSize: 11, fontWeight: '600' as any, color: '#D97706', marginTop: 1 },
  qualificationBarTrack: { height: 8, backgroundColor: '#FDE68A', borderRadius: 4, overflow: 'hidden' as any, marginBottom: 8 },
  qualificationBarFill: { height: '100%' as any, backgroundColor: '#D97706', borderRadius: 4 },
  qualificationHint: { fontSize: 11, color: '#92400E', textAlign: 'center' as any, lineHeight: 16 },

  // Edit button
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 18, borderRadius: theme.borderRadius.md, marginTop: 4, ...theme.shadows.card },
  editProfileBtnText: { fontSize: 17, fontWeight: '600', color: '#FFF' },

  // ===== Preview Modal =====
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pvModal: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: 0 },
  pvHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  pvHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pvHeaderTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  pvHeaderSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, lineHeight: 18 },
  pvCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: theme.backgroundSecondary },
  pvScroll: { paddingHorizontal: 20, paddingTop: 16 },
  pvCard: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12 },
  pvAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  pvAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  pvAvatarImg: { width: 56, height: 56, borderRadius: 28 },
  pvAvatarText: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  pvRoleBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.backgroundSecondary },
  pvName: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  pvNickname: { fontSize: 13, fontStyle: 'italic', color: theme.textSecondary, marginTop: 2 },
  pvBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pvBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  pvBadgeText: { fontSize: 12, fontWeight: '600' },
  pvInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pvInfoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.surface, borderRadius: 12 },
  pvInfoText: { fontSize: 12, fontWeight: '600' },
  pvLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  pvLocationText: { fontSize: 12, color: theme.textSecondary },
  pvContactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pvContactPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.primary + '10', borderRadius: 14 },
  pvContactText: { fontSize: 12, fontWeight: '500', color: theme.primary },
  pvStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, paddingVertical: 10, paddingHorizontal: 12 },
  pvStatItem: { alignItems: 'center', flex: 1 },
  pvStatValue: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  pvStatLabel: { fontSize: 9, color: theme.textSecondary, marginTop: 1, textTransform: 'uppercase' },
  pvStatDivider: { width: 1, height: 24, backgroundColor: theme.border, marginHorizontal: 6 },
  pvToggleCard: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 12 },
  pvToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pvToggleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pvToggleTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  pvToggleDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  pvNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.primary + '08', borderRadius: theme.borderRadius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.primary + '15' },
  pvNoteText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  pvActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: theme.border },
  pvCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: theme.borderRadius.md, backgroundColor: theme.backgroundSecondary },
  pvCancelText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  pvConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: theme.borderRadius.md },
  pvConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
