
/**
 * AppContext — Global application state provider.
 *
 * CRUD operations are delegated to dedicated services under services/*CrudService.ts.
 * DB row mappers live in services/dbMappers.ts.
 * This file retains: state declarations, data loading, sync logic, computed values, and provider wiring.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { Platform } from 'react-native';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/template';
import { logModification } from '@/services/modificationLogService';
import { saveToCache, saveSingleToCache, loadFromCache, clearCache, getLastSyncTimestamp, setLastSyncTimestamp } from '@/services/cacheService';
import {
  enqueueOperation,
  replayOfflineQueue,
  getQueueSize,
  clearOfflineQueue,
  retryFailedOperations,
  getFailedOperations,
  buildMatchDbPayload,
  buildPlayerDbPayload,
  buildClubDbPayload,
  buildTournamentDbPayload,
  buildTerrainDbPayload,
  buildChallengeDbPayload,
  buildUpdateDbPayload,
  ConflictInfo,
  ConflictResolver,
} from '@/services/offlineQueueService';
import { addSyncHistoryEntry } from '@/services/syncHistoryService';
import { prefetchImages, startPeriodicCacheCleanup, stopPeriodicCacheCleanup, clearAllImageCache } from '@/services/imageCacheService';
import { loadSyncConfig, getSyncConfig, onSyncConfigChange, setBatterySaverMode, DELTA_SELECT, SyncConfig } from '@/services/syncConfigService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getSharedMatchIds, getSharedChallengeIds, getReceivedShareRequests, startShareRequestPolling, stopShareRequestPolling } from '@/services/matchShareService';
import {
  Player,
  Club,
  Tournament,
  Match,
  HeadToHead,
  BracketMatch,
  Challenge,
  ChallengeStats,
  Terrain,
  TournamentNotification,
  BoulesSet,
} from '@/types/petanque';

// Empty fallbacks instead of mock data — reduces bundle size ~15-20KB
const EMPTY_PLAYERS: Player[] = [];
const EMPTY_CLUBS: Club[] = [];
const EMPTY_TOURNAMENTS: Tournament[] = [];
const EMPTY_MATCHES: Match[] = [];
const EMPTY_CHALLENGES: Challenge[] = [];
const EMPTY_TERRAINS: Terrain[] = [];

// ============================================
// Extracted services & mappers
// ============================================
import {
  mapPlayerFromDb,
  mapClubFromDb,
  mapTerrainFromDb,
  mapTournamentFromDb,
  mapMatchFromDb,
  mapChallengeFromDb,
  mapBoulesSetFromDb,
  mergeRecords,
  calculatePlayerStatsFromMatches,
} from '@/services/dbMappers';
import {
  computeUserStats,
  computeChallengeStats,
  computePlayersWithStats,
  computeSelfPlayer,
  computeClubsWithMemberCount,
} from '@/hooks/useAppComputed';
import { createGetters } from '@/hooks/useAppGetters';
import { addMatchOp, updateMatchOp, deleteMatchOp } from '@/services/matchCrudService';
import { addPlayerOp, updatePlayerOp, deletePlayerOp } from '@/services/playerCrudService';
import { addClubOp, updateClubOp, deleteClubOp } from '@/services/clubCrudService';
import { addTournamentOp, updateTournamentOp, updateBracketMatchOp, deleteTournamentOp, autoUpdateTournamentStatuses } from '@/services/tournamentCrudService';
import { addTerrainOp, updateTerrainOp, deleteTerrainOp } from '@/services/terrainCrudService';
import { addChallengeOp, updateChallengeOp, deleteChallengeOp } from '@/services/challengeCrudService';
import { addBoulesSetOp, updateBoulesSetOp, deleteBoulesSetOp, setPrimaryBoulesSetOp } from '@/services/boulesSetCrudService';
import { updateRetentionStats } from '@/services/retentionNotificationService';
import { triggerTrustScoreComputation, fetchLowTrustUsers, shouldSendWeeklyTrustTip, markWeeklyTrustTipSent, saveTrustScoreSnapshot, fetchTrustScore as fetchTrustScoreForSnapshot } from '@/services/trustScoreService';

// ============================================
// Context type
// ============================================

interface AppContextType {
  // Data
  players: Player[];
  clubs: Club[];
  tournaments: Tournament[];
  matches: Match[];
  challenges: Challenge[];
  terrains: Terrain[];
  userStats: {
    playerId: string;
    playerName: string;
    totalMatches: number;
    wins: number;
    losses: number;
    winRate: number;
    currentStreak: number;
    longestStreak: number;
    tirSuccessRate: number;
    pointSuccessRate: number;
    carreauRate: number;
    avgMatchDuration: number;
    tournamentsWon: number;
    tournamentsPlayed: number;
    weeklyProgress: any[];
    recentOpponents: any[];
  };
  challengeStats: ChallengeStats;
  boulesSets: BoulesSet[];
  loading: boolean;

  // Current user's player info
  selfPlayer: Player | null;

  // Add Actions
  addMatch: (match: Omit<Match, 'id'>) => Promise<string | null>;
  addPlayer: (player: Omit<Player, 'id'>) => Promise<void>;
  addClub: (club: Omit<Club, 'id'>) => Promise<void>;
  addTournament: (tournament: Omit<Tournament, 'id'>) => Promise<{ error: string | null }>;
  addChallenge: (challenge: Omit<Challenge, 'id'>) => Promise<string | null>;
  addTerrain: (terrain: Omit<Terrain, 'id'>) => Promise<void>;

  // Boules Sets CRUD
  addBoulesSet: (set: Omit<BoulesSet, 'id'>) => Promise<void>;
  updateBoulesSet: (id: string, updates: Partial<BoulesSet>) => Promise<void>;
  deleteBoulesSet: (id: string) => Promise<void>;
  setPrimaryBoulesSet: (id: string) => Promise<void>;

  // Update Actions
  updateMatch: (id: string, updates: Partial<Match>) => Promise<void>;
  updatePlayer: (id: string, updates: Partial<Player>) => Promise<void>;
  updateClub: (id: string, updates: Partial<Club>) => Promise<void>;
  updateTournament: (id: string, updates: Partial<Tournament>) => Promise<void>;
  updateTerrain: (id: string, updates: Partial<Terrain>) => Promise<void>;
  updateChallenge: (id: string, updates: Partial<Challenge>) => Promise<void>;
  updateBracketMatch: (tournamentId: string, bracketMatchId: string, updates: Partial<BracketMatch>) => void;

  // Delete Actions
  deleteMatch: (id: string) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  deleteChallenge: (id: string) => Promise<void>;
  deleteTerrain: (id: string) => Promise<{ error: string | null }>;
  deleteClub: (id: string) => Promise<void>;
  deleteTournament: (id: string) => Promise<{ error: string | null }>;

  // Favorites
  favoriteTerrainIds: string[];
  toggleFavoriteTerrain: (terrainId: string) => void;
  isFavoriteTerrain: (terrainId: string) => boolean;
  favoriteClubIds: string[];
  toggleFavoriteClub: (clubId: string) => void;
  isFavoriteClub: (clubId: string) => boolean;

  // Tournament Notifications
  tournamentNotifications: string[];
  toggleTournamentNotification: (tournamentId: string) => void;
  isTournamentNotificationEnabled: (tournamentId: string) => boolean;

  // Shared items permissions
  getSharedPermission: (itemId: string) => 'read' | 'write' | null;
  isSharedItem: (itemId: string) => boolean;
  sharedMatchIds: string[];
  sharedChallengeIds: string[];

  // Getters
  getPlayerById: (id: string) => Player | undefined;
  getClubById: (id: string) => Club | undefined;
  getTournamentById: (id: string) => Tournament | undefined;
  getMatchById: (id: string) => Match | undefined;
  getTerrainById: (id: string) => Terrain | undefined;
  getMatchesByPlayer: (playerId: string) => Match[];
  getMatchesByTournament: (tournamentId: string) => Match[];

  // Head-to-head comparison
  getHeadToHead: (player1Id: string, player2Id: string) => HeadToHead;
  getCommonOpponents: (player1Id: string, player2Id: string) => string[];

  // Toggle public/private
  setItemPublic: (type: 'players' | 'clubs' | 'terrains' | 'tournaments', itemId: string, isPublic: boolean) => void;

  // Offline queue replay
  isReplayingQueue: boolean;
  replayProgress: { current: number; total: number };

  // Conflict resolution
  currentConflict: ConflictInfo | null;
  conflictRemaining: number;
  resolveConflict: (choice: 'local' | 'server' | 'skip') => void;

  // Retry failed operations
  retryFailedOps: (opIds?: string[]) => Promise<void>;

  // Premium (ad-free)
  isPremium: boolean;
  setIsPremium: (val: boolean) => void;

  // Admin
  isAdmin: boolean;

  // Refresh
  refreshData: () => Promise<void>;

  // Battery saver
  batterySaverEnabled: boolean;
  setBatterySaver: (enabled: boolean) => Promise<void>;
}

// Legacy AppContext removed — use useAppData/useAppUI/useAppActions instead

// ===== Split contexts for granular subscriptions =====
type AppDataType = Pick<AppContextType,
  'players' | 'clubs' | 'tournaments' | 'matches' | 'challenges' | 'terrains' |
  'boulesSets' | 'userStats' | 'challengeStats' | 'selfPlayer' | 'loading' |
  'sharedMatchIds' | 'sharedChallengeIds' | 'favoriteTerrainIds' | 'favoriteClubIds' |
  'tournamentNotifications'
>;

type AppUIType = Pick<AppContextType,
  'isPremium' | 'isAdmin' | 'batterySaverEnabled' |
  'isReplayingQueue' | 'replayProgress' | 'currentConflict' | 'conflictRemaining'
>;

type AppActionsType = Pick<AppContextType,
  'addMatch' | 'addPlayer' | 'addClub' | 'addTournament' | 'addChallenge' | 'addTerrain' |
  'addBoulesSet' | 'updateBoulesSet' | 'deleteBoulesSet' | 'setPrimaryBoulesSet' |
  'updateMatch' | 'updatePlayer' | 'updateClub' | 'updateTournament' | 'updateTerrain' |
  'updateChallenge' | 'updateBracketMatch' |
  'deleteMatch' | 'deletePlayer' | 'deleteChallenge' | 'deleteTerrain' | 'deleteClub' | 'deleteTournament' |
  'toggleFavoriteTerrain' | 'isFavoriteTerrain' | 'toggleFavoriteClub' | 'isFavoriteClub' |
  'toggleTournamentNotification' | 'isTournamentNotificationEnabled' |
  'getSharedPermission' | 'isSharedItem' |
  'getPlayerById' | 'getClubById' | 'getTournamentById' | 'getMatchById' | 'getTerrainById' |
  'getMatchesByPlayer' | 'getMatchesByTournament' | 'getHeadToHead' | 'getCommonOpponents' |
  'setItemPublic' | 'resolveConflict' | 'retryFailedOps' | 'refreshData' |
  'setIsPremium' | 'setBatterySaver'
>;

const AppDataContext = createContext<AppDataType | undefined>(undefined);
const AppUIContext = createContext<AppUIType | undefined>(undefined);
const AppActionsContext = createContext<AppActionsType | undefined>(undefined);

// ============================================
// Provider
// ============================================

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const supabase = getSupabaseClient();
  const { isConnected, justReconnected } = useNetworkStatus();
  const isConnectedRef = useRef(isConnected);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const secondaryLoadDone = useRef(false);
  const secondaryLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCountRef = useRef(0);
  const [syncConfig, setSyncConfigState] = useState<SyncConfig>(getSyncConfig());
  const syncConfigRef = useRef(syncConfig);

  // ===== Core data state =====
  const [players, setPlayers] = useState<Player[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [terrains, setTerrains] = useState<Terrain[]>([]);
  const [boulesSets, setBoulesSets] = useState<BoulesSet[]>([]);
  const [favoriteTerrainIds, setFavoriteTerrainIds] = useState<string[]>([]);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [sharedItemPermissions, setSharedItemPermissions] = useState<Record<string, 'read' | 'write'>>({});
  const [sharedMatchIds, setSharedMatchIds] = useState<string[]>([]);
  const [sharedChallengeIds, setSharedChallengeIds] = useState<string[]>([]);
  const [sharedMatchPermissions, setSharedMatchPermissions] = useState<Record<string, 'read' | 'write'>>({});
  const [tournamentNotifications, setTournamentNotifications] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremiumState, setIsPremiumState] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Interstitial ads: skip when user is Premium (banner uses useAppUI directly).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    import('@/services/adService').then(({ setIsPremiumCheck }) => {
      setIsPremiumCheck(() => isPremiumState);
    });
  }, [isPremiumState]);
  const [isReplayingQueue, setIsReplayingQueue] = useState(false);
  const [replayProgress, setReplayProgress] = useState({ current: 0, total: 0 });
  const [currentConflict, setCurrentConflict] = useState<ConflictInfo | null>(null);
  const [conflictRemaining, setConflictRemaining] = useState(0);
  const conflictResolverRef = useRef<((choice: 'local' | 'server' | 'skip') => void) | null>(null);

  // ===== Premium & conflict helpers =====
  const setIsPremium = useCallback((val: boolean) => {
    setIsPremiumState(val);
    if (user?.id) {
      supabase.from('user_profiles').update({ is_premium: val }).eq('id', user.id).then(() => {});
    }
  }, [user?.id, supabase]);

  const resolveConflict = useCallback((choice: 'local' | 'server' | 'skip') => {
    if (conflictResolverRef.current) {
      conflictResolverRef.current(choice);
      conflictResolverRef.current = null;
      setCurrentConflict(null);
    }
  }, []);

  const handleConflict: ConflictResolver = useCallback(async (conflict: ConflictInfo) => {
    return new Promise<'local' | 'server' | 'skip'>((resolve) => {
      conflictResolverRef.current = resolve;
      setCurrentConflict(conflict);
    });
  }, []);

  // ===== Computed values (delegated to extracted functions) =====
  // computePlayersWithStats now has internal caching — avoids recalc when data hasn't changed
  const playersWithStats = React.useMemo(() => computePlayersWithStats(players, matches), [players, matches]);
  const selfPlayer = React.useMemo(() => computeSelfPlayer(playersWithStats, user?.id), [playersWithStats, user?.id]);
  // computeClubsWithMemberCount now uses a Map instead of O(clubs × players) filter
  const clubsWithMemberCount = React.useMemo(() => computeClubsWithMemberCount(clubs, playersWithStats), [clubs, playersWithStats]);

  // ===== Computed: user stats (delegated) =====
  const userStats = React.useMemo(
    () => computeUserStats(matches, user?.id, user?.username, sharedMatchIds),
    [matches, user?.id, user?.username, sharedMatchIds]
  );

  // ===== Computed: challenge stats (delegated) =====
  const challengeStats: ChallengeStats = React.useMemo(
    () => computeChallengeStats(challenges),
    [challenges]
  );

  // ===== Update retention notification stats when matches change =====
  const prevMatchCountRef = useRef(0);
  useEffect(() => {
    if (!user?.id || matches.length === 0) return;
    // Only update when match count actually changes (not on initial load)
    if (prevMatchCountRef.current > 0 && prevMatchCountRef.current !== matches.length) {
      // Compute total carreaux
      let totalCarreaux = 0;
      matches.forEach((m: any) => {
        if (m.playerActions) {
          m.playerActions.filter((pa: any) => pa.team === 'A').forEach((pa: any) => {
            totalCarreaux += pa.actions?.carreaux || 0;
          });
        }
      });

      updateRetentionStats({
        language: 'fr', // Will be overridden by stored state
        isRegistered: true, // User is logged in at this point
        matchStats: {
          successRate: userStats.tirSuccessRate || 0,
          carreaux: totalCarreaux,
          matchCount: matches.length,
          wins: userStats.wins || 0,
          tirRate: userStats.tirSuccessRate || 0,
        },
      }).catch(() => {});
    }
    prevMatchCountRef.current = matches.length;
  }, [matches.length, user?.id]);

  // ===== Sync config =====
  useEffect(() => {
    loadSyncConfig().then(cfg => {
      setSyncConfigState(cfg);
      syncConfigRef.current = cfg;
    });
    const unsub = onSyncConfigChange(cfg => {
      setSyncConfigState(cfg);
      syncConfigRef.current = cfg;
    });
    return unsub;
  }, []);

  const setBatterySaver = useCallback(async (enabled: boolean) => {
    const cfg = await setBatterySaverMode(enabled);
    setSyncConfigState(cfg);
    syncConfigRef.current = cfg;
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isConnectedRef.current = isConnected;
    if (!isConnected) {
      setIsOfflineMode(true);
    }
  }, [isConnected]);

  // ===== Cache loading =====
  useEffect(() => {
    if (!user?.id || cacheLoaded) return;
    const loadCache = async () => {
      try {
        const cached = await loadFromCache();
        if (cached) {
          console.log("------cache loading----------")
          if (!initialLoadDone.current) {
            if (cached.players.length > 0) setPlayers(cached.players);
            if (cached.clubs.length > 0) setClubs(cached.clubs);
            if (cached.tournaments.length > 0) setTournaments(cached.tournaments);
            if (cached.matches.length > 0) setMatches(cached.matches);
            if (cached.challenges.length > 0) setChallenges(cached.challenges);
            if (cached.terrains.length > 0) setTerrains(cached.terrains);
            console.log('Loaded data from local cache');
          }
        }
      } catch (e) {
        console.log('Error loading cache:', e);
      } finally {
        setCacheLoaded(true);
      }
    };
    loadCache();
  }, [user?.id, cacheLoaded]);

  // ===== Persist player stats helper =====
  const persistPlayerStats = useCallback(async (allMatches: Match[], playerIds: string[]) => {
    if (!user?.id) return;
    const uniqueIds = [...new Set(playerIds)];
    for (const playerId of uniqueIds) {
      const player = players.find(p => p.id === playerId);
      const baseStats = player?.stats || {
        matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
        tirRate: 0, pointRate: 0, carreauRate: 0,
        avgPointsScored: 0, avgPointsConceded: 0,
      };
      const newStats = calculatePlayerStatsFromMatches(allMatches, playerId, baseStats);
      try {
        await supabase.from('players').update({
          stats: newStats,
          updated_at: new Date().toISOString(),
        }).eq('id', playerId);
      } catch (e) {
        console.log('Error persisting stats for player:', playerId, e);
      }
    }
  }, [user?.id, supabase, players]);

  // ===== Sync primary boules to player profile =====
  const syncPrimaryBoulesToPlayer = useCallback((set: Partial<BoulesSet>) => {
    if (!user?.id) return;
    const boulesData = {
      name: set.name || undefined,
      brand: set.brand || undefined,
      diameter: set.diameter || undefined,
      weight: set.weight || undefined,
      serialNumber: set.serialNumber || undefined,
      hardness: set.hardness || undefined,
    };
    // Delegate to player CRUD service
    updatePlayerOp(user.id, { boules: boulesData }, {
      supabase, userId: user.id, isConnected: isConnectedRef.current,
      setPlayers, sharedItemPermissions, players,
    });
  }, [user?.id, supabase, sharedItemPermissions, players]);

  // ===== CRUD wrappers (delegate to extracted services) =====
  const addMatch = async (match: Omit<Match, 'id'>) => {
    const result = await addMatchOp(match, { supabase, userId: user?.id, isConnected: isConnectedRef.current, matches, setMatches, persistPlayerStats });
    // Trigger trust score recomputation + history snapshot in background
    setTimeout(async () => {
      await triggerTrustScoreComputation();
      if (user?.id) {
        try {
          const { data: pData } = await supabase.from('players').select('id').eq('user_id', user.id).single();
          if (pData?.id) {
            const ts = await fetchTrustScoreForSnapshot(pData.id);
            if (ts) saveTrustScoreSnapshot(user.id, pData.id, ts.score, ts.level, ts.flags);
          }
        } catch { /* silent */ }
      }
    }, 3000);
    return result;
  };

  const addPlayer = async (player: Omit<Player, 'id'>) =>
    addPlayerOp(player, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setPlayers, sharedItemPermissions, players });

  const addClub = async (club: Omit<Club, 'id'>) =>
    addClubOp(club, { supabase, userId: user?.id, isConnected: isConnectedRef.current, clubs, setClubs, setTerrains, sharedItemPermissions });

  const addTournament = async (tournament: Omit<Tournament, 'id'>) =>
    addTournamentOp(tournament, { supabase, userId: user?.id, isConnected: isConnectedRef.current, tournaments, setTournaments, setMatches, sharedItemPermissions });

  const addChallenge = async (challenge: Omit<Challenge, 'id'>) =>
    addChallengeOp(challenge, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setChallenges });

  const addTerrain = async (terrain: Omit<Terrain, 'id'>) =>
    addTerrainOp(terrain, { supabase, userId: user?.id, isConnected: isConnectedRef.current, terrains, setTerrains, setFavoriteTerrainIds, sharedItemPermissions });

  const updateMatch = async (id: string, updates: Partial<Match>) =>
    updateMatchOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, matches, setMatches, persistPlayerStats });

  const updatePlayer = async (id: string, updates: Partial<Player>) =>
    updatePlayerOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setPlayers, sharedItemPermissions, players });

  const updateClub = async (id: string, updates: Partial<Club>) =>
    updateClubOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, clubs, setClubs, setTerrains, sharedItemPermissions });

  const updateTournament = async (id: string, updates: Partial<Tournament>) =>
    updateTournamentOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, tournaments, setTournaments, setMatches, sharedItemPermissions });

  const updateTerrain = async (id: string, updates: Partial<Terrain>) =>
    updateTerrainOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, terrains, setTerrains, setFavoriteTerrainIds, sharedItemPermissions });

  const updateChallenge = async (id: string, updates: Partial<Challenge>) =>
    updateChallengeOp(id, updates, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setChallenges });

  const updateBracketMatch = (tournamentId: string, bracketMatchId: string, updates: Partial<BracketMatch>) =>
    updateBracketMatchOp(tournamentId, bracketMatchId, updates, setTournaments);

  const deleteMatch = async (id: string) =>
    deleteMatchOp(id, { supabase, userId: user?.id, isConnected: isConnectedRef.current, matches, setMatches, persistPlayerStats });

  const deletePlayer = async (id: string) =>
    deletePlayerOp(id, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setPlayers });

  const deleteChallenge = async (id: string) =>
    deleteChallengeOp(id, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setChallenges });

  const deleteClub = async (id: string) =>
    deleteClubOp(id, { supabase, userId: user?.id, isConnected: isConnectedRef.current, setClubs, setTerrains });

  const deleteTournament = async (id: string) =>
    deleteTournamentOp(id, {
      supabase,
      userId: user?.id,
      isConnected: isConnectedRef.current,
      tournaments,
      matches,
      setTournaments,
      setMatches,
    });

  const deleteTerrain = async (id: string) =>
    deleteTerrainOp(id, {
      supabase,
      userId: user?.id,
      isConnected: isConnectedRef.current,
      terrains,
      favoriteTerrainIds,
      setTerrains,
      setFavoriteTerrainIds,
    });

  const addBoulesSet = async (set: Omit<BoulesSet, 'id'>) =>
    addBoulesSetOp(set, { supabase, userId: user?.id, boulesSets, setBoulesSets, syncPrimaryBoulesToPlayer });

  const updateBoulesSet = async (id: string, updates: Partial<BoulesSet>) =>
    updateBoulesSetOp(id, updates, { supabase, userId: user?.id, boulesSets, setBoulesSets, syncPrimaryBoulesToPlayer });

  const deleteBoulesSet = async (id: string) =>
    deleteBoulesSetOp(id, { supabase, userId: user?.id, setBoulesSets });

  const setPrimaryBoulesSet = async (id: string) =>
    setPrimaryBoulesSetOp(id, { supabase, userId: user?.id, boulesSets, setBoulesSets, syncPrimaryBoulesToPlayer });

  // ===== Ref for delta data (used by reconnection effect below, after loadData is defined) =====
  const loadDeltaDataRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ===== Secondary data loader (shared items, boules sets, preferences) =====
  const loadSecondaryData = useCallback(async () => {
    if (!user?.id || !isConnectedRef.current) return;
    console.log('Loading secondary data (shared items, boules sets, preferences)...');
    try {
      const [sharedWithMeRes, boulesSetsRes] = await Promise.all([
        supabase.from('shared_items').select('item_type, item_id, permission').eq('shared_with_id', user.id),
        supabase.from('boules_sets').select('*').order('created_at', { ascending: false }),
      ]);

      const sharedIds: Record<string, string[]> = { player: [], club: [], terrain: [], tournament: [] };
      const permissionsMap: Record<string, 'read' | 'write'> = {};
      if (sharedWithMeRes.data) {
        sharedWithMeRes.data.forEach((si: any) => {
          if (sharedIds[si.item_type]) {
            sharedIds[si.item_type].push(si.item_id);
          }
          permissionsMap[si.item_id] = si.permission as 'read' | 'write';
        });
      }
      setSharedItemPermissions(permissionsMap);

      const [sharedPlayersRes, sharedClubsRes, sharedTerrainsRes, sharedTournamentsRes] = await Promise.all([
        sharedIds.player.length > 0
          ? supabase.from('players').select('*').in('id', sharedIds.player)
          : Promise.resolve({ data: [] as any[] }),
        sharedIds.club.length > 0
          ? supabase.from('clubs').select('*').in('id', sharedIds.club)
          : Promise.resolve({ data: [] as any[] }),
        sharedIds.terrain.length > 0
          ? supabase.from('terrains').select('*').in('id', sharedIds.terrain)
          : Promise.resolve({ data: [] as any[] }),
        sharedIds.tournament.length > 0
          ? supabase.from('tournaments').select('*').in('id', sharedIds.tournament)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (sharedPlayersRes.data && sharedPlayersRes.data.length > 0) {
        const sharedPlayers = sharedPlayersRes.data.map(mapPlayerFromDb);
        setPlayers(prev => { const existingIds = new Set(prev.map(p => p.id)); const newShared = sharedPlayers.filter(p => !existingIds.has(p.id)); return newShared.length > 0 ? [...prev, ...newShared] : prev; });
      }
      if (sharedClubsRes.data && sharedClubsRes.data.length > 0) {
        const sharedClubs = sharedClubsRes.data.map(mapClubFromDb);
        setClubs(prev => { const existingIds = new Set(prev.map(c => c.id)); const newShared = sharedClubs.filter(c => !existingIds.has(c.id)); return newShared.length > 0 ? [...prev, ...newShared] : prev; });
      }
      if (sharedTerrainsRes.data && sharedTerrainsRes.data.length > 0) {
        const sharedTerrains = sharedTerrainsRes.data.map(mapTerrainFromDb);
        setTerrains(prev => { const existingIds = new Set(prev.map(t => t.id)); const newShared = sharedTerrains.filter(t => !existingIds.has(t.id)); return newShared.length > 0 ? [...prev, ...newShared] : prev; });
      }
      if (sharedTournamentsRes.data && sharedTournamentsRes.data.length > 0) {
        const sharedTournaments = sharedTournamentsRes.data.map(mapTournamentFromDb);
        setTournaments(prev => { const existingIds = new Set(prev.map(t => t.id)); const newShared = sharedTournaments.filter(t => !existingIds.has(t.id)); return newShared.length > 0 ? [...prev, ...newShared] : prev; });
      }

      if (boulesSetsRes.data) {
        setBoulesSets(boulesSetsRes.data.map(mapBoulesSetFromDb));
      }

      // Phase 3: Load shared matches & challenges (cross-player sharing)
      try {
        const [sharedMatchRes, sharedChallengeRes, receivedRequests] = await Promise.all([
          getSharedMatchIds(),
          getSharedChallengeIds(),
          getReceivedShareRequests('accepted'),
        ]);

        const matchChallPermissions: Record<string, 'read' | 'write'> = {};
        if (receivedRequests.requests) {
          receivedRequests.requests.forEach(req => {
            matchChallPermissions[req.itemId] = req.permission as 'read' | 'write';
          });
        }
        setSharedMatchPermissions(matchChallPermissions);

        const newSharedMatchIds = sharedMatchRes.matchIds || [];
        const newSharedChallengeIds = sharedChallengeRes.challengeIds || [];
        setSharedMatchIds(newSharedMatchIds);
        setSharedChallengeIds(newSharedChallengeIds);

        if (newSharedMatchIds.length > 0) {
          const { data: sharedMatchData } = await supabase.from('matches').select('*').in('id', newSharedMatchIds);
          if (sharedMatchData && sharedMatchData.length > 0) {
            const sharedMatches = sharedMatchData.map(mapMatchFromDb);
            setMatches(prev => { const existingIds = new Set(prev.map(m => m.id)); const newOnes = sharedMatches.filter(m => !existingIds.has(m.id)); return newOnes.length > 0 ? [...prev, ...newOnes] : prev; });
            console.log(`Loaded ${sharedMatchData.length} shared matches`);
          }
        }

        if (newSharedChallengeIds.length > 0) {
          const { data: sharedChallengeData } = await supabase.from('challenges').select('*').in('id', newSharedChallengeIds);
          if (sharedChallengeData && sharedChallengeData.length > 0) {
            const sharedChallenges = sharedChallengeData.map(mapChallengeFromDb);
            setChallenges(prev => { const existingIds = new Set(prev.map(c => c.id)); const newOnes = sharedChallenges.filter(c => !existingIds.has(c.id)); return newOnes.length > 0 ? [...prev, ...newOnes] : prev; });
            console.log(`Loaded ${sharedChallengeData.length} shared challenges`);
          }
        }
      } catch (shareError) {
        console.log('Error loading shared matches/challenges:', shareError);
      }

      secondaryLoadDone.current = true;
      console.log('Secondary data loaded successfully');
      startShareRequestPolling(30000);

      if (boulesSetsRes.data) {
        const dbSetsForPrefetch = boulesSetsRes.data.filter((s: any) => s.photo).map((s: any) => ({ photo: s.photo }));
        if (dbSetsForPrefetch.length > 0) {
          prefetchImages({ boulesSets: dbSetsForPrefetch });
        }
      }

      // Cleanup soft_deletes older than 30 days (non-blocking)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      supabase.from('soft_deletes').delete().lt('deleted_at', thirtyDaysAgo.toISOString()).then(() => {
        console.log('Cleaned up old soft_deletes entries');
      }).catch(() => { /* silent */ });
    } catch (error) {
      console.log('Error loading secondary data:', error);
    }
  }, [user?.id, supabase]);

  const scheduleSecondaryLoad = useCallback(() => {
    if (secondaryLoadTimerRef.current) clearTimeout(secondaryLoadTimerRef.current);
    const delay = syncConfigRef.current.secondaryLoadDelayMs;
    secondaryLoadTimerRef.current = setTimeout(() => {
      loadSecondaryData();
    }, delay);
  }, [loadSecondaryData]);

  useEffect(() => {
    return () => {
      if (secondaryLoadTimerRef.current) clearTimeout(secondaryLoadTimerRef.current);
    };
  }, []);

  // ===== Primary data loader =====
  const loadData = useCallback(async () => {
    if (!user?.id) {
      setPlayers(EMPTY_PLAYERS);
      setClubs(EMPTY_CLUBS);
      setTournaments(EMPTY_TOURNAMENTS);
      setMatches(EMPTY_MATCHES);
      setChallenges(EMPTY_CHALLENGES);
      setTerrains(EMPTY_TERRAINS);
      setLoading(false);
      return;
    }

    if (!isConnectedRef.current) {
      setIsOfflineMode(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [playersRes, clubsRes, tournamentsRes, matchesRes, challengesRes, terrainsRes, profileRes] = await Promise.all([
        supabase.from('players').select('*').order('created_at', { ascending: false }),
        supabase.from('clubs').select('*').order('created_at', { ascending: false }),
        supabase.from('tournaments').select('*').order('date', { ascending: false }),
        supabase.from('matches').select('*').order('date', { ascending: false }),
        supabase.from('challenges').select('*').order('date', { ascending: false }),
        supabase.from('terrains').select('*').order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
      ]);

      // Log errors from primary data loading
      if (playersRes.error) console.log('[AppContext] Error loading players:', playersRes.error.message);
      if (clubsRes.error) console.log('[AppContext] Error loading clubs:', clubsRes.error.message);
      if (tournamentsRes.error) console.log('[AppContext] Error loading tournaments:', tournamentsRes.error.message);
      if (matchesRes.error) console.log('[AppContext] Error loading matches:', matchesRes.error.message);
      if (challengesRes.error) console.log('[AppContext] Error loading challenges:', challengesRes.error.message);
      if (terrainsRes.error) console.log('[AppContext] Error loading terrains:', terrainsRes.error.message);
      if (profileRes.error && profileRes.error.code !== 'PGRST116') console.log('[AppContext] Error loading profile:', profileRes.error.message);

      if (profileRes.data) {
        setIsPremiumState(profileRes.data.is_premium ?? false);
        setIsAdmin(profileRes.data.is_admin ?? false);
      }

      let dbPlayers: Player[] = [];
      if (playersRes.data) {
        dbPlayers = playersRes.data.map(mapPlayerFromDb);
      }

      // Check if selfPlayer exists, if not create it
      const selfPlayerExists = dbPlayers.some(p => p.id === user.id || p.userId === user.id);
      if (!selfPlayerExists && profileRes.data) {
        const profile = profileRes.data;
        const { data: newPlayerData, error: createError } = await supabase.from('players').insert({
          user_id: user.id,
          name: profile.username || user.email?.split('@')[0] || 'Joueur',
          role: profile.role || 'Milieu',
          level: profile.level || 'Intermédiaire',
          club: profile.club,
          avatar: profile.avatar,
          stats: {
            matchesPlayed: 0, wins: 0, losses: 0, winRate: 0,
            tirRate: 0, pointRate: 0, carreauRate: 0,
            avgPointsScored: 0, avgPointsConceded: 0
          },
        }).select().single();

        if (!createError && newPlayerData) {
          dbPlayers.push(mapPlayerFromDb(newPlayerData));
        }
      }

      setPlayers(dbPlayers);

      if (clubsRes.data) {
        const dbClubs = clubsRes.data.map(mapClubFromDb);
        setClubs(dbClubs);
      }
      if (terrainsRes.data) {
        const dbTerrains = terrainsRes.data.map(mapTerrainFromDb);
        setTerrains(dbTerrains);
      }
      if (tournamentsRes.data) {
        const dbTournaments = tournamentsRes.data.map(mapTournamentFromDb);
        console.log("db tournaments")
        // console.log(dbTournaments);
        setTournaments(dbTournaments);
      
        // Auto-update tournament statuses based on dates
        setTimeout(() => {
          autoUpdateTournamentStatuses(dbTournaments, setTournaments, supabase, user?.id).catch(() => {});
        }, 500);
      }
      if (matchesRes.data) {
        const dbMatches = matchesRes.data.map(mapMatchFromDb);
        setMatches(dbMatches);
      }
      if (challengesRes.data) {
        const dbChallenges = challengesRes.data.map(mapChallengeFromDb);
        setChallenges(dbChallenges);
      }

      initialLoadDone.current = true;
      setIsOfflineMode(false);
      await setLastSyncTimestamp(new Date().toISOString());
      scheduleSecondaryLoad();

      if (!syncConfigRef.current.skipImagePrefetch) {
        setTimeout(() => {
          prefetchImages({
            players: dbPlayers,
            terrains: terrainsRes.data ? terrainsRes.data.map(mapTerrainFromDb) : [],
            matches: matchesRes.data ? matchesRes.data.map(mapMatchFromDb) : [],
          });
        }, 1200);
      }
    } catch (error) {
      console.log('Error loading data from cloud:', error);
      if (!initialLoadDone.current) {
        const cached = await loadFromCache();
        if (cached && (cached.players.length > 0 || cached.matches.length > 0)) {
          if (cached.players.length > 0) setPlayers(cached.players);
          if (cached.clubs.length > 0) setClubs(cached.clubs);
          if (cached.tournaments.length > 0) setTournaments(cached.tournaments);
          if (cached.matches.length > 0) setMatches(cached.matches);
          if (cached.challenges.length > 0) setChallenges(cached.challenges);
          if (cached.terrains.length > 0) setTerrains(cached.terrains);
          setIsOfflineMode(true);
        } else {
          setPlayers(EMPTY_PLAYERS);
          setClubs(EMPTY_CLUBS);
          setTournaments(EMPTY_TOURNAMENTS);
          setMatches(EMPTY_MATCHES);
          setChallenges(EMPTY_CHALLENGES);
          setTerrains(EMPTY_TERRAINS);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, supabase, scheduleSecondaryLoad]);

  // ===== Delta sync =====
  const loadDeltaData = useCallback(async () => {
    if (!user?.id || !isConnectedRef.current || !initialLoadDone.current) return;

    const lastSync = await getLastSyncTimestamp();
    if (!lastSync) {
      return loadData();
    }

    const syncTimestamp = new Date().toISOString();

    try {
      const [playersRes, clubsRes, tournamentsRes, matchesRes, challengesRes, terrainsRes, softDeletesRes] = await Promise.all([
        supabase.from('players').select(DELTA_SELECT.players).gt('updated_at', lastSync),
        supabase.from('clubs').select(DELTA_SELECT.clubs).gt('updated_at', lastSync),
        supabase.from('tournaments').select(DELTA_SELECT.tournaments).gt('updated_at', lastSync),
        supabase.from('matches').select(DELTA_SELECT.matches).gt('updated_at', lastSync),
        supabase.from('challenges').select(DELTA_SELECT.challenges).gt('updated_at', lastSync),
        supabase.from('terrains').select(DELTA_SELECT.terrains).gt('updated_at', lastSync),
        supabase.from('soft_deletes').select('table_name, item_id').gt('deleted_at', lastSync),
      ]);

      // Log delta sync errors
      if (playersRes.error) console.log('[DeltaSync] Error loading players:', playersRes.error.message);
      if (clubsRes.error) console.log('[DeltaSync] Error loading clubs:', clubsRes.error.message);
      if (tournamentsRes.error) console.log('[DeltaSync] Error loading tournaments:', tournamentsRes.error.message);
      if (matchesRes.error) console.log('[DeltaSync] Error loading matches:', matchesRes.error.message);
      if (challengesRes.error) console.log('[DeltaSync] Error loading challenges:', challengesRes.error.message);
      if (terrainsRes.error) console.log('[DeltaSync] Error loading terrains:', terrainsRes.error.message);
      if (softDeletesRes.error) console.log('[DeltaSync] Error loading soft_deletes:', softDeletesRes.error.message);

      const totalChanges =
        (playersRes.data?.length || 0) + (clubsRes.data?.length || 0) +
        (tournamentsRes.data?.length || 0) + (matchesRes.data?.length || 0) +
        (challengesRes.data?.length || 0) + (terrainsRes.data?.length || 0);
      const totalDeletions = softDeletesRes.data?.length || 0;

      if (totalChanges === 0 && totalDeletions === 0) {
        await setLastSyncTimestamp(syncTimestamp);
        return;
      }

      console.log(`Delta sync: ${totalChanges} records changed, ${totalDeletions} deletions since last sync`);

      // Process deletions
      if (softDeletesRes.data && softDeletesRes.data.length > 0) {
        const deletedByTable: Record<string, Set<string>> = {};
        softDeletesRes.data.forEach((sd: any) => {
          if (!deletedByTable[sd.table_name]) deletedByTable[sd.table_name] = new Set();
          deletedByTable[sd.table_name].add(sd.item_id);
        });

        if (deletedByTable['players']) setPlayers(prev => prev.filter(p => !deletedByTable['players']!.has(p.id)));
        if (deletedByTable['clubs']) setClubs(prev => prev.filter(c => !deletedByTable['clubs']!.has(c.id)));
        if (deletedByTable['terrains']) setTerrains(prev => prev.filter(t => !deletedByTable['terrains']!.has(t.id)));
        if (deletedByTable['tournaments']) setTournaments(prev => prev.filter(t => !deletedByTable['tournaments']!.has(t.id)));
        if (deletedByTable['matches']) setMatches(prev => prev.filter(m => !deletedByTable['matches']!.has(m.id)));
        if (deletedByTable['challenges']) setChallenges(prev => prev.filter(c => !deletedByTable['challenges']!.has(c.id)));
        if (deletedByTable['boules_sets']) setBoulesSets(prev => prev.filter(b => !deletedByTable['boules_sets']!.has(b.id)));

      }

      // Merge updates
      if (playersRes.data && playersRes.data.length > 0) setPlayers(prev => mergeRecords(prev, playersRes.data!.map(mapPlayerFromDb)));
      if (clubsRes.data && clubsRes.data.length > 0) setClubs(prev => mergeRecords(prev, clubsRes.data!.map(mapClubFromDb)));
      if (terrainsRes.data && terrainsRes.data.length > 0) setTerrains(prev => mergeRecords(prev, terrainsRes.data!.map(mapTerrainFromDb)));
      if (tournamentsRes.data && tournamentsRes.data.length > 0) setTournaments(prev => mergeRecords(prev, tournamentsRes.data!.map(mapTournamentFromDb)));
      if (matchesRes.data && matchesRes.data.length > 0) setMatches(prev => mergeRecords(prev, matchesRes.data!.map(mapMatchFromDb)));
      if (challengesRes.data && challengesRes.data.length > 0) setChallenges(prev => mergeRecords(prev, challengesRes.data!.map(mapChallengeFromDb)));

      await setLastSyncTimestamp(syncTimestamp);
      
    } catch (error) {
      console.log('Delta sync error, falling back to full sync:', error);
      return loadData();
    }
  }, [user?.id, supabase, loadData]);

  useEffect(() => {
    loadDeltaDataRef.current = loadDeltaData;
  }, [loadDeltaData]);

  // ===== Replay offline queue on reconnection =====
  // IMPORTANT: This useEffect must be AFTER loadData/loadDeltaData definitions
  // to avoid TDZ errors in the dependency array on web bundlers.
  useEffect(() => {
    if (justReconnected && user?.id) {
      console.log('Network restored - replaying offline queue then syncing...');
      setIsOfflineMode(false);
      (async () => {
        const queueSizeVal = await getQueueSize();
        if (queueSizeVal > 0) {
          console.log(`Replaying ${queueSizeVal} queued operations...`);
          setIsReplayingQueue(true);
          setReplayProgress({ current: 0, total: queueSizeVal });
          const startTime = Date.now();
          const result = await replayOfflineQueue(supabase, user.id, (current, total) => {
            setReplayProgress({ current, total });
            setConflictRemaining(Math.max(0, total - current));
          }, handleConflict);
          const duration = Date.now() - startTime;
          setIsReplayingQueue(false);
          setReplayProgress({ current: 0, total: 0 });
          setCurrentConflict(null);
          await addSyncHistoryEntry({
            date: new Date().toISOString(),
            total: result.total,
            succeeded: result.succeeded,
            failed: result.failed,
            conflictsDetected: result.conflictsDetected,
            conflictsResolved: result.conflictsResolved,
            errors: result.errors,
            duration,
          });
          await loadData();
        } else {
          await loadDeltaDataRef.current();
        }
      })();
    }
  }, [justReconnected, user?.id, loadData, supabase, handleConflict]);

  // Persist cache on state changes — longer debounce to reduce serialization overhead
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.id || !initialLoadDone.current) return;
    if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    cacheTimerRef.current = setTimeout(() => {
      saveToCache({ players, clubs, tournaments, matches, challenges, terrains });
    }, 5000); // 5s instead of 2s — reduces write frequency by ~60%
    return () => { if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current); };
  }, [players, clubs, tournaments, matches, challenges, terrains, user?.id]);

  // ===== Preferences =====
  const loadPreferences = useCallback(async () => {
    if (!user?.id) {
      setFavoriteTerrainIds([]);
      setFavoriteClubIds([]);
      setPreferencesLoaded(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('favorite_terrain_ids, favorite_club_ids')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.log('Error loading preferences:', error);
      }

      if (data) {
        setFavoriteTerrainIds(Array.isArray(data.favorite_terrain_ids) ? data.favorite_terrain_ids : []);
        setFavoriteClubIds(Array.isArray(data.favorite_club_ids) ? data.favorite_club_ids : []);
      }
      setPreferencesLoaded(true);
    } catch (e) {
      console.log('Error loading preferences:', e);
      setPreferencesLoaded(true);
    }
  }, [user?.id, supabase]);

  const savePreferences = useCallback(async (terrainIds: string[], clubIds: string[]) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          favorite_terrain_ids: terrainIds,
          favorite_club_ids: clubIds,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) console.log('Error saving preferences:', error);
    } catch (e) {
      console.log('Error saving preferences:', e);
    }
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!user?.id) {
      loadPreferences();
      return;
    }
    const timer = setTimeout(() => { loadPreferences(); }, 800);
    return () => clearTimeout(timer);
  }, [loadPreferences, user?.id]);

  // Load data when user changes
  useEffect(() => { loadData(); }, [loadData]);

  // Clear on logout
  useEffect(() => {
    if (!user?.id) {
      initialLoadDone.current = false;
      secondaryLoadDone.current = false;
      setCacheLoaded(false);
      setIsOfflineMode(false);
      stopShareRequestPolling();
      if (secondaryLoadTimerRef.current) {
        clearTimeout(secondaryLoadTimerRef.current);
        secondaryLoadTimerRef.current = null;
      }
      stopPeriodicCacheCleanup();
      clearAllImageCache();
    }
  }, [user?.id]);

  // Periodic image cache cleanup
  useEffect(() => {
    if (!user?.id) return;
    startPeriodicCacheCleanup();
    return () => stopPeriodicCacheCleanup();
  }, [user?.id]);

  // Weekly Monday trust tip check
  useEffect(() => {
    if (!user?.id || !isConnectedRef.current) return;
    const now = new Date();
    if (now.getDay() !== 1) return; // Only on Mondays
    const checkAndSendTrustTips = async () => {
      try {
        const shouldSend = await shouldSendWeeklyTrustTip();
        if (!shouldSend) return;
        const lowUsers = await fetchLowTrustUsers(50);
        if (lowUsers.length > 0) {
          await supabase.functions.invoke('send-push', {
            body: { type: 'trust_weekly_tip', payload: { targets: lowUsers } },
          });
          console.log(`[TrustTip] Sent weekly tips to ${lowUsers.length} users`);
        }
        await markWeeklyTrustTipSent();
      } catch (e) {
        console.log('[TrustTip] Error:', e);
      }
    };
    const timer = setTimeout(checkAndSendTrustTips, 5000);
    return () => clearTimeout(timer);
  }, [user?.id]);

  // Auto-refresh: delta sync normally, full sync every Nth cycle
  useEffect(() => {
    if (!user?.id) return;
    const intervalMs = syncConfigRef.current.syncIntervalMs;
    if (intervalMs <= 0) {
      console.log('Battery saver mode: automatic sync disabled');
      return;
    }
    const fullEveryN = syncConfigRef.current.fullSyncEveryN;
    console.log(`Sync interval: ${intervalMs / 1000}s, full every ${fullEveryN} cycles`);
    const interval = setInterval(() => {
      syncCountRef.current += 1;
      if (syncCountRef.current % fullEveryN === 0) {
        console.log('Periodic full sync (cycle', syncCountRef.current, ')');
        loadData();
      } else {
        loadDeltaData();
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [user?.id, loadData, loadDeltaData, syncConfig]);

  // Retry failed operations
  const retryFailedOps = useCallback(async (opIds?: string[]) => {
    if (!user?.id || !isConnectedRef.current) return;
    const failedOps = await getFailedOperations();
    const toRetry = opIds ? failedOps.filter(op => opIds.includes(op.id)) : failedOps;
    if (toRetry.length === 0) return;

    setIsReplayingQueue(true);
    setReplayProgress({ current: 0, total: toRetry.length });
    const startTime = Date.now();

    const result = await retryFailedOperations(supabase, user.id, opIds, (current, total) => {
      setReplayProgress({ current, total });
    });

    const duration = Date.now() - startTime;
    setIsReplayingQueue(false);
    setReplayProgress({ current: 0, total: 0 });

    await addSyncHistoryEntry({
      date: new Date().toISOString(),
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      conflictsDetected: 0,
      conflictsResolved: 0,
      errors: result.errors,
      duration,
    });

    if (result.succeeded > 0) {
      await loadData();
    }
  }, [user?.id, supabase, loadData]);

  const refreshData = useCallback(async () => {
    syncCountRef.current = 0;
    await loadData();
  }, [loadData]);

  // ===== Favorites =====
  const toggleFavoriteTerrain = (terrainId: string) => {
    setFavoriteTerrainIds(prev => {
      const updated = prev.includes(terrainId)
        ? prev.filter(id => id !== terrainId)
        : [...prev, terrainId];
      savePreferences(updated, favoriteClubIds);
      return updated;
    });
  };

  const isFavoriteTerrain = (terrainId: string) => favoriteTerrainIds.includes(terrainId);

  const toggleFavoriteClub = (clubId: string) => {
    setFavoriteClubIds(prev => {
      const updated = prev.includes(clubId)
        ? prev.filter(id => id !== clubId)
        : [...prev, clubId];
      savePreferences(favoriteTerrainIds, updated);
      return updated;
    });
  };

  const isFavoriteClub = (clubId: string) => favoriteClubIds.includes(clubId);

  // Tournament notifications
  const toggleTournamentNotification = (tournamentId: string) => {
    setTournamentNotifications(prev => {
      if (prev.includes(tournamentId)) {
        return prev.filter(id => id !== tournamentId);
      } else {
        return [...prev, tournamentId];
      }
    });
  };

  const isTournamentNotificationEnabled = (tournamentId: string) => tournamentNotifications.includes(tournamentId);

  // ===== Shared permission helpers =====
  const getSharedPermission = useCallback((itemId: string): 'read' | 'write' | null => {
    return sharedItemPermissions[itemId] || sharedMatchPermissions[itemId] || null;
  }, [sharedItemPermissions, sharedMatchPermissions]);

  const isSharedItem = useCallback((itemId: string): boolean => {
    return sharedMatchIds.includes(itemId) || sharedChallengeIds.includes(itemId) || !!sharedItemPermissions[itemId];
  }, [sharedMatchIds, sharedChallengeIds, sharedItemPermissions]);

  // Toggle public/private
  const setItemPublic = useCallback((type: 'players' | 'clubs' | 'terrains' | 'tournaments', itemId: string, isPublic: boolean) => {
    switch (type) {
      case 'players': setPlayers(prev => prev.map(p => p.id === itemId ? { ...p, isPublic } : p)); break;
      case 'clubs': setClubs(prev => prev.map(c => c.id === itemId ? { ...c, isPublic } : c)); break;
      case 'terrains': setTerrains(prev => prev.map(t => t.id === itemId ? { ...t, isPublic } : t)); break;
      case 'tournaments': setTournaments(prev => prev.map(t => t.id === itemId ? { ...t, isPublic } : t)); break;
    }
  }, []);

  // ===== Getters (delegated to extracted module — now uses O(1) Map lookups) =====
  const getters = React.useMemo(
    () => createGetters(playersWithStats, clubsWithMemberCount, tournaments, matches, terrains),
    [playersWithStats, clubsWithMemberCount, tournaments, matches, terrains]
  );
  const { getPlayerById, getClubById, getTournamentById, getMatchById, getTerrainById, getMatchesByPlayer, getMatchesByTournament, getHeadToHead, getCommonOpponents } = getters;

  // ===== Provider =====
  const dataValue: AppDataType = useMemo(() => ({
    players: playersWithStats,
    clubs: clubsWithMemberCount,
    tournaments,
    matches,
    challenges,
    terrains,
    boulesSets,
    userStats,
    challengeStats,
    selfPlayer,
    loading,
    sharedMatchIds,
    sharedChallengeIds,
    favoriteTerrainIds,
    favoriteClubIds,
    tournamentNotifications,
  }), [
    playersWithStats, clubsWithMemberCount, tournaments, matches, challenges, terrains,
    boulesSets, userStats, challengeStats, selfPlayer, loading,
    sharedMatchIds, sharedChallengeIds, favoriteTerrainIds, favoriteClubIds, tournamentNotifications,
  ]);

  const uiValue: AppUIType = useMemo(() => ({
    isPremium: isPremiumState,
    isAdmin,
    batterySaverEnabled: syncConfig.batterySaverEnabled,
    isReplayingQueue,
    replayProgress,
    currentConflict,
    conflictRemaining,
  }), [isPremiumState, isAdmin, syncConfig.batterySaverEnabled, isReplayingQueue, replayProgress, currentConflict, conflictRemaining]);

  const actionsValue: AppActionsType = useMemo(() => ({
    addMatch, addPlayer, addClub, addTournament, addChallenge, addTerrain,
    addBoulesSet, updateBoulesSet, deleteBoulesSet, setPrimaryBoulesSet,
    updateMatch, updatePlayer, updateClub, updateTournament, updateTerrain,
    updateChallenge, updateBracketMatch,
    deleteMatch, deletePlayer, deleteChallenge, deleteTerrain, deleteClub, deleteTournament,
    toggleFavoriteTerrain, isFavoriteTerrain, toggleFavoriteClub, isFavoriteClub,
    toggleTournamentNotification, isTournamentNotificationEnabled,
    getSharedPermission, isSharedItem,
    getPlayerById, getClubById, getTournamentById, getMatchById, getTerrainById,
    getMatchesByPlayer, getMatchesByTournament, getHeadToHead, getCommonOpponents,
    setItemPublic, resolveConflict, retryFailedOps, refreshData,
    setIsPremium, setBatterySaver,
  }), [
    addMatch, addPlayer, addClub, addTournament, addChallenge, addTerrain,
    addBoulesSet, updateBoulesSet, deleteBoulesSet, setPrimaryBoulesSet,
    updateMatch, updatePlayer, updateClub, updateTournament, updateTerrain,
    updateChallenge, updateBracketMatch,
    deleteMatch, deletePlayer, deleteChallenge, deleteTerrain, deleteClub, deleteTournament,
    toggleFavoriteTerrain, isFavoriteTerrain, toggleFavoriteClub, isFavoriteClub,
    toggleTournamentNotification, isTournamentNotificationEnabled,
    getSharedPermission, isSharedItem,
    getPlayerById, getClubById, getTournamentById, getMatchById, getTerrainById,
    getMatchesByPlayer, getMatchesByTournament, getHeadToHead, getCommonOpponents,
    setItemPublic, resolveConflict, retryFailedOps, refreshData,
    setIsPremium, setBatterySaver,
  ]);

  return (
    <AppDataContext.Provider value={dataValue}>
      <AppUIContext.Provider value={uiValue}>
        <AppActionsContext.Provider value={actionsValue}>
          {children}
        </AppActionsContext.Provider>
      </AppUIContext.Provider>
    </AppDataContext.Provider>
  );
}

/**
 * useAppData — Subscribe only to data changes (players, matches, stats, etc.).
 * Components using this hook will NOT re-render on UI state or action changes.
 */
export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppProvider');
  }
  return context;
}

/**
 * useAppUI — Subscribe only to UI state (premium, admin, replay progress, conflicts).
 * Components using this hook will NOT re-render on data or action changes.
 */
export function useAppUI() {
  const context = useContext(AppUIContext);
  if (!context) {
    throw new Error('useAppUI must be used within AppProvider');
  }
  return context;
}

/**
 * useAppActions — Subscribe only to action functions (CRUD, getters, etc.).
 * This value is stable (memoized) so consumers rarely re-render.
 */
export function useAppActions() {
  const context = useContext(AppActionsContext);
  if (!context) {
    throw new Error('useAppActions must be used within AppProvider');
  }
  return context;
}
