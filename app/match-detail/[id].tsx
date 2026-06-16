import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

import * as Haptics from '@/services/haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import AdBanner from '@/components/ui/AdBanner';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useAuth } from '@/template';
import ShareModal from '@/components/ui/ShareModal';
import SharedBadge from '@/components/ui/SharedBadge';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { Match } from '@/types/petanque';
import Svg, { Circle, Line, G, Polygon, Text as SvgText, Polyline, Rect } from 'react-native-svg';
import { Dimensions } from 'react-native';
import { useAlert } from '@/template';
import {
  getMatchValidationLevel,
  getValidationColor,
  getValidationIcon,
  getValidationLabel,
  getMatchValidationWeight,
} from '@/services/trustScoreService';
import { fetchAttestationsForItem } from '@/services/witnessService';
import AttestationSection from '@/components/feature/AttestationSection';
import { getEloRank, getEloColor, formatEloDelta, EloHistoryEntry } from '@/services/eloService';
import { getSupabaseClient } from '@/template';
import { Player } from '@/types/petanque';
import { useAppData as useAppDataHook } from '@/contexts/AppContext';
import { getShareRequestsForItem, revokeShareRequest, revokeAllShareRequests, getShareRequestRemainingTime, MatchShareRequest, detectLinkedPlayers, createShareRequests } from '@/services/matchShareService';

