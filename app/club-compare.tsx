/**
 * Club vs Club Comparison Page
 * Side-by-side comparison of two selected clubs showing stats, top players, and bar charts.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  TextInput, Modal, FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchClubLeaderboard, LeaderboardClub } from '@/services/clubLeaderboardService';
import { getCountryFlag } from '@/constants/geoData';

function ComparisonBar({ labelA, valueA, valueB, labelB, color, isFr }: {
  labelA: string; valueA: number; valueB: number; labelB: string; color: string; isFr: boolean;
}) {
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;
  const winnerA = valueA > valueB;
  const winnerB = valueB > valueA;
  const tie = valueA === valueB;

  return (
    <View style={cs.barSection}>
      <Text style={cs.barLabel}>{labelA}</Text>
      <View style={cs.barRow}>
        <View style={cs.barLeftWrap}>
          <View style={[cs.barFillLeft, { width: `${pctA}%`, backgroundColor: winnerA ? color : tie ? color + '60' : theme.textMuted + '30' }]} />
          <Text style={[cs.barValueLeft, winnerA && { color, fontWeight: '900' }]}>{valueA}</Text>
        </View>
        <View style={cs.barCenter}>
          <MaterialIcons name={winnerA ? 'chevron-left' : winnerB ? 'chevron-right' : 'remove'} size={16} color={tie ? theme.textMuted : color} />
        </View>
        <View style={cs.barRightWrap}>
          <View style={[cs.barFillRight, { width: `${pctB}%`, backgroundColor: winnerB ? color : tie ? color + '60' : theme.textMuted + '30' }]} />
          <Text style={[cs.barValueRight, winnerB && { color, fontWeight: '900' }]}>{valueB}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ClubCompareScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const params = useLocalSearchParams<{ clubA?: string; clubB?: string }>();

  const [allClubs, setAllClubs] = useState<LeaderboardClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubA, setClubA] = useState<LeaderboardClub | null>(null);
  const [clubB, setClubB] = useState<LeaderboardClub | null>(null);
  const [showPicker, setShowPicker] = useState<'A' | 'B' | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { clubs } = await fetchClubLeaderboard();
      setAllClubs(clubs);
      if (params.clubA) {
        const a = clubs.find(c => c.id === params.clubA || c.name === params.clubA);
        if (a) setClubA(a);
      }
      if (params.clubB) {
        const b = clubs.find(c => c.id === params.clubB || c.name === params.clubB);
        if (b) setClubB(b);
      }
      setLoading(false);
    })();
  }, []);

  const filteredPicker = useMemo(() => {
    if (!search.trim()) return allClubs;
    const q = search.toLowerCase();
    return allClubs.filter(c => c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q));
  }, [allClubs, search]);

  const selectClub = useCallback((club: LeaderboardClub) => {
    Haptics.selectionAsync();
    if (showPicker === 'A') setClubA(club);
    else setClubB(club);
    setShowPicker(null);
    setSearch('');
  }, [showPicker]);

  const stats = useMemo(() => {
    if (!clubA || !clubB) return [];
    return [
      { label: isFr ? 'Victoires %' : 'Win Rate %', a: clubA.stats.avgWinRate, b: clubB.stats.avgWinRate, color: '#22C55E' },
      { label: isFr ? 'Tir %' : 'Shot %', a: clubA.stats.avgTirRate, b: clubB.stats.avgTirRate, color: '#F97316' },
      { label: isFr ? 'Carreau %' : 'Carreau %', a: clubA.stats.avgCarreauRate, b: clubB.stats.avgCarreauRate, color: '#F59E0B' },
      { label: isFr ? 'Point %' : 'Point %', a: clubA.stats.avgPointRate, b: clubB.stats.avgPointRate, color: '#3B82F6' },
      { label: isFr ? 'Joueurs' : 'Players', a: clubA.playerCount, b: clubB.playerCount, color: '#8B5CF6' },
      { label: isFr ? 'Matchs' : 'Games', a: clubA.totalMatches, b: clubB.totalMatches, color: '#0EA5E9' },
      { label: 'Score', a: clubA.stats.compositeScore, b: clubB.stats.compositeScore, color: '#DC2626' },
    ];
  }, [clubA, clubB, isFr]);

  const winsA = stats.filter(s => s.a > s.b).length;
  const winsB = stats.filter(s => s.b > s.a).length;

  function ClubSelector({ club, side }: { club: LeaderboardClub | null; side: 'A' | 'B' }) {
    const sideColor = side === 'A' ? '#3B82F6' : '#EF4444';
    return (
      <Pressable style={[cs.selectorCard, { borderColor: sideColor + '30' }]} onPress={() => { Haptics.selectionAsync(); setShowPicker(side); }}>
        {club ? (
          <>
            <View style={cs.selectorAvatarWrap}>
              {club.logo ? (
                <Image source={{ uri: club.logo }} style={cs.selectorAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
              ) : (
                <View style={[cs.selectorAvatar, { backgroundColor: sideColor + '15', alignItems: 'center', justifyContent: 'center' }]}>
                  <MaterialIcons name="home" size={20} color={sideColor} />
                </View>
              )}
            </View>
            <Text style={cs.selectorName} numberOfLines={2}>{club.name}</Text>
            {club.city ? <Text style={cs.selectorCity} numberOfLines={1}>{club.city}</Text> : null}
            <View style={[cs.selectorScoreBadge, { backgroundColor: sideColor + '12' }]}>
              <Text style={[cs.selectorScore, { color: sideColor }]}>{club.stats.compositeScore}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={[cs.selectorAvatarPlaceholder, { borderColor: sideColor + '40' }]}>
              <MaterialIcons name="add" size={24} color={sideColor} />
            </View>
            <Text style={[cs.selectorPlaceholder, { color: sideColor }]}>
              {isFr ? `Choisir Club ${side}` : `Select Club ${side}`}
            </Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={cs.container}>
      <View style={cs.header}>
        <Pressable style={cs.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={cs.headerTitle}>{isFr ? 'Comparer des Clubs' : 'Compare Clubs'}</Text>
          <Text style={cs.headerSub}>{isFr ? 'Cote a cote' : 'Side by side'}</Text>
        </View>
        {clubA && clubB ? (
          <Pressable style={cs.swapBtn} onPress={() => { Haptics.selectionAsync(); const tmp = clubA; setClubA(clubB); setClubB(tmp); }}>
            <MaterialIcons name="swap-horiz" size={20} color={theme.primary} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={cs.centerState}>
          <ActivityIndicator size="large" color="#9333EA" />
          <Text style={cs.loadingText}>{isFr ? 'Chargement...' : 'Loading...'}</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[cs.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          {/* Club Selectors */}
          <View style={cs.selectorsRow}>
            <ClubSelector club={clubA} side="A" />
            <View style={cs.vsCircle}>
              <Text style={cs.vsText}>VS</Text>
            </View>
            <ClubSelector club={clubB} side="B" />
          </View>

          {/* Verdict */}
          {clubA && clubB ? (
            <Animated.View entering={FadeIn.duration(300)} style={cs.verdictCard}>
              <View style={cs.verdictRow}>
                <View style={[cs.verdictBadge, { backgroundColor: winsA > winsB ? '#3B82F620' : winsA === winsB ? theme.textMuted + '15' : 'transparent' }]}>
                  <Text style={[cs.verdictCount, { color: winsA > winsB ? '#3B82F6' : theme.textMuted }]}>{winsA}</Text>
                </View>
                <Text style={cs.verdictLabel}>{winsA > winsB ? (isFr ? 'avantage' : 'advantage') : winsA === winsB ? (isFr ? 'egalite' : 'tied') : ''}</Text>
                <View style={[cs.verdictBadge, { backgroundColor: winsB > winsA ? '#EF444420' : winsA === winsB ? theme.textMuted + '15' : 'transparent' }]}>
                  <Text style={[cs.verdictCount, { color: winsB > winsA ? '#EF4444' : theme.textMuted }]}>{winsB}</Text>
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* Comparison Bars */}
          {clubA && clubB ? (
            <Animated.View entering={FadeInDown.duration(350).delay(100)} style={cs.barsCard}>
              {stats.map((stat, idx) => (
                <ComparisonBar
                  key={stat.label}
                  labelA={stat.label}
                  valueA={stat.a}
                  valueB={stat.b}
                  labelB={stat.label}
                  color={stat.color}
                  isFr={isFr}
                />
              ))}
            </Animated.View>
          ) : null}

          {/* Top Players comparison */}
          {clubA && clubB && (clubA.topPlayers.length > 0 || clubB.topPlayers.length > 0) ? (
            <Animated.View entering={FadeInDown.duration(350).delay(200)} style={cs.topPlayersCard}>
              <Text style={cs.topPlayersTitle}>{isFr ? 'Meilleurs Joueurs' : 'Top Players'}</Text>
              <View style={cs.topPlayersRow}>
                <View style={cs.topPlayersCol}>
                  {clubA.topPlayers.map((p, i) => (
                    <View key={i} style={cs.topPlayerItem}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={cs.topPlayerAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[cs.topPlayerAvatar, { backgroundColor: '#3B82F615', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{p.name.charAt(0)}</Text>
                        </View>
                      )}
                      <Text style={cs.topPlayerName} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                      <Text style={[cs.topPlayerStat, { color: '#3B82F6' }]}>{p.winRate}%</Text>
                    </View>
                  ))}
                </View>
                <View style={cs.topPlayersDivider} />
                <View style={cs.topPlayersCol}>
                  {clubB.topPlayers.map((p, i) => (
                    <View key={i} style={cs.topPlayerItem}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={cs.topPlayerAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[cs.topPlayerAvatar, { backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>{p.name.charAt(0)}</Text>
                        </View>
                      )}
                      <Text style={cs.topPlayerName} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                      <Text style={[cs.topPlayerStat, { color: '#EF4444' }]}>{p.winRate}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* Info when no selection */}
          {!clubA || !clubB ? (
            <View style={cs.emptyHint}>
              <MaterialIcons name="compare-arrows" size={48} color={theme.textMuted} />
              <Text style={cs.emptyHintTitle}>{isFr ? 'Selectionnez deux clubs' : 'Select two clubs'}</Text>
              <Text style={cs.emptyHintDesc}>
                {isFr ? 'Appuyez sur les cartes ci-dessus pour choisir les clubs a comparer.' : 'Tap the cards above to choose clubs to compare.'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Club Picker Modal */}
      <Modal visible={showPicker !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(null)}>
        <SafeAreaView style={cs.modalContainer}>
          <View style={cs.modalHeader}>
            <Text style={cs.modalTitle}>
              {isFr ? `Choisir Club ${showPicker}` : `Select Club ${showPicker}`}
            </Text>
            <Pressable style={cs.modalClose} onPress={() => { setShowPicker(null); setSearch(''); }}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={cs.modalSearchBar}>
            <MaterialIcons name="search" size={18} color={theme.textMuted} />
            <TextInput style={cs.modalSearchInput} value={search} onChangeText={setSearch} placeholder={isFr ? 'Rechercher un club...' : 'Search a club...'} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <FlatList
            data={filteredPicker}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = (showPicker === 'A' && clubA?.id === item.id) || (showPicker === 'B' && clubB?.id === item.id);
              const isOther = (showPicker === 'A' && clubB?.id === item.id) || (showPicker === 'B' && clubA?.id === item.id);
              return (
                <Pressable style={[cs.pickerItem, isSelected && cs.pickerItemSelected, isOther && { opacity: 0.4 }]} onPress={() => !isOther ? selectClub(item) : null} disabled={isOther}>
                  <View style={cs.pickerAvatarWrap}>
                    {item.logo ? (
                      <Image source={{ uri: item.logo }} style={cs.pickerAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                    ) : (
                      <View style={[cs.pickerAvatar, { backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}>
                        <MaterialIcons name="home" size={18} color="#F59E0B" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.pickerName} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {item.city ? <Text style={cs.pickerCity}>{item.city}</Text> : null}
                      {item.country ? <Text style={{ fontSize: 12 }}>{getCountryFlag(item.country)}</Text> : null}
                      <Text style={cs.pickerMeta}>{item.playerCount} {isFr ? 'joueurs' : 'players'}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={cs.pickerScore}>{item.stats.compositeScore}</Text>
                    <Text style={cs.pickerScoreLabel}>Score</Text>
                  </View>
                  {isSelected ? <MaterialIcons name="check-circle" size={22} color={theme.primary} style={{ marginLeft: 8 }} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12 }}>{isFr ? 'Aucun club trouve' : 'No clubs found'}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSub: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  swapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: theme.textMuted },
  content: { padding: 16 },

  // Selectors
  selectorsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  selectorCard: { flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, ...theme.shadows.card, minHeight: 160 },
  selectorAvatarWrap: { marginBottom: 8 },
  selectorAvatar: { width: 52, height: 52, borderRadius: 14, overflow: 'hidden' },
  selectorAvatarPlaceholder: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  selectorName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, textAlign: 'center' },
  selectorCity: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  selectorScoreBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  selectorScore: { fontSize: 18, fontWeight: '900' },
  selectorPlaceholder: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  vsCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.border, zIndex: 2, marginHorizontal: -12 },
  vsText: { fontSize: 12, fontWeight: '900', color: theme.textSecondary },

  // Verdict
  verdictCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, ...theme.shadows.card },
  verdictRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  verdictBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  verdictCount: { fontSize: 24, fontWeight: '900' },
  verdictLabel: { fontSize: 12, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Comparison bars
  barsCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, ...theme.shadows.card },
  barSection: { marginBottom: 14 },
  barLabel: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 },
  barLeftWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', height: 24 },
  barFillLeft: { height: '100%', borderRadius: 4, minWidth: 4 },
  barValueLeft: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginRight: 6, minWidth: 32, textAlign: 'right' },
  barCenter: { width: 24, alignItems: 'center' },
  barRightWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 24 },
  barFillRight: { height: '100%', borderRadius: 4, minWidth: 4 },
  barValueRight: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginLeft: 6, minWidth: 32 },

  // Top players
  topPlayersCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, ...theme.shadows.card },
  topPlayersTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  topPlayersRow: { flexDirection: 'row', gap: 8 },
  topPlayersCol: { flex: 1, gap: 8 },
  topPlayersDivider: { width: 1, backgroundColor: theme.border },
  topPlayerItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 8 },
  topPlayerAvatar: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden' },
  topPlayerName: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.textPrimary },
  topPlayerStat: { fontSize: 13, fontWeight: '800' },

  // Empty hint
  emptyHint: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 },
  emptyHintTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary },
  emptyHintDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8, ...theme.shadows.card },
  pickerItemSelected: { borderWidth: 2, borderColor: theme.primary },
  pickerAvatarWrap: {},
  pickerAvatar: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden' },
  pickerName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerCity: { fontSize: 11, color: theme.textMuted },
  pickerMeta: { fontSize: 10, color: theme.textMuted },
  pickerScore: { fontSize: 18, fontWeight: '900', color: '#F59E0B' },
  pickerScoreLabel: { fontSize: 9, color: theme.textMuted },
});
