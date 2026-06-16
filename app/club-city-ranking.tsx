/**
 * Club City Ranking Page
 * Shows clubs ranked within a specific city by composite score.
 * Accessible from geo leaderboard and player profile.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator,
  TextInput, ScrollView, Modal, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchClubLeaderboard, sortClubLeaderboard, LeaderboardClub, ClubLeaderboardSort } from '@/services/clubLeaderboardService';
import { getContinent, getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';

type GeoFilter = 'all' | 'city' | 'country' | 'continent';

export default function ClubCityRankingScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const params = useLocalSearchParams<{ city?: string; country?: string; continent?: string }>();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const [allClubs, setAllClubs] = useState<LeaderboardClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<ClubLeaderboardSort>('compositeScore');
  const [search, setSearch] = useState('');
  const [geoFilter, setGeoFilter] = useState<GeoFilter>(() => {
    if (params.city) return 'city';
    if (params.country) return 'country';
    if (params.continent) return 'continent';
    return 'all';
  });
  const [geoValue, setGeoValue] = useState(() => params.city || params.country || params.continent || '');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const { clubs, error } = await fetchClubLeaderboard();
    setAllClubs(clubs);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const uniqueCities = useMemo(() => {
    const cs = allClubs.map(c => c.city).filter(Boolean) as string[];
    return [...new Set(cs)].sort();
  }, [allClubs]);

  const uniqueCountries = useMemo(() => {
    const cs = allClubs.map(c => c.country || 'France').filter(Boolean) as string[];
    return [...new Set(cs)].sort();
  }, [allClubs]);

  const uniqueContinents = useMemo(() => {
    const cs = allClubs.map(c => getContinent(c.country || 'France')).filter(Boolean) as string[];
    return [...new Set(cs)].sort();
  }, [allClubs]);

  const filteredClubs = useMemo(() => {
    let result = allClubs;
    if (geoFilter === 'city' && geoValue) {
      result = result.filter(c => c.city?.toLowerCase() === geoValue.toLowerCase());
    } else if (geoFilter === 'country' && geoValue) {
      result = result.filter(c => (c.country || 'France').toLowerCase() === geoValue.toLowerCase());
    } else if (geoFilter === 'continent' && geoValue) {
      result = result.filter(c => getContinent(c.country || 'France') === geoValue);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q));
    }
    return sortClubLeaderboard(result, sortBy);
  }, [allClubs, geoFilter, geoValue, search, sortBy]);

  const availableValues = useMemo(() => {
    if (geoFilter === 'city') return uniqueCities;
    if (geoFilter === 'country') return uniqueCountries;
    if (geoFilter === 'continent') return uniqueContinents;
    return [];
  }, [geoFilter, uniqueCities, uniqueCountries, uniqueContinents]);

  const filteredPickerValues = useMemo(() => {
    if (!citySearch.trim()) return availableValues;
    const q = citySearch.toLowerCase().trim();
    return availableValues.filter(v => {
      if (geoFilter === 'continent') return getContinentLabel(v, isFr).toLowerCase().includes(q);
      return v.toLowerCase().includes(q);
    });
  }, [availableValues, citySearch, geoFilter, isFr]);

  const pageTitle = useMemo(() => {
    if (geoFilter === 'city' && geoValue) return `${isFr ? 'Clubs de' : 'Clubs in'} ${geoValue}`;
    if (geoFilter === 'country' && geoValue) return `${isFr ? 'Clubs' : 'Clubs'} ${getCountryFlag(geoValue)} ${geoValue}`;
    if (geoFilter === 'continent' && geoValue) return `${isFr ? 'Clubs' : 'Clubs'} ${getContinentFlag(geoValue)} ${getContinentLabel(geoValue, isFr)}`;
    return isFr ? 'Classement des Clubs' : 'Club Rankings';
  }, [geoFilter, geoValue, isFr]);

  const renderClub = useCallback(({ item, index }: { item: LeaderboardClub; index: number }) => {
    const rank = index + 1;
    const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
    const mc = medalColors[rank];

    return (
      <Animated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 400))}>
        <Pressable
          style={[cs.clubCard, rank <= 3 && { borderLeftWidth: 3, borderLeftColor: mc }]}
          onPress={() => router.push({ pathname: `/club-ranking/${item.id}`, params: { name: item.name } } as any)}
        >
          <View style={cs.clubHeader}>
            <View style={cs.rankCol}>
              {mc ? (
                <View style={[cs.medal, { backgroundColor: mc + '20' }]}>
                  <Text style={[cs.medalText, { color: mc }]}>{rank}</Text>
                </View>
              ) : (
                <Text style={cs.rankText}>{rank}</Text>
              )}
            </View>
            <View style={cs.clubLogoWrap}>
              {item.logo ? (
                <Image source={{ uri: item.logo }} style={cs.clubLogo} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
              ) : (
                <View style={[cs.clubLogo, { backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}>
                  <MaterialIcons name="home" size={18} color="#F59E0B" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.clubName} numberOfLines={1}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {item.city ? <Text style={cs.clubCity} numberOfLines={1}>{item.city}</Text> : null}
                {item.country ? <Text style={{ fontSize: 12 }}>{getCountryFlag(item.country)}</Text> : null}
              </View>
            </View>
            <View style={cs.scoreBadge}>
              <Text style={cs.scoreValue}>{item.stats.compositeScore}</Text>
              <Text style={cs.scoreLabel}>Score</Text>
            </View>
          </View>

          <View style={cs.statsRow}>
            <View style={cs.statBlock}>
              <Text style={[cs.statValue, sortBy === 'avgWinRate' && { color: '#D97706', fontWeight: '800' }]}>{item.stats.avgWinRate}%</Text>
              <Text style={cs.statLabel}>{isFr ? 'Vict.' : 'Win'}</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={cs.statValue}>{item.playerCount}</Text>
              <Text style={cs.statLabel}>{isFr ? 'Joueurs' : 'Players'}</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={cs.statValue}>{item.totalMatches}</Text>
              <Text style={cs.statLabel}>{isFr ? 'Matchs' : 'Games'}</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={[cs.statValue, sortBy === 'avgTirRate' && { color: theme.accent, fontWeight: '800' }]}>{item.stats.avgTirRate > 0 ? `${item.stats.avgTirRate}%` : '-'}</Text>
              <Text style={cs.statLabel}>Tir</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={cs.statValue}>{item.stats.avgCarreauRate > 0 ? `${item.stats.avgCarreauRate}%` : '-'}</Text>
              <Text style={cs.statLabel}>Car.</Text>
            </View>
          </View>

          {item.topPlayers.length > 0 ? (
            <View style={cs.topPlayersRow}>
              {item.topPlayers.map((tp, i) => (
                <View key={i} style={cs.topPlayerChip}>
                  {tp.avatar ? (
                    <Image source={{ uri: tp.avatar }} style={cs.topPlayerAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                  ) : (
                    <View style={[cs.topPlayerAvatar, { backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 8, fontWeight: '700', color: theme.primary }}>{tp.name.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={cs.topPlayerName} numberOfLines={1}>{tp.name.split(' ')[0]}</Text>
                  <Text style={cs.topPlayerStat}>{tp.winRate}%</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }, [sortBy, isFr]);

  return (
    <SafeAreaView edges={['top']} style={cs.container}>
      <LinearGradient colors={['#0F172A', '#1E293B', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cs.header}>
        <View style={cs.headerTop}>
          <Pressable style={cs.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={cs.headerTitle}>{pageTitle}</Text>
            <Text style={cs.headerSubtitle}>{filteredClubs.length} {isFr ? 'clubs classes' : 'ranked clubs'}</Text>
          </View>
        </View>

        {/* Geo filter selector */}
        <View style={cs.geoRow}>
          {(['all', 'city', 'country', 'continent'] as GeoFilter[]).map(f => {
            const isActive = geoFilter === f;
            const icons: Record<GeoFilter, string> = { all: 'public', city: 'place', country: 'flag', continent: 'travel-explore' };
            const labels: Record<GeoFilter, string> = { all: isFr ? 'Tous' : 'All', city: isFr ? 'Ville' : 'City', country: isFr ? 'Pays' : 'Country', continent: 'Continent' };
            return (
              <Pressable key={f} style={[cs.geoChip, isActive && cs.geoChipActive]} onPress={() => {
                Haptics.selectionAsync();
                setGeoFilter(f);
                if (f === 'all') setGeoValue('');
                else setShowCityPicker(true);
              }}>
                <MaterialIcons name={icons[f] as any} size={14} color={isActive ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                <Text style={[cs.geoChipText, isActive && cs.geoChipTextActive]}>{labels[f]}</Text>
              </Pressable>
            );
          })}
        </View>

        {geoFilter !== 'all' && geoValue ? (
          <Pressable style={cs.geoValuePill} onPress={() => setShowCityPicker(true)}>
            <MaterialIcons name={geoFilter === 'city' ? 'place' : geoFilter === 'country' ? 'flag' : 'travel-explore'} size={14} color="#F59E0B" />
            <Text style={cs.geoValueText} numberOfLines={1}>
              {geoFilter === 'continent' ? `${getContinentFlag(geoValue)} ${getContinentLabel(geoValue, isFr)}` : geoFilter === 'country' ? `${getCountryFlag(geoValue)} ${geoValue}` : geoValue}
            </Text>
            <Pressable onPress={() => { setGeoValue(''); setGeoFilter('all'); }} hitSlop={8}>
              <MaterialIcons name="close" size={14} color="#F59E0B" />
            </Pressable>
          </Pressable>
        ) : null}
      </LinearGradient>

      {/* Sort + Search */}
      <View style={cs.controlsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.sortRow}>
          {([
            { id: 'compositeScore' as ClubLeaderboardSort, label: 'Score', icon: 'stars' },
            { id: 'avgWinRate' as ClubLeaderboardSort, label: isFr ? 'Victoires' : 'Win %', icon: 'emoji-events' },
            { id: 'totalMatches' as ClubLeaderboardSort, label: isFr ? 'Matchs' : 'Games', icon: 'sports' },
            { id: 'playerCount' as ClubLeaderboardSort, label: isFr ? 'Joueurs' : 'Players', icon: 'people' },
            { id: 'avgTirRate' as ClubLeaderboardSort, label: 'Tir', icon: 'gps-fixed' },
          ]).map(chip => (
            <Pressable key={chip.id} style={[cs.sortChip, sortBy === chip.id && cs.sortChipActive]} onPress={() => { Haptics.selectionAsync(); setSortBy(chip.id); }}>
              <MaterialIcons name={chip.icon as any} size={13} color={sortBy === chip.id ? '#FFF' : theme.textSecondary} />
              <Text style={[cs.sortChipText, sortBy === chip.id && cs.sortChipTextActive]}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {filteredClubs.length > 3 ? (
        <View style={cs.searchBar}>
          <MaterialIcons name="search" size={18} color={theme.textMuted} />
          <TextInput style={cs.searchInput} value={search} onChangeText={setSearch} placeholder={isFr ? 'Rechercher un club...' : 'Search a club...'} placeholderTextColor={theme.textMuted} />
          {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable> : null}
        </View>
      ) : null}

      {/* List */}
      {loading ? (
        <View style={cs.centerState}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={cs.loadingText}>{isFr ? 'Chargement...' : 'Loading...'}</Text>
        </View>
      ) : filteredClubs.length === 0 ? (
        <View style={cs.centerState}>
          <MaterialIcons name="home" size={56} color={theme.textMuted} />
          <Text style={cs.emptyTitle}>{isFr ? 'Aucun club classe' : 'No ranked clubs'}</Text>
          <Text style={cs.emptyDesc}>{isFr ? 'Aucun club public ne correspond aux filtres selectionnes.' : 'No public clubs match the selected filters.'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClubs}
          keyExtractor={(item) => item.id}
          renderItem={renderClub}
          contentContainerStyle={[cs.listContent, { paddingBottom: insets.bottom + 24 }, screenWidth >= 600 && { maxWidth: 960, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#F59E0B" />}
        />
      )}

      {/* Geo Picker Modal */}
      <Modal visible={showCityPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCityPicker(false)}>
        <SafeAreaView style={cs.modalContainer}>
          <View style={cs.modalHeader}>
            <Text style={cs.modalTitle}>
              {geoFilter === 'city' ? (isFr ? 'Choisir une ville' : 'Choose a city')
                : geoFilter === 'country' ? (isFr ? 'Choisir un pays' : 'Choose a country')
                : (isFr ? 'Choisir un continent' : 'Choose a continent')}
            </Text>
            <Pressable style={cs.modalClose} onPress={() => setShowCityPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={cs.modalSearchBar}>
            <MaterialIcons name="search" size={18} color={theme.textMuted} />
            <TextInput style={cs.modalSearchInput} value={citySearch} onChangeText={setCitySearch} placeholder={isFr ? 'Rechercher...' : 'Search...'} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {filteredPickerValues.map(val => {
              const count = geoFilter === 'city'
                ? allClubs.filter(c => c.city === val).length
                : geoFilter === 'country'
                  ? allClubs.filter(c => (c.country || 'France') === val).length
                  : allClubs.filter(c => getContinent(c.country || 'France') === val).length;
              const isSelected = geoValue === val;
              const displayName = geoFilter === 'continent' ? `${getContinentFlag(val)} ${getContinentLabel(val, isFr)}` : geoFilter === 'country' ? `${getCountryFlag(val)} ${val}` : val;
              return (
                <Pressable key={val} style={[cs.pickerItem, isSelected && cs.pickerItemActive]} onPress={() => { Haptics.selectionAsync(); setGeoValue(val); setShowCityPicker(false); setCitySearch(''); }}>
                  <View style={[cs.pickerIcon, isSelected && { backgroundColor: '#F59E0B' }]}>
                    {geoFilter === 'city' ? <MaterialIcons name="place" size={18} color={isSelected ? '#FFF' : theme.textSecondary} /> : <Text style={{ fontSize: 18 }}>{geoFilter === 'continent' ? getContinentFlag(val) : getCountryFlag(val)}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[cs.pickerName, isSelected && { color: '#F59E0B' }]}>{displayName}</Text>
                    <Text style={cs.pickerCount}>{count} {isFr ? 'club(s)' : 'club(s)'}</Text>
                  </View>
                  {isSelected ? <MaterialIcons name="check-circle" size={22} color="#F59E0B" /> : null}
                </Pressable>
              );
            })}
            {filteredPickerValues.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12 }}>{isFr ? 'Aucun resultat' : 'No results'}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  geoRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  geoChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  geoChipActive: { backgroundColor: '#F59E0B30' },
  geoChipText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  geoChipTextActive: { color: '#FFF', fontWeight: '700' },
  geoValuePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B18', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B30', alignSelf: 'flex-start' },
  geoValueText: { fontSize: 13, fontWeight: '600', color: '#F59E0B', maxWidth: 200 },

  controlsBar: { borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
  sortRow: { gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  sortChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  sortChipText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  sortChipTextActive: { color: '#FFF', fontWeight: '700' },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, height: 44, ...theme.shadows.card },
  searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary },

  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  loadingText: { fontSize: 14, color: theme.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

  clubCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 10, ...theme.shadows.card },
  clubHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rankCol: { width: 32, alignItems: 'center' },
  medal: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 15, fontWeight: '900' },
  rankText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  clubLogoWrap: {},
  clubLogo: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden' },
  clubName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  clubCity: { fontSize: 11, color: theme.textMuted },
  scoreBadge: { alignItems: 'center', backgroundColor: '#F59E0B12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  scoreValue: { fontSize: 18, fontWeight: '900', color: '#F59E0B' },
  scoreLabel: { fontSize: 9, fontWeight: '600', color: '#F59E0B', marginTop: 1 },

  statsRow: { flexDirection: 'row', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  statLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },

  topPlayersRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '30' },
  topPlayerChip: { alignItems: 'center', gap: 3, minWidth: 52 },
  topPlayerAvatar: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden' },
  topPlayerName: { fontSize: 10, fontWeight: '600', color: theme.textPrimary, maxWidth: 60 },
  topPlayerStat: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },

  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8, ...theme.shadows.card },
  pickerItemActive: { borderWidth: 2, borderColor: '#F59E0B' },
  pickerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  pickerName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerCount: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
