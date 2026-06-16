import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { fetchLeaderboard, sortLeaderboard, LeaderboardPlayer, LeaderboardSort, LeaderboardPeriod } from '@/services/leaderboardService';
import { getEloRank, getEloColor, formatEloDelta, ELO_RANKS } from '@/services/eloService';
import { fetchClubLeaderboard, sortClubLeaderboard, LeaderboardClub, ClubLeaderboardSort } from '@/services/clubLeaderboardService';
import { fetchBoulesLeaderboard, aggregateBoulesData, sortBoulesLeaderboard, LeaderboardBoulesEntry, BoulesLeaderboardSort, BoulesLeaderboardMode } from '@/services/boulesLeaderboardService';
import { getBrandVisual, getBrandImage } from '@/constants/boulesDatabase';
import { getMyActiveMeetups, inviteSingleUserToMeetup, Meetup } from '@/services/meetupService';
import AdBanner from '@/components/ui/AdBanner';
import { getTrustScoreColor, getTrustScoreIcon, getTrustLevelLabel, getLevelFromScore, fetchSuspiciousPlayers } from '@/services/trustScoreService';
import { fetchEventLeaderboard, EventLeaderboardEntry, SponsoredEvent } from '@/services/sponsoredEventService';
import { fetchWeeklyLeaderboard, getSubRankings, saveWeeklySnapshot, checkAndTriggerWeeklyReset, getLastWeekSummary, WeeklyRankChange, SubRanking, getCurrentWeekStart, formatDateISO } from '@/services/weeklyLeaderboardService';
import { extraTranslations } from '@/constants/i18nExtra';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { CONTINENT_MAP, getContinent, getContinentLabel, getCountryFlag, getContinentFlag } from '@/constants/geoData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPlayerGlobalRank, fetchLeagueTierStats, getLeagueTier, getLeagueProgress, LEAGUE_TIERS, LeagueTier, LeagueTierStats, RankedPlayer } from '@/services/globalRankingService';
import { getEloRank as getEloRankInfo } from '@/services/eloService';

const GEO_STORAGE_KEY = 'leaderboard_geo_scope';
const RECENT_SEARCHES_KEY = 'leaderboard_recent_searches';
const MAX_RECENT_SEARCHES = 8;

type LeaderboardTab = 'players' | 'clubs' | 'boules' | 'events';

const PAGE_SIZE = 30;

