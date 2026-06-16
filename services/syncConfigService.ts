// ============================================
// SYNC CONFIGURATION SERVICE
// Manages sync intervals, battery saver mode,
// and selective field fetching for delta sync
// ============================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@sync_config';

export interface SyncConfig {
  /** Battery saver mode disables automatic background sync */
  batterySaverEnabled: boolean;
  /** Sync interval in milliseconds (normal: 60s, battery saver: manual only) */
  syncIntervalMs: number;
  /** Full sync every Nth delta cycle */
  fullSyncEveryN: number;
  /** Minimum seconds between delta syncs (to avoid spamming) */
  minDeltaIntervalSec: number;
  /** Skip image prefetch in battery saver mode */
  skipImagePrefetch: boolean;
  /** Reduce secondary data load delay in normal mode */
  secondaryLoadDelayMs: number;
}

// Default configs for each mode
const NORMAL_CONFIG: SyncConfig = {
  batterySaverEnabled: false,
  syncIntervalMs: 60_000,         // 60 seconds (was 30s)
  fullSyncEveryN: 5,              // Full sync every 5th cycle
  minDeltaIntervalSec: 30,        // Minimum 30s between deltas
  skipImagePrefetch: false,
  secondaryLoadDelayMs: 600,
};

const BATTERY_SAVER_CONFIG: SyncConfig = {
  batterySaverEnabled: true,
  syncIntervalMs: 0,              // 0 = disabled (manual only)
  fullSyncEveryN: 1,              // Always full when manual
  minDeltaIntervalSec: 120,       // Minimum 2min between syncs
  skipImagePrefetch: true,
  secondaryLoadDelayMs: 1200,     // Longer delay for secondary data
};

let currentConfig: SyncConfig = { ...NORMAL_CONFIG };
let configLoaded = false;
const listeners: Set<(config: SyncConfig) => void> = new Set();

/**
 * Load sync config from persistent storage
 */
export async function loadSyncConfig(): Promise<SyncConfig> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      currentConfig = parsed.batterySaverEnabled ? { ...BATTERY_SAVER_CONFIG } : { ...NORMAL_CONFIG };
      configLoaded = true;
    }
  } catch { /* silent */ }
  return currentConfig;
}

/**
 * Get current sync config (synchronous, uses cached value)
 */
export function getSyncConfig(): SyncConfig {
  return currentConfig;
}

/**
 * Toggle battery saver mode
 */
export async function setBatterySaverMode(enabled: boolean): Promise<SyncConfig> {
  currentConfig = enabled ? { ...BATTERY_SAVER_CONFIG } : { ...NORMAL_CONFIG };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ batterySaverEnabled: enabled }));
  } catch { /* silent */ }
  listeners.forEach(fn => fn(currentConfig));
  return currentConfig;
}

/**
 * Check if battery saver is enabled
 */
export function isBatterySaverEnabled(): boolean {
  return currentConfig.batterySaverEnabled;
}

/**
 * Subscribe to config changes
 */
export function onSyncConfigChange(listener: (config: SyncConfig) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Selective columns for delta sync queries
 * Only fetch the fields we actually map, excluding large unused fields
 */
export const DELTA_SELECT = {
  players: 'id,user_id,name,nickname,avatar,club,club_id,role,level,experience,location,phone,email,country,boules,handedness,terrain_id,terrain_name,is_public,show_contact_public,stats,elo_rating,elo_tireur,elo_pointeur,elo_milieu,last_match_date,created_at,updated_at',
  clubs: 'id,user_id,name,logo,address,city,country,location,members_count,founded_year,description,facilities,contact_email,contact_phone,terrain_id,terrain_name,membership_cost,is_public,show_contact_public,club_card_url,updated_at',
  tournaments: 'id,user_id,name,date,end_date,type,format,location,terrain_id,terrain_name,terrain_type,club_id,club_name,status,participants,max_participants,prize,description,teams,phases,current_phase_id,tournament_level,tournament_category,registration_type,tournament_scope,registration_cost,prize_won,final_result,is_public,updated_at,poster_url',
  matches: 'id,user_id,date,mode,format,tournament_id,tournament_name,tournament_phase,tournament_bracket,bracket_match_id,terrain_id,terrain_type,boules_set_id,team_a,team_b,winner,duration,menes,player_actions,series_info,updated_at',
  challenges: 'id,user_id,type,mode,date,player_id,player_name,opponent_id,opponent_name,opponent_result,winner,shots,success_count,total_shots,carreau_count,success_rate,precision_shots,total_points,max_points,atelier_scores,duration,notes,detailed_shots,boules_set_id,terrain_id,updated_at',
  terrains: 'id,user_id,name,address,city,location,type,description,facilities,photos,club_id,club_name,is_public,public_access,courts_count,lighting,covered,environment,created_at,updated_at',
};
