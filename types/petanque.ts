/**
 * Core type definitions for Ultimate Petanque.
 * Extracted from services/mockData.ts for clean architecture.
 */

import { GameFormat, PlayerRole, TournamentType, TerrainType, TournamentLevel, TournamentCategory, RegistrationType, TournamentScope } from '@/constants/config';

// ============================================
// EQUIPMENT
// ============================================

export interface BoulesSet {
  id: string;
  name: string;
  brand?: string;
  diameter?: number;
  weight?: number;
  serialNumber?: string;
  hardness?: string;
  isPrimary?: boolean;
  notes?: string;
  photo?: string;
  purchasePrice?: number;
}

export interface BoulesInfo {
  name?: string;
  diameter?: number;
  weight?: number;
  serialNumber?: string;
}

// ============================================
// PLAYER
// ============================================

export interface Player {
  id: string;
  userId?: string;
  name: string;
  nickname?: string;
  avatar?: string;
  club?: string;
  clubId?: string;
  role: PlayerRole;
  level?: string;
  experience?: 'less_than_1' | '1_to_3' | '3_to_10' | 'more_than_10';
  phone?: string;
  email?: string;
  terrainId?: string;
  terrainName?: string;
  country?: string;
  boules?: BoulesInfo;
  handedness?: 'right' | 'left' | 'ambidextrous';
  isPublic?: boolean;
  showContactPublic?: boolean;
  sponsorId?: string;
  eloRating?: number;
  eloTireur?: number;
  eloPointeur?: number;
  eloMilieu?: number;
  lastMatchDate?: string;
  city?: string;
  location?: {
    latitude: number;
    longitude: number;
    city: string;
  };
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
    avgPointsScored: number;
    avgPointsConceded: number;
    totalTirs?: number;
    totalTirsSuccess?: number;
    totalPoints?: number;
    totalPointsSuccess?: number;
  };
  createdAt: string;
}

// ============================================
// CLUB
// ============================================

export interface Club {
  id: string;
  userId?: string;
  name: string;
  logo?: string;
  address: string;
  city: string;
  country?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  membersCount: number;
  foundedYear: number;
  description: string;
  facilities: string[];
  contactEmail?: string;
  contactPhone?: string;
  terrainId?: string;
  terrainName?: string;
  membershipCost?: number;
  isPublic?: boolean;
  showContactPublic?: boolean;
  eloRating?: number;
  eloTireur?: number;
  eloPointeur?: number;
  eloMilieu?: number;
  lastMatchDate?: string;
  clubCardUrl?: string;
  website?: string;
  facebookUrl?: string;
  instagramHandle?: string;
  isVerified?: boolean;
}

// ============================================
// TERRAIN
// ============================================

export interface Terrain {
  id: string;
  userId?: string;
  name: string;
  address: string;
  city: string;
  location: {
    latitude: number;
    longitude: number;
    country?: string;
    address?: string;
    city?: string;
  };
  type: TerrainType;
  description?: string;
  facilities?: string[];
  photos?: string[];
  clubId?: string;
  clubName?: string;
  isPublic: boolean;
  publicAccess: boolean;
  courtsCount: number;
  lighting: boolean;
  covered: boolean;
  parking: boolean;
  toilets: boolean;
  environment?: 'indoor' | 'outdoor';
  sponsorId?: string;
  googlePlaceId?: string;
  createdAt?: string;
}

// ============================================
// TOURNAMENT
// ============================================

export interface TournamentNotification {
  id: string;
  tournamentId: string;
  enabled: boolean;
  remindDaysBefore: number;
}

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  teamA?: {
    teamId?: string;
    name: string;
    score?: number;
  };
  teamB?: {
    teamId?: string;
    name: string;
    score?: number;
  };
  winner?: 'A' | 'B';
  matchId?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TournamentPhase {
  id: string;
  name: string;
  type: 'pools' | 'elimination' | 'final';
  order: number;
  matches: BracketMatch[];
}

