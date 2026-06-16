import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  ScrollView,
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
import { getBrandVisual, getBrandImage } from '@/constants/boulesDatabase';

export default function BoulesRankingScreen() {
  const insets = useSafeAreaInsets();
  const { id, brand: brandParam, model: modelParam, mode: modeParam } = useLocalSearchParams<{ id: string; brand: string; model?: string; mode?: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const brandName = brandParam ? decodeURIComponent(brandParam) : '';
  const modelName = modelParam ? decodeURIComponent(modelParam) : undefined;
  const isModelMode = modeParam === 'model';
  const displayName = isModelMode && modelName ? `${brandName} ${modelName}` : brandName;

  const [allPlayers, setAllPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const loadData = useCallback(async () => {
    setLoading(true);
    const { players, error: err } = await fetchLeaderboard();
    setAllPlayers(players);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter players using this brand/model
  const boulesPlayers = useMemo(() => {
    return sortLeaderboard(
      allPlayers.filter(p => {
        if (!p.boulesBrand) return false;
        if (isModelMode && modelName) {
          return p.boulesBrand === brandName && (p.boulesModel === modelName || p.boulesModel === `${brandName} ${modelName}`);
        }
        return p.boulesBrand === brandName;
      }),
      'winRate'
    );
  }, [allPlayers, brandName, modelName, isModelMode]);

  // Aggregated stats
  const stats = useMemo(() => {
    if (boulesPlayers.length === 0) return null;

    const totalMatches = boulesPlayers.reduce((s, p) => s + p.stats.matchesPlayed, 0);
    const totalWins = boulesPlayers.reduce((s, p) => s + p.stats.wins, 0);

    const avgWinRate = Math.round(boulesPlayers.reduce((s, p) => s + p.stats.winRate, 0) / boulesPlayers.length);
    const tirPlayers = boulesPlayers.filter(p => p.stats.tirRate > 0);
    const avgTirRate = tirPlayers.length > 0
      ? Math.round(tirPlayers.reduce((s, p) => s + p.stats.tirRate, 0) / tirPlayers.length) : 0;
    const pointPlayers = boulesPlayers.filter(p => p.stats.pointRate > 0);
    const avgPointRate = pointPlayers.length > 0
      ? Math.round(pointPlayers.reduce((s, p) => s + p.stats.pointRate, 0) / pointPlayers.length) : 0;
    const carreauPlayers = boulesPlayers.filter(p => p.stats.carreauRate > 0);
    const avgCarreauRate = carreauPlayers.length > 0
      ? Math.round(carreauPlayers.reduce((s, p) => s + p.stats.carreauRate, 0) / carreauPlayers.length) : 0;

    return {
      playerCount: boulesPlayers.length,
      totalMatches,
      totalWins,
      avgWinRate,
      avgTirRate,
      avgPointRate,
      avgCarreauRate,
    };
  }, [boulesPlayers]);

  // Role breakdown
  const roleBreakdown = useMemo(() => {
    const roles: Record<string, { count: number; winRate: number; tirRate: number; pointRate: number; carreauRate: number }> = {};
    for (const p of boulesPlayers) {
      if (!roles[p.role]) {
        roles[p.role] = { count: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0 };
      }
      roles[p.role].count++;
      roles[p.role].winRate += p.stats.winRate;
      roles[p.role].tirRate += p.stats.tirRate;
      roles[p.role].pointRate += p.stats.pointRate;
      roles[p.role].carreauRate += p.stats.carreauRate;
    }
    return Object.entries(roles).map(([role, data]) => ({
      role,
      count: data.count,
      avgWinRate: Math.round(data.winRate / data.count),
      avgTirRate: data.count > 0 ? Math.round(data.tirRate / data.count) : 0,
      avgPointRate: data.count > 0 ? Math.round(data.pointRate / data.count) : 0,
      avgCarreauRate: data.count > 0 ? Math.round(data.carreauRate / data.count) : 0,
    })).sort((a, b) => b.count - a.count);
  }, [boulesPlayers]);

  // Radar data - overall
  const radarData = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('leaderboard', 'boulesAvgWin'), value: stats.avgWinRate, color: '#D97706' },
      { label: t('leaderboard', 'boulesTir'), value: stats.avgTirRate, color: theme.tirColor },
      { label: t('leaderboard', 'boulesPoint'), value: stats.avgPointRate, color: theme.pointColor },
      { label: t('leaderboard', 'boulesCarreau'), value: stats.avgCarreauRate, color: theme.carreauColor },
      { label: t('leaderboard', 'boulesPopularity'), value: Math.min(100, stats.playerCount * 10), color: theme.primary },
    ];
  }, [stats, t]);

  // Radar data per role (for the role comparison section)
  const roleRadarData = useMemo(() => {
    if (roleBreakdown.length < 2) return null;
    return roleBreakdown.map(r => ({
      role: r.role,
      data: [
        { label: t('leaderboard', 'boulesAvgWin'), value: r.avgWinRate, color: '#D97706' },
        { label: t('leaderboard', 'boulesTir'), value: r.avgTirRate, color: theme.tirColor },
        { label: t('leaderboard', 'boulesPoint'), value: r.avgPointRate, color: theme.pointColor },
        { label: t('leaderboard', 'boulesCarreau'), value: r.avgCarreauRate, color: theme.carreauColor },
      ],
    }));
  }, [roleBreakdown, t]);

  // Selected role for role radar
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  useEffect(() => {
    if (roleBreakdown.length > 0 && !selectedRole) {
      setSelectedRole(roleBreakdown[0].role);
    }
  }, [roleBreakdown, selectedRole]);

  const selectedRoleRadar = useMemo(() => {
    if (!selectedRole || !roleRadarData) return null;
    return roleRadarData.find(r => r.role === selectedRole);
  }, [selectedRole, roleRadarData]);

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
              {item.club ? (
                <Text style={s.playerClub} numberOfLines={1}>{item.club}</Text>
              ) : null}
            </View>
          </View>

          <View style={s.playerStatsCol}>
            <View style={s.playerStatBlock}>
              <Text style={s.playerStatValue}>{item.stats.winRate}%</Text>
              <Text style={s.playerStatLabel}>{t('leaderboard', 'boulesAvgWin')}</Text>
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
            <Text style={s.headerTitle} numberOfLines={1}>{displayName}</Text>
            <Text style={s.headerSubtitle}>
              {stats
                ? `${stats.playerCount} ${t('leaderboard', 'boulesUsers')} • ${stats.totalMatches} ${t('leaderboard', 'boulesMatches')}`
                : t('leaderboard', 'loading')}
            </Text>
          </View>
          {(() => { const bv = getBrandVisual(brandName); const bImg = getBrandImage(brandName); return (
          <View style={[s.headerIconWrap, { backgroundColor: bImg ? '#FFF' : bv.bg, alignItems: 'center', justifyContent: 'center' }]}>
            {bImg ? (
              <Image source={bImg} style={{ width: '80%', height: '80%' }} contentFit="contain" transition={200} />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '900', color: bv.text, letterSpacing: -0.5 }}>{bv.abbr}</Text>
            )}
          </View>
          ); })()}
        </View>
        {isModelMode && modelName ? (
          <View style={s.headerBrandRow}>
            <MaterialIcons name="label" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={s.headerBrandText}>{brandName}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {loading ? (
        <View style={s.centerState}>
          <View style={s.loadingIconBg}><MaterialIcons name="sports-baseball" size={32} color="#D97706" /></View>
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
      ) : boulesPlayers.length === 0 ? (
        <View style={s.centerState}>
          <MaterialIcons name="people-outline" size={56} color={theme.textMuted} />
          <Text style={s.emptyTitle}>{t('leaderboard', 'noBoulesPlayers')}</Text>
          <Text style={s.emptyDesc}>{t('leaderboard', 'noBoulesPlayersDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={boulesPlayers}
          keyExtractor={keyExtractor}
          renderItem={renderPlayerItem}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }, isTablet && s.listContentTablet]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Overall Radar Chart */}
              {stats && radarData.length >= 5 ? (
                <Animated.View entering={FadeInDown.duration(400)} style={s.radarSection}>
                  <View style={s.radarCard}>
                    <View style={s.radarHeader}>
                      <View style={s.radarIconBg}>
                        <MaterialIcons name="radar" size={18} color="#D97706" />
                      </View>
                      <View>
                        <Text style={s.radarTitle}>{language === 'fr' ? 'Profil de performance' : 'Performance Profile'}</Text>
                        <Text style={s.radarSubtitle}>{language === 'fr' ? 'Moyennes des utilisateurs' : 'User averages'}</Text>
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

              {/* Stats Cards */}
              {stats ? (
                <Animated.View entering={FadeInDown.duration(400).delay(60)} style={s.statsSection}>
                  <View style={s.statsGrid}>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: '#D97706' }]}>{stats.avgWinRate}%</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'boulesAvgWin')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.tirColor }]}>{stats.avgTirRate > 0 ? `${stats.avgTirRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'boulesTir')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.pointColor }]}>{stats.avgPointRate > 0 ? `${stats.avgPointRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'boulesPoint')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.carreauColor }]}>{stats.avgCarreauRate > 0 ? `${stats.avgCarreauRate}%` : '-'}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'boulesCarreau')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.primary }]}>{stats.playerCount}</Text>
                      <Text style={s.statCardLabel}>{t('leaderboard', 'boulesUsers')}</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statCardValue, { color: theme.success }]}>{stats.totalWins}</Text>
                      <Text style={s.statCardLabel}>{language === 'fr' ? 'Victoires' : 'Wins'}</Text>
                    </View>
                  </View>

                  {/* Summary row */}
                  <View style={s.summaryRow}>
                    <View style={s.summaryItem}>
                      <MaterialIcons name="people" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.playerCount} {t('leaderboard', 'boulesUsers')}</Text>
                    </View>
                    <View style={s.summaryDot} />
                    <View style={s.summaryItem}>
                      <MaterialIcons name="sports" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.totalMatches} {t('leaderboard', 'boulesMatches')}</Text>
                    </View>
                    <View style={s.summaryDot} />
                    <View style={s.summaryItem}>
                      <MaterialIcons name="emoji-events" size={16} color={theme.textMuted} />
                      <Text style={s.summaryText}>{stats.totalWins} {language === 'fr' ? 'victoires' : 'wins'}</Text>
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              {/* Role Breakdown with Radar */}
              {roleBreakdown.length > 0 ? (
                <Animated.View entering={FadeInDown.duration(400).delay(120)} style={s.roleSection}>
                  <View style={s.roleSectionCard}>
                    <View style={s.roleSectionHeader}>
                      <View style={s.roleSectionIconBg}>
                        <MaterialIcons name="group" size={18} color={theme.primary} />
                      </View>
                      <View>
                        <Text style={s.roleSectionTitle}>{t('leaderboard', 'boulesRoleBreakdown')}</Text>
                        <Text style={s.roleSectionSubtitle}>{language === 'fr' ? 'Performance par rôle' : 'Performance by role'}</Text>
                      </View>
                    </View>

                    {/* Role chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roleChipsRow}>
                      {roleBreakdown.map(r => {
                        const roleColors: Record<string, string> = { 'Tireur': theme.tirColor, 'Pointeur': theme.pointColor, 'Milieu': theme.primary };
                        const c = roleColors[r.role] || theme.textSecondary;
                        const isSelected = selectedRole === r.role;
                        return (
                          <Pressable
                            key={r.role}
                            style={[s.roleChip, isSelected && { backgroundColor: c, borderColor: c }]}
                            onPress={() => { Haptics.selectionAsync(); setSelectedRole(r.role); }}
                          >
                            <Text style={[s.roleChipText, isSelected ? { color: '#FFF' } : { color: c }]}>{t('roles', r.role)}</Text>
                            <Text style={[s.roleChipCount, isSelected ? { color: 'rgba(255,255,255,0.8)' } : { color: c + '80' }]}>{r.count}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {/* Selected role radar */}
                    {selectedRoleRadar && selectedRoleRadar.data.length >= 4 ? (
                      <View style={s.roleRadarWrap}>
                        <RadarChart
                          data={selectedRoleRadar.data}
                          size={Math.min(screenWidth - 100, 220)}
                          fillColor={
                            selectedRole === 'Tireur' ? theme.tirColor :
                            selectedRole === 'Pointeur' ? theme.pointColor : theme.primary
                          }
                          strokeColor={
                            selectedRole === 'Tireur' ? theme.tirColor :
                            selectedRole === 'Pointeur' ? theme.pointColor : theme.primary
                          }
                        />
                      </View>
                    ) : null}

                    {/* Role stat cards */}
                    <View style={s.roleStatsGrid}>
                      {roleBreakdown.map(r => {
                        const roleColors: Record<string, string> = { 'Tireur': theme.tirColor, 'Pointeur': theme.pointColor, 'Milieu': theme.primary };
                        const c = roleColors[r.role] || theme.textSecondary;
                        return (
                          <View key={r.role} style={[s.roleStatCard, { borderLeftColor: c, borderLeftWidth: 3 }]}>
                            <Text style={[s.roleStatName, { color: c }]}>{t('roles', r.role)}</Text>
                            <View style={s.roleStatRow}>
                              <View style={s.roleStatItem}>
                                <Text style={s.roleStatValue}>{r.avgWinRate}%</Text>
                                <Text style={s.roleStatLabel}>{t('leaderboard', 'boulesAvgWin')}</Text>
                              </View>
                              <View style={s.roleStatItem}>
                                <Text style={s.roleStatValue}>{r.avgTirRate > 0 ? `${r.avgTirRate}%` : '-'}</Text>
                                <Text style={s.roleStatLabel}>{t('leaderboard', 'boulesTir')}</Text>
                              </View>
                              <View style={s.roleStatItem}>
                                <Text style={s.roleStatValue}>{r.avgCarreauRate > 0 ? `${r.avgCarreauRate}%` : '-'}</Text>
                                <Text style={s.roleStatLabel}>{t('leaderboard', 'boulesCarreau')}</Text>
                              </View>
                              <View style={s.roleStatItem}>
                                <Text style={[s.roleStatValue, { color: c }]}>{r.count}</Text>
                                <Text style={s.roleStatLabel}>{t('leaderboard', 'boulesUsers')}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              {/* Players list header */}
              <Animated.View entering={FadeIn.duration(300).delay(180)}>
                <View style={s.membersHeader}>
                  <MaterialIcons name="people" size={18} color="#D97706" />
                  <Text style={s.membersTitle}>{language === 'fr' ? 'Joueurs utilisant cette marque' : 'Players using this brand'}</Text>
                  <View style={s.membersBadge}>
                    <Text style={s.membersBadgeText}>{boulesPlayers.length}</Text>
                  </View>
                </View>
                <View style={s.colHeaders}>
                  <Text style={[s.colHeader, { width: 28 }]}>#</Text>
                  <Text style={[s.colHeader, { flex: 1, marginLeft: 46 }]}>{t('leaderboard', 'player')}</Text>
                  <Text style={[s.colHeader, { width: 68, textAlign: 'center' }]}>{t('leaderboard', 'winRate')}</Text>
                  <Text style={[s.colHeader, { width: 44, textAlign: 'center' }]}>Tir/Car</Text>
                </View>
              </Animated.View>
            </View>
          }
          ListFooterComponent={boulesPlayers.length > 3 ? <AdBanner position="inline" /> : null}
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
  headerIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 52 },
  headerBrandText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

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

  // Role section
  roleSection: { paddingHorizontal: 16, marginBottom: 16 },
  roleSectionCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 16, ...theme.shadows.card },
  roleSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  roleSectionIconBg: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  roleSectionTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  roleSectionSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  roleChipsRow: { gap: 8, marginBottom: 12 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
  roleChipText: { fontSize: 13, fontWeight: '700' },
  roleChipCount: { fontSize: 12, fontWeight: '800' },
  roleRadarWrap: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  roleStatsGrid: { gap: 8 },
  roleStatCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 12 },
  roleStatName: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  roleStatRow: { flexDirection: 'row', gap: 8 },
  roleStatItem: { flex: 1, alignItems: 'center' },
  roleStatValue: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  roleStatLabel: { fontSize: 8, color: theme.textMuted, marginTop: 1 },

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
  playerTags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  playerTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  playerTagText: { fontSize: 10, fontWeight: '600' },
  playerClub: { fontSize: 10, color: theme.textMuted },
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
