/**
 * Card Gallery Page
 * Displays history of previously shared/downloaded visual cards.
 * Allows re-sharing from existing card types and clearing history.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import {
  getCardHistory,
  getCardHistoryStats,
  deleteCardHistoryEntry,
  clearCardHistory,
  type CardHistoryEntry,
} from '@/services/cardHistoryService';
import { CARD_COLOR_THEMES } from '@/services/shareCardService';
import { LinearGradient } from 'expo-linear-gradient';

export default function CardGalleryScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [entries, setEntries] = useState<CardHistoryEntry[]>([]);
  const [stats, setStats] = useState({ total: 0, shared: 0, downloaded: 0, byType: {} as Record<string, number> });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterFormat, setFilterFormat] = useState<FilterFormat>('all');

  const loadData = useCallback(async () => {
    const [history, historyStats] = await Promise.all([getCardHistory(), getCardHistoryStats()]);
    setEntries(history);
    setStats(historyStats);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleDelete = useCallback((id: string) => {
    showAlert(
      fr ? 'Supprimer cette carte ?' : 'Delete this card?',
      fr ? 'Cette action est irreversible.' : 'This action cannot be undone.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Supprimer' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await deleteCardHistoryEntry(id);
            loadData();
          },
        },
      ]
    );
  }, [fr, showAlert, loadData]);

  const handleClearAll = useCallback(() => {
    if (entries.length === 0) return;
    showAlert(
      fr ? 'Effacer tout l\'historique ?' : 'Clear all history?',
      fr ? 'Toutes les cartes seront supprimees de l\'historique.' : 'All cards will be removed from history.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Effacer' : 'Clear',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await clearCardHistory();
            loadData();
          },
        },
      ]
    );
  }, [entries.length, fr, showAlert, loadData]);

  const handleRecreate = useCallback((entry: CardHistoryEntry) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/share-card', params: { type: entry.type } } as any);
  }, []);

  // Filter entries
  const filteredEntries = React.useMemo(() => {
    return entries.filter(entry => {
      if (filterType !== 'all' && entry.type !== filterType) return false;
      if (filterFormat !== 'all' && entry.format !== filterFormat) return false;
      return true;
    });
  }, [entries, filterType, filterFormat]);

  const activeFilterCount = (filterType !== 'all' ? 1 : 0) + (filterFormat !== 'all' ? 1 : 0);

  // Group entries by date
  const groupedEntries = React.useMemo(() => {
    const groups: { label: string; entries: CardHistoryEntry[] }[] = [];
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();

    let currentLabel = '';
    let currentGroup: CardHistoryEntry[] = [];

    for (const entry of filteredEntries) {
      const entryDate = new Date(entry.createdAt);
      const dateStr = entryDate.toDateString();
      let label: string;
      if (dateStr === today) {
        label = fr ? "Aujourd'hui" : 'Today';
      } else if (dateStr === yesterday) {
        label = fr ? 'Hier' : 'Yesterday';
      } else {
        label = entryDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      }

      if (label !== currentLabel) {
        if (currentGroup.length > 0) groups.push({ label: currentLabel, entries: currentGroup });
        currentLabel = label;
        currentGroup = [entry];
      } else {
        currentGroup.push(entry);
      }
    }
    if (currentGroup.length > 0) groups.push({ label: currentLabel, entries: currentGroup });
    return groups;
  }, [filteredEntries, fr]);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Galerie des cartes' : 'Card Gallery'}</Text>
        {entries.length > 0 ? (
          <Pressable style={s.headerBtn} onPress={handleClearAll} hitSlop={12}>
            <MaterialIcons name="delete-sweep" size={22} color={theme.error} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Quick Create Grid */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={s.quickCreateSection}>
            <View style={s.quickCreateHeader}>
              <MaterialIcons name="add-photo-alternate" size={16} color={theme.primary} />
              <Text style={s.quickCreateTitle}>{fr ? 'Creer une carte' : 'Create a card'}</Text>
            </View>
            <View style={s.quickCreateGrid}>
              {CARD_TYPES.map((ct) => (
                <Pressable
                  key={ct.type}
                  style={({ pressed }) => [s.quickCreateCard, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
                  onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/share-card', params: { type: ct.type } } as any); }}
                >
                  <LinearGradient colors={[ct.color + '20', ct.color + '08']} style={s.quickCreateCardInner}>
                    <View style={[s.quickCreateIconBg, { backgroundColor: ct.color + '25' }]}>
                      <MaterialIcons name={ct.icon as any} size={22} color={ct.color} />
                    </View>
                    <Text style={s.quickCreateCardLabel} numberOfLines={1}>{fr ? ct.labelFr : ct.label}</Text>
                    <View style={s.quickCreateFormats}>
                      <MaterialIcons name="crop-square" size={9} color={theme.textMuted} />
                      <MaterialIcons name="crop-portrait" size={9} color={theme.textMuted} />
                      <MaterialIcons name="crop-landscape" size={9} color={theme.textMuted} />
                    </View>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Filter Bar */}
        {stats.total > 0 ? (
          <View style={s.filterSection}>
            {/* Type filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              <Pressable style={[s.filterChip, filterType === 'all' && s.filterChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterType('all'); }}>
                <MaterialIcons name="select-all" size={12} color={filterType === 'all' ? '#FFF' : theme.textMuted} />
                <Text style={[s.filterChipText, filterType === 'all' && s.filterChipTextActive]}>{fr ? 'Tous' : 'All'}</Text>
              </Pressable>
              {Object.entries(TYPE_ICONS).map(([key, info]) => {
                const count = stats.byType[key] || 0;
                if (count === 0) return null;
                const isActive = filterType === key;
                return (
                  <Pressable key={key} style={[s.filterChip, isActive && { backgroundColor: info.color, borderColor: info.color }]} onPress={() => { Haptics.selectionAsync(); setFilterType(isActive ? 'all' : key); }}>
                    <MaterialIcons name={info.icon as any} size={12} color={isActive ? '#FFF' : info.color} />
                    <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>{fr ? info.labelFr : info.label}</Text>
                    <View style={[s.filterChipCount, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }]}><Text style={[s.filterChipCountText, isActive && { color: '#FFF' }]}>{count}</Text></View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Format filter */}
            <View style={s.formatFilterRow}>
              {(['all', 'square', 'story', 'landscape'] as FilterFormat[]).map(fmt => {
                const isActive = filterFormat === fmt;
                const icon = fmt === 'all' ? 'apps' : fmt === 'square' ? 'crop-square' : fmt === 'story' ? 'crop-portrait' : 'crop-landscape';
                const label = fmt === 'all' ? (fr ? 'Tous' : 'All') : fmt === 'square' ? '1:1' : fmt === 'story' ? '9:16' : '16:9';
                return (
                  <Pressable key={fmt} style={[s.formatChip, isActive && s.formatChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterFormat(fmt); }}>
                    <MaterialIcons name={icon as any} size={13} color={isActive ? '#FFF' : theme.textMuted} />
                    <Text style={[s.formatChipText, isActive && s.formatChipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {activeFilterCount > 0 ? (
              <Pressable style={s.clearFiltersBtn} onPress={() => { setFilterType('all'); setFilterFormat('all'); }}>
                <MaterialIcons name="close" size={12} color={theme.error} />
                <Text style={s.clearFiltersText}>{fr ? 'Effacer filtres' : 'Clear filters'} ({activeFilterCount})</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Stats Summary */}
        {stats.total > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)} style={s.statsCard}>
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <View style={[s.statIconBg, { backgroundColor: theme.primary + '15' }]}>
                  <MaterialIcons name="image" size={18} color={theme.primary} />
                </View>
                <Text style={s.statValue}>{stats.total}</Text>
                <Text style={s.statLabel}>{fr ? 'Cartes' : 'Cards'}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <View style={[s.statIconBg, { backgroundColor: theme.success + '15' }]}>
                  <MaterialIcons name="share" size={18} color={theme.success} />
                </View>
                <Text style={s.statValue}>{stats.shared}</Text>
                <Text style={s.statLabel}>{fr ? 'Partagees' : 'Shared'}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <View style={[s.statIconBg, { backgroundColor: theme.accent + '15' }]}>
                  <MaterialIcons name="save-alt" size={18} color={theme.accent} />
                </View>
                <Text style={s.statValue}>{stats.downloaded}</Text>
                <Text style={s.statLabel}>{fr ? 'Telechargees' : 'Downloaded'}</Text>
              </View>
            </View>

            {/* Type breakdown */}
            <View style={s.typeBreakdown}>
              {Object.entries(stats.byType).map(([type, count]) => {
                const info = TYPE_ICONS[type as keyof typeof TYPE_ICONS];
                if (!info) return null;
                return (
                  <View key={type} style={[s.typeChip, { backgroundColor: info.color + '12' }]}>
                    <MaterialIcons name={info.icon as any} size={12} color={info.color} />
                    <Text style={[s.typeChipText, { color: info.color }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* Empty state */}
        {!loading && filteredEntries.length === 0 && entries.length > 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="filter-list-off" size={40} color={theme.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{fr ? 'Aucun resultat' : 'No results'}</Text>
            <Text style={s.emptyDesc}>{fr ? 'Aucune carte ne correspond aux filtres selectionnes.' : 'No cards match the selected filters.'}</Text>
            <Pressable style={s.emptyCta} onPress={() => { setFilterType('all'); setFilterFormat('all'); }}>
              <MaterialIcons name="refresh" size={18} color="#FFF" />
              <Text style={s.emptyCtaText}>{fr ? 'Reinitialiser' : 'Reset filters'}</Text>
            </Pressable>
          </View>
        ) : !loading && entries.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={s.emptyState}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="photo-library" size={48} color={theme.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{fr ? 'Aucune carte creee' : 'No cards created yet'}</Text>
            <Text style={s.emptyDesc}>
              {fr
                ? 'Partagez vos matchs, badges et statistiques pour les voir apparaitre ici.'
                : 'Share your matches, badges and stats to see them appear here.'}
            </Text>
            <Pressable
              style={s.emptyCta}
              onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/share-card', params: { type: 'stats' } } as any); }}
            >
              <MaterialIcons name="add-photo-alternate" size={20} color="#FFF" />
              <Text style={s.emptyCtaText}>{fr ? 'Creer ma premiere carte' : 'Create my first card'}</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Grouped entries */}
        {groupedEntries.map((group, gi) => (
          <Animated.View key={group.label} entering={FadeInDown.duration(300).delay(gi * 40)}>
            <Text style={s.groupLabel}>{group.label}</Text>
            {group.entries.map((entry, ei) => {
              const themeColors = CARD_COLOR_THEMES[entry.theme as keyof typeof CARD_COLOR_THEMES] || CARD_COLOR_THEMES.dark;
              const timeStr = new Date(entry.createdAt).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
              return (
                <Pressable
                  key={entry.id}
                  style={({ pressed }) => [s.entryCard, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
                  onPress={() => handleRecreate(entry)}
                >
                  {/* Theme color preview */}
                  <View style={[s.entryThemeBar, { backgroundColor: themeColors.accent }]} />

                  <View style={s.entryContent}>
                    <View style={s.entryTopRow}>
                      <View style={[s.entryIconBg, { backgroundColor: (entry.iconColor || theme.primary) + '15' }]}>
                        <MaterialIcons name={entry.iconName as any} size={20} color={entry.iconColor || theme.primary} />
                      </View>
                      <View style={s.entryInfo}>
                        <Text style={s.entryTitle} numberOfLines={1}>{entry.title}</Text>
                        <Text style={s.entrySubtitle}>{entry.subtitle}</Text>
                      </View>
                      <View style={s.entryMeta}>
                        <View style={[s.actionBadge, { backgroundColor: entry.action === 'shared' ? theme.success + '15' : theme.accent + '15' }]}>
                          <MaterialIcons
                            name={entry.action === 'shared' ? 'share' : 'save-alt'}
                            size={11}
                            color={entry.action === 'shared' ? theme.success : theme.accent}
                          />
                        </View>
                        <Text style={s.entryTime}>{timeStr}</Text>
                      </View>
                    </View>

                    {/* Bottom row: format + theme + actions */}
                    <View style={s.entryBottomRow}>
                      <View style={s.entryTags}>
                        <View style={s.entryTag}>
                          <Text style={s.entryTagText}>{entry.format}</Text>
                        </View>
                        <View style={[s.entryTag, { backgroundColor: themeColors.accent + '12' }]}>
                          <View style={[s.themePreviewDot, { backgroundColor: themeColors.accent }]} />
                          <Text style={[s.entryTagText, { color: themeColors.accent }]}>
                            {fr ? themeColors.labelFr : themeColors.label}
                          </Text>
                        </View>
                      </View>

                      <View style={s.entryActions}>
                        <Pressable
                          style={s.entryActionBtn}
                          onPress={(e) => { e.stopPropagation(); handleRecreate(entry); }}
                          hitSlop={8}
                        >
                          <MaterialIcons name="refresh" size={16} color={theme.primary} />
                        </Pressable>
                        <Pressable
                          style={s.entryActionBtn}
                          onPress={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                          hitSlop={8}
                        >
                          <MaterialIcons name="delete-outline" size={16} color={theme.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        ))}

        {/* CTA */}
        {entries.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(200)} style={s.bottomCta}>
            <Pressable
              style={s.createBtn}
              onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/share-card', params: { type: 'stats' } } as any); }}
            >
              <MaterialIcons name="add-photo-alternate" size={20} color="#FFF" />
              <Text style={s.createBtnText}>{fr ? 'Nouvelle carte' : 'New Card'}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_TYPES: { type: string; icon: string; color: string; label: string; labelFr: string }[] = [
  { type: 'match', icon: 'sports', color: '#F59E0B', label: 'Match', labelFr: 'Match' },
  { type: 'badge', icon: 'military-tech', color: '#8B5CF6', label: 'Badge', labelFr: 'Badge' },
  { type: 'stats', icon: 'bar-chart', color: '#3B82F6', label: 'Stats', labelFr: 'Stats' },
  { type: 'challenge', icon: 'track-changes', color: '#EF4444', label: 'Challenge', labelFr: 'Defi' },
  { type: 'tournament', icon: 'emoji-events', color: '#D97706', label: 'Tournament', labelFr: 'Tournoi' },
  { type: 'h2h', icon: 'compare-arrows', color: '#EC4899', label: 'Head-to-Head', labelFr: 'Face-a-face' },
  { type: 'palmares', icon: 'workspace-premium', color: '#FFD700', label: 'Career', labelFr: 'Palmares' },
  { type: 'season', icon: 'calendar-today', color: '#059669', label: 'Season', labelFr: 'Saison' },
  { type: 'weekly-digest', icon: 'summarize', color: '#0EA5E9', label: 'Digest', labelFr: 'Digest' },
];

const TYPE_ICONS: Record<string, { icon: string; color: string; label: string; labelFr: string }> = {
  match: { icon: 'sports', color: '#F59E0B', label: 'Match', labelFr: 'Match' },
  badge: { icon: 'military-tech', color: '#8B5CF6', label: 'Badge', labelFr: 'Badge' },
  stats: { icon: 'bar-chart', color: '#3B82F6', label: 'Stats', labelFr: 'Stats' },
  challenge: { icon: 'track-changes', color: '#EF4444', label: 'Challenge', labelFr: 'Defi' },
  tournament: { icon: 'emoji-events', color: '#F59E0B', label: 'Tournament', labelFr: 'Tournoi' },
  h2h: { icon: 'compare-arrows', color: '#EC4899', label: 'H2H', labelFr: 'H2H' },
  'sponsored-event': { icon: 'campaign', color: '#7C3AED', label: 'Event', labelFr: 'Event' },
  palmares: { icon: 'emoji-events', color: '#FFD700', label: 'Career', labelFr: 'Palmares' },
  'event-leaderboard': { icon: 'leaderboard', color: '#9333EA', label: 'Leaderboard', labelFr: 'Classement' },
};

type FilterType = 'all' | string;
type FilterFormat = 'all' | 'square' | 'story' | 'landscape';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Stats card
  statsCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 20, ...theme.shadows.card },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 6 },
  statIconBg: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  statDivider: { width: 1, height: 36, backgroundColor: theme.border },
  typeBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  typeChipText: { fontSize: 12, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 20, ...theme.shadows.card },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  emptyCtaText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Filter section
  filterSection: { marginBottom: 16 },
  filterRow: { gap: 6, paddingBottom: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterChipText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  filterChipTextActive: { color: '#FFF' },
  filterChipCount: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, marginLeft: 2 },
  filterChipCountText: { fontSize: 9, fontWeight: '700', color: theme.textMuted },
  formatFilterRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  formatChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  formatChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  formatChipText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  formatChipTextActive: { color: '#FFF' },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: theme.error + '10', borderWidth: 1, borderColor: theme.error + '20' },
  clearFiltersText: { fontSize: 10, fontWeight: '600', color: theme.error },

  // Group label
  groupLabel: { fontSize: 12, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  // Entry card
  entryCard: { backgroundColor: theme.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', flexDirection: 'row', ...theme.shadows.card },
  entryThemeBar: { width: 4 },
  entryContent: { flex: 1, padding: 14 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  entryIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  entryInfo: { flex: 1 },
  entryTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  entrySubtitle: { fontSize: 11, fontWeight: '500', color: theme.textSecondary, marginTop: 2 },
  entryMeta: { alignItems: 'flex-end', gap: 4 },
  actionBadge: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  entryTime: { fontSize: 10, fontWeight: '500', color: theme.textMuted },

  // Bottom row
  entryBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryTags: { flexDirection: 'row', gap: 6 },
  entryTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  entryTagText: { fontSize: 10, fontWeight: '600', color: theme.textSecondary },
  themePreviewDot: { width: 8, height: 8, borderRadius: 4 },
  entryActions: { flexDirection: 'row', gap: 4 },
  entryActionBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: theme.backgroundSecondary },

  // Bottom CTA
  bottomCta: { marginTop: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Quick Create Grid
  quickCreateSection: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 20, ...theme.shadows.card },
  quickCreateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  quickCreateTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, letterSpacing: 0.3 },
  quickCreateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickCreateCard: { width: '31%' as any, borderRadius: 14, overflow: 'hidden' },
  quickCreateCardInner: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  quickCreateIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickCreateCardLabel: { fontSize: 11, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', marginBottom: 4 },
  quickCreateFormats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
