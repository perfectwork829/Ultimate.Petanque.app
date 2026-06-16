/**
 * Boules Set CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete, setPrimary for boules sets.
 * No logic changes from original implementation.
 */
import { BoulesSet } from '@/types/petanque';
import { mapBoulesSetFromDb } from '@/services/dbMappers';

interface BoulesSetCrudDeps {
  supabase: any;
  userId: string | undefined;
  boulesSets: BoulesSet[];
  setBoulesSets: React.Dispatch<React.SetStateAction<BoulesSet[]>>;
  syncPrimaryBoulesToPlayer: (set: Partial<BoulesSet>) => void;
}

export async function addBoulesSetOp(
  set: Omit<BoulesSet, 'id'>,
  deps: BoulesSetCrudDeps
): Promise<void> {
  const { supabase, userId, setBoulesSets, syncPrimaryBoulesToPlayer } = deps;
  if (!userId) return;

  try {
    const { data, error } = await supabase.from('boules_sets').insert({
      user_id: userId,
      name: set.name,
      brand: set.brand || null,
      diameter: set.diameter || null,
      weight: set.weight || null,
      serial_number: set.serialNumber || null,
      hardness: set.hardness || null,
      is_primary: set.isPrimary || false,
      notes: set.notes || null,
      photo: set.photo || null,
      purchase_price: set.purchasePrice || null,
    }).select().single();
    if (error) throw error;
    if (data) {
      const newSet: BoulesSet = mapBoulesSetFromDb(data);
      // If this is primary, unset others
      if (newSet.isPrimary) {
        setBoulesSets(prev => [...prev.map(s => ({ ...s, isPrimary: false })), newSet]);
        syncPrimaryBoulesToPlayer(newSet);
      } else {
        setBoulesSets(prev => [...prev, newSet]);
      }
    }
  } catch (error) {
    console.log('Error adding boules set:', error);
  }
}

export async function updateBoulesSetOp(
  id: string,
  updates: Partial<BoulesSet>,
  deps: BoulesSetCrudDeps
): Promise<void> {
  const { supabase, userId, boulesSets, setBoulesSets, syncPrimaryBoulesToPlayer } = deps;
  if (!userId) return;

  setBoulesSets(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand || null;
    if (updates.diameter !== undefined) dbUpdates.diameter = updates.diameter || null;
    if (updates.weight !== undefined) dbUpdates.weight = updates.weight || null;
    if (updates.serialNumber !== undefined) dbUpdates.serial_number = updates.serialNumber || null;
    if (updates.hardness !== undefined) dbUpdates.hardness = updates.hardness || null;
    if (updates.isPrimary !== undefined) dbUpdates.is_primary = updates.isPrimary;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
    if (updates.photo !== undefined) dbUpdates.photo = updates.photo || null;
    if (updates.purchasePrice !== undefined) dbUpdates.purchase_price = updates.purchasePrice || null;
    dbUpdates.updated_at = new Date().toISOString();
    await supabase.from('boules_sets').update(dbUpdates).eq('id', id);
    // If updated set is primary, sync to player
    const updatedSet = boulesSets.find(s => s.id === id);
    if (updatedSet && (updatedSet.isPrimary || updates.isPrimary)) {
      syncPrimaryBoulesToPlayer({ ...updatedSet, ...updates });
    }
  } catch (error) {
    console.log('Error updating boules set:', error);
  }
}

export async function deleteBoulesSetOp(
  id: string,
  deps: Pick<BoulesSetCrudDeps, 'supabase' | 'userId' | 'setBoulesSets'>
): Promise<void> {
  const { supabase, userId, setBoulesSets } = deps;
  setBoulesSets(prev => prev.filter(s => s.id !== id));
  if (!userId) return;
  try {
    await supabase.from('boules_sets').delete().eq('id', id);
  } catch (error) {
    console.log('Error deleting boules set:', error);
  }
}

export async function setPrimaryBoulesSetOp(
  id: string,
  deps: BoulesSetCrudDeps
): Promise<void> {
  const { supabase, userId, boulesSets, setBoulesSets, syncPrimaryBoulesToPlayer } = deps;
  if (!userId) return;

  // Unset all, set the chosen one
  setBoulesSets(prev => prev.map(s => ({ ...s, isPrimary: s.id === id })));

  try {
    // Unset all primary
    await supabase.from('boules_sets').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('user_id', userId);
    // Set new primary
    await supabase.from('boules_sets').update({ is_primary: true, updated_at: new Date().toISOString() }).eq('id', id);
    // Sync to player profile
    const primarySet = boulesSets.find(s => s.id === id);
    if (primarySet) syncPrimaryBoulesToPlayer(primarySet);
  } catch (error) {
    console.log('Error setting primary boules set:', error);
  }
}
