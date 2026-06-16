import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Dimensions, Modal, Platform } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import theme from '@/constants/theme';
import AdBanner from '@/components/ui/AdBanner';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { fetchEloSeasons, fetchEloHistory, getEloRank, formatEloDelta, EloSeasonEntry, EloHistoryEntry, ELO_INITIAL, ELO_RANKS, isInPlacement, ELO_PLACEMENT_MATCHES } from '@/services/eloService';
import { LEAGUE_TIERS, getLeagueTier, getLeagueProgress, LeagueTier, fetchPlayerGlobalRank } from '@/services/globalRankingService';
import { getLastWeekSummary, getCurrentWeekStart, getWeekEnd, formatDateISO } from '@/services/weeklyLeaderboardService';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

// ===================== DUAL RADAR CHART =====================
interface DualRadarPoint {
  label: string;
  valueA: number; // 0-100 normalized
  valueB: number;
  rawA: string;
  rawB: string;
}

function polarToCart(cx: number, cy: number, r: number, idx: number, total: number): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * idx) / total;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

const DualRadarChart = React.memo(function DualRadarChart({
  data,
  size = 260,
  colorA = '#3B82F6',
  colorB = '#F59E0B',
  labelA,
  labelB,
}: {
  data: DualRadarPoint[];
  size?: number;
  colorA?: string;
  colorB?: string;
  labelA: string;
  labelB: string;
}) {
  const n = data.length;
  if (n < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 40;
  const labelR = maxR + 26;
  const gridLevels = 4;

  const grids = Array.from({ length: gridLevels }, (_, level) => {
    const r = (maxR * (level + 1)) / gridLevels;
    return Array.from({ length: n }, (_, i) => {
      const [x, y] = polarToCart(cx, cy, r, i, n);
      return `${x},${y}`;
    }).join(' ');
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = polarToCart(cx, cy, maxR, i, n);
    return { x1: cx, y1: cy, x2: x, y2: y };
  });

  const makePolygon = (key: 'valueA' | 'valueB') =>
    data.map((d, i) => {
      const r = (maxR * Math.min(d[key], 100)) / 100;
      const [x, y] = polarToCart(cx, cy, r, i, n);
      return { x, y };
    });

  const polyA = makePolygon('valueA');
  const polyB = makePolygon('valueB');
  const strA = polyA.map(p => `${p.x},${p.y}`).join(' ');
  const strB = polyB.map(p => `${p.x},${p.y}`).join(' ');

  const labels = data.map((d, i) => {
    const [x, y] = polarToCart(cx, cy, labelR, i, n);
    let anchor: 'middle' | 'start' | 'end' = 'middle';
    if (x < cx - 10) anchor = 'end';
    else if (x > cx + 10) anchor = 'start';
    return { x, y: y + 3, label: d.label, anchor };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {grids.map((pts, i) => (
          <Polygon key={`g${i}`} points={pts} fill="none" stroke={theme.border} strokeWidth={i === gridLevels - 1 ? 1.5 : 0.7} strokeDasharray={i < gridLevels - 1 ? '3,3' : undefined} opacity={i === gridLevels - 1 ? 0.6 : 0.3} />
        ))}
        {axes.map((a, i) => (
          <Line key={`ax${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={theme.border} strokeWidth={0.7} opacity={0.35} />
        ))}
        <Polygon points={strA} fill={colorA} fillOpacity={0.15} stroke={colorA} strokeWidth={2} strokeLinejoin="round" />
        <Polygon points={strB} fill={colorB} fillOpacity={0.15} stroke={colorB} strokeWidth={2} strokeLinejoin="round" strokeDasharray="6,3" />
        {polyA.map((p, i) => <Circle key={`dA${i}`} cx={p.x} cy={p.y} r={4} fill={colorA} stroke="#FFF" strokeWidth={2} />)}
        {polyB.map((p, i) => <Circle key={`dB${i}`} cx={p.x} cy={p.y} r={3.5} fill={colorB} stroke="#FFF" strokeWidth={1.5} />)}
        {labels.map((l, i) => (
          <SvgText key={`lb${i}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={10} fontWeight="700" fill={theme.textSecondary}>{l.label}</SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: colorA }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colorA }}>{labelA}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: colorB, borderStyle: 'dashed' }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colorB }}>{labelB}</Text>
        </View>
      </View>
    </View>
  );
});

interface SeasonAward {
  id: string;
  icon: string;
  color: string;
  label: string;
  value: string;
  subValue?: string;
  seasonYear: number;
}

