/**
 * LeaderboardHub — Prominent combined leaderboard section for the home page.
 * Geo leaderboard is prioritized, with community leaderboard as a secondary tab.
 */
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { fetchGeoLeaderboard, GeoEntry, fetchPlayerGeoRank, PlayerGeoRank } from '@/services/geoLeaderboardService';
import { fetchLeaderboard, sortLeaderboard, LeaderboardPlayer } from '@/services/leaderboardService';
import { fetchClubLeaderboard, sortClubLeaderboard, LeaderboardClub } from '@/services/clubLeaderboardService';
import { fetchBoulesLeaderboard, aggregateBoulesData, sortBoulesLeaderboard, LeaderboardBoulesEntry } from '@/services/boulesLeaderboardService';
import { getEloColor } from '@/services/eloService';
import { getCountryFlag, getContinentFlag, getContinentLabel } from '@/constants/geoData';
import { getBrandVisual, getBrandImage } from '@/constants/boulesDatabase';

type HubTab = 'geo' | 'players';
type GeoSubTab = 'cities' | 'countries' | 'continents';

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={{ fontSize: 14 }}>🥇</Text>;
  if (rank === 2) return <Text style={{ fontSize: 14 }}>🥈</Text>;
  if (rank === 3) return <Text style={{ fontSize: 14 }}>🥉</Text>;
  return <Text style={s.geoRankNum}>{rank}</Text>;
}

