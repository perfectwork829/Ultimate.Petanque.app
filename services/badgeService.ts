/**
 * Badge Service — Gamification engine.
 * Defines 92 badges across 5 categories, checks unlock conditions, manages XP, and persists to DB.
 * Categories: Tournoi, Performance, Communauté, Géographique, ELO & Rang
 * All badge names use fun pétanque vocabulary.
 */
import { getSupabaseClient } from '@/template';

// ============================================
// TYPES
// ============================================
export interface BadgeDefinition {
  id: string;
  icon: string;
  color: string;
  xpReward: number;
  category: 'tournament' | 'performance' | 'community' | 'geographic' | 'elo';
  condition: (ctx: BadgeContext) => boolean;
}

export interface UserBadge {
  badgeId: string;
  unlockedAt: string;
}

export interface BadgeContext {
  matchCount: number;
  winRate: number;
  tirRate: number;
  carreauRate: number;
  totalCarreaux: number;
  sharedAcceptedCount: number;
  invitedUsersCount: number;
  uniqueTerrainsPlayed: number;
  leaderboardRank: number | null;
  consecutiveDaysPlayed: number;
  isAmbassador: boolean;
  trustScore: number | null;
  witnessAttestationsGiven: number;
  profileCompleteness: number;
  eloRating: number;
  eloTireur: number;
  eloPointeur: number;
  eloMilieu: number;
  isCityLeader: boolean;
  cityName: string | null;
  isClubLeader: boolean;
  clubName: string | null;
  isCountryLeader: boolean;
  countryName: string | null;
  isContinentLeader: boolean;
  continentName: string | null;
  isWorldLeader: boolean;
  // Extended context for new badges
  totalWins: number;
  totalLosses: number;
  tournamentCount: number;
  tournamentTitles: number;
  tournamentPodiums: number;
  tournamentUndefeated: number;
  maxWinStreak: number;
  maxLossStreak: number;
  fannyGiven: number;
  fannyReceived: number;
  totalTirs: number;
  totalTirsSuccess: number;
  totalPoints: number;
  totalPointsSuccess: number;
  totalMenes: number;
  totalChallenges: number;
  challengeBestScore10Tirs: number;
  precisionBestScore: number;
  avgPointsScored: number;
  avgPointsConceded: number;
  totalMatchDuration: number;
  seriesWon: number;
  uniqueOpponents: number;
  uniqueClubsPlayed: number;
  h2hWinsVsDifferentPlayers: number;
  meetupsOrganized: number;
  meetupsJoined: number;
  sponsoredEventsParticipated: number;
  sponsoredEventsCreated: number;
  shareCardsCreated: number;
  uniqueCitiesPlayed: number;
  uniqueCountriesPlayed: number;
  uniqueContinentsPlayed: number;
  uniqueTerrainTypes: number;
  matchesOnGravel: number;
  matchesOnSand: number;
  matchesOnGrass: number;
  matchesOnIndoor: number;
  matchesAtNight: number;
  playedInRain: boolean;
  eloGainInOneMatch: number;
  eloLossInOneMatch: number;
  peakElo: number;
  eloWinStreak: number;
  seasonalResets: number;
  rolesPlayed: number;
  totalBoulesSetUsed: number;
  pointRate: number;
}

// ============================================
// XP LEVELS (Adjusted for 92 badges)
// ============================================
export const XP_LEVELS = [
  { name: 'Poussin', nameEn: 'Rookie', minXp: 0, icon: 'child-care' },
  { name: 'Casse-Boule', nameEn: 'Ball Breaker', minXp: 100, icon: 'sports' },
  { name: 'Lanceur du Dimanche', nameEn: 'Sunday Thrower', minXp: 300, icon: 'wb-sunny' },
  { name: 'Bouliste Confirme', nameEn: 'Confirmed Player', minXp: 600, icon: 'trending-up' },
  { name: 'Tireur d\'Elite', nameEn: 'Elite Shooter', minXp: 1200, icon: 'gps-fixed' },
  { name: 'Maitre du Cochonnet', nameEn: 'Jack Master', minXp: 2000, icon: 'stars' },
  { name: 'Legende du Boulodrome', nameEn: 'Boulodrome Legend', minXp: 3500, icon: 'auto-awesome' },
  { name: 'Dieu de la Petanque', nameEn: 'Petanque God', minXp: 5500, icon: 'emoji-events' },
] as const;

export function getLevelFromXp(xp: number): typeof XP_LEVELS[number] {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].minXp) return XP_LEVELS[i];
  }
  return XP_LEVELS[0];
}

export function getNextLevel(xp: number): { level: typeof XP_LEVELS[number]; xpNeeded: number } | null {
  const currentIdx = XP_LEVELS.findIndex((l, i) => {
    const next = XP_LEVELS[i + 1];
    return next ? xp < next.minXp : true;
  });
  if (currentIdx >= XP_LEVELS.length - 1) return null;
  const next = XP_LEVELS[currentIdx + 1];
  return { level: next, xpNeeded: next.minXp - xp };
}

export function getXpProgress(xp: number): { current: number; max: number; percent: number } {
  const currentLevel = getLevelFromXp(xp);
  const currentIdx = XP_LEVELS.indexOf(currentLevel);
  if (currentIdx >= XP_LEVELS.length - 1) {
    return { current: xp, max: xp, percent: 100 };
  }
  const nextLevel = XP_LEVELS[currentIdx + 1];
  const levelStart = currentLevel.minXp;
  const levelEnd = nextLevel.minXp;
  const progress = xp - levelStart;
  const range = levelEnd - levelStart;
  return { current: progress, max: range, percent: Math.min(100, Math.round((progress / range) * 100)) };
}

// ============================================
// XP REWARDS (per-action)
// ============================================
export const XP_PER_MATCH = 10;
export const XP_PER_CARREAU = 5;
export const XP_PER_SHARE_ACCEPTED = 15;
export const XP_PER_BADGE = 50;