export default function MatchDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { matches, terrains, boulesSets, tournaments, loading: appLoading } = useAppData();
  const { isSharedItem, getSharedPermission, refreshData } = useAppActions();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const fr = language === 'fr';
  const locale = fr ? 'fr-FR' : 'en-US';

  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  const [witnessRequests, setWitnessRequests] = useState<any[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [shareRequests, setShareRequests] = useState<MatchShareRequest[]>([]);
  const [quickShareState, setQuickShareState] = useState<'idle' | 'loading' | 'sent' | 'no_accounts' | 'already_shared'>('idle');
  const [quickShareCount, setQuickShareCount] = useState(0);
  const { showAlert } = useAlert();

  const { players: allPlayers } = useAppDataHook();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    fetchAmbassadors().then(({ ambassadors }) => {
      const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor');
      if (gold) setGoldSponsor(gold);
    });
  }, []);

  // Check if match was played between only locally created players (no real user profiles)
  const isLocalOnlyMatch = useMemo(() => {
    if (!match) return false;
    const allPlayerIds = [...(match.teamA.players || []), ...(match.teamB.players || [])].filter(id => id !== '1' && id !== '2');
    if (allPlayerIds.length === 0) return false;
    return allPlayerIds.every(pid => {
      const p = allPlayers.find(pl => pl.id === pid);
      return !p || !p.userId || p.id !== p.userId;
    });
  }, [match, allPlayers]);

  // ELO deltas for this match
  const [eloDeltas, setEloDeltas] = useState<Map<string, { delta: number; eloAfter: number }>>(new Map());

  useEffect(() => {
    if (!id) return;
    fetchAttestationsForItem('match', id).then(reqs => setWitnessRequests(reqs));
    getShareRequestsForItem('match', id).then(({ requests }) => setShareRequests(requests)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const loadEloDeltas = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('elo_history')
          .select('player_id, elo_delta, elo_after')
          .eq('match_id', id);
        if (data && data.length > 0) {
          const map = new Map<string, { delta: number; eloAfter: number }>();
          for (const row of data) {
            map.set(row.player_id, { delta: row.elo_delta, eloAfter: row.elo_after });
          }
          setEloDeltas(map);
        }
      } catch { /* silent */ }
    };
    loadEloDeltas();
  }, [id]);

  const match: (Match & { userId?: string }) | undefined = useMemo(() => matches.find(m => m.id === id), [matches, id]);

  // H2H History: find all matches between same players
  const h2hData = useMemo(() => {
    if (!match) return null;
    const teamAIds = new Set(match.teamA.players);
    const teamBIds = new Set(match.teamB.players);
    // Find matches where the same players faced each other
    const h2hMatches = matches.filter(m => {
      if (m.id === match.id) return false;
      const mAIds = new Set(m.teamA.players);
      const mBIds = new Set(m.teamB.players);
      // Check if same teams faced off (A vs B or B vs A)
      const sameAvsB = [...teamAIds].every(id => mAIds.has(id)) && [...teamBIds].every(id => mBIds.has(id));
      const reverseBvsA = [...teamAIds].every(id => mBIds.has(id)) && [...teamBIds].every(id => mAIds.has(id));
      return sameAvsB || reverseBvsA;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (h2hMatches.length === 0) return null;
    let myWins = 0, oppWins = 0;
    let totalScoreA = 0, totalScoreB = 0;
    h2hMatches.forEach(m => {
      const mAIds = new Set(m.teamA.players);
      const sameOrder = [...teamAIds].every(id => mAIds.has(id));
      if (sameOrder) {
        if (m.winner === 'A') myWins++; else oppWins++;
        totalScoreA += m.teamA.score;
        totalScoreB += m.teamB.score;
      } else {
        if (m.winner === 'B') myWins++; else oppWins++;
        totalScoreA += m.teamB.score;
        totalScoreB += m.teamA.score;
      }
    });
    const avgScoreA = h2hMatches.length > 0 ? Math.round((totalScoreA / h2hMatches.length) * 10) / 10 : 0;
    const avgScoreB = h2hMatches.length > 0 ? Math.round((totalScoreB / h2hMatches.length) * 10) / 10 : 0;
    return { matches: h2hMatches.slice(0, 10), myWins, oppWins, total: h2hMatches.length, avgScoreA, avgScoreB };
  }, [match, matches]);

  // Quick share with teammates handler
  const handleQuickShareWithTeammates = useCallback(async () => {
    if (!match || !user?.id || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickShareState('loading');
    try {
      const allPlayerIds = [...(match.teamA.players || []), ...(match.teamB.players || [])];
      const { linkedPlayers } = await detectLinkedPlayers(allPlayerIds, user.id);
      if (linkedPlayers.length === 0) {
        setQuickShareState('no_accounts');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      // Check which ones already have a share request
      const alreadySharedIds = new Set(shareRequests.map(r => r.recipientUserId));
      const newRecipients = linkedPlayers.filter(p => !alreadySharedIds.has(p.userId));
      if (newRecipients.length === 0) {
        setQuickShareState('already_shared');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const teamANames = (match.teamA.playerNames || []).join(', ');
      const teamBNames = (match.teamB.playerNames || []).join(', ');
      const summary = `${teamANames} vs ${teamBNames} (${match.teamA.score}-${match.teamB.score})`;
      const senderName = user.username || user.email?.split('@')[0] || 'Joueur';
      const { requests: newReqs, error } = await createShareRequests({
        itemType: 'match',
        itemId: id,
        senderUserId: user.id,
        senderName,
        recipients: newRecipients.map(p => ({ userId: p.userId, permission: 'read' as const })),
        itemSummary: summary,
      });
      if (error) {
        showAlert(fr ? 'Erreur' : 'Error', error);
        setQuickShareState('idle');
        return;
      }
      setQuickShareCount(newReqs.length);
      setShareRequests(prev => [...newReqs, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuickShareState('sent');
      setTimeout(() => setQuickShareState('idle'), 3000);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
      setQuickShareState('idle');
    }
  }, [match, user, id, shareRequests, fr, showAlert]);

  const sharedPermission = id ? getSharedPermission(id) : null;
  const isShared = id ? isSharedItem(id) : false;

  // Series
  const seriesMatches = useMemo(() => {
    if (!match?.seriesInfo?.seriesId) return [];
    return matches
      .filter(m => m.seriesInfo?.seriesId === match.seriesInfo?.seriesId)
      .sort((a, b) => (a.seriesInfo?.matchNumber || 1) - (b.seriesInfo?.matchNumber || 1));
  }, [match, matches]);

  const seriesStats = useMemo(() => {
    if (seriesMatches.length <= 1) return null;
    let winsA = 0, winsB = 0;
    seriesMatches.forEach(m => { if (m.winner === 'A') winsA++; else if (m.winner === 'B') winsB++; });
    const isComplete = winsA >= 2 || winsB >= 2;
    return { winsA, winsB, isComplete, seriesWinner: isComplete ? (winsA >= 2 ? 'A' : 'B') : null };
  }, [seriesMatches]);

  const selectedTerrain = useMemo(() => match?.terrainId ? terrains.find(tr => tr.id === match.terrainId) : null, [match, terrains]);
  const matchBoulesSet = useMemo(() => match?.boulesSetId ? boulesSets.find(bs => bs.id === match.boulesSetId) : null, [match, boulesSets]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Validation
  const validation = useMemo(() => {
    if (!match) return null;
    const pIds: string[] = (match as any)?.participantUserIds || [];
    const isWitnessed = witnessRequests.some(r => r.status === 'attested');
    const count = Array.isArray(pIds) ? pIds.length : 0;
    const vLevel = getMatchValidationLevel(count, isWitnessed);
    return {
      level: vLevel,
      color: getValidationColor(vLevel),
      icon: getValidationIcon(vLevel),
      label: getValidationLabel(vLevel, fr),
      weight: getMatchValidationWeight(count, isWitnessed),
    };
  }, [match, witnessRequests, fr]);

  if (!match) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Detail du match' : 'Match detail'}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
        ) : (
          <View style={s.center}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={s.emptyText}>{fr ? 'Match introuvable' : 'Match not found'}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const isWin = match.winner === 'A';
  const isTournament = match.mode === 'Tournoi';
  const dateStr = new Date(match.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date(match.date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const meneTotalA = match.menes?.reduce((sum, m) => sum + (m.teamAPoints || 0), 0) || 0;
  const meneTotalB = match.menes?.reduce((sum, m) => sum + (m.teamBPoints || 0), 0) || 0;

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Detail du match' : 'Match detail'}</Text>
        <Pressable style={s.shareBtn} onPress={() => { Haptics.selectionAsync(); setShowShareModal(true); }}>
          <MaterialIcons name="share" size={20} color={theme.success} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Hero Card */}
        <View style={s.heroCard}>
          <View style={[s.heroAccent, { backgroundColor: isWin ? theme.success : theme.error }]} />
          <View style={s.heroContent}>
            <View style={s.heroTopRow}>
              <View style={[s.heroIconCircle, { backgroundColor: (isTournament ? theme.carreauColor : theme.primary) + '15', borderColor: (isTournament ? theme.carreauColor : theme.primary) + '35' }]}>
                <MaterialIcons name={isTournament ? 'emoji-events' : 'fitness-center'} size={32} color={isTournament ? theme.carreauColor : theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>
                  {isTournament ? (match.tournamentName || t('modes', 'tournament')) : t('modes', 'training')}
                </Text>
                <View style={s.heroTagsRow}>
                  <View style={[s.heroTag, { backgroundColor: (isTournament ? theme.carreauColor : theme.primary) + '12' }]}>
                    <MaterialIcons name={isTournament ? 'emoji-events' : 'fitness-center'} size={12} color={isTournament ? theme.carreauColor : theme.primary} />
                    <Text style={[s.heroTagText, { color: isTournament ? theme.carreauColor : theme.primary }]}>
                      {isTournament ? t('modes', 'tournament') : t('modes', 'training')}
                    </Text>
                  </View>
                  <View style={[s.heroTag, { backgroundColor: theme.backgroundSecondary }]}>
                    <MaterialIcons name="groups" size={12} color={theme.textSecondary} />
                    <Text style={[s.heroTagText, { color: theme.textSecondary }]}>{t('formats', match.format)}</Text>
                  </View>
                  {isShared ? <SharedBadge permission={sharedPermission || 'read'} size="small" /> : null}
                </View>
              </View>
            </View>

            {/* Meta pills */}
            <View style={s.metaRow}>
              <View style={s.metaPill}>
                <MaterialIcons name="event" size={13} color={theme.primary} />
                <Text style={s.metaPillText}>{dateStr}</Text>
              </View>
              <View style={s.metaPill}>
                <MaterialIcons name="schedule" size={13} color={theme.accent} />
                <Text style={s.metaPillText}>{timeStr}</Text>
              </View>
              {match.duration > 0 ? (
                <View style={s.metaPill}>
                  <MaterialIcons name="timer" size={13} color={theme.warning} />
                  <Text style={s.metaPillText}>{match.duration} min</Text>
                </View>
              ) : null}
            </View>

            {/* Extra badges */}
            <View style={s.metaRow}>
              {selectedTerrain ? (
                <View style={s.metaPill}>
                  <MaterialIcons name="place" size={13} color={theme.success} />
                  <Text style={s.metaPillText}>{selectedTerrain.name}</Text>
                </View>
              ) : null}
              {matchBoulesSet ? (
                <View style={s.metaPill}>
                  <MaterialIcons name="sports-baseball" size={13} color="#D97706" />
                  <Text style={s.metaPillText}>{matchBoulesSet.name}</Text>
                </View>
              ) : null}
              {isTournament && match.tournamentPhase ? (
                <View style={[s.metaPill, { backgroundColor: theme.carreauColor + '12' }]}>
                  <MaterialIcons name="flag" size={13} color={theme.carreauColor} />
                  <Text style={[s.metaPillText, { color: theme.carreauColor }]}>{t('tournamentPhases', match.tournamentPhase)}</Text>
                </View>
              ) : null}
            </View>

            {/* Gold Sponsor Badge */}
            {goldSponsor ? (
              <Pressable
                style={({ pressed }) => [s.sponsorRow, pressed && { opacity: 0.9 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  trackAmbassadorEvent(goldSponsor.id, 'profile_view', undefined, { sourcePage: 'match_detail_view' });
                  router.push('/partners' as any);
                }}
              >
                <LinearGradient colors={['#FFFBEB', '#FEF3C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sponsorGradient}>
                  <View style={s.sponsorAccentLine} />
                  <View style={s.sponsorContent}>
                    {goldSponsor.photo ? (
                      <Image source={{ uri: goldSponsor.photo }} style={s.sponsorLogo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                    ) : (
                      <LinearGradient colors={['#B45309', '#F59E0B']} style={s.sponsorLogoFallback}>
                        <MaterialIcons name="workspace-premium" size={24} color="#FFF" />
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.sponsorLabel}>{fr ? 'Sponsorise par' : 'Sponsored by'}</Text>
                      <Text style={s.sponsorName} numberOfLines={1}>{goldSponsor.displayName}</Text>
                    </View>
                    <LinearGradient colors={['#B45309', '#D97706']} style={s.sponsorTierIcon}>
                      <MaterialIcons name="star" size={10} color="#FFF" />
                    </LinearGradient>
                  </View>
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Score Card */}
        <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: isWin ? theme.success : theme.error }]}>
          <View style={s.scoreRow}>
            <View style={s.teamCol}>
              <Text style={s.teamLabel}>{fr ? 'MON EQUIPE' : 'MY TEAM'}</Text>
              <Text style={s.teamNames} numberOfLines={2}>{match.teamA.playerNames.join(' • ')}</Text>
            </View>
            <View style={s.scoreCenter}>
              <View style={s.scoreBox}>
                <Text style={[s.scoreNum, isWin && { color: theme.success }]}>{match.teamA.score}</Text>
                <Text style={s.scoreSep}>-</Text>
                <Text style={[s.scoreNum, !isWin && { color: theme.error }]}>{match.teamB.score}</Text>
              </View>
              <View style={[s.resultBadge, { backgroundColor: (isWin ? theme.success : theme.error) + '15' }]}>
                <MaterialIcons name={isWin ? 'check-circle' : 'cancel'} size={14} color={isWin ? theme.success : theme.error} />
                <Text style={[s.resultText, { color: isWin ? theme.success : theme.error }]}>
                  {isWin ? t('history', 'victory') : t('history', 'defeat')}
                </Text>
              </View>
            </View>
            <View style={[s.teamCol, { alignItems: 'flex-end' }]}>
              <Text style={s.teamLabel}>{fr ? 'ADVERSAIRE' : 'OPPONENT'}</Text>
              <Text style={[s.teamNames, { textAlign: 'right' }]} numberOfLines={2}>{match.teamB.playerNames.join(' • ')}</Text>
            </View>
          </View>

          {/* ELO Deltas per player */}
          {eloDeltas.size > 0 ? (
            <View style={s.eloRow}>
              {[...match.teamA.players, ...match.teamB.players].map((pid, idx) => {
                const eloData = eloDeltas.get(pid);
                if (!eloData) return null;
                const isTeamA = match.teamA.players.includes(pid);
                const playerNames = isTeamA ? match.teamA.playerNames : match.teamB.playerNames;
                const playerIdx = isTeamA ? match.teamA.players.indexOf(pid) : match.teamB.players.indexOf(pid);
                const pName = playerNames[playerIdx]?.split(' ')[0] || '?';
                const eloRank = getEloRank(eloData.eloAfter);
                return (
                  <View key={pid} style={s.eloDeltaItem}>
                    <Text style={s.eloDeltaName} numberOfLines={1}>{pName}</Text>
                    <View style={[s.eloDeltaBadge, { backgroundColor: eloRank.color + '12', borderColor: eloRank.color + '30' }]}>
                      <MaterialIcons name={eloRank.icon as any} size={9} color={eloRank.color} />
                      <Text style={[s.eloDeltaElo, { color: eloRank.color }]}>{eloData.eloAfter}</Text>
                    </View>
                    <View style={[s.eloDeltaChange, { backgroundColor: eloData.delta >= 0 ? '#10B98112' : '#EF444412' }]}>
                      <MaterialIcons name={eloData.delta >= 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={eloData.delta >= 0 ? '#10B981' : '#EF4444'} />
                      <Text style={[s.eloDeltaChangeText, { color: eloData.delta >= 0 ? '#10B981' : '#EF4444' }]}>
                        {eloData.delta >= 0 ? `+${eloData.delta}` : `${eloData.delta}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Player roles */}
          {match.teamA.playerRoles && match.teamA.playerRoles.length > 0 ? (
            <View style={s.rolesRow}>
              {match.teamA.playerRoles.map((pr, idx) => {
                const cfg: Record<string, { icon: string; color: string }> = { 'Pointeur': { icon: 'radio-button-on', color: '#3B82F6' }, 'Milieu': { icon: 'swap-horiz', color: '#8B5CF6' }, 'Tireur': { icon: 'gps-fixed', color: '#F97316' } };
                const rc = cfg[pr.role] || { icon: 'person', color: theme.textMuted };
                return (
                  <View key={pr.playerId} style={[s.roleBadge, { backgroundColor: rc.color + '15' }]}>
                    <MaterialIcons name={rc.icon as any} size={11} color={rc.color} />
                    <Text style={[s.roleBadgeText, { color: rc.color }]}>{match.teamA.playerNames[idx]?.split(' ')[0]} - {t('roles', pr.role)}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Quick Share with Teammates */}
        {match.userId === user?.id && !isLocalOnlyMatch ? (
          <Pressable
            style={[s.quickShareBtn, quickShareState === 'sent' && { borderColor: '#10B98140', backgroundColor: '#F0FDF4' }, quickShareState === 'loading' && { opacity: 0.7 }]}
            onPress={handleQuickShareWithTeammates}
            disabled={quickShareState === 'loading' || quickShareState === 'sent'}
          >
            {quickShareState === 'loading' ? (
              <>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={s.quickShareText}>{fr ? 'Detection des comptes...' : 'Detecting accounts...'}</Text>
              </>
            ) : quickShareState === 'sent' ? (
              <>
                <View style={[s.quickShareIconBg, { backgroundColor: '#10B98115' }]}>
                  <MaterialIcons name="check-circle" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.quickShareTitle, { color: '#10B981' }]}>{fr ? 'Demandes envoyees !' : 'Requests sent!'}</Text>
                  <Text style={s.quickShareSub}>{quickShareCount} {fr ? 'joueur(s) notifie(s)' : 'player(s) notified'}</Text>
                </View>
              </>
            ) : quickShareState === 'no_accounts' ? (
              <>
                <View style={[s.quickShareIconBg, { backgroundColor: '#F59E0B15' }]}>
                  <MaterialIcons name="person-off" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.quickShareTitle, { color: '#F59E0B' }]}>{fr ? 'Aucun compte detecte' : 'No accounts detected'}</Text>
                  <Text style={s.quickShareSub}>{fr ? 'Les joueurs de ce match n\'ont pas de compte lie' : 'Players in this match have no linked accounts'}</Text>
                </View>
              </>
            ) : quickShareState === 'already_shared' ? (
              <>
                <View style={[s.quickShareIconBg, { backgroundColor: theme.primary + '15' }]}>
                  <MaterialIcons name="done-all" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.quickShareTitle, { color: theme.primary }]}>{fr ? 'Deja partage' : 'Already shared'}</Text>
                  <Text style={s.quickShareSub}>{fr ? 'Tous les joueurs ont deja recu une demande' : 'All players already received a request'}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[s.quickShareIconBg, { backgroundColor: '#22C55E15' }]}>
                  <MaterialIcons name="group-add" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.quickShareTitle}>{fr ? 'Partager avec les coequipiers' : 'Share with teammates'}</Text>
                  <Text style={s.quickShareSub}>{fr ? 'Envoie automatique aux joueurs avec un compte' : 'Auto-send to players with an account'}</Text>
                </View>
                <View style={s.quickShareArrow}>
                  <MaterialIcons name="send" size={16} color="#22C55E" />
                </View>
              </>
            )}
          </Pressable>
        ) : null}

        {/* Shared Match Badge Indicator */}
        {shareRequests.length > 0 ? (
          <View style={[s.card, { borderWidth: 1, borderColor: theme.primary + '25' }]}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="people" size={16} color={theme.primary} />
              <Text style={s.cardTitle}>{fr ? 'Partage du match' : 'Match Sharing'}</Text>
              <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>
                    {shareRequests.filter(r => r.status === 'accepted').length}/{shareRequests.length}
                  </Text>
                </View>
                {match.userId === user?.id && shareRequests.length > 1 ? (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF444412', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      const hasAccepted = shareRequests.some(r => r.status === 'accepted');
                      showAlert(
                        fr ? 'Revoquer tous les partages ?' : 'Revoke all shares?',
                        fr
                          ? `${shareRequests.length} partage(s) seront supprimes.${hasAccepted ? ' Les stats synchronisees seront annulees.' : ''}`
                          : `${shareRequests.length} share(s) will be removed.${hasAccepted ? ' Synced stats will be reverted.' : ''}`,
                        [
                          { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                          {
                            text: fr ? 'Revoquer tout' : 'Revoke all',
                            style: 'destructive',
                            onPress: async () => {
                              const { error: bulkErr } = await revokeAllShareRequests('match', match.id, { undoStats: hasAccepted });
                              if (bulkErr) {
                                showAlert(fr ? 'Erreur' : 'Error', bulkErr);
                              } else {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                setShareRequests([]);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    hitSlop={4}
                  >
                    <MaterialIcons name="delete-sweep" size={12} color="#EF4444" />
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#EF4444' }}>{fr ? 'Tout' : 'All'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {shareRequests.map(req => {
              const statusConfig: Record<string, { icon: string; color: string; label: string }> = {
                pending: { icon: 'schedule', color: '#F59E0B', label: fr ? 'En attente' : 'Pending' },
                accepted: { icon: 'check-circle', color: '#10B981', label: fr ? 'Accepte' : 'Accepted' },
                declined: { icon: 'cancel', color: '#EF4444', label: fr ? 'Refuse' : 'Declined' },
              };
              const cfg = statusConfig[req.status] || statusConfig.pending;
              // Find player name from match teams
              const allPids = [...(match.teamA.players || []), ...(match.teamB.players || [])];
              const allNames = [...(match.teamA.playerNames || []), ...(match.teamB.playerNames || [])];
              const pidIdx = allPids.findIndex(pid => {
                const p = allPlayers.find(pl => pl.id === pid);
                return p?.userId === req.recipientUserId;
              });
              const recipientName = pidIdx >= 0 ? allNames[pidIdx] : (req.recipientUserId?.slice(0, 8) || '?');
              const isTeamA = pidIdx >= 0 && pidIdx < (match.teamA.players?.length || 0);
              const teamColor = isTeamA ? theme.primary : theme.accent;
              const remaining = getShareRequestRemainingTime(req.createdAt, req.status);
              return (
                <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + '40' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: teamColor }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{recipientName}</Text>
                    {remaining ? (
                      <Text style={{ fontSize: 9, color: remaining.daysLeft <= 1 ? '#EF4444' : theme.textMuted, fontWeight: '600', marginTop: 2 }}>
                        {remaining.isExpired
                          ? (fr ? 'Expire' : 'Expired')
                          : remaining.daysLeft > 0
                            ? `${remaining.daysLeft}${fr ? 'j' : 'd'} ${remaining.hoursLeft}h ${fr ? 'restant' : 'left'}`
                            : `${remaining.hoursLeft}h ${fr ? 'restant' : 'left'}`}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cfg.color + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                    <MaterialIcons name={cfg.icon as any} size={12} color={cfg.color} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
                  </View>
                  <View style={{ backgroundColor: (req.permission === 'write' ? theme.accent : theme.textMuted) + '12', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 }}>
                    <MaterialIcons name={req.permission === 'write' ? 'edit' : 'visibility'} size={10} color={req.permission === 'write' ? theme.accent : theme.textMuted} />
                  </View>
                  {match.userId === user?.id ? (
                    <Pressable
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        Haptics.selectionAsync();
                        showAlert(
                          fr ? 'Revoquer le partage ?' : 'Revoke share?',
                          fr ? `${recipientName} ne pourra plus acceder a ce match.` : `${recipientName} will no longer have access to this match.`,
                          [
                            { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                            {
                              text: fr ? 'Revoquer' : 'Revoke',
                              style: 'destructive',
                              onPress: async () => {
                                const isAccepted = req.status === 'accepted';
                                const { error: revokeErr } = await revokeShareRequest(req.id, { undoStats: isAccepted });
                                if (revokeErr) {
                                  showAlert(fr ? 'Erreur' : 'Error', revokeErr);
                                } else {
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  setShareRequests(prev => prev.filter(r => r.id !== req.id));
                                }
                              },
                            },
                          ]
                        );
                      }}
                      hitSlop={6}
                    >
                      <MaterialIcons name="close" size={14} color="#EF4444" />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {shareRequests.every(r => r.status === 'accepted') ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                <MaterialIcons name="verified" size={14} color="#10B981" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
                  {fr ? 'Tous les participants ont accepte' : 'All participants accepted'}
                </Text>
              </View>
            ) : null}
            {/* Link to share history */}
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}
              onPress={() => { Haptics.selectionAsync(); router.push('/share-history' as any); }}
            >
              <MaterialIcons name="history" size={14} color={theme.primary} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.primary }}>
                {fr ? 'Voir l\'historique des partages' : 'View share history'}
              </Text>
              <MaterialIcons name="chevron-right" size={14} color={theme.primary} />
            </Pressable>
          </View>
        ) : null}

        {/* Unranked Match Badge (locally created players only) */}
        {isLocalOnlyMatch ? (
          <View style={[s.card, { borderWidth: 1.5, borderColor: '#D9770640', backgroundColor: '#D9770606' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#D9770615', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="info-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#D97706' }}>
                  {fr ? 'Match hors classement' : 'Unranked match'}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 }}>
                  {fr
                    ? 'Aucun joueur dans ce match n\'est lie a un compte utilisateur reel. Ce match ne compte pas pour le classement ELO ni les leaderboards.'
                    : 'No players in this match are linked to a real user account. This match does not count towards ELO rankings or leaderboards.'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Validation Badge */}
        {validation ? (
          <View style={[s.card, { borderWidth: 1, borderColor: validation.color + '30', backgroundColor: validation.color + '04' }]}>
            <View style={s.validationRow}>
              <View style={[s.validationIconBg, { backgroundColor: validation.color + '15' }]}>
                <MaterialIcons name={validation.icon as any} size={20} color={validation.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.validationLabel, { color: validation.color }]}>{validation.label}</Text>
                <Text style={s.validationSub}>
                  {fr ? 'Poids classement' : 'Leaderboard weight'}: <Text style={{ fontWeight: '800', color: validation.color }}>{validation.weight}x</Text>
                </Text>
              </View>
              <View style={[s.validationCircle, { borderColor: validation.color }]}>
                <Text style={[s.validationCircleText, { color: validation.color }]}>{validation.weight}x</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Series Info */}
        {seriesMatches.length > 1 && seriesStats ? (
          <View style={[s.card, { borderWidth: 1, borderColor: theme.accent + '30' }]}>
            <View style={s.seriesHeader}>
              <MaterialIcons name="replay" size={16} color={theme.accent} />
              <Text style={s.seriesTitle}>Best of {seriesMatches.length >= 3 ? '3' : seriesMatches.length}</Text>
              <View style={[s.seriesScoreBadge, { backgroundColor: (seriesStats.winsA > seriesStats.winsB ? theme.success : seriesStats.winsB > seriesStats.winsA ? theme.error : theme.warning) + '15' }]}>
                <Text style={[s.seriesScoreText, { color: seriesStats.winsA > seriesStats.winsB ? theme.success : seriesStats.winsB > seriesStats.winsA ? theme.error : theme.warning }]}>
                  {seriesStats.winsA} - {seriesStats.winsB}
                </Text>
              </View>
            </View>
            <View style={s.seriesList}>
              {seriesMatches.map((sm, idx) => {
                const isCurrent = sm.id === match.id;
                const smWin = sm.winner === 'A';
                return (
                  <Pressable
                    key={sm.id}
                    style={[s.seriesMatch, isCurrent && s.seriesMatchCurrent]}
                    onPress={() => { if (!isCurrent) { Haptics.selectionAsync(); router.replace(`/match-detail/${sm.id}` as any); } }}
                  >
                    <View style={[s.seriesDot, { backgroundColor: smWin ? theme.success : theme.error }]} />
                    <Text style={s.seriesMatchLabel}>
                      {sm.seriesInfo?.isFinale ? (fr ? 'Finale' : 'Final') : `M${idx + 1}`}
                      {isCurrent ? ` (${fr ? 'actuel' : 'current'})` : ''}
                    </Text>
                    <Text style={[s.seriesMatchScore, { color: smWin ? theme.success : theme.error }]}>
                      {sm.teamA.score}-{sm.teamB.score}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Witness Attestation Section */}
        <AttestationSection
          itemType="match"
          itemId={match.id}
          snapshotData={{
            teamA: { playerNames: match.teamA.playerNames, score: match.teamA.score },
            teamB: { playerNames: match.teamB.playerNames, score: match.teamB.score },
            winner: match.winner,
            format: match.format,
            date: match.date,
            duration: match.duration,
          }}
          animDelay={0}
          onAttestationChange={(attested, count) => {
            if (attested) fetchAttestationsForItem('match', match.id).then(setWitnessRequests);
          }}
        />

        {/* Menes */}
        {match.menes && match.menes.length > 0 ? (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="format-list-numbered" size={16} color={theme.primary} />
              <Text style={s.cardTitle}>{t('match', 'menesCount')} ({match.menes.length})</Text>
            </View>

            {/* Score Evolution Line Chart */}
            {match.menes.length >= 2 ? (() => {
              const chartW = Math.min(screenWidth - 64, 340);
              const chartH = 120;
              const padL = 28;
              const padR = 12;
              const padT = 16;
              const padB = 24;
              const innerW = chartW - padL - padR;
              const innerH = chartH - padT - padB;
              const cumulativeA: number[] = [];
              const cumulativeB: number[] = [];
              match.menes!.forEach((m, i) => {
                cumulativeA.push((cumulativeA[i - 1] || 0) + (m.teamAPoints || 0));
                cumulativeB.push((cumulativeB[i - 1] || 0) + (m.teamBPoints || 0));
              });
              const maxScore = Math.max(...cumulativeA, ...cumulativeB, 13);
              const stepX = match.menes!.length > 1 ? innerW / (match.menes!.length - 1) : innerW;
              const getY = (val: number) => padT + innerH - (val / maxScore) * innerH;
              const getX = (idx: number) => padL + idx * stepX;
              const polyA = cumulativeA.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
              const polyB = cumulativeB.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
              return (
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <Svg width={chartW} height={chartH}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                      <Line key={i} x1={padL} y1={padT + innerH * (1 - pct)} x2={chartW - padR} y2={padT + innerH * (1 - pct)} stroke={theme.border} strokeWidth={0.5} strokeDasharray={i > 0 && i < 4 ? '3,3' : undefined} />
                    ))}
                    {/* Y-axis labels */}
                    <SvgText x={padL - 4} y={padT + 4} fontSize="9" fill={theme.textMuted} textAnchor="end" fontWeight="600">{maxScore}</SvgText>
                    <SvgText x={padL - 4} y={padT + innerH + 4} fontSize="9" fill={theme.textMuted} textAnchor="end" fontWeight="600">0</SvgText>
                    {/* X-axis labels */}
                    {match.menes!.map((_, i) => (
                      <SvgText key={i} x={getX(i)} y={chartH - 4} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="600">M{i + 1}</SvgText>
                    ))}
                    {/* Lines */}
                    <Polyline points={polyB} fill="none" stroke={theme.error} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
                    <Polyline points={polyA} fill="none" stroke={theme.success} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                    {/* Dots */}
                    {cumulativeA.map((v, i) => <Circle key={`a${i}`} cx={getX(i)} cy={getY(v)} r={3.5} fill={theme.success} stroke="#FFF" strokeWidth={2} />)}
                    {cumulativeB.map((v, i) => <Circle key={`b${i}`} cx={getX(i)} cy={getY(v)} r={3.5} fill={theme.error} stroke="#FFF" strokeWidth={2} />)}
                    {/* End score labels */}
                    <SvgText x={getX(cumulativeA.length - 1) + 4} y={getY(cumulativeA[cumulativeA.length - 1]) - 6} fontSize="11" fill={theme.success} fontWeight="800">{cumulativeA[cumulativeA.length - 1]}</SvgText>
                    <SvgText x={getX(cumulativeB.length - 1) + 4} y={getY(cumulativeB[cumulativeB.length - 1]) + 14} fontSize="11" fill={theme.error} fontWeight="800">{cumulativeB[cumulativeB.length - 1]}</SvgText>
                  </Svg>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: theme.success }} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.success }}>{fr ? 'Mon equipe' : 'My team'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: theme.error }} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.error }}>{fr ? 'Adversaire' : 'Opponent'}</Text>
                    </View>
                  </View>
                </View>
              );
            })() : null}

            {/* Visual mene chart (bar) */}
            <View style={s.meneChart}>
              {match.menes.map((mene, idx) => {
                const cumulA = match.menes!.slice(0, idx + 1).reduce((sum, m) => sum + (m.teamAPoints || 0), 0);
                const cumulB = match.menes!.slice(0, idx + 1).reduce((sum, m) => sum + (m.teamBPoints || 0), 0);
                const aHeight = Math.max(4, ((mene.teamAPoints || 0) / 6) * 40);
                const bHeight = Math.max(4, ((mene.teamBPoints || 0) / 6) * 40);
                return (
                  <View key={idx} style={s.meneColumn}>
                    <Text style={s.meneColNum}>#{idx + 1}</Text>
                    <View style={s.meneBarGroup}>
                      <View style={[s.meneBar, { height: aHeight, backgroundColor: theme.success }]} />
                      <View style={[s.meneBar, { height: bHeight, backgroundColor: theme.error }]} />
                    </View>
                    <Text style={s.meneColScore}>{cumulA}-{cumulB}</Text>
                  </View>
                );
              })}
            </View>

            {/* Mene list */}
            <View style={s.meneList}>
              {match.menes.map((mene, idx) => (
                <View key={idx} style={s.meneRow}>
                  <Text style={s.meneNum}>#{idx + 1}</Text>
                  <View style={s.meneScores}>
                    <Text style={[s.meneScore, (mene.teamAPoints || 0) > 0 && { color: theme.success, fontWeight: '700' }]}>{mene.teamAPoints || 0}</Text>
                    <Text style={s.meneSep}>-</Text>
                    <Text style={[s.meneScore, (mene.teamBPoints || 0) > 0 && { color: theme.error, fontWeight: '700' }]}>{mene.teamBPoints || 0}</Text>
                  </View>
                  <View style={s.meneCumul}>
                    <Text style={s.meneCumulText}>
                      {match.menes!.slice(0, idx + 1).reduce((sum, m) => sum + (m.teamAPoints || 0), 0)}-{match.menes!.slice(0, idx + 1).reduce((sum, m) => sum + (m.teamBPoints || 0), 0)}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={s.meneTotalRow}>
                <Text style={s.meneTotalLabel}>Total</Text>
                <Text style={[s.meneTotalVal, { color: theme.success }]}>{meneTotalA}</Text>
                <Text style={s.meneSep}>-</Text>
                <Text style={[s.meneTotalVal, { color: theme.error }]}>{meneTotalB}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Radar Chart - Team Performance Comparison */}
        {match.playerActions && match.playerActions.length > 0 ? (() => {
          const teamAActions = match.playerActions!.filter(pa => pa.team === 'A');
          const teamBActions = match.playerActions!.filter(pa => pa.team === 'B');
          const sumActions = (arr: typeof teamAActions) => arr.reduce((acc, pa) => ({
            tirs: acc.tirs + pa.actions.tirs,
            tirsSuccess: acc.tirsSuccess + pa.actions.tirsSuccess,
            points: acc.points + pa.actions.points,
            pointsSuccess: acc.pointsSuccess + pa.actions.pointsSuccess,
            carreaux: acc.carreaux + pa.actions.carreaux,
          }), { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 });
          const aSum = sumActions(teamAActions);
          const bSum = sumActions(teamBActions);
          const aTirRate = aSum.tirs > 0 ? (aSum.tirsSuccess / aSum.tirs) * 100 : 0;
          const bTirRate = bSum.tirs > 0 ? (bSum.tirsSuccess / bSum.tirs) * 100 : 0;
          const aPointRate = aSum.points > 0 ? (aSum.pointsSuccess / aSum.points) * 100 : 0;
          const bPointRate = bSum.points > 0 ? (bSum.pointsSuccess / bSum.points) * 100 : 0;
          const maxCarreaux = Math.max(1, aSum.carreaux, bSum.carreaux);
          const aCarreauxNorm = (aSum.carreaux / maxCarreaux) * 100;
          const bCarreauxNorm = (bSum.carreaux / maxCarreaux) * 100;
          const meneCount = match.menes?.length || 1;
          const aAvgMene = meneTotalA / meneCount;
          const bAvgMene = meneTotalB / meneCount;
          const maxAvgMene = Math.max(1, aAvgMene, bAvgMene);
          const aAvgMeneNorm = (aAvgMene / maxAvgMene) * 100;
          const bAvgMeneNorm = (bAvgMene / maxAvgMene) * 100;

          const labels = [
            fr ? 'Taux Tir' : 'Shot Rate',
            fr ? 'Taux Point' : 'Point Rate',
            'Carreaux',
            fr ? 'Score/Mene' : 'Score/End',
          ];
          const aValues = [aTirRate, aPointRate, aCarreauxNorm, aAvgMeneNorm];
          const bValues = [bTirRate, bPointRate, bCarreauxNorm, bAvgMeneNorm];
          const aRaw = [
            aSum.tirs > 0 ? `${Math.round(aTirRate)}%` : '-',
            aSum.points > 0 ? `${Math.round(aPointRate)}%` : '-',
            `${aSum.carreaux}`,
            `${aAvgMene.toFixed(1)}`,
          ];
          const bRaw = [
            bSum.tirs > 0 ? `${Math.round(bTirRate)}%` : '-',
            bSum.points > 0 ? `${Math.round(bPointRate)}%` : '-',
            `${bSum.carreaux}`,
            `${bAvgMene.toFixed(1)}`,
          ];

          const radarSize = 220;
          const cx = radarSize / 2;
          const cy = radarSize / 2;
          const maxR = radarSize / 2 - 32;
          const numAxes = labels.length;
          const angleStep = (2 * Math.PI) / numAxes;
          const getPoint = (value: number, index: number) => {
            const angle = index * angleStep - Math.PI / 2;
            const r = (Math.min(value, 100) / 100) * maxR;
            return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
          };
          const aPoints = aValues.map((v, i) => getPoint(v, i));
          const bPoints = bValues.map((v, i) => getPoint(v, i));
          const aPolygon = aPoints.map(p => `${p.x},${p.y}`).join(' ');
          const bPolygon = bPoints.map(p => `${p.x},${p.y}`).join(' ');

          const hasData = aSum.tirs > 0 || aSum.points > 0 || bSum.tirs > 0 || bSum.points > 0;
          if (!hasData) return null;

          return (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <MaterialIcons name="radar" size={16} color={theme.primary} />
                <Text style={s.cardTitle}>{fr ? 'Comparaison des equipes' : 'Team comparison'}</Text>
              </View>

              <View style={s.radarCenter}>
                <Svg width={radarSize} height={radarSize}>
                  {[0.25, 0.5, 0.75, 1].map((level, i) => (
                    <Circle key={i} cx={cx} cy={cy} r={maxR * level} fill="none" stroke={theme.border} strokeWidth="0.8" strokeDasharray={i < 3 ? '3,3' : undefined} />
                  ))}
                  {labels.map((label, i) => {
                    const angle = i * angleStep - Math.PI / 2;
                    const endX = cx + maxR * Math.cos(angle);
                    const endY = cy + maxR * Math.sin(angle);
                    const labelX = cx + (maxR + 20) * Math.cos(angle);
                    const labelY = cy + (maxR + 20) * Math.sin(angle);
                    return (
                      <G key={i}>
                        <Line x1={cx} y1={cy} x2={endX} y2={endY} stroke={theme.border} strokeWidth="0.8" />
                        <SvgText x={labelX} y={labelY + 4} fontSize="9" fill={theme.textSecondary} textAnchor="middle" fontWeight="600">{label}</SvgText>
                      </G>
                    );
                  })}
                  <Polygon points={bPolygon} fill={theme.error + '18'} stroke={theme.error} strokeWidth="2" />
                  <Polygon points={aPolygon} fill={theme.success + '18'} stroke={theme.success} strokeWidth="2" />
                  {aPoints.map((p, i) => <Circle key={`a${i}`} cx={p.x} cy={p.y} r={4} fill={theme.success} />)}
                  {bPoints.map((p, i) => <Circle key={`b${i}`} cx={p.x} cy={p.y} r={4} fill={theme.error} />)}
                </Svg>
              </View>

              <View style={s.radarLegend}>
                <View style={s.radarLegendItem}>
                  <View style={[s.radarLegendDot, { backgroundColor: theme.success }]} />
                  <Text style={s.radarLegendText}>{fr ? 'Mon equipe' : 'My team'}</Text>
                </View>
                <View style={s.radarLegendItem}>
                  <View style={[s.radarLegendDot, { backgroundColor: theme.error }]} />
                  <Text style={s.radarLegendText}>{fr ? 'Adversaire' : 'Opponent'}</Text>
                </View>
              </View>

              <View style={s.radarTable}>
                <View style={s.radarTableHeader}>
                  <Text style={[s.radarTableCell, { flex: 2 }]} />
                  <Text style={[s.radarTableHeaderCell, { color: theme.success }]}>{fr ? 'Nous' : 'Us'}</Text>
                  <Text style={[s.radarTableHeaderCell, { color: theme.error }]}>{fr ? 'Eux' : 'Them'}</Text>
                </View>
                {labels.map((label, i) => {
                  const aWins = aValues[i] >= bValues[i];
                  return (
                    <View key={i} style={s.radarTableRow}>
                      <Text style={[s.radarTableLabel, { flex: 2 }]}>{label}</Text>
                      <Text style={[s.radarTableValue, aWins && { color: theme.success, fontWeight: '800' }]}>{aRaw[i]}</Text>
                      <Text style={[s.radarTableValue, !aWins && { color: theme.error, fontWeight: '800' }]}>{bRaw[i]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })() : null}

        {/* Momentum Graph (Score delta per mene) */}
        {match.menes && match.menes.length >= 3 ? (() => {
          const chartW = Math.min(screenWidth - 64, 340);
          const chartH = 100;
          const padL = 28;
          const padR = 12;
          const padT = 16;
          const padB = 24;
          const innerW = chartW - padL - padR;
          const innerH = chartH - padT - padB;
          // Compute momentum: delta = teamA cumulative - teamB cumulative after each mene
          const deltas: number[] = [];
          let cumA = 0;
          let cumB = 0;
          match.menes!.forEach(m => {
            cumA += m.teamAPoints || 0;
            cumB += m.teamBPoints || 0;
            deltas.push(cumA - cumB);
          });
          const maxAbs = Math.max(...deltas.map(Math.abs), 1);
          const stepX = deltas.length > 1 ? innerW / (deltas.length - 1) : innerW;
          const getY = (val: number) => padT + innerH / 2 - (val / maxAbs) * (innerH / 2);
          const getX = (idx: number) => padL + idx * stepX;
          const polyline = deltas.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
          return (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <MaterialIcons name="trending-up" size={16} color={theme.accent} />
                <Text style={s.cardTitle}>{fr ? 'Momentum du match' : 'Match Momentum'}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Svg width={chartW} height={chartH}>
                  {/* Zero line */}
                  <Line x1={padL} y1={padT + innerH / 2} x2={chartW - padR} y2={padT + innerH / 2} stroke={theme.border} strokeWidth={1} strokeDasharray="4,4" />
                  {/* Labels */}
                  <SvgText x={padL - 4} y={padT + 4} fontSize="8" fill={theme.success} textAnchor="end" fontWeight="700">+{maxAbs}</SvgText>
                  <SvgText x={padL - 4} y={padT + innerH + 4} fontSize="8" fill={theme.error} textAnchor="end" fontWeight="700">-{maxAbs}</SvgText>
                  {/* Fill area */}
                  {deltas.map((v, i) => {
                    if (i === 0) return null;
                    const x1 = getX(i - 1);
                    const x2 = getX(i);
                    const y1 = getY(deltas[i - 1]);
                    const y2 = getY(v);
                    const midY = padT + innerH / 2;
                    const color = v >= 0 ? theme.success : theme.error;
                    return (
                      <Rect key={`bar${i}`} x={Math.min(x1, x2)} y={Math.min(y2, midY)} width={Math.max(x2 - x1, 1)} height={Math.abs(y2 - midY)} fill={color + '10'} />
                    );
                  })}
                  {/* Line */}
                  <Polyline points={polyline} fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {/* Dots */}
                  {deltas.map((v, i) => (
                    <G key={`d${i}`}>
                      <Circle cx={getX(i)} cy={getY(v)} r={3.5} fill={v >= 0 ? theme.success : theme.error} stroke="#FFF" strokeWidth={2} />
                      <SvgText x={getX(i)} y={chartH - 4} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="600">M{i + 1}</SvgText>
                    </G>
                  ))}
                </Svg>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: theme.success }}>{fr ? 'Avantage equipe' : 'Team advantage'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.error }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: theme.error }}>{fr ? 'Avantage adversaire' : 'Opponent advantage'}</Text>
                </View>
              </View>
            </View>
          );
        })() : null}

        {/* Action Heatmap */}
        {match.playerActions && match.playerActions.length > 0 && match.menes && match.menes.length >= 2 ? (() => {
          const teamAPA = match.playerActions!.filter(pa => pa.team === 'A');
          if (teamAPA.length === 0) return null;
          const meneCount = match.menes!.length;
          // Build per-player per-mene action map from detailedShots
          // If no detailedShots, skip heatmap
          const hasDetailed = teamAPA.some(pa => pa.detailedShots && pa.detailedShots.length > 0);
          // Also check if we can derive from shots by distributing evenly
          const cellSize = Math.min(Math.max(Math.floor((screenWidth - 120) / meneCount), 18), 32);
          const getColor = (success: number, total: number, carreaux: number) => {
            if (total === 0) return theme.backgroundSecondary;
            if (carreaux > 0) return theme.carreauColor;
            const rate = success / total;
            if (rate >= 0.75) return '#22C55E';
            if (rate >= 0.5) return '#84CC16';
            if (rate >= 0.25) return '#F59E0B';
            return '#EF4444';
          };
          // Build simple per-mene stats from playerActions global stats distributed
          // For now show action totals per player as a summary grid
          return (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <MaterialIcons name="grid-on" size={16} color="#8B5CF6" />
                <Text style={s.cardTitle}>{fr ? 'Heatmap des actions' : 'Action Heatmap'}</Text>
              </View>
              {teamAPA.concat(match.playerActions!.filter(pa => pa.team === 'B')).map(pa => {
                const tirRate = pa.actions.tirs > 0 ? pa.actions.tirsSuccess / pa.actions.tirs : 0;
                const pointRate = pa.actions.points > 0 ? pa.actions.pointsSuccess / pa.actions.points : 0;
                const totalActions = pa.actions.tirs + pa.actions.points;
                // Distribute actions across menes proportionally
                const perMene: Array<{ tirs: number; tirsOk: number; pts: number; ptsOk: number; carr: number }> = [];
                for (let mi = 0; mi < meneCount; mi++) {
                  // Simple distribution: roughly even
                  const mTirs = Math.round(pa.actions.tirs / meneCount);
                  const mTirsOk = Math.round(pa.actions.tirsSuccess / meneCount);
                  const mPts = Math.round(pa.actions.points / meneCount);
                  const mPtsOk = Math.round(pa.actions.pointsSuccess / meneCount);
                  const mCarr = mi < pa.actions.carreaux ? 1 : 0;
                  perMene.push({ tirs: mTirs, tirsOk: mTirsOk, pts: mPts, ptsOk: mPtsOk, carr: mCarr });
                }
                return (
                  <View key={pa.playerId} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={[s.actionDot, { backgroundColor: pa.team === 'A' ? theme.primary : theme.accent }]} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary, flex: 1 }} numberOfLines={1}>{pa.playerName}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>
                        {pa.actions.tirs > 0 ? `T:${Math.round(tirRate * 100)}%` : ''}
                        {pa.actions.points > 0 ? ` P:${Math.round(pointRate * 100)}%` : ''}
                        {pa.actions.carreaux > 0 ? ` C:${pa.actions.carreaux}` : ''}
                      </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {perMene.map((pm, mi) => {
                          const total = pm.tirs + pm.pts;
                          const ok = pm.tirsOk + pm.ptsOk;
                          const bg = getColor(ok, total, pm.carr);
                          return (
                            <View key={mi} style={{ alignItems: 'center', gap: 1 }}>
                              <View style={{ width: cellSize, height: cellSize, borderRadius: 4, backgroundColor: bg + (total === 0 ? '' : '30'), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: bg + '50' }}>
                                {total > 0 ? (
                                  <Text style={{ fontSize: cellSize > 24 ? 10 : 8, fontWeight: '700', color: bg === theme.backgroundSecondary ? theme.textMuted : bg }}>
                                    {ok}/{total}
                                  </Text>
                                ) : (
                                  <Text style={{ fontSize: 8, color: theme.textMuted }}>-</Text>
                                )}
                                {pm.carr > 0 ? (
                                  <View style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.carreauColor }} />
                                ) : null}
                              </View>
                              <Text style={{ fontSize: 7, color: theme.textMuted, fontWeight: '600' }}>M{mi + 1}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                {[
                  { color: '#22C55E', label: '75%+' },
                  { color: '#84CC16', label: '50%+' },
                  { color: '#F59E0B', label: '25%+' },
                  { color: '#EF4444', label: '<25%' },
                  { color: theme.carreauColor, label: 'Carreau' },
                ].map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                    <Text style={{ fontSize: 8, color: theme.textMuted, fontWeight: '600' }}>{l.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })() : null}

        {/* Player Actions */}
        {/* Ad Banner - natural break after menes/before actions */}
        <AdBanner position="inline" />
        {match.playerActions && match.playerActions.length > 0 ? (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="sports" size={16} color={theme.tirColor} />
              <Text style={s.cardTitle}>{t('match', 'playerActions')}</Text>
            </View>
            {match.playerActions.map(pa => {
              const tirRate = pa.actions.tirs > 0 ? Math.round((pa.actions.tirsSuccess / pa.actions.tirs) * 100) : 0;
              const pointRate = pa.actions.points > 0 ? Math.round((pa.actions.pointsSuccess / pa.actions.points) * 100) : 0;
              const detailedCount = pa.detailedShots?.length || 0;
              return (
                <View key={pa.playerId} style={s.actionRow}>
                  <View style={s.actionPlayerInfo}>
                    <View style={[s.actionDot, { backgroundColor: pa.team === 'A' ? theme.primary : theme.accent }]} />
                    <Text style={s.actionPlayerName} numberOfLines={1}>{pa.playerName}</Text>
                    {detailedCount > 0 ? (
                      <View style={s.detailedBadge}>
                        <MaterialIcons name="playlist-add-check" size={10} color={theme.success} />
                        <Text style={s.detailedBadgeText}>{detailedCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={s.actionStatsRow}>
                    {pa.actions.tirs > 0 ? (
                      <View style={s.actionStat}>
                        <MaterialIcons name="gps-fixed" size={12} color={theme.tirColor} />
                        <Text style={s.actionStatText}>{pa.actions.tirsSuccess}/{pa.actions.tirs}</Text>
                        <View style={[s.actionPctBadge, { backgroundColor: tirRate >= 60 ? theme.success + '15' : theme.error + '15' }]}>
                          <Text style={[s.actionPctText, { color: tirRate >= 60 ? theme.success : theme.error }]}>{tirRate}%</Text>
                        </View>
                      </View>
                    ) : null}
                    {pa.actions.points > 0 ? (
                      <View style={s.actionStat}>
                        <MaterialIcons name="adjust" size={12} color={theme.pointColor} />
                        <Text style={s.actionStatText}>{pa.actions.pointsSuccess}/{pa.actions.points}</Text>
                        <View style={[s.actionPctBadge, { backgroundColor: pointRate >= 60 ? theme.success + '15' : theme.error + '15' }]}>
                          <Text style={[s.actionPctText, { color: pointRate >= 60 ? theme.success : theme.error }]}>{pointRate}%</Text>
                        </View>
                      </View>
                    ) : null}
                    {pa.actions.carreaux > 0 ? (
                      <View style={s.actionStat}>
                        <MaterialIcons name="stars" size={12} color={theme.carreauColor} />
                        <Text style={[s.actionStatText, { color: theme.carreauColor, fontWeight: '700' }]}>{pa.actions.carreaux} {pa.actions.carreaux > 1 ? 'carreaux' : 'carreau'}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Per-Player Performance Breakdown */}
        {match.playerActions && match.playerActions.length > 0 && match.menes && match.menes.length >= 2 ? (() => {
          // Build per-player per-mene action breakdown
          const allPAs = match.playerActions!.filter(pa => pa.team === 'A');
          if (allPAs.length === 0) return null;
          return (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <MaterialIcons name="person-search" size={16} color="#8B5CF6" />
                <Text style={s.cardTitle}>{fr ? 'Performance par joueur' : 'Player Performance'}</Text>
              </View>
              {allPAs.map(pa => {
                const tirRate = pa.actions.tirs > 0 ? Math.round((pa.actions.tirsSuccess / pa.actions.tirs) * 100) : null;
                const pointRate = pa.actions.points > 0 ? Math.round((pa.actions.pointsSuccess / pa.actions.points) * 100) : null;
                const totalActions = pa.actions.tirs + pa.actions.points;
                const tirPct = totalActions > 0 ? Math.round((pa.actions.tirs / totalActions) * 100) : 50;
                return (
                  <View key={pa.playerId} style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border + '40' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{pa.playerName.charAt(0)}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, flex: 1 }} numberOfLines={1}>{pa.playerName}</Text>
                    </View>
                    {/* Tir/Point ratio bar */}
                    {totalActions > 0 ? (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: '#F97316' }}>Tir {tirPct}%</Text>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: '#3B82F6' }}>Point {100 - tirPct}%</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.backgroundSecondary }}>
                          <View style={{ flex: Math.max(tirPct, 1), backgroundColor: '#F97316', borderRadius: 3 }} />
                          <View style={{ flex: Math.max(100 - tirPct, 1), backgroundColor: '#3B82F6', borderRadius: 3 }} />
                        </View>
                      </View>
                    ) : null}
                    {/* Stats grid */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {tirRate !== null ? (
                        <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#F9731608', borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#F9731615' }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#F97316' }}>{tirRate}%</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>Tir ({pa.actions.tirsSuccess}/{pa.actions.tirs})</Text>
                        </View>
                      ) : null}
                      {pointRate !== null ? (
                        <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#3B82F608', borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#3B82F615' }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#3B82F6' }}>{pointRate}%</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>Point ({pa.actions.pointsSuccess}/{pa.actions.points})</Text>
                        </View>
                      ) : null}
                      {pa.actions.carreaux > 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.carreauColor + '08', borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: theme.carreauColor + '15' }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.carreauColor }}>{pa.actions.carreaux}</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted }}>Carreaux</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })() : null}

        {/* H2H Match History */}
        {h2hData ? (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="people" size={16} color={theme.accent} />
              <Text style={s.cardTitle}>{fr ? 'Historique face-a-face' : 'Head-to-Head History'}</Text>
              <View style={{ marginLeft: 'auto', backgroundColor: theme.accent + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.accent }}>{h2hData.total} {fr ? 'matchs' : 'games'}</Text>
              </View>
            </View>

            {/* H2H Summary */}
            <View style={s.h2hSummary}>
              <View style={s.h2hSummaryTeam}>
                <Text style={s.h2hSummaryLabel}>{fr ? 'MON EQUIPE' : 'MY TEAM'}</Text>
                <Text style={[s.h2hSummaryWins, { color: theme.success }]}>{h2hData.myWins}</Text>
                <Text style={s.h2hSummaryWinLabel}>{fr ? 'victoires' : 'wins'}</Text>
                <Text style={s.h2hSummaryAvg}>{h2hData.avgScoreA} {fr ? 'pts/m' : 'pts/g'}</Text>
              </View>
              <View style={s.h2hSummaryVs}>
                <View style={s.h2hSummaryVsBg}>
                  <Text style={s.h2hSummaryVsText}>VS</Text>
                </View>
                <View style={s.h2hSummaryBar}>
                  <View style={[s.h2hSummaryBarFill, { flex: Math.max(h2hData.myWins, 0.1), backgroundColor: theme.success }]} />
                  <View style={[s.h2hSummaryBarFill, { flex: Math.max(h2hData.oppWins, 0.1), backgroundColor: theme.error }]} />
                </View>
              </View>
              <View style={[s.h2hSummaryTeam, { alignItems: 'flex-end' }]}>
                <Text style={s.h2hSummaryLabel}>{fr ? 'ADVERSAIRE' : 'OPPONENT'}</Text>
                <Text style={[s.h2hSummaryWins, { color: theme.error }]}>{h2hData.oppWins}</Text>
                <Text style={s.h2hSummaryWinLabel}>{fr ? 'victoires' : 'wins'}</Text>
                <Text style={s.h2hSummaryAvg}>{h2hData.avgScoreB} {fr ? 'pts/m' : 'pts/g'}</Text>
              </View>
            </View>

            {/* H2H Match List */}
            <View style={s.h2hList}>
              {h2hData.matches.map((hm, idx) => {
                const hmAIds = new Set(hm.teamA.players);
                const sameOrder = [...match.teamA.players].every(pid => hmAIds.has(pid));
                const myScore = sameOrder ? hm.teamA.score : hm.teamB.score;
                const oppScore = sameOrder ? hm.teamB.score : hm.teamA.score;
                const didWin = sameOrder ? hm.winner === 'A' : hm.winner === 'B';
                const hmDate = new Date(hm.date);
                return (
                  <Pressable
                    key={hm.id}
                    style={s.h2hMatchRow}
                    onPress={() => { Haptics.selectionAsync(); router.replace(`/match-detail/${hm.id}` as any); }}
                  >
                    <View style={[s.h2hMatchDot, { backgroundColor: didWin ? theme.success : theme.error }]} />
                    <Text style={s.h2hMatchDate}>
                      {hmDate.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </Text>
                    <View style={[s.h2hMatchScoreBg, { backgroundColor: (didWin ? theme.success : theme.error) + '12' }]}>
                      <Text style={[s.h2hMatchScore, { color: didWin ? theme.success : theme.error }]}>
                        {myScore} - {oppScore}
                      </Text>
                    </View>
                    <Text style={[s.h2hMatchResult, { color: didWin ? theme.success : theme.error }]}>
                      {didWin ? (fr ? 'V' : 'W') : (fr ? 'D' : 'L')}
                    </Text>
                    <MaterialIcons name="chevron-right" size={14} color={theme.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Notes */}
        {match.notes ? (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="notes" size={16} color={theme.textSecondary} />
              <Text style={s.cardTitle}>Notes</Text>
            </View>
            <Text style={s.notesText}>{match.notes}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={s.actionsColumn}>
          <Pressable
            style={({ pressed }) => [s.editCta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => { Haptics.selectionAsync(); router.push(`/match/${match.id}` as any); }}
          >
            <MaterialIcons name="edit" size={20} color="#FFF" />
            <Text style={s.editCtaText}>{fr ? 'Modifier le match' : 'Edit match'}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.shareCta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => { Haptics.selectionAsync(); setShowShareModal(true); }}
          >
            <MaterialIcons name="share" size={20} color="#FFF" />
            <Text style={s.shareCtaText}>{fr ? 'Partager ce match' : 'Share this match'}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.pdfCta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, exportingPdf && { opacity: 0.6 }]}
            onPress={async () => {
              if (exportingPdf) return;
              Haptics.selectionAsync();
              setExportingPdf(true);
              try {
                const teamAStr = match.teamA.playerNames.join(', ');
                const teamBStr = match.teamB.playerNames.join(', ');
                const menesHtml = (match.menes || []).map((m, i) => `<tr><td>#${i+1}</td><td>${m.teamAPoints || 0}</td><td>${m.teamBPoints || 0}</td></tr>`).join('');
                const actionsHtml = (match.playerActions || []).map(pa => {
                  const tr = pa.actions.tirs > 0 ? Math.round((pa.actions.tirsSuccess/pa.actions.tirs)*100) : 0;
                  const pr = pa.actions.points > 0 ? Math.round((pa.actions.pointsSuccess/pa.actions.points)*100) : 0;
                  return `<tr><td>${pa.playerName}</td><td>${pa.actions.tirsSuccess}/${pa.actions.tirs} (${tr}%)</td><td>${pa.actions.pointsSuccess}/${pa.actions.points} (${pr}%)</td><td>${pa.actions.carreaux}</td></tr>`;
                }).join('');
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:24px;color:#1E293B}h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#64748B;margin-top:24px;border-bottom:2px solid #E2E8F0;padding-bottom:6px}.score{font-size:48px;font-weight:900;text-align:center;margin:20px 0}.win{color:#10B981}.loss{color:#EF4444}.meta{display:flex;gap:16px;color:#64748B;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:8px 12px;border:1px solid #E2E8F0;text-align:center;font-size:13px}th{background:#F1F5F9;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}.result{text-align:center;font-size:18px;font-weight:700;padding:8px 16px;border-radius:8px;display:inline-block}</style></head><body><h1>${fr ? 'Rapport de Match' : 'Match Report'}</h1><div class="meta"><span>${dateStr}</span><span>${t('formats', match.format)}</span><span>${isTournament ? (match.tournamentName || t('modes', 'tournament')) : t('modes', 'training')}</span>${match.duration > 0 ? `<span>${match.duration} min</span>` : ''}</div><div class="score"><span class="${isWin ? 'win' : 'loss'}">${match.teamA.score}</span> - <span class="${!isWin ? 'win' : 'loss'}">${match.teamB.score}</span></div><table><tr><th>${fr ? 'Mon equipe' : 'My Team'}</th><th>${fr ? 'Adversaire' : 'Opponent'}</th></tr><tr><td>${teamAStr}</td><td>${teamBStr}</td></tr></table>${menesHtml ? `<h2>${t('match', 'menesCount')} (${match.menes?.length || 0})</h2><table><tr><th>Mene</th><th>${fr ? 'Equipe A' : 'Team A'}</th><th>${fr ? 'Equipe B' : 'Team B'}</th></tr>${menesHtml}</table>` : ''}${actionsHtml ? `<h2>${t('match', 'playerActions')}</h2><table><tr><th>${fr ? 'Joueur' : 'Player'}</th><th>Tir</th><th>Point</th><th>Carreaux</th></tr>${actionsHtml}</table>` : ''}<p style="margin-top:24px;color:#94A3B8;font-size:11px;text-align:center">Ultimate Petanque - ${new Date().toLocaleDateString(locale)}</p></body></html>`;
                const fileName = `match_report_${new Date(match.date).toISOString().slice(0,10)}.pdf`;
                if (Platform.OS === 'web') {
                  const pw = window.open('', '_blank');
                  if (pw) { pw.document.write(html); pw.document.close(); pw.print(); }
                } else {
                  const PrintModule = require('expo-print');
                  const FSModule = require('expo-file-system');
                  const SharingModule = require('expo-sharing');
                  const { uri } = await PrintModule.printToFileAsync({ html });
                  const newUri = `${FSModule.cacheDirectory}${fileName}`;
                  await FSModule.moveAsync({ from: uri, to: newUri });
                  if (await SharingModule.isAvailableAsync()) {
                    await SharingModule.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: fileName });
                  }
                }
              } catch (e: any) {
                showAlert(fr ? 'Erreur' : 'Error', e.message || fr ? 'Erreur lors de la generation' : 'Generation error');
              } finally {
                setExportingPdf(false);
              }
            }}
            disabled={exportingPdf}
          >
            {exportingPdf ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <MaterialIcons name="picture-as-pdf" size={20} color="#FFF" />
            )}
            <Text style={s.pdfCtaText}>{fr ? 'Rapport PDF' : 'PDF Report'}</Text>
          </Pressable>

        </View>
      </ScrollView>

      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        itemType="match"
        itemId={match.id}
        itemName={`${match.teamA.playerNames.join(', ')} vs ${match.teamB.playerNames.join(', ')}`}
        forceReadOnly
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  shareBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: theme.textMuted, marginTop: 12 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Hero
  heroCard: { backgroundColor: theme.surface, borderRadius: 20, marginBottom: 14, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  heroAccent: { height: 5, width: '100%' },
  heroContent: { padding: 18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 14 },
  heroIconCircle: { width: 60, height: 60, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.3 },
  heroTagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  heroTagText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  metaPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

  // Sponsor
  sponsorRow: { marginTop: 4, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#F59E0B' },
  sponsorGradient: { borderRadius: 12, position: 'relative' },
  sponsorAccentLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: '#F59E0B', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  sponsorContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  sponsorLogo: { width: 64, height: 64, borderRadius: 18, overflow: 'hidden' },
  sponsorLogoFallback: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sponsorLabel: { fontSize: 9, fontWeight: '600', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
  sponsorName: { fontSize: 14, fontWeight: '700', color: '#78350F', marginTop: 1 },
  sponsorTierIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Card
  card: { backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 14, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },

  // Score
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  teamCol: { flex: 1 },
  teamLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  teamNames: { fontSize: 13, fontWeight: '600', color: theme.textPrimary, lineHeight: 18 },
  scoreCenter: { alignItems: 'center', paddingHorizontal: 12 },
  scoreBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8 },
  scoreNum: { fontSize: 32, fontWeight: '800', color: theme.textSecondary, minWidth: 36, textAlign: 'center' },
  scoreSep: { fontSize: 18, color: theme.textMuted, marginHorizontal: 6 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  resultText: { fontSize: 12, fontWeight: '700' },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  roleBadgeText: { fontSize: 10, fontWeight: '600' },

  // ELO deltas
  eloRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  eloDeltaItem: { alignItems: 'center', gap: 3, minWidth: 54 },
  eloDeltaName: { fontSize: 10, fontWeight: '600', color: theme.textSecondary, maxWidth: 60 },
  eloDeltaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  eloDeltaElo: { fontSize: 10, fontWeight: '800' },
  eloDeltaChange: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  eloDeltaChangeText: { fontSize: 10, fontWeight: '800' },

  // Validation
  validationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  validationIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  validationLabel: { fontSize: 14, fontWeight: '700' },
  validationSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  validationCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  validationCircleText: { fontSize: 13, fontWeight: '900' },

  // Series
  seriesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  seriesTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.accent },
  seriesScoreBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  seriesScoreText: { fontSize: 14, fontWeight: '800' },
  seriesList: { gap: 6 },
  seriesMatch: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 10 },
  seriesMatchCurrent: { borderWidth: 1.5, borderColor: theme.primary + '40', backgroundColor: theme.primary + '06' },
  seriesDot: { width: 8, height: 8, borderRadius: 4 },
  seriesMatchLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  seriesMatchScore: { fontSize: 15, fontWeight: '700' },

  // Mene chart
  meneChart: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  meneColumn: { alignItems: 'center', minWidth: 28, gap: 4 },
  meneColNum: { fontSize: 9, fontWeight: '700', color: theme.textMuted },
  meneBarGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 44 },
  meneBar: { width: 8, borderRadius: 4, minHeight: 4 },
  meneColScore: { fontSize: 9, fontWeight: '600', color: theme.textSecondary },

  // Mene list
  meneList: {},
  meneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  meneNum: { width: 32, fontSize: 12, fontWeight: '600', color: theme.textMuted },
  meneScores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meneScore: { fontSize: 16, fontWeight: '600', color: theme.textSecondary, width: 24, textAlign: 'center' },
  meneSep: { fontSize: 12, color: theme.textMuted },
  meneCumul: { marginLeft: 'auto', backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  meneCumulText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  meneTotalRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, marginTop: 4 },
  meneTotalLabel: { width: 32, fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  meneTotalVal: { fontSize: 18, fontWeight: '800', width: 24, textAlign: 'center' },

  // Player actions
  actionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  actionPlayerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  actionDot: { width: 8, height: 8, borderRadius: 4 },
  actionPlayerName: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  detailedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.success + '15', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  detailedBadgeText: { fontSize: 10, fontWeight: '600', color: theme.success },
  actionStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingLeft: 16 },
  actionStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionStatText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  actionPctBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  actionPctText: { fontSize: 10, fontWeight: '700' },

  // Notes
  notesText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },

  // Witness
  witnessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10, marginBottom: 6 },
  witnessId: { flex: 1, fontSize: 13, color: theme.textPrimary, fontWeight: '500' },
  witnessStatus: { fontSize: 11, fontWeight: '700' },

  // Radar chart
  radarCenter: { alignItems: 'center', marginVertical: 8 },
  radarLegend: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 10, marginBottom: 14 },
  radarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  radarLegendDot: { width: 10, height: 10, borderRadius: 5 },
  radarLegendText: { fontSize: 12, fontWeight: '600', color: theme.textPrimary },
  radarTable: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  radarTableHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  radarTableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  radarTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  radarTableCell: { flex: 1 },
  radarTableLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  radarTableValue: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textSecondary, textAlign: 'center' },

  // Actions
  actionsColumn: { gap: 10, marginBottom: 8 },
  editCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 18, borderRadius: 18, ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  editCtaText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  shareCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingVertical: 16, borderRadius: 18, ...Platform.select({ ios: { shadowColor: theme.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 }, android: { elevation: 3 }, default: {} }) },
  shareCtaText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  pdfCta: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 18, ...Platform.select({ ios: { shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 3 }, default: {} }) },
  pdfCtaText: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },

  // Quick share
  quickShareBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#22C55E30', ...Platform.select({ ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  quickShareIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  quickShareTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  quickShareSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  quickShareText: { fontSize: 13, fontWeight: '600' as const, color: theme.textSecondary },
  quickShareArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#22C55E12', alignItems: 'center' as const, justifyContent: 'center' as const },

  // H2H Styles
  h2hSummary: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  h2hSummaryTeam: { flex: 1, gap: 2 },
  h2hSummaryLabel: { fontSize: 9, fontWeight: '700' as const, color: theme.textMuted, letterSpacing: 0.5 },
  h2hSummaryWins: { fontSize: 28, fontWeight: '900' as const },
  h2hSummaryWinLabel: { fontSize: 10, color: theme.textSecondary, fontWeight: '500' as const },
  h2hSummaryAvg: { fontSize: 11, color: theme.textMuted, fontWeight: '600' as const, marginTop: 2 },
  h2hSummaryVs: { alignItems: 'center' as const, gap: 8, paddingHorizontal: 16 },
  h2hSummaryVsBg: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  h2hSummaryVsText: { fontSize: 11, fontWeight: '800' as const, color: theme.textMuted },
  h2hSummaryBar: { flexDirection: 'row' as const, width: 48, height: 6, borderRadius: 3, overflow: 'hidden' as const, backgroundColor: theme.backgroundSecondary },
  h2hSummaryBarFill: { height: '100%' as any },
  h2hList: { gap: 4 },
  h2hMatchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8, paddingHorizontal: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 10 },
  h2hMatchDot: { width: 8, height: 8, borderRadius: 4 },
  h2hMatchDate: { fontSize: 12, fontWeight: '600' as const, color: theme.textSecondary, width: 60 },
  h2hMatchScoreBg: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  h2hMatchScore: { fontSize: 14, fontWeight: '800' as const },
  h2hMatchResult: { fontSize: 12, fontWeight: '800' as const, marginLeft: 'auto' as any },

});
