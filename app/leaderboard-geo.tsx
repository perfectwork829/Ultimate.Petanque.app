import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchGeoLeaderboard, GeoEntry } from '@/services/geoLeaderboardService';
import { getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';

type GeoTab = 'cities' | 'countries' | 'continents';
type SortKey = 'composite' | 'avgElo' | 'avgWinRate' | 'playerCount' | 'totalMatches' | 'avgTrustScore';

const TAB_CONFIG: { id: GeoTab; icon: string; color: string }[] = [
  { id: 'cities', icon: 'location-city', color: '#3B82F6' },
  { id: 'countries', icon: 'flag', color: '#10B981' },
  { id: 'continents', icon: 'public', color: '#F59E0B' },
];

const SORT_OPTIONS: { id: SortKey; icon: string }[] = [
  { id: 'composite', icon: 'auto-awesome' },
  { id: 'avgElo', icon: 'diamond' },
  { id: 'avgWinRate', icon: 'emoji-events' },
  { id: 'avgTrustScore', icon: 'verified-user' },
  { id: 'playerCount', icon: 'people' },
  { id: 'totalMatches', icon: 'sports' },
];

function MedalBadge({ rank }: { rank: number }) {
  if (rank > 3) return null;
  const colors = ['#F59E0B', '#94A3B8', '#CD7F32'];
  return (
    <View style={[styles.medalBadge, { backgroundColor: colors[rank - 1] + '20' }]}>
      <MaterialIcons name="emoji-events" size={14} color={colors[rank - 1]} />
    </View>
  );
}

function GeoCard({ entry, rank, tab, isFr, sortKey }: { entry: GeoEntry; rank: number; tab: GeoTab; isFr: boolean; sortKey: SortKey }) {
  const isTop3 = rank <= 3;
  const borderColors = ['#F59E0B', '#94A3B8', '#CD7F32'];

  const flag = tab === 'countries'
    ? getCountryFlag(entry.key)
    : tab === 'continents'
      ? getContinentFlag(entry.key)
      : null;
  
  const displayLabel = tab === 'continents'
    ? getContinentLabel(entry.key, isFr)
    : entry.label;

  // Highlight the active sort metric
  const highlightedValue = sortKey === 'avgElo' ? `${entry.avgElo}`
    : sortKey === 'avgWinRate' ? `${entry.avgWinRate}%`
    : sortKey === 'avgTrustScore' ? `${entry.avgTrustScore}`
    : sortKey === 'playerCount' ? `${entry.playerCount}`
    : sortKey === 'totalMatches' ? `${entry.totalMatches}`
    : null;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(rank * 30, 300))}>
      <Pressable style={[
        styles.card,
        isTop3 && { borderLeftWidth: 3, borderLeftColor: borderColors[rank - 1] },
      ]} onPress={() => {
        router.push({ pathname: '/city-leaderboard', params: { type: tab === 'cities' ? 'city' : tab === 'countries' ? 'country' : 'continent', value: entry.key, city: tab === 'cities' ? entry.key : undefined } } as any);
      }}>
        <View style={styles.cardLeft}>
          <View style={styles.rankBox}>
            {isTop3 ? <MedalBadge rank={rank} /> : (
              <Text style={styles.rankText}>{rank}</Text>
            )}
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              {flag ? <Text style={styles.cardFlag}>{flag}</Text> : null}
              <Text style={styles.cardName} numberOfLines={1}>{displayLabel}</Text>
            </View>
            <View style={styles.cardMetaRow}>
              <View style={styles.cardMetaItem}>
                <MaterialIcons name="people" size={12} color={theme.textMuted} />
                <Text style={styles.cardMetaText}>
                  {entry.playerCount} {isFr ? 'joueur' : 'player'}{entry.playerCount > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.cardMetaDot} />
              <View style={styles.cardMetaItem}>
                <MaterialIcons name="sports" size={12} color={theme.textMuted} />
                <Text style={styles.cardMetaText}>{entry.totalMatches} {isFr ? 'matchs' : 'games'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statPill, sortKey === 'avgElo' && styles.statPillHighlight]}>
            <Text style={styles.statPillLabel}>ELO</Text>
            <Text style={[styles.statPillValue, { color: '#8B5CF6' }]}>{entry.avgElo}</Text>
          </View>
          <View style={[styles.statPill, sortKey === 'avgWinRate' && styles.statPillHighlight]}>
            <Text style={styles.statPillLabel}>{isFr ? 'Vict.' : 'Win'}</Text>
            <Text style={[styles.statPillValue, { color: theme.success }]}>{entry.avgWinRate}%</Text>
          </View>
          {sortKey === 'avgTrustScore' ? (
            <View style={[styles.statPill, styles.statPillHighlight]}>
              <Text style={styles.statPillLabel}>Trust</Text>
              <Text style={[styles.statPillValue, { color: entry.avgTrustScore >= 65 ? '#22C55E' : entry.avgTrustScore >= 45 ? '#D97706' : '#EF4444' }]}>{entry.avgTrustScore}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.topPlayerRow}>
        {entry.topPlayer ? (
          <>
            <MaterialIcons name="star" size={12} color="#F59E0B" />
            <Text style={styles.topPlayerText}>
              {isFr ? 'Meilleur' : 'Best'}: {entry.topPlayer.name} ({entry.topPlayer.elo} ELO)
            </Text>
          </>
        ) : null}
        {tab === 'cities' ? (
          <Pressable
            style={styles.clubRankBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({ pathname: '/club-city-ranking', params: { city: entry.key } } as any);
            }}
            hitSlop={6}
          >
            <MaterialIcons name="home" size={11} color="#F59E0B" />
            <Text style={styles.clubRankBtnText}>{isFr ? 'Clubs' : 'Clubs'}</Text>
          </Pressable>
        ) : tab === 'countries' ? (
          <Pressable
            style={styles.clubRankBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({ pathname: '/club-city-ranking', params: { country: entry.key } } as any);
            }}
            hitSlop={6}
          >
            <MaterialIcons name="home" size={11} color="#F59E0B" />
            <Text style={styles.clubRankBtnText}>{isFr ? 'Clubs' : 'Clubs'}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function GeoLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<GeoTab>(() => {
    const valid: GeoTab[] = ['cities', 'countries', 'continents'];
    if (params.tab && valid.includes(params.tab as GeoTab)) return params.tab as GeoTab;
    return 'cities';
  });
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cities, setCities] = useState<GeoEntry[]>([]);
  const [countries, setCountries] = useState<GeoEntry[]>([]);
  const [continents, setContinents] = useState<GeoEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchGeoLeaderboard();
      if (result.error) {
        setError(result.error);
      } else {
        setCities(result.cities);
        setCountries(result.countries);
        setContinents(result.continents);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset search when switching tabs
  useEffect(() => { setSearchQuery(''); }, [tab]);

  const rawData = useMemo(() => {
    switch (tab) {
      case 'cities': return cities;
      case 'countries': return countries;
      case 'continents': return continents;
    }
  }, [tab, cities, countries, continents]);

  // Filter by search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return rawData;
    const q = searchQuery.toLowerCase();
    return rawData.filter(entry => {
      const label = tab === 'continents' ? getContinentLabel(entry.key, isFr) : entry.label;
      return label.toLowerCase().includes(q) || entry.key.toLowerCase().includes(q);
    });
  }, [rawData, searchQuery, tab, isFr]);

  // Sort
  const currentData = useMemo(() => {
    const sorted = [...filteredData];
    switch (sortKey) {
      case 'avgElo':
        return sorted.sort((a, b) => b.avgElo - a.avgElo);
      case 'avgWinRate':
        return sorted.sort((a, b) => b.avgWinRate - a.avgWinRate);
      case 'playerCount':
        return sorted.sort((a, b) => b.playerCount - a.playerCount);
      case 'totalMatches':
        return sorted.sort((a, b) => b.totalMatches - a.totalMatches);
      case 'avgTrustScore':
        return sorted.sort((a, b) => b.avgTrustScore - a.avgTrustScore);
      case 'composite':
      default:
        return sorted.sort((a, b) => (b.playerCount * b.avgElo) - (a.playerCount * a.avgElo));
    }
  }, [filteredData, sortKey]);

  const totalPlayers = useMemo(() => {
    return countries.reduce((sum, c) => sum + c.playerCount, 0);
  }, [countries]);

  const tabLabels: Record<GeoTab, string> = {
    cities: isFr ? 'Villes' : 'Cities',
    countries: isFr ? 'Pays' : 'Countries',
    continents: isFr ? 'Continents' : 'Continents',
  };

  const sortLabels: Record<SortKey, string> = {
    composite: isFr ? 'Score' : 'Score',
    avgElo: 'ELO',
    avgWinRate: isFr ? 'Victoires' : 'Win Rate',
    avgTrustScore: 'TrustScore',
    playerCount: isFr ? 'Joueurs' : 'Players',
    totalMatches: isFr ? 'Matchs' : 'Games',
  };

  const renderItem = useCallback(({ item, index }: { item: GeoEntry; index: number }) => (
    <GeoCard entry={item} rank={index + 1} tab={tab} isFr={isFr} sortKey={sortKey} />
  ), [tab, isFr, sortKey]);

  const keyExtractor = useCallback((item: GeoEntry) => `${tab}-${item.key}`, [tab]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {isFr ? 'Classement Geographique' : 'Geographic Ranking'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {totalPlayers} {isFr ? 'joueurs publics' : 'public players'}
          </Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TAB_CONFIG.map(t => {
          const isActive = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setTab(t.id)}
            >
              <MaterialIcons
                name={t.icon as any}
                size={18}
                color={isActive ? t.color : theme.textMuted}
              />
              <Text style={[
                styles.tabLabel,
                isActive && { color: t.color, fontWeight: '700' },
              ]}>
                {tabLabels[t.id]}
              </Text>
              {isActive ? <View style={[styles.tabIndicator, { backgroundColor: t.color }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={
            tab === 'cities' ? (isFr ? 'Rechercher une ville...' : 'Search a city...')
            : tab === 'countries' ? (isFr ? 'Rechercher un pays...' : 'Search a country...')
            : (isFr ? 'Rechercher un continent...' : 'Search a continent...')
          }
          placeholderTextColor={theme.textMuted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Sort Options */}
      <View style={styles.sortBarOuter}>
        <Text style={styles.sortLabel}>{isFr ? 'Trier :' : 'Sort:'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortBarScroll}>
          {SORT_OPTIONS.map(opt => {
            const isActive = sortKey === opt.id;
            const tabColor = TAB_CONFIG.find(t => t.id === tab)?.color || theme.primary;
            return (
              <Pressable
                key={opt.id}
                style={[styles.sortChip, isActive && { backgroundColor: tabColor + '18', borderColor: tabColor + '40' }]}
                onPress={() => setSortKey(opt.id)}
              >
                <MaterialIcons name={opt.icon as any} size={13} color={isActive ? tabColor : theme.textMuted} />
                <Text style={[styles.sortChipText, isActive && { color: tabColor, fontWeight: '700' }]}>
                  {sortLabels[opt.id]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>{isFr ? 'Chargement...' : 'Loading...'}</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="error-outline" size={48} color={theme.error} />
          <Text style={styles.emptyTitle}>{isFr ? 'Erreur' : 'Error'}</Text>
          <Text style={styles.emptyDesc}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadData()}>
            <Text style={styles.retryBtnText}>{isFr ? 'Reessayer' : 'Retry'}</Text>
          </Pressable>
        </View>
      ) : currentData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="public" size={56} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? (isFr ? 'Aucun resultat' : 'No results') : (isFr ? 'Aucune donnee' : 'No data')}
          </Text>
          <Text style={styles.emptyDesc}>
            {searchQuery
              ? (isFr ? `Aucun resultat pour "${searchQuery}"` : `No results for "${searchQuery}"`)
              : tab === 'cities'
                ? (isFr ? 'Les joueurs publics avec une localisation apparaitront ici' : 'Public players with a location will appear here')
                : (isFr ? 'Les joueurs publics apparaitront ici' : 'Public players will appear here')
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <Animated.View entering={FadeIn.duration(300)} style={styles.listHeader}>
              <View style={styles.listHeaderIcon}>
                <MaterialIcons
                  name={TAB_CONFIG.find(t => t.id === tab)?.icon as any || 'public'}
                  size={16}
                  color={TAB_CONFIG.find(t => t.id === tab)?.color || theme.primary}
                />
              </View>
              <Text style={styles.listHeaderText}>
                {currentData.length} {tabLabels[tab].toLowerCase()} {isFr ? 'classees' : 'ranked'}
                {searchQuery ? ` (${isFr ? 'filtre' : 'filtered'})` : ''}
              </Text>
            </Animated.View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 2 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border, paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4, position: 'relative',
  },
  tabItemActive: {},
  tabLabel: { fontSize: 12, fontWeight: '500', color: theme.textMuted },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%',
    height: 3, borderRadius: 1.5,
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.surface, marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: theme.textPrimary, padding: 0,
  },

  // Sort
  sortBarOuter: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 16, paddingVertical: 10,
  },
  sortBarScroll: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: 16,
  },
  sortLabel: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginRight: 8 },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  sortChipText: { fontSize: 11, fontWeight: '500', color: theme.textSecondary },

  // Content
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: theme.textMuted },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: theme.borderRadius.md, marginTop: 8,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4,
  },
  listHeaderIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center',
  },
  listHeaderText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 14, marginBottom: 2, ...theme.shadows.card,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardRight: { flexDirection: 'row', gap: 8 },
  rankBox: { width: 32, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
  medalBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 4 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardFlag: { fontSize: 16 },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardMetaText: { fontSize: 11, color: theme.textMuted },
  cardMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted },

  // Stat pills
  statPill: {
    alignItems: 'center', backgroundColor: theme.backgroundSecondary,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'transparent',
  },
  statPillHighlight: {
    borderColor: theme.primary + '30',
    backgroundColor: theme.primary + '08',
  },
  statPillLabel: { fontSize: 9, fontWeight: '600', color: theme.textMuted, letterSpacing: 0.5 },
  statPillValue: { fontSize: 13, fontWeight: '700' },

  // Top player
  topPlayerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 58, paddingBottom: 10,
  },
  topPlayerText: { fontSize: 11, color: theme.textMuted, fontStyle: 'italic', flex: 1 },
  clubRankBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F59E0B12', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B25',
  },
  clubRankBtnText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
});
