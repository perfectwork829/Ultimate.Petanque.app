import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 800 }), -1, true);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ width: width as any, height, borderRadius, backgroundColor: '#E2E8F0' }, animStyle, style]} />
  );
}

export function BannerSkeleton({ style }: { style?: any }) {
  return (
    <View style={[sk.banner, style]}>
      <View style={sk.bannerRow}>
        <Skeleton width={40} height={40} borderRadius={12} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="35%" height={10} />
        </View>
        <Skeleton width={50} height={28} borderRadius={8} />
      </View>
    </View>
  );
}

export function TimelineSkeleton({ items = 3, style }: { items?: number; style?: any }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {Array.from({ length: items }).map((_, i) => (
        <View key={i} style={sk.timelineItem}>
          <Skeleton width={44} height={44} borderRadius={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={60} height={10} borderRadius={6} />
            <Skeleton width="75%" height={14} />
            <Skeleton width="45%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function LeaderboardSkeleton({ style }: { style?: any }) {
  return (
    <View style={[sk.leaderboard, style]}>
      <Skeleton width="100%" height={90} borderRadius={0} style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
      <View style={{ gap: 10, padding: 16, backgroundColor: '#FFF', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
        {/* Podium skeleton */}
        <View style={sk.podiumSkeleton}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <Skeleton width={48} height={8} />
          </View>
          <View style={{ alignItems: 'center', gap: 6, marginTop: -12 }}>
            <Skeleton width={48} height={48} borderRadius={24} />
            <Skeleton width={52} height={8} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={44} height={8} />
          </View>
        </View>
        {/* Rows skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={sk.leaderboardRow}>
            <Skeleton width={20} height={14} borderRadius={4} />
            <Skeleton width={32} height={32} borderRadius={10} />
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="55%" height={12} />
              <Skeleton width="30%" height={8} />
            </View>
            <Skeleton width={40} height={16} borderRadius={4} />
          </View>
        ))}
        {/* CTA skeleton */}
        <View style={{ alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
          <Skeleton width={140} height={14} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function HistorySkeleton({ style }: { style?: any }) {
  return (
    <View style={[sk.historyCard, style]}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={[sk.historyRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
          <Skeleton width={8} height={8} borderRadius={4} />
          <Skeleton width={30} height={30} borderRadius={8} />
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width="65%" height={12} />
            <Skeleton width="40%" height={9} />
          </View>
          <Skeleton width={36} height={16} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export function SponsorSkeleton({ style }: { style?: any }) {
  return (
    <View style={[sk.sponsor, style]}>
      <Skeleton width={36} height={36} borderRadius={10} />
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width={70} height={8} borderRadius={4} />
        <Skeleton width="50%" height={12} />
      </View>
      <Skeleton width={28} height={28} borderRadius={14} />
    </View>
  );
}

export function SponsorPortalSkeleton({ tierColor = '#D4A017', style }: { tierColor?: string; style?: any }) {
  return (
    <View style={[spSk.root, style]}>
      {/* Hero skeleton */}
      <View style={[spSk.hero, { backgroundColor: tierColor + '20' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Skeleton width={56} height={56} borderRadius={18} style={{ backgroundColor: tierColor + '15' }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={140} height={18} borderRadius={8} style={{ backgroundColor: tierColor + '15' }} />
            <Skeleton width={90} height={12} borderRadius={6} style={{ backgroundColor: tierColor + '10' }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ flex: 1 }}>
              <Skeleton height={52} borderRadius={14} style={{ backgroundColor: tierColor + '10' }} />
            </View>
          ))}
        </View>
      </View>
      {/* Filters skeleton */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Skeleton width={44} height={32} borderRadius={16} />
        <Skeleton width={44} height={32} borderRadius={16} />
        <View style={{ width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 4 }} />
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} width={60} height={32} borderRadius={16} />
        ))}
      </View>
      {/* Checklist skeleton */}
      <View style={spSk.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Skeleton width={40} height={40} borderRadius={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={120} height={14} />
            <Skeleton width={80} height={10} />
          </View>
          <Skeleton width={48} height={28} borderRadius={10} />
        </View>
        <Skeleton width="100%" height={6} borderRadius={3} style={{ marginBottom: 14 }} />
        {[1, 2, 3].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }}>
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width={16} height={16} borderRadius={4} />
            <Skeleton width={`${50 + i * 10}%` as any} height={12} borderRadius={6} />
          </View>
        ))}
      </View>
      {/* KPI skeleton */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginBottom: 14 }}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={spSk.kpiCard}>
            <Skeleton width={40} height={40} borderRadius={12} style={{ marginBottom: 8 }} />
            <Skeleton width={50} height={22} borderRadius={6} />
            <Skeleton width={60} height={10} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Chart skeleton */}
      <View style={spSk.card}>
        <Skeleton width={120} height={14} borderRadius={6} style={{ marginBottom: 16 }} />
        <Skeleton width="100%" height={52} borderRadius={8} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={52} borderRadius={8} />
      </View>
    </View>
  );
}

const spSk = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingTop: 20, paddingBottom: 18, paddingHorizontal: 20, borderRadius: 0 },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiCard: { width: '47%' as any, flexGrow: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center' as const, borderWidth: 1, borderColor: '#E2E8F0' },
});

const sk = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  leaderboard: { borderRadius: 20, overflow: 'hidden' },
  podiumSkeleton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 24,
    paddingVertical: 12,
  },
  leaderboardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  historyCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sponsor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
});
