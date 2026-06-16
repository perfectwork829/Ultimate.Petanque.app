import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  TextInput,
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import config, { GameFormat, TournamentType } from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import ShareModal from '@/components/ui/ShareModal';
import ShareRequestModal from '@/components/ui/ShareRequestModal';
import { createShareLink } from '@/services/shareService';
import { SimplifiedShotNotation, SimpleShotRecord } from '@/components';
import { showInterstitial } from '@/services/adService';
import { predictMatch, getEloRank, formatEloDelta, ELO_INITIAL } from '@/services/eloService';
import { analyzePlayerRoles, getSuggestionColor, getRoleIcon, getRoleColor, RoleSuggestion } from '@/services/roleAnalysisService';
import { detectLinkedPlayers, createShareRequests } from '@/services/matchShareService';
import { useAuth } from '@/template';
import { useAlert } from '@/template';

// Tournament phases configuration - IDs are DB values (French), labels translated at display time
const PHASE_IDS = {
  BASE: [
    { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
    { id: '1/16 finale', labelKey: '1/16 finale', shortKey: '1/16' },
    { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
    { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
    { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
    { id: 'Petite finale', labelKey: 'Petite F.', shortKey: 'PF' },
    { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
  ],
  BY_CADRAGE: {
    'Poules': [
      { id: 'Poule 1', labelKey: 'Poule 1', shortKey: 'P1' },
      { id: 'Poule 2', labelKey: 'Poule 2', shortKey: 'P2' },
      { id: 'Poule 3', labelKey: 'Poule 3', shortKey: 'P3' },
      { id: 'Classement', labelKey: 'Classement', shortKey: 'CL' },
    ],
    'Élimination directe': [
      { id: '1/16 finale', labelKey: '1/16 finale', shortKey: '1/16' },
      { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
      { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Mixte': [
      { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
      { id: '1/8 finale', labelKey: '1/8 finale', shortKey: '1/8' },
      { id: 'Quart de finale', labelKey: 'Quarts', shortKey: 'QF' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Suisse': [
      { id: 'Ronde 1', labelKey: 'Ronde 1', shortKey: 'R1' },
      { id: 'Ronde 2', labelKey: 'Ronde 2', shortKey: 'R2' },
      { id: 'Ronde 3', labelKey: 'Ronde 3', shortKey: 'R3' },
      { id: 'Ronde 4', labelKey: 'Ronde 4', shortKey: 'R4' },
      { id: 'Ronde 5', labelKey: 'Ronde 5', shortKey: 'R5' },
      { id: 'Classement', labelKey: 'Class.', shortKey: 'CL' },
    ],
    'A/B/C': [
      { id: 'Poules', labelKey: 'Poules', shortKey: 'PL' },
      { id: 'Tableau A', labelKey: 'Tab. A', shortKey: 'A' },
      { id: 'Tableau B', labelKey: 'Tab. B', shortKey: 'B' },
      { id: 'Tableau C', labelKey: 'Tab. C', shortKey: 'C' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
    'Tirage intégral': [
      { id: 'Tour 1', labelKey: 'Tour 1', shortKey: 'T1' },
      { id: 'Tour 2', labelKey: 'Tour 2', shortKey: 'T2' },
      { id: 'Tour 3', labelKey: 'Tour 3', shortKey: 'T3' },
      { id: 'Demi-finale', labelKey: 'Demis', shortKey: 'DF' },
      { id: 'Finale', labelKey: 'Finale', shortKey: 'F' },
    ],
  } as Record<TournamentType, { id: string; labelKey: string; shortKey: string }[]>,
} as const;

const TOURNAMENT_BRACKETS = ['A', 'B', 'C', 'D'] as const;
type TournamentBracket = typeof TOURNAMENT_BRACKETS[number];

interface Mene {
  id: number;
  teamAPoints: number;
  teamBPoints: number;
  duration: number;
  isNull?: boolean;
}

interface RoleSegmentState {
  role: PlayerRoleType;
  actions: {
    tirs: number;
    tirsSuccess: number;
    points: number;
    pointsSuccess: number;
    carreaux: number;
  };
}

interface PlayerActionState {
  playerId: string;
  playerName: string;
  team: 'A' | 'B';
  actions: {
    tirs: number;
    tirsSuccess: number;
    points: number;
    pointsSuccess: number;
    carreaux: number;
  };
  detailedShots?: SimpleShotRecord[];
  roleSegments?: RoleSegmentState[];
}

type PlayerRoleType = 'Pointeur' | 'Milieu' | 'Tireur';

const ROLES_BY_FORMAT: Record<GameFormat, PlayerRoleType[]> = {
  'Tête-à-tête': [],
  'Doublette': ['Pointeur', 'Tireur'],
  'Triplette': ['Pointeur', 'Milieu', 'Tireur'],
};

interface TeamPlayerWithRole {
  playerId: string;
  role: PlayerRoleType;
}

type ActionType = 'tir' | 'point' | 'carreau';

export default function NewMatchScreen() {
  const insets = useSafeAreaInsets();
  const { tournamentId, revanche, format: revancheFormat, teamA: revancheTeamA, teamB: revancheTeamB, seriesWinsA: initialWinsA, seriesWinsB: initialWinsB, seriesId: initialSeriesId } = useLocalSearchParams<{ 
    tournamentId?: string;
    revanche?: string;
    format?: string;
    teamA?: string;
    teamB?: string;
    seriesWinsA?: string;
    seriesWinsB?: string;
    seriesId?: string;
  }>();
  const { players, tournaments, matches, selfPlayer, terrains, boulesSets } = useAppData();
  const { addMatch } = useAppActions();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const fr = language === 'fr';
  
  const isRevanche = revanche === 'true';
  const seriesWinsA = parseInt(initialWinsA || '0');
  const seriesWinsB = parseInt(initialWinsB || '0');
  const isFinale = seriesWinsA === 1 && seriesWinsB === 1;
  const [seriesId] = useState(() => initialSeriesId || (isRevanche ? `series-${Date.now()}` : undefined));
  const currentMatchNumber = seriesWinsA + seriesWinsB + 1;
  const linkedTournament = tournamentId ? tournaments.find(t => t.id === tournamentId) : null;
  const isTournamentMode = !!linkedTournament;
  
  const buildPhases = useCallback((phaseList: { id: string; labelKey: string; shortKey: string }[]) => {
    return phaseList.map(p => ({ id: p.id, label: t('tournamentPhases', p.labelKey), short: t('tournamentPhases', p.shortKey) }));
  }, [t]);

  const BASE_PHASES = useMemo(() => buildPhases(PHASE_IDS.BASE), [buildPhases]);

  const tournamentPhases = useMemo(() => {
    if (!linkedTournament) return BASE_PHASES;
    const cadragePhases = PHASE_IDS.BY_CADRAGE[linkedTournament.type];
    if (!cadragePhases) return BASE_PHASES;
    return buildPhases(cadragePhases);
  }, [linkedTournament, BASE_PHASES, buildPhases]);

  const tournamentHistory = useMemo(() => {
    if (!linkedTournament) return { lastPhase: null, lastBracket: null, lastTeamAPlayers: [] as string[] };
    const prevMatches = matches
      .filter(m => m.tournamentId === linkedTournament.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const firstPhase = tournamentPhases[0]?.id || 'Poules';
    
    if (prevMatches.length === 0) {
      const defaultPlayers = selfPlayer ? [selfPlayer.id] : [];
      return { lastPhase: firstPhase, lastBracket: null, lastTeamAPlayers: defaultPlayers };
    }
    
    const last = prevMatches[0];
    const lastWon = last.winner === 'A';
    let suggestedPhase = last.tournamentPhase;
    if (lastWon && suggestedPhase) {
      const idx = tournamentPhases.findIndex(p => p.id === suggestedPhase);
      if (idx < tournamentPhases.length - 1) {
        suggestedPhase = tournamentPhases[idx + 1].id;
      }
    }
    const lastTeamAPlayers = last.teamA.players.filter(id => players.some(p => p.id === id));
    return { lastPhase: suggestedPhase, lastBracket: last.tournamentBracket || null, lastTeamAPlayers };
  }, [linkedTournament, matches, players, tournamentPhases, selfPlayer]);
  
  // States
  const [format, setFormat] = useState<GameFormat>(linkedTournament?.format || (isRevanche && revancheFormat ? revancheFormat as GameFormat : 'Doublette'));
  const [teamAScore, setTeamAScore] = useState(0);
  const [teamBScore, setTeamBScore] = useState(0);
  const [teamAPlayers, setTeamAPlayers] = useState<TeamPlayerWithRole[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<TeamPlayerWithRole[]>([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState<'A' | 'B' | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<string | null>(tournamentHistory.lastPhase);
  const [selectedBracket, setSelectedBracket] = useState<TournamentBracket | null>(tournamentHistory.lastBracket as TournamentBracket | null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchTime, setMatchTime] = useState(0);
  const [meneTime, setMeneTime] = useState(0);
  const [menes, setMenes] = useState<Mene[]>([]);
  const [currentMenePoints, setCurrentMenePoints] = useState({ teamA: 0, teamB: 0 });
  const [isNullMene, setIsNullMene] = useState(false);
  const [playerActions, setPlayerActions] = useState<PlayerActionState[]>([]);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [hasExitedFullscreen, setHasExitedFullscreen] = useState(false);
  const [showActionsEditor, setShowActionsEditor] = useState(false);
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const [editorNotationPlayer, setEditorNotationPlayer] = useState<{ id: string; name: string; team: 'A' | 'B' } | null>(null);
  const [editorNotationType, setEditorNotationType] = useState<'tir' | 'point'>('tir');
  const [showEditorNotation, setShowEditorNotation] = useState(false);
  const [showAdvancedNotation, setShowAdvancedNotation] = useState(false);
  const [advancedNotationPlayer, setAdvancedNotationPlayer] = useState<{ id: string; name: string; team: 'A' | 'B' } | null>(null);
  const [advancedNotationType, setAdvancedNotationType] = useState<'tir' | 'point'>('tir');
  const [advancedShotRecords, setAdvancedShotRecords] = useState<SimpleShotRecord[]>([]);
  const [notationMode, setNotationMode] = useState<'quick' | 'detailed'>('quick');
  const [actionHistory, setActionHistory] = useState<Record<string, Array<{type: 'tir' | 'point' | 'carreau', success: boolean}>>>({});
  const [roleSuggestions, setRoleSuggestions] = useState<Map<string, RoleSuggestion>>(new Map());
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(() => selfPlayer?.terrainId || null);
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearch, setTerrainSearch] = useState('');
  const [selectedBoulesSetId, setSelectedBoulesSetId] = useState<string | null>(() => {
    const primary = boulesSets.find(bs => bs.isPrimary);
    return primary ? primary.id : null;
  });
  const [showBoulesSetPicker, setShowBoulesSetPicker] = useState(false);
  const [savedMatchIdForShare, setSavedMatchIdForShare] = useState<string | null>(null);
  const [showPostMatchShare, setShowPostMatchShare] = useState(false);
  const [isSavingForShare, setIsSavingForShare] = useState(false);
  const [isSharingSeries, setIsSharingSeries] = useState(false);
  const [showShareRequestModal, setShowShareRequestModal] = useState(false);
  const [shareRequestItemId, setShareRequestItemId] = useState<string | null>(null);
  const [shareRequestPlayerIds, setShareRequestPlayerIds] = useState<string[]>([]);
  const [quickShareWinnerState, setQuickShareWinnerState] = useState<'idle' | 'loading' | 'sent' | 'no_accounts'>('idle');
  const [quickShareWinnerCount, setQuickShareWinnerCount] = useState(0);
  const localPlayersWarningShown = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxScore = config.game.maxScore;

  const maxPointsPerMene = useMemo(() => {
    return format === 'Tête-à-tête' ? 3 : 6;
  }, [format]);

  const availableRoles = useMemo(() => {
    return ROLES_BY_FORMAT[format] || [];
  }, [format]);

  const selectedTerrain = useMemo(() => {
    if (!selectedTerrainId) return null;
    return terrains.find(t => t.id === selectedTerrainId) || null;
  }, [selectedTerrainId, terrains]);

  const selectedBoulesSet = useMemo(() => {
    if (!selectedBoulesSetId) return null;
    return boulesSets.find(bs => bs.id === selectedBoulesSetId) || null;
  }, [selectedBoulesSetId, boulesSets]);

  // Dynamic notation card layout based on player count
  const notationCardLayout = useMemo(() => {
    const total = teamAPlayers.length + teamBPlayers.length;
    const sw = Dimensions.get('window').width || 375;
    const padding = 24;
    if (total <= 2) {
      const gap = 12;
      const w = Math.min(220, Math.floor((sw - padding - gap) / 2));
      return { cardWidth: w, gap: 12, isCompact: false, isUltraCompact: false };
    } else if (total <= 4) {
      const gap = 10;
      const w = Math.floor((sw - padding - gap) / 2);
      return { cardWidth: w, gap: 10, isCompact: true, isUltraCompact: false };
    } else {
      const gap = 8;
      const w = Math.floor((sw - padding - gap * 2) / 3);
      return { cardWidth: w, gap: 8, isCompact: true, isUltraCompact: true };
    }
  }, [teamAPlayers.length, teamBPlayers.length]);

  // Sort terrains by match frequency (most played first)
  const sortedTerrains = useMemo(() => {
    const terrainMatchCount: Record<string, number> = {};
    matches.forEach(m => {
      if (m.terrainId) {
        terrainMatchCount[m.terrainId] = (terrainMatchCount[m.terrainId] || 0) + 1;
      }
    });
    const s = terrainSearch.toLowerCase();
    return [...terrains]
      .filter(t => !s || t.name.toLowerCase().includes(s) || t.city.toLowerCase().includes(s) || (t.type && t.type.toLowerCase().includes(s)))
      .map(t => ({ ...t, _matchCount: terrainMatchCount[t.id] || 0 }))
      .sort((a, b) => b._matchCount - a._matchCount);
  }, [terrains, matches, terrainSearch]);

  const maxPlayersPerTeam = useMemo(() => {
    switch (format) {
      case 'Tête-à-tête': return 1;
      case 'Doublette': return 2;
      case 'Triplette': return 3;
      default: return 2;
    }
  }, [format]);

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return players;
    const search = playerSearch.toLowerCase();
    return players.filter(p => 
      p.name.toLowerCase().includes(search) ||
      p.club?.toLowerCase().includes(search) ||
      p.role.toLowerCase().includes(search)
    );
  }, [players, playerSearch]);

  // Compute most played partner for pre-selection
  const mostPlayedPartner = useMemo(() => {
    if (!selfPlayer) return null;
    const partnerCounts: Record<string, number> = {};
    matches.forEach(m => {
      const inA = m.teamA.players.includes(selfPlayer.id);
      const inB = m.teamB.players.includes(selfPlayer.id);
      if (inA && m.teamA.players.length > 1) {
        m.teamA.players.forEach(pid => {
          if (pid !== selfPlayer.id) partnerCounts[pid] = (partnerCounts[pid] || 0) + 1;
        });
      } else if (inB && m.teamB.players.length > 1) {
        m.teamB.players.forEach(pid => {
          if (pid !== selfPlayer.id) partnerCounts[pid] = (partnerCounts[pid] || 0) + 1;
        });
      }
    });
    const entries = Object.entries(partnerCounts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const bestId = entries[0][0];
    const partner = players.find(p => p.id === bestId);
    return partner || null;
  }, [selfPlayer, matches, players]);

  // Auto-include self player (and most played partner for doublette/triplette)
  useEffect(() => {
    if (isRevanche) return;
    if (!selfPlayer || teamAPlayers.length > 0) return;
    
    if (isTournamentMode) {
      if (tournamentHistory.lastTeamAPlayers.length > 0) {
        const playersWithRoles = tournamentHistory.lastTeamAPlayers.map(id => {
          const player = players.find(p => p.id === id);
          return { playerId: id, role: (player?.role || 'Milieu') as PlayerRoleType };
        });
        // If previous team was only self, try adding most played partner
        if (playersWithRoles.length === 1 && playersWithRoles[0].playerId === selfPlayer.id && mostPlayedPartner && (format === 'Doublette' || format === 'Triplette')) {
          playersWithRoles.push({ playerId: mostPlayedPartner.id, role: (mostPlayedPartner.role || 'Milieu') as PlayerRoleType });
        }
        setTeamAPlayers(playersWithRoles);
      } else {
        const initial: TeamPlayerWithRole[] = [{ playerId: selfPlayer.id, role: (selfPlayer.role || 'Milieu') as PlayerRoleType }];
        if (mostPlayedPartner && (format === 'Doublette' || format === 'Triplette')) {
          initial.push({ playerId: mostPlayedPartner.id, role: (mostPlayedPartner.role || 'Milieu') as PlayerRoleType });
        }
        setTeamAPlayers(initial);
      }
    } else {
      const initial: TeamPlayerWithRole[] = [{ playerId: selfPlayer.id, role: (selfPlayer.role || 'Milieu') as PlayerRoleType }];
      if (mostPlayedPartner && (format === 'Doublette' || format === 'Triplette')) {
        initial.push({ playerId: mostPlayedPartner.id, role: (mostPlayedPartner.role || 'Milieu') as PlayerRoleType });
      }
      setTeamAPlayers(initial);
    }
  }, [selfPlayer, isTournamentMode, tournamentHistory.lastTeamAPlayers, players, mostPlayedPartner, format]);

  // Pre-populate teams from revanche
  useEffect(() => {
    if (isRevanche) {
      if (revancheTeamA) {
        const teamANames = decodeURIComponent(revancheTeamA).split(',').map(n => n.trim());
        const teamAPlayersWithRoles = teamANames.map(name => {
          const player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
          if (player) {
            return { playerId: player.id, role: (player.role || 'Milieu') as PlayerRoleType };
          }
          return null;
        }).filter((p): p is TeamPlayerWithRole => p !== null);
        if (teamAPlayersWithRoles.length > 0) {
          setTeamAPlayers(teamAPlayersWithRoles);
        }
      }
      if (revancheTeamB) {
        const teamBNames = decodeURIComponent(revancheTeamB).split(',').map(n => n.trim());
        const teamBPlayersWithRoles = teamBNames.map(name => {
          const player = players.find(p => p.name.toLowerCase() === name.toLowerCase());
          if (player) {
            return { playerId: player.id, role: (player.role || 'Milieu') as PlayerRoleType };
          }
          return null;
        }).filter((p): p is TeamPlayerWithRole => p !== null);
        if (teamBPlayersWithRoles.length > 0) {
          setTeamBPlayers(teamBPlayersWithRoles);
        }
      }
    }
  }, [isRevanche, revancheTeamA, revancheTeamB, players]);

  useEffect(() => {
    if (linkedTournament) {
      setFormat(linkedTournament.format);
      if (tournamentHistory.lastPhase && !selectedPhase) {
        setSelectedPhase(tournamentHistory.lastPhase);
      }
      if (tournamentHistory.lastBracket && !selectedBracket) {
        setSelectedBracket(tournamentHistory.lastBracket as TournamentBracket);
      }
    }
  }, [linkedTournament, tournamentHistory]);

  useEffect(() => {
    if (selectedPhase === 'Poules') {
      setSelectedBracket(null);
    }
  }, [selectedPhase]);

  const togglePlayer = (playerId: string, team: 'A' | 'B') => {
    Haptics.selectionAsync();
    const setTeam = team === 'A' ? setTeamAPlayers : setTeamBPlayers;
    const otherTeam = team === 'A' ? teamBPlayers : teamAPlayers;
    const currentTeam = team === 'A' ? teamAPlayers : teamBPlayers;

    if (otherTeam.some(p => p.playerId === playerId)) {
      Alert.alert(t('common', 'error'), t('match', 'errorAlreadyInTeam'));
      return;
    }

    if (currentTeam.some(p => p.playerId === playerId)) {
      setTeam(prev => prev.filter(p => p.playerId !== playerId));
    } else {
      if (currentTeam.length >= maxPlayersPerTeam) {
        Alert.alert(t('match', 'errorTeamFull'), `Maximum ${maxPlayersPerTeam} - ${format}`);
        return;
      }
      const player = players.find(p => p.id === playerId);
      let defaultRole: PlayerRoleType = 'Milieu';
      if (availableRoles.length > 0) {
        const playerPreferredRole = player?.role as PlayerRoleType;
        defaultRole = availableRoles.includes(playerPreferredRole) 
          ? playerPreferredRole 
          : availableRoles[0];
      }
      setTeam(prev => [...prev, { playerId, role: defaultRole }]);
    }
  };

  const updatePlayerRole = (playerId: string, team: 'A' | 'B', newRole: PlayerRoleType) => {
    Haptics.selectionAsync();
    const setTeam = team === 'A' ? setTeamAPlayers : setTeamBPlayers;
    setTeam(prev => prev.map(p => 
      p.playerId === playerId ? { ...p, role: newRole } : p
    ));
  };

  const getPlayerName = (id: string) => {
    if (selfPlayer && id === selfPlayer.id) {
      return selfPlayer.name || t('history', 'me');
    }
    return players.find(p => p.id === id)?.name || '?';
  };

  const getTeamPlayerIds = (team: TeamPlayerWithRole[]): string[] => {
    return team.map(p => p.playerId);
  };

  useEffect(() => {
    if (teamAPlayers.length > maxPlayersPerTeam) {
      setTeamAPlayers(prev => prev.slice(0, maxPlayersPerTeam));
    }
    if (teamBPlayers.length > maxPlayersPerTeam) {
      setTeamBPlayers(prev => prev.slice(0, maxPlayersPerTeam));
    }
  }, [maxPlayersPerTeam, teamAPlayers.length, teamBPlayers.length]);

  useEffect(() => {
    if (availableRoles.length === 0) return;
    
    setTeamAPlayers(prev => prev.map(p => {
      if (!availableRoles.includes(p.role)) {
        return { ...p, role: availableRoles[0] };
      }
      return p;
    }));
    
    setTeamBPlayers(prev => prev.map(p => {
      if (!availableRoles.includes(p.role)) {
        return { ...p, role: availableRoles[0] };
      }
      return p;
    }));
  }, [availableRoles]);

  // Compute role suggestions for all players in teams
  useEffect(() => {
    if (matches.length < 2) return;
    const allPlayerIds = [...teamAPlayers.map(p => p.playerId), ...teamBPlayers.map(p => p.playerId)];
    const newSuggestions = new Map<string, RoleSuggestion>();
    for (const pid of allPlayerIds) {
      const suggestion = analyzePlayerRoles(pid, matches, language);
      if (suggestion) newSuggestions.set(pid, suggestion);
    }
    setRoleSuggestions(newSuggestions);
  }, [teamAPlayers, teamBPlayers, matches, language]);

  // Initialize player actions when teams change
  useEffect(() => {
    const allPlayers = [
      ...teamAPlayers.map(p => ({ id: p.playerId, team: 'A' as const })),
      ...teamBPlayers.map(p => ({ id: p.playerId, team: 'B' as const })),
    ];
    
    setPlayerActions(prev => {
      const newActions: PlayerActionState[] = allPlayers.map(({ id, team }) => {
        const existing = prev.find(p => p.playerId === id);
        if (existing) return { ...existing, team };
        return {
          playerId: id,
          playerName: getPlayerName(id),
          team,
          actions: { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 },
        };
      });
      return newActions;
    });
  }, [teamAPlayers, teamBPlayers]);

  // Get current role for a player
  const getPlayerCurrentRole = useCallback((playerId: string): PlayerRoleType | null => {
    const inA = teamAPlayers.find(p => p.playerId === playerId);
    if (inA) return inA.role;
    const inB = teamBPlayers.find(p => p.playerId === playerId);
    if (inB) return inB.role;
    return null;
  }, [teamAPlayers, teamBPlayers]);

  const recordAction = useCallback((playerId: string, actionType: ActionType, success: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const currentRole = getPlayerCurrentRole(playerId);
    setPlayerActions(prev => prev.map(p => {
      if (p.playerId !== playerId) return p;
      const newActions = { ...p.actions };
      if (actionType === 'tir') {
        newActions.tirs++;
        if (success) newActions.tirsSuccess++;
      } else if (actionType === 'point') {
        newActions.points++;
        if (success) newActions.pointsSuccess++;
      } else if (actionType === 'carreau') {
        newActions.tirs++;
        newActions.tirsSuccess++;
        newActions.carreaux++;
      }
      // Track per-role segment
      let roleSegments = [...(p.roleSegments || [])];
      if (currentRole) {
        const existingSeg = roleSegments.find(s => s.role === currentRole);
        if (existingSeg) {
          const sa = { ...existingSeg.actions };
          if (actionType === 'tir') { sa.tirs++; if (success) sa.tirsSuccess++; }
          else if (actionType === 'point') { sa.points++; if (success) sa.pointsSuccess++; }
          else if (actionType === 'carreau') { sa.tirs++; sa.tirsSuccess++; sa.carreaux++; }
          roleSegments = roleSegments.map(s => s.role === currentRole ? { ...s, actions: sa } : s);
        } else {
          const sa = { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 };
          if (actionType === 'tir') { sa.tirs = 1; if (success) sa.tirsSuccess = 1; }
          else if (actionType === 'point') { sa.points = 1; if (success) sa.pointsSuccess = 1; }
          else if (actionType === 'carreau') { sa.tirs = 1; sa.tirsSuccess = 1; sa.carreaux = 1; }
          roleSegments.push({ role: currentRole, actions: sa });
        }
      }
      return { ...p, actions: newActions, roleSegments };
    }));
    setActionHistory(prev => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), { type: actionType, success }],
    }));
  }, [getPlayerCurrentRole]);

  const undoLastAction = useCallback((playerId: string) => {
    setActionHistory(prev => {
      const history = prev[playerId];
      if (!history || history.length === 0) return prev;
      const lastAction = history[history.length - 1];
      
      setPlayerActions(prevActions => prevActions.map(p => {
        if (p.playerId !== playerId) return p;
        const newActions = { ...p.actions };
        if (lastAction.type === 'tir') {
          newActions.tirs = Math.max(0, newActions.tirs - 1);
          if (lastAction.success) newActions.tirsSuccess = Math.max(0, newActions.tirsSuccess - 1);
        } else if (lastAction.type === 'point') {
          newActions.points = Math.max(0, newActions.points - 1);
          if (lastAction.success) newActions.pointsSuccess = Math.max(0, newActions.pointsSuccess - 1);
        } else if (lastAction.type === 'carreau') {
          newActions.tirs = Math.max(0, newActions.tirs - 1);
          newActions.tirsSuccess = Math.max(0, newActions.tirsSuccess - 1);
          newActions.carreaux = Math.max(0, newActions.carreaux - 1);
        }
        return { ...p, actions: newActions };
      }));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return { ...prev, [playerId]: history.slice(0, -1) };
    });
  }, []);

  const openAdvancedNotation = useCallback((playerId: string, playerName: string, team: 'A' | 'B', actionType: 'tir' | 'point') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setAdvancedNotationPlayer({ id: playerId, name: playerName, team });
    setAdvancedNotationType(actionType);
    setShowAdvancedNotation(true);
  }, []);

  const handleAdvancedShotSubmit = useCallback((record: SimpleShotRecord) => {
    setAdvancedShotRecords(prev => [...prev, record]);
    
    const advCurrentRole = getPlayerCurrentRole(record.playerId);
    setPlayerActions(prev => prev.map(p => {
      if (p.playerId !== record.playerId) return p;
      const newActions = { ...p.actions };
      if (record.actionType === 'tir') {
        newActions.tirs++;
        if (record.success) newActions.tirsSuccess++;
        if (record.carreau) newActions.carreaux++;
      } else if (record.actionType === 'point') {
        newActions.points++;
        if (record.success) newActions.pointsSuccess++;
      }
      // Track per-role segment for detailed notation
      let roleSegments = [...(p.roleSegments || [])];
      if (advCurrentRole) {
        const existingSeg = roleSegments.find(s => s.role === advCurrentRole);
        if (existingSeg) {
          const sa = { ...existingSeg.actions };
          if (record.actionType === 'tir') { sa.tirs++; if (record.success) sa.tirsSuccess++; if (record.carreau) sa.carreaux++; }
          else { sa.points++; if (record.success) sa.pointsSuccess++; }
          roleSegments = roleSegments.map(s => s.role === advCurrentRole ? { ...s, actions: sa } : s);
        } else {
          const sa = { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 };
          if (record.actionType === 'tir') { sa.tirs = 1; if (record.success) sa.tirsSuccess = 1; if (record.carreau) sa.carreaux = 1; }
          else { sa.points = 1; if (record.success) sa.pointsSuccess = 1; }
          roleSegments.push({ role: advCurrentRole, actions: sa });
        }
      }
      const detailedShots = p.detailedShots || [];
      return { ...p, actions: newActions, detailedShots: [...detailedShots, record], roleSegments };
    }));
    
    // Track in action history for undo
    const historyType = record.carreau ? 'carreau' as const : record.actionType as ('tir' | 'point');
    setActionHistory(prev => ({
      ...prev,
      [record.playerId]: [...(prev[record.playerId] || []), { type: historyType, success: record.success }],
    }));
    
    setShowAdvancedNotation(false);
    setAdvancedNotationPlayer(null);
  }, []);

  const getPlayerActionStats = (playerId: string) => {
    return playerActions.find(p => p.playerId === playerId)?.actions || 
      { tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0 };
  };

  // Timer functions
  const startTimer = useCallback(() => {
    if (!isTimerRunning) {
      setIsTimerRunning(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [isTimerRunning]);

  const pauseTimer = useCallback(() => {
    setIsTimerRunning(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const resetTimer = useCallback(() => {
    Alert.alert(
      t('match', 'reset'),
      t('match', 'resetMatch'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('match', 'reset'),
          style: 'destructive',
          onPress: () => {
            setIsTimerRunning(false);
            setMatchTime(0);
            setMeneTime(0);
            setMenes([]);
            setCurrentMenePoints({ teamA: 0, teamB: 0 });
            setIsNullMene(false);
            setTeamAScore(0);
            setTeamBScore(0);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  }, []);

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setMatchTime(prev => prev + 1);
        setMeneTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMenePoint = (team: 'teamA' | 'teamB', points: number) => {
    Haptics.selectionAsync();
    setIsNullMene(false);
    setCurrentMenePoints(prev => ({
      ...prev,
      [team]: prev[team] === points ? 0 : points,
    }));
  };

  const handleNullMene = () => {
    Haptics.selectionAsync();
    setIsNullMene(prev => !prev);
    if (!isNullMene) {
      setCurrentMenePoints({ teamA: 0, teamB: 0 });
    }
  };

  const addMene = () => {
    if (!isNullMene && currentMenePoints.teamA === 0 && currentMenePoints.teamB === 0) {
      Alert.alert(t('common', 'error'), t('match', 'errorSelectPoints'));
      return;
    }
    if (currentMenePoints.teamA > 0 && currentMenePoints.teamB > 0) {
      Alert.alert(t('common', 'error'), t('match', 'errorOneTeam'));
      return;
    }

    const newMene: Mene = {
      id: menes.length + 1,
      teamAPoints: currentMenePoints.teamA,
      teamBPoints: currentMenePoints.teamB,
      duration: meneTime,
      isNull: isNullMene,
    };

    setMenes(prev => [...prev, newMene]);
    setTeamAScore(prev => prev + currentMenePoints.teamA);
    setTeamBScore(prev => prev + currentMenePoints.teamB);
    setCurrentMenePoints({ teamA: 0, teamB: 0 });
    setIsNullMene(false);
    setMeneTime(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Undo last mène
  const undoLastMene = () => {
    if (menes.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    
    const lastMene = menes[menes.length - 1];
    setTeamAScore(prev => Math.max(0, prev - lastMene.teamAPoints));
    setTeamBScore(prev => Math.max(0, prev - lastMene.teamBPoints));
    setMenes(prev => prev.slice(0, -1));
  };

  // Helper: check if all players in the match are locally created (no real user profiles)
  const hasOnlyLocalPlayers = useCallback((): boolean => {
    const allPlayerIds = [...getTeamPlayerIds(teamAPlayers), ...getTeamPlayerIds(teamBPlayers)].filter(id => id !== '1' && id !== '2');
    if (allPlayerIds.length === 0) return false;
    // A real user profile has player.id === player.userId
    return allPlayerIds.every(pid => {
      const p = players.find(pl => pl.id === pid);
      return !p || !p.userId || p.id !== p.userId;
    });
  }, [teamAPlayers, teamBPlayers, players]);

  // Save match
  const handleSaveMatch = (overrideSeriesContext?: {
    seriesId: string;
    matchNumber: number;
    winsBeforeThisMatch: { teamA: number; teamB: number };
    isFinale: boolean;
  }) => {
    if (teamAScore === 0 && teamBScore === 0) {
      Alert.alert(t('common', 'error'), t('match', 'errorNoScore'));
      return;
    }

    if (isTournamentMode && !selectedPhase) {
      Alert.alert(t('match', 'phaseRequired'), t('match', 'selectPhase'));
      return;
    }

    // Warn user if all players are locally created (no ELO/leaderboard impact)
    if (!localPlayersWarningShown.current && hasOnlyLocalPlayers()) {
      localPlayersWarningShown.current = true;
      Alert.alert(
        t('match', 'localPlayersWarningTitle'),
        t('match', 'localPlayersWarningMessage'),
        [
          { text: t('common', 'cancel'), style: 'cancel', onPress: () => { localPlayersWarningShown.current = false; } },
          { text: t('match', 'localPlayersWarningContinue'), onPress: () => handleSaveMatch(overrideSeriesContext) },
        ]
      );
      return;
    }
    localPlayersWarningShown.current = false;

    if (isTimerRunning) {
      setIsTimerRunning(false);
    }

    const winner = teamAScore > teamBScore ? 'A' : 'B';
    const duration = matchTime > 0 ? Math.round(matchTime / 60) : Math.floor(Math.random() * 30) + 30;
    
    const teamAPlayerIds = getTeamPlayerIds(teamAPlayers);
    const teamBPlayerIds = getTeamPlayerIds(teamBPlayers);
    const teamAPlayerNames = teamAPlayers.length > 0 
      ? teamAPlayers.map(p => {
          const player = players.find(pl => pl.id === p.playerId);
          return player?.name || '?';
        })
      : [t('match', 'myTeam')];
    const teamBPlayerNames = teamBPlayers.length > 0 
      ? teamBPlayers.map(p => {
          const player = players.find(pl => pl.id === p.playerId);
          return player?.name || '?';
        })
      : [t('match', 'opponent')];
    
    const teamAPlayerRoles = teamAPlayers.map(p => ({
      playerId: p.playerId,
      role: p.role,
    }));
    const teamBPlayerRoles = teamBPlayers.map(p => ({
      playerId: p.playerId,
      role: p.role,
    }));
    
    let seriesInfoData: {
      seriesId: string;
      matchNumber: number;
      winsBeforeThisMatch: { teamA: number; teamB: number };
      isFinale: boolean;
      seriesComplete: boolean;
      seriesWinner?: 'A' | 'B';
    } | undefined = undefined;
    
    if (!isTournamentMode) {
      if (overrideSeriesContext) {
        const newWinsA = overrideSeriesContext.winsBeforeThisMatch.teamA + (winner === 'A' ? 1 : 0);
        const newWinsB = overrideSeriesContext.winsBeforeThisMatch.teamB + (winner === 'A' ? 0 : 1);
        const isSeriesComplete = newWinsA >= 2 || newWinsB >= 2;
        
        seriesInfoData = {
          seriesId: overrideSeriesContext.seriesId,
          matchNumber: overrideSeriesContext.matchNumber,
          winsBeforeThisMatch: overrideSeriesContext.winsBeforeThisMatch,
          isFinale: overrideSeriesContext.isFinale,
          seriesComplete: isSeriesComplete,
          seriesWinner: isSeriesComplete ? (newWinsA >= 2 ? 'A' : 'B') : undefined,
        };
      } else if (seriesId) {
        const newWinsA = seriesWinsA + (winner === 'A' ? 1 : 0);
        const newWinsB = seriesWinsB + (winner === 'A' ? 0 : 1);
        const isSeriesComplete = newWinsA >= 2 || newWinsB >= 2;
        
        seriesInfoData = {
          seriesId: seriesId,
          matchNumber: currentMatchNumber,
          winsBeforeThisMatch: { teamA: seriesWinsA, teamB: seriesWinsB },
          isFinale: isFinale,
          seriesComplete: isSeriesComplete,
          seriesWinner: isSeriesComplete ? (newWinsA >= 2 ? 'A' : 'B') : undefined,
        };
      }
    }

    addMatch({
      date: new Date().toISOString(),
      mode: isTournamentMode ? 'Tournoi' : 'Entraînement',
      format,
      tournamentId: linkedTournament?.id,
      tournamentName: linkedTournament?.name,
      tournamentPhase: isTournamentMode ? (selectedPhase || undefined) : undefined,
      tournamentBracket: isTournamentMode && selectedPhase !== 'Poules' ? selectedBracket || undefined : undefined,
      terrainId: selectedTerrainId || linkedTournament?.terrainId || undefined,
      terrainType: selectedTerrain?.type || linkedTournament?.terrainType || undefined,
      boulesSetId: selectedBoulesSetId || undefined,
      teamA: {
        players: teamAPlayerIds.length > 0 ? teamAPlayerIds : ['1'],
        playerNames: teamAPlayerNames,
        playerRoles: teamAPlayerRoles.length > 0 ? teamAPlayerRoles : undefined,
        score: teamAScore,
      },
      teamB: {
        players: teamBPlayerIds.length > 0 ? teamBPlayerIds : ['2'],
        playerNames: teamBPlayerNames,
        playerRoles: teamBPlayerRoles.length > 0 ? teamBPlayerRoles : undefined,
        score: teamBScore,
      },
      winner,
      duration,
      menes: menes.map(m => ({
        teamAPoints: m.teamAPoints,
        teamBPoints: m.teamBPoints,
        duration: m.duration,
      })),
      playerActions: playerActions.length > 0 ? playerActions : undefined,
      seriesInfo: seriesInfoData,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Collect all player IDs for share detection
    const allPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds].filter(id => id !== '1' && id !== '2');
    if (allPlayerIds.length > 0) {
      // We need the match ID - addMatch returns it
      // Since handleSaveMatch doesn't await, we trigger share detection after save
      // For non-share saves, show the share request modal
      setShareRequestPlayerIds(allPlayerIds);
      // addMatch is sync in AppContext, match ID assigned internally;
      // we use a flag-based approach: save first, show modal on next tick
    }

    // Show interstitial ad after saving match
    showInterstitial().finally(() => {
      router.back();
    });
  };

  // Save match and open share modal
  const handleSaveAndShare = useCallback(async () => {
    if (teamAScore === 0 && teamBScore === 0) return;
    if (isTournamentMode && !selectedPhase) return;
    if (isTimerRunning) setIsTimerRunning(false);

    setIsSavingForShare(true);
    const winner = teamAScore > teamBScore ? 'A' : 'B';
    const duration = matchTime > 0 ? Math.round(matchTime / 60) : Math.floor(Math.random() * 30) + 30;
    const teamAPlayerIds = getTeamPlayerIds(teamAPlayers);
    const teamBPlayerIds = getTeamPlayerIds(teamBPlayers);
    const teamAPlayerNames = teamAPlayers.length > 0 
      ? teamAPlayers.map(p => { const player = players.find(pl => pl.id === p.playerId); return player?.name || '?'; })
      : [t('match', 'myTeam')];
    const teamBPlayerNames = teamBPlayers.length > 0 
      ? teamBPlayers.map(p => { const player = players.find(pl => pl.id === p.playerId); return player?.name || '?'; })
      : [t('match', 'opponent')];
    const teamAPlayerRoles = teamAPlayers.map(p => ({ playerId: p.playerId, role: p.role }));
    const teamBPlayerRoles = teamBPlayers.map(p => ({ playerId: p.playerId, role: p.role }));

    let seriesInfoData: any = undefined;
    if (!isTournamentMode && seriesId) {
      const newWinsA = seriesWinsA + (winner === 'A' ? 1 : 0);
      const newWinsB = seriesWinsB + (winner === 'A' ? 0 : 1);
      const isSeriesComplete = newWinsA >= 2 || newWinsB >= 2;
      seriesInfoData = {
        seriesId, matchNumber: currentMatchNumber,
        winsBeforeThisMatch: { teamA: seriesWinsA, teamB: seriesWinsB },
        isFinale, seriesComplete: isSeriesComplete,
        seriesWinner: isSeriesComplete ? (newWinsA >= 2 ? 'A' : 'B') : undefined,
      };
    }

    const newId = await addMatch({
      date: new Date().toISOString(), mode: isTournamentMode ? 'Tournoi' : 'Entraînement', format,
      tournamentId: linkedTournament?.id, tournamentName: linkedTournament?.name,
      tournamentPhase: isTournamentMode ? (selectedPhase || undefined) : undefined,
      tournamentBracket: isTournamentMode && selectedPhase !== 'Poules' ? selectedBracket || undefined : undefined,
      terrainId: selectedTerrainId || linkedTournament?.terrainId || undefined,
      terrainType: selectedTerrain?.type || linkedTournament?.terrainType || undefined,
      boulesSetId: selectedBoulesSetId || undefined,
      teamA: { players: teamAPlayerIds.length > 0 ? teamAPlayerIds : ['1'], playerNames: teamAPlayerNames, playerRoles: teamAPlayerRoles.length > 0 ? teamAPlayerRoles : undefined, score: teamAScore },
      teamB: { players: teamBPlayerIds.length > 0 ? teamBPlayerIds : ['2'], playerNames: teamBPlayerNames, playerRoles: teamBPlayerRoles.length > 0 ? teamBPlayerRoles : undefined, score: teamBScore },
      winner, duration,
      menes: menes.map(m => ({ teamAPoints: m.teamAPoints, teamBPoints: m.teamBPoints, duration: m.duration })),
      playerActions: playerActions.length > 0 ? playerActions : undefined,
      seriesInfo: seriesInfoData,
    });

    setIsSavingForShare(false);
    if (newId) {
      setSavedMatchIdForShare(newId);
      // Collect all player IDs for cross-player share detection
      const tAIds = getTeamPlayerIds(teamAPlayers);
      const tBIds = getTeamPlayerIds(teamBPlayers);
      const allPids = [...tAIds, ...tBIds].filter(id => id !== '1' && id !== '2');
      if (allPids.length > 0) {
        setShareRequestItemId(newId);
        setShareRequestPlayerIds(allPids);
      }
      // Exit fullscreen first to avoid nested modals
      setFullscreenMode(false);
      setHasExitedFullscreen(true);
      setTimeout(() => {
        if (allPids.length > 0) {
          setShowShareRequestModal(true);
        } else {
          setShowPostMatchShare(true);
        }
      }, 300);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [teamAScore, teamBScore, isTournamentMode, selectedPhase, isTimerRunning, matchTime,
      teamAPlayers, teamBPlayers, players, format, linkedTournament, selectedTerrainId,
      selectedTerrain, selectedBracket, menes, playerActions, seriesId, seriesWinsA,
      seriesWinsB, currentMatchNumber, isFinale, addMatch, t]);

  // Detect if this match completes the series
  const seriesCompletionInfo = useMemo(() => {
    if (!seriesId) return null;
    const w = teamAScore > teamBScore ? 'A' : 'B';
    const fA = seriesWinsA + (w === 'A' ? 1 : 0);
    const fB = seriesWinsB + (w === 'B' ? 1 : 0);
    const done = fA >= 2 || fB >= 2;
    return { isComplete: done, finalWinsA: fA, finalWinsB: fB };
  }, [seriesId, seriesWinsA, seriesWinsB, teamAScore, teamBScore]);

  // Share the entire series (all matches)
  const handleShareSeries = useCallback(async () => {
    if (teamAScore === 0 && teamBScore === 0) return;
    if (isTimerRunning) setIsTimerRunning(false);
    setIsSharingSeries(true);

    const winner = teamAScore > teamBScore ? 'A' : 'B';
    const dur = matchTime > 0 ? Math.round(matchTime / 60) : Math.floor(Math.random() * 30) + 30;
    const tAIds = getTeamPlayerIds(teamAPlayers);
    const tBIds = getTeamPlayerIds(teamBPlayers);
    const tANames = teamAPlayers.length > 0
      ? teamAPlayers.map(p => { const pl = players.find(x => x.id === p.playerId); return pl?.name || '?'; })
      : [t('match', 'myTeam')];
    const tBNames = teamBPlayers.length > 0
      ? teamBPlayers.map(p => { const pl = players.find(x => x.id === p.playerId); return pl?.name || '?'; })
      : [t('match', 'opponent')];
    const tARoles = teamAPlayers.map(p => ({ playerId: p.playerId, role: p.role }));
    const tBRoles = teamBPlayers.map(p => ({ playerId: p.playerId, role: p.role }));

    let sInfo: any = undefined;
    if (seriesId) {
      const nA = seriesWinsA + (winner === 'A' ? 1 : 0);
      const nB = seriesWinsB + (winner === 'B' ? 1 : 0);
      sInfo = {
        seriesId, matchNumber: currentMatchNumber,
        winsBeforeThisMatch: { teamA: seriesWinsA, teamB: seriesWinsB },
        isFinale, seriesComplete: nA >= 2 || nB >= 2,
        seriesWinner: (nA >= 2 || nB >= 2) ? (nA >= 2 ? 'A' : 'B') : undefined,
      };
    }

    const newId = await addMatch({
      date: new Date().toISOString(), mode: isTournamentMode ? 'Tournoi' : 'Entraînement', format,
      tournamentId: linkedTournament?.id, tournamentName: linkedTournament?.name,
      tournamentPhase: isTournamentMode ? (selectedPhase || undefined) : undefined,
      tournamentBracket: isTournamentMode && selectedPhase !== 'Poules' ? selectedBracket || undefined : undefined,
      terrainId: selectedTerrainId || linkedTournament?.terrainId || undefined,
      terrainType: selectedTerrain?.type || linkedTournament?.terrainType || undefined,
      boulesSetId: selectedBoulesSetId || undefined,
      teamA: { players: tAIds.length > 0 ? tAIds : ['1'], playerNames: tANames, playerRoles: tARoles.length > 0 ? tARoles : undefined, score: teamAScore },
      teamB: { players: tBIds.length > 0 ? tBIds : ['2'], playerNames: tBNames, playerRoles: tBRoles.length > 0 ? tBRoles : undefined, score: teamBScore },
      winner, duration: dur,
      menes: menes.map(m => ({ teamAPoints: m.teamAPoints, teamBPoints: m.teamBPoints, duration: m.duration })),
      playerActions: playerActions.length > 0 ? playerActions : undefined,
      seriesInfo: sInfo,
    });

    if (!newId) { setIsSharingSeries(false); return; }

    // Collect all series match IDs (previous + current)
    const prevSeriesMatches = matches
      .filter(m => m.seriesInfo?.seriesId === seriesId && m.id !== newId)
      .sort((a, b) => (a.seriesInfo?.matchNumber || 1) - (b.seriesInfo?.matchNumber || 1));
    const allIds = [...prevSeriesMatches.map(m => m.id), newId];

    // Create share codes for each match
    const codes: string[] = [];
    for (const mid of allIds) {
      const res = await createShareLink('match', mid, 'read');
      if (res.error) { setIsSharingSeries(false); Alert.alert(t('common', 'error'), res.error); return; }
      codes.push(res.shareCode);
    }

    setIsSharingSeries(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Build share message
    const teamALabel = teamAPlayers.map(p => getPlayerName(p.playerId)).join(', ');
    const teamBLabel = teamBPlayers.map(p => getPlayerName(p.playerId)).join(', ');
    const seriesScore = `${seriesCompletionInfo?.finalWinsA || 0} - ${seriesCompletionInfo?.finalWinsB || 0}`;
    let msg = `${t('matchEdit', 'seriesShareIntro')} (${teamALabel} vs ${teamBLabel}) - ${seriesScore}\n\n`;
    codes.forEach((code, idx) => {
      const isLast = idx === codes.length - 1 && codes.length >= 3;
      const label = isLast ? t('history', 'finale') : `${t('match', 'matchNumber')} ${idx + 1}`;
      msg += `${label}: ${code}\n`;
    });
    msg += `\n${t('matchEdit', 'seriesShareSuffix')}`;

    try { await Share.share({ message: msg, title: `Best of 3 - ${teamALabel} vs ${teamBLabel}` }); } catch {}

    setFullscreenMode(false);
    setHasExitedFullscreen(true);
    setTimeout(() => router.replace('/(tabs)'), 100);
  }, [teamAScore, teamBScore, isTimerRunning, matchTime, teamAPlayers, teamBPlayers, players,
      format, linkedTournament, selectedPhase, selectedBracket, selectedTerrainId, selectedTerrain,
      menes, playerActions, seriesId, seriesWinsA, seriesWinsB, currentMatchNumber, isFinale,
      addMatch, isTournamentMode, matches, t, seriesCompletionInfo, getPlayerName]);

  // Quick share handler for winner overlay
  const handleQuickShareFromWinner = useCallback(async (matchId: string) => {
    if (!user?.id || !matchId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickShareWinnerState('loading');
    try {
      const allPids = [...getTeamPlayerIds(teamAPlayers), ...getTeamPlayerIds(teamBPlayers)].filter(id => id !== '1' && id !== '2');
      const { linkedPlayers } = await detectLinkedPlayers(allPids, user.id);
      if (linkedPlayers.length === 0) {
        setQuickShareWinnerState('no_accounts');
        return;
      }
      const teamANames = teamAPlayers.map(p => getPlayerName(p.playerId)).join(', ');
      const teamBNames = teamBPlayers.map(p => getPlayerName(p.playerId)).join(', ');
      const summary = `${teamANames} vs ${teamBNames} (${teamAScore}-${teamBScore})`;
      const senderName = selfPlayer?.name || user.username || user.email?.split('@')[0] || 'Joueur';
      const { requests: newReqs, error } = await createShareRequests({
        itemType: 'match',
        itemId: matchId,
        senderUserId: user.id,
        senderName,
        recipients: linkedPlayers.map(p => ({ userId: p.userId, permission: 'read' as const })),
        itemSummary: summary,
      });
      if (error) {
        showAlert(fr ? 'Erreur' : 'Error', error);
        setQuickShareWinnerState('idle');
        return;
      }
      setQuickShareWinnerCount(newReqs.length);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuickShareWinnerState('sent');
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
      setQuickShareWinnerState('idle');
    }
  }, [user, teamAPlayers, teamBPlayers, teamAScore, teamBScore, selfPlayer, fr, showAlert]);

  const teamsReady = teamAPlayers.length > 0 || teamBPlayers.length > 0;
  const isMatchReady = teamAScore > 0 || teamBScore > 0;

  // Fullscreen state tracking
  const [fsSelectedPoints, setFsSelectedPoints] = useState<{ team: 'A' | 'B' | null; points: number }>({ team: null, points: 0 });
  const [fsNewMeneIndicator, setFsNewMeneIndicator] = useState<number | null>(null);

  const handleFsValidateMene = () => {
    if (!fsSelectedPoints.team || fsSelectedPoints.points === 0) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const newMene: Mene = {
      id: menes.length + 1,
      teamAPoints: fsSelectedPoints.team === 'A' ? fsSelectedPoints.points : 0,
      teamBPoints: fsSelectedPoints.team === 'B' ? fsSelectedPoints.points : 0,
      duration: meneTime,
      isNull: false,
    };
    
    setMenes(prev => [...prev, newMene]);
    if (fsSelectedPoints.team === 'A') {
      setTeamAScore(prev => Math.min(maxScore, prev + fsSelectedPoints.points));
    } else {
      setTeamBScore(prev => Math.min(maxScore, prev + fsSelectedPoints.points));
    }
    
    setMeneTime(0);
    setFsSelectedPoints({ team: null, points: 0 });
    
    const nextMeneNumber = menes.length + 2;
    setFsNewMeneIndicator(nextMeneNumber);
    setTimeout(() => setFsNewMeneIndicator(null), 1500);
    
    if (!isTimerRunning) {
      setIsTimerRunning(true);
    }
  };
  
  const handleFsNullMene = () => {
    Haptics.selectionAsync();
    
    const newMene: Mene = {
      id: menes.length + 1,
      teamAPoints: 0,
      teamBPoints: 0,
      duration: meneTime,
      isNull: true,
    };
    setMenes(prev => [...prev, newMene]);
    
    setMeneTime(0);
    setFsSelectedPoints({ team: null, points: 0 });
    
    const nextMeneNumber = menes.length + 2;
    setFsNewMeneIndicator(nextMeneNumber);
    setTimeout(() => setFsNewMeneIndicator(null), 1500);
    
    if (!isTimerRunning) {
      setIsTimerRunning(true);
    }
  };

  // Fullscreen Score View
  const renderFullscreenScore = () => {
    const pointOptions = Array.from({ length: maxPointsPerMene }, (_, i) => i + 1);

    return (
      <Modal
        visible={fullscreenMode}
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait']}
        onRequestClose={() => {
          setFullscreenMode(false);
          setHasExitedFullscreen(true);
        }}
      >
        <View style={styles.fullscreenContainer}>
          <SafeAreaView style={styles.fullscreenSafeArea}>
           <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
            {/* Compact Top Bar */}
            <View style={styles.fsTopBar}>
              <Pressable 
                style={styles.fsExitBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowPauseOverlay(true);
                  if (isTimerRunning) pauseTimer();
                }}
              >
                <MaterialIcons name="pause" size={24} color="rgba(255,255,255,0.8)" />
              </Pressable>

              <View style={styles.fsTopCenter}>
                <Text style={styles.fsFormatBadge}>{t('formats', format)}</Text>
                {selectedTerrain && (
                  <Text style={styles.fsTerrainName} numberOfLines={1}>
                    <MaterialIcons name="place" size={12} color="rgba(255,255,255,0.5)" /> {selectedTerrain.name}
                  </Text>
                )}
                {selectedBoulesSet && (
                  <Text style={styles.fsTerrainName} numberOfLines={1}>
                    <MaterialIcons name="sports-baseball" size={12} color="rgba(255,255,255,0.5)" /> {selectedBoulesSet.name}
                  </Text>
                )}
              </View>

              <View style={{ width: 44 }} />
            </View>

            {/* Dual Timer Display */}
            <View style={styles.fsDualTimerBar}>
              <Pressable 
                style={[styles.fsDualTimerPill, isTimerRunning && styles.fsDualTimerPillActive]}
                onPress={isTimerRunning ? pauseTimer : startTimer}
              >
                <MaterialIcons 
                  name={isTimerRunning ? 'pause' : 'play-arrow'} 
                  size={18} 
                  color={isTimerRunning ? '#4ADE80' : 'rgba(255,255,255,0.5)'} 
                />
                <View style={styles.fsDualTimerContent}>
                  <Text style={styles.fsDualTimerLabel}>{t('match', 'game')}</Text>
                  <Text style={[styles.fsDualTimerValue, isTimerRunning && styles.fsDualTimerValueActive]}>
                    {formatTime(matchTime)}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.fsDualTimerPill, styles.fsDualTimerPillMene]}>
                <MaterialIcons name="sports" size={18} color={'rgba(255,255,255,0.5)'} />
                <View style={styles.fsDualTimerContent}>
                  <Text style={styles.fsDualTimerLabel}>{t('match', 'end')} {menes.length + 1}</Text>
                  <Text style={styles.fsDualTimerValue}>{formatTime(meneTime)}</Text>
                </View>
              </View>
            </View>

            {/* Notation Mode Toggle */}
            {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
              <View style={styles.fsNotationSection}>
                <View style={styles.fsNotationModeRow}>
                  <Text style={styles.fsNotationModeLabel}>{t('notation', 'notationModeLabel')}</Text>
                  <View style={styles.fsNotationModeToggle}>
                    <Pressable
                      style={[styles.fsNotationModeBtn, notationMode === 'quick' && styles.fsNotationModeBtnActive]}
                      onPress={() => { Haptics.selectionAsync(); setNotationMode('quick'); }}
                    >
                      <MaterialIcons name="flash-on" size={14} color={notationMode === 'quick' ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                      <Text style={[styles.fsNotationModeBtnText, notationMode === 'quick' && styles.fsNotationModeBtnTextActive]}>{t('notation', 'notationModeQuick')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.fsNotationModeBtn, notationMode === 'detailed' && styles.fsNotationModeBtnActiveDetailed]}
                      onPress={() => { Haptics.selectionAsync(); setNotationMode('detailed'); }}
                    >
                      <MaterialIcons name="tune" size={14} color={notationMode === 'detailed' ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                      <Text style={[styles.fsNotationModeBtnText, notationMode === 'detailed' && styles.fsNotationModeBtnTextActive]}>{t('notation', 'notationModeDetailed')}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: notationCardLayout.gap, justifyContent: 'center' }}>
                  {[...teamAPlayers, ...teamBPlayers].map((p, idx) => {
                    const isTeamA = idx < teamAPlayers.length;
                    const stats = getPlayerActionStats(p.playerId);
                    const teamColor = isTeamA ? theme.primary : theme.accent;
                    const firstName = getPlayerName(p.playerId).split(' ')[0];
                    const { isCompact, isUltraCompact, cardWidth } = notationCardLayout;
                    const iconSz = isUltraCompact ? 14 : 18;
                    
                    return (
                      <View key={p.playerId} style={[styles.fsQuickNotationPlayer, { width: cardWidth }]}>
                        <View style={[styles.fsQuickNotationNameBadge, { backgroundColor: teamColor + '25' }, isCompact && { paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6 }]}>
                          <View style={[styles.fsQuickNotationDot, { backgroundColor: teamColor }]} />
                          <Text style={[styles.fsQuickNotationName, isUltraCompact && { fontSize: 11 }]} numberOfLines={1}>{firstName}</Text>
                          {availableRoles.length > 0 ? (
                            <Pressable
                              style={[styles.fsRoleBadge, { backgroundColor: p.role === 'Tireur' ? theme.tirColor + '30' : p.role === 'Pointeur' ? theme.pointColor + '30' : theme.accent + '30' }]}
                              onPress={() => {
                                Haptics.selectionAsync();
                                const currentIdx = availableRoles.indexOf(p.role);
                                const nextIdx = (currentIdx + 1) % availableRoles.length;
                                updatePlayerRole(p.playerId, isTeamA ? 'A' : 'B', availableRoles[nextIdx]);
                              }}
                              hitSlop={6}
                            >
                              <Text style={[styles.fsRoleBadgeText, { color: p.role === 'Tireur' ? theme.tirColor : p.role === 'Pointeur' ? theme.pointColor : theme.accent }]}>{t('roles', p.role).substring(0, 1)}</Text>
                            </Pressable>
                          ) : null}
                          {!isUltraCompact ? (
                            <Text style={styles.fsQuickNotationStats}>
                              {stats.tirsSuccess}/{stats.tirs} • {stats.pointsSuccess}/{stats.points}{stats.carreaux > 0 ? ` • C${stats.carreaux}` : ''}
                            </Text>
                          ) : null}
                          {(actionHistory[p.playerId]?.length || 0) > 0 ? (
                            <Pressable
                              style={[styles.fsQuickUndoBtn, isUltraCompact && { width: 22, height: 22, borderRadius: 11 }]}
                              onPress={() => undoLastAction(p.playerId)}
                              hitSlop={6}
                            >
                              <MaterialIcons name="undo" size={isUltraCompact ? 12 : 14} color="rgba(255,255,255,0.6)" />
                            </Pressable>
                          ) : null}
                        </View>
                        {notationMode === 'quick' ? (
                          /* === QUICK MODE: 1 tap = recorded === */
                          <View style={[styles.fsQuickModeBtns, isCompact && { gap: 5 }]}>
                            {/* TIR section */}
                            <View style={[styles.fsQmSection, isCompact && { gap: 2 }]}>
                              <View style={styles.fsQmSectionHeader}>
                                <MaterialIcons name="gps-fixed" size={isUltraCompact ? 10 : 12} color="rgba(255,255,255,0.5)" />
                                <Text style={[styles.fsQmSectionLabel, isUltraCompact && { fontSize: 7 }]}>{t('notation', 'tirShort')}</Text>
                              </View>
                              <View style={[styles.fsQmSectionBtns, isCompact && { gap: 4 }]}>
                                <Pressable
                                  style={[styles.fsQmTirSuccessBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                                  onPress={() => { recordAction(p.playerId, 'tir', true); }}
                                >
                                  <MaterialIcons name="check" size={iconSz} color="#FFF" />
                                  {!isCompact ? <Text style={styles.fsQmBtnLabel}>{t('notation', 'okLabel')}</Text> : null}
                                  {isUltraCompact ? null : isCompact ? <Text style={[styles.fsQmBtnLabel, { fontSize: 9 }]}>T</Text> : null}
                                </Pressable>
                                <Pressable
                                  style={[styles.fsQmTirFailBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                                  onPress={() => { recordAction(p.playerId, 'tir', false); }}
                                >
                                  <MaterialIcons name="close" size={iconSz} color="#FFF" />
                                  {!isCompact ? <Text style={styles.fsQmBtnLabel}>{t('notation', 'missShort')}</Text> : null}
                                </Pressable>
                              </View>
                            </View>
                            {/* POINT section */}
                            <View style={[styles.fsQmSection, isCompact && { gap: 2 }]}>
                              <View style={styles.fsQmSectionHeader}>
                                <MaterialIcons name="adjust" size={isUltraCompact ? 10 : 12} color="rgba(255,255,255,0.5)" />
                                <Text style={[styles.fsQmSectionLabel, isUltraCompact && { fontSize: 7 }]}>{t('notation', 'pointShortLabel')}</Text>
                              </View>
                              <View style={[styles.fsQmSectionBtns, isCompact && { gap: 4 }]}>
                                <Pressable
                                  style={[styles.fsQmPointSuccessBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                                  onPress={() => { recordAction(p.playerId, 'point', true); }}
                                >
                                  <MaterialIcons name="check" size={iconSz} color="#FFF" />
                                  {!isCompact ? <Text style={styles.fsQmBtnLabel}>{t('notation', 'okLabel')}</Text> : null}
                                  {isUltraCompact ? null : isCompact ? <Text style={[styles.fsQmBtnLabel, { fontSize: 9 }]}>P</Text> : null}
                                </Pressable>
                                <Pressable
                                  style={[styles.fsQmPointFailBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                                  onPress={() => { recordAction(p.playerId, 'point', false); }}
                                >
                                  <MaterialIcons name="close" size={iconSz} color="#FFF" />
                                  {!isCompact ? <Text style={styles.fsQmBtnLabel}>{t('notation', 'missShort')}</Text> : null}
                                </Pressable>
                              </View>
                            </View>
                            {/* CARREAU button */}
                            <Pressable
                              style={[styles.fsQmCarreauBtn, isCompact && { paddingVertical: 8, borderRadius: 10 }]}
                              onPress={() => { recordAction(p.playerId, 'carreau', true); }}
                            >
                              <MaterialIcons name="stars" size={isCompact ? 16 : 18} color="#FFF" />
                              {!isUltraCompact ? <Text style={[styles.fsQmCarreauLabel, isCompact && { fontSize: 10 }]}>{isCompact ? 'C' : t('notation', 'carreauLabel')}</Text> : null}
                            </Pressable>
                          </View>
                        ) : (
                          /* === DETAILED MODE: opens multi-step modal === */
                          <View style={[styles.fsQuickNotationBtns, isCompact && { gap: 6 }]}>
                            <Pressable
                              style={[styles.fsQuickNotationTirBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                              onPress={() => openAdvancedNotation(p.playerId, getPlayerName(p.playerId), isTeamA ? 'A' : 'B', 'tir')}
                            >
                              <MaterialIcons name="gps-fixed" size={isCompact ? 16 : 20} color="#FFF" />
                              {!isUltraCompact ? <Text style={[styles.fsQuickNotationBtnText, isCompact && { fontSize: 11 }]}>TIR</Text> : null}
                            </Pressable>
                            <Pressable
                              style={[styles.fsQuickNotationPointBtn, isCompact && { paddingVertical: 10, borderRadius: 10 }]}
                              onPress={() => openAdvancedNotation(p.playerId, getPlayerName(p.playerId), isTeamA ? 'A' : 'B', 'point')}
                            >
                              <MaterialIcons name="adjust" size={isCompact ? 16 : 20} color="#FFF" />
                              {!isUltraCompact ? <Text style={[styles.fsQuickNotationBtnText, isCompact && { fontSize: 11 }]}>PT</Text> : null}
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Giant Score Display */}
            <View style={styles.fsGiantScoreArea}>
              <Pressable 
                style={[
                  styles.fsGiantScoreBlock,
                  fsSelectedPoints.team === 'A' && styles.fsGiantScoreBlockSelected,
                  { borderColor: theme.primary + '40' }
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFsSelectedPoints(prev => ({ 
                    team: prev.team === 'A' ? null : 'A', 
                    points: prev.team === 'A' ? 0 : prev.points || 1 
                  }));
                }}
              >
                <View style={styles.fsGiantScoreHeader}>
                  <View style={[styles.fsGiantTeamDot, { backgroundColor: theme.primary }]} />
                  <Text style={styles.fsGiantTeamLabel}>{t('match', 'myTeamLabel')}</Text>
                </View>
                {teamAPlayers.length > 0 && (
                  <Text style={styles.fsGiantPlayerNames} numberOfLines={1}>
                    {teamAPlayers.map(p => getPlayerName(p.playerId).split(' ')[0]).join(' • ')}
                  </Text>
                )}
                <Text style={[
                  styles.fsGiantScoreValue,
                  teamAScore >= teamBScore && teamAScore > 0 && styles.fsGiantScoreWinning
                ]}>
                  {teamAScore}
                </Text>
                {fsSelectedPoints.team === 'A' && (
                  <View style={[styles.fsSelectedIndicator, { backgroundColor: theme.primary }]}>
                    <Text style={styles.fsSelectedIndicatorText}>+{fsSelectedPoints.points}</Text>
                  </View>
                )}
              </Pressable>

              <View style={styles.fsGiantVsBadge}>
                <Text style={styles.fsGiantVsText}>VS</Text>
                <View style={styles.fsGiantMeneBadge}>
                  <Text style={styles.fsGiantMeneText}>M{menes.length + 1}</Text>
                </View>
              </View>

              <Pressable 
                style={[
                  styles.fsGiantScoreBlock,
                  fsSelectedPoints.team === 'B' && styles.fsGiantScoreBlockSelected,
                  { borderColor: theme.accent + '40' }
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFsSelectedPoints(prev => ({ 
                    team: prev.team === 'B' ? null : 'B', 
                    points: prev.team === 'B' ? 0 : prev.points || 1 
                  }));
                }}
              >
                <View style={styles.fsGiantScoreHeader}>
                  <View style={[styles.fsGiantTeamDot, { backgroundColor: theme.accent }]} />
                  <Text style={styles.fsGiantTeamLabel}>{t('match', 'opponentLabel')}</Text>
                </View>
                {teamBPlayers.length > 0 && (
                  <Text style={styles.fsGiantPlayerNames} numberOfLines={1}>
                    {teamBPlayers.map(p => getPlayerName(p.playerId).split(' ')[0]).join(' • ')}
                  </Text>
                )}
                <Text style={[
                  styles.fsGiantScoreValue,
                  teamBScore > teamAScore && styles.fsGiantScoreLosing
                ]}>
                  {teamBScore}
                </Text>
                {fsSelectedPoints.team === 'B' && (
                  <View style={[styles.fsSelectedIndicator, { backgroundColor: theme.accent }]}>
                    <Text style={styles.fsSelectedIndicatorText}>+{fsSelectedPoints.points}</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Point Selection */}
            <View style={styles.fsPointSelection}>
              <Text style={styles.fsPointSelectionTitle}>
                {fsSelectedPoints.team ? `${t('match', 'pointsFor')} ${fsSelectedPoints.team === 'A' ? t('match', 'myTeam') : t('match', 'opponent')}` : t('match', 'selectTeam')}
              </Text>
              <View style={styles.fsPointButtonsRow}>
                {pointOptions.map(pts => (
                  <Pressable
                    key={pts}
                    style={[
                      styles.fsPointButton,
                      fsSelectedPoints.points === pts && fsSelectedPoints.team && styles.fsPointButtonActive,
                      fsSelectedPoints.points === pts && fsSelectedPoints.team === 'A' && { backgroundColor: theme.primary },
                      fsSelectedPoints.points === pts && fsSelectedPoints.team === 'B' && { backgroundColor: theme.accent },
                      !fsSelectedPoints.team && styles.fsPointButtonDisabled,
                    ]}
                    onPress={() => {
                      if (!fsSelectedPoints.team) return;
                      Haptics.selectionAsync();
                      setFsSelectedPoints(prev => ({ ...prev, points: pts }));
                    }}
                    disabled={!fsSelectedPoints.team}
                  >
                    <Text style={[
                      styles.fsPointButtonText,
                      fsSelectedPoints.points === pts && fsSelectedPoints.team && styles.fsPointButtonTextActive,
                      !fsSelectedPoints.team && styles.fsPointButtonTextDisabled,
                    ]}>
                      {pts}
                    </Text>
                  </Pressable>
                ))}
              </View>
              
              <View style={styles.fsValidateRow}>
                <Pressable
                  style={[
                    styles.fsValidateMeneBtn,
                    (!fsSelectedPoints.team || fsSelectedPoints.points === 0) && styles.fsValidateMeneBtnDisabled,
                  ]}
                  onPress={handleFsValidateMene}
                  disabled={!fsSelectedPoints.team || fsSelectedPoints.points === 0}
                >
                  <MaterialIcons name="check" size={28} color="#FFF" />
                  <Text style={styles.fsValidateMeneBtnText}>{t('match', 'validateTheEnd')}</Text>
                </Pressable>
                
                <Pressable style={styles.fsNullMeneBtn} onPress={handleFsNullMene}>
                  <MaterialIcons name="block" size={24} color="#FBBF24" />
                </Pressable>
              </View>
            </View>

            {/* Mène Timeline */}
            <View style={[styles.fsMeneTimeline, { flex: undefined, minHeight: 100 }]}>
              <View style={styles.fsMeneTimelineHeader}>
                <Text style={styles.fsMeneTimelineTitle}>{t('match', 'matchFlow')}</Text>
                {menes.length > 0 && (
                  <Pressable style={styles.fsMeneUndoBtn} onPress={undoLastMene}>
                    <MaterialIcons name="undo" size={18} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.fsMeneUndoBtnText}>{t('match', 'undo')}</Text>
                  </Pressable>
                )}
              </View>
              
              {menes.length === 0 ? (
                <View style={styles.fsMeneEmptyState}>
                  <MaterialIcons name="sports" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.fsMeneEmptyText}>{t('match', 'matchStarts')}</Text>
                </View>
              ) : (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.fsMeneTimelineScroll}
                >
                  {menes.map((m, idx) => {
                    const runningScoreA = menes.slice(0, idx + 1).reduce((sum, me) => sum + me.teamAPoints, 0);
                    const runningScoreB = menes.slice(0, idx + 1).reduce((sum, me) => sum + me.teamBPoints, 0);
                    
                    return (
                      <View key={m.id} style={styles.fsMeneCard}>
                        <Text style={styles.fsMeneCardNumber}>M{idx + 1}</Text>
                        {m.isNull ? (
                          <View style={styles.fsMeneCardNull}>
                            <MaterialIcons name="block" size={24} color="#FBBF24" />
                            <Text style={styles.fsMeneCardNullText}>{t('match', 'nullLabel')}</Text>
                          </View>
                        ) : (
                          <View style={styles.fsMeneCardScore}>
                            <View style={[styles.fsMeneCardDelta, m.teamAPoints > 0 && styles.fsMeneCardDeltaA]}>
                              <Text style={styles.fsMeneCardDeltaText}>
                                {m.teamAPoints > 0 ? `+${m.teamAPoints}` : '-'}
                              </Text>
                            </View>
                            <View style={[styles.fsMeneCardDelta, m.teamBPoints > 0 && styles.fsMeneCardDeltaB]}>
                              <Text style={styles.fsMeneCardDeltaText}>
                                {m.teamBPoints > 0 ? `+${m.teamBPoints}` : '-'}
                              </Text>
                            </View>
                          </View>
                        )}
                        <Text style={styles.fsMeneCardRunning}>{runningScoreA} - {runningScoreB}</Text>
                        <Text style={styles.fsMeneCardDuration}>{formatTime(m.duration)}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
           </ScrollView>

            {/* Simplified Notation Modal */}
            {advancedNotationPlayer && (
              <SimplifiedShotNotation
                visible={showAdvancedNotation}
                onClose={() => {
                  setShowAdvancedNotation(false);
                  setAdvancedNotationPlayer(null);
                }}
                actionType={advancedNotationType}
                playerId={advancedNotationPlayer.id}
                playerName={advancedNotationPlayer.name}
                team={advancedNotationPlayer.team}
                onSubmit={handleAdvancedShotSubmit}
              />
            )}

            {/* New Mène Indicator */}
            {fsNewMeneIndicator && !(teamAScore >= maxScore || teamBScore >= maxScore) && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.fsNewMeneOverlay}>
                <Animated.View entering={FadeInUp.springify().damping(12)} style={styles.fsNewMeneCard}>
                  <MaterialIcons name="sports" size={40} color="#4ADE80" />
                  <Text style={styles.fsNewMeneTitle}>{t('match', 'end')} {fsNewMeneIndicator}</Text>
                  <Text style={styles.fsNewMeneSubtitle}>{t('match', 'letsGo')}</Text>
                </Animated.View>
              </Animated.View>
            )}

            {/* Pause Overlay */}
            {showPauseOverlay && !(teamAScore >= maxScore || teamBScore >= maxScore) && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.fsPauseOverlay}>
                <View style={styles.fsPauseCard}>
                  <View style={styles.fsPauseHeader}>
                    <MaterialIcons name="pause-circle-filled" size={56} color={theme.warning} />
                    <Text style={styles.fsPauseTitle}>{t('match', 'pause')}</Text>
                  </View>
                  
                  <View style={styles.fsPauseScoreDisplay}>
                    <View style={styles.fsPauseScoreItem}>
                      <Text style={styles.fsPauseScoreLabel}>{t('match', 'myTeamLabel')}</Text>
                      <Text style={[styles.fsPauseScoreValue, { color: theme.primary }]}>{teamAScore}</Text>
                    </View>
                    <Text style={styles.fsPauseScoreSep}>-</Text>
                    <View style={styles.fsPauseScoreItem}>
                      <Text style={styles.fsPauseScoreLabel}>{t('match', 'opponentLabel')}</Text>
                      <Text style={[styles.fsPauseScoreValue, { color: theme.accent }]}>{teamBScore}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.fsPauseInfo}>
                    <View style={styles.fsPauseInfoRow}>
                      <MaterialIcons name="timer" size={18} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.fsPauseInfoText}>{formatTime(matchTime)}</Text>
                    </View>
                    <View style={styles.fsPauseInfoRow}>
                      <MaterialIcons name="sports" size={18} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.fsPauseInfoText}>{menes.length} {t('match', 'endsLabel')}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.fsPauseButtons}>
                    <Pressable 
                      style={styles.fsPauseResumeBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowPauseOverlay(false);
                        startTimer();
                      }}
                    >
                      <MaterialIcons name="play-arrow" size={28} color="#FFF" />
                      <Text style={styles.fsPauseResumeBtnText}>{t('match', 'resumeMatch')}</Text>
                    </Pressable>
                    
                    <Pressable 
                      style={styles.fsPauseExitBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowPauseOverlay(false);
                        setFullscreenMode(false);
                        setHasExitedFullscreen(true);
                      }}
                    >
                      <MaterialIcons name="logout" size={20} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.fsPauseExitBtnText}>{t('match', 'exitFullscreen')}</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Winner Overlay */}
            {(teamAScore >= maxScore || teamBScore >= maxScore) && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.fsWinnerOverlay}>
               <ScrollView contentContainerStyle={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }} showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
                <View style={styles.fsWinnerCard}>
                  <MaterialIcons 
                    name={teamAScore > teamBScore ? 'emoji-events' : 'sentiment-dissatisfied'} 
                    size={80} 
                    color={teamAScore > teamBScore ? '#FFD700' : '#F87171'} 
                  />
                  <Text style={styles.fsWinnerTitle}>
                    {teamAScore > teamBScore ? t('match', 'victoryLabel') : t('match', 'defeatLabel')}
                  </Text>
                  <Text style={styles.fsWinnerScore}>{teamAScore} - {teamBScore}</Text>
                  <Text style={styles.fsWinnerMenes}>{menes.length} {t('match', 'endsLabel')} • {formatTime(matchTime)}</Text>

                  {/* Player Action Summary */}
                  {playerActions.some(pa => pa.actions.tirs > 0 || pa.actions.points > 0 || pa.actions.carreaux > 0) && (
                    <View style={styles.fsWinnerActionsSummary}>
                      <Text style={styles.fsWinnerActionsTitle}>{t('match', 'playerActions')}</Text>
                      {(['A', 'B'] as const).map(team => {
                        const teamPlayers = playerActions.filter(pa => pa.team === team);
                        if (teamPlayers.length === 0) return null;
                        return (
                          <View key={team} style={styles.fsWinnerTeamBlock}>
                            <View style={styles.fsWinnerTeamHeaderRow}>
                              <View style={[styles.fsWinnerTeamDotSm, { backgroundColor: team === 'A' ? theme.primary : theme.accent }]} />
                              <Text style={styles.fsWinnerTeamNameLabel}>{team === 'A' ? t('match', 'myTeamLabel') : t('match', 'opponentLabel')}</Text>
                            </View>
                            {teamPlayers.map(pa => {
                              const a = pa.actions;
                              const hasMultipleRoles = (pa.roleSegments || []).length > 1;
                              return (
                                <View key={pa.playerId}>
                                  <View style={styles.fsWinnerPlayerRow}>
                                    <Text style={styles.fsWinnerPlayerName} numberOfLines={1}>{getPlayerName(pa.playerId).split(' ')[0]}</Text>
                                    <View style={styles.fsWinnerPlayerStats}>
                                      <View style={[styles.fsWinnerStatBadge, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
                                        <MaterialIcons name="gps-fixed" size={11} color="#4ADE80" />
                                        <Text style={[styles.fsWinnerStatVal, { color: '#4ADE80' }]}>{a.tirsSuccess}/{a.tirs}</Text>
                                      </View>
                                      <View style={[styles.fsWinnerStatBadge, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                                        <MaterialIcons name="adjust" size={11} color="#60A5FA" />
                                        <Text style={[styles.fsWinnerStatVal, { color: '#60A5FA' }]}>{a.pointsSuccess}/{a.points}</Text>
                                      </View>
                                      {a.carreaux > 0 ? (
                                        <View style={[styles.fsWinnerStatBadge, { backgroundColor: 'rgba(217,119,6,0.2)' }]}>
                                          <MaterialIcons name="stars" size={11} color="#FBBF24" />
                                          <Text style={[styles.fsWinnerStatVal, { color: '#FBBF24' }]}>{a.carreaux}</Text>
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>
                                  {hasMultipleRoles ? (
                                    <View style={{ marginLeft: 12, marginBottom: 6, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.1)', gap: 3 }}>
                                      {(pa.roleSegments || []).map(seg => {
                                        const rc = getRoleColor(seg.role as any);
                                        return (
                                          <View key={seg.role} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rc + '25', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                              <MaterialIcons name={getRoleIcon(seg.role as any) as any} size={9} color={rc} />
                                              <Text style={{ fontSize: 8, fontWeight: '800', color: rc }}>{t('roles', seg.role).substring(0, 1)}</Text>
                                            </View>
                                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
                                              T:{seg.actions.tirsSuccess}/{seg.actions.tirs} P:{seg.actions.pointsSuccess}/{seg.actions.points}{seg.actions.carreaux > 0 ? ` C:${seg.actions.carreaux}` : ''}
                                            </Text>
                                          </View>
                                        );
                                      })}
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Series Info */}
                  {seriesId && (
                    <View style={styles.fsWinnerSeriesInfo}>
                      <Text style={styles.fsWinnerSeriesText}>
                        Série: {seriesWinsA + (teamAScore > teamBScore ? 1 : 0)} - {seriesWinsB + (teamBScore > teamAScore ? 1 : 0)}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.fsWinnerButtons}>
                    {/* Quick Share with Teammates — Primary CTA */}
                    {!hasOnlyLocalPlayers() && quickShareWinnerState !== 'sent' ? (
                      <Pressable 
                        style={[styles.fsWinnerBtnQuickShare, quickShareWinnerState === 'loading' && { opacity: 0.7 }, quickShareWinnerState === 'no_accounts' && { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.1)' }]}
                        onPress={async () => {
                          if (quickShareWinnerState === 'loading') return;
                          if (quickShareWinnerState === 'no_accounts') {
                            // Already checked, just save & exit
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setFullscreenMode(false);
                            setHasExitedFullscreen(true);
                            handleSaveMatch();
                            setTimeout(() => router.replace('/(tabs)'), 100);
                            return;
                          }
                          // Save first, then quick share
                          const newId = await addMatch({
                            date: new Date().toISOString(), mode: isTournamentMode ? 'Tournoi' : 'Entraînement', format,
                            tournamentId: linkedTournament?.id, tournamentName: linkedTournament?.name,
                            tournamentPhase: isTournamentMode ? (selectedPhase || undefined) : undefined,
                            tournamentBracket: isTournamentMode && selectedPhase !== 'Poules' ? selectedBracket || undefined : undefined,
                            terrainId: selectedTerrainId || linkedTournament?.terrainId || undefined,
                            terrainType: selectedTerrain?.type || linkedTournament?.terrainType || undefined,
                            boulesSetId: selectedBoulesSetId || undefined,
                            teamA: { players: getTeamPlayerIds(teamAPlayers).length > 0 ? getTeamPlayerIds(teamAPlayers) : ['1'], playerNames: teamAPlayers.map(p => getPlayerName(p.playerId)), playerRoles: teamAPlayers.map(p => ({ playerId: p.playerId, role: p.role })), score: teamAScore },
                            teamB: { players: getTeamPlayerIds(teamBPlayers).length > 0 ? getTeamPlayerIds(teamBPlayers) : ['2'], playerNames: teamBPlayers.map(p => getPlayerName(p.playerId)), playerRoles: teamBPlayers.map(p => ({ playerId: p.playerId, role: p.role })), score: teamBScore },
                            winner: teamAScore > teamBScore ? 'A' : 'B',
                            duration: matchTime > 0 ? Math.round(matchTime / 60) : Math.floor(Math.random() * 30) + 30,
                            menes: menes.map(m => ({ teamAPoints: m.teamAPoints, teamBPoints: m.teamBPoints, duration: m.duration })),
                            playerActions: playerActions.length > 0 ? playerActions : undefined,
                            seriesInfo: seriesId ? { seriesId, matchNumber: currentMatchNumber, winsBeforeThisMatch: { teamA: seriesWinsA, teamB: seriesWinsB }, isFinale, seriesComplete: (seriesWinsA + (teamAScore > teamBScore ? 1 : 0)) >= 2 || (seriesWinsB + (teamBScore > teamAScore ? 1 : 0)) >= 2, seriesWinner: ((seriesWinsA + (teamAScore > teamBScore ? 1 : 0)) >= 2 || (seriesWinsB + (teamBScore > teamAScore ? 1 : 0)) >= 2) ? ((seriesWinsA + (teamAScore > teamBScore ? 1 : 0)) >= 2 ? 'A' : 'B') : undefined } : undefined,
                          });
                          if (newId) {
                            setSavedMatchIdForShare(newId);
                            await handleQuickShareFromWinner(newId);
                          }
                        }}
                        disabled={quickShareWinnerState === 'loading'}
                      >
                        {quickShareWinnerState === 'loading' ? (
                          <>
                            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FFF', borderTopColor: 'transparent' }} />
                            <Text style={styles.fsWinnerBtnQuickShareText}>{fr ? 'Detection des comptes...' : 'Detecting accounts...'}</Text>
                          </>
                        ) : quickShareWinnerState === 'no_accounts' ? (
                          <>
                            <MaterialIcons name="person-off" size={22} color="#F59E0B" />
                            <Text style={[styles.fsWinnerBtnQuickShareText, { color: '#F59E0B' }]}>{fr ? 'Aucun compte - Sauvegarder' : 'No accounts - Save'}</Text>
                          </>
                        ) : (
                          <>
                            <MaterialIcons name="group-add" size={22} color="#FFF" />
                            <Text style={styles.fsWinnerBtnQuickShareText}>{fr ? 'Partager avec les coequipiers' : 'Share with teammates'}</Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}

                    {/* Sent confirmation + save */}
                    {quickShareWinnerState === 'sent' ? (
                      <Pressable 
                        style={[styles.fsWinnerBtnPrimary, { backgroundColor: '#10B981' }]}
                        onPress={() => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setFullscreenMode(false);
                          setHasExitedFullscreen(true);
                          showInterstitial().finally(() => {
                            router.replace('/(tabs)');
                          });
                        }}
                      >
                        <MaterialIcons name="check-circle" size={22} color="#FFF" />
                        <Text style={styles.fsWinnerBtnText}>
                          {quickShareWinnerCount > 0 ? `${quickShareWinnerCount} ${fr ? 'joueur(s) notifie(s)' : 'player(s) notified'} - ` : ''}{fr ? 'Terminer' : 'Finish'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable 
                        style={styles.fsWinnerBtnPrimary}
                        onPress={() => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setFullscreenMode(false);
                          setHasExitedFullscreen(true);
                          handleSaveMatch();
                          setTimeout(() => router.replace('/(tabs)'), 100);
                        }}
                      >
                        <MaterialIcons name="check" size={22} color="#FFF" />
                        <Text style={styles.fsWinnerBtnText}>{t('match', 'saveAndFinish')}</Text>
                      </Pressable>
                    )}
                    
                    {seriesCompletionInfo?.isComplete ? (
                      <Pressable 
                        style={[styles.fsWinnerBtnShare, { borderColor: 'rgba(251, 191, 36, 0.4)', backgroundColor: 'rgba(251, 191, 36, 0.12)' }]}
                        onPress={handleShareSeries}
                        disabled={isSharingSeries}
                      >
                        {isSharingSeries ? (
                          <Text style={[styles.fsWinnerBtnShareText, { color: theme.warning }]}>{t('matchEdit', 'sharingSeriesProgress')}</Text>
                        ) : (
                          <>
                            <MaterialIcons name="share" size={22} color={theme.warning} />
                            <Text style={[styles.fsWinnerBtnShareText, { color: theme.warning }]}>{t('matchEdit', 'shareEntireSeries')}</Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable 
                        style={styles.fsWinnerBtnShare}
                        onPress={() => { handleSaveAndShare(); }}
                        disabled={isSavingForShare}
                      >
                        {isSavingForShare ? (
                          <Text style={styles.fsWinnerBtnShareText}>{t('matchEdit', 'savingMatch')}</Text>
                        ) : (
                          <>
                            <MaterialIcons name="share" size={22} color="rgba(255,255,255,0.9)" />
                            <Text style={styles.fsWinnerBtnShareText}>{t('matchEdit', 'shareWithParticipants')}</Text>
                          </>
                        )}
                      </Pressable>
                    )}

                    {!isTournamentMode && (
                      <Pressable 
                        style={styles.fsWinnerBtnRevanche}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          
                          // Calculate new series state
                          const winner = teamAScore > teamBScore ? 'A' : 'B';
                          const newSeriesId = seriesId || `series-${Date.now()}`;
                          const newWinsA = (seriesId ? seriesWinsA : 0) + (winner === 'A' ? 1 : 0);
                          const newWinsB = (seriesId ? seriesWinsB : 0) + (winner === 'B' ? 1 : 0);
                          const newMatchNumber = seriesId ? currentMatchNumber : 1;
                          
                          // Check if series is already complete (2 wins)
                          if (newWinsA >= 2 || newWinsB >= 2) {
                            // Series complete, save and end
                            handleSaveMatch();
                            Alert.alert(
                              t('match', 'seriesComplete'), 
                              `${newWinsA >= 2 ? t('match', 'youWon') : t('match', 'opponentWon')} ${t('match', 'seriesWonBy')} ${newWinsA}-${newWinsB}`,
                              [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
                            );
                            return;
                          }
                          
                          // Save current match with series context
                          const overrideContext = {
                            seriesId: newSeriesId,
                            matchNumber: newMatchNumber,
                            winsBeforeThisMatch: { teamA: seriesId ? seriesWinsA : 0, teamB: seriesId ? seriesWinsB : 0 },
                            isFinale: newWinsA === 1 && newWinsB === 1,
                          };
                          handleSaveMatch(overrideContext);
                          
                          // Prepare team names for revanche
                          const teamANames = teamAPlayers.map(p => getPlayerName(p.playerId)).join(',');
                          const teamBNames = teamBPlayers.map(p => getPlayerName(p.playerId)).join(',');
                          
                          // Navigate to new match with revanche params
                          setTimeout(() => {
                            router.replace({
                              pathname: '/match/new',
                              params: {
                                revanche: 'true',
                                format: format,
                                teamA: encodeURIComponent(teamANames),
                                teamB: encodeURIComponent(teamBNames),
                                seriesWinsA: newWinsA.toString(),
                                seriesWinsB: newWinsB.toString(),
                                seriesId: newSeriesId,
                              },
                            });
                          }, 100);
                        }}
                      >
                        <MaterialIcons name="replay" size={22} color={theme.warning} />
                        <Text style={styles.fsWinnerBtnRevancheText}>
                          {seriesId 
                            ? (seriesWinsA === 1 && seriesWinsB === 0) || (seriesWinsA === 0 && seriesWinsB === 1)
                              ? t('match', 'rematch') + ' 2'
                              : (seriesWinsA === 1 && seriesWinsB === 1) 
                                ? t('history', 'finale')
                                : t('match', 'rematch')
                            : t('match', 'rematch')
                          }
                        </Text>
                        {seriesId && (
                          <View style={styles.fsWinnerSeriesBadge}>
                            <Text style={styles.fsWinnerSeriesBadgeText}>
                              {seriesWinsA + (teamAScore > teamBScore ? 1 : 0)}-{seriesWinsB + (teamBScore > teamAScore ? 1 : 0)}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
               </ScrollView>
              </Animated.View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {renderFullscreenScore()}

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {isTournamentMode ? t('match', 'tournamentMatch') : isFinale ? t('history', 'finale') : isRevanche ? `${t('match', 'end')} ${currentMatchNumber}` : t('match', 'newMatch')}
          </Text>
          {isTournamentMode && linkedTournament && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{linkedTournament.name}</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mode & Terrain Selection */}
          {!isTournamentMode ? (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.setupCard}>
              <View style={styles.modeBanner}>
                <View style={styles.modeBannerIcon}>
                  <MaterialIcons name="fitness-center" size={20} color="#FFF" />
                </View>
                <View style={styles.modeBannerContent}>
                  <Text style={styles.modeBannerText}>{t('match', 'training')}</Text>
                  <Text style={styles.modeBannerSubtext}>{t('match', 'revanPossible')}</Text>
                </View>
              </View>
              
              <Pressable style={styles.terrainSelector} onPress={() => setShowTerrainPicker(true)}>
                <View style={styles.terrainSelectorIcon}>
                  <MaterialIcons name="place" size={20} color={selectedTerrain ? theme.primary : theme.textMuted} />
                </View>
                <View style={styles.terrainSelectorContent}>
                  <Text style={styles.terrainSelectorLabel}>{t('match', 'terrain')}</Text>
                  <Text style={[styles.terrainSelectorValue, !selectedTerrain && styles.terrainSelectorPlaceholder]} numberOfLines={1}>
                    {selectedTerrain ? selectedTerrain.name : t('match', 'chooseTerrain')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>

              <Pressable style={styles.terrainSelector} onPress={() => setShowBoulesSetPicker(true)}>
                <View style={styles.terrainSelectorIcon}>
                  <MaterialIcons name="sports-baseball" size={20} color={selectedBoulesSet ? theme.accent : theme.textMuted} />
                </View>
                <View style={styles.terrainSelectorContent}>
                  <Text style={styles.terrainSelectorLabel}>{t('match', 'boulesSet')}</Text>
                  <Text style={[styles.terrainSelectorValue, !selectedBoulesSet && styles.terrainSelectorPlaceholder]} numberOfLines={1}>
                    {selectedBoulesSet ? `${selectedBoulesSet.name}${selectedBoulesSet.diameter ? ` • ${selectedBoulesSet.diameter}mm` : ''}${selectedBoulesSet.weight ? ` • ${selectedBoulesSet.weight}g` : ''}` : t('match', 'chooseBoulesSet')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.setupCard}>
              <View style={styles.modeBanner}>
                <View style={[styles.modeBannerIcon, { backgroundColor: theme.carreauColor }]}>
                  <MaterialIcons name="emoji-events" size={20} color="#FFF" />
                </View>
                <View style={styles.modeBannerContent}>
                  <Text style={styles.modeBannerText}>{linkedTournament?.name}</Text>
                  <Text style={styles.modeBannerSubtext}>{t('formats', format)} • {t('tournamentTypes', linkedTournament?.type || 'Mixte')}</Text>
                </View>
              </View>

              <Pressable style={styles.terrainSelector} onPress={() => setShowBoulesSetPicker(true)}>
                <View style={styles.terrainSelectorIcon}>
                  <MaterialIcons name="sports-baseball" size={20} color={selectedBoulesSet ? theme.accent : theme.textMuted} />
                </View>
                <View style={styles.terrainSelectorContent}>
                  <Text style={styles.terrainSelectorLabel}>{t('match', 'boulesSet')}</Text>
                  <Text style={[styles.terrainSelectorValue, !selectedBoulesSet && styles.terrainSelectorPlaceholder]} numberOfLines={1}>
                    {selectedBoulesSet ? `${selectedBoulesSet.name}${selectedBoulesSet.diameter ? ` • ${selectedBoulesSet.diameter}mm` : ''}${selectedBoulesSet.weight ? ` • ${selectedBoulesSet.weight}g` : ''}` : t('match', 'chooseBoulesSet')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </Pressable>
            </Animated.View>
          )}

          {/* Actions Editor Button */}
          <Animated.View entering={FadeInDown.duration(300).delay(50)}>
            <Pressable 
              style={styles.actionsEditorButton}
              onPress={() => { Haptics.selectionAsync(); setShowActionsEditor(true); }}
            >
              <MaterialIcons name="edit-note" size={24} color={theme.primary} />
              <View style={styles.actionsEditorContent}>
                <Text style={styles.actionsEditorTitle}>{t('match', 'matchActions')}</Text>
                <Text style={styles.actionsEditorSubtitle}>{t('match', 'menActionsTimer')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
            </Pressable>
          </Animated.View>

          {/* Tournament Phase Selection */}
          {isTournamentMode && linkedTournament && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.phaseSection}>
              <Text style={styles.sectionLabel}>{t('match', 'tournamentPhase')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseScroll}>
                {tournamentPhases.map((phase) => (
                  <Pressable
                    key={phase.id}
                    style={[styles.phaseChip, selectedPhase === phase.id && styles.phaseChipActive]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedPhase(phase.id); }}
                  >
                    <Text style={[styles.phaseChipText, selectedPhase === phase.id && styles.phaseChipTextActive]}>
                      {phase.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Format Selection */}
          <Animated.View entering={FadeInDown.duration(300).delay(50)} style={styles.formatSection}>
            <Text style={styles.sectionLabel}>{t('match', 'format')}</Text>
            <View style={styles.formatRow}>
              {config.game.formats.map(f => {
                const isActive = format === f;
                const isDisabled = linkedTournament && f !== linkedTournament.format;
                return (
                  <Pressable
                    key={f}
                    style={[styles.formatChip, isActive && styles.formatChipActive, isDisabled && styles.formatChipDisabled]}
                    onPress={() => { if (isDisabled) return; Haptics.selectionAsync(); setFormat(f); }}
                    disabled={isDisabled}
                  >
                    <MaterialIcons 
                      name={f === 'Tête-à-tête' ? 'person' : f === 'Doublette' ? 'people' : 'groups'} 
                      size={18} 
                      color={isActive ? '#FFF' : isDisabled ? theme.textMuted : theme.textSecondary} 
                    />
                    <Text style={[styles.formatChipText, isActive && styles.formatChipTextActive, isDisabled && styles.formatChipTextDisabled]}>
                      {t('formats', f)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {/* Team Selection Section */}
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.teamSelectionSection}>
            <Text style={styles.sectionLabel}>{t('match', 'teamSelection')}</Text>
            
            {/* Team A */}
            <Pressable style={styles.teamCard} onPress={() => setShowPlayerPicker('A')}>
              <View style={styles.teamCardHeader}>
                <View style={[styles.teamColorDot, { backgroundColor: theme.primary }]} />
                <Text style={styles.teamCardTitle}>{t('match', 'myTeam')}</Text>
                <MaterialIcons name="edit" size={18} color={theme.textMuted} />
              </View>
              <View style={styles.teamCardPlayers}>
                {teamAPlayers.length > 0 ? (
                  teamAPlayers.map(p => (
                    <View key={p.playerId} style={[styles.playerChip, { borderColor: theme.primary }]}>
                      <Text style={styles.playerChipName}>{getPlayerName(p.playerId)}</Text>
                      {availableRoles.length > 0 && (
                        <View style={[styles.playerChipRole, { backgroundColor: p.role === 'Tireur' ? theme.tirColor : p.role === 'Pointeur' ? theme.pointColor : theme.accent }]}>
                          <Text style={styles.playerChipRoleText}>{t('roles', p.role).charAt(0)}</Text>
                        </View>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.teamCardPlaceholder}>{t('match', 'addPlayers')}</Text>
                )}
              </View>
              <Text style={styles.teamCardCount}>{teamAPlayers.length}/{maxPlayersPerTeam}</Text>
            </Pressable>

            {/* Team B */}
            <Pressable style={styles.teamCard} onPress={() => setShowPlayerPicker('B')}>
              <View style={styles.teamCardHeader}>
                <View style={[styles.teamColorDot, { backgroundColor: theme.accent }]} />
                <Text style={styles.teamCardTitle}>{t('match', 'opponent')}</Text>
                <MaterialIcons name="edit" size={18} color={theme.textMuted} />
              </View>
              <View style={styles.teamCardPlayers}>
                {teamBPlayers.length > 0 ? (
                  teamBPlayers.map(p => (
                    <View key={p.playerId} style={[styles.playerChip, { borderColor: theme.accent }]}>
                      <Text style={styles.playerChipName}>{getPlayerName(p.playerId)}</Text>
                      {availableRoles.length > 0 && (
                        <View style={[styles.playerChipRole, { backgroundColor: p.role === 'Tireur' ? theme.tirColor : p.role === 'Pointeur' ? theme.pointColor : theme.accent }]}>
                          <Text style={styles.playerChipRoleText}>{t('roles', p.role).charAt(0)}</Text>
                        </View>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.teamCardPlaceholder}>{t('match', 'addPlayers')}</Text>
                )}
              </View>
              <Text style={styles.teamCardCount}>{teamBPlayers.length}/{maxPlayersPerTeam}</Text>
            </Pressable>
          </Animated.View>

          {/* ELO Match Prediction */}
          {teamAPlayers.length > 0 && teamBPlayers.length > 0 ? (() => {
            const teamAElos = teamAPlayers.map(p => {
              const pl = players.find(x => x.id === p.playerId);
              return pl?.eloRating || ELO_INITIAL;
            });
            const teamBElos = teamBPlayers.map(p => {
              const pl = players.find(x => x.id === p.playerId);
              return pl?.eloRating || ELO_INITIAL;
            });
            const avgA = Math.round(teamAElos.reduce((a, b) => a + b, 0) / teamAElos.length);
            const avgB = Math.round(teamBElos.reduce((a, b) => a + b, 0) / teamBElos.length);
            // Only show if at least one team has non-default ELO
            if (avgA === ELO_INITIAL && avgB === ELO_INITIAL) return null;
            const prediction = predictMatch(teamAElos, teamBElos);
            const favTeam = prediction.teamAWinProbability >= prediction.teamBWinProbability ? 'A' : 'B';
            const favPct = favTeam === 'A' ? prediction.teamAWinProbability : prediction.teamBWinProbability;
            const favColor = favTeam === 'A' ? theme.primary : theme.accent;
            const rankA = getEloRank(avgA);
            const rankB = getEloRank(avgB);
            return (
              <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.predictionCard}>
                <View style={styles.predictionHeader}>
                  <MaterialIcons name="analytics" size={16} color="#9333EA" />
                  <Text style={styles.predictionTitle}>{t('leaderboard', 'eloPrediction')}</Text>
                  <View style={[styles.predictionFavBadge, { backgroundColor: favColor + '15' }]}>
                    <MaterialIcons name="star" size={12} color={favColor} />
                    <Text style={[styles.predictionFavText, { color: favColor }]}>{t('leaderboard', 'eloFavorite')}</Text>
                  </View>
                </View>
                <View style={styles.predictionContent}>
                  <View style={styles.predictionTeam}>
                    <View style={[styles.predictionTeamDot, { backgroundColor: theme.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.predictionTeamLabel}>{t('match', 'myTeam')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.predictionEloValue, { color: rankA.color }]}>{avgA}</Text>
                        <View style={[styles.predictionRankBadge, { backgroundColor: rankA.color + '15' }]}>
                          <MaterialIcons name={rankA.icon as any} size={10} color={rankA.color} />
                        </View>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.predictionPct, prediction.teamAWinProbability >= 50 && { color: theme.success, fontWeight: '900' as const }]}>{prediction.teamAWinProbability}%</Text>
                      <Text style={styles.predictionDelta}>{formatEloDelta(prediction.estimatedDeltaIfAWins)}</Text>
                    </View>
                  </View>
                  <View style={styles.predictionBar}>
                    <View style={[styles.predictionBarA, { flex: Math.max(prediction.teamAWinProbability, 1) }]} />
                    <View style={[styles.predictionBarB, { flex: Math.max(prediction.teamBWinProbability, 1) }]} />
                  </View>
                  <View style={styles.predictionTeam}>
                    <View style={[styles.predictionTeamDot, { backgroundColor: theme.accent }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.predictionTeamLabel}>{t('match', 'opponent')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.predictionEloValue, { color: rankB.color }]}>{avgB}</Text>
                        <View style={[styles.predictionRankBadge, { backgroundColor: rankB.color + '15' }]}>
                          <MaterialIcons name={rankB.icon as any} size={10} color={rankB.color} />
                        </View>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.predictionPct, prediction.teamBWinProbability >= 50 && { color: theme.success, fontWeight: '900' as const }]}>{prediction.teamBWinProbability}%</Text>
                      <Text style={styles.predictionDelta}>{formatEloDelta(prediction.estimatedDeltaIfBWins)}</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          })() : null}

          {/* Summary Stats */}
          {(menes.length > 0 || matchTime > 0) && (
            <Animated.View entering={FadeInDown.duration(300).delay(200)} style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{t('match', 'matchSummary')}</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <MaterialIcons name="timer" size={20} color={theme.primary} />
                  <Text style={styles.summaryValue}>{formatTime(matchTime)}</Text>
                  <Text style={styles.summaryLabel}>{t('match', 'durationLabel')}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <MaterialIcons name="sports" size={20} color={theme.accent} />
                  <Text style={styles.summaryValue}>{menes.length}</Text>
                  <Text style={styles.summaryLabel}>{t('match', 'endsLabel')}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <MaterialIcons name="scoreboard" size={20} color={theme.carreauColor} />
                  <Text style={styles.summaryValue}>{teamAScore} - {teamBScore}</Text>
                  <Text style={styles.summaryLabel}>{t('match', 'score')}</Text>
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Footer Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {hasExitedFullscreen && isMatchReady ? (
            <View style={styles.footerButtonsRow}>
              <Pressable 
                style={styles.returnToMatchButton} 
                onPress={() => { 
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                  setFullscreenMode(true); 
                }}
              >
                <MaterialIcons name="fullscreen" size={22} color={theme.primary} />
                <Text style={styles.returnToMatchButtonText}>{t('match', 'returnToMatch')}</Text>
              </Pressable>
              <Pressable testID="save-match-button" style={styles.saveButton} onPress={() => handleSaveMatch()}>
                <MaterialIcons name="check" size={22} color="#FFF" />
                <Text style={styles.saveButtonText}>{t('match', 'saveAndClose')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable 
              testID="start-match-button"
              style={styles.fullscreenButton}
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setFullscreenMode(true); 
                setIsTimerRunning(true);
              }}
            >
              <MaterialIcons name="play-arrow" size={24} color="#FFF" />
              <Text style={styles.fullscreenButtonText}>{t('match', 'startMatch')}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Actions Editor Modal */}
      <Modal
        visible={showActionsEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowActionsEditor(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowActionsEditor(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('match', 'playerActions')}</Text>
            <Pressable style={styles.modalDoneBtn} onPress={() => setShowActionsEditor(false)}>
              <Text style={styles.modalDoneText}>OK</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.actionsEditorScroll} contentContainerStyle={styles.actionsEditorContent}>
            {/* Timer Section */}
            <View style={styles.editorSection}>
              <Text style={styles.editorSectionTitle}>{t('match', 'timer')}</Text>
              <View style={styles.timerDisplay}>
                <View style={styles.timerMain}>
                  <MaterialIcons name="timer" size={28} color={isTimerRunning ? theme.primary : theme.textMuted} />
                  <Text style={[styles.timerValue, isTimerRunning && styles.timerValueActive]}>{formatTime(matchTime)}</Text>
                </View>
                <View style={styles.timerControls}>
                  {!isTimerRunning ? (
                    <Pressable style={[styles.timerBtn, styles.timerBtnStart]} onPress={startTimer}>
                      <MaterialIcons name="play-arrow" size={24} color="#FFF" />
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.timerBtn, styles.timerBtnPause]} onPress={pauseTimer}>
                      <MaterialIcons name="pause" size={24} color="#FFF" />
                    </Pressable>
                  )}
                  <Pressable style={[styles.timerBtn, styles.timerBtnReset]} onPress={resetTimer}>
                    <MaterialIcons name="refresh" size={20} color={theme.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Mène Section */}
            <View style={styles.editorSection}>
              <Text style={styles.editorSectionTitle}>{t('match', 'menes')} ({menes.length})</Text>
              <View style={styles.meneCard}>
                <View style={styles.meneRow}>
                  <Text style={styles.meneTeamLabel}>{t('match', 'myTeam')}</Text>
                  <View style={styles.menePointsRow}>
                    {Array.from({ length: maxPointsPerMene }, (_, i) => i + 1).map(pts => (
                      <Pressable
                        key={`A-${pts}`}
                        style={[styles.menePointBtn, currentMenePoints.teamA === pts && styles.menePointBtnActiveA]}
                        onPress={() => handleMenePoint('teamA', pts)}
                      >
                        <Text style={[styles.menePointText, currentMenePoints.teamA === pts && styles.menePointTextActive]}>{pts}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.meneDivider} />
                <View style={styles.meneRow}>
                  <Text style={styles.meneTeamLabel}>{t('match', 'opponent')}</Text>
                  <View style={styles.menePointsRow}>
                    {Array.from({ length: maxPointsPerMene }, (_, i) => i + 1).map(pts => (
                      <Pressable
                        key={`B-${pts}`}
                        style={[styles.menePointBtn, currentMenePoints.teamB === pts && styles.menePointBtnActiveB]}
                        onPress={() => handleMenePoint('teamB', pts)}
                      >
                        <Text style={[styles.menePointText, currentMenePoints.teamB === pts && styles.menePointTextActive]}>{pts}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable style={[styles.nullMeneBtn, isNullMene && styles.nullMeneBtnActive]} onPress={handleNullMene}>
                  <MaterialIcons name={isNullMene ? 'check-box' : 'check-box-outline-blank'} size={18} color={isNullMene ? theme.warning : theme.textMuted} />
                  <Text style={[styles.nullMeneText, isNullMene && styles.nullMeneTextActive]}>{t('match', 'nullEnd')}</Text>
                </Pressable>
                <Pressable 
                  style={[styles.addMeneBtn, (!isNullMene && !currentMenePoints.teamA && !currentMenePoints.teamB) && styles.addMeneBtnDisabled]}
                  onPress={addMene}
                >
                  <MaterialIcons name="check" size={20} color="#FFF" />
                  <Text style={styles.addMeneBtnText}>{t('match', 'validateEnd')} {menes.length + 1}</Text>
                </Pressable>
              </View>

              {menes.length > 0 && (
                <View style={styles.menesHistory}>
                  <View style={styles.menesHistoryHeader}>
                    <Text style={styles.menesHistoryTitle}>{t('match', 'historyLabel')}</Text>
                    <Pressable onPress={undoLastMene}>
                      <Text style={styles.undoText}>{t('match', 'undoLast')}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.menesHistoryList}>
                    {menes.map(m => (
                      <View key={m.id} style={styles.meneHistoryItem}>
                        <Text style={styles.meneHistoryNum}>M{m.id}</Text>
                        {m.isNull ? (
                          <Text style={styles.meneHistoryNull}>⊘</Text>
                        ) : (
                          <>
                            <Text style={[styles.meneHistoryScore, m.teamAPoints > 0 && styles.meneHistoryWin]}>
                              {m.teamAPoints > 0 ? `+${m.teamAPoints}` : '-'}
                            </Text>
                            <Text style={styles.meneHistorySep}>/</Text>
                            <Text style={[styles.meneHistoryScore, m.teamBPoints > 0 && styles.meneHistoryLoss]}>
                              {m.teamBPoints > 0 ? `+${m.teamBPoints}` : '-'}
                            </Text>
                          </>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Player Actions */}
            {(teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
              <View style={styles.editorSection}>
                <Text style={styles.editorSectionTitle}>{t('match', 'playerActions')}</Text>
                {[...teamAPlayers, ...teamBPlayers].map((p, idx) => {
                  const isTeamA = idx < teamAPlayers.length;
                  const stats = getPlayerActionStats(p.playerId);
                  return (
                    <View key={p.playerId} style={styles.playerActionCard}>
                      <View style={styles.playerActionHeader}>
                        <View style={[styles.playerActionDot, { backgroundColor: isTeamA ? theme.primary : theme.accent }]} />
                        <Text style={styles.playerActionName} numberOfLines={2}>{getPlayerName(p.playerId)}</Text>
                        <View style={styles.playerActionStats}>
                          <Text style={styles.playerActionStat}>T: {stats.tirsSuccess}/{stats.tirs}</Text>
                          <Text style={styles.playerActionStat}>P: {stats.pointsSuccess}/{stats.points}</Text>
                          <Text style={[styles.playerActionStat, { color: theme.carreauColor }]}>C: {stats.carreaux}</Text>
                        </View>
                      </View>
                      <View style={styles.playerNotationBtns}>
                        <Pressable
                          style={[styles.playerNotationBtn, { backgroundColor: theme.tirColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setEditorNotationPlayer({ id: p.playerId, name: getPlayerName(p.playerId), team: isTeamA ? 'A' : 'B' });
                            setEditorNotationType('tir');
                            setShowEditorNotation(true);
                          }}
                        >
                          <MaterialIcons name="gps-fixed" size={18} color="#FFF" />
                          <Text style={styles.playerNotationBtnText}>+ {t('match', 'shot')}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.playerNotationBtn, { backgroundColor: theme.pointColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setEditorNotationPlayer({ id: p.playerId, name: getPlayerName(p.playerId), team: isTeamA ? 'A' : 'B' });
                            setEditorNotationType('point');
                            setShowEditorNotation(true);
                          }}
                        >
                          <MaterialIcons name="adjust" size={18} color="#FFF" />
                          <Text style={styles.playerNotationBtnText}>+ {t('match', 'point')}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.playerNotationBtn, { backgroundColor: theme.carreauColor }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                            recordAction(p.playerId, 'carreau', true);
                          }}
                        >
                          <MaterialIcons name="stars" size={18} color="#FFF" />
                          <Text style={styles.playerNotationBtnText}>{t('match', 'carreau')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Editor Notation Modal */}
            {editorNotationPlayer && (
              <SimplifiedShotNotation
                visible={showEditorNotation}
                onClose={() => {
                  setShowEditorNotation(false);
                  setEditorNotationPlayer(null);
                }}
                actionType={editorNotationType}
                playerId={editorNotationPlayer.id}
                playerName={editorNotationPlayer.name}
                team={editorNotationPlayer.team}
                onSubmit={handleAdvancedShotSubmit}
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Post-match Share Modal (outside fullscreen modal to avoid nested modals) */}
      {savedMatchIdForShare ? (
        <ShareModal
          visible={showPostMatchShare}
          onClose={() => {
            setShowPostMatchShare(false);
            showInterstitial().finally(() => {
              setTimeout(() => router.replace('/(tabs)'), 100);
            });
          }}
          itemType="match"
          itemId={savedMatchIdForShare}
          itemName={`${teamAPlayers.map(p => getPlayerName(p.playerId)).join(', ')} vs ${teamBPlayers.map(p => getPlayerName(p.playerId)).join(', ')}`}
          forceReadOnly
        />
      ) : null}

      {/* Cross-player Share Request Modal */}
      <ShareRequestModal
        visible={showShareRequestModal}
        onClose={() => {
          setShowShareRequestModal(false);
          // After share request modal, show the regular share modal if we have an ID
          if (savedMatchIdForShare) {
            setTimeout(() => setShowPostMatchShare(true), 300);
          } else {
            showInterstitial().finally(() => {
              setTimeout(() => router.replace('/(tabs)'), 100);
            });
          }
        }}
        itemType="match"
        itemId={shareRequestItemId || savedMatchIdForShare}
        playerIds={shareRequestPlayerIds}
        senderName={selfPlayer?.name || t('match', 'myTeam')}
        itemSummary={`${teamAPlayers.map(p => getPlayerName(p.playerId)).join(', ')} vs ${teamBPlayers.map(p => getPlayerName(p.playerId)).join(', ')} (${teamAScore}-${teamBScore})`}
        language={language}
        matchPlayerIds={[...getTeamPlayerIds(teamAPlayers), ...getTeamPlayerIds(teamBPlayers)].filter(id => id !== '1' && id !== '2')}
      />

      {/* Boules Set Picker Modal */}
      <Modal
        visible={showBoulesSetPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBoulesSetPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowBoulesSetPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('match', 'boulesSet')}</Text>
            <Pressable style={styles.modalDoneBtn} onPress={() => { setSelectedBoulesSetId(null); setShowBoulesSetPicker(false); }}>
              <Text style={[styles.modalDoneText, { color: theme.textMuted }]}>-</Text>
            </Pressable>
          </View>

          <FlatList
            data={boulesSets}
            keyExtractor={item => item.id}
            style={styles.playersList}
            contentContainerStyle={styles.playersListContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: bs }) => (
              <Pressable
                style={[styles.playerItem, selectedBoulesSetId === bs.id && styles.playerItemSelected]}
                onPress={() => { Haptics.selectionAsync(); setSelectedBoulesSetId(bs.id); setShowBoulesSetPicker(false); }}
              >
                <View style={[styles.playerAvatar, selectedBoulesSetId === bs.id && { backgroundColor: theme.accent }]}>
                  <MaterialIcons name="sports-baseball" size={22} color="#FFF" />
                </View>
                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName}>{bs.name}</Text>
                    {bs.isPrimary ? (
                      <View style={styles.moiBadge}><Text style={styles.moiBadgeText}>{t('match', 'primary')}</Text></View>
                    ) : null}
                  </View>
                  <Text style={styles.playerMeta}>
                    {[bs.brand, bs.diameter ? `${bs.diameter}mm` : '', bs.weight ? `${bs.weight}g` : '', bs.hardness].filter(Boolean).join(' • ')}
                  </Text>
                </View>
                <MaterialIcons
                  name={selectedBoulesSetId === bs.id ? 'check-circle' : 'radio-button-unchecked'}
                  size={24}
                  color={selectedBoulesSetId === bs.id ? theme.accent : theme.border}
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <MaterialIcons name="sports-baseball" size={40} color={theme.textMuted} />
                <Text style={styles.emptySearchText}>{t('match', 'noBoulesSet')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Terrain Picker Modal */}
      <Modal
        visible={showTerrainPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowTerrainPicker(false); setTerrainSearch(''); }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => { setShowTerrainPicker(false); setTerrainSearch(''); }}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('match', 'terrain')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.terrainSearchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={styles.terrainSearchInput}
              value={terrainSearch}
              onChangeText={setTerrainSearch}
              placeholder={t('profile', 'searchTerrain')}
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            {terrainSearch.length > 0 ? (
              <Pressable onPress={() => setTerrainSearch('')}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 4 }}>
            <Pressable style={styles.terrainAddNewBtn} onPress={() => { setShowTerrainPicker(false); setTerrainSearch(''); router.push('/terrain/new'); }}>
              <MaterialIcons name="add" size={14} color={theme.primary} />
              <Text style={styles.terrainAddNewBtnText}>{t('match', 'addTerrain')}</Text>
            </Pressable>
          </View>

          {/* None option */}
          <Pressable
            style={[styles.terrainPickerItem, !selectedTerrainId && styles.terrainPickerItemActive]}
            onPress={() => { Haptics.selectionAsync(); setSelectedTerrainId(null); setShowTerrainPicker(false); setTerrainSearch(''); }}
          >
            <View style={[styles.terrainPickerItemIcon, { backgroundColor: theme.textMuted + '15' }]}>
              <MaterialIcons name="block" size={20} color={theme.textMuted} />
            </View>
            <Text style={styles.terrainPickerItemName}>{t('tournament', 'none')}</Text>
            {!selectedTerrainId ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
          </Pressable>

          <FlatList
            data={sortedTerrains}
            keyExtractor={item => item.id}
            style={styles.playersList}
            contentContainerStyle={styles.playersListContent}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            renderItem={({ item: terrain }) => {
              const tc = config.terrainTypes.find(t => t.id === terrain.type);
              return (
                <Pressable
                  style={[styles.terrainPickerItem, { marginHorizontal: 0 }, selectedTerrainId === terrain.id && styles.terrainPickerItemActive]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedTerrainId(terrain.id); setShowTerrainPicker(false); setTerrainSearch(''); }}
                >
                  <View style={[styles.terrainPickerItemIcon, { backgroundColor: selectedTerrainId === terrain.id ? theme.primary : theme.success + '15' }]}>
                    <MaterialIcons name={(tc?.icon as any) || 'landscape'} size={20} color={selectedTerrainId === terrain.id ? '#FFF' : theme.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.terrainPickerItemName}>{terrain.name}</Text>
                      {(terrain as any)._matchCount > 0 ? (
                        <View style={styles.terrainMatchBadge}>
                          <MaterialIcons name="sports" size={10} color={theme.primary} />
                          <Text style={styles.terrainMatchBadgeText}>{(terrain as any)._matchCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.terrainPickerItemSub}>{t('terrainTypes', terrain.type)} • {terrain.city}</Text>
                  </View>
                  {selectedTerrainId === terrain.id ? <MaterialIcons name="check-circle" size={22} color={theme.primary} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <MaterialIcons name={terrainSearch ? 'search-off' : 'location-off'} size={40} color={theme.textMuted} />
                <Text style={styles.emptySearchText}>{terrainSearch ? t('common', 'noResults') : t('match', 'noTerrains')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Player Picker Modal */}
      <Modal
        visible={showPlayerPicker !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowPlayerPicker(null); setPlayerSearch(''); }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => { setShowPlayerPicker(null); setPlayerSearch(''); }}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{showPlayerPicker === 'A' ? t('match', 'myTeam') : t('match', 'opponent')}</Text>
            <Pressable style={styles.modalDoneBtn} onPress={() => { setShowPlayerPicker(null); setPlayerSearch(''); }}>
              <Text style={styles.modalDoneText}>OK</Text>
            </Pressable>
          </View>

          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={playerSearch}
              onChangeText={setPlayerSearch}
              placeholder={`${t('common', 'search')}...`}
              placeholderTextColor={theme.textMuted}
            />
            {playerSearch.length > 0 && (
              <Pressable onPress={() => setPlayerSearch('')}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            )}
          </View>

          <Text style={styles.selectionCount}>
            {showPlayerPicker === 'A' ? teamAPlayers.length : teamBPlayers.length} / {maxPlayersPerTeam} {t('match', 'selected')}
          </Text>

          <FlatList
            data={filteredPlayers.filter(player => !(showPlayerPicker === 'A' && selfPlayer && player.id === selfPlayer.id))}
            keyExtractor={item => item.id}
            style={styles.playersList}
            contentContainerStyle={styles.playersListContent}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListHeaderComponent={
              <>
                {showPlayerPicker === 'A' && selfPlayer ? (
                  <Pressable
                    style={[styles.playerItem, teamAPlayers.some(p => p.playerId === selfPlayer.id) && styles.playerItemSelected]}
                    onPress={() => togglePlayer(selfPlayer.id, 'A')}
                  >
                    <View style={[styles.playerAvatar, teamAPlayers.some(p => p.playerId === selfPlayer.id) && styles.playerAvatarSelected]}>
                      <Text style={styles.playerAvatarText}>{selfPlayer.name?.charAt(0) || 'M'}</Text>
                    </View>
                    <View style={styles.playerInfo}>
                      <View style={styles.playerNameRow}>
                        <Text style={styles.playerName}>{selfPlayer.name || t('history', 'me')}</Text>
                        <View style={styles.moiBadge}><Text style={styles.moiBadgeText}>MOI</Text></View>
                      </View>
                      <Text style={styles.playerMeta}>{t('roles', selfPlayer.role)}</Text>
                    </View>
                    <MaterialIcons 
                      name={teamAPlayers.some(p => p.playerId === selfPlayer.id) ? 'check-circle' : 'radio-button-unchecked'} 
                      size={24} 
                      color={teamAPlayers.some(p => p.playerId === selfPlayer.id) ? theme.primary : theme.border} 
                    />
                  </Pressable>
                ) : null}

                {/* Suggested Partner Banner */}
                {showPlayerPicker === 'A' && mostPlayedPartner && (format === 'Doublette' || format === 'Triplette') && (() => {
                  const isSelected = teamAPlayers.some(p => p.playerId === mostPlayedPartner.id);
                  const isInOtherTeam = teamBPlayers.some(p => p.playerId === mostPlayedPartner.id);
                  if (isInOtherTeam) return null;
                  return (
                    <View style={styles.suggestedPartnerBanner}>
                      <View style={styles.suggestedPartnerHeader}>
                        <MaterialIcons name="auto-awesome" size={16} color={theme.carreauColor} />
                        <Text style={styles.suggestedPartnerLabel}>{t('match', 'suggestedPartner')}</Text>
                      </View>
                      <View style={styles.suggestedPartnerRow}>
                        <View style={[styles.playerAvatar, isSelected && styles.playerAvatarSelected, { width: 40, height: 40, borderRadius: 20 }]}>
                          <Text style={[styles.playerAvatarText, { fontSize: 14 }]}>{mostPlayedPartner.name.split(' ').map(n => n[0]).join('')}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.playerName}>{mostPlayedPartner.name}</Text>
                          <Text style={styles.playerMeta}>{t('roles', mostPlayedPartner.role)}</Text>
                        </View>
                        {isSelected ? (
                          <Pressable
                            style={styles.suggestedPartnerRemoveBtn}
                            onPress={() => { Haptics.selectionAsync(); setTeamAPlayers(prev => prev.filter(p => p.playerId !== mostPlayedPartner.id)); }}
                          >
                            <MaterialIcons name="close" size={18} color={theme.error} />
                            <Text style={styles.suggestedPartnerRemoveText}>{t('common', 'delete')}</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            style={styles.suggestedPartnerAddBtn}
                            onPress={() => togglePlayer(mostPlayedPartner.id, 'A')}
                          >
                            <MaterialIcons name="add" size={18} color="#FFF" />
                            <Text style={styles.suggestedPartnerAddText}>{t('match', 'addBtn')}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })()}

                {showPlayerPicker && availableRoles.length > 0 && (showPlayerPicker === 'A' ? teamAPlayers : teamBPlayers).length > 0 ? (
                  <View style={styles.roleSelectionSection}>
                    <Text style={styles.roleSelectionTitle}>{t('match', 'playerRoles')}</Text>
                    {(showPlayerPicker === 'A' ? teamAPlayers : teamBPlayers).map(p => {
                      const suggestion = roleSuggestions.get(p.playerId);
                      return (
                        <View key={p.playerId} style={styles.roleSelectionRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.roleSelectionName}>{getPlayerName(p.playerId)}</Text>
                            {suggestion ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <MaterialIcons name="auto-awesome" size={10} color={getSuggestionColor(suggestion.confidence)} />
                                <Text style={{ fontSize: 9, fontWeight: '600', color: getSuggestionColor(suggestion.confidence) }}>
                                  {t('roles', suggestion.bestRole)} ({suggestion.confidence}%)
                                </Text>
                                {p.role === suggestion.bestRole ? (
                                  <MaterialIcons name="check-circle" size={10} color="#10B981" />
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.roleButtonsRow}>
                            {availableRoles.map(role => {
                              const isSuggested = suggestion?.bestRole === role && p.role !== role;
                              return (
                                <Pressable
                                  key={role}
                                  style={[styles.roleButton, p.role === role && (showPlayerPicker === 'A' ? styles.roleButtonActiveA : styles.roleButtonActiveB), isSuggested && { borderWidth: 1.5, borderColor: getSuggestionColor(suggestion?.confidence || 0) + '60' }]}
                                  onPress={() => updatePlayerRole(p.playerId, showPlayerPicker!, role)}
                                >
                                  <Text style={[styles.roleButtonText, p.role === role && styles.roleButtonTextActive]}>{t('roles', role).charAt(0)}</Text>
                                  {isSuggested ? <View style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: 3, backgroundColor: getSuggestionColor(suggestion?.confidence || 0) }} /> : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {showPlayerPicker === 'B' ? (
                  <Pressable style={styles.createPlayerBtn} onPress={() => { setShowPlayerPicker(null); setPlayerSearch(''); router.push('/player/new'); }}>
                    <View style={styles.createPlayerIcon}>
                      <MaterialIcons name="person-add" size={22} color={theme.accent} />
                    </View>
                    <View style={styles.createPlayerInfo}>
                      <Text style={styles.createPlayerTitle}>{t('match', 'createOpponent')}</Text>
                      <Text style={styles.createPlayerSubtitle}>{t('match', 'addNewPlayer')}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </>
            }
            renderItem={({ item: player }) => {
              const isSelectedA = teamAPlayers.some(p => p.playerId === player.id);
              const isSelectedB = teamBPlayers.some(p => p.playerId === player.id);
              const isInOtherTeam = showPlayerPicker === 'A' ? isSelectedB : isSelectedA;
              const isSelected = showPlayerPicker === 'A' ? isSelectedA : isSelectedB;

              return (
                <Pressable
                  style={[styles.playerItem, isSelected && styles.playerItemSelected, isInOtherTeam && styles.playerItemDisabled]}
                  onPress={() => !isInOtherTeam && togglePlayer(player.id, showPlayerPicker!)}
                  disabled={isInOtherTeam}
                >
                  <View style={[styles.playerAvatar, isSelected && (showPlayerPicker === 'A' ? styles.playerAvatarSelectedA : styles.playerAvatarSelectedB), isInOtherTeam && styles.playerAvatarDisabled]}>
                    <Text style={styles.playerAvatarText}>{player.name.split(' ').map(n => n[0]).join('')}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, isInOtherTeam && { color: theme.textMuted }]}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{t('roles', player.role)}{player.club ? ` • ${player.club}` : ''}</Text>
                  </View>
                  {isInOtherTeam ? (
                    <Text style={styles.otherTeamLabel}>{t('match', 'otherTeam')}</Text>
                  ) : (
                    <MaterialIcons 
                      name={isSelected ? 'check-circle' : 'radio-button-unchecked'} 
                      size={24} 
                      color={isSelected ? (showPlayerPicker === 'A' ? theme.primary : theme.accent) : theme.border} 
                    />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <MaterialIcons name="search-off" size={40} color={theme.textMuted} />
                <Text style={styles.emptySearchText}>{t('match', 'noPlayersFound')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  setupCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 16, marginBottom: 16, ...theme.shadows.card },
  modeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primary + '10', borderRadius: theme.borderRadius.lg, padding: 14, gap: 12, marginBottom: 12 },
  modeBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  modeBannerContent: { flex: 1 },
  modeBannerText: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  modeBannerSubtext: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  terrainSelector: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border, gap: 10 },
  terrainSelectorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  terrainSelectorContent: { flex: 1 },
  terrainSelectorLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 2 },
  terrainSelectorValue: { fontSize: 14, fontWeight: '500', color: theme.textPrimary },
  terrainSelectorPlaceholder: { color: theme.textMuted, fontStyle: 'italic' },
  phaseSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 10 },
  phaseScroll: { gap: 8 },
  phaseChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: theme.borderRadius.full, borderWidth: 1, borderColor: theme.border },
  phaseChipActive: { backgroundColor: theme.carreauColor, borderColor: theme.carreauColor },
  phaseChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  phaseChipTextActive: { color: '#FFF' },
  formatSection: { marginBottom: 16 },
  formatRow: { flexDirection: 'row', gap: 10 },
  formatChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, borderWidth: 2, borderColor: 'transparent' },
  formatChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  formatChipDisabled: { opacity: 0.4 },
  formatChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  formatChipTextActive: { color: '#FFF' },
  formatChipTextDisabled: { color: theme.textMuted },
  teamSelectionSection: { marginBottom: 16 },
  teamCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, ...theme.shadows.card },
  teamCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  teamColorDot: { width: 10, height: 10, borderRadius: 5 },
  teamCardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  teamCardPlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  teamCardPlaceholder: { fontSize: 14, color: theme.textMuted, fontStyle: 'italic' },
  teamCardCount: { position: 'absolute', top: 16, right: 16, fontSize: 12, fontWeight: '600', color: theme.textMuted },
  playerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.full, borderWidth: 1 },
  playerChipName: { fontSize: 13, fontWeight: '500', color: theme.textPrimary },
  playerChipRole: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  playerChipRoleText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  actionsEditorButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 16, gap: 12, ...theme.shadows.card },
  actionsEditorContent: { flex: 1 },
  actionsEditorTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  actionsEditorSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  summaryCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 16, ...theme.shadows.card },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: theme.textMuted, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 4 },
  summaryLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: theme.backgroundSecondary, borderTopWidth: 1, borderTopColor: theme.border },
  fullscreenButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingVertical: 18, borderRadius: theme.borderRadius.lg },
  fullscreenButtonText: { fontSize: 17, fontWeight: '600', color: '#FFF' },
  footerButtonsRow: { flexDirection: 'row', gap: 12 },
  returnToMatchButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary + '15', paddingVertical: 16, borderRadius: theme.borderRadius.lg, borderWidth: 2, borderColor: theme.primary },
  returnToMatchButtonText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  saveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.success, paddingVertical: 16, borderRadius: theme.borderRadius.lg },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  modalDoneBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  modalDoneText: { fontSize: 16, fontWeight: '600', color: theme.primary },
  actionsEditorScroll: { flex: 1 },
  actionsEditorContent: { padding: 16 },
  editorSection: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 16, ...theme.shadows.card },
  editorSectionTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 },
  timerDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerValue: { fontSize: 36, fontWeight: '700', color: theme.textMuted, fontVariant: ['tabular-nums'] },
  timerValueActive: { color: theme.primary },
  timerControls: { flexDirection: 'row', gap: 10 },
  timerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  timerBtnStart: { backgroundColor: theme.success },
  timerBtnPause: { backgroundColor: theme.warning },
  timerBtnReset: { backgroundColor: theme.backgroundSecondary },
  meneCard: { marginBottom: 0 },
  meneRow: { marginBottom: 12 },
  meneTeamLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  menePointsRow: { flexDirection: 'row', gap: 8 },
  menePointBtn: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, borderWidth: 2, borderColor: 'transparent' },
  menePointBtnActiveA: { backgroundColor: theme.primary + '20', borderColor: theme.primary },
  menePointBtnActiveB: { backgroundColor: theme.accent + '20', borderColor: theme.accent },
  menePointText: { fontSize: 18, fontWeight: '700', color: theme.textSecondary },
  menePointTextActive: { color: theme.textPrimary },
  meneDivider: { height: 1, backgroundColor: theme.border, marginVertical: 8 },
  nullMeneBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, marginTop: 8 },
  nullMeneBtnActive: { backgroundColor: theme.warning + '15' },
  nullMeneText: { fontSize: 13, color: theme.textMuted },
  nullMeneTextActive: { color: theme.warning, fontWeight: '600' },
  addMeneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 14, borderRadius: theme.borderRadius.md, marginTop: 12 },
  addMeneBtnDisabled: { backgroundColor: theme.textMuted },
  addMeneBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  menesHistory: { marginTop: 16, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12 },
  menesHistoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  menesHistoryTitle: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  undoText: { fontSize: 12, color: theme.error },
  menesHistoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meneHistoryItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.borderRadius.sm },
  meneHistoryNum: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  meneHistoryScore: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  meneHistoryWin: { color: theme.success },
  meneHistoryLoss: { color: theme.error },
  meneHistorySep: { fontSize: 10, color: theme.textMuted },
  meneHistoryNull: { fontSize: 12, color: theme.warning },
  playerActionCard: { backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12, marginBottom: 10 },
  playerActionHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, rowGap: 4 },
  playerActionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  playerActionName: { flexShrink: 1, minWidth: 60, fontSize: 14, fontWeight: '500', color: theme.textPrimary },
  playerActionStats: { flexDirection: 'row', gap: 12 },
  playerActionStat: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  playerNotationBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerNotationBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.borderRadius.sm },
  playerNotationBtnText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10 },
  searchInput: { flex: 1, fontSize: 16, color: theme.textPrimary, padding: 0 },
  selectionCount: { fontSize: 13, color: theme.textSecondary, paddingHorizontal: 16, marginBottom: 8 },
  playersList: { flex: 1 },
  playersListContent: { paddingHorizontal: 16, paddingBottom: 32 },
  playerItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, padding: 12, borderRadius: theme.borderRadius.lg, marginBottom: 8 },
  playerItemSelected: { borderWidth: 2, borderColor: theme.primary },
  playerItemDisabled: { opacity: 0.5 },
  playerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerAvatarSelected: { backgroundColor: theme.primary },
  playerAvatarSelectedA: { backgroundColor: theme.primary },
  playerAvatarSelectedB: { backgroundColor: theme.accent },
  playerAvatarDisabled: { backgroundColor: theme.textMuted },
  playerAvatarText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  playerMeta: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  moiBadge: { backgroundColor: theme.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  moiBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  otherTeamLabel: { fontSize: 11, color: theme.textMuted, fontStyle: 'italic' },
  roleSelectionSection: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 12, marginBottom: 12 },
  roleSelectionTitle: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 10 },
  roleSelectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  roleSelectionName: { fontSize: 14, fontWeight: '500', color: theme.textPrimary, flex: 1 },
  roleButtonsRow: { flexDirection: 'row', gap: 6 },
  roleButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.sm },
  roleButtonActiveA: { backgroundColor: theme.primary },
  roleButtonActiveB: { backgroundColor: theme.accent },
  roleButtonText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  roleButtonTextActive: { color: '#FFF' },
  createPlayerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accent + '10', padding: 14, borderRadius: theme.borderRadius.lg, marginBottom: 12, borderWidth: 2, borderColor: theme.accent + '30', borderStyle: 'dashed' },
  createPlayerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  createPlayerInfo: { flex: 1 },
  createPlayerTitle: { fontSize: 15, fontWeight: '600', color: theme.accent },
  createPlayerSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  emptySearch: { alignItems: 'center', paddingVertical: 40 },
  emptySearchText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },
  // ELO Prediction
  predictionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 16, ...theme.shadows.card, borderWidth: 1, borderColor: '#9333EA' + '20' },
  predictionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 12 },
  predictionTitle: { fontSize: 12, fontWeight: '700' as const, color: '#9333EA', flex: 1, letterSpacing: 0.3 },
  predictionFavBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  predictionFavText: { fontSize: 10, fontWeight: '700' as const },
  predictionContent: { gap: 8 },
  predictionTeam: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  predictionTeamDot: { width: 8, height: 8, borderRadius: 4 },
  predictionTeamLabel: { fontSize: 11, color: theme.textMuted, fontWeight: '600' as const },
  predictionEloValue: { fontSize: 16, fontWeight: '800' as const },
  predictionRankBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const },
  predictionPct: { fontSize: 18, fontWeight: '700' as const, color: theme.textSecondary },
  predictionDelta: { fontSize: 10, fontWeight: '600' as const, color: theme.textMuted, marginTop: 1 },
  predictionBar: { flexDirection: 'row' as const, height: 6, borderRadius: 3, overflow: 'hidden' as const, gap: 2 },
  predictionBarA: { backgroundColor: theme.primary, borderRadius: 3 },
  predictionBarB: { backgroundColor: theme.accent, borderRadius: 3 },
  terrainMatchBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.primary + '15', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  terrainMatchBadgeText: { fontSize: 11, fontWeight: '700', color: theme.primary },
  // Terrain picker modal
  terrainSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 10, borderWidth: 1, borderColor: theme.border },
  terrainSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  terrainAddNewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '12', borderRadius: theme.borderRadius.sm },
  terrainAddNewBtnText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  terrainPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  terrainPickerItemActive: { borderWidth: 2, borderColor: theme.primary },
  terrainPickerItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  terrainPickerItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  terrainPickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  // Suggested partner
  suggestedPartnerBanner: { backgroundColor: theme.carreauColor + '08', borderRadius: theme.borderRadius.lg, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: theme.carreauColor + '25' },
  suggestedPartnerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  suggestedPartnerLabel: { fontSize: 11, fontWeight: '700', color: theme.carreauColor, letterSpacing: 0.5, textTransform: 'uppercase' },
  suggestedPartnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestedPartnerRemoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.error + '15', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md },
  suggestedPartnerRemoveText: { fontSize: 12, fontWeight: '600', color: theme.error },
  suggestedPartnerAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md },
  suggestedPartnerAddText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  // Fullscreen styles
  fullscreenContainer: { flex: 1, backgroundColor: '#0A0F1A' },
  fullscreenSafeArea: { flex: 1 },
  fsTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  fsExitBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  fsTopCenter: { alignItems: 'center' },
  fsFormatBadge: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  fsTerrainName: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  fsDualTimerBar: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  fsDualTimerPill: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, minWidth: 130 },
  fsDualTimerPillActive: { backgroundColor: 'rgba(74, 222, 128, 0.12)', borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.3)' },
  fsDualTimerPillMene: { backgroundColor: 'rgba(139, 92, 246, 0.1)' },
  fsDualTimerContent: { flex: 1 },
  fsDualTimerLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  fsDualTimerValue: { fontSize: 20, fontWeight: '800', color: 'rgba(255,255,255,0.6)', fontVariant: ['tabular-nums'] },
  fsDualTimerValueActive: { color: '#4ADE80' },
  fsNotationSection: { paddingTop: 8, paddingBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fsNotationModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  fsNotationModeLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' as const },
  fsNotationModeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 3 },
  fsNotationModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  fsNotationModeBtnActive: { backgroundColor: theme.success },
  fsNotationModeBtnActiveDetailed: { backgroundColor: theme.primary },
  fsNotationModeBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  fsNotationModeBtnTextActive: { color: '#FFF' },
  fsQuickModeBtns: { gap: 8 },
  fsQmSection: { gap: 4 },
  fsQmSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  fsQmSectionLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase' },
  fsQmSectionBtns: { flexDirection: 'row', gap: 6 },
  fsQmBtnLabel: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  fsQmTirSuccessBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14, backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 12 },
  fsQmTirFailBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14, backgroundColor: 'rgba(239,68,68,0.65)', borderRadius: 12 },
  fsQmPointSuccessBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14, backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 12 },
  fsQmPointFailBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14, backgroundColor: 'rgba(239,68,68,0.5)', borderRadius: 12 },
  fsQmCarreauBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: 'rgba(217,119,6,0.8)', borderRadius: 12 },
  fsQmCarreauLabel: { fontSize: 12, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  fsQuickNotationScroll: { paddingHorizontal: 12, gap: 12 },
  fsQuickNotationPlayer: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 12 },
  fsQuickNotationNameBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, marginBottom: 10 },
  fsQuickNotationDot: { width: 8, height: 8, borderRadius: 4 },
  fsQuickNotationName: { fontSize: 13, fontWeight: '700', color: '#FFF', flex: 1 },
  fsQuickNotationStats: { fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  fsQuickUndoBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 4 },
  fsRoleBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, marginLeft: 2 },
  fsRoleBadgeText: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.5 },
  fsQuickNotationBtns: { flexDirection: 'row', gap: 8 },
  fsQuickNotationTirBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: theme.tirColor, borderRadius: 12 },
  fsQuickNotationPointBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: theme.pointColor, borderRadius: 12 },
  fsQuickNotationBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  fsGiantScoreArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 20, gap: 12 },
  fsGiantScoreBlock: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 24, padding: 20, borderWidth: 3, borderColor: 'transparent' },
  fsGiantScoreBlockSelected: { backgroundColor: 'rgba(255,255,255,0.08)' },
  fsGiantScoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  fsGiantTeamDot: { width: 12, height: 12, borderRadius: 6 },
  fsGiantTeamLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  fsGiantPlayerNames: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  fsGiantScoreValue: { fontSize: 100, fontWeight: '900', color: '#FFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
  fsGiantScoreWinning: { color: '#4ADE80' },
  fsGiantScoreLosing: { color: '#F87171' },
  fsSelectedIndicator: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  fsSelectedIndicatorText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  fsGiantVsBadge: { alignItems: 'center' },
  fsGiantVsText: { fontSize: 16, fontWeight: '900', color: 'rgba(255,255,255,0.3)' },
  fsGiantMeneBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 },
  fsGiantMeneText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  fsPointSelection: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  fsPointSelectionTitle: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 16 },
  fsPointButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  fsPointButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  fsPointButtonActive: { borderColor: 'transparent' },
  fsPointButtonDisabled: { opacity: 0.4 },
  fsPointButtonText: { fontSize: 24, fontWeight: '800', color: 'rgba(255,255,255,0.6)' },
  fsPointButtonTextActive: { color: '#FFF' },
  fsPointButtonTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  fsValidateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  fsValidateMeneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 28 },
  fsValidateMeneBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
  fsValidateMeneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  fsNullMeneBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(251, 191, 36, 0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(251, 191, 36, 0.3)' },
  fsMeneTimeline: { flex: 1, paddingVertical: 12 },
  fsMeneTimelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  fsMeneTimelineTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  fsMeneUndoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12 },
  fsMeneUndoBtnText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  fsMeneEmptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  fsMeneEmptyText: { fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 8, fontStyle: 'italic' },
  fsMeneTimelineScroll: { paddingHorizontal: 16, gap: 10 },
  fsMeneCard: { width: 80, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 12, alignItems: 'center' },
  fsMeneCardNumber: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  fsMeneCardNull: { alignItems: 'center' },
  fsMeneCardNullText: { fontSize: 10, color: '#FBBF24', marginTop: 4 },
  fsMeneCardScore: { flexDirection: 'row', gap: 8 },
  fsMeneCardDelta: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  fsMeneCardDeltaA: { backgroundColor: 'rgba(74, 222, 128, 0.25)' },
  fsMeneCardDeltaB: { backgroundColor: 'rgba(248, 113, 113, 0.25)' },
  fsMeneCardDeltaText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  fsMeneCardRunning: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 8 },
  fsMeneCardDuration: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 },
  fsNewMeneOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  fsNewMeneCard: { alignItems: 'center', backgroundColor: 'rgba(74, 222, 128, 0.1)', borderWidth: 2, borderColor: 'rgba(74, 222, 128, 0.3)', borderRadius: 32, padding: 40, minWidth: 240 },
  fsNewMeneTitle: { fontSize: 42, fontWeight: '900', color: '#FFF', marginTop: 16, letterSpacing: 2 },
  fsNewMeneSubtitle: { fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginTop: 8 },
  fsWinnerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  fsWinnerCard: { alignItems: 'center', padding: 40 },
  fsWinnerTitle: { fontSize: 36, fontWeight: '900', color: '#FFF', marginTop: 20, letterSpacing: 3 },
  fsWinnerScore: { fontSize: 32, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 12 },
  fsWinnerMenes: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 8 },
  fsWinnerButtons: { marginTop: 28, width: '100%', gap: 12 },
  fsWinnerBtnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 18, backgroundColor: theme.success, borderRadius: 20 },
  fsWinnerBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  fsWinnerBtnRevanche: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 16, backgroundColor: 'rgba(251, 191, 36, 0.15)', borderRadius: 20, borderWidth: 2, borderColor: 'rgba(251, 191, 36, 0.4)' },
  fsWinnerBtnRevancheText: { fontSize: 16, fontWeight: '700', color: theme.warning },
  fsWinnerBtnQuickShare: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, paddingHorizontal: 32, paddingVertical: 18, backgroundColor: '#22C55E', borderRadius: 20, borderWidth: 2, borderColor: '#22C55E' },
  fsWinnerBtnQuickShareText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },
  fsWinnerBtnShare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  fsWinnerBtnShareText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  fsWinnerSeriesInfo: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  fsWinnerSeriesText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  fsWinnerSeriesBadge: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.warning, borderRadius: 10 },
  fsWinnerSeriesBadgeText: { fontSize: 12, fontWeight: '700', color: '#000' },
  // Pause Overlay styles
  fsPauseOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  fsPauseCard: { width: '85%', maxWidth: 360, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 28, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  fsPauseHeader: { alignItems: 'center', marginBottom: 24 },
  fsPauseTitle: { fontSize: 28, fontWeight: '900', color: '#FFF', letterSpacing: 4, marginTop: 12 },
  fsPauseScoreDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  fsPauseScoreItem: { alignItems: 'center', minWidth: 100 },
  fsPauseScoreLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 4 },
  fsPauseScoreValue: { fontSize: 48, fontWeight: '800' },
  fsPauseScoreSep: { fontSize: 32, fontWeight: '300', color: 'rgba(255,255,255,0.3)', marginHorizontal: 16 },
  fsPauseInfo: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 28, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  fsPauseInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fsPauseInfoText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  fsPauseButtons: { width: '100%', gap: 12 },
  fsPauseResumeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingVertical: 18, borderRadius: 16 },
  fsPauseResumeBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  fsPauseExitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  fsPauseExitBtnText: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  // Winner Action Summary
  fsWinnerActionsSummary: { width: '100%', marginTop: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 16 },
  fsWinnerActionsTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' as const, textAlign: 'center' as const, marginBottom: 12 },
  fsWinnerTeamBlock: { marginBottom: 10 },
  fsWinnerTeamHeaderRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
  fsWinnerTeamDotSm: { width: 8, height: 8, borderRadius: 4 },
  fsWinnerTeamNameLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' as const },
  fsWinnerPlayerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fsWinnerPlayerName: { fontSize: 13, fontWeight: '600', color: '#FFF', maxWidth: 90 },
  fsWinnerPlayerStats: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  fsWinnerStatBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  fsWinnerStatVal: { fontSize: 12, fontWeight: '700' },
});
