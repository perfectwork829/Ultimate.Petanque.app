import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import MergeComparisonModal, { MergeField } from './MergeComparisonModal';
import { Player, Club, Terrain, Tournament } from '@/types/petanque';
import { saveMergeLog, ReassignedRelation } from '@/services/mergeHistoryService';

type MergeItemType = 'player' | 'club' | 'terrain' | 'tournament';

interface MergePickerModalProps {
  visible: boolean;
  onClose: () => void;
  itemType: MergeItemType;
  currentItemId: string;
  /** When true, after merge the source item (selectedItem) will be deleted and relations reassigned */
  deleteSourceAfterMerge?: boolean;
}

// Build merge fields for each type
function buildPlayerFields(current: Player, other: Player, t: (s: string, k: string) => string): MergeField[] {
  return [
    { key: 'name', label: t('player', 'nameLabel'), myValue: current.name || '', publicValue: other.name || '', icon: 'person' },
    { key: 'nickname', label: t('player', 'nicknameLabel'), myValue: current.nickname || '', publicValue: other.nickname || '', icon: 'badge' },
    { key: 'role', label: t('player', 'roleLabel'), myValue: current.role || '', publicValue: other.role || '', icon: 'sports' },
    { key: 'level', label: t('player', 'levelLabel'), myValue: current.level || '', publicValue: other.level || '', icon: 'trending-up' },
    { key: 'club', label: t('player', 'clubLabel'), myValue: current.club || '', publicValue: other.club || '', icon: 'home' },
    { key: 'terrainName', label: t('player', 'terrainLabel'), myValue: current.terrainName || '', publicValue: other.terrainName || '', icon: 'landscape' },
    { key: 'phone', label: t('player', 'phonePlaceholder'), myValue: current.phone || '', publicValue: other.phone || '', icon: 'phone' },
    { key: 'email', label: t('player', 'emailPlaceholder'), myValue: current.email || '', publicValue: other.email || '', icon: 'email' },
    { key: 'handedness', label: t('player', 'handedness'), myValue: current.handedness || '', publicValue: other.handedness || '', icon: 'back-hand' },
    { key: 'country', label: t('directory', 'country'), myValue: current.country || '', publicValue: other.country || '', icon: 'public' },
  ];
}

function buildClubFields(current: Club, other: Club, t: (s: string, k: string) => string): MergeField[] {
  return [
    { key: 'name', label: t('club', 'clubNameRequired'), myValue: current.name || '', publicValue: other.name || '', icon: 'home' },
    { key: 'address', label: t('terrain', 'addressRequired'), myValue: current.address || '', publicValue: other.address || '', icon: 'place' },
    { key: 'city', label: t('directory', 'city'), myValue: current.city || '', publicValue: other.city || '', icon: 'location-city' },
    { key: 'country', label: t('directory', 'country'), myValue: current.country || '', publicValue: other.country || '', icon: 'public' },
    { key: 'description', label: t('club', 'descriptionLabel'), myValue: current.description || '', publicValue: other.description || '', icon: 'description' },
    { key: 'membersCount', label: t('club', 'members'), myValue: String(current.membersCount || ''), publicValue: String(other.membersCount || ''), icon: 'people' },
    { key: 'foundedYear', label: t('club', 'founded'), myValue: String(current.foundedYear || ''), publicValue: String(other.foundedYear || ''), icon: 'calendar-today' },
    { key: 'contactEmail', label: t('club', 'emailPlaceholder'), myValue: current.contactEmail || '', publicValue: other.contactEmail || '', icon: 'email' },
    { key: 'contactPhone', label: t('club', 'phonePlaceholder'), myValue: current.contactPhone || '', publicValue: other.contactPhone || '', icon: 'phone' },
    { key: 'membershipCost', label: t('club', 'membership'), myValue: current.membershipCost ? `${current.membershipCost}` : '', publicValue: other.membershipCost ? `${other.membershipCost}` : '', icon: 'payments' },
  ];
}

