/**
 * useItemFilter — extracted from stats.tsx.
 * Manages item-level filter state (match, challenge, tournament,
 * opponent, partner, terrain, boules) and exposes filtered data +
 * selection callbacks.
 */
import { useState, useMemo, useCallback } from 'react';
import * as Haptics from '@/services/haptics';
import type { Match, Challenge, Tournament, Player, Terrain, BoulesSet } from '@/types/petanque';

export type ItemFilterType = 'all' | 'match' | 'challenge' | 'tournament' | 'opponent' | 'partner' | 'terrain' | 'boules';
export type PickerType = 'match' | 'challenge' | 'tournament' | 'opponent' | 'partner' | 'terrain' | 'boules';

interface UseItemFilterInput {
  timeFilteredMatches: Match[];
  timeFilteredChallenges: Match[] | Challenge[];
  matches: Match[];
  challenges: Challenge[];
  tournaments: Tournament[];
  players: Player[];
  terrains: Terrain[];
  boulesSets: BoulesSet[];
  language: string;
  t: (section: string, key: string) => string;
}

export function useItemFilter({
  timeFilteredMatches,
  timeFilteredChallenges,
  matches,
  challenges,
  tournaments,
  players,
  terrains,
  boulesSets,
  language,
  t,
}: UseItemFilterInput) {
  // ── State ──────────────────────────────────────────────
  const [itemFilterType, setItemFilterType] = useState<ItemFilterType>('all');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(null);
  const [selectedBoulesSetId, setSelectedBoulesSetId] = useState<string | null>(null);
  const [showItemPickerModal, setShowItemPickerModal] = useState(false);
  const [itemPickerType, setItemPickerType] = useState<PickerType>('match');
  const [itemPickerSearch, setItemPickerSearch] = useState('');

  // ── Derived data ───────────────────────────────────────
  const filteredMatches = useMemo(() => {
    if (itemFilterType === 'match' && selectedMatchId) return timeFilteredMatches.filter(m => m.id === selectedMatchId);
    if (itemFilterType === 'tournament' && selectedTournamentId) return timeFilteredMatches.filter(m => m.tournamentId === selectedTournamentId);
    if (itemFilterType === 'challenge') return [];
    if (itemFilterType === 'opponent' && selectedOpponentId) return timeFilteredMatches.filter(m => m.teamB.players.includes(selectedOpponentId));
    if (itemFilterType === 'partner' && selectedPartnerId) return timeFilteredMatches.filter(m => m.teamA.players.includes(selectedPartnerId));
    if (itemFilterType === 'terrain' && selectedTerrainId) return timeFilteredMatches.filter(m => m.terrainId === selectedTerrainId);
    if (itemFilterType === 'boules' && selectedBoulesSetId) return timeFilteredMatches.filter(m => m.boulesSetId === selectedBoulesSetId);
    return timeFilteredMatches;
  }, [timeFilteredMatches, itemFilterType, selectedMatchId, selectedTournamentId, selectedOpponentId, selectedPartnerId, selectedTerrainId, selectedBoulesSetId]);

  const filteredChallenges = useMemo(() => {
    const tfc = timeFilteredChallenges as Challenge[];
    if (itemFilterType === 'challenge' && selectedChallengeId) return tfc.filter(c => c.id === selectedChallengeId);
    if (itemFilterType === 'opponent' && selectedOpponentId) return tfc.filter(c => c.mode === '1v1' && c.opponentId === selectedOpponentId);
    if (itemFilterType === 'boules' && selectedBoulesSetId) return tfc.filter(c => c.boulesSetId === selectedBoulesSetId);
    if (itemFilterType === 'match' || itemFilterType === 'tournament' || itemFilterType === 'partner' || itemFilterType === 'terrain') return [];
    return tfc;
  }, [timeFilteredChallenges, itemFilterType, selectedChallengeId, selectedMatchId, selectedTournamentId, selectedOpponentId, selectedPartnerId, selectedTerrainId, selectedBoulesSetId]);

  const activeFilterLabel = useMemo(() => {
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

    if (itemFilterType === 'match' && selectedMatchId) {
      const m = matches.find(m => m.id === selectedMatchId);
      if (m) {
        const dateStr = new Date(m.date).toLocaleDateString(locale, dateOpts);
        return `${m.teamA.playerNames[0]?.split(' ')[0] || '?'} vs ${m.teamB.playerNames[0]?.split(' ')[0] || '?'} (${dateStr})`;
      }
    }
    if (itemFilterType === 'challenge' && selectedChallengeId) {
      const c = challenges.find(c => c.id === selectedChallengeId);
      if (c) {
        const dateStr = new Date(c.date).toLocaleDateString(locale, dateOpts);
        return `${t('challengeNames', c.type)} (${dateStr})`;
      }
    }
    if (itemFilterType === 'tournament' && selectedTournamentId) {
      const tour = tournaments.find(t => t.id === selectedTournamentId);
      if (tour) return tour.name;
    }
    if (itemFilterType === 'opponent' && selectedOpponentId) {
      const opp = players.find(p => p.id === selectedOpponentId);
      if (opp) return `vs ${opp.name}`;
    }
    if (itemFilterType === 'partner' && selectedPartnerId) {
      const partner = players.find(p => p.id === selectedPartnerId);
      if (partner) return `${t('statsExtra', 'withPartner')} ${partner.name}`;
    }
    if (itemFilterType === 'terrain' && selectedTerrainId) {
      const terr = terrains.find(te => te.id === selectedTerrainId);
      if (terr) return terr.name;
    }
    if (itemFilterType === 'boules' && selectedBoulesSetId) {
      const bs = boulesSets.find(b => b.id === selectedBoulesSetId);
      if (bs) return bs.name;
    }
    return null;
  }, [itemFilterType, selectedMatchId, selectedChallengeId, selectedTournamentId, selectedOpponentId, selectedPartnerId, selectedTerrainId, selectedBoulesSetId, matches, challenges, tournaments, players, terrains, boulesSets, language]);

  // ── Actions ────────────────────────────────────────────
  const clearItemFilter = useCallback(() => {
    setItemFilterType('all');
    setSelectedMatchId(null);
    setSelectedChallengeId(null);
    setSelectedTournamentId(null);
    setSelectedOpponentId(null);
    setSelectedPartnerId(null);
    setSelectedTerrainId(null);
    setSelectedBoulesSetId(null);
  }, []);

  const openItemPicker = useCallback((type: PickerType) => {
    setItemPickerType(type);
    setItemPickerSearch('');
    setShowItemPickerModal(true);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedMatchId(null);
    setSelectedChallengeId(null);
    setSelectedTournamentId(null);
    setSelectedOpponentId(null);
    setSelectedPartnerId(null);
    setSelectedTerrainId(null);
    setSelectedBoulesSetId(null);
  }, []);

  const selectMatch = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('match');
    setSelectedMatchId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectChallenge = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('challenge');
    setSelectedChallengeId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectTournament = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('tournament');
    setSelectedTournamentId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectOpponent = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('opponent');
    setSelectedOpponentId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectPartner = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('partner');
    setSelectedPartnerId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectTerrain = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('terrain');
    setSelectedTerrainId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  const selectBoulesSet = useCallback((id: string) => {
    resetSelection();
    setItemFilterType('boules');
    setSelectedBoulesSetId(id);
    setShowItemPickerModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [resetSelection]);

  return {
    // State
    itemFilterType,
    selectedMatchId,
    selectedChallengeId,
    selectedTournamentId,
    selectedOpponentId,
    selectedPartnerId,
    selectedTerrainId,
    selectedBoulesSetId,
    showItemPickerModal,
    setShowItemPickerModal,
    itemPickerType,
    itemPickerSearch,
    setItemPickerSearch,
    // Derived
    filteredMatches,
    filteredChallenges,
    activeFilterLabel,
    // Actions
    clearItemFilter,
    openItemPicker,
    selectMatch,
    selectChallenge,
    selectTournament,
    selectOpponent,
    selectPartner,
    selectTerrain,
    selectBoulesSet,
  };
}
