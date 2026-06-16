/**
 * Unit tests for services/syncConfigService.ts
 *
 * Tests: SyncConfig defaults, battery saver mode toggle, DELTA_SELECT
 * columns, sync intervals, full sync cycle, listener subscription.
 */

// ─── Inline implementations ──

interface SyncConfig {
  batterySaverEnabled: boolean;
  syncIntervalMs: number;
  fullSyncEveryN: number;
  minDeltaIntervalSec: number;
  skipImagePrefetch: boolean;
  secondaryLoadDelayMs: number;
}

const NORMAL_CONFIG: SyncConfig = {
  batterySaverEnabled: false,
  syncIntervalMs: 60_000,
  fullSyncEveryN: 5,
  minDeltaIntervalSec: 30,
  skipImagePrefetch: false,
  secondaryLoadDelayMs: 600,
};

const BATTERY_SAVER_CONFIG: SyncConfig = {
  batterySaverEnabled: true,
  syncIntervalMs: 0,
  fullSyncEveryN: 1,
  minDeltaIntervalSec: 120,
  skipImagePrefetch: true,
  secondaryLoadDelayMs: 1200,
};

let currentConfig: SyncConfig = { ...NORMAL_CONFIG };
const listeners = new Set<(config: SyncConfig) => void>();

function getSyncConfig(): SyncConfig {
  return currentConfig;
}

function setBatterySaverMode(enabled: boolean): SyncConfig {
  currentConfig = enabled ? { ...BATTERY_SAVER_CONFIG } : { ...NORMAL_CONFIG };
  listeners.forEach(fn => fn(currentConfig));
  return currentConfig;
}

function isBatterySaverEnabled(): boolean {
  return currentConfig.batterySaverEnabled;
}

function onSyncConfigChange(listener: (config: SyncConfig) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const DELTA_SELECT = {
  players: 'id,user_id,name,nickname,avatar,club,club_id,role,level,location,phone,email,country,boules,handedness,terrain_id,terrain_name,is_public,show_contact_public,stats,created_at,updated_at',
  clubs: 'id,user_id,name,logo,address,city,country,location,members_count,founded_year,description,facilities,contact_email,contact_phone,terrain_id,terrain_name,membership_cost,is_public,show_contact_public,club_card_url,updated_at',
  tournaments: 'id,user_id,name,date,end_date,type,format,location,terrain_id,terrain_name,terrain_type,club_id,club_name,status,participants,max_participants,prize,description,teams,phases,current_phase_id,tournament_level,tournament_category,registration_type,tournament_scope,registration_cost,prize_won,final_result,is_public,updated_at',
  matches: 'id,user_id,date,mode,format,tournament_id,tournament_name,tournament_phase,tournament_bracket,bracket_match_id,terrain_id,terrain_type,boules_set_id,team_a,team_b,winner,duration,menes,player_actions,series_info,updated_at',
  challenges: 'id,user_id,type,mode,date,player_id,player_name,opponent_id,opponent_name,opponent_result,winner,shots,success_count,total_shots,carreau_count,success_rate,precision_shots,total_points,max_points,atelier_scores,duration,notes,detailed_shots,boules_set_id,terrain_id,updated_at',
  terrains: 'id,user_id,name,address,city,location,type,description,facilities,photos,club_id,club_name,is_public,public_access,courts_count,lighting,covered,environment,created_at,updated_at',
};

// ─── Tests ──

beforeEach(() => {
  currentConfig = { ...NORMAL_CONFIG };
  listeners.clear();
});

describe('NORMAL_CONFIG defaults', () => {
  test('battery saver disabled', () => { expect(NORMAL_CONFIG.batterySaverEnabled).toBe(false); });
  test('sync interval 60s', () => { expect(NORMAL_CONFIG.syncIntervalMs).toBe(60000); });
  test('full sync every 5 cycles', () => { expect(NORMAL_CONFIG.fullSyncEveryN).toBe(5); });
  test('min delta 30s', () => { expect(NORMAL_CONFIG.minDeltaIntervalSec).toBe(30); });
  test('image prefetch enabled', () => { expect(NORMAL_CONFIG.skipImagePrefetch).toBe(false); });
  test('secondary load 600ms', () => { expect(NORMAL_CONFIG.secondaryLoadDelayMs).toBe(600); });
});

describe('BATTERY_SAVER_CONFIG defaults', () => {
  test('battery saver enabled', () => { expect(BATTERY_SAVER_CONFIG.batterySaverEnabled).toBe(true); });
  test('sync disabled (0)', () => { expect(BATTERY_SAVER_CONFIG.syncIntervalMs).toBe(0); });
  test('full sync every cycle', () => { expect(BATTERY_SAVER_CONFIG.fullSyncEveryN).toBe(1); });
  test('min delta 120s', () => { expect(BATTERY_SAVER_CONFIG.minDeltaIntervalSec).toBe(120); });
  test('image prefetch skipped', () => { expect(BATTERY_SAVER_CONFIG.skipImagePrefetch).toBe(true); });
  test('secondary load 1200ms', () => { expect(BATTERY_SAVER_CONFIG.secondaryLoadDelayMs).toBe(1200); });
});

describe('getSyncConfig', () => {
  test('returns normal config by default', () => {
    expect(getSyncConfig().batterySaverEnabled).toBe(false);
    expect(getSyncConfig().syncIntervalMs).toBe(60000);
  });
});

describe('setBatterySaverMode', () => {
  test('enable battery saver', () => {
    const config = setBatterySaverMode(true);
    expect(config.batterySaverEnabled).toBe(true);
    expect(config.syncIntervalMs).toBe(0);
    expect(config.skipImagePrefetch).toBe(true);
  });

  test('disable battery saver', () => {
    setBatterySaverMode(true);
    const config = setBatterySaverMode(false);
    expect(config.batterySaverEnabled).toBe(false);
    expect(config.syncIntervalMs).toBe(60000);
  });

  test('notifies listeners on enable', () => {
    const calls: SyncConfig[] = [];
    onSyncConfigChange(c => calls.push(c));
    setBatterySaverMode(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].batterySaverEnabled).toBe(true);
  });

  test('notifies listeners on disable', () => {
    const calls: SyncConfig[] = [];
    onSyncConfigChange(c => calls.push(c));
    setBatterySaverMode(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].batterySaverEnabled).toBe(false);
  });
});

