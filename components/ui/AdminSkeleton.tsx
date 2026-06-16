/**
 * AdminSkeleton
 * 
 * Loading skeleton screens for admin pages (moderation, clubs, terrains, users).
 * Replaces plain ActivityIndicator with perceived-faster skeleton UI.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/SkeletonLoader';

/** Generic admin page skeleton: header stats + search + list items */
function AdminPageSkeleton({ statCount = 4, listCount = 5, showSearch = true }: { statCount?: number; listCount?: number; showSearch?: boolean }) {
  return (
    <View style={s.root}>
      {/* Stats row */}
      <View style={s.statsRow}>
        {Array.from({ length: statCount }).map((_, i) => (
          <View key={i} style={s.statCard}>
            <Skeleton width={28} height={28} borderRadius={9} />
            <Skeleton width={36} height={20} borderRadius={6} style={{ marginTop: 6 }} />
            <Skeleton width={48} height={8} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Search bar */}
      {showSearch ? (
        <View style={s.searchSkeleton}>
          <Skeleton width={18} height={18} borderRadius={4} />
          <Skeleton width="65%" height={14} borderRadius={6} />
        </View>
      ) : null}

      {/* Filter chips */}
      <View style={s.filterRow}>
        {[70, 80, 90, 60].map((w, i) => (
          <Skeleton key={i} width={w} height={34} borderRadius={12} />
        ))}
      </View>

      {/* List items */}
      {Array.from({ length: listCount }).map((_, i) => (
        <View key={i} style={s.listCard}>
          <View style={s.listRow}>
            <Skeleton width={42} height={42} borderRadius={12} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="60%" height={14} borderRadius={6} />
              <Skeleton width="35%" height={10} borderRadius={4} />
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                <Skeleton width={48} height={16} borderRadius={6} />
                <Skeleton width={38} height={16} borderRadius={6} />
                <Skeleton width={30} height={16} borderRadius={6} />
              </View>
            </View>
            <Skeleton width={36} height={36} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Moderation page skeleton: stats + analytics + report list */
export function ModerationSkeleton() {
  return (
    <View style={s.root}>
      {/* Stats row */}
      <View style={s.statsRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={s.statCard}>
            <Skeleton width={28} height={28} borderRadius={9} />
            <Skeleton width={32} height={18} borderRadius={5} style={{ marginTop: 6 }} />
            <Skeleton width={44} height={8} borderRadius={4} style={{ marginTop: 3 }} />
          </View>
        ))}
      </View>
      {/* Total row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Skeleton width={16} height={16} borderRadius={4} />
        <Skeleton width={140} height={12} borderRadius={5} />
      </View>
      {/* Analytics card */}
      <View style={s.analyticsCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Skeleton width={16} height={16} borderRadius={4} />
          <Skeleton width={160} height={13} borderRadius={5} />
        </View>
        {[1, 2, 3].map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Skeleton width={8} height={8} borderRadius={4} />
            <Skeleton width={80} height={10} borderRadius={4} />
            <View style={{ flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3 }}>
              <Skeleton width={`${60 - i * 15}%`} height={6} borderRadius={3} />
            </View>
            <Skeleton width={28} height={10} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Search + filters */}
      <View style={s.searchSkeleton}>
        <Skeleton width={18} height={18} borderRadius={4} />
        <Skeleton width="55%" height={14} borderRadius={6} />
      </View>
      <View style={s.filterRow}>
        {[60, 75, 85, 75, 70, 60].map((w, i) => (
          <Skeleton key={i} width={w} height={34} borderRadius={12} />
        ))}
      </View>
      {/* Report cards */}
      {[1, 2, 3].map((_, i) => (
        <View key={i} style={[s.listCard, { borderLeftWidth: 3, borderLeftColor: '#E2E8F0' }]}>
          <View style={s.listRow}>
            <Skeleton width={42} height={42} borderRadius={12} />
            <View style={{ flex: 1, gap: 5 }}>
              <Skeleton width="55%" height={14} borderRadius={6} />
              <Skeleton width="30%" height={10} borderRadius={4} />
            </View>
            <Skeleton width={64} height={24} borderRadius={8} />
          </View>
          <Skeleton width="80%" height={10} borderRadius={4} style={{ marginTop: 10, marginLeft: 54 }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
            <Skeleton width="40%" height={34} borderRadius={10} />
            <Skeleton width="50%" height={34} borderRadius={10} />
            <Skeleton width={36} height={34} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Club management skeleton */
export function ClubsSkeleton() {
  return <AdminPageSkeleton statCount={4} listCount={6} />;
}

/** Terrain management skeleton */
export function TerrainsSkeleton() {
  return (
    <View style={s.root}>
      {/* Stats row */}
      <View style={s.statsRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={s.statCard}>
            <Skeleton width={28} height={28} borderRadius={9} />
            <Skeleton width={32} height={18} borderRadius={5} style={{ marginTop: 6 }} />
            <Skeleton width={40} height={8} borderRadius={4} style={{ marginTop: 3 }} />
          </View>
        ))}
      </View>
      {/* Distribution card */}
      <View style={s.analyticsCard}>
        <Skeleton width={140} height={13} borderRadius={5} style={{ marginBottom: 12 }} />
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Skeleton width={8} height={8} borderRadius={4} />
            <Skeleton width={72} height={10} borderRadius={4} />
            <View style={{ flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3 }}>
              <Skeleton width={`${70 - i * 12}%`} height={6} borderRadius={3} />
            </View>
            <Skeleton width={28} height={10} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Search */}
      <View style={s.searchSkeleton}>
        <Skeleton width={18} height={18} borderRadius={4} />
        <Skeleton width="60%" height={14} borderRadius={6} />
      </View>
      {/* Filter chips */}
      <View style={s.filterRow}>
        {[55, 65, 60, 55, 65].map((w, i) => (
          <Skeleton key={i} width={w} height={34} borderRadius={12} />
        ))}
      </View>
      {/* Terrain cards */}
      {[1, 2, 3, 4].map((_, i) => (
        <View key={i} style={[s.listCard, { borderLeftWidth: 3, borderLeftColor: '#E2E8F0' }]}>
          <View style={s.listRow}>
            <Skeleton width={40} height={40} borderRadius={12} />
            <View style={{ flex: 1, gap: 5 }}>
              <Skeleton width="55%" height={14} borderRadius={6} />
              <Skeleton width="40%" height={10} borderRadius={4} />
            </View>
            <Skeleton width={36} height={36} borderRadius={10} />
          </View>
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 10 }}>
            <Skeleton width={60} height={22} borderRadius={8} />
            <Skeleton width={48} height={22} borderRadius={8} />
            <Skeleton width={56} height={22} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** User management skeleton */
export function UsersSkeleton() {
  return <AdminPageSkeleton statCount={4} listCount={7} />;
}

/** Dashboard skeleton - for the main admin dashboard */
export function DashboardSkeleton() {
  return (
    <View style={s.root}>
      {/* Overview metrics */}
      <Skeleton width={100} height={10} borderRadius={4} style={{ marginBottom: 10 }} />
      <View style={s.statsRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={s.statCard}>
            <Skeleton width={28} height={28} borderRadius={9} />
            <Skeleton width={36} height={20} borderRadius={6} style={{ marginTop: 8 }} />
            <Skeleton width={48} height={8} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Secondary row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        <Skeleton width={80} height={12} borderRadius={5} />
        <Skeleton width={4} height={4} borderRadius={2} />
        <Skeleton width={80} height={12} borderRadius={5} />
      </View>
      {/* Moderation cards */}
      <Skeleton width={90} height={10} borderRadius={4} style={{ marginBottom: 10 }} />
      <View style={s.statsRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={[s.statCard, { padding: 10 }]}>
            <Skeleton width={24} height={24} borderRadius={7} />
            <Skeleton width={28} height={16} borderRadius={5} style={{ marginTop: 6 }} />
            <Skeleton width={36} height={7} borderRadius={3} style={{ marginTop: 3 }} />
          </View>
        ))}
      </View>
      {/* Chart card */}
      <Skeleton width={130} height={10} borderRadius={4} style={{ marginTop: 8, marginBottom: 10 }} />
      <View style={s.analyticsCard}>
        {[1, 2, 3, 4, 5].map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Skeleton width={44} height={10} borderRadius={4} />
            <View style={{ flex: 1, height: 18, backgroundColor: '#F1F5F9', borderRadius: 5 }}>
              <Skeleton width={`${65 - i * 8}%`} height={18} borderRadius={5} />
            </View>
            <Skeleton width={24} height={12} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Nav cards */}
      <Skeleton width={120} height={10} borderRadius={4} style={{ marginBottom: 10 }} />
      {[1, 2, 3].map((_, i) => (
        <View key={i} style={[s.listCard, { marginBottom: 8 }]}>
          <View style={s.listRow}>
            <Skeleton width={44} height={44} borderRadius={13} />
            <View style={{ flex: 1, gap: 5 }}>
              <Skeleton width="45%" height={14} borderRadius={6} />
              <Skeleton width="60%" height={10} borderRadius={4} />
            </View>
            <Skeleton width={20} height={20} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  listCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  analyticsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
});