// ============================================
// BADGE DEFINITIONS — 92 BADGES
// ============================================
export const BADGES: BadgeDefinition[] = [

  // ════════════════════════════════════════
  // 🏆 TOURNOI (18 badges)
  // ════════════════════════════════════════
  { id: 'bapteme_du_concours', icon: 'celebration', color: '#10B981', xpReward: 30, category: 'tournament',
    condition: (ctx) => ctx.tournamentCount >= 1 },
  { id: 'habitue_du_boulodrome', icon: 'event-repeat', color: '#3B82F6', xpReward: 50, category: 'tournament',
    condition: (ctx) => ctx.tournamentCount >= 5 },
  { id: 'boulomane', icon: 'local-fire-department', color: '#F97316', xpReward: 75, category: 'tournament',
    condition: (ctx) => ctx.tournamentCount >= 15 },
  { id: 'accro_aux_concours', icon: 'whatshot', color: '#EF4444', xpReward: 100, category: 'tournament',
    condition: (ctx) => ctx.tournamentCount >= 30 },
  { id: 'premier_bouchon_dor', icon: 'emoji-events', color: '#FFD700', xpReward: 100, category: 'tournament',
    condition: (ctx) => ctx.tournamentTitles >= 1 },
  { id: 'doublette_doree', icon: 'looks-two', color: '#FFD700', xpReward: 125, category: 'tournament',
    condition: (ctx) => ctx.tournamentTitles >= 2 },
  { id: 'triplette_magique', icon: 'looks-3', color: '#F59E0B', xpReward: 150, category: 'tournament',
    condition: (ctx) => ctx.tournamentTitles >= 5 },
  { id: 'roi_du_concours', icon: 'workspace-premium', color: '#9333EA', xpReward: 200, category: 'tournament',
    condition: (ctx) => ctx.tournamentTitles >= 10 },
  { id: 'collectionneur_de_podiums', icon: 'military-tech', color: '#C0C0C0', xpReward: 75, category: 'tournament',
    condition: (ctx) => ctx.tournamentPodiums >= 3 },
  { id: 'abonne_au_podium', icon: 'leaderboard', color: '#CD7F32', xpReward: 100, category: 'tournament',
    condition: (ctx) => ctx.tournamentPodiums >= 10 },
  { id: 'machine_a_podiums', icon: 'grade', color: '#FFD700', xpReward: 150, category: 'tournament',
    condition: (ctx) => ctx.tournamentPodiums >= 20 },
  { id: 'invincible_du_concours', icon: 'shield', color: '#22C55E', xpReward: 100, category: 'tournament',
    condition: (ctx) => ctx.tournamentUndefeated >= 1 },
  { id: 'mur_infranchissable', icon: 'security', color: '#0EA5E9', xpReward: 150, category: 'tournament',
    condition: (ctx) => ctx.tournamentUndefeated >= 3 },
  { id: 'rouleau_compresseur', icon: 'speed', color: '#DC2626', xpReward: 75, category: 'tournament',
    condition: (ctx) => ctx.maxWinStreak >= 5 },
  { id: 'inarretable', icon: 'bolt', color: '#F97316', xpReward: 125, category: 'tournament',
    condition: (ctx) => ctx.maxWinStreak >= 10 },
  { id: 'la_serie_noire', icon: 'nights-stay', color: '#6366F1', xpReward: 30, category: 'tournament',
    condition: (ctx) => ctx.maxLossStreak >= 5 },
  { id: 'phoenix_du_boulodrome', icon: 'rocket-launch', color: '#F43F5E', xpReward: 75, category: 'tournament',
    condition: (ctx) => ctx.maxLossStreak >= 3 && ctx.maxWinStreak >= 3 },
  { id: 'veteran_des_concours', icon: 'history-edu', color: '#8B5CF6', xpReward: 200, category: 'tournament',
    condition: (ctx) => ctx.tournamentCount >= 50 },

  // ════════════════════════════════════════
  // 🎯 PERFORMANCE (30 badges)
  // ════════════════════════════════════════
  { id: 'premier_lancer', icon: 'sports', color: '#10B981', xpReward: 30, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 1 },
  { id: 'coup_de_main', icon: 'pan-tool', color: '#3B82F6', xpReward: 40, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 5 },
  { id: 'bouliste_assidu', icon: 'repeat', color: '#6366F1', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 25 },
  { id: 'cent_boules', icon: 'hundred', color: '#F59E0B', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 100 },
  { id: 'mille_cochonnets', icon: 'all-inclusive', color: '#DC2626', xpReward: 150, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 500 },
  { id: 'oeil_de_lynx', icon: 'gps-fixed', color: '#8B5CF6', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 10 && ctx.tirRate >= 70 },
  { id: 'tireur_de_precision', icon: 'center-focus-strong', color: '#0EA5E9', xpReward: 100, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 20 && ctx.tirRate >= 80 },
  { id: 'sniper_du_boulodrome', icon: 'radar', color: '#DC2626', xpReward: 150, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 30 && ctx.tirRate >= 90 },
  { id: 'roi_du_carreau', icon: 'star', color: '#F59E0B', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.totalCarreaux >= 10 },
  { id: 'pluie_de_carreaux', icon: 'auto-awesome', color: '#FBBF24', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.totalCarreaux >= 50 },
  { id: 'carreau_machine', icon: 'stars', color: '#FFD700', xpReward: 125, category: 'performance',
    condition: (ctx) => ctx.totalCarreaux >= 100 },
  { id: 'carreau_legendaire', icon: 'diamond', color: '#FFD700', xpReward: 200, category: 'performance',
    condition: (ctx) => ctx.totalCarreaux >= 250 },
  { id: 'main_en_or', icon: 'front-hand', color: '#10B981', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 10 && ctx.pointRate >= 70 },
  { id: 'pointeur_delite', icon: 'adjust', color: '#3B82F6', xpReward: 100, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 20 && ctx.pointRate >= 80 },
  { id: 'biberon_magique', icon: 'water-drop', color: '#06B6D4', xpReward: 125, category: 'performance',
    condition: (ctx) => ctx.matchCount >= 30 && ctx.pointRate >= 90 },
  { id: 'fanny_collector', icon: 'sentiment-very-satisfied', color: '#22C55E', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.fannyGiven >= 1 },
  { id: 'roi_de_la_fanny', icon: 'mood', color: '#F97316', xpReward: 100, category: 'performance',
    condition: (ctx) => ctx.fannyGiven >= 5 },
  { id: 'embrasse_la_fanny', icon: 'sentiment-dissatisfied', color: '#EF4444', xpReward: 25, category: 'performance',
    condition: (ctx) => ctx.fannyReceived >= 1 },
  { id: 'abonne_a_la_fanny', icon: 'sick', color: '#DC2626', xpReward: 40, category: 'performance',
    condition: (ctx) => ctx.fannyReceived >= 5 },
  { id: 'marathon_de_boules', icon: 'directions-run', color: '#6366F1', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.totalMatchDuration >= 6000 },
  { id: 'sans_pitie', icon: 'whatshot', color: '#EF4444', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.avgPointsScored >= 11 && ctx.matchCount >= 10 },
  { id: 'muraille_defensive', icon: 'castle', color: '#0EA5E9', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.avgPointsConceded <= 7 && ctx.matchCount >= 10 },
  { id: 'maitre_du_defi', icon: 'fitness-center', color: '#8B5CF6', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.totalChallenges >= 10 },
  { id: 'defi_parfait', icon: 'check-circle', color: '#22C55E', xpReward: 100, category: 'performance',
    condition: (ctx) => ctx.challengeBestScore10Tirs >= 10 },
  { id: 'precision_chirurgicale', icon: 'biotech', color: '#F59E0B', xpReward: 100, category: 'performance',
    condition: (ctx) => ctx.precisionBestScore >= 60 },
  { id: 'serie_gagnante', icon: 'military-tech', color: '#22C55E', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.seriesWon >= 3 },
  { id: 'polyvalent', icon: 'swap-horiz', color: '#7C3AED', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.rolesPlayed >= 3 },
  { id: 'boule_en_or', icon: 'sports-baseball', color: '#FFD700', xpReward: 50, category: 'performance',
    condition: (ctx) => ctx.totalBoulesSetUsed >= 3 },
  { id: 'en_feu', icon: 'local-fire-department', color: '#F97316', xpReward: 75, category: 'performance',
    condition: (ctx) => ctx.consecutiveDaysPlayed >= 7 },
  { id: 'flamme_eternelle', icon: 'whatshot', color: '#DC2626', xpReward: 150, category: 'performance',
    condition: (ctx) => ctx.consecutiveDaysPlayed >= 30 },

  // ════════════════════════════════════════
  // 🤝 COMMUNAUTÉ (20 badges)
  // ════════════════════════════════════════
  { id: 'social_player', icon: 'handshake', color: '#EC4899', xpReward: 40, category: 'community',
    condition: (ctx) => ctx.sharedAcceptedCount >= 1 },
  { id: 'partageur_de_boules', icon: 'share', color: '#3B82F6', xpReward: 60, category: 'community',
    condition: (ctx) => ctx.sharedAcceptedCount >= 5 },
  { id: 'influenceur_du_terrain', icon: 'campaign', color: '#F97316', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.sharedAcceptedCount >= 20 },
  { id: 'recruteur', icon: 'person-add', color: '#06B6D4', xpReward: 75, category: 'community',
    condition: (ctx) => ctx.invitedUsersCount >= 3 },
  { id: 'ambassadeur', icon: 'verified', color: '#7C3AED', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.isAmbassador },
  { id: 'fiable', icon: 'shield', color: '#3B82F6', xpReward: 30, category: 'community',
    condition: (ctx) => ctx.trustScore !== null && ctx.trustScore >= 65 },
  { id: 'verifie', icon: 'verified-user', color: '#22C55E', xpReward: 50, category: 'community',
    condition: (ctx) => ctx.trustScore !== null && ctx.trustScore >= 80 },
  { id: 'pilier_de_confiance', icon: 'security', color: '#0EA5E9', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.trustScore !== null && ctx.trustScore >= 95 },
  { id: 'temoin_fiable', icon: 'visibility', color: '#7C3AED', xpReward: 50, category: 'community',
    condition: (ctx) => ctx.witnessAttestationsGiven >= 10 },
  { id: 'notaire_du_boulodrome', icon: 'gavel', color: '#8B5CF6', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.witnessAttestationsGiven >= 50 },
  { id: 'profil_debut', icon: 'person-outline', color: '#3B82F6', xpReward: 50, category: 'community',
    condition: (ctx) => ctx.profileCompleteness >= 50 },
  { id: 'profil_avance', icon: 'person', color: '#8B5CF6', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.profileCompleteness >= 75 },
  { id: 'profil_complet', icon: 'account-circle', color: '#0EA5E9', xpReward: 150, category: 'community',
    condition: (ctx) => ctx.profileCompleteness >= 100 },
  { id: 'organisateur_de_meles', icon: 'event', color: '#10B981', xpReward: 50, category: 'community',
    condition: (ctx) => ctx.meetupsOrganized >= 1 },
  { id: 'chef_de_bande', icon: 'groups', color: '#F59E0B', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.meetupsOrganized >= 5 },
  { id: 'fidele_des_rencontres', icon: 'diversity-3', color: '#3B82F6', xpReward: 50, category: 'community',
    condition: (ctx) => ctx.meetupsJoined >= 5 },
  { id: 'challenger_sponsorise', icon: 'star-border', color: '#9333EA', xpReward: 75, category: 'community',
    condition: (ctx) => ctx.sponsoredEventsParticipated >= 1 },
  { id: 'bete_de_defis', icon: 'emoji-events', color: '#F43F5E', xpReward: 125, category: 'community',
    condition: (ctx) => ctx.sponsoredEventsParticipated >= 10 },
  { id: 'createur_devenements', icon: 'add-circle', color: '#10B981', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.sponsoredEventsCreated >= 1 },
  { id: 'artiste_des_cartes', icon: 'palette', color: '#EC4899', xpReward: 40, category: 'community',
    condition: (ctx) => ctx.shareCardsCreated >= 5 },
  { id: 'mille_adversaires', icon: 'people-outline', color: '#F97316', xpReward: 100, category: 'community',
    condition: (ctx) => ctx.uniqueOpponents >= 50 },
  { id: 'bourlingeur_de_clubs', icon: 'domain', color: '#6366F1', xpReward: 75, category: 'community',
    condition: (ctx) => ctx.uniqueClubsPlayed >= 10 },

  // ════════════════════════════════════════
  // 🌍 GÉOGRAPHIQUE (30 badges)
  // ════════════════════════════════════════
  { id: 'explorateur', icon: 'explore', color: '#14B8A6', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainsPlayed >= 5 },
  { id: 'nomade_de_la_boule', icon: 'hiking', color: '#059669', xpReward: 75, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainsPlayed >= 15 },
  { id: 'bourlingueur_supreme', icon: 'travel-explore', color: '#0D9488', xpReward: 125, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainsPlayed >= 30 },
  { id: 'passe_partout', icon: 'vpn-key', color: '#F59E0B', xpReward: 200, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainsPlayed >= 50 },
  { id: 'boss_de_la_ville', icon: 'location-city', color: '#DC2626', xpReward: 100, category: 'geographic',
    condition: (ctx) => ctx.isCityLeader && !!ctx.cityName },
  { id: 'champion_du_quartier', icon: 'home', color: '#7C3AED', xpReward: 75, category: 'geographic',
    condition: (ctx) => ctx.isClubLeader && !!ctx.clubName },
  { id: 'heros_national', icon: 'flag', color: '#2563EB', xpReward: 150, category: 'geographic',
    condition: (ctx) => ctx.isCountryLeader && !!ctx.countryName },
  { id: 'seigneur_des_terrains', icon: 'public', color: '#F59E0B', xpReward: 200, category: 'geographic',
    condition: (ctx) => ctx.isContinentLeader && !!ctx.continentName },
  { id: 'maitre_universel', icon: 'auto-awesome', color: '#FFD700', xpReward: 300, category: 'geographic',
    condition: (ctx) => ctx.isWorldLeader },
  { id: 'touriste_du_boulodrome', icon: 'map', color: '#3B82F6', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.uniqueCitiesPlayed >= 3 },
  { id: 'boule_sans_frontieres', icon: 'flight', color: '#0EA5E9', xpReward: 75, category: 'geographic',
    condition: (ctx) => ctx.uniqueCitiesPlayed >= 10 },
  { id: 'globe_bouleur', icon: 'language', color: '#6366F1', xpReward: 125, category: 'geographic',
    condition: (ctx) => ctx.uniqueCitiesPlayed >= 25 },
  { id: 'ambassadeur_mondial', icon: 'connecting-airports', color: '#F43F5E', xpReward: 200, category: 'geographic',
    condition: (ctx) => ctx.uniqueCitiesPlayed >= 50 },
  { id: 'voyageur_international', icon: 'airplanemode-active', color: '#8B5CF6', xpReward: 100, category: 'geographic',
    condition: (ctx) => ctx.uniqueCountriesPlayed >= 2 },
  { id: 'boule_diplomatique', icon: 'translate', color: '#F97316', xpReward: 150, category: 'geographic',
    condition: (ctx) => ctx.uniqueCountriesPlayed >= 5 },
  { id: 'boule_planetaire', icon: 'satellite-alt', color: '#FFD700', xpReward: 200, category: 'geographic',
    condition: (ctx) => ctx.uniqueCountriesPlayed >= 10 },
  { id: 'intercontinental', icon: 'rocket', color: '#DC2626', xpReward: 150, category: 'geographic',
    condition: (ctx) => ctx.uniqueContinentsPlayed >= 2 },
  { id: 'maitre_du_gravier', icon: 'grain', color: '#D97706', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.matchesOnGravel >= 20 },
  { id: 'roi_du_sable', icon: 'beach-access', color: '#FBBF24', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.matchesOnSand >= 20 },
  { id: 'gazon_master', icon: 'grass', color: '#22C55E', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.matchesOnGrass >= 20 },
  { id: 'bouliste_dinterior', icon: 'roofing', color: '#6366F1', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.matchesOnIndoor >= 20 },
  { id: 'hibou_du_boulodrome', icon: 'nightlight', color: '#4338CA', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.matchesAtNight >= 5 },
  { id: 'touche_a_tout_terrain', icon: 'terrain', color: '#14B8A6', xpReward: 75, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainTypes >= 4 },
  { id: 'classement_communautaire', icon: 'leaderboard', color: '#EF4444', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 100 },
  { id: 'top_50_national', icon: 'emoji-events', color: '#F97316', xpReward: 100, category: 'geographic',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 50 },
  { id: 'top_10_national', icon: 'workspace-premium', color: '#FFD700', xpReward: 200, category: 'geographic',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 10 },
  { id: 'numero_un', icon: 'looks-one', color: '#FFD700', xpReward: 300, category: 'geographic',
    condition: (ctx) => ctx.leaderboardRank === 1 },
  { id: 'top_3_ville', icon: 'location-on', color: '#3B82F6', xpReward: 75, category: 'geographic',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 3 && ctx.isCityLeader },
  { id: 'conquerant_regional', icon: 'south-america', color: '#8B5CF6', xpReward: 125, category: 'geographic',
    condition: (ctx) => ctx.uniqueCitiesPlayed >= 5 && ctx.winRate >= 60 },
  { id: 'multiplateforme', icon: 'devices', color: '#10B981', xpReward: 50, category: 'geographic',
    condition: (ctx) => ctx.uniqueTerrainTypes >= 3 && ctx.matchCount >= 15 },

  // ════════════════════════════════════════
  // 💎 ELO & RANG (14 badges)
  // ════════════════════════════════════════
  { id: 'premiere_partie_classee', icon: 'play-arrow', color: '#10B981', xpReward: 25, category: 'elo',
    condition: (ctx) => ctx.eloRating > 1000 || ctx.eloRating < 1000 },
  { id: 'bronze_bouliste', icon: 'military-tech', color: '#CD7F32', xpReward: 50, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1100 },
  { id: 'argent_du_cochonnet', icon: 'workspace-premium', color: '#C0C0C0', xpReward: 75, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1200 },
  { id: 'or_du_boulodrome', icon: 'emoji-events', color: '#FFD700', xpReward: 100, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1300 },
  { id: 'premier_diamant', icon: 'diamond', color: '#06B6D4', xpReward: 125, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1500 },
  { id: 'maitre_petanque', icon: 'auto-awesome', color: '#9333EA', xpReward: 175, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1800 },
  { id: 'grand_maitre', icon: 'star-rate', color: '#FFD700', xpReward: 250, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 2000 },
  { id: 'specialiste', icon: 'psychology', color: '#F59E0B', xpReward: 75, category: 'elo',
    condition: (ctx) => ctx.eloTireur >= 1300 || ctx.eloPointeur >= 1300 || ctx.eloMilieu >= 1300 },
  { id: 'double_specialiste', icon: 'psychology-alt', color: '#8B5CF6', xpReward: 125, category: 'elo',
    condition: (ctx) => (ctx.eloTireur >= 1300 ? 1 : 0) + (ctx.eloPointeur >= 1300 ? 1 : 0) + (ctx.eloMilieu >= 1300 ? 1 : 0) >= 2 },
  { id: 'triple_menace', icon: 'hub', color: '#DC2626', xpReward: 200, category: 'elo',
    condition: (ctx) => ctx.eloTireur >= 1300 && ctx.eloPointeur >= 1300 && ctx.eloMilieu >= 1300 },
  { id: 'grimpeur_du_classement', icon: 'trending-up', color: '#22C55E', xpReward: 50, category: 'elo',
    condition: (ctx) => ctx.eloGainInOneMatch >= 30 },
  { id: 'chute_libre', icon: 'trending-down', color: '#EF4444', xpReward: 25, category: 'elo',
    condition: (ctx) => ctx.eloLossInOneMatch >= 30 },
  { id: 'sommet_atteint', icon: 'landscape', color: '#FFD700', xpReward: 100, category: 'elo',
    condition: (ctx) => ctx.peakElo >= 1600 },
  { id: 'resilient', icon: 'refresh', color: '#3B82F6', xpReward: 75, category: 'elo',
    condition: (ctx) => ctx.seasonalResets >= 2 && ctx.eloRating >= 1200 },

  // Global Ranking badges
  { id: 'top_1000_mondial', icon: 'public', color: '#3B82F6', xpReward: 75, category: 'elo',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 1000 },
  { id: 'top_100_mondial', icon: 'language', color: '#F59E0B', xpReward: 150, category: 'elo',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 100 },
  { id: 'top_10_mondial', icon: 'military-tech', color: '#FFD700', xpReward: 250, category: 'elo',
    condition: (ctx) => ctx.leaderboardRank !== null && ctx.leaderboardRank <= 10 },

  // League tier badges
  { id: 'ligue_argent', icon: 'workspace-premium', color: '#94A3B8', xpReward: 40, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1100 },
  { id: 'ligue_diamant', icon: 'diamond', color: '#06B6D4', xpReward: 100, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 1500 },
  { id: 'ligue_grand_maitre', icon: 'auto-awesome', color: '#FFD700', xpReward: 300, category: 'elo',
    condition: (ctx) => ctx.eloRating >= 2000 },
];

