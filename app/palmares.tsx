import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { Tournament, Match } from '@/types/petanque';
import AdBanner from '@/components/ui/AdBanner';
import { fetchEloSeasons, getEloRank, getEloColor, EloSeasonEntry, ELO_RANKS, checkAndApplySeasonalReset } from '@/services/eloService';
import { exportPalmaresPDF } from '@/services/palmaresExportService';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';

const { width: screenWidth } = Dimensions.get('window');

interface TournamentPalmaresItem {
  tournament: Tournament;
  matches: Match[];
  stats: {
    played: number;
    wins: number;
    losses: number;
    winRate: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDiff: number;
    tirRate: number | null;
    carreaux: number;
    avgScore: number;
    avgConceded: number;
  };
}

const RESULT_CONFIG: Record<string, { icon: string; color: string; rank: number }> = {
  '1er': { icon: 'emoji-events', color: '#FFD700', rank: 1 },
  '2ème': { icon: 'workspace-premium', color: '#A8B4C0', rank: 2 },
  '3ème': { icon: 'military-tech', color: '#CD7F32', rank: 3 },
  'Demi-finale': { icon: 'trending-up', color: '#4A90D9', rank: 4 },
  'Quart de finale': { icon: 'trending-flat', color: '#F5A623', rank: 5 },
  '1/8 finale': { icon: 'sports', color: '#7B8794', rank: 6 },
  'Poules': { icon: 'group', color: '#7B8794', rank: 7 },
  'Autre': { icon: 'more-horiz', color: '#7B8794', rank: 8 },
};



