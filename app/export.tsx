import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import {
  exportData,
  ExportFormat,
  ExportDataType,
  ExportPeriod,
  ExportPreset,
  CsvEncoding,
  CsvSeparator,
  PreviewData,
  computePeriodStats,
  generatePreview,
  getColumnsForDataType,
  ColumnDef,
} from '@/services/exportService';
import { Tournament, Match, Challenge, Player } from '@/types/petanque';

// ============================================
// STEP-BASED EXPORT WIZARD
// ============================================

type WizardStep = 'preset' | 'config' | 'preview';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { matches, challenges, tournaments, players, userStats } = useAppData();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('preset');

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [dataType, setDataType] = useState<ExportDataType>('matches');
  const [period, setPeriod] = useState<ExportPeriod>('all');
  const [exporting, setExporting] = useState(false);

  const [preset, setPreset] = useState<ExportPreset>('none');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [comparePeriod, setComparePeriod] = useState<ExportPeriod>('30d');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);

  const [showTournamentPicker, setShowTournamentPicker] = useState(false);
  const [showMatchPicker, setShowMatchPicker] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [showChallengePicker, setShowChallengePicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Column selection for CSV
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // CSV encoding & separator
  const [csvEncoding, setCsvEncoding] = useState<CsvEncoding>('utf8bom');
  const [csvSeparator, setCsvSeparator] = useState<CsvSeparator>(language === 'fr' ? ';' : ',');

  const lbl = useCallback((fr: string, en: string) => language === 'fr' ? fr : en, [language]);

  const availableSeasons = useMemo(() => {
    const now = new Date();
    const currentYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return Array.from({ length: 4 }, (_, i) => ({ year: currentYear - i, label: `${currentYear - i}-${currentYear - i + 1}` }));
  }, []);

  const tournamentsWithMatches = useMemo(() => tournaments.filter(tr => matches.some(m => m.tournamentId === tr.id)), [tournaments, matches]);
  const sortedMatches = useMemo(() => [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [matches]);
  const sortedChallenges = useMemo(() => [...challenges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [challenges]);

  const filteredPickerMatches = useMemo(() => {
    if (!pickerSearch.trim()) return sortedMatches;
    const s = pickerSearch.toLowerCase();
    return sortedMatches.filter(m => m.teamA.playerNames.some(n => n.toLowerCase().includes(s)) || m.teamB.playerNames.some(n => n.toLowerCase().includes(s)) || (m.tournamentName || '').toLowerCase().includes(s));
  }, [sortedMatches, pickerSearch]);

  const filteredPickerPlayers = useMemo(() => {
    if (!pickerSearch.trim()) return players;
    const s = pickerSearch.toLowerCase();
    return players.filter(p => p.name.toLowerCase().includes(s) || (p.club || '').toLowerCase().includes(s));
  }, [players, pickerSearch]);

  const filteredPickerChallenges = useMemo(() => {
    if (!pickerSearch.trim()) return sortedChallenges;
    const s = pickerSearch.toLowerCase();
    return sortedChallenges.filter(c => c.type.includes(s) || (c.opponentName || '').toLowerCase().includes(s));
  }, [sortedChallenges, pickerSearch]);

  // Delta preview for comparative
  const deltaPreview = useMemo(() => {
    if (preset !== 'comparative') return null;
    const filterP = (items: any[], p: ExportPeriod) => {
      if (p === 'all') return items;
      const cutoff = new Date();
      switch (p) { case '7d': cutoff.setDate(cutoff.getDate() - 7); break; case '30d': cutoff.setDate(cutoff.getDate() - 30); break; case '3m': cutoff.setMonth(cutoff.getMonth() - 3); break; case '6m': cutoff.setMonth(cutoff.getMonth() - 6); break; case '1y': cutoff.setFullYear(cutoff.getFullYear() - 1); break; }
      return items.filter((item: any) => new Date(item.date) >= cutoff);
    };
    const pLabels: Record<string, string> = language === 'fr' ? { all: 'Tout', '7d': '7j', '30d': '30j', '3m': '3m', '6m': '6m', '1y': '1an' } : { all: 'All', '7d': '7d', '30d': '30d', '3m': '3m', '6m': '6m', '1y': '1y' };
    return {
      statsA: computePeriodStats(filterP(matches, period), filterP(challenges, period), pLabels[period] || period),
      statsB: computePeriodStats(filterP(matches, comparePeriod), filterP(challenges, comparePeriod), pLabels[comparePeriod] || comparePeriod),
    };
  }, [preset, period, comparePeriod, matches, challenges, language]);

  const preview: PreviewData | null = useMemo(() => {
    const hasSelection = preset === 'none' || (preset === 'tournament' && selectedTournament) || (preset === 'season' && selectedSeason) || preset === 'comparative' || (preset === 'match' && selectedMatch) || (preset === 'player' && selectedPlayer) || (preset === 'challenge' && selectedChallenge);
    if (!hasSelection) return null;
    return generatePreview({ format, dataType, period, language, username: user?.username || '', preset, tournamentId: selectedTournament?.id, tournamentName: selectedTournament?.name, seasonYear: selectedSeason ?? undefined, comparePeriod: preset === 'comparative' ? comparePeriod : undefined, matchId: selectedMatch?.id, playerId: selectedPlayer?.id, playerName: selectedPlayer?.name, challengeId: selectedChallenge?.id }, matches, challenges, tournaments, userStats, 6);
  }, [format, dataType, period, language, preset, selectedTournament, selectedSeason, comparePeriod, selectedMatch, selectedPlayer, selectedChallenge, matches, challenges, tournaments, userStats, user]);

  const periods: { id: ExportPeriod; label: string }[] = [
    { id: 'all', label: lbl('Tout', 'All') },
    { id: '7d', label: lbl('7 jours', '7 days') },
    { id: '30d', label: lbl('30 jours', '30 days') },
    { id: '3m', label: '3 mois' },
    { id: '6m', label: '6 mois' },
    { id: '1y', label: lbl('1 an', '1 year') },
  ];

  const presetOptions: { id: ExportPreset; icon: string; label: string; desc: string; color: string }[] = [
    { id: 'none', icon: 'list-alt', label: lbl('Standard', 'Standard'), desc: lbl('Matchs, defis ou stats', 'Matches, challenges or stats'), color: theme.primary },
    { id: 'match', icon: 'sports', label: lbl('Par match', 'By match'), desc: lbl('Fiche detaillee', 'Detailed sheet'), color: '#10B981' },
    { id: 'challenge', icon: 'flag', label: lbl('Par defi', 'By challenge'), desc: lbl('Avec graphiques', 'With charts'), color: '#F59E0B' },
    { id: 'player', icon: 'person', label: lbl('Par joueur', 'By player'), desc: lbl('Stats individuelles', 'Individual stats'), color: '#8B5CF6' },
    { id: 'tournament', icon: 'emoji-events', label: lbl('Par tournoi', 'By tournament'), desc: lbl('Tous les matchs', 'All matches'), color: '#D97706' },
    { id: 'season', icon: 'date-range', label: lbl('Par saison', 'By season'), desc: 'Sept-Juin', color: '#059669' },
    { id: 'comparative', icon: 'compare-arrows', label: lbl('Comparatif', 'Comparative'), desc: lbl('Delta entre periodes', 'Delta between periods'), color: '#6366F1' },
  ];

  const canProceedToConfig = () => {
    if (preset === 'match') return !!selectedMatch;
    if (preset === 'challenge') return !!selectedChallenge;
    if (preset === 'player') return !!selectedPlayer;
    if (preset === 'tournament') return !!selectedTournament;
    if (preset === 'season') return !!selectedSeason;
    return true;
  };

  const showDataTypeInConfig = !['comparative', 'match', 'challenge'].includes(preset);
  const showPeriodInConfig = preset === 'none' || preset === 'comparative';

  const isExportDisabled = exporting || (preset === 'tournament' && !selectedTournament) || (preset === 'season' && !selectedSeason) || (preset === 'match' && !selectedMatch) || (preset === 'player' && !selectedPlayer) || (preset === 'challenge' && !selectedChallenge);

  const handleExport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExporting(true);
    const result = await exportData({
      format, dataType, period, language, username: user?.username || user?.email || 'Joueur',
      preset, tournamentId: selectedTournament?.id, tournamentName: selectedTournament?.name,
      seasonYear: selectedSeason ?? undefined, comparePeriod: preset === 'comparative' ? comparePeriod : undefined,
      matchId: selectedMatch?.id, playerId: selectedPlayer?.id, playerName: selectedPlayer?.name, challengeId: selectedChallenge?.id,
      selectedColumns: format === 'csv' ? selectedColumns : undefined,
      csvEncoding: format === 'csv' ? csvEncoding : undefined,
      csvSeparator: format === 'csv' ? csvSeparator : undefined,
    }, matches, challenges, tournaments, userStats);
    setExporting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(lbl('Export reussi', 'Export successful'), lbl('Fichier genere et partage', 'File generated and shared'));
    } else {
      showAlert(lbl('Erreur', 'Error'), result.error || lbl("Erreur lors de l'export", 'Export error'));
    }
  }, [format, dataType, period, language, user, matches, challenges, tournaments, userStats, showAlert, preset, selectedTournament, selectedSeason, comparePeriod, selectedMatch, selectedPlayer, selectedChallenge, lbl]);

  // Initialize selected columns when data type changes
  const availableColumns = useMemo(() => getColumnsForDataType(dataType), [dataType]);
  React.useEffect(() => {
    setSelectedColumns(availableColumns.filter(c => c.default).map(c => c.id));
  }, [dataType]);

  const handleToggleColumn = useCallback((colId: string) => {
    Haptics.selectionAsync();
    setSelectedColumns(prev => {
      if (prev.includes(colId)) {
        if (prev.length <= 1) return prev; // At least 1 column
        return prev.filter(c => c !== colId);
      }
      return [...prev, colId];
    });
  }, []);

  const handleToggleAllColumns = useCallback(() => {
    Haptics.selectionAsync();
    if (selectedColumns.length === availableColumns.length) {
      setSelectedColumns(availableColumns.filter(c => c.default).map(c => c.id));
    } else {
      setSelectedColumns(availableColumns.map(c => c.id));
    }
  }, [selectedColumns, availableColumns]);

  const handleSelectPreset = (id: ExportPreset) => {
    Haptics.selectionAsync();
    setPreset(id);
    setSelectedTournament(null); setSelectedSeason(null); setSelectedMatch(null); setSelectedPlayer(null); setSelectedChallenge(null);
    if (id === 'tournament') setDataType('matches');
    if (id === 'comparative') setDataType('statistics');
    if (id === 'challenge') setDataType('challenges');
  };

  const getSummaryText = () => {
    if (preset === 'match' && selectedMatch) return lbl(`Match du ${new Date(selectedMatch.date).toLocaleDateString('fr-FR')}`, `Match ${new Date(selectedMatch.date).toLocaleDateString('en-US')}`);
    if (preset === 'player' && selectedPlayer) return `${selectedPlayer.name}`;
    if (preset === 'challenge' && selectedChallenge) { const tl: Record<string, string> = { '10_tirs': '10 Tirs', '10_tirs_sautee': '10 Tirs sautee', 'precision': 'Precision' }; return `${tl[selectedChallenge.type] || selectedChallenge.type}`; }
    if (preset === 'tournament' && selectedTournament) return selectedTournament.name;
    if (preset === 'season' && selectedSeason) return `${lbl('Saison', 'Season')} ${selectedSeason}-${selectedSeason + 1}`;
    if (preset === 'comparative') return lbl('Comparatif', 'Comparative');
    return lbl('Standard', 'Standard');
  };

  const getDataTypeLabel = (id: ExportDataType) => ({ matches: lbl('Matchs', 'Matches'), challenges: lbl('Defis', 'Challenges'), statistics: lbl('Statistiques', 'Statistics') }[id]);

  const DeltaValue = ({ a, b, suffix = '' }: { a: number; b: number; suffix?: string }) => {
    const d = a - b;
    return <Text style={{ fontSize: 13, fontWeight: '700', color: d > 0 ? theme.success : d < 0 ? theme.error : theme.textMuted }}>{d > 0 ? '+' : ''}{d}{suffix}</Text>;
  };

  // Shared picker modal
  const renderPickerModal = (visible: boolean, onClose: () => void, title: string, data: any[], renderItem: any, emptyIcon: string, emptyText: string) => (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>{title}</Text>
          <Pressable style={s.modalCloseBtn} onPress={onClose}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
        </View>
        <View style={s.modalSearchBar}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput style={s.modalSearchInput} value={pickerSearch} onChangeText={setPickerSearch} placeholder={lbl('Rechercher...', 'Search...')} placeholderTextColor={theme.textMuted} />
          {pickerSearch.length > 0 ? <Pressable onPress={() => setPickerSearch('')} hitSlop={8}><MaterialIcons name="close" size={18} color={theme.textMuted} /></Pressable> : null}
        </View>
        <FlatList data={data} keyExtractor={(item: any) => item.id} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} renderItem={renderItem} ListEmptyComponent={<View style={s.emptyList}><MaterialIcons name={emptyIcon as any} size={40} color={theme.textMuted} /><Text style={s.emptyListText}>{emptyText}</Text></View>} />
      </SafeAreaView>
    </Modal>
  );

  // ============================================
  // STEP 1: PRESET SELECTION
  // ============================================
  const renderPresetStep = () => (
    <Animated.View entering={FadeIn.duration(300)}>
      <Text style={s.stepTitle}>{lbl('Quel type d\'export ?', 'What type of export?')}</Text>
      <Text style={s.stepSubtitle}>{lbl('Choisissez un prereglage pour configurer automatiquement votre export', 'Choose a preset to automatically configure your export')}</Text>

      <View style={s.presetList}>
        {presetOptions.map(p => {
          const active = preset === p.id;
          return (
            <Pressable key={p.id} style={[s.presetCard, active && { borderColor: p.color, backgroundColor: p.color + '08' }]} onPress={() => handleSelectPreset(p.id)}>
              <View style={[s.presetIconBg, { backgroundColor: active ? p.color : theme.backgroundSecondary }]}>
                <MaterialIcons name={p.icon as any} size={22} color={active ? '#FFF' : theme.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.presetCardTitle, active && { color: p.color }]}>{p.label}</Text>
                <Text style={s.presetCardDesc}>{p.desc}</Text>
              </View>
              {active ? <View style={[s.radioOuter, { borderColor: p.color }]}><View style={[s.radioInner, { backgroundColor: p.color }]} /></View> : <View style={s.radioOuter} />}
            </Pressable>
          );
        })}
      </View>

      {/* Inline selection for presets that need it */}
      {preset === 'match' ? (
        <View style={s.inlineSelection}>
          <Pressable style={s.selectionBtn} onPress={() => { setPickerSearch(''); setShowMatchPicker(true); }}>
            {selectedMatch ? (
              <View style={s.selectedItem}>
                <View style={[s.selectedIcon, { backgroundColor: '#10B98115' }]}><MaterialIcons name="sports" size={18} color="#10B981" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedName} numberOfLines={1}>{selectedMatch.teamA.playerNames.join(' + ')} vs {selectedMatch.teamB.playerNames.join(' + ')}</Text>
                  <Text style={s.selectedMeta}>{new Date(selectedMatch.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')} {'•'} {selectedMatch.teamA.score}-{selectedMatch.teamB.score}</Text>
                </View>
                <Pressable onPress={() => { setSelectedMatch(null); Haptics.selectionAsync(); }} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
              </View>
            ) : (
              <View style={s.placeholderItem}><MaterialIcons name="touch-app" size={18} color={theme.textMuted} /><Text style={s.placeholderText}>{lbl('Selectionner un match', 'Select a match')}</Text><MaterialIcons name="chevron-right" size={18} color={theme.textMuted} /></View>
            )}
          </Pressable>
        </View>
      ) : null}

      {preset === 'challenge' ? (
        <View style={s.inlineSelection}>
          <Pressable style={s.selectionBtn} onPress={() => { setPickerSearch(''); setShowChallengePicker(true); }}>
            {selectedChallenge ? (
              <View style={s.selectedItem}>
                <View style={[s.selectedIcon, { backgroundColor: '#F59E0B15' }]}><MaterialIcons name="flag" size={18} color="#F59E0B" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedName} numberOfLines={1}>{selectedChallenge.type === '10_tirs' ? '10 Tirs' : selectedChallenge.type === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision'} {selectedChallenge.mode === '1v1' ? `vs ${selectedChallenge.opponentName || '?'}` : 'Solo'}</Text>
                  <Text style={s.selectedMeta}>{new Date(selectedChallenge.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}{selectedChallenge.successRate != null ? ` • ${Math.round(selectedChallenge.successRate)}%` : ''}</Text>
                </View>
                <Pressable onPress={() => { setSelectedChallenge(null); Haptics.selectionAsync(); }} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
              </View>
            ) : (
              <View style={s.placeholderItem}><MaterialIcons name="touch-app" size={18} color={theme.textMuted} /><Text style={s.placeholderText}>{lbl('Selectionner un defi', 'Select a challenge')}</Text><MaterialIcons name="chevron-right" size={18} color={theme.textMuted} /></View>
            )}
          </Pressable>
        </View>
      ) : null}

      {preset === 'player' ? (
        <View style={s.inlineSelection}>
          <Pressable style={s.selectionBtn} onPress={() => { setPickerSearch(''); setShowPlayerPicker(true); }}>
            {selectedPlayer ? (
              <View style={s.selectedItem}>
                <View style={[s.selectedIcon, { backgroundColor: '#8B5CF615' }]}><Text style={{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' }}>{selectedPlayer.name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedName}>{selectedPlayer.name}</Text>
                  <Text style={s.selectedMeta}>{selectedPlayer.role} {'•'} {selectedPlayer.stats.matchesPlayed} matchs</Text>
                </View>
                <Pressable onPress={() => { setSelectedPlayer(null); Haptics.selectionAsync(); }} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
              </View>
            ) : (
              <View style={s.placeholderItem}><MaterialIcons name="touch-app" size={18} color={theme.textMuted} /><Text style={s.placeholderText}>{lbl('Selectionner un joueur', 'Select a player')}</Text><MaterialIcons name="chevron-right" size={18} color={theme.textMuted} /></View>
            )}
          </Pressable>
        </View>
      ) : null}

      {preset === 'tournament' ? (
        <View style={s.inlineSelection}>
          <Pressable style={s.selectionBtn} onPress={() => { setPickerSearch(''); setShowTournamentPicker(true); }}>
            {selectedTournament ? (
              <View style={s.selectedItem}>
                <View style={[s.selectedIcon, { backgroundColor: '#D9770615' }]}><MaterialIcons name="emoji-events" size={18} color="#D97706" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedName} numberOfLines={1}>{selectedTournament.name}</Text>
                  <Text style={s.selectedMeta}>{new Date(selectedTournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')} {'•'} {matches.filter(m => m.tournamentId === selectedTournament.id).length} matchs</Text>
                </View>
                <Pressable onPress={() => { setSelectedTournament(null); Haptics.selectionAsync(); }} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
              </View>
            ) : (
              <View style={s.placeholderItem}><MaterialIcons name="touch-app" size={18} color={theme.textMuted} /><Text style={s.placeholderText}>{lbl('Selectionner un tournoi', 'Select a tournament')}</Text><MaterialIcons name="chevron-right" size={18} color={theme.textMuted} /></View>
            )}
          </Pressable>
        </View>
      ) : null}

      {preset === 'season' ? (
        <View style={s.inlineSelection}>
          <View style={s.seasonRow}>
            {availableSeasons.map(ss => {
              const active = selectedSeason === ss.year;
              return (
                <Pressable key={ss.year} style={[s.seasonBtn, active && { backgroundColor: '#059669', borderColor: '#059669' }]} onPress={() => { Haptics.selectionAsync(); setSelectedSeason(active ? null : ss.year); }}>
                  <Text style={[s.seasonBtnText, active && { color: '#FFF' }]}>{ss.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hintText}>{lbl('Septembre a Juin', 'September to June')}</Text>
        </View>
      ) : null}
    </Animated.View>
  );

  // ============================================
  // STEP 2: CONFIG (Format + Data Type + Period)
  // ============================================
  const renderConfigStep = () => (
    <Animated.View entering={FadeIn.duration(300)}>
      <Text style={s.stepTitle}>{lbl('Configuration', 'Configuration')}</Text>

      {/* Format */}
      <Text style={s.configLabel}>FORMAT</Text>
      <View style={s.formatRow}>
        {[
          { id: 'pdf' as ExportFormat, icon: 'picture-as-pdf', label: 'PDF', desc: lbl('Document formate', 'Formatted document') },
          { id: 'csv' as ExportFormat, icon: 'table-chart', label: 'CSV', desc: lbl('Tableur', 'Spreadsheet') },
        ].map(f => (
          <Pressable key={f.id} style={[s.formatCard, format === f.id && s.formatCardActive]} onPress={() => { Haptics.selectionAsync(); setFormat(f.id); }}>
            <MaterialIcons name={f.icon as any} size={24} color={format === f.id ? theme.primary : theme.textMuted} />
            <Text style={[s.formatLabel, format === f.id && { color: theme.primary, fontWeight: '700' }]}>{f.label}</Text>
            <Text style={s.formatDesc}>{f.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Data type - only for relevant presets */}
      {showDataTypeInConfig ? (
        <>
          <Text style={s.configLabel}>{lbl('DONNEES', 'DATA')}</Text>
          <View style={s.dataTypeRow}>
            {[
              { id: 'matches' as ExportDataType, icon: 'sports', label: lbl('Matchs', 'Matches'), count: matches.length, disabled: preset === 'tournament' ? false : false },
              { id: 'challenges' as ExportDataType, icon: 'flag', label: lbl('Defis', 'Challenges'), count: challenges.length, disabled: preset === 'tournament' },
              { id: 'statistics' as ExportDataType, icon: 'bar-chart', label: 'Stats', count: null, disabled: false },
            ].map(dt => (
              <Pressable key={dt.id} style={[s.dataTypeBtn, dataType === dt.id && s.dataTypeBtnActive, dt.disabled && { opacity: 0.35 }]} onPress={() => { if (!dt.disabled) { Haptics.selectionAsync(); setDataType(dt.id); } }} disabled={dt.disabled}>
                <MaterialIcons name={dt.icon as any} size={18} color={dataType === dt.id ? theme.primary : theme.textSecondary} />
                <Text style={[s.dataTypeBtnText, dataType === dt.id && { color: theme.primary, fontWeight: '700' }]}>{dt.label}</Text>
                {dt.count != null ? <Text style={s.dataTypeBtnCount}>{dt.count}</Text> : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {/* Period */}
      {showPeriodInConfig ? (
        <>
          <Text style={s.configLabel}>{preset === 'comparative' ? lbl('PERIODE A', 'PERIOD A') : lbl('PERIODE', 'PERIOD')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {periods.map(p => (
              <Pressable key={p.id} style={[s.periodChip, period === p.id && s.periodChipActive]} onPress={() => { Haptics.selectionAsync(); setPeriod(p.id); }}>
                <Text style={[s.periodChipText, period === p.id && s.periodChipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* CSV Separator & Encoding */}
      {format === 'csv' ? (
        <>
          <Text style={s.configLabel}>{lbl('SEPARATEUR', 'SEPARATOR')}</Text>
          <View style={s.formatRow}>
            {[
              { id: ',' as CsvSeparator, label: lbl('Virgule (,)', 'Comma (,)'), desc: lbl('Standard EN', 'Standard EN') },
              { id: ';' as CsvSeparator, label: lbl('Point-virgule (;)', 'Semicolon (;)'), desc: lbl('Excel FR', 'Excel FR') },
              { id: '\t' as CsvSeparator, label: lbl('Tabulation', 'Tab'), desc: lbl('Universel', 'Universal') },
            ].map(sp => (
              <Pressable key={sp.id} style={[s.formatCard, csvSeparator === sp.id && s.formatCardActive, { paddingVertical: 12, paddingHorizontal: 10 }]} onPress={() => { Haptics.selectionAsync(); setCsvSeparator(sp.id); }}>
                <Text style={[s.formatLabel, { fontSize: 13 }, csvSeparator === sp.id && { color: theme.primary, fontWeight: '700' }]}>{sp.label}</Text>
                <Text style={s.formatDesc}>{sp.desc}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.configLabel}>{lbl('ENCODAGE', 'ENCODING')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {[
              { id: 'utf8bom' as CsvEncoding, label: 'UTF-8 BOM', desc: lbl('Excel moderne', 'Modern Excel') },
              { id: 'utf8' as CsvEncoding, label: 'UTF-8', desc: lbl('Standard web', 'Web standard') },
              { id: 'iso8859' as CsvEncoding, label: 'ISO-8859-1', desc: lbl('Ancien Excel', 'Legacy Excel') },
            ].map(enc => (
              <Pressable key={enc.id} style={[s.periodChip, csvEncoding === enc.id && s.periodChipActive, { paddingHorizontal: 14 }]} onPress={() => { Haptics.selectionAsync(); setCsvEncoding(enc.id); }}>
                <Text style={[s.periodChipText, csvEncoding === enc.id && s.periodChipTextActive]}>{enc.label}</Text>
                <Text style={{ fontSize: 10, color: csvEncoding === enc.id ? theme.primary : theme.textMuted, marginTop: 1 }}>{enc.desc}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* CSV Column Selector */}
      {format === 'csv' && availableColumns.length > 0 && showDataTypeInConfig && !['comparative', 'match', 'challenge'].includes(preset) ? (
        <>
          <View style={s.configLabelRow}>
            <Text style={s.configLabel}>{lbl('COLONNES', 'COLUMNS')}</Text>
            <Pressable style={s.toggleAllBtn} onPress={handleToggleAllColumns}>
              <MaterialIcons name={selectedColumns.length === availableColumns.length ? 'deselect' : 'select-all'} size={14} color={theme.primary} />
              <Text style={s.toggleAllBtnText}>{selectedColumns.length === availableColumns.length ? lbl('Par defaut', 'Default') : lbl('Tout', 'All')}</Text>
            </Pressable>
          </View>
          <View style={s.colGrid}>
            {availableColumns.map(col => {
              const active = selectedColumns.includes(col.id);
              return (
                <Pressable
                  key={col.id}
                  style={[s.colChip, active && s.colChipActive]}
                  onPress={() => handleToggleColumn(col.id)}
                >
                  <MaterialIcons name={active ? 'check-box' : 'check-box-outline-blank'} size={16} color={active ? theme.primary : theme.textMuted} />
                  <Text style={[s.colChipText, active && s.colChipTextActive]} numberOfLines={1}>
                    {language === 'fr' ? col.labelFr : col.labelEn}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.colHint}>{selectedColumns.length}/{availableColumns.length} {lbl('colonnes selectionnees', 'columns selected')}</Text>
        </>
      ) : null}

      {/* Period B for comparative */}
      {preset === 'comparative' ? (
        <>
          <Text style={[s.configLabel, { marginTop: 16 }]}>{lbl('PERIODE B', 'PERIOD B')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {periods.map(p => (
              <Pressable key={p.id} style={[s.periodChip, comparePeriod === p.id && { backgroundColor: '#6366F112', borderColor: '#6366F1' }]} onPress={() => { Haptics.selectionAsync(); setComparePeriod(p.id); }}>
                <Text style={[s.periodChipText, comparePeriod === p.id && { color: '#6366F1', fontWeight: '700' }]}>{p.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* Delta preview card */}
          {deltaPreview ? (
            <View style={s.deltaCard}>
              <View style={s.deltaCardHeader}>
                <MaterialIcons name="analytics" size={14} color="#6366F1" />
                <Text style={s.deltaCardTitle}>{lbl('Apercu delta', 'Delta preview')}</Text>
              </View>
              {[
                { label: lbl('Matchs', 'Games'), a: deltaPreview.statsA.totalMatches, b: deltaPreview.statsB.totalMatches },
                { label: lbl('Vict.', 'Win'), a: deltaPreview.statsA.winRate, b: deltaPreview.statsB.winRate, pct: true },
                { label: 'Tir', a: deltaPreview.statsA.tirRate, b: deltaPreview.statsB.tirRate, pct: true },
                { label: 'Carreau', a: deltaPreview.statsA.carreauRate, b: deltaPreview.statsB.carreauRate, pct: true },
              ].map((m, i) => (
                <View key={i} style={s.deltaRow}>
                  <Text style={s.deltaLabel}>{m.label}</Text>
                  <Text style={s.deltaValA}>{m.a}{m.pct ? '%' : ''}</Text>
                  <DeltaValue a={m.a} b={m.b} suffix={m.pct ? '%' : ''} />
                  <Text style={s.deltaValB}>{m.b}{m.pct ? '%' : ''}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );

  // ============================================
  // STEP 3: PREVIEW + EXPORT
  // ============================================
  const renderPreviewStep = () => (
    <Animated.View entering={FadeIn.duration(300)}>
      <Text style={s.stepTitle}>{lbl('Apercu et export', 'Preview and export')}</Text>

      {/* Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryChip}><MaterialIcons name="auto-awesome" size={12} color={theme.primary} /><Text style={s.summaryChipText}>{getSummaryText()}</Text></View>
          <View style={s.summaryChip}><MaterialIcons name={format === 'pdf' ? 'picture-as-pdf' : 'table-chart'} size={12} color={theme.accent} /><Text style={s.summaryChipText}>{format.toUpperCase()}</Text></View>
          {format === 'csv' ? <View style={s.summaryChip}><Text style={s.summaryChipText}>{csvSeparator === ',' ? lbl('Virgule', 'Comma') : csvSeparator === ';' ? lbl('Pt-virgule', 'Semicolon') : 'Tab'} • {csvEncoding === 'utf8bom' ? 'UTF-8 BOM' : csvEncoding === 'utf8' ? 'UTF-8' : 'ISO-8859-1'}</Text></View> : null}
          {showDataTypeInConfig ? <View style={s.summaryChip}><Text style={s.summaryChipText}>{getDataTypeLabel(dataType)}</Text></View> : null}
        </View>
      </View>

      {/* Preview table */}
      {preview && preview.headers.length > 0 && preview.rows.length > 0 ? (
        <View style={s.previewSection}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle}>{lbl('Apercu des donnees', 'Data preview')}</Text>
            <View style={s.previewBadge}><Text style={s.previewBadgeText}>{preview.totalRows} {lbl('lignes', 'rows')}</Text></View>
          </View>
          <View style={s.previewCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: '100%' }}>
              <View>
                <View style={s.previewHeaderRow}>
                  {preview.headers.map((h, i) => (
                    <View key={i} style={[s.previewCell, { minWidth: i === 0 ? 80 : 65 }]}>
                      <Text style={s.previewHeaderText} numberOfLines={1}>{h}</Text>
                    </View>
                  ))}
                </View>
                {preview.rows.map((row, ri) => (
                  <View key={ri} style={[s.previewRow, ri % 2 === 0 ? { backgroundColor: theme.backgroundSecondary } : null]}>
                    {row.map((cell, ci) => (
                      <View key={ci} style={[s.previewCell, { minWidth: ci === 0 ? 80 : 65 }]}>
                        <Text style={s.previewCellText} numberOfLines={1}>{cell}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                {preview.totalRows > preview.rows.length ? (
                  <View style={s.previewMore}><Text style={s.previewMoreText}>... {lbl(`et ${preview.totalRows - preview.rows.length} lignes de plus`, `and ${preview.totalRows - preview.rows.length} more rows`)}</Text></View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={s.noPreview}>
          <MaterialIcons name="info-outline" size={20} color={theme.textMuted} />
          <Text style={s.noPreviewText}>{lbl('Aucune donnee disponible pour cet export', 'No data available for this export')}</Text>
        </View>
      )}
    </Animated.View>
  );

  const steps: WizardStep[] = ['preset', 'config', 'preview'];
  const stepIndex = steps.indexOf(currentStep);
  const stepLabels = [lbl('Type', 'Type'), lbl('Config', 'Config'), lbl('Export', 'Export')];

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => { if (stepIndex > 0) { setCurrentStep(steps[stepIndex - 1]); } else { router.back(); } }}>
          <MaterialIcons name={stepIndex > 0 ? 'arrow-back' : 'close'} size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{lbl('Export', 'Export')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Step indicator */}
      <View style={s.stepIndicator}>
        {steps.map((step, i) => (
          <View key={step} style={s.stepDotRow}>
            <View style={[s.stepDot, i <= stepIndex && s.stepDotActive]}>
              {i < stepIndex ? <MaterialIcons name="check" size={12} color="#FFF" /> : <Text style={[s.stepDotText, i <= stepIndex && { color: '#FFF' }]}>{i + 1}</Text>}
            </View>
            <Text style={[s.stepDotLabel, i === stepIndex && { color: theme.primary, fontWeight: '700' }]}>{stepLabels[i]}</Text>
            {i < steps.length - 1 ? <View style={[s.stepLine, i < stepIndex && { backgroundColor: theme.primary }]} /> : null}
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {currentStep === 'preset' ? renderPresetStep() : null}
        {currentStep === 'config' ? renderConfigStep() : null}
        {currentStep === 'preview' ? renderPreviewStep() : null}
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {currentStep === 'preview' ? (
          <Pressable style={[s.exportBtn, isExportDisabled && { opacity: 0.5 }]} onPress={handleExport} disabled={isExportDisabled}>
            {exporting ? (
              <><ActivityIndicator size="small" color="#FFF" /><Text style={s.exportBtnText}>{lbl('Generation...', 'Generating...')}</Text></>
            ) : (
              <><MaterialIcons name="file-download" size={22} color="#FFF" /><Text style={s.exportBtnText}>{lbl(`Exporter en ${format.toUpperCase()}`, `Export as ${format.toUpperCase()}`)}</Text></>
            )}
          </Pressable>
        ) : (
          <Pressable style={[s.nextBtn, !canProceedToConfig() && { opacity: 0.4 }]} onPress={() => { if (canProceedToConfig()) { Haptics.selectionAsync(); setCurrentStep(steps[stepIndex + 1]); } }} disabled={!canProceedToConfig()}>
            <Text style={s.nextBtnText}>{lbl('Continuer', 'Continue')}</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
          </Pressable>
        )}
      </View>

      {/* Picker modals */}
      {renderPickerModal(showTournamentPicker, () => setShowTournamentPicker(false), lbl('Choisir un tournoi', 'Choose a tournament'), tournamentsWithMatches, ({ item: tr }: { item: Tournament }) => { const mc = matches.filter(m => m.tournamentId === tr.id).length; const sel = selectedTournament?.id === tr.id; return (<Pressable style={[s.pickerItem, sel && s.pickerItemSel]} onPress={() => { Haptics.selectionAsync(); setSelectedTournament(tr); setShowTournamentPicker(false); }}><View style={[s.pickerIcon, { backgroundColor: sel ? '#D97706' : theme.backgroundSecondary }]}><MaterialIcons name="emoji-events" size={22} color={sel ? '#FFF' : theme.textSecondary} /></View><View style={{ flex: 1 }}><Text style={s.pickerName}>{tr.name}</Text><Text style={s.pickerMeta}>{new Date(tr.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')} {'•'} {mc} matchs</Text></View>{sel ? <MaterialIcons name="check-circle" size={22} color="#D97706" /> : null}</Pressable>); }, 'emoji-events', lbl('Aucun tournoi avec des matchs', 'No tournaments with matches'))}

      {renderPickerModal(showMatchPicker, () => setShowMatchPicker(false), lbl('Choisir un match', 'Choose a match'), filteredPickerMatches, ({ item: m }: { item: Match }) => { const sel = selectedMatch?.id === m.id; const isWin = m.winner === 'A'; return (<Pressable style={[s.pickerItem, sel && s.pickerItemSel]} onPress={() => { Haptics.selectionAsync(); setSelectedMatch(m); setShowMatchPicker(false); }}><View style={[s.pickerIcon, { backgroundColor: sel ? '#10B981' : (isWin ? '#10B98115' : '#EF444415') }]}><MaterialIcons name="sports" size={22} color={sel ? '#FFF' : (isWin ? theme.success : theme.error)} /></View><View style={{ flex: 1 }}><Text style={s.pickerName} numberOfLines={1}>{m.teamA.playerNames.join(' + ')} vs {m.teamB.playerNames.join(' + ')}</Text><Text style={s.pickerMeta}>{new Date(m.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')} {'•'} {m.teamA.score}-{m.teamB.score} {'•'} {m.format}</Text></View>{sel ? <MaterialIcons name="check-circle" size={22} color="#10B981" /> : null}</Pressable>); }, 'sports', lbl('Aucun match', 'No matches'))}

      {renderPickerModal(showPlayerPicker, () => setShowPlayerPicker(false), lbl('Choisir un joueur', 'Choose a player'), filteredPickerPlayers, ({ item: p }: { item: Player }) => { const sel = selectedPlayer?.id === p.id; return (<Pressable style={[s.pickerItem, sel && s.pickerItemSel]} onPress={() => { Haptics.selectionAsync(); setSelectedPlayer(p); setShowPlayerPicker(false); }}><View style={[s.pickerIcon, { backgroundColor: sel ? '#8B5CF6' : theme.backgroundSecondary }]}><Text style={{ fontSize: 16, fontWeight: '700', color: sel ? '#FFF' : theme.textSecondary }}>{p.name.charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={s.pickerName}>{p.name}</Text><Text style={s.pickerMeta}>{p.role} {'•'} {p.stats.matchesPlayed} matchs {'•'} {p.stats.winRate}%</Text></View>{sel ? <MaterialIcons name="check-circle" size={22} color="#8B5CF6" /> : null}</Pressable>); }, 'person', lbl('Aucun joueur', 'No players'))}

      {renderPickerModal(showChallengePicker, () => setShowChallengePicker(false), lbl('Choisir un defi', 'Choose a challenge'), filteredPickerChallenges, ({ item: c }: { item: Challenge }) => { const sel = selectedChallenge?.id === c.id; const tl: Record<string, string> = language === 'fr' ? { '10_tirs': '10 Tirs', '10_tirs_sautee': '10 Tirs sautee', 'precision': 'Precision' } : { '10_tirs': '10 Shots', '10_tirs_sautee': '10 Lob', 'precision': 'Precision' }; return (<Pressable style={[s.pickerItem, sel && s.pickerItemSel]} onPress={() => { Haptics.selectionAsync(); setSelectedChallenge(c); setShowChallengePicker(false); }}><View style={[s.pickerIcon, { backgroundColor: sel ? '#F59E0B' : theme.backgroundSecondary }]}><MaterialIcons name="flag" size={22} color={sel ? '#FFF' : theme.textSecondary} /></View><View style={{ flex: 1 }}><Text style={s.pickerName}>{tl[c.type] || c.type} {c.mode === '1v1' ? `vs ${c.opponentName || '?'}` : 'Solo'}</Text><Text style={s.pickerMeta}>{new Date(c.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}{c.successRate != null ? ` • ${Math.round(c.successRate)}%` : ''}</Text></View>{sel ? <MaterialIcons name="check-circle" size={22} color="#F59E0B" /> : null}</Pressable>); }, 'flag', lbl('Aucun defi', 'No challenges'))}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },

  // Step indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 16, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  stepDotRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.backgroundSecondary, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  stepDotText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  stepDotLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginLeft: 6 },
  stepLine: { width: 28, height: 2, backgroundColor: theme.border, marginHorizontal: 6, borderRadius: 1 },

  // Scroll content
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Step titles
  stepTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: theme.textSecondary, lineHeight: 20, marginBottom: 20 },

  // Preset cards
  presetList: { gap: 8 },
  presetCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 2, borderColor: theme.border, gap: 12, ...theme.shadows.card },
  presetIconBg: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  presetCardTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  presetCardDesc: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6 },

  // Inline selection (preset specifics)
  inlineSelection: { marginTop: 14, paddingLeft: 4 },
  selectionBtn: { backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border, overflow: 'hidden', ...theme.shadows.card },
  selectedItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  selectedIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selectedName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  selectedMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  placeholderItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  placeholderText: { flex: 1, fontSize: 14, color: theme.textMuted },
  seasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  seasonBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  hintText: { fontSize: 11, color: theme.textMuted, fontStyle: 'italic', marginTop: 8, paddingLeft: 4 },

  // Config step
  configLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 10, marginTop: 20 },
  formatRow: { flexDirection: 'row', gap: 12 },
  formatCard: { flex: 1, backgroundColor: theme.surface, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card, gap: 6 },
  formatCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '05' },
  formatLabel: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  formatDesc: { fontSize: 11, color: theme.textMuted, textAlign: 'center' },
  dataTypeRow: { flexDirection: 'row', gap: 8 },
  dataTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.surface, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border },
  dataTypeBtnActive: { borderColor: theme.primary, backgroundColor: theme.primary + '08' },
  dataTypeBtnText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  dataTypeBtnCount: { fontSize: 10, fontWeight: '700', color: theme.textMuted, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  configLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  toggleAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.primary + '12', borderRadius: 12 },
  toggleAllBtnText: { fontSize: 11, fontWeight: '600', color: theme.primary },
  colGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border },
  colChipActive: { borderColor: theme.primary, backgroundColor: theme.primary + '08' },
  colChipText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  colChipTextActive: { color: theme.primary },
  colHint: { fontSize: 11, color: theme.textMuted, fontStyle: 'italic', marginTop: 8, paddingLeft: 2 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  periodChipActive: { backgroundColor: theme.primary + '12', borderColor: theme.primary },
  periodChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  periodChipTextActive: { color: theme.primary, fontWeight: '700' },

  // Delta card
  deltaCard: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#6366F120', ...theme.shadows.card },
  deltaCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  deltaCardTitle: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  deltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  deltaLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, width: 65 },
  deltaValA: { fontSize: 13, fontWeight: '600', color: '#6366F1', width: 42, textAlign: 'right' },
  deltaValB: { fontSize: 13, fontWeight: '600', color: theme.accent, width: 42, textAlign: 'right' },

  // Preview step
  summaryCard: { backgroundColor: theme.surface, borderRadius: 12, padding: 12, marginBottom: 16, ...theme.shadows.card },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  summaryChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  previewSection: {},
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  previewTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  previewBadge: { backgroundColor: theme.primary + '15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  previewBadgeText: { fontSize: 10, fontWeight: '700', color: theme.primary },
  previewCard: { backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, ...theme.shadows.card },
  previewHeaderRow: { flexDirection: 'row', backgroundColor: theme.primary + '08', borderBottomWidth: 2, borderBottomColor: theme.primary + '30' },
  previewRow: { flexDirection: 'row' },
  previewCell: { paddingHorizontal: 8, paddingVertical: 7, borderRightWidth: 1, borderRightColor: theme.border + '60' },
  previewHeaderText: { fontSize: 10, fontWeight: '700', color: theme.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
  previewCellText: { fontSize: 11, color: theme.textPrimary },
  previewMore: { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.backgroundSecondary },
  previewMoreText: { fontSize: 11, fontWeight: '600', color: theme.textMuted, fontStyle: 'italic', textAlign: 'center' },
  noPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 16, ...theme.shadows.card },
  noPreviewText: { flex: 1, fontSize: 13, color: theme.textMuted, lineHeight: 18 },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 14, ...theme.shadows.cardElevated },
  exportBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 14, ...theme.shadows.cardElevated },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Picker modals
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, padding: 14, borderRadius: 12, marginBottom: 8, ...theme.shadows.card },
  pickerItemSel: { borderWidth: 2, borderColor: theme.primary },
  pickerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickerName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  emptyList: { alignItems: 'center', paddingVertical: 48 },
  emptyListText: { fontSize: 14, color: theme.textMuted, marginTop: 12 },
});