// ============================================
// BADGE NAMES (i18n)
// ============================================
export function getBadgeName(badgeId: string, lang: 'fr' | 'en'): string {
  const names: Record<string, { fr: string; en: string }> = {
    // Tournament
    bapteme_du_concours: { fr: 'Bapteme du Concours', en: 'Tournament Baptism' },
    habitue_du_boulodrome: { fr: 'Habitue du Boulodrome', en: 'Boulodrome Regular' },
    boulomane: { fr: 'Boulomane', en: 'Boule Addict' },
    accro_aux_concours: { fr: 'Accro aux Concours', en: 'Contest Junkie' },
    premier_bouchon_dor: { fr: 'Premier Bouchon d\'Or', en: 'First Golden Jack' },
    doublette_doree: { fr: 'Doublette Doree', en: 'Golden Doubles' },
    triplette_magique: { fr: 'Triplette Magique', en: 'Magic Triples' },
    roi_du_concours: { fr: 'Roi du Concours', en: 'Contest King' },
    collectionneur_de_podiums: { fr: 'Collectionneur de Podiums', en: 'Podium Collector' },
    abonne_au_podium: { fr: 'Abonne au Podium', en: 'Podium Subscriber' },
    machine_a_podiums: { fr: 'Machine a Podiums', en: 'Podium Machine' },
    invincible_du_concours: { fr: 'Invincible du Concours', en: 'Unbeatable Champion' },
    mur_infranchissable: { fr: 'Mur Infranchissable', en: 'Impenetrable Wall' },
    rouleau_compresseur: { fr: 'Rouleau Compresseur', en: 'Steamroller' },
    inarretable: { fr: 'Inarretable', en: 'Unstoppable' },
    la_serie_noire: { fr: 'La Serie Noire', en: 'Dark Streak' },
    phoenix_du_boulodrome: { fr: 'Phoenix du Boulodrome', en: 'Boulodrome Phoenix' },
    veteran_des_concours: { fr: 'Veteran des Concours', en: 'Contest Veteran' },
    // Performance
    premier_lancer: { fr: 'Premier Lancer', en: 'First Throw' },
    coup_de_main: { fr: 'Coup de Main', en: 'Helping Hand' },
    bouliste_assidu: { fr: 'Bouliste Assidu', en: 'Dedicated Player' },
    cent_boules: { fr: 'Cent Boules', en: 'Hundred Balls' },
    mille_cochonnets: { fr: 'Mille Cochonnets', en: 'Thousand Jacks' },
    oeil_de_lynx: { fr: 'Oeil de Lynx', en: 'Eagle Eye' },
    tireur_de_precision: { fr: 'Tireur de Precision', en: 'Precision Shooter' },
    sniper_du_boulodrome: { fr: 'Sniper du Boulodrome', en: 'Boulodrome Sniper' },
    roi_du_carreau: { fr: 'Roi du Carreau', en: 'Carreau King' },
    pluie_de_carreaux: { fr: 'Pluie de Carreaux', en: 'Carreau Shower' },
    carreau_machine: { fr: 'Carreau Machine', en: 'Carreau Machine' },
    carreau_legendaire: { fr: 'Carreau Legendaire', en: 'Legendary Carreau' },
    main_en_or: { fr: 'Main en Or', en: 'Golden Hand' },
    pointeur_delite: { fr: 'Pointeur d\'Elite', en: 'Elite Pointer' },
    biberon_magique: { fr: 'Biberon Magique', en: 'Magic Bottle' },
    fanny_collector: { fr: 'Fanny Collector', en: 'Fanny Collector' },
    roi_de_la_fanny: { fr: 'Roi de la Fanny', en: 'Fanny King' },
    embrasse_la_fanny: { fr: 'Embrasse la Fanny', en: 'Kiss the Fanny' },
    abonne_a_la_fanny: { fr: 'Abonne a la Fanny', en: 'Fanny Season Pass' },
    marathon_de_boules: { fr: 'Marathon de Boules', en: 'Boule Marathon' },
    sans_pitie: { fr: 'Sans Pitie', en: 'No Mercy' },
    muraille_defensive: { fr: 'Muraille Defensive', en: 'Defensive Wall' },
    maitre_du_defi: { fr: 'Maitre du Defi', en: 'Challenge Master' },
    defi_parfait: { fr: 'Defi Parfait', en: 'Perfect Challenge' },
    precision_chirurgicale: { fr: 'Precision Chirurgicale', en: 'Surgical Precision' },
    serie_gagnante: { fr: 'Serie Gagnante', en: 'Winning Series' },
    polyvalent: { fr: 'Polyvalent', en: 'Versatile' },
    boule_en_or: { fr: 'Boule en Or', en: 'Golden Boule' },
    en_feu: { fr: 'En Feu', en: 'On Fire' },
    flamme_eternelle: { fr: 'Flamme Eternelle', en: 'Eternal Flame' },
    // Community
    social_player: { fr: 'Social Player', en: 'Social Player' },
    partageur_de_boules: { fr: 'Partageur de Boules', en: 'Boule Sharer' },
    influenceur_du_terrain: { fr: 'Influenceur du Terrain', en: 'Court Influencer' },
    recruteur: { fr: 'Recruteur', en: 'Recruiter' },
    ambassadeur: { fr: 'Ambassadeur', en: 'Ambassador' },
    fiable: { fr: 'Fiable', en: 'Trusted' },
    verifie: { fr: 'Verifie', en: 'Verified' },
    pilier_de_confiance: { fr: 'Pilier de Confiance', en: 'Trust Pillar' },
    temoin_fiable: { fr: 'Temoin Fiable', en: 'Trusted Witness' },
    notaire_du_boulodrome: { fr: 'Notaire du Boulodrome', en: 'Boulodrome Notary' },
    profil_debut: { fr: 'Profil en Route', en: 'Profile Underway' },
    profil_avance: { fr: 'Profil Avance', en: 'Advanced Profile' },
    profil_complet: { fr: 'Profil Complet', en: 'Complete Profile' },
    organisateur_de_meles: { fr: 'Organisateur de Melees', en: 'Meetup Organizer' },
    chef_de_bande: { fr: 'Chef de Bande', en: 'Gang Leader' },
    fidele_des_rencontres: { fr: 'Fidele des Rencontres', en: 'Meetup Regular' },
    challenger_sponsorise: { fr: 'Challenger Sponsorise', en: 'Sponsored Challenger' },
    bete_de_defis: { fr: 'Bete de Defis', en: 'Challenge Beast' },
    createur_devenements: { fr: 'Createur d\'Evenements', en: 'Event Creator' },
    artiste_des_cartes: { fr: 'Artiste des Cartes', en: 'Card Artist' },
    mille_adversaires: { fr: 'Mille Adversaires', en: 'Thousand Rivals' },
    bourlingeur_de_clubs: { fr: 'Bourlingeur de Clubs', en: 'Club Hopper' },
    // Geographic
    explorateur: { fr: 'Explorateur', en: 'Explorer' },
    nomade_de_la_boule: { fr: 'Nomade de la Boule', en: 'Boule Nomad' },
    bourlingueur_supreme: { fr: 'Bourlingueur Supreme', en: 'Supreme Wanderer' },
    passe_partout: { fr: 'Passe-Partout', en: 'All-Access Pass' },
    boss_de_la_ville: { fr: 'Boss de la Ville', en: 'City Boss' },
    champion_du_quartier: { fr: 'Champion du Quartier', en: 'Club Champion' },
    heros_national: { fr: 'Heros National', en: 'National Hero' },
    seigneur_des_terrains: { fr: 'Seigneur des Terrains', en: 'Continental Lord' },
    maitre_universel: { fr: 'Maitre Universel', en: 'Universal Master' },
    touriste_du_boulodrome: { fr: 'Touriste du Boulodrome', en: 'Boulodrome Tourist' },
    boule_sans_frontieres: { fr: 'Boule Sans Frontieres', en: 'Boule Without Borders' },
    globe_bouleur: { fr: 'Globe-Bouleur', en: 'Globe-Bowler' },
    ambassadeur_mondial: { fr: 'Ambassadeur Mondial', en: 'World Ambassador' },
    voyageur_international: { fr: 'Voyageur International', en: 'International Traveler' },
    boule_diplomatique: { fr: 'Boule Diplomatique', en: 'Diplomatic Boule' },
    boule_planetaire: { fr: 'Boule Planetaire', en: 'Planetary Boule' },
    intercontinental: { fr: 'Intercontinental', en: 'Intercontinental' },
    maitre_du_gravier: { fr: 'Maitre du Gravier', en: 'Gravel Master' },
    roi_du_sable: { fr: 'Roi du Sable', en: 'Sand King' },
    gazon_master: { fr: 'Gazon Master', en: 'Grass Master' },
    bouliste_dinterior: { fr: 'Bouliste d\'Interieur', en: 'Indoor Player' },
    hibou_du_boulodrome: { fr: 'Hibou du Boulodrome', en: 'Night Owl' },
    touche_a_tout_terrain: { fr: 'Touche-a-Tout Terrain', en: 'All-Terrain' },
    classement_communautaire: { fr: 'Classe', en: 'Ranked' },
    top_50_national: { fr: 'Top 50 National', en: 'National Top 50' },
    top_10_national: { fr: 'Top 10 National', en: 'National Top 10' },
    numero_un: { fr: 'Numero Un', en: 'Number One' },
    top_3_ville: { fr: 'Top 3 Ville', en: 'City Top 3' },
    conquerant_regional: { fr: 'Conquerant Regional', en: 'Regional Conqueror' },
    multiplateforme: { fr: 'Multi-Surfaces', en: 'Multi-Surface' },
    // ELO
    premiere_partie_classee: { fr: 'Premiere Partie Classee', en: 'First Rated Game' },
    bronze_bouliste: { fr: 'Bronze Bouliste', en: 'Bronze Player' },
    argent_du_cochonnet: { fr: 'Argent du Cochonnet', en: 'Silver Jack' },
    or_du_boulodrome: { fr: 'Or du Boulodrome', en: 'Boulodrome Gold' },
    premier_diamant: { fr: 'Premier Diamant', en: 'First Diamond' },
    maitre_petanque: { fr: 'Maitre Petanque', en: 'Petanque Master' },
    grand_maitre: { fr: 'Grand Maitre', en: 'Grand Master' },
    specialiste: { fr: 'Specialiste', en: 'Specialist' },
    double_specialiste: { fr: 'Double Specialiste', en: 'Double Specialist' },
    triple_menace: { fr: 'Triple Menace', en: 'Triple Threat' },
    grimpeur_du_classement: { fr: 'Grimpeur du Classement', en: 'Rank Climber' },
    chute_libre: { fr: 'Chute Libre', en: 'Free Fall' },
    sommet_atteint: { fr: 'Sommet Atteint', en: 'Summit Reached' },
    resilient: { fr: 'Resilient', en: 'Resilient' },
    // Global Ranking
    top_1000_mondial: { fr: 'Top 1000 Mondial', en: 'World Top 1000' },
    top_100_mondial: { fr: 'Top 100 Mondial', en: 'World Top 100' },
    top_10_mondial: { fr: 'Top 10 Mondial', en: 'World Top 10' },
    // League tiers
    ligue_argent: { fr: 'Ligue Argent', en: 'Silver League' },
    ligue_diamant: { fr: 'Ligue Diamant', en: 'Diamond League' },
    ligue_grand_maitre: { fr: 'Ligue Grand Maitre', en: 'Grand Master League' },
  };
  return names[badgeId]?.[lang] || badgeId;
}