function buildTerrainFields(current: Terrain, other: Terrain, t: (s: string, k: string) => string): MergeField[] {
  return [
    { key: 'name', label: t('terrain', 'terrainNameRequired'), myValue: current.name || '', publicValue: other.name || '', icon: 'landscape' },
    { key: 'type', label: t('terrain', 'terrainTypeRequired'), myValue: current.type || '', publicValue: other.type || '', icon: 'category' },
    { key: 'address', label: t('terrain', 'addressRequired'), myValue: current.address || '', publicValue: other.address || '', icon: 'place' },
    { key: 'city', label: t('directory', 'city'), myValue: current.city || '', publicValue: other.city || '', icon: 'location-city' },
    { key: 'description', label: t('terrain', 'descriptionLabel'), myValue: current.description || '', publicValue: other.description || '', icon: 'description' },
    { key: 'courtsCount', label: t('terrain', 'courtsCount'), myValue: String(current.courtsCount || ''), publicValue: String(other.courtsCount || ''), icon: 'grid-view' },
    { key: 'lighting', label: t('terrain', 'lighting'), myValue: current.lighting ? 'true' : 'false', publicValue: other.lighting ? 'true' : 'false', icon: 'lightbulb' },
    { key: 'covered', label: t('terrain', 'covered'), myValue: current.covered ? 'true' : 'false', publicValue: other.covered ? 'true' : 'false', icon: 'roofing' },
    { key: 'clubName', label: t('terrain', 'clubSection'), myValue: current.clubName || '', publicValue: other.clubName || '', icon: 'home' },
  ];
}

function buildTournamentFields(current: Tournament, other: Tournament, t: (s: string, k: string) => string): MergeField[] {
  return [
    { key: 'name', label: t('tournament', 'tournamentNameRequired'), myValue: current.name || '', publicValue: other.name || '', icon: 'emoji-events' },
    { key: 'type', label: t('tournament', 'cadrage'), myValue: current.type || '', publicValue: other.type || '', icon: 'category' },
    { key: 'format', label: t('tournament', 'gameFormat'), myValue: current.format || '', publicValue: other.format || '', icon: 'view-module' },
    { key: 'description', label: t('tournament', 'description'), myValue: current.description || '', publicValue: other.description || '', icon: 'description' },
    { key: 'prize', label: t('tournament', 'prize'), myValue: current.prize || '', publicValue: other.prize || '', icon: 'card-giftcard' },
    { key: 'maxParticipants', label: t('tournament', 'maxParticipants'), myValue: String(current.maxParticipants || ''), publicValue: String(other.maxParticipants || ''), icon: 'people' },
    { key: 'tournamentLevel', label: t('tournament', 'levelTitle'), myValue: current.tournamentLevel || '', publicValue: other.tournamentLevel || '', icon: 'signal-cellular-alt' },
    { key: 'registrationCost', label: t('tournament', 'registrationCost'), myValue: current.registrationCost ? `${current.registrationCost}` : '', publicValue: other.registrationCost ? `${other.registrationCost}` : '', icon: 'payments' },
  ];
}

