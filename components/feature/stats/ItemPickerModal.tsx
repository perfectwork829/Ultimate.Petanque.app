/**
 * Item Picker Modal for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx — allows filtering stats by
 * match, challenge, tournament, opponent, partner, terrain, or boules set.
 */
import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import type { Match, Challenge, Tournament, Player, Terrain, BoulesSet } from '@/types/petanque';

type PickerType = 'match' | 'challenge' | 'tournament' | 'opponent' | 'partner' | 'terrain' | 'boules';

interface ItemPickerModalProps {
  visible: boolean;
  onClose: () => void;
  itemPickerType: PickerType;
  itemPickerSearch: string;
  setItemPickerSearch: (s: string) => void;
  timeFilteredMatches: Match[];
  timeFilteredChallenges: Challenge[];
  tournaments: Tournament[];
  players: Player[];
  terrains: Terrain[];
  boulesSets: BoulesSet[];
  selfPlayer: Player | null;
  selectedMatchId: string | null;
  selectedChallengeId: string | null;
  selectedTournamentId: string | null;
  selectedOpponentId: string | null;
  selectedPartnerId: string | null;
  selectedTerrainId: string | null;
  selectedBoulesSetId: string | null;
  selectMatch: (id: string) => void;
  selectChallenge: (id: string) => void;
  selectTournament: (id: string) => void;
  selectOpponent: (id: string) => void;
  selectPartner: (id: string) => void;
  selectTerrain: (id: string) => void;
  selectBoulesSet: (id: string) => void;
  t: (section: string, key: string) => string;
  language: string;
}