export function getBadgeDescription(badgeId: string, lang: 'fr' | 'en'): string {
  const descs: Record<string, { fr: string; en: string }> = {
    // Tournament
    bapteme_du_concours: { fr: 'Jouer son premier tournoi', en: 'Play your first tournament' },
    habitue_du_boulodrome: { fr: '5 tournois joues', en: '5 tournaments played' },
    boulomane: { fr: '15 tournois joues — la petanque coule dans tes veines', en: '15 tournaments — petanque runs in your veins' },
    accro_aux_concours: { fr: '30 tournois joues — inscrit sur tous les tableaux', en: '30 tournaments — signed up everywhere' },
    premier_bouchon_dor: { fr: 'Gagner ton premier titre de tournoi', en: 'Win your first tournament title' },
    doublette_doree: { fr: '2 titres de tournoi — le duo gagnant', en: '2 tournament titles — winning duo' },
    triplette_magique: { fr: '5 titres — une equipe magique', en: '5 titles — a magic team' },
    roi_du_concours: { fr: '10 titres — le roi inconteste des concours', en: '10 titles — undisputed contest king' },
    collectionneur_de_podiums: { fr: '3 podiums en tournoi', en: '3 tournament podiums' },
    abonne_au_podium: { fr: '10 podiums — abonnement premium', en: '10 podiums — premium subscription' },
    machine_a_podiums: { fr: '20 podiums — machine a trophees', en: '20 podiums — trophy machine' },
    invincible_du_concours: { fr: 'Terminer un tournoi invaincu', en: 'Finish a tournament undefeated' },
    mur_infranchissable: { fr: '3 tournois sans defaite — le mur', en: '3 tournaments without defeat — the wall' },
    rouleau_compresseur: { fr: '5 victoires consecutives — rien ne t\'arrete', en: '5 consecutive wins — nothing stops you' },
    inarretable: { fr: '10 victoires consecutives — inarretable!', en: '10 consecutive wins — unstoppable!' },
    la_serie_noire: { fr: '5 defaites consecutives — la poisse', en: '5 consecutive losses — bad luck' },
    phoenix_du_boulodrome: { fr: 'Rebondir apres 3+ defaites avec 3+ victoires', en: 'Bounce back from 3+ losses with 3+ wins' },
    veteran_des_concours: { fr: '50 tournois — legende vivante', en: '50 tournaments — living legend' },
    // Performance
    premier_lancer: { fr: 'Jouer son tout premier match', en: 'Play your very first match' },
    coup_de_main: { fr: '5 matchs joues — tu prends le coup de main', en: '5 matches — getting the hang of it' },
    bouliste_assidu: { fr: '25 matchs — bouliste confirme', en: '25 matches — confirmed player' },
    cent_boules: { fr: '100 matchs — un centenaire de la boule', en: '100 matches — a boule centurion' },
    mille_cochonnets: { fr: '500 matchs — mille cochonnets vises', en: '500 matches — a thousand jacks aimed' },
    oeil_de_lynx: { fr: '70%+ taux de tir sur 10+ matchs', en: '70%+ shot rate on 10+ matches' },
    tireur_de_precision: { fr: '80%+ taux de tir sur 20+ matchs — precision extreme', en: '80%+ shot rate on 20+ matches' },
    sniper_du_boulodrome: { fr: '90%+ taux de tir sur 30+ matchs — sniper!', en: '90%+ shot rate on 30+ matches — sniper!' },
    roi_du_carreau: { fr: '10 carreaux en carriere — roi du carreau', en: '10 carreaux in career — carreau king' },
    pluie_de_carreaux: { fr: '50 carreaux — il pleut des carreaux', en: '50 carreaux — raining carreaux' },
    carreau_machine: { fr: '100 carreaux — machine a carreaux', en: '100 carreaux — carreau machine' },
    carreau_legendaire: { fr: '250 carreaux — carreau legendaire', en: '250 carreaux — legendary' },
    main_en_or: { fr: '70%+ taux de point sur 10+ matchs', en: '70%+ point rate on 10+ matches' },
    pointeur_delite: { fr: '80%+ taux de point sur 20+ matchs', en: '80%+ point rate on 20+ matches' },
    biberon_magique: { fr: '90%+ taux de point sur 30+ matchs — magique', en: '90%+ point rate on 30+ matches — magical' },
    fanny_collector: { fr: 'Mettre ta premiere fanny (13-0)', en: 'Give your first fanny (13-0)' },
    roi_de_la_fanny: { fr: '5 fannys donnees — sans pitie', en: '5 fannys given — no mercy' },
    embrasse_la_fanny: { fr: 'Prendre ta premiere fanny (0-13)', en: 'Receive your first fanny (0-13)' },
    abonne_a_la_fanny: { fr: '5 fannys recues — abonne fidelite', en: '5 fannys received — loyalty subscriber' },
    marathon_de_boules: { fr: '100h de jeu total — marathon de boules', en: '100h total play — boule marathon' },
    sans_pitie: { fr: 'Score moyen 11+ sur 10+ matchs', en: 'Average score 11+ on 10+ matches' },
    muraille_defensive: { fr: 'Score encaisse moyen 7- sur 10+ matchs', en: 'Conceded avg 7- on 10+ matches' },
    maitre_du_defi: { fr: '10 defis completes', en: '10 challenges completed' },
    defi_parfait: { fr: '10/10 dans un defi de tir', en: '10/10 in a shooting challenge' },
    precision_chirurgicale: { fr: '60+ points dans un defi de precision', en: '60+ points in a precision challenge' },
    serie_gagnante: { fr: '3 series gagnees (best of 3/5)', en: '3 series won (best of 3/5)' },
    polyvalent: { fr: 'Jouer les 3 roles (Tireur, Pointeur, Milieu)', en: 'Play all 3 roles (Shooter, Pointer, Middle)' },
    boule_en_or: { fr: 'Utiliser 3 sets de boules differents', en: 'Use 3 different boules sets' },
    en_feu: { fr: '7 jours consecutifs avec un match', en: '7 consecutive days with a match' },
    flamme_eternelle: { fr: '30 jours consecutifs — flamme eternelle', en: '30 consecutive days — eternal flame' },
    // Community
    social_player: { fr: '1er match partage accepte', en: '1st shared match accepted' },
    partageur_de_boules: { fr: '5 matchs partages — genereux', en: '5 shared matches — generous' },
    influenceur_du_terrain: { fr: '20 partages — influenceur du terrain', en: '20 shares — court influencer' },
    recruteur: { fr: '3 joueurs invites inscrits', en: '3 invited players registered' },
    ambassadeur: { fr: 'Devenir ambassadeur officiel', en: 'Become official ambassador' },
    fiable: { fr: 'Score de confiance 65+', en: 'Trust score 65+' },
    verifie: { fr: 'Score de confiance 80+', en: 'Trust score 80+' },
    pilier_de_confiance: { fr: 'Score de confiance 95+ — pilier', en: 'Trust score 95+ — pillar' },
    temoin_fiable: { fr: '10 attestations de temoin', en: '10 witness attestations' },
    notaire_du_boulodrome: { fr: '50 attestations — le notaire', en: '50 attestations — the notary' },
    profil_debut: { fr: 'Profil complete a 50% — bonne base!', en: 'Profile 50% complete — good start!' },
    profil_avance: { fr: 'Profil complete a 75% — presque parfait', en: 'Profile 75% complete — almost perfect' },
    profil_complet: { fr: 'Completer 100% du profil — le graal', en: 'Complete 100% of profile — the holy grail' },
    organisateur_de_meles: { fr: 'Organiser ta premiere rencontre', en: 'Organize your first meetup' },
    chef_de_bande: { fr: '5 rencontres organisees — chef de bande', en: '5 meetups organized — gang leader' },
    fidele_des_rencontres: { fr: '5 rencontres rejointes', en: '5 meetups joined' },
    challenger_sponsorise: { fr: 'Participer a 1 defi sponsorise', en: 'Participate in 1 sponsored challenge' },
    bete_de_defis: { fr: '10 defis sponsorises — bete de defi', en: '10 sponsored challenges — challenge beast' },
    createur_devenements: { fr: 'Creer un evenement sponsorise', en: 'Create a sponsored event' },
    artiste_des_cartes: { fr: '5 cartes partageables creees', en: '5 share cards created' },
    mille_adversaires: { fr: '50 adversaires differents', en: '50 different opponents' },
    bourlingeur_de_clubs: { fr: 'Jouer contre 10 clubs differents', en: 'Play against 10 different clubs' },
    // Geographic
    explorateur: { fr: '5 terrains differents explores', en: '5 different courts explored' },
    nomade_de_la_boule: { fr: '15 terrains — nomade de la boule', en: '15 courts — boule nomad' },
    bourlingueur_supreme: { fr: '30 terrains — bourlingueur supreme', en: '30 courts — supreme wanderer' },
    passe_partout: { fr: '50 terrains — passe-partout legendaire', en: '50 courts — legendary all-access' },
    boss_de_la_ville: { fr: '#1 de ta ville par ELO', en: '#1 in your city by ELO' },
    champion_du_quartier: { fr: '#1 de ton club par ELO', en: '#1 in your club by ELO' },
    heros_national: { fr: '#1 de ton pays par ELO', en: '#1 in your country by ELO' },
    seigneur_des_terrains: { fr: '#1 de ton continent par ELO', en: '#1 in your continent by ELO' },
    maitre_universel: { fr: '#1 au monde par ELO', en: '#1 in the world by ELO' },
    touriste_du_boulodrome: { fr: 'Jouer dans 3 villes differentes', en: 'Play in 3 different cities' },
    boule_sans_frontieres: { fr: '10 villes differentes', en: '10 different cities' },
    globe_bouleur: { fr: '25 villes — globe-bouleur', en: '25 cities — globe-bowler' },
    ambassadeur_mondial: { fr: '50 villes — ambassadeur mondial', en: '50 cities — world ambassador' },
    voyageur_international: { fr: 'Jouer dans 2 pays differents', en: 'Play in 2 different countries' },
    boule_diplomatique: { fr: '5 pays — boule diplomatique', en: '5 countries — diplomatic boule' },
    boule_planetaire: { fr: '10 pays — boule planetaire', en: '10 countries — planetary boule' },
    intercontinental: { fr: '2 continents — intercontinental', en: '2 continents — intercontinental' },
    maitre_du_gravier: { fr: '20 matchs sur gravier', en: '20 matches on gravel' },
    roi_du_sable: { fr: '20 matchs sur sable', en: '20 matches on sand' },
    gazon_master: { fr: '20 matchs sur gazon', en: '20 matches on grass' },
    bouliste_dinterior: { fr: '20 matchs en interieur', en: '20 indoor matches' },
    hibou_du_boulodrome: { fr: '5 matchs joues de nuit', en: '5 night matches' },
    touche_a_tout_terrain: { fr: '4 types de surface differents', en: '4 different surface types' },
    classement_communautaire: { fr: 'Entrer dans le top 100', en: 'Enter the top 100' },
    top_50_national: { fr: 'Entrer dans le top 50', en: 'Enter the top 50' },
    top_10_national: { fr: 'Entrer dans le top 10 — elite', en: 'Enter the top 10 — elite' },
    numero_un: { fr: '#1 au classement — le boss', en: '#1 in rankings — the boss' },
    top_3_ville: { fr: 'Top 3 de ta ville', en: 'Top 3 in your city' },
    conquerant_regional: { fr: '5 villes jouees + 60% victoires', en: '5 cities played + 60% win rate' },
    multiplateforme: { fr: '3 surfaces differentes + 15 matchs', en: '3 surfaces + 15 matches' },
    // ELO
    premiere_partie_classee: { fr: 'Jouer sa premiere partie classee', en: 'Play first rated game' },
    bronze_bouliste: { fr: 'Atteindre 1100 ELO (Bronze)', en: 'Reach 1100 ELO (Bronze)' },
    argent_du_cochonnet: { fr: 'Atteindre 1200 ELO (Argent)', en: 'Reach 1200 ELO (Silver)' },
    or_du_boulodrome: { fr: 'Atteindre 1300 ELO (Or)', en: 'Reach 1300 ELO (Gold)' },
    premier_diamant: { fr: 'Atteindre 1500 ELO (Diamant)', en: 'Reach 1500 ELO (Diamond)' },
    maitre_petanque: { fr: 'Atteindre 1800 ELO (Maitre)', en: 'Reach 1800 ELO (Master)' },
    grand_maitre: { fr: 'Atteindre 2000 ELO (Grand Maitre)', en: 'Reach 2000 ELO (Grand Master)' },
    specialiste: { fr: 'ELO de role > 1300', en: 'Role ELO > 1300' },
    double_specialiste: { fr: '2 roles avec ELO > 1300', en: '2 roles with ELO > 1300' },
    triple_menace: { fr: '3 roles avec ELO > 1300 — triple menace', en: '3 roles with ELO > 1300 — triple threat' },
    grimpeur_du_classement: { fr: 'Gagner 30+ ELO en 1 match', en: 'Gain 30+ ELO in 1 match' },
    chute_libre: { fr: 'Perdre 30+ ELO en 1 match — aie!', en: 'Lose 30+ ELO in 1 match — ouch!' },
    sommet_atteint: { fr: 'Atteindre 1600 ELO pic de saison', en: 'Reach 1600 peak season ELO' },
    resilient: { fr: '2+ resets saisonniers + 1200 ELO — resilient', en: '2+ seasonal resets + 1200 ELO — resilient' },
    // Global Ranking
    top_1000_mondial: { fr: 'Entrer dans le top 1000 mondial', en: 'Enter the world top 1000' },
    top_100_mondial: { fr: 'Entrer dans le top 100 mondial — elite planetaire', en: 'Enter the world top 100 — planetary elite' },
    top_10_mondial: { fr: 'Entrer dans le top 10 mondial — legende vivante', en: 'Enter the world top 10 — living legend' },
    // League tiers
    ligue_argent: { fr: 'Atteindre la Ligue Argent (1100 ELO)', en: 'Reach Silver League (1100 ELO)' },
    ligue_diamant: { fr: 'Atteindre la Ligue Diamant (1500 ELO)', en: 'Reach Diamond League (1500 ELO)' },
    ligue_grand_maitre: { fr: 'Atteindre la Ligue Grand Maitre (2000 ELO)', en: 'Reach Grand Master League (2000 ELO)' },
  };
  return descs[badgeId]?.[lang] || '';
}

