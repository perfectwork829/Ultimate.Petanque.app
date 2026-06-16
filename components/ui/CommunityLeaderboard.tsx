
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { fetchLeaderboard, sortLeaderboard, LeaderboardPlayer, LeaderboardSort } from '@/services/leaderboardService';
import { getEloRank, getEloColor } from '@/services/eloService';
import { fetchClubLeaderboard, sortClubLeaderboard, LeaderboardClub } from '@/services/clubLeaderboardService';
import { fetchBoulesLeaderboard, aggregateBoulesData, sortBoulesLeaderboard, LeaderboardBoulesEntry } from '@/services/boulesLeaderboardService';
import { getBrandVisual, getBrandImage } from '@/constants/boulesDatabase';
import { getTrustScoreColor, getTrustScoreIcon } from '@/services/trustScoreService';
import { fetchEventLeaderboard, EventLeaderboardEntry, SponsoredEvent } from '@/services/sponsoredEventService';
import { extraTranslations } from '@/constants/i18nExtra';
import { CONTINENT_MAP, getContinent, getContinentLabel, getCountryFlag, getContinentFlag } from '@/constants/geoData';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WidgetTab = 'players' | 'clubs' | 'boules' | 'events';
type GeoScope = 'world' | 'continent' | 'country' | 'city';

const GEO_STORAGE_KEY = 'leaderboard_geo_scope';