export function ItemPickerModal({
  visible, onClose, itemPickerType, itemPickerSearch, setItemPickerSearch,
  timeFilteredMatches, timeFilteredChallenges, tournaments, players, terrains, boulesSets, selfPlayer,
  selectedMatchId, selectedChallengeId, selectedTournamentId, selectedOpponentId, selectedPartnerId, selectedTerrainId, selectedBoulesSetId,
  selectMatch, selectChallenge, selectTournament, selectOpponent, selectPartner, selectTerrain, selectBoulesSet,
  t, language,
}: ItemPickerModalProps) {
  const search = itemPickerSearch.toLowerCase();
  const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={s.modalContainer}>
        {/* Header */}
        <View style={s.modalHeader}>
          <View>
            <Text style={s.modalTitle}>
              {itemPickerType === 'match' ? t('profile', 'selectMatch') : itemPickerType === 'challenge' ? t('profile', 'selectChallenge') : itemPickerType === 'opponent' ? t('profile', 'selectOpponent') : itemPickerType === 'partner' ? t('profile', 'selectPartner') : itemPickerType === 'terrain' ? t('profile', 'selectTerrain') : itemPickerType === 'boules' ? t('profile', 'selectBoulesSet') : t('profile', 'selectTournament')}
            </Text>
          </View>
          <Pressable style={s.modalCloseButton} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={s.pickerSearchContainer}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput style={s.pickerSearchInput} value={itemPickerSearch} onChangeText={setItemPickerSearch} placeholder={t('common', 'search') + '...'} placeholderTextColor={theme.textMuted} />
          {itemPickerSearch.length > 0 ? <Pressable onPress={() => setItemPickerSearch('')}><MaterialIcons name="close" size={18} color={theme.textMuted} /></Pressable> : null}
        </View>

        {/* Match Picker */}
        {itemPickerType === 'match' ? (() => {
          const items = timeFilteredMatches.filter(m => { if (!search) return true; const allNames = [...m.teamA.playerNames, ...m.teamB.playerNames].join(' ').toLowerCase(); return allNames.includes(search) || m.mode.toLowerCase().includes(search) || m.format.toLowerCase().includes(search) || (m.tournamentName || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: m }) => { const dateStr = new Date(m.date).toLocaleDateString(locale, dateOpts); const isWin = m.winner === 'A'; const isSel = selectedMatchId === m.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectMatch(m.id)}><View style={[s.pickerItemIndicator, { backgroundColor: isWin ? theme.success : theme.error }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{m.teamA.playerNames.join(', ')}</Text><Text style={[s.pickerItemScore, { color: isWin ? theme.success : theme.error }]}>{m.teamA.score} - {m.teamB.score}</Text></View><Text style={s.pickerItemSubtitle} numberOfLines={1}>vs {m.teamB.playerNames.join(', ')}</Text><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{dateStr}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{t('formats', m.format)}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{m.mode === 'Tournoi' ? (m.tournamentName || t('modes', 'tournament')) : t('modes', 'training')}</Text></View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={theme.primary} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="sports" text={t('profile', 'noMatchesAvailable')} />;
        })() : null}

        {/* Challenge Picker */}
        {itemPickerType === 'challenge' ? (() => {
          const items = timeFilteredChallenges.filter(c => { if (!search) return true; return (t('challengeNames', c.type) || c.type).toLowerCase().includes(search) || (c.playerName || '').toLowerCase().includes(search) || (c.opponentName || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: c }) => { const dateStr = new Date(c.date).toLocaleDateString(locale, dateOpts); const isSel = selectedChallengeId === c.id; const lbl = c.type === 'precision' ? `${c.totalPoints || 0}/${c.maxPoints || 100} pts` : `${c.successCount || 0}/${c.totalShots || 10}`; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectChallenge(c.id)}><View style={[s.pickerItemIndicator, { backgroundColor: theme.accent }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle}>{t('challengeNames', c.type)}</Text><Text style={[s.pickerItemScore, { color: theme.accent }]}>{lbl}</Text></View><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{dateStr}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{c.mode === '1v1' ? `vs ${c.opponentName || '?'}` : 'Solo'}</Text>{c.carreauCount ? <><View style={s.pickerItemDot} /><Text style={[s.pickerItemMetaText, { color: theme.carreauColor }]}>{c.carreauCount} C</Text></> : null}</View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={theme.accent} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="flag" text={t('profile', 'noChallengesAvailable')} />;
        })() : null}

        {/* Tournament Picker */}
        {itemPickerType === 'tournament' ? (() => {
          const tournamentsWithMatches = tournaments.filter(tour => timeFilteredMatches.some(m => m.tournamentId === tour.id));
          const items = tournamentsWithMatches.filter(tour => { if (!search) return true; return tour.name.toLowerCase().includes(search) || (tour.location?.city || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: tour }) => { const mc = timeFilteredMatches.filter(m => m.tournamentId === tour.id).length; const dateStr = new Date(tour.date).toLocaleDateString(locale, dateOpts); const isSel = selectedTournamentId === tour.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectTournament(tour.id)}><View style={[s.pickerItemIndicator, { backgroundColor: theme.carreauColor }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{tour.name}</Text>{tour.finalResult ? <Text style={[s.pickerItemScore, { color: theme.carreauColor }]}>{t('palmaresResults', tour.finalResult)}</Text> : null}</View><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{dateStr}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{mc} {t('profile', 'matchesInTournament')}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{t('formats', tour.format)}</Text></View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={theme.carreauColor} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="emoji-events" text={t('profile', 'noTournamentsAvailable')} />;
        })() : null}

        {/* Partner Picker */}
        {itemPickerType === 'partner' ? (() => {
          const partnerIds = new Set<string>(); timeFilteredMatches.forEach(m => { m.teamA.players.forEach(pid => partnerIds.add(pid)); }); if (selfPlayer) partnerIds.delete(selfPlayer.id);
          const items = players.filter(p => partnerIds.has(p.id)).filter(p => { if (!search) return true; return p.name.toLowerCase().includes(search) || (p.club || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: p }) => { const mc = timeFilteredMatches.filter(m => m.teamA.players.includes(p.id)).length; const wins = timeFilteredMatches.filter(m => m.teamA.players.includes(p.id) && m.winner === 'A').length; const isSel = selectedPartnerId === p.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectPartner(p.id)}><View style={[s.pickerItemIndicator, { backgroundColor: theme.success }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{p.name}</Text><Text style={[s.pickerItemScore, { color: wins >= mc - wins ? theme.success : theme.error }]}>{wins}W-{mc - wins}L</Text></View><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{t('roles', p.role)}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{mc} {t('stats', 'matches')}</Text>{p.club ? <><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{p.club}</Text></> : null}</View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={theme.success} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="group" text={t('profile', 'noPartnersAvailable')} />;
        })() : null}

        {/* Terrain Picker */}
        {itemPickerType === 'terrain' ? (() => {
          const terrainsWithMatches = terrains.filter(terr => timeFilteredMatches.some(m => m.terrainId === terr.id));
          const items = terrainsWithMatches.filter(terr => { if (!search) return true; return terr.name.toLowerCase().includes(search) || terr.city.toLowerCase().includes(search) || (terr.type || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: terr }) => { const mc = timeFilteredMatches.filter(m => m.terrainId === terr.id).length; const wins = timeFilteredMatches.filter(m => m.terrainId === terr.id && m.winner === 'A').length; const isSel = selectedTerrainId === terr.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectTerrain(terr.id)}><View style={[s.pickerItemIndicator, { backgroundColor: '#8B5CF6' }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{terr.name}</Text><Text style={[s.pickerItemScore, { color: wins >= mc - wins ? theme.success : theme.error }]}>{wins}W-{mc - wins}L</Text></View><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{terr.city}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{t('terrainTypes', terr.type)}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{mc} {t('profile', 'matchesOnTerrain')}</Text></View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={'#8B5CF6'} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="sports-soccer" text={t('profile', 'noTerrainsAvailable')} />;
        })() : null}

        {/* Boules Set Picker */}
        {itemPickerType === 'boules' ? (() => {
          const setsWithData = boulesSets.filter(bs => timeFilteredMatches.some(m => m.boulesSetId === bs.id) || timeFilteredChallenges.some(c => c.boulesSetId === bs.id));
          const items = setsWithData.filter(bs => { if (!search) return true; return bs.name.toLowerCase().includes(search) || (bs.brand || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: bs }) => { const mc = timeFilteredMatches.filter(m => m.boulesSetId === bs.id).length; const cc = timeFilteredChallenges.filter(c => c.boulesSetId === bs.id).length; const wins = timeFilteredMatches.filter(m => m.boulesSetId === bs.id && m.winner === 'A').length; const isSel = selectedBoulesSetId === bs.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectBoulesSet(bs.id)}><View style={[s.pickerItemIndicator, { backgroundColor: '#D97706' }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{bs.name}</Text>{mc > 0 ? <Text style={[s.pickerItemScore, { color: wins >= mc - wins ? theme.success : theme.error }]}>{wins}W-{mc - wins}L</Text> : null}</View><View style={s.pickerItemMeta}>{bs.brand ? <><Text style={s.pickerItemMetaText}>{bs.brand}</Text><View style={s.pickerItemDot} /></> : null}{bs.diameter ? <><Text style={s.pickerItemMetaText}>{bs.diameter}mm</Text><View style={s.pickerItemDot} /></> : null}{bs.weight ? <><Text style={s.pickerItemMetaText}>{bs.weight}g</Text><View style={s.pickerItemDot} /></> : null}<Text style={s.pickerItemMetaText}>{mc} {t('stats', 'matches')}</Text>{cc > 0 ? <><View style={s.pickerItemDot} /><Text style={[s.pickerItemMetaText, { color: theme.accent }]}>{cc} {t('profile', 'challenges')}</Text></> : null}</View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={'#D97706'} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="sports-baseball" text={t('profile', 'noBoulesSetAvailable')} />;
        })() : null}

        {/* Opponent Picker */}
        {itemPickerType === 'opponent' ? (() => {
          const opponentIds = new Set<string>(); timeFilteredMatches.forEach(m => { m.teamB.players.forEach(pid => opponentIds.add(pid)); }); timeFilteredChallenges.forEach(c => { if (c.opponentId) opponentIds.add(c.opponentId); });
          const items = players.filter(p => opponentIds.has(p.id)).filter(p => { if (!search) return true; return p.name.toLowerCase().includes(search) || (p.club || '').toLowerCase().includes(search); });
          return items.length > 0 ? (
            <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} renderItem={({ item: p }) => { const mc = timeFilteredMatches.filter(m => m.teamB.players.includes(p.id)).length; const cc = timeFilteredChallenges.filter(c => c.mode === '1v1' && c.opponentId === p.id).length; const wins = timeFilteredMatches.filter(m => m.teamB.players.includes(p.id) && m.winner === 'A').length; const isSel = selectedOpponentId === p.id; return (<Pressable style={[s.pickerItem, isSel && s.pickerItemSelected]} onPress={() => selectOpponent(p.id)}><View style={[s.pickerItemIndicator, { backgroundColor: theme.pointColor }]} /><View style={s.pickerItemContent}><View style={s.pickerItemRow}><Text style={s.pickerItemTitle} numberOfLines={1}>{p.name}</Text><Text style={[s.pickerItemScore, { color: wins >= mc - wins ? theme.success : theme.error }]}>{wins}W-{mc - wins}L</Text></View><View style={s.pickerItemMeta}><Text style={s.pickerItemMetaText}>{t('roles', p.role)}</Text><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{mc} {t('stats', 'matches')}</Text>{cc > 0 ? <><View style={s.pickerItemDot} /><Text style={[s.pickerItemMetaText, { color: theme.accent }]}>{cc} {t('profile', 'challenges')}</Text></> : null}{p.club ? <><View style={s.pickerItemDot} /><Text style={s.pickerItemMetaText}>{p.club}</Text></> : null}</View></View>{isSel ? <MaterialIcons name="check-circle" size={22} color={theme.pointColor} /> : null}</Pressable>); }} />
          ) : <EmptyPicker icon="people" text={t('profile', 'noOpponentsAvailable')} />;
        })() : null}
      </SafeAreaView>
    </Modal>
  );
}

function EmptyPicker({ icon, text }: { icon: string; text: string }) {
  return (<View style={s.pickerEmpty}><MaterialIcons name={icon as any} size={48} color={theme.textMuted} /><Text style={s.pickerEmptyText}>{text}</Text></View>);
}

const s = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
  modalCloseButton: { padding: 8 },
  pickerSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  pickerSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 8, ...theme.shadows.card },
  pickerItemSelected: { borderWidth: 2, borderColor: theme.primary },
  pickerItemIndicator: { width: 4, height: '80%', borderRadius: 2, marginRight: 12 },
  pickerItemContent: { flex: 1 },
  pickerItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pickerItemTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, flex: 1, marginRight: 8 },
  pickerItemScore: { fontSize: 15, fontWeight: '700' },
  pickerItemSubtitle: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
  pickerItemMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  pickerItemMetaText: { fontSize: 11, color: theme.textMuted },
  pickerItemDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted },
  pickerEmpty: { alignItems: 'center', paddingVertical: 48 },
  pickerEmptyText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },
});