export default function MergePickerModal({ visible, onClose, itemType, currentItemId, deleteSourceAfterMerge = true }: MergePickerModalProps) {
  const { t } = useLanguage();
  const { showAlert } = useAlert();
  const { players, clubs, terrains, tournaments, matches } = useAppData();
  const { updatePlayer, updateClub, updateTerrain, updateTournament, deletePlayer, deleteClub, deleteTerrain, deleteTournament } = useAppActions();

  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (visible) {
      setSearch('');
      setSelectedItemId(null);
      setShowComparison(false);
    }
  }, [visible]);

  // Get items of the same type, excluding the current one
  const availableItems = useMemo(() => {
    const s = search.toLowerCase();
    switch (itemType) {
      case 'player':
        return players.filter(p => p.id !== currentItemId && (!s || p.name.toLowerCase().includes(s)));
      case 'club':
        return clubs.filter(c => c.id !== currentItemId && (!s || c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s)));
      case 'terrain':
        return terrains.filter(tr => tr.id !== currentItemId && (!s || tr.name.toLowerCase().includes(s) || tr.city.toLowerCase().includes(s)));
      case 'tournament':
        return tournaments.filter(to => to.id !== currentItemId && (!s || to.name.toLowerCase().includes(s)));
      default:
        return [];
    }
  }, [itemType, currentItemId, players, clubs, terrains, tournaments, search]);

  const currentItem = useMemo(() => {
    switch (itemType) {
      case 'player': return players.find(p => p.id === currentItemId);
      case 'club': return clubs.find(c => c.id === currentItemId);
      case 'terrain': return terrains.find(tr => tr.id === currentItemId);
      case 'tournament': return tournaments.find(to => to.id === currentItemId);
    }
  }, [itemType, currentItemId, players, clubs, terrains, tournaments]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    switch (itemType) {
      case 'player': return players.find(p => p.id === selectedItemId);
      case 'club': return clubs.find(c => c.id === selectedItemId);
      case 'terrain': return terrains.find(tr => tr.id === selectedItemId);
      case 'tournament': return tournaments.find(to => to.id === selectedItemId);
    }
  }, [itemType, selectedItemId, players, clubs, terrains, tournaments]);

  // Build merge fields
  const mergeFields = useMemo((): MergeField[] => {
    if (!currentItem || !selectedItem) return [];
    switch (itemType) {
      case 'player': return buildPlayerFields(currentItem as Player, selectedItem as Player, t);
      case 'club': return buildClubFields(currentItem as Club, selectedItem as Club, t);
      case 'terrain': return buildTerrainFields(currentItem as Terrain, selectedItem as Terrain, t);
      case 'tournament': return buildTournamentFields(currentItem as Tournament, selectedItem as Tournament, t);
      default: return [];
    }
  }, [currentItem, selectedItem, itemType, t]);

  const handleSelectItem = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedItemId(id);
    setShowComparison(true);
  }, []);

  // Reassign relations from sourceId to targetId, then delete source
  const reassignAndDelete = useCallback(async (type: MergeItemType, targetId: string, sourceId: string, targetItem: any) => {
    if (!deleteSourceAfterMerge) return;
    const sourceItem = type === 'player' ? players.find(p => p.id === sourceId)
      : type === 'club' ? clubs.find(c => c.id === sourceId)
      : type === 'terrain' ? terrains.find(t => t.id === sourceId)
      : tournaments.find(t => t.id === sourceId);
    const reassigned: ReassignedRelation[] = [];
    try {
      if (type === 'club') {
        const linkedPlayers = players.filter(p => p.clubId === sourceId);
        for (const p of linkedPlayers) {
          reassigned.push({ type: 'player', id: p.id, field: 'club_id', oldValue: sourceId, newValue: targetId });
          reassigned.push({ type: 'player', id: p.id, field: 'club', oldValue: (sourceItem as any)?.name, newValue: targetItem.name });
          await updatePlayer(p.id, { club: targetItem.name, clubId: targetId });
        }
        const linkedTournaments = tournaments.filter(t => t.clubId === sourceId);
        for (const lt of linkedTournaments) {
          reassigned.push({ type: 'tournament', id: lt.id, field: 'club_id', oldValue: sourceId, newValue: targetId });
          await updateTournament(lt.id, { clubId: targetId, clubName: targetItem.name });
        }
        const linkedTerrains = terrains.filter(t => t.clubId === sourceId);
        for (const lt of linkedTerrains) {
          reassigned.push({ type: 'terrain', id: lt.id, field: 'club_id', oldValue: sourceId, newValue: targetId });
          await updateTerrain(lt.id, { clubId: targetId, clubName: targetItem.name });
        }
        await saveMergeLog({ mergeType: 'club', targetId, targetName: targetItem.name, sourceId, sourceName: (sourceItem as any)?.name || '', sourceSnapshot: sourceItem as any || {}, reassignedRelations: reassigned });
        await deleteClub(sourceId);
      } else if (type === 'terrain') {
        const linkedClubs = clubs.filter(c => c.terrainId === sourceId);
        for (const c of linkedClubs) {
          reassigned.push({ type: 'club', id: c.id, field: 'terrain_id', oldValue: sourceId, newValue: targetId });
          await updateClub(c.id, { terrainId: targetId, terrainName: targetItem.name } as any);
        }
        const linkedPlayers = players.filter(p => p.terrainId === sourceId);
        for (const p of linkedPlayers) {
          reassigned.push({ type: 'player', id: p.id, field: 'terrain_id', oldValue: sourceId, newValue: targetId });
          await updatePlayer(p.id, { terrainId: targetId, terrainName: targetItem.name });
        }
        const linkedTournaments = tournaments.filter(t => t.terrainId === sourceId);
        for (const lt of linkedTournaments) {
          reassigned.push({ type: 'tournament', id: lt.id, field: 'terrain_id', oldValue: sourceId, newValue: targetId });
          await updateTournament(lt.id, { terrainId: targetId, terrainName: targetItem.name } as any);
        }
        await saveMergeLog({ mergeType: 'terrain', targetId, targetName: targetItem.name, sourceId, sourceName: (sourceItem as any)?.name || '', sourceSnapshot: sourceItem as any || {}, reassignedRelations: reassigned });
        const { error: delTerrainErr } = await deleteTerrain(sourceId);
        if (delTerrainErr) {
          showAlert(t('common', 'error'), delTerrainErr);
          return;
        }
      } else if (type === 'player') {
        await saveMergeLog({ mergeType: 'player', targetId, targetName: targetItem.name, sourceId, sourceName: (sourceItem as any)?.name || '', sourceSnapshot: sourceItem as any || {}, reassignedRelations: [] });
        await deletePlayer(sourceId);
      } else if (type === 'tournament') {
        await saveMergeLog({ mergeType: 'tournament', targetId, targetName: targetItem.name, sourceId, sourceName: (sourceItem as any)?.name || '', sourceSnapshot: sourceItem as any || {}, reassignedRelations: [] });
        const { error: delTournamentErr } = await deleteTournament(sourceId);
        if (delTournamentErr) {
          showAlert(t('common', 'error'), delTournamentErr);
          return;
        }
      }
    } catch (e) {
      console.log('Error reassigning relations:', e);
      showAlert(t('common', 'error'), e instanceof Error ? e.message : String(e));
    }
  }, [deleteSourceAfterMerge, players, clubs, terrains, tournaments, updatePlayer, updateClub, updateTerrain, updateTournament, deleteClub, deleteTerrain, deletePlayer, deleteTournament, showAlert, t]);

  const handleApplyMerge = useCallback(async (selections: Record<string, 'mine' | 'public'>) => {
    if (!currentItem || !selectedItem || !selectedItemId) return;

    const updates: Record<string, any> = {};
    Object.entries(selections).forEach(([key, choice]) => {
      if (choice === 'public') {
        const field = mergeFields.find(f => f.key === key);
        if (field && field.publicValue && field.publicValue.trim() !== '' && field.publicValue !== '\u2014') {
          // Handle special types
          if (['membersCount', 'courtsCount', 'maxParticipants', 'foundedYear'].includes(key)) {
            const num = parseInt(field.publicValue);
            if (!isNaN(num)) updates[key] = num;
          } else if (['membershipCost', 'registrationCost'].includes(key)) {
            const num = parseFloat(field.publicValue);
            if (!isNaN(num)) updates[key] = num;
          } else if (['lighting', 'covered'].includes(key)) {
            updates[key] = field.publicValue === 'true';
          } else {
            updates[key] = field.publicValue;
          }
        }
      }
    });

    try {
      // Apply field updates to the target item
      if (Object.keys(updates).length > 0) {
        switch (itemType) {
          case 'player': await updatePlayer(currentItemId, updates); break;
          case 'club': await updateClub(currentItemId, updates); break;
          case 'terrain': await updateTerrain(currentItemId, updates); break;
          case 'tournament': await updateTournament(currentItemId, updates); break;
        }
      }

      // Reassign relations and delete the source duplicate
      const mergedTarget = { ...(currentItem as any), ...updates };
      await reassignAndDelete(itemType, currentItemId, selectedItemId, mergedTarget);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('map', 'mergeSuccess'));
    } catch (e: any) {
      showAlert(t('common', 'error'), e?.message || 'Error');
    }

    setShowComparison(false);
    onClose();
  }, [currentItem, selectedItem, selectedItemId, mergeFields, itemType, currentItemId, updatePlayer, updateClub, updateTerrain, updateTournament, reassignAndDelete, showAlert, t, onClose]);

  const getItemIcon = (type: MergeItemType): string => {
    switch (type) {
      case 'player': return 'person';
      case 'club': return 'home';
      case 'terrain': return 'landscape';
      case 'tournament': return 'emoji-events';
    }
  };

  const getItemColor = (type: MergeItemType): string => {
    switch (type) {
      case 'player': return theme.primary;
      case 'club': return theme.accent;
      case 'terrain': return theme.success;
      case 'tournament': return theme.carreauColor;
    }
  };

  const getItemName = (item: any): string => item?.name || '';
  const getItemSubtitle = (item: any): string => {
    if (itemType === 'player') return `${item.role || ''} • ${item.level || ''}`;
    if (itemType === 'club') return item.city || '';
    if (itemType === 'terrain') return `${item.city || ''} • ${item.type || ''}`;
    if (itemType === 'tournament') return `${item.format || ''} • ${item.type || ''}`;
    return '';
  };

  const iconName = getItemIcon(itemType);
  const iconColor = getItemColor(itemType);
  const searchPlaceholder = itemType === 'player' ? t('directory', 'searchPlayer')
    : itemType === 'club' ? t('directory', 'searchClub')
    : itemType === 'terrain' ? t('directory', 'searchTerrain')
    : t('directory', 'searchTournament');

  return (
    <>
      <Modal
        visible={visible && !showComparison}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <Pressable style={s.closeBtn} onPress={onClose}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>{t('share', 'mergeWithExisting')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search */}
          <View style={s.searchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.textMuted}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Info */}
          <View style={s.infoBar}>
            <MaterialIcons name="compare-arrows" size={16} color={theme.primary} />
            <Text style={s.infoText}>
              {t('map', 'mergeTerrainDesc')}
            </Text>
          </View>

          {/* Items list */}
          <FlatList
            data={availableItems as any[]}
            keyExtractor={(item: any) => item.id}
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            renderItem={({ item }: { item: any }) => (
              <Pressable
                style={s.itemCard}
                onPress={() => handleSelectItem(item.id)}
              >
                <View style={[s.itemIcon, { backgroundColor: iconColor + '15' }]}>
                  <MaterialIcons name={iconName as any} size={22} color={iconColor} />
                </View>
                <View style={s.itemInfo}>
                  <Text style={s.itemName} numberOfLines={1}>{getItemName(item)}</Text>
                  <Text style={s.itemSubtitle} numberOfLines={1}>{getItemSubtitle(item)}</Text>
                </View>
                <MaterialIcons name="compare-arrows" size={20} color={theme.primary} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
                <Text style={s.emptyText}>{t('common', 'noResults')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Merge Comparison Modal */}
      {currentItem && selectedItem ? (
        <MergeComparisonModal
          visible={showComparison}
          onClose={() => { setShowComparison(false); setSelectedItemId(null); }}
          onApply={handleApplyMerge}
          fields={mergeFields}
          myLabel={getItemName(currentItem)}
          publicLabel={getItemName(selectedItem)}
          publicItemName={getItemName(selectedItem)}
          t={t}
        />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary, flex: 1, textAlign: 'center' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: theme.borderRadius.md, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, color: theme.textPrimary, padding: 0 },
  infoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16,
    marginBottom: 12, backgroundColor: theme.primary + '10', paddingHorizontal: 14,
    paddingVertical: 10, borderRadius: theme.borderRadius.md,
  },
  infoText: { flex: 1, fontSize: 12, color: theme.primary, lineHeight: 18 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 8, gap: 12,
    ...theme.shadows.card,
  },
  itemIcon: {
    width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  itemSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },
});