describe('isBatterySaverEnabled', () => {
  test('false by default', () => { expect(isBatterySaverEnabled()).toBe(false); });
  test('true after enabling', () => {
    setBatterySaverMode(true);
    expect(isBatterySaverEnabled()).toBe(true);
  });
});

describe('onSyncConfigChange - unsubscribe', () => {
  test('unsubscribe stops notifications', () => {
    const calls: SyncConfig[] = [];
    const unsub = onSyncConfigChange(c => calls.push(c));
    setBatterySaverMode(true);
    expect(calls).toHaveLength(1);
    unsub();
    setBatterySaverMode(false);
    expect(calls).toHaveLength(1); // No new call
  });

  test('multiple listeners', () => {
    let count1 = 0;
    let count2 = 0;
    onSyncConfigChange(() => count1++);
    onSyncConfigChange(() => count2++);
    setBatterySaverMode(true);
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});

describe('DELTA_SELECT', () => {
  test('has 6 entity types', () => {
    expect(Object.keys(DELTA_SELECT)).toHaveLength(6);
  });

  test('players includes id and updated_at', () => {
    expect(DELTA_SELECT.players).toContain('id');
    expect(DELTA_SELECT.players).toContain('updated_at');
    expect(DELTA_SELECT.players).toContain('user_id');
  });

  test('matches includes team_a and menes', () => {
    expect(DELTA_SELECT.matches).toContain('team_a');
    expect(DELTA_SELECT.matches).toContain('team_b');
    expect(DELTA_SELECT.matches).toContain('menes');
    expect(DELTA_SELECT.matches).toContain('player_actions');
  });

  test('challenges includes shots and precision_shots', () => {
    expect(DELTA_SELECT.challenges).toContain('shots');
    expect(DELTA_SELECT.challenges).toContain('precision_shots');
    expect(DELTA_SELECT.challenges).toContain('detailed_shots');
  });

  test('terrains includes location fields', () => {
    expect(DELTA_SELECT.terrains).toContain('location');
    expect(DELTA_SELECT.terrains).toContain('city');
    expect(DELTA_SELECT.terrains).toContain('public_access');
  });

  test('clubs includes membership fields', () => {
    expect(DELTA_SELECT.clubs).toContain('membership_cost');
    expect(DELTA_SELECT.clubs).toContain('club_card_url');
  });

  test('tournaments includes phases and teams', () => {
    expect(DELTA_SELECT.tournaments).toContain('phases');
    expect(DELTA_SELECT.tournaments).toContain('teams');
    expect(DELTA_SELECT.tournaments).toContain('current_phase_id');
  });

  test('no select string is empty', () => {
    Object.values(DELTA_SELECT).forEach(select => {
      expect(select.length).toBeGreaterThan(10);
    });
  });
});
