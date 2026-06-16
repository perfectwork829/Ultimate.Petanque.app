// PetanqueScore Configuration

// ============================================
// SENTRY - Crash Reporting
// ============================================
// Replace with your real DSN from: https://sentry.io → Settings → Client Keys (DSN)
// Format: https://XXXX@oXXXXX.ingest.sentry.io/XXXXXXX
export const SENTRY_DSN = 'https://8ab6881c87f2fd84c1d5798221fc3221@o4511212729729024.ingest.us.sentry.io/4511253545746432';

// Tournament Levels
export const tournamentLevels = [
  'Loisir / Amical',
  'Promotion',
  'Honneur',
  'Élite',
  'Vétérans',
  'Jeunes (Minimes)',
  'Jeunes (Cadets)',
  'Jeunes (Juniors)',
] as const;

// Tournament Categories (Official types)
export const tournamentCategories = [
  'Officiel / FFPJP',
  'Concours officiel',
  'Concours amical',
  'Concours à la mêlée',
] as const;

// Registration Types
export const registrationTypes = [
  'Inscription libre',
  'Sur invitation',
  'Réservé aux licenciés',
  'Ouvert',
] as const;

// Tournament Scopes/Cadre
export const tournamentScopes = [
  'Championnat départemental',
  'Championnat régional',
  'Championnat national',
  'Championnat international',
  'Tournoi de club',
  'Concours à la montée',
] as const;

export const config = {
  appName: 'PetanqueScore',
  version: '1.0.0',
  
  // App download URL (replace with actual store link when published)
  appDownloadUrl: 'https://ultimatepetanque.app/download',
  
  // Game Rules
  game: {
    maxScore: 13,
    formats: ['Tête-à-tête', 'Doublette', 'Triplette'] as const,
    boulesPerPlayer: {
      'Tête-à-tête': 3,
      'Doublette': 3,
      'Triplette': 2,
    } as const,
  },
  
  // Match Modes
  matchModes: ['Entraînement', 'Tournoi'] as const,
  
  // Tournament Types (Cadrage)
  tournamentTypes: ['Poules', 'Élimination directe', 'Mixte', 'Suisse', 'A/B/C', 'Tirage intégral', 'Autre'] as const,
  
  // Shot Types
  shotTypes: [
    { id: 'point', label: 'Point', icon: 'radio-button-on' },
    { id: 'tir', label: 'Tir', icon: 'flame' },
    { id: 'carreau', label: 'Carreau', icon: 'star' },
  ] as const,
  
  // Player Roles
  playerRoles: ['Pointeur', 'Tireur', 'Milieu'] as const,
  
  // Map Settings
  map: {
    defaultRegion: {
      latitude: 46.603354,
      longitude: 1.888334,
      latitudeDelta: 8,
      longitudeDelta: 8,
    },
    markerColors: {
      club: '#2563EB',
      player: '#10B981',
      tournament: '#F59E0B',
    },
  },
  
  // Terrain Types (Surface)
  terrainTypes: [
    { id: 'Stabilisé', label: 'Stabilisé', icon: 'landscape', description: 'Sol dur et compact, bon roulement' },
    { id: 'Graviers', label: 'Graviers', icon: 'grain', description: 'Mélange de graviers, rebonds possibles' },
    { id: 'Sable', label: 'Sable', icon: 'beach-access', description: 'Sol meuble, boules qui s\'arrêtent vite' },
    { id: 'Cailloux', label: 'Cailloux', icon: 'scatter-plot', description: 'Gros cailloux, rebonds imprévisibles' },
    { id: 'Terre battue', label: 'Terre battue', icon: 'grass', description: 'Terre nue, évolue selon la météo' },
  ] as const,
  
  // Terrain Environment Types
  terrainEnvironments: [
    { id: 'indoor', label: 'Intérieur (Boulodrome)', icon: 'home', description: 'Terrain couvert, conditions contrôlées' },
    { id: 'outdoor', label: 'Extérieur', icon: 'wb-sunny', description: 'Terrain en plein air, conditions variables' },
  ] as const,
  
  // Statistics Categories
  statsCategories: [
    { id: 'global', label: 'Global' },
    { id: 'tir', label: 'Tir' },
    { id: 'point', label: 'Point' },
    { id: 'matchups', label: 'Face à Face' },
  ] as const,
  
  // Tournament configuration
  tournamentLevels,
  tournamentCategories,
  registrationTypes,
  tournamentScopes,
};

export type GameFormat = typeof config.game.formats[number];
export type MatchMode = typeof config.matchModes[number];
export type TournamentType = typeof config.tournamentTypes[number];
export type ShotType = typeof config.shotTypes[number]['id'];
export type PlayerRole = typeof config.playerRoles[number];
export type TerrainType = typeof config.terrainTypes[number]['id'];
export type TournamentLevel = typeof tournamentLevels[number];
export type TournamentCategory = typeof tournamentCategories[number];
export type RegistrationType = typeof registrationTypes[number];
export type TournamentScope = typeof tournamentScopes[number];

export default config;