export interface TournamentTeam {
  id: string;
  name: string;
  playerIds: string[];
  playerNames: string[];
  poolId?: string;
  seed?: number;
  stats: {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDiff: number;
  };
}

export interface Tournament {
  id: string;
  userId?: string;
  name: string;
  date: string;
  endDate?: string;
  type: TournamentType;
  format: GameFormat;
  location: {
    name: string;
    city: string;
    latitude: number;
    longitude: number;
  };
  terrainId?: string;
  terrainName?: string;
  terrainType?: TerrainType;
  clubId?: string;
  clubName?: string;
  status: 'À venir' | 'En cours' | 'Terminé';
  participants: number;
  maxParticipants: number;
  prize?: string;
  description?: string;
  teams?: TournamentTeam[];
  phases?: TournamentPhase[];
  currentPhaseId?: string;
  tournamentLevel?: TournamentLevel;
  tournamentCategory?: TournamentCategory;
  registrationType?: RegistrationType;
  tournamentScope?: TournamentScope;
  registrationCost?: number;
  prizeWon?: number;
  finalResult?: string;
  isPublic?: boolean;
  posterUrl?: string;
}

// ============================================
// MATCH
// ============================================

export interface MatchPlayerRole {
  playerId: string;
  role: PlayerRole;
}

export interface SeriesInfo {
  seriesId: string;
  matchNumber: number;
  winsBeforeThisMatch: { teamA: number; teamB: number };
  isFinale?: boolean;
  seriesComplete?: boolean;
  seriesWinner?: 'A' | 'B';
}

export interface Match {
  id: string;
  date: string;
  mode: 'Entraînement' | 'Tournoi';
  format: GameFormat;
  tournamentId?: string;
  tournamentName?: string;
  tournamentPhase?: string;
  tournamentBracket?: 'A' | 'B' | 'C' | 'D';
  bracketMatchId?: string;
  terrainId?: string;
  terrainType?: string;
  boulesSetId?: string;
  teamA: {
    players: string[];
    playerNames: string[];
    playerRoles?: MatchPlayerRole[];
    score: number;
  };
  teamB: {
    players: string[];
    playerNames: string[];
    playerRoles?: MatchPlayerRole[];
    score: number;
  };
  winner: 'A' | 'B';
  duration: number;
  menes: Mene[];
  playerActions?: PlayerAction[];
  seriesInfo?: SeriesInfo;
  notes?: string;
}

export interface Mene {
  id?: string;
  number?: number;
  teamAPoints: number;
  teamBPoints: number;
  scoreA?: number;
  scoreB?: number;
  duration?: number;
  isNull?: boolean;
  actions?: ShotAction[];
}

export interface ShotAction {
  id: string;
  playerId: string;
  playerName: string;
  type: 'point' | 'tir' | 'carreau';
  success: boolean;
  timestamp: string;
  meneNumber: number;
}

export interface DetailedShotRecord {
  id: string;
  timestamp: string;
  playerId: string;
  playerName?: string;
  team: 'A' | 'B';
  actionType: 'tir' | 'point';
  success: boolean;
  carreau?: boolean;
  shotType?: 'au_fer' | 'au_plomb' | 'en_rafle' | 'court_ramasse' | 'carreau';
  shotResult?: 'court_droite' | 'court_gauche' | 'long' | 'tir_bouchon';
  shotQuality?: 'gain_point' | 'sans_effet' | 'negatif' | 'decisif';
  pointType?: 'roule' | 'plombe' | 'demi_portee' | 'portee';
  pointQuality?: 'excellent' | 'bon' | 'moyen' | 'rate' | 'crochete' | 'sorti';
}

export interface RoleSegment {
  role: string;
  actions: {
    tirs: number;
    tirsSuccess: number;
    points: number;
    pointsSuccess: number;
    carreaux: number;
  };
}

export interface PlayerAction {
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
  detailedShots?: DetailedShotRecord[];
  roleSegments?: RoleSegment[];
}

// ============================================
// CHALLENGE
// ============================================

export type ChallengeType = '10_tirs' | '10_tirs_sautee' | 'precision';

