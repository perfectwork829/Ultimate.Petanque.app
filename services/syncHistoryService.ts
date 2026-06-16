import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_HISTORY_KEY = 'petanque_sync_history';
const MAX_ENTRIES = 50;

export interface SyncHistoryEntry {
  id: string;
  date: string;
  total: number;
  succeeded: number;
  failed: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errors: string[];
  duration: number; // ms
}

/**
 * Get all sync history entries (newest first).
 */
export async function getSyncHistory(): Promise<SyncHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncHistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * Add a new sync history entry.
 */
export async function addSyncHistoryEntry(entry: Omit<SyncHistoryEntry, 'id'>): Promise<void> {
  try {
    const history = await getSyncHistory();
    const newEntry: SyncHistoryEntry = {
      ...entry,
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    history.unshift(newEntry);
    // Keep only the last MAX_ENTRIES
    const trimmed = history.slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.log('[SyncHistory] Error adding entry:', error);
  }
}

/**
 * Clear all sync history.
 */
export async function clearSyncHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SYNC_HISTORY_KEY);
  } catch (error) {
    console.log('[SyncHistory] Error clearing:', error);
  }
}

/**
 * Get the count of sync history entries.
 */
export async function getSyncHistoryCount(): Promise<number> {
  const history = await getSyncHistory();
  return history.length;
}
