import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlayerRole } from '@/constants/config';
import type { Player } from '@/types/petanque';
import type { AuthUser } from '@/template/auth/types';

const PROFILE_PREFIX = '@ultimatepetanque_google_only_profile:';
const PREFS_PREFIX = '@ultimatepetanque_google_only_preferences:';

export interface GoogleOnlyProfile {
  userId: string;
  username: string;
  role: PlayerRole;
  level: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  isPublic: boolean;
  updatedAt: string;
}

interface GoogleOnlyPreferences {
  favoriteTerrainIds: string[];
  favoriteClubIds: string[];
}

export function isGoogleOnlyUserId(userId?: string | null): boolean {
  return typeof userId === 'string' && userId.startsWith('google:');
}

function profileKey(userId: string): string {
  return `${PROFILE_PREFIX}${encodeURIComponent(userId)}`;
}

function prefsKey(userId: string): string {
  return `${PREFS_PREFIX}${encodeURIComponent(userId)}`;
}

export async function loadGoogleOnlyProfile(userId: string): Promise<GoogleOnlyProfile | null> {
  if (!isGoogleOnlyUserId(userId)) return null;
  try {
    const raw = await AsyncStorage.getItem(profileKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId) return null;
    return parsed as GoogleOnlyProfile;
  } catch {
    return null;
  }
}

export async function saveGoogleOnlyProfile(
  userId: string,
  input: Omit<GoogleOnlyProfile, 'userId' | 'updatedAt'>
): Promise<GoogleOnlyProfile> {
  if (!isGoogleOnlyUserId(userId)) {
    throw new Error('Google-only profile can only be saved for a Google-only user.');
  }

  const profile: GoogleOnlyProfile = {
    userId,
    ...input,
    username: input.username.trim(),
    city: input.city.trim(),
    country: (input.country || 'France').trim(),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(profileKey(userId), JSON.stringify(profile));
  return profile;
}

export function isGoogleOnlyProfileComplete(profile: GoogleOnlyProfile | null): boolean {
  return !!profile?.username?.trim() && !!profile?.city?.trim();
}

export function makeGoogleOnlyPlayer(user: AuthUser, profile: GoogleOnlyProfile | null): Player {
  const name =
    profile?.username?.trim() ||
    user.username?.trim() ||
    user.email?.split('@')[0] ||
    'Player';
  const city = profile?.city?.trim() || '';
  const role = (profile?.role || 'Milieu') as PlayerRole;

  return {
    // Keep the auth id locally so computeSelfPlayer() can resolve this player.
    // This id is never sent to Supabase while Google-only mode is active.
    id: user.id,
    userId: user.id,
    name,
    email: user.email,
    role,
    level: profile?.level || 'Intermédiaire',
    city,
    country: profile?.country || 'France',
    location: {
      city,
      latitude: profile?.latitude || 0,
      longitude: profile?.longitude || 0,
    },
    isPublic: profile?.isPublic ?? true,
    eloRating: 1000,
    stats: {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      tirRate: 0,
      pointRate: 0,
      carreauRate: 0,
      avgPointsScored: 0,
      avgPointsConceded: 0,
    },
    createdAt: user.created_at || new Date().toISOString(),
  };
}

export async function loadGoogleOnlyPreferences(userId: string): Promise<GoogleOnlyPreferences> {
  if (!isGoogleOnlyUserId(userId)) {
    return { favoriteTerrainIds: [], favoriteClubIds: [] };
  }
  try {
    const raw = await AsyncStorage.getItem(prefsKey(userId));
    if (!raw) return { favoriteTerrainIds: [], favoriteClubIds: [] };
    const parsed = JSON.parse(raw);
    return {
      favoriteTerrainIds: Array.isArray(parsed?.favoriteTerrainIds) ? parsed.favoriteTerrainIds : [],
      favoriteClubIds: Array.isArray(parsed?.favoriteClubIds) ? parsed.favoriteClubIds : [],
    };
  } catch {
    return { favoriteTerrainIds: [], favoriteClubIds: [] };
  }
}

export async function saveGoogleOnlyPreferences(
  userId: string,
  favoriteTerrainIds: string[],
  favoriteClubIds: string[]
): Promise<void> {
  if (!isGoogleOnlyUserId(userId)) return;
  await AsyncStorage.setItem(
    prefsKey(userId),
    JSON.stringify({ favoriteTerrainIds, favoriteClubIds } satisfies GoogleOnlyPreferences)
  );
}
