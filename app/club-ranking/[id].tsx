import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { fetchLeaderboard, sortLeaderboard, LeaderboardPlayer } from '@/services/leaderboardService';
import RadarChart from '@/components/ui/RadarChart';
import AdBanner from '@/components/ui/AdBanner';

export default function ClubRankingScreen() {
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const clubName = name ? decodeURIComponent(name) : id || '';

  const [allPlayers, setAllPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubLogo, setClubLogo] = useState<string | undefined>();
  const [clubCity, setClubCity] = useState<string | undefined>();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    const { players, error: err } = await fetchLeaderboard();
    setAllPlayers(players);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Also try to fetch club details (logo, city)
  useEffect(() => {
    const fetchClubDetails = async () => {
      try {
        const { getSupabaseClient } = await import('@/template');
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('clubs')
          .select('logo, city')
          .eq('id', id)
          .maybeSingle();
        if (data) {
          if (data.logo) setClubLogo(data.logo);
          if (data.city) setClubCity(data.city);
        }
      } catch { /* silent */ }
    };
    if (id) fetchClubDetails();
  }, [id]);

  // Filter players belonging to this club
  const clubPlayers = useMemo(() => {
    return sortLeaderboard(
      allPlayers.filter(p => p.club === clubName),
      'winRate'
    );
  }, [allPlayers, clubName]);

  // Aggregated stats
  const stats = useMemo(() => {
    if (clubPlayers.length === 0) return null;

    const totalMatches = clubPlayers.reduce((s, p) => s + p.stats.matchesPlayed, 0);
    const totalWins = clubPlayers.reduce((s, p) => s + p.stats.wins, 0);

    const avgWinRate = Math.round(clubPlayers.reduce((s, p) => s + p.stats.winRate, 0) / clubPlayers.length);
    const tirPlayers = clubPlayers.filter(p => p.stats.tirRate > 0);
    const avgTirRate = tirPlayers.length > 0
      ? Math.round(tirPlayers.reduce((s, p) => s + p.stats.tirRate, 0) / tirPlayers.length) : 0;
    const pointPlayers = clubPlayers.filter(p => p.stats.pointRate > 0);
    const avgPointRate = pointPlayers.length > 0
      ? Math.round(pointPlayers.reduce((s, p) => s + p.stats.pointRate, 0) / pointPlayers.length) : 0;
    const carreauPlayers = clubPlayers.filter(p => p.stats.carreauRate > 0);
    const avgCarreauRate = carreauPlayers.length > 0
      ? Math.round(carreauPlayers.reduce((s, p) => s + p.stats.carreauRate, 0) / carreauPlayers.length) : 0;

    // Activity score: normalized (max 50 matches/player → 100)
    const activityScore = Math.min(100, Math.round((totalMatches / clubPlayers.length / 50) * 100));

    // Composite
    const compositeScore = Math.round(
      avgWinRate * 0.40 + avgTirRate * 0.25 + avgCarreauRate * 0.20 + activityScore * 0.15
    );

    return {
      playerCount: clubPlayers.length,
      totalMatches,
      totalWins,
      avgWinRate,
      avgTirRate,
      avgPointRate,
      avgCarreauRate,
      activityScore,
      compositeScore,
    };
  }, [clubPlayers]);

  // Radar data
  const radarData = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('leaderboard', 'clubAvgWin'), value: stats.avgWinRate, color: '#D97706' },
      { label: t('leaderboard', 'clubTir'), value: stats.avgTirRate, color: theme.tirColor },
      { label: t('leaderboard', 'clubPoint'), value: stats.avgPointRate, color: theme.pointColor },
      { label: t('leaderboard', 'clubCarreau'), value: stats.avgCarreauRate, color: theme.carreauColor },
      { label: language === 'fr' ? 'Activité' : 'Activity', value: stats.activityScore, color: theme.primary },
    ];
  }, [stats, t, language]);

  // Role breakdown
  const roleBreakdown = useMemo(() => {
    const roles: Record<string, number> = {};
    for (const p of clubPlayers) {
      roles[p.role] = (roles[p.role] || 0) + 1;
    }
    return Object.entries(roles).sort((a, b) => b[1] - a[1]);
  }, [clubPlayers]);

  const renderPlayerItem = useCallback(({ item, index }: { item: LeaderboardPlayer; index: number }) => {
    const rank = index + 1;
    const isMe = !!(user && (item.userId === user.id || (selfPlayer && item.id === selfPlayer.id)));
    const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#A8B4C0', 3: '#CD7F32' };
    const medalColor = medalColors[rank];

    return (
      <Animated.View entering={FadeIn.duration(200).delay(Math.min(index * 40, 400))}>
        <Pressable
          style={[s.playerRow, isMe && s.playerRowMe]}
          onPress={() => router.push(isMe ? '/player/me' : `/player/${item.id}` as any)}
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

          <View style={s.avatarWrap}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={s.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
            ) : (
              <View style={[s.avatar, { backgroundColor: isMe ? theme.primary : theme.textMuted + '30', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isMe ? '#FFF' : theme.textSecondary }}>{item.name.charAt(0)}</Text>
              </View>
            )}
            {isMe ? <View style={s.meBadge}><MaterialIcons name="star" size={7} color="#FFF" /></View> : null}
            {item.isPremium ? (
              <View style={s.premiumDot}>
                <MaterialIcons name="star" size={7} color="#A8B4C0" />
              </View>
            ) : null}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[s.playerName, isMe && { color: theme.primary }]} numberOfLines={1}>
              {item.name}{isMe ? ` (${t('leaderboard', 'you')})` : ''}
            </Text>
            <View style={s.playerTags}>
              <View style={[s.playerTag, { backgroundColor: theme.primary + '12' }]}>
                <Text style={[s.playerTagText, { color: theme.primary }]}>{t('roles', item.role)}</Text>
              </View>
              <View style={[s.playerTag, { backgroundColor: theme.accent + '12' }]}>
                <Text style={[s.playerTagText, { color: theme.accent }]}>{t('levels', item.level)}</Text>
              </View>
            </View>
          </View>

          <View style={s.playerStatsCol}>
            <View style={s.playerStatBlock}>
              <Text style={s.playerStatValue}>{item.stats.winRate}%</Text>
              <Text style={s.playerStatLabel}>{t('leaderboard', 'clubAvgWin')}</Text>
            </View>
            <View style={s.playerStatBlock}>
              <Text style={s.playerStatValue}>{item.stats.matchesPlayed}</Text>
              <Text style={s.playerStatLabel}>{t('leaderboard', 'matches')}</Text>
            </View>
          </View>

          <View style={s.playerMiniStats}>
            <Text style={[s.miniStat, { color: theme.tirColor }]}>{item.stats.tirRate > 0 ? `${item.stats.tirRate}%` : '-'}</Text>
            <Text style={[s.miniStat, { color: theme.carreauColor }]}>{item.stats.carreauRate > 0 ? `${item.stats.carreauRate}%` : '-'}</Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }, [user, selfPlayer, t]);

  const keyExtractor = useCallback((item: LeaderboardPlayer) => item.id, []);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <LinearGradient colors={['#92400E', '#D97706', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.headerGradient}>
        <View style={s.headerTop}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{clubName}</Text>
            <Text style={s.headerSubtitle}>
              {stats ? `${stats.playerCount} ${t('leaderboard', 'clubPlayers')} • ${stats.totalMatches} ${t('leaderboard', 'clubMatches')}` : t('leaderboard', 'loading')}
            </Text>
          </View>
          {clubLogo ? (
            <Image source={{ uri: clubLogo }} style={s.headerLogo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
          ) : (
            <View style={[s.headerLogo, { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
              <MaterialIcons name="home" size={24} color="#FFF" />
            </View>
          )}
        </View>
        {clubCity ? (
          <View style={s.headerLocationRow}>
            <MaterialIcons name="place" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={s.headerLocation}>{clubCity}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <View style={s.centerState}>
          <View style={s.loadingIconBg}><MaterialIcons name="home" size={32} color="#D97706" /></View>
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
      ) : clubPlayers.length === 0 ? (
        <View style={s.centerState}>
          <MaterialIcons name="people-outline" size={56} color={theme.textMuted} />
          <Text style={s.emptyTitle}>{t('leaderboard', 'noClubPlayers')}</Text>
          <Text style={s.emptyDesc}>{t('leaderboard', 'noClubPlayersDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={clubPlayers}
          keyExtractor={keyExtractor}
          renderItem={renderPlayerItem}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Radar Chart */}
              {stats && radarData.length >= 5 ? (
                <Animated.View entering={FadeInDown.duration(400)} style={s.radarSection}>
                  <View style={s.radarCard}>
                    <View style={s.radarHeader}>
                      <View style={s.radarIconBg}>
                        <MaterialIcons name="radar" size={18} color="#D97706" />
                      </View>
                      <View>
                        <Text style={s.radarTitle}>{language === 'fr' ? 'Radar de performance' : 'Performance Radar'}</Text>
                        <Text style={s.radarSubtitle}>{language === 'fr' ? 'Moyennes des membres' : 'Member averages'}</Text>
                      </View>
                    </View>
                    <View style={s.radarChartWrap}>
                      <RadarChart
                        data={radarData}
                        size={Math.min(screenWidth - 80, 260)}
                      />
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              {/* Aggregated Stats Cards */}
              {stats ? (
                <Animated.View entering={FadeInDown.duration(400).delay(60)} style={s.statsSection}>
                  <View style={s.statsGrid}>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: '#D97706' }]}>{stats.compositeScore}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'clubComposite')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.success }]}>{stats.avgWinRate}%</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'clubAvgWin')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.tirColor }]}>{stats.avgTirRate > 0 ? `${stats.avgTirRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'clubTir')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.pointColor }]}>{stats.avgPointRate > 0 ? `${stats.avgPointRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'clubPoint')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.carreauColor }]}>{stats.avgCarreauRate > 0 ? `${stats.avgCarreauRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'clubCarreau')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.primary }]}>{stats.activityScore}%</Text>
                      <Text style={s.statCardLabel}>{language === 'fr' ? 'Activité' : 'Activity'}</Text>
                    </View>
                  </View>

                  {/* Summary row */}
                  <View style={s.summaryRow}>
                    <View style={s.summaryItem}>
                      <MaterialIcons name="people" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.playerCount} {t('leaderboard', 'clubPlayers')}</Text>
                    </View>
                    <View style={s.summaryDot} />
                    <View style={s.summaryItem}>
                      <MaterialIcons name="sports" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.totalMatches} {t('leaderboard', 'clubMatches')}</Text>
                    </View>
                    <View style={s.summaryDot} />
                    <View style={s.summaryItem}>
                      <MaterialIcons name="emoji-events" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.totalWins} {language === 'fr' ? 'victoires' : 'wins'}</Text>
                    </View>
                  </View>

                  {/* Role breakdown */}
                  {roleBreakdown.length > 0 ? (
                    <View style={s.roleRow}>
                      {roleBreakdown.map(([role, count]) => {
                        const roleColors: Record<string, string> = { 'Tireur': theme.tirColor, 'Pointeur': theme.pointColor, 'Milieu': theme.primary };
                        const c = roleColors[role] || theme.textSecondary;
                        return (
                          <View key={role} style={[s.roleChip, { backgroundColor: c + '12', borderColor: c + '25' }]}>
                            <Text style={[s.roleChipText, { color: c }]}>{t('roles', role)}</Text>
                            <Text style={[s.roleChipCount, { color: c }]}>{count}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Animated.View>
              ) : null}

              {/* Members list header */}
              <Animated.View entering={FadeIn.duration(300).delay(120)}>
                <View style={s.membersHeader}>
                  <MaterialIcons name="people" size={18} color="#D97706" />
                  <Text style={s.membersTitle}>{language === 'fr' ? 'Membres publics' : 'Public Members'}</Text>
                  <View style={s.membersBadge}>
                    <Text style={s.membersBadgeText}>{clubPlayers.length}</Text>
                  </View>
                </View>
                {/* Column headers */}
                <View style={s.colHeaders}>
                  <Text style={[s.colHeader, { width: 32 }]}>#</Text>
                  <Text style={[s.colHeader, { flex: 1, marginLeft: 46 }]}>{t('leaderboard', 'player')}</Text>
                  <Text style={[s.colHeader, { width: 68, textAlign: 'center' }]}>{t('leaderboard', 'winRate')}</Text>
                  <Text style={[s.colHeader, { width: 44, textAlign: 'center' }]}>Tir/Car</Text>
                </View>
              </Animated.View>
            </View>
          }
          ListFooterComponent={clubPlayers.length > 3 ? <AdBanner position="inline" /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },

  // Header
  headerGradient: { paddingTop: 12, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerLogo: { width: 48, height: 48, borderRadius: 14, overflow: 'hidden' as const },
  headerLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 52 },
  headerLocation: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  // Radar
  radarSection: { paddingHorizontal: 16, marginBottom: 16 },
  radarCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, ...theme.shadows.card },
  radarHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  radarIconBg: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#D97706' + '15', alignItems: 'center', justifyContent: 'center' },
  radarTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  radarSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  radarChartWrap: { alignItems: 'center', paddingVertical: 8 },

  // Stats
  statsSection: { paddingHorizontal: 16, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '31%' as any, backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', ...theme.shadows.card },
  statCardValue: { fontSize: 22, fontWeight: '900' },
  statCardLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' as const },

  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: 12, ...theme.shadows.card },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  summaryDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted },

  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontWeight: '600' },
  roleChipCount: { fontSize: 13, fontWeight: '800' },

  // Members
  membersHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  membersTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  membersBadge: { backgroundColor: '#D97706', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  membersBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFF' },

  colHeaders: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  colHeader: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 16 },
  listContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },

  // Player row
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 12, marginBottom: 8, gap: 8, ...theme.shadows.card },
  playerRowMe: { borderWidth: 2, borderColor: theme.primary, backgroundColor: theme.primary + '05' },
  rankCol: { width: 28, alignItems: 'center' },
  medal: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 14, fontWeight: '900' },
  rankText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  avatarWrap: { position: 'relative' },
  avatar: { width: 38, height: 38, borderRadius: 12, overflow: 'hidden' as const },
  meBadge: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.surface },
  premiumDot: { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#A8B4C0' + '30', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A8B4C0' + '50' },
  playerName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  playerTags: { flexDirection: 'row', gap: 4, marginTop: 3 },
  playerTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  playerTagText: { fontSize: 10, fontWeight: '600' },
  playerStatsCol: { alignItems: 'flex-end', gap: 2 },
  playerStatBlock: { alignItems: 'flex-end' },
  playerStatValue: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  playerStatLabel: { fontSize: 8, color: theme.textMuted },
  playerMiniStats: { alignItems: 'center', gap: 2, minWidth: 32 },
  miniStat: { fontSize: 11, fontWeight: '600' },

  // States
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#D97706' + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  loadingText: { fontSize: 15, color: theme.textMuted },
  errorText: { fontSize: 15, color: theme.textSecondary, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#D97706' + '15', borderRadius: 10 },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#D97706' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
