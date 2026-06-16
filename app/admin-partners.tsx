import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, Switch, Platform, FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';

import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import AdminGuard from '@/components/feature/AdminGuard';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import { fetchSponsorsOnly, invalidateAmbassadorCache, Ambassador } from '@/services/ambassadorService';
import { insertAmbassadorForAdmin, patchAmbassadorForAdmin } from '@/services/adminAmbassadorsService';
import { PARTNER_TIERS, getTierConfig, PartnerTier } from '@/constants/partnerTiers';

const TIER_CONFIG: Record<PartnerTier, { label: string; labelEn: string; color: string; icon: string; advantages: { fr: string; en: string }[] }> = {
  gold_sponsor: {
    label: 'Or', labelEn: 'Gold', color: '#D4A017', icon: 'star',
    advantages: PARTNER_TIERS.gold_sponsor.benefitsFr.map((fr, i) => ({ fr, en: PARTNER_TIERS.gold_sponsor.benefitsEn[i] || fr })),
  },
  sponsor: {
    label: 'Argent', labelEn: 'Silver', color: '#78909C', icon: 'workspace-premium',
    advantages: PARTNER_TIERS.sponsor.benefitsFr.map((fr, i) => ({ fr, en: PARTNER_TIERS.sponsor.benefitsEn[i] || fr })),
  },
  partner: {
    label: 'Bronze', labelEn: 'Bronze', color: '#A1887F', icon: 'workspace-premium',
    advantages: PARTNER_TIERS.partner.benefitsFr.map((fr, i) => ({ fr, en: PARTNER_TIERS.partner.benefitsEn[i] || fr })),
  },
};

