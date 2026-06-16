/**
 * Admin Terrain Management Page
 *
 * Allows admins to:
 * - View all terrains (public + private)
 * - Search and filter terrains
 * - Edit terrain info (name, city, type, visibility)
 * - Delete duplicate or invalid terrains
 * - View stats dashboard (types, cities, facilities)
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
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import {
  getAllTerrains,
  adminUpdateTerrain,
  adminDeleteTerrain,
  getTerrainStats,
  detectDuplicateTerrains,
  mergeTerrains,
  getMergePreview,
  pickBestTerrain,
  AdminTerrain,
  DuplicateGroup,
} from '@/services/adminTerrainService';
import { logAdminAction } from '@/services/adminActivityLogService';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { TerrainsSkeleton } from '@/components/ui/AdminSkeleton';

type FilterKey = 'all' | 'public' | 'private' | 'lighting' | 'covered';

const FILTERS: { key: FilterKey; icon: string; color: string; labelFr: string; labelEn: string }[] = [
  { key: 'all', icon: 'list', color: '#64748B', labelFr: 'Tout', labelEn: 'All' },
  { key: 'public', icon: 'public', color: '#10B981', labelFr: 'Publics', labelEn: 'Public' },
  { key: 'private', icon: 'lock', color: '#D97706', labelFr: 'Prives', labelEn: 'Private' },
  { key: 'lighting', icon: 'lightbulb', color: '#F59E0B', labelFr: 'Eclaires', labelEn: 'Lit' },
  { key: 'covered', icon: 'roofing', color: '#2563EB', labelFr: 'Couverts', labelEn: 'Covered' },
];

const TYPE_COLORS: Record<string, string> = {
  'Graviers': '#8B5CF6',
  'Sable': '#F59E0B',
  'Terre battue': '#D97706',
  'Gazon': '#10B981',
  'Bitume': '#64748B',
  'Mixte': '#2563EB',
};

export default function AdminTerrainsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [terrains, setTerrains] = useState<AdminTerrain[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  // Batch selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Edit modal
  const [editTerrain, setEditTerrain] = useState<AdminTerrain | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editType, setEditType] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [editLighting, setEditLighting] = useState(false);
  const [editCovered, setEditCovered] = useState(false);
  const [editCourts, setEditCourts] = useState('1');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Duplicates
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [terrainsResult, statsResult] = await Promise.all([
        getAllTerrains(200),
        getTerrainStats(),
      ]);
      setTerrains(terrainsResult.terrains);
      setStats(statsResult);
      // Detect duplicates
      const dupes = detectDuplicateTerrains(terrainsResult.terrains);
      setDuplicates(dupes);
    } catch (e) {
      console.log('Error loading terrain data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredTerrains = useMemo(() => {
    let items = terrains;
    if (filter === 'public') items = items.filter(t => t.isPublic);
    else if (filter === 'private') items = items.filter(t => !t.isPublic);
    else if (filter === 'lighting') items = items.filter(t => t.lighting);
    else if (filter === 'covered') items = items.filter(t => t.covered);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter(t =>
        t.name.toLowerCase().includes(s) ||
        t.city.toLowerCase().includes(s) ||
        t.type.toLowerCase().includes(s) ||
        t.ownerName?.toLowerCase().includes(s) ||
        t.address?.toLowerCase().includes(s)
      );
    }
    return items;
  }, [terrains, filter, search]);

  const openEdit = useCallback((terrain: AdminTerrain) => {
    Haptics.selectionAsync();
    setEditTerrain(terrain);
    setEditName(terrain.name);
    setEditCity(terrain.city);
    setEditType(terrain.type);
    setEditPublic(terrain.isPublic);
    setEditLighting(terrain.lighting);
    setEditCovered(terrain.covered);
    setEditCourts(String(terrain.courtsCount));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editTerrain || !editName.trim() || !editCity.trim()) return;
    setEditSubmitting(true);
    const { error } = await adminUpdateTerrain(editTerrain.id, {
      name: editName.trim(),
      city: editCity.trim(),
      type: editType,
      is_public: editPublic,
      lighting: editLighting,
      covered: editCovered,
      courts_count: parseInt(editCourts, 10) || 1,
    });
    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTerrains(prev => prev.map(t => t.id === editTerrain.id ? {
        ...t,
        name: editName.trim(),
        city: editCity.trim(),
        type: editType,
        isPublic: editPublic,
        lighting: editLighting,
        covered: editCovered,
        courtsCount: parseInt(editCourts, 10) || 1,
      } : t));
      setEditTerrain(null);
      logAdminAction({ actionType: 'terrain_edit', targetType: 'terrain', targetId: editTerrain.id, targetName: editName.trim(), actionDetail: `${editCity.trim()} - ${editType}` });
    }
    setEditSubmitting(false);
  }, [editTerrain, editName, editCity, editType, editPublic, editLighting, editCovered, editCourts, fr, showAlert]);

  const handleDelete = useCallback((terrain: AdminTerrain) => {
    Alert.alert(
      fr ? 'Supprimer ce terrain ?' : 'Delete this terrain?',
      `${terrain.name} - ${terrain.city}\n${fr ? 'Cette action est irreversible.' : 'This action is irreversible.'}`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Supprimer' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await adminDeleteTerrain(terrain.id);
            if (error) showAlert(fr ? 'Erreur' : 'Error', error);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTerrains(prev => prev.filter(t => t.id !== terrain.id));
              logAdminAction({ actionType: 'terrain_delete', targetType: 'terrain', targetId: terrain.id, targetName: terrain.name, actionDetail: `${terrain.city} - ${terrain.type}` });
            }
          },
        },
      ]
    );
  }, [fr, showAlert]);

  // Merge preview state
  const [mergePreview, setMergePreview] = useState<{ matches: number; challenges: number; tournaments: number; meetups: number; clubs: number; players: number; events: number } | null>(null);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);
  const [mergeKeepId, setMergeKeepId] = useState<string | null>(null);
  const [mergeDeleteId, setMergeDeleteId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [merging, setMerging] = useState(false);

  const handleMergeDuplicates = useCallback(async (group: DuplicateGroup) => {
    if (group.terrains.length < 2) return;
    const a = group.terrains[0];
    const b = group.terrains[1];
    const { keepId, deleteId } = pickBestTerrain(a, b);
    setMergeGroup(group);
    setMergeKeepId(keepId);
    setMergeDeleteId(deleteId);
    setShowMergeModal(true);
    setLoadingPreview(true);
    const { preview } = await getMergePreview(keepId, deleteId);
    setMergePreview(preview);
    setLoadingPreview(false);
  }, []);

  const executeMerge = useCallback(async () => {
    if (!mergeKeepId || !mergeDeleteId || !mergeGroup) return;
    setMerging(true);
    const keepTerrain = mergeGroup.terrains.find(t => t.id === mergeKeepId)!;
    const deleteTerrain = mergeGroup.terrains.find(t => t.id === mergeDeleteId)!;
    const { error } = await mergeTerrains(mergeKeepId, mergeDeleteId);
    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTerrains(prev => prev.filter(t => t.id !== mergeDeleteId));
      setDuplicates(prev => prev.filter(g => g !== mergeGroup));
      showAlert(fr ? 'Fusion reussie' : 'Merge successful', fr ? `${deleteTerrain.name} a ete fusionne dans ${keepTerrain.name}` : `${deleteTerrain.name} merged into ${keepTerrain.name}`);
      logAdminAction({ actionType: 'terrain_merge', targetType: 'terrain', targetId: mergeKeepId, targetName: keepTerrain.name, actionDetail: `Merged ${deleteTerrain.name} into ${keepTerrain.name}`, metadata: { deletedId: mergeDeleteId, deletedName: deleteTerrain.name, preview: mergePreview } });
    }
    setMerging(false);
    setShowMergeModal(false);
    setMergePreview(null);
    setMergeGroup(null);
  }, [mergeKeepId, mergeDeleteId, mergeGroup, mergePreview, fr, showAlert]);

  const handleTogglePublic = useCallback(async (terrain: AdminTerrain) => {
    Haptics.selectionAsync();
    const newPublic = !terrain.isPublic;
    const { error } = await adminUpdateTerrain(terrain.id, { is_public: newPublic });
    if (error) showAlert(fr ? 'Erreur' : 'Error', error);
    else setTerrains(prev => prev.map(t => t.id === terrain.id ? { ...t, isPublic: newPublic } : t));
  }, [fr, showAlert]);

  const toggleSelection = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      fr ? `Supprimer ${count} terrain(s) ?` : `Delete ${count} terrain(s)?`,
      fr ? 'Cette action est irreversible.' : 'This action is irreversible.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => {
          setBulkProcessing(true);
          const ids = [...selectedIds];
          let deleted = 0;
          for (const id of ids) {
            const { error } = await adminDeleteTerrain(id);
            if (!error) deleted++;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTerrains(prev => prev.filter(t => !ids.includes(t.id)));
          logAdminAction({ actionType: 'terrain_delete', actionDetail: `Bulk deleted ${deleted} terrains`, metadata: { terrainIds: ids, count: deleted } });
          setSelectedIds(new Set());
          setSelectionMode(false);
          setBulkProcessing(false);
        }},
      ]
    );
  }, [selectedIds, fr]);

  const handleBulkTogglePublic = useCallback(async (makePublic: boolean) => {
    const count = selectedIds.size;
    if (count === 0) return;
    setBulkProcessing(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      await adminUpdateTerrain(id, { is_public: makePublic });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTerrains(prev => prev.map(t => ids.includes(t.id) ? { ...t, isPublic: makePublic } : t));
    logAdminAction({ actionType: 'terrain_visibility' as any, actionDetail: `Bulk ${makePublic ? 'public' : 'private'} ${count} terrains`, metadata: { terrainIds: ids, count, makePublic } });
    setSelectedIds(new Set());
    setSelectionMode(false);
    setBulkProcessing(false);
  }, [selectedIds]);

  const handleBulkExport = useCallback(async () => {
    const ids = [...selectedIds];
    const exportTerrains = filteredTerrains.filter(t => ids.includes(t.id));
    if (exportTerrains.length === 0) return;
    setBulkProcessing(true);
    try {
      const headers = 'Name,City,Type,Public,Lighting,Covered,Courts,Owner,Created';
      const rows = exportTerrains.map(t =>
        `"${t.name}","${t.city}","${t.type}",${t.isPublic},${t.lighting},${t.covered},${t.courtsCount},"${t.ownerName || ''}",${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}`
      );
      const csv = [headers, ...rows].join('\n');
      const filename = `terrains-export-${new Date().toISOString().slice(0, 10)}.csv`;
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const FileSystem = require('expo-file-system');
        const Sharing = require('expo-sharing');
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(path, { mimeType: 'text/csv' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.log('[AdminTerrains] Export error:', e); }
    setBulkProcessing(false);
  }, [selectedIds, filteredTerrains]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Terrains' : 'Terrains'}</Text>
        </View>
        <AdminQuickNav currentRoute="/admin-terrains" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <TerrainsSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="Terrains">
    <AdminGuard language={language} requiredPermission="terrains">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Gestion Terrains' : 'Terrain Management'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            style={[s.backBtn, { backgroundColor: '#EFF6FF' }]}
            onPress={async () => {
              if (filteredTerrains.length === 0) return;
              Haptics.selectionAsync();
              try {
                const headers = 'Name,City,Type,Public,Lighting,Covered,Courts,Owner,Created';
                const rows = filteredTerrains.map(t =>
                  `"${t.name}","${t.city}","${t.type}",${t.isPublic},${t.lighting},${t.covered},${t.courtsCount},"${t.ownerName || ''}",${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}`
                );
                const csv = [headers, ...rows].join('\n');
                const filename = `terrains-all-${new Date().toISOString().slice(0, 10)}.csv`;
                if (typeof document !== 'undefined') {
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                  URL.revokeObjectURL(url);
                } else {
                  const FS = require('expo-file-system');
                  const SH = require('expo-sharing');
                  const path = `${FS.cacheDirectory}${filename}`;
                  await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
                  const canShare = await SH.isAvailableAsync();
                  if (canShare) await SH.shareAsync(path, { mimeType: 'text/csv' });
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) { console.log('[AdminTerrains] Export all error:', e); }
            }}
          >
            <MaterialIcons name="file-download" size={20} color="#3B82F6" />
          </Pressable>
          <Pressable
            style={[s.backBtn, selectionMode && { backgroundColor: '#3B82F6' }]}
            onPress={() => { Haptics.selectionAsync(); setSelectionMode(!selectionMode); if (selectionMode) setSelectedIds(new Set()); }}
          >
            <MaterialIcons name={selectionMode ? 'close' : 'checklist'} size={20} color={selectionMode ? '#FFF' : '#64748B'} />
          </Pressable>
        </View>
      </View>

      <AdminQuickNav currentRoute="/admin-terrains" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Batch selection info */}
        {selectionMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#DBEAFE' }}>
            <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
            <Text style={{ flex: 1, fontSize: 12, color: '#3B82F6', fontWeight: '600' }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} ${fr ? 'selectionne(s)' : 'selected'}`
                : (fr ? 'Appuyez sur les terrains pour les selectionner' : 'Tap terrains to select them')}
            </Text>
            {filteredTerrains.length > 0 ? (
              <Pressable
                style={{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#3B82F6', borderRadius: 8 }}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (selectedIds.size === filteredTerrains.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(filteredTerrains.map(t => t.id)));
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFF' }}>
                  {selectedIds.size === filteredTerrains.length ? (fr ? 'Tout deselectionner' : 'Deselect all') : (fr ? 'Tout' : 'All')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Stats Dashboard */}
        {stats ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={s.statsGrid}>
              <View style={[s.statCard, { borderColor: '#10B98130' }]}>
                <View style={[s.statIcon, { backgroundColor: '#DCFCE7' }]}>
                  <MaterialIcons name="sports-soccer" size={18} color="#10B981" />
                </View>
                <Text style={[s.statValue, { color: '#10B981' }]}>{stats.total}</Text>
                <Text style={s.statLabel}>{fr ? 'Total' : 'Total'}</Text>
              </View>
              <View style={[s.statCard, { borderColor: '#2563EB30' }]}>
                <View style={[s.statIcon, { backgroundColor: '#DBEAFE' }]}>
                  <MaterialIcons name="public" size={18} color="#2563EB" />
                </View>
                <Text style={[s.statValue, { color: '#2563EB' }]}>{stats.public}</Text>
                <Text style={s.statLabel}>{fr ? 'Publics' : 'Public'}</Text>
              </View>
              <View style={[s.statCard, { borderColor: '#F59E0B30' }]}>
                <View style={[s.statIcon, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialIcons name="lightbulb" size={18} color="#F59E0B" />
                </View>
                <Text style={[s.statValue, { color: '#F59E0B' }]}>{stats.withLighting}</Text>
                <Text style={s.statLabel}>{fr ? 'Eclaires' : 'Lit'}</Text>
              </View>
              <View style={[s.statCard, { borderColor: '#7C3AED30' }]}>
                <View style={[s.statIcon, { backgroundColor: '#EDE9FE' }]}>
                  <MaterialIcons name="roofing" size={18} color="#7C3AED" />
                </View>
                <Text style={[s.statValue, { color: '#7C3AED' }]}>{stats.covered}</Text>
                <Text style={s.statLabel}>{fr ? 'Couverts' : 'Covered'}</Text>
              </View>
            </View>

            {/* Type distribution */}
            {Object.keys(stats.byType).length > 0 ? (
              <View style={s.distributionCard}>
                <Text style={s.distributionTitle}>{fr ? 'Par type de terrain' : 'By terrain type'}</Text>
                {Object.entries(stats.byType).sort((a: any, b: any) => b[1] - a[1]).map(([type, count]: any) => {
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                  const color = TYPE_COLORS[type] || '#64748B';
                  return (
                    <View key={type} style={s.distRow}>
                      <View style={s.distLabelRow}>
                        <View style={[s.distDot, { backgroundColor: color }]} />
                        <Text style={s.distLabel}>{type}</Text>
                        <Text style={s.distCount}>{count}</Text>
                      </View>
                      <View style={s.distBarBg}>
                        <View style={[s.distBarFill, { width: `${Math.max(4, pct)}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.distPct, { color }]}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Top cities */}
            {stats.byCity?.length > 0 ? (
              <View style={s.topCitiesCard}>
                <Text style={s.distributionTitle}>{fr ? 'Villes principales' : 'Top cities'}</Text>
                <View style={s.topCitiesGrid}>
                  {stats.byCity.slice(0, 6).map((c: any, idx: number) => (
                    <View key={c.city} style={s.topCityChip}>
                      <Text style={s.topCityRank}>#{idx + 1}</Text>
                      <Text style={s.topCityName} numberOfLines={1}>{c.city}</Text>
                      <View style={s.topCityCount}><Text style={s.topCityCountText}>{c.count}</Text></View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Duplicate Detection */}
        {duplicates.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(40)}>
            <Pressable
              style={s.dupeToggle}
              onPress={() => { setShowDuplicates(!showDuplicates); Haptics.selectionAsync(); }}
            >
              <View style={s.dupeToggleIcon}>
                <MaterialIcons name="content-copy" size={18} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.dupeToggleTitle}>
                  {fr ? `${duplicates.length} doublon(s) detecte(s)` : `${duplicates.length} duplicate(s) detected`}
                </Text>
                <Text style={s.dupeToggleDesc}>
                  {fr ? 'Terrains proches (<200m) avec noms similaires' : 'Nearby terrains (<200m) with similar names'}
                </Text>
              </View>
              <MaterialIcons name={showDuplicates ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showDuplicates ? (
              <View style={s.dupeList}>
                {duplicates.map((group, gIdx) => (
                  <View key={gIdx} style={s.dupeGroup}>
                    <View style={s.dupeGroupHeader}>
                      <MaterialIcons name="warning" size={14} color="#EF4444" />
                      <Text style={s.dupeGroupMeta}>
                        {group.distanceM}m {fr ? 'de distance' : 'apart'} {"•"} {Math.round(group.nameSimilarity * 100)}% {fr ? 'similaire' : 'similar'}
                      </Text>
                    </View>
                    {group.terrains.map((t, tIdx) => {
                      const best = group.terrains.length >= 2 ? pickBestTerrain(group.terrains[0], group.terrains[1]) : null;
                      const isKept = best && best.keepId === t.id;
                      return (
                        <View key={t.id} style={s.dupeItem}>
                          <View style={[s.dupeItemNum, isKept && { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[s.dupeItemNumText, isKept && { color: '#10B981' }]}>{isKept ? '✓' : String(tIdx + 1)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.dupeItemName}>{t.name}</Text>
                            <Text style={s.dupeItemCity}>{t.city} {"•"} {t.type}{isKept ? (fr ? ' (conserve)' : ' (kept)') : ''}</Text>
                          </View>
                          <Pressable
                            style={s.dupeDeleteBtn}
                            onPress={() => handleDelete(t)}
                            hitSlop={8}
                          >
                            <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                          </Pressable>
                        </View>
                      );
                    })}
                    {/* Merge button */}
                    {group.terrains.length >= 2 ? (
                      <View style={s.dupeMergeRow}>
                        <Pressable
                          style={s.dupeMergeBtn}
                          onPress={() => handleMergeDuplicates(group)}
                        >
                          <MaterialIcons name="merge-type" size={14} color="#7C3AED" />
                          <Text style={s.dupeMergeBtnText}>{fr ? 'Fusion auto' : 'Auto-merge'}</Text>
                        </Pressable>
                        <Pressable
                          style={[s.dupeMergeBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                          onPress={async () => {
                            Haptics.selectionAsync();
                            const best = pickBestTerrain(group.terrains[0], group.terrains[1]);
                            const swapped = best.keepId === group.terrains[0].id
                              ? { keepId: group.terrains[1].id, deleteId: group.terrains[0].id }
                              : { keepId: group.terrains[0].id, deleteId: group.terrains[1].id };
                            setMergeGroup(group);
                            setMergeKeepId(swapped.keepId);
                            setMergeDeleteId(swapped.deleteId);
                            setShowMergeModal(true);
                            setLoadingPreview(true);
                            const { preview } = await getMergePreview(swapped.keepId, swapped.deleteId);
                            setMergePreview(preview);
                            setLoadingPreview(false);
                          }}
                        >
                          <MaterialIcons name="swap-horiz" size={14} color="#D97706" />
                          <Text style={[s.dupeMergeBtnText, { color: '#D97706' }]}>{fr ? 'Inverser' : 'Swap'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Search */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)}>
          <View style={s.searchWrap}>
            <MaterialIcons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={fr ? 'Rechercher terrain, ville, type...' : 'Search terrain, city, type...'}
              placeholderTextColor="#94A3B8"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={16} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterBar}>
          {FILTERS.map(f => {
            const isActive = filter === f.key;
            const count = f.key === 'all' ? terrains.length
              : f.key === 'public' ? terrains.filter(t => t.isPublic).length
              : f.key === 'private' ? terrains.filter(t => !t.isPublic).length
              : f.key === 'lighting' ? terrains.filter(t => t.lighting).length
              : terrains.filter(t => t.covered).length;
            return (
              <Pressable
                key={f.key}
                style={[s.filterChip, isActive && { backgroundColor: f.color, borderColor: f.color }]}
                onPress={() => { Haptics.selectionAsync(); setFilter(f.key); }}
              >
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? '#FFF' : '#64748B'} />
                <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{fr ? f.labelFr : f.labelEn}</Text>
                <View style={[s.filterChipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.filterChipBadgeText, isActive && { color: '#FFF' }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Terrains list */}
        {filteredTerrains.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><MaterialIcons name={search || filter !== 'all' ? 'filter-list-off' : 'sports-soccer'} size={40} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{search || filter !== 'all' ? (fr ? 'Aucun resultat' : 'No results') : (fr ? 'Aucun terrain' : 'No terrains')}</Text>
          </View>
        ) : (
          filteredTerrains.map((terrain, idx) => {
            const typeColor = TYPE_COLORS[terrain.type] || '#64748B';
            const isSelected = selectedIds.has(terrain.id);
            return (
              <Animated.View key={terrain.id} entering={FadeInDown.duration(250).delay(idx * 20)}>
                <Pressable
                  style={[s.terrainCard, { borderLeftColor: typeColor }, isSelected && { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }]}
                  onPress={selectionMode ? () => toggleSelection(terrain.id) : undefined}
                >
                  <View style={s.terrainHeader}>
                    {selectionMode ? (
                      <View style={[{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: isSelected ? '#3B82F6' : '#CBD5E1', alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: isSelected ? '#3B82F6' : 'transparent' }]}>
                        {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                      </View>
                    ) : null}
                    <View style={[s.terrainTypeIcon, { backgroundColor: typeColor + '12' }]}>
                      <MaterialIcons name="sports-soccer" size={18} color={typeColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.terrainName}>{terrain.name}</Text>
                      <View style={s.terrainMetaRow}>
                        <MaterialIcons name="location-on" size={11} color="#94A3B8" />
                        <Text style={s.terrainCity}>{terrain.city}</Text>
                        {terrain.clubName ? (
                          <>
                            <Text style={s.terrainDot}>{"•"}</Text>
                            <MaterialIcons name="home" size={11} color="#94A3B8" />
                            <Text style={s.terrainCity}>{terrain.clubName}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <Pressable
                      style={[s.visibilityToggle, { backgroundColor: terrain.isPublic ? '#DCFCE7' : '#FEF3C7' }]}
                      onPress={() => handleTogglePublic(terrain)}
                    >
                      <MaterialIcons name={terrain.isPublic ? 'visibility' : 'visibility-off'} size={14} color={terrain.isPublic ? '#10B981' : '#D97706'} />
                    </Pressable>
                  </View>

                  {/* Badges row */}
                  <View style={s.terrainBadges}>
                    <View style={[s.terrainBadge, { backgroundColor: typeColor + '10', borderColor: typeColor + '25' }]}>
                      <Text style={[s.terrainBadgeText, { color: typeColor }]}>{terrain.type}</Text>
                    </View>
                    {terrain.courtsCount > 1 ? (
                      <View style={s.terrainBadge}>
                        <MaterialIcons name="grid-view" size={10} color="#64748B" />
                        <Text style={s.terrainBadgeText}>{terrain.courtsCount} {fr ? 'pistes' : 'courts'}</Text>
                      </View>
                    ) : null}
                    {terrain.lighting ? (
                      <View style={[s.terrainBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                        <MaterialIcons name="lightbulb" size={10} color="#F59E0B" />
                        <Text style={[s.terrainBadgeText, { color: '#D97706' }]}>{fr ? 'Eclaire' : 'Lit'}</Text>
                      </View>
                    ) : null}
                    {terrain.covered ? (
                      <View style={[s.terrainBadge, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' }]}>
                        <MaterialIcons name="roofing" size={10} color="#2563EB" />
                        <Text style={[s.terrainBadgeText, { color: '#2563EB' }]}>{fr ? 'Couvert' : 'Covered'}</Text>
                      </View>
                    ) : null}
                    <View style={[s.terrainBadge, { backgroundColor: terrain.environment === 'indoor' ? '#EDE9FE' : '#F0FDF4', borderColor: terrain.environment === 'indoor' ? '#C4B5FD' : '#BBF7D0' }]}>
                      <Text style={[s.terrainBadgeText, { color: terrain.environment === 'indoor' ? '#7C3AED' : '#16A34A' }]}>
                        {terrain.environment === 'indoor' ? (fr ? 'Interieur' : 'Indoor') : (fr ? 'Exterieur' : 'Outdoor')}
                      </Text>
                    </View>
                  </View>

                  {/* Owner + date */}
                  <View style={s.terrainFooter}>
                    <View style={s.terrainOwnerRow}>
                      <MaterialIcons name="person-outline" size={12} color="#94A3B8" />
                      <Text style={s.terrainOwnerText}>{terrain.ownerName}</Text>
                    </View>
                    <Text style={s.terrainDate}>{formatDate(terrain.createdAt)}</Text>
                  </View>

                  {/* Actions */}
                  {!selectionMode ? (
                  <View style={s.terrainActions}>
                    <Pressable style={s.actionBtnView} onPress={() => router.push(`/terrain/${terrain.id}` as any)}>
                      <MaterialIcons name="open-in-new" size={14} color="#2563EB" />
                      <Text style={s.actionBtnViewText}>{fr ? 'Voir' : 'View'}</Text>
                    </Pressable>
                    <Pressable style={s.actionBtnEdit} onPress={() => openEdit(terrain)}>
                      <MaterialIcons name="edit" size={14} color="#64748B" />
                      <Text style={s.actionBtnEditText}>{fr ? 'Modifier' : 'Edit'}</Text>
                    </Pressable>
                    <Pressable style={s.actionBtnDelete} onPress={() => handleDelete(terrain)} hitSlop={8}>
                      <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* ===== BATCH ACTION BAR ===== */}
      {selectionMode && selectedIds.size > 0 ? (
        <Animated.View entering={FadeIn.duration(200)} style={[s.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={s.bulkBarText}>{selectedIds.size} {fr ? 'selectionne(s)' : 'selected'}</Text>
          <View style={s.bulkActions}>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#EF4444' }]} onPress={handleBulkDelete} disabled={bulkProcessing}>
              {bulkProcessing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <><MaterialIcons name="delete" size={16} color="#FFF" /><Text style={s.bulkBtnText}>{fr ? 'Supprimer' : 'Delete'}</Text></>
              )}
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#10B981' }]} onPress={() => handleBulkTogglePublic(true)} disabled={bulkProcessing}>
              <MaterialIcons name="public" size={16} color="#FFF" /><Text style={s.bulkBtnText}>Public</Text>
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#D97706' }]} onPress={() => handleBulkTogglePublic(false)} disabled={bulkProcessing}>
              <MaterialIcons name="lock" size={16} color="#FFF" /><Text style={s.bulkBtnText}>{fr ? 'Prive' : 'Private'}</Text>
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#3B82F6' }]} onPress={handleBulkExport} disabled={bulkProcessing}>
              <MaterialIcons name="file-download" size={16} color="#FFF" /><Text style={s.bulkBtnText}>CSV</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* ===== MERGE PREVIEW MODAL ===== */}
      <Modal
        visible={showMergeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!merging) { setShowMergeModal(false); setMergePreview(null); } }}
      >
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => { if (!merging) { setShowMergeModal(false); setMergePreview(null); } }} disabled={merging}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Apercu de la fusion' : 'Merge Preview'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {mergeGroup && mergeKeepId && mergeDeleteId ? (() => {
              const keepT = mergeGroup.terrains.find(t => t.id === mergeKeepId);
              const delT = mergeGroup.terrains.find(t => t.id === mergeDeleteId);
              if (!keepT || !delT) return null;
              return (
                <>
                  {/* Keep/Delete cards */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    <View style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#BBF7D0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="check-circle" size={16} color="#10B981" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 }}>{fr ? 'CONSERVER' : 'KEEP'}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{keepT.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{keepT.city} {"•"} {keepT.type}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FECACA' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="delete" size={16} color="#EF4444" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 }}>{fr ? 'SUPPRIMER' : 'DELETE'}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{delT.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{delT.city} {"•"} {delT.type}</Text>
                    </View>
                  </View>

                  {/* Swap button */}
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#FEF3C7', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMergeKeepId(mergeDeleteId);
                      setMergeDeleteId(mergeKeepId);
                      setLoadingPreview(true);
                      getMergePreview(mergeDeleteId!, mergeKeepId!).then(({ preview }) => { setMergePreview(preview); setLoadingPreview(false); });
                    }}
                    disabled={loadingPreview || merging}
                  >
                    <MaterialIcons name="swap-horiz" size={18} color="#D97706" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>{fr ? 'Inverser' : 'Swap'}</Text>
                  </Pressable>

                  {/* Impact Preview */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10 }}>{fr ? 'IMPACT DE LA FUSION' : 'MERGE IMPACT'}</Text>
                  {loadingPreview ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <ActivityIndicator size="large" color={theme.primary} />
                      <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>{fr ? 'Analyse en cours...' : 'Analyzing...'}</Text>
                    </View>
                  ) : mergePreview ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16 }}>
                      {[
                        { icon: 'sports', label: fr ? 'Matchs a transferer' : 'Matches to transfer', count: mergePreview.matches, color: '#3B82F6' },
                        { icon: 'flag', label: fr ? 'Defis a transferer' : 'Challenges to transfer', count: mergePreview.challenges, color: '#D97706' },
                        { icon: 'emoji-events', label: fr ? 'Tournois a transferer' : 'Tournaments to transfer', count: mergePreview.tournaments, color: '#7C3AED' },
                        { icon: 'groups', label: fr ? 'Meetups a transferer' : 'Meetups to transfer', count: mergePreview.meetups, color: '#0EA5E9' },
                        { icon: 'home', label: fr ? 'Clubs references' : 'Clubs referenced', count: mergePreview.clubs, color: '#10B981' },
                        { icon: 'person', label: fr ? 'Joueurs (terrain favori)' : 'Players (favorite terrain)', count: mergePreview.players, color: '#EF4444' },
                        { icon: 'event', label: fr ? 'Evenements sponsors' : 'Sponsored events', count: mergePreview.events, color: '#F59E0B' },
                      ].map((item, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: item.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' }}>{item.label}</Text>
                          <View style={{ minWidth: 28, height: 24, borderRadius: 8, backgroundColor: item.count > 0 ? item.color + '15' : '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: item.count > 0 ? item.color : '#CBD5E1' }}>{item.count}</Text>
                          </View>
                        </View>
                      ))}
                      {/* Total */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Total des references' : 'Total references'}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                          {(mergePreview.matches + mergePreview.challenges + mergePreview.tournaments + mergePreview.meetups + mergePreview.clubs + mergePreview.players + mergePreview.events)}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Warning */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}>
                    <MaterialIcons name="warning-amber" size={18} color="#D97706" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 }}>
                      {fr
                        ? 'Cette action est irreversible. Toutes les references seront transferees au terrain conserve, puis le terrain supprime sera efface.'
                        : 'This action is irreversible. All references will be transferred to the kept terrain, then the deleted terrain will be removed.'}
                    </Text>
                  </View>

                  {/* Merge Button */}
                  <Pressable
                    style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: '#DC2626' }, (merging || loadingPreview) && { opacity: 0.5 }]}
                    onPress={executeMerge}
                    disabled={merging || loadingPreview}
                  >
                    {merging ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <>
                        <MaterialIcons name="merge-type" size={20} color="#FFF" />
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>{fr ? 'Confirmer la fusion' : 'Confirm Merge'}</Text>
                      </>
                    )}
                  </Pressable>
                </>
              );
            })() : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ===== EDIT MODAL ===== */}
      <Modal
        visible={!!editTerrain}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!editSubmitting) setEditTerrain(null); }}
      >
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.modalCloseBtn} onPress={() => { if (!editSubmitting) setEditTerrain(null); }} disabled={editSubmitting}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Modifier le terrain' : 'Edit terrain'}</Text>
            <Pressable
              style={[s.modalSaveBtn, editSubmitting && { opacity: 0.5 }]}
              onPress={handleSaveEdit}
              disabled={editSubmitting || !editName.trim() || !editCity.trim()}
            >
              {editSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.modalSaveBtnText}>{fr ? 'Enregistrer' : 'Save'}</Text>}
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={s.editField}>
              <Text style={s.editLabel}>{fr ? 'Nom' : 'Name'}</Text>
              <TextInput style={s.editInput} value={editName} onChangeText={setEditName} placeholder="Terrain name" placeholderTextColor="#94A3B8" />
            </View>
            <View style={s.editField}>
              <Text style={s.editLabel}>{fr ? 'Ville' : 'City'}</Text>
              <TextInput style={s.editInput} value={editCity} onChangeText={setEditCity} placeholder="City" placeholderTextColor="#94A3B8" />
            </View>
            <View style={s.editField}>
              <Text style={s.editLabel}>Type</Text>
              <View style={s.typeGrid}>
                {['Graviers', 'Sable', 'Terre battue', 'Gazon', 'Bitume', 'Mixte'].map(t => {
                  const isSelected = editType === t;
                  const color = TYPE_COLORS[t] || '#64748B';
                  return (
                    <Pressable key={t} style={[s.typeChip, isSelected && { backgroundColor: color, borderColor: color }]} onPress={() => { setEditType(t); Haptics.selectionAsync(); }}>
                      <Text style={[s.typeChipText, isSelected && { color: '#FFF' }]}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={s.editField}>
              <Text style={s.editLabel}>{fr ? 'Nombre de pistes' : 'Courts'}</Text>
              <TextInput style={[s.editInput, { width: 60, textAlign: 'center' }]} value={editCourts} onChangeText={setEditCourts} keyboardType="number-pad" maxLength={2} />
            </View>
            <View style={s.editToggleRow}>
              <View style={s.editToggleItem}>
                <MaterialIcons name="public" size={18} color={editPublic ? '#10B981' : '#94A3B8'} />
                <Text style={s.editToggleLabel}>{fr ? 'Public' : 'Public'}</Text>
                <Switch value={editPublic} onValueChange={setEditPublic} trackColor={{ false: '#E2E8F0', true: '#10B98160' }} thumbColor={editPublic ? '#10B981' : '#94A3B8'} />
              </View>
              <View style={s.editToggleItem}>
                <MaterialIcons name="lightbulb" size={18} color={editLighting ? '#F59E0B' : '#94A3B8'} />
                <Text style={s.editToggleLabel}>{fr ? 'Eclairage' : 'Lighting'}</Text>
                <Switch value={editLighting} onValueChange={setEditLighting} trackColor={{ false: '#E2E8F0', true: '#F59E0B60' }} thumbColor={editLighting ? '#F59E0B' : '#94A3B8'} />
              </View>
              <View style={s.editToggleItem}>
                <MaterialIcons name="roofing" size={18} color={editCovered ? '#2563EB' : '#94A3B8'} />
                <Text style={s.editToggleLabel}>{fr ? 'Couvert' : 'Covered'}</Text>
                <Switch value={editCovered} onValueChange={setEditCovered} trackColor={{ false: '#E2E8F0', true: '#2563EB60' }} thumbColor={editCovered ? '#2563EB' : '#94A3B8'} />
              </View>
            </View>
          </ScrollView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Distribution
  distributionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  distributionTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  distLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 120 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', flex: 1 },
  distCount: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  distBarBg: { flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 3 },
  distPct: { fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right' },

  // Top cities
  topCitiesCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  topCitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topCityChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  topCityRank: { fontSize: 10, fontWeight: '800', color: '#94A3B8' },
  topCityName: { fontSize: 12, fontWeight: '600', color: '#0F172A', maxWidth: 80 },
  topCityCount: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  topCityCountText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 12 },

  // Filter
  filterBar: { paddingBottom: 16, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterChipBadge: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterChipBadgeText: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },

  // Terrain card
  terrainCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  terrainHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  terrainTypeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  terrainName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  terrainMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  terrainCity: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  terrainDot: { fontSize: 8, color: '#CBD5E1' },
  visibilityToggle: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  terrainBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  terrainBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  terrainBadgeText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  terrainFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  terrainOwnerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  terrainOwnerText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  terrainDate: { fontSize: 10, color: '#CBD5E1' },
  terrainActions: { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  actionBtnView: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE' },
  actionBtnViewText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  actionBtnEdit: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnEditText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  actionBtnDelete: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },

  // Bulk action bar
  bulkBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 8 },
  bulkBarText: { fontSize: 13, fontWeight: '700' as const, color: '#0F172A', marginBottom: 8 },
  bulkActions: { flexDirection: 'row' as const, gap: 8 },
  bulkBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, flex: 1, justifyContent: 'center' as const },
  bulkBtnText: { fontSize: 11, fontWeight: '700' as const, color: '#FFF' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 56 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalCloseBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#2563EB', borderRadius: 10 },
  modalSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Edit fields
  editField: { marginBottom: 18 },
  editLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  editInput: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A', borderWidth: 1.5, borderColor: '#E2E8F0' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  editToggleRow: { gap: 10, marginTop: 8 },
  editToggleItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  editToggleLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },

  // Duplicates
  dupeToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#FECACA' },
  dupeToggleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  dupeToggleTitle: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  dupeToggleDesc: { fontSize: 11, color: '#B91C1C', marginTop: 2 },
  dupeList: { gap: 8, marginBottom: 14 },
  dupeGroup: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FECACA', borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  dupeGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dupeGroupMeta: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  dupeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FEF2F2' },
  dupeItemNum: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  dupeItemNumText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  dupeItemName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  dupeItemCity: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  dupeDeleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA' },
  dupeMergeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  dupeMergeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' },
  dupeMergeBtnText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
});
