/**
 * useFavorites — Extracted favorite terrain/club logic from AppContext.
 * 
 * Manages favorite terrain and club IDs with persistence to Supabase.
 * Can be used independently for components that only need favorites access.
 */
import { useState, useCallback, useEffect } from 'react';
import { getSupabaseClient } from '@/template';

interface FavoritesState {
  favoriteTerrainIds: string[];
  favoriteClubIds: string[];
  loaded: boolean;
}

export function createFavoriteActions(
  userId: string | undefined,
  favoriteTerrainIds: string[],
  favoriteClubIds: string[],
  setFavoriteTerrainIds: React.Dispatch<React.SetStateAction<string[]>>,
  setFavoriteClubIds: React.Dispatch<React.SetStateAction<string[]>>,
) {
  const supabase = getSupabaseClient();

  const savePreferences = async (terrainIds: string[], clubIds: string[]) => {
    if (!userId) return;
    try {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          favorite_terrain_ids: terrainIds,
          favorite_club_ids: clubIds,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (e) {
      console.log('Error saving preferences:', e);
    }
  };

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

  return {
    toggleFavoriteTerrain,
    isFavoriteTerrain,
    toggleFavoriteClub,
    isFavoriteClub,
  };
}
