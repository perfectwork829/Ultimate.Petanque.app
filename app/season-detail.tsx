
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle, Line, G, Polyline, Text as SvgText, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { useAuth, getSupabaseClient } from '@/template';
import { getEloRank, EloHistoryEntry } from '@/services/eloService';
import { Match } from '@/types/petanque';
import * as Haptics from '@/services/haptics';
import ShareModal from '@/components/ui/ShareModal';
import { ShareCardSeason, ShareCardSeasonComparison } from '@/components/feature/share-cards';
import * as Haptics2 from '@/services/haptics';

interface MonthlyDetail {
  month: string;
  monthKey: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  eloStart: number;
  eloEnd: number;
  eloMin: number;
  eloMax: number;
  eloDelta: number;
  carreaux: number;
}

export default function SeasonDetailScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const fr = language === 'fr';
  const locale = fr ? 'fr-FR' : 'en-US';
  const { matches, challenges } = useAppData();
  const { user } = useAuth();

  const [eloHistory, setEloHistory] = useState<EloHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCardType, setShareCardType] = useState<'season' | 'comparison'>('season');

  // Load ELO history
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    const load = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('elo_history')
          .select('match_id, elo_before, elo_after, elo_delta, won, recorded_at, opponent_name, opponent_elo')
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: true })
          .limit(500);
        if (data) {
          setEloHistory(data.map((r: any) => ({
            id: r.match_id || '',
            playerId: '',
            userId: user!.id,
            eloBefore: r.elo_before || 1000,
            eloAfter: r.elo_after || 1000,
            eloDelta: r.elo_delta || 0,
            matchId: r.match_id,
            opponentElo: r.opponent_elo || 1000,
            opponentName: r.opponent_name || '',
            won: r.won,
            recordedAt: r.recorded_at,
          })));
        }
      } catch { /* silent */ }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Current season stats
  const currentSeason = useMemo(() => {
    const seasonMatches = matches.filter(m => new Date(m.date).getFullYear() === currentYear);
    const wins = seasonMatches.filter(m => m.winner === 'A').length;
    const losses = seasonMatches.length - wins;
    const winRate = seasonMatches.length > 0 ? Math.round((wins / seasonMatches.length) * 100) : 0;
    const seasonChallenges = challenges.filter(c => new Date(c.date).getFullYear() === currentYear);
    const totalCarreaux = seasonChallenges.reduce((s, c) => s + (c.carreauCount || 0), 0);
    return { matches: seasonMatches.length, wins, losses, winRate, challenges: seasonChallenges.length, carreaux: totalCarreaux, year: currentYear };
  }, [matches, challenges, currentYear]);

  // Previous season stats
  const prevSeason = useMemo(() => {
    const seasonMatches = matches.filter(m => new Date(m.date).getFullYear() === prevYear);
    const wins = seasonMatches.filter(m => m.winner === 'A').length;
    const losses = seasonMatches.length - wins;
    const winRate = seasonMatches.length > 0 ? Math.round((wins / seasonMatches.length) * 100) : 0;
    const seasonChallenges = challenges.filter(c => new Date(c.date).getFullYear() === prevYear);
    const totalCarreaux = seasonChallenges.reduce((s, c) => s + (c.carreauCount || 0), 0);
    return { matches: seasonMatches.length, wins, losses, winRate, challenges: seasonChallenges.length, carreaux: totalCarreaux, year: prevYear };
  }, [matches, challenges, prevYear]);

  // Monthly ELO details for current season
  const monthlyDetails = useMemo((): MonthlyDetail[] => {
    const now = new Date();
    const months: MonthlyDetail[] = [];
    const currentEloEntries = eloHistory.filter(e => new Date(e.recordedAt).getFullYear() === currentYear);

    for (let m = 0; m <= now.getMonth(); m++) {
      const d = new Date(currentYear, m, 1);
      const nextD = new Date(currentYear, m + 1, 1);
      const monthLabel = d.toLocaleDateString(locale, { month: 'long' });
      const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`;

      const monthEntries = currentEloEntries.filter(e => {
        const rd = new Date(e.recordedAt);
        return rd >= d && rd < nextD;
      });

      const seasonMatches = matches.filter(mt => {
        const md = new Date(mt.date);
        return md >= d && md < nextD;
      });
      const wins = seasonMatches.filter(mt => mt.winner === 'A').length;
      const losses = seasonMatches.length - wins;

      let eloStart = 1000;
      let eloEnd = 1000;
      let eloMin = 1000;
      let eloMax = 1000;
      let eloDelta = 0;

      if (monthEntries.length > 0) {
        eloStart = monthEntries[0].eloBefore;
        eloEnd = monthEntries[monthEntries.length - 1].eloAfter;
        eloMin = Math.min(...monthEntries.map(e => Math.min(e.eloBefore, e.eloAfter)));
        eloMax = Math.max(...monthEntries.map(e => Math.max(e.eloBefore, e.eloAfter)));
        eloDelta = eloEnd - eloStart;
      } else if (months.length > 0) {
        const prev = months[months.length - 1];
        eloStart = prev.eloEnd;
        eloEnd = prev.eloEnd;
        eloMin = prev.eloEnd;
        eloMax = prev.eloEnd;
      }

      const carreaux = challenges.filter(c => {
        const cd = new Date(c.date);
        return cd >= d && cd < nextD;
      }).reduce((s, c) => s + (c.carreauCount || 0), 0);

      months.push({
        month: monthLabel,
        monthKey,
        matches: seasonMatches.length,
        wins,
        losses,
        winRate: seasonMatches.length > 0 ? Math.round((wins / seasonMatches.length) * 100) : 0,
        eloStart,
        eloEnd,
        eloMin,
        eloMax,
        eloDelta,
        carreaux,
      });
    }
    return months;
  }, [eloHistory, matches, challenges, currentYear, locale]);

  // Best month
  const bestMonth = useMemo(() => {
    if (monthlyDetails.length === 0) return null;
    const withMatches = monthlyDetails.filter(m => m.matches > 0);
    if (withMatches.length === 0) return null;
    return withMatches.reduce((best, m) => m.eloDelta > best.eloDelta ? m : best, withMatches[0]);
  }, [monthlyDetails]);

  // Current streak
  const streak = useMemo(() => {
    const sorted = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sorted.length === 0) return { type: 'none' as const, count: 0 };
    const firstResult = sorted[0].winner === 'A' ? 'win' : 'loss';
    let count = 0;
    for (const m of sorted) {
      const result = m.winner === 'A' ? 'win' : 'loss';
      if (result === firstResult) count++;
      else break;
    }
    return { type: firstResult as 'win' | 'loss', count };
  }, [matches]);

  // Current ELO
  const currentElo = useMemo(() => {
    if (eloHistory.length === 0) return 1000;
    return eloHistory[eloHistory.length - 1].eloAfter;
  }, [eloHistory]);
  const eloR = getEloRank(currentElo);

  // Prev season ELO range
  const prevSeasonElo = useMemo(() => {
    const prevEntries = eloHistory.filter(e => new Date(e.recordedAt).getFullYear() === prevYear);
    if (prevEntries.length === 0) return { start: 1000, end: 1000, peak: 1000 };
    return {
      start: prevEntries[0].eloBefore,
      end: prevEntries[prevEntries.length - 1].eloAfter,
      peak: Math.max(...prevEntries.map(e => e.eloAfter)),
    };
  }, [eloHistory, prevYear]);

  // Season peak
  const seasonPeak = useMemo(() => {
    const entries = eloHistory.filter(e => new Date(e.recordedAt).getFullYear() === currentYear);
    if (entries.length === 0) return currentElo;
    return Math.max(...entries.map(e => e.eloAfter));
  }, [eloHistory, currentYear, currentElo]);

  // Chart data
  const chartW = Math.min(screenWidth - 48, 360);
  const chartH = 160;

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{fr ? 'Saison en detail' : 'Season Detail'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
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
        <Text style={st.headerTitle}>{fr ? `Saison ${currentYear}` : `Season ${currentYear}`}</Text>
        <Pressable style={st.shareBtn} onPress={() => { Haptics.selectionAsync(); setShareCardType('season'); setShowShareModal(true); }}>
          <MaterialIcons name="share" size={20} color={theme.success} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero ELO Card */}
        <LinearGradient colors={['#0F172A', '#1E293B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.heroCard}>
          <View style={st.heroRow}>
            <View>
              <Text style={st.heroLabel}>{fr ? 'ELO actuel' : 'Current ELO'}</Text>
              <Text style={[st.heroElo, { color: eloR.color }]}>{currentElo}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <MaterialIcons name={eloR.icon as any} size={14} color={eloR.color} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: eloR.color }}>{eloR.label[fr ? 'fr' : 'en']}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={st.heroPeakBadge}>
                <MaterialIcons name="arrow-upward" size={12} color="#F59E0B" />
                <Text style={st.heroPeakText}>{fr ? 'Pic' : 'Peak'}: {seasonPeak}</Text>
              </View>
              {streak.count > 0 ? (
                <View style={[st.heroStreakBadge, { backgroundColor: streak.type === 'win' ? '#22C55E20' : '#EF444420' }]}>
                  <MaterialIcons name={streak.type === 'win' ? 'local-fire-department' : 'trending-down'} size={14} color={streak.type === 'win' ? '#22C55E' : '#EF4444'} />
                  <Text style={[st.heroStreakText, { color: streak.type === 'win' ? '#22C55E' : '#EF4444' }]}>
                    {streak.count} {streak.type === 'win' ? (fr ? 'victoires' : 'wins') : (fr ? 'defaites' : 'losses')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Season stats summary */}
          <View style={st.heroStatsRow}>
            {[
              { value: currentSeason.matches, label: fr ? 'Matchs' : 'Matches', color: '#60A5FA' },
              { value: currentSeason.wins, label: fr ? 'Victoires' : 'Wins', color: '#22C55E' },
              { value: `${currentSeason.winRate}%`, label: fr ? 'Taux V.' : 'Win %', color: '#F59E0B' },
              { value: currentSeason.carreaux, label: 'Carreaux', color: '#A78BFA' },
            ].map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <View style={st.heroStatDivider} /> : null}
                <View style={st.heroStatItem}>
                  <Text style={[st.heroStatValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={st.heroStatLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </LinearGradient>

        {/* Monthly ELO Progression Chart */}
        {monthlyDetails.length >= 2 ? (() => {
          const padL = 36;
          const padR = 16;
          const padT = 20;
          const padB = 28;
          const innerW = chartW - padL - padR;
          const innerH = chartH - padT - padB;
          const vals = monthlyDetails.map(m => m.eloEnd);
          const minE = Math.min(...vals, ...monthlyDetails.map(m => m.eloMin)) - 10;
          const maxE = Math.max(...vals, ...monthlyDetails.map(m => m.eloMax)) + 10;
          const rangeE = Math.max(maxE - minE, 1);
          const stepX = innerW / (monthlyDetails.length - 1);
          const getY = (v: number) => padT + innerH - ((v - minE) / rangeE) * innerH;
          const getX = (i: number) => padL + i * stepX;
          const polyline = monthlyDetails.map((m, i) => `${getX(i)},${getY(m.eloEnd)}`).join(' ');
          // Min/Max area
          const areaTop = monthlyDetails.map((m, i) => `${getX(i)},${getY(m.eloMax)}`).join(' ');
          const areaBot = monthlyDetails.map((m, i) => `${getX(i)},${getY(m.eloMin)}`).reverse().join(' ');

          return (
            <View style={st.card}>
              <View style={st.cardHeaderRow}>
                <MaterialIcons name="show-chart" size={16} color={theme.primary} />
                <Text style={st.cardTitle}>{fr ? 'Progression ELO mensuelle' : 'Monthly ELO Progression'}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Svg width={chartW} height={chartH}>
                  {/* Grid */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                    const yy = padT + innerH * (1 - pct);
                    const label = Math.round(minE + rangeE * pct);
                    return (
                      <G key={i}>
                        <Line x1={padL} y1={yy} x2={chartW - padR} y2={yy} stroke={theme.border} strokeWidth={0.5} strokeDasharray={i > 0 && i < 4 ? '3,3' : undefined} />
                        <SvgText x={padL - 4} y={yy + 3} fontSize="8" fill={theme.textMuted} textAnchor="end" fontWeight="600">{label}</SvgText>
                      </G>
                    );
                  })}
                  {/* Min/Max range fill */}
                  {monthlyDetails.map((m, i) => {
                    if (m.matches === 0) return null;
                    const x = getX(i);
                    const yMin = getY(m.eloMin);
                    const yMax = getY(m.eloMax);
                    return (
                      <Rect key={`range${i}`} x={x - 3} y={yMax} width={6} height={Math.max(yMin - yMax, 1)} rx={3} fill={theme.primary + '15'} />
                    );
                  })}
                  {/* Line */}
                  <Polyline points={polyline} fill="none" stroke={theme.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {/* Dots */}
                  {monthlyDetails.map((m, i) => (
                    <G key={i}>
                      <Circle cx={getX(i)} cy={getY(m.eloEnd)} r={4} fill={m.eloDelta >= 0 ? '#22C55E' : m.eloDelta < 0 ? '#EF4444' : theme.primary} stroke="#FFF" strokeWidth={2} />
                      <SvgText x={getX(i)} y={chartH - 4} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="600">
                        {m.month.slice(0, 3)}
                      </SvgText>
                    </G>
                  ))}
                  {/* End label */}
                  {monthlyDetails.length > 0 ? (
                    <SvgText
                      x={getX(monthlyDetails.length - 1) + 2}
                      y={getY(monthlyDetails[monthlyDetails.length - 1].eloEnd) - 8}
                      fontSize="11" fill={theme.primary} fontWeight="800"
                    >
                      {monthlyDetails[monthlyDetails.length - 1].eloEnd}
                    </SvgText>
                  ) : null}
                </Svg>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 3, borderRadius: 1.5, backgroundColor: theme.primary }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textSecondary }}>ELO</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: theme.primary + '15' }} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textSecondary }}>{fr ? 'Min-Max' : 'Range'}</Text>
                </View>
              </View>
            </View>
          );
        })() : null}

        {/* Best Month */}
        {bestMonth && bestMonth.matches > 0 ? (
          <View style={[st.card, { borderWidth: 1.5, borderColor: '#F59E0B30' }]}>
            <View style={st.cardHeaderRow}>
              <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
              <Text style={st.cardTitle}>{fr ? 'Meilleur mois' : 'Best Month'}</Text>
            </View>
            <View style={st.bestMonthContent}>
              <View style={st.bestMonthLeft}>
                <Text style={st.bestMonthName}>{bestMonth.month}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22C55E15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <MaterialIcons name="arrow-upward" size={12} color="#22C55E" />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#22C55E' }}>+{bestMonth.eloDelta}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>ELO</Text>
                </View>
              </View>
              <View style={st.bestMonthStats}>
                <View style={st.bestMonthStat}>
                  <Text style={st.bestMonthStatVal}>{bestMonth.matches}</Text>
                  <Text style={st.bestMonthStatLabel}>{fr ? 'Matchs' : 'Games'}</Text>
                </View>
                <View style={st.bestMonthStat}>
                  <Text style={[st.bestMonthStatVal, { color: '#22C55E' }]}>{bestMonth.wins}</Text>
                  <Text style={st.bestMonthStatLabel}>{fr ? 'Vict.' : 'Wins'}</Text>
                </View>
                <View style={st.bestMonthStat}>
                  <Text style={[st.bestMonthStatVal, { color: '#F59E0B' }]}>{bestMonth.winRate}%</Text>
                  <Text style={st.bestMonthStatLabel}>{fr ? 'Taux' : 'Rate'}</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Current Streak */}
        {streak.count >= 2 ? (
          <View style={[st.card, { borderWidth: 1.5, borderColor: (streak.type === 'win' ? '#22C55E' : '#EF4444') + '30' }]}>
            <View style={st.cardHeaderRow}>
              <MaterialIcons name="local-fire-department" size={16} color={streak.type === 'win' ? '#22C55E' : '#EF4444'} />
              <Text style={st.cardTitle}>{fr ? 'Serie en cours' : 'Current Streak'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={[st.streakCircle, { borderColor: streak.type === 'win' ? '#22C55E' : '#EF4444' }]}>
                <Text style={[st.streakCircleNum, { color: streak.type === 'win' ? '#22C55E' : '#EF4444' }]}>{streak.count}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>
                  {streak.count} {streak.type === 'win' ? (fr ? 'victoires consecutives' : 'consecutive wins') : (fr ? 'defaites consecutives' : 'consecutive losses')}
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                  {streak.type === 'win'
                    ? (fr ? 'Continuez sur cette lancee !' : 'Keep up the momentum!')
                    : (fr ? 'Un nouveau match peut inverser la tendance.' : 'A new match can turn things around.')
                  }
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Monthly Breakdown Table */}
        <View style={st.card}>
          <View style={st.cardHeaderRow}>
            <MaterialIcons name="calendar-month" size={16} color={theme.accent} />
            <Text style={st.cardTitle}>{fr ? 'Detail mensuel' : 'Monthly Breakdown'}</Text>
          </View>
          {/* Table header */}
          <View style={st.tableHeaderRow}>
            <Text style={[st.tableHeaderCell, { flex: 2 }]}>{fr ? 'Mois' : 'Month'}</Text>
            <Text style={st.tableHeaderCell}>{fr ? 'Matchs' : 'Games'}</Text>
            <Text style={st.tableHeaderCell}>{fr ? 'V/D' : 'W/L'}</Text>
            <Text style={st.tableHeaderCell}>{fr ? 'Taux' : 'Rate'}</Text>
            <Text style={st.tableHeaderCell}>ELO</Text>
            <Text style={st.tableHeaderCell}>{'\u0394'}</Text>
          </View>
          {monthlyDetails.map((m, idx) => (
            <View key={idx} style={[st.tableRow, idx === monthlyDetails.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[st.tableCell, { flex: 2, fontWeight: '600' }]}>{m.month.slice(0, 3)}</Text>
              <Text style={st.tableCell}>{m.matches}</Text>
              <Text style={st.tableCell}>{m.wins}/{m.losses}</Text>
              <Text style={[st.tableCell, { color: m.winRate >= 50 ? '#22C55E' : m.winRate > 0 ? '#EF4444' : theme.textMuted, fontWeight: '700' }]}>
                {m.matches > 0 ? `${m.winRate}%` : '-'}
              </Text>
              <Text style={[st.tableCell, { fontWeight: '700' }]}>{m.eloEnd}</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {m.eloDelta !== 0 ? (
                  <View style={[st.deltaBadge, { backgroundColor: m.eloDelta > 0 ? '#22C55E15' : '#EF444415' }]}>
                    <Text style={[st.deltaBadgeText, { color: m.eloDelta > 0 ? '#22C55E' : '#EF4444' }]}>
                      {m.eloDelta > 0 ? '+' : ''}{m.eloDelta}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>-</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Season Comparison */}
        {prevSeason.matches > 0 ? (
          <View style={st.card}>
            <View style={st.cardHeaderRow}>
              <MaterialIcons name="compare-arrows" size={16} color="#8B5CF6" />
              <Text style={st.cardTitle}>{fr ? 'Comparaison avec' : 'Compared to'} {prevYear}</Text>
            </View>
            {[
              { label: fr ? 'Matchs joues' : 'Matches Played', current: currentSeason.matches, prev: prevSeason.matches, icon: 'sports' as const, color: theme.primary },
              { label: fr ? 'Victoires' : 'Wins', current: currentSeason.wins, prev: prevSeason.wins, icon: 'emoji-events' as const, color: '#22C55E' },
              { label: fr ? 'Taux de victoire' : 'Win Rate', current: currentSeason.winRate, prev: prevSeason.winRate, icon: 'trending-up' as const, color: '#F59E0B', suffix: '%' },
              { label: 'ELO', current: currentElo, prev: prevSeasonElo.end, icon: 'diamond' as const, color: '#8B5CF6' },
              { label: fr ? 'Pic ELO' : 'Peak ELO', current: seasonPeak, prev: prevSeasonElo.peak, icon: 'arrow-upward' as const, color: '#D97706' },
              { label: 'Carreaux', current: currentSeason.carreaux, prev: prevSeason.carreaux, icon: 'stars' as const, color: theme.carreauColor },
            ].map((item, idx) => {
              const diff = item.current - item.prev;
              const isUp = diff > 0;
              const isEqual = diff === 0;
              return (
                <View key={idx} style={st.compRow}>
                  <View style={[st.compIcon, { backgroundColor: item.color + '12' }]}>
                    <MaterialIcons name={item.icon} size={16} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.compLabel}>{item.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <Text style={[st.compCurrent, { color: item.color }]}>{item.current}{item.suffix || ''}</Text>
                      <Text style={st.compVs}>vs</Text>
                      <Text style={st.compPrev}>{item.prev}{item.suffix || ''}</Text>
                    </View>
                  </View>
                  {!isEqual ? (
                    <View style={[st.compDeltaBadge, { backgroundColor: isUp ? '#22C55E15' : '#EF444415' }]}>
                      <MaterialIcons name={isUp ? 'arrow-upward' : 'arrow-downward'} size={12} color={isUp ? '#22C55E' : '#EF4444'} />
                      <Text style={[st.compDeltaText, { color: isUp ? '#22C55E' : '#EF4444' }]}>
                        {isUp ? '+' : ''}{diff}{item.suffix || ''}
                      </Text>
                    </View>
                  ) : (
                    <View style={[st.compDeltaBadge, { backgroundColor: theme.textMuted + '15' }]}>
                      <Text style={[st.compDeltaText, { color: theme.textMuted }]}>=</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[st.card, { alignItems: 'center', paddingVertical: 24 }]}>
            <MaterialIcons name="info-outline" size={32} color={theme.textMuted} />
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 8, textAlign: 'center' }}>
              {fr ? `Aucune donnee pour la saison ${prevYear}.` : `No data for the ${prevYear} season.`}
            </Text>
          </View>
        )}

        {/* Share type buttons + PDF Export */}
        {prevSeason.matches > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Pressable
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.success + '12', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.success + '25' }}
              onPress={() => { Haptics.selectionAsync(); setShareCardType('season'); setShowShareModal(true); }}
            >
              <MaterialIcons name="share" size={16} color={theme.success} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.success }}>{fr ? 'Bilan saison' : 'Season summary'}</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#8B5CF6' + '12', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#8B5CF6' + '25' }}
              onPress={() => { Haptics.selectionAsync(); setShareCardType('comparison'); setShowShareModal(true); }}
            >
              <MaterialIcons name="compare-arrows" size={16} color="#8B5CF6" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#8B5CF6' }}>{fr ? `vs ${prevYear}` : `vs ${prevYear}`}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* PDF Export Button */}
        <Pressable
          style={st.exportBtn}
          onPress={async () => {
            Haptics.selectionAsync();
            try {
              const rows = monthlyDetails.map(m =>
                `<tr><td>${m.month}</td><td>${m.matches}</td><td>${m.wins}/${m.losses}</td><td>${m.matches > 0 ? m.winRate + '%' : '-'}</td><td>${m.eloEnd}</td><td style="color:${m.eloDelta > 0 ? '#22C55E' : m.eloDelta < 0 ? '#EF4444' : '#666'}">${m.eloDelta > 0 ? '+' : ''}${m.eloDelta}</td></tr>`
              ).join('');
              const html = `<html><head><meta charset="utf-8"/><style>body{font-family:system-ui;padding:24px;color:#1E293B}h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#64748B;margin-top:4px}.hero{background:#0F172A;color:#FFF;padding:20px;border-radius:16px;margin-bottom:20px}.hero .elo{font-size:42px;font-weight:900;color:${eloR.color}}.hero .rank{color:${eloR.color};font-size:13px;font-weight:700}.stats{display:flex;gap:12px;margin:16px 0}.stat{flex:1;text-align:center;background:#F8FAFC;padding:12px;border-radius:12px}.stat .val{font-size:22px;font-weight:800}.stat .lbl{font-size:10px;color:#64748B;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#F1F5F9;padding:8px;text-align:center;font-size:11px;color:#64748B;text-transform:uppercase}td{padding:8px;text-align:center;border-bottom:1px solid #E2E8F0;font-size:13px}.comp{margin-top:20px;border:1px solid #E2E8F0;border-radius:12px;padding:16px}.comp h3{margin:0 0 12px;font-size:14px;color:#7C3AED}.comp-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9}.best{background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px;margin-top:16px}.best h3{color:#B45309;margin:0 0 8px}</style></head><body>`
              + `<div class="hero"><h1>${fr ? 'Saison' : 'Season'} ${currentYear}</h1><div class="elo">${currentElo}</div><div class="rank">${eloR.label[fr ? 'fr' : 'en']} ${fr ? '| Pic' : '| Peak'}: ${seasonPeak}</div></div>`
              + `<div class="stats"><div class="stat"><div class="val" style="color:#22C55E">${currentSeason.wins}</div><div class="lbl">${fr ? 'Victoires' : 'Wins'}</div></div><div class="stat"><div class="val" style="color:#EF4444">${currentSeason.losses}</div><div class="lbl">${fr ? 'Defaites' : 'Losses'}</div></div><div class="stat"><div class="val" style="color:#3B82F6">${currentSeason.winRate}%</div><div class="lbl">${fr ? 'Taux' : 'Rate'}</div></div><div class="stat"><div class="val" style="color:#A78BFA">${currentSeason.carreaux}</div><div class="lbl">Carreaux</div></div></div>`
              + (bestMonth && bestMonth.matches > 0 ? `<div class="best"><h3>${fr ? 'Meilleur mois' : 'Best Month'}: ${bestMonth.month}</h3><p>+${bestMonth.eloDelta} ELO | ${bestMonth.wins} ${fr ? 'victoires' : 'wins'} / ${bestMonth.matches} ${fr ? 'matchs' : 'matches'} (${bestMonth.winRate}%)</p></div>` : '')
              + `<table><thead><tr><th>${fr ? 'Mois' : 'Month'}</th><th>${fr ? 'Matchs' : 'Games'}</th><th>${fr ? 'V/D' : 'W/L'}</th><th>${fr ? 'Taux' : 'Rate'}</th><th>ELO</th><th>\u0394</th></tr></thead><tbody>${rows}</tbody></table>`
              + (prevSeason.matches > 0 ? `<div class="comp"><h3>${fr ? 'Comparaison avec' : 'Compared to'} ${prevYear}</h3>${[
                { l: fr ? 'Matchs' : 'Matches', c: currentSeason.matches, p: prevSeason.matches },
                { l: fr ? 'Victoires' : 'Wins', c: currentSeason.wins, p: prevSeason.wins },
                { l: fr ? 'Taux V.' : 'Win %', c: currentSeason.winRate + '%', p: prevSeason.winRate + '%' },
                { l: 'ELO', c: currentElo, p: prevSeasonElo.end },
                { l: fr ? 'Pic ELO' : 'Peak', c: seasonPeak, p: prevSeasonElo.peak },
              ].map(r => `<div class="comp-row"><span>${r.l}</span><span><b>${r.c}</b> vs ${r.p}</span></div>`).join('')}</div>` : '')
              + `</body></html>`;
              if (Platform.OS === 'web') {
                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); w.print(); }
              } else {
                const PrintModule = require('expo-print');
                const SharingModule = require('expo-sharing');
                const { uri } = await PrintModule.printToFileAsync({ html });
                if (await SharingModule.isAvailableAsync()) {
                  await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${fr ? 'Saison' : 'Season'} ${currentYear}.pdf` });
                }
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              console.log('PDF export error:', e);
            }
          }}
        >
          <MaterialIcons name="picture-as-pdf" size={16} color="#EF4444" />
          <Text style={st.exportBtnText}>{fr ? 'Exporter en PDF' : 'Export PDF'}</Text>
        </Pressable>
      </ScrollView>

      {/* Share Modal for season summary */}
      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        itemType="player"
        itemId={user?.id || ''}
        itemName={fr ? `Bilan Saison ${currentYear}` : `Season ${currentYear} Summary`}
        customCardComponent={
          shareCardType === 'comparison' && prevSeason.matches > 0 ? (
            <ShareCardSeasonComparison
              playerName={user?.username || user?.email?.split('@')[0] || (fr ? 'Joueur' : 'Player')}
              eloColor={eloR.color}
              eloRankLabel={eloR.label[fr ? 'fr' : 'en']}
              eloIcon={eloR.icon}
              current={{ year: currentYear, matches: currentSeason.matches, wins: currentSeason.wins, losses: currentSeason.losses, winRate: currentSeason.winRate, carreaux: currentSeason.carreaux, elo: currentElo, peak: seasonPeak }}
              previous={{ year: prevYear, matches: prevSeason.matches, wins: prevSeason.wins, losses: prevSeason.losses, winRate: prevSeason.winRate, carreaux: prevSeason.carreaux, elo: prevSeasonElo.end, peak: prevSeasonElo.peak }}
              language={fr ? 'fr' : 'en'}
            />
          ) : (
            <ShareCardSeason
            playerName={user?.username || user?.email?.split('@')[0] || (fr ? 'Joueur' : 'Player')}
            year={currentYear}
            matchesPlayed={currentSeason.matches}
            wins={currentSeason.wins}
            losses={currentSeason.losses}
            winRate={currentSeason.winRate}
            carreaux={currentSeason.carreaux}
            eloRating={currentElo}
            eloColor={eloR.color}
            eloRankLabel={eloR.label[fr ? 'fr' : 'en']}
            eloIcon={eloR.icon}
            seasonPeak={seasonPeak}
            bestMonth={bestMonth ? { name: bestMonth.month, delta: bestMonth.eloDelta, wins: bestMonth.wins, matches: bestMonth.matches } : null}
            streak={streak.count >= 2 ? { type: streak.type as 'win' | 'loss', count: streak.count } : null}
            monthlyElo={monthlyDetails.map(m => ({ month: m.month.slice(0, 3), elo: m.eloEnd }))}
            monthlyDetails={monthlyDetails.map(m => ({ month: m.month.slice(0, 3), matches: m.matches, wins: m.wins, losses: m.losses, winRate: m.winRate, eloEnd: m.eloEnd, eloDelta: m.eloDelta }))}
            language={fr ? 'fr' : 'en'}
          />
          )
        }
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  shareBtn: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Hero
  heroCard: { borderRadius: 20, padding: 20, marginBottom: 16, ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 }, android: { elevation: 5 }, default: {} }) },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  heroLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroElo: { fontSize: 48, fontWeight: '900', marginTop: 2 },
  heroPeakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  heroPeakText: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  heroStreakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  heroStreakText: { fontSize: 12, fontWeight: '700' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8 },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 20, fontWeight: '800' },
  heroStatLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.45)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  heroStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Card
  card: { backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 14, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },

  // Best Month
  bestMonthContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bestMonthLeft: { flex: 1 },
  bestMonthName: { fontSize: 20, fontWeight: '800', color: theme.textPrimary, textTransform: 'capitalize' },
  bestMonthStats: { flexDirection: 'row', gap: 8 },
  bestMonthStat: { alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 48 },
  bestMonthStatVal: { fontSize: 16, fontWeight: '800', color: theme.textPrimary },
  bestMonthStatLabel: { fontSize: 9, fontWeight: '600', color: theme.textMuted, marginTop: 1 },

  // Streak
  streakCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  streakCircleNum: { fontSize: 24, fontWeight: '900' },

  // Table
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: theme.border, marginBottom: 4 },
  tableHeaderCell: { flex: 1, fontSize: 10, fontWeight: '700', color: theme.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  tableCell: { flex: 1, fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  deltaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  deltaBadgeText: { fontSize: 11, fontWeight: '700' },

  // Comparison
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border + '50' },
  compIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  compLabel: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  compCurrent: { fontSize: 16, fontWeight: '800' },
  compVs: { fontSize: 11, color: theme.textMuted },
  compPrev: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  compDeltaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  compDeltaText: { fontSize: 12, fontWeight: '700' },

  // Export button
  exportBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#EF444410', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#EF444420', marginTop: 4, marginBottom: 16 },
  exportBtnText: { fontSize: 14, fontWeight: '700' as const, color: '#EF4444' },
});
