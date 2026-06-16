/**
 * Following Page — Lists all players the current user follows, with follower tab.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import * as Haptics from '@/services/haptics';
import { getEloRank } from '@/services/eloService';
import {
  getFollowingList,
  getFollowersList,
  getFollowedPlayerIds,
  toggleFollowPlayer,
} from '@/services/activityFeedService';

type Tab = 'following' | 'followers';

interface FollowingPlayer {
  id: string;
  name: string;
  avatar?: string;
  club?: string;
  eloRating: number;
  city?: string;
  userId?: string;
}

interface FollowerUser {
  userId: string;
  username: string;
  avatar?: string;
}

export default function FollowingScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const [tab, setTab] = useState<Tab>('following');
  const [followingList, setFollowingList] = useState<FollowingPlayer[]>([]);
  const [followersList, setFollowersList] = useState<FollowerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    const [followingResult, followersResult] = await Promise.all([
      getFollowingList(user.id),
      selfPlayer?.id ? getFollowersList(selfPlayer.id) : Promise.resolve({ followers: [] }),
    ]);
    setFollowingList(followingResult.players);
    setFollowersList(followersResult.followers);
  }, [user?.id, selfPlayer?.id]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleUnfollow = useCallback(async (playerId: string) => {
    if (!user?.id || unfollowingId) return;
    setUnfollowingId(playerId);
    Haptics.selectionAsync();
    const { error } = await toggleFollowPlayer(user.id, playerId);
    if (!error) {
      setFollowingList(prev => prev.filter(p => p.id !== playerId));
    }
    setUnfollowingId(null);
  }, [user?.id, unfollowingId]);

  const renderFollowingItem = useCallback(({ item }: { item: FollowingPlayer }) => {
    const rank = getEloRank(item.eloRating);
    return (
      <Pressable
        style={s.playerCard}
        onPress={() => { Haptics.selectionAsync(); router.push(`/player/${item.id}` as any); }}
      >
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={s.playerAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
        ) : (
          <View style={[s.playerAvatarFallback, { backgroundColor: rank.color + '20' }]}>
            <Text style={[s.playerAvatarLetter, { color: rank.color }]}>{item.name.charAt(0)}</Text>
          </View>
        )}
        <View style={s.playerInfo}>
          <Text style={s.playerName} numberOfLines={1}>{item.name}</Text>
          <View style={s.playerMeta}>
            {item.club ? (
              <View style={s.metaChip}>
                <MaterialIcons name="location-city" size={10} color={theme.textMuted} />
                <Text style={s.metaText} numberOfLines={1}>{item.club}</Text>
              </View>
            ) : null}
            {item.city ? (
              <View style={s.metaChip}>
                <MaterialIcons name="place" size={10} color={theme.textMuted} />
                <Text style={s.metaText} numberOfLines={1}>{item.city}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[s.eloBadge, { backgroundColor: rank.color + '12', borderColor: rank.color + '25' }]}>
          <MaterialIcons name={rank.icon as any} size={12} color={rank.color} />
          <Text style={[s.eloText, { color: rank.color }]}>{item.eloRating}</Text>
        </View>
        <Pressable
          style={[s.unfollowBtn, unfollowingId === item.id && { opacity: 0.5 }]}
          onPress={() => handleUnfollow(item.id)}
          disabled={!!unfollowingId}
          hitSlop={6}
        >
          {unfollowingId === item.id ? (
            <ActivityIndicator size="small" color="#EC4899" />
          ) : (
            <MaterialIcons name="person-remove" size={18} color="#EC4899" />
          )}
        </Pressable>
      </Pressable>
    );
  }, [unfollowingId, handleUnfollow]);

  const renderFollowerItem = useCallback(({ item }: { item: FollowerUser }) => {
    return (
      <View style={s.playerCard}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={s.playerAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
        ) : (
          <View style={[s.playerAvatarFallback, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[s.playerAvatarLetter, { color: theme.primary }]}>{item.username.charAt(0)}</Text>
          </View>
        )}
        <View style={s.playerInfo}>
          <Text style={s.playerName} numberOfLines={1}>{item.username}</Text>
        </View>
        <View style={[s.followerBadge]}>
          <MaterialIcons name="person" size={14} color={theme.textMuted} />
        </View>
      </View>
    );
  }, []);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Abonnements' : 'Following'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Abonnements' : 'Following'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabsRow}>
        <Pressable
          style={[s.tabBtn, tab === 'following' && s.tabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setTab('following'); }}
        >
          <MaterialIcons name="person-add" size={16} color={tab === 'following' ? '#FFF' : '#EC4899'} />
          <Text style={[s.tabBtnText, tab === 'following' && s.tabBtnTextActive]}>
            {fr ? 'Abonnements' : 'Following'}
          </Text>
          <View style={[s.tabCount, tab === 'following' && s.tabCountActive]}>
            <Text style={[s.tabCountText, tab === 'following' && s.tabCountTextActive]}>{followingList.length}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[s.tabBtn, tab === 'followers' && s.tabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setTab('followers'); }}
        >
          <MaterialIcons name="people" size={16} color={tab === 'followers' ? '#FFF' : '#3B82F6'} />
          <Text style={[s.tabBtnText, tab === 'followers' && s.tabBtnTextActive]}>
            {fr ? 'Abonnes' : 'Followers'}
          </Text>
          <View style={[s.tabCount, tab === 'followers' && s.tabCountActive]}>
            <Text style={[s.tabCountText, tab === 'followers' && s.tabCountTextActive]}>{followersList.length}</Text>
          </View>
        </Pressable>
      </View>

      {tab === 'following' ? (
        <FlatList
          data={followingList}
          renderItem={renderFollowingItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <MaterialIcons name="person-add" size={48} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{fr ? 'Aucun abonnement' : 'Not following anyone'}</Text>
              <Text style={s.emptyText}>
                {fr
                  ? 'Suivez des joueurs depuis leur fiche pour voir leur activite dans votre fil.'
                  : 'Follow players from their profile to see their activity in your feed.'}
              </Text>
              <Pressable style={s.emptyBtn} onPress={() => router.push('/(tabs)/directory' as any)}>
                <MaterialIcons name="people" size={16} color={theme.primary} />
                <Text style={s.emptyBtnText}>{fr ? 'Explorer l\'annuaire' : 'Browse directory'}</Text>
              </Pressable>
            </View>
          }
        />
      ) : (
        <FlatList
          data={followersList}
          renderItem={renderFollowerItem}
          keyExtractor={item => item.userId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <MaterialIcons name="people-outline" size={48} color={theme.textMuted} />
              <Text style={s.emptyTitle}>{fr ? 'Aucun abonne' : 'No followers yet'}</Text>
              <Text style={s.emptyText}>
                {fr
                  ? 'Les joueurs qui vous suivent apparaitront ici.'
                  : 'Players who follow you will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  // Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  tabBtnActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  tabBtnTextActive: { color: '#FFF' },
  tabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText: { fontSize: 10, fontWeight: '800', color: theme.textMuted },
  tabCountTextActive: { color: '#FFF' },
  // Player card
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  playerAvatar: { width: 48, height: 48, borderRadius: 14 },
  playerAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarLetter: { fontSize: 18, fontWeight: '700' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 3 },
  playerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: theme.textMuted, maxWidth: 80 },
  eloBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  eloText: { fontSize: 12, fontWeight: '800' },
  unfollowBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EC4899' + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followerBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 16, marginBottom: 6 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.primary + '12',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },
});