// Weekly player row with rank change indicator
const WeeklyPlayerRow = React.memo(function WeeklyPlayerRow({
  player,
  rank,
  globalRank,
  isMe,
  language,
  t,
}: {
  player: any;
  rank: number;
  globalRank: number;
  isMe: boolean;
  language: string;
  t: (s: string, k: string) => string;
}) {
  const rc = player.rankChange as { currentRank: number; previousRank: number | null; direction: string; diff: number };
  const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
  const medalColor = medalColors[rank];

  return (
    <Pressable
      style={[s.row, isMe && s.rowMe, { borderLeftWidth: 3, borderLeftColor: rc.direction === 'up' ? '#10B981' : rc.direction === 'down' ? '#EF4444' : rc.direction === 'new' ? '#2563EB' : theme.border }]}
      onPress={() => router.push(isMe ? '/player/me' : `/player/${player.id}` as any)}
    >
      <View style={s.rankCol}>
        {medalColor ? (
          <View style={[s.medal, { backgroundColor: medalColor + '20' }]}>
            <Text style={[s.medalText, { color: medalColor }]}>{rank}</Text>
          </View>
        ) : (
          <Text style={s.rankText}>{rank}</Text>
        )}
      </View>
      <View style={[s.playerCol, { marginBottom: 6 }]}>
        <View style={s.avatarWrap}>
          {player.avatar ? (
            <Image source={{ uri: player.avatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={[s.avatar, { backgroundColor: isMe ? theme.primary : theme.textMuted + '30', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isMe ? '#FFF' : theme.textSecondary }}>{player.name.charAt(0)}</Text>
            </View>
          )}
          {isMe ? <View style={s.meBadge}><MaterialIcons name="star" size={8} color="#FFF" /></View> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[s.playerName, isMe && { color: theme.primary }]} numberOfLines={1}>
              {player.name}{isMe ? ` (${t('leaderboard', 'you')})` : ''}
            </Text>
            {player.trustScore !== undefined ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: getTrustScoreColor(player.trustScore) + '15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name={getTrustScoreIcon(player.trustScore) as any} size={9} color={getTrustScoreColor(player.trustScore)} />
              </View>
            ) : null}
          </View>
          <View style={s.playerMeta}>
            {player.club ? <Text style={s.playerClub} numberOfLines={1}>{player.club}</Text> : null}
            {player.city ? (
              <>{player.club ? <View style={s.metaDot} /> : null}<Text style={s.playerCity} numberOfLines={1}>{player.city}</Text></>
            ) : null}
          </View>
        </View>
        {/* Rank change badge */}
        <View style={{ alignItems: 'center', minWidth: 44 }}>
          {rc.direction === 'up' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <MaterialIcons name="arrow-upward" size={14} color="#10B981" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#10B981' }}>+{rc.diff}</Text>
            </View>
          ) : rc.direction === 'down' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EF444415', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <MaterialIcons name="arrow-downward" size={14} color="#EF4444" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>-{rc.diff}</Text>
            </View>
          ) : rc.direction === 'new' ? (
            <View style={{ backgroundColor: '#2563EB15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#2563EB' }}>{(extraTranslations.weeklyLeaderboard?.weeklyNew as any)?.[language] || 'NEW'}</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: theme.textMuted + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted }}>=</Text>
            </View>
          )}
        </View>
      </View>
      <View style={s.statsCol}>
        <View style={s.statBlock}>
          <Text style={[s.statValue, { color: '#D97706', fontWeight: '800' }]}>{player.stats.winRate}%</Text>
          <Text style={s.statLabel}>{t('leaderboard', 'winRate')}</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={s.statValue}>{player.weeklyMatches || player.stats.matchesPlayed}</Text>
          <Text style={s.statLabel}>{t('leaderboard', 'matches')}</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={s.statValue}>{player.weeklyWins || player.stats.wins}</Text>
          <Text style={s.statLabel}>{(extraTranslations.weeklyLeaderboard?.weeklyWinsLabel as any)?.[language] || 'wins'}</Text>
        </View>
        {player.eloRating ? (
          <View style={s.statBlock}>
            <Text style={[s.statValue, { color: getEloColor(player.eloRating || 1000), fontWeight: '800' }]}>{player.eloRating}</Text>
            <Text style={s.statLabel}>ELO</Text>
          </View>
        ) : (
          <View style={s.statBlock}>
            <Text style={s.statValue}>{player.stats.tirRate > 0 ? `${player.stats.tirRate}%` : '-'}</Text>
            <Text style={s.statLabel}>{t('leaderboard', 'shotRate')}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const MemoizedPlayerRow = React.memo(function PlayerRow({
  player,
  rank,
  isMe,
  sortBy,
  onPress,
  onInvite,
  language,
  t,
}: {
  player: LeaderboardPlayer;
  rank: number;
  isMe: boolean;
  sortBy: LeaderboardSort;
  onPress: () => void;
  onInvite: (() => void) | null;
  language: string;
  t: (s: string, k: string) => string;
}) {
  const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
  const medalColor = medalColors[rank];

  return (
    <Pressable style={[s.row, isMe && s.rowMe]} onPress={onPress}>
      {/* Rank */}
      <View style={s.rankCol}>
        {rank === 1 ? (
          <View style={s.crownContainer}>
            <Text style={s.crownEmoji}>👑</Text>
            <View style={[s.medal, { backgroundColor: '#FFD700' + '20' }]}>
              <Text style={[s.medalText, { color: '#FFD700' }]}>1</Text>
            </View>
          </View>
        ) : medalColor ? (
          <View style={[s.medal, { backgroundColor: medalColor + '20' }]}>
            <Text style={[s.medalText, { color: medalColor }]}>{rank}</Text>
          </View>
        ) : (
          <Text style={s.rankText}>{rank}</Text>
        )}
      </View>

      {/* Player info */}
      <View style={s.playerCol}>
        <View style={s.avatarWrap}>
          {player.avatar ? (
            <Image
              source={{ uri: player.avatar }}
              style={s.avatar}
              contentFit="cover"
              transition={200}
              placeholder={{ blurhash: blurhash.avatar }}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[s.avatar, { backgroundColor: isMe ? theme.primary : theme.textMuted + '30', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isMe ? '#FFF' : theme.textSecondary }}>{player.name.charAt(0)}</Text>
            </View>
          )}
          {isMe ? <View style={s.meBadge}><MaterialIcons name="star" size={8} color="#FFF" /></View> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[s.playerName, isMe && { color: theme.primary }]} numberOfLines={1}>
              {player.name}{isMe ? ` (${t('leaderboard', 'you')})` : ''}
            </Text>
            {player.country ? <Text style={{ fontSize: 12, lineHeight: 14 }}>{getCountryFlag(player.country)}</Text> : null}
            {player.eloRating ? (() => {
              const eloRank = getEloRank(player.eloRating);
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: eloRank.color + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: eloRank.color + '30' }}>
                  <MaterialIcons name={eloRank.icon as any} size={10} color={eloRank.color} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: eloRank.color }}>{player.eloRating}</Text>
                </View>
              );
            })() : null}
            {player.isAmbassador ? (
              <View style={s.ambassadorBadge}>
                <MaterialIcons name="verified" size={10} color="#7C3AED" />
              </View>
            ) : player.isPremium ? (
              <View style={s.premiumBadge}>
                <MaterialIcons name="star" size={9} color="#A8B4C0" />
              </View>
            ) : null}
          </View>
          <View style={s.playerMeta}>
            {player.club ? <Text style={s.playerClub} numberOfLines={1}>{player.club}</Text> : null}
            {player.city ? (
              <>
                {player.club ? <View style={s.metaDot} /> : null}
                <Text style={s.playerCity} numberOfLines={1}>{player.city}</Text>
              </>
            ) : null}
          </View>
          <View style={s.playerTags}>
            {player.eloRating ? (() => { const eloR = getEloRank(player.eloRating); return (
              <View style={[s.playerTag, { backgroundColor: eloR.color + '12', borderWidth: 1, borderColor: eloR.color + '25' }]}>
                <MaterialIcons name={eloR.icon as any} size={10} color={eloR.color} />
                <Text style={[s.playerTagText, { color: eloR.color }]}>{eloR.label[language === 'fr' ? 'fr' : 'en']}</Text>
              </View>
            ); })() : null}
            <View style={[s.playerTag, { backgroundColor: theme.primary + '12' }]}>
              <Text style={[s.playerTagText, { color: theme.primary }]}>{t('roles', player.role)}</Text>
            </View>
            {player.experience ? <View style={[s.playerTag, { backgroundColor: '#9333EA' + '12' }]}>
              <Text style={[s.playerTagText, { color: '#9333EA' }]}>{t('player', player.experience === 'less_than_1' ? 'experienceLessThan1' : player.experience === '1_to_3' ? 'experience1to3' : player.experience === '3_to_10' ? 'experience3to10' : 'experienceMoreThan10')}</Text>
            </View> : null}
          </View>
        </View>
      </View>

      <View style={s.statsCol}>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'elo' && { color: getEloColor(player.eloRating || 1000), fontWeight: '800' }]}>{player.eloRating || 1000}</Text>
          <Text style={s.statLabel}>ELO</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'winRate' && { color: '#D97706', fontWeight: '800' }]}>{player.stats.winRate}%</Text>
          <Text style={s.statLabel}>{t('leaderboard', 'winRate')}</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'matches' && { color: '#D97706', fontWeight: '800' }]}>{player.stats.matchesPlayed}</Text>
          <Text style={s.statLabel}>{t('leaderboard', 'matches')}</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'tirRate' && { color: theme.tirColor, fontWeight: '800' }]}>{player.stats.tirRate > 0 ? `${player.stats.tirRate}%` : '-'}</Text>
          <Text style={s.statLabel}>{t('leaderboard', 'shotRate')}</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'pointRate' && { color: theme.pointColor, fontWeight: '800' }]}>{player.stats.pointRate > 0 ? `${player.stats.pointRate}%` : '-'}</Text>
          <Text style={s.statLabel}>Pt</Text>
        </View>
        <View style={s.statBlock}>
          <Text style={[s.statValue, sortBy === 'carreauRate' && { color: theme.carreauColor, fontWeight: '800' }]}>{player.stats.carreauRate > 0 ? `${player.stats.carreauRate}%` : '-'}</Text>
          <Text style={s.statLabel}>Car.</Text>
        </View>
      </View>

      {/* Invite button for non-self real users */}
      {onInvite ? (
        <Pressable
          style={s.inviteBtn}
          onPress={(e) => { e.stopPropagation?.(); onInvite(); }}
          hitSlop={6}
        >
          <MaterialIcons name="event" size={16} color={theme.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { selfPlayer } = useAppData();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  // ============ DEEP LINK PARAMS ============
  const { tab: tabParam, tier: tierParam, filter: filterParam } = useLocalSearchParams<{ tab?: string; tier?: string; filter?: string }>();

  // ============ TAB STATE ============
  const [activeTab, setActiveTab] = useState<LeaderboardTab>(() => {
    const valid: LeaderboardTab[] = ['players', 'clubs', 'boules', 'events'];
    return valid.includes(tabParam as LeaderboardTab) ? (tabParam as LeaderboardTab) : 'players';
  });

  // ============ WEEKLY STATE ============
  const [weeklyMode, setWeeklyMode] = useState<'alltime' | 'weekly'>(() => filterParam === 'weekly' ? 'weekly' : 'alltime');
  type WeeklySubFilter = 'all' | 'city' | 'club';
  const [weeklySubFilter, setWeeklySubFilter] = useState<WeeklySubFilter>('all');
  const [weeklyPlayers, setWeeklyPlayers] = useState<Array<any>>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyLoaded, setWeeklyLoaded] = useState(false);
  const [weeklySubRankings, setWeeklySubRankings] = useState<SubRanking[]>([]);

  // ============ PLAYERS STATE ============
  const [allPlayers, setAllPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<LeaderboardSort>('elo');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterTrustLevel, setFilterTrustLevel] = useState<string>('all');
  const [filterEloRank, setFilterEloRank] = useState<string>('all');
  const [filterClub, setFilterClub] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterTerrain, setFilterTerrain] = useState<string>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [periodFilter, setPeriodFilter] = useState<LeaderboardPeriod>('all');
  const [periodLoading, setPeriodLoading] = useState(false);

  // Geographic scope for all tabs
  type GeoScope = 'world' | 'continent' | 'country' | 'city';
  const [geoScope, setGeoScope] = useState<GeoScope>('world');
  const [geoValue, setGeoValue] = useState<string>('');
  const [geoInitialized, setGeoInitialized] = useState(false);

  // Auto-detect geo scope from selfPlayer or restore from storage
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

  // ============ CLUBS STATE ============
  const [allClubs, setAllClubs] = useState<LeaderboardClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [clubSortBy, setClubSortBy] = useState<ClubLeaderboardSort>('compositeScore');
  const [clubSearch, setClubSearch] = useState('');
  const [clubsLoaded, setClubsLoaded] = useState(false);

  // ============ BOULES STATE ============
  const [boulesRawData, setBoulesRawData] = useState<any[]>([]);
  const [boulesLoading, setBoulesLoading] = useState(false);
  const [boulesError, setBoulesError] = useState<string | null>(null);
  const [boulesSortBy, setBoulesSortBy] = useState<BoulesLeaderboardSort>('avgWinRate');
  const [boulesMode, setBoulesMode] = useState<BoulesLeaderboardMode>('brand');
  const [boulesRoleFilter, setBoulesRoleFilter] = useState<string>('all');
  const [boulesSearch, setBoulesSearch] = useState('');
  const [boulesLoaded, setBoulesLoaded] = useState(false);

  // ============ EVENTS STATE ============
  const [eventEntries, setEventEntries] = useState<EventLeaderboardEntry[]>([]);
  const [recentEvents, setRecentEvents] = useState<SponsoredEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventSortBy, setEventSortBy] = useState<'wins' | 'podiums' | 'avgScore' | 'participations'>('wins');
  const [eventSearch, setEventSearch] = useState('');

  // ============ LEAGUE TIER STATE ============
  const [tierStats, setTierStats] = useState<LeagueTierStats[]>([]);
  const [myGlobalRank, setMyGlobalRank] = useState<{ rank: number | null; total: number } | null>(null);

  // ============ SEARCH AUTOCOMPLETE STATE ============
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ id: string; name: string; type: 'player' | 'club' | 'boules'; avatar?: string; subtitle?: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Array<{ id: string; name: string; type: 'player' | 'club' | 'boules'; avatar?: string; subtitle?: string }>>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  // Load recent searches on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then(raw => {
      if (raw) { try { setRecentSearches(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
  }, []);

  const saveRecentSearch = useCallback((item: { id: string; name: string; type: 'player' | 'club' | 'boules'; avatar?: string; subtitle?: string }) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(r => r.id !== item.id);
      const updated = [item, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
    Haptics.selectionAsync();
  }, []);

  // Build autocomplete suggestions from current tab data
  useEffect(() => {
    const currentSearch = activeTab === 'players' ? search : activeTab === 'clubs' ? clubSearch : activeTab === 'events' ? eventSearch : boulesSearch;
    if (!currentSearch.trim() || currentSearch.trim().length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = currentSearch.toLowerCase().trim();
    let results: Array<{ id: string; name: string; type: 'player' | 'club' | 'boules'; avatar?: string; subtitle?: string }> = [];
    if (activeTab === 'players') {
      results = allPlayers.filter(p => p.name.toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q)).slice(0, 6).map(p => ({
        id: p.id, name: p.name, type: 'player' as const, avatar: p.avatar,
        subtitle: [p.club, p.city, p.eloRating ? `ELO ${p.eloRating}` : ''].filter(Boolean).join(' • '),
      }));
    } else if (activeTab === 'clubs') {
      results = allClubs.filter(c => c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q)).slice(0, 6).map(c => ({
        id: c.id, name: c.name, type: 'club' as const, avatar: c.logo,
        subtitle: [c.city, `${c.playerCount} joueurs`, `${c.stats.avgWinRate}%`].filter(Boolean).join(' • '),
      }));
    } else if (activeTab === 'boules') {
      results = boulesEntries.filter(e => e.brand.toLowerCase().includes(q) || (e.model || '').toLowerCase().includes(q)).slice(0, 6).map(e => ({
        id: e.id, name: boulesMode === 'model' && e.model ? e.model : `${e.brand}${e.model ? ` ${e.model}` : ''}`, type: 'boules' as const,
        subtitle: `${e.userCount} utilisateurs • ${e.stats.avgWinRate}% win`,
      }));
    }
    setSearchSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [search, clubSearch, boulesSearch, eventSearch, activeTab, allPlayers, allClubs, boulesEntries, boulesMode]);

  const handleSuggestionPress = useCallback((suggestion: { id: string; name: string; type: 'player' | 'club' | 'boules'; avatar?: string; subtitle?: string }) => {
    Haptics.selectionAsync();
    setShowSuggestions(false);
    setSearchFocused(false);
    saveRecentSearch(suggestion);
    if (suggestion.type === 'player') {
      router.push(`/player/${suggestion.id}` as any);
    } else if (suggestion.type === 'club') {
      router.push({ pathname: `/club-ranking/${suggestion.id}`, params: { name: '' } } as any);
    } else if (suggestion.type === 'boules') {
      router.push({ pathname: `/boules-ranking/${encodeURIComponent(suggestion.id)}`, params: { brand: '', model: '', mode: boulesMode } } as any);
    }
  }, [boulesMode, saveRecentSearch]);

  // ============ TRUST TAB STATE ============
  const [trustPlayers, setTrustPlayers] = useState<any[]>([]);
  const [trustLoading, setTrustLoading] = useState(false);
  const [trustError, setTrustError] = useState<string | null>(null);
  const [trustLoaded, setTrustLoaded] = useState(false);
  const [trustSortBy, setTrustSortBy] = useState<'score' | 'flags' | 'improvement'>('score');
  const [trustSearch, setTrustSearch] = useState('');

  // Meetup invitation
  const [showMeetupPicker, setShowMeetupPicker] = useState(false);
  const [meetupPickerUserId, setMeetupPickerUserId] = useState<string | null>(null);
  const [meetupPickerUserName, setMeetupPickerUserName] = useState('');
  const [activeMeetups, setActiveMeetups] = useState<Meetup[]>([]);
  const [loadingMeetups, setLoadingMeetups] = useState(false);
  const [invitingToMeetup, setInvitingToMeetup] = useState<string | null>(null);

  // Lazy load trust score leaderboard
  const loadTrust = useCallback(async () => {
    if (trustLoaded) return;
    setTrustLoading(true);
    const { players: tp, error: err } = await fetchSuspiciousPlayers();
    const sorted = tp.filter(p => p.status !== 'banned').sort((a, b) => b.trustScore - a.trustScore);
    setTrustPlayers(sorted);
    setTrustError(err);
    setTrustLoading(false);
    setTrustLoaded(true);
  }, [trustLoaded]);

  const loadData = useCallback(async (period?: LeaderboardPeriod) => {
    setLoading(true);
    const [{ players: lbP, error: err }, tierResult] = await Promise.all([
      fetchLeaderboard(period),
      tierStats.length === 0 ? fetchLeagueTierStats() : Promise.resolve({ stats: tierStats, error: null }),
    ]);
    setAllPlayers(lbP);
    setError(err);
    if (tierResult.stats.length > 0) setTierStats(tierResult.stats);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load my global rank
  useEffect(() => {
    if (selfPlayer?.id && selfPlayer?.isPublic) {
      fetchPlayerGlobalRank(selfPlayer.id).then((r) => setMyGlobalRank({ rank: r.rank, total: r.total })).catch(() => {});
    }
  }, [selfPlayer?.id, selfPlayer?.isPublic]);

  // Load weekly leaderboard
  const loadWeekly = useCallback(async () => {
    if (weeklyLoaded) return;
    setWeeklyLoading(true);
    const { players: wp, error: err } = await fetchWeeklyLeaderboard();
    setWeeklyPlayers(wp);
    setWeeklyError(err);
    setWeeklyLoading(false);
    setWeeklyLoaded(true);

    // Check if we need to save snapshot (Monday)
    if (wp.length > 0) {
      checkAndTriggerWeeklyReset().then(async (needsProcessing) => {
        if (needsProcessing) {
          await saveWeeklySnapshot(wp.map((p: any) => ({
            userId: p.userId,
            rank: p.rankChange.currentRank,
            matchesPlayed: p.weeklyMatches,
            wins: p.weeklyWins,
            winRate: p.weeklyWinRate,
            tirRate: p.stats.tirRate,
            carreauCount: 0,
            city: p.city,
            club: p.club,
          })));
          // Send Monday push notification summary
          if (user?.id) {
            try {
              const summaries = wp.slice(0, 50).map((p: any) => ({
                userId: p.userId,
                rank: p.rankChange.currentRank,
                matchesPlayed: p.weeklyMatches,
                wins: p.weeklyWins,
                winRate: p.weeklyWinRate,
                rankChange: p.rankChange.direction,
                rankDiff: p.rankChange.diff,
                previousRank: p.rankChange.previousRank,
              }));
              const supabaseC = getSupabaseClient();
              await supabaseC.functions.invoke('send-push', {
                body: { type: 'weekly_summary', payload: { summaries } },
              });
            } catch (e) {
              console.log('Error sending weekly summary push:', e);
            }
          }
        }
      }).catch(() => {});
    }
  }, [weeklyLoaded, user?.id]);

  // Auto-load weekly when switching to weekly mode
  useEffect(() => {
    if (weeklyMode === 'weekly' && activeTab === 'players' && !weeklyLoaded) loadWeekly();
  }, [weeklyMode, activeTab, weeklyLoaded, loadWeekly]);

  // Compute sub-rankings for weekly
  useEffect(() => {
    if (weeklySubFilter === 'all' || weeklyPlayers.length === 0) {
      setWeeklySubRankings([]);
      return;
    }
    const rankings = getSubRankings(weeklyPlayers, weeklySubFilter === 'city' ? 'city' : 'club');
    setWeeklySubRankings(rankings);
  }, [weeklySubFilter, weeklyPlayers]);

  const handlePeriodChange = useCallback(async (newPeriod: LeaderboardPeriod) => {
    Haptics.selectionAsync();
    setPeriodFilter(newPeriod);
    setPeriodLoading(true);

    // Reload all tabs with the new period
    const [playersRes, clubsRes, boulesRes] = await Promise.all([
      fetchLeaderboard(newPeriod),
      fetchClubLeaderboard(newPeriod),
      fetchBoulesLeaderboard(newPeriod),
    ]);

    setAllPlayers(playersRes.players);
    setError(playersRes.error);
    setAllClubs(clubsRes.clubs);
    setClubsError(clubsRes.error);
    setClubsLoaded(true);
    setBoulesRawData(boulesRes.entries);
    setBoulesError(boulesRes.error);
    setBoulesLoaded(true);
    setPeriodLoading(false);
  }, []);

  // Lazy load clubs when tab is selected
  const loadClubs = useCallback(async (period?: LeaderboardPeriod) => {
    setClubsLoading(true);
    const { clubs: c, error: err } = await fetchClubLeaderboard(period);
    setAllClubs(c);
    setClubsError(err);
    setClubsLoading(false);
    setClubsLoaded(true);
  }, []);

  // Lazy load boules when tab is selected
  const loadBoules = useCallback(async (period?: LeaderboardPeriod) => {
    setBoulesLoading(true);
    const { entries, error: err } = await fetchBoulesLeaderboard(period);
    setBoulesRawData(entries);
    setBoulesError(err);
    setBoulesLoading(false);
    setBoulesLoaded(true);
  }, []);

  // Lazy load events
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
    if (activeTab === 'clubs' && !clubsLoaded) loadClubs(periodFilter);
    if (activeTab === 'boules' && !boulesLoaded) loadBoules(periodFilter);
    if (activeTab === 'events') loadEvents();
    if (activeTab === 'trust') loadTrust();
  }, [activeTab, clubsLoaded, boulesLoaded, loadClubs, loadBoules, loadEvents, periodFilter, loadTrust]);

  // ============ CLUBS COMPUTED ============
  const filteredClubs = useMemo(() => {
    let result = allClubs;
    if (clubSearch.trim()) {
      const q = clubSearch.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q));
    }
    return sortClubLeaderboard(result, clubSortBy);
  }, [allClubs, clubSearch, clubSortBy]);

  // ============ BOULES COMPUTED ============
  const boulesEntries = useMemo(() => {
    const aggregated = aggregateBoulesData(boulesRawData, boulesMode, boulesRoleFilter);
    let result = aggregated;
    if (boulesSearch.trim()) {
      const q = boulesSearch.toLowerCase().trim();
      result = result.filter(e => e.brand.toLowerCase().includes(q) || (e.model || '').toLowerCase().includes(q));
    }
    return sortBoulesLeaderboard(result, boulesSortBy);
  }, [boulesRawData, boulesMode, boulesRoleFilter, boulesSearch, boulesSortBy]);

  // ============ EVENTS COMPUTED ============
  const filteredEvents = useMemo(() => {
    let result = [...eventEntries];
    if (eventSearch.trim()) {
      const q = eventSearch.toLowerCase().trim();
      result = result.filter(e => e.userName.toLowerCase().includes(q));
    }
    // Sort
    result.sort((a, b) => {
      if (eventSortBy === 'wins') {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        return b.avgScore - a.avgScore;
      }
      if (eventSortBy === 'podiums') {
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        return b.wins - a.wins;
      }
      if (eventSortBy === 'avgScore') return b.avgScore - a.avgScore;
      return b.eventsCompleted - a.eventsCompleted;
    });
    return result;
  }, [eventEntries, eventSearch, eventSortBy]);

  // ============ TRUST COMPUTED ============
  const trustStats = useMemo(() => {
    if (trustPlayers.length === 0) return { avg: 0, verified: 0, trusted: 0, standard: 0, total: 0 };
    const total = trustPlayers.length;
    const avg = Math.round(trustPlayers.reduce((sum, p) => sum + p.trustScore, 0) / total);
    let verified = 0, trusted = 0, standard = 0;
    trustPlayers.forEach(p => { if (p.trustScore >= 80) verified++; else if (p.trustScore >= 65) trusted++; else standard++; });
    return { avg, verified, trusted, standard, total };
  }, [trustPlayers]);

  const filteredTrust = useMemo(() => {
    let result = trustPlayers;
    if (trustSearch.trim()) { const q = trustSearch.toLowerCase(); result = result.filter(p => (p.playerName || '').toLowerCase().includes(q)); }
    if (trustSortBy === 'flags') result = [...result].sort((a, b) => b.flags.length - a.flags.length || b.trustScore - a.trustScore);
    else if (trustSortBy === 'improvement') result = [...result].sort((a, b) => a.flags.length - b.flags.length || b.trustScore - a.trustScore);
    return result;
  }, [trustPlayers, trustSearch, trustSortBy]);

  // Extract unique cities for filter
  const uniqueCities = useMemo(() => {
    const cities = allPlayers.map(p => p.city).filter(Boolean) as string[];
    return [...new Set(cities)].sort();
  }, [allPlayers]);

  const uniqueCountries = useMemo(() => {
    const countries = allPlayers.map(p => p.country).filter(Boolean) as string[];
    return [...new Set(countries)].sort();
  }, [allPlayers]);

  const uniqueClubs = useMemo(() => {
    const clubs = allPlayers.map(p => p.club).filter(Boolean) as string[];
    return [...new Set(clubs)].sort();
  }, [allPlayers]);

  const uniqueBrands = useMemo(() => {
    const brands = allPlayers.map(p => p.boulesBrand).filter(Boolean) as string[];
    return [...new Set(brands)].sort();
  }, [allPlayers]);

  const uniqueTerrains = useMemo(() => {
    const tNames = allPlayers.map(p => p.terrainName).filter(Boolean) as string[];
    return [...new Set(tNames)].sort();
  }, [allPlayers]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    return [filterRole, filterLevel, filterClub, filterBrand, filterTerrain, filterTrustLevel].filter(f => f !== 'all').length
      + (geoScope !== 'world' && geoValue ? 1 : 0)
      + (periodFilter !== 'all' ? 1 : 0)
      + (filterEloRank !== 'all' ? 1 : 0);
  }, [filterRole, filterLevel, filterClub, filterBrand, filterTerrain, filterTrustLevel, filterEloRank, geoScope, geoValue, periodFilter]);

  // Trust level distribution stats
  const trustLevelStats = useMemo(() => {
    const total = allPlayers.length;
    if (total === 0) return { verified: 0, trusted: 0, standard: 0, unknown: 0 };
    let verified = 0, trusted = 0, standard = 0, unknown = 0;
    allPlayers.forEach(p => {
      const ts = p.trustScore;
      if (ts === undefined) { unknown++; return; }
      if (ts >= 80) verified++;
      else if (ts >= 65) trusted++;
      else standard++;
    });
    return {
      verified: Math.round((verified / total) * 100),
      trusted: Math.round((trusted / total) * 100),
      standard: Math.round((standard / total) * 100),
      unknown: Math.round((unknown / total) * 100),
    };
  }, [allPlayers]);

  // Filtered, sorted, paginated data
  const filteredSorted = useMemo(() => {
    let result = allPlayers;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nickname || '').toLowerCase().includes(q) ||
        (p.club || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q)
      );
    }

    // Filters
    if (filterRole !== 'all') result = result.filter(p => p.role === filterRole);

    // Geographic scope filter
    if (geoScope === 'city' && geoValue) result = result.filter(p => p.city?.toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'country' && geoValue) result = result.filter(p => p.country?.toLowerCase() === geoValue.toLowerCase());
    else if (geoScope === 'continent' && geoValue) {
      result = result.filter(p => p.country ? getContinent(p.country) === geoValue : false);
    }
    // ELO rank filter
    if (filterEloRank !== 'all') {
      result = result.filter(p => {
        const elo = p.eloRating || 1000;
        switch (filterEloRank) {
          case 'bronze': return elo < 1100;
          case 'silver': return elo >= 1100 && elo < 1200;
          case 'gold': return elo >= 1200 && elo < 1500;
          case 'diamond': return elo >= 1500 && elo < 1800;
          case 'master': return elo >= 1800 && elo < 2000;
          case 'grand_master': return elo >= 2000;
          default: return true;
        }
      });
    }
    // Trust level filter
    if (filterTrustLevel !== 'all') {
      result = result.filter(p => {
        const ts = p.trustScore;
        if (ts === undefined) return filterTrustLevel === 'unknown';
        if (filterTrustLevel === 'verified') return ts >= 80;
        if (filterTrustLevel === 'trusted') return ts >= 65 && ts < 80;
        if (filterTrustLevel === 'standard') return ts >= 45 && ts < 65;
        return false;
      });
    }
    if (filterClub !== 'all') result = result.filter(p => p.club === filterClub);
    if (filterBrand !== 'all') result = result.filter(p => p.boulesBrand === filterBrand);
    if (filterTerrain !== 'all') result = result.filter(p => p.terrainName === filterTerrain);

    return sortLeaderboard(result, sortBy);
  }, [allPlayers, search, filterRole, filterLevel, filterClub, filterBrand, filterTerrain, filterTrustLevel, filterEloRank, sortBy, geoScope, geoValue]);

  const paginatedData = useMemo(() => filteredSorted.slice(0, visibleCount), [filteredSorted, visibleCount]);
  const hasMore = filteredSorted.length > visibleCount;

  // Reset pagination on filter/search change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filterRole, filterLevel, filterClub, filterBrand, filterTerrain, filterTrustLevel, filterEloRank, sortBy, geoScope, geoValue, periodFilter]);

  const handleLoadMore = useCallback(() => {
    if (hasMore) setVisibleCount(prev => prev + PAGE_SIZE);
  }, [hasMore]);

  // My rank
  const myRank = useMemo(() => {
    if (!selfPlayer || !user) return null;
    const idx = filteredSorted.findIndex(p => p.userId === user.id || p.id === selfPlayer.id);
    return idx >= 0 ? idx + 1 : null;
  }, [filteredSorted, selfPlayer, user]);

  const clearFilters = () => {
    setFilterRole('all');
    setFilterLevel('all');
    setFilterClub('all');
    setFilterBrand('all');
    setFilterTerrain('all');
    setFilterTrustLevel('all');
    setFilterEloRank('all');
    setSearch('');
    setPeriodFilter('all');
    updateGeoScope('world', '');
  };

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

  const renderItem = useCallback(({ item, index }: { item: LeaderboardPlayer; index: number }) => {
    const rank = index + 1;
    const isMe = !!(user && (item.userId === user.id || (selfPlayer && item.id === selfPlayer.id)));
    const canInvite = !isMe && item.userId && item.userId !== user?.id;
    return (
      <MemoizedPlayerRow
        player={item}
        rank={rank}
        isMe={isMe}
        sortBy={sortBy}
        onPress={() => router.push(isMe ? '/player/me' : `/player/${item.id}` as any)}
        onInvite={canInvite ? () => handleInviteToMeetup(item.userId, item.name) : null}
        language={language}
        t={t}
      />
    );
  }, [user, selfPlayer, sortBy, language, t, handleInviteToMeetup]);

  const keyExtractor = useCallback((item: LeaderboardPlayer) => item.id, []);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <LinearGradient colors={(() => {
          if (activeTab === 'players' && selfPlayer) {
            const tier = getLeagueTier(selfPlayer.eloRating || 1000);
            return [tier.gradient[0] + 'DD', tier.gradient[1] + 'DD', '#1E293B'] as [string, string, string];
          }
          return ['#0F172A', '#1E293B', '#334155'] as [string, string, string];
        })()} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.headerGradient}>
          <View style={s.headerTop}>
            <Pressable style={s.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={24} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>{t('leaderboard', 'title')}</Text>
              <Text style={s.headerSubtitle}>
                {activeTab === 'players'
                  ? `${filteredSorted.length} ${t('leaderboard', 'publicPlayersCount')}${myRank ? ` • #${myRank}` : ''}`
                  : activeTab === 'clubs'
                    ? `${filteredClubs.length} ${t('leaderboard', 'publicClubsCount')}`
                    : activeTab === 'events'
                      ? `${filteredEvents.length} ${t('leaderboard', 'publicEventsCount')}`
                      : `${boulesEntries.length} ${boulesMode === 'brand' ? t('leaderboard', 'publicBoulesCount') : t('leaderboard', 'publicModelsCount')}`}
              </Text>
            </View>
          </View>

          {/* Tab switcher */}
          <View style={s.tabRow}>
            {([{ id: 'players' as LeaderboardTab, label: t('leaderboard', 'tabPlayers'), icon: 'people' },
              { id: 'clubs' as LeaderboardTab, label: t('leaderboard', 'tabClubs'), icon: 'home' },
              { id: 'boules' as LeaderboardTab, label: t('leaderboard', 'tabBoules'), icon: 'sports-baseball' },
              { id: 'events' as LeaderboardTab, label: t('leaderboard', 'tabEvents'), icon: 'campaign' },
            ]).map(tab => (
              <Pressable
                key={tab.id}
                style={[s.tabBtn, activeTab === tab.id && s.tabBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.id); }}
              >
                <MaterialIcons name={tab.icon as any} size={16} color={activeTab === tab.id ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                <Text style={[s.tabBtnText, activeTab === tab.id && s.tabBtnTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Quick filter summary chips */}
          {activeFilterCount > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10, paddingRight: 8 }}>
              {geoScope !== 'world' && geoValue ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name={geoScope === 'continent' ? 'travel-explore' : geoScope === 'country' ? 'flag' : 'place'} size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{geoScope === 'continent' ? `${getContinentFlag(geoValue)} ${getContinentLabel(geoValue, language === 'fr')}` : geoScope === 'country' ? `${getCountryFlag(geoValue)} ${geoValue}` : geoValue}</Text>
                  <Pressable onPress={() => updateGeoScope('world', '')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}
              {periodFilter !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name="date-range" size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{t('leaderboard', `period${periodFilter.charAt(0).toUpperCase() + periodFilter.slice(1)}` as any) || periodFilter}</Text>
                  <Pressable onPress={() => handlePeriodChange('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}

              {filterTrustLevel !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name="shield" size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{filterTrustLevel === 'verified' ? (language === 'fr' ? 'Verifie' : 'Verified') : filterTrustLevel === 'trusted' ? (language === 'fr' ? 'Fiable' : 'Trusted') : 'Standard'}</Text>
                  <Pressable onPress={() => setFilterTrustLevel('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}
              {filterRole !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <Text style={s.headerFilterChipText}>{t('roles', filterRole)}</Text>
                  <Pressable onPress={() => setFilterRole('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}

              {filterClub !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name="home" size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{filterClub}</Text>
                  <Pressable onPress={() => setFilterClub('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}
              {filterTerrain !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name="sports-soccer" size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{filterTerrain}</Text>
                  <Pressable onPress={() => setFilterTerrain('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}
              {filterBrand !== 'all' ? (
                <Pressable style={s.headerFilterChip} onPress={() => setShowFilterModal(true)}>
                  <MaterialIcons name="sports-baseball" size={11} color="#F59E0B" />
                  <Text style={s.headerFilterChipText}>{filterBrand}</Text>
                  <Pressable onPress={() => setFilterBrand('all')} hitSlop={6}><MaterialIcons name="close" size={12} color="#F59E0B" /></Pressable>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
          {/* Weekly / All-time toggle for players tab */}
          {activeTab === 'players' ? (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
              <Pressable
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: weeklyMode === 'alltime' ? '#F59E0B25' : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: weeklyMode === 'alltime' ? '#F59E0B50' : 'transparent' }]}
                onPress={() => { Haptics.selectionAsync(); setWeeklyMode('alltime'); }}
              >
                <MaterialIcons name="emoji-events" size={14} color={weeklyMode === 'alltime' ? '#F59E0B' : '#64748B'} />
                <Text style={{ fontSize: 12, fontWeight: weeklyMode === 'alltime' ? '700' : '600', color: weeklyMode === 'alltime' ? '#F59E0B' : '#64748B' }}>
                  {(extraTranslations.weeklyLeaderboard?.allTimeTab as any)?.[language] || 'All time'}
                </Text>
              </Pressable>
              <Pressable
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: weeklyMode === 'weekly' ? '#3B82F625' : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: weeklyMode === 'weekly' ? '#3B82F650' : 'transparent' }]}
                onPress={() => { Haptics.selectionAsync(); setWeeklyMode('weekly'); }}
              >
                <MaterialIcons name="date-range" size={14} color={weeklyMode === 'weekly' ? '#60A5FA' : '#64748B'} />
                <Text style={{ fontSize: 12, fontWeight: weeklyMode === 'weekly' ? '700' : '600', color: weeklyMode === 'weekly' ? '#60A5FA' : '#64748B' }}>
                  {(extraTranslations.weeklyLeaderboard?.weeklyTab as any)?.[language] || 'Weekly'}
                </Text>
                {weeklyMode === 'weekly' ? <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#60A5FA' }} /> : null}
              </Pressable>
            </View>
          ) : null}
          <View style={{ position: 'relative', zIndex: 20 }}>
            <View style={s.searchRow}>
              <View style={[s.searchBar, { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}>
                <MaterialIcons name="search" size={20} color="#64748B" />
                <TextInput
                  style={s.searchInput}
                  placeholder={
                    activeTab === 'clubs' ? (language === 'fr' ? 'Rechercher un club...' : 'Search a club...')
                    : activeTab === 'boules' ? (language === 'fr' ? 'Rechercher des boules...' : 'Search boules...')
                    : activeTab === 'events' ? (language === 'fr' ? 'Rechercher un evenement...' : 'Search an event...')
                    : t('leaderboard', 'searchPlaceholder')
                  }
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={activeTab === 'players' ? search : activeTab === 'clubs' ? clubSearch : activeTab === 'events' ? eventSearch : boulesSearch}
                  onChangeText={(text) => {
                    (activeTab === 'players' ? setSearch : activeTab === 'clubs' ? setClubSearch : activeTab === 'events' ? setEventSearch : setBoulesSearch)(text);
                    if (text.trim().length >= 2) setShowSuggestions(true);
                  }}
                  onFocus={() => { setSearchFocused(true); if (searchSuggestions.length > 0) setShowSuggestions(true); else if (!(activeTab === 'players' ? search : activeTab === 'clubs' ? clubSearch : activeTab === 'events' ? eventSearch : boulesSearch).trim() && recentSearches.length > 0) setShowSuggestions(true); }}
                  onBlur={() => { setTimeout(() => { setShowSuggestions(false); setSearchFocused(false); }, 200); }}
                />
                {(activeTab === 'players' ? search : activeTab === 'clubs' ? clubSearch : activeTab === 'events' ? eventSearch : boulesSearch).length > 0 ? (
                  <Pressable onPress={() => { (activeTab === 'players' ? setSearch : activeTab === 'clubs' ? setClubSearch : activeTab === 'events' ? setEventSearch : setBoulesSearch)(''); setShowSuggestions(false); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={[s.filterBtn, activeFilterCount > 0 && s.filterBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setShowFilterModal(true); }}
              >
                <MaterialIcons name="tune" size={20} color={activeFilterCount > 0 ? '#FFF' : 'rgba(255,255,255,0.6)'} />
                {activeFilterCount > 0 ? (
                  <View style={s.filterBadge}>
                    <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
            {/* Autocomplete dropdown */}
            {showSuggestions && (searchSuggestions.length > 0 || (searchFocused && !(activeTab === 'players' ? search : activeTab === 'clubs' ? clubSearch : activeTab === 'events' ? eventSearch : boulesSearch).trim() && recentSearches.length > 0)) ? (
              <View style={s.autocompleteDropdown}>
                {searchSuggestions.length > 0 ? (
                  searchSuggestions.map((sg, idx) => (
                    <Pressable key={sg.id + idx} style={s.autocompleteItem} onPress={() => handleSuggestionPress(sg)}>
                      <View style={s.autocompleteAvatar}>
                        {sg.avatar ? (
                          <Image source={{ uri: sg.avatar }} style={{ width: 32, height: 32, borderRadius: 8 }} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                        ) : (
                          <MaterialIcons name={sg.type === 'player' ? 'person' : sg.type === 'club' ? 'home' : 'sports-baseball'} size={16} color={theme.primary} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.autocompleteName} numberOfLines={1}>{sg.name}</Text>
                        {sg.subtitle ? <Text style={s.autocompleteSubtitle} numberOfLines={1}>{sg.subtitle}</Text> : null}
                      </View>
                      <MaterialIcons name="north-west" size={14} color={theme.textMuted} />
                    </Pressable>
                  ))
                ) : (
                  <>
                    <View style={s.recentSearchHeader}>
                      <MaterialIcons name="history" size={14} color={theme.textMuted} />
                      <Text style={s.recentSearchTitle}>{language === 'fr' ? 'Recherches recentes' : 'Recent searches'}</Text>
                      <Pressable onPress={clearRecentSearches} hitSlop={8} style={{ marginLeft: 'auto' }}>
                        <Text style={s.recentSearchClear}>{language === 'fr' ? 'Effacer' : 'Clear'}</Text>
                      </Pressable>
                    </View>
                    {recentSearches.map((sg, idx) => (
                      <Pressable key={`recent-${sg.id}-${idx}`} style={s.autocompleteItem} onPress={() => handleSuggestionPress(sg)}>
                        <View style={s.autocompleteAvatar}>
                          {sg.avatar ? (
                            <Image source={{ uri: sg.avatar }} style={{ width: 32, height: 32, borderRadius: 8 }} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                          ) : (
                            <MaterialIcons name={sg.type === 'player' ? 'person' : sg.type === 'club' ? 'home' : 'sports-baseball'} size={16} color={theme.primary} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.autocompleteName} numberOfLines={1}>{sg.name}</Text>
                          {sg.subtitle ? <Text style={s.autocompleteSubtitle} numberOfLines={1}>{sg.subtitle}</Text> : null}
                        </View>
                        <MaterialIcons name="history" size={14} color={theme.textMuted} />
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {/* Sort chips - context-dependent */}
        <View style={s.sortWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortRow}>
            {activeTab === 'players' ? ([
              { id: 'winRate' as LeaderboardSort, label: t('leaderboard', 'sortByWinRate'), icon: 'emoji-events' },
              { id: 'matches' as LeaderboardSort, label: t('leaderboard', 'sortByMatches'), icon: 'sports' },
              { id: 'tirRate' as LeaderboardSort, label: t('leaderboard', 'sortByTirRate'), icon: 'gps-fixed' },
              { id: 'pointRate' as LeaderboardSort, label: t('leaderboard', 'sortByPointRate'), icon: 'adjust' },
              { id: 'carreauRate' as LeaderboardSort, label: t('leaderboard', 'sortByCarreauRate'), icon: 'stars' },
            ] as { id: string; label: string; icon: string }[]).map(chip => (
              <Pressable
                key={chip.id}
                style={[s.sortChip, sortBy === chip.id as LeaderboardSort && s.sortChipActive]}
                onPress={() => { Haptics.selectionAsync(); setSortBy(chip.id as LeaderboardSort); }}
              >
                <MaterialIcons name={chip.icon as any} size={14} color={sortBy === chip.id ? '#FFF' : theme.textSecondary} />
                <Text style={[s.sortChipText, sortBy === chip.id && s.sortChipTextActive]}>{chip.label}</Text>
              </Pressable>
            )) : activeTab === 'clubs' ? ([
              { id: 'compositeScore' as ClubLeaderboardSort, label: t('leaderboard', 'sortByComposite'), icon: 'stars' },
              { id: 'avgWinRate' as ClubLeaderboardSort, label: t('leaderboard', 'sortByAvgWinRate'), icon: 'emoji-events' },
              { id: 'totalMatches' as ClubLeaderboardSort, label: t('leaderboard', 'sortByTotalMatches'), icon: 'sports' },
              { id: 'playerCount' as ClubLeaderboardSort, label: t('leaderboard', 'sortByPlayerCount'), icon: 'people' },
              { id: 'avgTirRate' as ClubLeaderboardSort, label: t('leaderboard', 'sortByAvgTirRate'), icon: 'gps-fixed' },
            ] as { id: string; label: string; icon: string }[]).map(chip => (
              <Pressable
                key={chip.id}
                style={[s.sortChip, clubSortBy === chip.id as ClubLeaderboardSort && s.sortChipActive]}
                onPress={() => { Haptics.selectionAsync(); setClubSortBy(chip.id as ClubLeaderboardSort); }}
              >
                <MaterialIcons name={chip.icon as any} size={14} color={clubSortBy === chip.id ? '#FFF' : theme.textSecondary} />
                <Text style={[s.sortChipText, clubSortBy === chip.id && s.sortChipTextActive]}>{chip.label}</Text>
              </Pressable>
            )) : activeTab === 'events' ? ([
              { id: 'wins' as const, label: t('leaderboard', 'sortByWins'), icon: 'emoji-events' },
              { id: 'podiums' as const, label: t('leaderboard', 'sortByPodiums'), icon: 'military-tech' },
              { id: 'avgScore' as const, label: t('leaderboard', 'sortByAvgScore'), icon: 'stars' },
              { id: 'participations' as const, label: t('leaderboard', 'sortByParticipations'), icon: 'campaign' },
            ] as { id: string; label: string; icon: string }[]).map(chip => (
              <Pressable
                key={chip.id}
                style={[s.sortChip, eventSortBy === chip.id && s.sortChipActive]}
                onPress={() => { Haptics.selectionAsync(); setEventSortBy(chip.id as any); }}
              >
                <MaterialIcons name={chip.icon as any} size={14} color={eventSortBy === chip.id ? '#FFF' : theme.textSecondary} />
                <Text style={[s.sortChipText, eventSortBy === chip.id && s.sortChipTextActive]}>{chip.label}</Text>
              </Pressable>
            )) : ([
              { id: 'avgWinRate' as BoulesLeaderboardSort, label: t('leaderboard', 'sortByAvgWinRate'), icon: 'emoji-events' },
              { id: 'userCount' as BoulesLeaderboardSort, label: t('leaderboard', 'boulesPopularity'), icon: 'people' },
              { id: 'totalMatches' as BoulesLeaderboardSort, label: t('leaderboard', 'sortByTotalMatches'), icon: 'sports' },
              { id: 'avgTirRate' as BoulesLeaderboardSort, label: t('leaderboard', 'sortByAvgTirRate'), icon: 'gps-fixed' },
              { id: 'avgCarreauRate' as BoulesLeaderboardSort, label: t('leaderboard', 'sortByAvgCarreauRate'), icon: 'stars' },
            ] as { id: string; label: string; icon: string }[]).map(chip => (
              <Pressable
                key={chip.id}
                style={[s.sortChip, boulesSortBy === chip.id as BoulesLeaderboardSort && s.sortChipActive]}
                onPress={() => { Haptics.selectionAsync(); setBoulesSortBy(chip.id as BoulesLeaderboardSort); }}
              >
                <MaterialIcons name={chip.icon as any} size={14} color={boulesSortBy === chip.id ? '#FFF' : theme.textSecondary} />
                <Text style={[s.sortChipText, boulesSortBy === chip.id && s.sortChipTextActive]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Boules-specific: mode toggle + role filter */}
          {/* Period indicator */}
          {periodFilter !== 'all' ? (
            <View style={s.periodFilterSection}>
              <View style={s.periodLabelRow}>
                <MaterialIcons name="date-range" size={13} color={theme.textMuted} />
                <Text style={s.periodLabelText}>{t('leaderboard', 'periodLabel')}: {t('leaderboard', `period${periodFilter.charAt(0).toUpperCase() + periodFilter.slice(1)}` as any) || periodFilter}</Text>
                {periodLoading ? <ActivityIndicator size={10} color="#D97706" style={{ marginLeft: 6 }} /> : null}
              </View>
            </View>
          ) : null}

          {activeTab === 'boules' ? (
            <View style={s.boulesExtraFilters}>
              <View style={s.boulesModePills}>
                <Pressable
                  style={[s.bModePill, boulesMode === 'brand' && s.bModePillActive]}
                  onPress={() => { Haptics.selectionAsync(); setBoulesMode('brand'); }}
                >
                  <Text style={[s.bModePillText, boulesMode === 'brand' && s.bModePillTextActive]}>{t('leaderboard', 'modeBrand')}</Text>
                </Pressable>
                <Pressable
                  style={[s.bModePill, boulesMode === 'model' && s.bModePillActive]}
                  onPress={() => { Haptics.selectionAsync(); setBoulesMode('model'); }}
                >
                  <Text style={[s.bModePillText, boulesMode === 'model' && s.bModePillTextActive]}>{t('leaderboard', 'modeModel')}</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {['all', 'Tireur', 'Pointeur', 'Milieu'].map(role => (
                  <Pressable
                    key={role}
                    style={[s.sortChip, { paddingHorizontal: 10, paddingVertical: 6 }, boulesRoleFilter === role && s.sortChipActive]}
                    onPress={() => { Haptics.selectionAsync(); setBoulesRoleFilter(role); }}
                  >
                    <Text style={[s.sortChipText, { fontSize: 11 }, boulesRoleFilter === role && s.sortChipTextActive]}>
                      {role === 'all' ? t('leaderboard', 'boulesAllRoles') : t('roles', role)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>

      {/* ============ TRUST TAB ============ */}
      {activeTab === 'trust' ? (
        trustLoading ? (
          <View style={s.centerState}>
            <View style={s.loadingIconBg}><MaterialIcons name="shield" size={32} color="#3B82F6" /></View>
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : trustError ? (
          <View style={s.centerState}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
            <Pressable style={s.retryBtn} onPress={() => { setTrustLoaded(false); loadTrust(); }}>
              <Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text>
            </Pressable>
          </View>
        ) : filteredTrust.length === 0 ? (
          <View style={s.centerState}>
            <MaterialIcons name="shield" size={56} color={theme.textMuted} />
            <Text style={s.emptyTitle}>{language === 'fr' ? 'Aucun joueur analyse' : 'No players analyzed'}</Text>
            <Text style={s.emptyDesc}>{language === 'fr' ? 'Les scores sont calcules automatiquement.' : 'Scores are computed automatically.'}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTrust}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* Community Trust Health */}
                <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#3B82F620' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <MaterialIcons name="health-and-safety" size={18} color="#3B82F6" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary }}>{language === 'fr' ? 'Sante de la communaute' : 'Community Health'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: language === 'fr' ? 'Score moyen' : 'Avg Score', value: trustStats.avg, color: trustStats.avg >= 65 ? '#22C55E' : trustStats.avg >= 45 ? '#D97706' : '#EF4444' },
                      { label: language === 'fr' ? 'Verifies' : 'Verified', value: trustStats.verified, color: '#22C55E' },
                      { label: language === 'fr' ? 'Fiables' : 'Trusted', value: trustStats.trusted, color: '#3B82F6' },
                      { label: 'Standard', value: trustStats.standard, color: '#D97706' },
                    ].map((stat, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 8 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: stat.color }}>{stat.value}</Text>
                        <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.backgroundSecondary }}>
                    {trustStats.total > 0 ? (
                      <>
                        <View style={{ flex: Math.max(trustStats.verified, 0.1), backgroundColor: '#22C55E', borderRadius: 4 }} />
                        <View style={{ flex: Math.max(trustStats.trusted, 0.1), backgroundColor: '#3B82F6' }} />
                        <View style={{ flex: Math.max(trustStats.standard, 0.1), backgroundColor: '#D97706', borderRadius: 4 }} />
                      </>
                    ) : null}
                  </View>
                </View>
                {/* Sort chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                  {[
                    { id: 'score' as const, label: 'Score', icon: 'shield' },
                    { id: 'flags' as const, label: language === 'fr' ? 'Alertes' : 'Flags', icon: 'flag' },
                    { id: 'improvement' as const, label: language === 'fr' ? 'Meilleurs' : 'Cleanest', icon: 'check-circle' },
                  ].map(chip => (
                    <Pressable
                      key={chip.id}
                      style={[s.sortChip, trustSortBy === chip.id && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}
                      onPress={() => { Haptics.selectionAsync(); setTrustSortBy(chip.id); }}
                    >
                      <MaterialIcons name={chip.icon as any} size={14} color={trustSortBy === chip.id ? '#FFF' : theme.textSecondary} />
                      <Text style={[s.sortChipText, trustSortBy === chip.id && { color: '#FFF' }]}>{chip.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={s.listHeaderText}>{filteredTrust.length} {language === 'fr' ? 'joueurs' : 'players'}</Text>
              </View>
            }
            renderItem={({ item: p, index }) => {
              const rank = index + 1;
              const scoreColor = getTrustScoreColor(p.trustScore);
              const level = getLevelFromScore(p.trustScore);
              const mc2: Record<number, string> = { 1: '#22C55E', 2: '#3B82F6', 3: '#D97706' };
              const mc = mc2[rank];
              return (
                <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 30, 300))}>
                  <Pressable style={[s.row, { borderLeftWidth: 3, borderLeftColor: scoreColor }]} onPress={() => router.push(`/player/${p.playerId}` as any)}>
                    <View style={s.rankCol}>
                      {mc ? (
                        <View style={[s.medal, { backgroundColor: mc + '20' }]}><Text style={[s.medalText, { color: mc }]}>{rank}</Text></View>
                      ) : (
                        <Text style={s.rankText}>{rank}</Text>
                      )}
                    </View>
                    <View style={s.playerCol}>
                      <View style={[s.avatar, { backgroundColor: scoreColor + '20', alignItems: 'center', justifyContent: 'center' }]}>
                        <MaterialIcons name={getTrustScoreIcon(p.trustScore) as any} size={18} color={scoreColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.playerName} numberOfLines={1}>{p.playerName || p.playerId.substring(0, 8)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <View style={[s.trustBadgeRow, { position: 'relative', top: 0, left: 0, backgroundColor: scoreColor + '12', borderColor: scoreColor + '30' }]}>
                            <MaterialIcons name={getTrustScoreIcon(p.trustScore) as any} size={9} color={scoreColor} />
                            <Text style={[s.trustBadgeText, { color: scoreColor }]}>{getTrustLevelLabel(level, language === 'fr')}</Text>
                          </View>
                          {p.flags.length > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EF444412', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                              <MaterialIcons name="flag" size={10} color="#EF4444" />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>{p.flags.length}</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#22C55E12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                              <MaterialIcons name="check-circle" size={10} color="#22C55E" />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#22C55E' }}>{language === 'fr' ? 'Ok' : 'Clean'}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24, fontWeight: '900', color: scoreColor }}>{p.trustScore}</Text>
                      <Text style={{ fontSize: 9, color: theme.textMuted }}>/100</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            }}
          />
        )
      ) : activeTab === 'events' ? (
        eventsLoading ? (
          <View style={s.centerState}>
            <View style={s.loadingIconBg}><MaterialIcons name="campaign" size={32} color="#7C3AED" /></View>
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : eventsError ? (
          <View style={s.centerState}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={s.centerState}>
            <MaterialIcons name="campaign" size={56} color={theme.textMuted} />
            <Text style={s.emptyTitle}>{t('leaderboard', 'noEvents')}</Text>
            <Text style={s.emptyDesc}>{t('leaderboard', 'noEventsDesc')}</Text>
            <Pressable style={[s.resetBtn, { backgroundColor: '#7C3AED12' }]} onPress={() => router.push('/sponsored-event/list' as any)}>
              <MaterialIcons name="list" size={16} color="#7C3AED" />
              <Text style={[s.resetBtnText, { color: '#7C3AED' }]}>{t('leaderboard', 'seeAllEvents')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: entry, index }) => {
              const rank = index + 1;
              const medalColors2: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
              const mc = medalColors2[rank];
              return (
                <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 40, 400))}>
                  <View style={[s.row, { borderLeftWidth: 3, borderLeftColor: entry.wins > 0 ? '#FFD700' : entry.podiums > 0 ? '#7C3AED' : theme.border }]}>
                    <View style={s.rankCol}>
                      {mc ? (
                        <View style={[s.medal, { backgroundColor: mc + '20' }]}>
                          <Text style={[s.medalText, { color: mc }]}>{rank}</Text>
                        </View>
                      ) : (
                        <Text style={s.rankText}>{rank}</Text>
                      )}
                    </View>
                    <View style={s.playerCol}>
                      <View style={s.avatarWrap}>
                        {entry.userAvatar ? (
                          <Image source={{ uri: entry.userAvatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                        ) : (
                          <View style={[s.avatar, { backgroundColor: '#7C3AED20', alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#7C3AED' }}>{entry.userName.charAt(0)}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.playerName} numberOfLines={1}>{entry.userName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {entry.wins > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD70015', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}><MaterialIcons name="emoji-events" size={11} color="#D97706" /><Text style={{ fontSize: 11, fontWeight: '800', color: '#D97706' }}>{entry.wins}</Text></View> : null}
                          {entry.podiums > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7C3AED12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}><MaterialIcons name="military-tech" size={11} color="#7C3AED" /><Text style={{ fontSize: 11, fontWeight: '800', color: '#7C3AED' }}>{entry.podiums}</Text></View> : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.textMuted + '10', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}><MaterialIcons name="campaign" size={10} color={theme.textMuted} /><Text style={{ fontSize: 10, fontWeight: '600', color: theme.textMuted }}>{entry.eventsCompleted}</Text></View>
                        </View>
                      </View>
                    </View>
                    <View style={s.statsCol}>
                      <View style={s.statBlock}><Text style={[s.statValue, eventSortBy === 'avgScore' && { color: '#7C3AED', fontWeight: '800' }]}>{entry.avgScore}%</Text><Text style={s.statLabel}>{t('leaderboard', 'eventAvgScore')}</Text></View>
                      <View style={s.statBlock}><Text style={[s.statValue, eventSortBy === 'wins' && { color: '#D97706', fontWeight: '800' }]}>{entry.wins}</Text><Text style={s.statLabel}>{t('leaderboard', 'eventWins')}</Text></View>
                      <View style={s.statBlock}><Text style={[s.statValue, eventSortBy === 'podiums' && { color: '#7C3AED', fontWeight: '800' }]}>{entry.podiums}</Text><Text style={s.statLabel}>{t('leaderboard', 'eventPodiums')}</Text></View>
                      <View style={s.statBlock}><Text style={s.statValue}>{entry.bestScore}%</Text><Text style={s.statLabel}>{t('leaderboard', 'eventBestScore')}</Text></View>
                    </View>
                  </View>
                </Animated.View>
              );
            }}
            ListFooterComponent={<Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }} onPress={() => router.push('/sponsored-event/list' as any)}><Text style={{ fontSize: 14, fontWeight: '700', color: '#7C3AED' }}>{t('leaderboard', 'seeAllEvents')}</Text><MaterialIcons name="arrow-forward" size={16} color="#7C3AED" /></Pressable>}
          />
        )
      ) : activeTab === 'clubs' ? (
        clubsLoading ? (
          <View style={s.centerState}>
            <View style={s.loadingIconBg}><MaterialIcons name="home" size={32} color="#D97706" /></View>
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : clubsError ? (
          <View style={s.centerState}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
            <Pressable style={s.retryBtn} onPress={() => { setClubsLoaded(false); loadClubs(); }}>
              <Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text>
            </Pressable>
          </View>
        ) : filteredClubs.length === 0 ? (
          <View style={s.centerState}>
            <MaterialIcons name="home" size={56} color={theme.textMuted} />
            <Text style={s.emptyTitle}>{t('leaderboard', 'noClubs')}</Text>
            <Text style={s.emptyDesc}>{t('leaderboard', 'noClubsDesc')}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredClubs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: club, index }) => {
              const rank = index + 1;
              const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
              const medalColor = medalColors[rank];
              return (
                <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 40, 400))}>
                  <Pressable style={s.clubRow} onPress={() => router.push({ pathname: `/club-ranking/${club.id}`, params: { name: club.name } } as any)}>
                    <View style={s.clubHeader}>
                      <View style={s.rankCol}>
                        {rank === 1 ? (
                          <View style={s.crownContainer}>
                            <Text style={s.crownEmoji}>👑</Text>
                            <View style={[s.medal, { backgroundColor: '#FFD700' + '20' }]}>
                              <Text style={[s.medalText, { color: '#FFD700' }]}>1</Text>
                            </View>
                          </View>
                        ) : medalColor ? (
                          <View style={[s.medal, { backgroundColor: medalColor + '20' }]}>
                            <Text style={[s.medalText, { color: medalColor }]}>{rank}</Text>
                          </View>
                        ) : (
                          <Text style={s.rankText}>{rank}</Text>
                        )}
                      </View>
                      <View style={s.clubLogoWrap}>
                        {club.logo ? (
                          <Image source={{ uri: club.logo }} style={s.clubLogo} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                        ) : (
                          <View style={[s.clubLogo, { backgroundColor: '#D97706' + '15', alignItems: 'center', justifyContent: 'center' }]}>
                            <MaterialIcons name="home" size={18} color="#D97706" />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.clubName} numberOfLines={1}>{club.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {club.city ? <Text style={s.clubCity} numberOfLines={1}>{club.city}</Text> : null}
                          <View style={s.clubMeta}>
                            <MaterialIcons name="people" size={11} color={theme.textMuted} />
                            <Text style={s.clubMetaText}>{club.playerCount}</Text>
                          </View>
                          <View style={s.clubMeta}>
                            <MaterialIcons name="sports" size={11} color={theme.textMuted} />
                            <Text style={s.clubMetaText}>{club.totalMatches}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={s.clubScoreBadge}>
                        <Text style={s.clubScoreValue}>{club.stats.compositeScore}</Text>
                        <Text style={s.clubScoreLabel}>{t('leaderboard', 'clubComposite')}</Text>
                      </View>
                    </View>
                    <View style={s.clubStats}>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, clubSortBy === 'avgWinRate' && { color: '#D97706', fontWeight: '800' }]}>{club.stats.avgWinRate}%</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'clubAvgWin')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, clubSortBy === 'avgTirRate' && { color: theme.tirColor, fontWeight: '800' }]}>{club.stats.avgTirRate > 0 ? `${club.stats.avgTirRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'clubTir')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, clubSortBy === 'avgCarreauRate' && { color: theme.carreauColor, fontWeight: '800' }]}>{club.stats.avgCarreauRate > 0 ? `${club.stats.avgCarreauRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'clubCarreau')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={s.clubStatValue}>{club.stats.avgPointRate > 0 ? `${club.stats.avgPointRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'clubPoint')}</Text>
                      </View>
                    </View>
                    {club.topPlayers.length > 0 ? (
                      <View style={s.clubTopPlayers}>
                        <Text style={s.clubTopLabel}>{t('leaderboard', 'topPlayersLabel')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {club.topPlayers.map((tp, i) => (
                            <View key={i} style={s.clubTopPlayer}>
                              {tp.avatar ? (
                                <Image source={{ uri: tp.avatar }} style={s.clubTopAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                              ) : (
                                <View style={[s.clubTopAvatar, { backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center' }]}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary }}>{tp.name.charAt(0)}</Text>
                                </View>
                              )}
                              <Text style={s.clubTopPlayerName} numberOfLines={1}>{tp.name.split(' ')[0]}</Text>
                              <Text style={s.clubTopPlayerStat}>{tp.winRate}%</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            }}
            ListFooterComponent={null}
          />
        )
      ) : activeTab === 'boules' ? (
        /* ============ BOULES TAB ============ */
        boulesLoading ? (
          <View style={s.centerState}>
            <View style={s.loadingIconBg}><MaterialIcons name="sports-baseball" size={32} color="#D97706" /></View>
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : boulesError ? (
          <View style={s.centerState}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
            <Pressable style={s.retryBtn} onPress={() => { setBoulesLoaded(false); loadBoules(); }}>
              <Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text>
            </Pressable>
          </View>
        ) : boulesEntries.length === 0 ? (
          <View style={s.centerState}>
            <MaterialIcons name="sports-baseball" size={56} color={theme.textMuted} />
            <Text style={s.emptyTitle}>{t('leaderboard', 'noBoules')}</Text>
            <Text style={s.emptyDesc}>{t('leaderboard', 'noBoulesDesc')}</Text>
          </View>
        ) : (
          <FlatList
            data={boulesEntries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: entry, index }) => {
              const rank = index + 1;
              const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
              const medalColor = medalColors[rank];
              return (
                <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 40, 400))}>
                  <Pressable style={s.boulesRow} onPress={() => router.push({ pathname: `/boules-ranking/${encodeURIComponent(entry.id)}`, params: { brand: entry.brand, model: entry.model || '', mode: boulesMode } } as any)}>
                    <View style={s.boulesHeader}>
                      <View style={s.rankCol}>
                        {rank === 1 ? (
                          <View style={s.crownContainer}>
                            <Text style={s.crownEmoji}>👑</Text>
                            <View style={[s.medal, { backgroundColor: '#FFD700' + '20' }]}>
                              <Text style={[s.medalText, { color: '#FFD700' }]}>1</Text>
                            </View>
                          </View>
                        ) : medalColor ? (
                          <View style={[s.medal, { backgroundColor: medalColor + '20' }]}>
                            <Text style={[s.medalText, { color: medalColor }]}>{rank}</Text>
                          </View>
                        ) : (
                          <Text style={s.rankText}>{rank}</Text>
                        )}
                      </View>
                      {(() => { const bv = getBrandVisual(entry.brand); const bImg = getBrandImage(entry.brand); return (
                      <View style={[s.boulesIconWrap, { backgroundColor: bImg ? '#FFF' : bv.bg, alignItems: 'center', justifyContent: 'center' }]}>
                        {bImg ? (
                          <Image source={bImg} style={{ width: '80%', height: '80%' }} contentFit="contain" transition={200} />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '900', color: bv.text, letterSpacing: -0.5 }}>{bv.abbr}</Text>
                        )}
                      </View>
                      ); })()}
                      <View style={{ flex: 1 }}>
                        <Text style={s.boulesName} numberOfLines={1}>{boulesMode === 'model' && entry.model ? entry.model : `${entry.brand}${entry.model ? ` ${entry.model}` : ''}`}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <View style={s.clubMeta}>
                            <MaterialIcons name="people" size={11} color={theme.textMuted} />
                            <Text style={s.clubMetaText}>{entry.userCount} {t('leaderboard', 'boulesUsers')}</Text>
                          </View>
                          <View style={s.clubMeta}>
                            <MaterialIcons name="sports" size={11} color={theme.textMuted} />
                            <Text style={s.clubMetaText}>{entry.totalMatches} {t('leaderboard', 'boulesMatches')}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={s.clubStats}>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, boulesSortBy === 'avgWinRate' && { color: '#D97706', fontWeight: '800' }]}>{entry.stats.avgWinRate}%</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'boulesAvgWin')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, boulesSortBy === 'avgTirRate' && { color: theme.tirColor, fontWeight: '800' }]}>{entry.stats.avgTirRate > 0 ? `${entry.stats.avgTirRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'boulesTir')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={[s.clubStatValue, boulesSortBy === 'avgCarreauRate' && { color: theme.carreauColor, fontWeight: '800' }]}>{entry.stats.avgCarreauRate > 0 ? `${entry.stats.avgCarreauRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'boulesCarreau')}</Text>
                      </View>
                      <View style={s.clubStatItem}>
                        <Text style={s.clubStatValue}>{entry.stats.avgPointRate > 0 ? `${entry.stats.avgPointRate}%` : '-'}</Text>
                        <Text style={s.clubStatLabel}>{t('leaderboard', 'boulesPoint')}</Text>
                      </View>
                    </View>
                    {entry.byRole && entry.byRole.length > 1 ? (
                      <View style={s.boulesRoleSection}>
                        <Text style={s.boulesRoleTitle}>{t('leaderboard', 'boulesRoleBreakdown')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {entry.byRole.map((r, ri) => (
                            <View key={ri} style={s.boulesRoleChip}>
                              <Text style={s.boulesRoleName}>{t('roles', r.role)}</Text>
                              <Text style={s.boulesRoleStat}>{r.avgWinRate}% V</Text>
                              <Text style={s.boulesRoleCount}>{r.userCount}p</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            }}
            ListFooterComponent={null}
          />
        )
      ) : (
      /* ============ PLAYERS TAB ============ */
      /* --- WEEKLY MODE --- */
      weeklyMode === 'weekly' ? (
        weeklyLoading ? (
          <View style={s.centerState}>
            <View style={s.loadingIconBg}><MaterialIcons name="date-range" size={32} color="#2563EB" /></View>
            <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
          </View>
        ) : weeklyError ? (
          <View style={s.centerState}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
            <Pressable style={s.retryBtn} onPress={() => { setWeeklyLoaded(false); loadWeekly(); }}>
              <Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text>
            </Pressable>
          </View>
        ) : weeklyPlayers.length === 0 ? (
          <View style={s.centerState}>
            <MaterialIcons name="date-range" size={56} color={theme.textMuted} />
            <Text style={s.emptyTitle}>{(extraTranslations.weeklyLeaderboard?.weeklyNoPlayers as any)?.[language] || 'No weekly ranking yet'}</Text>
            <Text style={s.emptyDesc}>{(extraTranslations.weeklyLeaderboard?.weeklyNoPlayersDesc as any)?.[language] || 'Play at least 2 public matches this week.'}</Text>
          </View>
        ) : (
          <FlatList
            data={weeklySubFilter === 'all' ? weeklyPlayers : []}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* Sub-ranking filter: All / City / Club */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {(['all', 'city', 'club'] as WeeklySubFilter[]).map(sf => {
                    const label = sf === 'all'
                      ? ((extraTranslations.weeklyLeaderboard?.subRankingAll as any)?.[language] || 'General')
                      : sf === 'city'
                        ? ((extraTranslations.weeklyLeaderboard?.subRankingCity as any)?.[language] || 'By city')
                        : ((extraTranslations.weeklyLeaderboard?.subRankingClub as any)?.[language] || 'By club');
                    const icon = sf === 'all' ? 'people' : sf === 'city' ? 'place' : 'home';
                    return (
                      <Pressable
                        key={sf}
                        style={[s.sortChip, weeklySubFilter === sf && { backgroundColor: '#2563EB', borderColor: '#2563EB' }]}
                        onPress={() => { Haptics.selectionAsync(); setWeeklySubFilter(sf); }}
                      >
                        <MaterialIcons name={icon as any} size={14} color={weeklySubFilter === sf ? '#FFF' : theme.textSecondary} />
                        <Text style={[s.sortChipText, weeklySubFilter === sf && { color: '#FFF' }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Weekly info banner */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2563EB10', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#2563EB25' }}>
                  <MaterialIcons name="info-outline" size={16} color="#2563EB" />
                  <Text style={{ fontSize: 12, color: '#2563EB', flex: 1, fontWeight: '500' }}>
                    {(extraTranslations.weeklyLeaderboard?.weeklyDesc as any)?.[language] || 'Resets every Monday'} — {(extraTranslations.weeklyLeaderboard?.weeklyMinMatches as any)?.[language] || 'min. 2 matches this week'}
                  </Text>
                </View>
                {/* Grouped sub-rankings */}
                {weeklySubFilter !== 'all' && weeklySubRankings.length > 0 ? (
                  weeklySubRankings.map((group, gIdx) => (
                    <Animated.View key={group.name} entering={FadeInDown.duration(300).delay(gIdx * 60)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: gIdx > 0 ? 16 : 0, marginBottom: 8 }}>
                        <MaterialIcons name={weeklySubFilter === 'city' ? 'place' : 'home'} size={16} color="#2563EB" />
                        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{group.name}</Text>
                        <View style={{ backgroundColor: '#2563EB15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>{group.players.length}</Text>
                        </View>
                      </View>
                      {group.players.map((p: any, pIdx: number) => (
                        <WeeklyPlayerRow key={p.id} player={p} rank={pIdx + 1} globalRank={p.weeklyRank} isMe={!!(user && (p.userId === user.id || (selfPlayer && p.id === selfPlayer.id)))} language={language} t={t} />
                      ))}
                    </Animated.View>
                  ))
                ) : null}
                {weeklySubFilter !== 'all' ? <View style={{ height: 16 }} /> : null}
                {weeklySubFilter === 'all' ? (
                  <Text style={s.listHeaderText}>{weeklyPlayers.length} {t('leaderboard', 'publicPlayersCount')}</Text>
                ) : null}
              </View>
            }
            renderItem={weeklySubFilter === 'all' ? ({ item, index }) => (
              <WeeklyPlayerRow player={item} rank={index + 1} globalRank={index + 1} isMe={!!(user && (item.userId === user.id || (selfPlayer && item.id === selfPlayer.id)))} language={language} t={t} />
            ) : undefined}
            ListEmptyComponent={weeklySubFilter !== 'all' ? null : undefined}
          />
        )
      ) :
      loading ? (
        <View style={s.centerState}>
          <View style={s.loadingIconBg}>
            <MaterialIcons name="leaderboard" size={32} color="#D97706" />
          </View>
          <Text style={s.loadingText}>{t('leaderboard', 'loading')}</Text>
        </View>
      ) : error ? (
        <View style={s.centerState}>
          <MaterialIcons name="error-outline" size={48} color={theme.error} />
          <Text style={s.errorText}>{t('leaderboard', 'errorLoading')}</Text>
          <Pressable style={s.retryBtn} onPress={loadData}>
            <Text style={s.retryBtnText}>{t('leaderboard', 'retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={paginatedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            s.listContent,
            { paddingBottom: insets.bottom + 32 },
            isTablet && s.listContentTablet,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={10}
          initialNumToRender={15}
          ListHeaderComponent={
            <View>
              {/* ===== LEAGUE TIER CARD (integrated from global-ranking) ===== */}
              {selfPlayer ? (() => {
                const elo = selfPlayer.eloRating || 1000;
                const progress = getLeagueProgress(elo);
                const tier = progress.tier;
                return (
                  <View style={s.leagueCard}>
                    <LinearGradient colors={tier.gradient} style={s.leagueGradient}>
                      <View style={s.leagueTopRow}>
                        <View style={s.leagueEmblemWrap}>
                          <Text style={{ fontSize: 22 }}>{tier.emblem}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.leagueTierName}>{language === 'fr' ? tier.name.fr : tier.name.en}</Text>
                          <Text style={s.leagueEloLabel}>{elo} ELO</Text>
                        </View>
                        {myGlobalRank?.rank ? (
                          <View style={s.leagueRankBadge}>
                            <Text style={s.leagueRankHash}>#</Text>
                            <Text style={s.leagueRankValue}>{myGlobalRank.rank.toLocaleString()}</Text>
                            <Text style={s.leagueRankTotal}>{language === 'fr' ? 'sur' : 'of'} {myGlobalRank.total.toLocaleString()}</Text>
                          </View>
                        ) : (
                          <View style={s.leagueRankBadge}>
                            <MaterialIcons name="leaderboard" size={14} color="rgba(255,255,255,0.5)" />
                            <Text style={s.leagueRankTotal}>{language === 'fr' ? 'Mondial' : 'World'}</Text>
                          </View>
                        )}
                      </View>
                      {progress.nextTier ? (
                        <View style={s.leagueProgressRow}>
                          <View style={s.leagueProgressTrack}>
                            <View style={[s.leagueProgressFill, { width: `${progress.progress}%` }]} />
                          </View>
                          <Text style={s.leagueProgressText}>{progress.eloToNext} → {progress.nextTier.emblem}</Text>
                        </View>
                      ) : null}
                    </LinearGradient>
                  </View>
                );
              })() : null}

              {/* ===== LEAGUE DISTRIBUTION ===== */}
              {tierStats.length > 0 ? (
                <View style={s.tierOverview}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tierScroll}>
                    {tierStats.map(ts => {
                      const isActive = filterEloRank === ts.tier.id;
                      const isMyTier = selfPlayer ? getLeagueTier(selfPlayer.eloRating || 1000).id === ts.tier.id : false;
                      return (
                        <Pressable
                          key={ts.tier.id}
                          style={[s.tierChip, isActive && { borderColor: ts.tier.color, borderWidth: 2 }]}
                          onPress={() => { Haptics.selectionAsync(); setFilterEloRank(filterEloRank === ts.tier.id ? 'all' : ts.tier.id); }}
                        >
                          <LinearGradient colors={ts.tier.gradient} style={s.tierChipGradient}>
                            <Text style={{ fontSize: 16 }}>{ts.tier.emblem}</Text>
                          </LinearGradient>
                          <Text style={[s.tierChipName, { color: ts.tier.color }]} numberOfLines={1}>
                            {language === 'fr' ? ts.tier.name.fr : ts.tier.name.en}
                          </Text>
                          <Text style={s.tierChipCount}>{ts.playerCount}</Text>
                          {isMyTier ? (
                            <View style={[s.tierMyDot, { backgroundColor: ts.tier.color + '25' }]}>
                              <MaterialIcons name="person" size={8} color={ts.tier.color} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {filteredSorted.length > 0 ? (
                <View style={s.listHeader}>
                  <Text style={s.listHeaderText}>
                    {filteredSorted.length} {t('leaderboard', 'publicPlayersCount')}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <>
              {hasMore ? (
                <View style={s.loadMoreFooter}>
                  <ActivityIndicator size="small" color="#D97706" />
                </View>
              ) : filteredSorted.length > 5 ? <AdBanner position="inline" /> : null}
            </>
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <MaterialIcons name="people-outline" size={56} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{t('leaderboard', 'noPlayers')}</Text>
              <Text style={s.emptyDesc}>
                {search || activeFilterCount > 0
                  ? t('leaderboard', 'noPlayersMatchingFilters')
                  : t('leaderboard', 'noPlayersDesc')}
              </Text>
              {(search || activeFilterCount > 0) ? (
                <Pressable style={s.resetBtn} onPress={clearFilters}>
                  <MaterialIcons name="refresh" size={16} color="#D97706" />
                  <Text style={s.resetBtnText}>{t('common', 'reset')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      ))}

      {/* My rank footer when not visible in list (players tab only) */}
      {activeTab === 'players' && myRank && myRank > visibleCount && !loading ? (() => {
        const myP = filteredSorted[myRank - 1];
        if (!myP) return null;
        return (
          <View style={[s.myRankFooter, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.myRankContent}>
              <View style={s.myRankBadge}>
                <Text style={s.myRankBadgeText}>#{myRank}</Text>
              </View>
              <View style={s.myRankAvatarWrap}>
                {myP.avatar ? (
                  <Image source={{ uri: myP.avatar }} style={s.myRankAvatar} contentFit="cover" placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.myRankAvatar, { backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{myP.name.charAt(0)}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.myRankName} numberOfLines={1}>{myP.name}</Text>
                <Text style={s.myRankStats}>{myP.stats.winRate}% • {myP.stats.matchesPlayed} {t('leaderboard', 'matches')}</Text>
              </View>
              <MaterialIcons name="star" size={18} color={theme.primary} />
            </View>
          </View>
        );
      })() : null}

      {/* ============ FILTER MODAL ============ */}
      <Modal visible={showFilterModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilterModal(false)}>
        <SafeAreaView edges={['top']} style={s.fmContainer}>
          <View style={s.fmHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.fmHeaderTitle}>{language === 'fr' ? 'Filtres' : 'Filters'}</Text>
              {activeFilterCount > 0 ? <Text style={s.fmHeaderCount}>{activeFilterCount} {language === 'fr' ? 'actif(s)' : 'active'}</Text> : null}
            </View>
            {activeFilterCount > 0 ? (
              <Pressable style={s.fmClearBtn} onPress={() => { Haptics.selectionAsync(); clearFilters(); }}>
                <MaterialIcons name="restart-alt" size={16} color={theme.error} />
                <Text style={s.fmClearBtnText}>{language === 'fr' ? 'Effacer tout' : 'Clear all'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={s.fmCloseBtn} onPress={() => setShowFilterModal(false)}>
              <MaterialIcons name="close" size={22} color={theme.textPrimary} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.fmContent} showsVerticalScrollIndicator={false}>
            {/* Geographic Scope */}
            <View style={s.fmSection}>
              <View style={s.fmSectionHeader}>
                <View style={[s.fmSectionIcon, { backgroundColor: '#F59E0B18' }]}><MaterialIcons name="public" size={16} color="#F59E0B" /></View>
                <Text style={s.fmSectionTitle}>{(extraTranslations.geoScope?.title as any)?.[language] || (language === 'fr' ? 'Zone geographique' : 'Geographic zone')}</Text>
              </View>
              <View style={s.fmChipGrid}>
                {(['world', 'continent', 'country', 'city'] as const).map(scope => {
                  const isActive = geoScope === scope;
                  const icons: Record<string, string> = { world: 'public', continent: 'travel-explore', country: 'flag', city: 'place' };
                  const labels: Record<string, string> = {
                    world: (extraTranslations.geoScope?.world as any)?.[language] || 'World',
                    continent: (extraTranslations.geoScope?.continent as any)?.[language] || 'Continent',
                    country: (extraTranslations.geoScope?.country as any)?.[language] || 'Country',
                    city: (extraTranslations.geoScope?.city as any)?.[language] || 'City',
                  };
                  return (
                    <Pressable key={scope} style={[s.fmChip, isActive && s.fmChipActive]} onPress={() => {
                      Haptics.selectionAsync();
                      let val = '';
                      if (scope === 'continent' && selfPlayer?.country) val = getContinent(selfPlayer.country);
                      else if (scope === 'country' && selfPlayer?.country) val = selfPlayer.country;
                      else if (scope === 'city' && selfPlayer?.location?.city) val = (selfPlayer.location as any).city;
                      updateGeoScope(scope, val);
                    }}>
                      <MaterialIcons name={icons[scope] as any} size={15} color={isActive ? '#F59E0B' : theme.textSecondary} />
                      <Text style={[s.fmChipText, isActive && s.fmChipTextActive]}>{labels[scope]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {geoScope !== 'world' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fmValueRow}>
                  {(geoScope === 'continent'
                    ? (() => { const cs = allPlayers.map(p => p.country).filter(Boolean).map(c => getContinent(c!)); return [...new Set(cs)].sort(); })()
                    : geoScope === 'country' ? uniqueCountries : uniqueCities
                  ).map(val => {
                    const isActive = geoValue === val;
                    return (
                      <Pressable key={val} style={[s.fmValueChip, isActive && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); updateGeoScope(geoScope, isActive ? '' : val); }}>
                        <Text style={[s.fmValueChipText, isActive && s.fmValueChipTextActive]} numberOfLines={1}>
                          {geoScope === 'continent' ? `${getContinentFlag(val)} ${getContinentLabel(val, language === 'fr')}` : geoScope === 'country' ? `${getCountryFlag(val)} ${val}` : val}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>

            {/* Period */}
            <View style={s.fmSection}>
              <View style={s.fmSectionHeader}>
                <View style={[s.fmSectionIcon, { backgroundColor: '#2563EB18' }]}><MaterialIcons name="date-range" size={16} color="#2563EB" /></View>
                <Text style={s.fmSectionTitle}>{t('leaderboard', 'periodLabel')}</Text>
              </View>
              <View style={s.fmChipGrid}>
                {([
                  { id: 'all' as LeaderboardPeriod, label: t('leaderboard', 'periodAll') },
                  { id: '7d' as LeaderboardPeriod, label: t('leaderboard', 'period7d') },
                  { id: '30d' as LeaderboardPeriod, label: t('leaderboard', 'period30d') },
                  { id: '3m' as LeaderboardPeriod, label: t('leaderboard', 'period3m') },
                  { id: '6m' as LeaderboardPeriod, label: t('leaderboard', 'period6m') },
                  { id: '1y' as LeaderboardPeriod, label: t('leaderboard', 'period1y') },
                  { id: 'season' as LeaderboardPeriod, label: t('leaderboard', 'periodSeason') },
                  { id: 'lastSeason' as LeaderboardPeriod, label: t('leaderboard', 'periodLastSeason') },
                ]).map(chip => (
                  <Pressable key={chip.id} style={[s.fmChip, periodFilter === chip.id && { backgroundColor: '#2563EB15', borderColor: '#2563EB60' }]} onPress={() => handlePeriodChange(chip.id)}>
                    <Text style={[s.fmChipText, periodFilter === chip.id && { color: '#2563EB', fontWeight: '700' }]}>{chip.label}</Text>
                    {periodLoading && periodFilter === chip.id ? <ActivityIndicator size={10} color="#2563EB" /> : null}
                  </Pressable>
                ))}
              </View>
            </View>



            {/* Trust Level (players tab) */}
            {activeTab === 'players' ? (
              <View style={s.fmSection}>
                <View style={s.fmSectionHeader}>
                  <View style={[s.fmSectionIcon, { backgroundColor: '#22C55E18' }]}><MaterialIcons name="shield" size={16} color="#22C55E" /></View>
                  <Text style={s.fmSectionTitle}>{language === 'fr' ? 'Niveau de confiance' : 'Trust level'}</Text>
                </View>
                <View style={s.fmChipGrid}>
                  {[
                    { id: 'all', label: language === 'fr' ? 'Tous' : 'All', color: theme.textSecondary, pct: null },
                    { id: 'verified', label: language === 'fr' ? 'Verifie' : 'Verified', color: '#22C55E', pct: trustLevelStats.verified },
                    { id: 'trusted', label: language === 'fr' ? 'Fiable' : 'Trusted', color: '#3B82F6', pct: trustLevelStats.trusted },
                    { id: 'standard', label: 'Standard', color: '#D97706', pct: trustLevelStats.standard },
                  ].map(chip => {
                    const isActive = filterTrustLevel === chip.id;
                    return (
                      <Pressable key={chip.id} style={[s.fmChip, isActive && { backgroundColor: chip.color + '15', borderColor: chip.color + '60' }]} onPress={() => { Haptics.selectionAsync(); setFilterTrustLevel(chip.id); }}>
                        <MaterialIcons name={chip.id === 'all' ? 'people' : 'verified-user'} size={14} color={isActive ? chip.color : theme.textSecondary} />
                        <Text style={[s.fmChipText, isActive && { color: chip.color, fontWeight: '700' }]}>{chip.label}</Text>
                        {chip.pct !== null ? <Text style={{ fontSize: 9, fontWeight: '700', color: isActive ? chip.color : theme.textMuted }}>{chip.pct}%</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Role (players tab) */}
            {activeTab === 'players' ? (
              <View style={s.fmSection}>
                <View style={s.fmSectionHeader}>
                  <View style={[s.fmSectionIcon, { backgroundColor: theme.primary + '18' }]}><MaterialIcons name="sports" size={16} color={theme.primary} /></View>
                  <Text style={s.fmSectionTitle}>{t('leaderboard', 'filterByRole')}</Text>
                </View>
                <View style={s.fmChipGrid}>
                  {['all', 'Tireur', 'Pointeur', 'Milieu'].map(opt => (
                    <Pressable key={opt} style={[s.fmChip, filterRole === opt && s.fmChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterRole(opt); }}>
                      <Text style={[s.fmChipText, filterRole === opt && s.fmChipTextActive]}>{opt === 'all' ? t('leaderboard', 'allRoles') : t('roles', opt)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}



            {/* Club (players tab) */}
            {activeTab === 'players' && uniqueClubs.length > 0 ? (
              <View style={s.fmSection}>
                <View style={s.fmSectionHeader}>
                  <View style={[s.fmSectionIcon, { backgroundColor: theme.primary + '18' }]}><MaterialIcons name="home" size={16} color={theme.primary} /></View>
                  <Text style={s.fmSectionTitle}>{t('leaderboard', 'filterByClub')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fmValueRow}>
                  <Pressable style={[s.fmValueChip, filterClub === 'all' && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterClub('all'); }}>
                    <Text style={[s.fmValueChipText, filterClub === 'all' && s.fmValueChipTextActive]}>{t('leaderboard', 'allClubs')}</Text>
                  </Pressable>
                  {uniqueClubs.map(club => (
                    <Pressable key={club} style={[s.fmValueChip, filterClub === club && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterClub(club); }}>
                      <Text style={[s.fmValueChipText, filterClub === club && s.fmValueChipTextActive]} numberOfLines={1}>{club}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Terrain (players tab) */}
            {activeTab === 'players' && uniqueTerrains.length > 0 ? (
              <View style={s.fmSection}>
                <View style={s.fmSectionHeader}>
                  <View style={[s.fmSectionIcon, { backgroundColor: theme.success + '18' }]}><MaterialIcons name="sports-soccer" size={16} color={theme.success} /></View>
                  <Text style={s.fmSectionTitle}>{t('leaderboard', 'filterByTerrain')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fmValueRow}>
                  <Pressable style={[s.fmValueChip, filterTerrain === 'all' && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterTerrain('all'); }}>
                    <Text style={[s.fmValueChipText, filterTerrain === 'all' && s.fmValueChipTextActive]}>{t('leaderboard', 'allTerrains')}</Text>
                  </Pressable>
                  {uniqueTerrains.map(tn => (
                    <Pressable key={tn} style={[s.fmValueChip, filterTerrain === tn && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterTerrain(tn); }}>
                      <Text style={[s.fmValueChipText, filterTerrain === tn && s.fmValueChipTextActive]} numberOfLines={1}>{tn}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Brand (players tab) */}
            {activeTab === 'players' && uniqueBrands.length > 0 ? (
              <View style={s.fmSection}>
                <View style={s.fmSectionHeader}>
                  <View style={[s.fmSectionIcon, { backgroundColor: '#D9770618' }]}><MaterialIcons name="sports-baseball" size={16} color="#D97706" /></View>
                  <Text style={s.fmSectionTitle}>{t('leaderboard', 'filterByBrand')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fmValueRow}>
                  <Pressable style={[s.fmValueChip, filterBrand === 'all' && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterBrand('all'); }}>
                    <Text style={[s.fmValueChipText, filterBrand === 'all' && s.fmValueChipTextActive]}>{t('leaderboard', 'allBrands')}</Text>
                  </Pressable>
                  {uniqueBrands.map(brand => (
                    <Pressable key={brand} style={[s.fmValueChip, filterBrand === brand && s.fmValueChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterBrand(brand); }}>
                      <Text style={[s.fmValueChipText, filterBrand === brand && s.fmValueChipTextActive]} numberOfLines={1}>{brand}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>

          {/* Apply button */}
          <View style={s.fmFooter}>
            <Pressable style={s.fmApplyBtn} onPress={() => { Haptics.selectionAsync(); setShowFilterModal(false); }}>
              <MaterialIcons name="check" size={20} color="#FFF" />
              <Text style={s.fmApplyBtnText}>{language === 'fr' ? 'Appliquer' : 'Apply'}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Meetup Invitation Picker Modal */}
      <Modal visible={showMeetupPicker} animationType="slide" transparent onRequestClose={() => setShowMeetupPicker(false)}>
        <View style={s.mipOverlay}>
          <View style={s.mipContent}>
            <View style={s.mipHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.mipTitle}>{t('meetup', 'inviteToMeetup')}</Text>
                <Text style={s.mipSubtitle}>{meetupPickerUserName}</Text>
              </View>
              <Pressable style={s.mipClose} onPress={() => setShowMeetupPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={s.mipDesc}>{t('meetup', 'chooseMeetup')}</Text>
            {loadingMeetups ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : activeMeetups.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {activeMeetups.map((m) => {
                  const mDate = new Date(m.date);
                  return (
                    <Pressable
                      key={m.id}
                      style={[s.mipItem, invitingToMeetup === m.id && { opacity: 0.6 }]}
                      onPress={() => handleConfirmInvite(m.id)}
                      disabled={!!invitingToMeetup}
                    >
                      <View style={s.mipItemDate}>
                        <Text style={s.mipItemDay}>{mDate.getDate()}</Text>
                        <Text style={s.mipItemMonth}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.mipItemTitle} numberOfLines={1}>{m.title}</Text>
                        <Text style={s.mipItemTime}>{mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {invitingToMeetup === m.id ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <View style={s.mipArrow}><MaterialIcons name="send" size={16} color={theme.primary} /></View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="event-busy" size={40} color={theme.textMuted} />
                <Text style={s.mipEmptyText}>{t('meetup', 'noActiveMeetups')}</Text>
                <Text style={s.mipEmptyDesc}>{t('meetup', 'noActiveMeetupsDesc')}</Text>
                <Pressable style={s.mipCreateBtn} onPress={() => { setShowMeetupPicker(false); router.push('/meetup/new' as any); }}>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },

  // Header
  header: { backgroundColor: theme.surface },
  headerBottom: { borderBottomWidth: 1, borderBottomColor: theme.border },
  headerGradient: { paddingTop: 12, paddingBottom: 16, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },

  // Tabs — new dark theme
  tabRow: { flexDirection: 'row', gap: 3, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 11, position: 'relative' as const },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  tabBtnText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  tabBtnTextActive: { color: '#F59E0B', fontWeight: '700' },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#FFF' },
  filterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  filterBtnActive: { backgroundColor: '#F59E0B25', borderWidth: 1, borderColor: '#F59E0B50' },
  filterBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#F59E0B', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1E293B' },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },

  // Autocomplete
  autocompleteDropdown: { position: 'absolute' as const, top: 52, left: 0, right: 54, backgroundColor: '#1E293B', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' as const, maxHeight: 320, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 }, android: { elevation: 10 }, default: {} }) },
  recentSearchHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  recentSearchTitle: { fontSize: 11, fontWeight: '600' as const, color: '#64748B' },
  recentSearchClear: { fontSize: 11, fontWeight: '600' as const, color: '#F59E0B' },
  autocompleteItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  autocompleteAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  autocompleteName: { fontSize: 14, fontWeight: '600' as const, color: '#F8FAFC' },
  autocompleteSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  // Sort
  sortWrapper: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 8 },

  // Period filter
  periodFilterSection: { paddingHorizontal: 0, paddingTop: 4, paddingBottom: 2 },
  periodLabelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginBottom: 6, paddingHorizontal: 16 },
  periodLabelText: { fontSize: 11, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  periodChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  periodChipTextActive: { color: '#FFF' },

  // Boules extra filters
  boulesExtraFilters: { paddingHorizontal: 16, gap: 8 },
  boulesModePills: { flexDirection: 'row', gap: 6 },
  bModePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  bModePillActive: { backgroundColor: '#D97706' + '15', borderColor: '#D97706' },
  bModePillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  bModePillTextActive: { color: '#D97706' },
  sortRow: { paddingHorizontal: 16, gap: 8 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border },
  sortChipActive: { backgroundColor: '#F59E0B15', borderColor: '#F59E0B60' },
  sortChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  sortChipTextActive: { color: '#F59E0B' },

  // Header filter chips (compact, in gradient)
  headerFilterChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#F59E0B18', borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B30' },
  headerFilterChipText: { fontSize: 11, fontWeight: '600' as const, color: '#F59E0B', maxWidth: 100 },

  // Filter Modal
  fmContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  fmHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  fmHeaderTitle: { fontSize: 20, fontWeight: '800' as const, color: theme.textPrimary },
  fmHeaderCount: { fontSize: 12, color: '#F59E0B', fontWeight: '600' as const, marginTop: 2 },
  fmClearBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.error + '10', borderRadius: 10 },
  fmClearBtnText: { fontSize: 12, fontWeight: '600' as const, color: theme.error },
  fmCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  fmContent: { padding: 16, paddingBottom: 40 },
  fmSection: { marginBottom: 20 },
  fmSectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 12 },
  fmSectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  fmSectionTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  fmChipGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  fmChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  fmChipActive: { backgroundColor: '#F59E0B12', borderColor: '#F59E0B60' },
  fmChipText: { fontSize: 13, fontWeight: '600' as const, color: theme.textSecondary },
  fmChipTextActive: { color: '#F59E0B', fontWeight: '700' as const },
  fmValueRow: { gap: 8, paddingTop: 10 },
  fmValueChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  fmValueChipActive: { backgroundColor: '#F59E0B12', borderColor: '#F59E0B60' },
  fmValueChipText: { fontSize: 12, fontWeight: '600' as const, color: theme.textSecondary, maxWidth: 140 },
  fmValueChipTextActive: { color: '#F59E0B', fontWeight: '700' as const },
  fmFooter: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  fmApplyBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14 },
  fmApplyBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  listContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  listHeader: { paddingVertical: 8 },
  listHeaderText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  loadMoreFooter: { paddingVertical: 20, alignItems: 'center' },

  // League tier card (integrated from global-ranking)
  leagueCard: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' as const, ...Platform.select({ ios: { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10 }, android: { elevation: 4 }, default: {} }) },
  leagueGradient: { padding: 16, borderRadius: 16 },
  leagueTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  leagueEmblemWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  leagueTierName: { fontSize: 16, fontWeight: '800' as const, color: '#FFF', letterSpacing: -0.3 },
  leagueEloLabel: { fontSize: 12, fontWeight: '600' as const, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  leagueRankBadge: { alignItems: 'center' as const, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  leagueRankHash: { fontSize: 10, fontWeight: '600' as const, color: 'rgba(255,255,255,0.5)' },
  leagueRankValue: { fontSize: 20, fontWeight: '900' as const, color: '#FFF', lineHeight: 22 },
  leagueRankTotal: { fontSize: 10, fontWeight: '600' as const, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  leagueProgressRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 12 },
  leagueProgressTrack: { flex: 1, height: 5, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' as const },
  leagueProgressFill: { height: '100%' as const, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 3 },
  leagueProgressText: { fontSize: 10, fontWeight: '700' as const, color: 'rgba(255,255,255,0.6)' },

  // Tier overview (distribution chips)
  tierOverview: { marginBottom: 12 },
  tierScroll: { gap: 8 },
  tierChip: { width: 84, backgroundColor: theme.surface, borderRadius: 14, padding: 10, alignItems: 'center' as const, borderWidth: 1, borderColor: theme.border, ...theme.shadows.card },
  tierChipGradient: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 6 },
  tierChipName: { fontSize: 10, fontWeight: '700' as const, textAlign: 'center' as const, marginBottom: 2 },
  tierChipCount: { fontSize: 10, fontWeight: '600' as const, color: theme.textMuted },
  tierMyDot: { position: 'absolute' as const, top: 4, right: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },

  // Player row
  row: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 10, ...theme.shadows.card },
  rowMe: { borderWidth: 2, borderColor: theme.primary, backgroundColor: theme.primary + '05' },
  rankCol: { width: 32, alignItems: 'center', marginRight: 10 },
  medal: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 15, fontWeight: '900' },
  rankText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  playerCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden' },
  meBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.surface },
  playerName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  playerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  playerClub: { fontSize: 11, color: theme.textMuted, maxWidth: 120 },
  playerCity: { fontSize: 11, color: theme.textMuted, maxWidth: 80 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted, marginHorizontal: 5 },
  playerTags: { flexDirection: 'row', gap: 4, marginTop: 4 },
  playerTag: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  playerTagText: { fontSize: 10, fontWeight: '600' },
  statsCol: { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  statBlock: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  statLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },
  inviteBtn: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.primary + '25' },
  premiumBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#A8B4C0' + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A8B4C0' + '40' },
  ambassadorBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#7C3AED' + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7C3AED' + '40' },
  trustBadgeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, position: 'absolute' as const, top: 12, left: 52, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: theme.backgroundSecondary, borderWidth: 1, zIndex: 1 },
  trustBadgeText: { fontSize: 9, fontWeight: '800' as const },

  // States
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#D97706' + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  loadingText: { fontSize: 15, color: theme.textMuted },
  errorText: { fontSize: 15, color: theme.textSecondary, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#D97706' + '15', borderRadius: 10 },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#D97706' },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#D97706' + '12', borderRadius: 10 },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#D97706' },

  // My rank footer
  myRankFooter: { backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 16, paddingTop: 12 },
  myRankContent: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.primary + '08', borderRadius: theme.borderRadius.lg, padding: 12, borderWidth: 1.5, borderColor: theme.primary + '30' },
  myRankBadge: { backgroundColor: theme.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  myRankBadgeText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  myRankAvatarWrap: {},
  myRankAvatar: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' },
  myRankName: { fontSize: 14, fontWeight: '700', color: theme.primary },
  myRankStats: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },

  // Meetup invitation picker
  mipOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  mipContent: { backgroundColor: theme.surface, borderRadius: 24, padding: 24 },
  mipHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  mipTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  mipSubtitle: { fontSize: 13, color: theme.primary, fontWeight: '600', marginTop: 2 },
  mipClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  mipDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
  mipItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10 },
  mipItemDate: { width: 46, height: 46, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  mipItemDay: { fontSize: 18, fontWeight: '900', color: theme.primary, lineHeight: 20 },
  mipItemMonth: { fontSize: 9, fontWeight: '700', color: theme.primary, letterSpacing: 0.5 },
  mipItemTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  mipItemTime: { fontSize: 12, color: theme.textMuted },
  mipArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  mipEmptyText: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginTop: 12 },
  mipEmptyDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16, paddingHorizontal: 16 },
  mipCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },

  // Crown badge for #1
  crownContainer: { alignItems: 'center' as const, position: 'relative' as const },
  crownEmoji: { fontSize: 14, lineHeight: 16, marginBottom: -2 },

  // Club rows
  clubRow: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 10, ...theme.shadows.card },
  clubHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  clubLogoWrap: {},
  clubLogo: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden' as const },
  clubName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  clubCity: { fontSize: 11, color: theme.textMuted },
  clubMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  clubMetaText: { fontSize: 10, color: theme.textMuted },
  clubScoreBadge: { alignItems: 'center', backgroundColor: '#D97706' + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  clubScoreValue: { fontSize: 18, fontWeight: '900', color: '#D97706' },
  clubScoreLabel: { fontSize: 9, fontWeight: '600', color: '#D97706', marginTop: 1 },
  clubStats: { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  clubStatItem: { flex: 1, alignItems: 'center' },
  clubStatValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  clubStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },
  clubTopPlayers: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '30' },
  clubTopLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
  clubTopPlayer: { alignItems: 'center', gap: 3, minWidth: 52 },
  clubTopAvatar: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden' as const },
  clubTopPlayerName: { fontSize: 10, fontWeight: '600', color: theme.textPrimary, maxWidth: 60 },
  clubTopPlayerStat: { fontSize: 10, fontWeight: '700', color: '#D97706' },

  // Boules rows
  boulesRow: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 10, ...theme.shadows.card },
  boulesHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  boulesIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#D97706' + '12', overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  boulesName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  boulesRoleSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '30' },
  boulesRoleTitle: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  boulesRoleChip: { backgroundColor: theme.backgroundSecondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', gap: 2 },
  boulesRoleName: { fontSize: 10, fontWeight: '700', color: theme.textPrimary },
  boulesRoleStat: { fontSize: 10, fontWeight: '600', color: '#D97706' },
  boulesRoleCount: { fontSize: 9, color: theme.textMuted },
});
