import React, { useState, useMemo, useCallback, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  visible: boolean;
  onClose: () => void;
  tournaments: any[];
}

function TournamentPickerModal({ visible, onClose, tournaments }: Props) {
  const { t, language } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'all' | 'À venir' | 'En cours' | 'Terminé'>('all');

  const statusOrder: Record<string, number> = { 'En cours': 0, 'À venir': 1, 'Terminé': 2 };

  const filteredTournaments = useMemo(() => {
    const list = statusFilter === 'all' ? [...tournaments] : tournaments.filter(t => t.status === statusFilter);
    return list.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
  }, [tournaments, statusFilter]);

  const statusCounts = useMemo(() => ({
    all: tournaments.length,
    'À venir': tournaments.filter(t => t.status === 'À venir').length,
    'En cours': tournaments.filter(t => t.status === 'En cours').length,
    'Terminé': tournaments.filter(t => t.status === 'Terminé').length,
  }), [tournaments]);

  const renderItem = useCallback(({ item: tournament }: { item: any }) => {
    const statusColors: Record<string, { bg: string; text: string }> = {
      'À venir': { bg: theme.primary + '15', text: theme.primary },
      'En cours': { bg: theme.warning + '15', text: theme.warning },
      'Terminé': { bg: theme.success + '15', text: theme.success },
    };
    const colors = statusColors[tournament.status as keyof typeof statusColors] || statusColors['À venir'];
    return (
      <Pressable style={s.tPickerItem} onPress={() => { onClose(); router.push(`/tournament/${tournament.id}`); }}>
        <View style={s.tPickerIcon}><MaterialIcons name="emoji-events" size={28} color={theme.carreauColor} /></View>
        <View style={s.tPickerInfo}>
          <Text style={s.tPickerName} numberOfLines={1}>{tournament.name}</Text>
          <View style={s.tPickerMeta}>
            <MaterialIcons name="event" size={12} color={theme.textMuted} />
            <Text style={s.tPickerDate}>{new Date(tournament.date).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            <View style={s.tPickerDot} />
            <Text style={s.tPickerCity}>{tournament.location.city}</Text>
          </View>
          <View style={s.tPickerBadges}>
            <View style={[s.tPickerBadge, { backgroundColor: colors.bg }]}>
              <Text style={[s.tPickerBadgeText, { color: colors.text }]}>
                {tournament.status === 'À venir' ? t('tournamentStatus', 'upcoming') : tournament.status === 'En cours' ? t('tournamentStatus', 'inProgress') : t('tournamentStatus', 'completed')}
              </Text>
            </View>
            <View style={[s.tPickerBadge, { backgroundColor: theme.backgroundSecondary }]}>
              <Text style={[s.tPickerBadgeText, { color: theme.textSecondary }]}>{t('formats', tournament.format)}</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
      </Pressable>
    );
  }, [t, language, onClose]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.closeBtn} onPress={onClose}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          <Text style={s.title}>{t('home', 'myTournaments')}</Text>
          <Pressable style={s.addBtn} onPress={() => { onClose(); router.push('/tournament/new'); }}><MaterialIcons name="add" size={24} color={theme.primary} /></Pressable>
        </View>
        {tournaments.length > 0 ? (
          <FlatList
            data={filteredTournaments}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={s.content}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            ListHeaderComponent={
              <View style={s.statusFilterRow}>
                {(['all', 'À venir', 'En cours', 'Terminé'] as const).map((status) => {
                  const isActive = statusFilter === status;
                  const statusConfig: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; color: string }> = { 'all': { icon: 'layers', color: theme.textSecondary }, 'À venir': { icon: 'event', color: theme.primary }, 'En cours': { icon: 'play-circle-filled', color: theme.warning }, 'Terminé': { icon: 'check-circle', color: theme.success } };
                  const cfg = statusConfig[status];
                  return (
                    <Pressable key={status} style={[s.statusChip, isActive && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setStatusFilter(status)}>
                      <MaterialIcons name={cfg.icon} size={14} color={isActive ? '#FFF' : cfg.color} />
                      <Text style={[s.statusChipText, isActive && { color: '#FFF' }, !isActive && { color: cfg.color }]}>{status === 'all' ? t('common', 'all') : status === 'À venir' ? t('tournamentStatus', 'upcoming') : status === 'En cours' ? t('tournamentStatus', 'inProgress') : t('tournamentStatus', 'completed')}</Text>
                      <View style={[s.statusChipCount, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}><Text style={[s.statusChipCountText, isActive && { color: '#FFF' }]}>{statusCounts[status]}</Text></View>
                    </Pressable>
                  );
                })}
              </View>
            }
            ListEmptyComponent={
              <View style={s.emptyFilter}>
                <MaterialIcons name="filter-list-off" size={40} color={theme.textMuted} />
                <Text style={s.emptyFilterText}>{t('home', 'noTournamentFilter')}</Text>
                <Pressable style={s.resetFilterBtn} onPress={() => setStatusFilter('all')}><Text style={s.resetFilterText}>{t('common', 'seeAll')}</Text></Pressable>
              </View>
            }
          />
        ) : (
          <ScrollView style={s.content} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={s.emptyTournament}>
              <View style={s.emptyTournamentIcon}><MaterialIcons name="emoji-events" size={56} color={theme.carreauColor} /></View>
              <Text style={s.emptyTournamentTitle}>{t('home', 'noTournament')}</Text>
              <Text style={s.emptyTournamentText}>{t('home', 'noTournamentText')}</Text>
              <Pressable style={s.createBtn} onPress={() => { onClose(); router.push('/tournament/new'); }}>
                <MaterialIcons name="add" size={20} color="#FFF" /><Text style={s.createBtnText}>{t('home', 'createTournament')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default memo(TournamentPickerModal);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  content: { flex: 1 },
  scrollContent: { padding: 16 },
  statusFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#FFF', borderRadius: 9999, borderWidth: 1.5, borderColor: '#E2E8F0' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  statusChipCount: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  statusChipCountText: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },
  tPickerItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 12, ...theme.shadows.card },
  tPickerIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: theme.carreauColor + '15', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  tPickerInfo: { flex: 1 },
  tPickerName: { fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginBottom: 6 },
  tPickerMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tPickerDate: { fontSize: 12, color: theme.textMuted, marginLeft: 4 },
  tPickerDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted, marginHorizontal: 6 },
  tPickerCity: { fontSize: 12, color: theme.textMuted },
  tPickerBadges: { flexDirection: 'row', gap: 8 },
  tPickerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tPickerBadgeText: { fontSize: 11, fontWeight: '600' },
  emptyFilter: { alignItems: 'center', paddingVertical: 40 },
  emptyFilterText: { fontSize: 14, color: theme.textMuted, marginTop: 12, marginBottom: 16 },
  resetFilterBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.primary + '15', borderRadius: 9999 },
  resetFilterText: { fontSize: 13, fontWeight: '600', color: theme.primary },
  emptyTournament: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTournamentIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.carreauColor + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTournamentTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  emptyTournamentText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.carreauColor, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  createBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