export default function CommunityLeaderboard({ onFiltersToggled }: { onFiltersToggled?: (open: boolean) => void }) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const [activeTab, setActiveTab] = useState<WidgetTab>('players');

  // Geographic scope
  const [geoScope, setGeoScope] = useState<GeoScope>('world');
  const [geoValue, setGeoValue] = useState<string>('');
  const [geoInitialized, setGeoInitialized] = useState(false);

  // Players
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<LeaderboardSort>('elo');

  // Clubs
  const [clubs, setClubs] = useState<LeaderboardClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [clubsLoaded, setClubsLoaded] = useState(false);

  // Boules
  const [boulesRaw, setBoulesRaw] = useState<any[]>([]);
  const [boulesLoading, setBoulesLoading] = useState(false);
  const [boulesError, setBoulesError] = useState<string | null>(null);
  const [boulesLoaded, setBoulesLoaded] = useState(false);

  // Events
  const [eventEntries, setEventEntries] = useState<EventLeaderboardEntry[]>([]);
  const [recentEvents, setRecentEvents] = useState<SponsoredEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  useEffect(() => {
    if (geoInitialized) return;
    const initGeo = async () => {
      try {
        const saved = await AsyncStorage.getItem(GEO_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.scope && parsed.scope !== 'world') {
            setGeoScope(parsed.scope);
            if (parsed.value) setGeoValue(parsed.value);
            setGeoInitialized(true);
            return;
          }
        }
      } catch {}
      if (selfPlayer?.country) {
        const continent = getContinent(selfPlayer.country);
        setGeoScope('continent');
        setGeoValue(continent);
      }
      setGeoInitialized(true);
    };
    initGeo();
  }, [selfPlayer?.country, geoInitialized]);

  const updateGeoScope = useCallback((scope: GeoScope, value: string) => {
    setGeoScope(scope);
    setGeoValue(value);
    AsyncStorage.setItem(GEO_STORAGE_KEY, JSON.stringify({ scope, value })).catch(() => {});
  }, []);

  const loadPlayers = useCallback(async () => {
    setPlayersLoading(true);
    const { players: lbP, error: err } = await fetchLeaderboard();
    setPlayers(lbP);
    setPlayersError(err);
    setPlayersLoading(false);
  }, []);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  const loadClubs = useCallback(async () => {
    if (clubsLoaded) return;
    setClubsLoading(true);
    const { clubs: c, error: err } = await fetchClubLeaderboard();
    setClubs(c);
    setClubsError(err);
    setClubsLoading(false);
    setClubsLoaded(true);
  }, [clubsLoaded]);

  const loadBoules = useCallback(async () => {
    if (boulesLoaded) return;
    setBoulesLoading(true);
    const { entries, error: err } = await fetchBoulesLeaderboard();
    setBoulesRaw(entries);
    setBoulesError(err);
    setBoulesLoading(false);
    setBoulesLoaded(true);
  }, [boulesLoaded]);

  const loadEvents = useCallback(async () => {
    if (eventsLoaded) return;
    setEventsLoading(true);
    const { entries: evts, recentEvents: recEvts, error: err } = await fetchEventLeaderboard();
    setEventEntries(evts);
    setRecentEvents(recEvts);
    setEventsError(err);
    setEventsLoading(false);
    setEventsLoaded(true);
  }, [eventsLoaded]);

  useEffect(() => {
    if (activeTab === 'clubs') loadClubs();
    if (activeTab === 'boules') loadBoules();
    if (activeTab === 'events') loadEvents();
  }, [activeTab, loadClubs, loadBoules, loadEvents]);

  // Computed
  const geoFilteredPlayers = useMemo(() => {
    let filtered = players;
    if (geoScope === 'city' && geoValue) filtered = filtered.filter(p => p.city?.toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'country' && geoValue) filtered = filtered.filter(p => p.country?.toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'continent' && geoValue) filtered = filtered.filter(p => p.country ? getContinent(p.country) === geoValue : false);
    return filtered;
  }, [players, geoScope, geoValue]);

  const filteredSorted = useMemo(() => sortLeaderboard(geoFilteredPlayers, sortBy), [geoFilteredPlayers, sortBy]);
  const sortedClubs = useMemo(() => {
    let filtered = clubs;
    if (geoScope === 'city' && geoValue) filtered = filtered.filter((c: any) => c.city?.toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'country' && geoValue) filtered = filtered.filter((c: any) => (c.country || 'France').toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'continent' && geoValue) filtered = filtered.filter((c: any) => getContinent(c.country || 'France') === geoValue);
    return sortClubLeaderboard(filtered, 'compositeScore');
  }, [clubs, geoScope, geoValue]);
  const boulesEntries = useMemo(() => sortBoulesLeaderboard(aggregateBoulesData(boulesRaw, 'brand', 'all'), 'userCount'), [boulesRaw]);

  const uniqueCountries = useMemo(() => [...new Set(players.map(p => p.country).filter(Boolean) as string[])].sort(), [players]);
  const uniqueCities = useMemo(() => {
    let source = players;
    if (geoScope === 'country' && geoValue) source = source.filter(p => p.country?.toLowerCase() === geoValue.toLowerCase());
    return [...new Set(source.map(p => p.city).filter(Boolean) as string[])].sort();
  }, [players, geoScope, geoValue]);
  const uniqueContinents = useMemo(() => [...new Set(players.map(p => p.country ? getContinent(p.country) : null).filter(Boolean) as string[])].sort(), [players]);

  const myRank = useMemo(() => {
    if (!selfPlayer || !user) return null;
    const idx = filteredSorted.findIndex(p => p.userId === user.id || p.id === selfPlayer.id);
    return idx >= 0 ? idx + 1 : null;
  }, [filteredSorted, selfPlayer, user]);

  const isLoading = activeTab === 'players' ? playersLoading : activeTab === 'clubs' ? clubsLoading : activeTab === 'boules' ? boulesLoading : eventsLoading;
  const hasError = activeTab === 'players' ? playersError : activeTab === 'clubs' ? clubsError : activeTab === 'boules' ? boulesError : eventsError;

  const retryFn = useCallback(() => {
    if (activeTab === 'players') loadPlayers();
    else if (activeTab === 'clubs') { setClubsLoaded(false); loadClubs(); }
    else if (activeTab === 'boules') { setBoulesLoaded(false); loadBoules(); }
    else { setEventsLoaded(false); loadEvents(); }
  }, [activeTab, loadPlayers, loadClubs, loadBoules, loadEvents]);

  const [showFilters, setShowFilters] = useState(false);

  const geoLabel = useMemo(() => {
    if (geoScope === 'world') return language === 'fr' ? 'Monde' : 'World';
    if (!geoValue) return (extraTranslations.geoScope as any)?.[geoScope]?.[language] || geoScope;
    if (geoScope === 'continent') return `${getContinentFlag(geoValue)} ${getContinentLabel(geoValue, language === 'fr')}`;
    if (geoScope === 'country') return `${getCountryFlag(geoValue)} ${geoValue}`;
    return geoValue;
  }, [geoScope, geoValue, language]);

  const activeGeoCount = geoScope !== 'world' ? 1 : 0;

  return (
    <View style={s.section}>
      {/* Modern gradient header */}
      <LinearGradient colors={['#1E293B', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.headerGradient}>
        <View style={s.headerRow}>
          <View style={s.headerIcon}>
            <MaterialIcons name="emoji-events" size={20} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{t('leaderboard', 'title')}</Text>
            <Text style={s.headerCount}>
              {activeTab === 'players' ? `${filteredSorted.length} ${language === 'fr' ? 'joueurs verifies' : 'verified players'}`
                : activeTab === 'clubs' ? `${sortedClubs.length} ${t('leaderboard', 'publicClubsCount')}`
                : activeTab === 'boules' ? `${boulesEntries.length} ${t('leaderboard', 'publicBoulesCount')}`
                : `${eventEntries.length} ${t('leaderboard', 'publicEventsCount')}`}
              {myRank && activeTab === 'players' ? ` • #${myRank}` : ''}
            </Text>
          </View>
          {/* Geo pill */}
          <Pressable
            style={[s.geoPill, activeGeoCount > 0 && s.geoPillActive]}
            onPress={() => { Haptics.selectionAsync(); setShowFilters(!showFilters); }}
          >
            <MaterialIcons name={geoScope === 'world' ? 'public' : geoScope === 'continent' ? 'travel-explore' : geoScope === 'country' ? 'flag' : 'place'} size={14} color={activeGeoCount > 0 ? '#F59E0B' : '#94A3B8'} />
            <Text style={[s.geoPillText, activeGeoCount > 0 && s.geoPillTextActive]} numberOfLines={1}>{geoLabel}</Text>
            <MaterialIcons name={showFilters ? 'expand-less' : 'expand-more'} size={16} color={activeGeoCount > 0 ? '#F59E0B' : '#94A3B8'} />
          </Pressable>
        </View>

        {/* Tab icons */}
        <View style={s.tabRow}>
          {([
            { id: 'players' as WidgetTab, icon: 'people', label: t('leaderboard', 'tabPlayers') },
            { id: 'clubs' as WidgetTab, icon: 'home', label: t('leaderboard', 'tabClubs') },
            { id: 'boules' as WidgetTab, icon: 'sports-baseball', label: t('leaderboard', 'tabBoules') },
            { id: 'events' as WidgetTab, icon: 'campaign', label: t('leaderboard', 'tabEvents') },
          ]).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable key={tab.id} style={[s.tabItem, isActive && s.tabItemActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.id); }}>
                <MaterialIcons name={tab.icon as any} size={18} color={isActive ? '#F59E0B' : '#64748B'} />
                <Text style={[s.tabLabel, isActive && s.tabLabelActive]}>{tab.label}</Text>
                {isActive ? <View style={s.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* Expandable geo filters */}
        {showFilters ? (
          <Animated.View entering={FadeIn.duration(200)} style={s.geoPanel}>
            <View style={s.geoScopeRow}>
              {(['world', 'continent', 'country', 'city'] as GeoScope[]).map(scope => {
                const isActive = geoScope === scope;
                const icons: Record<GeoScope, string> = { world: 'public', continent: 'travel-explore', country: 'flag', city: 'place' };
                const labels: Record<GeoScope, string> = {
                  world: (extraTranslations.geoScope?.world as any)?.[language] || 'World',
                  continent: (extraTranslations.geoScope?.continent as any)?.[language] || 'Continent',
                  country: (extraTranslations.geoScope?.country as any)?.[language] || 'Country',
                  city: (extraTranslations.geoScope?.city as any)?.[language] || 'City',
                };
                return (
                  <Pressable
                    key={scope}
                    style={[s.geoScopeChip, isActive && s.geoScopeChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      let val = '';
                      if (scope === 'world') val = '';
                      else if (scope === 'continent') {
                        if (uniqueContinents.length === 1) val = uniqueContinents[0];
                        else if (selfPlayer?.country) val = getContinent(selfPlayer.country);
                      } else if (scope === 'country') {
                        if (uniqueCountries.length === 1) val = uniqueCountries[0];
                        else if (selfPlayer?.country) val = selfPlayer.country;
                      } else if (scope === 'city') {
                        if (uniqueCities.length === 1) val = uniqueCities[0];
                        else if (selfPlayer?.location?.city) val = selfPlayer.location.city;
                      }
                      updateGeoScope(scope, val);
                    }}
                  >
                    <MaterialIcons name={icons[scope] as any} size={13} color={isActive ? '#FFF' : '#94A3B8'} />
                    <Text style={[s.geoScopeText, isActive && s.geoScopeTextActive]}>{labels[scope]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {geoScope !== 'world' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.geoValueRow}>
                {(geoScope === 'continent' ? uniqueContinents : geoScope === 'country' ? uniqueCountries : uniqueCities).map(val => {
                  const isActive = geoValue === val;
                  return (
                    <Pressable key={val} style={[s.geoValueChip, isActive && s.geoValueChipActive]} onPress={() => { Haptics.selectionAsync(); updateGeoScope(geoScope, isActive ? '' : val); }}>
                      <Text style={[s.geoValueText, isActive && s.geoValueTextActive]} numberOfLines={1}>
                        {geoScope === 'continent' ? `${getContinentFlag(val)} ${getContinentLabel(val, language === 'fr')}` : geoScope === 'country' ? `${getCountryFlag(val)} ${val}` : val}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </Animated.View>
        ) : null}
      </LinearGradient>

      {/* Sort pills — players only */}
      {activeTab === 'players' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortRow}>
          {([
            { id: 'elo' as LeaderboardSort, label: t('leaderboard', 'eloRating') },
            { id: 'winRate' as LeaderboardSort, label: t('leaderboard', 'sortByWinRate') },
            { id: 'matches' as LeaderboardSort, label: t('leaderboard', 'sortByMatches') },
            { id: 'tirRate' as LeaderboardSort, label: t('leaderboard', 'sortByTirRate') },
            { id: 'pointRate' as LeaderboardSort, label: t('leaderboard', 'sortByPointRate') },
            { id: 'carreauRate' as LeaderboardSort, label: t('leaderboard', 'sortByCarreauRate') },
          ]).map(chip => (
            <Pressable key={chip.id} style={[s.sortChip, sortBy === chip.id && s.sortChipActive]} onPress={() => { Haptics.selectionAsync(); setSortBy(chip.id); }}>
              <Text style={[s.sortChipText, sortBy === chip.id && s.sortChipTextActive]}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Content card */}
      <View style={s.card}>
        {isLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#F59E0B" />
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : hasError ? (
          <View style={s.center}>
            <MaterialIcons name="error-outline" size={36} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
            <Pressable style={s.retryBtn} onPress={retryFn}><Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text></Pressable>
          </View>
        ) : activeTab === 'players' ? (
          filteredSorted.length === 0 ? (
            <View style={s.center}>
              <MaterialIcons name="people-outline" size={40} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{t('leaderboard', 'noPlayers')}</Text>
              <Text style={s.emptyDesc}>{t('leaderboard', 'noPlayersDesc')}</Text>
            </View>
          ) : (
            <>
              {/* Top 3 podium */}
              {filteredSorted.length >= 3 ? (
                <View style={s.podium}>
                  {[1, 0, 2].map((orderedIdx, displayRank) => { // Use orderedIdx to get original position, displayRank for visual rank
                    const p = filteredSorted[orderedIdx];
                    if (!p) return null;
                    const rank = orderedIdx + 1;
                    const isMe = user && (p.userId === user.id || (selfPlayer && p.id === selfPlayer.id));
                    const heights = [64, 80, 52];
                    const sizes = [44, 52, 40];
                    const colors = ['#C0C0C0', '#FFD700', '#CD7F32'];
                    
                    // Map displayRank (0, 1, 2) to specific heights/sizes/colors
                    const currentHeight = heights[displayRank];
                    const currentSize = sizes[displayRank];
                    const currentColor = colors[rank - 1]; // Use rank-1 for 0-indexed colors

                    return (
                      <Pressable key={p.id} style={[s.podiumItem, { marginTop: displayRank === 0 ? 0 : displayRank === 1 ? 0 : 16 }]} onPress={() => router.push(isMe ? '/player/me' : `/player/${p.id}` as any)}>
                        <View style={[s.podiumAvatarWrap, { width: currentSize, height: currentSize, borderColor: currentColor }]}>
                          {p.avatar ? (
                            <Image source={{ uri: p.avatar }} style={{ width: currentSize - 4, height: currentSize - 4, borderRadius: (currentSize - 4) / 2 }} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                          ) : (
                            <View style={{ width: currentSize - 4, height: currentSize - 4, borderRadius: (currentSize - 4) / 2, backgroundColor: isMe ? theme.primary : '#334155', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: currentSize * 0.3, fontWeight: '700', color: '#FFF' }}>{p.name.charAt(0)}</Text>
                            </View>
                          )}
                          <View style={[s.podiumRankBadge, { backgroundColor: currentColor }]}>
                            <Text style={s.podiumRankText}>{rank}</Text>
                          </View>
                        </View>
                        <Text style={[s.podiumName, isMe && { color: theme.primary }]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                        {p.country ? <Text style={s.podiumFlag}>{getCountryFlag(p.country)}</Text> : null}
                        <Text style={s.podiumStat}>{p.stats.winRate}%</Text>
                        <View style={[s.podiumBar, { height: currentHeight, backgroundColor: currentColor + '25' }]}>
                          <Text style={[s.podiumBarText, { color: currentColor }]}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* Remaining rows */}
              {filteredSorted.slice(filteredSorted.length >= 3 ? 3 : 0, 10).map((p, idx) => {
                const rank = (filteredSorted.length >= 3 ? 3 : 0) + idx + 1;
                const isMe = user && (p.userId === user.id || (selfPlayer && p.id === selfPlayer.id));
                return (
                  <Pressable key={p.id} style={[s.row, isMe && s.rowMe]} onPress={() => router.push(isMe ? '/player/me' : `/player/${p.id}` as any)}>
                    <Text style={s.rankText}>{rank}</Text>
                    <View style={s.avatarWrap}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[s.avatar, { backgroundColor: isMe ? theme.primary : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }]}>
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
                        <View style={s.verifiedBadge}>
                          <MaterialIcons name="verified-user" size={10} color="#22C55E" />
                        </View>
                        {p.stats.matchesPlayed >= 3 ? (
                          <View style={s.antiCheatBadge}>
                            <MaterialIcons name="shield" size={8} color="#3B82F6" />
                            <Text style={s.antiCheatText}>{p.stats.matchesPlayed}</Text>
                          </View>
                        ) : null}
                        {p.isAmbassador ? <MaterialIcons name="verified" size={12} color="#7C3AED" /> : p.isPremium ? <MaterialIcons name="star" size={11} color="#A8B4C0" /> : null}
                      </View>
                      {p.club ? <Text style={s.playerClub} numberOfLines={1}>{p.club}</Text> : null}
                    </View>
                    <View style={s.rowStats}>
                      <Text style={[s.rowStatMain, sortBy === 'elo' ? { color: getEloColor(p.eloRating || 1000) } : sortBy === 'winRate' ? { color: '#F59E0B' } : undefined]}>
                        {sortBy === 'elo' ? (p.eloRating || 1000) : `${p.stats.winRate}%`}
                      </Text>
                      <Text style={s.rowStatSub}>{sortBy === 'elo' ? `${p.stats.winRate}%` : `${p.stats.matchesPlayed} ${t('leaderboard', 'matches')}`}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* My rank if not visible */}
              {myRank && myRank > 10 ? (() => {
                const myP = filteredSorted[myRank - 1];
                if (!myP) return null;
                return (
                  <React.Fragment key="my-rank">
                    <View style={s.separator}><View style={s.separatorLine} /><Text style={s.separatorText}>#{myRank}</Text><View style={s.separatorLine} /></View>
                    <Pressable style={[s.row, s.rowMe]} onPress={() => router.push('/player/me' as any)}>
                      <Text style={[s.rankText, { color: theme.primary }]}>{myRank}</Text>
                      <View style={s.avatarWrap}>
                        {myP.avatar ? (
                          <Image source={{ uri: myP.avatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                        ) : (
                          <View style={[s.avatar, { backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{myP.name.charAt(0)}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {myP.country ? <Text style={{ fontSize: 12 }}>{getCountryFlag(myP.country)}</Text> : null}
                          <Text style={[s.playerName, { color: theme.primary }]} numberOfLines={1}>{myP.name} ({t('leaderboard', 'you')})</Text>
                        </View>
                        {myP.club ? <Text style={s.playerClub} numberOfLines={1}>{myP.club}</Text> : null}
                      </View>
                      <View style={s.rowStats}>
                        <Text style={[s.rowStatMain, { color: '#F59E0B' }]}>{sortBy === 'elo' ? (myP.eloRating || 1000) : `${myP.stats.winRate}%`}</Text>
                        <Text style={s.rowStatSub}>{sortBy === 'elo' ? `${myP.stats.winRate}%` : `${myP.stats.matchesPlayed} ${t('leaderboard', 'matches')}`}</Text>
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })() : null}

              {!myRank && selfPlayer ? (
                <View style={s.note}>
                  <MaterialIcons name="info-outline" size={14} color={theme.textMuted} />
                  <Text style={s.noteText}>
                    {language === 'fr'
                      ? 'Rendez votre profil public et jouez au moins 3 matchs pour apparaitre. Filtrez par zone geographique (monde, continent, pays, ville) pour affiner le classement.'
                      : 'Make your profile public and play at least 3 matches to appear. Filter by geographic zone (world, continent, country, city) to refine rankings.'}
                  </Text>
                </View>
              ) : null}
            </>
          )
        ) : activeTab === 'clubs' ? (
          <>
            {/* Quick access links — inline at top of clubs tab */}
            <View style={s.clubQuickLinksRow}>
              <Pressable style={s.clubQuickLinkBtn} onPress={() => { Haptics.selectionAsync(); router.push('/club-city-ranking' as any); }}>
                <MaterialIcons name="location-city" size={15} color="#F59E0B" />
                <Text style={[s.clubQuickLinkText, { color: '#F59E0B' }]}>{language === 'fr' ? 'Par Ville' : 'By City'}</Text>
              </Pressable>
              <Pressable style={s.clubQuickLinkBtn} onPress={() => { Haptics.selectionAsync(); router.push('/club-compare' as any); }}>
                <MaterialIcons name="compare-arrows" size={15} color="#9333EA" />
                <Text style={[s.clubQuickLinkText, { color: '#9333EA' }]}>{language === 'fr' ? 'Comparer' : 'Compare'}</Text>
              </Pressable>
              <Pressable style={s.clubQuickLinkBtn} onPress={() => { Haptics.selectionAsync(); router.push('/leaderboard-geo' as any); }}>
                <MaterialIcons name="public" size={15} color="#3B82F6" />
                <Text style={[s.clubQuickLinkText, { color: '#3B82F6' }]}>Geo</Text>
              </Pressable>
            </View>
            {sortedClubs.length === 0 ? (
              <View style={s.center}><MaterialIcons name="home" size={40} color={theme.textMuted} /><Text style={s.emptyTitle}>{t('leaderboard', 'noClubs')}</Text></View>
            ) : (
              <>
                {sortedClubs.slice(0, 5).map((club, idx) => {
                const rank = idx + 1;
                const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
                const mc = medalColors[rank];
                const isUnranked = !club.hasQualifiedPlayers || (club.totalMatches === 0 && club.stats.totalWins === 0) || club.stats.compositeScore === 0;
                return (
                  <Pressable key={club.id} style={[s.row, idx < 4 && { borderBottomWidth: 1, borderBottomColor: theme.border + '30' }, isUnranked && { opacity: 0.65 }]} onPress={() => router.push({ pathname: `/club-ranking/${club.id}`, params: { name: club.name } } as any)}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      {isUnranked ? <MaterialIcons name="remove-circle-outline" size={16} color="#94A3B8" /> : mc ? <Text style={{ fontSize: 14 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text> : <Text style={s.rankText}>{rank}</Text>}
                    </View>
                    <View style={s.avatarWrap}>
                      {club.logo ? (
                        <Image source={{ uri: club.logo }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[s.avatar, { backgroundColor: isUnranked ? '#94A3B815' : '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}><MaterialIcons name="home" size={16} color={isUnranked ? '#94A3B8' : '#F59E0B'} /></View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.playerName, isUnranked && { color: '#94A3B8' }]} numberOfLines={1}>{club.name}</Text>
                        {isUnranked ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#94A3B812', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#94A3B820' }}>
                            <MaterialIcons name="hourglass-empty" size={9} color="#94A3B8" />
                            <Text style={{ fontSize: 8, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.3 }}>{language === 'fr' ? 'NON CLASSE' : 'UNRANKED'}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {club.city ? <Text style={s.playerClub} numberOfLines={1}>{club.city}</Text> : null}
                        <Text style={{ fontSize: 10, color: theme.textMuted }}>{club.playerCount} {t('leaderboard', 'clubPlayers')}</Text>
                      </View>
                      {isUnranked ? (
                        <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 2, fontStyle: 'italic', lineHeight: 12 }}>
                          {language === 'fr' ? 'Pas encore de membres qualifies (3+ matchs)' : 'No qualified members yet (3+ matches)'}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {isUnranked ? (
                        <View style={{ alignItems: 'center' }}>
                          <MaterialIcons name="hourglass-empty" size={18} color="#CBD5E1" />
                          <Text style={{ fontSize: 8, fontWeight: '700', color: '#CBD5E1', marginTop: 2 }}>{language === 'fr' ? 'En attente' : 'Pending'}</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={{ fontSize: 16, fontWeight: '900', color: '#F59E0B' }}>{club.stats.compositeScore}</Text>
                          <Text style={{ fontSize: 9, color: theme.textMuted }}>{club.stats.avgWinRate}% V</Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                );
              })}
              </>
            )}
          </>
        ) : activeTab === 'events' ? (
          eventEntries.length === 0 ? (
            <View style={s.center}><MaterialIcons name="campaign" size={40} color={theme.textMuted} /><Text style={s.emptyTitle}>{t('leaderboard', 'noEvents')}</Text></View>
          ) : (
            <>
              {eventEntries.slice(0, 5).map((entry, idx) => {
                const rank = idx + 1;
                return (
                  <View key={entry.userId} style={[s.row, idx < 4 && { borderBottomWidth: 1, borderBottomColor: theme.border + '30' }]}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      {rank <= 3 ? <Text style={{ fontSize: 14 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text> : <Text style={s.rankText}>{rank}</Text>}
                    </View>
                    <View style={s.avatarWrap}>
                      {entry.userAvatar ? (
                        <Image source={{ uri: entry.userAvatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[s.avatar, { backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>{entry.userName.charAt(0)}</Text></View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.playerName} numberOfLines={1}>{entry.userName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {entry.wins > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F59E0B12', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}><MaterialIcons name="emoji-events" size={9} color="#F59E0B" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#F59E0B' }}>{entry.wins}</Text></View> : null}
                        {entry.podiums > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#7C3AED10', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}><MaterialIcons name="military-tech" size={9} color="#7C3AED" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>{entry.podiums}</Text></View> : null}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#7C3AED' }}>{entry.avgScore}%</Text>
                      <Text style={{ fontSize: 9, color: theme.textMuted }}>{entry.eventsCompleted} {t('leaderboard', 'tabEvents').toLowerCase()}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )
        ) : (
          boulesEntries.length === 0 ? (
            <View style={s.center}><MaterialIcons name="sports-baseball" size={40} color={theme.textMuted} /><Text style={s.emptyTitle}>{t('leaderboard', 'noBoules')}</Text></View>
          ) : (
            <>
              {boulesEntries.slice(0, 5).map((entry, idx) => {
                const rank = idx + 1;
                return (
                  <Pressable key={entry.id} style={[s.row, idx < 4 && { borderBottomWidth: 1, borderBottomColor: theme.border + '30' }]} onPress={() => router.push({ pathname: `/boules-ranking/${encodeURIComponent(entry.id)}`, params: { brand: entry.brand, model: entry.model || '', mode: 'brand' } } as any)}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      {rank <= 3 ? <Text style={{ fontSize: 14 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text> : <Text style={s.rankText}>{rank}</Text>}
                    </View>
                    {(() => { const bv = getBrandVisual(entry.brand); const bImg = getBrandImage(entry.brand); return (
                    <View style={[s.avatar, { backgroundColor: bImg ? '#FFF' : bv.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }]}>
                      {bImg ? <Image source={bImg} style={{ width: '75%', height: '75%' }} contentFit="contain" transition={200} /> : <Text style={{ fontSize: 9, fontWeight: '900', color: bv.text }}>{bv.abbr}</Text>}
                    </View>
                    ); })()}
                    <View style={{ flex: 1 }}>
                      <Text style={s.playerName} numberOfLines={1}>{entry.brand}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={{ fontSize: 10, color: theme.textMuted }}>{entry.userCount} {t('leaderboard', 'boulesUsers')}</Text>
                        <Text style={{ fontSize: 10, color: theme.textMuted }}>{entry.totalMatches} {t('leaderboard', 'boulesMatches')}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#F59E0B' }}>{entry.stats.avgWinRate}%</Text>
                      <Text style={{ fontSize: 9, color: theme.textMuted }}>Tir {entry.stats.avgTirRate}%</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )
        )}

        {/* CTA */}
        <View style={s.ctaRow}>
          <Pressable style={s.ctaBtn} onPress={() => { Haptics.selectionAsync(); router.push('/leaderboard' as any); }}>
            <Text style={s.ctaBtnText}>{t('leaderboard', 'seeFullLeaderboard')}</Text>
            <MaterialIcons name="arrow-forward" size={16} color="#F59E0B" />
          </Pressable>
          <Pressable style={s.geoCtaBtn} onPress={() => { Haptics.selectionAsync(); router.push('/leaderboard-geo' as any); }}>
            <MaterialIcons name="public" size={14} color="#3B82F6" />
            <Text style={s.geoCtaBtnText}>{language === 'fr' ? 'Classement Geo' : 'Geo Ranking'}</Text>
            <MaterialIcons name="arrow-forward" size={14} color="#3B82F6" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { borderRadius: 20, overflow: 'hidden' as const },

  // Header gradient
  headerGradient: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' as const },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
  headerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F59E0B18', alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { fontSize: 16, fontWeight: '800' as const, color: '#FFF', letterSpacing: -0.3 },
  headerCount: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  // Geo pill
  geoPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, maxWidth: 150 },
  geoPillActive: { backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B40' },
  geoPillText: { fontSize: 11, fontWeight: '600' as const, color: '#94A3B8', maxWidth: 80 },
  geoPillTextActive: { color: '#F59E0B' },

  // Tabs
  tabRow: { flexDirection: 'row' as const, gap: 2, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3 },
  tabItem: { flex: 1, alignItems: 'center' as const, paddingVertical: 8, borderRadius: 12, gap: 3, position: 'relative' as const },
  tabItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  tabLabel: { fontSize: 10, fontWeight: '600' as const, color: '#64748B' },
  tabLabelActive: { color: '#F59E0B', fontWeight: '700' as const },
  tabIndicator: { position: 'absolute' as const, bottom: 2, width: 16, height: 2, borderRadius: 1, backgroundColor: '#F59E0B' },

  // Geo panel (expandable)
  geoPanel: { marginTop: 8, gap: 8 },
  geoScopeRow: { flexDirection: 'row' as const, gap: 6 },
  geoScopeChip: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  geoScopeChipActive: { backgroundColor: '#F59E0B30' },
  geoScopeText: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8' },
  geoScopeTextActive: { color: '#FFF', fontWeight: '700' as const },
  geoValueRow: { gap: 6 },
  geoValueChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  geoValueChipActive: { backgroundColor: '#F59E0B30' },
  geoValueText: { fontSize: 11, fontWeight: '600' as const, color: '#94A3B8', maxWidth: 110 },
  geoValueTextActive: { color: '#FFF' },

  // Sort
  sortRow: { gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface, overflow: 'hidden' as const },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  sortChipActive: { backgroundColor: '#F59E0B15', borderColor: '#F59E0B60' },
  sortChipText: { fontSize: 11, fontWeight: '600' as const, color: theme.textSecondary },
  sortChipTextActive: { color: '#F59E0B', fontWeight: '700' as const },

  // Content card
  card: { backgroundColor: theme.surface, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden' as const },
  center: { alignItems: 'center' as const, paddingVertical: 28 },
  loadingText: { fontSize: 13, color: theme.textMuted, marginTop: 12 },
  errorText: { fontSize: 13, color: theme.textSecondary, marginTop: 8 },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F59E0B15', borderRadius: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '600' as const, color: '#F59E0B' },
  emptyTitle: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary, marginTop: 12 },
  emptyDesc: { fontSize: 12, color: theme.textSecondary, textAlign: 'center' as const, marginTop: 4, maxWidth: 240 },

  // Podium
  podium: { flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'flex-end' as const, paddingVertical: 16, paddingHorizontal: 8, gap: 8 },
  podiumItem: { alignItems: 'center' as const, flex: 1, gap: 4 },
  podiumAvatarWrap: { borderRadius: 100, borderWidth: 2.5, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const, position: 'relative' as const },
  podiumRankBadge: { position: 'absolute' as const, bottom: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: '#FFF' },
  podiumRankText: { fontSize: 10, fontWeight: '900' as const, color: '#FFF' },
  podiumName: { fontSize: 12, fontWeight: '700' as const, color: theme.textPrimary, maxWidth: 80, textAlign: 'center' as const },
  podiumFlag: { fontSize: 12, lineHeight: 14 },
  podiumStat: { fontSize: 13, fontWeight: '800' as const, color: '#F59E0B' },
  verifiedBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#22C55E15', alignItems: 'center' as const, justifyContent: 'center' as const },
  antiCheatBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, backgroundColor: '#3B82F610', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6 },
  antiCheatText: { fontSize: 8, fontWeight: '700' as const, color: '#3B82F6' },
  podiumBar: { width: '80%', borderRadius: 6, alignItems: 'center' as const, justifyContent: 'flex-end' as const, paddingBottom: 6, marginTop: 4 },
  podiumBarText: { fontSize: 14 },

  // Rows
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, gap: 10 },
  rowMe: { backgroundColor: theme.primary + '08', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8, borderLeftWidth: 3, borderLeftColor: theme.primary },
  rankText: { fontSize: 13, fontWeight: '600' as const, color: theme.textMuted, width: 24, textAlign: 'center' as const },
  avatarWrap: {},
  avatar: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' as const },
  playerName: { fontSize: 13, fontWeight: '600' as const, color: theme.textPrimary },
  playerClub: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  rowStats: { alignItems: 'flex-end' as const },
  rowStatMain: { fontSize: 15, fontWeight: '800' as const, color: theme.textPrimary },
  rowStatSub: { fontSize: 9, color: theme.textMuted },

  // Separator
  separator: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 6 },
  separatorLine: { flex: 1, height: 1, backgroundColor: theme.border },
  separatorText: { fontSize: 11, fontWeight: '700' as const, color: theme.textMuted },

  note: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  noteText: { flex: 1, fontSize: 11, color: theme.textMuted, lineHeight: 16 },

  // CTA
  clubQuickLinksRow: { flexDirection: 'row' as const, gap: 6, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '30' },
  clubQuickLinkBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5, backgroundColor: theme.backgroundSecondary, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border + '40' },
  clubQuickLinkText: { fontSize: 11, fontWeight: '700' as const },
  ctaRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: theme.border, gap: 0 },
  ctaBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border + '50' },
  ctaBtnText: { fontSize: 14, fontWeight: '700' as const, color: '#F59E0B' },
  geoCtaBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 12 },
  geoCtaBtnText: { fontSize: 13, fontWeight: '600' as const, color: '#3B82F6' },
});