export type PrecisionAtelier =
  | 'boule_seule'
  | 'derriere_but'
  | 'entre_2_boules'
  | 'sautee'
  | 'tir_but';

export type PrecisionDistance = 6 | 7 | 8 | 9;

export interface PrecisionShot {
  atelier: PrecisionAtelier;
  distance: PrecisionDistance;
  points: 0 | 1 | 3 | 5;
  timeUsed: number;
  timestamp: string;
}

export interface PrecisionScoringOption {
  points: 0 | 1 | 3 | 5;
  label: string;
  description: string;
}

export interface PrecisionAtelierConfig {
  id: PrecisionAtelier;
  name: string;
  description: string;
  icon: string;
  scoringOptions: PrecisionScoringOption[];
}

export interface ChallengeShot {
  number: number;
  success: boolean;
  carreau?: boolean;
  timestamp: string;
}

export type ChallengeMode = 'solo' | '1v1';

export interface ChallengePlayerResult {
  playerId: string;
  playerName: string;
  shots?: ChallengeShot[];
  precisionShots?: PrecisionShot[];
  successCount?: number;
  totalShots?: number;
  carreauCount?: number;
  successRate?: number;
  totalPoints?: number;
  atelierScores?: { [key in PrecisionAtelier]?: number };
}

export interface ChallengeDetailedShot {
  id: string;
  timestamp: string;
  actionType: 'tir' | 'point';
  success: boolean;
  carreau?: boolean;
  shotType?: 'au_fer' | 'au_plomb' | 'en_rafle' | 'court_ramasse' | 'carreau';
  shotResult?: 'court_droite' | 'court_gauche' | 'long' | 'tir_bouchon';
  /** @deprecated Use shotResult instead */
  failedShotType?: 'court_droite' | 'court_gauche' | 'long' | 'tir_bouchon';
  shotQuality?: 'gain_point' | 'sans_effet' | 'negatif' | 'decisif';
  pointType?: 'roule' | 'plombe' | 'demi_portee' | 'portee';
  pointQuality?: 'excellent' | 'bon' | 'moyen' | 'au_bouchon' | 'rate' | 'crochete' | 'sorti';
}

export interface Challenge {
  id: string;
  type: ChallengeType;
  mode: ChallengeMode;
  date: string;
  boulesSetId?: string;
  terrainId?: string;
  playerId?: string;
  playerName?: string;
  sponsorId?: string;
  sponsorName?: string;
  sponsorPhoto?: string;
  opponentId?: string;
  opponentName?: string;
  opponentResult?: ChallengePlayerResult;
  winner?: 'player' | 'opponent' | 'draw';
  shots?: ChallengeShot[];
  successCount?: number;
  totalShots?: number;
  carreauCount?: number;
  successRate?: number;
  precisionShots?: PrecisionShot[];
  totalPoints?: number;
  maxPoints?: number;
  atelierScores?: { [key in PrecisionAtelier]?: number };
  duration?: number;
  notes?: string;
  detailedShots?: ChallengeDetailedShot[];
}

// ============================================
// STATS & ANALYTICS
// ============================================

export interface ChallengeStats {
  totalChallenges: number;
  byType: {
    '10_tirs': { count: number; avgSuccess: number; bestScore: number };
    '10_tirs_sautee': { count: number; avgSuccess: number; bestScore: number };
    'precision': { count: number; avgSuccess: number; bestScore: number };
  };
  recentChallenges: Challenge[];
  totalShots: number;
  totalSuccess: number;
  overallSuccessRate: number;
}

export interface HeadToHead {
  player1Id: string;
  player2Id: string;
  matches: {
    id: string;
    date: string;
    player1Team: 'A' | 'B';
    player1Won: boolean;
    scoreFor: number;
    scoreAgainst: number;
    format: GameFormat;
    mode: string;
  }[];
  stats: {
    totalMatches: number;
    player1Wins: number;
    player2Wins: number;
    player1WinRate: number;
    player1AvgScore: number;
    player2AvgScore: number;
    lastMatch?: string;
  };
}