export default function EloAwardsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { selfPlayer, matches } = useAppData();
  const isFr = language === 'fr';

  const [seasons, setSeasons] = useState<EloSeasonEntry[]>([]);
  const [eloHistory, setEloHistory] = useState<EloHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Season comparison state
  const [showCompare, setShowCompare] = useState(false);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  // ELO Milestones
  const milestones = useMemo(() => {
    if (eloHistory.length === 0) return [];
    const reversed = [...eloHistory].reverse(); // oldest first
    const items: Array<{ id: string; label: string; elo: number; date: string; icon: string; color: string; emblem?: string }> = [];
    const tierThresholds = [...LEAGUE_TIERS].reverse(); // ascending by ELO: bronze, silver, gold...

    // First match milestone
    if (reversed.length > 0) {
      items.push({ id: 'first_match', label: t('leaderboard', 'eloMilestoneFirstMatch'), elo: reversed[0].eloAfter, date: reversed[0].recordedAt, icon: 'flag', color: '#3B82F6' });
    }

    // Track which tier thresholds have been crossed
    const crossedTiers = new Set<string>();
    let prevElo = reversed.length > 0 ? reversed[0].eloBefore : ELO_INITIAL;
    for (const entry of reversed) {
      const prevTier = getLeagueTier(prevElo);
      const curTier = getLeagueTier(entry.eloAfter);
      if (prevTier.id !== curTier.id && !crossedTiers.has(curTier.id) && curTier.minElo > prevTier.minElo) {
        crossedTiers.add(curTier.id);
        items.push({
          id: `tier_${curTier.id}`,
          label: `${isFr ? curTier.name.fr : curTier.name.en} (${curTier.minElo}+)`,
          elo: entry.eloAfter,
          date: entry.recordedAt,
          icon: curTier.icon,
          color: curTier.color,
          emblem: curTier.emblem,
        });
      }
      prevElo = entry.eloAfter;
    }

    // Peak ELO milestone (only if > starting)
    const peak = Math.max(...reversed.map(e => e.eloAfter));
    if (peak > ELO_INITIAL + 50) {
      const peakEntry = reversed.find(e => e.eloAfter === peak);
      if (peakEntry) {
        const existing = items.find(i => i.id === `tier_${getLeagueTier(peak).id}`);
        if (!existing || existing.elo !== peak) {
          items.push({ id: 'peak_elo', label: `Peak ELO: ${peak}`, elo: peak, date: peakEntry.recordedAt, icon: 'whatshot', color: '#F59E0B', emblem: getLeagueTier(peak).emblem });
        }
      }
    }

    // Sort chronologically
    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return items;
  }, [eloHistory, isFr, t]);

  useEffect(() => {
    if (!selfPlayer) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const [seasonsRes, historyRes] = await Promise.all([
        fetchEloSeasons(selfPlayer.id),
        fetchEloHistory(selfPlayer.id, 100),
      ]);
      setSeasons(seasonsRes.seasons);
      setEloHistory(historyRes.history);
      setLoading(false);
    };
    load();
  }, [selfPlayer?.id]);

  const currentElo = selfPlayer?.eloRating || ELO_INITIAL;
  const currentRank = getEloRank(currentElo);
  const currentLeague = getLeagueTier(currentElo);
  const leagueProgress = getLeagueProgress(currentElo);

  // Auto-select first two seasons for comparison when loaded
  useEffect(() => {
    if (seasons.length >= 2 && !compareA && !compareB) {
      setCompareA(seasons[0].id);
      setCompareB(seasons[1].id);
    } else if (seasons.length === 1 && !compareA) {
      setCompareA(seasons[0].id);
    }
  }, [seasons]);

  // Build comparison data
  const comparisonData = useMemo(() => {
    if (!compareA || !compareB) return null;
    const sA = seasons.find(s => s.id === compareA);
    const sB = seasons.find(s => s.id === compareB);
    if (!sA || !sB) return null;

    const maxElo = Math.max(sA.finalElo, sB.finalElo, sA.peakElo, sB.peakElo, 1200);
    const maxMatches = Math.max(sA.matchesPlayed, sB.matchesPlayed, 10);
    const wrA = sA.matchesPlayed > 0 ? Math.round((sA.wins / sA.matchesPlayed) * 100) : 0;
    const wrB = sB.matchesPlayed > 0 ? Math.round((sB.wins / sB.matchesPlayed) * 100) : 0;

    const normalize = (val: number, max: number) => Math.min(100, Math.round((val / max) * 100));

    const radarData: DualRadarPoint[] = [
      { label: 'ELO', valueA: normalize(sA.finalElo, maxElo), valueB: normalize(sB.finalElo, maxElo), rawA: String(sA.finalElo), rawB: String(sB.finalElo) },
      { label: 'Peak', valueA: normalize(sA.peakElo, maxElo), valueB: normalize(sB.peakElo, maxElo), rawA: String(sA.peakElo), rawB: String(sB.peakElo) },
      { label: isFr ? 'Matchs' : 'Matches', valueA: normalize(sA.matchesPlayed, maxMatches), valueB: normalize(sB.matchesPlayed, maxMatches), rawA: String(sA.matchesPlayed), rawB: String(sB.matchesPlayed) },
      { label: isFr ? 'Victoires' : 'Win %', valueA: wrA, valueB: wrB, rawA: `${wrA}%`, rawB: `${wrB}%` },
    ];

    // Add role ELOs if available
    const maxRoleElo = Math.max(
      sA.eloTireur || 0, sB.eloTireur || 0,
      sA.eloPointeur || 0, sB.eloPointeur || 0,
      sA.eloMilieu || 0, sB.eloMilieu || 0,
      1200
    );
    const hasRoles = (sA.eloTireur && sA.eloTireur !== 1000) || (sB.eloTireur && sB.eloTireur !== 1000)
      || (sA.eloPointeur && sA.eloPointeur !== 1000) || (sB.eloPointeur && sB.eloPointeur !== 1000)
      || (sA.eloMilieu && sA.eloMilieu !== 1000) || (sB.eloMilieu && sB.eloMilieu !== 1000);

    if (hasRoles) {
      radarData.push(
        { label: isFr ? 'Tireur' : 'Shooter', valueA: normalize(sA.eloTireur || 1000, maxRoleElo), valueB: normalize(sB.eloTireur || 1000, maxRoleElo), rawA: String(sA.eloTireur || 1000), rawB: String(sB.eloTireur || 1000) },
        { label: isFr ? 'Pointeur' : 'Pointer', valueA: normalize(sA.eloPointeur || 1000, maxRoleElo), valueB: normalize(sB.eloPointeur || 1000, maxRoleElo), rawA: String(sA.eloPointeur || 1000), rawB: String(sB.eloPointeur || 1000) },
        { label: isFr ? 'Milieu' : 'Middle', valueA: normalize(sA.eloMilieu || 1000, maxRoleElo), valueB: normalize(sB.eloMilieu || 1000, maxRoleElo), rawA: String(sA.eloMilieu || 1000), rawB: String(sB.eloMilieu || 1000) },
      );
    }

    // Compute deltas for progression indicators
    const deltas = [
      { label: 'ELO', delta: sB.finalElo - sA.finalElo, valA: sA.finalElo, valB: sB.finalElo, suffix: '' },
      { label: 'Peak', delta: sB.peakElo - sA.peakElo, valA: sA.peakElo, valB: sB.peakElo, suffix: '' },
      { label: isFr ? 'Matchs' : 'Matches', delta: sB.matchesPlayed - sA.matchesPlayed, valA: sA.matchesPlayed, valB: sB.matchesPlayed, suffix: '' },
      { label: isFr ? 'Victoires' : 'Win %', delta: wrB - wrA, valA: wrA, valB: wrB, suffix: '%' },
    ];

    return { seasonA: sA, seasonB: sB, radarData, deltas };
  }, [compareA, compareB, seasons, isFr]);

  const [chartWidth, setChartWidth] = useState(() => Math.max(1, (Dimensions.get('window').width || 375) - 64));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setChartWidth(Math.max(1, window.width - 64)));
    return () => sub?.remove();
  }, []);

  // Current season stats
  const currentSeasonStats = useMemo(() => {
    const year = new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01`);
    const seasonMatches = matches.filter(m => {
      const d = new Date(m.date);
      return d >= yearStart && (m.teamA.players.includes(selfPlayer?.id || '') || m.teamB.players.includes(selfPlayer?.id || ''));
    });
    const wins = seasonMatches.filter(m => {
      const inA = m.teamA.players.includes(selfPlayer?.id || '');
      return (inA && m.winner === 'A') || (!inA && m.winner === 'B');
    }).length;
    const currentYearHistory = eloHistory.filter(h => new Date(h.recordedAt).getFullYear() === year);
    const peakElo = currentYearHistory.length > 0 ? Math.max(...currentYearHistory.map(h => h.eloAfter), currentElo) : currentElo;
    const lowestElo = currentYearHistory.length > 0 ? Math.min(...currentYearHistory.map(h => h.eloAfter)) : currentElo;
    const progression = currentElo - (currentYearHistory.length > 0 ? currentYearHistory[currentYearHistory.length - 1]?.eloBefore || ELO_INITIAL : ELO_INITIAL);
    return { matchesPlayed: seasonMatches.length, wins, peakElo, lowestElo, progression, year };
  }, [matches, selfPlayer?.id, eloHistory, currentElo]);

  // Build awards from seasons
  const seasonAwards = useMemo((): SeasonAward[] => {
    if (seasons.length === 0) return [];
    const awards: SeasonAward[] = [];

    // Best progression (highest final - initial across seasons)
    const bestProg = [...seasons].sort((a, b) => (b.finalElo - ELO_INITIAL) - (a.finalElo - ELO_INITIAL))[0];
    if (bestProg && bestProg.finalElo > ELO_INITIAL) {
      awards.push({
        id: 'best_progression',
        icon: 'trending-up',
        color: '#10B981',
        label: t('leaderboard', 'eloAwardBestProgression'),
        value: `+${bestProg.finalElo - ELO_INITIAL}`,
        subValue: `${isFr ? 'Saison' : 'Season'} ${bestProg.seasonYear} (${bestProg.finalElo})`,
        seasonYear: bestProg.seasonYear,
      });
    }

    // Highest peak
    const bestPeak = [...seasons].sort((a, b) => b.peakElo - a.peakElo)[0];
    if (bestPeak && bestPeak.peakElo > ELO_INITIAL) {
      awards.push({
        id: 'highest_peak',
        icon: 'diamond',
        color: '#06B6D4',
        label: t('leaderboard', 'eloAwardHighestPeak'),
        value: String(bestPeak.peakElo),
        subValue: `${isFr ? 'Saison' : 'Season'} ${bestPeak.seasonYear} (${getEloRank(bestPeak.peakElo).label[isFr ? 'fr' : 'en']})`,
        seasonYear: bestPeak.seasonYear,
      });
    }

    // Best win ratio
    const seasonsWithMatches = seasons.filter(s => s.matchesPlayed >= 5);
    if (seasonsWithMatches.length > 0) {
      const bestWR = [...seasonsWithMatches].sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed))[0];
      const wr = Math.round((bestWR.wins / bestWR.matchesPlayed) * 100);
      awards.push({
        id: 'best_win_ratio',
        icon: 'emoji-events',
        color: '#F59E0B',
        label: t('leaderboard', 'eloAwardBestWinRatio'),
        value: `${wr}%`,
        subValue: `${isFr ? 'Saison' : 'Season'} ${bestWR.seasonYear} (${bestWR.wins}/${bestWR.matchesPlayed})`,
        seasonYear: bestWR.seasonYear,
      });
    }

    // Most matches
    const mostMatches = [...seasons].sort((a, b) => b.matchesPlayed - a.matchesPlayed)[0];
    if (mostMatches && mostMatches.matchesPlayed > 0) {
      awards.push({
        id: 'most_matches',
        icon: 'sports',
        color: '#3B82F6',
        label: t('leaderboard', 'eloAwardMostMatches'),
        value: String(mostMatches.matchesPlayed),
        subValue: `${isFr ? 'Saison' : 'Season'} ${mostMatches.seasonYear}`,
        seasonYear: mostMatches.seasonYear,
      });
    }

    return awards;
  }, [seasons, t, isFr]);

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{t('leaderboard', 'eloAwardsTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#9333EA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{t('leaderboard', 'eloAwardsTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/* Current Season Hero — League Tier Style */}
        <Animated.View entering={FadeInDown.duration(400)}>
        <View style={st.heroCard}>
          <LinearGradient colors={currentLeague.gradient} style={st.heroGradient}>
            <View style={st.heroTop}>
              <View style={st.heroEmblemWrap}>
                <Text style={{ fontSize: 28 }}>{currentLeague.emblem}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.heroLeagueName}>{isFr ? currentLeague.name.fr : currentLeague.name.en}</Text>
                <Text style={st.heroEloValue}>{currentElo} ELO</Text>
              </View>
              <View style={st.heroSeasonBadge}>
                <Text style={st.heroSeasonYear}>{currentSeasonStats.year}</Text>
                <Text style={st.heroSeasonLabel}>{isFr ? 'Saison' : 'Season'}</Text>
              </View>
            </View>
            {/* Progress to next tier */}
            {leagueProgress.nextTier ? (
              <View style={st.heroProgressRow}>
                <View style={st.heroProgressTrack}>
                  <View style={[st.heroProgressFill, { width: `${leagueProgress.progress}%` }]} />
                </View>
                <Text style={st.heroProgressText}>{leagueProgress.eloToNext} → {leagueProgress.nextTier.emblem}</Text>
              </View>
            ) : null}
          </LinearGradient>
          <View style={st.heroStats}>
            <View style={st.heroStatItem}>
              <Text style={st.heroStatValue}>{currentSeasonStats.matchesPlayed}</Text>
              <Text style={st.heroStatLabel}>{t('leaderboard', 'eloMatchesThisSeason')}</Text>
            </View>
            <View style={st.heroStatDivider} />
            <View style={st.heroStatItem}>
              <Text style={[st.heroStatValue, { color: theme.success }]}>{currentSeasonStats.wins}</Text>
              <Text style={st.heroStatLabel}>{t('leaderboard', 'eloWinsThisSeason')}</Text>
            </View>
            <View style={st.heroStatDivider} />
            <View style={st.heroStatItem}>
              <Text style={[st.heroStatValue, { color: getEloRank(currentSeasonStats.peakElo).color }]}>{currentSeasonStats.peakElo}</Text>
              <Text style={st.heroStatLabel}>{t('leaderboard', 'eloPeakElo')}</Text>
            </View>
            <View style={st.heroStatDivider} />
            <View style={st.heroStatItem}>
              <Text style={[st.heroStatValue, { color: currentSeasonStats.progression >= 0 ? '#10B981' : '#EF4444' }]}>
                {formatEloDelta(currentSeasonStats.progression)}
              </Text>
              <Text style={st.heroStatLabel}>{t('leaderboard', 'eloAwardProgression')}</Text>
            </View>
          </View>
        </View>
        </Animated.View>

        {/* ===== ELO HISTORY CHART ===== */}
        {eloHistory.length >= 2 ? (() => {
          const reversed = [...eloHistory].reverse(); // oldest first
          const points = reversed.map(h => h.eloAfter);
          const minElo = Math.min(...points, ...LEAGUE_TIERS.filter(t => t.minElo <= Math.max(...points) + 100).map(t => t.minElo)) - 30;
          const maxElo = Math.max(...points) + 50;
          const eloRange = Math.max(maxElo - minElo, 50);
          const cw = chartWidth;
          const ch = 180;
          const padL = 36;
          const padR = 8;
          const padT = 12;
          const padB = 24;
          const graphW = cw - padL - padR;
          const graphH = ch - padT - padB;
          const xStep = points.length > 1 ? graphW / (points.length - 1) : graphW;
          const toY = (elo: number) => padT + graphH - ((elo - minElo) / eloRange) * graphH;
          const toX = (idx: number) => padL + idx * xStep;

          // Build SVG-like path using Views
          const tierLines = LEAGUE_TIERS.filter(t => t.minElo > minElo && t.minElo < maxElo);

          // Detect promotion/relegation points
          const milestones: { idx: number; type: 'promotion' | 'relegation'; tier: LeagueTier }[] = [];
          for (let i = 1; i < reversed.length; i++) {
            const prevTier = getLeagueTier(reversed[i - 1].eloAfter);
            const curTier = getLeagueTier(reversed[i].eloAfter);
            if (prevTier.id !== curTier.id) {
              milestones.push({ idx: i, type: curTier.minElo > prevTier.minElo ? 'promotion' : 'relegation', tier: curTier });
            }
          }

          return (
            <Animated.View entering={FadeInDown.duration(400).delay(50)}>
              <View style={st.chartCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <MaterialIcons name="show-chart" size={18} color={currentLeague.color} />
                  <Text style={st.sectionTitle}>{isFr ? 'Progression ELO' : 'ELO Progression'}</Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted, marginLeft: 'auto' }}>{reversed.length} {isFr ? 'matchs' : 'matches'}</Text>
                </View>

                <View style={{ width: cw, height: ch, position: 'relative' }}>
                  {/* League tier threshold lines */}
                  {tierLines.map(tier => {
                    const y = toY(tier.minElo);
                    if (y < padT || y > ch - padB) return null;
                    return (
                      <View key={tier.id} style={{ position: 'absolute', top: y, left: padL, right: padR }}>
                        <View style={{ height: 1, backgroundColor: tier.color + '25' }} />
                        <View style={{ position: 'absolute', right: 0, top: -10, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: tier.color + '15', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 6 }}>{tier.emblem}</Text>
                          <Text style={{ fontSize: 7, fontWeight: '700', color: tier.color }}>{tier.minElo}</Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* Y-axis labels */}
                  {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                    const elo = Math.round(minElo + eloRange * (1 - pct));
                    const y = padT + graphH * pct;
                    return (
                      <View key={pct} style={{ position: 'absolute', top: y - 6, left: 0, width: padL - 4, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 8, color: theme.textMuted, fontWeight: '500' }}>{elo}</Text>
                      </View>
                    );
                  })}

                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map(pct => (
                    <View key={`grid-${pct}`} style={{ position: 'absolute', top: padT + graphH * pct, left: padL, right: padR, height: 1, backgroundColor: theme.border + '30' }} />
                  ))}

                  {/* Line segments */}
                  {points.map((elo, i) => {
                    if (i === 0) return null;
                    const x1 = toX(i - 1);
                    const y1 = toY(points[i - 1]);
                    const x2 = toX(i);
                    const y2 = toY(elo);
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    const isWin = reversed[i].won;
                    return (
                      <View
                        key={`line-${i}`}
                        style={{
                          position: 'absolute',
                          top: y1,
                          left: x1,
                          width: len,
                          height: 2,
                          backgroundColor: isWin ? '#22C55E' : '#EF4444',
                          transform: [{ rotate: `${angle}deg` }],
                          transformOrigin: 'left center',
                          opacity: 0.7,
                        }}
                      />
                    );
                  })}

                  {/* Data points */}
                  {points.map((elo, i) => {
                    const x = toX(i);
                    const y = toY(elo);
                    const milestone = milestones.find(m => m.idx === i);
                    const isLast = i === points.length - 1;
                    const dotSize = milestone ? 10 : isLast ? 8 : 4;
                    const dotColor = milestone ? milestone.tier.color : (reversed[i].won ? '#22C55E' : '#EF4444');
                    return (
                      <View
                        key={`dot-${i}`}
                        style={{
                          position: 'absolute',
                          top: y - dotSize / 2,
                          left: x - dotSize / 2,
                          width: dotSize,
                          height: dotSize,
                          borderRadius: dotSize / 2,
                          backgroundColor: dotColor,
                          borderWidth: milestone || isLast ? 2 : 0,
                          borderColor: milestone ? '#FFF' : (isLast ? currentLeague.color : 'transparent'),
                          zIndex: milestone || isLast ? 10 : 1,
                        }}
                      >
                        {/* Milestone label */}
                        {milestone ? (
                          <View style={{ position: 'absolute', bottom: dotSize + 2, left: -20, width: 50, alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: milestone.tier.color + '20', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                              <MaterialIcons name={milestone.type === 'promotion' ? 'arrow-upward' : 'arrow-downward'} size={7} color={milestone.type === 'promotion' ? '#22C55E' : '#EF4444'} />
                              <Text style={{ fontSize: 6 }}>{milestone.tier.emblem}</Text>
                            </View>
                          </View>
                        ) : null}
                        {/* Last point label */}
                        {isLast ? (
                          <View style={{ position: 'absolute', bottom: dotSize + 2, left: -16, width: 40, alignItems: 'center' }}>
                            <View style={{ backgroundColor: currentLeague.color, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFF' }}>{elo}</Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {/* Legend */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 3, borderRadius: 1.5, backgroundColor: '#22C55E' }} />
                    <Text style={{ fontSize: 9, color: theme.textMuted }}>{isFr ? 'Victoire' : 'Win'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 3, borderRadius: 1.5, backgroundColor: '#EF4444' }} />
                    <Text style={{ fontSize: 9, color: theme.textMuted }}>{isFr ? 'Defaite' : 'Loss'}</Text>
                  </View>
                  {milestones.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: currentLeague.color, borderWidth: 1.5, borderColor: '#FFF' }} />
                      <Text style={{ fontSize: 9, color: theme.textMuted }}>{isFr ? 'Changement' : 'Tier change'}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Animated.View>
          );
        })() : null}

        {/* ===== ELO PREDICTIONS ===== */}
        {(() => {
          if (!leagueProgress.nextTier) {
            // Already Grand Master
            return (
              <Animated.View entering={FadeInDown.duration(400).delay(75)}>
                <View style={st.chartCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <MaterialIcons name="auto-graph" size={18} color="#FFD700" />
                    <Text style={st.sectionTitle}>{t('leaderboard', 'eloPredictionTitle')}</Text>
                  </View>
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <Text style={{ fontSize: 36 }}>👑</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFD700', marginTop: 8 }}>{t('leaderboard', 'eloPredictionAlreadyTop')}</Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>{t('leaderboard', 'eloPredictionAlreadyTopDesc')}</Text>
                  </View>
                </View>
              </Animated.View>
            );
          }

          // Compute predictions from recent matches
          const recentN = Math.min(eloHistory.length, 10);
          if (recentN < 2) return null;
          const recentMatches = eloHistory.slice(0, recentN); // newest first
          const recentWins = recentMatches.filter(h => h.won).length;
          const recentWinRate = Math.round((recentWins / recentN) * 100);
          const totalDelta = recentMatches.reduce((sum, h) => sum + h.eloDelta, 0);
          const avgDelta = totalDelta / recentN;
          const avgDeltaRound = Math.round(avgDelta * 10) / 10;
          const eloNeeded = leagueProgress.eloToNext;
          const nextTier = leagueProgress.nextTier;

          // Estimate matches at current pace
          const matchesAtPace = avgDelta > 0 ? Math.ceil(eloNeeded / avgDelta) : null;
          // Optimistic: only count winning delta avg
          const winningDeltas = recentMatches.filter(h => h.won).map(h => h.eloDelta);
          const avgWinDelta = winningDeltas.length > 0 ? winningDeltas.reduce((s, d) => s + d, 0) / winningDeltas.length : 0;
          const optimisticMatches = avgWinDelta > 0 && recentWinRate > 0
            ? Math.ceil(eloNeeded / (avgWinDelta * (recentWinRate / 100)))
            : null;

          return (
            <Animated.View entering={FadeInDown.duration(400).delay(75)}>
              <View style={st.chartCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <MaterialIcons name="auto-graph" size={18} color={nextTier.color} />
                  <Text style={st.sectionTitle}>{t('leaderboard', 'eloPredictionTitle')}</Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted, marginLeft: 'auto' }}>
                    {t('leaderboard', 'eloPredictionDesc').replace('{count}', String(recentN))}
                  </Text>
                </View>

                {/* Target tier */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: nextTier.color + '08', borderRadius: 14, padding: 12, marginTop: 10, marginBottom: 12, borderWidth: 1, borderColor: nextTier.color + '18' }}>
                  <LinearGradient colors={nextTier.gradient} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>{nextTier.emblem}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>
                      {t('leaderboard', 'eloPredictionNextTier')}: {isFr ? nextTier.name.fr : nextTier.name.en}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {eloNeeded} ELO {isFr ? 'necessaires' : 'needed'} ({nextTier.minElo}+)
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', backgroundColor: nextTier.color + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: nextTier.color }}>{eloNeeded}</Text>
                    <Text style={{ fontSize: 8, fontWeight: '600', color: nextTier.color + '80' }}>ELO</Text>
                  </View>
                </View>

                {/* Recent stats row */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: avgDeltaRound >= 0 ? '#22C55E' : '#EF4444' }}>
                      {avgDeltaRound >= 0 ? '+' : ''}{avgDeltaRound}
                    </Text>
                    <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{t('leaderboard', 'eloPredictionAvgDelta')}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: recentWinRate >= 50 ? '#22C55E' : '#F59E0B' }}>{recentWinRate}%</Text>
                    <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{t('leaderboard', 'eloPredictionRecentWinRate')}</Text>
                  </View>
                </View>

                {/* Projection rows */}
                <View style={{ gap: 8 }}>
                  {/* Current pace */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: avgDelta > 0 ? '#22C55E15' : '#EF444415', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={avgDelta > 0 ? 'trending-up' : 'trending-flat'} size={18} color={avgDelta > 0 ? '#22C55E' : '#EF4444'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }}>{t('leaderboard', 'eloPredictionCurrentPace')}</Text>
                      {matchesAtPace ? (
                        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary, marginTop: 2 }}>
                          ~{matchesAtPace} {isFr ? 'matchs' : 'matches'}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444', marginTop: 2 }}>
                          {isFr ? 'Delta negatif — jouez plus pour progresser' : 'Negative delta — play more to progress'}
                        </Text>
                      )}
                    </View>
                    {matchesAtPace ? (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: theme.textMuted }}>{nextTier.emblem}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Optimistic */}
                  {optimisticMatches && optimisticMatches !== matchesAtPace ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#22C55E08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#22C55E15' }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#22C55E15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="rocket-launch" size={18} color="#22C55E" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#22C55E' }}>{t('leaderboard', 'eloPredictionOptimistic')}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E', marginTop: 2 }}>
                          ~{optimisticMatches} {isFr ? 'matchs' : 'matches'}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Visual progress bar toward next tier */}
                <View style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10 }}>{currentLeague.emblem}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: currentLeague.color }}>{currentElo}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: nextTier.color }}>{nextTier.minElo}</Text>
                      <Text style={{ fontSize: 10 }}>{nextTier.emblem}</Text>
                    </View>
                  </View>
                  <View style={{ height: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 4, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={currentLeague.gradient}
                      style={{ height: '100%', width: `${Math.max(leagueProgress.progress, 3)}%`, borderRadius: 4 }}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    />
                  </View>
                </View>
              </View>
            </Animated.View>
          );
        })()}

        {/* ===== ELO MILESTONES TIMELINE ===== */}
        {milestones.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(400).delay(80)}>
            <View style={st.chartCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <MaterialIcons name="timeline" size={18} color="#F59E0B" />
                <Text style={st.sectionTitle}>{t('leaderboard', 'eloMilestonesTitle')}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginLeft: 'auto' }}>{milestones.length} {isFr ? 'jalons' : 'milestones'}</Text>
              </View>
              <View style={{ position: 'relative', paddingLeft: 24 }}>
                {/* Vertical timeline line */}
                <View style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, backgroundColor: theme.border + '40', borderRadius: 1 }} />
                {milestones.map((ms, idx) => {
                  const dateStr = new Date(ms.date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                  const isLast = idx === milestones.length - 1;
                  return (
                    <View key={ms.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: isLast ? 0 : 16, position: 'relative' }}>
                      {/* Timeline dot */}
                      <View style={{ position: 'absolute', left: -24, top: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: ms.color + '20', borderWidth: 2, borderColor: ms.color + '40', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                        {ms.emblem ? (
                          <Text style={{ fontSize: 8 }}>{ms.emblem}</Text>
                        ) : (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ms.color }} />
                        )}
                      </View>
                      {/* Content */}
                      <View style={{ flex: 1, backgroundColor: ms.color + '08', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: ms.color + '15' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name={ms.icon as any} size={14} color={ms.color} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary, flex: 1 }}>{ms.label}</Text>
                          <View style={{ backgroundColor: ms.color + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: ms.color }}>{ms.elo}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 3 }}>{dateStr}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Share League Rank CTA */}
        <Animated.View entering={FadeInDown.duration(400).delay(85)}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <Pressable
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: currentLeague.color + '12', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: currentLeague.color + '25' }}
            onPress={() => router.push({ pathname: '/share-card', params: { type: 'league' } } as any)}
          >
            <MaterialIcons name="share" size={14} color={currentLeague.color} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: currentLeague.color }}>{t('leaderboard', 'eloShareLeague')}</Text>
          </Pressable>
          <Pressable
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F59E0B12', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#F59E0B25' }}
            onPress={() => router.push({ pathname: '/share-card', params: { type: 'milestone' } } as any)}
          >
            <MaterialIcons name="emoji-events" size={14} color="#F59E0B" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{t('leaderboard', 'milestoneCardTitle')}</Text>
          </Pressable>
        </View>
        </Animated.View>

        {/* Placement Badge */}
        {isInPlacement(currentSeasonStats.matchesPlayed) ? (
          <View style={[st.heroCard, { borderColor: '#F59E0B20', marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[st.heroIconBox, { backgroundColor: '#F59E0B15' }]}>
                <MaterialIcons name="science" size={28} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>{t('leaderboard', 'eloPlacementTitle')}</Text>
                <Text style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>
                  {t('leaderboard', 'eloPlacementProgress').replace('{current}', String(currentSeasonStats.matchesPlayed))}
                </Text>
                <View style={{ height: 6, backgroundColor: '#FDE68A', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                  <View style={{ height: '100%', width: `${(currentSeasonStats.matchesPlayed / ELO_PLACEMENT_MATCHES) * 100}%`, backgroundColor: '#F59E0B', borderRadius: 3 }} />
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* League Tiers Visualization — 6 tiers with gradients */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <View style={st.tiersCard}>
          <Text style={st.sectionTitle}>{t('leaderboard', 'eloRank')}</Text>
          {[...LEAGUE_TIERS].reverse().map((league, idx) => {
            const isCurrentTier = currentLeague.id === league.id;
            const nextLeague = [...LEAGUE_TIERS].reverse()[idx + 1];
            const progressInTier = nextLeague ? Math.min(100, Math.max(0, ((currentElo - league.minElo) / (nextLeague.minElo - league.minElo)) * 100)) : (isCurrentTier ? 100 : 0);
            const rangeLabel = league.maxElo === Infinity ? `${league.minElo}+` : `${league.minElo}-${league.maxElo}`;
            const isAbove = currentElo >= league.minElo;
            return (
              <Pressable
                key={league.id}
                style={[st.tierRow, isCurrentTier && { borderWidth: 1.5, borderColor: league.color + '40' }]}
                onPress={() => { router.push({ pathname: '/leaderboard', params: { tier: league.id } } as any); }}
              >
                <LinearGradient
                  colors={isCurrentTier ? league.gradient : [league.color + '08', league.color + '03']}
                  style={st.tierGradientBox}
                >
                  <Text style={{ fontSize: 18 }}>{league.emblem}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[st.tierName, isCurrentTier && { color: '#FFF', fontWeight: '800' }, !isCurrentTier && isAbove && { color: league.color }]}>
                      {isFr ? league.name.fr : league.name.en}
                    </Text>
                    <Text style={[st.tierRange, isCurrentTier && { color: 'rgba(255,255,255,0.5)' }]}>{rangeLabel}</Text>
                    {isCurrentTier ? (
                      <View style={[st.currentBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Text style={st.currentBadgeText}>{isFr ? 'Actuel' : 'Current'}</Text>
                      </View>
                    ) : null}
                  </View>
                  {isCurrentTier ? (
                    <View style={st.tierProgress}>
                      <View style={[st.tierProgressFill, { width: `${Math.max(progressInTier, 5)}%`, backgroundColor: 'rgba(255,255,255,0.7)' }]} />
                    </View>
                  ) : null}
                </View>
                {isCurrentTier ? (
                  <LinearGradient colors={league.gradient} style={st.tierEloBadge}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFF' }}>{currentElo}</Text>
                  </LinearGradient>
                ) : (
                  <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} />
                )}
              </Pressable>
            );
          })}
        </View>
        </Animated.View>

        {/* Season Awards */}
        {/* Ad Banner - between chart and season awards */}
        <AdBanner position="inline" />
        <View>
          <Text style={st.sectionTitleOuter}>{t('leaderboard', 'eloAwardsTitle')}</Text>
          {seasonAwards.length === 0 ? (
            <View style={st.emptyCard}>
              <MaterialIcons name="emoji-events" size={40} color={theme.textMuted} />
              <Text style={st.emptyTitle}>{t('leaderboard', 'eloAwardNoData')}</Text>
              <Text style={st.emptyDesc}>{t('leaderboard', 'eloAwardNoDataDesc')}</Text>
            </View>
          ) : (
            seasonAwards.map((award, idx) => (
              <View key={award.id}>
                <View style={[st.awardCard, { borderLeftWidth: 4, borderLeftColor: award.color }]}>
                  <View style={[st.awardIconBox, { backgroundColor: award.color + '15' }]}>
                    <MaterialIcons name={award.icon as any} size={24} color={award.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.awardLabel}>{award.label}</Text>
                    <Text style={[st.awardValue, { color: award.color }]}>{award.value}</Text>
                    {award.subValue ? <Text style={st.awardSub}>{award.subValue}</Text> : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ===== SEASON COMPARISON ===== */}
        {seasons.length >= 2 ? (
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <Pressable
              style={cmpSt.trigger}
              onPress={() => setShowCompare(true)}
            >
              <LinearGradient colors={['#3B82F610', '#F59E0B10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={cmpSt.triggerGradient}>
                <View style={cmpSt.triggerLeft}>
                  <View style={cmpSt.triggerIconBg}>
                    <MaterialIcons name="compare-arrows" size={20} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cmpSt.triggerTitle}>{isFr ? 'Comparer les saisons' : 'Compare seasons'}</Text>
                    <Text style={cmpSt.triggerDesc}>{isFr ? 'Radar chart, ELO, roles, progression' : 'Radar chart, ELO, roles, progression'}</Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Season Comparison Modal */}
        <Modal visible={showCompare} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompare(false)}>
          <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.backgroundSecondary }}>
            <View style={cmpSt.modalHeader}>
              <Text style={cmpSt.modalTitle}>{isFr ? 'Comparaison de saisons' : 'Season comparison'}</Text>
              <Pressable style={cmpSt.modalClose} onPress={() => setShowCompare(false)}>
                <MaterialIcons name="close" size={22} color={theme.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Season selectors */}
              <View style={cmpSt.selRow}>
                <View style={{ flex: 1 }}>
                  <Text style={cmpSt.selLabel}>{isFr ? 'Saison A' : 'Season A'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {seasons.map(s => {
                      const active = compareA === s.id;
                      const tierA = getLeagueTier(s.finalElo);
                      return (
                        <Pressable key={s.id} style={[cmpSt.selChip, active && { backgroundColor: '#3B82F615', borderColor: '#3B82F660' }]} onPress={() => { if (s.id !== compareB) setCompareA(s.id); }}>
                          <Text style={{ fontSize: 10 }}>{tierA.emblem}</Text>
                          <Text style={[cmpSt.selChipText, active && { color: '#3B82F6', fontWeight: '800' }]}>{s.seasonYear}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                <View style={cmpSt.selSwap}>
                  <Pressable style={cmpSt.swapBtn} onPress={() => { const tmp = compareA; setCompareA(compareB); setCompareB(tmp); }}>
                    <MaterialIcons name="swap-horiz" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[cmpSt.selLabel, { textAlign: 'right' }]}>{isFr ? 'Saison B' : 'Season B'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, justifyContent: 'flex-end' }}>
                    {seasons.map(s => {
                      const active = compareB === s.id;
                      const tierB = getLeagueTier(s.finalElo);
                      return (
                        <Pressable key={s.id} style={[cmpSt.selChip, active && { backgroundColor: '#F59E0B15', borderColor: '#F59E0B60' }]} onPress={() => { if (s.id !== compareA) setCompareB(s.id); }}>
                          <Text style={{ fontSize: 10 }}>{tierB.emblem}</Text>
                          <Text style={[cmpSt.selChipText, active && { color: '#F59E0B', fontWeight: '800' }]}>{s.seasonYear}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Radar chart */}
              {comparisonData ? (
                <View style={cmpSt.radarCard}>
                  <DualRadarChart
                    data={comparisonData.radarData}
                    size={Math.min(chartWidth, 280)}
                    colorA="#3B82F6"
                    colorB="#F59E0B"
                    labelA={String(comparisonData.seasonA.seasonYear)}
                    labelB={String(comparisonData.seasonB.seasonYear)}
                  />
                </View>
              ) : (
                <View style={cmpSt.radarCard}>
                  <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>{isFr ? 'Selectionnez 2 saisons differentes' : 'Select 2 different seasons'}</Text>
                </View>
              )}

              {/* Detailed comparison table */}
              {comparisonData ? (
                <View style={cmpSt.tableCard}>
                  <View style={cmpSt.tableHeaderRow}>
                    <View style={{ flex: 2 }} />
                    <View style={cmpSt.tableColHeader}>
                      <LinearGradient colors={getLeagueTier(comparisonData.seasonA.finalElo).gradient} style={cmpSt.tableSeasonBadge}>
                        <Text style={cmpSt.tableSeasonYear}>{comparisonData.seasonA.seasonYear}</Text>
                      </LinearGradient>
                    </View>
                    <View style={cmpSt.tableColHeader}>
                      <LinearGradient colors={getLeagueTier(comparisonData.seasonB.finalElo).gradient} style={cmpSt.tableSeasonBadge}>
                        <Text style={cmpSt.tableSeasonYear}>{comparisonData.seasonB.seasonYear}</Text>
                      </LinearGradient>
                    </View>
                    <View style={[cmpSt.tableColHeader, { flex: 1.2 }]}>
                      <Text style={cmpSt.tableDeltaHeader}>+/-</Text>
                    </View>
                  </View>

                  {comparisonData.radarData.map((rd, idx) => {
                    const delta = parseFloat(rd.rawB) - parseFloat(rd.rawA);
                    const isPercent = rd.rawA.includes('%');
                    const deltaStr = isPercent
                      ? `${delta >= 0 ? '+' : ''}${delta}%`
                      : `${delta >= 0 ? '+' : ''}${delta}`;
                    const deltaColor = delta > 0 ? '#22C55E' : delta < 0 ? '#EF4444' : theme.textMuted;
                    return (
                      <View key={idx} style={[cmpSt.tableRow, idx % 2 === 0 && { backgroundColor: theme.backgroundSecondary + '60' }]}>
                        <View style={{ flex: 2 }}>
                          <Text style={cmpSt.tableRowLabel}>{rd.label}</Text>
                        </View>
                        <View style={cmpSt.tableCell}>
                          <Text style={[cmpSt.tableCellValue, { color: '#3B82F6' }]}>{rd.rawA}</Text>
                        </View>
                        <View style={cmpSt.tableCell}>
                          <Text style={[cmpSt.tableCellValue, { color: '#F59E0B' }]}>{rd.rawB}</Text>
                        </View>
                        <View style={[cmpSt.tableCell, { flex: 1.2 }]}>
                          <View style={[cmpSt.deltaBadge, { backgroundColor: deltaColor + '12' }]}>
                            <MaterialIcons name={delta > 0 ? 'arrow-upward' : delta < 0 ? 'arrow-downward' : 'remove'} size={10} color={deltaColor} />
                            <Text style={[cmpSt.deltaText, { color: deltaColor }]}>{deltaStr}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* League tier comparison row */}
                  <View style={cmpSt.tierCompareRow}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      {(() => { const tA = getLeagueTier(comparisonData.seasonA.finalElo); return (
                        <View style={{ alignItems: 'center', gap: 4 }}>
                          <Text style={{ fontSize: 24 }}>{tA.emblem}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: tA.color }}>{isFr ? tA.name.fr : tA.name.en}</Text>
                        </View>
                      ); })()}
                    </View>
                    <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
                      <MaterialIcons name="arrow-forward" size={18} color={theme.textMuted} />
                    </View>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      {(() => { const tB = getLeagueTier(comparisonData.seasonB.finalElo); return (
                        <View style={{ alignItems: 'center', gap: 4 }}>
                          <Text style={{ fontSize: 24 }}>{tB.emblem}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: tB.color }}>{isFr ? tB.name.fr : tB.name.en}</Text>
                        </View>
                      ); })()}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Progression indicators summary */}
              {comparisonData ? (
                <View style={cmpSt.progressionCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <MaterialIcons name="trending-up" size={16} color="#22C55E" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>{isFr ? 'Indicateurs de progression' : 'Progression indicators'}</Text>
                  </View>
                  <View style={cmpSt.progressionGrid}>
                    {comparisonData.deltas.map((d, i) => {
                      const isPos = d.delta > 0;
                      const isNeg = d.delta < 0;
                      const color = isPos ? '#22C55E' : isNeg ? '#EF4444' : theme.textMuted;
                      const pct = d.valA > 0 ? Math.round(Math.abs(d.delta) / d.valA * 100) : 0;
                      return (
                        <View key={i} style={cmpSt.progressionItem}>
                          <Text style={cmpSt.progressionLabel}>{d.label}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialIcons name={isPos ? 'arrow-upward' : isNeg ? 'arrow-downward' : 'remove'} size={14} color={color} />
                            <Text style={[cmpSt.progressionValue, { color }]}>{isPos ? '+' : ''}{d.delta}{d.suffix}</Text>
                          </View>
                          {pct > 0 ? (
                            <Text style={[cmpSt.progressionPct, { color: color + '90' }]}>{isPos ? '+' : '-'}{pct}%</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Season History */}
        {seasons.length > 0 ? (
          <View>
            <Text style={st.sectionTitleOuter}>{t('leaderboard', 'eloSeasons')}</Text>
            {seasons.map((season, idx) => {
              const seasonLeague = getLeagueTier(season.finalElo);
              const peakLeague = getLeagueTier(season.peakElo);
              const winRate = season.matchesPlayed > 0 ? Math.round((season.wins / season.matchesPlayed) * 100) : 0;
              return (
                <View key={season.id}>
                  <View style={st.seasonCard}>
                    {/* League gradient header */}
                    <LinearGradient colors={[seasonLeague.gradient[0] + '18', seasonLeague.gradient[1] + '08']} style={st.seasonGradientHeader}>
                      <View style={st.seasonHeader}>
                        <View style={[st.seasonEmblemWrap, { backgroundColor: seasonLeague.color + '20', borderColor: seasonLeague.color + '30' }]}>
                          <Text style={{ fontSize: 18 }}>{seasonLeague.emblem}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.seasonYear, { color: seasonLeague.color }]}>{season.seasonYear}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: seasonLeague.color + '90' }}>{isFr ? seasonLeague.name.fr : seasonLeague.name.en}</Text>
                        </View>
                        <LinearGradient colors={seasonLeague.gradient} style={st.seasonEloBadge}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFF' }}>{season.finalElo}</Text>
                          <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>ELO</Text>
                        </LinearGradient>
                      </View>
                    </LinearGradient>
                    <View style={st.seasonStats}>
                      <View style={st.seasonStat}>
                        <Text style={[st.seasonStatValue, { color: peakLeague.color }]}>{season.peakElo}</Text>
                        <Text style={st.seasonStatLabel}>{t('leaderboard', 'eloPeakElo')}</Text>
                        <Text style={{ fontSize: 7, marginTop: 1 }}>{peakLeague.emblem}</Text>
                      </View>
                      <View style={st.seasonStat}>
                        <Text style={st.seasonStatValue}>{season.matchesPlayed}</Text>
                        <Text style={st.seasonStatLabel}>{t('palmares', 'matchs')}</Text>
                      </View>
                      <View style={st.seasonStat}>
                        <Text style={[st.seasonStatValue, { color: theme.success }]}>{winRate}%</Text>
                        <Text style={st.seasonStatLabel}>{t('palmares', 'victoires')}</Text>
                      </View>
                      <View style={st.seasonStat}>
                        <Text style={[st.seasonStatValue, { color: season.wins > 0 ? '#22C55E' : theme.textMuted }]}>{season.wins}</Text>
                        <Text style={st.seasonStatLabel}>{isFr ? 'V' : 'W'}</Text>
                      </View>
                    </View>
                    {/* Role ELOs */}
                    {(season.eloTireur && season.eloTireur !== 1000) || (season.eloPointeur && season.eloPointeur !== 1000) || (season.eloMilieu && season.eloMilieu !== 1000) ? (
                      <View style={st.seasonRoles}>
                        {season.eloTireur && season.eloTireur !== 1000 ? (
                          <View style={[st.roleBadge, { backgroundColor: '#F9731612' }]}>
                            <MaterialIcons name="gps-fixed" size={10} color="#F97316" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#F97316' }}>{season.eloTireur}</Text>
                          </View>
                        ) : null}
                        {season.eloPointeur && season.eloPointeur !== 1000 ? (
                          <View style={[st.roleBadge, { backgroundColor: '#3B82F612' }]}>
                            <MaterialIcons name="adjust" size={10} color="#3B82F6" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{season.eloPointeur}</Text>
                          </View>
                        ) : null}
                        {season.eloMilieu && season.eloMilieu !== 1000 ? (
                          <View style={[st.roleBadge, { backgroundColor: '#8B5CF612' }]}>
                            <MaterialIcons name="swap-horiz" size={10} color="#8B5CF6" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>{season.eloMilieu}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  heroCard: { backgroundColor: theme.surface, borderRadius: 20, overflow: 'hidden' as const, marginBottom: 16, ...theme.shadows.card },
  heroGradient: { padding: 20, paddingBottom: 16 },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  heroEmblemWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  heroLeagueName: { fontSize: 18, fontWeight: '800' as const, color: '#FFF', letterSpacing: -0.3 },
  heroEloValue: { fontSize: 13, fontWeight: '600' as const, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  heroSeasonBadge: { alignItems: 'center' as const, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  heroSeasonYear: { fontSize: 16, fontWeight: '900' as const, color: '#FFF' },
  heroSeasonLabel: { fontSize: 9, fontWeight: '600' as const, color: 'rgba(255,255,255,0.5)' },
  heroProgressRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 12 },
  heroProgressTrack: { flex: 1, height: 5, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' as const },
  heroProgressFill: { height: '100%' as const, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 3 },
  heroProgressText: { fontSize: 10, fontWeight: '700' as const, color: 'rgba(255,255,255,0.6)' },
  heroStats: { flexDirection: 'row' as const, backgroundColor: theme.surface, paddingVertical: 14, paddingHorizontal: 8 },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '800', color: theme.textPrimary },
  heroStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  heroStatDivider: { width: 1, height: 28, backgroundColor: theme.border },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sectionTitleOuter: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginTop: 8, marginBottom: 12 },
  chartCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 16, ...theme.shadows.card, overflow: 'hidden' as const },
  tiersCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 16, ...theme.shadows.card },
  tierRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
  tierGradientBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  tierName: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary },
  tierRange: { fontSize: 11, color: theme.textMuted },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  currentBadgeText: { fontSize: 9, fontWeight: '800' as const, color: '#FFF' },
  tierProgress: { height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' as const, marginTop: 6 },
  tierProgressFill: { height: '100%' as const, borderRadius: 3 },
  tierEloBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  awardCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 10, ...theme.shadows.card },
  awardIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  awardLabel: { fontSize: 12, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  awardValue: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  awardSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  emptyCard: { alignItems: 'center', paddingVertical: 40, backgroundColor: theme.surface, borderRadius: 16, ...theme.shadows.card },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginTop: 12 },
  emptyDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
  seasonCard: { backgroundColor: theme.surface, borderRadius: 18, marginBottom: 12, overflow: 'hidden' as const, ...theme.shadows.card },
  seasonGradientHeader: { paddingHorizontal: 14, paddingVertical: 12, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  seasonHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  seasonEmblemWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5 },
  seasonYear: { fontSize: 18, fontWeight: '900' as const },
  seasonEloBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: 'center' as const },
  seasonStats: { flexDirection: 'row' as const, gap: 8, padding: 14, paddingTop: 12 },
  seasonStat: { flex: 1, alignItems: 'center' as const },
  seasonStatValue: { fontSize: 17, fontWeight: '800', color: theme.textPrimary },
  seasonStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, fontWeight: '600' },
  seasonRoles: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});

// Comparison styles
const cmpSt = StyleSheet.create({
  trigger: { marginBottom: 16, borderRadius: 16, overflow: 'hidden' as const, ...theme.shadows.card },
  triggerGradient: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 16, borderRadius: 16, backgroundColor: theme.surface },
  triggerLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, flex: 1 },
  triggerIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#3B82F612', alignItems: 'center' as const, justifyContent: 'center' as const },
  triggerTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  triggerDesc: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 18, fontWeight: '800' as const, color: theme.textPrimary },
  modalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  selRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8, marginBottom: 16 },
  selLabel: { fontSize: 11, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
  selChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  selChipText: { fontSize: 13, fontWeight: '600' as const, color: theme.textSecondary },
  selSwap: { paddingTop: 24, alignItems: 'center' as const },
  swapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surface, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: theme.border },
  radarCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 16, alignItems: 'center' as const, ...theme.shadows.card },
  tableCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 14, marginBottom: 16, ...theme.shadows.card },
  tableHeaderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  tableColHeader: { flex: 1, alignItems: 'center' as const },
  tableSeasonBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  tableSeasonYear: { fontSize: 13, fontWeight: '900' as const, color: '#FFF' },
  tableDeltaHeader: { fontSize: 11, fontWeight: '700' as const, color: theme.textMuted },
  tableRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
  tableRowLabel: { fontSize: 12, fontWeight: '600' as const, color: theme.textPrimary },
  tableCell: { flex: 1, alignItems: 'center' as const },
  tableCellValue: { fontSize: 14, fontWeight: '800' as const },
  deltaBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  deltaText: { fontSize: 11, fontWeight: '800' as const },
  tierCompareRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingTop: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '30' },
  progressionCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, ...theme.shadows.card },
  progressionGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  progressionItem: { width: '47%' as any, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, alignItems: 'center' as const, gap: 4 },
  progressionLabel: { fontSize: 10, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  progressionValue: { fontSize: 20, fontWeight: '900' as const },
  progressionPct: { fontSize: 10, fontWeight: '600' as const },
});
