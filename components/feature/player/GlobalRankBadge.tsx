/**
 * GlobalRankBadge — Displays league tier, world rank #X,
 * progression to next tier, and promotion/relegation history.
 *
 * Used in player/[id].tsx and player/me.tsx
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import theme from '@/constants/theme';
import * as Haptics from '@/services/haptics';
import {
  fetchPlayerGlobalRank,
  getLeagueTier,
  getLeagueProgress,
  LEAGUE_TIERS,
} from '@/services/globalRankingService';
import { fetchEloSeasons, EloSeasonEntry } from '@/services/eloService';

// ============================================
// TYPES
// ============================================
interface GlobalRankBadgeProps {
  playerId: string;
  playerUserId?: string;
  eloRating: number;
  isPublic: boolean;
  language: string;
  compact?: boolean; // For embedding inside hero cards
}

// ============================================
// COMPONENT
// ============================================
export default function GlobalRankBadge({ playerId, playerUserId, eloRating, isPublic, language, compact }: GlobalRankBadgeProps) {
  const fr = language === 'fr';
  const [globalRank, setGlobalRank] = useState<{ rank: number | null; total: number } | null>(null);
  const [seasons, setSeasons] = useState<EloSeasonEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const progress = useMemo(() => getLeagueProgress(eloRating), [eloRating]);
  const tier = progress.tier;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const promises: Promise<any>[] = [];

      if (isPublic) {
        promises.push(fetchPlayerGlobalRank(playerId));
      } else {
        promises.push(Promise.resolve(null));
      }

      if (playerUserId) {
        promises.push(fetchEloSeasons(playerId));
      } else {
        promises.push(Promise.resolve({ seasons: [] }));
      }

      const [rankResult, seasonResult] = await Promise.all(promises);

      if (!mounted) return;
      if (rankResult) setGlobalRank({ rank: rankResult.rank, total: rankResult.total });
      if (seasonResult?.seasons) setSeasons(seasonResult.seasons);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [playerId, playerUserId, isPublic]);

  // Detect promotions/relegations from season history
  const tierHistory = useMemo(() => {
    if (seasons.length === 0) return [];
    const history: { year: number; elo: number; tierName: string; tierId: string; tierColor: string; tierEmblem: string; change: 'promotion' | 'relegation' | 'same' | 'initial' }[] = [];

    for (let i = seasons.length - 1; i >= 0; i--) {
      const s = seasons[i];
      const sTier = getLeagueTier(s.finalElo);
      let change: 'promotion' | 'relegation' | 'same' | 'initial' = 'initial';
      if (history.length > 0) {
        const prevTierId = history[history.length - 1].tierId;
        const prevTierIdx = LEAGUE_TIERS.findIndex(t => t.id === prevTierId);
        const curTierIdx = LEAGUE_TIERS.findIndex(t => t.id === sTier.id);
        if (curTierIdx < prevTierIdx) change = 'promotion';
        else if (curTierIdx > prevTierIdx) change = 'relegation';
        else change = 'same';
      }
      history.push({
        year: s.seasonYear,
        elo: s.finalElo,
        tierName: fr ? sTier.name.fr : sTier.name.en,
        tierId: sTier.id,
        tierColor: sTier.color,
        tierEmblem: sTier.emblem,
        change,
      });
    }

    // Add current season
    const currentTier = getLeagueTier(eloRating);
    let currentChange: 'promotion' | 'relegation' | 'same' | 'initial' = 'initial';
    if (history.length > 0) {
      const prevTierId = history[history.length - 1].tierId;
      const prevTierIdx = LEAGUE_TIERS.findIndex(t => t.id === prevTierId);
      const curTierIdx = LEAGUE_TIERS.findIndex(t => t.id === currentTier.id);
      if (curTierIdx < prevTierIdx) currentChange = 'promotion';
      else if (curTierIdx > prevTierIdx) currentChange = 'relegation';
      else currentChange = 'same';
    }
    history.push({
      year: new Date().getFullYear(),
      elo: eloRating,
      tierName: fr ? currentTier.name.fr : currentTier.name.en,
      tierId: currentTier.id,
      tierColor: currentTier.color,
      tierEmblem: currentTier.emblem,
      change: currentChange,
    });

    return history;
  }, [seasons, eloRating, fr]);

  if (loading) {
    return (
      <View style={[st.container, compact && st.containerCompact]}>
        <View style={st.loadingRow}>
          <ActivityIndicator size="small" color={tier.color} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(250).delay(100)}>
      <Pressable
        style={[st.container, compact && st.containerCompact]}
        onPress={() => { Haptics.selectionAsync(); router.push('/leaderboard' as any); }}
      >
        {/* League Badge + Rank */}
        <LinearGradient colors={tier.gradient} style={st.badgeGradient}>
          <View style={st.badgeTopRow}>
            <View style={st.emblemCircle}>
              <Text style={st.emblem}>{tier.emblem}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.tierName}>{fr ? tier.name.fr : tier.name.en}</Text>
              <Text style={st.eloLabel}>{eloRating} ELO</Text>
            </View>
            {globalRank?.rank ? (
              <View style={st.rankBadge}>
                <Text style={st.rankHash}>#</Text>
                <Text style={st.rankValue}>{globalRank.rank.toLocaleString()}</Text>
                <Text style={st.rankTotal}>
                  {fr ? 'sur' : 'of'} {globalRank.total.toLocaleString()}
                </Text>
              </View>
            ) : isPublic ? (
              <View style={st.rankBadge}>
                <MaterialIcons name="leaderboard" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={st.rankTotal}>{fr ? 'Classement mondial' : 'World ranking'}</Text>
              </View>
            ) : (
              <View style={st.rankBadge}>
                <MaterialIcons name="lock" size={12} color="rgba(255,255,255,0.4)" />
                <Text style={st.rankTotal}>{fr ? 'Non classe' : 'Unranked'}</Text>
              </View>
            )}
          </View>

          {/* Progress to next tier */}
          {progress.nextTier ? (
            <View style={st.progressSection}>
              <View style={st.progressRow}>
                <Text style={st.progressLabel}>{fr ? 'Promotion' : 'Promotion'}</Text>
                <Text style={st.progressValue}>
                  {progress.eloToNext} ELO → {fr ? progress.nextTier.name.fr : progress.nextTier.name.en} {progress.nextTier.emblem}
                </Text>
              </View>
              <View style={st.progressTrack}>
                <View style={[st.progressFill, { width: `${progress.progress}%` }]} />
              </View>
            </View>
          ) : (
            <View style={st.progressSection}>
              <Text style={st.maxRankText}>{fr ? 'Rang maximum atteint !' : 'Maximum rank reached!'}</Text>
            </View>
          )}

          {/* Navigate hint */}
          <View style={st.navHint}>
            <MaterialIcons name="public" size={12} color="rgba(255,255,255,0.5)" />
            <Text style={st.navHintText}>{fr ? 'Voir le classement mondial' : 'View world ranking'}</Text>
            <MaterialIcons name="chevron-right" size={14} color="rgba(255,255,255,0.4)" />
          </View>
        </LinearGradient>

        {/* Tier History (promotions / relegations) */}
        {tierHistory.length > 1 ? (
          <View style={st.historySection}>
            <View style={st.historyHeader}>
              <MaterialIcons name="history" size={14} color={theme.textSecondary} />
              <Text style={st.historyTitle}>{fr ? 'Historique des ligues' : 'League History'}</Text>
            </View>
            <View style={st.historyTimeline}>
              {tierHistory.map((entry, idx) => {
                const isLast = idx === tierHistory.length - 1;
                const changeIcon = entry.change === 'promotion' ? 'arrow-upward' : entry.change === 'relegation' ? 'arrow-downward' : entry.change === 'same' ? 'remove' : 'fiber-new';
                const changeColor = entry.change === 'promotion' ? '#22C55E' : entry.change === 'relegation' ? '#EF4444' : entry.change === 'same' ? theme.textMuted : '#3B82F6';
                return (
                  <View key={idx} style={st.historyItem}>
                    {/* Timeline connector */}
                    <View style={st.historyConnectorCol}>
                      <View style={[st.historyDot, { backgroundColor: isLast ? entry.tierColor : entry.tierColor + '60' }]} />
                      {!isLast ? <View style={st.historyLine} /> : null}
                    </View>
                    {/* Content */}
                    <View style={[st.historyContent, isLast && { backgroundColor: entry.tierColor + '08', borderColor: entry.tierColor + '20' }]}>
                      <View style={st.historyContentRow}>
                        <Text style={st.historyEmoji}>{entry.tierEmblem}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.historyTierName, isLast && { color: entry.tierColor, fontWeight: '800' }]}>{entry.tierName}</Text>
                          <Text style={st.historyYear}>
                            {isLast ? (fr ? 'Actuel' : 'Current') : `${fr ? 'Saison' : 'Season'} ${entry.year}`} · {entry.elo} ELO
                          </Text>
                        </View>
                        {entry.change !== 'initial' ? (
                          <View style={[st.historyChangeBadge, { backgroundColor: changeColor + '15' }]}>
                            <MaterialIcons name={changeIcon as any} size={11} color={changeColor} />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// ============================================
// STYLES
// ============================================
const st = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  containerCompact: { marginBottom: 10, borderRadius: 16 },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },

  // Badge gradient section
  badgeGradient: { padding: 18 },
  badgeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emblemCircle: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  emblem: { fontSize: 22 },
  tierName: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  eloLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  rankBadge: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  rankHash: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  rankValue: { fontSize: 20, fontWeight: '900', color: '#FFF', lineHeight: 22 },
  rankTotal: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 1 },

  // Progress
  progressSection: { marginTop: 14 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressValue: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  progressTrack: { height: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 3 },
  maxRankText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingVertical: 2 },

  // Nav hint
  navHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  navHintText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },

  // History section
  historySection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  historyTitle: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.3 },
  historyTimeline: {},
  historyItem: { flexDirection: 'row', minHeight: 40 },
  historyConnectorCol: { width: 20, alignItems: 'center' },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 8 },
  historyLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  historyContent: {
    flex: 1, marginLeft: 10, marginBottom: 6, backgroundColor: '#F8FAFC',
    borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E8EDF2',
  },
  historyContentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyEmoji: { fontSize: 18 },
  historyTierName: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  historyYear: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 1 },
  historyChangeBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