function LeaderboardHub() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { selfPlayer } = useAppData();
  const isFr = language === 'fr';

  const [hubTab, setHubTab] = useState<HubTab>('geo');
  const [geoSubTab, setGeoSubTab] = useState<GeoSubTab>('cities');

  // Geo data
  const [cities, setCities] = useState<GeoEntry[]>([]);
  const [countries, setCountries] = useState<GeoEntry[]>([]);
  const [continents, setContinents] = useState<GeoEntry[]>([]);
  const [geoLoading, setGeoLoading] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);

  // My geo rank
  const [myGeoRank, setMyGeoRank] = useState<PlayerGeoRank | null>(null);

  // Players data
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  // Clubs data
  const [clubs, setClubs] = useState<LeaderboardClub[]>([]);
  const [clubsLoaded, setClubsLoaded] = useState(false);

  // Boules data
  const [boulesEntries, setBoulesEntries] = useState<LeaderboardBoulesEntry[]>([]);
  const [boulesLoaded, setBoulesLoaded] = useState(false);

  // Load Geo
  const loadGeo = useCallback(async () => {
    setGeoLoading(true);
    try {
      const result = await fetchGeoLeaderboard();
      if (result.error) setGeoError(result.error);
      else {
        setCities(result.cities);
        setCountries(result.countries);
        setContinents(result.continents);
        setGeoError(null);
      }
    } catch (err: any) {
      setGeoError(err.message);
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // Load my geo rank
  useEffect(() => {
    if (selfPlayer?.isPublic && user?.id) {
      fetchPlayerGeoRank(user.id).then(({ geoRank }) => setMyGeoRank(geoRank)).catch(() => {});
    }
  }, [selfPlayer?.isPublic, user?.id]);

  useEffect(() => { loadGeo(); }, [loadGeo]);

  // Load players + clubs + boules on tab switch
  const loadPlayers = useCallback(async () => {
    if (playersLoaded) return;
    setPlayersLoading(true);
    const [lbRes, clubsRes, boulesRes] = await Promise.all([
      fetchLeaderboard(),
      fetchClubLeaderboard(),
      fetchBoulesLeaderboard(),
    ]);
    setPlayers(lbRes.players);
    setClubs(sortClubLeaderboard(clubsRes.clubs, 'compositeScore'));
    const aggregated = aggregateBoulesData(boulesRes.entries, 'brand', 'all');
    setBoulesEntries(sortBoulesLeaderboard(aggregated, 'avgWinRate'));
    setClubsLoaded(true);
    setBoulesLoaded(true);
    setPlayersLoading(false);
    setPlayersLoaded(true);
  }, [playersLoaded]);

  useEffect(() => {
    if (hubTab === 'players') loadPlayers();
  }, [hubTab, loadPlayers]);

  const sortedPlayers = useMemo(() => sortLeaderboard(players, 'elo'), [players]);

  const myPlayerRank = useMemo(() => {
    if (!selfPlayer || !user) return null;
    const idx = sortedPlayers.findIndex(p => p.userId === user.id || p.id === selfPlayer.id);
    return idx >= 0 ? idx + 1 : null;
  }, [sortedPlayers, selfPlayer, user]);

  const geoData = useMemo(() => {
    switch (geoSubTab) {
      case 'cities': return cities;
      case 'countries': return countries;
      case 'continents': return continents;
    }
  }, [geoSubTab, cities, countries, continents]);

  const totalPlayers = useMemo(() => countries.reduce((sum, c) => sum + c.playerCount, 0), [countries]);

  const GEO_SUB_TABS: { id: GeoSubTab; icon: string; color: string }[] = [
    { id: 'cities', icon: 'location-city', color: '#3B82F6' },
    { id: 'countries', icon: 'flag', color: '#10B981' },
    { id: 'continents', icon: 'public', color: '#F59E0B' },
  ];

  const geoSubLabels: Record<GeoSubTab, string> = {
    cities: isFr ? 'Villes' : 'Cities',
    countries: isFr ? 'Pays' : 'Countries',
    continents: 'Continents',
  };

  return (
    <View style={s.root}>
      {/* ===== HEADER WITH TABS ===== */}
      <LinearGradient colors={['#0F172A', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        {/* Title row */}
        <View style={s.titleRow}>
          <View style={s.titleIcon}>
            <MaterialIcons name="leaderboard" size={22} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{isFr ? 'Classement' : 'Ranking'}</Text>
            <Text style={s.subtitle}>
              {totalPlayers} {isFr ? 'joueurs dans' : 'players in'} {cities.length} {isFr ? 'villes' : 'cities'}
            </Text>
          </View>
          <Pressable style={s.expandBtn} onPress={() => router.push(hubTab === 'geo' ? '/leaderboard-geo' : '/leaderboard' as any)}>
            <MaterialIcons name="open-in-full" size={16} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        {/* Main hub tabs */}
        <View style={s.hubTabRow}>
          <Pressable
            style={[s.hubTab, hubTab === 'geo' && s.hubTabActive]}
            onPress={() => { Haptics.selectionAsync(); setHubTab('geo'); }}
          >
            <MaterialIcons name="public" size={16} color={hubTab === 'geo' ? '#F59E0B' : '#64748B'} />
            <Text style={[s.hubTabText, hubTab === 'geo' && s.hubTabTextActive]}>
              {isFr ? 'Geographique' : 'Geographic'}
            </Text>
            {hubTab === 'geo' ? <View style={s.hubTabDot} /> : null}
          </Pressable>
          <Pressable
            style={[s.hubTab, hubTab === 'players' && s.hubTabActive]}
            onPress={() => { Haptics.selectionAsync(); setHubTab('players'); }}
          >
            <MaterialIcons name="emoji-events" size={16} color={hubTab === 'players' ? '#F59E0B' : '#64748B'} />
            <Text style={[s.hubTabText, hubTab === 'players' && s.hubTabTextActive]}>
              {isFr ? 'Communautaire' : 'Community'}
            </Text>
            {hubTab === 'players' ? <View style={s.hubTabDot} /> : null}
          </Pressable>
        </View>

        {/* Geo sub-tabs (only when geo is active) */}
        {hubTab === 'geo' ? (
          <View style={s.geoSubTabRow}>
            {GEO_SUB_TABS.map(tab => {
              const isActive = geoSubTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={[s.geoSubTab, isActive && { backgroundColor: tab.color + '25' }]}
                  onPress={() => { Haptics.selectionAsync(); setGeoSubTab(tab.id); }}
                >
                  <MaterialIcons name={tab.icon as any} size={14} color={isActive ? tab.color : '#64748B'} />
                  <Text style={[s.geoSubTabText, isActive && { color: tab.color, fontWeight: '700' }]}>
                    {geoSubLabels[tab.id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </LinearGradient>

      {/* ===== QUICK ACCESS LINKS — Always visible, right under header ===== */}
      <View style={s.quickLinksRowTop}>
        <Pressable style={s.quickLinkBtnTop} onPress={() => { Haptics.selectionAsync(); router.push('/club-city-ranking' as any); }}>
          <View style={[s.quickLinkIconCircle, { backgroundColor: '#F59E0B18' }]}>
            <MaterialIcons name="location-city" size={15} color="#F59E0B" />
          </View>
          <Text style={[s.quickLinkTextTop, { color: '#F59E0B' }]}>{isFr ? 'Par Ville' : 'By City'}</Text>
          <MaterialIcons name="chevron-right" size={14} color="#F59E0B50" />
        </Pressable>
        <Pressable style={s.quickLinkBtnTop} onPress={() => { Haptics.selectionAsync(); router.push('/club-compare' as any); }}>
          <View style={[s.quickLinkIconCircle, { backgroundColor: '#9333EA18' }]}>
            <MaterialIcons name="compare-arrows" size={15} color="#9333EA" />
          </View>
          <Text style={[s.quickLinkTextTop, { color: '#9333EA' }]}>{isFr ? 'Comparer' : 'Compare'}</Text>
          <MaterialIcons name="chevron-right" size={14} color="#9333EA50" />
        </Pressable>
        <Pressable style={s.quickLinkBtnTop} onPress={() => { Haptics.selectionAsync(); router.push('/leaderboard-geo' as any); }}>
          <View style={[s.quickLinkIconCircle, { backgroundColor: '#3B82F618' }]}>
            <MaterialIcons name="public" size={15} color="#3B82F6" />
          </View>
          <Text style={[s.quickLinkTextTop, { color: '#3B82F6' }]}>Geo</Text>
          <MaterialIcons name="chevron-right" size={14} color="#3B82F650" />
        </Pressable>
      </View>

      {/* ===== CONTENT ===== */}
      <View style={s.content}>
        {hubTab === 'geo' ? (
          geoLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={s.loadingText}>{isFr ? 'Chargement...' : 'Loading...'}</Text>
            </View>
          ) : geoError ? (
            <View style={s.loadingBox}>
              <MaterialIcons name="error-outline" size={32} color={theme.error} />
              <Pressable style={s.retryBtn} onPress={loadGeo}>
                <Text style={s.retryText}>{isFr ? 'Reessayer' : 'Retry'}</Text>
              </Pressable>
            </View>
          ) : geoData.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialIcons name="public" size={40} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{isFr ? 'Aucune donnee' : 'No data'}</Text>
              <Text style={s.emptyDesc}>
                {geoSubTab === 'cities'
                  ? (isFr ? 'Les joueurs publics avec une ville apparaitront ici' : 'Public players with a city will appear here')
                  : (isFr ? 'Les joueurs publics apparaitront ici' : 'Public players will appear here')}
              </Text>
            </View>
          ) : (
            <>
              {/* Top 3 highlight */}
              {geoData.length >= 3 ? (
                <View style={s.top3Row}>
                  {[1, 0, 2].map(idx => {
                    const entry = geoData[idx];
                    if (!entry) return null;
                    const rank = idx + 1;
                    const barHeights = [56, 72, 44];
                    const order = [1, 0, 2];
                    const h = barHeights[order.indexOf(idx)];
                    const medalColors = ['#C0C0C0', '#FFD700', '#CD7F32'];
                    const mc = medalColors[idx];
                    const tabColor = GEO_SUB_TABS.find(t => t.id === geoSubTab)?.color || '#3B82F6';
                    const flag = geoSubTab === 'countries'
                      ? getCountryFlag(entry.key)
                      : geoSubTab === 'continents'
                        ? getContinentFlag(entry.key)
                        : null;
                    const displayLabel = geoSubTab === 'continents'
                      ? getContinentLabel(entry.key, isFr)
                      : entry.label;

                    return (
                      <Pressable key={entry.key} style={[s.top3Item, { marginTop: idx === 0 ? 0 : 14 }]}
                        onPress={() => router.push({ pathname: '/city-leaderboard', params: { type: geoSubTab === 'cities' ? 'city' : geoSubTab === 'countries' ? 'country' : 'continent', value: entry.key, city: geoSubTab === 'cities' ? entry.key : undefined } } as any)}
                      >
                        <View style={[s.top3Badge, { backgroundColor: mc + '18', borderColor: mc + '40' }]}>
                          <Text style={{ fontSize: rank === 1 ? 18 : 14 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
                        </View>
                        <View style={s.top3Info}>
                          {flag ? <Text style={{ fontSize: 16, textAlign: 'center' }}>{flag}</Text> : <MaterialIcons name="location-city" size={16} color={tabColor} />}
                          <Text style={[s.top3Name, { color: tabColor }]} numberOfLines={2}>{displayLabel}</Text>
                        </View>
                        <Text style={s.top3Elo}>{entry.avgElo}</Text>
                        <Text style={s.top3Count}>{entry.playerCount} {isFr ? 'j.' : 'p.'}</Text>
                        <View style={[s.top3Bar, { height: h, backgroundColor: mc + '20' }]}>
                          <View style={[s.top3BarFill, { backgroundColor: mc + '50', height: `${Math.min(entry.avgWinRate, 100)}%` }]} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* Remaining entries (4-8) */}
              {geoData.slice(3, 8).map((entry, idx) => {
                const rank = idx + 4;
                const flag = geoSubTab === 'countries'
                  ? getCountryFlag(entry.key)
                  : geoSubTab === 'continents'
                    ? getContinentFlag(entry.key)
                    : null;
                const displayLabel = geoSubTab === 'continents'
                  ? getContinentLabel(entry.key, isFr)
                  : entry.label;

                return (
                  <Pressable key={entry.key} style={[s.geoRow, idx < geoData.slice(3, 8).length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border + '40' }]}
                    onPress={() => router.push({ pathname: '/city-leaderboard', params: { type: geoSubTab === 'cities' ? 'city' : geoSubTab === 'countries' ? 'country' : 'continent', value: entry.key, city: geoSubTab === 'cities' ? entry.key : undefined } } as any)}
                  >
                    <Text style={s.geoRankNum}>{rank}</Text>
                    <View style={s.geoRowInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {flag ? <Text style={{ fontSize: 13 }}>{flag}</Text> : <MaterialIcons name="location-city" size={14} color={theme.textMuted} />}
                        <Text style={s.geoRowName} numberOfLines={1}>{displayLabel}</Text>
                      </View>
                      <Text style={s.geoRowMeta}>
                        {entry.playerCount} {isFr ? 'joueurs' : 'players'} · {entry.totalMatches} {isFr ? 'matchs' : 'games'}
                      </Text>
                    </View>
                    <View style={s.geoRowStats}>
                      <Text style={s.geoRowElo}>{entry.avgElo}</Text>
                      <Text style={s.geoRowWin}>{entry.avgWinRate}%</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* Top player highlight */}
              {geoData[0]?.topPlayer ? (
                <View style={s.topPlayerBanner}>
                  <MaterialIcons name="star" size={14} color="#F59E0B" />
                  <Text style={s.topPlayerText}>
                    {isFr ? 'Meilleur joueur' : 'Top player'}: <Text style={{ fontWeight: '800', color: theme.textPrimary }}>{geoData[0].topPlayer.name}</Text> ({geoData[0].topPlayer.elo} ELO)
                  </Text>
                </View>
              ) : null}
            </>
          )
        ) : (
          /* ===== PLAYERS TAB ===== */
          playersLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={s.loadingText}>{isFr ? 'Chargement...' : 'Loading...'}</Text>
            </View>
          ) : sortedPlayers.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialIcons name="people-outline" size={40} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{t('leaderboard', 'noPlayers')}</Text>
              <Text style={s.emptyDesc}>{t('leaderboard', 'noPlayersDesc')}</Text>
            </View>
          ) : (
            <>
              {/* Section Label: Top 3 ELO */}
              <View style={s.commSectionHeader}>
                <MaterialIcons name="diamond" size={14} color="#F59E0B" />
                <Text style={s.commSectionLabel}>{isFr ? 'Top 3 ELO' : 'Top 3 ELO'}</Text>
              </View>
              {/* Top 3 podium */}
              {sortedPlayers.length >= 3 ? (
                <View style={s.podium}>
                  {[1, 0, 2].map(idx => {
                    const p = sortedPlayers[idx];
                    if (!p) return null;
                    const rank = idx + 1;
                    const isMe = user && (p.userId === user.id || (selfPlayer && p.id === selfPlayer.id));
                    const heights = [56, 72, 44];
                    const sizes = [42, 50, 38];
                    const colors = ['#C0C0C0', '#FFD700', '#CD7F32'];
                    const order = [1, 0, 2];
                    const h = heights[order.indexOf(idx)];
                    const sz = sizes[order.indexOf(idx)];
                    const col = colors[idx];
                    return (
                      <Pressable key={p.id} style={[s.podiumItem, { marginTop: idx === 0 ? 0 : idx === 1 ? 0 : 14 }]} onPress={() => router.push(isMe ? '/player/me' : `/player/${p.id}` as any)}>
                        <View style={[s.podiumAvatarWrap, { width: sz, height: sz, borderColor: col }]}>
                          {p.avatar ? (
                            <Image source={{ uri: p.avatar }} style={{ width: sz - 4, height: sz - 4, borderRadius: (sz - 4) / 2 }} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                          ) : (
                            <View style={{ width: sz - 4, height: sz - 4, borderRadius: (sz - 4) / 2, backgroundColor: isMe ? theme.primary : '#334155', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: sz * 0.3, fontWeight: '700', color: '#FFF' }}>{p.name.charAt(0)}</Text>
                            </View>
                          )}
                          <View style={[s.podiumRankBadge, { backgroundColor: col }]}>
                            <Text style={s.podiumRankNum}>{rank}</Text>
                          </View>
                        </View>
                        <Text style={[s.podiumName, isMe && { color: theme.primary }]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                        {p.country ? <Text style={{ fontSize: 12 }}>{getCountryFlag(p.country)}</Text> : null}
                        <Text style={s.podiumElo}>{p.eloRating || 1000}</Text>
                        <View style={[s.podiumBar, { height: h, backgroundColor: col + '20' }]} />
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* Remaining rows 4-10 */}
              {sortedPlayers.slice(3, 10).map((p, idx) => {
                const rank = idx + 4;
                const isMe = user && (p.userId === user.id || (selfPlayer && p.id === selfPlayer.id));
                return (
                  <Pressable key={p.id} style={[s.playerRow, isMe && s.playerRowMe]} onPress={() => router.push(isMe ? '/player/me' : `/player/${p.id}` as any)}>
                    <Text style={s.playerRank}>{rank}</Text>
                    <View style={s.playerAvatarBox}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={s.playerAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[s.playerAvatar, { backgroundColor: isMe ? theme.primary : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isMe ? '#FFF' : theme.textSecondary }}>{p.name.charAt(0)}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {p.country ? <Text style={{ fontSize: 12 }}>{getCountryFlag(p.country)}</Text> : null}
                        <Text style={[s.playerName, isMe && { color: theme.primary }]} numberOfLines={1}>
                          {p.name}{isMe ? ` (${t('leaderboard', 'you')})` : ''}
                        </Text>
                      </View>
                      {p.club ? <Text style={s.playerClub} numberOfLines={1}>{p.club}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.playerElo, { color: getEloColor(p.eloRating || 1000) }]}>{p.eloRating || 1000}</Text>
                      <Text style={s.playerWin}>{p.stats.winRate}%</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* === TOP 3 CLUBS BY SCORE === */}
              {clubs.length >= 3 ? (
                <>
                  <View style={s.commSectionHeader}>
                    <MaterialIcons name="home" size={14} color="#D97706" />
                    <Text style={s.commSectionLabel}>{isFr ? 'Top 3 Clubs' : 'Top 3 Clubs'}</Text>
                  </View>
                  {clubs.slice(0, 3).map((club, idx) => {
                    const rank = idx + 1;
                    const mc = ['#FFD700', '#C0C0C0', '#CD7F32'][idx];
                    return (
                      <Pressable key={club.id} style={s.geoRow} onPress={() => router.push({ pathname: `/club-ranking/${club.id}`, params: { name: club.name } } as any)}>
                        <View style={[s.commMedal, { backgroundColor: mc + '18' }]}>
                          <Text style={{ fontSize: rank === 1 ? 12 : 11 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
                        </View>
                        <View style={s.geoRowInfo}>
                          <Text style={s.geoRowName} numberOfLines={1}>{club.name}</Text>
                          <Text style={s.geoRowMeta}>{club.playerCount} {isFr ? 'joueurs' : 'players'} · {club.city || ''}</Text>
                        </View>
                        <View style={s.geoRowStats}>
                          <Text style={[s.geoRowElo, { color: '#D97706' }]}>{club.stats.compositeScore}</Text>
                          <Text style={s.geoRowWin}>{club.stats.avgWinRate}%</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {/* === TOP 3 BOULES BRANDS BY WIN RATE === */}
              {boulesEntries.length >= 3 ? (
                <>
                  <View style={s.commSectionHeader}>
                    <MaterialIcons name="sports-baseball" size={14} color="#EA580C" />
                    <Text style={s.commSectionLabel}>{isFr ? 'Top 3 Marques' : 'Top 3 Brands'}</Text>
                  </View>
                  {boulesEntries.slice(0, 3).map((entry, idx) => {
                    const rank = idx + 1;
                    const mc = ['#FFD700', '#C0C0C0', '#CD7F32'][idx];
                    const bv = getBrandVisual(entry.brand);
                    return (
                      <Pressable key={entry.id} style={s.geoRow} onPress={() => router.push({ pathname: `/boules-ranking/${encodeURIComponent(entry.id)}`, params: { brand: entry.brand, mode: 'brand' } } as any)}>
                        <View style={[s.commMedal, { backgroundColor: mc + '18' }]}>
                          <Text style={{ fontSize: rank === 1 ? 12 : 11 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
                        </View>
                        <View style={s.geoRowInfo}>
                          <Text style={s.geoRowName} numberOfLines={1}>{entry.brand}</Text>
                          <Text style={s.geoRowMeta}>{entry.userCount} {isFr ? 'joueurs' : 'players'} · {entry.totalMatches} {isFr ? 'matchs' : 'games'}</Text>
                        </View>
                        <View style={s.geoRowStats}>
                          <Text style={[s.geoRowElo, { color: '#EA580C' }]}>{entry.stats.avgWinRate}%</Text>
                          <Text style={s.geoRowWin}>{isFr ? 'Vict.' : 'Win'}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {/* My rank if not visible */}
              {myPlayerRank && myPlayerRank > 10 ? (() => {
                const myP = sortedPlayers[myPlayerRank - 1];
                if (!myP) return null;
                return (
                  <View key="my-rank-sep">
                    <View style={s.separator}><View style={s.sepLine} /><Text style={s.sepText}>#{myPlayerRank}</Text><View style={s.sepLine} /></View>
                    <Pressable style={[s.playerRow, s.playerRowMe]} onPress={() => router.push('/player/me' as any)}>
                      <Text style={[s.playerRank, { color: theme.primary }]}>{myPlayerRank}</Text>
                      <View style={s.playerAvatarBox}>
                        {myP.avatar ? (
                          <Image source={{ uri: myP.avatar }} style={s.playerAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                        ) : (
                          <View style={[s.playerAvatar, { backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{myP.name.charAt(0)}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.playerName, { color: theme.primary }]} numberOfLines={1}>{myP.name} ({t('leaderboard', 'you')})</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.playerElo, { color: '#F59E0B' }]}>{myP.eloRating || 1000}</Text>
                        <Text style={s.playerWin}>{myP.stats.winRate}%</Text>
                      </View>
                    </Pressable>
                  </View>
                );
              })() : null}
            </>
          )
        )}

        {/* ===== FOOTER CTAs ===== */}
        <View style={s.footerCta}>
          <View style={s.footerCtaRow}>
            <Pressable
              style={s.footerCtaLink}
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/leaderboard-geo' as any);
              }}
            >
              <MaterialIcons name="public" size={14} color={hubTab === 'geo' ? '#F59E0B' : theme.textSecondary} />
              <Text style={[s.footerCtaLinkText, hubTab === 'geo' && { color: '#F59E0B' }]}>{isFr ? 'Geo complet' : 'Full Geo'}</Text>
              <MaterialIcons name="chevron-right" size={14} color={hubTab === 'geo' ? '#F59E0B' : theme.textMuted} />
            </Pressable>
            <View style={s.footerCtaDivider} />
            <Pressable
              style={s.footerCtaLink}
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/leaderboard' as any);
              }}
            >
              <MaterialIcons name="emoji-events" size={14} color={hubTab === 'players' ? '#F59E0B' : theme.textSecondary} />
              <Text style={[s.footerCtaLinkText, hubTab === 'players' && { color: '#F59E0B' }]}>{isFr ? 'Communautaire' : 'Community'}</Text>
              <MaterialIcons name="chevron-right" size={14} color={hubTab === 'players' ? '#F59E0B' : theme.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default memo(LeaderboardHub);

const s = StyleSheet.create({
  root: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 6 },
      default: {},
    }),
  },

  // Header
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F59E0B18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hub tabs
  hubTabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  hubTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    position: 'relative',
  },
  hubTabActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  hubTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  hubTabTextActive: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  hubTabDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },

  // Geo sub tabs
  geoSubTabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  geoSubTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  geoSubTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  // My rank banner
  myRankBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.primary + '08',
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
  },
  myRankLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
  },
  myRankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  myRankPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Content
  content: {
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // Loading / Empty
  loadingBox: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  loadingText: { fontSize: 13, color: theme.textMuted },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F59E0B15', borderRadius: 8, marginTop: 8 },
  retryText: { fontSize: 13, fontWeight: '600', color: '#F59E0B' },
  emptyBox: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  emptyDesc: { fontSize: 12, color: theme.textSecondary, textAlign: 'center', maxWidth: 260 },

  // === GEO TOP 3 ===
  top3Row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 10,
  },
  top3Item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  top3Badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 4,
  },
  top3Info: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    width: '100%',
    paddingHorizontal: 2,
  },
  top3Name: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
  },
  top3Elo: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  top3Count: {
    fontSize: 10,
    color: theme.textMuted,
  },
  top3Bar: {
    width: '85%',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 2,
  },
  top3BarFill: {
    width: '100%',
    borderRadius: 6,
    position: 'absolute',
    bottom: 0,
  },

  // Geo rows
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  geoRankNum: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    width: 24,
    textAlign: 'center',
  },
  geoRowInfo: {
    flex: 1,
    gap: 2,
  },
  geoRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  geoRowMeta: {
    fontSize: 10,
    color: theme.textMuted,
  },
  geoRowStats: {
    alignItems: 'flex-end',
  },
  geoRowElo: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  geoRowWin: {
    fontSize: 10,
    color: theme.success,
    fontWeight: '600',
  },

  // Community tab section headers
  commSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.border + '40',
  },
  commSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commMedal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top player
  topPlayerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F59E0B08',
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  topPlayerText: {
    fontSize: 12,
    color: theme.textSecondary,
    flex: 1,
  },

  // === PLAYERS PODIUM ===
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 10,
  },
  podiumItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  podiumAvatarWrap: {
    borderRadius: 100,
    borderWidth: 2.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  podiumRankBadge: {
    position: 'absolute',
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  podiumRankNum: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFF',
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textPrimary,
    maxWidth: 80,
    textAlign: 'center',
  },
  podiumElo: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F59E0B',
  },
  podiumBar: {
    width: '80%',
    borderRadius: 6,
    marginTop: 4,
  },

  // Player rows
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  playerRowMe: {
    backgroundColor: theme.primary + '08',
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
  },
  playerRank: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    width: 24,
    textAlign: 'center',
  },
  playerAvatarBox: {},
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    overflow: 'hidden',
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  playerClub: {
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 1,
  },
  playerElo: {
    fontSize: 15,
    fontWeight: '800',
  },
  playerWin: {
    fontSize: 10,
    color: theme.textMuted,
  },

  // Separator
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  sepLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  sepText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
  },

  // Footer CTAs
  footerCta: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 4,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border + '40',
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  secondaryCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  footerCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerCtaLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
  },
  footerCtaLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  footerCtaDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.border,
  },

  // Quick links row — positioned under header for visibility
  quickLinksRowTop: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: theme.border + '30',
  },
  quickLinkBtnTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.border + '60',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  quickLinkIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkTextTop: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
});
