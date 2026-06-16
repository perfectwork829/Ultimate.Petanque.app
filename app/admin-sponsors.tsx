import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Modal,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import { insertAmbassadorForAdmin, patchAmbassadorForAdmin } from '@/services/adminAmbassadorsService';
import {
  fetchAmbassadors,
  Ambassador,
  AmbassadorLevel,
  AMBASSADOR_LEVELS,
  invalidateAmbassadorCache,
} from '@/services/ambassadorService';
import {
  fetchAmbassadorAnalytics,
  AmbassadorAnalytics,
} from '@/services/ambassadorAnalyticsService';

type BadgeType = 'ambassador' | 'gold_sponsor' | 'sponsor' | 'bronze_sponsor';

const BADGE_TYPE_CONFIG: Record<BadgeType, { label: string; labelEn: string; color: string; icon: string; gradient: [string, string] }> = {
  gold_sponsor: { label: 'Sponsor Or', labelEn: 'Gold Sponsor', color: '#D97706', icon: 'workspace-premium', gradient: ['#B45309', '#F59E0B'] },
  sponsor: { label: 'Sponsor Argent', labelEn: 'Silver Sponsor', color: '#6B7280', icon: 'verified', gradient: ['#4B5563', '#9CA3AF'] },
  bronze_sponsor: { label: 'Sponsor Bronze', labelEn: 'Bronze Sponsor', color: '#B45309', icon: 'military-tech', gradient: ['#92400E', '#D97706'] },
  ambassador: { label: 'Ambassadeur', labelEn: 'Ambassador', color: '#7C3AED', icon: 'person', gradient: ['#6D28D9', '#A78BFA'] },
};

const LEVEL_LABELS: Record<AmbassadorLevel, { fr: string; en: string }> = {
  decouverte: { fr: 'Decouverte', en: 'Discovery' },
  confirme: { fr: 'Confirme', en: 'Confirmed' },
  elite: { fr: 'Elite', en: 'Elite' },
};

interface EditFormData {
  displayName: string;
  bio: string;
  photo: string;
  badgeType: BadgeType;
  ambassadorLevel: AmbassadorLevel;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: string;
  youtubeUrl: string;
  tiktokUrl: string;
  instagramHandle: string;
  twitterHandle: string;
  websiteUrl: string;
}