/**
 * Get badge category label
 */
export function getBadgeCategoryLabel(category: string, lang: 'fr' | 'en'): string {
  const labels: Record<string, { fr: string; en: string }> = {
    tournament: { fr: 'Tournoi', en: 'Tournament' },
    performance: { fr: 'Performance', en: 'Performance' },
    community: { fr: 'Communaute', en: 'Community' },
    geographic: { fr: 'Geographique', en: 'Geographic' },
    elo: { fr: 'ELO & Rang', en: 'ELO & Rank' },
  };
  return labels[category]?.[lang] || category;
}

// ============================================
// CORE FUNCTIONS
// ============================================

export async function loadUserBadges(userId: string): Promise<{ badges: UserBadge[]; xp: number }> {
  const supabase = getSupabaseClient();
  try {
    const [badgesRes, profileRes] = await Promise.all([
      supabase.from('user_badges').select('badge_id, unlocked_at').eq('user_id', userId),
      supabase.from('user_profiles').select('xp').eq('id', userId).single(),
    ]);
    const badges: UserBadge[] = (badgesRes.data || []).map((b: any) => ({
      badgeId: b.badge_id, unlockedAt: b.unlocked_at,
    }));
    return { badges, xp: profileRes.data?.xp || 0 };
  } catch (e) {
    console.log('Error loading badges:', e);
    return { badges: [], xp: 0 };
  }
}