// ============================================
// TOURNAMENT CARD
// ============================================
const TournamentCard = React.memo(({ item, index, t, language }: { item: TournamentPalmaresItem; index: number; t: (s: string, k: string) => string; language: string }) => {
  const { tournament, stats } = item;
  const resultCfg = RESULT_CONFIG[tournament.finalResult || ''] || { icon: 'sports', color: theme.textMuted, rank: 99 };
  const hasFinancials = (tournament.registrationCost && tournament.registrationCost > 0) || (tournament.prizeWon && tournament.prizeWon > 0);
  const netGain = (tournament.prizeWon || 0) - (tournament.registrationCost || 0);
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const translatedResult = tournament.finalResult ? t('palmaresResults', tournament.finalResult) : null;

  return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${tournament.id}`); }}
      >
        <View style={[styles.cardAccent, { backgroundColor: resultCfg.color }]} />
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <View style={[styles.resultBadge, { backgroundColor: resultCfg.color + '18' }]}>
              <MaterialIcons name={resultCfg.icon as any} size={26} color={resultCfg.color} />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardName} numberOfLines={2}>{tournament.name}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardDate}>
                  {new Date(tournament.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {tournament.location?.city ? (
                  <>
                    <View style={styles.dot} />
                    <Text style={styles.cardCity}>{tournament.location.city}</Text>
                  </>
                ) : null}
              </View>
            </View>
            {translatedResult ? (
              <View style={[styles.resultTag, { backgroundColor: resultCfg.color + '15', borderColor: resultCfg.color + '30' }]}>
                <Text style={[styles.resultTagText, { color: resultCfg.color }]}>{translatedResult}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>{stats.played}</Text>
              <Text style={styles.statCellLabel}>{t('palmares', 'matchs')}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: theme.success }]}>{stats.wins}</Text>
              <Text style={styles.statCellLabel}>V</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: theme.error }]}>{stats.losses}</Text>
              <Text style={styles.statCellLabel}>{language === 'en' ? 'L' : 'D'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: theme.primary }]}>{stats.winRate}%</Text>
              <Text style={styles.statCellLabel}>{language === 'en' ? 'Win' : 'Vict.'}</Text>
            </View>
            {stats.tirRate !== null ? (
              <View style={styles.statCell}>
                <Text style={[styles.statCellValue, { color: theme.tirColor }]}>{stats.tirRate}%</Text>
                <Text style={styles.statCellLabel}>{t('stats', 'tir')}</Text>
              </View>
            ) : null}
            <View style={styles.statCell}>
              <Text style={[styles.statCellValue, { color: stats.pointDiff >= 0 ? theme.success : theme.error }]}>
                {stats.pointDiff > 0 ? '+' : ''}{stats.pointDiff}
              </Text>
              <Text style={styles.statCellLabel}>Diff.</Text>
            </View>
          </View>

          {stats.played > 0 ? (
            <View style={styles.avgScoreRow}>
              <Text style={styles.avgScoreLabel}>{language === 'en' ? 'Avg. score' : 'Score moy.'}</Text>
              <View style={styles.avgScoreBarBg}>
                <View style={[styles.avgScoreBarFill, { width: `${Math.min((stats.avgScore / 13) * 100, 100)}%`, backgroundColor: theme.success + '80' }]} />
              </View>
              <Text style={[styles.avgScoreValue, { color: theme.success }]}>{stats.avgScore}</Text>
              <Text style={styles.avgScoreSeparator}>-</Text>
              <Text style={[styles.avgScoreValue, { color: theme.error }]}>{stats.avgConceded}</Text>
            </View>
          ) : null}

          {hasFinancials ? (
            <View style={styles.financialRow}>
              {tournament.registrationCost ? (
                <View style={styles.financialItem}>
                  <MaterialIcons name="payments" size={13} color={theme.error} />
                  <Text style={[styles.financialText, { color: theme.error }]}>-{tournament.registrationCost}€</Text>
                </View>
              ) : null}
              {tournament.prizeWon ? (
                <View style={styles.financialItem}>
                  <MaterialIcons name="emoji-events" size={13} color={theme.success} />
                  <Text style={[styles.financialText, { color: theme.success }]}>+{tournament.prizeWon}€</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              <View style={[styles.netBadge, { backgroundColor: netGain >= 0 ? theme.success + '12' : theme.error + '12' }]}>
                <Text style={[styles.netText, { color: netGain >= 0 ? theme.success : theme.error }]}>
                  Net: {netGain >= 0 ? '+' : ''}{netGain}€
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.cardType}><Text style={styles.cardTypeText}>{t('formats', tournament.format)}</Text></View>
            <View style={styles.cardType}><Text style={styles.cardTypeText}>{t('tournamentTypes', tournament.type)}</Text></View>
            {stats.carreaux > 0 ? (
              <View style={styles.carreauBadge}>
                <MaterialIcons name="stars" size={11} color={theme.carreauColor} />
                <Text style={styles.carreauText}>{stats.carreaux}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
          </View>
        </View>
      </Pressable>
  );
});

// ============================================
// FORMAT STATS BAR
// ============================================
const FormatStatsBar = React.memo(({ formatStats, t }: { formatStats: Record<string, { played: number; wins: number; winRate: number }>; t: (s: string, k: string) => string }) => {
  const formats = Object.entries(formatStats).filter(([, s]) => s.played > 0);
  if (formats.length === 0) return null;
  return (
    <View style={styles.formatStatsContainer}>
      {formats.map(([format, stats]) => (
        <View key={format} style={styles.formatStatItem}>
          <Text style={styles.formatStatLabel}>{t('formats', format)}</Text>
          <View style={styles.formatStatBarBg}>
            <View style={[styles.formatStatBarFill, { width: `${stats.winRate}%` }]} />
          </View>
          <Text style={styles.formatStatValue}>{stats.winRate}%</Text>
          <Text style={styles.formatStatCount}>({stats.wins}/{stats.played})</Text>
        </View>
      ))}
    </View>
  );
});

type YearFilter = 'all' | string;
type FormatFilter = 'all' | 'Tête-à-tête' | 'Doublette' | 'Triplette';
type ResultFilter = 'all' | 'podium';

// ============================================
// MAIN COMPONENT
// ============================================
export default function PalmaresScreen() {
  const insets = useSafeAreaInsets();
  const { tournaments, matches } = useAppData();
  const financial = useFinancialSummary();
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';

  const FORMAT_FILTERS: { id: FormatFilter; label: string; icon: string }[] = [
    { id: 'all', label: t('palmares', 'allFormats'), icon: 'groups' },
    { id: 'Tête-à-tête', label: t('formats', 'TàT'), icon: 'person' },
    { id: 'Doublette', label: t('formats', 'Doublette'), icon: 'group' },
    { id: 'Triplette', label: t('formats', 'Triplette'), icon: 'groups' },
  ];

  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [showFormatStats, setShowFormatStats] = useState(false);
  const [showTournamentDetails, setShowTournamentDetails] = useState(false);
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Export PDF handler
  const handleExportPDF = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExporting(true);
    try {
      const seasonMap = new Map<number, any>();
      palmaresData.forEach(item => {
        const year = new Date(item.tournament.date).getFullYear();
        if (!seasonMap.has(year)) seasonMap.set(year, { year, tournaments: [], titles: 0, podiums: 0, totalMatches: 0, wins: 0, winRate: 0 });
        const sg = seasonMap.get(year)!;
        sg.tournaments.push({
          name: item.tournament.name, date: item.tournament.date, format: item.tournament.format,
          result: item.tournament.finalResult, city: item.tournament.location?.city,
          matchesPlayed: item.stats.played, wins: item.stats.wins, losses: item.stats.losses,
          winRate: item.stats.winRate, pointsFor: item.stats.pointsFor, pointsAgainst: item.stats.pointsAgainst,
          tirRate: item.stats.tirRate, carreaux: item.stats.carreaux,
          registrationCost: item.tournament.registrationCost, prizeWon: item.tournament.prizeWon,
        });
        if (item.tournament.finalResult === '1er') { sg.titles++; sg.podiums++; }
        else if (['2\u00e8me', '3\u00e8me'].includes(item.tournament.finalResult || '')) sg.podiums++;
        sg.totalMatches += item.stats.played; sg.wins += item.stats.wins;
      });
      const exportSeasons = Array.from(seasonMap.values()).sort((a: any, b: any) => b.year - a.year);
      exportSeasons.forEach((s: any) => { s.winRate = s.totalMatches > 0 ? Math.round((s.wins / s.totalMatches) * 100) : 0; });

      await exportPalmaresPDF({
        playerName: selfPlayer?.name || '',
        clubName: selfPlayer?.club,
        eloRating: selfPlayer?.eloRating,
        eloRankLabel: selfPlayer?.eloRating ? getEloRank(selfPlayer.eloRating).label[language === 'fr' ? 'fr' : 'en'] : undefined,
        seasons: exportSeasons,
        summary: {
          totalTournaments: summary.totalTournaments, totalMatches: summary.totalMatches,
          totalWins: summary.totalWins, totalLosses: summary.totalLosses,
          avgWinRate: summary.avgWinRate, titles: summary.titles,
          podiums: summary.podiums, totalCarreaux: summary.totalCarreaux,
          maxStreak: summary.maxStreak, totalPrize: summary.totalPrize, totalCost: summary.totalCost,
        },
        language: language as 'fr' | 'en',
      });
    } catch (e) {
      console.log('[Palmares] PDF export error:', e);
    } finally {
      setExporting(false);
    }
  }, [palmaresData, summary, selfPlayer, language]);

  // ELO Seasons
  const [eloSeasons, setEloSeasons] = useState<EloSeasonEntry[]>([]);
  const [eloSeasonsLoading, setEloSeasonsLoading] = useState(true);
  const { selfPlayer } = useAppData();

  // Load ELO seasons and check for seasonal reset
  React.useEffect(() => {
    if (!selfPlayer) { setEloSeasonsLoading(false); return; }
    // Check seasonal reset on mount
    checkAndApplySeasonalReset().catch(() => {});
    // Fetch seasons
    fetchEloSeasons(selfPlayer.id).then(({ seasons }) => {
      setEloSeasons(seasons);
      setEloSeasonsLoading(false);
    }).catch(() => setEloSeasonsLoading(false));
  }, [selfPlayer?.id]);

  // Build palmares data
  const allPalmaresData = useMemo(() => {
    const finishedTournaments = tournaments.filter(t => t.status === 'Terminé');
    return finishedTournaments.map(tournament => {
      const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
      const wins = tournamentMatches.filter(m => m.winner === 'A').length;
      const losses = tournamentMatches.length - wins;
      const pointsFor = tournamentMatches.reduce((sum, m) => sum + (m.teamA?.score || 0), 0);
      const pointsAgainst = tournamentMatches.reduce((sum, m) => sum + (m.teamB?.score || 0), 0);

      let totalTirs = 0, totalTirsSuccess = 0, totalCarreaux = 0;
      tournamentMatches.forEach(m => {
        if (m.playerActions) {
          m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
            totalTirs += pa.actions.tirs;
            totalTirsSuccess += pa.actions.tirsSuccess;
            totalCarreaux += pa.actions.carreaux;
          });
        }
      });

      return {
        tournament,
        matches: tournamentMatches,
        stats: {
          played: tournamentMatches.length,
          wins, losses,
          winRate: tournamentMatches.length > 0 ? Math.round((wins / tournamentMatches.length) * 100) : 0,
          pointsFor, pointsAgainst,
          pointDiff: pointsFor - pointsAgainst,
          tirRate: totalTirs > 0 ? Math.round((totalTirsSuccess / totalTirs) * 100) : null,
          carreaux: totalCarreaux,
          avgScore: tournamentMatches.length > 0 ? Math.round((pointsFor / tournamentMatches.length) * 10) / 10 : 0,
          avgConceded: tournamentMatches.length > 0 ? Math.round((pointsAgainst / tournamentMatches.length) * 10) / 10 : 0,
        },
      };
    });
  }, [tournaments, matches]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    allPalmaresData.forEach(item => years.add(new Date(item.tournament.date).getFullYear().toString()));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [allPalmaresData]);

  const palmaresData = useMemo(() => {
    const filtered = allPalmaresData.filter(item => {
      if (yearFilter !== 'all' && new Date(item.tournament.date).getFullYear().toString() !== yearFilter) return false;
      if (formatFilter !== 'all' && item.tournament.format !== formatFilter) return false;
      if (resultFilter === 'podium' && !['1er', '2ème', '3ème'].includes(item.tournament.finalResult || '')) return false;
      return true;
    });

    // Always sort by rank
    filtered.sort((a, b) => {
      const rankA = RESULT_CONFIG[a.tournament.finalResult || '']?.rank || 99;
      const rankB = RESULT_CONFIG[b.tournament.finalResult || '']?.rank || 99;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(b.tournament.date).getTime() - new Date(a.tournament.date).getTime();
    });
    return filtered;
  }, [allPalmaresData, yearFilter, formatFilter, resultFilter]);

  // Summary
  const summary = useMemo(() => {
    const totalTournaments = palmaresData.length;
    const totalWins = palmaresData.reduce((sum, item) => sum + item.stats.wins, 0);
    const totalMatches = palmaresData.reduce((sum, item) => sum + item.stats.played, 0);
    const totalLosses = totalMatches - totalWins;
    const podiums = palmaresData.filter(item => ['1er', '2ème', '3ème'].includes(item.tournament.finalResult || '')).length;
    const titles = palmaresData.filter(item => item.tournament.finalResult === '1er').length;
    const seconds = palmaresData.filter(item => item.tournament.finalResult === '2ème').length;
    const thirds = palmaresData.filter(item => item.tournament.finalResult === '3ème').length;
    const totalCarreaux = palmaresData.reduce((sum, item) => sum + item.stats.carreaux, 0);
    const avgWinRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
    const totalPointsFor = palmaresData.reduce((sum, item) => sum + item.stats.pointsFor, 0);
    const totalPointsAgainst = palmaresData.reduce((sum, item) => sum + item.stats.pointsAgainst, 0);
    const avgScorePerMatch = totalMatches > 0 ? Math.round((totalPointsFor / totalMatches) * 10) / 10 : 0;
    const avgConcededPerMatch = totalMatches > 0 ? Math.round((totalPointsAgainst / totalMatches) * 10) / 10 : 0;

    let maxStreak = 0, currentStreak = 0;
    const sortedByDate = [...palmaresData].sort((a, b) => new Date(a.tournament.date).getTime() - new Date(b.tournament.date).getTime());
    sortedByDate.forEach(item => {
      item.matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(m => {
        if (m.winner === 'A') { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else { currentStreak = 0; }
      });
    });

    let bestTirTournament: TournamentPalmaresItem | null = null;
    palmaresData.forEach(item => {
      if (item.stats.tirRate !== null && (bestTirTournament === null || (item.stats.tirRate > (bestTirTournament.stats.tirRate || 0)))) {
        bestTirTournament = item;
      }
    });

    const undefeated = palmaresData.filter(item => item.stats.played > 0 && item.stats.losses === 0).length;
    const totalPrize = palmaresData.reduce((sum, item) => sum + (item.tournament.prizeWon || 0), 0);
    const totalCost = palmaresData.reduce((sum, item) => sum + (item.tournament.registrationCost || 0), 0);

    return { totalTournaments, totalWins, totalLosses, totalMatches, podiums, titles, seconds, thirds, totalCarreaux, avgWinRate, maxStreak, bestTirTournament, undefeated, avgScorePerMatch, avgConcededPerMatch, totalPrize, totalCost };
  }, [palmaresData]);

  // Format stats
  const formatStats = useMemo(() => {
    const stats: Record<string, { played: number; wins: number; winRate: number }> = {};
    palmaresData.forEach(item => {
      const f = item.tournament.format;
      if (!stats[f]) stats[f] = { played: 0, wins: 0, winRate: 0 };
      stats[f].played += item.stats.played;
      stats[f].wins += item.stats.wins;
    });
    Object.values(stats).forEach(s => { s.winRate = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0; });
    return stats;
  }, [palmaresData]);

  const flatListData = useMemo(() => showTournamentDetails ? palmaresData : [], [palmaresData, showTournamentDetails]);

  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (yearFilter !== 'all') c++;
    if (formatFilter !== 'all') c++;
    if (resultFilter === 'podium') c++;
    return c;
  }, [yearFilter, formatFilter, resultFilter]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('palmares', 'title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            style={[styles.filterToggleBtn, { backgroundColor: '#22C55E' + '12' }]}
            onPress={handleExportPDF}
            disabled={exporting || palmaresData.length === 0}
          >
            {exporting ? <ActivityIndicator size="small" color="#22C55E" /> : <MaterialIcons name="picture-as-pdf" size={18} color="#22C55E" />}
          </Pressable>
          <Pressable
            style={[styles.filterToggleBtn, { backgroundColor: '#8B5CF6' + '12' }]}
            onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/share-card', params: { type: 'palmares' } } as any); }}
          >
            <MaterialIcons name="share" size={18} color="#8B5CF6" />
          </Pressable>
          <Pressable
            style={[styles.filterToggleBtn, showHeaderFilters && styles.filterToggleBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setShowHeaderFilters(!showHeaderFilters); }}
          >
            <MaterialIcons name="tune" size={18} color={showHeaderFilters ? '#FFF' : theme.primary} />
            {activeFiltersCount > 0 ? (
              <View style={[styles.filterToggleBadge, showHeaderFilters && { backgroundColor: '#FFF' }]}>
                <Text style={[styles.filterToggleBadgeText, showHeaderFilters && { color: theme.primary }]}>{activeFiltersCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.progressionBtn} onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/stats'); }}>
            <MaterialIcons name="show-chart" size={20} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {/* ============ COMPACT HEADER FILTERS ============ */}
      {showHeaderFilters ? (
        <View style={styles.headerFilters}>
          {/* Year row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hfRow}>
            <View style={styles.hfGroupIcon}><MaterialIcons name="date-range" size={13} color={theme.primary} /></View>
            <Pressable style={[styles.hfPill, yearFilter === 'all' && styles.hfPillActive]} onPress={() => { Haptics.selectionAsync(); setYearFilter('all'); }}>
              <Text style={[styles.hfPillText, yearFilter === 'all' && styles.hfPillTextActive]}>{t('palmares', 'allYears')}</Text>
            </Pressable>
            {availableYears.map(year => (
              <Pressable key={year} style={[styles.hfPill, yearFilter === year && styles.hfPillActive]} onPress={() => { Haptics.selectionAsync(); setYearFilter(yearFilter === year ? 'all' : year); }}>
                <Text style={[styles.hfPillText, yearFilter === year && styles.hfPillTextActive]}>{year}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* Format + Podium row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hfRow}>
            <View style={[styles.hfGroupIcon, { backgroundColor: theme.accent + '12' }]}><MaterialIcons name="groups" size={13} color={theme.accent} /></View>
            {FORMAT_FILTERS.map(f => (
              <Pressable key={f.id} style={[styles.hfPill, formatFilter === f.id && styles.hfPillActive]} onPress={() => { Haptics.selectionAsync(); setFormatFilter(f.id); }}>
                <MaterialIcons name={f.icon as any} size={12} color={formatFilter === f.id ? '#FFF' : theme.textMuted} />
                <Text style={[styles.hfPillText, formatFilter === f.id && styles.hfPillTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
            <View style={styles.hfSep} />
            <Pressable style={[styles.hfPill, resultFilter === 'podium' && { backgroundColor: theme.carreauColor, borderColor: theme.carreauColor }]} onPress={() => { Haptics.selectionAsync(); setResultFilter(resultFilter === 'podium' ? 'all' : 'podium'); }}>
              <MaterialIcons name="emoji-events" size={12} color={resultFilter === 'podium' ? '#FFF' : theme.carreauColor} />
              <Text style={[styles.hfPillText, resultFilter === 'podium' && { color: '#FFF' }]}>{t('palmares', 'podiumsOnly')}</Text>
            </Pressable>
            {activeFiltersCount > 0 ? (
              <Pressable style={styles.hfResetBtn} onPress={() => { Haptics.selectionAsync(); setYearFilter('all'); setFormatFilter('all'); setResultFilter('all'); }}>
                <MaterialIcons name="close" size={13} color={theme.error} />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={flatListData}
        keyExtractor={item => item.tournament.id}
        renderItem={({ item, index }) => <TournamentCard item={item} index={index} t={t} language={language} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }, screenWidth >= 600 && styles.listContentTablet]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <>
            {/* ============ PODIUM HERO ============ */}
            <View style={styles.heroCardOuter}>
              <LinearGradient
                colors={['#0F172A', '#1E3A5F', '#1E3A5F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                {summary.podiums > 0 ? (
                  <View style={styles.podiumContainer}>
                    <View style={styles.podiumColumn}>
                      <View style={[styles.podiumMedalCircle, { backgroundColor: 'rgba(192,192,192,0.15)', borderColor: 'rgba(192,192,192,0.35)', borderWidth: 2 }]}>
                        <MaterialIcons name="workspace-premium" size={26} color="#C0C8D4" />
                      </View>
                      <Text style={[styles.podiumCount, { color: '#C0C8D4' }]}>{summary.seconds}</Text>
                      <LinearGradient colors={['rgba(192,192,192,0.25)', 'rgba(192,192,192,0.08)']} style={[styles.podiumBar, styles.podiumBar2nd]}>
                        <Text style={[styles.podiumBarText, { color: '#C0C8D4' }]}>{language === 'en' ? '2nd' : '2e'}</Text>
                      </LinearGradient>
                    </View>
                    <View style={styles.podiumColumn}>
                      <View style={[styles.podiumMedalCircle, styles.podiumMedalGold]}>
                        <MaterialIcons name="emoji-events" size={34} color="#FFD700" />
                      </View>
                      <Text style={[styles.podiumCount, { color: '#FFD700', fontSize: 24, fontWeight: '900' }]}>{summary.titles}</Text>
                      <LinearGradient colors={['rgba(255,215,0,0.3)', 'rgba(255,215,0,0.08)']} style={[styles.podiumBar, styles.podiumBar1st]}>
                        <Text style={[styles.podiumBarText, { fontWeight: '800', color: '#FFD700' }]}>{language === 'en' ? '1st' : '1er'}</Text>
                      </LinearGradient>
                    </View>
                    <View style={styles.podiumColumn}>
                      <View style={[styles.podiumMedalCircle, { backgroundColor: 'rgba(205,127,50,0.15)', borderColor: 'rgba(205,127,50,0.35)', borderWidth: 2 }]}>
                        <MaterialIcons name="military-tech" size={26} color="#D4956A" />
                      </View>
                      <Text style={[styles.podiumCount, { color: '#D4956A' }]}>{summary.thirds}</Text>
                      <LinearGradient colors={['rgba(205,127,50,0.25)', 'rgba(205,127,50,0.08)']} style={[styles.podiumBar, styles.podiumBar3rd]}>
                        <Text style={[styles.podiumBarText, { color: '#D4956A' }]}>{language === 'en' ? '3rd' : '3e'}</Text>
                      </LinearGradient>
                    </View>
                  </View>
                ) : (
                  <View style={styles.heroIconRow}>
                    <View style={styles.heroIcon}>
                      <MaterialIcons name="emoji-events" size={44} color="#FFD700" />
                    </View>
                  </View>
                )}

                <Text style={styles.heroTitle}>{summary.totalTournaments} {t('palmares', 'tournois')}</Text>
                <Text style={styles.heroSubtitle}>
                  {summary.totalMatches} {t('palmares', 'matchs')} {"•"} {summary.totalWins} {t('palmares', 'victoires')} {"•"} {summary.avgWinRate}% {t('palmares', 'taux')}
                </Text>

                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: '#FFD700' }]}>{summary.titles}</Text>
                    <Text style={styles.heroStatLabel}>{t('palmares', 'titres')}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: '#60A5FA' }]}>{summary.podiums}</Text>
                    <Text style={styles.heroStatLabel}>{t('palmares', 'podiums')}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: '#34D399' }]}>{summary.avgWinRate}%</Text>
                    <Text style={styles.heroStatLabel}>{t('palmares', 'victoires')}</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: '#FBBF24' }]}>{summary.totalCarreaux}</Text>
                    <Text style={styles.heroStatLabel}>{t('palmares', 'carreaux')}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* ============ ADVANCED STATS ============ */}
            {summary.totalMatches > 0 ? (
              <View style={styles.advancedStatsCard}>
                <View style={styles.advStatsGrid}>
                  <View style={styles.advStatItem}>
                    <MaterialIcons name="local-fire-department" size={18} color="#FF6B35" />
                    <Text style={styles.advStatValue}>{summary.maxStreak}</Text>
                    <Text style={styles.advStatLabel}>{language === 'en' ? 'Best streak' : 'Meilleure serie'}</Text>
                  </View>
                  <View style={styles.advStatDivider} />
                  <View style={styles.advStatItem}>
                    <MaterialIcons name="score" size={18} color={theme.success} />
                    <Text style={styles.advStatValue}>{summary.avgScorePerMatch}</Text>
                    <Text style={styles.advStatLabel}>{language === 'en' ? 'Avg. scored' : 'Score moy.'}</Text>
                  </View>
                  <View style={styles.advStatDivider} />
                  <View style={styles.advStatItem}>
                    <MaterialIcons name="shield" size={18} color={theme.error} />
                    <Text style={styles.advStatValue}>{summary.avgConcededPerMatch}</Text>
                    <Text style={styles.advStatLabel}>{language === 'en' ? 'Avg. conceded' : 'Encaisse moy.'}</Text>
                  </View>
                  <View style={styles.advStatDivider} />
                  <View style={styles.advStatItem}>
                    <MaterialIcons name="savings" size={18} color={financial.balance >= 0 ? theme.success : theme.error} />
                    <Text style={[styles.advStatValue, { color: financial.balance >= 0 ? theme.success : theme.error }]}>
                      {financial.balance >= 0 ? '+' : ''}{Math.round(financial.balance)}€
                    </Text>
                    <Text style={styles.advStatLabel}>Net</Text>
                  </View>
                </View>

                <Pressable style={styles.formatStatsToggle} onPress={() => { Haptics.selectionAsync(); setShowFormatStats(!showFormatStats); }}>
                  <MaterialIcons name="analytics" size={16} color={theme.primary} />
                  <Text style={styles.formatStatsToggleText}>{language === 'en' ? 'Win rate by format' : 'Taux de victoire par format'}</Text>
                  <MaterialIcons name={showFormatStats ? 'expand-less' : 'expand-more'} size={18} color={theme.primary} />
                </Pressable>
                {showFormatStats ? <FormatStatsBar formatStats={formatStats} t={t} /> : null}
              </View>
            ) : null}

            {/* ============ FINANCIAL SUMMARY ============ */}
            {(financial.totalPrizesWon > 0 || financial.totalCosts > 0 || summary.totalTournaments > 0) ? (
              <View>
                <Pressable
                  style={styles.financialCard}
                  onPress={() => router.push('/financial')}
                >
                  <View style={styles.financialCardHeader}>
                    <View style={[styles.financialCardIcon, { backgroundColor: (financial.balance >= 0 ? theme.success : theme.error) + '15' }]}>
                      <MaterialIcons name="account-balance-wallet" size={22} color={financial.balance >= 0 ? theme.success : theme.error} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.financialCardTitle}>{t('financial', 'title')}</Text>
                      <Text style={styles.financialCardSub}>{summary.totalTournaments} {t('palmares', 'tournois').toLowerCase()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' as const }}>
                      <Text style={[styles.financialCardBalance, { color: financial.balance >= 0 ? theme.success : theme.error }]}>
                        {financial.balance >= 0 ? '+' : ''}{Math.round(financial.balance)}€
                      </Text>
                      <Text style={styles.financialCardLabel}>Net</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </View>
                  <View style={styles.financialCardRow}>
                    <View style={styles.financialCardItem}>
                      <MaterialIcons name="arrow-upward" size={14} color={theme.success} />
                      <Text style={[styles.financialCardAmount, { color: theme.success }]}>+{Math.round(financial.totalPrizesWon)}€</Text>
                      <Text style={styles.financialCardAmountLabel}>{t('financial', 'gains')}</Text>
                    </View>
                    <View style={styles.financialCardDivider} />
                    <View style={styles.financialCardItem}>
                      <MaterialIcons name="arrow-downward" size={14} color={theme.error} />
                      <Text style={[styles.financialCardAmount, { color: theme.error }]}>-{Math.round(financial.totalCosts)}€</Text>
                      <Text style={styles.financialCardAmountLabel}>{t('financial', 'expenses')}</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            ) : null}

            {/* Ad Banner */}
            <AdBanner position="inline" />

            {/* Badges link — badges moved to dedicated Badges page */}
            <Pressable
              style={styles.badgesLink}
              onPress={() => { Haptics.selectionAsync(); router.push('/badges' as any); }}
            >
              <View style={[styles.badgesLinkIcon, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="stars" size={20} color={theme.carreauColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgesLinkTitle}>{t('palmares', 'badges')}</Text>
                <Text style={styles.badgesLinkSub}>{language === 'en' ? 'View all badges & progression' : 'Voir tous les badges & progression'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.carreauColor} />
            </Pressable>



            {/* ============ TOURNAMENT LIST TOGGLE ============ */}
            {/* ============ ELO SEASONS HISTORY ============ */}
            {/* ELO Awards Link */}
            <Pressable
              style={styles.eloAwardsLink}
              onPress={() => { Haptics.selectionAsync(); router.push('/elo-awards' as any); }}
            >
              <View style={[styles.eloSeasonsIconBox, { backgroundColor: '#9333EA15' }]}>
                <MaterialIcons name="emoji-events" size={18} color="#9333EA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eloAwardsLinkTitle}>{t('leaderboard', 'eloAwardsTitle')}</Text>
                <Text style={styles.eloAwardsLinkDesc}>{t('leaderboard', 'eloAwardsDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#9333EA" />
            </Pressable>

            <View style={styles.eloSeasonsSection}>
              <View style={styles.eloSeasonsHeader}>
                <View style={[styles.eloSeasonsIconBox, { backgroundColor: '#9333EA15' }]}>
                  <MaterialIcons name="diamond" size={18} color="#9333EA" />
                </View>
                <Text style={styles.eloSeasonsTitle}>{t('leaderboard', 'eloSeasons')}</Text>
              </View>

              {eloSeasonsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <ActivityIndicator size="small" color="#9333EA" />
                </View>
              ) : eloSeasons.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <MaterialIcons name="history" size={36} color={theme.textMuted} />
                  <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
                    {t('leaderboard', 'eloNoSeasons')}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
                    {t('leaderboard', 'eloNoSeasonsDesc')}
                  </Text>
                </View>
              ) : (
                eloSeasons.map((season, idx) => {
                  const rank = getEloRank(season.finalElo);
                  const peakRank = getEloRank(season.peakElo);
                  return (
                      <View key={season.id} style={[styles.eloSeasonCard, { borderLeftColor: rank.color, borderLeftWidth: 4 }]}>
                        <View style={styles.eloSeasonCardHeader}>
                          <View style={[styles.eloSeasonYearBadge, { backgroundColor: rank.color + '15' }]}>
                            <MaterialIcons name={rank.icon as any} size={18} color={rank.color} />
                            <Text style={[styles.eloSeasonYear, { color: rank.color }]}>{season.seasonYear}</Text>
                          </View>
                          <View style={{ flex: 1 }} />
                          <View style={[styles.eloSeasonRankBadge, { backgroundColor: rank.color + '12', borderColor: rank.color + '30' }]}>
                            <Text style={[styles.eloSeasonRankText, { color: rank.color }]}>
                              {rank.label[language === 'fr' ? 'fr' : 'en']}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.eloSeasonStatsRow}>
                          <View style={styles.eloSeasonStat}>
                            <Text style={[styles.eloSeasonStatValue, { color: rank.color }]}>{season.finalElo}</Text>
                            <Text style={styles.eloSeasonStatLabel}>{t('leaderboard', 'eloFinalElo')}</Text>
                          </View>
                          <View style={styles.eloSeasonStat}>
                            <Text style={[styles.eloSeasonStatValue, { color: peakRank.color }]}>{season.peakElo}</Text>
                            <Text style={styles.eloSeasonStatLabel}>{t('leaderboard', 'eloPeakElo')}</Text>
                          </View>
                          <View style={styles.eloSeasonStat}>
                            <Text style={styles.eloSeasonStatValue}>{season.matchesPlayed}</Text>
                            <Text style={styles.eloSeasonStatLabel}>{t('palmares', 'matchs')}</Text>
                          </View>
                          <View style={styles.eloSeasonStat}>
                            <Text style={[styles.eloSeasonStatValue, { color: theme.success }]}>{season.wins}</Text>
                            <Text style={styles.eloSeasonStatLabel}>{t('palmares', 'victoires')}</Text>
                          </View>
                        </View>
                        {/* Role ELOs */}
                        {(season.eloTireur && season.eloTireur !== 1000) || (season.eloPointeur && season.eloPointeur !== 1000) || (season.eloMilieu && season.eloMilieu !== 1000) ? (
                          <View style={styles.eloSeasonRolesRow}>
                            {season.eloTireur && season.eloTireur !== 1000 ? (
                              <View style={[styles.eloSeasonRoleBadge, { backgroundColor: '#F9731612' }]}>
                                <MaterialIcons name="gps-fixed" size={10} color="#F97316" />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#F97316' }}>{season.eloTireur}</Text>
                              </View>
                            ) : null}
                            {season.eloPointeur && season.eloPointeur !== 1000 ? (
                              <View style={[styles.eloSeasonRoleBadge, { backgroundColor: '#3B82F612' }]}>
                                <MaterialIcons name="adjust" size={10} color="#3B82F6" />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{season.eloPointeur}</Text>
                              </View>
                            ) : null}
                            {season.eloMilieu && season.eloMilieu !== 1000 ? (
                              <View style={[styles.eloSeasonRoleBadge, { backgroundColor: '#8B5CF612' }]}>
                                <MaterialIcons name="swap-horiz" size={10} color="#8B5CF6" />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>{season.eloMilieu}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                  );
                })
              )}
            </View>


            {palmaresData.length > 0 ? (
              <Pressable style={styles.toggleDetailsBtn} onPress={() => { Haptics.selectionAsync(); setShowTournamentDetails(!showTournamentDetails); }}>
                <MaterialIcons name={showTournamentDetails ? 'expand-less' : 'expand-more'} size={16} color={theme.textSecondary} />
                <Text style={styles.toggleDetailsBtnText}>
                  {showTournamentDetails ? t('palmares', 'hideTournaments') : t('palmares', 'showTournaments')} ({palmaresData.length})
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
        ListEmptyComponent={() => null}
      />

      {/* Empty state when no tournaments at all */}
      {palmaresData.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="emoji-events" size={64} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{t('palmares', 'noFinished')}</Text>
          <Text style={styles.emptyText}>{t('palmares', 'noFinishedText')}</Text>
          <Pressable style={styles.emptyButton} onPress={() => router.push('/tournament/new')}>
            <MaterialIcons name="add" size={20} color="#FFF" />
            <Text style={styles.emptyButtonText}>{t('palmares', 'createTournament')}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  progressionBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary + '12', borderRadius: 20 },
  filterToggleBtn: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: theme.primary + '12', borderRadius: 20, position: 'relative' as const },
  filterToggleBtnActive: { backgroundColor: theme.primary },
  filterToggleBadge: { position: 'absolute' as const, top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: theme.surface },
  filterToggleBadgeText: { fontSize: 10, fontWeight: '700' as const, color: '#FFF' },
  // Header filters
  headerFilters: { backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 8, gap: 6 },
  hfRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center' as const },
  hfGroupIcon: { width: 26, height: 26, borderRadius: 7, backgroundColor: theme.primary + '12', alignItems: 'center' as const, justifyContent: 'center' as const },
  hfPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border },
  hfPillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  hfPillText: { fontSize: 12, fontWeight: '600' as const, color: theme.textSecondary },
  hfPillTextActive: { color: '#FFF' },
  hfSep: { width: 1, height: 18, backgroundColor: theme.border, marginHorizontal: 2 },
  hfResetBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.error + '10', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: theme.error + '20' },
  listContent: { paddingHorizontal: 16, paddingTop: 16 },
  listContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },

  // Hero
  heroCardOuter: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.cardElevated,
  },
  heroCard: {
    borderRadius: theme.borderRadius.xl,
    padding: 28, alignItems: 'center',
  },
  heroIconRow: { marginBottom: 16 },
  heroIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: 'rgba(255,215,0,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,215,0,0.25)' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 22 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: theme.borderRadius.lg, paddingVertical: 18, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Podium
  podiumContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 20, gap: 16 },
  podiumColumn: { alignItems: 'center', gap: 8 },
  podiumMedalCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  podiumMedalGold: { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.45)', borderWidth: 2.5 },
  podiumCount: { fontSize: 20, fontWeight: '800' },
  podiumBar: { width: 74, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.08)' },
  podiumBar1st: { height: 88 },
  podiumBar2nd: { height: 62 },
  podiumBar3rd: { height: 48 },
  podiumBarText: { fontSize: 12, fontWeight: '700' },

  // Advanced Stats
  advancedStatsCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, ...theme.shadows.card },
  advStatsGrid: { flexDirection: 'row', alignItems: 'center' },
  advStatItem: { flex: 1, alignItems: 'center', gap: 4 },
  advStatDivider: { width: 1, height: 36, backgroundColor: theme.border },
  advStatValue: { fontSize: 17, fontWeight: '800', color: theme.textPrimary },
  advStatLabel: { fontSize: 9, color: theme.textMuted, textAlign: 'center', fontWeight: '500' },

  // Format stats
  formatStatsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: theme.border },
  formatStatsToggleText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  formatStatsContainer: { marginTop: 12, gap: 10 },
  formatStatItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formatStatLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, width: 72 },
  formatStatBarBg: { flex: 1, height: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 4, overflow: 'hidden' },
  formatStatBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 4 },
  formatStatValue: { fontSize: 13, fontWeight: '700', color: theme.primary, width: 36, textAlign: 'right' },
  formatStatCount: { fontSize: 10, color: theme.textMuted, width: 40 },

  // Badges link
  badgesLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.carreauColor + '20', ...theme.shadows.card },
  badgesLinkIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  badgesLinkTitle: { fontSize: 15, fontWeight: '700' as const, color: theme.textPrimary },
  badgesLinkSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },



  // Toggle tournament details
  toggleDetailsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginBottom: 8,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.md,
    ...theme.shadows.card,
  },
  toggleDetailsBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },

  // Card
  card: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, marginBottom: 12, ...theme.shadows.card, overflow: 'hidden' },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardAccent: { height: 3, width: '100%' },
  cardInner: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  resultBadge: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  cardDate: { fontSize: 12, color: theme.textSecondary },
  cardCity: { fontSize: 12, color: theme.textSecondary },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted, marginHorizontal: 6 },
  resultTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.borderRadius.full, borderWidth: 1 },
  resultTagText: { fontSize: 12, fontWeight: '700' },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 10 },
  statCell: { width: '16.66%', alignItems: 'center', paddingVertical: 2 },
  statCellValue: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  statCellLabel: { fontSize: 10, color: theme.textMuted, marginTop: 1 },

  // Avg score bar
  avgScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  avgScoreLabel: { fontSize: 10, color: theme.textMuted, width: 72 },
  avgScoreBarBg: { flex: 1, height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  avgScoreBarFill: { height: '100%', borderRadius: 3 },
  avgScoreValue: { fontSize: 13, fontWeight: '700', minWidth: 24, textAlign: 'right' },
  avgScoreSeparator: { fontSize: 11, color: theme.textMuted },

  // Financials
  financialRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, marginBottom: 8 },
  financialItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  financialText: { fontSize: 13, fontWeight: '600' },
  netBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  netText: { fontSize: 12, fontWeight: '700' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardType: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.sm },
  cardTypeText: { fontSize: 11, color: theme.textMuted, fontWeight: '500' },
  carreauBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.carreauColor + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.sm },
  carreauText: { fontSize: 11, color: theme.carreauColor, fontWeight: '700' },

  // Financial card in palmares
  financialCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 14,
    ...theme.shadows.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  financialCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
  },
  financialCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  financialCardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: theme.textPrimary,
  },
  financialCardSub: {
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 2,
  },
  financialCardBalance: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  financialCardLabel: {
    fontSize: 10,
    color: theme.textMuted,
    fontWeight: '600' as const,
  },
  financialCardRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  financialCardItem: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 2,
  },
  financialCardAmount: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  financialCardAmountLabel: {
    fontSize: 10,
    color: theme.textSecondary,
    fontWeight: '500' as const,
  },
  financialCardDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.border,
    marginHorizontal: 8,
  },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 260, marginBottom: 24 },
  emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: theme.borderRadius.md },
  emptyButtonText: { fontSize: 15, fontWeight: '600', color: '#FFF' },

  // ELO Seasons
  eloSeasonsSection: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  eloAwardsLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#9333EA' + '20', ...theme.shadows.card },
  eloAwardsLinkTitle: { fontSize: 15, fontWeight: '700' as const, color: theme.textPrimary },
  eloAwardsLinkDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  eloSeasonsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
  eloSeasonsIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  eloSeasonsTitle: { fontSize: 15, fontWeight: '700' as const, color: theme.textPrimary },
  eloSeasonCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10 },
  eloSeasonCardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 },
  eloSeasonYearBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  eloSeasonYear: { fontSize: 16, fontWeight: '800' as const },
  eloSeasonRankBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  eloSeasonRankText: { fontSize: 12, fontWeight: '700' as const },
  eloSeasonStatsRow: { flexDirection: 'row' as const, gap: 8 },
  eloSeasonStat: { flex: 1, alignItems: 'center' as const },
  eloSeasonStatValue: { fontSize: 17, fontWeight: '800' as const, color: theme.textPrimary },
  eloSeasonStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, fontWeight: '600' as const },
  eloSeasonRolesRow: { flexDirection: 'row' as const, gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  eloSeasonRoleBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
