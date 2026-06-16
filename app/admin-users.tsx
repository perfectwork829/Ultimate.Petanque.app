/**
 * Admin User Management Page
 *
 * Features:
 * - Search users by name/email
 * - Toggle premium/admin status
 * - User detail modal (badges, ELO, trust score)
 * - Bulk selection mode with batch actions
 * - Activity logging for all admin changes
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { logAdminAction } from '@/services/adminActivityLogService';
import { getEloRank } from '@/services/eloService';
import { ADMIN_PERMISSIONS, PermissionKey, getUserPermissions, setUserPermissions, getBulkUserPermissions } from '@/services/adminPermissionService';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { UsersSkeleton } from '@/components/ui/AdminSkeleton';
import { useAdminCache } from '@/hooks/useAdminCache';

interface AdminUser {
  id: string;
  username: string | null;
  email: string;
  avatar: string | null;
  role: string | null;
  level: string | null;
  club: string | null;
  isPremium: boolean;
  isAdmin: boolean;
  xp: number;
  createdAt: string;
  matchCount?: number;
  eloRating?: number;
  wins?: number;
  losses?: number;
  permissions?: PermissionKey[];
}

interface UserDetail extends AdminUser {
  badges: { badgeId: string; unlockedAt: string }[];
  trustScore: number | null;
  trustStatus: string | null;
  playerCount: number;
  challengeCount: number;
  tournamentCount: number;
}

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const adminCache = useAdminCache();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'premium' | 'admin'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Detail modal
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Permissions modal
  const [showPermissions, setShowPermissions] = useState(false);
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [permSelections, setPermSelections] = useState<Set<PermissionKey>>(new Set());
  const [savingPerms, setSavingPerms] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [userPermsMap, setUserPermsMap] = useState<Map<string, PermissionKey[]>>(new Map());

  const loadUsers = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, email, avatar, role, level, club, is_premium, is_admin, xp')
        .order('email', { ascending: true })
        .limit(500);

      if (error) { console.log('[AdminUsers] Error:', error); return; }

      const userIds = (data || []).map((u: any) => u.id);
      const matchCounts = new Map<string, number>();
      const eloMap = new Map<string, number>();
      const winsMap = new Map<string, number>();

      if (userIds.length > 0) {
        const { data: matches } = await supabase
          .from('matches')
          .select('user_id, winner')
          .in('user_id', userIds);
        (matches || []).forEach((m: any) => {
          matchCounts.set(m.user_id, (matchCounts.get(m.user_id) || 0) + 1);
          if (m.winner === 'A') winsMap.set(m.user_id, (winsMap.get(m.user_id) || 0) + 1);
        });

        const { data: playerData } = await supabase
          .from('players')
          .select('user_id, elo_rating')
          .in('user_id', userIds);
        (playerData || []).forEach((p: any) => {
          if (p.elo_rating) eloMap.set(p.user_id, p.elo_rating);
        });
      }

      const mappedUsers = (data || []).map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
        level: u.level,
        club: u.club,
        isPremium: u.is_premium || false,
        isAdmin: u.is_admin || false,
        xp: u.xp || 0,
        createdAt: u.created_at || new Date().toISOString(),
        matchCount: matchCounts.get(u.id) || 0,
        eloRating: eloMap.get(u.id) || 1000,
        wins: winsMap.get(u.id) || 0,
      }));

      // Load permissions for admin users
      const adminIds = mappedUsers.filter(u => u.isAdmin).map(u => u.id);
      if (adminIds.length > 0) {
        const { permissionsMap } = await getBulkUserPermissions(adminIds);
        setUserPermsMap(permissionsMap);
        mappedUsers.forEach(u => {
          if (permissionsMap.has(u.id)) u.permissions = permissionsMap.get(u.id);
        });
      }

      setUsers(mappedUsers);
      adminCache.setCached('admin-users', mappedUsers, 30000);
    } catch (e) {
      console.log('[AdminUsers] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = adminCache.getCached<AdminUser[]>('admin-users');
    if (cached) {
      setUsers(cached);
      setLoading(false);
      // Background refresh
      loadUsers();
    } else {
      loadUsers();
    }
  }, [loadUsers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    let items = users;
    if (filterType === 'premium') items = items.filter(u => u.isPremium);
    else if (filterType === 'admin') items = items.filter(u => u.isAdmin);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter(u =>
        u.username?.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.club?.toLowerCase().includes(s)
      );
    }
    return items;
  }, [users, search, filterType]);

  const stats = useMemo(() => ({
    total: users.length,
    premium: users.filter(u => u.isPremium).length,
    admin: users.filter(u => u.isAdmin).length,
    totalMatches: users.reduce((sum, u) => sum + (u.matchCount || 0), 0),
  }), [users]);

  // Load user detail
  const handleOpenDetail = useCallback(async (user: AdminUser) => {
    if (selectionMode) {
      toggleSelection(user.id);
      return;
    }
    Haptics.selectionAsync();
    setLoadingDetail(true);
    setDetailUser({ ...user, badges: [], trustScore: null, trustStatus: null, playerCount: 0, challengeCount: 0, tournamentCount: 0 });

    try {
      const supabase = getSupabaseClient();
      const [badgesRes, trustRes, challengeRes, tournRes] = await Promise.all([
        supabase.from('user_badges').select('badge_id, unlocked_at').eq('user_id', user.id),
        supabase.from('suspicious_players').select('trust_score, status').eq('user_id', user.id).limit(1),
        supabase.from('challenges').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      setDetailUser(prev => prev ? {
        ...prev,
        badges: (badgesRes.data || []).map((b: any) => ({ badgeId: b.badge_id, unlockedAt: b.unlocked_at })),
        trustScore: trustRes.data?.[0]?.trust_score ?? null,
        trustStatus: trustRes.data?.[0]?.status ?? null,
        challengeCount: challengeRes.count || 0,
        tournamentCount: tournRes.count || 0,
      } : null);
    } catch (e) {
      console.log('[AdminUsers] Detail load error:', e);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectionMode]);

  const toggleSelection = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    Haptics.selectionAsync();
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)));
    }
  }, [selectedIds, filteredUsers]);

  const handleBulkAction = useCallback(async (action: 'premium_on' | 'premium_off' | 'admin_on' | 'admin_off') => {
    const count = selectedIds.size;
    if (count === 0) return;

    const labels: Record<string, { fr: string; en: string }> = {
      premium_on: { fr: `Activer Premium pour ${count} utilisateur(s) ?`, en: `Enable Premium for ${count} user(s)?` },
      premium_off: { fr: `Desactiver Premium pour ${count} utilisateur(s) ?`, en: `Disable Premium for ${count} user(s)?` },
      admin_on: { fr: `Promouvoir admin ${count} utilisateur(s) ?`, en: `Promote ${count} user(s) to admin?` },
      admin_off: { fr: `Retirer admin pour ${count} utilisateur(s) ?`, en: `Remove admin from ${count} user(s)?` },
    };

    Alert.alert(
      fr ? 'Action en masse' : 'Bulk Action',
      fr ? labels[action].fr : labels[action].en,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Confirmer' : 'Confirm', style: action.includes('off') ? 'destructive' : 'default', onPress: async () => {
          setBulkProcessing(true);
          const supabase = getSupabaseClient();
          const ids = [...selectedIds];
          const field = action.startsWith('premium') ? 'is_premium' : 'is_admin';
          const value = action.endsWith('on');

          const { error } = await supabase
            .from('user_profiles')
            .update({ [field]: value })
            .in('id', ids);

          if (error) {
            showAlert(fr ? 'Erreur' : 'Error', error.message);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, [field === 'is_premium' ? 'isPremium' : 'isAdmin']: value } : u));
            logAdminAction({
              actionType: (action.startsWith('premium') ? (value ? 'user_premium_enable' : 'user_premium_disable') : (value ? 'user_admin_promote' : 'user_admin_demote')) as any,
              actionDetail: `Bulk ${action} for ${count} users`,
              metadata: { userIds: ids, count },
            });
            setSelectedIds(new Set());
            setSelectionMode(false);
          }
          setBulkProcessing(false);
        }},
      ]
    );
  }, [selectedIds, fr, showAlert]);

  const handleTogglePremium = useCallback(async (user: AdminUser) => {
    const newVal = !user.isPremium;
    Alert.alert(
      fr ? 'Changer le statut Premium ?' : 'Change Premium status?',
      `${user.username || user.email}\n${newVal ? (fr ? 'Activer Premium' : 'Enable Premium') : (fr ? 'Desactiver Premium' : 'Disable Premium')}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Confirmer' : 'Confirm', onPress: async () => {
          setTogglingId(user.id);
          const supabase = getSupabaseClient();
          const { error } = await supabase.from('user_profiles').update({ is_premium: newVal }).eq('id', user.id);
          setTogglingId(null);
          if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); return; }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isPremium: newVal } : u));
          if (detailUser?.id === user.id) setDetailUser(prev => prev ? { ...prev, isPremium: newVal } : null);
          logAdminAction({ actionType: (newVal ? 'user_premium_enable' : 'user_premium_disable') as any, targetType: 'user', targetId: user.id, targetName: user.username || user.email, actionDetail: `Premium ${newVal ? 'enabled' : 'disabled'}` });
        }},
      ]
    );
  }, [fr, showAlert, detailUser]);

  const handleOpenPermissions = useCallback(async (user: AdminUser) => {
    Haptics.selectionAsync();
    setPermUser(user);
    setShowPermissions(true);
    setLoadingPerms(true);
    const { permissions } = await getUserPermissions(user.id);
    setPermSelections(new Set(permissions));
    setLoadingPerms(false);
  }, []);

  const handleSavePermissions = useCallback(async () => {
    if (!permUser) return;
    setSavingPerms(true);
    const newPerms = [...permSelections] as PermissionKey[];
    // Capture old permissions before saving
    const oldPerms = userPermsMap.get(permUser.id) || [];
    const { error } = await setUserPermissions(permUser.id, newPerms);
    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUserPermsMap(prev => {
        const next = new Map(prev);
        next.set(permUser.id, newPerms);
        return next;
      });
      setUsers(prev => prev.map(u => u.id === permUser.id ? { ...u, permissions: newPerms } : u));
      // Compute added/removed for audit
      const added = newPerms.filter(p => !oldPerms.includes(p));
      const removed = oldPerms.filter(p => !newPerms.includes(p));
      logAdminAction({
        actionType: 'user_permissions_update' as any,
        targetType: 'user',
        targetId: permUser.id,
        targetName: permUser.username || permUser.email,
        actionDetail: `Permissions: ${newPerms.join(', ') || 'none'}${added.length > 0 ? ` | +${added.join(', ')}` : ''}${removed.length > 0 ? ` | -${removed.join(', ')}` : ''}`,
        metadata: { oldPermissions: oldPerms, newPermissions: newPerms, added, removed },
      });
      setShowPermissions(false);
    }
    setSavingPerms(false);
  }, [permUser, permSelections, userPermsMap, fr, showAlert]);

  const togglePermission = useCallback((perm: PermissionKey) => {
    Haptics.selectionAsync();
    setPermSelections(prev => {
      const next = new Set(prev);
      if (perm === 'full_access') {
        // Full access is exclusive
        if (next.has('full_access')) {
          next.delete('full_access');
        } else {
          next.clear();
          next.add('full_access');
        }
        return next;
      }
      // If selecting a specific perm, remove full_access
      next.delete('full_access');
      if (next.has(perm)) next.delete(perm); else next.add(perm);
      return next;
    });
  }, []);

  const handleToggleAdmin = useCallback(async (user: AdminUser) => {
    const newVal = !user.isAdmin;
    Alert.alert(
      fr ? 'Changer le statut Admin ?' : 'Change Admin status?',
      `${user.username || user.email}\n${newVal ? (fr ? 'Promouvoir admin' : 'Promote to admin') : (fr ? 'Retirer admin' : 'Remove admin')}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Confirmer' : 'Confirm', style: newVal ? 'default' : 'destructive', onPress: async () => {
          setTogglingId(user.id);
          const supabase = getSupabaseClient();
          const { error } = await supabase.from('user_profiles').update({ is_admin: newVal }).eq('id', user.id);
          setTogglingId(null);
          if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); return; }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isAdmin: newVal } : u));
          if (detailUser?.id === user.id) setDetailUser(prev => prev ? { ...prev, isAdmin: newVal } : null);
          logAdminAction({ actionType: (newVal ? 'user_admin_promote' : 'user_admin_demote') as any, targetType: 'user', targetId: user.id, targetName: user.username || user.email, actionDetail: `Admin ${newVal ? 'promoted' : 'demoted'}` });
        }},
      ]
    );
  }, [fr, showAlert, detailUser]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Utilisateurs' : 'Users'}</Text>
        </View>
        <AdminQuickNav currentRoute="/admin-users" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <UsersSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="Users">
    <AdminGuard language={language} requiredPermission="users">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Gestion Utilisateurs' : 'User Management'}</Text>
        <Pressable
          style={[s.selectModeBtn, selectionMode && s.selectModeBtnActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setSelectionMode(!selectionMode);
            if (selectionMode) setSelectedIds(new Set());
          }}
        >
          <MaterialIcons name={selectionMode ? 'close' : 'checklist'} size={20} color={selectionMode ? '#FFF' : '#64748B'} />
        </Pressable>
      </View>

      <AdminQuickNav currentRoute="/admin-users" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: selectionMode ? insets.bottom + 120 : insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Stats */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={s.statsGrid}>
            {[
              { value: stats.total, label: 'Total', icon: 'people', color: '#3B82F6', bg: '#DBEAFE' },
              { value: stats.premium, label: 'Premium', icon: 'star', color: '#D4A017', bg: '#FEF3C7' },
              { value: stats.admin, label: 'Admins', icon: 'admin-panel-settings', color: '#DC2626', bg: '#FEF2F2' },
              { value: stats.totalMatches, label: fr ? 'Matchs' : 'Matches', icon: 'sports', color: '#10B981', bg: '#DCFCE7' },
            ].map((st, i) => (
              <View key={i} style={[s.statCard, { borderColor: st.color + '20' }]}>
                <View style={[s.statIcon, { backgroundColor: st.bg }]}>
                  <MaterialIcons name={st.icon as any} size={18} color={st.color} />
                </View>
                <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Search */}
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color="#94A3B8" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder={fr ? 'Rechercher nom, email, club...' : 'Search name, email, club...'} placeholderTextColor="#94A3B8" />
          {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><MaterialIcons name="close" size={16} color="#94A3B8" /></Pressable> : null}
        </View>

        {/* Filter chips */}
        <View style={s.filterRow}>
          {([
            { key: 'all' as const, label: fr ? 'Tout' : 'All', icon: 'people', count: stats.total },
            { key: 'premium' as const, label: 'Premium', icon: 'star', count: stats.premium },
            { key: 'admin' as const, label: 'Admin', icon: 'admin-panel-settings', count: stats.admin },
          ]).map(f => {
            const isActive = filterType === f.key;
            return (
              <Pressable key={f.key} style={[s.filterChip, isActive && s.filterChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterType(f.key); }}>
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? '#FFF' : '#64748B'} />
                <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{f.label}</Text>
                <View style={[s.filterChipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.filterChipBadgeText, isActive && { color: '#FFF' }]}>{f.count}</Text>
                </View>
              </Pressable>
            );
          })}
          {selectionMode ? (
            <Pressable style={[s.filterChip, { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]} onPress={handleSelectAll}>
              <MaterialIcons name={selectedIds.size === filteredUsers.length ? 'deselect' : 'select-all'} size={13} color="#FFF" />
              <Text style={[s.filterChipText, { color: '#FFF' }]}>{selectedIds.size === filteredUsers.length ? (fr ? 'Tout deselectionner' : 'Deselect all') : (fr ? 'Tout selectionner' : 'Select all')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Users list */}
        {filteredUsers.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><MaterialIcons name="person-search" size={40} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{fr ? 'Aucun utilisateur' : 'No users found'}</Text>
          </View>
        ) : (
          filteredUsers.map((user, idx) => {
            const isSelected = selectedIds.has(user.id);
            const eloInfo = user.eloRating ? getEloRank(user.eloRating) : null;
            return (
              <Animated.View key={user.id} entering={FadeInDown.duration(200).delay(Math.min(idx * 15, 300))}>
                <Pressable
                  style={[s.userCard, isSelected && s.userCardSelected]}
                  onPress={() => handleOpenDetail(user)}
                >
                  {selectionMode ? (
                    <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                      {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                    </View>
                  ) : null}
                  <View style={s.userHeader}>
                    {user.avatar ? (
                      <Image source={{ uri: user.avatar }} style={s.userAvatar} contentFit="cover" transition={200} />
                    ) : (
                      <View style={s.userAvatarPlaceholder}>
                        <Text style={s.userAvatarText}>{(user.username || user.email).charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.userNameRow}>
                        <Text style={s.userName} numberOfLines={1}>{user.username || (fr ? 'Sans nom' : 'No name')}</Text>
                        {user.isAdmin ? <View style={s.adminBadge}><MaterialIcons name="shield" size={10} color="#DC2626" /></View> : null}
                        {user.isPremium ? <View style={s.premiumBadge}><MaterialIcons name="star" size={10} color="#D4A017" /></View> : null}
                        {user.isAdmin && (userPermsMap.get(user.id) || []).length > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F5F3FF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#DDD6FE' }}>
                            <MaterialIcons name="tune" size={8} color="#7C3AED" />
                            <Text style={{ fontSize: 8, fontWeight: '700', color: '#7C3AED' }}>{(userPermsMap.get(user.id) || []).length}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
                      <View style={s.userMetaRow}>
                        {eloInfo ? (
                          <View style={[s.userMetaChip, { backgroundColor: eloInfo.color + '12' }]}>
                            <MaterialIcons name={eloInfo.icon as any} size={9} color={eloInfo.color} />
                            <Text style={[s.userMetaText, { color: eloInfo.color }]}>{user.eloRating}</Text>
                          </View>
                        ) : null}
                        <View style={s.userMetaChip}>
                          <MaterialIcons name="sports" size={9} color="#64748B" />
                          <Text style={s.userMetaText}>{user.matchCount || 0}</Text>
                        </View>
                        <View style={s.userMetaChip}>
                          <MaterialIcons name="bolt" size={9} color="#7C3AED" />
                          <Text style={[s.userMetaText, { color: '#7C3AED' }]}>{user.xp} XP</Text>
                        </View>
                      </View>
                    </View>
                    {!selectionMode ? (
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        {user.isAdmin ? (
                          <Pressable
                            style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}
                            onPress={(e) => { e.stopPropagation(); handleOpenPermissions(user); }}
                            hitSlop={6}
                          >
                            <MaterialIcons name="tune" size={16} color="#7C3AED" />
                          </Pressable>
                        ) : (
                          <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
                        )}
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 ? (
        <Animated.View entering={FadeIn.duration(200)} style={[s.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={s.bulkBarText}>{selectedIds.size} {fr ? 'selectionne(s)' : 'selected'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bulkActions}>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#D4A017' }]} onPress={() => handleBulkAction('premium_on')} disabled={bulkProcessing}>
              <MaterialIcons name="star" size={14} color="#FFF" />
              <Text style={s.bulkBtnText}>+Premium</Text>
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#94A3B8' }]} onPress={() => handleBulkAction('premium_off')} disabled={bulkProcessing}>
              <MaterialIcons name="star-outline" size={14} color="#FFF" />
              <Text style={s.bulkBtnText}>-Premium</Text>
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#DC2626' }]} onPress={() => handleBulkAction('admin_on')} disabled={bulkProcessing}>
              <MaterialIcons name="shield" size={14} color="#FFF" />
              <Text style={s.bulkBtnText}>+Admin</Text>
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#64748B' }]} onPress={() => handleBulkAction('admin_off')} disabled={bulkProcessing}>
              <MaterialIcons name="remove-moderator" size={14} color="#FFF" />
              <Text style={s.bulkBtnText}>-Admin</Text>
            </Pressable>
          </ScrollView>
          {bulkProcessing ? <ActivityIndicator size="small" color="#3B82F6" style={{ marginLeft: 8 }} /> : null}
        </Animated.View>
      ) : null}

      {/* Permissions Modal */}
      <Modal visible={showPermissions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!savingPerms) setShowPermissions(false); }}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => { if (!savingPerms) setShowPermissions(false); }} disabled={savingPerms}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.headerTitle}>{fr ? 'Permissions' : 'Permissions'}</Text>
            <Pressable
              style={[{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#7C3AED', borderRadius: 10 }, savingPerms && { opacity: 0.5 }]}
              onPress={handleSavePermissions}
              disabled={savingPerms}
            >
              {savingPerms ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{fr ? 'Sauver' : 'Save'}</Text>}
            </Pressable>
          </View>
          <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
            {permUser ? (
              <>
                {/* User header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
                  {permUser.avatar ? (
                    <Image source={{ uri: permUser.avatar }} style={{ width: 48, height: 48, borderRadius: 14 }} contentFit="cover" transition={200} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: '#64748B' }}>{(permUser.username || permUser.email).charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>{permUser.username || permUser.email}</Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{permUser.email}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={s.adminBadge}><MaterialIcons name="shield" size={10} color="#DC2626" /></View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>Admin</Text>
                  </View>
                </View>

                {loadingPerms ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                  </View>
                ) : (
                  <>
                    {/* Info */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE' }}>
                      <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
                      <Text style={{ flex: 1, fontSize: 11, color: '#3B82F6', lineHeight: 16 }}>
                        {fr ? 'Selectionnez les sections auxquelles cet admin a acces. "Acces complet" donne toutes les permissions.' : 'Select sections this admin can access. "Full Access" grants all permissions.'}
                      </Text>
                    </View>

                    {/* Permission toggles */}
                    {(Object.entries(ADMIN_PERMISSIONS) as [PermissionKey, typeof ADMIN_PERMISSIONS[PermissionKey]][]).map(([key, perm]) => {
                      const isSelected = permSelections.has(key);
                      const isDisabled = key !== 'full_access' && permSelections.has('full_access');
                      return (
                        <Pressable
                          key={key}
                          style={[{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            backgroundColor: isSelected ? perm.color + '08' : '#FFF',
                            borderRadius: 14, padding: 14, marginBottom: 8,
                            borderWidth: 1.5, borderColor: isSelected ? perm.color + '40' : '#F1F5F9',
                          }, isDisabled && { opacity: 0.4 }]}
                          onPress={() => togglePermission(key)}
                          disabled={isDisabled}
                        >
                          <View style={[{
                            width: 40, height: 40, borderRadius: 12,
                            backgroundColor: isSelected ? perm.color + '15' : '#F8FAFC',
                            alignItems: 'center', justifyContent: 'center',
                          }]}>
                            <MaterialIcons name={perm.icon as any} size={20} color={isSelected ? perm.color : '#94A3B8'} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: isSelected ? perm.color : '#0F172A' }}>
                              {fr ? perm.labelFr : perm.labelEn}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                              {fr ? perm.description_fr : perm.description_en}
                            </Text>
                          </View>
                          <View style={[{
                            width: 24, height: 24, borderRadius: 7,
                            borderWidth: 2, borderColor: isSelected ? perm.color : '#CBD5E1',
                            backgroundColor: isSelected ? perm.color : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }]}>
                            {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                          </View>
                        </Pressable>
                      );
                    })}

                    {/* Summary */}
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 8 }}>
                        {fr ? 'RESUME DES PERMISSIONS' : 'PERMISSIONS SUMMARY'}
                      </Text>
                      {permSelections.size === 0 ? (
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                          {fr ? 'Aucune permission specifique (acces admin standard)' : 'No specific permissions (standard admin access)'}
                        </Text>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {[...permSelections].map(key => {
                            const perm = ADMIN_PERMISSIONS[key];
                            return (
                              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: perm.color + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: perm.color + '25' }}>
                                <MaterialIcons name={perm.icon as any} size={10} color={perm.color} />
                                <Text style={{ fontSize: 10, fontWeight: '700', color: perm.color }}>{fr ? perm.labelFr : perm.labelEn}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* User Detail Modal */}
      <Modal visible={!!detailUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailUser(null)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setDetailUser(null)}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.headerTitle}>{fr ? 'Detail utilisateur' : 'User Detail'}</Text>
            <View style={{ width: 40 }} />
          </View>
          {detailUser ? (
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
              {/* Profile header */}
              <View style={s.detailHero}>
                {detailUser.avatar ? (
                  <Image source={{ uri: detailUser.avatar }} style={s.detailAvatar} contentFit="cover" transition={200} />
                ) : (
                  <View style={s.detailAvatarPlaceholder}>
                    <Text style={s.detailAvatarText}>{(detailUser.username || detailUser.email).charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={s.detailName}>{detailUser.username || detailUser.email}</Text>
                <Text style={s.detailEmail}>{detailUser.email}</Text>
                <View style={s.detailBadgeRow}>
                  {detailUser.isAdmin ? <View style={[s.detailBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}><MaterialIcons name="shield" size={12} color="#DC2626" /><Text style={[s.detailBadgeText, { color: '#DC2626' }]}>Admin</Text></View> : null}
                  {detailUser.isPremium ? <View style={[s.detailBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}><MaterialIcons name="star" size={12} color="#D4A017" /><Text style={[s.detailBadgeText, { color: '#D4A017' }]}>Premium</Text></View> : null}
                  {detailUser.role ? <View style={[s.detailBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}><Text style={[s.detailBadgeText, { color: '#3B82F6' }]}>{detailUser.role}</Text></View> : null}
                  {detailUser.level ? <View style={[s.detailBadge, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}><Text style={[s.detailBadgeText, { color: '#10B981' }]}>{detailUser.level}</Text></View> : null}
                </View>
              </View>

              {/* Stats grid */}
              <View style={s.detailStatsGrid}>
                {[
                  { value: detailUser.eloRating || 1000, label: 'ELO', color: getEloRank(detailUser.eloRating || 1000).color, icon: getEloRank(detailUser.eloRating || 1000).icon },
                  { value: detailUser.matchCount || 0, label: fr ? 'Matchs' : 'Matches', color: '#3B82F6', icon: 'sports' },
                  { value: detailUser.wins || 0, label: fr ? 'Victoires' : 'Wins', color: '#10B981', icon: 'emoji-events' },
                  { value: detailUser.xp, label: 'XP', color: '#7C3AED', icon: 'bolt' },
                ].map((st, i) => (
                  <View key={i} style={s.detailStatItem}>
                    <MaterialIcons name={st.icon as any} size={16} color={st.color} />
                    <Text style={[s.detailStatValue, { color: st.color }]}>{st.value}</Text>
                    <Text style={s.detailStatLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>

              {/* Trust Score */}
              {detailUser.trustScore !== null ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>{fr ? 'SCORE DE CONFIANCE' : 'TRUST SCORE'}</Text>
                  <View style={s.trustCard}>
                    <View style={[s.trustIcon, { backgroundColor: (detailUser.trustScore >= 70 ? '#10B981' : detailUser.trustScore >= 40 ? '#F59E0B' : '#EF4444') + '15' }]}>
                      <MaterialIcons name="verified-user" size={20} color={detailUser.trustScore >= 70 ? '#10B981' : detailUser.trustScore >= 40 ? '#F59E0B' : '#EF4444'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.trustValue}>{detailUser.trustScore}/100</Text>
                      <View style={s.trustBarBg}>
                        <View style={[s.trustBarFill, { width: `${detailUser.trustScore}%`, backgroundColor: detailUser.trustScore >= 70 ? '#10B981' : detailUser.trustScore >= 40 ? '#F59E0B' : '#EF4444' }]} />
                      </View>
                    </View>
                    {detailUser.trustStatus ? <View style={[s.trustStatusBadge, { backgroundColor: (detailUser.trustStatus === 'flagged' ? '#FEF2F2' : '#F8FAFC') }]}><Text style={[s.trustStatusText, { color: detailUser.trustStatus === 'flagged' ? '#EF4444' : '#64748B' }]}>{detailUser.trustStatus}</Text></View> : null}
                  </View>
                </View>
              ) : null}

              {/* Badges */}
              {detailUser.badges.length > 0 ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>BADGES ({detailUser.badges.length})</Text>
                  <View style={s.badgesGrid}>
                    {detailUser.badges.map((b, i) => (
                      <View key={i} style={s.badgeChip}>
                        <MaterialIcons name="military-tech" size={14} color="#D4A017" />
                        <Text style={s.badgeChipText} numberOfLines={1}>{b.badgeId}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Additional stats */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>{fr ? 'INFORMATIONS' : 'INFORMATION'}</Text>
                <View style={s.infoCard}>
                  {[
                    { icon: 'home', label: 'Club', value: detailUser.club || '-', color: '#10B981' },
                    { icon: 'sports', label: fr ? 'Defis' : 'Challenges', value: String(detailUser.challengeCount || 0), color: '#F59E0B' },
                    { icon: 'emoji-events', label: fr ? 'Tournois' : 'Tournaments', value: String(detailUser.tournamentCount || 0), color: '#7C3AED' },
                  ].map((info, i) => (
                    <View key={i} style={[s.infoRow, i > 0 && s.infoRowBorder]}>
                      <View style={[s.infoIcon, { backgroundColor: info.color + '12' }]}>
                        <MaterialIcons name={info.icon as any} size={16} color={info.color} />
                      </View>
                      <Text style={s.infoLabel}>{info.label}</Text>
                      <Text style={s.infoValue}>{info.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Quick actions */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>{fr ? 'ACTIONS' : 'ACTIONS'}</Text>
                <View style={s.detailActionsRow}>
                  <Pressable style={[s.detailActionBtn, { backgroundColor: detailUser.isPremium ? '#94A3B8' : '#D4A017' }]} onPress={() => handleTogglePremium(detailUser)}>
                    <MaterialIcons name={detailUser.isPremium ? 'star-outline' : 'star'} size={18} color="#FFF" />
                    <Text style={s.detailActionText}>{detailUser.isPremium ? '-Premium' : '+Premium'}</Text>
                  </Pressable>
                  <Pressable style={[s.detailActionBtn, { backgroundColor: detailUser.isAdmin ? '#64748B' : '#DC2626' }]} onPress={() => handleToggleAdmin(detailUser)}>
                    <MaterialIcons name={detailUser.isAdmin ? 'remove-moderator' : 'shield'} size={18} color="#FFF" />
                    <Text style={s.detailActionText}>{detailUser.isAdmin ? '-Admin' : '+Admin'}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={s.viewPlayerBtn}
                  onPress={() => { setDetailUser(null); router.push(`/player/${detailUser.id}` as any); }}
                >
                  <MaterialIcons name="badge" size={20} color="#3B82F6" />
                  <Text style={s.viewPlayerText}>{fr ? 'Voir la fiche joueur' : 'View player card'}</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#3B82F6" />
                </Pressable>
                {detailUser.isAdmin ? (
                  <Pressable
                    style={[s.viewPlayerBtn, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', marginTop: 8 }]}
                    onPress={() => { setDetailUser(null); setTimeout(() => handleOpenPermissions(detailUser), 200); }}
                  >
                    <MaterialIcons name="tune" size={20} color="#7C3AED" />
                    <Text style={[s.viewPlayerText, { color: '#7C3AED' }]}>{fr ? 'Gerer les permissions' : 'Manage permissions'}</Text>
                    <MaterialIcons name="chevron-right" size={18} color="#7C3AED" />
                  </Pressable>
                ) : null}
              </View>

              {loadingDetail ? <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 16 }} /> : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </AdminGuard>
    </PageErrorBoundary>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  selectModeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  selectModeBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 12 },

  // Filter
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterChipBadge: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterChipBadgeText: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },

  // User card
  userCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  userCardSelected: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 12 },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 18, fontWeight: '700', color: '#64748B' },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  userEmail: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  userMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  userMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  userMetaText: { fontSize: 10, fontWeight: '600', color: '#64748B', maxWidth: 80 },
  adminBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },
  premiumBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FDE68A' },

  // Checkbox
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  checkboxActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },

  // Bulk bar
  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 8 },
  bulkBarText: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  bulkBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 56 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },

  // Detail modal
  detailHero: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 24, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  detailAvatar: { width: 80, height: 80, borderRadius: 24, marginBottom: 12 },
  detailAvatarPlaceholder: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailAvatarText: { fontSize: 28, fontWeight: '700', color: '#64748B' },
  detailName: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  detailEmail: { fontSize: 13, color: '#94A3B8', marginBottom: 10 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  detailBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  detailBadgeText: { fontSize: 11, fontWeight: '700' },

  // Detail stats
  detailStatsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  detailStatItem: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  detailStatValue: { fontSize: 18, fontWeight: '800' },
  detailStatLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Trust
  trustCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  trustIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trustValue: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  trustBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  trustBarFill: { height: '100%', borderRadius: 3 },
  trustStatusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  trustStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  // Badges
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#FDE68A' },
  badgeChipText: { fontSize: 11, fontWeight: '600', color: '#0F172A', maxWidth: 100 },

  // Info
  infoCard: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  infoIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', flex: 1 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  // Actions
  detailSection: { marginBottom: 16 },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 4 },
  detailActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  detailActionText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  viewPlayerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE' },
  viewPlayerText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#3B82F6' },
});