export default function AdminPartnersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | PartnerTier>('all');
  const [saving, setSaving] = useState(false);

  // Advantages section collapsed
  const [showAdvantages, setShowAdvantages] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTier, setEditTier] = useState<PartnerTier>('partner');
  const [editActive, setEditActive] = useState(true);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editBrandColor, setEditBrandColor] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');

  // Goals modal
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [goalsItem, setGoalsItem] = useState<any | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalType, setGoalType] = useState<'impressions' | 'profile_views' | 'social_clicks' | 'conversion_rate'>('impressions');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalPeriod, setGoalPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

  const GOAL_TYPES = [
    { id: 'impressions' as const, label: fr ? 'Impressions' : 'Impressions', icon: 'visibility', color: theme.primary },
    { id: 'profile_views' as const, label: fr ? 'Vues profil' : 'Profile Views', icon: 'person', color: '#7C3AED' },
    { id: 'social_clicks' as const, label: fr ? 'Clics sociaux' : 'Social Clicks', icon: 'touch-app', color: theme.success },
    { id: 'conversion_rate' as const, label: fr ? 'Taux conversion %' : 'Conversion Rate %', icon: 'trending-up', color: '#F59E0B' },
  ];

  const openGoals = useCallback(async (item: any) => {
    Haptics.selectionAsync();
    setGoalsItem(item);
    setShowGoalsModal(true);
    setLoadingGoals(true);
    const { data } = await supabase
      .from('partner_goals')
      .select('*')
      .eq('ambassador_id', item.id)
      .order('created_at', { ascending: false });
    setGoals(data || []);
    setLoadingGoals(false);
  }, [supabase]);

  const handleSaveGoal = useCallback(async () => {
    if (!goalsItem || !user || !goalTarget.trim()) return;
    setSavingGoal(true);
    const target = parseFloat(goalTarget);
    if (isNaN(target) || target <= 0) { setSavingGoal(false); return; }
    // Upsert: update if same type+period exists, otherwise insert
    const existing = goals.find(g => g.goal_type === goalType && g.period === goalPeriod);
    if (existing) {
      await supabase.from('partner_goals').update({ target_value: target, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('partner_goals').insert({ ambassador_id: goalsItem.id, goal_type: goalType, target_value: target, period: goalPeriod, created_by: user.id });
    }
    // Refresh
    const { data } = await supabase.from('partner_goals').select('*').eq('ambassador_id', goalsItem.id).order('created_at', { ascending: false });
    setGoals(data || []);
    setGoalTarget('');
    setSavingGoal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [goalsItem, user, goalTarget, goalType, goalPeriod, goals, supabase]);

  const handleDeleteGoal = useCallback(async (goalId: string) => {
    await supabase.from('partner_goals').delete().eq('id', goalId);
    setGoals(prev => prev.filter(g => g.id !== goalId));
    Haptics.selectionAsync();
  }, [supabase]);

  // Renewal modal
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewItem, setRenewItem] = useState<any | null>(null);
  const [renewDuration, setRenewDuration] = useState<'3' | '6' | '12'>('12');
  const [renewTier, setRenewTier] = useState<PartnerTier>('partner');
  const [renewNotes, setRenewNotes] = useState('');
  const [renewMonthlyCost, setRenewMonthlyCost] = useState('');
  const [renewalHistory, setRenewalHistory] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPartnerId, setHistoryPartnerId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sponsor proposals (partner self-service)
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [processingProposal, setProcessingProposal] = useState<string | null>(null);

  // Load pending proposals
  useEffect(() => {
    const loadProposals = async () => {
      const { data } = await supabase.from('sponsor_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      setPendingProposals(data || []);
    };
    loadProposals();
  }, [supabase]);

  const handleApproveProposal = useCallback(async (proposal: any) => {
    setProcessingProposal(proposal.id);
    // Resolve item owner user_id
    const tableName = proposal.item_type === 'terrain' ? 'terrains' : proposal.item_type === 'club' ? 'clubs' : proposal.item_type === 'player' ? 'players' : 'tournaments';
    const { data: itemData } = await supabase.from(tableName).select('user_id').eq('id', proposal.item_id).single();
    const ownerUserId = itemData?.user_id || null;
    // Update proposal to awaiting_consent (do NOT set sponsor_id yet)
    const { error: upErr } = await supabase.from('sponsor_proposals').update({
      status: 'approved_awaiting_consent',
      owner_user_id: ownerUserId,
      admin_notes: `Approved by admin on ${new Date().toISOString().split('T')[0]}`,
      updated_at: new Date().toISOString(),
    }).eq('id', proposal.id);
    if (upErr) { Alert.alert('Error', upErr.message); setProcessingProposal(null); return; }
    // Notify item owner
    if (ownerUserId) {
      try {
        const { notifyOwnerOfSponsorApproval } = await import('@/services/sponsorConsentService');
        await notifyOwnerOfSponsorApproval(ownerUserId, proposal.ambassador_name || '', proposal.item_name || '', proposal.item_type);
      } catch { /* silent */ }
    }
    setPendingProposals(prev => prev.filter(p => p.id !== proposal.id));
    setProcessingProposal(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [supabase]);

  const handleRejectProposal = useCallback(async (proposal: any) => {
    setProcessingProposal(proposal.id);
    await supabase.from('sponsor_proposals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', proposal.id);
    setPendingProposals(prev => prev.filter(p => p.id !== proposal.id));
    setProcessingProposal(null);
    Haptics.selectionAsync();
  }, [supabase]);

  // Sponsor assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignPartnerId, setAssignPartnerId] = useState<string | null>(null);
  const [assignPartnerName, setAssignPartnerName] = useState('');
  const [assignItemType, setAssignItemType] = useState<'terrains' | 'clubs' | 'tournaments' | 'players'>('terrains');
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [assignSearchResults, setAssignSearchResults] = useState<any[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [assignSearching, setAssignSearching] = useState(false);
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [assignedItems, setAssignedItems] = useState<any[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [assignHistory, setAssignHistory] = useState<any[]>([]);
  const [showAssignHistory, setShowAssignHistory] = useState(false);
  const assignSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openAssignSponsor = useCallback(async (item: any) => {
    Haptics.selectionAsync();
    setAssignPartnerId(item.id);
    setAssignPartnerName(item.display_name);
    setAssignItemType('terrains');
    setAssignSearchQuery('');
    setAssignSearchResults([]);
    setShowAssignModal(true);
    setLoadingAssigned(true);
    // Load items currently sponsored by this partner
    const [t, c, to, pl] = await Promise.all([
      supabase.from('terrains').select('id, name, city, type').eq('sponsor_id', item.id),
      supabase.from('clubs').select('id, name, city').eq('sponsor_id', item.id),
      supabase.from('tournaments').select('id, name, date').eq('sponsor_id', item.id),
      supabase.from('players').select('id, name, city, avatar').eq('sponsor_id', item.id),
    ]);
    const assigned: any[] = [];
    (t.data || []).forEach((r: any) => assigned.push({ ...r, _table: 'terrains', _icon: 'sports-soccer', _color: theme.success }));
    (c.data || []).forEach((r: any) => assigned.push({ ...r, _table: 'clubs', _icon: 'home', _color: theme.accent }));
    (to.data || []).forEach((r: any) => assigned.push({ ...r, _table: 'tournaments', _icon: 'emoji-events', _color: theme.carreauColor }));
    (pl.data || []).forEach((r: any) => assigned.push({ ...r, _table: 'players', _icon: 'person', _color: theme.primary }));
    setAssignedItems(assigned);
    setLoadingAssigned(false);
  }, [supabase]);

  const handleAssignSearch = useCallback((text: string) => {
    setAssignSearchQuery(text);
    if (assignSearchTimer.current) clearTimeout(assignSearchTimer.current);
    if (text.trim().length < 2) { setAssignSearchResults([]); return; }
    assignSearchTimer.current = setTimeout(async () => {
      setAssignSearching(true);
      const { data } = await supabase
        .from(assignItemType)
        .select(assignItemType === 'tournaments' ? 'id, name, date, sponsor_id' : 'id, name, city, sponsor_id')
        .ilike('name', `%${text.trim()}%`)
        .limit(15);
      setAssignSearchResults(data || []);
      setAssignSearching(false);
    }, 300);
  }, [supabase, assignItemType]);

  const handleAssignItem = useCallback(async (itemId: string, itemName: string) => {
    if (!assignPartnerId) return;
    setAssignSaving(itemId);
    const { error } = await supabase
      .from(assignItemType)
      .update({ sponsor_id: assignPartnerId })
      .eq('id', itemId);
    setAssignSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Refresh assigned list
    const icon = assignItemType === 'terrains' ? 'sports-soccer' : assignItemType === 'clubs' ? 'home' : 'emoji-events';
    const color = assignItemType === 'terrains' ? theme.success : assignItemType === 'clubs' ? theme.accent : theme.carreauColor;
    setAssignedItems(prev => [...prev, { id: itemId, name: itemName, _table: assignItemType, _icon: icon, _color: color }]);
    // Track assignment in analytics
    supabase.from('ambassador_analytics').insert({ ambassador_id: assignPartnerId, event_type: 'sponsor_assign', source_page: `${assignItemType}|${itemId}|${itemName}|assign` }).catch(() => {});
    // Update search results to show new state
    setAssignSearchResults(prev => prev.map(r => r.id === itemId ? { ...r, sponsor_id: assignPartnerId } : r));
    setBulkSelected(prev => { const n = new Set(prev); n.delete(itemId); return n; });
  }, [assignPartnerId, assignItemType, supabase]);

  const handleUnassignItem = useCallback(async (itemId: string, table: string) => {
    setAssignSaving(itemId);
    const { error } = await supabase
      .from(table)
      .update({ sponsor_id: null })
      .eq('id', itemId);
    setAssignSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAssignedItems(prev => prev.filter(r => r.id !== itemId));
    // Track unassignment in analytics
    if (assignPartnerId) supabase.from('ambassador_analytics').insert({ ambassador_id: assignPartnerId, event_type: 'sponsor_assign', source_page: `${table}|${itemId}||unassign` }).catch(() => {});
    setAssignSearchResults(prev => prev.map(r => r.id === itemId ? { ...r, sponsor_id: null } : r));
  }, [supabase]);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createTier, setCreateTier] = useState<PartnerTier>('partner');
  const [createBio, setCreateBio] = useState('');
  const [createPhoto, setCreatePhoto] = useState('');

  const assignSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User search for create
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ambassadors')
        .select('*')
        .in('badge_type', ['gold_sponsor', 'sponsor', 'partner'])
        .order('sort_order', { ascending: true });
      if (!error && data) setPartners(data);
    } catch {} finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateAmbassadorCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = useMemo(() => {
    let items = partners;
    if (filterTier !== 'all') items = items.filter(p => p.badge_type === filterTier);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p => p.display_name?.toLowerCase().includes(q) || p.bio?.toLowerCase().includes(q));
    }
    return items;
  }, [partners, filterTier, searchQuery]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: partners.length };
    partners.forEach(p => { c[p.badge_type] = (c[p.badge_type] || 0) + 1; });
    return c;
  }, [partners]);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 3) { setUserSearchResults([]); return; }
    setSearchingUsers(true);
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, email')
      .or(`email.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(10);
    setUserSearchResults(data || []);
    setSearchingUsers(false);
  }, [supabase]);

  const openEdit = (item: any) => {
    Haptics.selectionAsync();
    setEditItem(item);
    setEditTier(item.badge_type || 'partner');
    setEditActive(item.is_active !== false);
    setEditDisplayName(item.display_name || '');
    setEditBio(item.bio || '');
    setEditPhoto(item.photo || '');
    setEditBrandColor(item.brand_color || '');
    setEditExpiresAt(item.expires_at ? item.expires_at.slice(0, 10) : '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    const { error } = await patchAmbassadorForAdmin(
      supabase,
      editItem.id,
      {
        badge_type: editTier,
        is_active: editActive,
        display_name: editDisplayName.trim(),
        bio: editBio.trim() || null,
        photo: editPhoto.trim() || null,
        brand_color: editBrandColor.trim() || null,
        expires_at: editExpiresAt.trim() ? new Date(editExpiresAt.trim()).toISOString() : null,
      },
      language
    );
    setSaving(false);
    if (error) { Alert.alert(fr ? 'Erreur' : 'Error', error); return; }
    invalidateAmbassadorCache();
    setShowEditModal(false);
    await loadData();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCreate = async () => {
    if (!createUserId.trim() || !createDisplayName.trim()) {
      Alert.alert('Error', fr ? 'Nom et User ID requis' : 'Name and User ID required');
      return;
    }
    setSaving(true);
    const { error } = await insertAmbassadorForAdmin(
      supabase,
      {
        user_id: createUserId.trim(),
        display_name: createDisplayName.trim(),
        badge_type: createTier,
        bio: createBio.trim() || null,
        photo: createPhoto.trim() || null,
        is_active: true,
      },
      language
    );
    setSaving(false);
    if (error) { Alert.alert(fr ? 'Erreur' : 'Error', error); return; }
    invalidateAmbassadorCache();
    setShowCreateModal(false);
    setCreateUserId(''); setCreateDisplayName(''); setCreateBio(''); setCreatePhoto('');
    setUserSearchQuery(''); setUserSearchResults([]);
    await loadData();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openRenew = (item: any) => {
    Haptics.selectionAsync();
    setRenewItem(item);
    setRenewTier(item.badge_type || 'partner');
    setRenewDuration('12');
    setRenewNotes('');
    setRenewMonthlyCost(item.monthly_cost ? String(item.monthly_cost) : '');
    setShowRenewModal(true);
  };

  const handleRenew = async () => {
    if (!renewItem || !user) return;
    setSaving(true);
    const months = parseInt(renewDuration);
    const now = new Date();
    const currentExpiry = renewItem.expires_at ? new Date(renewItem.expires_at) : now;
    const startDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startDate);
    newExpiry.setMonth(newExpiry.getMonth() + months);
    const monthlyCost = parseFloat(renewMonthlyCost) || null;
    const totalInvested = (parseFloat(renewItem.total_invested) || 0) + (monthlyCost ? monthlyCost * months : 0);

    const { error } = await patchAmbassadorForAdmin(
      supabase,
      renewItem.id,
      {
        badge_type: renewTier,
        expires_at: newExpiry.toISOString(),
        is_active: true,
        monthly_cost: monthlyCost,
        total_invested: totalInvested,
      },
      language
    );

    if (error) { Alert.alert(fr ? 'Erreur' : 'Error', error); setSaving(false); return; }

    // Log renewal history
    await supabase.from('partner_renewal_history').insert({
      ambassador_id: renewItem.id,
      renewed_by: user.id,
      previous_expires_at: renewItem.expires_at || null,
      new_expires_at: newExpiry.toISOString(),
      previous_tier: renewItem.badge_type,
      new_tier: renewTier,
      notes: renewNotes.trim() || null,
    });

    setSaving(false);
    invalidateAmbassadorCache();
    setShowRenewModal(false);
    await loadData();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const loadRenewalHistory = async (partnerId: string) => {
    setHistoryPartnerId(partnerId);
    setLoadingHistory(true);
    setShowHistoryModal(true);
    const { data } = await supabase
      .from('partner_renewal_history')
      .select('*')
      .eq('ambassador_id', partnerId)
      .order('created_at', { ascending: false });
    setRenewalHistory(data || []);
    setLoadingHistory(false);
  };

  const handleToggleActive = async (item: any) => {
    Haptics.selectionAsync();
    const { error } = await patchAmbassadorForAdmin(
      supabase,
      item.id,
      { is_active: !item.is_active },
      language
    );
    if (error) {
      Alert.alert(fr ? 'Erreur' : 'Error', error);
      return;
    }
    invalidateAmbassadorCache();
    loadData();
  };

  const handleChangeTier = async (item: any, newTier: PartnerTier) => {
    Haptics.selectionAsync();
    const { error } = await patchAmbassadorForAdmin(supabase, item.id, { badge_type: newTier }, language);
    if (error) {
      Alert.alert(fr ? 'Erreur' : 'Error', error);
      return;
    }
    invalidateAmbassadorCache();
    loadData();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}><Text style={s.headerTitle}>{fr ? 'Partenaires' : 'Partners'}</Text></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <AdminGuard language={language} requiredPermission="sponsors">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Partenaires' : 'Partners'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable style={[s.addBtn, { backgroundColor: '#6366F1' }]} onPress={() => router.push('/partner-analytics' as any)}>
            <MaterialIcons name="analytics" size={18} color="#FFF" />
          </Pressable>
          <Pressable style={s.addBtn} onPress={() => { Haptics.selectionAsync(); setShowCreateModal(true); }}>
            <MaterialIcons name="add" size={22} color="#FFF" />
          </Pressable>
        </View>
      </View>

      <AdminQuickNav currentRoute="/admin-partners" />

      {/* Tier Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {(['all', 'gold_sponsor', 'sponsor', 'partner'] as const).map(key => {
          const isAll = key === 'all';
          const cfg = isAll ? null : TIER_CONFIG[key];
          const active = filterTier === key;
          return (
            <Pressable
              key={key}
              style={[s.filterChip, active && { backgroundColor: cfg?.color || theme.primary, borderColor: cfg?.color || theme.primary }]}
              onPress={() => { Haptics.selectionAsync(); setFilterTier(key as any); }}
            >
              {cfg ? <MaterialIcons name={cfg.icon as any} size={13} color={active ? '#FFF' : cfg.color} /> : null}
              <Text style={[s.filterChipText, active && { color: '#FFF' }]}>
                {isAll ? (fr ? 'Tous' : 'All') : (fr ? cfg!.label : cfg!.labelEn)}
              </Text>
              <View style={[s.filterChipCount, active && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <Text style={[s.filterChipCountText, active && { color: '#FFF' }]}>{counts[key] || 0}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={s.searchRow}>
        <MaterialIcons name="search" size={20} color={theme.textMuted} />
        <TextInput style={s.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder={fr ? 'Rechercher...' : 'Search...'} placeholderTextColor={theme.textMuted} />
        {searchQuery ? <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><MaterialIcons name="close" size={18} color={theme.textMuted} /></Pressable> : null}
      </View>

      {/* Advantages Summary Card (collapsible) */}
      <Pressable style={s.advantagesCard} onPress={() => { Haptics.selectionAsync(); setShowAdvantages(v => !v); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.advantagesTitle}>{fr ? 'AVANTAGES PAR NIVEAU' : 'ADVANTAGES BY TIER'}</Text>
          <MaterialIcons name={showAdvantages ? 'expand-less' : 'expand-more'} size={20} color={theme.textMuted} />
        </View>
        {showAdvantages ? (['gold_sponsor', 'sponsor', 'partner'] as PartnerTier[]).map(tier => {
          const cfg = TIER_CONFIG[tier];
          return (
            <View key={tier} style={[s.advantageTier, { marginTop: tier === 'gold_sponsor' ? 12 : 0 }]}>
              <View style={[s.advantageTierIcon, { backgroundColor: cfg.color + '15' }]}>
                <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.advantageTierLabel, { color: cfg.color }]}>{fr ? cfg.label : cfg.labelEn}</Text>
                {cfg.advantages.map((adv, i) => (
                  <View key={i} style={s.advantageItem}>
                    <MaterialIcons name="check" size={12} color={cfg.color} />
                    <Text style={s.advantageText}>{fr ? adv.fr : adv.en}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        }) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {(['gold_sponsor', 'sponsor', 'partner'] as PartnerTier[]).map(tier => {
              const cfg = TIER_CONFIG[tier];
              return (
                <View key={tier} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cfg.color + '10', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                  <MaterialIcons name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{fr ? cfg.label : cfg.labelEn}</Text>
                  <Text style={{ fontSize: 10, color: cfg.color + '90' }}>{cfg.advantages.length}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Pressable>

      {/* Partner List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 14 }}>
            {/* Sponsor Proposals from Partners */}
            <View style={[s.advantagesCard, { marginHorizontal: 0, borderWidth: 1.5, borderColor: pendingProposals.length > 0 ? '#F59E0B30' : theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: pendingProposals.length > 0 ? 12 : 0 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: pendingProposals.length > 0 ? '#F59E0B15' : theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="pending-actions" size={18} color={pendingProposals.length > 0 ? '#F59E0B' : theme.textMuted} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 }}>{fr ? 'DEMANDES DE SPONSORING' : 'SPONSORSHIP REQUESTS'}</Text>
                <View style={{ backgroundColor: pendingProposals.length > 0 ? '#F59E0B' : theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: pendingProposals.length > 0 ? '#FFF' : theme.textMuted }}>{pendingProposals.length}</Text>
                </View>
              </View>
              {pendingProposals.length > 0 ? pendingProposals.map(p => {
                const typeIcon = p.item_type === 'terrain' ? 'sports-soccer' : p.item_type === 'club' ? 'home' : 'emoji-events';
                const typeColor = p.item_type === 'terrain' ? theme.success : p.item_type === 'club' ? theme.accent : theme.carreauColor;
                const partnerData = partners.find(pt => pt.id === p.ambassador_id);
                const partnerTier = TIER_CONFIG[(partnerData?.badge_type as PartnerTier)] || TIER_CONFIG.partner;
                return (
                  <View key={p.id} style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: typeColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={typeIcon as any} size={20} color={typeColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary }} numberOfLines={1}>{p.item_name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <View style={[s.tierBadge, { backgroundColor: partnerTier.color }]}>
                            <MaterialIcons name={partnerTier.icon as any} size={8} color="#FFF" />
                            <Text style={s.tierBadgeText}>{fr ? partnerTier.label : partnerTier.labelEn}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: theme.textMuted }}>{p.ambassador_name}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>{new Date(p.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.error + '10', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.error + '20' }}
                          onPress={() => handleRejectProposal(p)}
                          disabled={processingProposal === p.id}
                        >
                          <MaterialIcons name="close" size={14} color={theme.error} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.error }}>{fr ? 'Refuser' : 'Reject'}</Text>
                        </Pressable>
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
                          onPress={() => handleApproveProposal(p)}
                          disabled={processingProposal === p.id}
                        >
                          {processingProposal === p.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                            <>
                              <MaterialIcons name="check" size={14} color="#FFF" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{fr ? 'Approuver' : 'Approve'}</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              }) : (
                <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                  <MaterialIcons name="check-circle" size={24} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>{fr ? 'Aucune demande en attente' : 'No pending requests'}</Text>
                </View>
              )}
            </View>
          </View>
        }
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <MaterialIcons name="people-outline" size={48} color={theme.textMuted} />
            <Text style={s.emptyText}>{fr ? 'Aucun partenaire' : 'No partners'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cfg = TIER_CONFIG[(item.badge_type as PartnerTier)] || TIER_CONFIG.partner;
          return (
            <View style={[s.partnerCard, !item.is_active && { opacity: 0.5 }]}>
              <View style={s.cardTop}>
                <View style={[s.cardAvatar, { backgroundColor: cfg.color + '15' }]}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={{ width: 48, height: 48, borderRadius: 14 }} contentFit="cover" transition={200} />
                  ) : (
                    <MaterialIcons name={cfg.icon as any} size={24} color={cfg.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName} numberOfLines={1}>{item.display_name}</Text>
                  <View style={s.cardTags}>
                    <View style={[s.tierBadge, { backgroundColor: cfg.color }]}>
                      <MaterialIcons name={cfg.icon as any} size={9} color="#FFF" />
                      <Text style={s.tierBadgeText}>{fr ? cfg.label : cfg.labelEn}</Text>
                    </View>
                    {!item.is_active ? <View style={s.inactiveBadge}><Text style={s.inactiveBadgeText}>{fr ? 'INACTIF' : 'INACTIVE'}</Text></View> : null}
                    {item.expires_at ? (() => {
                      const daysLeft = Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                      const isExpired = daysLeft <= 0;
                      const isWarning = daysLeft > 0 && daysLeft <= 30;
                      return (
                        <View style={[s.expiryBadge, { backgroundColor: isExpired ? theme.error + '12' : isWarning ? '#F59E0B12' : theme.success + '12' }]}>
                          <MaterialIcons name={isExpired ? 'error' : 'schedule'} size={9} color={isExpired ? theme.error : isWarning ? '#F59E0B' : theme.success} />
                          <Text style={[s.expiryBadgeText, { color: isExpired ? theme.error : isWarning ? '#F59E0B' : theme.success }]}>
                            {isExpired ? (fr ? 'Expire' : 'Expired') : `${daysLeft}j`}
                          </Text>
                        </View>
                      );
                    })() : null}
                  </View>
                  {item.bio ? <Text style={s.cardBio} numberOfLines={1}>{item.bio}</Text> : null}
                </View>
                <View style={s.cardActions}>
                  <Pressable style={[s.cardEditBtn, { backgroundColor: '#F59E0B12' }]} onPress={() => openGoals(item)}>
                    <MaterialIcons name="flag" size={16} color="#F59E0B" />
                  </Pressable>
                  <Pressable style={[s.cardEditBtn, { backgroundColor: theme.success + '12' }]} onPress={() => openRenew(item)}>
                    <MaterialIcons name="autorenew" size={16} color={theme.success} />
                  </Pressable>
                  <Pressable style={[s.cardEditBtn, { backgroundColor: '#2563EB12' }]} onPress={() => openAssignSponsor(item)}>
                    <MaterialIcons name="link" size={16} color="#2563EB" />
                  </Pressable>
                  <Pressable style={s.cardEditBtn} onPress={() => openEdit(item)}>
                    <MaterialIcons name="edit" size={16} color={theme.primary} />
                  </Pressable>
                </View>
              </View>
              {/* Quick tier change */}
              <View style={s.quickTierRow}>
                {(['partner', 'sponsor', 'gold_sponsor'] as PartnerTier[]).map(tier => {
                  const tc = TIER_CONFIG[tier];
                  const isActive = item.badge_type === tier;
                  return (
                    <Pressable
                      key={tier}
                      style={[s.quickTierBtn, isActive && { backgroundColor: tc.color, borderColor: tc.color }]}
                      onPress={() => { if (!isActive) handleChangeTier(item, tier); }}
                    >
                      <MaterialIcons name={tc.icon as any} size={12} color={isActive ? '#FFF' : tc.color} />
                      <Text style={[s.quickTierText, isActive && { color: '#FFF' }]}>{fr ? tc.label : tc.labelEn}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[s.toggleBtn, { backgroundColor: '#6366F112' }]}
                  onPress={() => loadRenewalHistory(item.id)}
                >
                  <MaterialIcons name="history" size={16} color="#6366F1" />
                </Pressable>
                <Pressable
                  style={[s.toggleBtn, { backgroundColor: item.is_active ? theme.error + '12' : theme.success + '12' }]}
                  onPress={() => handleToggleActive(item)}
                >
                  <MaterialIcons name={item.is_active ? 'visibility-off' : 'visibility'} size={16} color={item.is_active ? theme.error : theme.success} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Goals Modal */}
      <Modal visible={showGoalsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGoalsModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowGoalsModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Objectifs KPI' : 'KPI Goals'}</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
            {goalsItem ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="flag" size={20} color="#F59E0B" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary, flex: 1 }}>{goalsItem.display_name}</Text>
              </View>
            ) : null}

            {/* Add new goal */}
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.3, marginBottom: 12 }}>{fr ? 'AJOUTER UN OBJECTIF' : 'ADD A GOAL'}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{fr ? 'Metrique' : 'Metric'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {GOAL_TYPES.map(gt => {
                  const active = goalType === gt.id;
                  return (
                    <Pressable key={gt.id} style={[s.tierSelectBtn, { flex: undefined, paddingHorizontal: 14 }, active && { backgroundColor: gt.color, borderColor: gt.color }]} onPress={() => setGoalType(gt.id)}>
                      <MaterialIcons name={gt.icon as any} size={14} color={active ? '#FFF' : gt.color} />
                      <Text style={[s.tierSelectText, active && { color: '#FFF' }]}>{gt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{fr ? 'Periode' : 'Period'}</Text>
              <View style={s.tierSelectRow}>
                {(['monthly', 'quarterly', 'yearly'] as const).map(p => {
                  const active = goalPeriod === p;
                  const label = p === 'monthly' ? (fr ? 'Mensuel' : 'Monthly') : p === 'quarterly' ? (fr ? 'Trimestriel' : 'Quarterly') : (fr ? 'Annuel' : 'Yearly');
                  return (
                    <Pressable key={p} style={[s.tierSelectBtn, active && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setGoalPeriod(p)}>
                      <Text style={[s.tierSelectText, active && { color: '#FFF' }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6, marginTop: 12 }}>{fr ? 'Valeur cible' : 'Target value'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.formInput, { flex: 1 }]} value={goalTarget} onChangeText={setGoalTarget} keyboardType="decimal-pad" placeholder={goalType === 'conversion_rate' ? '5.0' : '500'} placeholderTextColor={theme.textMuted} />
                <Pressable style={[s.saveBtn, savingGoal && { opacity: 0.5 }]} onPress={handleSaveGoal} disabled={savingGoal || !goalTarget.trim()}>
                  {savingGoal ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="add" size={20} color="#FFF" />}
                </Pressable>
              </View>
            </View>

            {/* Existing goals list */}
            {loadingGoals ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
            ) : goals.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="flag" size={40} color={theme.textMuted} />
                <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 8 }}>{fr ? 'Aucun objectif defini' : 'No goals set'}</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.3 }}>{fr ? 'OBJECTIFS ACTIFS' : 'ACTIVE GOALS'} ({goals.length})</Text>
                {goals.map(g => {
                  const gt = GOAL_TYPES.find(t => t.id === g.goal_type);
                  const periodLabel = g.period === 'monthly' ? (fr ? 'Mensuel' : 'Monthly') : g.period === 'quarterly' ? (fr ? 'Trimestriel' : 'Quarterly') : (fr ? 'Annuel' : 'Yearly');
                  return (
                    <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.border }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (gt?.color || theme.primary) + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={(gt?.icon || 'flag') as any} size={18} color={gt?.color || theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{gt?.label || g.goal_type}</Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{periodLabel} {fr ? 'cible' : 'target'}: <Text style={{ fontWeight: '800', color: gt?.color || theme.primary }}>{g.goal_type === 'conversion_rate' ? `${g.target_value}%` : g.target_value}</Text></Text>
                      </View>
                      <Pressable onPress={() => handleDeleteGoal(g.id)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.error + '10', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="delete-outline" size={16} color={theme.error} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEditModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowEditModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Modifier partenaire' : 'Edit Partner'}</Text>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSaveEdit} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.saveBtnText}>{fr ? 'Mettre a jour' : 'Update'}</Text>}
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Nom' : 'Name'}</Text>
              <TextInput style={s.formInput} value={editDisplayName} onChangeText={setEditDisplayName} />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>Bio</Text>
              <TextInput style={[s.formInput, { minHeight: 80 }]} value={editBio} onChangeText={setEditBio} multiline textAlignVertical="top" />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'URL photo' : 'Photo URL'}</Text>
              <TextInput style={s.formInput} value={editPhoto} onChangeText={setEditPhoto} autoCapitalize="none" />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Couleur de marque (hex)' : 'Brand color (hex)'}</Text>
              <TextInput style={s.formInput} value={editBrandColor} onChangeText={setEditBrandColor} placeholder="#F59E0B" placeholderTextColor={theme.textMuted} autoCapitalize="none" />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Niveau' : 'Tier'}</Text>
              <View style={s.tierSelectRow}>
                {(['partner', 'sponsor', 'gold_sponsor'] as PartnerTier[]).map(tier => {
                  const tc = TIER_CONFIG[tier];
                  const isActive = editTier === tier;
                  return (
                    <Pressable key={tier} style={[s.tierSelectBtn, isActive && { backgroundColor: tc.color, borderColor: tc.color }]} onPress={() => setEditTier(tier)}>
                      <MaterialIcons name={tc.icon as any} size={16} color={isActive ? '#FFF' : tc.color} />
                      <Text style={[s.tierSelectText, isActive && { color: '#FFF' }]}>{fr ? tc.label : tc.labelEn}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {/* Advantages for selected tier */}
            <View style={[s.advantagesPreview, { borderColor: TIER_CONFIG[editTier].color + '30' }]}>
              <Text style={[s.advantagesPreviewTitle, { color: TIER_CONFIG[editTier].color }]}>{fr ? 'Avantages' : 'Advantages'}</Text>
              {TIER_CONFIG[editTier].advantages.map((adv, i) => (
                <View key={i} style={s.advantageItem}>
                  <MaterialIcons name="check-circle" size={14} color={TIER_CONFIG[editTier].color} />
                  <Text style={s.advantageText}>{fr ? adv.fr : adv.en}</Text>
                </View>
              ))}
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Date d\'expiration (YYYY-MM-DD)' : 'Expiration date (YYYY-MM-DD)'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[s.formInput, { flex: 1 }]}
                  value={editExpiresAt}
                  onChangeText={setEditExpiresAt}
                  placeholder="2027-01-01"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                />
                {editExpiresAt ? (
                  <Pressable
                    style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: theme.error + '12', alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setEditExpiresAt('')}
                  >
                    <MaterialIcons name="close" size={18} color={theme.error} />
                  </Pressable>
                ) : null}
              </View>
              {editExpiresAt ? (() => {
                const d = new Date(editExpiresAt);
                const daysLeft = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                const isValid = !isNaN(d.getTime());
                return isValid ? (
                  <Text style={{ fontSize: 11, color: daysLeft <= 0 ? theme.error : daysLeft <= 30 ? '#F59E0B' : theme.success, marginTop: 4, fontWeight: '600' }}>
                    {daysLeft <= 0 ? (fr ? 'Deja expire' : 'Already expired') : `${daysLeft} ${fr ? 'jours restants' : 'days remaining'}`}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: theme.error, marginTop: 4, fontWeight: '600' }}>{fr ? 'Format invalide' : 'Invalid format'}</Text>
                );
              })() : (
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{fr ? 'Laisser vide pour aucune expiration' : 'Leave empty for no expiration'}</Text>
              )}
            </View>
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>{fr ? 'Actif' : 'Active'}</Text>
              <Switch value={editActive} onValueChange={setEditActive} trackColor={{ false: theme.border, true: theme.success + '60' }} thumbColor={editActive ? theme.success : theme.textMuted} />
            </View>
            <Pressable style={[s.formBottomSaveBtn, saving && { opacity: 0.5 }]} onPress={handleSaveEdit} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <MaterialIcons name="save" size={20} color="#FFF" />
                  <Text style={s.formBottomSaveBtnText}>{fr ? 'Enregistrer les modifications' : 'Save changes'}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Renew Modal */}
      <Modal visible={showRenewModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRenewModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowRenewModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Renouveler partenariat' : 'Renew Partnership'}</Text>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleRenew} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.saveBtnText}>{fr ? 'Renouveler' : 'Renew'}</Text>}
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
            {renewItem ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: TIER_CONFIG[(renewItem.badge_type as PartnerTier)]?.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name={TIER_CONFIG[(renewItem.badge_type as PartnerTier)]?.icon as any || 'workspace-premium'} size={24} color={TIER_CONFIG[(renewItem.badge_type as PartnerTier)]?.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>{renewItem.display_name}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                    {renewItem.expires_at ? `${fr ? 'Expire le' : 'Expires'} ${new Date(renewItem.expires_at).toLocaleDateString()}` : (fr ? 'Pas d\'expiration' : 'No expiration')}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Nouveau niveau' : 'New tier'}</Text>
              <View style={s.tierSelectRow}>
                {(['partner', 'sponsor', 'gold_sponsor'] as PartnerTier[]).map(tier => {
                  const tc = TIER_CONFIG[tier];
                  const isActive = renewTier === tier;
                  return (
                    <Pressable key={tier} style={[s.tierSelectBtn, isActive && { backgroundColor: tc.color, borderColor: tc.color }]} onPress={() => setRenewTier(tier)}>
                      <MaterialIcons name={tc.icon as any} size={16} color={isActive ? '#FFF' : tc.color} />
                      <Text style={[s.tierSelectText, isActive && { color: '#FFF' }]}>{fr ? tc.label : tc.labelEn}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Duree du renouvellement' : 'Renewal duration'}</Text>
              <View style={s.tierSelectRow}>
                {(['3', '6', '12'] as const).map(d => {
                  const isActive = renewDuration === d;
                  return (
                    <Pressable key={d} style={[s.tierSelectBtn, isActive && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setRenewDuration(d)}>
                      <Text style={[s.tierSelectText, isActive && { color: '#FFF' }]}>{d} {fr ? 'mois' : 'months'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Cout mensuel (EUR)' : 'Monthly cost (EUR)'}</Text>
              <TextInput style={s.formInput} value={renewMonthlyCost} onChangeText={setRenewMonthlyCost} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.textMuted} />
              {renewMonthlyCost ? (
                <Text style={{ fontSize: 11, color: theme.success, marginTop: 4, fontWeight: '600' }}>
                  {fr ? 'Total renouvellement' : 'Total renewal'}: {(parseFloat(renewMonthlyCost) * parseInt(renewDuration)).toFixed(2)} EUR
                </Text>
              ) : null}
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Notes' : 'Notes'}</Text>
              <TextInput style={[s.formInput, { minHeight: 60 }]} value={renewNotes} onChangeText={setRenewNotes} multiline textAlignVertical="top" placeholder={fr ? 'Raison du renouvellement...' : 'Renewal reason...'} placeholderTextColor={theme.textMuted} />
            </View>

            {/* Preview */}
            <View style={{ backgroundColor: theme.success + '08', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: theme.success + '25' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialIcons name="check-circle" size={18} color={theme.success} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.success }}>{fr ? 'Apercu du renouvellement' : 'Renewal preview'}</Text>
              </View>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                {fr ? 'Niveau' : 'Tier'}: {fr ? TIER_CONFIG[renewTier].label : TIER_CONFIG[renewTier].labelEn}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {fr ? 'Nouvelle expiration' : 'New expiration'}: {(() => {
                  const months = parseInt(renewDuration);
                  const now = new Date();
                  const currentExpiry = renewItem?.expires_at ? new Date(renewItem.expires_at) : now;
                  const startDate = currentExpiry > now ? currentExpiry : now;
                  const newExpiry = new Date(startDate);
                  newExpiry.setMonth(newExpiry.getMonth() + months);
                  return newExpiry.toLocaleDateString();
                })()}
              </Text>
              {renewMonthlyCost ? (
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                  {fr ? 'Investissement total' : 'Total investment'}: {((parseFloat(renewItem?.total_invested) || 0) + parseFloat(renewMonthlyCost) * parseInt(renewDuration)).toFixed(2)} EUR
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Renewal History Modal */}
      <Modal visible={showHistoryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistoryModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowHistoryModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Historique renouvellements' : 'Renewal History'}</Text>
            <View style={{ width: 60 }} />
          </View>
          {loadingHistory ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
          ) : renewalHistory.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="history" size={48} color={theme.textMuted} />
              <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 12 }}>{fr ? 'Aucun renouvellement' : 'No renewals'}</Text>
            </View>
          ) : (
            <FlatList
              data={renewalHistory}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: h }) => (
                <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>{new Date(h.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    {h.previous_tier !== h.new_tier ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ backgroundColor: (TIER_CONFIG[h.previous_tier as PartnerTier]?.color || '#999') + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: TIER_CONFIG[h.previous_tier as PartnerTier]?.color || '#999' }}>{fr ? TIER_CONFIG[h.previous_tier as PartnerTier]?.label : TIER_CONFIG[h.previous_tier as PartnerTier]?.labelEn}</Text>
                        </View>
                        <MaterialIcons name="arrow-forward" size={12} color={theme.textMuted} />
                        <View style={{ backgroundColor: (TIER_CONFIG[h.new_tier as PartnerTier]?.color || '#999') + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: TIER_CONFIG[h.new_tier as PartnerTier]?.color || '#999' }}>{fr ? TIER_CONFIG[h.new_tier as PartnerTier]?.label : TIER_CONFIG[h.new_tier as PartnerTier]?.labelEn}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {h.previous_expires_at ? (
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{new Date(h.previous_expires_at).toLocaleDateString()}</Text>
                    ) : <Text style={{ fontSize: 11, color: theme.textMuted }}>{fr ? 'Aucune' : 'None'}</Text>}
                    <MaterialIcons name="arrow-forward" size={12} color={theme.success} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.success }}>{new Date(h.new_expires_at).toLocaleDateString()}</Text>
                  </View>
                  {h.notes ? <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6, fontStyle: 'italic' }}>{h.notes}</Text> : null}
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Sponsor Assignment Modal */}
      <Modal visible={showAssignModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAssignModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowAssignModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Associer un sponsor' : 'Assign Sponsor'}</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Partner info */}
            {assignPartnerId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#2563EB15', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="handshake" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>{assignPartnerName}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{fr ? 'Associer a des terrains, clubs, tournois ou joueurs' : 'Link to terrains, clubs, tournaments or players'}</Text>
                </View>
                <Pressable
                  style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 }, bulkMode ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => { Haptics.selectionAsync(); setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: bulkMode ? '#FFF' : theme.textSecondary }}>{fr ? 'Selection multiple' : 'Multi-select'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Assignment History Toggle */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <Pressable style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 }, !showAssignHistory ? { backgroundColor: '#2563EB', borderColor: '#2563EB' } : { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowAssignHistory(false)}>
                <MaterialIcons name="link" size={16} color={!showAssignHistory ? '#FFF' : theme.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: !showAssignHistory ? '#FFF' : theme.textSecondary }}>{fr ? 'Items' : 'Items'}</Text>
              </Pressable>
              <Pressable style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 }, showAssignHistory ? { backgroundColor: '#6366F1', borderColor: '#6366F1' } : { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={async () => { setShowAssignHistory(true); if (assignPartnerId) { const { data } = await supabase.from('ambassador_analytics').select('created_at, source_page').eq('ambassador_id', assignPartnerId).eq('event_type', 'sponsor_assign').order('created_at', { ascending: false }).limit(30); setAssignHistory(data || []); } }}>
                <MaterialIcons name="history" size={16} color={showAssignHistory ? '#FFF' : theme.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: showAssignHistory ? '#FFF' : theme.textSecondary }}>{fr ? 'Historique' : 'History'}</Text>
              </Pressable>
            </View>

            {/* Assignment History */}
            {showAssignHistory ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {fr ? 'HISTORIQUE DES ASSIGNATIONS' : 'ASSIGNMENT HISTORY'} ({assignHistory.length})
                </Text>
                {assignHistory.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}>
                    <MaterialIcons name="history" size={32} color={theme.textMuted} />
                    <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>{fr ? 'Aucun historique' : 'No history'}</Text>
                  </View>
                ) : assignHistory.map((h: any, i: number) => {
                  const parts = (h.source_page || '').split('|');
                  const hTable = parts[0] || '';
                  const hName = parts[2] || '';
                  const hAction = parts[3] || 'assign';
                  const isAssign = hAction === 'assign';
                  const hIcon = hTable === 'terrains' ? 'sports-soccer' : hTable === 'clubs' ? 'home' : hTable === 'players' ? 'person' : 'emoji-events';
                  const hColor = isAssign ? theme.success : theme.error;
                  return (
                    <View key={h.created_at + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: hColor + '20' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: hColor + '12', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={isAssign ? 'link' : 'link-off'} size={16} color={hColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialIcons name={hIcon as any} size={12} color={theme.textMuted} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{hName || hTable}</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                          {new Date(h.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: hColor + '12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: hColor }}>{isAssign ? (fr ? 'LIE' : 'LINKED') : (fr ? 'DELIE' : 'UNLINKED')}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Currently assigned items */}
            {!showAssignHistory ? <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {fr ? 'ITEMS SPONSORISES' : 'SPONSORED ITEMS'} ({assignedItems.length})
              </Text>
              {loadingAssigned ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ paddingVertical: 16 }} />
              ) : assignedItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}>
                  <MaterialIcons name="link-off" size={32} color={theme.textMuted} />
                  <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>{fr ? 'Aucun item associe' : 'No items assigned'}</Text>
                </View>
              ) : (
                assignedItems.map((ai: any) => (
                  <View key={`${ai._table}-${ai.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: ai._color + '25' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: ai._color + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={ai._icon} size={18} color={ai._color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{ai.name}</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>{ai.city || (ai.date ? new Date(ai.date).toLocaleDateString() : ai._table)}</Text>
                    </View>
                    <Pressable
                      style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.error + '10', alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => handleUnassignItem(ai.id, ai._table)}
                      disabled={assignSaving === ai.id}
                    >
                      {assignSaving === ai.id ? <ActivityIndicator size="small" color={theme.error} /> : <MaterialIcons name="link-off" size={16} color={theme.error} />}
                    </Pressable>
                  </View>
                ))
              )}
            </View> : null}

            {/* Item type selector + Bulk assign + Search */}
            {!showAssignHistory ? (
              <>
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {fr ? 'AJOUTER UNE ASSOCIATION' : 'ADD ASSOCIATION'}
                  </Text>
                  <View style={[s.tierSelectRow, { flexWrap: 'wrap' }]}>
                    {([{ id: 'terrains' as const, label: fr ? 'Terrains' : 'Terrains', icon: 'sports-soccer', color: theme.success }, { id: 'clubs' as const, label: 'Clubs', icon: 'home', color: theme.accent }, { id: 'tournaments' as const, label: fr ? 'Tournois' : 'Tournaments', icon: 'emoji-events', color: theme.carreauColor }, { id: 'players' as const, label: fr ? 'Joueurs' : 'Players', icon: 'person', color: theme.primary }] as const).map(item => {
                      const isActive = assignItemType === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          style={[s.tierSelectBtn, isActive && { backgroundColor: item.color, borderColor: item.color }]}
                          onPress={() => { setAssignItemType(item.id); setAssignSearchQuery(''); setAssignSearchResults([]); }}
                        >
                          <MaterialIcons name={item.icon as any} size={14} color={isActive ? '#FFF' : item.color} />
                          <Text style={[s.tierSelectText, isActive && { color: '#FFF' }]}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Bulk assign button */}
                {bulkMode && bulkSelected.size > 0 ? (
                  <Pressable
                    style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 12, marginBottom: 12 }, bulkSaving && { opacity: 0.6 }]}
                    onPress={async () => {
                      if (!assignPartnerId || bulkSelected.size === 0) return;
                      setBulkSaving(true);
                      for (const itemId of bulkSelected) {
                        await supabase.from(assignItemType).update({ sponsor_id: assignPartnerId }).eq('id', itemId);
                      }
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      const icon = assignItemType === 'terrains' ? 'sports-soccer' : assignItemType === 'clubs' ? 'home' : assignItemType === 'tournaments' ? 'emoji-events' : 'person';
                      const color = assignItemType === 'terrains' ? theme.success : assignItemType === 'clubs' ? theme.accent : assignItemType === 'tournaments' ? theme.carreauColor : theme.primary;
                      const newAssigned = assignSearchResults.filter(r => bulkSelected.has(r.id)).map(r => ({ ...r, _table: assignItemType, _icon: icon, _color: color }));
                      setAssignedItems(prev => [...prev, ...newAssigned]);
                      setAssignSearchResults(prev => prev.map(r => bulkSelected.has(r.id) ? { ...r, sponsor_id: assignPartnerId } : r));
                      setBulkSelected(new Set());
                      setBulkSaving(false);
                    }}
                    disabled={bulkSaving}
                  >
                    {bulkSaving ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <>
                        <MaterialIcons name="link" size={16} color="#FFF" />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{fr ? `Associer ${bulkSelected.size} item(s)` : `Link ${bulkSelected.size} item(s)`}</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}

                {/* Search items */}
                <View style={s.searchRow}>
                  <MaterialIcons name="search" size={18} color={theme.textMuted} />
                  <TextInput
                    style={s.searchInput}
                    value={assignSearchQuery}
                    onChangeText={handleAssignSearch}
                    placeholder={fr ? `Rechercher un ${assignItemType === 'terrains' ? 'terrain' : assignItemType === 'clubs' ? 'club' : assignItemType === 'players' ? 'joueur' : 'tournoi'}...` : `Search ${assignItemType === 'tournaments' ? 'tournament' : assignItemType === 'players' ? 'player' : assignItemType}...`}
                    placeholderTextColor={theme.textMuted}
                  />
                  {assignSearching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                </View>
              </>
            ) : null}

            {/* Search results */}
            {!showAssignHistory && assignSearchResults.length > 0 ? (
              <View style={{ gap: 6 }}>
                {assignSearchResults.map((item: any) => {
                  const isAlreadyAssigned = item.sponsor_id === assignPartnerId;
                  const isAssignedToOther = item.sponsor_id && item.sponsor_id !== assignPartnerId;
                  const typeColor = assignItemType === 'terrains' ? theme.success : assignItemType === 'clubs' ? theme.accent : theme.carreauColor;
                  return (
                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isAlreadyAssigned ? typeColor + '08' : theme.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isAlreadyAssigned ? typeColor + '30' : theme.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{item.city || (item.date ? new Date(item.date).toLocaleDateString() : '')}</Text>
                      </View>
                      {isAlreadyAssigned ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: typeColor + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                          <MaterialIcons name="check-circle" size={14} color={typeColor} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: typeColor }}>{fr ? 'Associe' : 'Linked'}</Text>
                        </View>
                      ) : isAssignedToOther ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                          <MaterialIcons name="warning" size={14} color="#F59E0B" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>{fr ? 'Autre sponsor' : 'Other sponsor'}</Text>
                        </View>
                      ) : bulkMode ? (
                        <Pressable
                          style={[{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 }, bulkSelected.has(item.id) ? { backgroundColor: '#2563EB', borderColor: '#2563EB' } : { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => { Haptics.selectionAsync(); setBulkSelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; }); }}
                        >
                          {bulkSelected.has(item.id) ? <MaterialIcons name="check" size={18} color="#FFF" /> : null}
                        </Pressable>
                      ) : (
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
                          onPress={() => handleAssignItem(item.id, item.name)}
                          disabled={assignSaving === item.id}
                        >
                          {assignSaving === item.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                            <>
                              <MaterialIcons name="link" size={14} color="#FFF" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{fr ? 'Associer' : 'Link'}</Text>
                            </>
                          )}
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : !showAssignHistory && assignSearchQuery.trim().length >= 2 && !assignSearching ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <MaterialIcons name="search-off" size={32} color={theme.textMuted} />
                <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>{fr ? 'Aucun resultat' : 'No results'}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setShowCreateModal(false)}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            <Text style={s.modalTitle}>{fr ? 'Nouveau partenaire' : 'New Partner'}</Text>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.saveBtnText}>{fr ? 'Creer' : 'Create'}</Text>}
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* User search */}
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Rechercher un utilisateur' : 'Search user'}</Text>
              <View style={s.searchRow}>
                <MaterialIcons name="search" size={18} color={theme.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={userSearchQuery}
                  onChangeText={(v) => { setUserSearchQuery(v); searchUsers(v); }}
                  placeholder={fr ? 'Email ou nom...' : 'Email or name...'}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                />
                {searchingUsers ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              </View>
              {userSearchResults.map(u => (
                <Pressable
                  key={u.id}
                  style={[s.userResult, createUserId === u.id && { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCreateUserId(u.id);
                    if (!createDisplayName && u.username) setCreateDisplayName(u.username);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.userResultName}>{u.username || u.email}</Text>
                    <Text style={s.userResultEmail}>{u.email}</Text>
                  </View>
                  {createUserId === u.id ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
                </Pressable>
              ))}
            </View>
            {createUserId ? (
              <View style={s.selectedUser}>
                <MaterialIcons name="person" size={16} color={theme.success} />
                <Text style={s.selectedUserText}>{createUserId.slice(0, 8)}...</Text>
              </View>
            ) : null}
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Nom affiche *' : 'Display name *'}</Text>
              <TextInput style={s.formInput} value={createDisplayName} onChangeText={setCreateDisplayName} placeholder={fr ? 'Nom du partenaire' : 'Partner name'} placeholderTextColor={theme.textMuted} />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'Niveau' : 'Tier'}</Text>
              <View style={s.tierSelectRow}>
                {(['partner', 'sponsor', 'gold_sponsor'] as PartnerTier[]).map(tier => {
                  const tc = TIER_CONFIG[tier];
                  const isActive = createTier === tier;
                  return (
                    <Pressable key={tier} style={[s.tierSelectBtn, isActive && { backgroundColor: tc.color, borderColor: tc.color }]} onPress={() => setCreateTier(tier)}>
                      <MaterialIcons name={tc.icon as any} size={16} color={isActive ? '#FFF' : tc.color} />
                      <Text style={[s.tierSelectText, isActive && { color: '#FFF' }]}>{fr ? tc.label : tc.labelEn}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>Bio</Text>
              <TextInput style={[s.formInput, { minHeight: 80 }]} value={createBio} onChangeText={setCreateBio} multiline textAlignVertical="top" placeholder="Description..." placeholderTextColor={theme.textMuted} />
            </View>
            <View style={s.formField}>
              <Text style={s.formLabel}>{fr ? 'URL photo' : 'Photo URL'}</Text>
              <TextInput style={s.formInput} value={createPhoto} onChangeText={setCreatePhoto} placeholder="https://..." placeholderTextColor={theme.textMuted} autoCapitalize="none" />
            </View>
            <Pressable style={[s.formBottomSaveBtn, saving && { opacity: 0.5 }]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <MaterialIcons name="save" size={20} color="#FFF" />
                  <Text style={s.formBottomSaveBtnText}>{fr ? 'Creer' : 'Create'}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
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
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  filterChipText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
  filterChipCount: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, minWidth: 28, alignItems: 'center' as any },
  filterChipCountText: { fontSize: 12, fontWeight: '800', color: theme.textSecondary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  advantagesCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: theme.surface, borderRadius: 16, padding: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  advantagesTitle: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 14 },
  advantageTier: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  advantageTierIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  advantageTierLabel: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  advantageItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  advantageText: { fontSize: 12, color: theme.textSecondary },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },
  partnerCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 10, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardAvatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  cardTags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tierBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
  inactiveBadge: { backgroundColor: theme.error + '12', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  inactiveBadgeText: { fontSize: 9, fontWeight: '700', color: theme.error },
  cardBio: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 6 },
  cardEditBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  quickTierRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  quickTierBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  quickTierText: { fontSize: 11, fontWeight: '700', color: theme.textSecondary },
  toggleBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: 10 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  formBottomSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: theme.borderRadius.md, marginTop: 8 },
  formBottomSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  formField: { gap: 6 },
  formLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 0.3 },
  formInput: { backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  tierSelectRow: { flexDirection: 'row', gap: 8 },
  tierSelectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  tierSelectText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  advantagesPreview: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, gap: 6 },
  advantagesPreviewTitle: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.border },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  userResult: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surface, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  userResultName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  userResultEmail: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  selectedUser: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.success + '10', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.success + '25' },
  selectedUserText: { fontSize: 13, fontWeight: '600', color: theme.success },
  expiryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  expiryBadgeText: { fontSize: 9, fontWeight: '700' },
});
