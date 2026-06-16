import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  Dimensions,
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
import { useAuth, useAlert } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { fetchWeeklyLeaderboard, getSubRankings, WeeklyRankChange } from '@/services/weeklyLeaderboardService';
import { fetchLeaderboard, LeaderboardPlayer, sortLeaderboard, LEADERBOARD_MIN_MATCHES } from '@/services/leaderboardService';
import { getMyActiveMeetups, inviteSingleUserToMeetup, Meetup } from '@/services/meetupService';
import { extraTranslations } from '@/constants/i18nExtra';
import { getContinent, getContinentLabel, getCountryFlag, getContinentFlag } from '@/constants/geoData';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEO_STORAGE_KEY = 'city_leaderboard_geo_scope';

export default function CityLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { selfPlayer } = useAppData();
  const params = useLocalSearchParams<{ city?: string; type?: string; value?: string }>();

  // Support country/continent detail pages
  const pageType = (params.type as 'city' | 'country' | 'continent') || 'city';

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const [loading, setLoading] = useState(true);
  const [allPlayers, setAllPlayers] = useState<LeaderboardPlayer[]>([]);
  const [weeklyPlayers, setWeeklyPlayers] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState(params.city || params.value || '');
  const [showCityPicker, setShowCityPicker] = useState(!params.city && !params.value);
  const [citySearch, setCitySearch] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'alltime' | 'weekly'>('alltime');

  // Geographic scope filter
  type GeoScope = 'world' | 'continent' | 'country' | 'city';
  const [geoScope, setGeoScope] = useState<GeoScope>('world');
  const [geoValue, setGeoValue] = useState<string>('');
  const [geoInitialized, setGeoInitialized] = useState(false);

  // Auto-detect geo scope
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

  // Meetup invitation
  const [showMeetupPicker, setShowMeetupPicker] = useState(false);
  const [meetupPickerUserId, setMeetupPickerUserId] = useState<string | null>(null);
  const [meetupPickerUserName, setMeetupPickerUserName] = useState('');
  const [activeMeetups, setActiveMeetups] = useState<Meetup[]>([]);
  const [loadingMeetups, setLoadingMeetups] = useState(false);
  const [invitingToMeetup, setInvitingToMeetup] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [allTimeRes, weeklyRes] = await Promise.all([
        fetchLeaderboard(),
        fetchWeeklyLeaderboard(),
      ]);
      setAllPlayers(allTimeRes.players);
      setWeeklyPlayers(weeklyRes.players);

      // Extract unique cities
      const citySet = new Set<string>();
      allTimeRes.players.forEach(p => { if (p.city) citySet.add(p.city); });
      weeklyRes.players.forEach((p: any) => { if (p.city) citySet.add(p.city); });
      setCities([...citySet].sort());
      setLoading(false);
    };
    load();
  }, []);

  // Geo-derived unique values
  const uniqueCountries = useMemo(() => {
    const cs = allPlayers.map(p => p.country).filter(Boolean) as string[];
    return [...new Set(cs)].sort();
  }, [allPlayers]);

  const uniqueContinents = useMemo(() => {
    const cs = allPlayers.map(p => p.country ? getContinent(p.country) : null).filter(Boolean) as string[];
    return [...new Set(cs)].sort();
  }, [allPlayers]);

  // Filter cities by geo scope
  const geoFilteredCities = useMemo(() => {
    if (geoScope === 'world' || !geoValue) return cities;
    // Get players matching geo filter, then extract their cities
    let filtered = allPlayers;
    if (geoScope === 'continent') {
      filtered = filtered.filter(p => p.country ? getContinent(p.country) === geoValue : false);
    } else if (geoScope === 'country') {
      filtered = filtered.filter(p => p.country?.toLowerCase() === geoValue.toLowerCase());
    }
    const citySet = new Set<string>();
    filtered.forEach(p => { if (p.city) citySet.add(p.city); });
    return [...citySet].sort();
  }, [cities, allPlayers, geoScope, geoValue]);

  const cityPlayers = useMemo(() => {
    if (!selectedCity) return [];
    const source = mode === 'weekly' ? weeklyPlayers : allPlayers;
    let filtered: any[];
    if (pageType === 'country') {
      filtered = source.filter((p: any) => p.country?.toLowerCase() === selectedCity.toLowerCase());
    } else if (pageType === 'continent') {
      filtered = source.filter((p: any) => p.country ? getContinent(p.country) === selectedCity : false);
    } else {
      filtered = source.filter((p: any) => p.city?.toLowerCase() === selectedCity.toLowerCase());
    }
    if (geoScope === 'continent' && geoValue) {
      filtered = filtered.filter((p: any) => p.country ? getContinent(p.country) === geoValue : false);
    } else if (geoScope === 'country' && geoValue) {
      filtered = filtered.filter((p: any) => p.country?.toLowerCase() === geoValue.toLowerCase());
    }
    return filtered.sort((a: any, b: any) => {
        if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
        return b.stats.matchesPlayed - a.stats.matchesPlayed;
      });
  }, [selectedCity, mode, allPlayers, weeklyPlayers, geoScope, geoValue, pageType]);

  const filteredCityPlayers = useMemo(() => {
    if (!search.trim()) return cityPlayers;
    const q = search.toLowerCase().trim();
    return cityPlayers.filter((p: any) => p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q));
  }, [cityPlayers, search]);

  const availableValues = useMemo(() => {
    if (pageType === 'country') {
      const cs = allPlayers.map(p => p.country).filter(Boolean) as string[];
      return [...new Set(cs)].sort();
    }
    if (pageType === 'continent') {
      const cs = allPlayers.map(p => p.country ? getContinent(p.country) : null).filter(Boolean) as string[];
      return [...new Set(cs)].sort();
    }
    return geoFilteredCities;
  }, [pageType, allPlayers, geoFilteredCities]);

  const filteredCities = useMemo(() => {
    const base = availableValues;
    if (!citySearch.trim()) return base;
    const q = citySearch.toLowerCase().trim();
    return base.filter(c => {
      if (pageType === 'continent') return getContinentLabel(c, language === 'fr').toLowerCase().includes(q) || c.toLowerCase().includes(q);
      return c.toLowerCase().includes(q);
    });
  }, [availableValues, citySearch, pageType, language]);

  const handleInviteToMeetup = useCallback(async (targetUserId: string, targetName: string) => {
    Haptics.selectionAsync();
    setMeetupPickerUserId(targetUserId);
    setMeetupPickerUserName(targetName);
    setLoadingMeetups(true);
    setShowMeetupPicker(true);
    const { meetups: mts } = await getMyActiveMeetups();
    setActiveMeetups(mts);
    setLoadingMeetups(false);
  }, []);

  const handleConfirmInvite = useCallback(async (meetupId: string) => {
    if (!meetupPickerUserId) return;
    setInvitingToMeetup(meetupId);
    const { error: err } = await inviteSingleUserToMeetup(meetupId, meetupPickerUserId);
    setInvitingToMeetup(null);
    if (err === 'already_participant') {
      showAlert(t('meetup', 'alreadyParticipant'));
    } else if (err) {
      showAlert(t('common', 'error'), err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('meetup', 'inviteSentSuccess'), t('meetup', 'inviteSentSuccessDesc'));
      setShowMeetupPicker(false);
    }
  }, [meetupPickerUserId, showAlert, t]);

  const renderPlayer = useCallback(({ item, index }: { item: any; index: number }) => {
    const rank = index + 1;
    const isMe = !!(user && (item.userId === user.id || (selfPlayer && item.id === selfPlayer.id)));
    const rc = item.rankChange as WeeklyRankChange | undefined;
    const canInvite = !isMe && item.userId && item.userId !== user?.id;
    const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
    const medalColor = medalColors[rank];

    return (
      <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 30, 300))}>
        <Pressable
          style={[cs.playerRow, isMe && cs.playerRowMe]}
          onPress={() => router.push(isMe ? '/player/me' : `/player/${item.id}` as any)}
        >
          {/* Rank */}
          <View style={cs.rankCol}>
            {medalColor ? (
              <View style={[cs.medal, { backgroundColor: medalColor + '20' }]}>
                <Text style={[cs.medalText, { color: medalColor }]}>{rank}</Text>
              </View>
            ) : (
              <Text style={cs.rankText}>{rank}</Text>
            )}
          </View>

          {/* Avatar + Info */}
          <View style={cs.playerInfo}>
            <View style={cs.avatarWrap}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={cs.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
              ) : (
                <View style={[cs.avatar, { backgroundColor: isMe ? theme.primary : theme.textMuted + '30', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isMe ? '#FFF' : theme.textSecondary }}>{item.name.charAt(0)}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cs.playerName, isMe && { color: theme.primary }]} numberOfLines={1}>
                {item.name}{isMe ? ` (${t('leaderboard', 'you')})` : ''}
              </Text>
              {item.club ? <Text style={cs.playerClub} numberOfLines={1}>{item.club}</Text> : null}
            </View>

            {/* Rank change (weekly only) */}
            {mode === 'weekly' && rc ? (
              <View style={{ marginRight: 8 }}>
                {rc.direction === 'up' ? (
                  <View style={cs.rankUpBadge}>
                    <MaterialIcons name="arrow-upward" size={12} color="#10B981" />
                    <Text style={cs.rankUpText}>+{rc.diff}</Text>
                  </View>
                ) : rc.direction === 'down' ? (
                  <View style={cs.rankDownBadge}>
                    <MaterialIcons name="arrow-downward" size={12} color="#EF4444" />
                    <Text style={cs.rankDownText}>-{rc.diff}</Text>
                  </View>
                ) : rc.direction === 'new' ? (
                  <View style={cs.rankNewBadge}>
                    <Text style={cs.rankNewText}>NEW</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Stats */}
          <View style={cs.statsRow}>
            <View style={cs.statBlock}>
              <Text style={[cs.statValue, { color: '#D97706' }]}>{item.stats.winRate}%</Text>
              <Text style={cs.statLabel}>{t('leaderboard', 'winRate')}</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={cs.statValue}>{item.stats.matchesPlayed}</Text>
              <Text style={cs.statLabel}>{t('leaderboard', 'matches')}</Text>
            </View>
            <View style={cs.statBlock}>
              <Text style={cs.statValue}>{item.stats.tirRate > 0 ? `${item.stats.tirRate}%` : '-'}</Text>
              <Text style={cs.statLabel}>Tir</Text>
            </View>
          </View>

          {/* Invite button */}
          {canInvite ? (
            <Pressable
              style={cs.inviteBtn}
              onPress={(e) => { e.stopPropagation?.(); handleInviteToMeetup(item.userId, item.name); }}
              hitSlop={6}
            >
              <MaterialIcons name="event" size={16} color={theme.primary} />
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }, [user, selfPlayer, mode, t, language, handleInviteToMeetup]);

  if (loading) {
    return (
      <SafeAreaView style={cs.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={cs.container}>
      {/* Header */}
      <LinearGradient colors={['#0F172A', '#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cs.header}>
        <View style={cs.headerTop}>
          <Pressable style={cs.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={cs.headerTitle}>
              {pageType === 'country' ? (language === 'fr' ? 'Classement par pays' : 'Country Leaderboard')
                : pageType === 'continent' ? (language === 'fr' ? 'Classement par continent' : 'Continent Leaderboard')
                : (language === 'fr' ? 'Classement par ville' : 'City Leaderboard')}
            </Text>
            {selectedCity ? (
              <Text style={cs.headerSubtitle}>
                {pageType === 'continent' ? getContinentLabel(selectedCity, language === 'fr') : pageType === 'country' ? `${getCountryFlag(selectedCity)} ${selectedCity}` : selectedCity}
                {' '}— {filteredCityPlayers.length} {t('leaderboard', 'publicPlayersCount')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Value selector */}
        <Pressable style={cs.citySelector} onPress={() => setShowCityPicker(true)}>
          <MaterialIcons name={pageType === 'country' ? 'flag' : pageType === 'continent' ? 'public' : 'place'} size={18} color="#60A5FA" />
          <Text style={cs.citySelectorText} numberOfLines={1}>
            {selectedCity
              ? (pageType === 'continent' ? getContinentLabel(selectedCity, language === 'fr') : pageType === 'country' ? `${getCountryFlag(selectedCity)} ${selectedCity}` : selectedCity)
              : (pageType === 'country' ? (language === 'fr' ? 'Choisir un pays...' : 'Choose a country...')
                : pageType === 'continent' ? (language === 'fr' ? 'Choisir un continent...' : 'Choose a continent...')
                : (language === 'fr' ? 'Choisir une ville...' : 'Choose a city...'))}
          </Text>
          <MaterialIcons name="expand-more" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>

        {/* Mode toggle */}
        {selectedCity ? (
          <View style={cs.modeToggle}>
            <Pressable
              style={[cs.modeBtn, mode === 'alltime' && cs.modeBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setMode('alltime'); }}
            >
              <MaterialIcons name="emoji-events" size={14} color={mode === 'alltime' ? '#FFF' : 'rgba(255,255,255,0.5)'} />
              <Text style={[cs.modeBtnText, mode === 'alltime' && cs.modeBtnTextActive]}>
                {(extraTranslations.weeklyLeaderboard?.allTimeTab as any)?.[language] || 'All time'}
              </Text>
            </Pressable>
            <Pressable
              style={[cs.modeBtn, mode === 'weekly' && { backgroundColor: '#2563EB80' }]}
              onPress={() => { Haptics.selectionAsync(); setMode('weekly'); }}
            >
              <MaterialIcons name="date-range" size={14} color={mode === 'weekly' ? '#FFF' : 'rgba(255,255,255,0.5)'} />
              <Text style={[cs.modeBtnText, mode === 'weekly' && cs.modeBtnTextActive]}>
                {(extraTranslations.weeklyLeaderboard?.weeklyTab as any)?.[language] || 'Weekly'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </LinearGradient>

      {/* Search */}
      {selectedCity && filteredCityPlayers.length > 3 ? (
        <View style={cs.searchBar}>
          <MaterialIcons name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={cs.searchInput}
            placeholder={t('leaderboard', 'searchPlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Player List */}
      {selectedCity ? (
        filteredCityPlayers.length > 0 ? (
          <FlatList
            data={filteredCityPlayers}
            keyExtractor={(item: any) => item.id}
            renderItem={renderPlayer}
            contentContainerStyle={[cs.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && { maxWidth: 960, alignSelf: 'center', width: '100%' }]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={cs.emptyState}>
            <MaterialIcons name="place" size={56} color={theme.textMuted} />
            <Text style={cs.emptyTitle}>{language === 'fr' ? 'Aucun joueur classe' : 'No ranked players'}</Text>
            <Text style={cs.emptyDesc}>
              {mode === 'weekly'
                ? (language === 'fr' ? 'Aucun joueur de cette ville ne remplit les conditions cette semaine.' : 'No players from this city qualify this week.')
                : (language === 'fr' ? 'Aucun joueur public de cette ville ne remplit les conditions.' : 'No public players from this city meet the requirements.')}
            </Text>
          </View>
        )
      ) : (
        <View style={cs.emptyState}>
          <MaterialIcons name={pageType === 'country' ? 'flag' : pageType === 'continent' ? 'public' : 'map'} size={56} color={theme.textMuted} />
          <Text style={cs.emptyTitle}>
            {pageType === 'country' ? (language === 'fr' ? 'Selectionne un pays' : 'Select a country')
              : pageType === 'continent' ? (language === 'fr' ? 'Selectionne un continent' : 'Select a continent')
              : (language === 'fr' ? 'Selectionne une ville' : 'Select a city')}
          </Text>
          <Text style={cs.emptyDesc}>
            {pageType === 'country' ? (language === 'fr' ? 'Choisis un pays pour voir le classement.' : 'Choose a country to see the ranking.')
              : pageType === 'continent' ? (language === 'fr' ? 'Choisis un continent pour voir le classement.' : 'Choose a continent to see the ranking.')
              : (language === 'fr' ? 'Choisis une ville pour voir le classement local.' : 'Choose a city to see the local ranking.')}
          </Text>
          <Pressable style={cs.chooseCityBtn} onPress={() => setShowCityPicker(true)}>
            <MaterialIcons name={pageType === 'country' ? 'flag' : pageType === 'continent' ? 'public' : 'place'} size={18} color="#FFF" />
            <Text style={cs.chooseCityBtnText}>
              {pageType === 'country' ? (language === 'fr' ? 'Choisir un pays' : 'Choose a country')
                : pageType === 'continent' ? (language === 'fr' ? 'Choisir un continent' : 'Choose a continent')
                : (language === 'fr' ? 'Choisir une ville' : 'Choose a city')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* City Picker Modal */}
      <Modal visible={showCityPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCityPicker(false)}>
        <SafeAreaView style={cs.modalContainer}>
          <View style={cs.modalHeader}>
            <Text style={cs.modalTitle}>
              {pageType === 'country' ? (language === 'fr' ? 'Choisir un pays' : 'Choose a country')
                : pageType === 'continent' ? (language === 'fr' ? 'Choisir un continent' : 'Choose a continent')
                : (language === 'fr' ? 'Choisir une ville' : 'Choose a city')}
            </Text>
            <Pressable style={cs.modalClose} onPress={() => setShowCityPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={cs.modalSearchBar}>
            <MaterialIcons name="search" size={18} color={theme.textMuted} />
            <TextInput
              style={cs.modalSearchInput}
              placeholder={pageType === 'country' ? (language === 'fr' ? 'Rechercher un pays...' : 'Search country...') : pageType === 'continent' ? (language === 'fr' ? 'Rechercher un continent...' : 'Search continent...') : (language === 'fr' ? 'Rechercher une ville...' : 'Search city...')}
              placeholderTextColor={theme.textMuted}
              value={citySearch}
              onChangeText={setCitySearch}
              autoFocus
            />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {filteredCities.map(val => {
              const count = pageType === 'country'
                ? allPlayers.filter(p => p.country === val).length
                : pageType === 'continent'
                  ? allPlayers.filter(p => p.country ? getContinent(p.country) === val : false).length
                  : allPlayers.filter(p => p.city === val).length;
              const isSelected = selectedCity === val;
              const displayName = pageType === 'continent' ? getContinentLabel(val, language === 'fr') : val;
              return (
                <Pressable
                  key={val}
                  style={[cs.cityItem, isSelected && cs.cityItemActive]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedCity(val); setShowCityPicker(false); setCitySearch(''); }}
                >
                  <View style={[cs.cityIcon, isSelected && { backgroundColor: theme.primary }]}>
                    {pageType === 'country' ? (
                      <Text style={{ fontSize: 18 }}>{getCountryFlag(val)}</Text>
                    ) : pageType === 'continent' ? (
                      <Text style={{ fontSize: 18 }}>{getContinentFlag(val)}</Text>
                    ) : (
                      <MaterialIcons name="place" size={18} color={isSelected ? '#FFF' : theme.textSecondary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[cs.cityName, isSelected && { color: theme.primary }]}>{displayName}</Text>
                    <Text style={cs.cityCount}>{count} {language === 'fr' ? 'joueur(s)' : 'player(s)'}</Text>
                  </View>
                  {isSelected ? <MaterialIcons name="check-circle" size={22} color={theme.primary} /> : null}
                </Pressable>
              );
            })}
            {filteredCities.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 12 }}>{t('common', 'noResults')}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Meetup Picker Modal */}
      <Modal visible={showMeetupPicker} animationType="slide" transparent onRequestClose={() => setShowMeetupPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary }}>{t('meetup', 'inviteToMeetup')}</Text>
                <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '600', marginTop: 2 }}>{meetupPickerUserName}</Text>
              </View>
              <Pressable style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowMeetupPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>{t('meetup', 'chooseMeetup')}</Text>
            {loadingMeetups ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
            ) : activeMeetups.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {activeMeetups.map((m) => {
                  const mDate = new Date(m.date);
                  return (
                    <Pressable key={m.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10 }, invitingToMeetup === m.id && { opacity: 0.6 }]} onPress={() => handleConfirmInvite(m.id)} disabled={!!invitingToMeetup}>
                      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: theme.primary, lineHeight: 20 }}>{mDate.getDate()}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary, letterSpacing: 0.5 }}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 }} numberOfLines={1}>{m.title}</Text>
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>{mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {invitingToMeetup === m.id ? <ActivityIndicator size="small" color={theme.primary} /> : (
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="send" size={16} color={theme.primary} /></View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="event-busy" size={40} color={theme.textMuted} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>{t('meetup', 'noActiveMeetups')}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 }}>{t('meetup', 'noActiveMeetupsDesc')}</Text>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }} onPress={() => { setShowMeetupPicker(false); router.push('/meetup/new' as any); }}>
                  <MaterialIcons name="add" size={18} color="#FFF" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('meetup', 'createMeetupFirst')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  citySelector: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 },
  citySelectorText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#FFF' },
  geoRow: { flexDirection: 'row' as const, gap: 5, marginBottom: 10 },
  geoChip: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  geoChipActive: { backgroundColor: '#2563EB80' },
  geoChipText: { fontSize: 11, fontWeight: '600' as const, color: 'rgba(255,255,255,0.5)' },
  geoChipTextActive: { color: '#FFF', fontWeight: '700' as const },
  geoValueChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  geoValueChipActive: { backgroundColor: '#2563EB80' },
  geoValueChipText: { fontSize: 12, fontWeight: '600' as const, color: 'rgba(255,255,255,0.5)', maxWidth: 140 },
  geoValueChipTextActive: { color: '#FFF' },
  modeToggle: { flexDirection: 'row', gap: 6 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  modeBtnActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  modeBtnTextActive: { color: '#FFF', fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, height: 44, ...theme.shadows.card },
  searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary },
  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  playerRow: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 10, ...theme.shadows.card },
  playerRowMe: { borderWidth: 2, borderColor: theme.primary, backgroundColor: theme.primary + '05' },
  rankCol: { width: 32, alignItems: 'center', marginRight: 10 },
  medal: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 15, fontWeight: '900' },
  rankText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  playerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarWrap: {},
  avatar: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden' },
  playerName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  playerClub: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  rankUpBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#10B98115', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  rankUpText: { fontSize: 11, fontWeight: '800', color: '#10B981' },
  rankDownBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EF444415', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  rankDownText: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  rankNewBadge: { backgroundColor: '#2563EB15', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  rankNewText: { fontSize: 9, fontWeight: '800', color: '#2563EB' },
  statsRow: { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  statBlock: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  statLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },
  inviteBtn: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.primary + '25' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  chooseCityBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 20 },
  chooseCityBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary },
  cityItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8, ...theme.shadows.card },
  cityItemActive: { borderWidth: 2, borderColor: theme.primary },
  cityIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  cityName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  cityCount: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
