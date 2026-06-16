
/**
 * MiniRankingWidget — Compact unified ranking widget for the home page.
 * Shows: your world rank, league tier, top 3 players, link to full rankings hub.
 * Replaces both LeaderboardHub and CommunityLeaderboard.
 */
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import {
  fetchPlayerGlobalRank,
  getLeagueTier,
  getLeagueProgress,
  LEAGUE_TIERS,
  fetchGlobalRankings,
  fetchGlobalRankingsPreview,
  RankedPlayer,
} from '@/services/globalRankingService';
import { getEloColor } from '@/services/eloService';
import { getCountryFlag } from '@/constants/geoData';

function MiniRankingWidget() {
  const { language } = useLanguage();
  const fr = language === 'fr';
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const [myRank, setMyRank] = useState<{ rank: number | null; total: number } | null>(null);
  const [top3, setTop3] = useState<RankedPlayer[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  const elo = selfPlayer?.eloRating || 1000;
  const progress = useMemo(() => getLeagueProgress(elo), [elo]);
  const tier = progress.tier;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const promises: Promise<any>[] = [
        fetchGlobalRankings({ limit: 3, offset: 0 }),
      ];
      if (selfPlayer?.id && selfPlayer?.isPublic) {
        promises.push(fetchPlayerGlobalRank(selfPlayer.id));
      } else {
        promises.push(Promise.resolve(null));
      }
      const [rankingsResult, rankResult] = await Promise.all(promises);
      if (!mounted) return;
      if (rankingsResult?.players && rankingsResult.players.length >= 3) {
        setTop3(rankingsResult.players);
        setIsPreview(false);
      } else {
        // Fallback: load preview (no match threshold)
        const previewResult = await fetchGlobalRankingsPreview({ limit: 3 });
        if (!mounted) return;
        if (previewResult?.players && previewResult.players.length > 0) {
          setTop3(previewResult.players);
          setIsPreview(true);
        }
      }
      if (rankResult) setMyRank({ rank: rankResult.rank, total: rankResult.total });
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [selfPlayer?.id, selfPlayer?.isPublic]);

  const goToRankings = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/leaderboard' as any);
  }, []);

  if (loading) {
    return (
      <View style={s.root}>
        {/* Skeleton: gradient header */}
        <View style={s.skeletonGradient}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={42} height={42} borderRadius={14} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width={100} height={14} borderRadius={8} style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
              <Skeleton width={60} height={10} borderRadius={6} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            </View>
            <Skeleton width={52} height={42} borderRadius={10} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }} />
            <Skeleton width={40} height={10} borderRadius={6} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </View>
        </View>
        {/* Skeleton: top 3 */}
        <View style={s.skeletonTop3}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
            <Skeleton width={13} height={13} borderRadius={7} />
            <Skeleton width={70} height={10} borderRadius={6} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={{ alignItems: 'center', flex: 1, gap: 4 }}>
                <Skeleton width={40} height={40} borderRadius={13} />
                <Skeleton width={44} height={10} borderRadius={6} />
                <Skeleton width={32} height={12} borderRadius={6} />
              </View>
            ))}
          </View>
        </View>
        {/* Skeleton: footer */}
        <View style={s.skeletonFooter}>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
            <Skeleton width={100} height={12} borderRadius={6} />
          </View>
          <View style={{ width: 1, height: 20, backgroundColor: theme.border, alignSelf: 'center' }} />
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
            <Skeleton width={60} height={12} borderRadius={6} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={s.root} onPress={goToRankings}>
      {/* League Badge + My Rank */}
      <Animated.View entering={FadeInDown.duration(400)}>
      <LinearGradient colors={tier.gradient} style={s.topGradient}>
        <View style={s.topRow}>
          {/* Emblem */}
          <View style={s.emblemWrap}>
            <Text style={s.emblem}>{tier.emblem}</Text>
          </View>

          {/* League name + ELO */}
          <View style={{ flex: 1 }}>
            <Text style={s.tierName}>{fr ? tier.name.fr : tier.name.en}</Text>
            <Text style={s.eloLabel}>{elo} ELO</Text>
          </View>

          {/* World Rank */}
          {myRank?.rank ? (
            <Animated.View entering={FadeInRight.duration(400).delay(200)} style={s.rankBadge}>
              <Text style={s.rankHash}>#</Text>
              <Text style={s.rankValue}>{myRank.rank.toLocaleString()}</Text>
              <Text style={s.rankTotal}>{fr ? 'sur' : 'of'} {myRank.total.toLocaleString()}</Text>
            </Animated.View>
          ) : (
            <View style={s.rankBadge}>
              <MaterialIcons name="leaderboard" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={s.rankTotal}>{fr ? 'Classement' : 'Ranking'}</Text>
            </View>
          )}
        </View>

        {/* Progress bar to next tier */}
        {progress.nextTier ? (
          <View style={s.progressRow}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress.progress}%` }]} />
            </View>
            <Text style={s.progressText}>
              {progress.eloToNext} → {progress.nextTier.emblem}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
      </Animated.View>

      {/* Top 3 Players Preview */}
      {top3.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={s.top3Section}>
          <View style={s.top3Header}>
            <MaterialIcons name="emoji-events" size={13} color="#F59E0B" />
            <Text style={s.top3Title}>{fr ? 'Top Joueurs' : 'Top Players'}</Text>
            {isPreview ? (
              <View style={s.top3PreviewBadge}>
                <MaterialIcons name="visibility" size={9} color="#92400E" />
                <Text style={s.top3PreviewBadgeText}>{fr ? 'Apercu' : 'Preview'}</Text>
              </View>
            ) : null}
          </View>
          {isPreview ? (
            <View style={s.top3PreviewNotice}>
              <MaterialIcons name="info-outline" size={11} color="#92400E" />
              <Text style={s.top3PreviewNoticeText}>
                {fr ? '3 matchs multi-joueurs requis pour officialiser' : '3 multi-player matches required to qualify'}
              </Text>
            </View>
          ) : null}
          <View style={s.top3Row}>
            {top3.map((p, idx) => {
              const medals = ['🥇', '🥈', '🥉'];
              const tierP = getLeagueTier(p.eloRating);
              return (
                <Pressable
                  key={p.id}
                  style={s.top3Item}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    Haptics.selectionAsync();
                    router.push(`/player/${p.id}` as any);
                  }}
                >
                  <View style={s.top3AvatarWrap}>
                    {p.avatar ? (
                      <Image
                        source={{ uri: p.avatar }}
                        style={[s.top3Avatar, isPreview && { opacity: 0.7 }]}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[s.top3Avatar, { backgroundColor: tierP.color + '20', alignItems: 'center', justifyContent: 'center' }, isPreview && { opacity: 0.7 }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: tierP.color }}>{p.name.charAt(0)}</Text>
                      </View>
                    )}
                    <View style={s.top3Medal}>
                      <Text style={{ fontSize: 10 }}>{medals[idx]}</Text>
                    </View>
                    {isPreview ? (
                      <View style={s.top3UnofficialDot} />
                    ) : null}
                  </View>
                  <Text style={[s.top3Name, isPreview && { color: theme.textSecondary }]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                  <Text style={[s.top3Elo, { color: isPreview ? theme.textMuted : tierP.color }]}>{p.eloRating}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : (
        <View style={s.top3EmptySection}>
          <View style={s.top3Header}>
            <MaterialIcons name="emoji-events" size={13} color="#F59E0B" />
            <Text style={s.top3Title}>{fr ? 'Top Joueurs' : 'Top Players'}</Text>
          </View>
          <View style={s.top3EmptyContent}>
            <MaterialIcons name="leaderboard" size={24} color={theme.textMuted} />
            <Text style={s.top3EmptyText}>
              {fr ? 'Jouez 3 matchs multi-joueurs pour apparaitre ici' : 'Play 3 multi-player matches to appear here'}
            </Text>
          </View>
        </View>
      )}

      {/* ── CLUBS SECTION ── */}
      <View style={s.clubsSection}>
        <View style={s.clubsSectionHeader}>
          <MaterialIcons name="home" size={13} color="#D97706" />
          <Text style={s.clubsSectionTitle}>{fr ? 'Classement Clubs' : 'Club Rankings'}</Text>
        </View>
        <View style={s.quickLinksRow}>
          <Pressable style={s.quickLinkBtn} onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); router.push('/club-city-ranking' as any); }}>
            <View style={[s.quickLinkIcon, { backgroundColor: '#F59E0B18' }]}>
              <MaterialIcons name="location-city" size={14} color="#F59E0B" />
            </View>
            <Text style={[s.quickLinkText, { color: '#F59E0B' }]}>{fr ? 'Par Ville' : 'By City'}</Text>
          </Pressable>
          <Pressable style={s.quickLinkBtn} onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); router.push('/club-compare' as any); }}>
            <View style={[s.quickLinkIcon, { backgroundColor: '#9333EA18' }]}>
              <MaterialIcons name="compare-arrows" size={14} color="#9333EA" />
            </View>
            <Text style={[s.quickLinkText, { color: '#9333EA' }]}>{fr ? 'Comparer' : 'Compare'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer CTA */}
      <Animated.View entering={FadeIn.duration(300).delay(250)} style={s.footer}>
        <Pressable
          style={s.footerLinkFull}
          onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); router.push('/leaderboard' as any); }}
        >
          <MaterialIcons name="emoji-events" size={14} color="#F59E0B" />
          <Text style={s.footerLinkText}>{fr ? 'Classement complet' : 'Full Ranking'}</Text>
          <MaterialIcons name="chevron-right" size={14} color="#F59E0B" />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

export default memo(MiniRankingWidget);

const s = StyleSheet.create({
  root: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.surface,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  skeletonGradient: { backgroundColor: '#4A3728', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  skeletonTop3: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: theme.surface },
  skeletonFooter: { borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row' as const, backgroundColor: theme.surface, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },

  // Top gradient section
  topGradient: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emblemWrap: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  emblem: { fontSize: 20 },
  tierName: { fontSize: 15, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  eloLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  rankBadge: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  rankHash: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  rankValue: { fontSize: 18, fontWeight: '900', color: '#FFF', lineHeight: 20 },
  rankTotal: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 1 },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressTrack: {
    flex: 1, height: 5, backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 3 },
  progressText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  // Top 3
  top3Section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  top3Header: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  top3Title: { fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  top3Row: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  top3Item: { alignItems: 'center', flex: 1 },
  top3AvatarWrap: { position: 'relative', marginBottom: 4 },
  top3Avatar: { width: 40, height: 40, borderRadius: 13, overflow: 'hidden' },
  top3Medal: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  top3Name: { fontSize: 11, fontWeight: '600', color: theme.textPrimary, maxWidth: 70, textAlign: 'center' },
  top3Elo: { fontSize: 13, fontWeight: '800', marginTop: 1 },

  // Clubs Section
  clubsSection: { borderTopWidth: 1, borderTopColor: theme.border + '40', paddingTop: 10 },
  clubsSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, marginBottom: 6 },
  clubsSectionTitle: { fontSize: 11, fontWeight: '700', color: '#D97706', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Top 3 empty state
  top3EmptySection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  top3EmptyContent: { alignItems: 'center', paddingVertical: 14, gap: 6 },
  top3EmptyText: { fontSize: 11, color: theme.textMuted, textAlign: 'center', maxWidth: 200, lineHeight: 16 },

  // Top 3 preview badge
  top3PreviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginLeft: 6 },
  top3PreviewBadgeText: { fontSize: 9, fontWeight: '800', color: '#92400E', letterSpacing: 0.3 },
  top3PreviewNotice: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A' },
  top3PreviewNoticeText: { fontSize: 10, fontWeight: '600', color: '#92400E', flex: 1 },
  top3UnofficialDot: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FDE68A', borderWidth: 1.5, borderColor: '#F59E0B' },

  // Quick Links
  quickLinksRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  quickLinkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.backgroundSecondary, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border + '60' },
  quickLinkIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLinkText: { fontSize: 11, fontWeight: '700' },

  // Footer
  footer: { borderTopWidth: 1, borderTopColor: theme.border },
  footerLinkFull: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5, paddingVertical: 12,
  },
  footerLinkText: { fontSize: 12, fontWeight: '600', color: '#F59E0B' },
});
