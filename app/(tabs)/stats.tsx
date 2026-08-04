import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import { Image } from 'expo-image';
import theme from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';

import { router, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';

import AdBanner from '@/components/ui/AdBanner';

import { filterByTime } from '@/hooks/useFilteredStats';
import type { TimeFilter } from '@/hooks/useFilteredStats';
import { usePerformanceStats, useTirStats, usePointStats, useErrorStats } from '@/hooks/useStatsComputation';
import { useBoulesSetStats, useTerrainTypeStats, usePrecisionWorkshopStats, useProgressionData, useTrends, useChallengeProgressionData, useTournamentProgressionData } from '@/hooks/useProgressionStats';
import type { ProgressionFilter } from '@/hooks/useProgressionStats';
import { useItemFilter } from '@/hooks/useItemFilter';
import { ProgressRing, StatRow, SectionHeader, ProgressBar, BreakdownBar, NAPlaceholder } from '@/components/feature/stats/StatsPrimitives';
import { PerformanceSection } from '@/components/feature/stats/PerformanceSection';
import { TirSection } from '@/components/feature/stats/TirSection';
import { PointSection } from '@/components/feature/stats/PointSection';
import { ErrorsSection } from '@/components/feature/stats/ErrorsSection';
import { ProgressionModal } from '@/components/feature/stats/ProgressionModal';
import { ItemPickerModal } from '@/components/feature/stats/ItemPickerModal';

type StatsCategory = 'performance' | 'tir' | 'point' | 'errors';
type ContextFilter = 'all' | 'training' | 'tournament';

const TIME_FILTER_KEYS: { id: TimeFilter; key: string }[] = [
  { id: 'today', key: 'today' },
  { id: 'week', key: 'week' },
  { id: 'month', key: 'month' },
  { id: '3months', key: 'threeMonths' },
  { id: '6months', key: 'sixMonths' },
  { id: 'year', key: 'year' },
  { id: 'all', key: 'all' },
];

const PROGRESSION_FILTER_KEYS: { id: ProgressionFilter; key: string; weeks: number }[] = [
  { id: '4weeks', key: 'fourWeeks', weeks: 4 },
  { id: '8weeks', key: 'eightWeeks', weeks: 8 },
  { id: '3months', key: 'threeMonths', weeks: 13 },
  { id: '6months', key: 'sixMonths', weeks: 26 },
  { id: 'year', key: 'year', weeks: 52 },
  { id: '2years', key: 'twoYears', weeks: 104 },
  { id: '5years', key: 'fiveYears', weeks: 260 },
  { id: '10years', key: 'tenYears', weeks: 520 },
  { id: '25years', key: 'twentyFiveYears', weeks: 1300 },
];

const CATEGORY_TAB_KEYS: { id: StatsCategory; key: string; icon: string; color: string }[] = [
  { id: 'performance', key: 'performance', icon: 'emoji-events', color: theme.primary },
  { id: 'tir', key: 'tir', icon: 'gps-fixed', color: theme.tirColor },
  { id: 'point', key: 'point', icon: 'adjust', color: theme.pointColor },
  { id: 'errors', key: 'errors', icon: 'error-outline', color: theme.error },
];

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { matches, challenges, tournaments, terrains, boulesSets, selfPlayer, players } = useAppData();
  const { getMatchesByTournament } = useAppActions();
  const { t, language } = useLanguage();
  const { timeFilter: timeFilterParam } = useLocalSearchParams<{ timeFilter?: string }>();

  const TIME_FILTERS = React.useMemo(() => TIME_FILTER_KEYS.map(f => ({ ...f, label: t('stats', f.key) || t('common', f.key) })), [language]);
  const PROGRESSION_FILTERS = React.useMemo(() => PROGRESSION_FILTER_KEYS.map(f => ({ ...f, label: t('stats', f.key) })), [language]);
  const CATEGORY_TABS = React.useMemo(() => CATEGORY_TAB_KEYS.map(f => ({ ...f, label: t('stats', f.key) })), [language]);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => { const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width)); return () => sub?.remove(); }, []);
  const isTablet = screenWidth >= 600;
  const modalChartWidth = isTablet ? Math.floor((Math.min(screenWidth, 960) - 112) / 2) : screenWidth - 64;
  const modalChartHeight = isTablet ? 190 : 160;
  const modalBarChartHeight = isTablet ? 160 : 140;

  const [timeFilter, setTimeFilter] = useState<TimeFilter>(() => { const valid: TimeFilter[] = ['today', 'week', 'month', '3months', '6months', 'year', 'all']; if (timeFilterParam && valid.includes(timeFilterParam as TimeFilter)) return timeFilterParam as TimeFilter; return 'all'; });
  const [category, setCategory] = useState<StatsCategory>('performance');
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [progressionFilter, setProgressionFilter] = useState<ProgressionFilter>('8weeks');
  const [chartTooltip, setChartTooltip] = useState<{ chart: string; index: number } | null>(null);

  // ── Item filter (extracted hook) ───────────────────────
  const timeFilteredMatches = filterByTime(matches, timeFilter).filter(m => contextFilter === 'all' ? true : contextFilter === 'tournament' ? m.mode === 'Tournoi' : m.mode === 'Entraînement');
  const timeFilteredChallenges = filterByTime(challenges, timeFilter);

  const {
    itemFilterType, filteredMatches, filteredChallenges, activeFilterLabel,
    showItemPickerModal, setShowItemPickerModal, itemPickerType, itemPickerSearch, setItemPickerSearch,
    selectedMatchId, selectedChallengeId, selectedTournamentId, selectedOpponentId, selectedPartnerId, selectedTerrainId, selectedBoulesSetId,
    clearItemFilter, openItemPicker,
    selectMatch, selectChallenge, selectTournament, selectOpponent, selectPartner, selectTerrain, selectBoulesSet,
  } = useItemFilter({
    timeFilteredMatches, timeFilteredChallenges,
    matches, challenges, tournaments, players, terrains, boulesSets,
    language, t,
  });

  // ── Stats hooks ────────────────────────────────────────
  const performanceStats = usePerformanceStats(filteredMatches);
  const tirStats = useTirStats(filteredMatches, filteredChallenges, performanceStats.totalMenes);
  const pointStats = usePointStats(filteredMatches, performanceStats.totalMenes);
  const errorStats = useErrorStats(filteredMatches, tirStats, pointStats, t);
  const boulesSetStats = useBoulesSetStats(filteredMatches, filteredChallenges, boulesSets);
  const terrainTypeStats = useTerrainTypeStats(filteredMatches, tournaments);
  const precisionWorkshopStats = usePrecisionWorkshopStats(filteredChallenges);
  const progressionData = useProgressionData(matches, progressionFilter);
  const trends = useTrends(progressionData);
  const challengeProgressionData = useChallengeProgressionData(challenges, progressionFilter);
  const tournamentProgressionData = useTournamentProgressionData(tournaments, matches);

  const hasData = performanceStats.total > 0 || filteredChallenges.length > 0;
  const formatDuration = (minutes: number) => { if (minutes < 60) return `${minutes}min`; const hours = Math.floor(minutes / 60); const mins = minutes % 60; return mins > 0 ? `${hours}h${mins}` : `${hours}h`; };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.headerGradient, { backgroundColor: '#0F172A' }]}>
          <View style={styles.headerDecoCircle1} />
          <View style={styles.headerDecoCircle2} />
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{t('stats', 'statistics')}</Text>
              <Text style={styles.headerSubtitle}>{performanceStats.total} {t('stats', 'matches')} • {performanceStats.winRate}% {t('stats', 'victories')}</Text>
            </View>
            <View style={styles.headerButtons}>
              <Pressable style={styles.progressionButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/role-performance' as any); }}>
                <MaterialIcons name="swap-horiz" size={18} color="#FFF" />
              </Pressable>
              <Pressable style={styles.progressionButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowProgressionModal(true); }}>
                <MaterialIcons name="trending-up" size={18} color="#FFF" />
              </Pressable>
              <Pressable style={styles.historyButton} onPress={() => router.push('/history')}>
                <MaterialIcons name="history" size={22} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
          </View>
          <View style={styles.headerStatsRow}>
            {[{ val: `${performanceStats.winRate}%`, lbl: t('stats', 'victoriesLabel'), color: '#60A5FA' }, { val: `${tirStats.successRate}%`, lbl: t('stats', 'shotShort'), color: '#93C5FD' }, { val: `${pointStats.successRate}%`, lbl: t('stats', 'pointShort'), color: '#86EFAC' }, { val: `${tirStats.carreauRate}%`, lbl: t('stats', 'carreauxLabel'), color: '#FDE68A' }, { val: pointStats.successQualitiesTotal > 0 ? `${Math.round((pointStats.pointDevantBoule / pointStats.successQualitiesTotal) * 100)}%` : '-', lbl: t('leaderboard', 'devantBouleShort'), color: '#C4B5FD' }].map((s, i) => (<React.Fragment key={i}>{i > 0 ? <View style={styles.headerStatDivider} /> : null}<View style={styles.headerStatItem}><Text style={[styles.headerStatValue, { color: s.color }]}>{s.val}</Text><Text style={styles.headerStatLabel}>{s.lbl}</Text></View></React.Fragment>))}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {TIME_FILTERS.map(filter => (<Pressable key={filter.id} style={[styles.filterPill, timeFilter === filter.id && styles.filterPillActive]} onPress={() => { Haptics.selectionAsync(); setTimeFilter(filter.id); }}><Text style={[styles.filterPillText, timeFilter === filter.id && styles.filterPillTextActive]}>{filter.label}</Text></Pressable>))}
        </ScrollView>

        {/* Context filter */}
        <View style={styles.contextFilterBar}>
          {([{ id: 'all' as ContextFilter, label: t('common', 'all'), icon: 'select-all' }, { id: 'training' as ContextFilter, label: language === 'fr' ? 'Match Entrainement' : 'Training Match', icon: 'fitness-center' }, { id: 'tournament' as ContextFilter, label: language === 'fr' ? 'Match Tournois' : 'Tournament Match', icon: 'emoji-events' }] as const).map(cf => (
            <Pressable key={cf.id} style={[styles.contextPill, contextFilter === cf.id && styles.contextPillActive]} onPress={() => { Haptics.selectionAsync(); setContextFilter(cf.id); }}>
              <MaterialIcons name={cf.icon as any} size={13} color={contextFilter === cf.id ? '#FFF' : theme.textSecondary} />
              <Text style={[styles.contextPillText, contextFilter === cf.id && styles.contextPillTextActive]}>{cf.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.itemFilterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemFilterScroll}>
            {[{ type: 'all' as const, icon: 'select-all' as const, style: undefined, label: t('profile', 'statsFilterAll') }, { type: 'match' as const, icon: 'sports' as const, style: styles.itemFilterChipMatch, label: t('profile', 'statsFilterMatch') }, { type: 'challenge' as const, icon: 'flag' as const, style: styles.itemFilterChipChallenge, label: t('profile', 'statsFilterChallenge') }, { type: 'tournament' as const, icon: 'emoji-events' as const, style: styles.itemFilterChipTournament, label: t('profile', 'statsFilterTournament') }, { type: 'opponent' as const, icon: 'people' as const, style: styles.itemFilterChipOpponent, label: t('profile', 'statsFilterOpponent') }, { type: 'partner' as const, icon: 'group' as const, style: styles.itemFilterChipPartner, label: t('profile', 'statsFilterPartner') }, { type: 'terrain' as const, icon: 'sports-soccer' as const, style: styles.itemFilterChipTerrain, label: t('profile', 'statsFilterTerrain') }, { type: 'boules' as const, icon: 'sports-baseball' as const, style: styles.itemFilterChipBoules, label: t('profile', 'statsFilterBoules') }].map(chip => (
              <Pressable key={chip.type} style={[styles.itemFilterChip, chip.type === 'all' ? (itemFilterType !== 'all' ? styles.itemFilterChipInactive : undefined) : (itemFilterType === chip.type ? chip.style : styles.itemFilterChipInactive)]} onPress={() => { Haptics.selectionAsync(); chip.type === 'all' ? clearItemFilter() : openItemPicker(chip.type as any); }}>
                <MaterialIcons name={chip.icon} size={14} color={(chip.type === 'all' ? itemFilterType === 'all' : itemFilterType === chip.type) ? '#FFF' : theme.textSecondary} />
                <Text style={[styles.itemFilterChipText, (chip.type === 'all' ? itemFilterType !== 'all' : itemFilterType !== chip.type) && styles.itemFilterChipTextInactive]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {activeFilterLabel ? (
          <View style={styles.activeFilterBanner}>
            <MaterialIcons name={itemFilterType === 'match' ? 'sports' : itemFilterType === 'challenge' ? 'flag' : itemFilterType === 'opponent' ? 'people' : itemFilterType === 'partner' ? 'group' : itemFilterType === 'terrain' ? 'sports-soccer' : itemFilterType === 'boules' ? 'sports-baseball' : 'emoji-events'} size={14} color={itemFilterType === 'match' ? theme.tirColor : itemFilterType === 'challenge' ? theme.accent : itemFilterType === 'opponent' ? theme.pointColor : itemFilterType === 'partner' ? theme.success : itemFilterType === 'terrain' ? '#8B5CF6' : itemFilterType === 'boules' ? '#D97706' : theme.carreauColor} />
            <Text style={styles.activeFilterText} numberOfLines={1}>{activeFilterLabel}</Text>
            <Pressable style={styles.activeFilterClear} onPress={clearItemFilter}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
          </View>
        ) : null}

        <View style={styles.categoryTabs}>
          {CATEGORY_TABS.map(tab => { const isActive = category === tab.id; return (
            <Pressable key={tab.id} style={[styles.categoryTab, isActive && [styles.categoryTabActive, { backgroundColor: tab.color + '12', borderColor: tab.color + '30' }]]} onPress={() => { Haptics.selectionAsync(); setCategory(tab.id); }}>
              <View style={[styles.categoryTabIconBg, isActive && { backgroundColor: tab.color + '18' }]}><MaterialIcons name={tab.icon as any} size={16} color={isActive ? tab.color : theme.textMuted} /></View>
              <Text style={[styles.categoryTabText, isActive && [styles.categoryTabTextActive, { color: tab.color }]]}>{tab.label}</Text>
              {isActive ? <View style={[styles.categoryTabDot, { backgroundColor: tab.color }]} /> : null}
            </Pressable>
          ); })}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }, isTablet && styles.scrollContentTablet]} showsVerticalScrollIndicator={false}>

        {!hasData ? (
          <View style={styles.emptyState}>
            <Image source={require('@/assets/images/empty-stats.png')} style={styles.emptyImage} contentFit="contain" />
            <Text style={styles.emptyTitle}>{t('stats','noStatsYet')}</Text>
            <Text style={styles.emptyText}>{t('stats','playToSee')}</Text>
            <Pressable style={styles.emptyButton} onPress={() => router.push('/match/new')}><MaterialIcons name="sports" size={18} color="#FFF" /><Text style={styles.emptyButtonText}>{t('stats','newMatch')}</Text></Pressable>
          </View>
        ) : (
          <>
            {category === 'performance' ? <PerformanceSection t={t} language={language} isTablet={isTablet} performanceStats={performanceStats} tirStats={tirStats} pointStats={pointStats} terrainTypeStats={terrainTypeStats} boulesSetStats={boulesSetStats} filteredChallenges={filteredChallenges} itemFilterType={itemFilterType} formatDuration={formatDuration} selectBoulesSet={selectBoulesSet} /> : null}
            {category === 'tir' ? <TirSection t={t} isTablet={isTablet} tirStats={tirStats} terrainTypeStats={terrainTypeStats} precisionWorkshopStats={precisionWorkshopStats} /> : null}
            {category === 'point' ? <PointSection t={t} isTablet={isTablet} pointStats={pointStats} terrainTypeStats={terrainTypeStats} filteredChallenges={filteredChallenges} itemFilterType={itemFilterType} /> : null}
            {category === 'errors' ? <ErrorsSection t={t} isTablet={isTablet} errorStats={errorStats} tirStats={tirStats} terrainTypeStats={terrainTypeStats} /> : null}
          </>
        )}
      </ScrollView>

      <ProgressionModal visible={showProgressionModal} onClose={() => setShowProgressionModal(false)} isTablet={isTablet} modalChartWidth={modalChartWidth} modalChartHeight={modalChartHeight} modalBarChartHeight={modalBarChartHeight} progressionFilter={progressionFilter} setProgressionFilter={setProgressionFilter} chartTooltip={chartTooltip} setChartTooltip={setChartTooltip} performanceStats={performanceStats} tirStats={tirStats} pointStats={pointStats} progressionData={progressionData} trends={trends} challengeProgressionData={challengeProgressionData} tournamentProgressionData={tournamentProgressionData} progressionFilters={PROGRESSION_FILTERS} t={t} />
      <ItemPickerModal visible={showItemPickerModal} onClose={() => setShowItemPickerModal(false)} itemPickerType={itemPickerType} itemPickerSearch={itemPickerSearch} setItemPickerSearch={setItemPickerSearch} timeFilteredMatches={timeFilteredMatches} timeFilteredChallenges={timeFilteredChallenges} tournaments={tournaments} players={players} terrains={terrains} boulesSets={boulesSets} selfPlayer={selfPlayer} selectedMatchId={selectedMatchId} selectedChallengeId={selectedChallengeId} selectedTournamentId={selectedTournamentId} selectedOpponentId={selectedOpponentId} selectedPartnerId={selectedPartnerId} selectedTerrainId={selectedTerrainId} selectedBoulesSetId={selectedBoulesSetId} selectMatch={selectMatch} selectChallenge={selectChallenge} selectTournament={selectTournament} selectOpponent={selectOpponent} selectPartner={selectPartner} selectTerrain={selectTerrain} selectBoulesSet={selectBoulesSet} t={t} language={language} />
    </SafeAreaView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F8FAFC'},
  header:{backgroundColor:theme.surface,borderBottomWidth:0,paddingBottom:12},
  headerGradient:{paddingTop:16,paddingBottom:28,paddingHorizontal:20,borderBottomLeftRadius:24,borderBottomRightRadius:24,overflow:'hidden' as const,position:'relative' as const},
  headerDecoCircle1:{position:'absolute' as const,top:-40,right:-30,width:140,height:140,borderRadius:70,backgroundColor:'rgba(255,255,255,0.04)'},
  headerDecoCircle2:{position:'absolute' as const,bottom:-20,left:-20,width:100,height:100,borderRadius:50,backgroundColor:'rgba(255,255,255,0.03)'},
  headerTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18},
  headerTitle:{fontSize:26,fontWeight:'800',color:'#FFF',letterSpacing:-0.3},
  headerSubtitle:{fontSize:13,color:'rgba(255,255,255,0.6)',marginTop:3,fontWeight:'500'},
  headerButtons:{flexDirection:'row',alignItems:'center',gap:8},
  progressionButtonText:{fontSize:11,fontWeight:'700' as const,color:'rgba(255,255,255,0.8)'},
  progressionButton:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center' as const,justifyContent:'center' as const,borderWidth:1,borderColor:'rgba(255,255,255,0.1)'},
  historyButton:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(255,255,255,0.08)',alignItems:'center' as const,justifyContent:'center' as const,borderWidth:1,borderColor:'rgba(255,255,255,0.1)',position:'relative' as const},
  headerStatsRow:{flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,255,255,0.08)',borderRadius:16,paddingVertical:14,paddingHorizontal:10,borderWidth:1,borderColor:'rgba(255,255,255,0.08)'},
  headerStatItem:{flex:1,alignItems:'center' as const},
  headerStatValue:{fontSize:17,fontWeight:'800',color:'#FFF'},
  headerStatLabel:{fontSize:8,fontWeight:'700',color:'rgba(255,255,255,0.5)',marginTop:3,textTransform:'uppercase' as const,letterSpacing:0.5},
  headerStatDivider:{width:1,height:28,backgroundColor:'rgba(255,255,255,0.1)'},
  filterBar:{paddingHorizontal:16,gap:8,marginTop:12,marginBottom:8},
  itemFilterBar: { marginBottom: 8 },
  itemFilterScroll: { paddingHorizontal: 16, gap: 6 },
  itemFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: theme.primary },
  itemFilterChipInactive: { backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  itemFilterChipMatch: { backgroundColor: theme.tirColor },
  itemFilterChipChallenge: { backgroundColor: theme.accent },
  itemFilterChipTournament: { backgroundColor: theme.carreauColor },
  itemFilterChipOpponent: { backgroundColor: theme.pointColor },
  itemFilterChipPartner: { backgroundColor: theme.success },
  itemFilterChipTerrain: { backgroundColor: '#8B5CF6' },
  itemFilterChipBoules: { backgroundColor: '#D97706' },
  itemFilterChipText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  itemFilterChipTextInactive: { color: theme.textSecondary },
  activeFilterBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.border },
  activeFilterText: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.textPrimary },
  activeFilterClear: { padding: 4 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.borderRadius.full, backgroundColor: theme.backgroundSecondary },
  filterPillActive: { backgroundColor: theme.primary },
  filterPillText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  filterPillTextActive: { color: '#FFF' },
  categoryTabs:{flexDirection:'row',paddingHorizontal:12,gap:6,marginTop:6},
  categoryTab:{flex:1,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,paddingVertical:12,paddingHorizontal:4,borderRadius:16,backgroundColor:'#F1F5F9',borderWidth:1.5,borderColor:'transparent'},
  categoryTabActive:{...theme.shadows.card},
  categoryTabIconBg:{width:30,height:30,borderRadius:10,alignItems:'center' as const,justifyContent:'center' as const,backgroundColor:'transparent'},
  categoryTabText:{fontSize:10,fontWeight:'600',color:theme.textMuted,letterSpacing:0.2},
  categoryTabTextActive:{fontWeight:'800'},
  categoryTabDot:{width:4,height:4,borderRadius:2,marginTop:-2},
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  contextFilterBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  contextPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  contextPillActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  contextPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  contextPillTextActive: { color: '#FFF' },
  emptyState:{alignItems:'center',paddingVertical:40},
  emptyImage:{width:160,height:160,marginBottom:8},
  emptyTitle:{fontSize:20,fontWeight:'700',color:theme.textPrimary,marginTop:8},
  emptyText:{fontSize:14,color:theme.textSecondary,textAlign:'center',marginTop:8,marginBottom:24,maxWidth:280,lineHeight:21},
  emptyButton:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:theme.primary,paddingHorizontal:28,paddingVertical:16,borderRadius:16},
  emptyButtonText:{fontSize:15,fontWeight:'700',color:'#FFF'},
});