export default function AdminSponsorsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allAmbassadors, setAllAmbassadors] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<Map<string, AmbassadorAnalytics>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | BadgeType>('all');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({
    displayName: '', bio: '', photo: '', badgeType: 'ambassador',
    ambassadorLevel: 'decouverte', isActive: true, isFeatured: false,
    sortOrder: '0', youtubeUrl: '', tiktokUrl: '', instagramHandle: '',
    twitterHandle: '', websiteUrl: '',
  });

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<EditFormData>({
    displayName: '', bio: '', photo: '', badgeType: 'ambassador',
    ambassadorLevel: 'decouverte', isActive: true, isFeatured: false,
    sortOrder: '0', youtubeUrl: '', tiktokUrl: '', instagramHandle: '',
    twitterHandle: '', websiteUrl: '',
  });
  const [createUserId, setCreateUserId] = useState('');

  const loadData = useCallback(async () => {
    try {
      // Fetch ALL ambassadors (including inactive) for admin
      const { data, error } = await supabase
        .from('ambassadors')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && data) setAllAmbassadors(data);

      const { stats } = await fetchAmbassadorAnalytics('30d');
      setAnalytics(stats);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateAmbassadorCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = useMemo(() => {
    let items = allAmbassadors;
    if (filterType !== 'all') items = items.filter(a => a.badge_type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(a =>
        a.display_name?.toLowerCase().includes(q) ||
        a.bio?.toLowerCase().includes(q) ||
        a.referral_code?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allAmbassadors, filterType, searchQuery]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allAmbassadors.length };
    allAmbassadors.forEach(a => {
      c[a.badge_type] = (c[a.badge_type] || 0) + 1;
    });
    return c;
  }, [allAmbassadors]);

  const openEdit = (item: any) => {
    Haptics.selectionAsync();
    setEditItem(item);
    setEditForm({
      displayName: item.display_name || '',
      bio: item.bio || '',
      photo: item.photo || '',
      badgeType: item.badge_type || 'ambassador',
      ambassadorLevel: item.ambassador_level || 'decouverte',
      isActive: item.is_active !== false,
      isFeatured: item.is_featured === true,
      sortOrder: String(item.sort_order || 0),
      youtubeUrl: item.youtube_url || '',
      tiktokUrl: item.tiktok_url || '',
      instagramHandle: item.instagram_handle || '',
      twitterHandle: item.twitter_handle || '',
      websiteUrl: item.website_url || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      const { error } = await patchAmbassadorForAdmin(
        supabase,
        editItem.id,
        {
          display_name: editForm.displayName.trim(),
          bio: editForm.bio.trim() || null,
          photo: editForm.photo.trim() || null,
          badge_type: editForm.badgeType,
          ambassador_level: editForm.ambassadorLevel,
          is_active: editForm.isActive,
          is_featured: editForm.isFeatured,
          sort_order: parseInt(editForm.sortOrder) || 0,
          youtube_url: editForm.youtubeUrl.trim() || null,
          tiktok_url: editForm.tiktokUrl.trim() || null,
          instagram_handle: editForm.instagramHandle.trim() || null,
          twitter_handle: editForm.twitterHandle.trim() || null,
          website_url: editForm.websiteUrl.trim() || null,
        },
        language
      );

      if (error) { Alert.alert(fr ? 'Erreur' : 'Error', error); return; }
      invalidateAmbassadorCache();
      setShowEditModal(false);
      await loadData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.displayName.trim() || !createUserId.trim()) {
      Alert.alert('Error', fr ? 'Nom et User ID requis' : 'Name and User ID required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await insertAmbassadorForAdmin(
        supabase,
        {
          user_id: createUserId.trim(),
          display_name: createForm.displayName.trim(),
          bio: createForm.bio.trim() || null,
          photo: createForm.photo.trim() || null,
          badge_type: createForm.badgeType,
          ambassador_level: createForm.ambassadorLevel,
          is_active: createForm.isActive,
          is_featured: createForm.isFeatured,
          sort_order: parseInt(createForm.sortOrder) || 0,
          youtube_url: createForm.youtubeUrl.trim() || null,
          tiktok_url: createForm.tiktokUrl.trim() || null,
          instagram_handle: createForm.instagramHandle.trim() || null,
          twitter_handle: createForm.twitterHandle.trim() || null,
          website_url: createForm.websiteUrl.trim() || null,
        },
        language
      );

      if (error) { Alert.alert(fr ? 'Erreur' : 'Error', error); return; }
      invalidateAmbassadorCache();
      setShowCreateModal(false);
      setCreateUserId('');
      setCreateForm({
        displayName: '', bio: '', photo: '', badgeType: 'ambassador',
        ambassadorLevel: 'decouverte', isActive: true, isFeatured: false,
        sortOrder: '0', youtubeUrl: '', tiktokUrl: '', instagramHandle: '',
        twitterHandle: '', websiteUrl: '',
      });
      await loadData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: any) => {
    Haptics.selectionAsync();
    const newActive = !item.is_active;
    const { error } = await patchAmbassadorForAdmin(supabase, item.id, { is_active: newActive }, language);
    if (error) {
      Alert.alert(fr ? 'Erreur' : 'Error', error);
      return;
    }
    invalidateAmbassadorCache();
    loadData();
  };

  const renderFormSaveBar = (onSave: () => void, label: string, isSaving: boolean) => (
    <Pressable style={[s.formBottomSaveBtn, isSaving && { opacity: 0.5 }]} onPress={onSave} disabled={isSaving}>
      {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : (
        <>
          <MaterialIcons name="save" size={20} color="#FFF" />
          <Text style={s.formBottomSaveBtnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );

  const renderFormFields = (
    form: EditFormData,
    setForm: (f: EditFormData) => void,
    opts?: { showUserId?: boolean; onSave?: () => void; saveLabel?: string; saving?: boolean },
  ) => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {opts?.showUserId ? (
        <View style={s.formField}>
          <Text style={s.formLabel}>User ID *</Text>
          <TextInput style={s.formInput} value={createUserId} onChangeText={setCreateUserId} placeholder="UUID du user_profiles" placeholderTextColor={theme.textMuted} autoCapitalize="none" />
        </View>
      ) : null}

      <View style={s.formField}>
        <Text style={s.formLabel}>{fr ? 'Nom affiche *' : 'Display name *'}</Text>
        <TextInput style={s.formInput} value={form.displayName} onChangeText={v => setForm({ ...form, displayName: v })} placeholder={fr ? 'Nom du sponsor/ambassadeur' : 'Sponsor/ambassador name'} placeholderTextColor={theme.textMuted} />
      </View>

      <View style={s.formField}>
        <Text style={s.formLabel}>Bio</Text>
        <TextInput style={[s.formInput, { minHeight: 80 }]} value={form.bio} onChangeText={v => setForm({ ...form, bio: v })} multiline textAlignVertical="top" placeholder="Description..." placeholderTextColor={theme.textMuted} />
      </View>

      <View style={s.formField}>
        <Text style={s.formLabel}>{fr ? 'URL photo' : 'Photo URL'}</Text>
        <TextInput style={s.formInput} value={form.photo} onChangeText={v => setForm({ ...form, photo: v })} placeholder="https://..." placeholderTextColor={theme.textMuted} autoCapitalize="none" />
      </View>

      <View style={s.formField}>
        <Text style={s.formLabel}>{fr ? 'Type de badge' : 'Badge type'}</Text>
        <View style={s.chipRow}>
          {(Object.keys(BADGE_TYPE_CONFIG) as BadgeType[]).map(bt => {
            const cfg = BADGE_TYPE_CONFIG[bt];
            const active = form.badgeType === bt;
            return (
              <Pressable key={bt} style={[s.chip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setForm({ ...form, badgeType: bt })}>
                <MaterialIcons name={cfg.icon as any} size={14} color={active ? '#FFF' : cfg.color} />
                <Text style={[s.chipText, active && { color: '#FFF' }]}>{fr ? cfg.label : cfg.labelEn}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {form.badgeType === 'ambassador' ? (
        <View style={s.formField}>
          <Text style={s.formLabel}>{fr ? 'Niveau ambassadeur' : 'Ambassador level'}</Text>
          <View style={s.chipRow}>
            {(['decouverte', 'confirme', 'elite'] as AmbassadorLevel[]).map(lvl => {
              const cfg = AMBASSADOR_LEVELS[lvl];
              const active = form.ambassadorLevel === lvl;
              return (
                <Pressable key={lvl} style={[s.chip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setForm({ ...form, ambassadorLevel: lvl })}>
                  <MaterialIcons name={cfg.icon as any} size={14} color={active ? '#FFF' : cfg.color} />
                  <Text style={[s.chipText, active && { color: '#FFF' }]}>{LEVEL_LABELS[lvl][fr ? 'fr' : 'en']}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={s.formField}>
        <Text style={s.formLabel}>{fr ? 'Ordre d\'affichage' : 'Sort order'}</Text>
        <TextInput style={s.formInput} value={form.sortOrder} onChangeText={v => setForm({ ...form, sortOrder: v })} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.textMuted} />
      </View>

      <View style={s.toggleRow}>
        <Text style={s.toggleLabel}>{fr ? 'Actif' : 'Active'}</Text>
        <Switch value={form.isActive} onValueChange={v => setForm({ ...form, isActive: v })} trackColor={{ false: theme.border, true: theme.success + '60' }} thumbColor={form.isActive ? theme.success : theme.textMuted} />
      </View>

      <View style={s.toggleRow}>
        <Text style={s.toggleLabel}>{fr ? 'Mis en avant' : 'Featured'}</Text>
        <Switch value={form.isFeatured} onValueChange={v => setForm({ ...form, isFeatured: v })} trackColor={{ false: theme.border, true: theme.carreauColor + '60' }} thumbColor={form.isFeatured ? theme.carreauColor : theme.textMuted} />
      </View>

      <Text style={s.socialSectionLabel}>{fr ? 'LIENS SOCIAUX' : 'SOCIAL LINKS'}</Text>

      {[
        { key: 'youtubeUrl', icon: 'play-circle-filled', label: 'YouTube URL', color: '#FF0000' },
        { key: 'tiktokUrl', icon: 'music-note', label: 'TikTok URL', color: '#000' },
        { key: 'instagramHandle', icon: 'camera-alt', label: 'Instagram @', color: '#E4405F' },
        { key: 'twitterHandle', icon: 'alternate-email', label: 'Twitter/X @', color: '#1DA1F2' },
        { key: 'websiteUrl', icon: 'language', label: 'Website URL', color: theme.primary },
      ].map(s_field => (
        <View key={s_field.key} style={s.socialField}>
          <MaterialIcons name={s_field.icon as any} size={18} color={s_field.color} />
          <TextInput
            style={s.socialInput}
            value={(form as any)[s_field.key]}
            onChangeText={v => setForm({ ...form, [s_field.key]: v })}
            placeholder={s_field.label}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
        </View>
      ))}
      {opts?.onSave ? renderFormSaveBar(opts.onSave, opts.saveLabel || (fr ? 'Sauver' : 'Save'), !!opts.saving) : null}
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}><Text style={s.headerTitle}>{fr ? 'Admin Sponsors' : 'Admin Sponsors'}</Text></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <AdminGuard language={language} requiredPermission="sponsors">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Sponsors' : 'Sponsors'}</Text>
        <Pressable style={s.addBtn} onPress={() => { Haptics.selectionAsync(); setShowCreateModal(true); }}>
          <MaterialIcons name="add" size={22} color="#FFF" />
        </Pressable>
      </View>

      <AdminQuickNav currentRoute="/admin-sponsors" />

      {/* Summary counts */}
      <View style={s.countRow}>
        {(['all', 'gold_sponsor', 'sponsor', 'bronze_sponsor', 'ambassador'] as const).map(key => {
          const isAll = key === 'all';
          const cfg = isAll ? null : BADGE_TYPE_CONFIG[key as BadgeType];
          const active = filterType === key;
          return (
            <Pressable
              key={key}
              style={[s.countChip, active && { backgroundColor: (cfg?.color || theme.primary), borderColor: cfg?.color || theme.primary }]}
              onPress={() => { Haptics.selectionAsync(); setFilterType(key as any); }}
            >
              {cfg ? <MaterialIcons name={cfg.icon as any} size={12} color={active ? '#FFF' : cfg.color} /> : null}
              <Text style={[s.countChipText, active && { color: '#FFF' }]}>
                {isAll ? (fr ? 'Tous' : 'All') : (fr ? cfg!.label : cfg!.labelEn)}
              </Text>
              <View style={[s.countBadge, active && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <Text style={[s.countBadgeText, active && { color: '#FFF' }]}>{counts[key] || 0}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <MaterialIcons name="search" size={20} color={theme.textMuted} />
        <TextInput style={s.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder={fr ? 'Rechercher...' : 'Search...'} placeholderTextColor={theme.textMuted} />
        {searchQuery ? <Pressable onPress={() => setSearchQuery('')}><MaterialIcons name="close" size={18} color={theme.textMuted} /></Pressable> : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyState}>
            <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
            <Text style={s.emptyText}>{fr ? 'Aucun resultat' : 'No results'}</Text>
          </View>
        ) : null}

        {filtered.map((item, idx) => {
          const cfg = BADGE_TYPE_CONFIG[(item.badge_type as BadgeType) || 'ambassador'] || BADGE_TYPE_CONFIG.ambassador;
          const stats = analytics.get(item.id);
          const lvlCfg = AMBASSADOR_LEVELS[(item.ambassador_level as AmbassadorLevel) || 'decouverte'] || AMBASSADOR_LEVELS.decouverte;
          return (
            <View key={item.id} style={[s.itemCard, !item.is_active && { opacity: 0.5 }]}>
              <View style={s.itemTopRow}>
                <View style={[s.itemAvatar, { backgroundColor: cfg.color + '15' }]}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" transition={200} />
                  ) : (
                    <MaterialIcons name={cfg.icon as any} size={22} color={cfg.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName} numberOfLines={1}>{item.display_name}</Text>
                  <View style={s.itemTagsRow}>
                    <LinearGradient colors={cfg.gradient} style={s.itemTypeBadge}>
                      <MaterialIcons name={cfg.icon as any} size={9} color="#FFF" />
                      <Text style={s.itemTypeBadgeText}>{fr ? cfg.label : cfg.labelEn}</Text>
                    </LinearGradient>
                    {item.badge_type === 'ambassador' && lvlCfg ? (
                      <View style={[s.itemLevelBadge, { backgroundColor: lvlCfg.color + '15' }]}>
                        <MaterialIcons name={lvlCfg.icon as any} size={10} color={lvlCfg.color} />
                        <Text style={[s.itemLevelText, { color: lvlCfg.color }]}>{LEVEL_LABELS[(item.ambassador_level as AmbassadorLevel) || 'decouverte'][fr ? 'fr' : 'en']}</Text>
                      </View>
                    ) : null}
                    {!item.is_active ? <View style={s.inactiveBadge}><Text style={s.inactiveBadgeText}>{fr ? 'INACTIF' : 'INACTIVE'}</Text></View> : null}
                    {item.is_featured ? <View style={s.featuredBadge}><MaterialIcons name="star" size={10} color={theme.carreauColor} /></View> : null}
                  </View>
                </View>
                <Pressable style={s.itemEditBtn} onPress={() => openEdit(item)}>
                  <MaterialIcons name="edit" size={18} color={theme.primary} />
                </Pressable>
              </View>

              {/* Stats row */}
              <View style={s.itemStatsRow}>
                <View style={s.itemStat}>
                  <Text style={s.itemStatVal}>{stats?.profileViews || 0}</Text>
                  <Text style={s.itemStatLabel}>{fr ? 'Vues' : 'Views'}</Text>
                </View>
                <View style={s.itemStat}>
                  <Text style={s.itemStatVal}>{stats?.bannerImpressions || 0}</Text>
                  <Text style={s.itemStatLabel}>Impr.</Text>
                </View>
                <View style={s.itemStat}>
                  <Text style={s.itemStatVal}>{stats?.socialClicks || 0}</Text>
                  <Text style={s.itemStatLabel}>Clics</Text>
                </View>
                {item.badge_type === 'ambassador' ? (
                  <View style={s.itemStat}>
                    <Text style={[s.itemStatVal, { color: '#7C3AED' }]}>{item.referral_count || 0}</Text>
                    <Text style={s.itemStatLabel}>{fr ? 'Parr.' : 'Ref.'}</Text>
                  </View>
                ) : null}
                <Pressable
                  style={[s.toggleActiveBtn, { backgroundColor: item.is_active ? theme.error + '12' : theme.success + '12' }]}
                  onPress={() => handleToggleActive(item)}
                >
                  <MaterialIcons name={item.is_active ? 'visibility-off' : 'visibility'} size={16} color={item.is_active ? theme.error : theme.success} />
                </Pressable>
              </View>

              {item.referral_code ? (
                <View style={s.refCodeRow}>
                  <MaterialIcons name="card-giftcard" size={12} color="#7C3AED" />
                  <Text style={s.refCodeText}>{item.referral_code}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEditModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => setShowEditModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Modifier' : 'Edit'}</Text>
            <Pressable style={[s.modalSaveBtn, saving && { opacity: 0.5 }]} onPress={handleSaveEdit} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.modalSaveBtnText}>{fr ? 'Mettre a jour' : 'Update'}</Text>}
            </Pressable>
          </View>
          {renderFormFields(editForm, setEditForm, {
            onSave: handleSaveEdit,
            saveLabel: fr ? 'Enregistrer les modifications' : 'Save changes',
            saving,
          })}
        </SafeAreaView>
      </Modal>

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => setShowCreateModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Creer' : 'Create'}</Text>
            <Pressable style={[s.modalSaveBtn, saving && { opacity: 0.5 }]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.modalSaveBtnText}>{fr ? 'Creer' : 'Create'}</Text>}
            </Pressable>
          </View>
          {renderFormFields(createForm, setCreateForm, {
            showUserId: true,
            onSave: handleCreate,
            saveLabel: fr ? 'Creer' : 'Create',
            saving,
          })}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </AdminGuard>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  addBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },

  // Counts
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  countChipText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  countBadge: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  countBadgeText: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },

  // Item card
  itemCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 10, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  itemAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  itemName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  itemTagsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  itemTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  itemTypeBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
  itemLevelBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  itemLevelText: { fontSize: 9, fontWeight: '700' },
  inactiveBadge: { backgroundColor: theme.error + '12', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  inactiveBadgeText: { fontSize: 9, fontWeight: '700', color: theme.error },
  featuredBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.carreauColor + '15', alignItems: 'center', justifyContent: 'center' },
  itemEditBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },

  // Stats
  itemStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 8 },
  itemStat: { flex: 1, alignItems: 'center' },
  itemStatVal: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  itemStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },
  toggleActiveBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  refCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border },
  refCodeText: { fontSize: 12, fontWeight: '700', color: '#7C3AED', letterSpacing: 1 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  modalSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: 10 },
  modalSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  formBottomSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: theme.borderRadius.md, marginTop: 8 },
  formBottomSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Form
  formField: { gap: 6 },
  formLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 0.3 },
  formInput: { backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.border },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  socialSectionLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, letterSpacing: 1, marginTop: 6 },
  socialField: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: theme.border },
  socialInput: { flex: 1, fontSize: 14, color: theme.textPrimary, paddingVertical: 12 },
});
