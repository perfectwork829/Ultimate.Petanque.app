/**
 * Card History Service
 * Saves metadata about created share cards to AsyncStorage for gallery display.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@card_history';
const MAX_ENTRIES = 50;

export interface CardHistoryEntry {
  id: string;
  type: 'match' | 'badge' | 'stats' | 'challenge' | 'tournament';
  theme: string;
  format: string;
  title: string;
  subtitle?: string;
  iconName: string;
  iconColor: string;
  createdAt: string;
  action: 'shared' | 'downloaded';
}

/**
 * Get all card history entries, sorted by date descending.
 */
export async function getCardHistory(): Promise<CardHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries: CardHistoryEntry[] = JSON.parse(raw);
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

/**
 * Add a new entry to card history.
 */
export async function addCardHistoryEntry(entry: Omit<CardHistoryEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    const existing = await getCardHistory();
    const newEntry: CardHistoryEntry = {
      ...entry,
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.log('[CardHistory] Save error:', e);
  }
}

/**
 * Delete a card history entry.
 */
export async function deleteCardHistoryEntry(id: string): Promise<void> {
  try {
    const existing = await getCardHistory();
    const updated = existing.filter(e => e.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.log('[CardHistory] Delete error:', e);
  }
}

/**
 * Clear all card history.
 */
export async function clearCardHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.log('[CardHistory] Clear error:', e);
  }
}

/**
 * Get card history stats summary.
 */
export async function getCardHistoryStats(): Promise<{ total: number; shared: number; downloaded: number; byType: Record<string, number> }> {
  const entries = await getCardHistory();
  const byType: Record<string, number> = {};
  let shared = 0;
  let downloaded = 0;
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.action === 'shared') shared++;
    else downloaded++;
  }
  return { total: entries.length, shared, downloaded, byType };
}
