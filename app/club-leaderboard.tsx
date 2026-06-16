import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { getSupabaseClient } from '@/template';
import AdBanner from '@/components/ui/AdBanner';
import { getEloRank } from '@/services/eloService';
import { fetchClubLeaderboard, sortClubLeaderboard, LeaderboardClub } from '@/services/clubLeaderboardService';

interface ClubLeaderboardEntry {
  id: string;
  name: string;
  city: string;
  country: string;
  logo?: string;
  membersCount: number;
  totalWins: number;
  totalMatches: number;
  winRate: number;
  tournamentsCount: number;
  avgElo: number;
  isVerified: boolean;
  compositeScore: number;
  hasQualifiedPlayers: boolean;
}

type SortKey = 'winRate' | 'totalWins' | 'tournamentsCount' | 'membersCount' | 'avgElo' | 'composite';
type RegionFilter = 'all' | 'country' | 'city';

export default function ClubLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const fr = language === 'fr';
  const { clubs, tournaments, matches, players } = useAppData();
  const params = useLocalSearchParams<{ region?: string }>();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [leaderboardData, setLeaderboardData] = useState<ClubLeaderboardEntry[]>([]);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  // Build a lookup for local club details (verified, tournaments, ELO) not available from service
  const clubDetailsMap = useMemo(() => {
    const map = new Map<string, { isVerified: boolean; tournamentsCount: number; avgElo: number }>();
    for (const club of clubs) {
      const clubPlayers = players.filter(p => p.clubId === club.id);
      let eloSum = 0;
      let eloCount = 0;
      for (const player of clubPlayers) {
        if (player.eloRating && player.eloRating > 0) {
          eloSum += player.eloRating;
          eloCount++;
        }
      }
      const clubTournaments = tournaments.filter(tr => tr.clubId === club.id);
      map.set(club.id, {
        isVerified: club.isVerified ?? false,
        tournamentsCount: clubTournaments.length,
        avgElo: eloCount > 0 ? Math.round(eloSum / eloCount) : 1000,
      });
      // Also map by name for service-returned clubs without matching local ID
      map.set(club.name, {
        isVerified: club.isVerified ?? false,
        tournamentsCount: clubTournaments.length,
        avgElo: eloCount > 0 ? Math.round(eloSum / eloCount) : 1000,
      });
    }
    return map;
  }, [clubs, players, tournaments]);

  // Fetch club leaderboard from the service (uses anti-cheat filtered players)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { clubs: serviceClubs } = await fetchClubLeaderboard();
      if (cancelled) return;
      const entries: ClubLeaderboardEntry[] = serviceClubs.map(sc => {
        const details = clubDetailsMap.get(sc.id) || clubDetailsMap.get(sc.name);
        return {
          id: sc.id,
          name: sc.name,
          city: sc.city || '',
          country: sc.country || 'France',
          logo: sc.logo,
          membersCount: sc.playerCount,
          totalWins: sc.stats.totalWins,
          totalMatches: sc.totalMatches,
          winRate: sc.stats.avgWinRate,
          tournamentsCount: details?.tournamentsCount || 0,
          avgElo: details?.avgElo || 1000,
          isVerified: details?.isVerified ?? false,
          compositeScore: sc.stats.compositeScore,
          hasQualifiedPlayers: sc.hasQualifiedPlayers,
        };
      });
      setLeaderboardData(entries);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [clubDetailsMap]);

  // Filter and sort
  const filteredData = useMemo(() => {
    let data = [...leaderboardData];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(c => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
    }

    // Region filter (placeholder - uses first club's country/city as reference)
    if (regionFilter === 'country' && leaderboardData.length > 0) {
      const myCountry = params.region || leaderboardData[0]?.country || 'France';
      data = data.filter(c => c.country.toLowerCase() === myCountry.toLowerCase());
    } else if (regionFilter === 'city' && leaderboardData.length > 0) {
      const myCity = params.region || leaderboardData[0]?.city || '';
      if (myCity) data = data.filter(c => c.city.toLowerCase() === myCity.toLowerCase());
    }

    // Composite score function
    const getComposite = (c: ClubLeaderboardEntry) => {
      const eloScore = Math.max(0, (c.avgElo - 800) / 12);
      const winScore = c.winRate * 0.4;
      const tourneyScore = Math.min(c.tournamentsCount * 3, 30);
      const memberScore = Math.min(c.membersCount * 1.5, 15);
      return eloScore + winScore + tourneyScore + memberScore;
    };

    // Sort
    data.sort((a, b) => {
      switch (sortKey) {
        case 'composite': return getComposite(b) - getComposite(a);
        case 'winRate': return b.winRate - a.winRate;
        case 'totalWins': return b.totalWins - a.totalWins;
        case 'tournamentsCount': return b.tournamentsCount - a.tournamentsCount;
        case 'membersCount': return b.membersCount - a.membersCount;
        case 'avgElo': return b.avgElo - a.avgElo;
        default: return 0;
      }
    });

    return data;
  }, [leaderboardData, search, sortKey, regionFilter, params.region]);

  const sortOptions: { id: SortKey; label: string; icon: string }[] = [
    { id: 'composite', label: fr ? 'Score global' : 'Overall', icon: 'auto-awesome' },
    { id: 'winRate', label: fr ? 'Taux victoire' : 'Win Rate', icon: 'trending-up' },
    { id: 'avgElo', label: 'ELO', icon: 'leaderboard' },
    { id: 'totalWins', label: fr ? 'Victoires' : 'Wins', icon: 'emoji-events' },
    { id: 'tournamentsCount', label: fr ? 'Tournois' : 'Tournaments', icon: 'flag' },
    { id: 'membersCount', label: fr ? 'Membres' : 'Members', icon: 'people' },
  ];

  const renderClubItem = useCallback(({ item, index }: { item: ClubLeaderboardEntry; index: number }) => {
    const rank = index + 1;
    const isTop3 = rank <= 3;
    const medalColors = ['#F59E0B', '#94A3B8', '#CD7F32'];
    const isUnranked = !item.hasQualifiedPlayers;

    return (
      <Pressable
        style={({ pressed }) => [s.clubCard, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, isTop3 && !isUnranked && { borderWidth: 1.5, borderColor: (medalColors[rank - 1] || theme.border) + '40' }, isUnranked && { opacity: 0.7, borderWidth: 1, borderColor: '#94A3B830' }]}
        onPress={() => { Haptics.selectionAsync(); router.push(`/club/${item.id}`); }}
      >
        <View style={s.rankCol}>
          {isUnranked ? (
            <MaterialIcons name="remove-circle-outline" size={18} color="#94A3B8" />
          ) : isTop3 ? (
            <View style={[s.medalCircle, { backgroundColor: medalColors[rank - 1] }]}>
              <Text style={s.medalText}>{rank}</Text>
            </View>
          ) : (
            <Text style={s.rankText}>#{rank}</Text>
          )}
        </View>

        <View style={s.clubLogoCol}>
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={s.clubLogo} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} />
          ) : (
            <View style={[s.clubLogoPlaceholder, isUnranked && { backgroundColor: '#94A3B812' }]}>
              <MaterialIcons name="home" size={20} color={isUnranked ? '#94A3B8' : theme.primary} />
            </View>
          )}
        </View>

        <View style={s.clubInfoCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.clubName, isUnranked && { color: '#94A3B8' }]} numberOfLines={1}>{item.name}</Text>
            {item.isVerified ? <MaterialIcons name="verified" size={14} color="#2563EB" /> : null}
            {isUnranked ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#94A3B810', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 8, borderWidth: 1, borderColor: '#94A3B820' }}>
                <MaterialIcons name="hourglass-empty" size={9} color="#94A3B8" />
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.3 }}>{fr ? 'NON CLASSE' : 'UNRANKED'}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.clubMetaRow}>
            <MaterialIcons name="place" size={11} color={theme.textMuted} />
            <Text style={s.clubMeta} numberOfLines={1}>{item.city}, {item.country}</Text>
          </View>
          {isUnranked ? (
            <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 3, fontStyle: 'italic', lineHeight: 14 }}>
              {fr ? 'Pas encore de membres qualifies (3+ matchs multi-joueurs)' : 'No qualified members yet (3+ multi-player matches)'}
            </Text>
          ) : null}
        </View>

        <View style={s.statsCol}>
          {isUnranked ? (
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons name="hourglass-empty" size={22} color="#CBD5E1" />
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#CBD5E1', marginTop: 3 }}>{fr ? 'En attente' : 'Pending'}</Text>
            </View>
          ) : (
            <>
              {/* League badge for ELO */}
              {(() => {
                const eloR = getEloRank(item.avgElo);
                return (
                  <View style={[s.leagueBadge, { backgroundColor: eloR.color + '12', borderColor: eloR.color + '30' }]}>
                    <MaterialIcons name={eloR.icon as any} size={10} color={eloR.color} />
                    <Text style={[s.leagueBadgeText, { color: eloR.color }]}>{item.avgElo}</Text>
                  </View>
                );
              })()}
              <Text style={[s.mainStat, sortKey === 'winRate' || sortKey === 'composite' ? { color: theme.success } : sortKey === 'avgElo' ? { color: '#06B6D4' } : { color: theme.primary }]}>
                {sortKey === 'composite' ? `${item.winRate}%` : sortKey === 'winRate' ? `${item.winRate}%` : sortKey === 'avgElo' ? item.avgElo : sortKey === 'totalWins' ? item.totalWins : sortKey === 'tournamentsCount' ? item.tournamentsCount : item.membersCount}
              </Text>
              <Text style={s.subStat}>
                {sortKey === 'composite' ? `${item.totalWins}W • ${item.tournamentsCount}T` : sortKey === 'winRate' ? `${item.totalWins}/${item.totalMatches}` : sortKey === 'avgElo' ? 'ELO' : sortKey === 'totalWins' ? `${item.winRate}%` : sortKey === 'tournamentsCount' ? (fr ? 'tournois' : 'tournaments') : (fr ? 'membres' : 'members')}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    );
  }, [sortKey, fr]);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{fr ? 'Classement des Clubs' : 'Club Leaderboard'}</Text>
          <Text style={s.headerSubtitle}>{filteredData.length} {fr ? 'clubs publics' : 'public clubs'}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <MaterialIcons name="search" size={20} color={theme.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder={fr ? 'Rechercher un club...' : 'Search clubs...'}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Region filter */}
      <View style={s.regionBar}>
        {([
          { id: 'all' as RegionFilter, label: fr ? 'Monde' : 'World', icon: 'public' },
          { id: 'country' as RegionFilter, label: fr ? 'Pays' : 'Country', icon: 'flag' },
          { id: 'city' as RegionFilter, label: fr ? 'Ville' : 'City', icon: 'location-city' },
        ]).map(rf => (
          <Pressable
            key={rf.id}
            style={[s.regionPill, regionFilter === rf.id && s.regionPillActive]}
            onPress={() => { Haptics.selectionAsync(); setRegionFilter(rf.id); }}
          >
            <MaterialIcons name={rf.icon as any} size={14} color={regionFilter === rf.id ? '#FFF' : theme.textSecondary} />
            <Text style={[s.regionPillText, regionFilter === rf.id && s.regionPillTextActive]}>{rf.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Sort options */}
      <View style={s.sortBar}>
        {sortOptions.map(opt => (
          <Pressable
            key={opt.id}
            style={[s.sortChip, sortKey === opt.id && s.sortChipActive]}
            onPress={() => { Haptics.selectionAsync(); setSortKey(opt.id); }}
          >
            <MaterialIcons name={opt.icon as any} size={12} color={sortKey === opt.id ? theme.primary : theme.textMuted} />
            <Text style={[s.sortChipText, sortKey === opt.id && s.sortChipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={item => item.id}
          renderItem={renderClubItem}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<AdBanner position="inline" />}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <MaterialIcons name="home-work" size={48} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{fr ? 'Aucun club trouve' : 'No clubs found'}</Text>
              <Text style={s.emptyText}>{fr ? 'Modifiez vos filtres ou votre recherche' : 'Adjust your filters or search'}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
  headerSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },

  regionBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 12 },
  regionPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  regionPillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  regionPillText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  regionPillTextActive: { color: '#FFF' },

  sortBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginTop: 10, marginBottom: 8 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  sortChipActive: { backgroundColor: theme.primary + '12', borderColor: theme.primary },
  sortChipText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  sortChipTextActive: { color: theme.primary, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  clubCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 8, gap: 12, ...theme.shadows.card },
  rankCol: { width: 36, alignItems: 'center' },
  medalCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  rankText: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
  clubLogoCol: {},
  clubLogo: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' as const },
  clubLogoPlaceholder: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  clubInfoCol: { flex: 1 },
  clubName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  clubMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  clubMeta: { fontSize: 12, color: theme.textMuted },
  statsCol: { alignItems: 'flex-end' },
  mainStat: { fontSize: 18, fontWeight: '800' },
  subStat: { fontSize: 10, color: theme.textMuted, marginTop: 2 },
  leagueBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginBottom: 3 },
  leagueBadgeText: { fontSize: 10, fontWeight: '800' as const },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  emptyText: { fontSize: 13, color: theme.textMuted },
});