export function buildBadgeContext(params: {
  matches: any[];
  challenges: any[];
  userStats: any;
  sharedMatchIds: string[];
  userId: string;
  isAmbassador: boolean;
  leaderboardRank: number | null;
}): BadgeContext {
  const { matches, challenges, userStats, sharedMatchIds, userId, isAmbassador, leaderboardRank } = params;

  let totalCarreaux = 0;
  let totalTirs = 0, totalTirsSuccess = 0;
  let totalPoints = 0, totalPointsSuccess = 0;
  matches.forEach((m: any) => {
    if (m.playerActions) {
      m.playerActions.filter((pa: any) => pa.team === 'A').forEach((pa: any) => {
        totalCarreaux += pa.actions?.carreaux || 0;
        totalTirs += pa.actions?.tirs || 0;
        totalTirsSuccess += pa.actions?.tirsSuccess || 0;
        totalPoints += pa.actions?.points || 0;
        totalPointsSuccess += pa.actions?.pointsSuccess || 0;
      });
    }
  });

  const terrainSet = new Set<string>();
  const terrainTypeSet = new Set<string>();
  const citySet = new Set<string>();
  const countrySet = new Set<string>();
  const opponentSet = new Set<string>();
  let gravelCount = 0, sandCount = 0, grassCount = 0, indoorCount = 0;

  matches.forEach((m: any) => {
    if (m.terrainId) terrainSet.add(m.terrainId);
    if (m.terrainType) {
      terrainTypeSet.add(m.terrainType);
      if (m.terrainType.includes('gravier') || m.terrainType.includes('gravel')) gravelCount++;
      if (m.terrainType.includes('sable') || m.terrainType.includes('sand')) sandCount++;
      if (m.terrainType.includes('gazon') || m.terrainType.includes('grass') || m.terrainType.includes('herbe')) grassCount++;
      if (m.terrainType.includes('indoor') || m.terrainType.includes('interieur') || m.terrainType.includes('couvert')) indoorCount++;
    }
    if (m.teamB?.playerNames) {
      m.teamB.playerNames.forEach((n: string) => opponentSet.add(n));
    }
  });

  const matchDates = matches
    .map((m: any) => {
      const d = new Date(m.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    .sort().reverse();

  let consecutiveDays = 0;
  if (matchDates.length > 0) {
    consecutiveDays = 1;
    for (let i = 0; i < matchDates.length - 1; i++) {
      const current = new Date(matchDates[i]);
      const prev = new Date(matchDates[i + 1]);
      const diff = (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) consecutiveDays++;
      else break;
    }
  }

  const wins = matches.filter((m: any) => m.winner === 'A').length;
  const losses = matches.length - wins;
  const fannyGiven = matches.filter((m: any) => m.winner === 'A' && m.teamA?.score === 13 && m.teamB?.score === 0).length;
  const fannyReceived = matches.filter((m: any) => m.winner === 'B' && m.teamB?.score === 13 && m.teamA?.score === 0).length;
  const totalDuration = matches.reduce((sum: number, m: any) => sum + (m.duration || 0), 0);
  const totalScoreFor = matches.reduce((sum: number, m: any) => sum + (m.teamA?.score || 0), 0);
  const totalScoreAgainst = matches.reduce((sum: number, m: any) => sum + (m.teamB?.score || 0), 0);
  const avgScored = matches.length > 0 ? totalScoreFor / matches.length : 0;
  const avgConceded = matches.length > 0 ? totalScoreAgainst / matches.length : 0;

  let totalMenes = 0;
  matches.forEach((m: any) => { if (m.menes) totalMenes += m.menes.length; });

  const challengeBest10 = challenges.filter((c: any) => c.type === '10_tirs' || c.type === '10_tirs_sautee').reduce((best: number, c: any) => Math.max(best, c.successCount || 0), 0);
  const precisionBest = challenges.filter((c: any) => c.type === 'precision').reduce((best: number, c: any) => Math.max(best, c.totalPoints || 0), 0);

  const boulesSetIds = new Set<string>();
  matches.forEach((m: any) => { if (m.boulesSetId) boulesSetIds.add(m.boulesSetId); });

  return {
    matchCount: matches.length,
    winRate: userStats.winRate || 0,
    tirRate: userStats.tirSuccessRate || 0,
    carreauRate: userStats.carreauRate || 0,
    totalCarreaux,
    sharedAcceptedCount: sharedMatchIds.length,
    invitedUsersCount: 0,
    uniqueTerrainsPlayed: terrainSet.size,
    leaderboardRank,
    consecutiveDaysPlayed: consecutiveDays,
    isAmbassador,
    trustScore: null,
    witnessAttestationsGiven: 0,
    profileCompleteness: 0,
    eloRating: 1000,
    eloTireur: 1000,
    eloPointeur: 1000,
    eloMilieu: 1000,
    isCityLeader: false,
    cityName: null,
    isClubLeader: false,
    clubName: null,
    isCountryLeader: false,
    countryName: null,
    isContinentLeader: false,
    continentName: null,
    isWorldLeader: false,
    totalWins: wins,
    totalLosses: losses,
    tournamentCount: 0,
    tournamentTitles: 0,
    tournamentPodiums: 0,
    tournamentUndefeated: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    fannyGiven,
    fannyReceived,
    totalTirs,
    totalTirsSuccess,
    totalPoints,
    totalPointsSuccess,
    totalMenes,
    totalChallenges: challenges.length,
    challengeBestScore10Tirs: challengeBest10,
    precisionBestScore: precisionBest,
    avgPointsScored: avgScored,
    avgPointsConceded: avgConceded,
    totalMatchDuration: totalDuration,
    seriesWon: 0,
    uniqueOpponents: opponentSet.size,
    uniqueClubsPlayed: 0,
    h2hWinsVsDifferentPlayers: 0,
    meetupsOrganized: 0,
    meetupsJoined: 0,
    sponsoredEventsParticipated: 0,
    sponsoredEventsCreated: 0,
    shareCardsCreated: 0,
    uniqueCitiesPlayed: citySet.size,
    uniqueCountriesPlayed: countrySet.size,
    uniqueContinentsPlayed: 0,
    uniqueTerrainTypes: terrainTypeSet.size,
    matchesOnGravel: gravelCount,
    matchesOnSand: sandCount,
    matchesOnGrass: grassCount,
    matchesOnIndoor: indoorCount,
    matchesAtNight: 0,
    playedInRain: false,
    eloGainInOneMatch: 0,
    eloLossInOneMatch: 0,
    peakElo: 1000,
    eloWinStreak: 0,
    seasonalResets: 0,
    rolesPlayed: 0,
    totalBoulesSetUsed: boulesSetIds.size,
    pointRate: userStats.pointSuccessRate || 0,
  };
}

export async function checkAndAwardBadges(
  userId: string,
  context: BadgeContext,
  existingBadges: UserBadge[]
): Promise<string[]> {
  const supabase = getSupabaseClient();
  const existingIds = new Set(existingBadges.map(b => b.badgeId));
  const newlyUnlocked: string[] = [];

  for (const badge of BADGES) {
    if (existingIds.has(badge.id)) continue;
    if (badge.condition(context)) {
      try {
        const { error } = await supabase.from('user_badges').insert({
          user_id: userId, badge_id: badge.id,
        });
        if (!error) {
          newlyUnlocked.push(badge.id);
          const { data: profileData } = await supabase
            .from('user_profiles').select('xp').eq('id', userId).single();
          const currentXp = profileData?.xp || 0;
          await supabase.from('user_profiles')
            .update({ xp: currentXp + badge.xpReward }).eq('id', userId);
        }
      } catch (e) {
        console.log('Error awarding badge:', badge.id, e);
      }
    }
  }
  return newlyUnlocked;
}

export function calculateTotalXp(params: {
  matchCount: number; totalCarreaux: number; sharedAcceptedCount: number; badgeCount: number;
}): number {
  return (
    params.matchCount * XP_PER_MATCH +
    params.totalCarreaux * XP_PER_CARREAU +
    params.sharedAcceptedCount * XP_PER_SHARE_ACCEPTED +
    params.badgeCount * XP_PER_BADGE
  );
}

export async function syncXpToDb(userId: string, xp: number): Promise<void> {
  const supabase = getSupabaseClient();
  try {
    await supabase.from('user_profiles').update({ xp }).eq('id', userId);
  } catch (e) {
    console.log('Error syncing XP:', e);
  }
}
